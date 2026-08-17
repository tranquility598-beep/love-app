/**
 * Модель уведомления
 * Персистентная лента уведомлений пользователя: упоминания, заявки в друзья,
 * новые личные сообщения, пропущенные звонки и системные события.
 */

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Получатель
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  type: {
    type: String,
    // capsule — сработала капсула времени (см. services/capsuleService).
    enum: ['mention', 'friend_request', 'friend_accepted', 'new_dm', 'missed_call', 'system', 'capsule'],
    required: true
  },

  // Кто инициировал событие
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  actorName: { type: String, default: '' },
  actorAvatar: { type: String, default: null },

  // Текстовое превью (сообщение/описание)
  preview: { type: String, default: '', maxlength: 300 },

  // Чем было сообщение: text | image | video | voice | audio | file | mixed.
  // Нужно, чтобы в ленте у карточки была иконка вложения, а не пустая строка,
  // когда человек прислал одну фотографию или голосовое (см. utils/messagePreview).
  previewKind: { type: String, default: 'text' },

  // Ссылка на первую картинку сообщения — показываем само фото в уведомлении
  previewImage: { type: String, default: null },

  // Навигационные ссылки
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: 'DirectMessage', default: null },
  channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', default: null },
  serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', default: null },
  serverName: { type: String, default: '' },
  caseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Case', default: null },

  read: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now }
});

// Лента всегда читается по пользователю и сортируется по времени
notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
