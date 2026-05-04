const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
  phone: { type: String, trim: true, unique: true, sparse: true },
  passwordHash: { type: String, select: false },
  name: { type: String, required: true, trim: true },
  role: { type: String, enum: ['customer', 'admin', 'inspector'], default: 'customer', index: true },
  inspectorProfileId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inspector' },
  /**
   * Optional per-user module access (used by UI + route guards).
   * When empty, frontend falls back to full defaults for role.
   */
  moduleAccess: {
    customer: [{ type: String, trim: true }],
    inspector: [{ type: String, trim: true }],
    admin: [{ type: String, trim: true }]
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
