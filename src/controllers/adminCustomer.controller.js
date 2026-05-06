const mongoose = require('mongoose');
const User = require('../models/User');
const CustomerProfile = require('../models/CustomerProfile');
const Booking = require('../models/Booking');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** List retail customers (User.role === customer) with optional profile + booking counts. */
exports.list = async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Number(req.query.limit || 25), 100);
  const q = (req.query.q || '').trim();

  const filter = { role: 'customer' };
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { email: rx }, { phone: rx }];
  }

  const [users, total] = await Promise.all([
    User.find(filter).select('-passwordHash').sort('-createdAt').skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);

  const ids = users.map((u) => u._id);
  const [profiles, bookingAgg] = await Promise.all([
    CustomerProfile.find({ userId: { $in: ids } }).lean(),
    ids.length
      ? Booking.aggregate([
          { $match: { customerId: { $in: ids } } },
          { $group: { _id: '$customerId', bookings: { $sum: 1 } } },
          { $project: { _id: { $toString: '$_id' }, bookings: 1 } },
        ])
      : [],
  ]);

  const profileByUserId = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));
  const bookingsByCustomer = Object.fromEntries(bookingAgg.map((r) => [String(r._id), r.bookings]));

  const customers = users.map((u) => {
    const pid = String(u._id);
    const prof = profileByUserId[pid];
    return {
      id: u._id,
      name: u.name,
      email: u.email || '',
      phone: u.phone || '',
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
      bookingsCount: bookingsByCustomer[pid] || 0,
      profile: prof
        ? {
            city: prof.city || '',
            state: prof.state || '',
            pincode: prof.pincode || '',
            avatarUrl: prof.avatarUrl || '',
            address: prof.address || '',
          }
        : null,
    };
  });

  ok(res, { customers, total, page, limit });
};

/** All bookings for a retail customer (admin drill-down from Customers table). */
exports.listBookingsForCustomer = async (req, res) => {
  const rawId = String(req.params.customerId || '').trim();
  if (!mongoose.Types.ObjectId.isValid(rawId)) {
    throw new ApiError(400, 'Invalid customer id', 'VALIDATION_ERROR');
  }
  const user = await User.findById(rawId).select('_id role name').lean();
  if (!user || user.role !== 'customer') {
    throw new ApiError(404, 'Customer not found', 'NOT_FOUND');
  }

  const rows = await Booking.find({ customerId: user._id })
    .sort('-createdAt')
    .select(
      'bookingNumber serviceSlug vehicleDescription city status paymentStatus scheduledDate slot amount createdAt',
    )
    .lean();

  const bookings = rows.map((b) => ({
    bookingNumber: b.bookingNumber,
    serviceSlug: b.serviceSlug || '',
    vehicleDescription: b.vehicleDescription || '',
    city: b.city || '',
    status: b.status || '',
    paymentStatus: b.paymentStatus || 'pending',
    scheduledDate: b.scheduledDate,
    slot: b.slot || '',
    amount: b.amount ?? 0,
    createdAt: b.createdAt,
  }));

  ok(res, {
    customerId: String(user._id),
    customerName: user.name || '',
    bookings,
    total: bookings.length,
  });
};
