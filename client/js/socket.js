let socket = null;

// Кэш маппинга временных ID на реальные ID сообщений
const tempIdMapping = new Map();

// Экспортируем в глобальную область для доступа из других модулей
window.tempIdMapping = tempIdMapping;

/**
 * Инициализация Socket.io соединения
 */
async function initSocket(token) {
  // Ждем пока api.js определит правильный BASE_URL (продакшн или дев)
  await window.apiReady;
  
  const SOCKET_URL = window.BASE_URL || 'http://localhost:5555';
  console.log('🔌 Socket connecting to:', SOCKET_URL);
  
  if (socket) {
    socket.disconnect();
  }

  // Подключаемся к серверу с токеном авторизации
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });
  
  // Экспортируем в глобальную область
  window.socket = socket;

  // Обработчики подключения
  socket.on('connect', () => {
    console.log('✅ Socket connected:', socket.id);
    if (typeof window.initRoleSocketHandlers === 'function') {
      window.initRoleSocketHandlers();
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('❌ Socket disconnected:', reason);
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error.message);
  });

  socket.on('reconnect', (attemptNumber) => {
    console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
  });

  // ===== ОБРАБОТЧИКИ СООБЩЕНИЙ =====

  // Новое сообщение
  socket.on('message:new', (data) => {
    const { channelId, message } = data;
    const currentCh = window.currentChannelId?.toString();
    const msgCh = channelId?.toString();
    if (currentCh && currentCh === msgCh) {
      // Не дублируем свои сообщения — они уже были мгновенно показаны
      if (message.author?._id !== window.currentUser?._id) {
        appendMessage(message);
        scrollToBottom();
      }
    }
    // Уведомление если не в этом канале
    if (!currentCh || currentCh !== msgCh) {
      showMessageNotification(message);
    }
  });

  // Сообщение отредактировано
  socket.on('message:edited', (data) => {
    const { channelId, message } = data;
    if (window.currentChannelId?.toString() === channelId?.toString()) {
      updateMessageInDOM(message);
    }
  });

  // Сообщение сохранено в БД (обновление временного ID)
  socket.on('message:update', (data) => {
    const { channelId, tempId, message } = data;
    
    // Сохраняем маппинг временного ID на реальный
    if (tempId && message._id) {
      tempIdMapping.set(tempId, message._id);
    }
    
    if (window.currentChannelId?.toString() === channelId?.toString()) {
      updateTempMessageInDOM(tempId, message);
    }
  });

  // Сообщение удалено
  socket.on('message:deleted', (data) => {
    const { channelId, messageId } = data;
    if (window.currentChannelId?.toString() === channelId?.toString()) {
      removeMessageFromDOM(messageId);
    }
  });

  // Реакция на сообщение
  socket.on('message:reaction', (data) => {
    const { channelId, messageId, reactions } = data;
    if (window.currentChannelId?.toString() === channelId?.toString()) {
      updateMessageReactions(messageId, reactions);
    }
  });

  // ===== ИНДИКАТОР ПЕЧАТИ =====

  socket.on('typing:start', (data) => {
    const { channelId, userId, username } = data;
    if (window.currentChannelId?.toString() === channelId?.toString() && userId !== window.currentUser?._id) {
      showTypingIndicator(username);
    }
  });

  socket.on('typing:stop', (data) => {
    const { channelId, userId } = data;
    if (window.currentChannelId?.toString() === channelId?.toString()) {
      hideTypingIndicator(userId);
    }
  });

  // ===== СТАТУСЫ ПОЛЬЗОВАТЕЛЕЙ =====

  socket.on('user:status', (data) => {
    const { userId, status } = data;
    updateUserStatusInDOM(userId, status);
  });

  // ===== ГОЛОСОВЫЕ КАНАЛЫ =====

  socket.on('voice:existing_members', (data) => {
    const { channelId, members } = data;
    // Инициируем WebRTC соединения с существующими участниками
    if (window.voiceManager) {
      members.forEach(member => {
        window.voiceManager.initiateConnection(member.socketId, member.userId);
      });
    }
  });

  socket.on('voice:user_joined', (data) => {
    const { channelId, userId, socketId, username, avatar } = data;
    if (window.voiceManager && window.currentVoiceChannel === channelId) {
      // Ждем offer от нового участника
      updateVoiceChannelUI(channelId);
    }
    showNotification('info', `${username} присоединился к голосовому каналу`);
  });

  socket.on('voice:user_left', (data) => {
    const { channelId, userId, socketId } = data;
    if (window.voiceManager) {
      window.voiceManager.removeConnection(socketId);
    }
    updateVoiceChannelUI(channelId);
  });

  socket.on('voice:members_update', (data) => {
    const { channelId, members } = data;
    updateVoiceChannelMembersUI(channelId, members);
  });

  socket.on('voice:user_speaking', (data) => {
    const { channelId, userId, speaking } = data;
    updateSpeakingIndicator(userId, speaking);
  });

  socket.on('voice:user_muted', (data) => {
    const { channelId, userId, muted } = data;
    updateVoiceMuteUI(userId, muted);
  });

  socket.on('voice:left', (data) => {
    const { channelId } = data;
    if (window.voiceManager) {
      window.voiceManager.cleanup();
    }
    hideVoicePanel();
  });

  // ===== ДЕМОНСТРАЦИЯ ЭКРАНА =====

  socket.on('screen:started', (data) => {
    const { channelId, userId, username } = data;
    showNotification('info', `${username} начал демонстрацию экрана`);
    
    // Если мы в этом же канале — показываем контейнер (даже если трек еще не дошел)
    if (window.currentVoiceChannel === channelId) {
      const container = document.getElementById('screen-share-container');
      if (container) container.classList.remove('hidden');
    }
  });

  socket.on('screen:stopped', (data) => {
    const { channelId, userId } = data;
    // Убираем видео, связанное с этим пользователем
    // Видео будет удалено через RTCPeerConnection ontrack / removetrack
    showNotification('info', 'Демонстрация экрана завершена');
  });

  // ===== WebRTC СИГНАЛИНГ =====

  socket.on('webrtc:offer', (data) => {
    const { offer, fromSocketId, fromUserId, channelId } = data;
    if (window.voiceManager) {
      window.voiceManager.handleOffer(offer, fromSocketId, fromUserId);
    }
  });

  socket.on('webrtc:answer', (data) => {
    const { answer, fromSocketId } = data;
    if (window.voiceManager) {
      window.voiceManager.handleAnswer(answer, fromSocketId);
    }
  });

  socket.on('webrtc:ice_candidate', (data) => {
    const { candidate, fromSocketId } = data;
    if (window.voiceManager) {
      window.voiceManager.handleIceCandidate(candidate, fromSocketId);
    }
  });

  // ===== ДРУЗЬЯ =====

  socket.on('friend:request_received', (data) => {
    const { from } = data;
    showNotification('info', `${from.username} отправил вам запрос в друзья`);
    // Обновляем счетчик запросов
    if (window.loadFriends) window.loadFriends();
  });

  socket.on('friend:request_accepted', (data) => {
    const { by } = data;
    showNotification('success', `${by.username} принял ваш запрос в друзья`);
    if (window.loadFriends) window.loadFriends();
  });

  // ===== DM =====

  socket.on('dm:new_message', (data) => {
    const { conversationId, message } = data;
    // Обновляем список DM диалогов
    if (window.loadDMConversations) window.loadDMConversations();
    // Показываем уведомление только если мы НЕ в этом DM диалоге
    if (!window.currentDMConversation || window.currentDMConversationId !== conversationId) {
      showNotification('info', `Новое сообщение от ${message.author?.username || 'Пользователь'}`);
    }
  });

  // ===== ЗВОНКИ (DM Calls) =====

  // Входящий звонок: показываем Electron окно
  socket.on('call:incoming', (data) => {
    const { from } = data;
    console.log('📞 Incoming call from:', from.username);
    if (window.electronAPI && window.electronAPI.showIncomingCall) {
      window.electronAPI.showIncomingCall(from);
    }
  });

  // Ответ на наш звонок
  socket.on('call:response', (data) => {
    const { accepted, responderId } = data;
    if (window.handleDMCallResponse) {
      window.handleDMCallResponse(accepted, responderId);
    }
  });

  // Звонок завершен другой стороной
  socket.on('call:terminated', (data) => {
    if (window.handleDMCallEnd) {
      window.handleDMCallEnd();
    }
  });

  socket.on('call:error', (data) => {
    showNotification('error', data.message);
    if (window.handleDMCallEnd) window.handleDMCallEnd();
  });

  // ===== УВЕДОМЛЕНИЯ =====

  socket.on('notification:mention', (data) => {
    const { from, content } = data;
    showNotification('info', `${from} упомянул вас: ${content}`);
  });

  // ===== FOUNDER / АДМИН-ПАНЕЛЬ (обработчики на сокете — всегда после initSocket) =====

  socket.on('founder:stats', (data) => {
    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val != null ? String(val) : '0';
    };
    set('founder-stats-online', data.onlineUsers);
    set('founder-stats-total', data.totalUsers);
    set('founder-stats-servers', data.totalServers);
    set('founder-stats-messages', data.messagesToday);
  });

  socket.on('founder:announcement', (data) => {
    if (typeof showGlobalAnnouncementBanner === 'function') {
      showGlobalAnnouncementBanner(data);
    } else {
      showNotification('info', data.message, '📢 Объявление от ' + (data.from || ''));
    }
  });

  socket.on('founder:logs', (data) => {
    const logs = data && data.logs ? data.logs : [];
    if (window.founderSystem && typeof window.founderSystem.displayLogs === 'function') {
      window.founderSystem.displayLogs(logs);
    }
  });

  socket.on('error', (data) => {
    console.error('Socket error:', data.message);
    showNotification('error', data.message);
  });

  return socket;
}

