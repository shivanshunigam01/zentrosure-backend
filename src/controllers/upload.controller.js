const Booking = require('../models/Booking');
const Inspector = require('../models/Inspector');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { publicFileUrl } = require('../services/storage.service');
const { metersBetween } = require('../utils/geo');

const DEFAULT_SITE_MATCH_RADIUS_M = 500;

exports.uploadPhotos = async (req, res) => {
  const inspector = await Inspector.findOne({ userId: req.user.id });
  if (!inspector) throw new ApiError(403, 'Inspector profile not found', 'FORBIDDEN');
  const booking = await Booking.findOne({ bookingNumber: req.params.bookingNumber, inspectorId: inspector._id });
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');

  const files = req.files || [];
  if (!files.length) {
    throw new ApiError(
      400,
      'No image files received. Send multipart field "photos" (one or more files) or a single "photo".',
      'NO_FILES'
    );
  }

  const fieldId = req.body.fieldId != null ? String(req.body.fieldId).trim() : '';
  if (!fieldId) {
    throw new ApiError(400, 'fieldId is required (checklist field id for this upload).', 'VALIDATION_ERROR');
  }

  let metadata = [];
  try {
    metadata = JSON.parse(req.body.metadata || '[]');
  } catch {
    metadata = [];
  }
  if (!Array.isArray(metadata)) metadata = [];

  const radiusM = Math.max(
    50,
    Math.min(5000, Number(process.env.INSPECTION_SITE_MATCH_RADIUS_M) || DEFAULT_SITE_MATCH_RADIUS_M)
  );

  const useCloudinary = Array.isArray(req.cloudinaryUrls) && req.cloudinaryUrls.length === files.length;

  const uploaded = files.map((file, idx) => {
    const storageUrl = useCloudinary
      ? req.cloudinaryUrls[idx]
      : publicFileUrl(req, file.filename);
    if (!storageUrl || !String(storageUrl).trim()) {
      throw new ApiError(500, 'Could not determine storage URL after upload', 'UPLOAD_ERROR');
    }
    return {
      fieldId,
      storageUrl,
      capturedAt: metadata[idx]?.capturedAt || new Date(),
      latitude: metadata[idx]?.latitude,
      longitude: metadata[idx]?.longitude,
      address: metadata[idx]?.address,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size
    };
  });

  for (const u of uploaded) {
    const lat = Number(u.latitude);
    const lng = Number(u.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new ApiError(
        400,
        'GPS coordinates are required for each photo. Enable location permission in your browser and try again.',
        'LOCATION_REQUIRED'
      );
    }
  }

  const siteLat = booking.addressLatitude;
  const siteLng = booking.addressLongitude;
  if (siteLat != null && siteLng != null && Number.isFinite(siteLat) && Number.isFinite(siteLng)) {
    let minD = Infinity;
    for (const u of uploaded) {
      const d = metersBetween(siteLat, siteLng, Number(u.latitude), Number(u.longitude));
      if (d < minD) minD = d;
    }
    if (minD <= radiusM && !booking.visitVerifiedAt) {
      booking.visitVerifiedAt = new Date();
      booking.history.push({
        event: 'Inspector GPS matched inspection site',
        meta: { distanceM: Math.round(minD), radiusM }
      });
    }
  }

  booking.uploadedImages.push(...uploaded);
  await booking.save();
  ok(res, uploaded, 201);
};
