const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema({
  kind: { type: String, enum: ['message', 'image', 'file', 'link', 'note'], required: true },
  referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  url: { type: String, default: '' },
  label: { type: String, default: '', maxlength: 200 }
}, { _id: false });

const moderationActionSchema = new mongoose.Schema({
  targetUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: {
    type: String,
    enum: ['warning', 'mute', 'ban', 'revoke', 'deactivate', 'restore', 'device_block', 'device_unblock'],
    required: true,
    index: true
  },
  reason: { type: String, required: true, trim: true, maxlength: 1000 },
  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null, index: true },
  permanent: { type: Boolean, default: false },
  case: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', default: null, index: true },
  reverses: { type: mongoose.Schema.Types.ObjectId, ref: 'ModerationAction', default: null, index: true },
  evidence: { type: [evidenceSchema], default: [] },
  automatic: { type: Boolean, default: false },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  sourceKey: { type: String }
}, { timestamps: true });

moderationActionSchema.index({ targetUser: 1, createdAt: -1 });
moderationActionSchema.index({ type: 1, expiresAt: 1 });
moderationActionSchema.index(
  { sourceKey: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $type: 'string' } } }
);

function rejectModerationMutation() {
  throw new Error('ModerationAction entries are immutable');
}

moderationActionSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], rejectModerationMutation);

module.exports = mongoose.model('ModerationAction', moderationActionSchema);
