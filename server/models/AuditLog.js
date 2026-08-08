/**
 * Модель лога аудита (AuditLog)
 * Хранит историю всех действий администраторов и модераторов
 */

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  // Кто совершил действие (Администратор/Модератор)
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Название действия (например, BAN_USER, UNBAN_USER, DELETE_MESSAGE, etc.)
  action: {
    type: String,
    required: true
  },
  // Тип объекта, над которым совершено действие
  targetType: {
    type: String,
    required: true,
    enum: [
      'user', 'server', 'message', 'announcement', 'role',
      'case', 'moderation_action', 'community', 'admin_session', 'risk_signal',
      'staff_conversation', 'staff_message', 'staff_escalation', 'staff_voice'
    ]
  },
  // ID объекта
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  // Дополнительные детали в свободном формате
  details: {
    type: mongoose.Schema.Types.Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ip: { type: String, default: '' },
  userAgent: { type: String, default: '', maxlength: 500 },
  // Время создания записи
  createdAt: {
    type: Date,
    default: Date.now
  }
});

auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

function rejectAuditMutation() {
  throw new Error('AuditLog entries are immutable');
}

auditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], rejectAuditMutation);

module.exports = mongoose.model('AuditLog', auditLogSchema);
