/**
 * Модель канала
 * Текстовые и голосовые каналы внутри серверов
 */

const mongoose = require('mongoose');

const channelSchema = new mongoose.Schema({
  // Название канала
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 100
  },
  
  // Тип канала
  type: {
    type: String,
    enum: ['text', 'voice', 'announcement', 'dm'],
    default: 'text'
  },
  
  // Описание канала
  topic: {
    type: String,
    maxlength: 1024,
    default: ''
  },
  
  // Сервер к которому принадлежит канал
  server: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    default: null // null для DM каналов
  },
  
  // Позиция в списке каналов
  position: {
    type: Number,
    default: 0
  },
  
  // Категория канала
  category: {
    type: String,
    default: null
  },
  
  // Участники (для DM каналов)
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Текущие участники голосового канала
  voiceMembers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    muted: { type: Boolean, default: false },
    deafened: { type: Boolean, default: false },
    joinedAt: { type: Date, default: Date.now }
  }],
  
  // Последнее сообщение
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  
  // Закрепленные сообщения
  pinnedMessages: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  }],
  
  // Настройки канала
  settings: {
    slowMode: { type: Number, default: 0 }, // секунды
    nsfw: { type: Boolean, default: false },
    bitrate: { type: Number, default: 64000 }, // для голосовых каналов
    userLimit: { type: Number, default: 0 } // 0 = безлимит
  },
  
  // Дата создания
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Channel', channelSchema);
