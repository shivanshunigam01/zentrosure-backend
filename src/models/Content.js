const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema({
  slug: { type: String, unique: true, required: true },
  title: String,
  excerpt: String,
  content: String,
  coverImage: String,
  published: { type: Boolean, default: false }
}, { timestamps: true });

const faqSchema = new mongoose.Schema({ question: String, answer: String, active: { type: Boolean, default: true } }, { timestamps: true });
const cityPageSchema = new mongoose.Schema({ city: { type: String, unique: true }, slug: String, content: String, active: { type: Boolean, default: true } }, { timestamps: true });
const testimonialSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  city: { type: String, trim: true, default: '' },
  quote: { type: String, required: true, trim: true },
  rating: { type: Number, min: 1, max: 5, default: 5 },
  active: { type: Boolean, default: true },
}, { timestamps: true });
const checklistFieldSchema = new mongoose.Schema({
  id: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true },
  section: { type: String, default: '', trim: true },
  checklistTitle: { type: String, default: '', trim: true },
  fieldType: { type: String, default: '', trim: true },
  instructions: { type: String, default: '', trim: true },
  photoRequired: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0 },
  required: { type: Boolean, default: false },
  minPhotos: { type: Number, default: 0 },
  enableCondition: { type: Boolean, default: true },
  conditionOptions: { type: [String], default: ['OK', 'NOK', 'Minor', 'Major'] },
  enableRemarks: { type: Boolean, default: true },
}, { _id: false });
const checklistTemplateSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  serviceSlug: { type: String, required: true, trim: true, lowercase: true, index: true },
  sourceFileName: { type: String, default: '', trim: true },
  fields: { type: [checklistFieldSchema], default: [] },
  locked: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
}, { timestamps: true });
const popularModelImageSchema = new mongoose.Schema({
  vehicleType: { type: String, required: true, trim: true },
  modelName: { type: String, required: true, trim: true },
  brand: { type: String, trim: true, default: '' },
  segment: { type: String, trim: true, default: '' },
  imageUrl: { type: String, trim: true, default: '' },
  active: { type: Boolean, default: true }
}, { timestamps: true });

popularModelImageSchema.index({ vehicleType: 1, modelName: 1 }, { unique: true });

module.exports = {
  BlogPost: mongoose.model('BlogPost', blogPostSchema),
  Faq: mongoose.model('Faq', faqSchema),
  CityPage: mongoose.model('CityPage', cityPageSchema),
  Testimonial: mongoose.model('Testimonial', testimonialSchema),
  ChecklistTemplate: mongoose.model('ChecklistTemplate', checklistTemplateSchema),
  PopularModelImage: mongoose.model('PopularModelImage', popularModelImageSchema)
};
