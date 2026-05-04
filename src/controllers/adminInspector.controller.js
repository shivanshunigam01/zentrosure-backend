const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const User = require('../models/User');
const Inspector = require('../models/Inspector');
const Booking = require('../models/Booking');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { normalizeIndianPhone } = require('../utils/phone');

function parseSpecialisations(body) {
  if (Array.isArray(body.specialisations)) return body.specialisations.map(String).filter(Boolean);
  if (typeof body.specialisations === 'string' && body.specialisations.trim()) {
    return body.specialisations.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

exports.get = async (req, res) => {
  const doc = await Inspector.findById(req.params.id).populate('userId', 'name email phone role');
  if (!doc) throw new ApiError(404, 'Inspector not found', 'NOT_FOUND');
  ok(res, doc);
};

exports.create = async (req, res) => {
  const name = String(req.body.name || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const phone = normalizeIndianPhone(req.body.phone);
  const password = String(req.body.password || '');
  if (!name || !email || !phone) throw new ApiError(400, 'Name, email and valid phone are required', 'VALIDATION_ERROR');
  if (password.length < 6) throw new ApiError(400, 'Password must be at least 6 characters', 'VALIDATION_ERROR');

  const [emailTaken, phoneTaken] = await Promise.all([User.findOne({ email }), User.findOne({ phone })]);
  if (emailTaken) throw new ApiError(409, 'Email already registered', 'EMAIL_IN_USE');
  if (phoneTaken) throw new ApiError(409, 'Phone already registered', 'PHONE_IN_USE');

  let inspectorCode = (req.body.inspectorCode && String(req.body.inspectorCode).trim()) || '';
  if (!inspectorCode) inspectorCode = `INS-${nanoid(8).toUpperCase()}`;
  const existsCode = await Inspector.findOne({ inspectorCode });
  if (existsCode) throw new ApiError(409, 'Inspector code already in use', 'CODE_IN_USE');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    phone,
    passwordHash,
    role: 'inspector'
  });

  const specs = parseSpecialisations(req.body);
  const status = ['Active', 'On Job', 'Suspended'].includes(req.body.status) ? req.body.status : 'Active';

  const inspector = await Inspector.create({
    userId: user._id,
    inspectorCode,
    city: String(req.body.city || '').trim() || undefined,
    specialisations: specs,
    status
  });

  user.inspectorProfileId = inspector._id;
  await user.save();

  const out = await Inspector.findById(inspector._id).populate('userId', 'name email phone role');
  ok(res, out, 201);
};

exports.update = async (req, res) => {
  const inspector = await Inspector.findById(req.params.id);
  if (!inspector) throw new ApiError(404, 'Inspector not found', 'NOT_FOUND');
  const user = await User.findById(inspector.userId).select('+passwordHash');
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

  if (req.body.name !== undefined) {
    const n = String(req.body.name || '').trim();
    if (!n) throw new ApiError(400, 'Name cannot be empty', 'VALIDATION_ERROR');
    user.name = n;
  }
  if (req.body.email !== undefined) {
    const em = String(req.body.email || '').trim().toLowerCase();
    if (!em) throw new ApiError(400, 'Email required', 'VALIDATION_ERROR');
    const other = await User.findOne({ email: em, _id: { $ne: user._id } });
    if (other) throw new ApiError(409, 'Email already in use', 'EMAIL_IN_USE');
    user.email = em;
  }
  if (req.body.phone !== undefined) {
    const ph = normalizeIndianPhone(req.body.phone);
    if (!ph) throw new ApiError(400, 'Invalid Indian mobile number', 'VALIDATION_ERROR');
    const other = await User.findOne({ phone: ph, _id: { $ne: user._id } });
    if (other) throw new ApiError(409, 'Phone already in use', 'PHONE_IN_USE');
    user.phone = ph;
  }
  if (req.body.password !== undefined && String(req.body.password).length > 0) {
    if (String(req.body.password).length < 6) throw new ApiError(400, 'Password must be at least 6 characters', 'VALIDATION_ERROR');
    user.passwordHash = await bcrypt.hash(String(req.body.password), 10);
  }
  if (req.body.inspectorCode !== undefined) {
    const code = String(req.body.inspectorCode || '').trim();
    if (!code) throw new ApiError(400, 'Inspector code cannot be empty', 'VALIDATION_ERROR');
    const dup = await Inspector.findOne({ inspectorCode: code, _id: { $ne: inspector._id } });
    if (dup) throw new ApiError(409, 'Inspector code already in use', 'CODE_IN_USE');
    inspector.inspectorCode = code;
  }
  if (req.body.city !== undefined) inspector.city = String(req.body.city || '').trim();
  if (req.body.status !== undefined) {
    if (!['Active', 'On Job', 'Suspended'].includes(req.body.status)) {
      throw new ApiError(400, 'Invalid status', 'VALIDATION_ERROR');
    }
    inspector.status = req.body.status;
  }
  if (req.body.specialisations !== undefined) {
    inspector.specialisations = parseSpecialisations(req.body);
  }

  await Promise.all([user.save(), inspector.save()]);
  ok(res, await Inspector.findById(inspector._id).populate('userId', 'name email phone role'));
};

exports.remove = async (req, res) => {
  const inspector = await Inspector.findById(req.params.id);
  if (!inspector) throw new ApiError(404, 'Inspector not found', 'NOT_FOUND');

  const activeBooking = await Booking.findOne({
    inspectorId: inspector._id,
    status: { $nin: ['Report Published', 'Cancelled'] }
  });
  if (activeBooking) {
    throw new ApiError(
      409,
      'This inspector has active bookings. Assign or complete them before removing.',
      'HAS_ACTIVE_BOOKINGS'
    );
  }

  const user = await User.findById(inspector.userId);
  await Inspector.deleteOne({ _id: inspector._id });
  if (user) {
    user.role = 'customer';
    user.inspectorProfileId = undefined;
    await user.save();
  }
  ok(res, { deleted: true });
};
