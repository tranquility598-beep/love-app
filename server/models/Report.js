/**
 * Модель жалобы (Report)
 * Хранит жалобы пользователей на сообщения, других пользователей или серверы
 */

const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  // Кто пожаловался
  reporter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // На какого пользователя жалоба (опционально)
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  // На какой сервер жалоба (опционально)
  reportedServer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    default: null
  },
  // На какое сообщение жалоба (опционально)
  reportedMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  // Категория причины
  reason: {
    type: String,
    required: true,
    enum: ['spam', 'harassment', 'inappropriate_content', 'violence', 'other']
  },
  // Подробное описание жалобы
  description: {
    type: String,
    required: true,
    maxlength: 1000,
    trim: true
  },
  // Текущий статус рассмотрения
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved', 'dismissed'],
    default: 'pending'
  },
  // Действие, предпринятое модератором (если есть)
  moderatorAction: {
    type: String,
    default: ''
  },
  // Дата создания
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Report', reportSchema);
