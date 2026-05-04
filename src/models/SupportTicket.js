const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    authorRole: { type: String, enum: ['customer', 'admin'], required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    authorName: { type: String, trim: true, default: '' },
    body: { type: String, trim: true, required: true }
  },
  { _id: true }
);

const supportTicketSchema = new mongoose.Schema(
  {
    ticketNumber: { type: String, required: true, unique: true, index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    subject: { type: String, required: true, trim: true, maxlength: 200 },
    category: {
      type: String,
      enum: ['booking', 'billing', 'report', 'technical', 'other'],
      default: 'other'
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
      index: true
    },
    messages: [messageSchema]
  },
  { timestamps: true }
);

module.exports = mongoose.model('SupportTicket', supportTicketSchema);
