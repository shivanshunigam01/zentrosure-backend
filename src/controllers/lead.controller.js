const ContactLead = require('../models/ContactLead');
const OtpSession = require('../models/OtpSession');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { normalizeIndianPhone } = require('../utils/phone');

async function verifySession(phone, sessionToken) {
  if (!sessionToken) return false;
  const session = await OtpSession.findOne({ phone, sessionToken, verifiedAt: { $exists: true } });
  return Boolean(session);
}
exports.contact = async (req, res) => {
  const phone = normalizeIndianPhone(req.body.phone);
  if (!phone) throw new ApiError(400, 'Invalid phone number', 'VALIDATION_ERROR');
  const phoneVerified = await verifySession(phone, req.body.otpSessionToken);
  if (!phoneVerified) throw new ApiError(400, 'Phone OTP verification required', 'PHONE_NOT_VERIFIED');
  const lead = await ContactLead.create({ ...req.body, phone, phoneVerified, source: 'contact-form' });
  ok(res, lead, 201);
};
exports.quickCallback = async (req, res) => {
  const phone = normalizeIndianPhone(req.body.phone);
  if (!phone) throw new ApiError(400, 'Invalid phone number', 'VALIDATION_ERROR');
  const lead = await ContactLead.create({ ...req.body, phone, source: 'quick-callback' });
  ok(res, lead, 201);
};
