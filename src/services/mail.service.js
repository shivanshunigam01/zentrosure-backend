const nodemailer = require('nodemailer');
const env = require('../config/env');

/** Safe for HTML text nodes and attributes (basic entity escape). */
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Absolute URL to logo for HTML emails (matches hub `/zentrosure-logo.png`). */
function brandLogoUrl() {
  const preferred = loginUrlForCustomerEmail(env.loginWebUrl);
  try {
    const u = new URL(preferred);
    return `${u.origin}/zentrosure-logo.png`;
  } catch {
    return 'https://zentrosure.com/zentrosure-logo.png';
  }
}

/**
 * Branded shell for transactional HTML emails (table layout, inline styles).
 */
function wrapBrandedEmailHtml({ preheader, innerHtml }) {
  const pre = escapeHtml(preheader);
  const logo = escapeHtml(brandLogoUrl());
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ZentroSure</title>
</head>
<body style="margin:0;padding:0;background-color:#eef1f5;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;color:#1e293b;">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#eef1f5;">${pre}\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#eef1f5;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;border-collapse:collapse;">
          <tr>
            <td style="background-color:#102237;border-radius:12px 12px 0 0;padding:20px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td valign="middle" style="padding:0;">
                    <img src="${logo}" alt="ZentroSure" width="140" height="auto" style="display:block;max-width:140px;height:auto;border:0;" />
                  </td>
                  <td align="right" valign="middle" style="font-size:13px;color:#94a3b8;">
                    Vehicle inspection
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#ffffff;padding:0 1px 1px 1px;border-radius:0 0 12px 12px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-radius:0 0 11px 11px;overflow:hidden;">
                <tr>
                  <td style="padding:28px 24px 32px 24px;">
                    ${innerHtml}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 16px;font-size:12px;line-height:1.5;color:#64748b;">
              ZentroSure · Trusted vehicle inspection in India<br />
              <span style="color:#94a3b8;">This is an automated message. Please do not reply to this email.</span>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function buildInspectionCompletedHtml({
  customerName,
  bookingNumber,
  submittedAtDisplay,
  inspectorName,
  inspectorCode,
  inspectorPhoneDisplay,
  shareUrl,
  images
}) {
  const name = escapeHtml(customerName);
  const bid = escapeHtml(bookingNumber);
  const when = escapeHtml(submittedAtDisplay);
  const inName = escapeHtml(inspectorName);
  const inCode = escapeHtml(inspectorCode);
  const inPhone = escapeHtml(inspectorPhoneDisplay);
  const url = escapeHtml(shareUrl);

  const photoBlocks = (images && images.length
    ? images
        .map((im, i) => {
          const href = escapeHtml(im.storageUrl);
          const n = i + 1;
          return `<tr><td style="padding:8px 0;">
            <a href="${href}" style="color:#102237;font-size:14px;text-decoration:underline;">Photo ${n}</a>
            <div style="margin-top:8px;">
              <a href="${href}" style="display:block;border-radius:8px;overflow:hidden;border:1px solid #e2e8f0;">
                <img src="${href}" alt="Inspection photo ${n}" width="552" style="display:block;max-width:100%;height:auto;border:0;" />
              </a>
            </div>
          </td></tr>`;
        })
        .join('')
    : `<tr><td style="padding:8px 0;color:#64748b;font-size:14px;">No photos were attached to this email. Open the link above to view the full report.</td></tr>`);

  const innerHtml = `
    <p style="margin:0 0 8px 0;font-size:18px;font-weight:700;color:#102237;">Inspection completed</p>
    <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#334155;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.55;color:#334155;">Your vehicle inspection has been completed. You can view the full details and photos using the button below.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;background-color:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:600;">Booking</p>
        <p style="margin:0;font-size:16px;font-weight:600;color:#102237;">${bid}</p>
        <p style="margin:8px 0 0 0;font-size:14px;color:#475569;">${when}</p>
      </td></tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:28px;background-color:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 10px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:600;">Inspector</p>
        <p style="margin:0;font-size:15px;color:#334155;"><strong style="color:#102237;">${inName}</strong></p>
        <p style="margin:6px 0 0 0;font-size:14px;color:#475569;">Code: ${inCode}</p>
        <p style="margin:4px 0 0 0;font-size:14px;color:#475569;">Phone: ${inPhone}</p>
      </td></tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 28px auto;">
      <tr>
        <td align="center" style="border-radius:10px;background-color:#b91c1c;">
          <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">View full inspection</a>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 16px 0;font-size:13px;line-height:1.5;color:#64748b;word-break:break-all;">Or copy this link:<br /><a href="${url}" style="color:#102237;">${url}</a></p>

    <p style="margin:0 0 12px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:600;">Uploaded photos</p>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${photoBlocks}</table>
  `;

  return wrapBrandedEmailHtml({
    preheader: `Inspection completed — Booking ${bookingNumber}. View your report online.`,
    innerHtml
  });
}

function buildReportPublishedHtml({
  customerName,
  bookingNumber,
  reportId,
  publishedAtDisplay,
  score,
  verdict,
  highlights,
  adminNotes,
  shareUrl
}) {
  const name = escapeHtml(customerName);
  const bid = escapeHtml(bookingNumber);
  const rid = escapeHtml(reportId);
  const when = escapeHtml(publishedAtDisplay);
  const scoreStr = escapeHtml(String(score ?? '—'));
  const verdictStr = escapeHtml(verdict || '—');
  const url = escapeHtml(shareUrl);
  const hl = Array.isArray(highlights) ? highlights.filter(Boolean) : [];
  const highlightsHtml = hl.length
    ? `<ul style="margin:8px 0 0 18px;padding:0;color:#334155;font-size:14px;line-height:1.5;">${hl.map((h) => `<li>${escapeHtml(h)}</li>`).join('')}</ul>`
    : '<p style="margin:8px 0 0 0;font-size:14px;color:#64748b;">—</p>';
  const notesBlock =
    adminNotes && String(adminNotes).trim()
      ? `<p style="margin:12px 0 0 0;font-size:14px;line-height:1.55;color:#475569;white-space:pre-wrap;">${escapeHtml(String(adminNotes).trim())}</p>`
      : '';

  const innerHtml = `
    <p style="margin:0 0 8px 0;font-size:18px;font-weight:700;color:#102237;">Your report is ready</p>
    <p style="margin:0 0 20px 0;font-size:15px;line-height:1.55;color:#334155;">Hi ${name},</p>
    <p style="margin:0 0 24px 0;font-size:15px;line-height:1.55;color:#334155;">Your ZentroSure inspection report has been published. Below are your results and a link to view the full inspection online.</p>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:600;">Booking</p>
        <p style="margin:0;font-size:16px;font-weight:600;color:#102237;">${bid}</p>
        <p style="margin:6px 0 0 0;font-size:13px;color:#64748b;">Report ID: ${rid}</p>
        <p style="margin:4px 0 0 0;font-size:14px;color:#475569;">Published: ${when}</p>
      </td></tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 8px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#166534;font-weight:600;">Final result</p>
        <p style="margin:0;font-size:28px;font-weight:800;color:#102237;line-height:1.2;">${scoreStr}<span style="font-size:16px;font-weight:600;color:#64748b;"> / 100</span></p>
        <p style="margin:10px 0 0 0;font-size:17px;font-weight:700;color:#166534;">${verdictStr}</p>
      </td></tr>
    </table>

    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:600;">Highlights</p>
        ${highlightsHtml}
      </td></tr>
    </table>

    ${
      notesBlock
        ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;background-color:#f8fafc;border-radius:10px;border:1px solid #e2e8f0;">
      <tr><td style="padding:16px 18px;">
        <p style="margin:0 0 6px 0;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:600;">Admin notes</p>
        ${notesBlock}
      </td></tr>
    </table>`
        : ''
    }

    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 28px auto;">
      <tr>
        <td align="center" style="border-radius:10px;background-color:#b91c1c;">
          <a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">View full inspection</a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:13px;line-height:1.5;color:#64748b;word-break:break-all;">Or copy this link:<br /><a href="${url}" style="color:#102237;">${url}</a></p>
  `;

  return wrapBrandedEmailHtml({
    preheader: `Your ZentroSure report is ready — ${verdict || 'View results'} · Booking ${bookingNumber}.`,
    innerHtml
  });
}

function portalBookingsUrl() {
  const explicit = (process.env.PORTAL_BOOKINGS_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const lw = env.loginWebUrl || '';
  try {
    const u = new URL(lw);
    return `${u.origin}/portal/bookings`;
  } catch {
    return 'https://zentrosure.com/portal/bookings';
  }
}

function publicInspectionUrl(bookingNumber) {
  const explicit = (process.env.PUBLIC_INSPECTION_WEB_URL || '').trim();
  if (explicit) return `${explicit.replace(/\/$/, '')}/${encodeURIComponent(String(bookingNumber || ''))}`;

  const loginPreferred = loginUrlForCustomerEmail(env.loginWebUrl);
  try {
    const u = new URL(loginPreferred);
    return `${u.origin}/inspection/${encodeURIComponent(String(bookingNumber || ''))}`;
  } catch {
    return `https://zentrosure.com/inspection/${encodeURIComponent(String(bookingNumber || ''))}`;
  }
}

