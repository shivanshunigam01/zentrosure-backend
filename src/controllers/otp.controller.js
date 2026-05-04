const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { normalizeIndianPhone } = require('../utils/phone');
const { createOtpSession, verifyOtp, storePendingOtpFromPlain } = require('../services/otp.service');

exports.sendOtp = async (req, res) => {
  const phone = normalizeIndianPhone(req.body.phone);
  if (!phone) throw new ApiError(400, 'Invalid Indian mobile number', 'VALIDATION_ERROR');
  await createOtpSession(phone, req.body.source || 'book-flow');
  ok(res, { phone, message: 'OTP sent successfully' });
};

/** After the browser sends WhatsApp (AiSensy), persist the same OTP so `/auth/otp/verify` can issue `sessionToken`. */
exports.hydrateClientOtp = async (req, res) => {
  const phone = normalizeIndianPhone(req.body.phone);
  if (!phone) throw new ApiError(400, 'Invalid Indian mobile number', 'VALIDATION_ERROR');
  const code = String(req.body.code || '').replace(/\D/g, '');
  if (!/^\d{6}$/.test(code)) throw new ApiError(400, 'OTP must be 6 digits', 'VALIDATION_ERROR');
  await storePendingOtpFromPlain(phone, code, req.body.source || 'book-flow');
  ok(res, { phone, message: 'OTP session ready' });
};
exports.verifyOtp = async (req, res) => {
  const phone = normalizeIndianPhone(req.body.phone);
  if (!phone) throw new ApiError(400, 'Invalid Indian mobile number', 'VALIDATION_ERROR');
  const session = await verifyOtp(phone, String(req.body.code || ''), req.body.source || 'book-flow');
  if (!session) throw new ApiError(400, 'Invalid or expired OTP', 'INVALID_OTP');
  ok(res, { phone, verified: true, sessionToken: session.sessionToken });
};
