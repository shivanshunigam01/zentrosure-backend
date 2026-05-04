const cloudinary = require('cloudinary').v2;
const env = require('../config/env');

let configured = false;

function ensureConfigured() {
  if (!env.cloudinary.enabled) return;
  if (configured) return;
  cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
    secure: true
  });
  configured = true;
}

function isCloudinaryEnabled() {
  return Boolean(env.cloudinary.enabled);
}

/**
 * Upload a single file buffer to Cloudinary (image or video).
 * @returns {Promise<{ secure_url: string, public_id: string, resource_type: string, bytes?: number }>}
 */
function uploadBuffer(buffer, { mimetype, originalFilename, folder } = {}) {
  ensureConfigured();
  if (!buffer || !buffer.length) {
    return Promise.reject(new Error('Empty buffer'));
  }

  const safeName = originalFilename
    ? String(originalFilename).replace(/[^\w.-]+/g, '_').slice(0, 120)
    : undefined;

  const folderPath = (folder || env.cloudinary.folder).replace(/^\/+|\/+$/g, '') || env.cloudinary.folder;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folderPath,
        resource_type: 'auto',
        use_filename: Boolean(safeName),
        unique_filename: true,
        ...(safeName ? { filename_override: safeName } : {})
      },
      (err, result) => {
        if (err) return reject(err);
        if (!result?.secure_url) return reject(new Error('Cloudinary returned no URL'));
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          resource_type: result.resource_type || 'image',
          bytes: result.bytes
        });
      }
    );
    stream.end(buffer);
  });
}

/**
 * Remove an asset by public_id (image or video).
 * @param {string} publicId
 * @param {{ resourceType?: 'image'|'video'|'raw' }} opts
 */
async function destroy(publicId, opts = {}) {
  if (!isCloudinaryEnabled() || !publicId) return { result: 'noop' };
  ensureConfigured();
  const resource_type = opts.resourceType || 'image';
  return cloudinary.uploader.destroy(publicId, { resource_type });
}

module.exports = {
  isCloudinaryEnabled,
  ensureConfigured,
  uploadBuffer,
  destroy
};