/** Customer-facing login URL in emails — never show localhost to recipients. */
const PRODUCTION_LOGIN_FALLBACK = 'https://zentrosure.com/login';

/** Use production login in emails when the configured URL is local or empty. */
function loginUrlForCustomerEmail(preferred) {
  const u = String(preferred || '').trim();
  if (!u || /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(u)) return PRODUCTION_LOGIN_FALLBACK;
  try {
    const parsed = new URL(u);
    if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) return PRODUCTION_LOGIN_FALLBACK;
  } catch {
    return PRODUCTION_LOGIN_FALLBACK;
  }
  return u.replace(/\/$/, '');
}

function getTransporter() {
  const s = env.smtp;
  if (!s || !s.host || !s.from) return null;
  return nodemailer.createTransport({
    host: s.host,
    port: Number(s.port || 587),
    secure: Boolean(s.secure) || Number(s.port) === 465,
    auth: s.user && s.pass ? { user: s.user, pass: s.pass } : undefined
  });
}

function buildQuickBookingCredentialsHtml({
  customerName,
  bookingNumber,
  userId,
  phoneDigits,
  password,
  loginHref,
  portalHref
}) {
  const name = escapeHtml(customerName);
  const bid = escapeHtml(bookingNumber);
  const uid = escapeHtml(userId);
  const phone = escapeHtml(formatPhoneDisplay(phoneDigits));
  const pass = escapeHtml(password);
  const login = escapeHtml(loginHref);
  const portal = escapeHtml(portalHref);

  const innerHtml = `
    <p style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:#102237;line-height:1.25;">Booking confirmed</p>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">Hi ${name}, your quick booking is confirmed. Please complete the remaining details below in your customer portal.</p>

    <div style="margin:0 0 18px 0;background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:16px 18px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:700;">Booking ID</div>
      <div style="margin-top:6px;font-size:18px;font-weight:800;color:#102237;">${bid}</div>
    </div>

    <div style="margin:0 0 18px 0;background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:16px 18px;">
      <div style="font-size:13px;font-weight:800;color:#102237;">PLEASE COMPLETE YOUR BOOKING DETAILS</div>
      <div style="margin-top:6px;font-size:14px;line-height:1.6;color:#334155;">You booked using quick booking; vehicle and schedule details are still placeholders. Sign in to your portal and update the info.</div>
      <ul style="margin:12px 0 0 18px;padding:0;color:#334155;font-size:14px;line-height:1.7;">
        <li>Vehicle: make, model, year, registration</li>
        <li>Full inspection address or pickup location</li>
        <li>Preferred date & time slot</li>
        <li>RC / insurance details and any notes</li>
      </ul>
    </div>

    <div style="margin:0 0 18px 0;background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:16px 18px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:700;">Your account</div>
      <div style="margin-top:12px;display:flex;flex-direction:column;gap:10px;">
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <div style="min-width:80px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:800;">User ID</div>
          <div style="flex:1;padding:10px 12px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;font-weight:800;color:#102237;">${uid}</div>
        </div>
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <div style="min-width:80px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:800;">Phone</div>
          <div style="flex:1;padding:10px 12px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;font-weight:800;color:#102237;">${phone}</div>
        </div>
        <div style="display:flex;gap:12px;align-items:flex-start;">
          <div style="min-width:80px;font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:800;">Password</div>
          <div style="flex:1;padding:10px 12px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;font-weight:800;color:#102237;">${pass}</div>
        </div>
      </div>
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 18px auto;">
      <tr>
        <td align="center" style="border-radius:12px;background-color:#b91c1c;">
          <a href="${portal}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;">Track your booking</a>
        </td>
      </tr>
    </table>

    <p style="margin:0 0 6px 0;font-size:13px;line-height:1.5;color:#64748b;">
      Or sign in using this link:<br />
      <a href="${login}" style="color:#102237;font-weight:800;text-decoration:none;">${login}</a>
    </p>

    <p style="margin:10px 0 0 0;font-size:12px;line-height:1.55;color:#64748b;">
      After you sign in, please update your password from Profile settings.
    </p>
  `;

  return wrapBrandedEmailHtml({
    preheader: `Booking ${bookingNumber} confirmed — login details included.`,
    innerHtml,
  });
}

