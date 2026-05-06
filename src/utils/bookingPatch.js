const { normalizeIndianPhone } = require('./phone');
const ApiError = require('./apiError');

/** Apply partial detail updates from PATCH body. Only fields present on `body` are applied. */
function applyBookingDetailPatch(booking, body) {
  if (body.customerName !== undefined) {
    const v = String(body.customerName).trim();
    if (!v) throw new ApiError(400, 'Customer name cannot be empty', 'VALIDATION_ERROR');
    booking.customerName = v;
  }
  if (body.phone !== undefined && body.phone !== null && String(body.phone).trim()) {
    const p = normalizeIndianPhone(body.phone);
    if (!p) throw new ApiError(400, 'Invalid Indian mobile number', 'VALIDATION_ERROR');
    booking.phone = p;
  }
  if (body.vehicleDescription !== undefined) {
    const v = String(body.vehicleDescription).trim();
    if (!v) throw new ApiError(400, 'Vehicle description cannot be empty', 'VALIDATION_ERROR');
    booking.vehicleDescription = v;
  }
  if (body.city !== undefined) {
    const v = String(body.city).trim();
    if (!v) throw new ApiError(400, 'City cannot be empty', 'VALIDATION_ERROR');
    booking.city = v;
  }
  if (body.scheduledDate !== undefined && body.scheduledDate !== null && String(body.scheduledDate).trim() !== '') {
    const d = new Date(body.scheduledDate);
    if (Number.isNaN(d.getTime())) throw new ApiError(400, 'Invalid scheduled date', 'VALIDATION_ERROR');
    booking.scheduledDate = d;
  }
  if (body.slot !== undefined) {
    booking.slot = String(body.slot ?? '').trim();
  }

  if (body.address !== undefined) {
    booking.address = String(body.address ?? '').trim();
    if (!Object.prototype.hasOwnProperty.call(body, 'addressLatitude') && !Object.prototype.hasOwnProperty.call(body, 'addressLongitude')) {
      booking.addressLatitude = undefined;
      booking.addressLongitude = undefined;
      booking.visitVerifiedAt = undefined;
    }
  }

  if (body.dealerName !== undefined) {
    booking.dealerName = String(body.dealerName ?? '').trim();
  }
  if (body.dealerLocation !== undefined) {
    booking.dealerLocation = String(body.dealerLocation ?? '').trim();
  }
  if (body.dealerAddress !== undefined) {
    booking.dealerAddress = String(body.dealerAddress ?? '').trim();
  }

  if (Object.prototype.hasOwnProperty.call(body, 'addressLatitude') || Object.prototype.hasOwnProperty.call(body, 'addressLongitude')) {
    const lat = body.addressLatitude;
    const lng = body.addressLongitude;
    if (lat == null && lng == null) {
      booking.addressLatitude = undefined;
      booking.addressLongitude = undefined;
      booking.visitVerifiedAt = undefined;
    } else if (lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      booking.addressLatitude = Number(lat);
      booking.addressLongitude = Number(lng);
      booking.visitVerifiedAt = undefined;
    } else {
      throw new ApiError(400, 'addressLatitude and addressLongitude must both be valid numbers when provided', 'VALIDATION_ERROR');
    }
  }
}

module.exports = { applyBookingDetailPatch };
