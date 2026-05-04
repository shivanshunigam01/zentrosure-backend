const Service = require('../models/Service');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');

exports.listPublic = async (req, res) => ok(res, await Service.find({ active: true }).sort('title'));
exports.getPublic = async (req, res) => {
  const item = await Service.findOne({ slug: req.params.slug, active: true });
  if (!item) throw new ApiError(404, 'Service not found', 'NOT_FOUND');
  ok(res, item);
};
exports.adminList = async (req, res) => ok(res, await Service.find().sort('-createdAt'));
exports.create = async (req, res) => ok(res, await Service.create(req.body), 201);
exports.update = async (req, res) => {
  const item = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!item) throw new ApiError(404, 'Service not found', 'NOT_FOUND');
  ok(res, item);
};
exports.remove = async (req, res) => {
  const item = await Service.findByIdAndDelete(req.params.id);
  if (!item) throw new ApiError(404, 'Service not found', 'NOT_FOUND');
  ok(res, { deleted: true });
};
