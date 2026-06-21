let socket = null;
let unreadCount = 0;

Object.defineProperty(window, 'unreadCount', {
  get: () => unreadCount,
  set: (val) => { unreadCount = val; },
  configurable: true
});

// Кэш маппинга временных ID на реальные ID сообщений
const tempIdMapping = new Map();

// Экспортируем в глобальную область для доступа из других модулей
window.tempIdMapping = tempIdMapping;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SOCKET LIFECYCLE MANAGEMENT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Хранилище socket listeners по scope.
 * 
 * Scopes:
 * - global: живут весь session (connect, disconnect, user:status, friends, founder)
 * - context: зависят от active channel/dm (message:*, typing:*, dm:*)
 * - voice: активны только в voice channel (voice:*, webrtc:*, screen:*)
 * - call: активны только во время DM call (call:*)
 * 
 * Структура: Map<eventName, handler>
 */
const socketListeners = {
  global: new Map(),
  context: new Map(),
  voice: new Map(),
  call: new Map()
};

/**
 * Добавить socket listener с lifecycle контролем.
 * 
 * @param {string} scope - Scope: 'global', 'context', 'voice', 'call'
 * @param {string} eventName - Имя события
 * @param {Function} handler - Обработчик события
 */
function attachListener(scope, eventName, handler) {
  if (!socketListeners[scope]) {
    console.warn(`[socket-lifecycle] Unknown scope: ${scope}`);
    return;
  }
  
  if (!socket) {
    console.warn(`[socket-lifecycle] Cannot attach listener: socket not initialized`);
    return;
  }
  
  // Проверка на дубликат
  if (socketListeners[scope].has(eventName)) {
    console.warn(`[socket-lifecycle] Listener already exists: ${scope}.${eventName}`);
    return;
  }
  
  // Регистрируем listener
  socket.on(eventName, handler);
  socketListeners[scope].set(eventName, handler);
}

/**
 * Удалить конкретный socket listener.
 * 
 * @param {string} scope - Scope
 * @param {string} eventName - Имя события
 */
function detachListener(scope, eventName) {
  if (!socketListeners[scope]) {
    return;
  }
  
  const handler = socketListeners[scope].get(eventName);
  if (handler && socket) {
    socket.off(eventName, handler);
    socketListeners[scope].delete(eventName);
  }
}

/**
 * Удалить все listeners определённого scope.
 * 
 * @param {string} scope - Scope для cleanup
 */
function detachScope(scope) {
  if (!socketListeners[scope]) {
    console.warn(`[socket-lifecycle] Unknown scope: ${scope}`);
    return;
  }
  
  if (!socket) {
    return;
  }
  
  const listeners = socketListeners[scope];
  for (const [eventName, handler] of listeners.entries()) {
    socket.off(eventName, handler);
  }
  
  listeners.clear();
  console.log(`[socket-lifecycle] Detached scope: ${scope} (cleared ${listeners.size} listeners)`);
}

/**
 * Удалить ВСЕ socket listeners всех scopes.
 * Используется при logout или полном disconnect.
 */
function detachAllListeners() {
  if (!socket) {
    return;
  }
  
  let totalDetached = 0;
  
  for (const scope in socketListeners) {
    const listeners = socketListeners[scope];
    for (const [eventName, handler] of listeners.entries()) {
      socket.off(eventName, handler);
      totalDetached++;
    }
    listeners.clear();
  }
  
  console.log(`[socket-lifecycle] Detached all listeners (${totalDetached} total)`);
}

/**
 * Получить количество активных listeners по scope.
 * Для диагностики и отладки.
 */
