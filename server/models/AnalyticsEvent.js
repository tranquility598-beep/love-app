const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['call_started', 'call_ended'],
    required: true,
    index: true
  },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  relatedUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  occurredAt: { type: Date, default: Date.now, index: true }
}, { timestamps: true });

analyticsEventSchema.index({ type: 1, occurredAt: -1 });

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
