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

exports.acceptAssignment = async (req, res) => {
  const inspector = await myInspector(req);
  const booking = await Booking.findOne({ bookingNumber: req.params.bookingNumber, inspectorId: inspector._id });
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  if (!['Awaiting Inspector', 'Assigned'].includes(String(booking.status || ''))) {
    throw new ApiError(409, 'Booking is not awaiting inspector acceptance', 'INVALID_TRANSITION');
  }
  booking.assignmentStatus = 'accepted';
  booking.assignmentRespondedAt = new Date();
  booking.status = 'Assigned';
  booking.history.push({ event: 'Inspector accepted booking', meta: { inspectorId: inspector._id } });
  inspector.status = 'On Job';
  await Promise.all([booking.save(), inspector.save()]);

  const bookingNumber = booking.bookingNumber;
  const inspectorId = inspector._id;
  setImmediate(() => {
    (async () => {
      try {
        const bookingFresh = await Booking.findOne({ bookingNumber }).populate('customerId', 'name email phone');
        const inspectorFresh = await Inspector.findById(inspectorId).populate('userId', 'name email phone');
        if (!bookingFresh || !inspectorFresh) return;
        await mail.sendInspectorAssignedEmail(bookingFresh, inspectorFresh);
        await bookingWhatsapp.sendInspectorAssignedWhatsApp(bookingFresh);
      } catch (err) {
        console.error('[inspector accept] customer notify failed:', err.message || err);
      }
    })();
  });

  ok(res, booking);
};

exports.rejectAssignment = async (req, res) => {
  const inspector = await myInspector(req);
  const booking = await Booking.findOne({ bookingNumber: req.params.bookingNumber, inspectorId: inspector._id });
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  if (!['Awaiting Inspector', 'Assigned'].includes(String(booking.status || ''))) {
    throw new ApiError(409, 'Booking is not awaiting inspector acceptance', 'INVALID_TRANSITION');
  }
  const note = String(req.body?.reason || 'Inspector is busy').trim().slice(0, 300);
  booking.assignmentStatus = 'rejected';
  booking.assignmentRespondedAt = new Date();
  booking.assignmentRejectionNote = note || 'Inspector is busy';
  booking.inspectorId = null;
  booking.status = 'Pending';
  booking.history.push({
    event: 'Inspector rejected booking',
    meta: { inspectorId: inspector._id, reason: booking.assignmentRejectionNote },
  });
  inspector.status = 'Active';
  await Promise.all([booking.save(), inspector.save()]);
  ok(res, booking);
};
function imageHasValidGps(img) {
  const lat = Number(img?.latitude);
  const lng = Number(img?.longitude);
  return Number.isFinite(lat) && Number.isFinite(lng);
}

function normalizeChecklistOptions(options) {
  const list = Array.isArray(options) ? options : ['OK', 'NOK', 'Minor', 'Major'];
  const cleaned = list.map((x) => String(x || '').trim()).filter(Boolean);
  return cleaned.length ? cleaned : ['OK', 'NOK', 'Minor', 'Major'];
}

/** Mirrors mobile `getInspectorCaptureMode` / Excel rules so submit validation matches the inspector UI. */
function inspectorCaptureMode(item) {
  const ft = String(item.fieldType ?? '')
    .trim()
    .toLowerCase();
  if (/text|textarea|input|number|numeric|string|^note$|notes|manual|free|comment|alphabet/.test(ft)) {
    return 'text';
  }
  if (/dropdown|drop\s*-?down|select|choice|choices|radio|list|pick|combo|multi/.test(ft)) {
    return 'dropdown';
  }
  if (/photo|image|capture|picture|camera|file|attachment/.test(ft)) {
    return 'none';
  }
  if (item.enableCondition !== false && Array.isArray(item.conditionOptions) && item.conditionOptions.length > 0) {
    return 'dropdown';
  }
  return 'none';
}

function requiresConditionPick(item) {
  if (!item.required || item.enableCondition === false) return false;
  return inspectorCaptureMode(item) === 'dropdown';
}

function requiresTextNotes(item) {
  if (!item.required) return false;
  return inspectorCaptureMode(item) === 'text';
}

function effectiveMinPhotos(item) {
  if (!item.required) return 0;
  const m = item.minPhotos != null ? Number(item.minPhotos) : 0;
  return Math.max(0, Number.isFinite(m) ? m : 0);
}

function findSubmittedRow(fields, item) {
  const id = item.id != null ? String(item.id).trim() : '';
  const hit = fields.find((f) => String(f.fieldId ?? '').trim() === id);
  if (hit || !id) return hit;
  return fields.find((f) => String(f.fieldId ?? '').trim() === String(item.fieldId ?? '').trim());
}

exports.submit = async (req, res) => {
  const inspector = await myInspector(req);
  const booking = await Booking.findOne({ bookingNumber: req.params.bookingNumber, inspectorId: inspector._id });
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  const fields = Array.isArray(req.body.fields) ? req.body.fields : [];
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
    const submitted = findSubmittedRow(fields, item);
    if (item.enableCondition) {
      const allowed = normalizeChecklistOptions(item.conditionOptions);
      const picked = submitted?.condition != null ? String(submitted.condition).trim() : '';
      if (picked && !allowed.includes(picked)) {
        throw new ApiError(400, `${item.label} condition must be one of: ${allowed.join(', ')}`, 'VALIDATION_ERROR');
      }
    }
    if (requiresConditionPick(item)) {
      const picked = submitted?.condition != null ? String(submitted.condition).trim() : '';
      if (!picked) {
        throw new ApiError(400, `${item.label} requires selecting a condition`, 'VALIDATION_ERROR');
      }
    }
    if (requiresTextNotes(item)) {
      const notes = submitted?.notes != null ? String(submitted.notes).trim() : '';
      if (!notes) {
        throw new ApiError(400, `${item.label} requires a text entry`, 'VALIDATION_ERROR');
      }
    }
    const photos = submitted?.images?.length || 0;
    const minPhotos = effectiveMinPhotos(item);
    if (photos < minPhotos) {
      throw new ApiError(400, `${item.label} requires minimum ${minPhotos} photo(s)`, 'VALIDATION_ERROR');
    }
  }
  const sanitizedFields = fields.map((f) => ({
    fieldId: String(f.fieldId || ''),
    notes: f.notes != null ? String(f.notes) : '',
    condition: f.condition != null ? String(f.condition) : '',
    images: Array.isArray(f.images) ? f.images : []
  }));
  booking.submission = {
    submittedAt: new Date(),
    inspectorId: inspector._id,
    inspectorName: req.user.name,
    fields: sanitizedFields,
    overallNotes: req.body.overallNotes
  };
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
