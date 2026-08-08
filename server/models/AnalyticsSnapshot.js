const mongoose = require('mongoose');

const analyticsSnapshotSchema = new mongoose.Schema({
  bucket: { type: Date, required: true, unique: true, index: true },
  uniqueUsers: { type: Number, default: 0 },
  sessions: { type: Number, default: 0 },
  voiceParticipants: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

analyticsSnapshotSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AnalyticsSnapshot', analyticsSnapshotSchema);
