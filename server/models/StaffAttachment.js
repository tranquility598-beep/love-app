const mongoose = require('mongoose');

const staffAttachmentSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffConversation', required: true, index: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  message: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffMessage', default: null, index: true },
  originalName: { type: String, required: true, maxlength: 255 },
  storageName: { type: String, required: true, unique: true },
  size: { type: Number, required: true, min: 1 },
  mimetype: { type: String, required: true, maxlength: 160 },
  kind: { type: String, enum: ['image', 'document', 'archive'], default: 'document' },
  expiresAt: { type: Date, default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) }
}, { timestamps: true });

staffAttachmentSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('StaffAttachment', staffAttachmentSchema);
