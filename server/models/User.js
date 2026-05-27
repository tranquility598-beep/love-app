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
    required: function() {
      return !this.googleId; // Пароль обязателен только если нет Google ID
    },
    minlength: 8
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true // Позволяет иметь несколько документов с null значением
  },
  
  // Профиль
  nickname: {
    type: String,
    trim: true,
    maxlength: 32,
    default: function() {
      return this.username;
    }
  },
  avatar: {
    type: String,
    default: null // URL аватара
  },
  banner: {
    type: String,
    default: null // URL баннера профиля
  },
  role: {
    type: String,
    enum: ['user', 'owner', 'admin'],
    default: 'user'
  },
  bio: {
    type: String,
    maxlength: 190,
    default: ''
  },
  badges: [{
    type: String,
    enum: ['founder', 'verified', 'early_supporter', 'bug_hunter', 'developer', 'moderator', 'partner']
  }],
  profileColor: {
    type: String,
    default: '#5865F2' // Цвет профиля по умолчанию
  },
  
  // Интеграции и соцсети
  connectedAccounts: {
    youtube: {
      id: String,
      name: String,
      url: String,
      verified: { type: Boolean, default: false }
    },
    tiktok: {
      id: String,
      name: String,
      url: String,
      verified: { type: Boolean, default: false }
    }
  },
  
  // Статус
  status: {
    type: String,
    enum: ['online', 'idle', 'dnd', 'offline'],
    default: 'online'
  },
  statusPreference: {
    type: String,
    enum: ['online', 'idle', 'dnd', 'offline'],
    default: 'online'
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
  },
  
  // Верификация и OTP
  isVerified: {
    type: Boolean,
    default: false
  },
  otpCode: {
    type: String,
    default: null
  },
  otpExpires: {
    type: Date,
    default: null
  },
  otpLastSentAt: {
    type: Date,
    default: null
  },
  
  // Безопасность и блокировка
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  usernameChangedAt: {
    type: Date,
    default: null
  },
  googleOnboardingComplete: {
    type: Boolean,
    default: false
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorCode: {
    type: String,
    default: null
  },
  twoFactorExpires: {
    type: Date,
    default: null
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
  if (!this.password || !candidatePassword) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

// Метод для получения публичного профиля (без пароля)
userSchema.methods.toPublicJSON = function() {
  return {
    _id: this._id,
    username: this.username,
    nickname: this.nickname || this.username,
    role: this.role,
    avatar: this.avatar,
    banner: this.banner,
    bio: this.bio,
    badges: this.badges,
    profileColor: this.profileColor,
    connectedAccounts: this.connectedAccounts,
    hasPassword: Boolean(this.password),
    hasGoogle: Boolean(this.googleId),
    usernameChangedAt: this.usernameChangedAt,
    googleOnboardingComplete: this.googleOnboardingComplete,
    twoFactorEnabled: this.twoFactorEnabled,
    status: this.status,
    customStatus: this.customStatus,
    createdAt: this.createdAt,
    lastSeen: this.lastSeen
  };
};

module.exports = mongoose.model('User', userSchema);
