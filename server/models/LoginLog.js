/**
 * Модель истории входов
 * Хранит IP, устройство и время каждой попытки входа
 */

const mongoose = require('mongoose');

const loginLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    index: true
  },
  ip: {
    type: String,
    default: 'unknown'
  },
  userAgent: {
    type: String,
    default: 'unknown'
  },
  location: {
    type: String,
    default: 'Неизвестно'
  },
  status: {
    type: String,
    enum: ['success', 'failed', 'locked'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('LoginLog', loginLogSchema);
