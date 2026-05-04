const Booking = require('../models/Booking');
const Inspector = require('../models/Inspector');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { applyBookingDetailPatch } = require('../utils/bookingPatch');
const mail = require('../services/mail.service');
const bookingWhatsapp = require('../services/bookingWhatsapp.service');

async function myInspector(req) {
  const inspector = await Inspector.findOne({ userId: req.user.id });
  if (!inspector) throw new ApiError(403, 'Inspector profile not found', 'FORBIDDEN');
  return inspector;
}
exports.tasks = async (req, res) => {
  const inspector = await myInspector(req);
  const data = await Booking.find({ inspectorId: inspector._id }).sort('-updatedAt');
  ok(res, data);
};
exports.get = async (req, res) => {
  const inspector = await myInspector(req);
  const booking = await Booking.findOne({ bookingNumber: req.params.bookingNumber, inspectorId: inspector._id });
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  ok(res, booking);
};
exports.patchBookingDetails = async (req, res) => {
  const inspector = await myInspector(req);
  const booking = await Booking.findOne({ bookingNumber: req.params.bookingNumber, inspectorId: inspector._id });
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  const editable = ['Assigned', 'Awaiting Inspector', 'Sent Back'];
  if (!editable.includes(booking.status)) {
    throw new ApiError(409, 'Booking cannot be edited in its current state', 'INVALID_TRANSITION');
  }
  applyBookingDetailPatch(booking, req.body || {});
  booking.history.push({ event: 'Booking details updated', meta: { inspectorId: inspector._id } });
  await booking.save();
  ok(res, booking);
};
function imageHasValidGps(img) {
  const lat = Number(img?.latitude);
  const lng = Number(img?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

exports.submit = async (req, res) => {
  const inspector = await myInspector(req);
  const booking = await Booking.findOne({ bookingNumber: req.params.bookingNumber, inspectorId: inspector._id });
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  const fields = req.body.fields || [];
  for (const f of fields) {
    for (const img of f.images || []) {
      if (!imageHasValidGps(img)) {
        throw new ApiError(
          400,
          'Every inspection photo must include GPS coordinates. Re-capture or re-upload with location enabled.',
          'LOCATION_REQUIRED'
        );
      }
    }
  }
  for (const item of booking.checklist || []) {
    if (item.required) {
      const submitted = fields.find((f) => f.fieldId === item.id);
      const photos = submitted?.images?.length || 0;
      if (photos < (item.minPhotos || 0)) throw new ApiError(400, `${item.label} requires minimum ${item.minPhotos} photo(s)`, 'VALIDATION_ERROR');
    }
  }
  booking.submission = { submittedAt: new Date(), inspectorId: inspector._id, inspectorName: req.user.name, fields, overallNotes: req.body.overallNotes };
  booking.status = 'Submitted for Review';
  booking.history.push({ event: 'Inspection submitted', meta: { inspectorId: inspector._id } });
  await booking.save();

  setImmediate(async () => {
    try {
      const [customer, inspectorUser] = await Promise.all([
        User.findById(booking.customerId).lean(),
        User.findById(inspector.userId).lean()
      ]);
      const inspectorName = (inspectorUser?.name || req.user.name || 'Inspector').trim();
      const mediaUrl = Array.isArray(booking.uploadedImages) && booking.uploadedImages.length
        ? String(booking.uploadedImages[booking.uploadedImages.length - 1]?.storageUrl || '')
        : '';

      await mail.sendInspectionCompletedEmail({
        booking,
        customer,
        inspector,
        inspectorUser
      });
      await bookingWhatsapp.sendInspectionCompletedWhatsApp({
        booking,
        customer,
        inspectorName,
        mediaUrl: mediaUrl || undefined
      });
    } catch (err) {
      console.error('[inspection-completed notify] failed:', err.message || err);
    }
  });

  ok(res, booking);
};

exports.updateLiveLocation = async (req, res) => {
  const inspector = await myInspector(req);
  const lat = Number(req.body?.lat);
  const lng = Number(req.body?.lng);
  const accuracyM = req.body?.accuracyM != null ? Number(req.body.accuracyM) : undefined;
  const address = req.body?.address != null ? String(req.body.address).trim() : '';
  const bookingNumber = req.body?.bookingNumber != null ? String(req.body.bookingNumber).trim() : '';
  const capturedAtRaw = req.body?.capturedAt;
  const capturedAt = capturedAtRaw ? new Date(capturedAtRaw) : new Date();

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new ApiError(400, 'lat must be between -90 and 90', 'VALIDATION_ERROR');
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new ApiError(400, 'lng must be between -180 and 180', 'VALIDATION_ERROR');
  }
  if (Number.isNaN(capturedAt.getTime())) {
    throw new ApiError(400, 'capturedAt is invalid', 'VALIDATION_ERROR');
  }

  const point = {
    lat,
    lng,
    address: address || undefined,
    accuracyM: Number.isFinite(accuracyM) ? accuracyM : undefined,
    capturedAt,
    bookingNumber: bookingNumber || undefined,
    source: 'browser-gps'
  };

  inspector.currentLocation = point;
  inspector.locationHistory = Array.isArray(inspector.locationHistory) ? inspector.locationHistory : [];
  inspector.locationHistory.push(point);
  if (inspector.locationHistory.length > 200) {
    inspector.locationHistory = inspector.locationHistory.slice(-200);
  }
  await inspector.save();

  ok(res, {
    currentLocation: inspector.currentLocation
  });
};
