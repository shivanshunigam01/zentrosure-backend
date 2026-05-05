const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const OtpSession = require('../models/OtpSession');
const env = require('../config/env');

function generateOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }
async function sendOtpViaAiSensy(phone, code) {
  const {
    apiKey,
    verifyCampaignName,
    campaignName,
    verifyUserName,
    verifySource,
    baseUrl
  } = env.aisensy;
  const selectedCampaign = verifyCampaignName || campaignName;
  if (!apiKey || !selectedCampaign) {
    console.log(`[DEV OTP] ${phone}: ${code}`);
    return { provider: 'console', sent: true };
  }

  const payload = {
    apiKey,
    campaignName: selectedCampaign,
    destination: phone,
    userName: verifyUserName || 'Zentroverse',
    templateParams: ['User', code, '10'],
    source: verifySource || 'new-landing-page form',
    media: {},
    buttons: [],
    carouselCards: [],
    location: {},
    attributes: {},
    paramsFallbackValue: { FirstName: 'User' }
  };

  // Keep Authorization header for compatibility with existing AiSensy projects.
  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`AiSensy OTP send failed: ${response.status} ${text}`);
  }
  return response.json();
}
async function createOtpSession(phone, source = 'book-flow') {
  const code = generateOtp();
  const codeHash = await bcrypt.hash(code, 10);
  await OtpSession.deleteMany({ phone, source, verifiedAt: { $exists: false } });
  const session = await OtpSession.create({ phone, codeHash, source, expiresAt: new Date(Date.now() + 10 * 60 * 1000) });
  await sendOtpViaAiSensy(phone, code);
  return session;
}
async function verifyOtp(phone, code, source) {
  const session = await OtpSession.findOne({ phone, source, verifiedAt: { $exists: false } }).sort({ createdAt: -1 });
  if (!session) return null;
  if (session.expiresAt < new Date() || session.attempts >= 5) return null;
  session.attempts += 1;
  const ok = await bcrypt.compare(code, session.codeHash);
  if (!ok) { await session.save(); return null; }
  session.verifiedAt = new Date();
  session.sessionToken = nanoid(32);
  await session.save();
  return session;
}

/** Store OTP hash only (WhatsApp already sent from the SPA). Caller must validate length. */
async function storePendingOtpFromPlain(phone, plainCode, source = 'book-flow') {
  const code = String(plainCode || '').replace(/\D/g, '');
  const codeHash = await bcrypt.hash(code, 10);
  await OtpSession.deleteMany({ phone, source, verifiedAt: { $exists: false } });
  await OtpSession.create({
    phone,
    codeHash,
    source,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    attempts: 0
  });
}

module.exports = { createOtpSession, verifyOtp, storePendingOtpFromPlain };
