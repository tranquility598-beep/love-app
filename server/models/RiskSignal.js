const mongoose = require('mongoose');

const riskSignalSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  kind: { type: String, enum: ['ip', 'device'], required: true },
  valueHash: { type: String, required: true, index: true },
  displayValue: { type: String, default: '', select: false },
  blocked: { type: Boolean, default: false, index: true },
  reason: { type: String, default: '', maxlength: 500 },
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  lastSeenAt: { type: Date, default: Date.now }
}, { timestamps: true });

riskSignalSchema.index({ kind: 1, valueHash: 1 }, { unique: true });

module.exports = mongoose.model('RiskSignal', riskSignalSchema);