function buildInspectorAssignedHtml({
  customerName,
  bookingNumber,
  vehicleDescription,
  city,
  scheduleLine,
  inspectorName,
  inspectorCode,
  inspectorPhoneDisplay,
  inspectorEmailDisplay,
  inspectorCity,
  portalHref
}) {
  const name = escapeHtml(customerName);
  const bid = escapeHtml(bookingNumber);
  const veh = escapeHtml(vehicleDescription);
  const c = escapeHtml(city);
  const when = escapeHtml(scheduleLine);
  const inName = escapeHtml(inspectorName);
  const inCode = escapeHtml(inspectorCode);
  const inPhone = escapeHtml(inspectorPhoneDisplay);
  const inEmail = escapeHtml(inspectorEmailDisplay);
  const inCity = escapeHtml(inspectorCity);
  const portal = escapeHtml(portalHref);

  const innerHtml = `
    <p style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:#102237;line-height:1.25;">Inspector assigned</p>
    <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">Hi ${name}, an inspector has been assigned to your booking. Below are the details and the next steps.</p>

    <div style="margin:0 0 14px 0;background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:16px 18px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:700;">Booking</div>
      <div style="margin-top:6px;font-size:18px;font-weight:800;color:#102237;">${bid}</div>
      <div style="margin-top:10px;color:#334155;font-size:14px;line-height:1.7;">
        <div><strong style="color:#102237;">Vehicle:</strong> ${veh}</div>
        <div><strong style="color:#102237;">City:</strong> ${c}</div>
        <div><strong style="color:#102237;">Schedule:</strong> ${when}</div>
      </div>
    </div>

    <div style="margin:0 0 18px 0;background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:16px 18px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;font-weight:700;">Inspector</div>
      <div style="margin-top:10px;color:#334155;font-size:14px;line-height:1.7;">
        <div><strong style="color:#102237;">Name:</strong> ${inName}</div>
        <div><strong style="color:#102237;">Code:</strong> ${inCode}</div>
        <div><strong style="color:#102237;">Phone:</strong> ${inPhone}</div>
        <div><strong style="color:#102237;">Email:</strong> ${inEmail}</div>
        <div><strong style="color:#102237;">Base city:</strong> ${inCity}</div>
      </div>
    </div>

    <table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto 18px auto;">
      <tr>
        <td align="center" style="border-radius:12px;background-color:#b91c1c;">
          <a href="${portal}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;border-radius:12px;">Track your booking</a>
        </td>
      </tr>
    </table>

    <p style="margin:0;font-size:12px;line-height:1.6;color:#64748b;">
      You can view updated status in your customer portal anytime.
    </p>
  `;

  return wrapBrandedEmailHtml({
    preheader: `Inspector assigned — Booking ${bookingNumber}. Track your booking in the portal.`,
    innerHtml,
  });
}

