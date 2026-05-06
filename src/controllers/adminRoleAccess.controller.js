const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');

const ROLE_MODULES = {
  customer: ['dashboard', 'bookings', 'new', 'services', 'reports', 'certificates', 'payments', 'verify', 'support', 'profile'],
  inspector: ['today', 'tasks', 'checklist', 'route', 'history', 'profile'],
  admin: ['dashboard', 'bookings', 'inspectors', 'customers', 'enterprise', 'vehicles', 'qc', 'payments', 'invoices', 'coupons', 'blog', 'faqs', 'cities', 'model-images', 'testimonials', 'notifications', 'audit', 'roles', 'support']
};

function sanitizeModuleAccess(raw = {}) {
  return {
    customer: Array.isArray(raw.customer)
      ? raw.customer.filter((k) => ROLE_MODULES.customer.includes(String(k)))
      : undefined,
    inspector: Array.isArray(raw.inspector)
      ? raw.inspector.filter((k) => ROLE_MODULES.inspector.includes(String(k)))
      : undefined,
    admin: Array.isArray(raw.admin)
      ? raw.admin.filter((k) => ROLE_MODULES.admin.includes(String(k)))
      : undefined
  };
}

exports.catalog = async (_req, res) => {
  ok(res, ROLE_MODULES);
};

exports.listUsers = async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
  const skip = (page - 1) * limit;
  const role = String(req.query.role || '').trim();
  const q = String(req.query.q || '').trim();

  const filter = {};
  if (['admin', 'customer', 'inspector'].includes(role)) filter.role = role;
  if (q) {
    const rx = new RegExp(q, 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const [rows, total] = await Promise.all([
    User.find(filter)
      .sort('-createdAt')
      .skip(skip)
      .limit(limit)
      .select('name email phone role inspectorProfileId moduleAccess createdAt')
      .lean(),
    User.countDocuments(filter)
  ]);

  ok(
    res,
    rows.map((u) => ({
      id: String(u._id),
      name: u.name || 'User',
      email: u.email || '',
      phone: u.phone || '',
      role: u.role,
      hasInspectorProfile: Boolean(u.inspectorProfileId),
      moduleAccess: u.moduleAccess || {}
    })),
    200,
    { page, limit, total }
  );
};

exports.updateUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found', 'NOT_FOUND');

  const patch = {};
  if (req.body.role !== undefined) {
    const role = String(req.body.role || '').trim();
    if (!['admin', 'customer', 'inspector'].includes(role)) {
      throw new ApiError(400, 'Invalid role', 'VALIDATION_ERROR');
    }
    if (role === 'inspector' && !user.inspectorProfileId) {
      throw new ApiError(409, 'Create inspector profile before setting inspector role', 'INSPECTOR_PROFILE_REQUIRED');
    }
    patch.role = role;
  }
  if (req.body.moduleAccess !== undefined) {
    const sa = sanitizeModuleAccess(req.body.moduleAccess || {});
    patch.moduleAccess = {
      customer: sa.customer ?? user.moduleAccess?.customer ?? [],
      inspector: sa.inspector ?? user.moduleAccess?.inspector ?? [],
      admin: sa.admin ?? user.moduleAccess?.admin ?? []
    };
  }

  const updated = await User.findByIdAndUpdate(user._id, patch, { new: true, runValidators: true })
    .select('name email phone role inspectorProfileId moduleAccess')
    .lean();

  ok(res, {
    id: String(updated._id),
    name: updated.name || 'User',
    email: updated.email || '',
    phone: updated.phone || '',
    role: updated.role,
    hasInspectorProfile: Boolean(updated.inspectorProfileId),
    moduleAccess: updated.moduleAccess || {}
  });
};

