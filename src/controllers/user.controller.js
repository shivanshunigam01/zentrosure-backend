const User = require('../models/User');
const { ok } = require('../utils/response');
const ApiError = require('../utils/apiError');
const { normalizeIndianPhone } = require('../utils/phone');

exports.me = async (req, res) => {
  const user = await User.findById(req.user.id).populate('inspectorProfileId');
  ok(res, user);
};
exports.updateMe = async (req, res) => {
  const patch = {};
  ['name', 'email'].forEach((k) => { if (req.body[k] !== undefined) patch[k] = req.body[k]; });
  if (req.body.phone) {
    const phone = normalizeIndianPhone(req.body.phone);
    if (!phone) throw new ApiError(400, 'Invalid Indian mobile number', 'VALIDATION_ERROR');
    patch.phone = phone;
  }
  const user = await User.findByIdAndUpdate(req.user.id, patch, { new: true, runValidators: true });
  ok(res, user);
};
