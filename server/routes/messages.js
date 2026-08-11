/**
 * Роуты сообщений
 * Получение, отправка, редактирование, удаление сообщений
 */

const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const Server = require('../models/Server');
const authMiddleware = require('../middleware/auth');
const { messageLimiter } = require('../middleware/rateLimiter');
const { messageAntiSpamMiddleware } = require('../middleware/messageAntiSpam');
const { validateMessageContent, sanitizeBody } = require('../middleware/validation');
const { requireCanCommunicate } = require('../services/moderationService');
const { requireChannelAccess } = require('../utils/channelAccess');
const { canManageServerMessages } = require('../utils/serverPermissions');
const { escapeRegex } = require('../utils/security');
const { isBlockedBetween } = require('../utils/blocking');
const { parseDeliverAt } = require('../services/capsuleService');

/**
 * Реальный тип вложения.
 *
 * Поле attachment.type исторически ненадёжно: часть загрузок сохранена
 * как 'file' при том, что это видео или аудио. Клиент это уже обходит
 * (см. _attType в init-app.js), медиатеке нужна та же логика — иначе
 * фильтры «Видео» и «Аудио» показывают пусто.
 */
function resolveAttachmentType(attachment) {
  const mime = String(attachment.mimetype || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';

  const name = String(attachment.url || attachment.filename || attachment.originalName || '').toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/.test(name)) return 'image';
  if (/\.(mp4|mov|mkv|avi|m4v)(\?|$)/.test(name)) return 'video';
  if (/\.(mp3|wav|ogg|m4a|aac|flac|opus|weba|webm)(\?|$)/.test(name)) return 'audio';

  if (['image', 'video', 'audio'].includes(attachment.type)) return attachment.type;
  return 'file';
}

/**
 * GET /api/messages/capsules
 * Свои капсулы времени, которые ещё не доставлены.
 *
 * Объявлен ДО '/:channelId', иначе Express примет 'capsules' за channelId.
 */
