/**
 * Socket.io обработчик
 * Управляет всеми real-time событиями: сообщения, голос, статусы
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const DirectMessage = require('../models/DirectMessage');

const JWT_SECRET = process.env.JWT_SECRET || 'discord-clone-secret-key-2024';

// Хранилище подключенных пользователей
// { userId: socketId }
const connectedUsers = new Map();

// Хранилище участников голосовых каналов
// { channelId: [{ userId, socketId }] }
const voiceChannels = new Map();

module.exports = (io) => {
  
  // Middleware для аутентификации Socket.io соединений
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Токен не предоставлен'));
      }
      
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password');
      
      if (!user) {
        return next(new Error('Пользователь не найден'));
      }
      
      socket.user = user;
      next();
      
    } catch (error) {
      next(new Error('Ошибка аутентификации'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user._id.toString();
    console.log(`✅ User connected: ${socket.user.username} (${socket.id})`);
    
    // Сохраняем соединение
    connectedUsers.set(userId, socket.id);
    
    // Обновляем статус пользователя на "online"
    await User.findByIdAndUpdate(userId, { status: 'online', lastSeen: new Date() });
    
    // Уведомляем всех о новом онлайн пользователе
    socket.broadcast.emit('user:status', {
      userId,
      status: 'online'
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

    // ==================== СООБЩЕНИЯ ====================
    
    /**
     * Отправка сообщения в канал (Оптимистичное обновление)
     */
    socket.on('message:send', async (data) => {
      try {
        const { channelId, content, replyTo, attachments } = data;
        
        if (!channelId || (!content && (!attachments || attachments.length === 0))) {
          return socket.emit('error', { message: 'Неверные данные сообщения' });
        }
        
        const channel = await Channel.findById(channelId);
        if (!channel) {
          return socket.emit('error', { message: 'Канал не найден' });
        }
        
        // ШАГ А: МГНОВЕННО рассылаем сообщение всем в комнате (даже до сохранения в БД)
        const tempMessage = {
          _id: 'temp_' + Date.now() + '_' + userId,
          content: content || '',
          author: {
            _id: userId,
            username: socket.user.username,
            avatar: socket.user.avatar,
            discriminator: socket.user.discriminator
          },
          channel: channelId,
          server: channel.server,
          replyTo: replyTo || null,
          attachments: attachments || [],
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
            // Отправляем сообщение обоим участникам
            dm.participants.forEach(participantId => {
              io.to(`user:${participantId}`).emit('message:new', {
                channelId,
                message: tempMessage
              });
            });
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
            replyTo: replyTo || null,
            attachments: attachments || []
          });
          
          await message.save();
          
          // Обновляем последнее сообщение в канале
          await Channel.findByIdAndUpdate(channelId, { lastMessage: message._id });
          
          // Заполняем данные
          await message.populate('author', 'username avatar discriminator');
          if (replyTo) {
            await message.populate({
              path: 'replyTo',
              populate: { path: 'author', select: 'username avatar' }
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
              // Обновляем счетчик непрочитанных для другого участника
              const otherParticipant = dm.participants.find(p => p.toString() !== userId);
              if (otherParticipant) {
                await DirectMessage.findByIdAndUpdate(dm._id, {
                  $inc: { 'unreadCount.$[elem].count': 1 },
                  lastMessage: message._id,
                  updatedAt: new Date()
                }, {
                  arrayFilters: [{ 'elem.user': otherParticipant }]
                });
                
                // Уведомляем другого участника
                const otherSocketId = connectedUsers.get(otherParticipant.toString());
                if (otherSocketId) {
                  io.to(`user:${otherParticipant}`).emit('dm:new_message', {
                    conversationId: dm._id,
                    message
                  });
                }
              }
              
              // Отправляем обновление сообщения обоим участникам
              dm.participants.forEach(participantId => {
                io.to(`user:${participantId}`).emit('message:update', {
                  channelId,
                  tempId: tempMessage._id,
                  message
                });
              });
            }
          }
          
          // Уведомления для упомянутых пользователей
          if (content && content.includes('@')) {
            // Простая обработка упоминаний
            const mentionRegex = /@(\w+)/g;
            let match;
            while ((match = mentionRegex.exec(content)) !== null) {
              const mentionedUsername = match[1];
              const mentionedUser = await User.findOne({ username: mentionedUsername });
              if (mentionedUser && mentionedUser._id.toString() !== userId) {
                io.to(`user:${mentionedUser._id}`).emit('notification:mention', {
                  from: socket.user.username,
                  channelId,
                  messageId: message._id,
                  content: content.substring(0, 100)
                });
              }
            }
          }
        } catch (dbError) {
          console.error('Ошибка сохранения в БД (но в чат доставлено):', dbError.message);
          // Уведомляем отправителя об ошибке сохранения
          socket.emit('error', { message: 'Сообщение доставлено, но не сохранено в базе данных' });
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
        
        const message = await Message.findById(messageId);
        if (!message) return;
        
        if (message.author.toString() !== userId) {
          return socket.emit('error', { message: 'Нет прав для редактирования' });
        }
        
        message.content = content;
        message.edited = true;
        message.editedAt = new Date();
        await message.save();
        
        await message.populate('author', 'username avatar discriminator');
        
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
        
        const message = await Message.findById(messageId);
        if (!message) return;
        
        if (message.author.toString() !== userId) {
          return socket.emit('error', { message: 'Нет прав для удаления' });
        }
        
        message.deleted = true;
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
        
        const message = await Message.findById(messageId);
        if (!message) return;
        
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
      const channel = await Channel.findById(channelId);
      
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
      const channel = await Channel.findById(channelId);
      
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
    socket.on('voice:join', async (data) => {
      try {
        const { channelId } = data;
        
        // ===== ПОДДЕРЖКА ЗВОНКОВ В ЛС (Virtual Rooms) =====
        const isDMCall = channelId.startsWith('dm_call:');
        let channel = null;

        if (!isDMCall) {
          channel = await Channel.findById(channelId);
          if (!channel || channel.type !== 'voice') {
            return socket.emit('error', { message: 'Голосовой канал не найден' });
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
          // Пользователь уже в канале — обновляем socketId и выходим
          channelMembers[existingMemberIndex].socketId = socket.id;
          socket.join(`voice:${channelId}`);
          console.log(`⚠️ ${socket.user.username} already in voice channel ${channelId}, updated socketId`);
          // Отправляем ему существующих участников заново
          const existingMembers = channelMembers.filter(m => m.userId !== userId).map(m => ({
            userId: m.userId,
            socketId: m.socketId,
            username: m.username,
            avatar: m.avatar
          }));
          socket.emit('voice:existing_members', { channelId, members: existingMembers });
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
        const existingMembers = channelMembers.map(m => ({
          userId: m.userId,
          socketId: m.socketId,
          username: m.username,
          avatar: m.avatar
        }));
        
        // Добавляем нового участника
        channelMembers.push({
          userId,
          socketId: socket.id,
          username: socket.user.username,
          avatar: socket.user.avatar
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
          avatar: socket.user.avatar
        });
        
        // Уведомляем сервер об изменении участников голосового канала
        if (channel && channel.server) {
          io.to(`server:${channel.server}`).emit('voice:members_update', {
            channelId,
            members: channelMembers
          });
        }
        
        console.log(`🎤 ${socket.user.username} joined voice channel ${channelId}`);
        
      } catch (error) {
        console.error('Voice join error:', error);
        socket.emit('error', { message: 'Ошибка при подключении к голосовому каналу' });
      }
    });
    
    /**
     * Выход из голосового канала
     */
    socket.on('voice:leave', async (data) => {
      try {
        const { channelId } = data;
        
        await leaveVoiceChannel(socket, channelId);
        
      } catch (error) {
        console.error('Voice leave error:', error);
      }
    });
    
    /**
     * WebRTC - Offer (инициатор соединения)
     */
    socket.on('webrtc:offer', (data) => {
      const { targetSocketId, offer, channelId } = data;
      
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
      const { targetSocketId, answer, channelId } = data;
      
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
      const { targetSocketId, candidate, channelId } = data;
      
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

    /**
     * Демонстрация экрана - начало
     */
    socket.on('screen:start', (data) => {
      const { channelId } = data;
      socket.to(`voice:${channelId}`).emit('screen:started', {
        channelId,
        userId,
        username: socket.user.username
      });
    });

    /**
     * Демонстрация экрана - остановка
     */
    socket.on('screen:stop', (data) => {
      const { channelId } = data;
      socket.to(`voice:${channelId}`).emit('screen:stopped', {
        channelId,
        userId
      });
    });

    // ==================== СЕРВЕРЫ ====================
    
    /**
     * Присоединение к серверу (после создания/вступления)
     */
    socket.on('server:join', (data) => {
      const { serverId } = data;
      socket.join(`server:${serverId}`);
    });
    
    /**
     * Покидание сервера
     */
    socket.on('server:leave', (data) => {
      const { serverId } = data;
      socket.leave(`server:${serverId}`);
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
    });

    // ==================== ГОЛОСОВЫЕ ЗВОНКИ (DM Calls) ====================

    /**
     * Запрос на звонок (от звонящего к получателю)
     */
    socket.on('call:request', (data) => {
      const { targetUserId } = data;
      const targetIdStr = targetUserId ? targetUserId.toString() : null;
      const targetSocketId = connectedUsers.get(targetIdStr);

      console.log(`📡 Call request attempt: from ${socket.user.username} to ${targetIdStr}. Found socket: ${targetSocketId ? 'YES' : 'NO'}`);

      if (targetSocketId) {
        io.to(targetSocketId).emit('call:incoming', {
          from: {
            _id: userId,
            username: socket.user.username,
            avatar: socket.user.avatar
          }
        });
      } else {
        socket.emit('call:error', { message: 'Пользователь не в сети (Socket connection not found)' });
      }
    });

    /**
     * Ответ на звонок (Принять / Отклонить)
     */
    socket.on('call:response', (data) => {
      const { callerId, accepted } = data;
      const callerIdStr = callerId ? callerId.toString() : null;
      const callerSocketId = connectedUsers.get(callerIdStr);

      if (callerSocketId) {
        io.to(callerSocketId).emit('call:response', {
          accepted,
          responderId: userId
        });
        console.log(`📞 Call response from ${socket.user.username}: ${accepted ? 'ACCEPTED' : 'DECLINED'}`);
      }
    });

    /**
     * Завершение звонка
     */
    socket.on('call:end', (data) => {
      const { targetUserId } = data;
      const targetIdStr = targetUserId ? targetUserId.toString() : null;
      const targetSocketId = connectedUsers.get(targetIdStr);

      if (targetSocketId) {
        io.to(targetSocketId).emit('call:terminated', {
          by: userId
        });
      }
    });

    // ==================== ОТКЛЮЧЕНИЕ ====================
    
    socket.on('disconnect', async () => {
      console.log(`❌ User disconnected: ${socket.user.username} (${socket.id})`);
      
      // Удаляем из хранилища
      connectedUsers.delete(userId);
      
      // Выходим из всех голосовых каналов (копируем entries чтобы избежать мутации при итерации)
      const voiceEntries = Array.from(voiceChannels.entries());
      for (const [channelId, members] of voiceEntries) {
        const hasMember = members.some(m => m.userId === userId || m.socketId === socket.id);
        if (hasMember) {
          await leaveVoiceChannel(socket, channelId);
        }
      }
      
      // Обновляем статус
      await User.findByIdAndUpdate(userId, {
        status: 'offline',
        lastSeen: new Date()
      });
      
      // Уведомляем всех об оффлайн статусе
      socket.broadcast.emit('user:status', {
        userId,
        status: 'offline'
      });
    });
    
    // ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================
    
    /**
     * Выход из голосового канала
     */
    async function leaveVoiceChannel(socket, channelId) {
      const channelMembers = voiceChannels.get(channelId);
      if (!channelMembers) return;
      
      // Удаляем ВСЕ записи этого пользователя (защита от дубликатов)
      const initialLength = channelMembers.length;
      const filtered = channelMembers.filter(m => m.userId !== userId && m.socketId !== socket.id);
      
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
      
      // Обновляем в БД
      await Channel.findByIdAndUpdate(channelId, {
        $pull: { voiceMembers: { user: userId } }
      });
      
      // Уведомляем остальных
      io.to(`voice:${channelId}`).emit('voice:user_left', {
        channelId,
        userId,
        socketId: socket.id
      });
      
      // Уведомляем сервер
      const channel = await Channel.findById(channelId);
      if (channel && channel.server) {
        io.to(`server:${channel.server}`).emit('voice:members_update', {
          channelId,
          members: filtered
        });
      }
      
      // Уведомляем клиента что он вышел
      socket.emit('voice:left', { channelId });
      
      console.log(`🔇 ${socket.user.username} left voice channel ${channelId}`);
    }
  });
  
  // Экспортируем для использования в других модулях
  return { connectedUsers, voiceChannels };
};