function getListenerStats() {
  const stats = {};
  for (const scope in socketListeners) {
    stats[scope] = socketListeners[scope].size;
  }
  return stats;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SOCKET EVENT HANDLERS (named functions для lifecycle control)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ===== GLOBAL SCOPE HANDLERS =====

function handleConnect() {
  console.log('✅ Socket connected:', socket.id);
  if (typeof window.initRoleSocketHandlers === 'function') {
    window.initRoleSocketHandlers();
  }
}

function handleDisconnect(reason) {
  console.log('❌ Socket disconnected:', reason);
}

function handleConnectError(error) {
  console.error('Socket connection error:', error.message);
}

function handleReconnect(attemptNumber) {
  console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');

  // КРИТИЧНО: при reconnect защищаемся от дублирования listeners.
  // Очищаем ВСЕ и заново подписываемся на ВСЕ scopes — иначе context-слушатели
  // (dm:new_message, message:new, notification:mention) теряются после реконнекта,
  // и личные сообщения перестают приходить (ни тоста, ни ленты).
  console.log('[socket-lifecycle] Reconnect detected - reinitializing all listeners');
  detachAllListeners();
  attachAllSocketListeners();
}

function handleUserStatus(data) {
  const { userId, status } = data;
  updateUserStatus(userId, status);
}

function handleFriendRequestReceived(data) {
  const { from } = data;
  // Показываем красивый кликабельный тост (перенаправляет в раздел друзей)
  if (typeof window.showAppNotification === 'function') {
    window.showAppNotification({
      title: 'Запрос в друзья',
      text: `${from.username} хочет добавить вас в друзья`,
      avatar: (from.username || '?').charAt(0).toUpperCase(),
      onClick: () => {
        const btn = document.querySelector('[data-target="view-contacts"]');
        if (btn) btn.click();
      }
    });
  } else {
    showNotification('info', `${from.username} отправил вам запрос в друзья`);
  }
  // Реальное время: обновляем список друзей без перезагрузки
  if (window.loadFriends) window.loadFriends();
}

function handleFriendRequestAccepted(data) {
  const { by } = data;
  if (typeof window.showAppNotification === 'function') {
    window.showAppNotification({
      title: 'Запрос принят',
      text: `${by.username} принял ваш запрос в друзья`,
      avatar: (by.username || '?').charAt(0).toUpperCase(),
      onClick: () => {
        const btn = document.querySelector('[data-target="view-contacts"]');
        if (btn) btn.click();
      }
    });
  }
  if (window.loadFriends) window.loadFriends();
}

function handleFounderStats(data) {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val != null ? String(val) : '0';
  };
  set('founder-stats-online', data.onlineUsers);
  set('founder-stats-total', data.totalUsers);
  set('founder-stats-servers', data.totalServers);
  set('founder-stats-messages', data.messagesToday);
}

function handleFounderAnnouncement(data) {
  if (typeof showGlobalAnnouncementBanner === 'function') {
    showGlobalAnnouncementBanner(data);
  } else {
    showNotification('info', data.message, '📢 Объявление от ' + (data.from || ''));
  }
}

function handleFounderLogs(data) {
  const logs = data && data.logs ? data.logs : [];
  if (window.founderSystem && typeof window.founderSystem.displayLogs === 'function') {
    window.founderSystem.displayLogs(logs);
  }
}

function handleSocketError(data) {
  console.error('Socket error:', data.message);
  showNotification('error', data.message);

  if (data.message && data.message.includes('удалил вас из друзей')) {
    const state = typeof window._getActiveState === 'function' ? window._getActiveState() : null;
    if (state && state.activeConversationId) {
      const convs = window._mockConversations;
      if (convs) {
        const conv = convs.find(c => c.id === state.activeConversationId);
        if (conv && conv._otherUser) {
          if (typeof window.showProfileModal === 'function') {
            window.showProfileModal(conv.name, conv._otherUser._id);
          }
        }
      }
    }
  }
}

function getOwnerIdForServer(serverId) {
  if (!serverId) return null;
  if (window.currentServer && String(window.currentServer._id) === String(serverId)) {
    return String(window.currentServer.ownerId || window.currentServer.owner?._id || window.currentServer.owner || '');
  }
  if (window.servers && Array.isArray(window.servers)) {
    const server = window.servers.find(s => String(s._id) === String(serverId));
    if (server) {
      return String(server.ownerId || server.owner?._id || server.owner || '');
    }
  }
  return null;
}

// ===== CONTEXT SCOPE HANDLERS =====

function handleMessageNew(data) {
  const { channelId, message } = data;
  const currentCh = window.currentChannelId?.toString();
  const msgCh = channelId?.toString();
  const isOwn = message.author?._id === window.currentUser?._id ||
                String(message.author) === String(window.currentUser?._id);

  // DM-каналы (без server) обрабатываются через dm:new_message.
  // Здесь реагируем только если это СВОЁ сообщение (мёрж temp→real)
  // или серверный канал.
  const isDM = !message.server;
  if (isDM && !isOwn) {
    // Чужое DM — придёт отдельно через dm:new_message, пропускаем
    return;
  }

  if (currentCh && currentCh === msgCh) {
    // Своё сообщение: appendMessage смёржит pending→real; чужое серверное — добавляет
    appendMessage(message);
    scrollToBottom();
  }
  
  if (!currentCh || currentCh !== msgCh) {
    let isEveryoneHereMention = false;
    if (message.content?.includes('@everyone') || message.content?.includes('@here')) {
      if (message.server) {
        const ownerId = getOwnerIdForServer(message.server);
        const authorId = String(message.authorId || (message.author && (message.author._id || message.author)) || '');
        if (ownerId && authorId && ownerId === authorId) {
          isEveryoneHereMention = true;
        }
      }
    }
    const isMention = message.content?.includes(`@${window.currentUser?.username}`) || isEveryoneHereMention;
    if (isMention) {
      showMessageNotification(message.author?.username, message.content, channelId);
    }
  }

  // Счётчик непрочитанных при неактивном окне или другом канале
  const isCurrentChannel = currentCh && currentCh === msgCh;
  const isWindowFocused = document.hasFocus() && !document.hidden;

  if (!isOwn && !(isCurrentChannel && isWindowFocused)) {
    unreadCount++;
    if (window.electronAPI?.setBadgeCount) {
      window.electronAPI.setBadgeCount(unreadCount);
    }
  }
}