/**
 * Отключение сокета
 */
function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    window.socket = null;
  }
}

/**
 * Отправка сообщения через сокет
 */
function socketSendMessage(channelId, content, replyTo, attachments, tempId) {
  if (socket) {
    socket.emit('message:send', { channelId, content, replyTo, attachments, tempId });
  }
}

/**
 * Отправка события редактирования
 */
function socketEditMessage(messageId, content) {
  // Проверяем маппинг временных ID
  let actualMessageId = messageId;
  if (messageId && messageId.startsWith('temp_')) {
    if (tempIdMapping.has(messageId)) {
      actualMessageId = tempIdMapping.get(messageId);
    } else {
      showNotification('warning', 'Подождите, пока сообщение сохранится');
      return;
    }
  }
  
  if (socket) {
    socket.emit('message:edit', { messageId: actualMessageId, content });
  }
}

/**
 * Отправка события удаления
 */
function socketDeleteMessage(messageId) {
  // Проверяем маппинг временных ID
  let actualMessageId = messageId;
  if (messageId && messageId.startsWith('temp_')) {
    if (tempIdMapping.has(messageId)) {
      actualMessageId = tempIdMapping.get(messageId);
    } else {
      showNotification('warning', 'Подождите, пока сообщение сохранится');
      return;
    }
  }
  
  if (socket) {
    socket.emit('message:delete', { messageId: actualMessageId });
  }
}

