/**
 * Socket.io обработчик
 * Управляет всеми real-time событиями: сообщения, голос, статусы
 */

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const Server = require('../models/Server');
const DirectMessage = require('../models/DirectMessage');
const { isFounderUser } = require('../utils/founder');
const { checkAndRecord: checkMessageAntiSpam } = require('../middleware/messageAntiSpam');
const { createNotification } = require('../utils/notify');
const { normalizeContent, getUsernameValidationError } = require('../middleware/validation');
const { normalizeUsername, findUserByUsername, getDuplicateField } = require('../utils/username');
const { communicationRestriction, refreshModerationState } = require('../services/moderationService');
const AnalyticsEvent = require('../models/AnalyticsEvent');
const AdminSession = require('../models/AdminSession');
const { isStaffRole } = require('../config/adminRoles');
const { hashToken, safeEqual, escapeRegex } = require('../utils/security');
const { checkChannelAccess, checkServerAccess, isValidObjectId } = require('../utils/channelAccess');
const { canManageServerMessages, canManageServerRoles } = require('../utils/serverPermissions');
const { sanitizeRolePermissions } = require('../utils/rolePermissions');
const { isBlockedBetween } = require('../utils/blocking');
const { parseDeliverAt } = require('../services/capsuleService');
const registerAdminStaffSocket = require('./adminStaffSocket');
const {
  applyVoiceMediaMode,
  normalizeVoiceMediaMode,
  serializeVoiceMember
} = require('../services/voiceMediaState');

const { getJwtSecret } = require('../utils/jwtSecret');

const JWT_SECRET = getJwtSecret();

function normalizeMessageAttachments(raw) {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((a) => ({
      filename: a.filename || a.name || 'file',
      originalName: a.originalName || a.name || 'file',
      url: a.url,
      size: typeof a.size === 'number' ? a.size : 0,
      type: a.type || (a.mimetype && String(a.mimetype).startsWith('audio') ? 'audio' : 'file'),
      mimetype: a.mimetype || undefined,
      width: a.width,
      height: a.height
    }))
    .filter((a) => a && a.url);
}

// Хранилище подключенных пользователей
// { userId: Set<socketId> }. One account can be open on several devices.
const connectedUsers = new Map();

function addConnectedSocket(userId, socketId) {
  const sockets = connectedUsers.get(userId) || new Set();
  sockets.add(socketId);
  connectedUsers.set(userId, sockets);
}

function removeConnectedSocket(userId, socketId) {
  const sockets = connectedUsers.get(userId);
  if (!sockets) return false;
  sockets.delete(socketId);
  if (sockets.size) return false;
  connectedUsers.delete(userId);
  return true;
}

function socketIsInVoiceChannel(channelId, socketId) {
  return !!voiceChannels.get(channelId)?.some((member) => member.socketId === socketId);
}

// Хранилище участников голосовых каналов
// { channelId: [{ userId, socketId }] }
const voiceChannels = new Map();

