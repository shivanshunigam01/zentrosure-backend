const path = require('path');
const fs = require('fs');
const multer = require('multer');
const env = require('../config/env');
const ApiError = require('../utils/apiError');
const { isCloudinaryEnabled, uploadBuffer } = require('../services/cloudinary.service');
const { uploadInspectorMediaToCloudinary } = require('./cloudinary.middleware');

const uploadDir = path.resolve(process.cwd(), env.uploadDir);
fs.mkdirSync(uploadDir, { recursive: true });

/** Accept `image/*`, `video/*`, and common mobile oddities (e.g. empty type). */
function imageOrVideoFilter(req, file, cb) {
  const mt = String(file.mimetype || '').toLowerCase();
  if (mt.startsWith('image/') || mt.startsWith('video/')) return cb(null, true);
  if (!mt || mt === 'application/octet-stream') {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (/\.(jpe?g|png|gif|webp|heic|heif|bmp|mp4|webm|mov|quicktime)$/i.test(ext)) {
      return cb(null, true);
    }
  }
  return cb(new Error('Only image and video uploads are allowed'));
}

const limits = { fileSize: env.maxFileSizeMb * 1024 * 1024 };

/** Multiple `photos` and optional single `photo` (some clients send one file under `photo`). */
const INSPECTOR_FILE_FIELDS = [
  { name: 'photos', maxCount: 20 },
  { name: 'photo', maxCount: 1 }
];

const diskMulter = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) =>
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`)
  }),
  limits,
  fileFilter: imageOrVideoFilter
}).fields(INSPECTOR_FILE_FIELDS);

const memoryMulter = multer({
  storage: multer.memoryStorage(),
  limits,
  fileFilter: imageOrVideoFilter
}).fields(INSPECTOR_FILE_FIELDS);

function normalizeInspectorFiles(req) {
  const raw = req.files;
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    const a = raw.photos;
    const b = raw.photo;
    if (Array.isArray(a)) list.push(...a);
    if (Array.isArray(b)) list.push(...b);
  }
  req.files = list;
}

function handleMulterError(err, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(400, `File too large (max ${env.maxFileSizeMb} MB per file)`, 'FILE_TOO_LARGE'));
    }
    if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(
        new ApiError(400, 'Too many files or wrong field name. Use "photos" (1–20 files) or one "photo".', 'UPLOAD_LIMIT')
      );
    }
    return next(new ApiError(400, err.message || 'Upload failed', 'UPLOAD_ERROR'));
  }
  if (err && String(err.message || '').includes('Only image and video')) {
    return next(new ApiError(400, err.message, 'INVALID_FILE_TYPE'));
  }
  return next(err);
}

/**
 * Inspector booking photos/videos: disk when Cloudinary is off; memory + Cloudinary when configured.
 */
exports.uploadPhotos = (req, res, next) => {
  const afterMulter = (err) => {
    if (err) return handleMulterError(err, next);
    normalizeInspectorFiles(req);
    if (isCloudinaryEnabled()) {
      return uploadInspectorMediaToCloudinary(req, res, next);
    }
    return next();
  };
  if (isCloudinaryEnabled()) {
    return memoryMulter(req, res, afterMulter);
  }
  return diskMulter(req, res, afterMulter);
};

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

function imageOnlyProfileFilter(req, file, cb) {
  if (file.mimetype.startsWith('image/')) return cb(null, true);
  return cb(new Error('Profile photo must be an image (e.g. JPG or PNG)'));
}

const diskProfilePhoto = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) =>
      cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`)
  }),
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: imageOnlyProfileFilter
}).single('photo');

const memoryProfilePhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter: imageOnlyProfileFilter
}).single('photo');

function checklistExcelFilter(req, file, cb) {
  const mt = String(file.mimetype || '').toLowerCase();
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (
    mt.includes('sheet') ||
    mt.includes('excel') ||
    mt === 'application/octet-stream' ||
    ext === '.xlsx' ||
    ext === '.xls' ||
    ext === '.csv'
  ) {
    return cb(null, true);
  }
  return cb(new Error('Checklist import accepts only Excel/CSV files (.xlsx, .xls, .csv)'));
}

const checklistExcelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: checklistExcelFilter,
}).single('file');

async function uploadProfilePhotoToCloudinary(req, res, next) {
  if (!isCloudinaryEnabled()) return next();
  try {
    if (!req.file?.buffer) {
      return next(new Error('Missing image data'));
    }
    const subfolder = `${env.cloudinary.folder}/profile-avatars`.replace(/\/+/g, '/');
    const out = await uploadBuffer(req.file.buffer, {
      mimetype: req.file.mimetype,
      originalFilename: req.file.originalname,
      folder: subfolder
    });
    req.profilePhotoUrl = out.secure_url;
    return next();
  } catch (err) {
    console.error('[cloudinary profile photo]', err.message || err);
    return next(err);
  }
}

/** Customer profile avatar: multipart field `photo` (single image). Cloudinary or local disk. */
exports.uploadCustomerAvatarPhoto = (req, res, next) => {
  if (isCloudinaryEnabled()) {
    return memoryProfilePhoto(req, res, (err) => {
      if (err) return next(err);
      return uploadProfilePhotoToCloudinary(req, res, next);
    });
  }
  return diskProfilePhoto(req, res, next);
};

exports.uploadChecklistExcel = (req, res, next) => {
  checklistExcelUpload(req, res, (err) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(400, 'Excel file too large (max 10 MB)', 'FILE_TOO_LARGE'));
    }
    if (err) return next(new ApiError(400, err.message || 'Checklist upload failed', 'UPLOAD_ERROR'));
    return next();
  });
};
