const User = require('../models/User');
const env = require('../config/env');
const { ok } = require('../utils/response');
const mail = require('../services/mail.service');
const bookingWhatsapp = require('../services/bookingWhatsapp.service');

function triggerRows() {
  const hasWhatsApp = Boolean(env.aisensy?.apiKey);
  const hasEmail = Boolean(env.smtp?.host && env.smtp?.from);
  return [
    { id: 'booking-confirmed', name: 'Booking confirmed', active: hasWhatsApp || hasEmail, channels: ['whatsapp', 'email'] },
    { id: 'inspector-dispatched', name: 'Inspector dispatched', active: hasWhatsApp || hasEmail, channels: ['whatsapp', 'email'] },
    { id: 'report-ready', name: 'Report ready', active: hasWhatsApp || hasEmail, channels: ['whatsapp', 'email'] },
    { id: 'payment-received', name: 'Payment received', active: hasEmail, channels: ['email'] },
    { id: 'abandoned-booking', name: 'Abandoned booking', active: hasWhatsApp || hasEmail, channels: ['whatsapp', 'email'] }
  ];
}

exports.triggers = async (_req, res) => {
  ok(res, triggerRows());
};

exports.broadcast = async (req, res) => {
  const channel = String(req.body?.channel || '').trim().toLowerCase();
  const message = String(req.body?.message || '').trim();
  const limit = Math.max(1, Math.min(Number(req.body?.limit || 100), 500));
  if (!['whatsapp', 'sms', 'email'].includes(channel)) {
    return ok(res, { channel, sent: 0, failed: 0, skipped: 0, totalTargets: 0, note: 'Unsupported channel.' });
  }
  if (!message) {
    return ok(res, { channel, sent: 0, failed: 0, skipped: 0, totalTargets: 0, note: 'Message is empty.' });
  }
  if (channel === 'sms') {
    return ok(res, { channel, sent: 0, failed: 0, skipped: 0, totalTargets: 0, note: 'SMS provider is not configured yet.' });
  }

  const customers = await User.find({ role: 'customer' })
    .sort('-createdAt')
    .limit(limit)
    .select('name email phone')
    .lean();

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  if (channel === 'email') {
    const transporter = mail.getTransporter();
    if (!transporter) {
      return ok(res, {
        channel,
        sent: 0,
        failed: 0,
        skipped: customers.length,
        totalTargets: customers.length,
        note: 'SMTP not configured.'
      });
    }
    for (const u of customers) {
      const to = String(u.email || '').trim();
      if (!to) {
        skipped += 1;
        continue;
      }
      const name = String(u.name || 'Customer').trim();
      const text = [`Hi ${name},`, '', message, '', '— ZentroSure'].join('\n');
      try {
        const safeMessage = String(message || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/\n/g, '<br />');
        const safeName = String(name || 'Customer')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
        const html = mail.wrapBrandedEmailHtml({
          preheader: 'ZentroSure update',
          innerHtml: `
            <p style="margin:0 0 8px 0;font-size:22px;font-weight:800;color:#102237;line-height:1.25;">ZentroSure update</p>
            <p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:#334155;">Hi ${safeName},</p>
            <div style="margin:0 0 10px 0;background-color:#f8fafc;border-radius:12px;border:1px solid #e2e8f0;padding:14px 16px;color:#334155;font-size:14px;line-height:1.7;">
              ${safeMessage}
            </div>
          `
        });
        await transporter.sendMail({
          from: env.smtp.from,
          to,
          subject: 'ZentroSure update',
          text,
          html
        });
        sent += 1;
      } catch (err) {
        failed += 1;
        console.error('[admin broadcast email] send failed:', err.message || err);
      }
    }
    return ok(res, { channel, sent, failed, skipped, totalTargets: customers.length });
  }

  for (const u of customers) {
    try {
      const result = await bookingWhatsapp.sendBroadcastWhatsApp({
        name: u.name,
        phone: u.phone,
        message
      });
      if (result?.skipped) skipped += 1;
      else sent += 1;
    } catch (err) {
      failed += 1;
      console.error('[admin broadcast whatsapp] send failed:', err.message || err);
    }
  }
  return ok(res, { channel, sent, failed, skipped, totalTargets: customers.length });
};