module.exports = (io) => {
  
  // Middleware для аутентификации Socket.io соединений.
  //
  // Принимает ТОЛЬКО короткоживущие socket-token'ы (aud='socket'),
  // выпускаемые через POST /api/auth/socket-token.
  // Обычные долгоживущие API JWT для socket НЕ принимаются — это часть
  // security-модели: основной токен живёт только в main process Electron
  // и никогда не попадает в renderer/socket auth.
  //
  // Логи без токена и без секретов: только success/failed + userId/error.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;

      if (!token) {
        console.warn('[socket-auth] failed: no token');
        return next(new Error('Токен не предоставлен'));
      }

      const decoded = jwt.verify(token, JWT_SECRET);

      if (decoded.aud === 'admin-socket') {
        if (decoded.iss !== 'love-admin' || !decoded.sid || !decoded.userId) {
          return next(new Error('Недействительный административный socket token'));
        }
        const userAgentHash = hashToken(String(socket.handshake.headers['user-agent'] || '').trim());
        if (!decoded.uaHash || !safeEqual(decoded.uaHash, userAgentHash)) {
          return next(new Error('Параметры защищённой сессии изменились'));
        }
        const session = await AdminSession.findOne({ _id: decoded.sid, user: decoded.userId, revokedAt: null }).populate('user');
        const now = Date.now();
        if (!session || !session.user || session.expiresAt.getTime() <= now
          || now - session.lastSeenAt.getTime() > 30 * 60 * 1000
          || !isStaffRole(session.user.role) || !session.user.adminTotpEnabled
          || session.user.isBanned || session.user.deactivatedAt) {
          return next(new Error('Административная сессия недоступна'));
        }
        if (process.env.NODE_ENV === 'production') {
          const forwarded = String(socket.handshake.headers['x-forwarded-for'] || '').split(',')[0].trim();
          const address = String(forwarded || socket.handshake.address || '').replace(/^::ffff:/, '');
          if (!decoded.ipHash || !safeEqual(decoded.ipHash, hashToken(address))) {
            return next(new Error('IP защищённой сессии изменился'));
          }
        }
        socket.user = session.user;
        socket.isAdminSocket = true;
        socket.adminSessionId = String(session._id);
        return next();
      }

      // Жёсткая проверка: принимаем только токены, выпущенные именно для socket.
      if (decoded.aud !== 'socket') {
        console.warn('[socket-auth] failed: wrong audience for userId=', decoded.userId);
        return next(new Error('Недействительный socket token'));
      }

      const user = await User.findById(decoded.userId).select('-password');

      if (!user) {
        console.warn('[socket-auth] failed: user not found for userId=', decoded.userId);
        return next(new Error('Пользователь не найден'));
      }

      await refreshModerationState(user);
      socket.user = user;
      socket.restricted = user.deactivatedAt
        ? { type: 'deactivated', reason: user.deactivationReason || '', actionId: user.activeDeactivationAction || null }
        : user.isBanned
          ? { type: 'ban', reason: user.banReason || '', expiresAt: user.banUntil || null, actionId: user.activeBanAction || null }
          : null;
      console.log('[socket-auth] success userId=', decoded.userId);
      next();

    } catch (error) {
      // jwt.verify бросает TokenExpiredError / JsonWebTokenError — не логируем токен.
      console.warn('[socket-auth] failed:', error.message);
      next(new Error('Ошибка аутентификации'));
    }
  });

  io.on('connection', async (socket) => {
    if (socket.isAdminSocket) {
      registerAdminStaffSocket(io, socket);
      return;
    }
    const userId = socket.user._id.toString();
    console.log(`✅ User connected: ${socket.user.username} (${socket.id})`);

    if (socket.restricted) {
      socket.join(`user:${userId}`);
      socket.emit('moderation:restricted', socket.restricted);
      console.log(`[socket-auth] restricted safety channel userId=${userId}`);
      return;
    }

    const communicationEvents = new Set([
      'message:send',
      'message:edit',
      'message:react',
      'message:pin',
      'message:unpin',
      'typing:start',
      'friend:request',
      'friend:accepted',
      'server:join',
      'voice:join',
      'voice:toggle_mute',
      'voice:toggle_deafen',
      'voice:speaking',
      'webrtc:offer',
      'webrtc:answer',
      'webrtc:ice_candidate',
      'screen:start',
      'camera:start',
      'call:request'
    ]);

    socket.use(async ([event, ...args], next) => {
      const callResponse = event === 'call:response' && args[0]?.accepted !== false;
      const mediaStateStarts = event === 'voice:media_state'
        && normalizeVoiceMediaMode(args[0]?.mode) !== 'none';
      if (!communicationEvents.has(event) && !callResponse && !mediaStateStarts) return next();

      try {
        const restriction = await communicationRestriction(userId);
        if (!restriction.blocked) return next();

        const payload = {
          code: 'COMMUNICATION_RESTRICTED',
          ...restriction
        };
        const acknowledgement = args.find(arg => typeof arg === 'function');
        if (acknowledgement) acknowledgement({ status: 'error', ...payload });
        socket.emit('moderation:blocked', payload);
      } catch (error) {
        console.error('[moderation] socket guard:', error);
        next(new Error('Не удалось проверить ограничения аккаунта'));
      }
    });
    
    // Сохраняем соединение
    addConnectedSocket(userId, socket.id);
    socket.join(`user:${userId}`);
    console.log(`🔍 CONNECTION SET: userId=${userId}, new socket=${socket.id}`);
    
    // Получаем предпочтительный статус пользователя
    const userDb = await User.findById(userId);
    let prefStatus = userDb?.statusPreference || 'online';
    
    // Fallback: 'offline' (invisible) is deprecated, treat as 'online'
    if (prefStatus === 'offline') {
      prefStatus = 'online';
    }
    
    // Fallback: 'idle' is treated as 'online' on connection
    if (prefStatus === 'idle') {
      prefStatus = 'online';
    }
    
    // Обновляем статус в БД на предпочтительный
    await User.findByIdAndUpdate(userId, { status: prefStatus, lastSeen: new Date() });
    
    // Уведомляем всех о новом статусе пользователя
    socket.broadcast.emit('user:status', {
      userId,
      status: prefStatus
    });
    
    // Отправляем статус самому пользователю после подключения
    socket.emit('user:status', {
      userId,
      status: prefStatus
    });
    
    // Присоединяемся к комнатам серверов пользователя
    const user = await User.findById(userId).populate('servers');
    if (user && user.servers) {
      user.servers.forEach(server => {
        socket.join(`server:${server._id}`);
      });
    }
    
    // Присоединяемся к личной комнате
    socket.join(`user:${userId}`);

    // ==================== СТАТУС ====================
    socket.on('status:set', async ({ status }) => {
      try {
        const validStatuses = ['online', 'idle', 'dnd', 'offline'];
        if (!validStatuses.includes(status)) return;
        
        const updateData = { status, lastSeen: new Date() };
        if (status === 'dnd') updateData.statusPreference = 'dnd';
        if (status === 'online') updateData.statusPreference = 'online';
        // idle statusPreference remains unchanged
        
        await User.findByIdAndUpdate(userId, updateData);
        
        io.emit('user:status', {
          userId,
          status
        });
      } catch (error) {
        console.error('Error setting status:', error);
      }
    });

    // ==================== СООБЩЕНИЯ ====================
    
    /**
     * Отправка сообщения в канал (Оптимистичное обновление)
     */
    socket.on('message:send', async (data) => {
      try {
        let { channelId, content, replyTo, attachments, tempId } = data;
        content = normalizeContent(content, 2000);
        const normalizedAttachments = normalizeMessageAttachments(attachments);

        if (!channelId || (!content && normalizedAttachments.length === 0)) {
          return socket.emit('error', { message: 'Неверные данные сообщения' });
        }

        // Per-user-per-channel anti-spam. Не используем 'error' event,
        // чтобы фронт не показал общую ошибку — отправляем отдельное
        // событие message:rate_limited с retryAfter, и фронт сам
        // включает локальный cooldown с таймером (см. client/js/chat.js).
        const antiSpam = checkMessageAntiSpam(userId, channelId);
        if (!antiSpam.ok) {
          return socket.emit('message:rate_limited', {
            channelId,
            tempId: data.tempId || null,
            retryAfter: antiSpam.retryAfter,
            code: antiSpam.code,
            message: antiSpam.message,
            warningTitle: antiSpam.warningTitle,
            warningText: antiSpam.warningText,
            violationLevel: antiSpam.violationLevel,
          });
        }

        const channel = await Channel.findById(channelId);
        if (!channel) {
          return socket.emit('error', { message: 'Канал не найден' });
        }

        // Членство в канале. Раньше проверялась только дружба для ЛС,
        // а в любой серверный канал можно было писать, зная его _id.
        const access = await checkChannelAccess(channelId, userId);
        if (!access.allowed) {
          return socket.emit('error', { message: 'Канал не найден' });
        }

        // Если это DM-канал, проверяем что получатель не удалил отправителя
        // из друзей и не заблокировал его.
        if (!channel.server) {
          const dm = access.conversation || await DirectMessage.findOne({ channel: channelId });
          if (dm) {
            const otherParticipant = dm.participants.find(p => p.toString() !== userId);
            const recipientUser = otherParticipant ? await User.findById(otherParticipant).lean() : null;
            const isFriend = recipientUser ? recipientUser.friends.some(f => f.toString() === userId) : false;
            if (!isFriend) {
              return socket.emit('error', { message: 'Вы не можете отправлять сообщения пользователю, который удалил вас из друзей' });
            }
            if (await isBlockedBetween(userId, otherParticipant)) {
              return socket.emit('error', { message: 'Сообщение не доставлено' });
            }
          }
        }


        
        // Проверяем что replyTo существует, если указан
        let validReplyTo = null;
        if (replyTo) {
          const replyMessage = await Message.findById(replyTo);
          if (replyMessage) {
            validReplyTo = replyTo;
          } else {
            console.warn(`⚠️  Reply message ${replyTo} not found, ignoring replyTo`);
          }
        }
        
        // ===== КАПСУЛА ВРЕМЕНИ =====
        // Обрабатываем ДО оптимистичной рассылки: капсула не должна
        // мелькнуть у получателя, а потом исчезнуть.
        const parsedDeliverAt = parseDeliverAt(data.deliverAt);
        if (!parsedDeliverAt.ok) {
          return socket.emit('error', { message: parsedDeliverAt.error });
        }

        if (parsedDeliverAt.date) {
          const capsule = new Message({
            content: content || '',
            author: userId,
            channel: channelId,
            server: channel.server,
            replyTo: validReplyTo,
            attachments: normalizedAttachments,
            type: normalizedAttachments.length > 0 ? 'file' : 'default',
            deliverAt: parsedDeliverAt.date,
            delivered: false
          });
          await capsule.save();
          await capsule.populate('author', 'username nickname avatar discriminator role');

          // lastMessage канала НЕ трогаем: капсулы ещё нет для собеседника.
          return socket.emit('capsule:scheduled', {
            channelId,
            tempId: tempId || null,
            capsule,
            deliverAt: capsule.deliverAt
          });
        }

        // ШАГ А: МГНОВЕННО рассылаем сообщение всем в комнате (даже до сохранения в БД)
        // Используем временный ID от клиента, если он передан
        const tempMessageId = tempId || ('temp_' + Date.now() + '_' + userId);
        const tempMessage = {
          _id: tempMessageId,
          content: content || '',
          author: {
            _id: userId,
            username: socket.user.username,
            avatar: socket.user.avatar,
            discriminator: socket.user.discriminator
          },
          channel: channelId,
          server: channel.server,
          replyTo: validReplyTo,
          attachments: normalizedAttachments,
          createdAt: new Date().toISOString(),
          reactions: []
        };
        
        // Определяем комнату для отправки
        let room;
        if (channel.server) {
          room = `server:${channel.server}`;
        } else {
          // DM канал - отправляем участникам
          const dm = await DirectMessage.findOne({ channel: channelId });
          if (dm) {
            const otherParticipant = dm.participants.find(p => p.toString() !== userId);
            const recipientUser = otherParticipant ? await User.findById(otherParticipant).lean() : null;
            const isFriend = recipientUser ? recipientUser.friends.some(f => f.toString() === userId) : false;

            // Отправляем сообщение обоим участникам
            for (const participantId of dm.participants) {
              if (participantId.toString() !== userId && !isFriend) {
                continue;
              }
              io.to(`user:${participantId}`).emit('message:new', {
                channelId,
                message: tempMessage
              });
            }
          }
        }
        
        // Отправляем сообщение всем в комнате
        if (room) {
          io.to(room).emit('message:new', {
            channelId,
            message: tempMessage
          });
        }
        
        // ШАГ Б: Тихо сохраняем в базу данных в фоне
        try {
          // Создаем сообщение
          const message = new Message({
            content: content || '',
            author: userId,
            channel: channelId,
            server: channel.server,
            replyTo: validReplyTo,
            attachments: normalizedAttachments,
            type: normalizedAttachments.length > 0 ? 'file' : 'default'
          });
          
          await message.save();
          
          // Обновляем последнее сообщение в канале
          await Channel.findByIdAndUpdate(channelId, { lastMessage: message._id });
          
          // Заполняем данные
          await message.populate('author', 'username nickname avatar discriminator role');
          if (validReplyTo) {
            await message.populate({
              path: 'replyTo',
              populate: { path: 'author', select: 'username nickname avatar role' }
            });
          }
          
          // Обновляем сообщение с реальным ID
          if (channel.server) {
            io.to(`server:${channel.server}`).emit('message:update', {
              channelId,
              tempId: tempMessage._id,
              message
            });
          } else {
            const dm = await DirectMessage.findOne({ channel: channelId });
            if (dm) {
              const otherParticipant = dm.participants.find(p => p.toString() !== userId);
              const recipientUser = otherParticipant ? await User.findById(otherParticipant).lean() : null;
              const isFriend = recipientUser ? recipientUser.friends.some(f => f.toString() === userId) : false;

              // Обновляем счетчик непрочитанных для другого участника
              if (otherParticipant && isFriend) {
                await DirectMessage.findByIdAndUpdate(dm._id, {
                  $inc: { 'unreadCount.$[elem].count': 1 },
                  lastMessage: message._id,
                  updatedAt: new Date()
                }, {
                  arrayFilters: [{ 'elem.user': otherParticipant }]
                });
                
                // Live-доставка сообщения, если получатель онлайн
                const otherSocketId = connectedUsers.get(otherParticipant.toString());
                if (otherSocketId) {
                  io.to(`user:${otherParticipant}`).emit('dm:new_message', {
                    conversationId: dm._id,
                    message
                  });
                }
                // Персистентное уведомление в ленту — ВСЕГДА (и онлайн, и офлайн).
                // Онлайн-получатель увидит запись в окне уведомлений (createNotification
                // сам шлёт notification:new, type new_dm → клиент кладёт в ленту без
                // дублирующего тоста), а живой тост придёт через dm:new_message выше.
                createNotification(io, {
                  user: otherParticipant,
                  type: 'new_dm',
                  actor: userId,
                  actorName: socket.user.username,
                  actorAvatar: socket.user.avatar,
                  preview: (content || '').toString().slice(0, 200),
                  conversationId: dm._id,
                  channelId
                });
              }
              
              // Отправляем обновление сообщения обоим участникам
              for (const participantId of dm.participants) {
                if (participantId.toString() !== userId && !isFriend) {
                  continue;
                }
                io.to(`user:${participantId}`).emit('message:update', {
                  channelId,
                  tempId: tempMessage._id,
                  message
                });
              }
            }
          }
          
          // Уведомления для упомянутых пользователей
          if (content && content.includes('@')) {
            // Простая обработка упоминаний
            const mentionRegex = /@(\w+)/g;
            let match;
            while ((match = mentionRegex.exec(content)) !== null) {
              const mentionedUsername = match[1];
              const mentionedUser = await findUserByUsername(User, mentionedUsername);
              if (mentionedUser && mentionedUser._id.toString() !== userId) {
                io.to(`user:${mentionedUser._id}`).emit('notification:mention', {
                  from: socket.user.username,
                  channelId,
                  messageId: message._id,
                  content: content.substring(0, 100)
                });
                createNotification(io, {
                  user: mentionedUser._id,
                  type: 'mention',
                  actor: userId,
                  actorName: socket.user.username,
                  actorAvatar: socket.user.avatar,
                  preview: content.substring(0, 200),
                  channelId,
                  serverId: message.server || null
                });
              }
            }
          }
        } catch (dbError) {
          console.error('Ошибка сохранения в БД (но в чат доставлено):', dbError.message, dbError);
          // Уведомляем отправителя об ошибке сохранения
          socket.emit('error', { message: `Сообщение доставлено, но не сохранено: ${dbError.message}` });
        }
        
      } catch (error) {
        console.error('Socket message:send error:', error);
        socket.emit('error', { message: 'Ошибка при отправке сообщения' });
      }
    });
    
    /**
     * Редактирование сообщения
     */
    socket.on('message:edit', async (data) => {
      try {
        const { messageId, content } = data;
        
        // Проверяем что это не временный ID
        if (!messageId || messageId.startsWith('temp_') || messageId.startsWith('temp-')) {
          return socket.emit('error', { message: 'Нельзя редактировать сообщение до его сохранения' });
        }
        
        if (!/^[0-9a-fA-F]{24}$/.test(messageId)) {
          return socket.emit('error', { message: 'Некорректный ID сообщения' });
        }
        
        const message = await Message.findById(messageId);
        if (!message) {
          return socket.emit('error', { message: 'Сообщение не найдено' });
        }
        
        if (message.author.toString() !== userId) {
          return socket.emit('error', { message: 'Нет прав для редактирования' });
        }

        // Автор мог потерять доступ к каналу после отправки.
        const editAccess = await checkChannelAccess(message.channel, userId);
        if (!editAccess.allowed) {
          return socket.emit('error', { message: 'Нет доступа к этому каналу' });
        }

        message.content = content;
        message.edited = true;
        message.editedAt = new Date();
        await message.save();
        
        await message.populate('author', 'username nickname avatar discriminator role');
        
        const channel = await Channel.findById(message.channel);
        
        if (channel && channel.server) {
          io.to(`server:${channel.server}`).emit('message:edited', {
            channelId: message.channel,
            message
          });
        } else {
          // DM
          const dm = await DirectMessage.findOne({ channel: message.channel });
          if (dm) {
            dm.participants.forEach(participantId => {
              io.to(`user:${participantId}`).emit('message:edited', {
                channelId: message.channel,
                message
              });
            });
          }
        }
        
      } catch (error) {
        console.error('Socket message:edit error:', error);
      }
    });
    
    /**
     * Удаление сообщения
     */
    socket.on('message:delete', async (data) => {
      try {
        const { messageId } = data;
        
        if (!messageId || messageId.startsWith('temp_') || messageId.startsWith('temp-')) {
          return socket.emit('error', { message: 'Нельзя удалить сообщение до его сохранения' });
        }
        
        if (!/^[0-9a-fA-F]{24}$/.test(messageId)) {
          return socket.emit('error', { message: 'Некорректный ID сообщения' });
        }
        
        const message = await Message.findById(messageId);
        if (!message) {
          return socket.emit('error', { message: 'Сообщение не найдено' });
        }
        
        const deleteAccess = await checkChannelAccess(message.channel, userId);
        if (!deleteAccess.allowed) {
          return socket.emit('error', { message: 'Нет доступа к этому каналу' });
        }

        // Автор или модератор сервера (право manageMessages).
        const isAuthor = message.author.toString() === userId;
        if (!isAuthor) {
          const server = message.server ? await Server.findById(message.server) : null;
          if (!server || !canManageServerMessages(server, userId)) {
            return socket.emit('error', { message: 'Нет прав для удаления' });
          }
        }

        // Оригинал сохраняем для модерации, клиентам он не уходит
        // (deletedContent объявлен select:false и вырезается в toJSON).
        message.deleted = true;
        message.deletedContent = message.content;
        message.deletedAt = new Date();
        message.deletedBy = userId;
        message.content = 'Сообщение удалено';
        await message.save();
        
        const channel = await Channel.findById(message.channel);
        
        if (channel && channel.server) {
          io.to(`server:${channel.server}`).emit('message:deleted', {
            channelId: message.channel,
            messageId
          });
        } else {
          const dm = await DirectMessage.findOne({ channel: message.channel });
          if (dm) {
            dm.participants.forEach(participantId => {
              io.to(`user:${participantId}`).emit('message:deleted', {
                channelId: message.channel,
                messageId
              });
            });
          }
        }
        
      } catch (error) {
        console.error('Socket message:delete error:', error);
      }
    });
    
    /**
     * Реакция на сообщение
     */
    socket.on('message:react', async (data) => {
      try {
        const { messageId, emoji } = data;
        
        // Проверяем что это не временный ID
        if (!messageId || messageId.startsWith('temp_')) {
          return socket.emit('error', { message: 'Нельзя реагировать на сообщение до его сохранения' });
        }
        
        const message = await Message.findById(messageId);
        if (!message) {
          return socket.emit('error', { message: 'Сообщение не найдено' });
        }

        // Реакция — действие в канале, нужен доступ.
        const reactAccess = await checkChannelAccess(message.channel, userId);
        if (!reactAccess.allowed) {
          return socket.emit('error', { message: 'Нет доступа к этому каналу' });
        }

        const existingReaction = message.reactions.find(r => r.emoji === emoji);
        
        if (existingReaction) {
          const userIdStr = userId.toString();
          const userIndex = existingReaction.users.findIndex(u => u.toString() === userIdStr);
          
          if (userIndex > -1) {
            existingReaction.users.splice(userIndex, 1);
            existingReaction.count -= 1;
            if (existingReaction.count === 0) {
              message.reactions = message.reactions.filter(r => r.emoji !== emoji);
            }
          } else {
            existingReaction.users.push(userId);
            existingReaction.count += 1;
          }
        } else {
          message.reactions.push({ emoji, users: [userId], count: 1 });
        }
        
        await message.save();
        
        const channel = await Channel.findById(message.channel);
        const reactionData = {
          channelId: message.channel,
          messageId,
          reactions: message.reactions
        };
        
        if (channel && channel.server) {
          io.to(`server:${channel.server}`).emit('message:reaction', reactionData);
        } else {
          const dm = await DirectMessage.findOne({ channel: message.channel });
          if (dm) {
            dm.participants.forEach(participantId => {
              io.to(`user:${participantId}`).emit('message:reaction', reactionData);
            });
          }
        }
        
      } catch (error) {
        console.error('Socket message:react error:', error);
      }
    });
    
    /**
     * Индикатор печати
     */
    socket.on('typing:start', async (data) => {
      const { channelId } = data;
      // Без проверки можно было слать "печатает" в любой чужой канал.
      const access = await checkChannelAccess(channelId, userId);
      if (!access.allowed) return;
      const channel = access.channel;

      if (channel && channel.server) {
        socket.to(`server:${channel.server}`).emit('typing:start', {
          channelId,
          userId,
          username: socket.user.username
        });
      } else {
        const dm = await DirectMessage.findOne({ channel: channelId });
        if (dm) {
          dm.participants.forEach(participantId => {
            if (participantId.toString() !== userId) {
              io.to(`user:${participantId}`).emit('typing:start', {
                channelId,
                userId,
                username: socket.user.username
              });
            }
          });
        }
      }
    });
    
    socket.on('typing:stop', async (data) => {
      const { channelId } = data;
      const access = await checkChannelAccess(channelId, userId);
      if (!access.allowed) return;
      const channel = access.channel;

      if (channel && channel.server) {
        socket.to(`server:${channel.server}`).emit('typing:stop', {
          channelId,
          userId
        });
      } else {
        const dm = await DirectMessage.findOne({ channel: channelId });
        if (dm) {
          dm.participants.forEach(participantId => {
            if (participantId.toString() !== userId) {
              io.to(`user:${participantId}`).emit('typing:stop', {
                channelId,
                userId
              });
            }
          });
        }
      }
    });

    // ==================== ГОЛОСОВЫЕ КАНАЛЫ (WebRTC) ====================
    
    /**
     * Присоединение к голосовому каналу
     */
    socket.on('voice:join', async (data, callback) => {
      try {
        const { channelId } = data;

        if (!channelId || typeof channelId !== 'string') {
          if (typeof callback === 'function') callback({ status: 'error', message: 'Некорректный канал' });
          return;
        }

        const denyAccess = (message = 'Голосовой канал не найден') => {
          socket.emit('error', { message });
          if (typeof callback === 'function') callback({ status: 'error', message });
        };

        // ===== ПОДДЕРЖКА ЗВОНКОВ В ЛС (Virtual Rooms) =====
        const isDMCall = channelId.startsWith('dm_call:');
        let channel = null;

        if (isDMCall) {
          // Раньше в dm_call:<id> входил любой, кто знает id диалога:
          // третий участник молча слушал чужой разговор.
          const conversationId = channelId.slice('dm_call:'.length);
          if (!isValidObjectId(conversationId)) {
            return denyAccess();
          }
          const conversation = await DirectMessage.findById(conversationId).select('participants').lean();
          const isParticipant = conversation && (conversation.participants || [])
            .some(p => p.toString() === userId.toString());
          if (!isParticipant) {
            return denyAccess();
          }
        } else {
          channel = await Channel.findById(channelId);
          if (!channel || channel.type !== 'voice') {
            return denyAccess();
          }
          // Членство в сервере/диалоге обязательно: голосовой канал —
          // такое же содержимое, как и переписка.
          const access = await checkChannelAccess(channelId, userId);
          if (!access.allowed) {
            return denyAccess();
          }
        }
        
        // Добавляем пользователя в голосовой канал (или виртуальную комнату звонка)
        if (!voiceChannels.has(channelId)) {
          voiceChannels.set(channelId, []);
        }
        
        const channelMembers = voiceChannels.get(channelId);
        
        // ===== ЗАЩИТА ОТ ДУБЛИКАТОВ =====
        // Проверяем, есть ли уже этот пользователь в канале
        const existingMemberIndex = channelMembers.findIndex(m => m.userId === userId);
        if (existingMemberIndex > -1) {
          // Пользователь уже в канале — обновляем socketId и переотправляем состояние
          channelMembers[existingMemberIndex].socketId = socket.id;
          socket.join(`voice:${channelId}`);
          console.log(`⚠️ ${socket.user.username} already in voice channel ${channelId}, updated socketId`);
          // Отправляем ему существующих участников (без него) для WebRTC
          const existingMembers = channelMembers
            .filter(m => m.userId !== userId)
            .map(serializeVoiceMember);
          socket.emit('voice:existing_members', { channelId, members: existingMembers });
          // ВАЖНО: re-emit полного списка участников, чтобы UI после реконнекта
          // мог отрисовать свою карточку и список (иначе панель остаётся пустой)
          let reemitter = io.to(`voice:${channelId}`);
          if (channel && channel.server) {
            reemitter = reemitter.to(`server:${channel.server}`);
          }
          reemitter.emit('voice:members_update', {
            channelId,
            members: channelMembers.map(serializeVoiceMember)
          });
          if (typeof callback === 'function') callback({ status: 'ok' });
          return;
        }
        
        // Также проверяем, не находится ли пользователь в ДРУГОМ голосовом канале
        for (const [otherChannelId, otherMembers] of voiceChannels.entries()) {
          if (otherChannelId !== channelId) {
            const idx = otherMembers.findIndex(m => m.userId === userId);
            if (idx > -1) {
              // Выходим из другого голосового канала
              await leaveVoiceChannel(socket, otherChannelId);
            }
          }
        }
        
        // Получаем список существующих участников для WebRTC
        const existingMembers = channelMembers.map(serializeVoiceMember);
        
        // Добавляем нового участника
        channelMembers.push({
          userId,
          socketId: socket.id,
          username: socket.user.username,
          nickname: socket.user.nickname,
          avatar: socket.user.avatar,
          muted: false,
          deafened: false,
          // Состояние стримов участника — рассылается в voice:members_update,
          // чтобы все клиенты знали, кто шарит экран / включил камеру.
          mediaMode: 'none',
          screenSharing: false,
          cameraOn: false
        });
        
        // Присоединяемся к комнате голосового канала
        socket.join(`voice:${channelId}`);
        
        // Обновляем в БД только если это реальный канал сервера
        if (!isDMCall) {
          await Channel.findByIdAndUpdate(channelId, {
            $pull: { voiceMembers: { user: userId } }
          });
          await Channel.findByIdAndUpdate(channelId, {
            $push: {
              voiceMembers: {
                user: userId,
                muted: false,
                deafened: false
              }
            }
          });
        }
        
        // Отправляем новому участнику список существующих
        socket.emit('voice:existing_members', {
          channelId,
          members: existingMembers
        });
        
        // Уведомляем остальных о новом участнике
        socket.to(`voice:${channelId}`).emit('voice:user_joined', {
          channelId,
          userId,
          socketId: socket.id,
          username: socket.user.username,
          nickname: socket.user.nickname,
          avatar: socket.user.avatar
        });
        
        // Уведомляем участников канала и сервер об изменении состава
        // voice:${channelId} room: гарантирует, что joining socket получит апдейт
        //   с собой в списке (фикс race condition + поддержка DM-звонков)
        // server:${channel.server} room: для sidebar других пользователей сервера
        // socket.io v4: .to(...) возвращает НОВЫЙ BroadcastOperator, не мутирует
        let emitter = io.to(`voice:${channelId}`);
        if (channel && channel.server) {
          emitter = emitter.to(`server:${channel.server}`);
        }
        emitter.emit('voice:members_update', {
          channelId,
          members: channelMembers.map(serializeVoiceMember)
        });

        console.log(`🎤 ${socket.user.username} joined voice channel ${channelId}`);
        if (typeof callback === 'function') callback({ status: 'ok' });
        
      } catch (error) {
        console.error('Voice join error:', error);
        socket.emit('error', { message: 'Ошибка при подключении к голосовому каналу' });
        if (typeof callback === 'function') callback({ status: 'error', message: error.message });
      }
    });
    
    /**
     * Выход из голосового канала
     */
    socket.on('voice:leave', async (data, callback) => {
      try {
        const { channelId } = data;
        
        await leaveVoiceChannel(socket, channelId);
        if (typeof callback === 'function') callback({ status: 'ok' });
        
      } catch (error) {
        console.error('Voice leave error:', error);
        if (typeof callback === 'function') callback({ status: 'error', message: error.message });
      }
    });
    
    /**
     * WebRTC - Offer (инициатор соединения)
     */
    socket.on('webrtc:offer', (data) => {
      const { targetSocketId, offer, channelId } = data || {};
      if (!targetSocketId || !offer || !channelId ||
          !socketIsInVoiceChannel(channelId, socket.id) ||
          !socketIsInVoiceChannel(channelId, targetSocketId)) return;
      
      io.to(targetSocketId).emit('webrtc:offer', {
        offer,
        fromSocketId: socket.id,
        fromUserId: userId,
        channelId
      });
    });
    
    /**
     * WebRTC - Answer (ответ на offer)
     */
    socket.on('webrtc:answer', (data) => {
      const { targetSocketId, answer, channelId } = data || {};
      if (!targetSocketId || !answer || !channelId ||
          !socketIsInVoiceChannel(channelId, socket.id) ||
          !socketIsInVoiceChannel(channelId, targetSocketId)) return;
      
      io.to(targetSocketId).emit('webrtc:answer', {
        answer,
        fromSocketId: socket.id,
        channelId
      });
    });
    
    /**
     * WebRTC - ICE Candidate
     */
    socket.on('webrtc:ice_candidate', (data) => {
      const { targetSocketId, candidate, channelId } = data || {};
      if (!targetSocketId || !candidate || !channelId ||
          !socketIsInVoiceChannel(channelId, socket.id) ||
          !socketIsInVoiceChannel(channelId, targetSocketId)) return;
      
      io.to(targetSocketId).emit('webrtc:ice_candidate', {
        candidate,
        fromSocketId: socket.id,
        channelId
      });
    });
    
    /**
     * Переключение микрофона
     */
    socket.on('voice:toggle_mute', async (data) => {
      const { channelId, muted } = data;
      
      // Обновляем в хранилище
      const channelMembers = voiceChannels.get(channelId);
      if (channelMembers) {
        const member = channelMembers.find(m => m.userId === userId);
        if (member) {
          member.muted = muted;
        }
      }
      
      // Уведомляем всех в голосовом канале
      io.to(`voice:${channelId}`).emit('voice:user_muted', {
        channelId,
        userId,
        muted
      });
    });
    
    /**
     * Переключение звука (deafen)
     */
    socket.on('voice:toggle_deafen', async (data) => {
      const { channelId, deafened } = data;
      
      io.to(`voice:${channelId}`).emit('voice:user_deafened', {
        channelId,
        userId,
        deafened
      });
    });
    
    /**
     * Индикатор говорящего
     */
    socket.on('voice:speaking', (data) => {
      const { channelId, speaking } = data;
      
      socket.to(`voice:${channelId}`).emit('voice:user_speaking', {
        channelId,
        userId,
        speaking
      });
    });

    const setVoiceMediaState = (data = {}, callback) => {
      const channelId = String(data.channelId || '').trim();
      const mode = normalizeVoiceMediaMode(data.mode);
      const members = voiceChannels.get(channelId);
      const member = members?.find(item => item.socketId === socket.id && item.userId === userId);

      if (!channelId || !mode) {
        if (typeof callback === 'function') callback({ status: 'error', message: 'Некорректное состояние медиа' });
        return;
      }
      if (!member || !socketIsInVoiceChannel(channelId, socket.id)) {
        if (typeof callback === 'function') callback({ status: 'error', message: 'Сокет не подключён к голосовому каналу' });
        return;
      }

      applyVoiceMediaMode(member, mode);
      const payload = { channelId, userId, socketId: socket.id, mode };
      io.to(`voice:${channelId}`).emit('voice:media_state', payload);

      // Compatibility layer for clients that still listen to the old events.
      if (mode === 'screen') {
        socket.to(`voice:${channelId}`).emit('screen:started', {
          channelId,
          userId,
          username: socket.user.username
        });
        socket.to(`voice:${channelId}`).emit('camera:stopped', { channelId, userId });
      } else if (mode === 'camera') {
        socket.to(`voice:${channelId}`).emit('camera:started', {
          channelId,
          userId,
          username: socket.user.username
        });
        socket.to(`voice:${channelId}`).emit('screen:stopped', { channelId, userId });
      } else {
        socket.to(`voice:${channelId}`).emit('screen:stopped', { channelId, userId });
        socket.to(`voice:${channelId}`).emit('camera:stopped', { channelId, userId });
      }

      io.to(`voice:${channelId}`).emit('voice:members_update', {
        channelId,
        members: members.map(serializeVoiceMember)
      });
      if (typeof callback === 'function') callback({ status: 'ok', ...payload });
    };

    socket.on('voice:media_state', setVoiceMediaState);

    /**
     * Демонстрация экрана - начало
     */
    socket.on('screen:start', (data) => {
      setVoiceMediaState({ channelId: data?.channelId, mode: 'screen' });
    });

    /**
     * Демонстрация экрана - остановка
     */
    socket.on('screen:stop', (data) => {
      setVoiceMediaState({ channelId: data?.channelId, mode: 'none' });
    });

    /**
     * Камера - начало
     */
    socket.on('camera:start', (data) => {
      setVoiceMediaState({ channelId: data?.channelId, mode: 'camera' });
    });

    /**
     * Камера - остановка
     */
    socket.on('camera:stop', (data) => {
      setVoiceMediaState({ channelId: data?.channelId, mode: 'none' });
    });

    // ==================== СЕРВЕРЫ ====================
    
    /**
     * Присоединение к серверу (после создания/вступления)
     */
    socket.on('server:join', (data, callback) => {
      const { serverId } = data;
      socket.join(`server:${serverId}`);
      if (typeof callback === 'function') {
        callback({ status: 'ok' });
      }
    });
    
    /**
     * Покидание сервера
     */
    socket.on('server:leave', (data, callback) => {
      const { serverId } = data;
      socket.leave(`server:${serverId}`);
      if (typeof callback === 'function') {
        callback({ status: 'ok' });
      }
    });

    // ==================== ДРУЗЬЯ ====================
    
    /**
     * Уведомление о запросе в друзья
     */
    socket.on('friend:request', (data) => {
      const { targetUserId } = data;
      
      io.to(`user:${targetUserId}`).emit('friend:request_received', {
        from: {
          _id: userId,
          username: socket.user.username,
          avatar: socket.user.avatar,
          discriminator: socket.user.discriminator
        }
      });
      createNotification(io, {
        user: targetUserId,
        type: 'friend_request',
        actor: userId,
        actorName: socket.user.username,
        actorAvatar: socket.user.avatar,
        preview: `${socket.user.username} отправил вам запрос в друзья`
      });
    });
    
    /**
     * Уведомление о принятии запроса в друзья
     */
    socket.on('friend:accepted', (data) => {
      const { targetUserId } = data;
      
      io.to(`user:${targetUserId}`).emit('friend:request_accepted', {
        by: {
          _id: userId,
          username: socket.user.username,
          avatar: socket.user.avatar,
          discriminator: socket.user.discriminator,
          status: socket.user.status
        }
      });
      createNotification(io, {
        user: targetUserId,
        type: 'friend_accepted',
        actor: userId,
        actorName: socket.user.username,
        actorAvatar: socket.user.avatar,
        preview: `${socket.user.username} принял вашу заявку в друзья`
      });
    });

    // ==================== ГОЛОСОВЫЕ ЗВОНКИ (DM Calls) ====================

    /**
     * Запрос на звонок (от звонящего к получателю)
     */
    socket.on('call:request', async (data) => {
      const { targetUserId } = data;
      const kind = data?.kind === 'video' ? 'video' : 'audio';
      const targetIdStr = targetUserId ? targetUserId.toString() : null;

      if (!isValidObjectId(targetIdStr)) {
        socket.emit('call:error', { message: 'Пользователь не найден' });
        return;
      }

      // Блокировка должна отсекать звонки, а не только сообщения.
      if (await isBlockedBetween(userId, targetIdStr)) {
        socket.emit('call:error', { message: 'Звонок недоступен' });
        return;
      }

      const targetIsOnline = !!connectedUsers.get(targetIdStr)?.size;

      console.log(`📡 Call request attempt: from ${socket.user.username} to ${targetIdStr}. Found sockets: ${targetIsOnline ? 'YES' : 'NO'}`);

      if (targetIsOnline) {
        // Проверка дружбы перед звонком
        const recipientUser = await User.findById(targetIdStr).lean();
        const isFriend = recipientUser ? recipientUser.friends.some(f => f.toString() === userId) : false;
        if (!isFriend) {
          socket.emit('call:error', { message: 'Вы не можете звонить пользователю, который удалил вас из друзей' });
          return;
        }

        const conversation = await DirectMessage.findOne({
          participants: { $all: [userId, targetIdStr] }
        }).select('_id channel participants');

        if (!conversation) {
          socket.emit('call:error', { message: 'Диалог не найден. Откройте личные сообщения перед звонком.' });
          return;
        }

        io.to(`user:${targetIdStr}`).emit('call:incoming', {
          conversationId: conversation._id.toString(),
          channelId: conversation.channel.toString(),
          kind,
          from: {
            _id: userId,
            username: socket.user.username,
            avatar: socket.user.avatar
          }
        });
      } else {
        socket.emit('call:error', { message: 'Пользователь не в сети (Socket connection not found)' });
        // Получатель офлайн — фиксируем пропущенный звонок
        createNotification(io, {
          user: targetIdStr,
          type: 'missed_call',
          actor: userId,
          actorName: socket.user.username,
          actorAvatar: socket.user.avatar,
          preview: `Пропущенный звонок от ${socket.user.username}`
        });
      }
    });

    /**
     * Ответ на звонок (Принять / Отклонить)
     */
    socket.on('call:response', async (data) => {
      const { callerId, accepted, conversationId, channelId } = data;
      const kind = data?.kind === 'video' ? 'video' : 'audio';
      const callerIdStr = callerId ? callerId.toString() : null;

      // Без этой проверки можно было слать «звонок принят» кому угодно:
      // достаточно знать чужой userId, чтобы дёрнуть его в звонок.
      if (!isValidObjectId(callerIdStr) || !isValidObjectId(conversationId)) return;
      const conversation = await DirectMessage.findById(conversationId).select('participants channel').lean();
      if (!conversation) return;
      const ids = (conversation.participants || []).map(p => p.toString());
      if (!ids.includes(userId.toString()) || !ids.includes(callerIdStr)) return;

      const callerIsOnline = !!connectedUsers.get(callerIdStr)?.size;

      if (callerIsOnline) {
        io.to(`user:${callerIdStr}`).emit('call:response', {
          accepted,
          conversationId,
          // channelId берём из диалога, а не из payload: клиент мог прислать чужой.
          channelId: conversation.channel ? conversation.channel.toString() : channelId,
          kind,
          responderId: userId
        });
        console.log(`📞 Call response from ${socket.user.username}: ${accepted ? 'ACCEPTED' : 'DECLINED'}`);
      }
      if (accepted) {
        AnalyticsEvent.create({
          type: 'call_started',
          user: userId,
          relatedUser: callerIdStr,
          metadata: { conversationId, channelId }
        }).catch(error => console.error('[analytics] call event:', error.message));
      }
    });

    /**
     * Завершение звонка
     */
    socket.on('call:end', async (data) => {
      const { targetUserId } = data;
      const targetIdStr = targetUserId ? targetUserId.toString() : null;
      if (!isValidObjectId(targetIdStr)) return;

      // «Завершить звонок» кому попало — способ обрывать чужие разговоры.
      // Отправитель должен быть в одном диалоге с адресатом.
      const conversation = await DirectMessage.findOne({
        participants: { $all: [userId, targetIdStr] }
      }).select('_id').lean();
      if (!conversation) return;

      const targetIsOnline = !!connectedUsers.get(targetIdStr)?.size;

      if (targetIsOnline) {
        io.to(`user:${targetIdStr}`).emit('call:terminated', {
          by: userId
        });
      }
    });

    // ==================== ОТКЛЮЧЕНИЕ ====================
    
    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.user.username} (${socket.id})`);
      
      const becameOffline = removeConnectedSocket(userId, socket.id);
      
      // Выходим из всех голосовых каналов (копируем entries чтобы избежать мутации при итерации)
      const voiceEntries = Array.from(voiceChannels.entries());
      for (const [channelId, members] of voiceEntries) {
        const hasMember = members.some(m => m.socketId === socket.id);
        if (hasMember) {
          await leaveVoiceChannel(socket, channelId);
        }
      }
      
      // Обернем обновление статуса в setTimeout с задержкой 2000 мс (грейс-период)
      setTimeout(async () => {
        // A second device may have connected during the grace period.
        if (connectedUsers.get(userId)?.size) {
          console.log(`ℹ️ Grace period check: User ${socket.user.username} has reconnected, keeping online.`);
          return;
        }
        
        // Обновляем статус
        await User.findByIdAndUpdate(userId, {
          status: 'offline',
          lastSeen: new Date()
        });
        
        // Уведомляем всех об оффлайн статусе
        io.emit('user:status', {
          userId,
          status: 'offline'
        });
        console.log(`💤 Grace period expired: User ${socket.user.username} is now offline.`);
      }, becameOffline ? 2000 : 0);
    });
    
    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
    
    /**
     * Выход из голосового канала
     */
    async function leaveVoiceChannel(socket, channelId) {
      const channelMembers = voiceChannels.get(channelId);
      if (!channelMembers) return;
      const isDMCall = channelId.startsWith('dm_call:');
      
      // Remove only this socket. A second device for the same account may still
      // be connected to the room.
      const initialLength = channelMembers.length;
      const filtered = channelMembers.filter(m => m.socketId !== socket.id);
      
      if (filtered.length === initialLength) {
        // Пользователь не был в канале
        return;
      }
      
      // Заменяем массив отфильтрованным
      voiceChannels.set(channelId, filtered);
      
      if (filtered.length === 0) {
        voiceChannels.delete(channelId);
      }
      
      socket.leave(`voice:${channelId}`);
      
      // Обновляем в БД только для реальных voice channels. DM calls are
      // virtual rooms with ids like dm_call:<conversationId>, not ObjectIds.
      if (!isDMCall) {
        await Channel.findByIdAndUpdate(channelId, {
          $pull: { voiceMembers: { user: userId } }
        });
      }
      
      // Уведомляем остальных
      io.to(`voice:${channelId}`).emit('voice:user_left', {
        channelId,
        userId,
        socketId: socket.id
      });
      
      // Уведомляем сервер
      if (!isDMCall) {
        const channel = await Channel.findById(channelId);
        if (channel && channel.server) {
          io.to(`server:${channel.server}`).emit('voice:members_update', {
            channelId,
            members: filtered.map(serializeVoiceMember)
          });
        }
      }
      
      // Уведомляем клиента что он вышел
      socket.emit('voice:left', { channelId });
      
      console.log(`🔇 ${socket.user.username} left voice channel ${channelId}`);
    }
  
  // ==================== FOUNDER PRIVILEGES ====================

  /**
   * Отправка объявления всем пользователям (только для создателя)
   */
  socket.on('founder:broadcast', async (data) => {
    try {
      if (!isFounderUser(socket.user)) {
        return socket.emit('error', { message: 'Недостаточно прав' });
      }
      
      const { message } = data;
      if (!message) return;
      
      // Отправляем объявление всем подключенным пользователям через новые системные тосты
      io.emit('admin:announcement', {
        title: '📢 Объявление',
        content: message,
        type: 'normal',
        from: socket.user.username,
        timestamp: new Date()
      });
      
      console.log(`👑 FOUNDER BROADCAST: ${message}`);
      
    } catch (error) {
      console.error('Error broadcasting message:', error);
      socket.emit('error', { message: 'Ошибка отправки объявления' });
    }
  });
  
  /**
   * Получение статистики (только для создателя)
   */
  socket.on('founder:get_stats', async () => {
    try {
      if (!isFounderUser(socket.user)) {
        return socket.emit('error', { message: 'Недостаточно прав' });
      }
      
      const Server = require('../models/Server');
      
      // Собираем статистику
      const totalUsers = await User.countDocuments();
      const onlineUsers = connectedUsers.size;
      const totalServers = await Server.countDocuments();
      
      // Подсчет сообщений за сегодня
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const messagesToday = await Message.countDocuments({
        createdAt: { $gte: today }
      });
      
      socket.emit('founder:stats', {
        totalUsers,
        onlineUsers,
        totalServers,
        messagesToday
      });
      
    } catch (error) {
      console.error('Error getting stats:', error);
      socket.emit('error', { message: 'Ошибка получения статистики' });
    }
  });
  
  /**
   * Получение логов (только для создателя)
   */
  socket.on('founder:get_logs', async (data) => {
    try {
      if (!isFounderUser(socket.user)) {
        return socket.emit('error', { message: 'Недостаточно прав' });
      }
      
      const { limit = 100 } = data || {};
      
      // Получаем последние логи входа
      const LoginLog = require('../models/LoginLog');
      const logs = await LoginLog.find()
        .sort({ timestamp: -1 })
        .limit(limit)
        .populate('userId', 'username email');
      
      socket.emit('founder:logs', { logs });
      
    } catch (error) {
      console.error('Error getting logs:', error);
      socket.emit('error', { message: 'Ошибка получения логов' });
    }
  });
  
  // ==================== ПРОФИЛИ ПОЛЬЗОВАТЕЛЕЙ ====================
  
  /**
   * Обновление профиля пользователя
   */
  socket.on('profile:update', async (data) => {
    try {
      const { username, bio, banner, profileColor, badges } = data;
      
      const updateData = {};
      
      // Обработка имени
      if (username !== undefined && username !== socket.user.username) {
        const nextUsername = normalizeUsername(username);
        const validationError = getUsernameValidationError(nextUsername);
        if (validationError) return socket.emit('error', { message: validationError });

        // Проверка уникальности
        const existingUser = await findUserByUsername(User, nextUsername, userId);
        if (existingUser) {
          return socket.emit('error', { message: 'Имя пользователя уже занято' });
        }
        updateData.username = nextUsername;
      }
      
      if (bio !== undefined) updateData.bio = bio;
      if (banner !== undefined) updateData.banner = banner;
      if (profileColor !== undefined) updateData.profileColor = profileColor;
      
      // Только создатель может менять значки
      if (badges !== undefined && isFounderUser(socket.user)) {
        updateData.badges = badges;
      }
      
      const updatedUser = await User.findByIdAndUpdate(
        userId,
        updateData,
        { new: true, runValidators: true }
      ).select('-password');

      if (updateData.username) socket.user.username = updateData.username;
      
      // Уведомляем всех о обновлении профиля
      io.emit('profile:updated', {
        userId,
        profile: updatedUser.toPublicJSON()
      });
      
      socket.emit('profile:update_success', updatedUser.toPublicJSON());
      
    } catch (error) {
      console.error('Error updating profile:', error);
      if (getDuplicateField(error) === 'username') {
        return socket.emit('error', { message: 'Имя пользователя уже занято' });
      }
      socket.emit('error', { message: 'Ошибка обновления профиля' });
    }
  });
  
  /**
   * Получение профиля пользователя
   */
  socket.on('profile:get', async (data) => {
    try {
      const { userId: targetUserId } = data;
      
      const user = await User.findById(targetUserId).select('-password');
      if (!user) {
        return socket.emit('error', { message: 'Пользователь не найден' });
      }
      
      socket.emit('profile:data', user.toPublicJSON());
      
    } catch (error) {
      console.error('Error getting profile:', error);
      socket.emit('error', { message: 'Ошибка получения профиля' });
    }
  });

  /**
   * Подключение интеграций (соц. сетей)
   */
  socket.on('integration:connect', async (data) => {
    try {
      const { platform, url } = data;
      
      if (!['youtube', 'tiktok'].includes(platform)) {
        return socket.emit('error', { message: 'Неподдерживаемая платформа' });
      }
      
      const user = await User.findById(userId);
      if (!user) return;
      
      if (!user.connectedAccounts) {
        user.connectedAccounts = {};
      }
      
      // Имитация верификации по URL
      const mockName = url.split('/').filter(Boolean).pop() || 'User';
      
      user.connectedAccounts[platform] = {
        name: mockName,
        url: url,
        verified: true // Имитируем успешное подтверждение
      };
      
      await user.save();
      
      socket.emit('profile:update_success', user.toPublicJSON());
      io.emit('profile:updated', {
        userId,
        profile: user.toPublicJSON()
      });
      
    } catch (error) {
      console.error('Integration error:', error);
      socket.emit('error', { message: 'Ошибка подключения интеграции' });
    }
  });
  
  // ==================== БЛОКИРОВКА ПОЛЬЗОВАТЕЛЕЙ ====================
  
  /**
   * Блокировка пользователя
   */
  socket.on('user:block', async (data) => {
    try {
      const { userId: targetUserId } = data;

      if (userId === targetUserId) {
        return socket.emit('error', { message: 'Нельзя заблокировать самого себя' });
      }
      if (!isValidObjectId(targetUserId)) {
        return socket.emit('error', { message: 'Пользователь не найден' });
      }

      const user = await User.findById(userId);
      if (!user.blockedUsers.includes(targetUserId)) {
        user.blockedUsers.push(targetUserId);
        await user.save();
      }

      // Блокировка должна разрывать текущую связь, а не только будущую:
      // убираем из друзей и гасим висящие заявки в обе стороны.
      await User.findByIdAndUpdate(userId, {
        $pull: {
          friends: targetUserId,
          friendRequestsSent: { to: targetUserId },
          friendRequestsReceived: { from: targetUserId }
        }
      });
      await User.findByIdAndUpdate(targetUserId, {
        $pull: {
          friends: userId,
          friendRequestsSent: { to: userId },
          friendRequestsReceived: { from: userId }
        }
      });

      socket.emit('user:blocked', { userId: targetUserId });
      
    } catch (error) {
      console.error('Error blocking user:', error);
      socket.emit('error', { message: 'Ошибка блокировки пользователя' });
    }
  });
  
  /**
   * Разблокировка пользователя
   */
  socket.on('user:unblock', async (data) => {
    try {
      const { userId: targetUserId } = data;
      
      const user = await User.findById(userId);
      user.blockedUsers = user.blockedUsers.filter(id => id.toString() !== targetUserId);
      await user.save();
      
      socket.emit('user:unblocked', { userId: targetUserId });
      
    } catch (error) {
      console.error('Error unblocking user:', error);
      socket.emit('error', { message: 'Ошибка разблокировки пользователя' });
    }
  });
  
  /**
   * Получение списка заблокированных пользователей
   */
  socket.on('user:get_blocked', async () => {
    try {
      const user = await User.findById(userId).populate('blockedUsers', 'username avatar');
      socket.emit('user:blocked_list', { blockedUsers: user.blockedUsers });
      
    } catch (error) {
      console.error('Error getting blocked users:', error);
      socket.emit('error', { message: 'Ошибка получения списка заблокированных' });
    }
  });
  
  // ==================== ЗАКРЕПЛЕННЫЕ СООБЩЕНИЯ ====================
  
  /**
   * Закрепить сообщение
   */
  socket.on('message:pin', async (data) => {
    try {
      const { messageId, channelId } = data;

      const access = await checkChannelAccess(channelId, userId);
      if (!access.allowed) {
        return socket.emit('error', { message: 'Канал не найден' });
      }
      const channel = access.channel;
      
      const message = await Message.findById(messageId);
      if (!message) {
        return socket.emit('error', { message: 'Сообщение не найдено' });
      }
      
      // Проверяем что сообщение из этого канала
      if (message.channel.toString() !== channelId) {
        return socket.emit('error', { message: 'Сообщение не принадлежит этому каналу' });
      }

      // Неотправленную капсулу закрепить нельзя: закреплённые видит весь
      // канал, и автор так раскрыл бы собеседнику её содержимое до срока.
      if (message.delivered === false) {
        return socket.emit('error', { message: 'Капсулу нельзя закрепить до доставки' });
      }
      
      // Добавляем в закрепленные если еще не закреплено
      if (!channel.pinnedMessages.includes(messageId)) {
        channel.pinnedMessages.push(messageId);
        await channel.save();
      }
      
      // Уведомляем всех в канале
      if (channel.server) {
        io.to(`server:${channel.server}`).emit('message:pinned', {
          messageId,
          channelId,
          pinnedBy: userId
        });
      } else {
        const dm = await DirectMessage.findOne({ channel: channelId });
        if (dm) {
          dm.participants.forEach(participantId => {
            io.to(`user:${participantId}`).emit('message:pinned', {
              messageId,
              channelId,
              pinnedBy: userId
            });
          });
        }
      }
      
      console.log(`📌 Message ${messageId} pinned in channel ${channelId}`);
      
    } catch (error) {
      console.error('Error pinning message:', error);
      socket.emit('error', { message: 'Ошибка закрепления сообщения' });
    }
  });
  
  /**
   * Открепить сообщение
   */
  socket.on('message:unpin', async (data) => {
    try {
      const { messageId, channelId } = data;

      const access = await checkChannelAccess(channelId, userId);
      if (!access.allowed) {
        return socket.emit('error', { message: 'Канал не найден' });
      }
      const channel = access.channel;
      
      // Удаляем из закрепленных
      channel.pinnedMessages = channel.pinnedMessages.filter(
        id => id.toString() !== messageId
      );
      await channel.save();
      
      // Уведомляем всех в канале
      if (channel.server) {
        io.to(`server:${channel.server}`).emit('message:unpinned', {
          messageId,
          channelId
        });
      } else {
        const dm = await DirectMessage.findOne({ channel: channelId });
        if (dm) {
          dm.participants.forEach(participantId => {
            io.to(`user:${participantId}`).emit('message:unpinned', {
              messageId,
              channelId
            });
          });
        }
      }
      
      console.log(`📌 Message ${messageId} unpinned from channel ${channelId}`);
      
    } catch (error) {
      console.error('Error unpinning message:', error);
      socket.emit('error', { message: 'Ошибка открепления сообщения' });
    }
  });
  
  /**
   * Получить закрепленные сообщения канала
   */
  socket.on('message:get_pinned', async (data) => {
    try {
      const { channelId } = data;

      // Закреплённые — это содержимое канала: нужен доступ.
      const access = await checkChannelAccess(channelId, userId);
      if (!access.allowed) {
        return socket.emit('error', { message: 'Канал не найден' });
      }

      const channel = await Channel.findById(channelId)
        .populate({
          path: 'pinnedMessages',
          populate: { path: 'author', select: 'username nickname avatar role' }
        });

      if (!channel) {
        return socket.emit('error', { message: 'Канал не найден' });
      }
      
      socket.emit('message:pinned_list', {
        channelId,
        // Страховка: если капсула успела попасть в pinnedMessages
        // (старые записи), она всё равно не уедет до срока.
        messages: (channel.pinnedMessages || []).filter(m => m && m.delivered !== false)
      });
      
    } catch (error) {
      console.error('Error getting pinned messages:', error);
      socket.emit('error', { message: 'Ошибка получения закрепленных сообщений' });
    }
  });
  
  // ==================== ПОИСК СООБЩЕНИЙ ====================
  
  /**
   * Поиск сообщений в канале
   */
  socket.on('message:search', async (data) => {
    try {
      const { channelId, query, limit = 50 } = data;

      if (!query || query.trim().length === 0) {
        return socket.emit('message:search_results', { results: [] });
      }

      // Без этой проверки поиск по channelId выгружал чужую переписку.
      const access = await checkChannelAccess(channelId, userId);
      if (!access.allowed) {
        return socket.emit('error', { message: 'Канал не найден' });
      }

      // Поиск сообщений по содержимому.
      // escapeRegex обязателен: '.*' иначе выгружает весь канал.
      const messages = await Message.find({
        channel: channelId,
        content: { $regex: escapeRegex(String(query).slice(0, 200)), $options: 'i' },
        deleted: false,
        delivered: { $ne: false }
      })
        .populate('author', 'username nickname avatar role')
        .sort({ createdAt: -1 })
        .limit(Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100));
      
      socket.emit('message:search_results', {
        channelId,
        query,
        results: messages
      });
      
      console.log(`🔍 Search in channel ${channelId}: "${query}" - ${messages.length} results`);
      
    } catch (error) {
      console.error('Error searching messages:', error);
      socket.emit('error', { message: 'Ошибка поиска сообщений' });
    }
  });
  
  /**
   * Поиск сообщений на сервере
   */
  socket.on('message:search_server', async (data) => {
    try {
      const { serverId, query, limit = 50 } = data;
      
      if (!query || query.trim().length === 0) {
        return socket.emit('message:search_results', { results: [] });
      }
      
      // Самая опасная дыра: один вызов отдавал всю историю чужого
      // сервера тому, кто знает его id. Нужно членство.
      const access = await checkServerAccess(serverId, userId);
      if (!access.allowed) {
        return socket.emit('error', { message: 'Сервер не найден' });
      }

      // Получаем все каналы сервера
      const channels = await Channel.find({ server: serverId });
      const channelIds = channels.map(c => c._id);

      // Поиск сообщений по всем каналам сервера
      const messages = await Message.find({
        channel: { $in: channelIds },
        content: { $regex: escapeRegex(String(query).slice(0, 200)), $options: 'i' },
        deleted: false,
        delivered: { $ne: false }
      })
        .populate('author', 'username nickname avatar role')
        .populate('channel', 'name')
        .sort({ createdAt: -1 })
        .limit(Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100));
      
      socket.emit('message:search_results', {
        serverId,
        query,
        results: messages
      });
      
      console.log(`🔍 Search in server ${serverId}: "${query}" - ${messages.length} results`);
      
    } catch (error) {
      console.error('Error searching messages in server:', error);
      socket.emit('error', { message: 'Ошибка поиска сообщений' });
    }
  });
  
  // ==================== РОЛИ И ПРАВА ====================
  
  /**
   * Создать роль на сервере
   */
  socket.on('role:create', async (data) => {
    try {
      const { serverId, name, color, permissions } = data;
      
      const Server = require('../models/Server');
      const server = await Server.findById(serverId);
      
      if (!server) {
        return socket.emit('error', { message: 'Сервер не найден' });
      }
      
      // Проверяем права (только владелец или тот, кому дали manageRoles)
      const isOwner = server.owner.toString() === userId;

      if (!isOwner && !canManageServerRoles(server, userId)) {
        return socket.emit('error', { message: 'Недостаточно прав' });
      }

      // Создаем роль.
      // permissions приходят от клиента, поэтому фильтруем по whitelist:
      // раньше участник с manageRoles мог создать роль с administrator: true
      // и выдать её себе — то есть забрать сервер у владельца.
      const newRole = {
        name: String(name || 'Новая роль').slice(0, 64),
        color: color || '#99aab5',
        permissions: sanitizeRolePermissions(permissions, { isOwner }),
        position: server.roles.length
      };
      
      server.roles.push(newRole);
      await server.save();
      
      // Уведомляем всех на сервере
      io.to(`server:${serverId}`).emit('role:created', {
        serverId,
        role: server.roles[server.roles.length - 1]
      });
      
      console.log(`🎭 Role created: ${newRole.name} on server ${serverId}`);
      
    } catch (error) {
      console.error('Error creating role:', error);
      socket.emit('error', { message: 'Ошибка создания роли' });
    }
  });
  
  /**
   * Обновить роль
   */
  socket.on('role:update', async (data) => {
    try {
      const { serverId, roleId, updates } = data;
      
      const Server = require('../models/Server');
      const server = await Server.findById(serverId);
      
      if (!server) {
        return socket.emit('error', { message: 'Сервер не найден' });
      }
      
      // Проверяем права
      const isOwner = server.owner.toString() === userId;

      if (!isOwner && !canManageServerRoles(server, userId)) {
        return socket.emit('error', { message: 'Недостаточно прав' });
      }

      // Обновляем роль
      const role = server.roles.id(roleId);
      if (!role) {
        return socket.emit('error', { message: 'Роль не найдена' });
      }

      if (updates.name) role.name = String(updates.name).slice(0, 64);
      if (updates.color) role.color = updates.color;
      // Слияние с санитизированным набором: administrator добавит только владелец.
      if (updates.permissions) {
        role.permissions = {
          ...(role.permissions ? role.permissions.toObject?.() || role.permissions : {}),
          ...sanitizeRolePermissions(updates.permissions, { isOwner })
        };
      }
      if (updates.position !== undefined) role.position = updates.position;
      if (updates.hoist !== undefined) role.hoist = updates.hoist;
      if (updates.mentionable !== undefined) role.mentionable = updates.mentionable;
      
      await server.save();
      
      // Уведомляем всех на сервере
      io.to(`server:${serverId}`).emit('role:updated', {
        serverId,
        roleId,
        role
      });
      
      console.log(`🎭 Role updated: ${role.name} on server ${serverId}`);
      
    } catch (error) {
      console.error('Error updating role:', error);
      socket.emit('error', { message: 'Ошибка обновления роли' });
    }
  });
  
  /**
   * Удалить роль
   */
  socket.on('role:delete', async (data) => {
    try {
      const { serverId, roleId } = data;
      
      const Server = require('../models/Server');
      const server = await Server.findById(serverId);
      
      if (!server) {
        return socket.emit('error', { message: 'Сервер не найден' });
      }
      
      // Проверяем права
      const isOwner = server.owner.toString() === userId;
      if (!isOwner) {
        return socket.emit('error', { message: 'Только владелец может удалять роли' });
      }
      
      // Удаляем роль
      server.roles.pull(roleId);
      
      // Удаляем роль у всех участников
      server.members.forEach(member => {
        member.roles = member.roles.filter(r => r.toString() !== roleId.toString());
      });
      
      await server.save();
      
      // Уведомляем всех на сервере
      io.to(`server:${serverId}`).emit('role:deleted', {
        serverId,
        roleId
      });
      
      console.log(`🎭 Role deleted: ${roleId} from server ${serverId}`);
      
    } catch (error) {
      console.error('Error deleting role:', error);
      socket.emit('error', { message: 'Ошибка удаления роли' });
    }
  });
  
  /**
   * Назначить роль участнику
   */
  socket.on('role:assign', async (data) => {
    try {
      const { serverId, targetUserId, roleId } = data;
      
      const Server = require('../models/Server');
      const server = await Server.findById(serverId);
      
      if (!server) {
        return socket.emit('error', { message: 'Сервер не найден' });
      }
      
      // Проверяем права
      const isOwner = server.owner.toString() === userId;

      if (!isOwner && !canManageServerRoles(server, userId)) {
        return socket.emit('error', { message: 'Недостаточно прав' });
      }

      // Роль с administrator раздаёт только владелец. Иначе участник
      // с manageRoles просто выдаёт себе готовую админ-роль — обход того же
      // ограничения, что и в role:create, но с другой стороны.
      const roleToAssign = server.roles.id(roleId);
      if (!roleToAssign) {
        return socket.emit('error', { message: 'Роль не найдена' });
      }
      if (!isOwner && roleToAssign.permissions && roleToAssign.permissions.administrator) {
        return socket.emit('error', { message: 'Только владелец может выдавать роль администратора' });
      }

      // Находим участника
      const targetMember = server.members.find(m => m.user.toString() === targetUserId);
      if (!targetMember) {
        return socket.emit('error', { message: 'Участник не найден' });
      }
      const roleIdStr = roleId.toString();
      const alreadyHas = targetMember.roles.some((rid) => rid.toString() === roleIdStr);
      if (!alreadyHas) {
        targetMember.roles.push(mongoose.Types.ObjectId.isValid(roleId)
          ? new mongoose.Types.ObjectId(roleId)
          : roleId);
        await server.save();
        
        // Уведомляем всех на сервере
        io.to(`server:${serverId}`).emit('role:assigned', {
          serverId,
          userId: targetUserId,
          roleId
        });
        
        console.log(`🎭 Role ${roleId} assigned to user ${targetUserId} on server ${serverId}`);
      }
      
    } catch (error) {
      console.error('Error assigning role:', error);
      socket.emit('error', { message: 'Ошибка назначения роли' });
    }
  });
  
  /**
   * Снять роль с участника
   */
  socket.on('role:remove', async (data) => {
    try {
      const { serverId, targetUserId, roleId } = data;
      
      const Server = require('../models/Server');
      const server = await Server.findById(serverId);
      
      if (!server) {
        return socket.emit('error', { message: 'Сервер не найден' });
      }
      
      // Проверяем права
      const isOwner = server.owner.toString() === userId;

      if (!isOwner && !canManageServerRoles(server, userId)) {
        return socket.emit('error', { message: 'Недостаточно прав' });
      }

      // Находим участника
      const targetMember = server.members.find(m => m.user.toString() === targetUserId);
      if (!targetMember) {
        return socket.emit('error', { message: 'Участник не найден' });
      }

      // Удаляем роль
      targetMember.roles = targetMember.roles.filter((r) => r.toString() !== roleId.toString());
      await server.save();
      
      // Уведомляем всех на сервере
      io.to(`server:${serverId}`).emit('role:removed', {
        serverId,
        userId: targetUserId,
        roleId
      });
      
      console.log(`🎭 Role ${roleId} removed from user ${targetUserId} on server ${serverId}`);
      
    } catch (error) {
      console.error('Error removing role:', error);
      socket.emit('error', { message: 'Ошибка снятия роли' });
    }
  });
  
  }); // Закрытие io.on('connection')
  
  // Экспортируем для использования в других модулях
  return { connectedUsers, voiceChannels };
};
