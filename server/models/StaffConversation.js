const mongoose = require('mongoose');

const readStateSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  readAt: { type: Date, default: Date.now }
}, { _id: false });

const staffConversationSchema = new mongoose.Schema({
  type: { type: String, enum: ['general', 'direct'], required: true },
  key: { type: String, required: true, unique: true, index: true },
  title: { type: String, maxlength: 120, default: '' },
  participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffMessage', default: null },
  lastMessageAt: { type: Date, default: Date.now, index: true },
  readStates: { type: [readStateSchema], default: [] }
}, { timestamps: true });

staffConversationSchema.index({ participants: 1, lastMessageAt: -1 });

module.exports = mongoose.model('StaffConversation', staffConversationSchema);
