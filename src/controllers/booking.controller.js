const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const Booking = require('../models/Booking');
const Inspector = require('../models/Inspector');
const Service = require('../models/Service');
const User = require('../models/User');
const OtpSession = require('../models/OtpSession');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { generateBookingNumber } = require('../utils/ids');
const { normalizeIndianPhone } = require('../utils/phone');
const { sendQuickBookingCredentials } = require('../services/mail.service');
const { sendBookingConfirmation } = require('../services/bookingWhatsapp.service');
const env = require('../config/env');
const { applyBookingDetailPatch } = require('../utils/bookingPatch');

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i += 1) out += chars[crypto.randomInt(0, chars.length)];
  return out;
}

function baseUserCodeFromName(name) {
  const clean = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 18);
  return clean || 'customer';
}

async function generateUniqueUserCodeFromName(name, excludeUserId) {
  const base = baseUserCodeFromName(name);
  let n = 1;
  while (n < 10000) {
    const candidate = `${base}-${String(n).padStart(3, '0')}`;
    const exists = await User.findOne({
      userCode: candidate,
      ...(excludeUserId ? { _id: { $ne: excludeUserId } } : {})
    })
      .select('_id')
      .lean();
    if (!exists) return candidate;
    n += 1;
  }
  throw new ApiError(500, 'Could not generate user ID. Try again.', 'USER_CODE_GENERATION_FAILED');
}

async function createBookingDocument(user, draft) {
  const service = await Service.findOne({ slug: draft.serviceSlug, active: true });
  if (!service) throw new ApiError(404, 'Selected service not found', 'NOT_FOUND');
  const bookingNumber = await generateBookingNumber();

  const contactName = (draft.contactName && String(draft.contactName).trim()) || user.name;
  const waPhone = normalizeIndianPhone(draft.contactPhone || draft.phone || '') || user.phone;
  const storedPhone = waPhone || user.phone || undefined;

  const lat = draft.addressLatitude != null && Number.isFinite(Number(draft.addressLatitude)) ? Number(draft.addressLatitude) : undefined;
  const lng = draft.addressLongitude != null && Number.isFinite(Number(draft.addressLongitude)) ? Number(draft.addressLongitude) : undefined;

  const booking = await Booking.create({
    bookingNumber,
    customerId: user.id,
    customerName: contactName,
    phone: storedPhone,
    serviceSlug: draft.serviceSlug,
    vehicleDescription: draft.vehicleDescription,
    city: draft.city,
    scheduledDate: draft.scheduledDate,
    slot: draft.slot,
    address: draft.address,
    ...(lat != null && lng != null ? { addressLatitude: lat, addressLongitude: lng } : {}),
    amount: draft.amount ?? service.price,
    checklist: draft.checklist || [],
    history: [{ event: 'Booking created', meta: { by: user.id } }]
  });

  return booking;
}

/** Authenticated customer: create a booking in one step (no server-side booking OTP). */
exports.createCustomerBooking = async (req, res) => {
  const phone = normalizeIndianPhone(req.body.contactPhone || req.body.phone || '');
  if (!phone) throw new ApiError(400, 'Invalid Indian mobile number', 'VALIDATION_ERROR');

  const contactName = String(req.body.contactName || '').trim();
  if (!contactName) throw new ApiError(400, 'Contact name is required', 'VALIDATION_ERROR');

  const service = await Service.findOne({ slug: req.body.serviceSlug, active: true });
  if (!service) throw new ApiError(404, 'Selected service not found', 'NOT_FOUND');

  const draft = {
    serviceSlug: req.body.serviceSlug,
    vehicleDescription: req.body.vehicleDescription,
    city: req.body.city,
    scheduledDate: req.body.scheduledDate,
    slot: req.body.slot,
    address: req.body.address,
    addressLatitude: req.body.addressLatitude,
    addressLongitude: req.body.addressLongitude,
    amount: req.body.amount ?? service.price,
    checklist: req.body.checklist || [],
    contactName,
    contactPhone: phone
  };

  const booking = await createBookingDocument(req.user, draft);
  ok(res, booking, 201);
};

/**
 * Homepage quick booking: requires WhatsApp OTP session (`otpSessionToken`) + same `source` as verify.
 * Creates/updates customer by phone, sets password and email, creates booking, emails credentials (no JWT in response).
 */
