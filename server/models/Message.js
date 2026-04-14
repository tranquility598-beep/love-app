/**
 * Модель сообщения
 * Текстовые сообщения в каналах и личных чатах
 */

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  // Содержимое сообщения
  content: {
    type: String,
    maxlength: 4000,
    default: ''
  },
  
  // Автор сообщения
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Канал в котором отправлено сообщение
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: true
  },
  
  // Сервер (если сообщение в серверном канале)
  server: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    default: null
  },
  
  // Тип сообщения
  type: {
    type: String,
    enum: ['default', 'system', 'reply', 'file', 'image'],
    default: 'default'
  },
  
  // Вложения (файлы, изображения)
  attachments: [{
    filename: String,
    originalName: String,
    url: String,
    size: Number,
    type: { type: String }, // 'image', 'file', 'video', 'audio'
    mimetype: String,
    width: Number, // для изображений
    height: Number // для изображений
  }],
  
  // Эмбеды (превью ссылок)
  embeds: [{
    title: String,
    description: String,
    url: String,
    color: Number,
    image: String,
    thumbnail: String
  }],
  
  // Реакции на сообщение
  reactions: [{
    emoji: {
      type: String,
      required: true
    },
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    count: {
      type: Number,
      default: 0
    }
  }],
  
  // Ответ на другое сообщение
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  
  // Упоминания
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Флаги
  pinned: {
    type: Boolean,
    default: false
  },
  edited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date,
    default: null
  },
  deleted: {
    type: Boolean,
    default: false
  },
  
  // Дата создания
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Индексы для быстрого поиска
messageSchema.index({ channel: 1, createdAt: -1 });
messageSchema.index({ author: 1 });

module.exports = mongoose.model('Message', messageSchema);