/**
 * Sends quick-booking credentials after public homepage booking.
 * @returns {Promise<boolean>} true if SMTP sent, false if SMTP not configured or send failed
 */
async function sendQuickBookingCredentials({
  to,
  customerName,
  userId,
  phoneDigits,
  bookingNumber,
  password,
  loginUrl
}) {
  const transporter = getTransporter();
  const phoneDisplay = formatPhoneDisplay(phoneDigits);
  const loginPreferred = loginUrl || env.loginWebUrl;
  const loginHref = loginUrlForCustomerEmail(loginPreferred);
  const portalHref = portalBookingsUrl();

  const subject = `ZentroSure — Booking ${bookingNumber} confirmed · Your login details`;
  const text = [
    `Hi ${customerName},`,
    '',
    'Your inspection booking is confirmed.',
    `Booking ID: ${bookingNumber}`,
    '',
    'IMPORTANT — Complete your booking details:',
    'You used quick booking; vehicle and schedule may still be placeholders.',
    'Please sign in to the customer portal and add:',
    '- Vehicle (make, model, year, registration)',
    '- Full inspection address or pickup location',
    '- Preferred date & time slot',
    '- RC / insurance details and any notes',
    'Our team may also reach out by phone or WhatsApp — sharing details early helps us assign the right inspector.',
    '',
    'Your ZentroSure account:',
    `- User ID: ${userId}`,
    `- Phone (use on Login — Phone option): ${phoneDisplay}`,
    `- Password: ${password}`,
    '',
    `Sign in to track your booking: ${loginHref}`,
    '',
    'Please change your password from your profile after you sign in.',
    '',
    '— ZentroSure'
  ].join('\n');

  if (!transporter) {
    console.warn('[mail] SMTP not configured (SMTP_HOST / SMTP_FROM); skipping email to', to);
    return false;
  }
  try {
    const html = buildQuickBookingCredentialsHtml({
      customerName,
      bookingNumber,
      userId,
      phoneDigits,
      password,
      loginHref,
      portalHref
    });
    await transporter.sendMail({
      from: env.smtp.from,
      to,
      subject,
      text,
      html
    });
    return true;
  } catch (err) {
    console.error('[mail] send failed:', err.message || err);
    return false;
  }
}