function handleMessageEdited(data) {
  const { channelId, message } = data;
  if (window.currentChannelId?.toString() === channelId?.toString()) {
    updateMessageInDOM(message);
  }
}

function handleMessageUpdate(data) {
  const { channelId, tempId, message } = data;
  
  if (tempId && message._id) {
    tempIdMapping.set(tempId, message._id);
  }
  
  if (window.currentChannelId?.toString() === channelId?.toString()) {
    updateTempMessageInDOM(tempId, message);
  }
}

function handleMessageDeleted(data) {
  const { channelId, messageId } = data;
  if (window.currentChannelId?.toString() === channelId?.toString()) {
    removeMessageFromDOM(messageId);
  }
}

function handleMessageReaction(data) {
  const { channelId, messageId, reactions } = data;
  if (window.currentChannelId?.toString() === channelId?.toString()) {
    updateMessageReactions(messageId, reactions);
  }
}

function handleMessageRateLimited(data) {
  const retryAfter = Number(data?.retryAfter) || 2;
  const channelId = data?.channelId || window.currentChannelId;

  let restoredContent = '';
  if (data?.tempId) {
    try {
      const msgEl = document.querySelector(`[data-message-id="${data.tempId}"]`);
      if (msgEl) {
        const contentEl = msgEl.querySelector('.message-content, .message-text');
        restoredContent = (contentEl?.textContent || '').trim();
      }
    } catch (e) { /* no-op */ }
    if (typeof removeMessageFromDOM === 'function') {
      try { removeMessageFromDOM(data.tempId); } catch (e) { /* no-op */ }
    }
  }
  if (restoredContent) {
    const input = document.getElementById('message-input');
    if (input && !input.value) {
      input.value = restoredContent;
    }
  }

  if (typeof window.triggerMessageCooldown === 'function') {
    window.triggerMessageCooldown(channelId, retryAfter, {
      violationLevel: Number(data?.violationLevel) || undefined,
      warningTitle: data?.warningTitle,
      warningText: data?.warningText,
    });
  } else if (typeof showNotification === 'function') {
    showNotification('warning', data?.warningText || `Подожди ${retryAfter} сек.`);
  }
}

function handleTypingStart(data) {
  const { channelId, userId, username } = data;
  if (window.currentChannelId?.toString() === channelId?.toString() && userId !== window.currentUser?._id) {
    showTypingIndicator(userId, username);
  }
}

function handleTypingStop(data) {
  const { channelId, userId } = data;
  if (window.currentChannelId?.toString() === channelId?.toString()) {
    hideTypingIndicator(userId);
  }
}

function handleDMNewMessage(data) {
  const { conversationId, message } = data;
  const isOwn = message.author?._id === window.currentUser?._id ||
                String(message.author) === String(window.currentUser?._id);

  const isCurrentChannel = (window.currentDMConversation && window.currentDMConversation._id === conversationId) ||
                            window.currentDMConversationId === conversationId;

  // Обновляем список диалогов (превью последнего сообщения, сортировка)
  // Но не трогаем messages активного диалога — appendMessage сделает это ниже
  if (window.loadDMConversations) window.loadDMConversations();

  if (isCurrentChannel) {
    // Своё сообщение уже добавлено оптимистично — appendMessage смёржит pending→real _id
    // Чужое — добавляем как новое
    appendMessage(message);
    scrollToBottom();
  }

  if (!isCurrentChannel) {
    if (!isOwn) {
      showMessageNotification(message.author?.username, message.content, conversationId);
    }
  }

  // Счётчик непрочитанных при неактивном окне или другом DM
  const isWindowFocused = document.hasFocus() && !document.hidden;
  if (!isOwn && !(isCurrentChannel && isWindowFocused)) {
    unreadCount++;
    if (window.electronAPI?.setBadgeCount) {
      window.electronAPI.setBadgeCount(unreadCount);
    }
  }
}

function handleNotificationMention(data) {
  const { from, content, channelId } = data;
  showMessageNotification(from, content, channelId);
}

// ===== VOICE SCOPE HANDLERS =====

