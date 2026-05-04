const crypto = require('crypto');
const Razorpay = require('razorpay');
const env = require('../config/env');

function getRazorpay() {
  if (!env.razorpay.keyId || !env.razorpay.keySecret) return null;
  return new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
}
async function createOrder({ amount, receipt }) {
  const razorpay = getRazorpay();
  if (!razorpay) return { id: `dev_order_${Date.now()}`, amount, currency: 'INR', receipt, dev: true };
  return razorpay.orders.create({ amount: Math.round(amount * 100), currency: 'INR', receipt });
}
function verifyWebhookSignature(rawBody, signature) {
  if (!env.razorpay.webhookSecret) return true;
  const expected = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
  return expected === signature;
}

function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!env.razorpay.keySecret) return false;
  const payload = `${String(orderId || '')}|${String(paymentId || '')}`;
  const expected = crypto.createHmac('sha256', env.razorpay.keySecret).update(payload).digest('hex');
  return String(signature || '') === expected;
}

module.exports = { createOrder, verifyWebhookSignature, verifyPaymentSignature };
