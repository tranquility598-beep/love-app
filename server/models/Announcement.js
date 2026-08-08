const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  content: { type: String, required: true, trim: true, maxlength: 4000 },
  type: { type: String, enum: ['silent', 'normal', 'global'], default: 'normal', index: true },
  status: { type: String, enum: ['published', 'archived'], default: 'published', index: true },
  publishedAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

announcementSchema.index({ status: 1, publishedAt: -1 });

module.exports = mongoose.model('Announcement', announcementSchema);
