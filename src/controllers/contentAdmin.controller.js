const mongoose = require('mongoose');
const xlsx = require('xlsx');
const { BlogPost, Faq, CityPage, PopularModelImage, Testimonial, ChecklistTemplate } = require('../models/Content');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { publicFileUrl } = require('../services/storage.service');

function requireId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid id', 'VALIDATION');
  return id;
}

function slugId(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseChecklistFieldsFromWorkbook(fileBuffer) {
  const wb = xlsx.read(fileBuffer, { type: 'buffer' });
  const firstSheetName = wb.SheetNames?.[0];
  if (!firstSheetName) return [];
  const ws = wb.Sheets[firstSheetName];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  const fields = [];
  let currentSection = 'General';
  for (const rowRaw of rows) {
    const row = Array.isArray(rowRaw)
      ? rowRaw.map((c) => String(c ?? '').trim()).filter(Boolean)
      : [];
    if (!row.length) continue;
    const rowJoined = row.join(' ').toLowerCase();
    if (/^(s\.?no|sr\.? no|serial|check ?point|checkpoint|remarks?|status|ok\/ng|mandatory|required)$/.test(rowJoined)) {
      continue;
    }
    if (row.length === 1 && row[0].length <= 70 && !/[0-9]{3,}/.test(row[0])) {
      currentSection = row[0];
      continue;
    }
    const label = row[0];
    if (!label || label.length < 2) continue;
    const required = /(required|mandatory|must|yes|y)/i.test(rowJoined);
    const minPhotosMatch = rowJoined.match(/(?:min|minimum)?\s*photos?\s*[:\-]?\s*(\d+)/i) || rowJoined.match(/\b(\d+)\s*photos?\b/i);
    const minPhotos = minPhotosMatch ? Math.max(0, Math.min(20, Number(minPhotosMatch[1] || 0))) : (required ? 1 : 0);
    const instructions = row.slice(1).join(' | ').slice(0, 500);
    const idBase = slugId(`${currentSection}-${label}`) || `field-${fields.length + 1}`;
    fields.push({
      id: `${idBase}-${fields.length + 1}`,
      label: `${currentSection !== 'General' ? `${currentSection} - ` : ''}${label}`.slice(0, 220),
      instructions,
      required,
      minPhotos,
    });
  }
  return fields;
}

// --- Blog ---
exports.blogListAll = async (req, res) => ok(res, await BlogPost.find().sort('-updatedAt'));

exports.blogCreate = async (req, res) => {
  const { slug, title, excerpt, content, published, coverImage } = req.body;
  if (!slug || !title) throw new ApiError(400, 'slug and title are required', 'VALIDATION');
  const post = await BlogPost.create({
    slug: String(slug).trim(),
    title: String(title).trim(),
    excerpt: excerpt != null ? String(excerpt) : '',
    content: content != null ? String(content) : '',
    published: Boolean(published),
    coverImage: coverImage != null ? String(coverImage) : '',
  });
  ok(res, post, 201);
};

exports.blogUpdate = async (req, res) => {
  const id = requireId(req.params.id);
  const allowed = ['slug', 'title', 'excerpt', 'content', 'published', 'coverImage'];
  const patch = {};
  for (const k of allowed) {
    if (req.body[k] === undefined) continue;
    if (k === 'published') patch[k] = Boolean(req.body[k]);
    else if (k === 'content' || k === 'excerpt') patch[k] = String(req.body[k]);
    else patch[k] = String(req.body[k]).trim();
  }
  const post = await BlogPost.findByIdAndUpdate(id, { $set: patch }, { new: true });
  if (!post) throw new ApiError(404, 'Blog post not found', 'NOT_FOUND');
  ok(res, post);
};

exports.blogDelete = async (req, res) => {
  await BlogPost.findByIdAndDelete(requireId(req.params.id));
  ok(res, { ok: true });
};

// --- FAQ ---
exports.faqListAll = async (req, res) => ok(res, await Faq.find().sort('createdAt'));

exports.faqCreate = async (req, res) => {
  const { question, answer, active } = req.body;
  if (!question || !answer) throw new ApiError(400, 'question and answer are required', 'VALIDATION');
  const row = await Faq.create({
    question: String(question).trim(),
    answer: String(answer).trim(),
    active: active !== false,
  });
  ok(res, row, 201);
};

exports.faqUpdate = async (req, res) => {
  const id = requireId(req.params.id);
  const patch = {};
  if (req.body.question !== undefined) patch.question = String(req.body.question).trim();
  if (req.body.answer !== undefined) patch.answer = String(req.body.answer).trim();
  if (req.body.active !== undefined) patch.active = Boolean(req.body.active);
  const row = await Faq.findByIdAndUpdate(id, { $set: patch }, { new: true });
  if (!row) throw new ApiError(404, 'FAQ not found', 'NOT_FOUND');
  ok(res, row);
};

exports.faqDelete = async (req, res) => {
  await Faq.findByIdAndDelete(requireId(req.params.id));
  ok(res, { ok: true });
};

// --- City pages ---
exports.cityListAll = async (req, res) => ok(res, await CityPage.find().sort('city'));

exports.cityCreate = async (req, res) => {
  const { city, slug, content, active } = req.body;
  if (!city || !slug) throw new ApiError(400, 'city and slug are required', 'VALIDATION');
  const row = await CityPage.create({
    city: String(city).trim(),
    slug: String(slug).trim().toLowerCase(),
    content: content != null ? String(content) : '',
    active: active !== false,
  });
  ok(res, row, 201);
};

exports.cityUpdate = async (req, res) => {
  const id = requireId(req.params.id);
  const patch = {};
  if (req.body.city !== undefined) patch.city = String(req.body.city).trim();
  if (req.body.slug !== undefined) patch.slug = String(req.body.slug).trim().toLowerCase();
  if (req.body.content !== undefined) patch.content = String(req.body.content);
  if (req.body.active !== undefined) patch.active = Boolean(req.body.active);
  const row = await CityPage.findByIdAndUpdate(id, { $set: patch }, { new: true });
  if (!row) throw new ApiError(404, 'City page not found', 'NOT_FOUND');
  ok(res, row);
};

exports.cityDelete = async (req, res) => {
  await CityPage.findByIdAndDelete(requireId(req.params.id));
  ok(res, { ok: true });
};

// --- Popular model image mapping ---
exports.modelImageListAll = async (_req, res) => {
  ok(res, await PopularModelImage.find().sort('vehicleType modelName'));
};

exports.modelImageCreate = async (req, res) => {
  const { vehicleType, modelName, brand, segment, imageUrl, active } = req.body;
  if (!vehicleType || !modelName) {
    throw new ApiError(400, 'vehicleType and modelName are required', 'VALIDATION');
  }
  const row = await PopularModelImage.create({
    vehicleType: String(vehicleType).trim(),
    modelName: String(modelName).trim(),
    brand: brand != null ? String(brand).trim() : '',
    segment: segment != null ? String(segment).trim() : '',
    imageUrl: imageUrl != null ? String(imageUrl).trim() : '',
    active: active !== false,
  });
  ok(res, row, 201);
};

exports.modelImageUpdate = async (req, res) => {
  const id = requireId(req.params.id);
  const patch = {};
  if (req.body.vehicleType !== undefined) patch.vehicleType = String(req.body.vehicleType).trim();
  if (req.body.modelName !== undefined) patch.modelName = String(req.body.modelName).trim();
  if (req.body.brand !== undefined) patch.brand = String(req.body.brand).trim();
  if (req.body.segment !== undefined) patch.segment = String(req.body.segment).trim();
  if (req.body.imageUrl !== undefined) patch.imageUrl = String(req.body.imageUrl).trim();
  if (req.body.active !== undefined) patch.active = Boolean(req.body.active);
  const row = await PopularModelImage.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true });
  if (!row) throw new ApiError(404, 'Model image mapping not found', 'NOT_FOUND');
  ok(res, row);
};