exports.quickPublicBooking = async (req, res) => {
  const phone = normalizeIndianPhone(req.body.phone || '');
  if (!phone) throw new ApiError(400, 'Invalid Indian mobile number', 'VALIDATION_ERROR');

  const contactName = String(req.body.name || '').trim();
  if (!contactName) throw new ApiError(400, 'Name is required', 'VALIDATION_ERROR');

  const email = String(req.body.email || '').trim().toLowerCase();
  if (!email) throw new ApiError(400, 'Email is required', 'VALIDATION_ERROR');

  const token = String(req.body.otpSessionToken || '').trim();
  if (!token) throw new ApiError(400, 'Phone OTP verification required', 'PHONE_NOT_VERIFIED');

  const source = req.body.source || 'home-quick-booking';
  const session = await OtpSession.findOne({
    phone,
    sessionToken: token,
    source,
    verifiedAt: { $exists: true }
  });
  if (!session) throw new ApiError(400, 'Phone OTP verification required', 'PHONE_NOT_VERIFIED');

  const city = String(req.body.city || '').trim();
  if (!city) throw new ApiError(400, 'City is required', 'VALIDATION_ERROR');

  const serviceSlug = String(req.body.serviceSlug || '').trim();
  const service = await Service.findOne({ slug: serviceSlug, active: true });
  if (!service) throw new ApiError(404, 'Selected service not found', 'NOT_FOUND');

  const emailOwner = await User.findOne({ email });
  if (emailOwner && String(emailOwner.phone) !== phone) {
    throw new ApiError(409, 'This email is already used by another account', 'EMAIL_IN_USE');
  }

  const plainPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  let user = await User.findOne({ phone });
  if (!user) {
    const userCode = await generateUniqueUserCodeFromName(contactName);
    user = await User.create({
      name: contactName,
      phone,
      email,
      userCode,
      role: 'customer',
      passwordHash
    });
  } else if (user.role !== 'customer') {
    throw new ApiError(400, 'This phone is registered to a non-customer account. Sign in from Login.', 'INVALID_ACCOUNT');
  } else {
    user.name = contactName.length >= 2 ? contactName : user.name;
    user.email = email;
    user.passwordHash = passwordHash;
    if (!user.userCode) {
      user.userCode = await generateUniqueUserCodeFromName(user.name || contactName, user._id);
    }
    await user.save();
  }

  const scheduled = new Date();
  scheduled.setUTCDate(scheduled.getUTCDate() + 2);
  scheduled.setUTCHours(10, 0, 0, 0);

  const draft = {
    serviceSlug,
    vehicleDescription: 'Quick booking — vehicle details to be confirmed with customer',
    city,
    scheduledDate: scheduled.toISOString(),
    slot: 'To be scheduled',
    address: 'To be confirmed with customer',
    amount: service.price ?? 0,
    checklist: [],
    contactName,
    contactPhone: phone
  };

  const booking = await createBookingDocument({ id: user._id.toString(), name: user.name, phone: user.phone }, draft);

  const userId = user.userCode || user._id.toString();
  const emailSent = await sendQuickBookingCredentials({
    to: email,
    customerName: contactName,
    userId,
    phoneDigits: phone,
    bookingNumber: booking.bookingNumber,
    password: plainPassword,
    loginUrl: env.loginWebUrl
  });

  let whatsappSent = false;
  try {
    const wa = await sendBookingConfirmation(phone, contactName);
    whatsappSent = Boolean(wa && !wa.skipped);
  } catch (err) {
    console.error('[quick booking] WhatsApp thank-you failed:', err.message || err);
  }

  ok(
    res,
    {
      booking,
      emailSent,
      whatsappSent,
      customerId: userId,
      loginUrl: env.loginWebUrl,
      message: emailSent
        ? whatsappSent
          ? 'Booking created. Check your email for login details, complete your booking info in the portal, and look for a WhatsApp thank-you on your mobile.'
          : 'Booking created. Check your email for login details and complete your booking information in the portal.'
        : whatsappSent
          ? 'Booking created. We could not send email — configure SMTP. WhatsApp thank-you was sent.'
          : 'Booking created. We could not send email — configure SMTP or use Forgot password on Login.'
    },
    201
  );
};

exports.myBookings = async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Number(req.query.limit || 20), 100);
  const [data, total] = await Promise.all([
    Booking.find({ customerId: req.user.id }).sort('-createdAt').skip((page - 1) * limit).limit(limit),
    Booking.countDocuments({ customerId: req.user.id })
  ]);
  ok(res, data, 200, { page, limit, total });
};

exports.getMine = async (req, res) => {
  const booking = await Booking.findOne({ bookingNumber: req.params.bookingNumber, customerId: req.user.id });
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  ok(res, booking);
};

exports.patchMine = async (req, res) => {
  const booking = await Booking.findOne({ bookingNumber: req.params.bookingNumber, customerId: req.user.id });
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  if (booking.status === 'Cancelled') throw new ApiError(409, 'Cannot edit a cancelled booking', 'INVALID_TRANSITION');
  applyBookingDetailPatch(booking, req.body || {});
  booking.history.push({ event: 'Booking details updated', meta: { by: req.user.id } });
  await booking.save();
  ok(res, booking);
};