function formatSchedule(booking) {
  const slot = booking.slot ? String(booking.slot).trim() : '';
  let dateStr = '';
  if (booking.scheduledDate) {
    try {
      const d = new Date(booking.scheduledDate);
      dateStr = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      dateStr = '';
    }
  }
  if (dateStr && slot) return `${dateStr} · ${slot}`;
  return dateStr || slot || '—';
}

function formatPhoneDisplay(phone) {
  if (!phone) return '—';
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return String(phone);
}

/**
 * Notify customer when admin assigns an inspector.
 * @returns {Promise<boolean>}
 */
async function sendInspectorAssignedEmail(booking, inspector) {
  const transporter = getTransporter();
  const user = inspector.userId && typeof inspector.userId === 'object' ? inspector.userId : null;
  const cust = booking.customerId && typeof booking.customerId === 'object' ? booking.customerId : null;
  const to = cust && cust.email ? String(cust.email).trim() : '';

  if (!to) {
    console.warn('[mail] No customer email on booking; skipping inspector-assigned email for', booking.bookingNumber);
    return false;
  }

  const customerName = (booking.customerName || cust.name || 'Customer').trim();
  const inspectorName = (user && user.name) || 'Your inspector';
  const inspectorEmailRaw = user && user.email ? String(user.email).trim() : '';
  const inspectorEmailDisplay = inspectorEmailRaw || '—';
  const inspectorPhoneDisplay = formatPhoneDisplay(user && user.phone);
  const inspectorCity = (inspector.city && String(inspector.city).trim()) || '—';
  const scheduleLine = formatSchedule(booking);
  const portalHref = portalBookingsUrl();

  const subject = `ZentroSure — Inspector assigned · Booking ${booking.bookingNumber}`;
  const textLines = [
    `Hi ${customerName},`,
    '',
    `An inspector has been assigned to your inspection (Booking ${booking.bookingNumber}).`,
    '',
    'Booking',
    `- Vehicle: ${booking.vehicleDescription}`,
    `- City: ${booking.city}`,
    `- Schedule: ${scheduleLine}`,
    '',
    'Inspector',
    `- Name: ${inspectorName}`,
    `- Code: ${inspector.inspectorCode}`,
    `- Phone: ${inspectorPhoneDisplay}`,
    `- Email: ${inspectorEmailDisplay}`,
    `- Base city: ${inspectorCity}`
  ];
  if (inspector.rating != null && Number(inspector.rating) > 0) {
    textLines.push(`- Rating: ${Number(inspector.rating).toFixed(1)}`);
  }
  if (inspector.jobsCompleted != null && Number(inspector.jobsCompleted) >= 0) {
    textLines.push(`- Jobs completed: ${inspector.jobsCompleted}`);
  }
  if (Array.isArray(inspector.specialisations) && inspector.specialisations.length) {
    textLines.push(`- Focus: ${inspector.specialisations.slice(0, 4).join(' · ')}`);
  }
  textLines.push('', `Track your booking: ${portalHref}`, '', '— ZentroSure');
  const text = textLines.join('\n');

  if (!transporter) {
    console.warn('[mail] SMTP not configured; skipping inspector-assigned email to', to);
    return false;
  }
  try {
    const html = buildInspectorAssignedHtml({
      customerName,
      bookingNumber: booking.bookingNumber,
      vehicleDescription: booking.vehicleDescription,
      city: booking.city,
      scheduleLine,
      inspectorName: inspectorName,
      inspectorCode: inspector.inspectorCode,
      inspectorPhoneDisplay,
      inspectorEmailDisplay,
      inspectorCity,
      portalHref
    });
    await transporter.sendMail({
      from: env.smtp.from,
      to,
      subject,
      text,
      html
    });
    return true;
  } catch (err) {
    console.error('[mail] inspector-assigned send failed:', err.message || err);
    return false;
  }
}

