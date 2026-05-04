const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const OtpSession = require('../models/OtpSession');
const env = require('../config/env');

function generateOtp() { return String(Math.floor(100000 + Math.random() * 900000)); }
async function sendOtpViaAiSensy(phone, code) {
  if (!env.aisensy.apiKey || !env.aisensy.campaignName) {
    console.log(`[DEV OTP] ${phone}: ${code}`);
    return { provider: 'console', sent: true };
  }
  // Node 18+ supports fetch globally. Payload can be adjusted as per AiSensy campaign variables.
  const response = await fetch(env.aisensy.baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.aisensy.apiKey}` },
    body: JSON.stringify({ campaignName: env.aisensy.campaignName, destination: phone, templateParams: [code] })
  });
  if (!response.ok) throw new Error('AiSensy OTP send failed');
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
