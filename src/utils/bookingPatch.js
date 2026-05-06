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
    if (
      !Object.prototype.hasOwnProperty.call(body, 'dealerLatitude') &&
      !Object.prototype.hasOwnProperty.call(body, 'dealerLongitude')
    ) {
      booking.dealerLatitude = undefined;
      booking.dealerLongitude = undefined;
    }
  }

  if (Object.prototype.hasOwnProperty.call(body, 'dealerLatitude') || Object.prototype.hasOwnProperty.call(body, 'dealerLongitude')) {
    const dLat = body.dealerLatitude;
    const dLng = body.dealerLongitude;
    if (dLat == null && dLng == null) {
      booking.dealerLatitude = undefined;
      booking.dealerLongitude = undefined;
    } else if (dLat != null && dLng != null && Number.isFinite(Number(dLat)) && Number.isFinite(Number(dLng))) {
      booking.dealerLatitude = Number(dLat);
      booking.dealerLongitude = Number(dLng);
    } else {
      throw new ApiError(400, 'dealerLatitude and dealerLongitude must both be valid numbers when provided', 'VALIDATION_ERROR');
    }
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

  const trimOrUnset = (v) => {
    const s = String(v ?? '').trim();
    return s || undefined;
  };
  if (body.chassisNumber !== undefined) {
    booking.chassisNumber = trimOrUnset(body.chassisNumber);
  }
  if (body.engineNumber !== undefined) {
    booking.engineNumber = trimOrUnset(body.engineNumber);
  }
  if (body.vehicleModel !== undefined) {
    booking.vehicleModel = trimOrUnset(body.vehicleModel);
  }
  if (body.vehicleSubmodel !== undefined) {
    booking.vehicleSubmodel = trimOrUnset(body.vehicleSubmodel);
  }
  if (body.invoiceNumber !== undefined) {
    booking.invoiceNumber = trimOrUnset(body.invoiceNumber);
  }
  if (body.dealerContactPhone !== undefined) {
    booking.dealerContactPhone = trimOrUnset(body.dealerContactPhone);
  }
  if (body.invoiceDate !== undefined) {
    const raw = body.invoiceDate;
    if (raw === null || raw === '') {
      booking.invoiceDate = undefined;
    } else {
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) throw new ApiError(400, 'Invalid invoice date', 'VALIDATION_ERROR');
      booking.invoiceDate = d;
    }
  }
}

module.exports = { applyBookingDetailPatch };