router.get('/capsules', authMiddleware, async (req, res) => {
  try {
    const capsules = await Message.find({
      author: req.user._id,
      delivered: false,
      deleted: false
    })
      .populate('channel', 'name type server')
      .sort({ deliverAt: 1 })
      .limit(100);

    res.json({ capsules });
  } catch (error) {
    console.error('Get capsules error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/messages/capsules/:id
 * Отменить свою неотправленную капсулу.
 */
router.delete('/capsules/:id', authMiddleware, async (req, res) => {
  try {
    // Условие delivered: false в самом запросе — гонка с планировщиком:
    // уже доставленную капсулу отменить нельзя, это обычное сообщение.
    const capsule = await Message.findOneAndDelete({
      _id: req.params.id,
      author: req.user._id,
      delivered: false
    });

    if (!capsule) {
      return res.status(404).json({ message: 'Капсула не найдена или уже доставлена' });
    }

    res.json({ message: 'Капсула отменена', capsuleId: req.params.id });
  } catch (error) {
    console.error('Delete capsule error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * GET /api/messages/search
 * Поиск сообщений
 */
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { q, channelId } = req.query;

    if (!q || !channelId) {
      return res.status(400).json({ message: 'Необходим запрос и ID канала' });
    }

    // Доступ к каналу: без этой проверки поиск отдавал чужую переписку по id.
    const access = await requireChannelAccess(req, res, channelId);
    if (!access) return;

    const messages = await Message.find({
      channel: channelId,
      // Экранируем ввод: без этого '.*' выгружает весь канал,
      // а вложенные квантификаторы вешают базу (ReDoS).
      content: { $regex: escapeRegex(String(q).slice(0, 200)), $options: 'i' },
      deleted: false,
      // Капсулы времени не должны находиться поиском до срока доставки.
      delivered: { $ne: false }
    })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate('author', 'username nickname avatar discriminator role');
    
    res.json({ results: messages });
  } catch (error) {
    console.error('Ошибка при поиске сообщений:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * GET /api/messages/:channelId/media
 * Медиатека канала: все вложения из сообщений, новые сверху.
 *
 * Питает вкладку «Медиа» в комнатах. Отдельного хранилища вложений нет —
 * файлы живут внутри сообщений (Message.attachments), поэтому собираем
 * их отсюда.
 *
 * Объявлен ДО '/:channelId', иначе Express съест 'media' как часть пути.
 */
router.get('/:channelId/media', authMiddleware, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { type, limit = 60, before } = req.query;

    const access = await requireChannelAccess(req, res, channelId);
    if (!access) return;

    const query = {
      channel: channelId,
      deleted: false,
      // Капсулы не показываем до срока — иначе вкладка Медиа
      // сливает вложение раньше, чем откроется само сообщение.
      delivered: { $ne: false },
      'attachments.0': { $exists: true }
    };
    if (before) query._id = { $lt: before };

    // Берём сообщения, а не вложения: одно сообщение может нести несколько
    // файлов, поэтому лимит применяем уже к разложенному списку.
    // Сортировка по _id, а не по createdAt: курсор пагинации — тоже _id,
    // и при равных датах сортировка по другому полю теряла бы записи.
    const perPage = Math.min(Math.max(parseInt(limit, 10) || 60, 1), 100);
    const messages = await Message.find(query)
      .select('attachments author createdAt content')
      .populate('author', 'username nickname avatar discriminator')
      .sort({ _id: -1 })
      .limit(perPage);

    const allowedTypes = ['image', 'video', 'audio', 'file'];
    const filterType = allowedTypes.includes(String(type)) ? String(type) : null;

    const items = [];
    for (const message of messages) {
      (message.attachments || []).forEach((attachment, index) => {
        const attachmentType = resolveAttachmentType(attachment);
        if (filterType && attachmentType !== filterType) return;
        items.push({
          // Составной id: у поддокументов вложений может не быть своего _id
          // у старых записей, а ключ для React/DOM нужен всегда.
          id: `${message._id}:${index}`,
          messageId: message._id,
          url: attachment.url,
          name: attachment.originalName || attachment.filename || 'файл',
          size: attachment.size || 0,
          type: attachmentType,
          mimetype: attachment.mimetype || '',
          width: attachment.width || null,
          height: attachment.height || null,
          author: message.author,
          createdAt: message.createdAt
        });
      });
    }

    res.json({
      items,
      // Курсор для «показать ещё»: последний просмотренный _id сообщения.
      nextBefore: messages.length === perPage ? messages[messages.length - 1]._id : null
    });
  } catch (error) {
    console.error('Get channel media error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * GET /api/messages/:channelId
 * Получить сообщения канала
 */
router.get('/:channelId', authMiddleware, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { before, limit = 50 } = req.query;

    // Членство в канале обязательно: раньше хватало знать _id,
    // чтобы прочитать чужой серверный канал или личную переписку.
    const access = await requireChannelAccess(req, res, channelId);
    if (!access) return;

    // Строим запрос.
    // delivered: { $ne: false } скрывает капсулы, срок которых ещё не настал.
    // $ne вместо true — старые сообщения без поля тоже должны попадать в выдачу.
    const query = {
      channel: channelId,
      deleted: false,
      delivered: { $ne: false }
    };

    if (before) {
      query._id = { $lt: before };
    }

    const messages = await Message.find(query)
      .populate('author', 'username nickname avatar discriminator role')
      .populate({
        path: 'replyTo',
        populate: { path: 'author', select: 'username nickname avatar role' }
      })
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100));
    
    // Возвращаем в хронологическом порядке
    messages.reverse();
    
    res.json({ messages });
    
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/messages/:channelId
 * Отправить сообщение
 */
// messageAntiSpamMiddleware — per-user-per-channel защита от флуда (10/5s, cooldown 10s).
// Идёт ПОСЛЕ authMiddleware (нужен req.user) и messageLimiter (общий IP-limit).
router.post('/:channelId', authMiddleware, requireCanCommunicate, messageLimiter, messageAntiSpamMiddleware, sanitizeBody, validateMessageContent, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { content, replyTo, deliverAt } = req.body;

    if (!content && (!req.files || Object.keys(req.files).length === 0)) {
      return res.status(400).json({ message: 'Сообщение не может быть пустым' });
    }

    // Капсула времени: сообщение с датой доставки в будущем.
    const parsedDeliverAt = parseDeliverAt(deliverAt);
    if (!parsedDeliverAt.ok) {
      return res.status(400).json({ message: parsedDeliverAt.error });
    }
    const isCapsule = Boolean(parsedDeliverAt.date);

    // Без этой проверки можно было писать в любой канал, включая чужие ЛС.
    const access = await requireChannelAccess(req, res, channelId);
    if (!access) return;
    const channel = access.channel;

    // В ЛС блокировка должна закрывать отправку. Socket-путь (message:send)
    // это уже проверяет — REST-путь пропускал всё.
    if (!channel.server) {
      const participants = (channel.participants || []).length
        ? channel.participants
        : (access.conversation ? access.conversation.participants : []);
      const other = participants.find(p => p.toString() !== req.user._id.toString());
      if (other && await isBlockedBetween(req.user._id, other)) {
        return res.status(403).json({ message: 'Сообщение не доставлено' });
      }
    }

    // Проверяем что replyTo существует И принадлежит этому же каналу
    // (иначе ответом можно подтянуть чужое сообщение через populate).
    let validReplyTo = null;
    if (replyTo) {
      const replyMessage = await Message.findById(replyTo);
      if (replyMessage && replyMessage.channel.toString() === String(channelId)) {
        validReplyTo = replyTo;
      } else {
        console.warn(`⚠️  Reply message ${replyTo} not found in channel, ignoring replyTo`);
      }
    }
    
    const message = new Message({
      content: content || '',
      author: req.user._id,
      channel: channelId,
      server: channel.server,
      replyTo: validReplyTo,
      deliverAt: parsedDeliverAt.date,
      // Капсула лежит невидимой, пока планировщик не выставит delivered=true.
      delivered: !isCapsule
    });

    await message.save();

    // Капсула не должна всплывать в списке диалогов и в реальном времени —
    // иначе получатель узнает о ней раньше срока. Возвращаем автору
    // подтверждение и выходим.
    if (isCapsule) {
      await message.populate('author', 'username nickname avatar discriminator role');
      return res.status(201).json({
        message,
        capsule: true,
        deliverAt: message.deliverAt
      });
    }

    // Обновляем последнее сообщение в канале
    await Channel.findByIdAndUpdate(channelId, { lastMessage: message._id });
    
    // Заполняем данные автора
    await message.populate('author', 'username nickname avatar discriminator role');
    if (validReplyTo) {
      await message.populate({
        path: 'replyTo',
        populate: { path: 'author', select: 'username nickname avatar role' }
      });
    }

    // Рассылаем в реальном времени. Раньше REST-путь молча сохранял
    // сообщение в БД, и собеседник видел его только после перезагрузки —
    // socket-путь (message:send) рассылал, а этот нет.
    const io = req.app.get('io');
    if (io) {
      if (channel.server) {
        io.to(`server:${channel.server}`).emit('message:new', { channelId, message });
      } else {
        const participants = (channel.participants || []).length
          ? channel.participants
          : (access.conversation ? access.conversation.participants : []);
        participants.forEach(participantId => {
          io.to(`user:${participantId}`).emit('message:new', { channelId, message });
        });
      }
    }

    res.status(201).json({ message });
    
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Ошибка при отправке сообщения' });
  }
});

/**
 * PUT /api/messages/:id
 * Редактировать сообщение
 */
router.put('/:id', authMiddleware, requireCanCommunicate, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: 'Содержимое сообщения не может быть пустым' });
    }
    
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({ message: 'Сообщение не найдено' });
    }
    
    // Только автор может редактировать
    if (message.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Вы можете редактировать только свои сообщения' });
    }

    // Автор мог потерять доступ к каналу (выгнали с сервера, удалили из ЛС).
    const access = await requireChannelAccess(req, res, message.channel);
    if (!access) return;

    message.content = content;
    message.edited = true;
    message.editedAt = new Date();
    
    await message.save();
    await message.populate('author', 'username nickname avatar discriminator role');
    
    res.json({ message });
    
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/messages/:id
 * Удалить сообщение
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({ message: 'Сообщение не найдено' });
    }

    // Доступ к каналу нужен в любом случае — даже автору.
    const access = await requireChannelAccess(req, res, message.channel);
    if (!access) return;

    // Автор или модератор сервера может удалять.
    // Раньше проверка сравнивала member.roles (ObjectId) со строками
    // 'owner'/'admin' и поэтому не срабатывала никогда — модераторы
    // не могли удалить чужое сообщение вообще.
    const isAuthor = message.author.toString() === req.user._id.toString();

    if (!isAuthor) {
      if (!message.server) {
        return res.status(403).json({ message: 'Недостаточно прав для удаления этого сообщения' });
      }
      const server = await Server.findById(message.server);
      if (!server || !canManageServerMessages(server, req.user._id)) {
        return res.status(403).json({ message: 'Недостаточно прав для удаления этого сообщения' });
      }
    }
    
    // Мягкое удаление.
    // Оригинал сохраняем в deletedContent: он нужен модерации при разборе
    // жалоб. Клиентам поле не отдаётся — см. select ниже по коду выдачи.
    message.deleted = true;
    message.deletedContent = message.content;
    message.deletedAt = new Date();
    message.deletedBy = req.user._id;
    message.content = 'Сообщение удалено';
    await message.save();

    // Уведомляем клиентов, иначе сообщение исчезает только после перезагрузки.
    const io = req.app.get('io');
    if (io) {
      const channel = await Channel.findById(message.channel);
      if (channel && channel.server) {
        io.to(`server:${channel.server}`).emit('message:deleted', {
          messageId: req.params.id,
          channelId: String(message.channel)
        });
      } else if (channel) {
        (channel.participants || []).forEach(participantId => {
          io.to(`user:${participantId}`).emit('message:deleted', {
            messageId: req.params.id,
            channelId: String(message.channel)
          });
        });
      }
    }

    res.json({ message: 'Сообщение удалено', messageId: req.params.id });
    
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/messages/:id/react
 * Добавить/убрать реакцию на сообщение
 */
router.post('/:id/react', authMiddleware, requireCanCommunicate, async (req, res) => {
  try {
    const { emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({ message: 'Эмодзи обязателен' });
    }
    
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({ message: 'Сообщение не найдено' });
    }

    // Реакция — тоже действие в канале: нужен доступ.
    const access = await requireChannelAccess(req, res, message.channel);
    if (!access) return;

    // Ищем существующую реакцию
    const existingReaction = message.reactions.find(r => r.emoji === emoji);
    
    if (existingReaction) {
      const userIndex = existingReaction.users.indexOf(req.user._id.toString());
      
      if (userIndex > -1) {
        // Убираем реакцию
        existingReaction.users.splice(userIndex, 1);
        existingReaction.count -= 1;
        
        if (existingReaction.count === 0) {
          message.reactions = message.reactions.filter(r => r.emoji !== emoji);
        }
      } else {
        // Добавляем реакцию
        existingReaction.users.push(req.user._id);
        existingReaction.count += 1;
      }
    } else {
      // Создаем новую реакцию
      message.reactions.push({
        emoji,
        users: [req.user._id],
        count: 1
      });
    }
    
    await message.save();
    await message.populate('author', 'username nickname avatar discriminator role');
    
    res.json({ message });
    
  } catch (error) {
    console.error('React to message error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
