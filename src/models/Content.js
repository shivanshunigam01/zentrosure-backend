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

module.exports = {
  BlogPost: mongoose.model('BlogPost', blogPostSchema),
  Faq: mongoose.model('Faq', faqSchema),
  CityPage: mongoose.model('CityPage', cityPageSchema)
};
