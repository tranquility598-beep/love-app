/**
 * Модель пользователя
 * Хранит данные аккаунта, профиля и настройки
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Основные данные
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 32
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  
  // Профиль
  avatar: {
    type: String,
    default: null // URL аватара
  },
  discriminator: {
    type: String,
    default: () => Math.floor(1000 + Math.random() * 9000).toString() // #1234
  },
  bio: {
    type: String,
    maxlength: 190,
    default: ''
  },
  
  // Статус
  status: {
    type: String,
    enum: ['online', 'idle', 'dnd', 'offline'],
    default: 'offline'
  },
  customStatus: {
    type: String,
    maxlength: 128,
    default: ''
  },
  
  // Серверы пользователя
  servers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server'
  }],
  
  // Друзья
  friends: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Входящие запросы в друзья
  friendRequestsReceived: [{
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Исходящие запросы в друзья
  friendRequestsSent: [{
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Заблокированные пользователи
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Настройки
  settings: {
    theme: { type: String, default: 'dark' },
    language: { type: String, default: 'ru' },
    notifications: { type: Boolean, default: true },
    soundEnabled: { type: Boolean, default: true },
    micEnabled: { type: Boolean, default: true }
  },
  
  // Дата создания
  createdAt: {
    type: Date,
    default: Date.now
  },
  
  // Последний онлайн
  lastSeen: {
    type: Date,
    default: Date.now
  }
});

// Хешируем пароль перед сохранением
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Метод для проверки пароля
userSchema.methods.comparePassword = async function(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Метод для получения публичного профиля (без пароля)
userSchema.methods.toPublicJSON = function() {
  return {
    _id: this._id,
    username: this.username,
    discriminator: this.discriminator,
    avatar: this.avatar,
    bio: this.bio,
    status: this.status,
    customStatus: this.customStatus,
    createdAt: this.createdAt,
    lastSeen: this.lastSeen
  };
};

module.exports = mongoose.model('User', userSchema);
