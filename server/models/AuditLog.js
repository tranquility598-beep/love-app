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
    enum: ['user', 'server', 'message', 'announcement', 'role']
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
  // Время создания записи
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
