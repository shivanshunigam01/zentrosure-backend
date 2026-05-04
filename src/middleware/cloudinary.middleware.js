const ApiError = require('../utils/apiError');
const env = require('../config/env');
const { isCloudinaryEnabled, uploadBuffer } = require('../services/cloudinary.service');

/**
 * After multer `memoryStorage`, uploads each file to Cloudinary and sets `req.cloudinaryUrls`
 * (same order as `req.files`). Skips when Cloudinary is not configured.
 */
async function uploadInspectorMediaToCloudinary(req, res, next) {
  if (!isCloudinaryEnabled()) return next();
  const files = req.files;
  if (!files?.length) return next();

  const bookingNumber = String(req.params?.bookingNumber || 'misc').replace(/[^\w-]/g, '') || 'misc';
  const folder = `${env.cloudinary.folder}/inspector/${bookingNumber}`.replace(/\/+/g, '/');

  try {
    const urls = [];
    for (const file of files) {
      if (!file.buffer || !file.buffer.length) {
        throw new ApiError(400, 'Empty file upload', 'EMPTY_FILE');
      }
      const out = await uploadBuffer(file.buffer, {
        mimetype: file.mimetype,
        originalFilename: file.originalname,
        folder
      });
      urls.push(out.secure_url);
    }
    req.cloudinaryUrls = urls;
    return next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    console.error('[cloudinary middleware]', err.message || err);
    const msg = err.http_code ? `${err.message || 'Cloudinary error'}` : err.message || 'Cloudinary upload failed';
    return next(new ApiError(502, msg, 'CLOUDINARY_ERROR'));
  }
}

module.exports = { uploadInspectorMediaToCloudinary };
