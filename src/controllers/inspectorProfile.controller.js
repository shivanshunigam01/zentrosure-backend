const User = require('../models/User');
const Inspector = require('../models/Inspector');
const Booking = require('../models/Booking');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { normalizeIndianPhone } = require('../utils/phone');
const { publicFileUrl } = require('../services/storage.service');

function parseSpecialisations(body) {
  if (body.specialisations === undefined) return undefined;
  if (Array.isArray(body.specialisations)) {
    return body.specialisations.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof body.specialisations === 'string' && body.specialisations.trim()) {
    return body.specialisations.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function serialize(userLean) {
  const u = userLean;
  const ins = u.inspectorProfileId;
  return {
    user: {
      id: String(u._id),
      name: u.name || '',
      email: u.email || '',
      phone: u.phone || ''
    },
    inspector: ins
      ? {
          id: String(ins._id),
          inspectorCode: ins.inspectorCode || '',
          city: ins.city || '',
          avatarUrl: ins.avatarUrl != null ? String(ins.avatarUrl).trim() : '',
          rating: ins.rating ?? 0,
          jobsCompleted: ins.jobsCompleted ?? 0,
          status: ins.status || 'Active',
          specialisations: Array.isArray(ins.specialisations) ? ins.specialisations : []
        }
      : null
  };
}

/**
 * Live counts from bookings assigned to this inspector (DB jobsCompleted is not always maintained).
 * - inspectionsCompleted: you finished field work (submitted or beyond)
 * - awaitingAdminReview: submitted, waiting on admin QA
 * - reportsPublished: full pipeline done (report out to customer)
 */
async function computeInspectorBookingStats(inspectorObjectId) {
  if (!inspectorObjectId) {
    return {
      inspectionsCompleted: 0,
      awaitingAdminReview: 0,
      reportsPublished: 0
    };
  }
  const id = inspectorObjectId;
  const [inspectionsCompleted, awaitingAdminReview, reportsPublished] = await Promise.all([
    Booking.countDocuments({
      inspectorId: id,
      status: { $in: ['Submitted for Review', 'Verified', 'Report Published'] }
    }),
    Booking.countDocuments({ inspectorId: id, status: 'Submitted for Review' }),
    Booking.countDocuments({ inspectorId: id, status: 'Report Published' })
  ]);
  return { inspectionsCompleted, awaitingAdminReview, reportsPublished };
}

async function serializeWithStats(userLean) {
  const payload = serialize(userLean);
  const ins = userLean.inspectorProfileId;
  if (!payload.inspector || !ins || !ins._id) return payload;

  const stats = await computeInspectorBookingStats(ins._id);
  payload.inspector = {
    ...payload.inspector,
    jobsCompleted: stats.inspectionsCompleted,
    reviewsReceived: stats.reportsPublished,
    awaitingAdminReview: stats.awaitingAdminReview
  };
  return payload;
}

exports.getProfile = async (req, res) => {
  const user = await User.findById(req.user.id).populate('inspectorProfileId').lean();
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');
  ok(res, await serializeWithStats(user));
};

exports.patchProfile = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');
  const inspector = await Inspector.findOne({ userId: user._id });
  if (!inspector) throw new ApiError(403, 'Inspector profile not found', 'FORBIDDEN');

  if (req.body.name !== undefined) {
    const n = String(req.body.name || '').trim();
    if (!n) throw new ApiError(400, 'Name cannot be empty', 'VALIDATION_ERROR');
    user.name = n;
  }
  if (req.body.email !== undefined) {
    const em = String(req.body.email || '').trim().toLowerCase();
    if (!em) throw new ApiError(400, 'Email is required', 'VALIDATION_ERROR');
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
  if (req.body.city !== undefined) {
    inspector.city = String(req.body.city || '').trim();
  }
  const specs = parseSpecialisations(req.body);
  if (specs !== undefined) {
    inspector.specialisations = specs;
  }

  await Promise.all([user.save(), inspector.save()]);
  const lean = await User.findById(req.user.id).populate('inspectorProfileId').lean();
  ok(res, await serializeWithStats(lean));
};

/** POST multipart `photo` — upload inspector avatar and store URL on Inspector profile. */
exports.uploadAvatar = async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');
  const inspector = await Inspector.findOne({ userId: user._id });
  if (!inspector) throw new ApiError(403, 'Inspector profile not found', 'FORBIDDEN');
  if (!req.file) throw new ApiError(400, 'Image file required (field name: photo)', 'VALIDATION_ERROR');

  const fromCloudinary = req.profilePhotoUrl && String(req.profilePhotoUrl).trim();
  const fromDisk = req.file.filename ? publicFileUrl(req, req.file.filename) : '';
  const nextUrl = (fromCloudinary || fromDisk || '').trim();
  if (!nextUrl) {
    throw new ApiError(
      500,
      'Could not determine image URL after upload. Check Cloudinary config or file storage.',
      'AVATAR_URL_MISSING'
    );
  }

  inspector.set('avatarUrl', nextUrl);
  await inspector.save();

  const lean = await User.findById(req.user.id).populate('inspectorProfileId').lean();
  ok(res, await serializeWithStats(lean));
};
