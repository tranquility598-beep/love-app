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

  // Оригинал удалённого текста — только для модерации.
  // НИКОГДА не отдаётся клиентам: во всех выборках стоит
  // .select('-deletedContent'), а toJSON вырезает поле.
  deletedContent: {
    type: String,
    default: null,
    select: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  deletedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  // ===== КАПСУЛА ВРЕМЕНИ =====
  // Сообщение с deliverAt в будущем не показывается получателю,
  // пока планировщик (services/capsuleService) его не доставит.
  // Обычные сообщения имеют deliverAt = null и работают как раньше.
  deliverAt: {
    type: Date,
    default: null
  },
  // false, пока капсула ждёт своего времени.
  delivered: {
    type: Boolean,
    default: true
  },

  // Дата создания
  createdAt: {
    type: Date,
    default: Date.now
  }
});

/**
 * Никогда не сериализуем оригинал удалённого текста наружу.
 * select:false защищает от обычных find(), это — от случайного
 * populate/lean-пути, где поле всё же подтянули.
 */
messageSchema.set('toJSON', {
  transform(doc, ret) {
    delete ret.deletedContent;
    return ret;
  }
});

// Индексы для быстрого поиска
messageSchema.index({ channel: 1, createdAt: -1 });
messageSchema.index({ author: 1 });
// Планировщик капсул: выбирает недоставленные с наступившим сроком.
messageSchema.index({ delivered: 1, deliverAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
