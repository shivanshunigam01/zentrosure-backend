const mongoose = require('mongoose');
const contactLeadSchema = new mongoose.Schema({
  name: String,
  email: String,
  phone: String,
  message: String,
  phoneVerified: { type: Boolean, default: false },
  source: { type: String, default: 'contact-form' }
}, { timestamps: true });
module.exports = mongoose.model('ContactLead', contactLeadSchema);