/**
 * Отправка реакции
 */
function socketReactMessage(messageId, emoji) {
  // Проверяем маппинг временных ID
  let actualMessageId = messageId;
  if (messageId && messageId.startsWith('temp_')) {
    // Если есть реальный ID в кэше, используем его
    if (tempIdMapping.has(messageId)) {
      actualMessageId = tempIdMapping.get(messageId);
    } else {
      // Если маппинга нет, значит сообщение еще не сохранилось
      showNotification('warning', 'Подождите, пока сообщение сохранится');
      return;
    }
  }
  
  if (socket) {
    socket.emit('message:react', { messageId: actualMessageId, emoji });
  }
}

/**
 * Индикатор печати
 */
let typingTimeout = null;
function socketStartTyping(channelId) {
  if (socket) {
    socket.emit('typing:start', { channelId });
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit('typing:stop', { channelId });
    }, 3000);
  }
}

function socketStopTyping(channelId) {
  if (socket) {
    clearTimeout(typingTimeout);
    socket.emit('typing:stop', { channelId });
  }
}

/**
 * Голосовой канал
 */
function socketJoinVoice(channelId) {
  if (socket) {
    socket.emit('voice:join', { channelId });
  }
}

function socketLeaveVoice(channelId) {
  if (socket) {
    socket.emit('voice:leave', { channelId });
  }
}

