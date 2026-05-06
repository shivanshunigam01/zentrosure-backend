const Booking = require('../models/Booking');
const env = require('../config/env');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const {
  createOrder,
  verifyRazorpayPayment,
  verifyWebhookSignature,
  fetchOrderBookingNumber
} = require('../services/payment.service');

function isBookingReadyForPayment(booking) {
  const city = String(booking.city || '').trim();
  const slot = String(booking.slot || '').trim();
  const address = String(booking.address || '').trim();
  const vd = String(booking.vehicleDescription || '').toLowerCase();
  const hasDate = booking.scheduledDate && !Number.isNaN(new Date(booking.scheduledDate).getTime());
  const hasVehicle = vd && !/to be confirmed|quick booking|vehicle details to be/i.test(vd);
  // Allow checkout once schedule + vehicle + city exist; slot or address (or both) is enough — avoids blocking payment on partial drafts.
  return Boolean(city && hasDate && hasVehicle && (slot || address));
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
  const bookingAmount = Number(booking.amount);
  if (!Number.isFinite(bookingAmount) || bookingAmount < 0) {
    throw new ApiError(400, 'Booking amount is invalid. Please contact support.', 'INVALID_AMOUNT');
  }

  // Free / zero-priced services: no Razorpay checkout required.
  if (bookingAmount === 0) {
    booking.paymentStatus = 'paid';
    booking.history.push({
      event: 'Payment bypassed (zero amount service)',
      meta: { by: req.user.id, bookingNumber: booking.bookingNumber }
    });
    await booking.save();
    ok(res, {
      order: null,
      bookingNumber: booking.bookingNumber,
      amount: 0,
      razorpayKeyId: env.razorpay.keyId || '',
      razorpayTesting: Boolean(env.razorpay.testing),
      requiresPayment: false,
      paymentStatus: booking.paymentStatus
    });
    return;
  }

  // Razorpay requires receipt to be unique per order attempt.
  const receipt = `${booking.bookingNumber}-${Date.now().toString().slice(-6)}`.slice(0, 40);
  const order = await createOrder({
    amount: Number(booking.amount),
    receipt,
    notes: { bookingNumber: booking.bookingNumber }
  });
  if (order && order.id) {
    booking.razorpayLastOrderId = String(order.id);
    await booking.save();
  }
  ok(res, {
    order,
    bookingNumber: booking.bookingNumber,
    /** Listed service / booking total (unchanged in testing mode). */
    amount: booking.amount,
    razorpayKeyId: env.razorpay.keyId || '',
    /** True when RAZORPAY_TESTING is on — Razorpay checkout charges ₹1 only. */
    razorpayTesting: Boolean(env.razorpay.testing),
    requiresPayment: true
  });
};

exports.verifyOrder = async (req, res) => {
  const booking = await Booking.findOne({ bookingNumber: req.body.bookingNumber, customerId: req.user.id });
  if (!booking) throw new ApiError(404, 'Booking not found', 'NOT_FOUND');

  if (booking.paymentStatus === 'paid') {
    ok(res, {
      bookingNumber: booking.bookingNumber,
      paymentStatus: booking.paymentStatus,
      orderId: String(req.body.razorpay_order_id || ''),
      paymentId: String(req.body.razorpay_payment_id || ''),
      alreadyPaid: true
    });
    return;
  }

  const orderId = String(req.body.razorpay_order_id || '').trim();
  const paymentId = String(req.body.razorpay_payment_id || '').trim();
  const signature = String(req.body.razorpay_signature || '').trim();
  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Missing Razorpay payment fields', 'VALIDATION_ERROR');
  }
  if (booking.razorpayLastOrderId && booking.razorpayLastOrderId !== orderId) {
    throw new ApiError(400, 'Payment does not match the latest checkout for this booking. Start payment again.', 'ORDER_MISMATCH');
  }

  const valid = await verifyRazorpayPayment({ orderId, paymentId, signature });
  if (!valid) throw new ApiError(400, 'Could not verify payment with Razorpay. If money was debited, wait a minute and refresh — or contact support.', 'PAYMENT_VERIFICATION_FAILED');

  booking.paymentStatus = 'paid';
  booking.history.push({
    event: 'Payment received',
    meta: { by: req.user.id, orderId, paymentId, source: 'checkout_verify' }
  });
  await booking.save();
  ok(res, {
    bookingNumber: booking.bookingNumber,
    paymentStatus: booking.paymentStatus,
    orderId,
    paymentId
  });
};

/**
 * Razorpay webhooks — configure URL: {API}/v1/payments/razorpay-webhook
 * Events: payment.captured (and payment.authorized as fallback).
 * Requires raw body (see app.js). Set RAZORPAY_WEBHOOK_SECRET from dashboard.
 */
exports.webhook = async (req, res) => {
  const signature = req.get('x-razorpay-signature') || req.get('X-Razorpay-Signature') || '';
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body || '');

  if (!env.razorpay.webhookSecret) {
    console.warn('[razorpay-webhook] RAZORPAY_WEBHOOK_SECRET not set — webhook ignored. Set it in Razorpay Dashboard → Webhooks.');
    return res.status(200).json({ received: true, ignored: true });
  }
  if (!verifyWebhookSignature(raw, signature)) {
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const event = String(payload.event || '');
  if (!['payment.captured', 'payment.authorized'].includes(event)) {
    return res.status(200).json({ received: true });
  }

  const entity = payload.payload?.payment?.entity;
  const orderId = entity?.order_id ? String(entity.order_id) : '';
  const paymentId = entity?.id ? String(entity.id) : '';
  if (!orderId || !paymentId) {
    return res.status(200).json({ received: true });
  }

  let booking = await Booking.findOne({ razorpayLastOrderId: orderId });
  if (!booking) {
    const bn = await fetchOrderBookingNumber(orderId);
    if (bn) booking = await Booking.findOne({ bookingNumber: bn });
  }
  if (!booking) {
    console.warn('[razorpay-webhook] Could not resolve booking for order', orderId);
    return res.status(200).json({ received: true, unresolved: true });
  }
  if (booking.paymentStatus === 'paid') {
    return res.status(200).json({ received: true, alreadyPaid: true });
  }

  booking.paymentStatus = 'paid';
  booking.history.push({
    event: 'Payment received',
    meta: { orderId, paymentId, source: 'razorpay_webhook', event }
  });
  await booking.save();
  return res.status(200).json({ received: true, bookingNumber });
};