function handleVoiceExistingMembers(data) {
  const { channelId, members } = data;
  if (window.voiceManager) {
    members.forEach(member => {
      window.voiceManager.initiateConnection(member.socketId, member.userId);
    });
  }
}

function handleVoiceUserJoined(data) {
  const { channelId, userId, socketId, username, avatar } = data;
  if (window.voiceManager && window.currentVoiceChannel === channelId) {
    updateVoiceChannelUI(channelId);
  }
}

function handleVoiceUserLeft(data) {
  const { channelId, userId, socketId } = data;
  if (window.voiceManager) {
    window.voiceManager.removeConnection(socketId);
  }
  updateVoiceChannelUI(channelId);
}

function handleVoiceMembersUpdate(data) {
  const { channelId, members } = data;
  updateVoiceChannelMembersUI(channelId, members);
}

function handleVoiceUserSpeaking(data) {
  const { channelId, userId, speaking } = data;
  updateSpeakingIndicator(userId, speaking);
}

function handleVoiceUserMuted(data) {
  const { channelId, userId, muted } = data;
  if (typeof updateUserVoiceState === 'function') {
    updateUserVoiceState(userId, muted, undefined);
  }
}

function handleVoiceUserDeafened(data) {
  const { channelId, userId, deafened } = data;
  if (typeof updateUserVoiceState === 'function') {
    updateUserVoiceState(userId, undefined, deafened);
  }
}

function handleVoiceLeft(data) {
  const { channelId } = data;
  if (window.currentVoiceChannel && window.currentVoiceChannel !== channelId) {
    console.warn('Ignored stale voice:left for inactive channel:', channelId);
    return;
  }
  if (window.voiceManager) {
    window.voiceManager.cleanup();
    window.voiceManager = null;
  }
  if (window.currentVoiceChannel === channelId) {
    if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
      window.NavigationController._commitState({ currentVoiceChannel: null }, 'handleVoiceLeft');
    }
  }
  window.pendingDMCall = null;
  hideVoicePanel();
}

function handleScreenStarted(data) {
  const { channelId, userId, username } = data;
  if (window.currentVoiceChannel === channelId) {
    const container = document.getElementById('screen-share-container');
    if (container) container.classList.remove('hidden');
  }
  // Помечаем сокет участника как активную демонстрацию, чтобы pc.ontrack
  // различал входящий video-трек как экран, а не камеру.
  if (window.voiceManager && window.voiceManager.channelMembers) {
    const member = window.voiceManager.channelMembers.find(m => m.userId === userId);
    if (member && member.socketId) {
      window.voiceManager.screenActiveSockets.add(member.socketId);
    }
  }
}

function handleScreenStopped(data) {
  const { channelId, userId } = data;
  if (window.voiceManager && typeof hideScreenShareVideoForUser === 'function') {
    if (userId === window.currentUser?._id) {
      hideScreenShareVideoForUser('local');
    }
    if (window.voiceManager.channelMembers) {
      const member = window.voiceManager.channelMembers.find(m => m.userId === userId);
      if (member) {
        hideScreenShareVideoForUser(member.socketId);
        // Снимаем пометку демонстрации, чтобы следующий video-трек
        // от этого участника распознавался как камера.
        if (member.socketId) window.voiceManager.screenActiveSockets.delete(member.socketId);
      }
    }
    hideScreenShareVideoForUser(userId);
  }
}

function handleWebRTCOffer(data) {
  const { offer, fromSocketId, fromUserId, channelId } = data;
  if (window.voiceManager && (!window.currentVoiceChannel || window.currentVoiceChannel === channelId)) {
    window.voiceManager.handleOffer(offer, fromSocketId, fromUserId);
  }
}

function handleWebRTCAnswer(data) {
  const { answer, fromSocketId, channelId } = data;
  if (window.voiceManager && (!window.currentVoiceChannel || window.currentVoiceChannel === channelId)) {
    window.voiceManager.handleAnswer(answer, fromSocketId);
  }
}

function handleWebRTCIceCandidate(data) {
  const { candidate, fromSocketId, channelId } = data;
  if (window.voiceManager && (!window.currentVoiceChannel || window.currentVoiceChannel === channelId)) {
    window.voiceManager.handleIceCandidate(candidate, fromSocketId);
  }
}

// ===== CALL SCOPE HANDLERS =====

function handleCallIncoming(data) {
  const { from, conversationId, channelId } = data;
  console.log('📞 Incoming call from:', from.username);
  window.pendingDMCall = { from, conversationId, channelId };
  if (window.showIncomingDMCallOverlay) {
    window.showIncomingDMCallOverlay({ from, conversationId, channelId });
  }
}

