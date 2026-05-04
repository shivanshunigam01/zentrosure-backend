const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { ok } = require('../utils/response');

exports.list = async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 40), 1), 200);
  const skip = (page - 1) * limit;
  const q = String(req.query.q || '').trim();

  const match = {};
  if (q) {
    match.$or = [
      { 'history.event': new RegExp(q, 'i') },
      { bookingNumber: new RegExp(q, 'i') }
    ];
  }

  const [rowsRaw, totalRows] = await Promise.all([
    Booking.aggregate([
      { $match: match },
      { $project: { bookingNumber: 1, history: 1 } },
      { $unwind: '$history' },
      { $sort: { 'history.at': -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          bookingNumber: 1,
          at: '$history.at',
          event: '$history.event',
          meta: '$history.meta'
        }
      }
    ]),
    Booking.aggregate([
      { $match: match },
      { $project: { history: 1 } },
      { $unwind: '$history' },
      { $count: 'count' }
    ])
  ]);

  const ids = Array.from(
    new Set(
      rowsRaw
        .map((r) => r?.meta?.by)
        .filter((v) => v && mongoose.Types.ObjectId.isValid(String(v)))
        .map((v) => String(v))
    )
  );
  const users = ids.length
    ? await User.find({ _id: { $in: ids } }).select('name email role').lean()
    : [];
  const byMap = new Map(users.map((u) => [String(u._id), u]));

  const rows = rowsRaw.map((r) => {
    const byId = r?.meta?.by ? String(r.meta.by) : '';
    const actor = byId && byMap.has(byId) ? byMap.get(byId) : null;
    return {
      at: r.at,
      bookingNumber: r.bookingNumber,
      event: r.event || '—',
      actor: actor
        ? {
            id: String(actor._id),
            name: actor.name || 'User',
            email: actor.email || '',
            role: actor.role || ''
          }
        : null,
      meta: r.meta || {}
    };
  });

  const total = totalRows[0]?.count || 0;
  ok(res, rows, 200, { page, limit, total });
};