/**
 * Notify customer when inspector submits/completes inspection capture.
 * Includes shareable public URL and uploaded media links.
 * @returns {Promise<boolean>}
 */
async function sendInspectionCompletedEmail({ booking, customer, inspector, inspectorUser }) {
  const transporter = getTransporter();
  const to = customer?.email ? String(customer.email).trim() : '';
  if (!to) {
    console.warn('[mail] No customer email; skipping inspection-completed email for', booking.bookingNumber);
    return false;
  }

  const customerName = (booking.customerName || customer.name || 'Customer').trim();
  const inspectorName = (inspectorUser?.name || booking?.submission?.inspectorName || 'Inspector').trim();
  const inspectorPhoneDisplay = formatPhoneDisplay(inspectorUser?.phone);
  const inspectorCode = inspector?.inspectorCode || '—';
  const submittedAt = booking?.submission?.submittedAt ? new Date(booking.submission.submittedAt) : new Date();
  const submittedAtDisplay = Number.isNaN(submittedAt.getTime())
    ? new Date().toLocaleString('en-IN')
    : submittedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const shareUrl = publicInspectionUrl(booking.bookingNumber);

  const images = Array.isArray(booking?.uploadedImages)
    ? booking.uploadedImages.filter((im) => im && im.storageUrl).slice(-8)
    : [];
  const imageLines = images.length
    ? images.map((im, i) => `${i + 1}. ${im.storageUrl}`).join('\n')
    : 'No image URLs available.';

  const subject = `ZentroSure — Inspection completed · Booking ${booking.bookingNumber}`;
  const text = [
    `Hi ${customerName},`,
    '',
    `Your inspection has been successfully completed.`,
    `Booking ID: ${booking.bookingNumber}`,
    `Inspection date & time: ${submittedAtDisplay}`,
    '',
    'Inspector details',
    `- Name: ${inspectorName}`,
    `- Code: ${inspectorCode}`,
    `- Phone: ${inspectorPhoneDisplay}`,
    '',
    `View full inspection details and photos: ${shareUrl}`,
    '',
    'Uploaded photos',
    imageLines,
    '',
    '— ZentroSure'
  ].join('\n');

  if (!transporter) {
    console.warn('[mail] SMTP not configured; skipping inspection-completed email to', to);
    return false;
  }

  const html = buildInspectionCompletedHtml({
    customerName,
    bookingNumber: booking.bookingNumber,
    submittedAtDisplay,
    inspectorName,
    inspectorCode,
    inspectorPhoneDisplay,
    shareUrl,
    images
  });

  try {
    await transporter.sendMail({
      from: env.smtp.from,
      to,
      subject,
      text,
      html
    });
    return true;
  } catch (err) {
    console.error('[mail] inspection-completed send failed:', err.message || err);
    return false;
  }
}

