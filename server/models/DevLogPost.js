const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  kind: { type: String, enum: ['image', 'video'], required: true },
  url: { type: String, required: true },
  alt: { type: String, default: '', maxlength: 200 }
}, { _id: true });

const devLogPostSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  body: { type: String, required: true, trim: true, maxlength: 20000 },
  tags: { type: [String], default: [] },
  media: { type: [mediaSchema], default: [] },
  status: { type: String, enum: ['draft', 'scheduled', 'published', 'archived'], default: 'draft', index: true },
  archivedFromStatus: { type: String, enum: ['draft', 'scheduled', 'published'], default: null },
  archivedAt: { type: Date, default: null },
  publishedAt: { type: Date, default: null, index: true },
  scheduledAt: { type: Date, default: null, index: true },
  upVotes: { type: Number, default: 0 },
  downVotes: { type: Number, default: 0 },
  commentCount: { type: Number, default: 0 }
}, { timestamps: true });

devLogPostSchema.index({ status: 1, publishedAt: -1 });

module.exports = mongoose.model('DevLogPost', devLogPostSchema);
