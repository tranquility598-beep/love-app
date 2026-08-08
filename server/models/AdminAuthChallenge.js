const mongoose = require('mongoose');

const adminAuthChallengeSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  emailCodeHash: { type: String, default: null, select: false },
  emailCodeSentAt: { type: Date, default: null },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

adminAuthChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AdminAuthChallenge', adminAuthChallengeSchema);
