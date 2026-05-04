const mongoose = require('mongoose');
const otpSessionSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  /** bcrypt hash of OTP (all flows). */
  codeHash: { type: String, required: true },
  /** Plain OTP for booking-checkout only; TTL same as document. Prefer verifying via codeHash in production. */
  otpPlain: { type: String, select: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  attempts: { type: Number, default: 0 },
  source: { type: String, default: 'book-flow' },
  verifiedAt: Date,
  sessionToken: String,
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  /** Pending booking fields until OTP is confirmed (source booking-checkout). */
  bookingDraft: mongoose.Schema.Types.Mixed
}, { timestamps: true });
module.exports = mongoose.model('OtpSession', otpSessionSchema);
