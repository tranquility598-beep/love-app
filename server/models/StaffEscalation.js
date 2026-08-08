const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
  action: { type: String, enum: ['created', 'accepted', 'resolved', 'cancelled'], required: true },
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  note: { type: String, maxlength: 2000, default: '' },
  at: { type: Date, default: Date.now }
}, { _id: false });

const staffEscalationSchema = new mongoose.Schema({
  number: { type: String, required: true, unique: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requestedRole: { type: String, required: true },
  summary: { type: String, required: true, maxlength: 3000 },
  conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffConversation', default: null },
  message: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffMessage', default: null },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  handoffConversation: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffConversation', default: null },
  status: { type: String, enum: ['open', 'accepted', 'resolved', 'cancelled'], default: 'open', index: true },
  resolution: { type: String, maxlength: 3000, default: '' },
  history: { type: [historySchema], default: [] }
}, { timestamps: true });

staffEscalationSchema.index({ status: 1, requestedRole: 1, createdAt: -1 });

module.exports = mongoose.model('StaffEscalation', staffEscalationSchema);
