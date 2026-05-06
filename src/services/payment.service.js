const crypto = require('crypto');
const Razorpay = require('razorpay');
const env = require('../config/env');

function getRazorpay() {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) return null;
  return new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
}
function orderAmountRupeesForGateway(requestedRupees) {
  if (env.razorpay.testing) return 1;
  const n = Number(requestedRupees);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function createOrder({ amount, receipt, notes }) {
  const rupees = orderAmountRupeesForGateway(amount);
  if (!rupees) {
    throw new Error('Invalid order amount');
  }
  const amountPaise = Math.round(rupees * 100);
  const razorpay = getRazorpay();
  if (!razorpay) {
    return {
      id: `dev_order_${Date.now()}`,
      amount: amountPaise,
      currency: 'INR',
      receipt,
      dev: true
    };
  }
  return razorpay.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt,
    notes:
      notes && typeof notes === 'object'
        ? { ...notes, ...(env.razorpay.testing ? { zs_testing: '1' } : {}) }
        : env.razorpay.testing
          ? { zs_testing: '1' }
          : undefined
  });
}
function verifyWebhookSignature(rawBody, signature) {
  if (!env.razorpay.webhookSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
  const sig = String(signature).trim().toLowerCase();
  const exp = expected.toLowerCase();
  if (exp.length !== sig.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(exp, 'hex'), Buffer.from(sig, 'hex'));
  } catch {
    return false;
  }
}

function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!env.razorpay.keySecret) return false;
  const payload = `${String(orderId || '')}|${String(paymentId || '')}`;
  const expected = crypto.createHmac('sha256', env.razorpay.keySecret).update(payload).digest('hex');
  const sig = String(signature || '').trim().toLowerCase();
  const exp = expected.toLowerCase();
  if (exp.length !== sig.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(exp, 'hex'), Buffer.from(sig, 'hex'));
  } catch {
    return false;
  }
}

/**
 * Confirms a payment: HMAC (Checkout callback) first, then Razorpay API fetch if needed
 * (mobile browsers / extensions sometimes alter callback signatures).
 */
async function verifyRazorpayPayment({ orderId, paymentId, signature }) {
  if (verifyPaymentSignature({ orderId, paymentId, signature })) return true;
  const razorpay = getRazorpay();
  if (!razorpay) return false;
  try {
    const pay = await razorpay.payments.fetch(paymentId);
    const oid = String(pay.order_id || '');
    const st = String(pay.status || '');
    return oid === String(orderId || '') && (st === 'captured' || st === 'authorized');
  } catch (e) {
    console.error('[razorpay] payments.fetch verification failed:', e.message || e);
    return false;
  }
}

async function fetchOrderBookingNumber(orderId) {
  const razorpay = getRazorpay();
  if (!razorpay || !orderId) return null;
  try {
    const order = await razorpay.orders.fetch(orderId);
    const bn = order.notes && order.notes.bookingNumber ? String(order.notes.bookingNumber).trim() : '';
    return bn || null;
  } catch (e) {
    console.error('[razorpay] orders.fetch failed:', e.message || e);
    return null;
  }
}

module.exports = {
  createOrder,
  verifyWebhookSignature,
  verifyPaymentSignature,
  verifyRazorpayPayment,
  fetchOrderBookingNumber
};