function handleCallResponse(data) {
  const { accepted, responderId, conversationId, channelId } = data;
  if (window.handleDMCallResponse) {
    window.handleDMCallResponse(accepted, responderId, { conversationId, channelId });
  }
}

function handleCallTerminated(data) {
  if (window.handleDMCallEnd) {
    window.handleDMCallEnd();
  }
}

function handleCallError(data) {
  showNotification('error', data.message);
  if (window.handleDMCallEnd) window.handleDMCallEnd();
}

// ===== PROFILE SCOPE HANDLERS =====

function handleProfileData(profile) {
  if (typeof window.displayProfile === 'function') {
    window.displayProfile(profile);
  }
}

function handleProfileUpdateSuccess(profile) {
  window.currentUser = { ...window.currentUser, ...profile };
  
  if (window.currentProfileUserId === profile._id && typeof window.displayProfile === 'function') {
    window.displayProfile(profile);
  }
  
  // if (typeof showNotification === 'function') {
  //   showNotification('success', 'Профиль успешно обновлен');
  // }
}

function handleProfileUpdated(data) {
  if (window.currentProfileUserId === data.userId && typeof window.displayProfile === 'function') {
    window.displayProfile(data.profile);
  }
}

function handleUserBlocked(data) {
  // if (typeof showNotification === 'function') {
  //   showNotification('success', 'Пользователь заблокирован');
  // }
}

function handleUserUnblocked(data) {
  // if (typeof showNotification === 'function') {
  //   showNotification('success', 'Пользователь разблокирован');
  // }
}

// ===== ROLES SCOPE HANDLERS =====

function handleRoleCreated(data) {
  console.log('role:created event received:', data);
  console.log('currentServerId:', window.currentServerId);
  console.log('serverRoles before:', window.serverRoles);
  
  if (data.serverId === window.currentServerId) {
    if (!window.serverRoles) window.serverRoles = [];
    window.serverRoles.push(data.role);
    
    if (typeof window.renderRolesList === 'function') {
      window.renderRolesList();
    }
  }
  
  // Обновляем кэш сервера
  const server = window.servers?.find(s => s._id === data.serverId);
  if (server) {
    if (!server.roles) server.roles = [];
    server.roles.push(data.role);
  }
  
  console.log('serverRoles after:', window.serverRoles);
}

function handleRoleUpdated(data) {
  console.log('role:updated event received:', data);
  
  if (data.serverId === window.currentServerId) {
    if (window.serverRoles) {
      const index = window.serverRoles.findIndex(r => String(r._id) === String(data.roleId));
      if (index !== -1) {
        window.serverRoles[index] = data.role;
        
        if (typeof window.renderRolesList === 'function') {
          window.renderRolesList();
        }
        
        if (String(window.currentRoleId) === String(data.roleId) && typeof window.displayRoleEditor === 'function') {
          window.displayRoleEditor();
        }
      }
    }
  }
  
  // Обновляем кэш сервера
  const server = window.servers?.find(s => s._id === data.serverId);
  if (server && server.roles) {
    const index = server.roles.findIndex(r => String(r._id) === String(data.roleId));
    if (index !== -1) {
      server.roles[index] = data.role;
    }
  }
  
  // Обновляем текущий сервер и список участников
  if (window.currentServer && window.currentServer._id === data.serverId) {
    const index = window.currentServer.roles?.findIndex(r => String(r._id) === String(data.roleId));
    if (index !== -1) {
      window.currentServer.roles[index] = data.role;
    }
    
    if (typeof window.loadChannelMembers === 'function') {
      window.loadChannelMembers();
    }
  }
}

function handleRoleDeleted(data) {
  console.log('role:deleted event received:', data);
  
  if (data.serverId === window.currentServerId) {
    if (window.serverRoles) {
      window.serverRoles = window.serverRoles.filter(r => String(r._id) !== String(data.roleId));
      
      if (String(window.currentRoleId) === String(data.roleId)) {
        window.currentRoleId = null;
      }
      
      if (typeof window.renderRolesList === 'function') {
        window.renderRolesList();
      }
      
      if (typeof window.displayRoleEditor === 'function') {
        window.displayRoleEditor();
      }
    }
  }
  
  // Обновляем кэш сервера
  const server = window.servers?.find(s => s._id === data.serverId);
  if (server && server.roles) {
    server.roles = server.roles.filter(r => String(r._id) !== String(data.roleId));
  }
}