/** Booking statuses where the inspector is en route / on the job and live tracking should be shown. */
const TRACKABLE_STATUSES = new Set(['Assigned', 'Awaiting Inspector', 'Sent Back']);

/**
 * Customer live tracking payload — inspector current GPS, customer site GPS, and metadata.
 * Tracking is "active" only after the inspector has accepted the booking and before submission.
 */
exports.trackBooking = async (req, res) => {
  const booking = await Booking.findOne({
    bookingNumber: req.params.bookingNumber,
    customerId: req.user.id,
  });
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');

  const accepted = booking.assignmentStatus === 'accepted';
  const trackable = TRACKABLE_STATUSES.has(String(booking.status || ''));
  const trackingActive = Boolean(accepted && trackable && booking.inspectorId);

  let inspectorPayload = null;
  if (booking.inspectorId) {
    const insp = await Inspector.findById(booking.inspectorId).populate('userId', 'name email phone');
    if (insp) {
      const user = insp.userId && typeof insp.userId === 'object' ? insp.userId : null;
      const cur = insp.currentLocation;
      const hasFix =
        cur && Number.isFinite(Number(cur.lat)) && Number.isFinite(Number(cur.lng));
      inspectorPayload = {
        name: (user && user.name) || '',
        code: insp.inspectorCode || '',
        phone: (user && user.phone) || '',
        email: (user && user.email) || '',
        avatarUrl: insp.avatarUrl || '',
        rating: Number(insp.rating || 0),
        currentLocation: hasFix
          ? {
              lat: Number(cur.lat),
              lng: Number(cur.lng),
              address: cur.address || '',
              accuracyM: cur.accuracyM != null ? Number(cur.accuracyM) : null,
              capturedAt: cur.capturedAt || null,
              bookingNumber: cur.bookingNumber || '',
            }
          : null,
      };
    }
  }

  let trackingMessage = '';
  if (!booking.inspectorId) {
    trackingMessage = 'No inspector has been assigned to this booking yet.';
  } else if (!accepted) {
    trackingMessage = 'Inspector assignment is awaiting acceptance.';
  } else if (!trackable) {
    trackingMessage = 'This booking is not in the live-tracking window.';
  } else if (!inspectorPayload?.currentLocation) {
    trackingMessage = 'Inspector has not shared a live GPS fix yet — tracking will start as soon as they enable location.';
  }

  ok(res, {
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    assignmentStatus: booking.assignmentStatus,
    trackingActive,
    trackingMessage,
    scheduledDate: booking.scheduledDate || null,
    slot: booking.slot || '',
    visitVerifiedAt: booking.visitVerifiedAt || null,
    customer: {
      name: booking.customerName || '',
      phone: booking.phone || '',
      address: booking.address || '',
      city: booking.city || '',
      lat:
        booking.addressLatitude != null && Number.isFinite(Number(booking.addressLatitude))
          ? Number(booking.addressLatitude)
          : null,
      lng:
        booking.addressLongitude != null && Number.isFinite(Number(booking.addressLongitude))
          ? Number(booking.addressLongitude)
          : null,
    },
    inspector: inspectorPayload,
  });
};

/**
 * Public inspection detail (no auth, no token).
 * Exposes inspector submission data and media for shareable viewing.
 */
exports.publicInspectionDetail = async (req, res) => {
  const booking = await Booking.findOne({ bookingNumber: req.params.bookingNumber }).populate('inspectorId');
  if (!booking) throw new ApiError(404, 'Inspection not found', 'NOT_FOUND');

  const inspectorName =
    booking?.inspectorId?.userId?.name ||
    booking?.submission?.inspectorName ||
    '';

  const fields = (booking.submission?.fields || []).map((f) => ({
    fieldId: f.fieldId,
    notes: f.notes || '',
    images: (f.images || []).map((img) => ({
      storageUrl: img.storageUrl || '',
      capturedAt: img.capturedAt || null,
      latitude: img.latitude ?? null,
      longitude: img.longitude ?? null,
      address: img.address ?? null
    }))
  }));

  ok(res, {
    bookingNumber: booking.bookingNumber,
    customerName: booking.customerName || '',
    phone: booking.phone || '',
    serviceSlug: booking.serviceSlug || '',
    vehicleDescription: booking.vehicleDescription || '',
    city: booking.city || '',
    scheduledDate: booking.scheduledDate || null,
    slot: booking.slot || '',
    address: booking.address || '',
    status: booking.status || '',
    inspectorName: String(inspectorName || ''),
    submission: booking.submission
      ? {
          submittedAt: booking.submission.submittedAt || null,
          overallNotes: booking.submission.overallNotes || '',
          fields
        }
      : null,
    report: booking.report || null,
    visitVerifiedAt: booking.visitVerifiedAt || null
  });
};
