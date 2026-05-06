const Booking = require('../models/Booking');
const env = require('../config/env');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { createOrder, verifyPaymentSignature } = require('../services/payment.service');

function isBookingReadyForPayment(booking) {
  const city = String(booking.city || '').trim();
  const slot = String(booking.slot || '').trim();
  const address = String(booking.address || '').trim();
  const vd = String(booking.vehicleDescription || '').toLowerCase();
  const hasDate = booking.scheduledDate && !Number.isNaN(new Date(booking.scheduledDate).getTime());
  const hasVehicle = vd && !/to be confirmed|quick booking/.test(vd);
  return Boolean(city && slot && address && hasDate && hasVehicle);
}

exports.createOrder = async (req, res) => {
  const bookingNumber = String(req.body.bookingNumber || '').trim();
  if (!bookingNumber) throw new ApiError(400, 'bookingNumber is required', 'VALIDATION_ERROR');
  const booking = await Booking.findOne({ bookingNumber, customerId: req.user.id });
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');
  if (!isBookingReadyForPayment(booking)) {
    throw new ApiError(409, 'Complete booking details first (vehicle, address, city, slot, schedule).', 'BOOKING_INCOMPLETE');
  }
  if (booking.paymentStatus === 'paid') {
    throw new ApiError(409, 'Payment already completed for this booking.', 'ALREADY_PAID');
  }
  if (!Number.isFinite(Number(booking.amount)) || Number(booking.amount) <= 0) {
    throw new ApiError(400, 'Booking amount is invalid. Please contact support.', 'INVALID_AMOUNT');
  }

  // Razorpay requires receipt to be unique per order attempt.
  const receipt = `${booking.bookingNumber}-${Date.now().toString().slice(-6)}`.slice(0, 40);
  const order = await createOrder({
    amount: Number(booking.amount),
    receipt,
    notes: { bookingNumber: booking.bookingNumber }
  });
  ok(res, {
    order,
    bookingNumber: booking.bookingNumber,
    /** Listed service / booking total (unchanged in testing mode). */
    amount: booking.amount,
    razorpayKeyId: env.razorpay.keyId || '',
    /** True when RAZORPAY_TESTING is on — Razorpay checkout charges ₹1 only. */
    razorpayTesting: Boolean(env.razorpay.testing)
  });
};

exports.verifyOrder = async (req, res) => {
  const booking = await Booking.findOne({ bookingNumber: req.body.bookingNumber, customerId: req.user.id });
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');

  const orderId = String(req.body.razorpay_order_id || '').trim();
  const paymentId = String(req.body.razorpay_payment_id || '').trim();
  const signature = String(req.body.razorpay_signature || '').trim();
  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Missing Razorpay payment fields', 'VALIDATION_ERROR');
  }
  const valid = verifyPaymentSignature({ orderId, paymentId, signature });
  if (!valid) throw new ApiError(400, 'Invalid payment signature', 'PAYMENT_VERIFICATION_FAILED');

  booking.paymentStatus = 'paid';
  booking.history.push({
    event: 'Payment received',
    meta: { by: req.user.id, orderId, paymentId }
  });
  await booking.save();
  ok(res, {
    bookingNumber: booking.bookingNumber,
    paymentStatus: booking.paymentStatus,
    orderId,
    paymentId
  });
};

exports.webhook = async (req, res) => ok(res, { received: true });
