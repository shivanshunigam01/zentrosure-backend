const env = require('../config/env');
const { normalizeIndianPhone } = require('../utils/phone');
const { publicInspectionUrl } = require('./mail.service');

/**
 * First token of display name for WhatsApp template variable $FirstName.
 */
function firstNameForTemplate(fullName) {
  const s = String(fullName || '').trim();
  if (!s) return 'Customer';
  return s.split(/\s+/)[0].slice(0, 80);
}

/**
 * AiSensy WhatsApp template after quick booking / booking confirmation.
 * Payload matches campaign API (template variable order maps to templateParams).
 *
 * @param {string} destination - Normalized Indian WhatsApp destination e.g. 91XXXXXXXXXX
 * @param {string} fullName - Customer name; first word used as $FirstName
 * @returns {Promise<{ skipped?: boolean, data?: unknown }>}
 */
async function sendBookingConfirmation(destination, fullName) {
  const { apiKey, bookingConfirmCampaignName, baseUrl, verifyUserName, verifySource } = env.aisensy;
  const campaign = bookingConfirmCampaignName || 'booking_accept';
  if (!apiKey) {
    console.warn('[Booking WhatsApp] Skipped — AISENSY_API_KEY not set');
    return { skipped: true };
  }

  const cleanName = firstNameForTemplate(fullName);
  const payload = {
    apiKey,
    campaignName: campaign,
    destination,
    userName: verifyUserName || 'Zentroverse',
    templateParams: [cleanName],
    source: verifySource || 'new-landing-page form',
    media: {},
    buttons: [],
    carouselCards: [],
    location: {},
    attributes: {},
    paramsFallbackValue: {
      FirstName: 'Customer'
    }
  };

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AiSensy booking template failed: ${response.status} ${text}`);
  }

  const data = await response.json().catch(() => ({}));
  return { skipped: false, data };
}

/**
 * Generic WhatsApp broadcast template sender used by admin notifications.
 * Campaign should usually be configured with params [FirstName, Message].
 */
async function sendBroadcastWhatsApp({ name, phone, message }) {
  const {
    apiKey,
    baseUrl,
    broadcastCampaignName,
    broadcastUserName,
    broadcastSource,
    verifyUserName,
    verifySource
  } = env.aisensy;
  if (!apiKey) {
    console.warn('[Booking WhatsApp] broadcast skipped — AISENSY_API_KEY not set');
    return { skipped: true };
  }
  const destination = normalizeIndianPhone(String(phone || ''));
  if (!destination) {
    return { skipped: true };
  }
  const cleanName = firstNameForTemplate(name);
  const payload = {
    apiKey,
    campaignName: broadcastCampaignName || 'admin_broadcast',
    destination,
    userName: broadcastUserName || verifyUserName || 'Zentroverse',
    templateParams: [cleanName, String(message || '').trim()],
    source: broadcastSource || verifySource || 'new-landing-page form',
    media: {},
    buttons: [],
    carouselCards: [],
    location: {},
    attributes: {},
    paramsFallbackValue: {
      FirstName: cleanName || 'user',
      message: String(message || '').trim()
    }
  };

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AiSensy broadcast failed: ${response.status} ${text}`);
  }
  return response.json().catch(() => ({}));
}

/**
 * AiSensy campaign when an admin assigns an inspector (template: $FirstName = customer first name).
 * @param {object} booking - booking with `phone`, `customerName`, optional populated `customerId` (name, phone)
 */
