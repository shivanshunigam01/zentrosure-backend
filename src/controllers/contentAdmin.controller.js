const mongoose = require('mongoose');
const { BlogPost, Faq, CityPage } = require('../models/Content');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');

function requireId(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new ApiError(400, 'Invalid id', 'VALIDATION');
  return id;
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
