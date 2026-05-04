const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');

exports.list = async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  const skip = (page - 1) * limit;
  const status = String(req.query.status || '').trim().toLowerCase();
  const filter = {};
  if (['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
    filter.status = status;
  }

  const [rows, total] = await Promise.all([
    SupportTicket.find(filter)
      .populate('customerId', 'name email phone')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SupportTicket.countDocuments(filter)
  ]);

  const list = rows.map((r) => ({
    ticketNumber: r.ticketNumber,
    subject: r.subject,
    category: r.category,
    status: r.status,
    messageCount: Array.isArray(r.messages) ? r.messages.length : 0,
    customer:
      r.customerId && typeof r.customerId === 'object'
        ? {
            name: r.customerId.name,
            email: r.customerId.email,
            phone: r.customerId.phone
          }
        : null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }));
  ok(res, { list, total, page, limit });
};

exports.get = async (req, res) => {
  const ticketNumber = String(req.params.ticketNumber || '').trim();
  const t = await SupportTicket.findOne({ ticketNumber }).populate('customerId', 'name email phone').lean();
  if (!t) throw new ApiError(404, 'Ticket not found', 'NOT_FOUND');
  ok(res, t);
};

exports.patchStatus = async (req, res) => {
  const ticketNumber = String(req.params.ticketNumber || '').trim();
  const status = String(req.body.status || '').trim().toLowerCase();
  if (!['open', 'in_progress', 'resolved', 'closed'].includes(status)) {
    throw new ApiError(400, 'Invalid status', 'VALIDATION_ERROR');
  }
  const t = await SupportTicket.findOne({ ticketNumber });
  if (!t) throw new ApiError(404, 'Ticket not found', 'NOT_FOUND');
  t.status = status;
  await t.save();
  ok(res, t.toObject());
};

exports.addReply = async (req, res) => {
  const ticketNumber = String(req.params.ticketNumber || '').trim();
  const body = String(req.body.message || '').trim();
  if (body.length < 1) throw new ApiError(400, 'Message is required', 'VALIDATION_ERROR');

  const t = await SupportTicket.findOne({ ticketNumber });
  if (!t) throw new ApiError(404, 'Ticket not found', 'NOT_FOUND');

  const u = await User.findById(req.user.id).lean();
  const authorName = u && u.name ? String(u.name) : 'Admin';

  t.messages.push({
    at: new Date(),
    authorRole: 'admin',
    authorId: req.user.id,
    authorName,
    body
  });
  if (t.status === 'open') t.status = 'in_progress';
  await t.save();
  ok(res, t.toObject());
};