function handleRoleAssigned(data) {
  console.log('role:assigned event received:', data);
  
  // Обновляем кэш сервера
  const server = window.servers?.find(s => s._id === data.serverId);
  if (server && server.members) {
    const member = server.members.find(m => {
      const uid = m.user && m.user._id != null ? m.user._id : m.user;
      return String(uid) === String(data.userId);
    });
    if (member && !member.roles.some(r => r.toString() === String(data.roleId))) {
      member.roles.push(data.roleId);
    }
  }
  
  // Обновляем текущий сервер
  if (window.currentServer && window.currentServer._id === data.serverId) {
    const member = window.currentServer.members?.find(m => {
      const uid = m.user && m.user._id != null ? m.user._id : m.user;
      return String(uid) === String(data.userId);
    });
    if (member && !member.roles.some(r => r.toString() === String(data.roleId))) {
      member.roles.push(data.roleId);
    }
    
    if (typeof window.loadChannelMembers === 'function') {
      window.loadChannelMembers();
    }
  }
  
  if (data.userId === window.currentUser?._id) {
    // if (typeof showNotification === 'function') {
    //   showNotification('info', `Вам назначена роль: ${data.roleName || 'роль'}`);
    // }
  }
}

function handleRoleRemoved(data) {
  console.log('role:removed event received:', data);
  
  // Обновляем кэш сервера
  const server = window.servers?.find(s => s._id === data.serverId);
  if (server && server.members) {
    const member = server.members.find(m => {
      const uid = m.user && m.user._id != null ? m.user._id : m.user;
      return String(uid) === String(data.userId);
    });
    if (member) {
      member.roles = member.roles.filter(r => r.toString() !== data.roleId.toString());
    }
  }
  
  // Обновляем текущий сервер
  if (window.currentServer && window.currentServer._id === data.serverId) {
    const member = window.currentServer.members?.find(m => {
      const uid = m.user && m.user._id != null ? m.user._id : m.user;
      return String(uid) === String(data.userId);
    });
    if (member) {
      member.roles = member.roles.filter(r => r.toString() !== data.roleId.toString());
    }
    
    if (typeof window.loadChannelMembers === 'function') {
      window.loadChannelMembers();
    }
  }
  
  if (data.userId === window.currentUser?._id) {
    // if (typeof showNotification === 'function') {
    //   showNotification('info', `С вас снята роль: ${data.roleName || 'роль'}`);
    // }
  }
}

// ===== PINNED SCOPE HANDLERS =====

function handleMessagePinned(data) {
  const { messageId, channelId } = data;
  
  if (typeof window.loadPinnedMessages === 'function') {
    window.loadPinnedMessages(channelId);
  }
  
  if (typeof showNotification === 'function') {
    // showNotification('info', 'Сообщение закреплено');
  }
}

function handleMessageUnpinned(data) {
  const { messageId, channelId } = data;
  
  if (typeof window.loadPinnedMessages === 'function') {
    window.loadPinnedMessages(channelId);
  }
  
  if (typeof showNotification === 'function') {
    // showNotification('info', 'Сообщение откреплено');
  }
}

function handleMessagePinnedList(data) {
  const { channelId, messages } = data;
  
  window.currentChannelPinnedMessages = messages || [];
  
  // Update banner and modal content if already open, but DO NOT open modal
  if (typeof window.updatePinnedMessagesData === 'function') {
    window.updatePinnedMessagesData();
  }
}

// ===== SEARCH SCOPE HANDLERS =====

function handleMessageSearchResults(data) {
  if (typeof window.displaySearchResults === 'function') {
    window.displaySearchResults(data);
  }
}

/**
 * Прикрепить только global socket listeners.
 */
function attachGlobalSocketListeners() {
  if (!socket) {
    console.warn('[socket-lifecycle] Cannot attach global listeners: socket not initialized');
    return;
  }
  
  detachScope('global');
  
  // GLOBAL SCOPE
  attachListener('global', 'connect', handleConnect);
  attachListener('global', 'disconnect', handleDisconnect);
  attachListener('global', 'connect_error', handleConnectError);
  attachListener('global', 'reconnect', handleReconnect);
  attachListener('global', 'user:status', handleUserStatus);
  attachListener('global', 'friend:request_received', handleFriendRequestReceived);
  attachListener('global', 'friend:request_accepted', handleFriendRequestAccepted);
  attachListener('global', 'founder:stats', handleFounderStats);
  attachListener('global', 'founder:announcement', handleFounderAnnouncement);
  attachListener('global', 'founder:logs', handleFounderLogs);
  attachListener('global', 'error', handleSocketError);
  
  // PROFILE SCOPE (GLOBAL - persist across contexts)
  attachListener('global', 'profile:data', handleProfileData);
  attachListener('global', 'profile:update_success', handleProfileUpdateSuccess);
  attachListener('global', 'profile:updated', handleProfileUpdated);
  attachListener('global', 'user:blocked', handleUserBlocked);
  attachListener('global', 'user:unblocked', handleUserUnblocked);
}

