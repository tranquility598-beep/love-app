/**
 * Модель личного диалога (Direct Message)
 * Хранит информацию о личных переписках между пользователями
 */

const mongoose = require('mongoose');

const directMessageSchema = new mongoose.Schema({
  // Участники диалога (всегда 2 пользователя)
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  
  // Канал для этого диалога
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: true
  },
  
  // Последнее сообщение
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  
  // Непрочитанные сообщения для каждого участника
  unreadCount: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    count: {
      type: Number,
      default: 0
    }
  }],
  
  // Дата создания
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // Дата последней активности
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Обновляем updatedAt при изменении
directMessageSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('DirectMessage', directMessageSchema);
