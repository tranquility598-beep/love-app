const mongoose = require('mongoose');

const analyticsDailySchema = new mongoose.Schema({
  date: { type: String, required: true, unique: true, index: true },
  registrations: { type: Number, default: 0 },
  verifications: { type: Number, default: 0 },
  messages: { type: Number, default: 0 },
  calls: { type: Number, default: 0 },
  servers: { type: Number, default: 0 },
  cases: { type: Number, default: 0 },
  punishments: { type: Number, default: 0 },
  peakOnline: { type: Number, default: 0 },
  averageOnline: { type: Number, default: 0 },
  onlineSamples: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('AnalyticsDaily', analyticsDailySchema);
