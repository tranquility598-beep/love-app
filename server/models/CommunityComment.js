const mongoose = require('mongoose');

const communityCommentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'DevLogPost', required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'CommunityComment', default: null },
  body: { type: String, required: true, trim: true, maxlength: 2000 },
  status: { type: String, enum: ['active', 'hidden', 'deleted'], default: 'active', index: true },
  moderatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  moderationReason: { type: String, default: '', maxlength: 500 }
}, { timestamps: true });

communityCommentSchema.index({ post: 1, status: 1, createdAt: 1 });

module.exports = mongoose.model('CommunityComment', communityCommentSchema);
