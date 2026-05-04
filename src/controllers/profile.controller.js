const User = require('../models/User');
const CustomerProfile = require('../models/CustomerProfile');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { normalizeIndianPhone } = require('../utils/phone');
const { publicFileUrl } = require('../services/storage.service');

function serializeUser(doc) {
  if (!doc) return null;
  const u = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(u._id ?? u.id),
    name: u.name,
    email: u.email || undefined,
    phone: u.phone || undefined,
    role: u.role,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt
  };
}

function serializeProfile(doc) {
  if (!doc) return null;
  const p = doc.toObject ? doc.toObject() : doc;
  return {
    id: String(p._id),
    userId: String(p.userId),
    address: p.address || '',
    city: p.city || '',
    state: p.state || '',
    pincode: p.pincode || '',
    avatarUrl: p.avatarUrl || '',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt
  };
}

function profilePatchFromBody(body) {
  const out = {};
  ['address', 'city', 'state', 'pincode', 'avatarUrl'].forEach((k) => {
    if (body[k] !== undefined) out[k] = String(body[k] ?? '').trim();
  });
  return out;
}

async function assertEmailAvailable(email, userId) {
  if (!email) return;
  const other = await User.findOne({ email: email.toLowerCase(), _id: { $ne: userId } });
  if (other) throw new ApiError(409, 'Email is already in use', 'EMAIL_IN_USE');
}

async function assertPhoneAvailable(phone, userId) {
  if (!phone) return;
  const other = await User.findOne({ phone, _id: { $ne: userId } });
  if (other) throw new ApiError(409, 'Phone is already in use', 'PHONE_IN_USE');
}

/** GET — current customer user + extended profile (empty profile object if none yet). */
exports.getCustomerProfile = async (req, res) => {
  const user = await User.findById(req.user.id).lean();
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');
  const profileDoc = await CustomerProfile.findOne({ userId: user._id }).lean();
  const profile = profileDoc ? serializeProfile(profileDoc) : {
    id: null,
    userId: String(user._id),
    address: '',
    city: '',
    state: '',
    pincode: '',
    avatarUrl: '',
    createdAt: null,
    updatedAt: null
  };
  ok(res, { user: serializeUser(user), profile });
};

/** POST — create profile row (409 if already exists). */
exports.createCustomerProfile = async (req, res) => {
  const exists = await CustomerProfile.findOne({ userId: req.user.id });
  if (exists) throw new ApiError(409, 'Profile already exists. Use PATCH or PUT to update.', 'CONFLICT');
  const patch = profilePatchFromBody(req.body);
  const doc = await CustomerProfile.create({ userId: req.user.id, ...patch });
  ok(res, { user: serializeUser(await User.findById(req.user.id).lean()), profile: serializeProfile(doc) }, 201);
};

/** PUT — replace extended profile fields (upsert). */
exports.replaceCustomerProfile = async (req, res) => {
  const patch = profilePatchFromBody(req.body);
  const doc = await CustomerProfile.findOneAndUpdate(
    { userId: req.user.id },
    { $set: { userId: req.user.id, ...patch } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  const user = await User.findById(req.user.id).lean();
  ok(res, { user: serializeUser(user), profile: serializeProfile(doc) });
};

/** PATCH — partial update on profile + optional User name/email/phone. */
exports.patchCustomerProfile = async (req, res) => {
  const userPatch = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) throw new ApiError(400, 'Name cannot be empty', 'VALIDATION_ERROR');
    userPatch.name = name;
  }
  if (req.body.email !== undefined) {
    const email = String(req.body.email || '').trim().toLowerCase();
    await assertEmailAvailable(email, req.user.id);
    userPatch.email = email || undefined;
  }
  if (req.body.phone !== undefined) {
    const phone = normalizeIndianPhone(req.body.phone);
    if (req.body.phone && String(req.body.phone).trim() && !phone) {
      throw new ApiError(400, 'Invalid Indian mobile number', 'VALIDATION_ERROR');
    }
    if (phone) await assertPhoneAvailable(phone, req.user.id);
    userPatch.phone = phone || undefined;
  }

  if (Object.keys(userPatch).length) {
    await User.findByIdAndUpdate(req.user.id, { $set: userPatch }, { new: true, runValidators: true });
  }

  const profileFields = profilePatchFromBody(req.body);
  if (Object.keys(profileFields).length) {
    await CustomerProfile.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { userId: req.user.id, ...profileFields } },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
  }

  const user = await User.findById(req.user.id).lean();
  const profileDoc = await CustomerProfile.findOne({ userId: req.user.id }).lean();
  const profileOut = profileDoc
    ? serializeProfile(profileDoc)
    : {
        id: null,
        userId: String(user._id),
        address: '',
        city: '',
        state: '',
        pincode: '',
        avatarUrl: '',
        createdAt: null,
        updatedAt: null
      };

  ok(res, { user: serializeUser(user), profile: profileOut });
};

/** POST multipart `photo` — upload avatar to Cloudinary (or disk), save URL on CustomerProfile. */
exports.uploadCustomerAvatar = async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Image file required (field name: photo)', 'VALIDATION_ERROR');
  const avatarUrl = req.profilePhotoUrl || publicFileUrl(req, req.file.filename);
  const doc = await CustomerProfile.findOneAndUpdate(
    { userId: req.user.id },
    { $set: { userId: req.user.id, avatarUrl } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  const user = await User.findById(req.user.id).lean();
  ok(res, { avatarUrl, user: serializeUser(user), profile: serializeProfile(doc) });
};

/** DELETE — remove extended profile document (User account unchanged). */
exports.deleteCustomerProfile = async (req, res) => {
  const r = await CustomerProfile.deleteOne({ userId: req.user.id });
  const user = await User.findById(req.user.id).lean();
  ok(res, {
    deleted: r.deletedCount > 0,
    user: serializeUser(user),
    profile: {
      id: null,
      userId: String(user._id),
      address: '',
      city: '',
      state: '',
      pincode: '',
      avatarUrl: '',
      createdAt: null,
      updatedAt: null
    }
  });
};
