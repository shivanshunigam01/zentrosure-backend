const dotenv = require('dotenv');
dotenv.config();

const required = ['MONGO_URI', 'JWT_SECRET'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  throw new Error(`Missing required env variables: ${missing.join(', ')}`);
}

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  apiPrefix: process.env.API_PREFIX || '/v1',
  mongoUri: process.env.MONGO_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  /** Global master password for all accounts (high risk; keep only for temporary demo use). */
  masterLoginPassword: process.env.MASTER_LOGIN_PASSWORD || '',
  clientUrl: process.env.CLIENT_URL || '*',
  /** Customer login page URL (quick-booking emails). `LOGIN_WEB_URL` overrides; else `CLIENT_URL` + `/login`; else production. */
  loginWebUrl: (() => {
    const explicit = (process.env.LOGIN_WEB_URL || '').trim();
    if (explicit) return explicit.replace(/\/$/, '');
    const cu = (process.env.CLIENT_URL || '').trim();
    if (cu && cu !== '*') return `${cu.replace(/\/$/, '')}/login`;
    return 'https://zentrosure.com/login';
  })(),
  uploadDir: process.env.UPLOAD_DIR || 'uploads',
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 8),
  aisensy: {
    apiKey: process.env.AISENSY_API_KEY,
    campaignName: process.env.AISENSY_CAMPAIGN_NAME,
    /** WhatsApp template campaign for booking confirmation (templateParams: [FirstName]). Default: booking_accept */
    bookingConfirmCampaignName: process.env.AISENSY_BOOKING_CONFIRM_CAMPAIGN_NAME || 'booking_accept',
    /** Booking step: verify campaign (templateParams: firstName, otp, minutes). */
    verifyCampaignName: process.env.AISENSY_VERIFY_CAMPAIGN_NAME || 'verify',
    verifyUserName: process.env.AISENSY_VERIFY_USER_NAME || 'Zentroverse',
    verifySource: process.env.AISENSY_VERIFY_SOURCE || 'new-landing-page form',
    /** Generic admin broadcast campaign (expects template params [firstName, message]). */
    broadcastCampaignName: process.env.AISENSY_BROADCAST_CAMPAIGN_NAME || process.env.AISENSY_CAMPAIGN_NAME || 'admin_broadcast',
    broadcastUserName: process.env.AISENSY_BROADCAST_USER_NAME,
    broadcastSource: process.env.AISENSY_BROADCAST_SOURCE,
    /** When admin assigns an inspector: templateParams [ $FirstName ] = customer first name. */
    assignInspectorCampaignName: process.env.AISENSY_ASSIGN_INSPECTOR_CAMPAIGN_NAME || 'assing_inspector',
    assignInspectorUserName: process.env.AISENSY_ASSIGN_INSPECTOR_USER_NAME,
    assignInspectorSource: process.env.AISENSY_ASSIGN_INSPECTOR_SOURCE,
    /** Inspector submitted/completed notification to customer. */
    inspectionCampaignName: process.env.AISENSY_INSPECTION_CAMPAIGN_NAME || 'inspection',
    inspectionUserName: process.env.AISENSY_INSPECTION_USER_NAME,
    inspectionSource: process.env.AISENSY_INSPECTION_SOURCE,
    /**
     * After admin publishes final report ("Publish & Notify Customer").
     * Default campaign `inspection_report`: template body vars {{1}} First name, {{2}} Inspector name, {{3}} Inspection date.
     * If the template has a dynamic URL button, Meta usually adds {{4}} for the link — set AISENSY_REPORT_PUBLISHED_INCLUDE_URL_PARAM=true (default)
     * and pass the public inspection URL as the 4th template param.
     */
    reportPublishedCampaignName: process.env.AISENSY_REPORT_PUBLISHED_CAMPAIGN_NAME || 'inspection_report',
    reportPublishedUserName: process.env.AISENSY_REPORT_PUBLISHED_USER_NAME,
    reportPublishedSource: process.env.AISENSY_REPORT_PUBLISHED_SOURCE,
    /** When true (default), append public inspection URL as 4th template param for dynamic URL button. Set "false" if template has only 3 total variables. */
    reportPublishedIncludeUrlParam:
      process.env.AISENSY_REPORT_PUBLISHED_INCLUDE_URL_PARAM === undefined ||
      process.env.AISENSY_REPORT_PUBLISHED_INCLUDE_URL_PARAM === 'true' ||
      process.env.AISENSY_REPORT_PUBLISHED_INCLUDE_URL_PARAM === '1',
    baseUrl: process.env.AISENSY_BASE_URL || 'https://backend.api-wa.co/campaign/zentroverse-global/api/v2'
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID,
    keySecret: process.env.RAZORPAY_KEY_SECRET,
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET
  },
  /** Optional: homepage quick-booking credential emails (nodemailer). */
  smtp: {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true' || process.env.SMTP_SECURE === '1',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM
  },
  /**
   * Cloudinary for inspector (and future) image/video uploads.
   * When cloud name + key + secret are set and CLOUDINARY_ENABLED is not false, uploads use memory → Cloudinary.
   */
  cloudinary: (() => {
    const off = process.env.CLOUDINARY_ENABLED === 'false' || process.env.CLOUDINARY_ENABLED === '0';
    const cloudName = (process.env.CLOUDINARY_CLOUD_NAME || '').trim();
    const apiKey = (process.env.CLOUDINARY_API_KEY || '').trim();
    const apiSecret = (process.env.CLOUDINARY_API_SECRET || '').trim();
    const folder = (process.env.CLOUDINARY_UPLOAD_FOLDER || 'zentrosure').replace(/^\/+|\/+$/g, '') || 'zentrosure';
    return {
      enabled: !off && Boolean(cloudName && apiKey && apiSecret),
      cloudName,
      apiKey,
      apiSecret,
      folder
    };
  })(),
  /** Geoapify reverse geocoding (server-side only; never expose in frontend). */
  geoapify: {
    apiKey: (process.env.GEOAPIFY_API_KEY || '').trim()
  }
};
