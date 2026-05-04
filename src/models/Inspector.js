const mongoose = require('mongoose');

const inspectorSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  inspectorCode: { type: String, required: true, unique: true, trim: true },
  city: { type: String, trim: true },
  rating: { type: Number, default: 0 },
  jobsCompleted: { type: Number, default: 0 },
  status: { type: String, enum: ['Active', 'On Job', 'Suspended'], default: 'Active' },
  specialisations: [{ type: String, trim: true }],
  /** Last known inspector GPS ping (for live map + admin tracking). */
  currentLocation: {
    lat: { type: Number },
    lng: { type: Number },
    address: { type: String, trim: true },
    accuracyM: { type: Number },
    capturedAt: { type: Date },
    bookingNumber: { type: String, trim: true },
    source: { type: String, default: 'browser-gps' }
  },
  /** Rolling location points for audit/tracking (most recent 200). */
  locationHistory: [
    {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      address: { type: String, trim: true },
      accuracyM: { type: Number },
      capturedAt: { type: Date, required: true },
      bookingNumber: { type: String, trim: true },
      source: { type: String, default: 'browser-gps' }
    }
  ]
}, { timestamps: true });

module.exports = mongoose.model('Inspector', inspectorSchema);
