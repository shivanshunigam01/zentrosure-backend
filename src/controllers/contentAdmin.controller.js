const mongoose = require('mongoose');
const xlsx = require('xlsx');
const Booking = require('../models/Booking');
const { BlogPost, Faq, CityPage, PopularModelImage, Testimonial, ChecklistTemplate } = require('../models/Content');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { publicFileUrl } = require('../services/storage.service');
const {
  assertBookingAllowsChecklistReplace,
  syncSubmissionAndArtifactsAfterChecklistChange,
} = require('../utils/checklistSubmissionSync');

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

/** Map header labels (first row) to column indexes for structured ZentroSure templates. */
function mapChecklistHeaderColumns(headerRow) {
  const headers = headerRow.map((c) => String(c ?? '').trim());
  const lower = headers.map((h) => h.toLowerCase().replace(/\s+/g, ' '));
  /** Prefer longest / most specific substring matches first (order of patterns matters). */
  const findColLoose = (patterns) => {
    for (const p of patterns) {
      for (let i = 0; i < lower.length; i += 1) {
        const cell = lower[i];
        if (cell === p || cell.includes(p)) return i;
      }
    }
    return -1;
  };
  /** Row-level required flag — must not match "photo required" etc. */
  const findColRequiredFlag = () => {
    for (let i = 0; i < lower.length; i += 1) {
      const cell = lower[i];
      if (/photo|picture|image|capture|min\s*photos/.test(cell)) continue;
      const norm = cell.replace(/\s*\??\s*$/u, '').trim();
      if (norm === 'required' || norm === 'mandatory' || norm === 'is required') return i;
    }
    return -1;
  };
  /** Avoid matching "Notes" via substring "no". */
  const findColOrder = () => {
    const primary = [
      'display order',
      'sort order',
      'sequence',
      'sr no',
      's.no',
      's no',
      'sl no',
      'serial no',
    ];
    const idx = findColLoose(primary);
    if (idx >= 0) return idx;
    for (let i = 0; i < lower.length; i += 1) {
      const c = lower[i];
      if (c === 'order' || c === 'seq' || c === '#' || c === 'no.' || /^s\.?\s*no\.?$/i.test(String(headers[i] ?? '').trim())) {
        return i;
      }
    }
    return -1;
  };
  const orderCol = findColOrder();
  return {
    section: findColLoose(['section', 'category', 'group']),
    title: findColLoose(['checklist title', 'checkpoint', 'check point', 'inspection item', 'item title']),
    fieldType: findColLoose(['field type', 'fieldtype']),
    instructions: findColLoose([
      'instructions',
      'guidance',
      'hint',
      'inspector instructions',
      'guidelines',
      'description',
    ]),
    options: findColLoose(['inspector options', 'condition options', 'dropdown options', 'choices']),
    photoRequired: findColLoose(['photo required', 'photos required', 'capture photo']),
    minPhotos: findColLoose(['min photos', 'minimum photos']),
    notesAllowed: findColLoose(['notes allowed', 'remarks allowed', 'allow remarks', 'remarks ok']),
    required: findColRequiredFlag(),
    order: orderCol,
  };
}

/** Excel "Field Type" cell — stored separately, never as instructions. */
function checklistFieldTypeFromCell(raw) {
  return String(raw ?? '').trim().slice(0, 80);
}

/**
 * Whether inspector should pick a condition / dropdown value for this row.
 * Uses Inspector Options when present; otherwise infers from field type name.
 */
function inferEnableConditionFromFieldType(fieldTypeLower, hasInspectorOptions) {
  if (hasInspectorOptions) return true;
  const ft = fieldTypeLower.replace(/\s+/g, ' ').trim();
  if (!ft) return true;
  if (/dropdown|drop\s*-?\s*down|select|choice|choices|radio|list|pick|multi|combo/.test(ft)) return true;
  if (/photo|image|capture|picture|camera|file\s*upload|attachment/.test(ft)) return false;
  if (/text|textarea|note|notes\s*only|number|numeric|date|time|plain/.test(ft)) return false;
  if (/check|checkbox|boolean|yes\s*\/?\s*no|toggle/.test(ft)) return true;
  return true;
}