exports.modelImageDelete = async (req, res) => {
  await PopularModelImage.findByIdAndDelete(requireId(req.params.id));
  ok(res, { ok: true });
};

exports.modelImageUpload = async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Image file required (field name: photo)', 'VALIDATION_ERROR');
  const imageUrl = req.profilePhotoUrl || publicFileUrl(req, req.file.filename);
  ok(res, { imageUrl }, 201);
};

// --- Testimonials ---
exports.testimonialListAll = async (_req, res) => ok(res, await Testimonial.find().sort('-updatedAt'));

exports.testimonialCreate = async (req, res) => {
  const { name, city, quote, rating, active } = req.body;
  if (!name || !quote) throw new ApiError(400, 'name and quote are required', 'VALIDATION');
  const row = await Testimonial.create({
    name: String(name).trim(),
    city: city != null ? String(city).trim() : '',
    quote: String(quote).trim(),
    rating: Math.max(1, Math.min(5, Number(rating || 5))),
    active: active !== false,
  });
  ok(res, row, 201);
};

exports.testimonialUpdate = async (req, res) => {
  const id = requireId(req.params.id);
  const patch = {};
  if (req.body.name !== undefined) patch.name = String(req.body.name).trim();
  if (req.body.city !== undefined) patch.city = String(req.body.city).trim();
  if (req.body.quote !== undefined) patch.quote = String(req.body.quote).trim();
  if (req.body.rating !== undefined) patch.rating = Math.max(1, Math.min(5, Number(req.body.rating || 5)));
  if (req.body.active !== undefined) patch.active = Boolean(req.body.active);
  const row = await Testimonial.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true });
  if (!row) throw new ApiError(404, 'Testimonial not found', 'NOT_FOUND');
  ok(res, row);
};

