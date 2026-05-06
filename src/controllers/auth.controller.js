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
  const { email, phone, customerId, password } = req.body;
  const identifierRaw = String(customerId || phone || '').trim();
  if (!email && !identifierRaw) {
    throw new ApiError(400, 'Email, phone, or customer ID is required', 'VALIDATION_ERROR');
  }

  let user;
  if (email) {
    user = await User.findOne({ email: String(email).toLowerCase() }).select('+passwordHash');
  } else if (/^[a-fA-F0-9]{24}$/.test(identifierRaw)) {
    user = await User.findById(identifierRaw).select('+passwordHash');
    if (!user) {
      user = await User.findOne({ userCode: identifierRaw.toLowerCase() }).select('+passwordHash');
    }
  } else {
    const normalizedPhone = normalizeIndianPhone(identifierRaw);
    if (normalizedPhone) {
      user = await User.findOne({ phone: normalizedPhone }).select('+passwordHash');
    }
    if (!user) {
      user = await User.findOne({ userCode: identifierRaw.toLowerCase() }).select('+passwordHash');
    }
  }

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

exports.changePassword = async (req, res) => {
  const currentPassword = String(req.body.currentPassword || '');
  const newPassword = String(req.body.newPassword || '');

  if (!currentPassword) throw new ApiError(400, 'Current password is required', 'VALIDATION_ERROR');
  if (!newPassword) throw new ApiError(400, 'New password is required', 'VALIDATION_ERROR');
  if (newPassword.length < 8) {
    throw new ApiError(400, 'New password must be at least 8 characters', 'VALIDATION_ERROR');
  }
  if (newPassword.length > 72) {
    throw new ApiError(400, 'New password must be 72 characters or less', 'VALIDATION_ERROR');
  }
  if (newPassword === currentPassword) {
    throw new ApiError(400, 'New password must be different from current password', 'VALIDATION_ERROR');
  }

  const user = await User.findById(req.user.id).select('+passwordHash');
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');
  if (!user.passwordHash) {
    throw new ApiError(400, 'Password login is not configured for this account', 'PASSWORD_NOT_SET');
  }

  const matched = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!matched) throw new ApiError(401, 'Current password is incorrect', 'INVALID_CREDENTIALS');

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();

  ok(res, { message: 'Password changed successfully.' });
};

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
    const loginRaw = env.loginWebUrl || 'https://zentrosure.com/login';
    const loginHref = /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(String(loginRaw)) ? 'https://zentrosure.com/login' : loginRaw;

    const safeName = String(user.name || 'User').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safePass = String(nextPassword || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const safeLogin = String(loginHref || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    const html = mail.wrapBrandedEmailHtml({
      preheader: 'Your password has been reset — sign in to continue.',
      innerHtml: `
        <p style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:#102237;line-height:1.25;">Password reset</p>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">Hi ${safeName}, here is your new temporary password.</p>
        <div style="margin:0 0 18px 0;background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:16px 18px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:700;">Temporary password</div>
          <div style="margin-top:6px;font-size:18px;font-weight:900;color:#102237;">${safePass}</div>
        </div>
        <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 18px auto;">
          <tr>
            <td align="center" style="border-radius:12px;background-color:#b91c1c;">
              <a href="${safeLogin}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;">Sign in</a>
            </td>
          </tr>
        </table>
        <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
          After signing in, please change your password from Profile settings.
        </p>
      `
    });

    await transporter.sendMail({
      from: env.smtp.from,
      to,
      subject,
      text,
      html
    });
  } catch (err) {
    console.error('[auth forgot password] email send failed:', err.message || err);
    throw new ApiError(502, 'Could not send reset password email. Please try again.', 'EMAIL_SEND_FAILED');
  }

  return ok(res, { message: 'A regenerated password has been emailed to your account.' });
};