function parseStructuredChecklistRows(rows) {
  let headerIdx = -1;
  let col = null;
  const scanLimit = Math.min(rows.length, 50);
  for (let i = 0; i < scanLimit; i += 1) {
    const rowRaw = rows[i];
    if (!Array.isArray(rowRaw)) continue;
    const headerCells = rowRaw.map((c) => String(c ?? '').trim());
    if (!headerCells.some(Boolean)) continue;
    const mapped = mapChecklistHeaderColumns(headerCells);
    if (mapped.title >= 0) {
      headerIdx = i;
      col = mapped;
      break;
    }
  }
  if (headerIdx < 0 || !col || col.title < 0) return [];

  const fields = [];
  for (let i = headerIdx + 1; i < rows.length; i += 1) {
    const rowRaw = rows[i];
    if (!Array.isArray(rowRaw)) continue;
    const row = rowRaw.map((c) => String(c ?? '').trim());
    const title = row[col.title] || '';
    if (!title || title.length < 2) continue;
    const rowJoined = row.join(' ').toLowerCase();
    if (/checklist\s*title/i.test(title) && rowJoined.includes('section')) continue;

    const section = col.section >= 0 ? String(row[col.section] ?? '').trim() : '';
    const instructions =
      col.instructions >= 0 ? String(row[col.instructions] ?? '').trim().slice(0, 500) : '';

    const fieldTypeCell = col.fieldType >= 0 ? checklistFieldTypeFromCell(row[col.fieldType]) : '';
    const fieldTypeLower = fieldTypeCell.toLowerCase();

    let options = [];
    if (col.options >= 0 && row[col.options]) {
      options = String(row[col.options])
        .split(/[,;/|]/)
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 12);
    }

    const hasInspectorOptions = options.length > 0;
    const enableCondition = inferEnableConditionFromFieldType(fieldTypeLower, hasInspectorOptions);
    const conditionOptions = enableCondition
      ? hasInspectorOptions
        ? options
        : ['OK', 'NOK', 'Minor', 'Major']
      : [];

    let minPhotos = col.minPhotos >= 0 ? Number(row[col.minPhotos]) : 0;
    if (!Number.isFinite(minPhotos)) minPhotos = 0;
    minPhotos = Math.max(0, Math.min(20, Math.round(minPhotos)));

    const photoReq =
      col.photoRequired >= 0 ? String(row[col.photoRequired] ?? '').trim().toLowerCase() : '';
    if ((photoReq === 'yes' || photoReq === 'y' || photoReq === 'true' || photoReq === '1') && minPhotos === 0) {
      minPhotos = 1;
    }

    const reqCell = col.required >= 0 ? String(row[col.required] ?? '').trim().toLowerCase() : '';
    const required =
      reqCell === 'yes' ||
      reqCell === 'y' ||
      reqCell === 'true' ||
      reqCell === '1' ||
      reqCell === 'mandatory';

    const notesCell = col.notesAllowed >= 0 ? String(row[col.notesAllowed] ?? '').trim().toLowerCase() : '';
    const enableRemarks = !(notesCell === 'no' || notesCell === 'n' || notesCell === 'false' || notesCell === '0');

    const label = section ? `${section} — ${title}`.slice(0, 220) : title.slice(0, 220);

    let ord = col.order >= 0 ? Number(row[col.order]) : NaN;
    if (!Number.isFinite(ord)) ord = fields.length + 1;

    const idBase = slugId(`${section}-${title}`) || `field-${fields.length + 1}`;
    fields.push({
      id: `${idBase}-${fields.length + 1}`,
      label,
      fieldType: fieldTypeCell,
      instructions,
      required,
      minPhotos,
      enableCondition,
      conditionOptions,
      enableRemarks,
      _sortOrder: ord,
    });
  }
  fields.sort((a, b) => (a._sortOrder ?? 0) - (b._sortOrder ?? 0));
  fields.forEach((f) => {
    delete f._sortOrder;
  });
  return fields;
}

/** Legacy free-form Excel (section rows + label column A). Kept for older templates. */
function parseLegacyChecklistRows(rows) {
  const fields = [];
  let currentSection = 'General';
  for (const rowRaw of rows) {
    const row = Array.isArray(rowRaw) ? rowRaw.map((c) => String(c ?? '').trim()) : [];
    const rowJoinedAll = row.join(' ').toLowerCase();
    if (/checklist\s*title/.test(rowJoinedAll) && /section/.test(rowJoinedAll)) continue;
    const cellsWithText = row.filter(Boolean);
    if (!cellsWithText.length) continue;
    const rowJoined = cellsWithText.join(' ').toLowerCase();
    if (/^(s\.?no|sr\.? no|serial|check ?point|checkpoint|remarks?|status|ok\/ng|mandatory|required)$/.test(rowJoined)) {
      continue;
    }
    if (cellsWithText.length === 1 && cellsWithText[0].length <= 70 && !/[0-9]{3,}/.test(cellsWithText[0])) {
      currentSection = cellsWithText[0];
      continue;
    }
    const label = cellsWithText[0];
    if (!label || label.length < 2) continue;
    const required = /(required|mandatory|must|yes|y)/i.test(rowJoined);
    const minPhotosMatch =
      rowJoined.match(/(?:min|minimum)?\s*photos?\s*[:\-]?\s*(\d+)/i) || rowJoined.match(/\b(\d+)\s*photos?\b/i);
    const minPhotos = minPhotosMatch
      ? Math.max(0, Math.min(20, Number(minPhotosMatch[1] || 0)))
      : required
        ? 1
        : 0;
    const instructions = cellsWithText.slice(1).join(' | ').slice(0, 500);
    const idBase = slugId(`${currentSection}-${label}`) || `field-${fields.length + 1}`;
    fields.push({
      id: `${idBase}-${fields.length + 1}`,
      label: `${currentSection !== 'General' ? `${currentSection} - ` : ''}${label}`.slice(0, 220),
      fieldType: '',
      instructions,
      required,
      minPhotos,
      enableCondition: true,
      conditionOptions: ['OK', 'NOK', 'Minor', 'Major'],
      enableRemarks: true,
    });
  }
  return fields;
}