async function sendInspectorAssignedWhatsApp(booking) {
  const {
    apiKey,
    baseUrl,
    assignInspectorCampaignName,
    assignInspectorUserName,
    assignInspectorSource,
    verifyUserName,
    verifySource
  } = env.aisensy;
  const campaign = assignInspectorCampaignName || 'assing_inspector';
  if (!apiKey) {
    console.warn('[Booking WhatsApp] assign inspector skipped — AISENSY_API_KEY not set');
    return { skipped: true };
  }

  const phoneRaw = booking.phone || (booking.customerId && booking.customerId.phone);
  const destination = normalizeIndianPhone(String(phoneRaw || ''));
  if (!destination) {
    console.warn('[Booking WhatsApp] assign inspector skipped — invalid customer phone for', booking.bookingNumber);
    return { skipped: true };
  }

  const fullName =
    (booking.customerName && String(booking.customerName).trim()) ||
    (booking.customerId && booking.customerId.name && String(booking.customerId.name).trim()) ||
    'Customer';
  const cleanName = firstNameForTemplate(fullName);
  const userName = assignInspectorUserName || verifyUserName || 'Zentroverse';
  const source = assignInspectorSource || verifySource || 'new-landing-page form';

  const payload = {
    apiKey,
    campaignName: campaign,
    destination,
    userName,
    templateParams: [cleanName],
    source,
    media: {},
    buttons: [],
    carouselCards: [],
    location: {},
    attributes: {},
    paramsFallbackValue: {
      FirstName: cleanName || 'user'
    }
  };

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AiSensy assign-inspector failed: ${response.status} ${text}`);
  }

  return response.json().catch(() => ({}));
}

/**
 * AiSensy campaign when inspector submits/completes inspection.
 * Template params order:
 * [$FirstName, $inspectorName, $inspection_date, $inspection_url_shareable]
 */
async function sendInspectionCompletedWhatsApp({ booking, customer, inspectorName, mediaUrl }) {
  const {
    apiKey,
    baseUrl,
    inspectionCampaignName,
    inspectionUserName,
    inspectionSource,
    verifyUserName,
    verifySource
  } = env.aisensy;
  const campaign = inspectionCampaignName || 'inspection';
  if (!apiKey) {
    console.warn('[Booking WhatsApp] inspection-completed skipped — AISENSY_API_KEY not set');
    return { skipped: true };
  }

  const phoneRaw = booking.phone || customer?.phone;
  const destination = normalizeIndianPhone(String(phoneRaw || ''));
  if (!destination) {
    console.warn('[Booking WhatsApp] inspection-completed skipped — invalid customer phone for', booking.bookingNumber);
    return { skipped: true };
  }

  const fullName = (booking.customerName && String(booking.customerName).trim()) || (customer?.name && String(customer.name).trim()) || 'Customer';
  const cleanName = firstNameForTemplate(fullName);
  const submitAt = booking?.submission?.submittedAt ? new Date(booking.submission.submittedAt) : new Date();
  const inspectionDate = Number.isNaN(submitAt.getTime())
    ? new Date().toLocaleString('en-IN')
    : submitAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const shareUrl = publicInspectionUrl(booking.bookingNumber);
  const userName = inspectionUserName || verifyUserName || 'Zentroverse';
  const source = inspectionSource || verifySource || 'new-landing-page form';

  const payload = {
    apiKey,
    campaignName: campaign,
    destination,
    userName,
    templateParams: [cleanName, String(inspectorName || 'Inspector'), inspectionDate, shareUrl],
    source,
    media: mediaUrl
      ? {
          url: mediaUrl,
          filename: 'inspection_media'
        }
      : {},
    buttons: [],
    carouselCards: [],
    location: {},
    attributes: {},
    paramsFallbackValue: {
      FirstName: cleanName || 'user',
      inspectorName: String(inspectorName || 'Inspector'),
      inspection_date: inspectionDate,
      inspection_url_shareable: shareUrl
    }
  };

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AiSensy inspection-completed failed: ${response.status} ${text}`);
  }

  return response.json().catch(() => ({}));
}

