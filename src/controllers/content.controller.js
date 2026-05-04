const { BlogPost, Faq, CityPage } = require('../models/Content');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
exports.blogList = async (req, res) => ok(res, await BlogPost.find({ published: true }).sort('-createdAt').select('-content'));
exports.blogDetail = async (req, res) => {
  const post = await BlogPost.findOne({ slug: req.params.slug, published: true });
  if (!post) throw new ApiError(404, 'Blog post not found', 'NOT_FOUND');
  ok(res, post);
};
exports.faqs = async (req, res) => ok(res, await Faq.find({ active: true }).sort('createdAt'));
exports.cities = async (req, res) => ok(res, await CityPage.find({ active: true }).select('city slug'));

exports.cityBySlug = async (req, res) => {
  const page = await CityPage.findOne({ slug: req.params.slug, active: true });
  if (!page) throw new ApiError(404, 'City page not found', 'NOT_FOUND');
  ok(res, page);
};
