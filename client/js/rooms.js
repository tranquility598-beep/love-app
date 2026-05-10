/**
 * Rooms модуль — UI комнаты для server.settings.kind === 'room'.
 *
 * Принципы:
 *  - Backend, БД, socket events и auth НЕ трогаем.
 *  - Никаких inline onclick / inline style — все обработчики и стили
 *    через addEventListener и CSS классы.
 *  - Legacy UI обычных серверов остаётся нетронутым.
 *  - В room-mode чат — это обычная chat-view, визуально встроенная как
 *    карточка под room-chrome (через CSS overrides, без перемещения DOM).
 *  - Войс — отдельная панель внутри room-mode с двумя состояниями:
 *    preconnect (большая кнопка "Присоединиться") и connected
 *    (mic / sound / screen / leave).
 */

(function () {
  // === Состояние =========================================================

  const liveHandlers = {
    socket: null,
    onMessageNew: null,
    onMessageUpdate: null,
    onVoiceMembers: null,
    onVoiceUserSpeaking: null,
    onVoiceUserMuted: null,
    onVoiceLeft: null
  };

  let _activeMode = null; // 'chat' | 'voice' | 'media' | null

  // === Управление режимом ================================================

  function enterRoomMode() {
    document.body.classList.add('room-mode');
  }

  function exitRoomMode() {
    document.body.classList.remove('room-mode');
    detachLiveHandlers();
    hideRoomView();
    hideAllRoomPanels();
    _activeMode = null;
  }

  function hideAllMainViews() {
    ['welcome-view', 'friends-view', 'voice-view', 'chat-view', 'dm-empty', 'dm-view', 'room-view']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });
  }

  function showRoomView() {
    const v = document.getElementById('room-view');
    if (v) v.classList.remove('hidden');
  }

  function hideRoomView() {
    const v = document.getElementById('room-view');
    if (v) v.classList.add('hidden');
  }

  function setHidden(id, hidden) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle('hidden', !!hidden);
  }

  function hideAllRoomPanels() {
    setHidden('room-chat-strip', true);
    setHidden('room-voice-panel', true);
    setHidden('room-media-empty', true);
    // chat-view скрываем legacy-способом
    const chat = document.getElementById('chat-view');
    if (chat) chat.classList.add('hidden');
  }

  function setActiveTab(name) {
    _activeMode = name;
    ['chat', 'voice', 'media'].forEach(n => {
      const btn = document.getElementById(`room-tab-${n}`);
      if (btn) btn.setAttribute('aria-selected', String(n === name));
    });
  }

  // === Утилиты ============================================================

  function getInitials(name) {
    if (!name || typeof name !== 'string') return '?';
    return name.trim().substring(0, 2).toUpperCase();
  }

  function pluralizeRu(n, forms) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return forms[0];
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
    return forms[2];
  }

  function pluralizeMembers(n) {
    return pluralizeRu(n, ['участник', 'участника', 'участников']);
  }

  function pluralizePeople(n) {
    return pluralizeRu(n, ['человек', 'человека', 'человек']);
  }

  function makeAvatar(node, user, fallbackName, klass) {
    node.className = klass;
    const username = user?.username || fallbackName || '?';
    const avatarUrl = (typeof getAvatarUrl === 'function' && user?.avatar) ? getAvatarUrl(user.avatar) : null;
    if (avatarUrl) {
      const img = document.createElement('img');
      img.src = avatarUrl;
      img.alt = username;
      node.appendChild(img);
    } else {
      node.textContent = getInitials(username);
    }
  }

  // === Шапка ==============================================================

  function renderRoomHeader(room) {
    const iconEl = document.getElementById('room-header-icon');
    const nameEl = document.getElementById('room-view-name');
    const onlineEl = document.querySelector('#room-view-online .room-header-online-text');
    const subtitleEl = document.getElementById('room-view-status');
    const membersEl = document.getElementById('room-view-members');

    if (iconEl) {
      iconEl.innerHTML = '';
      if (room?.icon && typeof getAvatarUrl === 'function') {
        const img = document.createElement('img');
        img.src = getAvatarUrl(room.icon);
        img.alt = room.name || 'Комната';
        iconEl.appendChild(img);
      } else {
        iconEl.textContent = getInitials(room?.name || 'Комната');
      }
    }

    if (nameEl) nameEl.textContent = room?.name || 'Комната';

    const members = Array.isArray(room?.members) ? room.members : [];
    const onlineCount = members.filter(m => {
      const status = m?.user?.status;
      return status && status !== 'offline';
    }).length;
    if (onlineEl) onlineEl.textContent = String(onlineCount);

    if (subtitleEl) {
      const description = (room?.description || '').trim();
      subtitleEl.textContent = description || `${members.length} ${pluralizeMembers(members.length)}`;
    }

    if (membersEl) {
      membersEl.innerHTML = '';
      const maxAvatars = 4;
      members.slice(0, maxAvatars).forEach(m => {
        const span = document.createElement('span');
        makeAvatar(span, m?.user, '?', 'room-header-member-avatar');
        membersEl.appendChild(span);
      });
      if (members.length > maxAvatars) {
        const more = document.createElement('span');
        more.className = 'room-header-member-more';
        more.textContent = `+${members.length - maxAvatars}`;
        membersEl.appendChild(more);
      }
    }
  }

  // === Live-индикаторы в плашках =========================================

  function setTabMeta(tab, text) {
    const el = document.getElementById(`room-tab-${tab}-meta`);
    if (el && typeof text === 'string') el.textContent = text;
  }

  function formatLastMessagePreview(msg) {
    if (!msg) return 'Нет сообщений';
    const author = msg?.author?.username || 'Кто-то';
    let text = (msg.content || '').trim();
    if (!text && Array.isArray(msg.attachments) && msg.attachments.length > 0) {
      const a = msg.attachments[0];
      text = a?.type === 'image' ? '📷 Изображение'
        : a?.type === 'audio' ? '🎤 Голосовое'
        : '📎 Файл';
    }
    if (!text) text = '...';
    if (text.length > 48) text = text.slice(0, 47) + '…';
    return `${author}: ${text}`;
  }

  async function refreshChatMeta(room) {
    if (!room?.textChannelId || typeof MessagesAPI === 'undefined') return;
    try {
      const data = await MessagesAPI.getMessages(room.textChannelId, null, 1);
      const last = Array.isArray(data?.messages) && data.messages.length > 0
        ? data.messages[data.messages.length - 1]
        : null;
      setTabMeta('chat', formatLastMessagePreview(last));
    } catch (e) {
      console.warn('[room] failed to load last message:', e.message);
      setTabMeta('chat', 'Открыть чат комнаты');
    }
  }

  async function refreshVoiceMeta(room) {
    if (!room?.voiceChannelId || typeof ChannelsAPI === 'undefined') return;
    try {
      const data = await ChannelsAPI.get(room.voiceChannelId);
      const members = Array.isArray(data?.channel?.voiceMembers) ? data.channel.voiceMembers : [];
      updateVoiceCount(members.length);
      renderVoicePanelCards(members);
    } catch (e) {
      console.warn('[room] failed to load voice members:', e.message);
      updateVoiceCount(0);
      renderVoicePanelCards([]);
    }
  }

  function updateVoiceCount(count) {
    const text = count > 0
      ? `${count} ${pluralizePeople(count)} в войсе`
      : 'Никого в войсе';
    setTabMeta('voice', text);
    const subtitle = document.getElementById('room-voice-panel-subtitle');
    if (subtitle) subtitle.textContent = text;
  }

  function renderVoicePanelCards(members) {
    const wrap = document.getElementById('room-voice-panel-cards');
    if (!wrap) return;
    wrap.innerHTML = '';
    members.forEach(m => {
      const user = m?.user || m;
      const card = document.createElement('div');
      card.className = 'room-voice-card';
      card.dataset.userId = String(user?._id || '');
      card.dataset.speaking = 'false';
      card.setAttribute('role', 'listitem');

      const avatar = document.createElement('div');
      makeAvatar(avatar, user, 'Гость', 'room-voice-card-avatar');
      card.appendChild(avatar);

      const name = document.createElement('span');
      name.className = 'room-voice-card-name';
      name.textContent = user?.username || 'Гость';
      card.appendChild(name);

      if (m?.muted) {
        const mute = document.createElement('span');
        mute.className = 'room-voice-card-mute';
        mute.textContent = '🔇';
        mute.title = 'Микрофон выключен';
        card.appendChild(mute);
      }

      wrap.appendChild(card);
    });
  }

  function setCardSpeaking(userId, speaking) {
    const wrap = document.getElementById('room-voice-panel-cards');
    if (!wrap) return;
    const card = wrap.querySelector(`.room-voice-card[data-user-id="${CSS.escape(String(userId))}"]`);
    if (card) card.dataset.speaking = String(!!speaking);
  }

  function setCardMuted(userId, muted) {
    const wrap = document.getElementById('room-voice-panel-cards');
    if (!wrap) return;
    const card = wrap.querySelector(`.room-voice-card[data-user-id="${CSS.escape(String(userId))}"]`);
    if (!card) return;
    const existing = card.querySelector('.room-voice-card-mute');
    if (muted && !existing) {
      const mute = document.createElement('span');
      mute.className = 'room-voice-card-mute';
      mute.textContent = '🔇';
      card.appendChild(mute);
    } else if (!muted && existing) {
      existing.remove();
    }
  }

  // === Live socket подписки ==============================================

  function attachLiveHandlers(room) {
    detachLiveHandlers();
    const s = window.socket;
    if (!s || !room) return;
    liveHandlers.socket = s;

    liveHandlers.onMessageNew = (data) => {
      if (data && String(data.channelId) === String(room.textChannelId)) {
        setTabMeta('chat', formatLastMessagePreview(data.message));
      }
    };
    s.on('message:new', liveHandlers.onMessageNew);

    liveHandlers.onMessageUpdate = (data) => {
      if (data && String(data.channelId) === String(room.textChannelId)) {
        setTabMeta('chat', formatLastMessagePreview(data.message));
      }
    };
    s.on('message:update', liveHandlers.onMessageUpdate);

    liveHandlers.onVoiceMembers = (data) => {
      if (data && String(data.channelId) === String(room.voiceChannelId)) {
        const members = Array.isArray(data.members) ? data.members : [];
        updateVoiceCount(members.length);
        renderVoicePanelCards(members);
      }
    };
    s.on('voice:members_update', liveHandlers.onVoiceMembers);

    liveHandlers.onVoiceUserSpeaking = (data) => {
      if (!data) return;
      // Сервер шлёт это в комнату voice:<channelId> — фильтруем по userId
      if (data.userId) setCardSpeaking(data.userId, !!data.speaking);
    };
    s.on('voice:user_speaking', liveHandlers.onVoiceUserSpeaking);

    liveHandlers.onVoiceUserMuted = (data) => {
      if (data?.userId) setCardMuted(data.userId, !!data.muted);
    };
    s.on('voice:user_muted', liveHandlers.onVoiceUserMuted);

    // Когда мы сами выходим — обновляем UI control-панели
    liveHandlers.onVoiceLeft = () => {
      renderVoicePanelMode();
    };
    s.on('voice:left', liveHandlers.onVoiceLeft);
  }

  function detachLiveHandlers() {
    const s = liveHandlers.socket;
    if (s) {
      if (liveHandlers.onMessageNew) s.off('message:new', liveHandlers.onMessageNew);
      if (liveHandlers.onMessageUpdate) s.off('message:update', liveHandlers.onMessageUpdate);
      if (liveHandlers.onVoiceMembers) s.off('voice:members_update', liveHandlers.onVoiceMembers);
      if (liveHandlers.onVoiceUserSpeaking) s.off('voice:user_speaking', liveHandlers.onVoiceUserSpeaking);
      if (liveHandlers.onVoiceUserMuted) s.off('voice:user_muted', liveHandlers.onVoiceUserMuted);
      if (liveHandlers.onVoiceLeft) s.off('voice:left', liveHandlers.onVoiceLeft);
    }
    Object.keys(liveHandlers).forEach(k => { liveHandlers[k] = null; });
  }

  // === Создание комнаты ==================================================

  function showCreateRoomModal() {
    const nameInput = document.getElementById('room-name-input');
    const descInput = document.getElementById('room-desc-input');
    const errEl = document.getElementById('create-room-error');
    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    if (errEl) { errEl.textContent = ''; errEl.classList.add('hidden'); }
    if (typeof openModal === 'function') openModal('create-room-modal');
  }

  async function createRoom() {
    const nameInput = document.getElementById('room-name-input');
    const descInput = document.getElementById('room-desc-input');
    const errEl = document.getElementById('create-room-error');

    const name = (nameInput?.value || '').trim();
    const description = (descInput?.value || '').trim();

    if (!name || name.length < 2) {
      if (errEl) {
        errEl.textContent = 'Название комнаты должно содержать минимум 2 символа';
        errEl.classList.remove('hidden');
      }
      return;
    }

    try {
      const data = await RoomsAPI.create(name, description);
      const room = data.room;
      if (typeof closeModal === 'function') closeModal('create-room-modal');
      if (typeof loadServers === 'function') await loadServers();
      await openRoom(room._id, {
        textChannelId: data.textChannelId,
        voiceChannelId: data.voiceChannelId
      });
      if (typeof showNotification === 'function') {
        showNotification('success', `Комната "${name}" создана`);
      }
    } catch (error) {
      if (errEl) {
        errEl.textContent = error.message || 'Ошибка при создании комнаты';
        errEl.classList.remove('hidden');
      }
    }
  }

  // === Открытие комнаты ==================================================

  function applyRoomViewFor(server, hints) {
    if (!server || server?.settings?.kind !== 'room') return false;

    const channels = Array.isArray(server.channels) ? server.channels : [];
    const textCh = channels.find(c => hints && c._id === hints.textChannelId)
      || channels.find(c => c.type === 'text');
    const voiceCh = channels.find(c => hints && c._id === hints.voiceChannelId)
      || channels.find(c => c.type === 'voice');

    window.currentRoom = {
      _id: server._id,
      name: server.name,
      description: server.description || '',
      textChannelId: textCh?._id || null,
      voiceChannelId: voiceCh?._id || null
    };

    enterRoomMode();
    hideAllMainViews();
    renderRoomHeader(server);
    showRoomView();
    hideAllRoomPanels();
    setActiveTab(null);
    // Применяем тему комнаты (цвет/баннер) сразу при входе.
    // Используем сохранённые значения из server.settings.color / server.banner.
    applyRoomThemeFromServer(server);

    document.querySelectorAll('.channel-item.active').forEach(el => el.classList.remove('active'));

    refreshChatMeta(window.currentRoom);
    refreshVoiceMeta(window.currentRoom);
    attachLiveHandlers(window.currentRoom);

    return true;
  }

  async function openRoom(roomId, hints = {}) {
    if (typeof selectServer !== 'function') return;
    await selectServer(roomId);
    const server = window.currentServer;
    if (!server) return;
    if (!applyRoomViewFor(server, hints)) {
      exitRoomMode();
    }
  }

  // === Active mode panels ================================================

  // Чат: показываем room-chat-strip + chat-view, оставляем room-view chrome.
  function openRoomChat() {
    const room = window.currentRoom;
    if (!room || !room.textChannelId) {
      if (typeof showNotification === 'function') {
        showNotification('warning', 'Текстовый канал комнаты не найден');
      }
      return;
    }
    if (typeof selectChannel !== 'function') return;

    setActiveTab('chat');
    // Прячем альтернативные панели
    setHidden('room-voice-panel', true);
    setHidden('room-media-empty', true);
    // Показываем strip и инициируем chat-view
    setHidden('room-chat-strip', false);
    selectChannel(room.textChannelId, 'Чат', 'text');
    // selectChannel вызывает showChatView(), которая снимает hidden c chat-view
    // и hidden с других. Не позволяем ей скрывать наш room-chrome.
    showRoomView();
  }

  // Войс: показываем room-voice-panel, прячем chat и media.
  function openRoomVoice() {
    const room = window.currentRoom;
    if (!room || !room.voiceChannelId) {
      if (typeof showNotification === 'function') {
        showNotification('warning', 'Голосовой канал комнаты не найден');
      }
      return;
    }
    setActiveTab('voice');
    setHidden('room-chat-strip', true);
    const chat = document.getElementById('chat-view');
    if (chat) chat.classList.add('hidden');
    setHidden('room-media-empty', true);
    setHidden('room-voice-panel', false);
    refreshVoiceMeta(room);
    renderVoicePanelMode();
  }

  // Медиа: пустое состояние.
  function openRoomMedia() {
    setActiveTab('media');
    setHidden('room-chat-strip', true);
    const chat = document.getElementById('chat-view');
    if (chat) chat.classList.add('hidden');
    setHidden('room-voice-panel', true);
    setHidden('room-media-empty', false);
  }

  // === Voice connect / state ==============================================

  /**
   * Пользователь сейчас подключён ИМЕННО к войсу этой комнаты?
   */
  function isConnectedToRoomVoice() {
    const room = window.currentRoom;
    if (!room?.voiceChannelId) return false;
    return String(window.currentVoiceChannel || '') === String(room.voiceChannelId);
  }

  /**
   * Перерисовать voice-controls в зависимости от того, подключены мы или нет.
   * Также синхронизирует data-muted/data-active с состоянием voiceManager.
   */
  function renderVoicePanelMode() {
    const preconnect = document.getElementById('room-voice-preconnect');
    const controls = document.getElementById('room-voice-controls');
    const connected = isConnectedToRoomVoice();

    if (preconnect) preconnect.classList.toggle('hidden', connected);
    if (controls) controls.classList.toggle('hidden', !connected);

    // Синхронизация состояния кнопок с voiceManager
    const mic = document.getElementById('room-voice-mic-btn');
    const sound = document.getElementById('room-voice-sound-btn');
    const screen = document.getElementById('room-voice-screen-btn');
    const leave = document.getElementById('room-voice-leave-btn');
    const vm = window.voiceManager;

    if (mic) {
      mic.disabled = !connected;
      mic.setAttribute('data-muted', String(!!(vm && vm.isMuted)));
    }
    if (sound) {
      sound.disabled = !connected;
      sound.setAttribute('data-muted', String(!!(vm && vm.isDeafened)));
    }
    if (screen) {
      screen.disabled = !connected;
      screen.setAttribute('data-active', String(!!(vm && vm.isScreenSharing)));
    }
    if (leave) {
      leave.disabled = !connected;
    }
  }

  async function handleRoomVoiceConnect() {
    const room = window.currentRoom;
    if (!room || !room.voiceChannelId) return;
    if (typeof joinVoiceChannel !== 'function') return;

    const btn = document.getElementById('room-voice-connect-btn');
    if (btn) btn.disabled = true;

    try {
      // joinVoiceChannel внутри вызывает showVoicePanel → showVoiceView,
      // но в room-mode voice-view и боковой voice-panel скрыты CSS-правилом
      // (body.room-mode #voice-view, #voice-panel { display:none !important }).
      // Поэтому пользователь не увидит legacy экран.
      await joinVoiceChannel(room.voiceChannelId, 'Войс', room.name || 'Комната');

      // Гарантируем нашу UI-структуру даже если legacy пытался её сбить.
      enterRoomMode();
      showRoomView();
      setHidden('room-voice-panel', false);
      setHidden('room-chat-strip', true);
      setHidden('room-media-empty', true);
      const chat = document.getElementById('chat-view');
      if (chat) chat.classList.add('hidden');
      setActiveTab('voice');

      await refreshVoiceMeta(room);
      renderVoicePanelMode();
    } catch (e) {
      console.error('[room] voice connect failed:', e);
      if (typeof showNotification === 'function') {
        showNotification('error', 'Не удалось подключиться к войсу');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handleRoomVoiceLeave() {
    if (typeof leaveVoiceChannel === 'function') {
      try { await leaveVoiceChannel(); } catch (e) { console.warn('[room] leave failed:', e); }
    }
    // Возвращаемся в room-mode визуально (если ещё в комнате)
    if (!window.currentRoom) return;
    enterRoomMode();
    showRoomView();
    setHidden('room-voice-panel', false);
    setHidden('room-chat-strip', true);
    setHidden('room-media-empty', true);
    const chat = document.getElementById('chat-view');
    if (chat) chat.classList.add('hidden');
    setActiveTab('voice');
    renderVoicePanelMode();
    refreshVoiceMeta(window.currentRoom);
  }

  function handleRoomVoiceMicToggle() {
    if (!isConnectedToRoomVoice()) return;
    if (typeof toggleVoiceMute === 'function') toggleVoiceMute();
    renderVoicePanelMode();
  }

  function handleRoomVoiceSoundToggle() {
    if (!isConnectedToRoomVoice()) return;
    if (typeof toggleVoiceDeafen === 'function') toggleVoiceDeafen();
    renderVoicePanelMode();
  }

  async function handleRoomVoiceScreenToggle() {
    if (!isConnectedToRoomVoice()) return;
    if (typeof toggleScreenShare === 'function') {
      try { await toggleScreenShare(); } catch (e) { console.warn('[room] screen toggle failed:', e); }
    }
    renderVoicePanelMode();
  }

  // === Settings ==========================================================
  // Правая выезжающая панель. Открывается ТОЛЬКО когда текущий сервер —
  // комната (settings.kind === 'room'). Для guild-серверов панель не
  // показывается — кнопка #room-settings-btn физически живёт внутри
  // #room-view, который виден только в room-mode.

  const VIBE_PRESETS = ['Ночной разговор', 'Играем', 'Учёба', 'Чилл'];

  function isRoom(server) {
    return server && server.settings && server.settings.kind === 'room';
  }

  function getCurrentRoomServer() {
    const s = window.currentServer;
    return isRoom(s) ? s : null;
  }

  function setStatus(elId, kind, text) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.classList.remove('hidden', 'success', 'error');
    if (!text) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    if (kind) el.classList.add(kind);
    el.textContent = text;
  }

  function fillSettingsForm(server) {
    const nameEl = document.getElementById('room-settings-name');
    const descEl = document.getElementById('room-settings-desc');
    const vibeEl = document.getElementById('room-settings-vibe');
    const colorEl = document.getElementById('room-settings-color');
    const inviteCodeEl = document.getElementById('room-settings-invite-code');
    // delete-confirm input удалён — поле больше не используется

    if (nameEl) nameEl.value = server.name || '';
    if (descEl) descEl.value = server.description || '';
    if (vibeEl) vibeEl.value = (server.settings && server.settings.vibeStatus) || '';
    if (colorEl) {
      const c = (server.settings && server.settings.color) || '';
      colorEl.value = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c) ? c : '#5865f2';
    }


    // Текущий invite (если есть в server.invites)
    if (inviteCodeEl) {
      const invites = Array.isArray(server.invites) ? server.invites : [];
      const last = invites.length > 0 ? invites[invites.length - 1] : null;
      inviteCodeEl.value = last && last.code ? String(last.code) : '';
    }

    renderMembersList(server);
    updateOwnerOnlyVisibility(server);
    setIconPreview(server);
    setBannerPreview(server);
    updateMediaButtonsState(server);
    updateDangerZoneState(server);
    setStatus('room-settings-status', null, '');
    setStatus('room-settings-invite-status', null, '');
  }

  function renderMembersList(server) {
    const list = document.getElementById('room-settings-members-list');
    if (!list) return;
    list.innerHTML = '';
    const members = Array.isArray(server.members) ? server.members : [];
    const ownerId = String(server.owner?._id || server.owner || '');

    // Сначала владелец, потом остальные
    const sorted = members.slice().sort((a, b) => {
      const aOwner = String(a?.user?._id || a?.user || '') === ownerId;
      const bOwner = String(b?.user?._id || b?.user || '') === ownerId;
      return (bOwner ? 1 : 0) - (aOwner ? 1 : 0);
    });

    sorted.forEach(m => {
      const user = m?.user || {};
      const li = document.createElement('li');
      li.className = 'room-settings-member';
      li.setAttribute('role', 'listitem');

      const avatar = document.createElement('span');
      makeAvatar(avatar, user, '?', 'room-settings-member-avatar');
      li.appendChild(avatar);

      const name = document.createElement('span');
      name.className = 'room-settings-member-name';
      // Безопасный рендер username — только textContent
      name.textContent = user.username || 'Гость';
      li.appendChild(name);

      const isOwner = String(user._id || '') === ownerId;
      if (isOwner) {
        const badge = document.createElement('span');
        badge.className = 'room-settings-member-badge';
        badge.textContent = 'Владелец';
        li.appendChild(badge);
      }

      list.appendChild(li);
    });
  }

  function isCurrentUserOwner(server) {
    if (!server) return false;
    const me = window.currentUser;
    if (!me || !me._id) return false;
    const ownerId = String(server.owner?._id || server.owner || '');
    return ownerId === String(me._id);
  }

  function updateOwnerOnlyVisibility(server) {
    const block = document.getElementById('room-settings-delete-block');
    if (!block) return;
    block.classList.toggle('room-settings-hidden-section', !isCurrentUserOwner(server));
  }

  function setActiveSection(name) {
    let activeBtn = null;
    document.querySelectorAll('.room-settings-nav-item').forEach(b => {
      const active = b.getAttribute('data-rs-section') === name;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
      if (active) activeBtn = b;
    });
    document.querySelectorAll('.room-settings-section').forEach(s => {
      s.classList.toggle('active', s.getAttribute('data-rs-section-body') === name);
    });
    // Активная вкладка должна оставаться видимой при горизонтальной
    // прокрутке узкой панели.
    if (activeBtn && typeof activeBtn.scrollIntoView === 'function') {
      try {
        activeBtn.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      } catch (e) { /* старые браузеры — игнорируем */ }
    }
    updateNavScrollEdges();
  }

  /**
   * Прокрутка вкладок настроек комнаты. Поддерживается:
   *  - кнопки стрелок слева/справа (#room-settings-nav-prev/-next),
   *    основной понятный способ;
   *  - колесо мыши (deltaY → scrollLeft, нормализация по deltaMode);
   *  - нативный горизонтальный жест тачпада (не перехватываем).
   *
   * Состояние стрелок управляется CSS-классами is-overflowing,
   * at-start, at-end на родительском .room-settings-nav-wrap, чтобы
   * стилизовать disabled-вид и возможное скрытие через CSS.
   * Никаких inline onclick / inline style на самих кнопках.
   */
  function bindNavWheelScroll() {
    const wrap = document.querySelector('.room-settings-nav-wrap');
    const nav = document.querySelector('.room-settings-nav');
    if (!nav || nav.__wheelBound) return;
    nav.__wheelBound = true;

    nav.addEventListener('wheel', (e) => {
      // Тачпадный горизонтальный жест — не вмешиваемся.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (nav.scrollWidth <= nav.clientWidth + 1) return;
      e.preventDefault();
      let delta = e.deltaY;
      if (e.deltaMode === 1) delta *= 16;
      else if (e.deltaMode === 2) delta *= nav.clientWidth;
      nav.scrollLeft += delta * 0.55;
      updateNavScrollEdges();
    }, { passive: false });

    nav.addEventListener('scroll', updateNavScrollEdges, { passive: true });
    window.addEventListener('resize', updateNavScrollEdges);

    // Стрелки: на каждый клик прокручиваем на ~60% видимой ширины nav,
    // smooth — браузер сам анимирует. Ширина шага достаточная, чтобы
    // увидеть следующую вкладку, и не слишком большая, чтобы пропустить.
    const scrollByStep = (direction) => {
      const step = Math.max(120, Math.round(nav.clientWidth * 0.6));
      nav.scrollBy({ left: direction * step, behavior: 'smooth' });
    };
    const prev = document.getElementById('room-settings-nav-prev');
    const next = document.getElementById('room-settings-nav-next');
    if (prev) prev.addEventListener('click', () => scrollByStep(-1));
    if (next) next.addEventListener('click', () => scrollByStep(1));

    // Сохраняем ссылку на wrap для updateNavScrollEdges
    if (wrap) nav.__wrapEl = wrap;
  }

  function updateNavScrollEdges() {
    const nav = document.querySelector('.room-settings-nav');
    if (!nav) return;
    const wrap = nav.__wrapEl || document.querySelector('.room-settings-nav-wrap');
    const overflow = nav.scrollWidth > nav.clientWidth + 1;
    const atStart = nav.scrollLeft <= 1;
    const atEnd = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 1;

    // На самой ленте — для совместимости со старой стилистикой.
    nav.classList.toggle('can-scroll', overflow);

    // На обёртке — управляем видимостью/disabled-состоянием стрелок.
    if (wrap) {
      wrap.classList.toggle('is-overflowing', overflow);
      wrap.classList.toggle('at-start', !overflow || atStart);
      wrap.classList.toggle('at-end', !overflow || atEnd);
    }

    // Кнопки физически disabled, чтобы клик не делал ничего на крае.
    const prev = document.getElementById('room-settings-nav-prev');
    const next = document.getElementById('room-settings-nav-next');
    if (prev) prev.disabled = !overflow || atStart;
    if (next) next.disabled = !overflow || atEnd;
  }

  function openRoomSettings() {
    const server = getCurrentRoomServer();
    if (!server) {
      // Не комната — ничего не делаем (старые серверы не трогаем)
      return;
    }
    fillSettingsForm(server);
    setActiveSection('general');

    const panel = document.getElementById('room-settings-panel');
    const backdrop = document.getElementById('room-settings-backdrop');
    if (panel) {
      panel.classList.remove('hidden');
      // requestAnimationFrame чтобы анимация transform сработала
      requestAnimationFrame(() => panel.classList.add('visible'));
      panel.setAttribute('aria-hidden', 'false');
    }
    if (backdrop) {
      backdrop.classList.remove('hidden');
      requestAnimationFrame(() => backdrop.classList.add('visible'));
    }
    // После раскрытия панели layout стабилизируется — пересчитываем
    // фейды и активный таб.
    requestAnimationFrame(updateNavScrollEdges);
  }

  function closeRoomSettings() {
    const panel = document.getElementById('room-settings-panel');
    const backdrop = document.getElementById('room-settings-backdrop');
    if (panel) {
      panel.classList.remove('visible');
      panel.setAttribute('aria-hidden', 'true');
      setTimeout(() => panel.classList.add('hidden'), 250);
    }
    if (backdrop) {
      backdrop.classList.remove('visible');
      setTimeout(() => backdrop.classList.add('hidden'), 250);
    }
  }

  async function handleSaveGeneral() {
    const server = getCurrentRoomServer();
    if (!server) return;

    const name = (document.getElementById('room-settings-name')?.value || '').trim();
    const description = (document.getElementById('room-settings-desc')?.value || '').trim();
    const vibeStatus = (document.getElementById('room-settings-vibe')?.value || '').trim();

    if (name.length < 2) {
      setStatus('room-settings-status', 'error', 'Название должно быть минимум 2 символа');
      return;
    }

    const saveBtn = document.getElementById('room-settings-save');
    if (saveBtn) saveBtn.disabled = true;

    try {
      const data = await RoomsAPI.update(server._id, { name, description, vibeStatus });
      // Обновляем локальное состояние
      if (data && data.server) {
        // Сохраняем поля в currentServer (не пересоздавая объект, чтобы
        // сохранить ссылки на channels и members в кешах).
        Object.assign(server, {
          name: data.server.name,
          description: data.server.description
        });
        if (server.settings && data.server.settings) {
          server.settings.vibeStatus = data.server.settings.vibeStatus || '';
        }
      }
      // Перерисовать шапку комнаты
      if (window.currentRoom) {
        window.currentRoom.name = name;
        window.currentRoom.description = description;
      }
      renderRoomHeader(server);
      // Обновить sidebar (название сервера в списке)
      if (typeof loadServers === 'function') loadServers();

      setStatus('room-settings-status', 'success', 'Сохранено');
      if (typeof showNotification === 'function') {
        showNotification('success', 'Настройки комнаты обновлены');
      }
    } catch (e) {
      setStatus('room-settings-status', 'error', e.message || 'Ошибка сохранения');
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  }

  // === Применение цвета комнаты в UI =====================================
  // Назначаем CSS variable --room-accent на body. Если цвет невалиден —
  // ничего не делаем (default из CSS уже выставлен).
  const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
  function safeHex(c) { return typeof c === 'string' && HEX_RE.test(c) ? c : null; }

  function hexToRgba(hex, alpha) {
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function applyRoomColor(color) {
    const hex = safeHex(color);
    const body = document.body;
    if (!body) return;
    if (!hex) {
      body.style.removeProperty('--room-accent');
      body.style.removeProperty('--room-accent-soft');
      body.style.removeProperty('--room-accent-glow');
      return;
    }
    body.style.setProperty('--room-accent', hex);
    body.style.setProperty('--room-accent-soft', hexToRgba(hex, 0.18));
    body.style.setProperty('--room-accent-glow', hexToRgba(hex, 0.35));
  }

  function applyRoomBanner(bannerUrl) {
    const header = document.querySelector('.room-header');
    if (!header) return;
    if (typeof bannerUrl === 'string' && bannerUrl.length > 0 && typeof getAvatarUrl === 'function') {
      // getAvatarUrl возвращает полный URL для относительных путей /uploads/...
      const url = getAvatarUrl(bannerUrl);
      // CSS подставляется через CSS variable, encode значение URL.
      header.style.setProperty('--room-banner-image', `url("${encodeURI(url)}")`);
      header.classList.add('has-banner');
    } else {
      header.style.removeProperty('--room-banner-image');
      header.classList.remove('has-banner');
    }
  }

  // Расширяем applyRoomViewFor чтобы при входе в комнату сразу применять
  // цвет/баннер. Делается через перехват внутреннего рендера: при каждом
  // openRoom мы вручную вызываем эти функции.
  // (см. также place where renderRoomHeader вызывается)
  function applyRoomThemeFromServer(server) {
    if (!server || server.settings?.kind !== 'room') return;
    applyRoomColor(server.settings.color || '');
    applyRoomBanner(server.banner || '');
  }

  async function handleSaveAppearance() {
    const server = getCurrentRoomServer();
    if (!server) return;
    const colorEl = document.getElementById('room-settings-color');
    const colorRaw = colorEl ? colorEl.value : '';
    if (!safeHex(colorRaw)) {
      setStatus('room-settings-status', 'error', 'Некорректный цвет');
      return;
    }
    const btn = document.getElementById('room-settings-appearance-save');
    if (btn) btn.disabled = true;
    try {
      const data = await RoomsAPI.update(server._id, { color: colorRaw });
      if (data?.server?.settings) {
        if (!server.settings) server.settings = {};
        server.settings.color = data.server.settings.color || '';
      }
      applyRoomColor(server.settings.color);
      setStatus('room-settings-status', 'success', 'Цвет сохранён');
      if (typeof showNotification === 'function') {
        showNotification('success', 'Цвет комнаты обновлён');
      }
    } catch (e) {
      if (typeof showNotification === 'function') {
        showNotification('error', e.message || 'Ошибка сохранения цвета');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // === Иконка комнаты =====================================================

  const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

  function clientValidateImage(file, maxBytes) {
    if (!file) return 'Файл не выбран';
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return 'Допустимы только PNG, JPG, WEBP, GIF';
    if (file.size > maxBytes) return `Файл слишком большой (макс. ${Math.round(maxBytes / 1024 / 1024)} МБ)`;
    return null;
  }

  function setIconPreview(server) {
    const wrap = document.getElementById('room-settings-icon-preview');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (server?.icon && typeof getAvatarUrl === 'function') {
      const img = document.createElement('img');
      img.src = getAvatarUrl(server.icon);
      img.alt = server.name || 'Иконка';
      wrap.appendChild(img);
    } else {
      // Используем безопасный textContent для инициалов
      wrap.textContent = (server?.name || 'К').trim().charAt(0).toUpperCase();
    }
  }

  /**
   * Синхронизирует disabled-состояние кнопок очистки иконки и баннера
   * с реальным состоянием сервера: если нет иконки или пользователь не
   * владелец — кнопка disabled. Это решает UX-задачу 2 (видимый
   * disabled-стейт без догадок). title пишет короткое объяснение.
   */
  function updateMediaButtonsState(server) {
    const isOwner = isCurrentUserOwner(server);
    const iconClear = document.getElementById('room-settings-icon-clear');
    if (iconClear) {
      const noIcon = !server?.icon;
      iconClear.disabled = !isOwner || noIcon;
      iconClear.title = !isOwner
        ? 'Только владелец может убрать иконку'
        : noIcon ? 'Иконка ещё не загружена' : 'Убрать иконку';
    }
    const bannerClear = document.getElementById('room-settings-banner-clear');
    if (bannerClear) {
      const noBanner = !server?.banner;
      bannerClear.disabled = !isOwner || noBanner;
      bannerClear.title = !isOwner
        ? 'Только владелец может убрать баннер'
        : noBanner ? 'Баннер ещё не загружен' : 'Убрать баннер';
    }
  }

  function setBannerPreview(server) {
    const wrap = document.getElementById('room-settings-banner-preview');
    if (!wrap) return;
    if (server?.banner && typeof getAvatarUrl === 'function') {
      const url = getAvatarUrl(server.banner);
      wrap.style.backgroundImage = `url("${encodeURI(url)}")`;
      wrap.classList.add('has-image');
    } else {
      wrap.style.backgroundImage = '';
      wrap.classList.remove('has-image');
    }
  }

  /**
   * Удалить иконку комнаты. Только для владельца. Безопасно для guild
   * и room — backend сам решает поведение. Локально обновляем preview,
   * шапку и список серверов.
   */
  async function handleIconClear() {
    const server = getCurrentRoomServer();
    if (!server) return;
    if (!isCurrentUserOwner(server)) {
      if (typeof showNotification === 'function') {
        showNotification('error', 'Только владелец может удалить иконку');
      }
      return;
    }
    if (!server.icon) return; // нечего удалять

    const btn = document.getElementById('room-settings-icon-clear');
    if (btn) btn.disabled = true;
    try {
      await RoomsAPI.deleteIcon(server._id);
      server.icon = '';
      if (window.currentRoom) window.currentRoom.icon = '';
      setIconPreview(server);
      updateMediaButtonsState(server);
      renderRoomHeader(server);
      if (typeof loadServers === 'function') loadServers();
      if (typeof showNotification === 'function') {
        showNotification('success', 'Иконка удалена');
      }
    } catch (e) {
      if (typeof showNotification === 'function') {
        showNotification('error', e.message || 'Не удалось удалить иконку');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handleIconSelected(e) {
    const server = getCurrentRoomServer();
    if (!server) return;
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const err = clientValidateImage(file, 8 * 1024 * 1024);
    if (err) {
      if (typeof showNotification === 'function') showNotification('error', err);
      e.target.value = '';
      return;
    }
    try {
      const data = await RoomsAPI.uploadIcon(server._id, file);
      const newIcon = data?.server?.icon;
      if (newIcon) {
        server.icon = newIcon;
        if (window.currentRoom) window.currentRoom.icon = newIcon;
        setIconPreview(server);
        updateMediaButtonsState(server);
        renderRoomHeader(server);
        if (typeof loadServers === 'function') loadServers();
      }
      if (typeof showNotification === 'function') {
        showNotification('success', 'Иконка обновлена');
      }
    } catch (err2) {
      if (typeof showNotification === 'function') {
        showNotification('error', err2.message || 'Ошибка загрузки иконки');
      }
    } finally {
      e.target.value = '';
    }
  }

  async function handleBannerSelected(e) {
    const server = getCurrentRoomServer();
    if (!server) return;
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const err = clientValidateImage(file, 12 * 1024 * 1024);
    if (err) {
      if (typeof showNotification === 'function') showNotification('error', err);
      e.target.value = '';
      return;
    }
    try {
      const data = await RoomsAPI.uploadBanner(server._id, file);
      const newBanner = data?.server?.banner;
      if (newBanner !== undefined) {
        server.banner = newBanner;
        setBannerPreview(server);
        updateMediaButtonsState(server);
        applyRoomBanner(newBanner || '');
      }
      if (typeof showNotification === 'function') {
        showNotification('success', 'Баннер обновлён');
      }
    } catch (err2) {
      if (typeof showNotification === 'function') {
        showNotification('error', err2.message || 'Ошибка загрузки баннера');
      }
    } finally {
      e.target.value = '';
    }
  }

  /**
   * Реально удаляет баннер комнаты.
   *  - Только владелец (на бэке проверяется ещё раз);
   *  - Очищает поле server.banner в БД;
   *  - Удаляет файл с диска (если лежит в /uploads/images/);
   *  - Обновляет preview в настройках, шапку комнаты и локальный кэш.
   */
  async function handleBannerClear() {
    const server = getCurrentRoomServer();
    if (!server) return;
    if (!isCurrentUserOwner(server)) {
      if (typeof showNotification === 'function') {
        showNotification('error', 'Только владелец может удалить баннер');
      }
      return;
    }
    if (!server.banner) {
      // Уже пусто — ничего не делаем.
      return;
    }

    const btn = document.getElementById('room-settings-banner-clear');
    if (btn) btn.disabled = true;
    try {
      await RoomsAPI.deleteBanner(server._id);
      // Обновляем локальные структуры — без F5.
      server.banner = '';
      if (window.currentRoom) window.currentRoom.banner = '';
      setBannerPreview(server);
      updateMediaButtonsState(server);
      applyRoomBanner('');
      if (typeof showNotification === 'function') {
        showNotification('success', 'Баннер удалён');
      }
    } catch (e) {
      if (typeof showNotification === 'function') {
        showNotification('error', e.message || 'Не удалось удалить баннер');
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // === Leave / Delete room ================================================

  function showRoomConfirm(opts) {
    if (window.Modal && typeof window.Modal.confirm === 'function') {
      window.Modal.confirm(opts);
    } else if (window.confirm(opts.body || 'Подтвердите действие')) {
      opts.onConfirm && opts.onConfirm();
    }
  }

  async function handleLeaveRoom() {
    const server = getCurrentRoomServer();
    if (!server) return;
    if (isCurrentUserOwner(server)) {
      // Защита на frontend (backend всё равно вернёт 400 для owner)
      if (typeof showNotification === 'function') {
        showNotification('warning', 'Владелец не может покинуть комнату. Удалите её или передайте владение.');
      }
      return;
    }
    showRoomConfirm({
      title: 'Выйти из комнаты',
      body: `Вы перестанете быть участником "${server.name || 'этой комнаты'}". Продолжить?`,
      confirmText: 'Выйти',
      isDanger: true,
      onConfirm: async () => {
        try {
          await RoomsAPI.leave(server._id);
          if (typeof showNotification === 'function') {
            showNotification('success', 'Вы покинули комнату');
          }
          await afterRoomGone();
        } catch (e) {
          if (typeof showNotification === 'function') {
            showNotification('error', e.message || 'Не удалось выйти из комнаты');
          }
        }
      }
    });
  }

  async function handleDeleteRoom() {
    const server = getCurrentRoomServer();
    if (!server) return;
    if (!isCurrentUserOwner(server)) {
      if (typeof showNotification === 'function') {
        showNotification('error', 'Только владелец может удалить комнату');
      }
      return;
    }
    showRoomConfirm({
      title: 'Удалить комнату?',
      body: 'Это действие нельзя отменить. Комната будет удалена для всех участников.',
      confirmText: 'Удалить комнату',
      isDanger: true,
      onConfirm: async () => {
        try {
          await RoomsAPI.delete(server._id);
          if (typeof showNotification === 'function') {
            showNotification('success', 'Комната удалена');
          }
          await afterRoomGone();
        } catch (e) {
          if (typeof showNotification === 'function') {
            showNotification('error', e.message || 'Не удалось удалить комнату');
          }
        }
      }
    });
  }

  /**
   * Полностью сбрасывает UI после того как пользователь покинул/удалил
   * комнату. Главная задача: убрать legacy server-channel-sidebar, который
   * был отрендерен ранее в selectServer() и скрыт только CSS-ом через
   * body.room-mode. Без этой очистки после exitRoomMode() пользователь
   * видит «обычный сервер» с каналами удалённой комнаты.
   */
  async function afterRoomGone() {
    // 1. Закрыть room settings и confirm modal (если ещё открыт).
    closeRoomSettings();
    if (typeof closeModal === 'function') closeModal('confirm-modal');

    // 2. Выйти из room-mode.
    exitRoomMode();

    // 3. Очистить активную комнату/сервер/канал.
    const goneId = window.currentServer?._id || window.currentRoom?._id || null;
    window.currentRoom = null;
    window.currentServer = null;
    window.currentServerId = null;
    window.currentChannel = null;
    window.currentChannelId = null;
    window.currentVoiceChannel = null;

    // 4. Убрать активное состояние у удалённой комнаты в списке слева
    //    и физически очистить legacy channel sidebar (имя/каналы).
    document.querySelectorAll('.server-icon.active').forEach(el => el.classList.remove('active'));
    if (goneId) {
      document.querySelectorAll(`.server-icon[data-server-id="${CSS.escape(String(goneId))}"]`)
        .forEach(el => el.classList.remove('active'));
    }
    const channelsList = document.getElementById('server-channels-list');
    if (channelsList) channelsList.innerHTML = '';
    const headerTitle = document.getElementById('server-header-title');
    if (headerTitle) headerTitle.textContent = '';

    // 5. Перезагрузить список серверов/комнат.
    if (typeof loadServers === 'function') {
      try { await loadServers(); } catch (e) { console.warn('[room] loadServers failed:', e); }
    }

    // 6. Безопасный fallback. Приоритет: DM/Friends → welcome.
    //    showDMView корректно переключает sidebar обратно на DM (скрывает
    //    server-sidebar-view, показывает dm-sidebar-view). Это и есть
    //    правильное «домашнее» состояние приложения.
    if (typeof showDMView === 'function') {
      showDMView();
    } else if (typeof showWelcomeView === 'function') {
      showWelcomeView();
    } else {
      const welcome = document.getElementById('welcome-view');
      if (welcome) welcome.classList.remove('hidden');
    }
  }

  function updateDangerZoneState(server) {
    const isOwner = isCurrentUserOwner(server);
    const leaveBtn = document.getElementById('room-settings-leave');
    const leaveHint = document.getElementById('room-settings-leave-hint');
    if (leaveBtn) {
      leaveBtn.disabled = isOwner;
    }
    if (leaveHint) {
      leaveHint.textContent = isOwner
        ? 'Владелец не может выйти. Удалите комнату или передайте владение.'
        : 'Вы перестанете быть участником этой комнаты.';
    }

    const deleteBtn = document.getElementById('room-settings-delete');
    if (deleteBtn) {
      // Кнопка удаления активна сразу для владельца — подтверждение
      // выполняется через отдельный confirm modal.
      deleteBtn.disabled = !isOwner;
    }
  }

  async function handleCreateInvite() {
    const server = getCurrentRoomServer();
    if (!server) return;
    const btn = document.getElementById('room-settings-invite-create');
    if (btn) btn.disabled = true;
    try {
      const data = await RoomsAPI.createInvite(server._id);
      const code = data && data.inviteCode ? String(data.inviteCode) : '';
      const codeEl = document.getElementById('room-settings-invite-code');
      if (codeEl) codeEl.value = code;
      // Сохраним локально, чтобы при повторном открытии панели код виделся
      if (!Array.isArray(server.invites)) server.invites = [];
      server.invites.push({ code });
      setStatus('room-settings-invite-status', 'success', 'Код создан');
    } catch (e) {
      setStatus('room-settings-invite-status', 'error', e.message || 'Ошибка создания приглашения');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function handleCopyInvite() {
    const codeEl = document.getElementById('room-settings-invite-code');
    const code = codeEl ? codeEl.value : '';
    if (!code) {
      setStatus('room-settings-invite-status', 'error', 'Сначала создайте код');
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code);
      } else if (codeEl) {
        codeEl.select();
        document.execCommand('copy');
      }
      setStatus('room-settings-invite-status', 'success', 'Скопировано');
    } catch (e) {
      setStatus('room-settings-invite-status', 'error', 'Не удалось скопировать');
    }
  }

  function bindRoomSettingsPanel() {
    const close = document.getElementById('room-settings-close');
    if (close) close.addEventListener('click', closeRoomSettings);

    const cancel = document.getElementById('room-settings-cancel');
    if (cancel) cancel.addEventListener('click', closeRoomSettings);

    const backdrop = document.getElementById('room-settings-backdrop');
    if (backdrop) backdrop.addEventListener('click', closeRoomSettings);

    document.querySelectorAll('.room-settings-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.getAttribute('data-rs-section');
        if (name) setActiveSection(name);
      });
    });

    document.querySelectorAll('.room-settings-vibe-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const v = btn.getAttribute('data-vibe') || '';
        const input = document.getElementById('room-settings-vibe');
        if (input) input.value = v;
      });
    });

    const save = document.getElementById('room-settings-save');
    if (save) save.addEventListener('click', handleSaveGeneral);

    const apprSave = document.getElementById('room-settings-appearance-save');
    if (apprSave) apprSave.addEventListener('click', handleSaveAppearance);

    const inviteCreate = document.getElementById('room-settings-invite-create');
    if (inviteCreate) inviteCreate.addEventListener('click', handleCreateInvite);

    const inviteCopy = document.getElementById('room-settings-invite-copy');
    if (inviteCopy) inviteCopy.addEventListener('click', handleCopyInvite);

    const inviteShortcut = document.getElementById('room-settings-invite-shortcut');
    if (inviteShortcut) inviteShortcut.addEventListener('click', () => setActiveSection('invite'));

    // Иконка / баннер
    const iconBtn = document.getElementById('room-settings-icon-btn');
    const iconFile = document.getElementById('room-settings-icon-file');
    if (iconBtn && iconFile) iconBtn.addEventListener('click', () => iconFile.click());
    if (iconFile) iconFile.addEventListener('change', handleIconSelected);

    const iconClear = document.getElementById('room-settings-icon-clear');
    if (iconClear) iconClear.addEventListener('click', handleIconClear);

    const bannerBtn = document.getElementById('room-settings-banner-btn');
    const bannerFile = document.getElementById('room-settings-banner-file');
    if (bannerBtn && bannerFile) bannerBtn.addEventListener('click', () => bannerFile.click());
    if (bannerFile) bannerFile.addEventListener('change', handleBannerSelected);

    const bannerClear = document.getElementById('room-settings-banner-clear');
    if (bannerClear) bannerClear.addEventListener('click', handleBannerClear);

    // Live preview цвета пока пользователь крутит color picker.
    // Сохранение всё равно по кнопке "Сохранить цвет".
    const colorEl = document.getElementById('room-settings-color');
    if (colorEl) colorEl.addEventListener('input', (e) => applyRoomColor(e.target.value));

    // Опасная зона
    const leaveBtn = document.getElementById('room-settings-leave');
    if (leaveBtn) leaveBtn.addEventListener('click', handleLeaveRoom);

    const deleteBtn = document.getElementById('room-settings-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', handleDeleteRoom);

    // (поле подтверждения именем удалено: для удаления используется
    // только confirm modal)

    // Esc закрывает панель, но только если поверх неё нет другого
    // активного modal-overlay (например, confirm-modal удаления).
    // Иначе пусть Esc сначала закроет верхний слой (его обрабатывает ui.js).
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const panel = document.getElementById('room-settings-panel');
      if (!panel || panel.classList.contains('hidden')) return;
      const topModalOpen = document.querySelector('.modal-overlay:not(.hidden)');
      if (topModalOpen) return;
      closeRoomSettings();
    });
  }

  // === Биндинг обработчиков (без inline) =================================

  function bindCreateRoomButton() {
    const btn = document.getElementById('create-room-btn');
    if (btn) btn.addEventListener('click', showCreateRoomModal);

    const submit = document.getElementById('create-room-submit');
    if (submit) submit.addEventListener('click', createRoom);

    const close = (id) => {
      const el = document.getElementById(id);
      if (el && typeof closeModal === 'function') {
        el.addEventListener('click', () => closeModal('create-room-modal'));
      }
    };
    close('create-room-close');
    close('create-room-cancel');
  }

  function bindRoomTabs() {
    const tab = (id, handler) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', handler);
    };
    tab('room-tab-chat', openRoomChat);
    tab('room-tab-voice', openRoomVoice);
    tab('room-tab-media', openRoomMedia);
  }

  function bindRoomVoiceControls() {
    const connect = document.getElementById('room-voice-connect-btn');
    if (connect) connect.addEventListener('click', handleRoomVoiceConnect);

    const mic = document.getElementById('room-voice-mic-btn');
    if (mic) mic.addEventListener('click', handleRoomVoiceMicToggle);

    const sound = document.getElementById('room-voice-sound-btn');
    if (sound) sound.addEventListener('click', handleRoomVoiceSoundToggle);

    const screen = document.getElementById('room-voice-screen-btn');
    if (screen) screen.addEventListener('click', handleRoomVoiceScreenToggle);

    const leave = document.getElementById('room-voice-leave-btn');
    if (leave) leave.addEventListener('click', handleRoomVoiceLeave);
  }

  function bindRoomSettings() {
    const btn = document.getElementById('room-settings-btn');
    if (btn) btn.addEventListener('click', openRoomSettings);
  }

  function wrapNavigation() {
    if (typeof window.selectServer === 'function' && !window.selectServer.__wrappedForRooms) {
      const original = window.selectServer;
      const wrapped = async function (...args) {
        const result = await original.apply(this, args);
        const s = window.currentServer;
        if (!applyRoomViewFor(s, null)) {
          exitRoomMode();
        }
        return result;
      };
      wrapped.__wrappedForRooms = true;
      window.selectServer = wrapped;
    }

    if (typeof window.showDMView === 'function' && !window.showDMView.__wrappedForRooms) {
      const original = window.showDMView;
      const wrapped = function (...args) {
        exitRoomMode();
        return original.apply(this, args);
      };
      wrapped.__wrappedForRooms = true;
      window.showDMView = wrapped;
    }
  }

  // === Init ===============================================================

  function init() {
    bindCreateRoomButton();
    bindRoomTabs();
    bindRoomVoiceControls();
    bindRoomSettings();
    bindRoomSettingsPanel();
    bindNavWheelScroll();
    wrapNavigation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.RoomsUI = {
    showCreateRoomModal,
    createRoom,
    openRoom,
    openRoomChat,
    openRoomVoice,
    openRoomMedia,
    handleRoomVoiceConnect,
    handleRoomVoiceLeave,
    // Используется legacy ui.js для закрытия панели после удаления через
    // legacy server-settings-modal (на случай если пользователь оказался там).
    closeSettingsPanel: closeRoomSettings,
    // Дёргается из ui.js для обновления темы при возврате в комнату
    applyRoomThemeFromServer
  };
})();