/**
 * AiSensy campaign when admin publishes the final report ("inspection_report").
 * Body variables (see AISENSY_REPORT_PUBLISHED_INCLUDE_URL_PARAM):
 * - Default: [ First name, Inspector name, Inspection date, public inspection URL ]
 *   — URL is used by Meta for the dynamic "Visit" / CTA button when the template defines a 4th variable for the link.
 * - If env sets AISENSY_REPORT_PUBLISHED_INCLUDE_URL_PARAM=false: only first three; URL is sent in `buttons` (shape may depend on your AiSensy project).
 *
 * @param {object} booking - booking with phone, customerName, bookingNumber, submission
 * @param {object} customer - optional { name, phone }
 * @param {object} report - { publishedAt }
 */
async function sendReportPublishedWhatsApp({ booking, customer, report }) {
  const {
    apiKey,
    baseUrl,
    reportPublishedCampaignName,
    reportPublishedUserName,
    reportPublishedSource,
    reportPublishedIncludeUrlParam,
    verifyUserName,
    verifySource
  } = env.aisensy;
  const campaign = reportPublishedCampaignName || 'inspection_report';
  if (!apiKey) {
    console.warn('[Booking WhatsApp] report-published skipped — AISENSY_API_KEY not set');
    return { skipped: true };
  }

  const phoneRaw = booking.phone || customer?.phone;
  const destination = normalizeIndianPhone(String(phoneRaw || ''));
  if (!destination) {
    console.warn('[Booking WhatsApp] report-published skipped — invalid customer phone for', booking.bookingNumber);
    return { skipped: true };
  }

  const fullName =
    (booking.customerName && String(booking.customerName).trim()) ||
    (customer?.name && String(customer.name).trim()) ||
    'Customer';
  const cleanName = firstNameForTemplate(fullName);
  const shareUrl = publicInspectionUrl(booking.bookingNumber);

  const inspectorName = String(booking.submission?.inspectorName || 'Inspector').trim() || 'Inspector';

  const publishedAt = report?.publishedAt ? new Date(report.publishedAt) : new Date();
  const inspectionDateStr = Number.isNaN(publishedAt.getTime())
    ? new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : publishedAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

  const userName = reportPublishedUserName || verifyUserName || 'Zentroverse';
  const source = reportPublishedSource || verifySource || 'new-landing-page form';

  const templateParams = [cleanName, inspectorName, inspectionDateStr];
  let buttons = [];

  if (reportPublishedIncludeUrlParam) {
    templateParams.push(shareUrl);
  } else {
    // Template has only 3 variables — try binding button URL (AiSensy may accept url string or wrapper object).
    buttons = [{ url: shareUrl }];
  }

  const payload = {
    apiKey,
    campaignName: campaign,
    destination,
    userName,
    templateParams,
    source,
    media: {},
    buttons,
    carouselCards: [],
    location: {},
    attributes: {},
    paramsFallbackValue: {
      FirstName: cleanName || 'user',
      InspectorName: inspectorName,
      Inspectiondate: inspectionDateStr,
      inspection_url: shareUrl
    }
  };

  const response = await fetch(baseUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const text = await response.text();
    const mismatch = response.status === 400 && /template params does not match/i.test(String(text || ''));
    if (mismatch && reportPublishedIncludeUrlParam) {
      // Retry once without URL template param for older 3-variable templates.
      const retryPayload = {
        ...payload,
        templateParams: [cleanName, inspectorName, inspectionDateStr],
        buttons: [{ url: shareUrl }]
      };
      const retry = await fetch(baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(retryPayload)
      });
      if (retry.ok) return retry.json().catch(() => ({}));
      const retryText = await retry.text().catch(() => '');
      throw new Error(`AiSensy report-published failed: ${retry.status} ${retryText || text}`);
    }
    throw new Error(`AiSensy report-published failed: ${response.status} ${text}`);
  }

  return response.json().catch(() => ({}));
}

module.exports = {
  sendBookingConfirmation,
  sendInspectorAssignedWhatsApp,
  sendInspectionCompletedWhatsApp,
  sendReportPublishedWhatsApp,
  sendBroadcastWhatsApp,
  firstNameForTemplate
};
