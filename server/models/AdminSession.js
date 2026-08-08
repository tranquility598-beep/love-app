const mongoose = require('mongoose');

const adminSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  csrfHash: { type: String, required: true, select: false },
  twoFactorMethod: { type: String, enum: ['email', 'totp', 'recovery', 'bootstrap'], required: true },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '', maxlength: 500 },
  lastSeenAt: { type: Date, default: Date.now, index: true },
  expiresAt: { type: Date, required: true },
  revokedAt: { type: Date, default: null }
}, { timestamps: true });

adminSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AdminSession', adminSessionSchema);
