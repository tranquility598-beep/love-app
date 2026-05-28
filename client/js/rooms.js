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

  // === Listener storage ==================================================

  const roomListeners = {
    // Navigation scroll
    navWheel: null,
    navScroll: null,
    windowResize: null,
    navPrev: null,
    navNext: null,
    
    // Settings modal
    settingsClose: null,
    settingsCancel: null,
    settingsBackdrop: null,
    settingsNavItems: [], // multiple
    settingsVibePresets: [], // multiple
    settingsSave: null,
    settingsAppearanceSave: null,
    settingsInviteCreate: null,
    settingsInviteCopy: null,
    settingsInviteShortcut: null,
    
    // File inputs
    iconButton: null,
    iconFile: null,
    iconClear: null,
    bannerButton: null,
    bannerFile: null,
    bannerClear: null,
    
    // Color
    colorInput: null,
    
    // Danger zone
    leaveButton: null,
    deleteButton: null,
    
    // Global
    documentEscape: null,
    
    // Create room modal
    createButton: null,
    createSubmit: null,
    createClose: null,
    createCancel: null,
    
    // Room tabs
    tabChat: null,
    tabVoice: null,
    tabMedia: null,
    
    // Voice controls
    voiceConnect: null,
    voiceMic: null,
    voiceSound: null,
    voiceScreen: null,
    voiceLeave: null,
    
    // Settings button
    settingsButton: null,
    
    // Registration flag
    _registered: false
  };

  // === Управление режимом ================================================

  function enterRoomMode() {
    document.body.classList.add('room-mode');
    destroyRoomListeners();
    registerRoomListeners();
  }

  function exitRoomMode() {
    document.body.classList.remove('room-mode');
    document.body.removeAttribute('data-active-room-tab');
    detachLiveHandlers();
    destroyRoomListeners();
    hideRoomView();
    hideAllRoomPanels();
    
    // Synchronously force clear and deactivate all room overlays
    if (typeof window.forceClearRoomOverlays === 'function') {
      window.forceClearRoomOverlays();
    }
    
    _activeMode = null;
    if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
      window.NavigationController._commitState({ currentRoom: null }, 'exitRoomMode');
    }
  }

  function hideAllMainViews() {
    ['welcome-view', 'friends-view', 'voice-view', 'chat-view', 'dm-empty', 'dm-view', 'room-view']
      .forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      });
  }

  function showRoomView() {
    if (typeof window.switchMainView === 'function') {
      window.switchMainView('room-view');
    } else {
      const v = document.getElementById('room-view');
      if (v) v.classList.remove('hidden');
    }
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
    setHidden('room-media-panel', true);
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
    if (name) {
      document.body.setAttribute('data-active-room-tab', name);
    } else {
      document.body.removeAttribute('data-active-room-tab');
    }
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
    const username = user?.nickname || user?.username || fallbackName || '?';
    const avatarUrl = (typeof getAvatarUrl === 'function' && user?.avatar) ? getAvatarUrl(user.avatar, username, user._id) : null;
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
    const author = msg?.author?.nickname || msg?.author?.username || 'Кто-то';
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
    
    // Detach active screenshare cards to keep video players active
    const activeScreenCards = Array.from(wrap.querySelectorAll('.screen-share-card'));
    activeScreenCards.forEach(card => card.remove());

    wrap.innerHTML = '';
    members.forEach(m => {
      const user = m?.user || m;
      const card = document.createElement('div');
      card.className = 'room-voice-card';
      card.dataset.userId = String(user?.userId || user?._id || m?.userId || m?._id || '');
      card.dataset.speaking = 'false';
      card.setAttribute('role', 'listitem');

      const avatar = document.createElement('div');
      makeAvatar(avatar, user, 'Гость', 'room-voice-card-avatar');
      card.appendChild(avatar);

      const name = document.createElement('span');
      name.className = 'room-voice-card-name';
      name.textContent = user?.nickname || user?.username || 'Гость';
      card.appendChild(name);

      const statusIcons = document.createElement('div');
      statusIcons.className = 'room-voice-card-status-icons';
      statusIcons.style.cssText = 'display: flex; gap: 6px; align-items: center; justify-content: center; height: 16px; margin-top: -4px;';
      
      const isMuted = !!m?.muted;
      const isDeafened = !!m?.deafened;
      
      statusIcons.innerHTML = `
        ${isMuted ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>` : ''}
        ${isDeafened ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>` : ''}
      `;
      card.appendChild(statusIcons);

      wrap.appendChild(card);
    });

    // Re-append active screenshare cards and resume playback
    activeScreenCards.forEach(card => {
      wrap.appendChild(card);
      const v = card.querySelector('video');
      if (v) {
        v.play().catch(e => console.error('[ScreenShare] Room video play failed on re-append:', e));
      }
    });
  }

  function setCardSpeaking(userId, speaking) {
    const wrap = document.getElementById('room-voice-panel-cards');
    if (!wrap) return;
    const card = wrap.querySelector(`.room-voice-card[data-user-id="${CSS.escape(String(userId))}"]`);
    if (card) card.dataset.speaking = String(!!speaking);
  }

  function updateRoomCardVoiceState(userId, muted, deafened) {
    const wrap = document.getElementById('room-voice-panel-cards');
    if (!wrap) return;
    const card = wrap.querySelector(`.room-voice-card[data-user-id="${CSS.escape(String(userId))}"]`);
    if (!card) return;
    
    if (muted !== undefined) card.dataset.muted = String(!!muted);
    if (deafened !== undefined) card.dataset.deafened = String(!!deafened);
    
    const isMuted = card.dataset.muted === 'true';
    const isDeafened = card.dataset.deafened === 'true';
    
    let statusIcons = card.querySelector('.room-voice-card-status-icons');
    if (!statusIcons) {
      statusIcons = document.createElement('div');
      statusIcons.className = 'room-voice-card-status-icons';
      statusIcons.style.cssText = 'display: flex; gap: 6px; align-items: center; justify-content: center; height: 16px; margin-top: -4px;';
      card.appendChild(statusIcons);
    }
    
    statusIcons.innerHTML = `
      ${isMuted ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>` : ''}
      ${isDeafened ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: gray;"><path d="M11 5L6 9H2v6h4l5 4V5z"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>` : ''}
    `;
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
      if (data?.userId) updateRoomCardVoiceState(data.userId, !!data.muted, undefined);
    };
    s.on('voice:user_muted', liveHandlers.onVoiceUserMuted);

    liveHandlers.onVoiceUserDeafened = (data) => {
      if (data?.userId) updateRoomCardVoiceState(data.userId, undefined, !!data.deafened);
    };
    s.on('voice:user_deafened', liveHandlers.onVoiceUserDeafened);

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
      if (liveHandlers.onVoiceUserDeafened) s.off('voice:user_deafened', liveHandlers.onVoiceUserDeafened);
      if (liveHandlers.onVoiceLeft) s.off('voice:left', liveHandlers.onVoiceLeft);
    }
    Object.keys(liveHandlers).forEach(k => { liveHandlers[k] = null; });
  }

  // === Register/Destroy Room Listeners ===================================

  function registerRoomListeners() {
    // Prevent double registration - perform self-healing teardown if already active
    if (roomListeners._registered) {
      console.warn('[rooms] Listeners already registered, performing self-healing re-bind');
      destroyRoomListeners();
    }
    
    // GROUP A: Navigation scroll
    const nav = document.querySelector('.room-settings-nav');
    if (nav) {
      roomListeners.navWheel = (e) => {
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        if (nav.scrollWidth <= nav.clientWidth + 1) return;
        e.preventDefault();
        let delta = e.deltaY;
        if (e.deltaMode === 1) delta *= 16;
        else if (e.deltaMode === 2) delta *= nav.clientWidth;
        nav.scrollLeft += delta * 0.55;
        updateNavScrollEdges();
      };
      nav.addEventListener('wheel', roomListeners.navWheel, { passive: false });
      
      roomListeners.navScroll = updateNavScrollEdges;
      nav.addEventListener('scroll', roomListeners.navScroll, { passive: true });
      
      roomListeners.windowResize = updateNavScrollEdges;
      window.addEventListener('resize', roomListeners.windowResize);
      
      const scrollByStep = (direction) => {
        const step = Math.max(120, Math.round(nav.clientWidth * 0.6));
        nav.scrollBy({ left: direction * step, behavior: 'smooth' });
      };
      
      const prev = document.getElementById('room-settings-nav-prev');
      const next = document.getElementById('room-settings-nav-next');
      
      if (prev) {
        roomListeners.navPrev = () => scrollByStep(-1);
        prev.addEventListener('click', roomListeners.navPrev);
      }
      
      if (next) {
        roomListeners.navNext = () => scrollByStep(1);
        next.addEventListener('click', roomListeners.navNext);
      }
      
      const wrap = document.querySelector('.room-settings-nav-wrap');
      if (wrap) nav.__wrapEl = wrap;
    }
    
    // GROUP B: Settings modal
    const close = document.getElementById('room-settings-close');
    if (close) {
      roomListeners.settingsClose = closeRoomSettings;
      close.addEventListener('click', roomListeners.settingsClose);
    }
    
    const cancel = document.getElementById('room-settings-cancel');
    if (cancel) {
      roomListeners.settingsCancel = closeRoomSettings;
      cancel.addEventListener('click', roomListeners.settingsCancel);
    }
    
    const backdrop = document.getElementById('room-settings-backdrop');
    if (backdrop) {
      roomListeners.settingsBackdrop = closeRoomSettings;
      backdrop.addEventListener('click', roomListeners.settingsBackdrop);
    }
    
    document.querySelectorAll('.room-settings-nav-item').forEach(btn => {
      const handler = () => {
        const name = btn.getAttribute('data-rs-section');
        if (name) setActiveSection(name);
      };
      roomListeners.settingsNavItems.push({ element: btn, handler });
      btn.addEventListener('click', handler);
    });
    
    document.querySelectorAll('.room-settings-vibe-preset').forEach(btn => {
      const handler = () => {
        const v = btn.getAttribute('data-vibe') || '';
        const input = document.getElementById('room-settings-vibe');
        if (input) input.value = v;
      };
      roomListeners.settingsVibePresets.push({ element: btn, handler });
      btn.addEventListener('click', handler);
    });
    
    const save = document.getElementById('room-settings-save');
    if (save) {
      roomListeners.settingsSave = handleSaveGeneral;
      save.addEventListener('click', roomListeners.settingsSave);
    }
    
    const apprSave = document.getElementById('room-settings-appearance-save');
    if (apprSave) {
      roomListeners.settingsAppearanceSave = handleSaveAppearance;
      apprSave.addEventListener('click', roomListeners.settingsAppearanceSave);
    }
    
    const inviteCreate = document.getElementById('room-settings-invite-create');
    if (inviteCreate) {
      roomListeners.settingsInviteCreate = handleCreateInvite;
      inviteCreate.addEventListener('click', roomListeners.settingsInviteCreate);
    }
    
    const inviteCopy = document.getElementById('room-settings-invite-copy');
    if (inviteCopy) {
      roomListeners.settingsInviteCopy = handleCopyInvite;
      inviteCopy.addEventListener('click', roomListeners.settingsInviteCopy);
    }
    
    const inviteShortcut = document.getElementById('room-settings-invite-shortcut');
    if (inviteShortcut) {
      roomListeners.settingsInviteShortcut = () => setActiveSection('invite');
      inviteShortcut.addEventListener('click', roomListeners.settingsInviteShortcut);
    }
    
    // GROUP C: File inputs
    const iconBtn = document.getElementById('room-settings-icon-btn');
    const iconFile = document.getElementById('room-settings-icon-file');
    if (iconBtn && iconFile) {
      roomListeners.iconButton = () => iconFile.click();
      iconBtn.addEventListener('click', roomListeners.iconButton);
    }
    
    if (iconFile) {
      roomListeners.iconFile = handleIconSelected;
      iconFile.addEventListener('change', roomListeners.iconFile);
    }
    
    const iconClear = document.getElementById('room-settings-icon-clear');
    if (iconClear) {
      roomListeners.iconClear = handleIconClear;
      iconClear.addEventListener('click', roomListeners.iconClear);
    }
    
    const bannerBtn = document.getElementById('room-settings-banner-btn');
    const bannerFile = document.getElementById('room-settings-banner-file');
    if (bannerBtn && bannerFile) {
      roomListeners.bannerButton = () => bannerFile.click();
      bannerBtn.addEventListener('click', roomListeners.bannerButton);
    }
    
    if (bannerFile) {
      roomListeners.bannerFile = handleBannerSelected;
      bannerFile.addEventListener('change', roomListeners.bannerFile);
    }
    
    const bannerClear = document.getElementById('room-settings-banner-clear');
    if (bannerClear) {
      roomListeners.bannerClear = handleBannerClear;
      bannerClear.addEventListener('click', roomListeners.bannerClear);
    }
    
    // GROUP D: Color picker
    const colorEl = document.getElementById('room-settings-color');
    if (colorEl) {
      roomListeners.colorInput = (e) => applyRoomColor(e.target.value);
      colorEl.addEventListener('input', roomListeners.colorInput);
    }
    
    // GROUP E: Danger zone
    const leaveBtn = document.getElementById('room-settings-leave');
    if (leaveBtn) {
      roomListeners.leaveButton = handleLeaveRoom;
      leaveBtn.addEventListener('click', roomListeners.leaveButton);
    }
    
    const deleteBtn = document.getElementById('room-settings-delete');
    if (deleteBtn) {
      roomListeners.deleteButton = handleDeleteRoom;
      deleteBtn.addEventListener('click', roomListeners.deleteButton);
    }
    
    // GROUP F: Global escape key for room settings panel
    // Note: Room settings panel is NOT a modal, it's a slide-out panel
    // ModalManager handles modals, but panel needs separate ESC handling
    roomListeners.documentEscape = (e) => {
      if (e.key !== 'Escape') return;
      const panel = document.getElementById('room-settings-panel');
      if (!panel || panel.classList.contains('hidden')) return;
      // Only close panel if no modal is open on top of it
      if (window.ModalManager && window.ModalManager.stack.length > 0) return;
      closeRoomSettings();
    };
    document.addEventListener('keydown', roomListeners.documentEscape);
    
    // (Create room modal listeners were moved to global init)
    
    // GROUP H: Room tabs
    const tabChat = document.getElementById('room-tab-chat');
    if (tabChat) {
      roomListeners.tabChat = openRoomChat;
      tabChat.addEventListener('click', roomListeners.tabChat);
    }
    
    const tabVoice = document.getElementById('room-tab-voice');
    if (tabVoice) {
      roomListeners.tabVoice = openRoomVoice;
      tabVoice.addEventListener('click', roomListeners.tabVoice);
    }
    
    const tabMedia = document.getElementById('room-tab-media');
    if (tabMedia) {
      roomListeners.tabMedia = openRoomMedia;
      tabMedia.addEventListener('click', roomListeners.tabMedia);
    }
    
    // GROUP I: Voice controls
    const connect = document.getElementById('room-voice-connect-btn');
    if (connect) {
      roomListeners.voiceConnect = handleRoomVoiceConnect;
      connect.addEventListener('click', roomListeners.voiceConnect);
    }
    
    const mic = document.getElementById('room-voice-mic-btn');
    if (mic) {
      roomListeners.voiceMic = handleRoomVoiceMicToggle;
      mic.addEventListener('click', roomListeners.voiceMic);
    }
    
    const sound = document.getElementById('room-voice-sound-btn');
    if (sound) {
      roomListeners.voiceSound = handleRoomVoiceSoundToggle;
      sound.addEventListener('click', roomListeners.voiceSound);
    }
    
    const screen = document.getElementById('room-voice-screen-btn');
    if (screen) {
      roomListeners.voiceScreen = handleRoomVoiceScreenToggle;
      screen.addEventListener('click', roomListeners.voiceScreen);
    }
    
    const voiceLeave = document.getElementById('room-voice-leave-btn');
    if (voiceLeave) {
      roomListeners.voiceLeave = handleRoomVoiceLeave;
      voiceLeave.addEventListener('click', roomListeners.voiceLeave);
    }
    
    // GROUP J: Settings button
    const settingsBtn = document.getElementById('room-settings-btn');
    if (settingsBtn) {
      roomListeners.settingsButton = openRoomSettings;
      settingsBtn.addEventListener('click', roomListeners.settingsButton);
    }
    
    roomListeners._registered = true;
    console.log('[rooms] Listeners registered');
  }

  function destroyRoomListeners() {
    if (!roomListeners._registered) {
      return;
    }
    
    // GROUP A: Navigation scroll
    const nav = document.querySelector('.room-settings-nav');
    if (nav) {
      if (roomListeners.navWheel) {
        nav.removeEventListener('wheel', roomListeners.navWheel);
      }
      if (roomListeners.navScroll) {
        nav.removeEventListener('scroll', roomListeners.navScroll);
      }
      nav.__wrapEl = null;
    }
    
    if (roomListeners.windowResize) {
      window.removeEventListener('resize', roomListeners.windowResize);
    }
    
    const prev = document.getElementById('room-settings-nav-prev');
    if (prev && roomListeners.navPrev) {
      prev.removeEventListener('click', roomListeners.navPrev);
    }
    
    const next = document.getElementById('room-settings-nav-next');
    if (next && roomListeners.navNext) {
      next.removeEventListener('click', roomListeners.navNext);
    }
    
    // GROUP B: Settings modal
    const close = document.getElementById('room-settings-close');
    if (close && roomListeners.settingsClose) {
      close.removeEventListener('click', roomListeners.settingsClose);
    }
    
    const cancel = document.getElementById('room-settings-cancel');
    if (cancel && roomListeners.settingsCancel) {
      cancel.removeEventListener('click', roomListeners.settingsCancel);
    }
    
    const backdrop = document.getElementById('room-settings-backdrop');
    if (backdrop && roomListeners.settingsBackdrop) {
      backdrop.removeEventListener('click', roomListeners.settingsBackdrop);
    }
    
    roomListeners.settingsNavItems.forEach(({ element, handler }) => {
      element.removeEventListener('click', handler);
    });
    roomListeners.settingsNavItems = [];
    
    roomListeners.settingsVibePresets.forEach(({ element, handler }) => {
      element.removeEventListener('click', handler);
    });
    roomListeners.settingsVibePresets = [];
    
    const save = document.getElementById('room-settings-save');
    if (save && roomListeners.settingsSave) {
      save.removeEventListener('click', roomListeners.settingsSave);
    }
    
    const apprSave = document.getElementById('room-settings-appearance-save');
    if (apprSave && roomListeners.settingsAppearanceSave) {
      apprSave.removeEventListener('click', roomListeners.settingsAppearanceSave);
    }
    
    const inviteCreate = document.getElementById('room-settings-invite-create');
    if (inviteCreate && roomListeners.settingsInviteCreate) {
      inviteCreate.removeEventListener('click', roomListeners.settingsInviteCreate);
    }
    
    const inviteCopy = document.getElementById('room-settings-invite-copy');
    if (inviteCopy && roomListeners.settingsInviteCopy) {
      inviteCopy.removeEventListener('click', roomListeners.settingsInviteCopy);
    }
    
    const inviteShortcut = document.getElementById('room-settings-invite-shortcut');
    if (inviteShortcut && roomListeners.settingsInviteShortcut) {
      inviteShortcut.removeEventListener('click', roomListeners.settingsInviteShortcut);
    }
    
    // GROUP C: File inputs
    const iconBtn = document.getElementById('room-settings-icon-btn');
    if (iconBtn && roomListeners.iconButton) {
      iconBtn.removeEventListener('click', roomListeners.iconButton);
    }
    
    const iconFile = document.getElementById('room-settings-icon-file');
    if (iconFile && roomListeners.iconFile) {
      iconFile.removeEventListener('change', roomListeners.iconFile);
    }
    
    const iconClear = document.getElementById('room-settings-icon-clear');
    if (iconClear && roomListeners.iconClear) {
      iconClear.removeEventListener('click', roomListeners.iconClear);
    }
    
    const bannerBtn = document.getElementById('room-settings-banner-btn');
    if (bannerBtn && roomListeners.bannerButton) {
      bannerBtn.removeEventListener('click', roomListeners.bannerButton);
    }
    
    const bannerFile = document.getElementById('room-settings-banner-file');
    if (bannerFile && roomListeners.bannerFile) {
      bannerFile.removeEventListener('change', roomListeners.bannerFile);
    }
    
    const bannerClear = document.getElementById('room-settings-banner-clear');
    if (bannerClear && roomListeners.bannerClear) {
      bannerClear.removeEventListener('click', roomListeners.bannerClear);
    }
    
    // GROUP D: Color picker
    const colorEl = document.getElementById('room-settings-color');
    if (colorEl && roomListeners.colorInput) {
      colorEl.removeEventListener('input', roomListeners.colorInput);
    }
    
    // GROUP E: Danger zone
    const leaveBtn = document.getElementById('room-settings-leave');
    if (leaveBtn && roomListeners.leaveButton) {
      leaveBtn.removeEventListener('click', roomListeners.leaveButton);
    }
    
    const deleteBtn = document.getElementById('room-settings-delete');
    if (deleteBtn && roomListeners.deleteButton) {
      deleteBtn.removeEventListener('click', roomListeners.deleteButton);
    }
    
    // GROUP F: Global escape key
    if (roomListeners.documentEscape) {
      document.removeEventListener('keydown', roomListeners.documentEscape);
    }
    
    // (Create room modal listeners were moved to global init)
    
    // GROUP H: Room tabs
    const tabChat = document.getElementById('room-tab-chat');
    if (tabChat && roomListeners.tabChat) {
      tabChat.removeEventListener('click', roomListeners.tabChat);
    }
    
    const tabVoice = document.getElementById('room-tab-voice');
    if (tabVoice && roomListeners.tabVoice) {
      tabVoice.removeEventListener('click', roomListeners.tabVoice);
    }
    
    const tabMedia = document.getElementById('room-tab-media');
    if (tabMedia && roomListeners.tabMedia) {
      tabMedia.removeEventListener('click', roomListeners.tabMedia);
    }
    
    // GROUP I: Voice controls
    const connect = document.getElementById('room-voice-connect-btn');
    if (connect && roomListeners.voiceConnect) {
      connect.removeEventListener('click', roomListeners.voiceConnect);
    }
    
    const mic = document.getElementById('room-voice-mic-btn');
    if (mic && roomListeners.voiceMic) {
      mic.removeEventListener('click', roomListeners.voiceMic);
    }
    
    const sound = document.getElementById('room-voice-sound-btn');
    if (sound && roomListeners.voiceSound) {
      sound.removeEventListener('click', roomListeners.voiceSound);
    }
    
    const screen = document.getElementById('room-voice-screen-btn');
    if (screen && roomListeners.voiceScreen) {
      screen.removeEventListener('click', roomListeners.voiceScreen);
    }
    
    const voiceLeave = document.getElementById('room-voice-leave-btn');
    if (voiceLeave && roomListeners.voiceLeave) {
      voiceLeave.removeEventListener('click', roomListeners.voiceLeave);
    }
    
    // GROUP J: Settings button
    const settingsBtn = document.getElementById('room-settings-btn');
    if (settingsBtn && roomListeners.settingsButton) {
      settingsBtn.removeEventListener('click', roomListeners.settingsButton);
    }
    
    // Clear all references
    Object.keys(roomListeners).forEach(key => {
      if (key !== '_registered') {
        if (Array.isArray(roomListeners[key])) {
          roomListeners[key] = [];
        } else {
          roomListeners[key] = null;
        }
      }
    });
    
    roomListeners._registered = false;
    console.log('[rooms] Listeners destroyed');
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
      // if (typeof showNotification === 'function') {
      //   showNotification('success', `Комната "${name}" создана`);
      // }
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

    const roomState = {
      _id: server._id,
      name: server.name,
      description: server.description || '',
      textChannelId: textCh?._id || null,
      voiceChannelId: voiceCh?._id || null
    };

    if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
      window.NavigationController._commitState({ currentRoom: roomState }, 'enterRoom');
    }

    enterRoomMode();
    
    // Synchronously force clear and deactivate all room overlays
    if (typeof window.forceClearRoomOverlays === 'function') {
      window.forceClearRoomOverlays();
    }
    
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
      console.warn('Текстовый канал комнаты не найден');
      return;
    }
    if (typeof selectChannel !== 'function') return;

    setActiveTab('chat');
    // Прячем альтернативные панели
    setHidden('room-voice-panel', true);
    setHidden('room-media-panel', true);
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
      console.warn('Голосовой канал комнаты не найден');
      return;
    }
    setActiveTab('voice');
    setHidden('room-chat-strip', true);
    const chat = document.getElementById('chat-view');
    if (chat) chat.classList.add('hidden');
    setHidden('room-media-panel', true);
    setHidden('room-voice-panel', false);
    refreshVoiceMeta(room);
    renderVoicePanelMode();
  }

  // Медиа: динамически загружаем контент.
  async function openRoomMedia() {
    setActiveTab('media');
    setHidden('room-chat-strip', true);
    const chat = document.getElementById('chat-view');
    if (chat) chat.classList.add('hidden');
    setHidden('room-voice-panel', true);
    setHidden('room-media-panel', false);

    const emptyState = document.getElementById('room-media-empty');
    const gallery = document.getElementById('room-media-gallery');
    if (!emptyState || !gallery) return;

    // Сбрасываем и показываем состояние загрузки
    gallery.classList.add('hidden');
    emptyState.classList.remove('hidden');
    const titleEl = emptyState.querySelector('.room-media-empty-title');
    const hintEl = emptyState.querySelector('.room-media-empty-hint');
    
    const originalTitle = 'Медиа появятся здесь';
    const originalHint = 'Когда участники начнут делиться файлами, изображениями, видео и голосовыми — всё это окажется на этой вкладке.';
    
    if (titleEl) titleEl.textContent = 'Загрузка медиа...';
    if (hintEl) hintEl.textContent = 'Мы собираем все отправленные файлы...';

    const room = window.currentRoom;
    if (!room || !room.textChannelId) {
      if (titleEl) titleEl.textContent = 'Канал не найден';
      if (hintEl) hintEl.textContent = 'Не удалось найти текстовый канал для этой комнаты.';
      return;
    }

    try {
      let messages = [];
      if (typeof MessagesAPI !== 'undefined' && typeof MessagesAPI.getMessages === 'function') {
        messages = await MessagesAPI.getMessages(room.textChannelId, null, 100);
      } else {
        const baseUrl = window.BASE_URL || 'http://localhost:5555';
        const response = await fetch(`${baseUrl}/api/messages/${room.textChannelId}?limit=100`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
        });
        if (response.ok) {
          messages = await response.json();
        }
      }

      // Собираем вложения
      const mediaItems = [];
      if (!Array.isArray(messages)) messages = [];
      messages.forEach(msg => {
        if (msg.attachments && msg.attachments.length > 0) {
          msg.attachments.forEach(att => {
            mediaItems.push({
              attachment: att,
              author: msg.author,
              createdAt: msg.createdAt,
              messageId: msg._id
            });
          });
        }
      });

      // Восстанавливаем оригинальный текст на случай, если медиа пустое
      if (titleEl) titleEl.textContent = originalTitle;
      if (hintEl) hintEl.textContent = originalHint;

      if (mediaItems.length === 0) {
        emptyState.classList.remove('hidden');
        gallery.classList.add('hidden');
      } else {
        emptyState.classList.add('hidden');
        gallery.classList.remove('hidden');

        gallery.innerHTML = mediaItems.map(item => {
          const att = item.attachment;
          const authorName = item.author?.nickname || item.author?.username || 'Пользователь';
          const authorAvatar = typeof getAvatarUrl === 'function' ? getAvatarUrl(item.author?.avatar, authorName, item.author?._id) : '';
          const dateStr = typeof formatDate === 'function' ? formatDate(item.createdAt) : new Date(item.createdAt).toLocaleDateString();

          const isImage = att.mimetype?.startsWith('image/') || att.type === 'image';
          const isAudio = att.mimetype?.startsWith('audio/') || att.type === 'audio' || att.url?.includes('/audio/');
          const isVideo = (att.mimetype?.startsWith('video/') || att.type === 'video' || att.url?.includes('/video/')) && !isAudio;

          let previewHtml = '';
          const safeUrl = typeof resolveAttachmentUrl === 'function' ? resolveAttachmentUrl(att.url) : att.url;

          if (isImage) {
            previewHtml = `
              <div class="room-media-card-preview image-preview" style="background-image: url('${safeUrl}');" onclick="if (window.XSS && window.XSS.openImageModal) { window.XSS.openImageModal('${safeUrl}'); } else { window.open('${safeUrl}'); }"></div>
            `;
          } else if (isVideo) {
            previewHtml = `
              <div class="room-media-card-preview">
                <video src="${safeUrl}" controls preload="metadata"></video>
              </div>
            `;
          } else if (isAudio) {
            previewHtml = `
              <div class="room-media-card-preview audio-preview">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28" style="margin-bottom: 6px; color: var(--blue, #5865f2);"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                <audio src="${safeUrl}" controls style="width: 100%; height: 28px;"></audio>
              </div>
            `;
          } else {
            const filename = att.filename || att.originalName || 'Файл';
            previewHtml = `
              <a href="${safeUrl}" target="_blank" class="room-media-card-preview file-preview">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="28" height="28" style="margin-bottom: 6px; color: var(--text-muted);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                <span class="file-name" style="font-size: 0.8em; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;" title="${filename}">${filename}</span>
              </a>
            `;
          }

          return `
            <div class="room-media-card">
              ${previewHtml}
              <div class="room-media-card-footer" style="display: flex; align-items: center; gap: 8px; margin-top: auto; padding-top: 4px;">
                <img src="${authorAvatar}" alt="${authorName}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                <div style="display: flex; flex-direction: column; overflow: hidden;">
                  <span style="font-size: 0.8em; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${authorName}">${authorName}</span>
                  <span style="font-size: 0.7em; color: var(--text-muted);">${dateStr}</span>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

    } catch (err) {
      console.error('Error loading room media:', err);
      if (titleEl) titleEl.textContent = 'Ошибка загрузки';
      if (hintEl) hintEl.textContent = 'Не удалось загрузить медиафайлы. Пожалуйста, попробуйте еще раз.';
    }
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
      setHidden('room-media-panel', true);
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
    setHidden('room-media-panel', true);
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
      name.textContent = user.nickname || user.username || 'Гость';
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

    window.ModalManager.open('room-settings-panel', {
      backdropId: 'room-settings-backdrop',
      onClose: () => {
        requestAnimationFrame(updateNavScrollEdges);
      }
    });
  }

  function closeRoomSettings() {
    window.ModalManager.close('room-settings-panel');
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
      // if (typeof showNotification === 'function') {
      //   showNotification('success', 'Настройки комнаты обновлены');
      // }
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
      // if (typeof showNotification === 'function') {
      //   showNotification('success', 'Цвет комнаты обновлён');
      // }
    } catch (e) {
      if (typeof showNotification === 'function') {
        console.error();
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
        console.error();
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
      // if (typeof showNotification === 'function') {
      //   showNotification('success', 'Иконка удалена');
      // }
    } catch (e) {
      if (typeof showNotification === 'function') {
        console.error();
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
      console.error(err);
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
      // if (typeof showNotification === 'function') {
      //   showNotification('success', 'Иконка обновлена');
      // }
    } catch (err2) {
      if (typeof showNotification === 'function') {
        console.error();
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
      console.error(err);
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
      // if (typeof showNotification === 'function') {
      //   showNotification('success', 'Баннер обновлён');
      // }
    } catch (err2) {
      if (typeof showNotification === 'function') {
        console.error();
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
        console.error();
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
      // if (typeof showNotification === 'function') {
      //   showNotification('success', 'Баннер удалён');
      // }
    } catch (e) {
      if (typeof showNotification === 'function') {
        console.error();
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
        console.warn();
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
          // if (typeof showNotification === 'function') {
          //   showNotification('success', 'Вы покинули комнату');
          // }
          await afterRoomGone();
        } catch (e) {
          if (typeof showNotification === 'function') {
            console.error();
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
        console.error();
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
          // if (typeof showNotification === 'function') {
          //   showNotification('success', 'Комната удалена');
          // }
          await afterRoomGone();
        } catch (e) {
          if (typeof showNotification === 'function') {
            console.error();
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
    if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
      window.NavigationController._commitState({
        currentRoom: null,
        currentServer: null,
        currentServerId: null,
        currentChannel: null,
        currentChannelId: null,
        currentVoiceChannel: null
      }, 'afterRoomGone');
    }

    // 4. Убрать активное состояние у удалённой комнаты через единый
    //    navigation state и физически очистить legacy channel sidebar (имя/каналы).
    if (typeof setNavigationState === 'function') {
      setNavigationState({ currentView: 'dm', activeServerId: null, activeDMId: null });
    } else if (typeof applyNavigationState === 'function') {
      applyNavigationState();
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

  function wrapNavigation() {
    if (typeof window.selectServer === 'function' && !window.selectServer.__wrappedForRooms) {
      const original = window.selectServer;
      const wrapped = async function (...args) {
        const result = await original.apply(this, args);
        const s = window.currentServer;
        if (!applyRoomViewFor(s, null)) {
          exitRoomMode();
          if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
            window.NavigationController._commitState({ currentRoom: null }, 'wrapNavigation-selectServer');
          }
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
        if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
          window.NavigationController._commitState({ currentRoom: null }, 'wrapNavigation-showDMView');
        }
        return original.apply(this, args);
      };
      wrapped.__wrappedForRooms = true;
      window.showDMView = wrapped;
    }
  }

  // === Init ===============================================================

  function registerGlobalRoomListeners() {
    const createBtn = document.getElementById('create-room-btn');
    if (createBtn) {
      createBtn.addEventListener('click', showCreateRoomModal);
    }
    
    const submit = document.getElementById('create-room-submit');
    if (submit) {
      submit.addEventListener('click', createRoom);
    }
    
    const createClose = document.getElementById('create-room-close');
    if (createClose) {
      createClose.addEventListener('click', () => {
        if (typeof closeModal === 'function') closeModal('create-room-modal');
      });
    }
    
    const createCancel = document.getElementById('create-room-cancel');
    if (createCancel) {
      createCancel.addEventListener('click', () => {
        if (typeof closeModal === 'function') closeModal('create-room-modal');
      });
    }
  }

  function init() {
    registerGlobalRoomListeners();
    registerRoomListeners();
    wrapNavigation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
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
    updateRoomCardVoiceState,
    // Используется legacy ui.js для закрытия панели после удаления через
    // legacy server-settings-modal (на случай если пользователь оказался там).
    closeSettingsPanel: closeRoomSettings,
    // Дёргается из ui.js для обновления темы при возврате в комнату
    applyRoomThemeFromServer
  };
})();