function socketToggleMute(channelId, muted) {
  if (socket) {
    socket.emit('voice:toggle_mute', { channelId, muted });
  }
}

function socketToggleDeafen(channelId, deafened) {
  if (socket) {
    socket.emit('voice:toggle_deafen', { channelId, deafened });
  }
}

function socketSpeaking(channelId, speaking) {
  if (socket) {
    socket.emit('voice:speaking', { channelId, speaking });
  }
}

/**
 * WebRTC сигналинг
 */
function socketSendOffer(targetSocketId, offer, channelId) {
  if (socket) {
    socket.emit('webrtc:offer', { targetSocketId, offer, channelId });
  }
}

function socketSendAnswer(targetSocketId, answer, channelId) {
  if (socket) {
    socket.emit('webrtc:answer', { targetSocketId, answer, channelId });
  }
}

function socketSendIceCandidate(targetSocketId, candidate, channelId) {
  if (socket) {
    socket.emit('webrtc:ice_candidate', { targetSocketId, candidate, channelId });
  }
}

/**
 * Серверы
 */
function socketJoinServer(serverId) {
  if (socket) {
    socket.emit('server:join', { serverId });
  }
}

function socketLeaveServer(serverId) {
  if (socket) {
    socket.emit('server:leave', { serverId });
  }
}

/**
 * Друзья
 */
function socketNotifyFriendRequest(targetUserId) {
  if (socket) {
    socket.emit('friend:request', { targetUserId });
  }
}

function socketNotifyFriendAccepted(targetUserId) {
  if (socket) {
    socket.emit('friend:accepted', { targetUserId });
  }
}

/**
 * Демонстрация экрана
 */
function socketStartScreen(channelId) {
  if (socket) {
    socket.emit('screen:start', { channelId });
  }
}

function socketStopScreen(channelId) {
  if (socket) {
    socket.emit('screen:stop', { channelId });
  }
}

/**
 * Инициализация звонка (сигналинг)
 */
function socketRequestCall(targetUserId) {
  if (socket && targetUserId) {
    socket.emit('call:request', { targetUserId: targetUserId.toString() });
  }
}

function socketSendCallResponse(callerId, accepted) {
  if (socket && callerId) {
    socket.emit('call:response', { callerId: callerId.toString(), accepted });
  }
}

function socketEndCall(targetUserId) {
  if (socket && targetUserId) {
    socket.emit('call:end', { targetUserId: targetUserId.toString() });
  }
}

// Обработка ответа из Electron-попапа (для получателя)
if (window.electronAPI && window.electronAPI.onCallResponseFromPopup) {
  window.electronAPI.onCallResponseFromPopup((data) => {
    const { accepted, callerId } = data;
    socketSendCallResponse(callerId, accepted);
    
    if (accepted) {
      // Если приняли - инициируем WebRTC
      if (window.startWebRTCCall) {
        window.startWebRTCCall(callerId);
      }
    }
  });
}

// Экспортируем socket в глобальную область
window.socket = socket;
window.socketJoinServer = socketJoinServer;
window.socketLeaveServer = socketLeaveServer;