function parseChecklistFieldsFromWorkbook(fileBuffer) {
  const wb = xlsx.read(fileBuffer, { type: 'buffer' });
  const preferred =
    wb.SheetNames.find((n) => /checklist/i.test(String(n))) || wb.SheetNames?.[0];
  if (!preferred) return [];
  const ws = wb.Sheets[preferred];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
  const structured = parseStructuredChecklistRows(rows);
  if (structured.length) return structured;
  return parseLegacyChecklistRows(rows);
}

function normalizeChecklistFields(rawFields) {
  if (!Array.isArray(rawFields)) return [];
  return rawFields.map((f, idx) => {
    const idRaw = String(f?.id || '').trim();
    const labelRaw = String(f?.label || '').trim();
    const enableCondition = f?.enableCondition !== false;
    const optionsRaw = Array.isArray(f?.conditionOptions)
      ? f.conditionOptions.map((x) => String(x || '').trim()).filter(Boolean)
      : [];
    const conditionOptions = enableCondition
      ? optionsRaw.length
        ? optionsRaw
        : ['OK', 'NOK', 'Minor', 'Major']
      : [];
    return {
      id: idRaw || `field-${idx + 1}`,
      label: labelRaw || `Field ${idx + 1}`,
      fieldType: f?.fieldType != null ? String(f.fieldType).trim().slice(0, 80) : '',
      instructions: String(f?.instructions || '').trim(),
      required: Boolean(f?.required),
      minPhotos: Math.max(0, Math.min(20, Number(f?.minPhotos ?? 0) || 0)),
      enableCondition,
      conditionOptions,
      enableRemarks: f?.enableRemarks !== false
    };
  });
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
    fields: normalizeChecklistFields(fields),
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
  const bookingNumber = String(req.body.bookingNumber || req.body.applyBookingNumber || '').trim();
  const explicitApply =
    req.body.applyToBooking === true ||
    req.body.applyToBooking === 'true' ||
    req.body.applyToBooking === '1';
  if (explicitApply && !bookingNumber) {
    throw new ApiError(400, 'bookingNumber is required when applyToBooking is set', 'VALIDATION');
  }
  const applyToBooking = explicitApply || Boolean(bookingNumber);

  const fields = normalizeChecklistFields(parseChecklistFieldsFromWorkbook(req.file.buffer));
  if (!fields.length) throw new ApiError(400, 'No checklist rows found in the uploaded sheet', 'VALIDATION');

  let booking = null;
  if (applyToBooking && bookingNumber) {
    booking = await Booking.findOne({ bookingNumber });
    if (!booking) throw new ApiError(404, 'Booking not found for bookingNumber', 'NOT_FOUND');
    const bookingSlug = String(booking.serviceSlug || '').trim().toLowerCase();
    if (bookingSlug !== serviceSlug) {
      throw new ApiError(
        400,
        `serviceSlug mismatch: booking is "${bookingSlug}" but upload used "${serviceSlug}"`,
        'VALIDATION',
      );
    }
    assertBookingAllowsChecklistReplace(booking);
  }

  const row = await ChecklistTemplate.create({
    title,
    serviceSlug,
    sourceFileName: String(req.file.originalname || ''),
    fields,
    locked: false,
    active: true,
  });

  if (booking) {
    booking.checklist = fields;
    booking.checklistTemplateTitle = title;
    syncSubmissionAndArtifactsAfterChecklistChange(booking, fields, {
      source: 'excel_import',
      templateId: row._id,
    });
    booking.history.push({
      event: 'Checklist imported from Excel',
      meta: {
        templateId: row._id,
        sourceFileName: String(req.file.originalname || ''),
        by: req.user?.id,
      },
    });
    await booking.save();
  }

  ok(res, booking ? { template: row, booking } : row, 201);
};