/**
 * Прикрепить все socket listeners.
 * Вызывается при initial connect и при reconnect для переинициализации.
 * 
 * ВАЖНО: все handlers должны быть определены как named functions,
 * чтобы их можно было правильно удалить через socket.off()
 */
function attachAllSocketListeners() {
  if (!socket) {
    console.warn('[socket-lifecycle] Cannot attach listeners: socket not initialized');
    return;
  }
  
  // GLOBAL SCOPE
  attachGlobalSocketListeners();
  
  // CONTEXT SCOPE
  attachListener('context', 'message:new', handleMessageNew);
  attachListener('context', 'message:edited', handleMessageEdited);
  attachListener('context', 'message:update', handleMessageUpdate);
  attachListener('context', 'message:deleted', handleMessageDeleted);
  attachListener('context', 'message:reaction', handleMessageReaction);
  attachListener('context', 'message:rate_limited', handleMessageRateLimited);
  attachListener('context', 'typing:start', handleTypingStart);
  attachListener('context', 'typing:stop', handleTypingStop);
  attachListener('context', 'dm:new_message', handleDMNewMessage);
  attachListener('context', 'notification:mention', handleNotificationMention);
  
  // VOICE SCOPE
  detachScope('voice');
  attachListener('voice', 'voice:existing_members', handleVoiceExistingMembers);
  attachListener('voice', 'voice:user_joined', handleVoiceUserJoined);
  attachListener('voice', 'voice:user_left', handleVoiceUserLeft);
  attachListener('voice', 'voice:members_update', handleVoiceMembersUpdate);
  attachListener('voice', 'voice:user_speaking', handleVoiceUserSpeaking);
  attachListener('voice', 'voice:user_muted', handleVoiceUserMuted);
  attachListener('voice', 'voice:user_deafened', handleVoiceUserDeafened);
  attachListener('voice', 'voice:left', handleVoiceLeft);
  attachListener('voice', 'screen:started', handleScreenStarted);
  attachListener('voice', 'screen:stopped', handleScreenStopped);
  attachListener('voice', 'webrtc:offer', handleWebRTCOffer);
  attachListener('voice', 'webrtc:answer', handleWebRTCAnswer);
  attachListener('voice', 'webrtc:ice_candidate', handleWebRTCIceCandidate);
  
  // CALL SCOPE
  detachScope('call');
  attachListener('call', 'call:incoming', handleCallIncoming);
  attachListener('call', 'call:response', handleCallResponse);
  attachListener('call', 'call:terminated', handleCallTerminated);
  attachListener('call', 'call:error', handleCallError);
  
  // ROLES SCOPE (CONTEXT - server-specific)
  attachListener('context', 'role:created', handleRoleCreated);
  attachListener('context', 'role:updated', handleRoleUpdated);
  attachListener('context', 'role:deleted', handleRoleDeleted);
  attachListener('context', 'role:assigned', handleRoleAssigned);
  attachListener('context', 'role:removed', handleRoleRemoved);
  
  // PINNED SCOPE (CONTEXT - channel-specific)
  attachListener('context', 'message:pinned', handleMessagePinned);
  attachListener('context', 'message:unpinned', handleMessageUnpinned);
  attachListener('context', 'message:pinned_list', handleMessagePinnedList);
  
  // SEARCH SCOPE (CONTEXT - channel-specific)
  attachListener('context', 'message:search_results', handleMessageSearchResults);
  
  console.log('[socket-lifecycle] All listeners attached:', getListenerStats());
}

// Экспортируем lifecycle API в глобальную область
window.socketLifecycle = {
  attachListener,
  detachListener,
  detachScope,
  detachAllListeners,
  getListenerStats,
  attachAllSocketListeners
};

/**
 * Получить свежий короткоживущий socket-token (5 минут, aud='socket').
 * Никогда не логируем сам токен.
 * Возвращает null если получить не удалось — вызывающий код примет решение.
 */
async function fetchSocketToken() {
  try {
    const data = await AuthAPI.getSocketToken();
    if (data && typeof data.token === 'string' && data.token.length > 0) {
      return data.token;
    }
    console.warn('[socket-auth] empty socket token in response');
    return null;
  } catch (e) {
    console.warn('[socket-auth] failed to obtain socket token:', e.message);
    return null;
  }
}

/**
 * Инициализация Socket.io соединения
 */
