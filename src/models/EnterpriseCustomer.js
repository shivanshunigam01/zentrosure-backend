const mongoose = require('mongoose');

/** B2B / enterprise directory — insurers, fleets, dealers, lenders (CRM-style; not the same as retail User). */
const enterpriseCustomerSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true },
    legalName: { type: String, trim: true, default: '' },
    gstin: { type: String, trim: true, default: '' },
    /** Company PAN (Income Tax) — 10 chars, e.g. AAAAA9999A; optional CRM field for invoicing / TDS. */
    pan: { type: String, trim: true, uppercase: true, default: '' },
    contactName: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, lowercase: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    city: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    segment: {
      type: String,
      enum: ['Fleet', 'Insurer', 'NBFC', 'Dealer', 'OEM', 'Other'],
      default: 'Other',
    },
    status: {
      type: String,
      enum: ['Lead', 'Active', 'Inactive'],
      default: 'Lead',
    },
    notes: { type: String, trim: true, default: '' },
  },
  { timestamps: true },
);

enterpriseCustomerSchema.index({ companyName: 1 });
enterpriseCustomerSchema.index({ email: 1 });
enterpriseCustomerSchema.index({ phone: 1 });

module.exports = mongoose.model('EnterpriseCustomer', enterpriseCustomerSchema);
