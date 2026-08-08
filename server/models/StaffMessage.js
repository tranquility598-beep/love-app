const mongoose = require('mongoose');

const revisionSchema = new mongoose.Schema({
  content: { type: String, maxlength: 8000, default: '' },
  editedAt: { type: Date, default: Date.now },
  editedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { _id: false });

const staffMessageSchema = new mongoose.Schema({
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffConversation', required: true, index: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  content: { type: String, maxlength: 8000, default: '' },
  attachments: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StaffAttachment' }],
  replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffMessage', default: null },
  revisions: { type: [revisionSchema], default: [], select: false },
  editedAt: { type: Date, default: null },
  deletedAt: { type: Date, default: null, index: true },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

staffMessageSchema.index({ conversation: 1, createdAt: -1 });

module.exports = mongoose.model('StaffMessage', staffMessageSchema);