async function initSocket() {
  // Ждем пока api.js определит правильный BASE_URL (продакшн или дев)
  await window.apiReady;
  
  const SOCKET_URL = window.BASE_URL || 'http://localhost:5555';
  console.log('🔌 Socket connecting to:', SOCKET_URL);
  
  if (socket) {
    socket.disconnect();
  }

  // Получаем короткоживущий socket-token через обычный apiFetch (под основным
  // API JWT в main process). Renderer НИКОГДА не видит долгоживущий токен.
  const token = await fetchSocketToken();
  if (!token) {
    console.warn('[socket-auth] no socket token; socket will fail to authenticate');
  }

  // Подключаемся к серверу с socket-token'ом
  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });

  // Перед каждой попыткой реконнекта обновляем socket-token: исходный мог
  // истечь (TTL 5 мин) или быть отозван. socket.io v4 поддерживает
  // динамическое обновление socket.auth перед reconnect.
  socket.io.on('reconnect_attempt', async () => {
    detachScope('context');
    const fresh = await fetchSocketToken();
    socket.auth = { token: fresh };
    console.log('[socket-auth] refreshed token and detached context scope for reconnect_attempt');
  });

  // socket.io v4: событие 'reconnect' приходит на МЕНЕДЖЕР (socket.io), а не на сокет.
  // Здесь восстанавливаем ВСЕ слушатели — иначе context (dm:new_message, message:new)
  // остаётся отцеплённым после reconnect_attempt, и личные сообщения не приходят.
  socket.io.on('reconnect', () => {
    console.log('[socket-lifecycle] Manager reconnect — reattaching all listeners');
    detachAllListeners();
    attachAllSocketListeners();
  });

  // Экспортируем в глобальную область
  window.socket = socket;

  // Прикрепляем все socket listeners через lifecycle систему
  attachAllSocketListeners();

  return socket;
}

/**
 * Отключение сокета
 */
function disconnectSocket() {
  if (socket) {
    // Cleanup всех listeners перед disconnect
    detachAllListeners();
    
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

function socketSendCallResponse(callerId, accepted, meta = {}) {
  if (socket && callerId) {
    socket.emit('call:response', {
      callerId: callerId.toString(),
      accepted,
      conversationId: meta.conversationId,
      channelId: meta.channelId
    });
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
    const { accepted, callerId, conversationId, channelId } = data;
    socketSendCallResponse(callerId, accepted, { conversationId, channelId });
    
    if (accepted) {
      // Если приняли - инициируем WebRTC
      if (window.startWebRTCCall) {
        window.startWebRTCCall(callerId, { conversationId, channelId });
      }
    }
    if (!accepted) {
      if (window.pendingDMCall?.from?._id === callerId) {
        window.pendingDMCall = null;
      }
      if (typeof window.hideIncomingDMCallOverlay === 'function') {
        window.hideIncomingDMCallOverlay();
      }
    }
  });
}

function navigateToChannel(targetChannelId) {
  if (window.servers) {
    for (let serverId in window.servers) {
      const server = window.servers[serverId];
      if (server.channels && server.channels.find(c => c._id === targetChannelId)) {
        if (window.NavigationController) {
          window.NavigationController.navigateToServer(serverId);
          setTimeout(() => {
            window.NavigationController.navigateToChannel(targetChannelId, '', 'text');
          }, 100);
        }
        return;
      }
    }
  }
  if (window.NavigationController) {
    window.NavigationController.navigateToDM(targetChannelId);
  }
}

function showMessageNotification(username, text, targetChannelId) {
  // Если init-app переопределил функцию — используем новый красивый тост
  if (typeof window.showMessageNotification === 'function') {
    window.showMessageNotification(username, text, targetChannelId);
    return;
  }
  if (document.hasFocus()) return;
  const container = document.getElementById('notifications-container') || (function() {
    const c = document.createElement('div');
    c.id = 'notifications-container';
    c.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; display: flex; flex-direction: column; gap: 10px; pointer-events: none;';
    document.body.appendChild(c);
    return c;
  })();
  
  const notif = document.createElement('div');
  notif.className = 'notification-message';
  notif.style.pointerEvents = 'auto';
  
  const escapeH = (str) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  notif.innerHTML = `
    <div class="notif-name">${escapeH(username || 'Новое сообщение')}</div>
    <div class="notif-text">${escapeH(text || '').substring(0, 80)}</div>
  `;
  
  notif.onclick = () => {
    navigateToChannel(targetChannelId);
    notif.remove();
  };
  
  container.appendChild(notif);
  setTimeout(() => notif.remove(), 5000);
  
  if (window.settingsManager && window.settingsManager.get('notif-sound')) {
    if (window.SoundManager) window.SoundManager.play('notification');
  }
}

// Сброс badge при фокусе окна
window.addEventListener('focus', () => {
  unreadCount = 0;
  if (window.electronAPI?.setBadgeCount) {
    window.electronAPI.setBadgeCount(0);
  }
});

// Экспортируем socket в глобальную область
window.socket = socket;
window.socketJoinServer = socketJoinServer;
window.socketLeaveServer = socketLeaveServer;