/**
 * Notify customer after admin publishes the final report (score, verdict, highlights).
 * @returns {Promise<boolean>}
 */
async function sendReportPublishedEmail({ booking, customer, report }) {
  const transporter = getTransporter();
  const to = customer?.email ? String(customer.email).trim() : '';
  if (!to) {
    console.warn('[mail] No customer email; skipping report-published email for', booking.bookingNumber);
    return false;
  }
  if (!report) {
    console.warn('[mail] Missing report payload; skipping report-published email for', booking.bookingNumber);
    return false;
  }

  const customerName = (booking.customerName || customer.name || 'Customer').trim();
  const shareUrl = publicInspectionUrl(booking.bookingNumber);
  const publishedAt = report.publishedAt ? new Date(report.publishedAt) : new Date();
  const publishedAtDisplay = Number.isNaN(publishedAt.getTime())
    ? new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : publishedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const highlights = Array.isArray(report.highlights) ? report.highlights : [];

  const subject = `ZentroSure — Your report is ready · Booking ${booking.bookingNumber}`;
  const textLines = [
    `Hi ${customerName},`,
    '',
    'Your ZentroSure inspection report has been published.',
    `Booking ID: ${booking.bookingNumber}`,
    `Report ID: ${report.reportId || '—'}`,
    `Published: ${publishedAtDisplay}`,
    '',
    'Final result',
    `- Score: ${report.score != null ? report.score : '—'} / 100`,
    `- Verdict: ${report.verdict || '—'}`,
    ''
  ];
  if (highlights.length) {
    textLines.push('Highlights', ...highlights.map((h) => `- ${h}`), '');
  }
  if (report.adminNotes && String(report.adminNotes).trim()) {
    textLines.push('Admin notes', String(report.adminNotes).trim(), '');
  }
  textLines.push(`View full inspection: ${shareUrl}`, '', '— ZentroSure');
  const text = textLines.join('\n');

  const html = buildReportPublishedHtml({
    customerName,
    bookingNumber: booking.bookingNumber,
    reportId: report.reportId || '—',
    publishedAtDisplay,
    score: report.score,
    verdict: report.verdict,
    highlights,
    adminNotes: report.adminNotes,
    shareUrl
  });

  if (!transporter) {
    console.warn('[mail] SMTP not configured; skipping report-published email to', to);
    return false;
  }
  try {
    await transporter.sendMail({
      from: env.smtp.from,
      to,
      subject,
      text,
      html
    });
    return true;
  } catch (err) {
    console.error('[mail] report-published send failed:', err.message || err);
    return false;
  }
}

module.exports = {
  sendQuickBookingCredentials,
  sendInspectorAssignedEmail,
  sendInspectionCompletedEmail,
  sendReportPublishedEmail,
  getTransporter,
  publicInspectionUrl,
  wrapBrandedEmailHtml
};
