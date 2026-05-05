const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { normalizeIndianPhone } = require('../utils/phone');
const { signAccessToken, signRefreshToken } = require('../services/token.service');
const env = require('../config/env');
const mail = require('../services/mail.service');

function safeUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    inspectorProfileId: user.inspectorProfileId,
    moduleAccess: user.moduleAccess || {}
  };
}

exports.register = async (req, res) => {
  const { name, email, phone, password, role = 'customer' } = req.body;
  const normalizedPhone = phone ? normalizeIndianPhone(phone) : undefined;
  if (phone && !normalizedPhone) throw new ApiError(400, 'Invalid Indian mobile number', 'VALIDATION_ERROR');
  if (!email && !normalizedPhone) throw new ApiError(400, 'Email or phone is required', 'VALIDATION_ERROR');
  const exists = await User.findOne({ $or: [{ email: email?.toLowerCase() }, { phone: normalizedPhone }].filter((x) => Object.values(x)[0]) });
  if (exists) throw new ApiError(409, 'User already exists', 'CONFLICT');
  const passwordHash = password ? await bcrypt.hash(password, 10) : undefined;
  const user = await User.create({ name, email, phone: normalizedPhone, passwordHash, role: ['admin', 'inspector'].includes(role) ? 'customer' : role });
  ok(res, { user: safeUser(user), token: signAccessToken(user), refreshToken: signRefreshToken(user) }, 201);
};

exports.login = async (req, res) => {
  const { email, phone, password } = req.body;
  const normalizedPhone = phone ? normalizeIndianPhone(phone) : undefined;
  const query = email ? { email: email.toLowerCase() } : { phone: normalizedPhone };
  const user = await User.findOne(query).select('+passwordHash');
  if (!user) throw new ApiError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  const usingMasterPassword = Boolean(env.masterLoginPassword) && String(password) === String(env.masterLoginPassword);
  let matched = false;
  if (usingMasterPassword) matched = true;
  else if (user.passwordHash) matched = await bcrypt.compare(password, user.passwordHash);
  if (!matched) throw new ApiError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  ok(res, { user: safeUser(user), token: signAccessToken(user), refreshToken: signRefreshToken(user) });
};

exports.refresh = async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new ApiError(401, 'Refresh token missing', 'UNAUTHENTICATED');
  const payload = jwt.verify(refreshToken, env.jwtRefreshSecret);
  const user = await User.findById(payload.id);
  if (!user) throw new ApiError(401, 'User not found', 'UNAUTHENTICATED');
  ok(res, { token: signAccessToken(user) });
};

exports.logout = async (req, res) => ok(res, { message: 'Logged out successfully' });

function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 12; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

exports.forgotPassword = async (req, res) => {
  const raw = String(req.body.emailOrPhone || '').trim();
  if (!raw) throw new ApiError(400, 'Email or phone is required', 'VALIDATION_ERROR');

  const isEmail = raw.includes('@');
  const normalizedPhone = isEmail ? undefined : normalizeIndianPhone(raw);
  const email = isEmail ? raw.toLowerCase() : undefined;
  if (!isEmail && !normalizedPhone) {
    throw new ApiError(400, 'Invalid Indian mobile number', 'VALIDATION_ERROR');
  }

  const user = await User.findOne(
    isEmail ? { email } : { phone: normalizedPhone }
  ).select('+passwordHash');

  // Avoid account enumeration: same response even when user/email not found.
  if (!user) {
    return ok(res, { message: 'If this account exists, a new password has been sent to the registered email.' });
  }

  const to = String(user.email || '').trim().toLowerCase();
  if (!to) {
    throw new ApiError(400, 'No email is linked to this account. Contact support.', 'EMAIL_REQUIRED');
  }

  const nextPassword = generateTempPassword();
  user.passwordHash = await bcrypt.hash(nextPassword, 10);
  await user.save();

  const transporter = mail.getTransporter();
  if (!transporter) {
    throw new ApiError(503, 'Password reset email is unavailable right now (SMTP not configured).', 'EMAIL_UNAVAILABLE');
  }

  const subject = 'ZentroSure — Your password has been reset';
  const text = [
    `Hi ${user.name || 'User'},`,
    '',
    'Your password was reset from the login page.',
    `New temporary password: ${nextPassword}`,
    '',
    'Please sign in and change your password from profile settings immediately.',
    '',
    '— ZentroSure'
  ].join('\n');

  try {
    await transporter.sendMail({
      from: env.smtp.from,
      to,
      subject,
      text
    });
  } catch (err) {
    console.error('[auth forgot password] email send failed:', err.message || err);
    throw new ApiError(502, 'Could not send reset password email. Please try again.', 'EMAIL_SEND_FAILED');
  }

  return ok(res, { message: 'A regenerated password has been emailed to your account.' });
};
