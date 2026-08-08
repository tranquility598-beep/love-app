const mongoose = require('mongoose');

const communityVoteSchema = new mongoose.Schema({
  targetType: { type: String, enum: ['idea', 'devlog'], required: true },
  target: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  value: { type: Number, enum: [-1, 1], required: true }
}, { timestamps: true });

communityVoteSchema.index({ targetType: 1, target: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('CommunityVote', communityVoteSchema);
