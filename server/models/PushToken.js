/**
 * Модель токена push-уведомлений (Android, FCM).
 *
 * Токен выдаёт Google приложению на телефоне, приложение отдаёт его серверу
 * (POST /api/push/token). Один человек может держать несколько устройств:
 * токен уникален, при повторной регистрации просто обновляется.
 *
 * Токены живут отдельно от User, потому что их надо удалять пачкой, когда
 * FCM отвечает «UNREGISTERED» (приложение удалили или токен перевыпущен).
 */

const mongoose = require('mongoose');

const pushTokenSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Токен устройства. Уникален: переустановка приложения даёт новый,
  // старый приходит в ответе FCM как недействительный и удаляется.
  token: {
    type: String,
    required: true,
    unique: true
  },

  platform: {
    type: String,
    enum: ['android'],
    default: 'android'
  },

  // Only this device's authenticated live socket suppresses FCM. Another
  // online device (for example the desktop app) must not silence this phone.
  socketId: { type: String, default: '', maxlength: 120 },

  // Чтобы было видно, чем именно устройство: пригодится в поддержке.
  device: {
    type: String,
    default: '',
    maxlength: 120
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  // Обновляется при каждой регистрации: по нему видно, живой ли токен.
  lastSeenAt: {
    type: Date,
    default: Date.now
  }
});

pushTokenSchema.index({ user: 1, token: 1 });

module.exports = mongoose.model('PushToken', pushTokenSchema);
