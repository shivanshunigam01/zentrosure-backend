const mongoose = require('mongoose');
const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  action: String,
  entityType: String,
  entityId: String,
  meta: mongoose.Schema.Types.Mixed
}, { timestamps: true });
module.exports = mongoose.model('AuditLog', auditLogSchema);