exports.testimonialDelete = async (req, res) => {
  await Testimonial.findByIdAndDelete(requireId(req.params.id));
  ok(res, { ok: true });
};

// --- Checklist templates (Excel import + service mapping) ---
exports.checklistTemplateListAll = async (req, res) => {
  const q = {};
  if (req.query.serviceSlug) q.serviceSlug = String(req.query.serviceSlug).trim().toLowerCase();
  ok(res, await ChecklistTemplate.find(q).sort('-updatedAt'));
};

exports.checklistTemplateCreate = async (req, res) => {
  const { title, serviceSlug, fields, active } = req.body;
  if (!title || !serviceSlug) throw new ApiError(400, 'title and serviceSlug are required', 'VALIDATION');
  const row = await ChecklistTemplate.create({
    title: String(title).trim(),
    serviceSlug: String(serviceSlug).trim().toLowerCase(),
    sourceFileName: req.body.sourceFileName ? String(req.body.sourceFileName).trim() : '',
    fields: Array.isArray(fields) ? fields : [],
    active: active !== false,
  });
  ok(res, row, 201);
};

exports.checklistTemplateDelete = async (req, res) => {
  await ChecklistTemplate.findByIdAndDelete(requireId(req.params.id));
  ok(res, { ok: true });
};

exports.checklistTemplateUploadExcel = async (req, res) => {
  if (!req.file?.buffer) throw new ApiError(400, 'Excel file is required (field name: file)', 'VALIDATION_ERROR');
  const serviceSlug = String(req.body.serviceSlug || '').trim().toLowerCase();
  if (!serviceSlug) throw new ApiError(400, 'serviceSlug is required', 'VALIDATION');
  const title = String(req.body.title || req.file.originalname || '').trim();
  if (!title) throw new ApiError(400, 'title is required', 'VALIDATION');
  const fields = parseChecklistFieldsFromWorkbook(req.file.buffer);
  if (!fields.length) throw new ApiError(400, 'No checklist rows found in the uploaded sheet', 'VALIDATION');
  const row = await ChecklistTemplate.create({
    title,
    serviceSlug,
    sourceFileName: String(req.file.originalname || ''),
    fields,
    locked: true,
    active: true,
  });
  ok(res, row, 201);
};
