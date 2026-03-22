/**
 * Модель сервера (гильдии)
 * Хранит данные сервера, каналы и участников
 */

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const serverSchema = new mongoose.Schema({
  // Основные данные
  name: {
    type: String,
    required: true,
    trim: true,
    minlength: 2,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500,
    default: ''
  },
  icon: {
    type: String,
    default: null // URL иконки сервера
  },
  banner: {
    type: String,
    default: null // URL баннера сервера
  },
  
  // Владелец сервера
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Участники сервера
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    nickname: {
      type: String,
      default: null
    },
    roles: [{
      type: String,
      default: 'member'
    }],
    joinedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Каналы сервера
  channels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel'
  }],
  
  // Категории каналов
  categories: [{
    name: {
      type: String,
      required: true
    },
    position: {
      type: Number,
      default: 0
    },
    channels: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel'
    }]
  }],
  
  // Роли сервера
  roles: [{
    name: { type: String, required: true },
    color: { type: String, default: '#99aab5' },
    permissions: { type: [String], default: [] },
    position: { type: Number, default: 0 }
  }],
  
  // Инвайт-ссылки
  invites: [{
    code: {
      type: String,
      default: () => uuidv4().substring(0, 8).toUpperCase()
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    uses: {
      type: Number,
      default: 0
    },
    maxUses: {
      type: Number,
      default: 0 // 0 = безлимит
    },
    expiresAt: {
      type: Date,
      default: null // null = не истекает
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Настройки сервера
  settings: {
    isPublic: { type: Boolean, default: false },
    verificationLevel: { type: Number, default: 0 },
    defaultNotifications: { type: String, default: 'all' }
  },
  
  // Дата создания
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Server', serverSchema);
