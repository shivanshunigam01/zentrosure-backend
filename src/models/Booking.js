const mongoose = require('mongoose');

const CHECKLIST_FIELD = new mongoose.Schema({
  id: String,
  label: String,
  /** Template column e.g. dropdown, photo, text — not shown as instructions. */
  fieldType: { type: String, trim: true, default: '' },
  instructions: String,
  required: { type: Boolean, default: false },
  minPhotos: { type: Number, default: 0 },
  /** Inspector can pick health/severity per checklist row (OK/NOK/Minor/Major). */
  enableCondition: { type: Boolean, default: true },
  conditionOptions: {
    type: [String],
    default: ['OK', 'NOK', 'Minor', 'Major']
  },
  /** Inspector can write a free-text remark for this row. */
  enableRemarks: { type: Boolean, default: true }
}, { _id: false });

const CAPTURED_IMAGE = new mongoose.Schema({
  storageUrl: String,
  dataUrl: String,
  capturedAt: Date,
  latitude: Number,
  longitude: Number,
  address: String,
  fieldId: String,
  originalName: String,
  mimeType: String,
  size: Number
}, { _id: false });

const FIELD_SUBMISSION = new mongoose.Schema({
  fieldId: String,
  images: [CAPTURED_IMAGE],
  notes: String,
  condition: String
}, { _id: false });

const INSPECTOR_SUBMISSION = new mongoose.Schema({
  submittedAt: Date,
  inspectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inspector' },
  inspectorName: String,
  fields: [FIELD_SUBMISSION],
  overallNotes: String
}, { _id: false });

const REPORT_DATA = new mongoose.Schema({
  reportId: { type: String, index: true },
  publishedAt: Date,
  score: Number,
  verdict: String,
  adminNotes: String,
  highlights: [String]
}, { _id: false });

const bookingSchema = new mongoose.Schema({
  bookingNumber: { type: String, required: true, unique: true, index: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  customerName: String,
  phone: String,
  serviceSlug: { type: String, required: true, index: true },
  vehicleDescription: { type: String, required: true },
  /** PDI / retail detail (optional; used for admin export and records). */
  chassisNumber: { type: String, trim: true },
  engineNumber: { type: String, trim: true },
  /** Model line as on invoice or factory (separate from free-text vehicleDescription). */
  vehicleModel: { type: String, trim: true },
  vehicleSubmodel: { type: String, trim: true },
  invoiceNumber: { type: String, trim: true },
  invoiceDate: { type: Date },
  /** Dealer / showroom contact (phone). */
  dealerContactPhone: { type: String, trim: true },
  city: { type: String, required: true, index: true },
  scheduledDate: { type: Date, required: true },
  slot: String,
  address: String,
  /** Pre-delivery / showroom: dealer or outlet where the vehicle is inspected. */
  dealerName: { type: String, trim: true },
  /** Short location hint (area, landmark, city zone). */
  dealerLocation: { type: String, trim: true },
  dealerAddress: { type: String, trim: true },
  /** Showroom / dealer pin — optional; set when customer captures GPS at the outlet. */
  dealerLatitude: Number,
  dealerLongitude: Number,
  /** Customer inspection site — set when address saved with GPS (for on-site verification). */
  addressLatitude: Number,
  addressLongitude: Number,
  /** Set when an inspector upload GPS position is within radius of addressLatitude/Longitude. */
  visitVerifiedAt: Date,
  amount: { type: Number, default: 0 },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'refunded'], default: 'pending' },
  /** Latest Razorpay order id for this checkout attempt (webhook + support lookup). */
  razorpayLastOrderId: { type: String, trim: true, index: true },
  status: {
    type: String,
    enum: ['Pending', 'Assigned', 'Awaiting Inspector', 'Submitted for Review', 'Sent Back', 'Verified', 'Report Published', 'Cancelled'],
    default: 'Pending', index: true
  },
  inspectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Inspector' },
  assignmentStatus: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  assignmentRespondedAt: Date,
  assignmentRejectionNote: String,
  checklist: [CHECKLIST_FIELD],
  checklistLocked: { type: Boolean, default: false },
  checklistLockedAt: Date,
  checklistTemplateTitle: String,
  uploadedImages: [CAPTURED_IMAGE],
  submission: INSPECTOR_SUBMISSION,
  report: REPORT_DATA,
  history: [{ at: { type: Date, default: Date.now }, event: String, meta: mongoose.Schema.Types.Mixed }]
}, { timestamps: true });

module.exports = mongoose.model('Booking', bookingSchema);
