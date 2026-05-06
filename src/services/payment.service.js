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
