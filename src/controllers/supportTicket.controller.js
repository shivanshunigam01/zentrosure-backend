const SupportTicket = require('../models/SupportTicket');
const User = require('../models/User');
const ApiError = require('../utils/apiError');
const { ok } = require('../utils/response');
const { generateTicketNumber } = require('../utils/ids');

function mapTicket(t) {
  if (!t) return null;
  const o = t.toObject ? t.toObject() : t;
  return o;
}

exports.create = async (req, res) => {
  const subject = String(req.body.subject || '').trim();
  const message = String(req.body.message || '').trim();
  const category = String(req.body.category || 'other').trim();
  if (!subject) throw new ApiError(400, 'Subject is required', 'VALIDATION_ERROR');
  if (message.length < 5) throw new ApiError(400, 'Message must be at least 5 characters', 'VALIDATION_ERROR');
  const allowed = ['booking', 'billing', 'report', 'technical', 'other'];
  const cat = allowed.includes(category) ? category : 'other';

  const u = await User.findById(req.user.id).lean();
  const authorName = u && u.name ? String(u.name) : 'Customer';

  const ticketNumber = await generateTicketNumber();
  const doc = await SupportTicket.create({
    ticketNumber,
    customerId: req.user.id,
    subject,
    category: cat,
    status: 'open',
    messages: [
      {
        at: new Date(),
        authorRole: 'customer',
        authorId: req.user.id,
        authorName,
        body: message
      }
    ]
  });
  ok(res, mapTicket(doc), 201);
};

exports.listMine = async (req, res) => {
  const page = Math.max(Number(req.query.page || 1), 1);
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    SupportTicket.find({ customerId: req.user.id })
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    SupportTicket.countDocuments({ customerId: req.user.id })
  ]);
  const list = rows.map((r) => ({
    ticketNumber: r.ticketNumber,
    subject: r.subject,
    category: r.category,
    status: r.status,
    messageCount: Array.isArray(r.messages) ? r.messages.length : 0,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }));
  ok(res, { list, total, page, limit });
};

exports.getMine = async (req, res) => {
  const ticketNumber = String(req.params.ticketNumber || '').trim();
  const t = await SupportTicket.findOne({ ticketNumber, customerId: req.user.id })
    .populate('customerId', 'name email phone')
    .lean();
  if (!t) throw new ApiError(404, 'Ticket not found', 'NOT_FOUND');
  ok(res, t);
};

exports.addCustomerMessage = async (req, res) => {
  const ticketNumber = String(req.params.ticketNumber || '').trim();
  const body = String(req.body.message || '').trim();
  if (body.length < 1) throw new ApiError(400, 'Message is required', 'VALIDATION_ERROR');

  const t = await SupportTicket.findOne({ ticketNumber, customerId: req.user.id });
  if (!t) throw new ApiError(404, 'Ticket not found', 'NOT_FOUND');
  if (t.status === 'closed') {
    throw new ApiError(409, 'This ticket is closed. Open a new ticket if you need more help.', 'INVALID_STATE');
  }

  const u = await User.findById(req.user.id).lean();
  const authorName = u && u.name ? String(u.name) : 'Customer';
  t.messages.push({
    at: new Date(),
    authorRole: 'customer',
    authorId: req.user.id,
    authorName,
    body
  });
  if (t.status === 'resolved') t.status = 'open';
  await t.save();
  ok(res, mapTicket(t));
};
