// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// init-app.js — Phase 2: Bootstrapping & State Bridge
// Connects Wabi-Sabi UI (script.js mock data) with real backend APIs + Socket.io
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

(function () {
  'use strict';

  // ══════════════════════════════════════════════════════════════════════
  // 1. GLOBAL STATE VARIABLES (expected by socket.js / voice.js / etc.)
  // ══════════════════════════════════════════════════════════════════════

  if (window.currentUser === undefined)            window.currentUser = null;
  if (window.currentChannelId === undefined)        window.currentChannelId = null;
  if (window.currentDMConversation === undefined)   window.currentDMConversation = null;
  if (window.currentDMConversationId === undefined) window.currentDMConversationId = null;
  if (window.currentServer === undefined)           window.currentServer = null;
  if (window.currentServerId === undefined)         window.currentServerId = null;
  if (window.servers === undefined)                 window.servers = [];
  if (window.serverRoles === undefined)             window.serverRoles = [];
  if (window.currentProfileUserId === undefined)    window.currentProfileUserId = null;
  if (window.pendingDMCall === undefined)            window.pendingDMCall = null;

  // Internal ID maps for DM conversations and servers
  const _dmReverseMap  = new Map(); // mockId → { realConvId, channelId, otherUser }
  const _srvReverseMap = new Map(); // mockId → { realServerId, channels: Map }

  window._dmReverseMap  = _dmReverseMap;
  window._srvReverseMap = _srvReverseMap;

  // ══════════════════════════════════════════════════════════════════════
  // 2. UTILITY HELPERS
  // ══════════════════════════════════════════════════════════════════════

  function _formatTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const now  = new Date();
    const diff = Math.floor((now - d) / 86400000);
    if (diff === 0)  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (diff === 1)  return 'вчера';
    if (diff < 7) {
      return ['вс','пн','вт','ср','чт','пт','сб'][d.getDay()];
    }
    return `${d.getDate()} ${['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'][d.getMonth()]}`;
  }

  function _initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[1][0]).toUpperCase()
      : name.slice(0, 2).toUpperCase();
  }

  function _esc(str) {
    if (!str) return '';
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. SOCKET.JS CALLBACK STUBS
  //    These are called by socket.js event handlers. We provide
  //    implementations that work with the new Wabi-Sabi UI.
  // ══════════════════════════════════════════════════════════════════════

  // ── showNotification ──────────────────────────────────────────────────
  if (typeof window.showNotification !== 'function') {
    window.showNotification = function (type, message, title) {
      if (typeof showToast === 'function') {
        showToast(title || (type === 'error' ? 'Ошибка' : 'Информация'), message || type);
        return;
      }
      // Fallback: inline toast
      let container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        Object.assign(container.style, {
          position: 'fixed', bottom: '24px', right: '24px',
          display: 'flex', flexDirection: 'column', gap: '10px', zIndex: '10000',
          pointerEvents: 'none'
        });
        document.body.appendChild(container);
      }
      const toast = document.createElement('div');
      const borderColor = { success: '#4ade80', error: '#f87171', warning: '#fbbf24', info: '#fff' }[type] || '#fff';
      Object.assign(toast.style, {
        background: 'rgba(15,15,15,0.75)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderLeft: `3px solid ${borderColor}`,
        borderRadius: '10px', padding: '14px 18px', minWidth: '240px',
        color: '#f5f5f5', boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        opacity: '0', transform: 'translateY(15px)',
        transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)', pointerEvents: 'auto'
      });
      toast.innerHTML = `<div style="font-size:13px;font-weight:600;margin-bottom:2px">${_esc(title || '')}</div>
                          <div style="font-size:12px;color:#a2a2a2">${_esc(message)}</div>`;
      container.appendChild(toast);
      requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateY(0)'; });
      setTimeout(() => {
        toast.style.opacity = '0'; toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    };
  }

  // ── showAppNotification: всплывающий тост в стиле карточек ленты ────────
  // Использует те же CSS-классы, что и карточки в окне уведомлений
  // (.notification-item / .notif-card-*), чтобы тост выглядел идентично.
  window.showAppNotification = function (opts) {
    opts = opts || {};
    // Контейнер для тостов
    let container = document.getElementById('app-toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'app-toast-container';
      Object.assign(container.style, {
        position: 'fixed', bottom: '24px', right: '24px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        zIndex: '11000', pointerEvents: 'none', width: '320px', maxWidth: '90vw'
      });
      document.body.appendChild(container);
    }

    const title  = opts.title || 'Уведомление';
    const text   = (opts.text || '').toString();
    const avatar = opts.avatar || (title.charAt(0) || '?').toUpperCase();

    // Карточка в стиле превью из настроек (.lvs-notif-preview)
    const HEART_SVG = '<svg viewBox="0 0 24 24" fill="currentColor" style="width:18px;height:18px;"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
    const iconInner = opts.useHeart ? HEART_SVG : _esc(avatar);

    const toast = document.createElement('div');
    toast.className = 'lvs-notif-preview app-toast-card';
    Object.assign(toast.style, {
      width: '100%', boxSizing: 'border-box', marginBottom: '0', position: 'relative',
      opacity: '0', transform: 'translateY(14px) scale(0.97)',
      transition: 'opacity 0.3s cubic-bezier(0.34,1.2,0.5,1), transform 0.3s cubic-bezier(0.34,1.2,0.5,1)',
      pointerEvents: 'auto', cursor: 'pointer',
      boxShadow: '0 10px 30px rgba(0,0,0,0.35)'
    });
    toast.innerHTML = `
      <div class="lvs-notif-icon">${iconInner}</div>
      <div class="lvs-notif-text" style="flex:1;min-width:0;">
        <div class="lvs-notif-title">${_esc(title)}</div>
        <div class="lvs-notif-body" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${_esc(text)}</div>
      </div>
    `;

    let timer;
    function dismiss() {
      clearTimeout(timer);
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px) scale(0.97)';
      setTimeout(() => toast.remove(), 280);
    }

    // Любой тост кликабелен — клик закрывает его (и выполняет действие, если есть).
    toast.addEventListener('click', () => { if (typeof opts.onClick === 'function') opts.onClick(); dismiss(); });

    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0) scale(1)';
    });
    timer = setTimeout(dismiss, 5000);
  };

  // ── showMessageNotification: переопределяем на новый стиль ──────────────
  window.showMessageNotification = function (username, text, targetChannelId) {
    // Не показываем если окно сфокусировано и это активный чат
    const state = window._getActiveState ? window._getActiveState() : {};
    const mockConvs = window._mockConversations || [];
    const activeConv = mockConvs.find(c => c.id === state.activeConversationId);
    const suppressed = document.hasFocus() && activeConv && String(activeConv._channelId) === String(targetChannelId);
    if (suppressed) {
      return;
    }
    window.showAppNotification({
      title: _esc(username || 'Новое сообщение'),
      text: (text || '').toString().slice(0, 80),
      avatar: (username || '?').charAt(0).toUpperCase(),
      onClick: () => {
        // Переходим к нужному диалогу/каналу
        const conv = mockConvs.find(c => String(c._channelId) === String(targetChannelId) || String(c._realId) === String(targetChannelId));
        if (conv && typeof selectConversation === 'function') {
          const navChats = document.getElementById('logo-nav-chats');
          if (navChats) navChats.click();
          selectConversation(conv.id);
        }
      }
    });

    // Нативное уведомление ОС, когда окно не в фокусе (приложение свёрнуто/в фоне).
    // Клик по нему фокусирует окно и переносит к отправителю (см. onNotificationClick).
    if (!document.hasFocus() && window.electronAPI && typeof window.electronAPI.showNotification === 'function') {
      window.electronAPI.showNotification(
        username || 'Новое сообщение',
        (text || '').toString().slice(0, 120),
        { conversationId: targetChannelId }
      );
    }

    if (window.settingsManager && window.settingsManager.get('notif-sound')) {
      if (window.SoundManager) window.SoundManager.play('notification');
    }
  };

  // Переход к отправителю по клику на нативном уведомлении ОС (один раз).
  if (window.electronAPI && typeof window.electronAPI.onNotificationClick === 'function' && !window.__notifClickBound) {
    window.__notifClickBound = true;
    window.electronAPI.onNotificationClick((payload) => {
      const cid = payload && payload.conversationId;
      if (!cid) return;
      const convs = window._mockConversations || [];
      const conv = convs.find(c => String(c._channelId) === String(cid) || String(c._realId) === String(cid));
      if (conv && typeof selectConversation === 'function') {
        const navChats = document.getElementById('logo-nav-chats');
        if (navChats) navChats.click();
        selectConversation(conv.id);
      }
    });
  }

  // ── appendMessage ─────────────────────────────────────────────────────
  if (typeof window.appendMessage !== 'function') {
    window.appendMessage = function (msg) {
      if (!msg) return;
      
      const msgChannelId = msg.channelId || msg.channel;
      const mockConvs = window._mockConversations;
      
      // Find DM conversation
      let dmConv = null;
      if (mockConvs && msgChannelId) {
        dmConv = mockConvs.find(c => String(c._channelId) === String(msgChannelId));
      }
      if (!dmConv && msg.conversationId && mockConvs) {
        dmConv = mockConvs.find(c => String(c._realId) === String(msg.conversationId));
      }

      const state = window._getActiveState ? window._getActiveState() : {};

      // If DM message
      if (dmConv) {
        // Prevent duplicates
        if (msg._id && dmConv.messages.some(m => String(m._id) === String(msg._id))) return;

        const isOwn = String(msg.author?._id || msg.author) === String(window.currentUser?._id);
        
        // Merge with own optimistic pending message if exists
        if (isOwn) {
          const pendingMsg = dmConv.messages.find(m => m.sender === 'own' && m._pending && !m._id);
          if (pendingMsg) {
            pendingMsg._id = msg._id;
            delete pendingMsg._pending;
            pendingMsg.text = msg.content || pendingMsg.text;
            if (msg.attachments && msg.attachments.length) pendingMsg.attachments = msg.attachments;
            if (state.activeView === 'view-chats' && state.activeConversationId === dmConv.id) {
              if (typeof renderChatMessages === 'function') {
                renderChatMessages(dmConv);
              }
            }
            return;
          }
        }

        const msgObj = {
          sender: isOwn ? 'own' : 'partner',
          text: msg.content || '',
          time: _formatTime(msg.createdAt || new Date().toISOString()),
          _id: msg._id,
          attachments: msg.attachments || []
        };
        dmConv.messages.push(msgObj);

        // Update unread state and re-render if active
        if (state.activeView === 'view-chats' && state.activeConversationId === dmConv.id) {
          if (typeof renderChatMessages === 'function') {
            renderChatMessages(dmConv);
          }
        } else {
          dmConv.unread = true;
          if (typeof renderConversationsList === 'function') {
            renderConversationsList('');
          }
        }
        return;
      }

      // Server/channel message
      if (msgChannelId) {
        const mockSrv = window._mockServers;
        if (!mockSrv) return;
        for (const [srvId, srv] of Object.entries(mockSrv)) {
          const ch = srv.channels?.find(c => String(c._realId) === String(msgChannelId));
          if (!ch) continue;

          // Prevent duplicates
          if (msg._id && ch.messages.some(m => String(m._id) === String(msg._id))) return;

          const isOwn = String(msg.author?._id || msg.author) === String(window.currentUser?._id);
          
          // Merge with own optimistic pending message if exists
          if (isOwn) {
            const pendingMsg = ch.messages.find(m => m.sender === 'own' && m._pending && !m._id);
            if (pendingMsg) {
              pendingMsg._id = msg._id;
              delete pendingMsg._pending;
              pendingMsg.text = msg.content || pendingMsg.text;
              if (msg.attachments && msg.attachments.length) pendingMsg.attachments = msg.attachments;
              if (state.activeView === 'view-servers' && state.activeServerId === srvId && String(ch._realId) === String(msgChannelId)) {
                if (typeof renderServerChat === 'function') {
                  renderServerChat();
                }
              }
              break;
            }
          }

          ch.messages.push({
            sender: isOwn ? 'own' : (msg.author?.username || msg.author?.nickname || 'User'),
            text: msg.content || '',
            time: _formatTime(msg.createdAt || new Date().toISOString()),
            _id: msg._id,
            author: msg.author?._id || msg.author,
            authorAvatar: msg.author?.avatar || '',
            attachments: msg.attachments || []
          });

          // If this is the active channel, re-render
          if (state.activeView === 'view-servers' && state.activeServerId === srvId && String(ch._realId) === String(msgChannelId)) {
            if (typeof renderServerChat === 'function') {
              renderServerChat();
            }
          } else {
            ch.unread = true;
            if (typeof renderUnifiedSidebar === 'function') {
              renderUnifiedSidebar();
            }
          }
          break;
        }
      }
    };
  }

  // ── scrollToBottom ────────────────────────────────────────────────────
  if (typeof window.scrollToBottom !== 'function') {
    window.scrollToBottom = function (feedElement) {
      const feed = feedElement || document.getElementById('chat-feed-container') || document.getElementById('server-chat-feed') || document.getElementById('room-chat-feed');
      if (!feed) return;
      
      feed.scrollTop = feed.scrollHeight;
      
      requestAnimationFrame(() => {
        feed.scrollTop = feed.scrollHeight;
      });
      
      setTimeout(() => {
        feed.scrollTop = feed.scrollHeight;
      }, 30);
      
      setTimeout(() => {
        feed.scrollTop = feed.scrollHeight;
      }, 100);
    };
  }

  // ── updateMessageInDOM ────────────────────────────────────────────────
  if (typeof window.updateMessageInDOM !== 'function') {
    window.updateMessageInDOM = function (msg) {
      if (!msg?._id) return;
      
      let found = false;
      const mockConvs = window._mockConversations;
      if (mockConvs) {
        for (const conv of mockConvs) {
          const m = conv.messages?.find(m => String(m._id) === String(msg._id));
          if (m) {
            m.text = msg.content || '';
            found = true;
            const state = window._getActiveState ? window._getActiveState() : {};
            if (state.activeView === 'view-chats' && state.activeConversationId === conv.id) {
              if (typeof renderChatMessages === 'function') {
                renderChatMessages(conv);
              }
            }
            break;
          }
        }
      }
      
      if (!found) {
        const mockSrv = window._mockServers;
        if (mockSrv) {
          for (const srv of Object.values(mockSrv)) {
            for (const ch of srv.channels || []) {
              const m = ch.messages?.find(m => String(m._id) === String(msg._id));
              if (m) {
                m.text = msg.content || '';
                const state = window._getActiveState ? window._getActiveState() : {};
                if (state.activeView === 'view-servers' && state.activeServerId === 'srv-' + srv._realId && state.activeServerChannelId === 'ch-' + ch._realId) {
                  if (typeof renderServerChat === 'function') {
                    renderServerChat();
                  }
                }
                break;
              }
            }
          }
        }
      }
    };
  }

  // ── updateTempMessageInDOM ────────────────────────────────────────────
  if (typeof window.updateTempMessageInDOM !== 'function') {
    window.updateTempMessageInDOM = function (tempId, msg) {
      if (!tempId || !msg?._id) return;
      
      let found = false;
      const mockConvs = window._mockConversations;
      if (mockConvs) {
        for (const conv of mockConvs) {
          const m = conv.messages?.find(m => String(m._tempId) === String(tempId) || (m._pending && !m._id));
          if (m) {
            m._id = msg._id;
            delete m._pending;
            delete m._tempId;
            m.text = msg.content || m.text;
            found = true;
            const state = window._getActiveState ? window._getActiveState() : {};
            if (state.activeView === 'view-chats' && state.activeConversationId === conv.id) {
              if (typeof renderChatMessages === 'function') {
                renderChatMessages(conv);
              }
            }
            break;
          }
        }
      }
      
      if (!found) {
        const mockSrv = window._mockServers;
        if (mockSrv) {
          for (const srv of Object.values(mockSrv)) {
            for (const ch of srv.channels || []) {
              const m = ch.messages?.find(m => String(m._tempId) === String(tempId) || (m._pending && !m._id));
              if (m) {
                m._id = msg._id;
                delete m._pending;
                delete m._tempId;
                m.text = msg.content || m.text;
                const state = window._getActiveState ? window._getActiveState() : {};
                if (state.activeView === 'view-servers' && state.activeServerId === 'srv-' + srv._realId && state.activeServerChannelId === 'ch-' + ch._realId) {
                  if (typeof renderServerChat === 'function') {
                    renderServerChat();
                  }
                }
                break;
              }
            }
          }
        }
      }
    };
  }

  // ── removeMessageFromDOM ──────────────────────────────────────────────
  if (typeof window.removeMessageFromDOM !== 'function') {
    window.removeMessageFromDOM = function (messageId) {
      if (!messageId) return;
      
      let found = false;
      const mockConvs = window._mockConversations;
      if (mockConvs) {
        for (const conv of mockConvs) {
          const idx = conv.messages?.findIndex(m => String(m._id) === String(messageId));
          if (idx !== -1) {
            conv.messages.splice(idx, 1);
            found = true;
            const state = window._getActiveState ? window._getActiveState() : {};
            if (state.activeView === 'view-chats' && state.activeConversationId === conv.id) {
              if (typeof renderChatMessages === 'function') {
                renderChatMessages(conv);
              }
            }
            break;
          }
        }
      }
      
      if (!found) {
        const mockSrv = window._mockServers;
        if (mockSrv) {
          for (const srv of Object.values(mockSrv)) {
            for (const ch of srv.channels || []) {
              const idx = ch.messages?.findIndex(m => String(m._id) === String(messageId));
              if (idx !== -1) {
                ch.messages.splice(idx, 1);
                const state = window._getActiveState ? window._getActiveState() : {};
                if (state.activeView === 'view-servers' && state.activeServerId === 'srv-' + srv._realId && state.activeServerChannelId === 'ch-' + ch._realId) {
                  if (typeof renderServerChat === 'function') {
                    renderServerChat();
                  }
                }
                break;
              }
            }
          }
        }
      }
    };
  }

  // ── updateMessageReactions ────────────────────────────────────────────
  if (typeof window.updateMessageReactions !== 'function') {
    window.updateMessageReactions = function (messageId, reactions) {
      console.log('[init-app] updateMessageReactions:', messageId, reactions?.length || 0);
    };
  }

  // ── showTypingIndicator / hideTypingIndicator ─────────────────────────
  if (typeof window.showTypingIndicator !== 'function') {
    window.showTypingIndicator = function (userId, username) {
      let indicator = document.getElementById('typing-indicator-live');
      if (indicator) return; // already visible
      const feed = document.getElementById('chat-feed-container');
      if (!feed) return;
      indicator = document.createElement('div');
      indicator.id = 'typing-indicator-live';
      indicator.className = 'typing-row';
      indicator.style.cssText = 'display:flex;align-items:center;gap:6px;padding:8px 16px;color:#777;font-size:12px;';
      indicator.innerHTML = `<span>${_esc(username || 'User')} печатает</span>
        <span class="typing-dots" style="display:flex;gap:3px">
          <span style="width:4px;height:4px;border-radius:50%;background:#777;animation:typingBounce 1.2s infinite"></span>
          <span style="width:4px;height:4px;border-radius:50%;background:#777;animation:typingBounce 1.2s 0.2s infinite"></span>
          <span style="width:4px;height:4px;border-radius:50%;background:#777;animation:typingBounce 1.2s 0.4s infinite"></span>
        </span>`;
      feed.appendChild(indicator);
      feed.scrollTop = feed.scrollHeight;
    };
  }

  if (typeof window.hideTypingIndicator !== 'function') {
    window.hideTypingIndicator = function (userId) {
      const indicator = document.getElementById('typing-indicator-live');
      if (indicator) indicator.remove();
    };
  }

  // ── updateUserStatus ──────────────────────────────────────────────────
  if (typeof window.updateUserStatus !== 'function') {
    window.updateUserStatus = function (userId, status) {
      const mockConvs = window._mockConversations;
      if (!mockConvs) return;
      // Update online state in conversations
      mockConvs.forEach(conv => {
        if (conv._otherUser && String(conv._otherUser._id) === String(userId)) {
          conv.online = (status === 'online' || status === 'idle');
          const statusMap = { online: 'в сети', idle: 'отошел', dnd: 'не беспокоить', offline: 'не в сети' };
          conv.status = statusMap[status] || 'не в сети';
        }
      });
      // Update friends list
      const friends = window._getMockFriends ? window._getMockFriends() : [];
      friends.forEach(f => {
        if (f._realId && String(f._realId) === String(userId)) {
          f.online = (status === 'online' || status === 'idle');
          const statusMap = { online: 'в сети', idle: 'отошел', dnd: 'не беспокоить', offline: 'не в сети' };
          f.statusText = statusMap[status] || f.statusText;
        }
      });
      // Re-render if visible
      if (typeof renderConversationsList === 'function') {
        renderConversationsList('');
      }
    };
  }

  // ── showGlobalAnnouncementBanner ──────────────────────────────────────
  if (typeof window.showGlobalAnnouncementBanner !== 'function') {
    window.showGlobalAnnouncementBanner = function (data) {
      window.showNotification('info', data.message || '', 'Объявление');
    };
  }

  // ── hideVoicePanel ────────────────────────────────────────────────────
  if (typeof window.hideVoicePanel !== 'function') {
    window.hideVoicePanel = function () {
      const panel = document.getElementById('voice-panel') || document.getElementById('server-voice-panel');
      if (panel) panel.classList.add('hidden');
    };
  }

  // ── triggerMessageCooldown (антиспам) ─────────────────────────────────
  // Вызывается socket.js при message:rate_limited. Убирает «зависшее»
  // оптимистичное сообщение, кратко блокирует отправку и показывает ОДИН хинт
  // (без каскада тостов на каждое заблокированное сообщение).
  let _cooldownActive = false;
  if (typeof window.triggerMessageCooldown !== 'function') {
    window.triggerMessageCooldown = function (channelId, retryAfter, opts) {
      opts = opts || {};
      const seconds = Math.max(1, Number(retryAfter) || 2);

      // Убираем все «pending» сообщения из активного диалога/канала
      const removePending = (arr) => {
        if (!Array.isArray(arr)) return;
        for (let i = arr.length - 1; i >= 0; i--) {
          if (arr[i] && arr[i]._pending && !arr[i]._id) arr.splice(i, 1);
        }
      };
      const state = window._getActiveState ? window._getActiveState() : {};
      const convs = window._mockConversations || [];
      const activeConv = convs.find(c => c.id === state.activeConversationId);
      if (activeConv) {
        removePending(activeConv.messages);
        if (typeof renderChatMessages === 'function') renderChatMessages(activeConv);
      }

      // Показываем один хинт (если кулдаун не активен сейчас)
      if (!_cooldownActive) {
        _cooldownActive = true;
        const title = opts.warningTitle || 'Слишком быстро';
        const text = opts.warningText || `Подожди ${seconds} сек.`;
        if (typeof showToast === 'function') showToast(title, text);

        // Блокируем кнопки отправки на время кулдауна
        const sendBtns = document.querySelectorAll('#message-form button[type="submit"], #server-message-form button[type="submit"], #room-message-form button[type="submit"]');
        sendBtns.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });
        setTimeout(() => {
          _cooldownActive = false;
          sendBtns.forEach(b => { b.disabled = false; b.style.opacity = ''; });
        }, seconds * 1000);
      }
    };
  }

  // ── Typing animation keyframes ────────────────────────────────────────
  if (!document.getElementById('init-app-keyframes')) {
    const style = document.createElement('style');
    style.id = 'init-app-keyframes';
    style.textContent = `@keyframes typingBounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}`;
    document.head.appendChild(style);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 4. DATA LOADERS
  // ══════════════════════════════════════════════════════════════════════

  // ── Load authenticated user profile ───────────────────────────────────
  async function loadRealUser() {
    try {
      const data = await AuthAPI.getMe();
      const user = data.user || data;
      window.currentUser = user;

      // Update ownProfileData (exposed on window by script.js)
      if (window.ownProfileData) {
        window.ownProfileData.name     = user.nickname || user.username || 'User';
        window.ownProfileData.username = '@' + (user.username || 'user');
        if (user.avatar) {
          window.ownProfileData.avatarUrl     = `url("${user.avatar}")`;
          window.ownProfileData.avatarSize    = 'cover';
          window.ownProfileData.avatarLetters = '';
        } else {
          window.ownProfileData.avatarUrl     = '';
          window.ownProfileData.avatarLetters = _initials(user.nickname || user.username);
        }
        window.ownProfileData.statusText = user.customStatus || '';
        window.ownProfileData.bio        = user.bio || '';
        window.ownProfileData.mood       = user.mood || 'tea';
        window.ownProfileData.listening  = user.listening || (user.music && user.music.title) || '';
        // URL сжатой копии трека на Cloudinary (fallback, если нет локального файла)
        window.ownProfileData.musicCloudUrl = (user.music && user.music.url) || '';
        window.ownProfileData.musicTitle    = (user.music && user.music.title) || '';
      }

      // Заполняем увлечения реальными данными (мутируем по ссылке — массив
      // window.myHobbies используется по ссылке во многих местах script.js)
      if (Array.isArray(window.myHobbies)) {
        window.myHobbies.length = 0;
        (user.hobbies || []).forEach(h => {
          if (h && h.text) window.myHobbies.push({ text: h.text, icon: h.icon || 'star' });
        });
      }

      // Update sidebar avatar letter
      const avatarLetter = document.querySelector('#nav-profile-btn .avatar-letter');
      if (avatarLetter) {
        avatarLetter.textContent = (user.nickname || user.username || 'U').charAt(0).toUpperCase();
      }

      // Refresh vitrine if available
      if (typeof refreshProfileVitrine === 'function') {
        refreshProfileVitrine();
      }

      // Перечитать форму настроек профиля из загруженных данных и
      // зафиксировать снапшот (иначе значения «сбрасываются» к дефолтным,
      // т.к. форма заполняется один раз на DOMContentLoaded до загрузки юзера)
      if (typeof window.__syncProfileForm === 'function') {
        window.__syncProfileForm();
      }

      // Заполнить раздел «Аккаунт» в настройках реальными данными
      if (typeof window.__fillAccountSettings === 'function') {
        window.__fillAccountSettings();
      }

      // Проверяем локальный файл музыки владельца: если он пропал с ПК —
      // убираем музыку из профиля и просим указать заново.
      if (window.ProfileMusic && typeof window.ProfileMusic.ensureOwnMusicValid === 'function') {
        window.ProfileMusic.ensureOwnMusicValid().then(r => {
          if (r && r.removed) {
            if (window.ownProfileData) {
              window.ownProfileData.listening = '';
              window.ownProfileData.musicCloudUrl = '';
              window.ownProfileData.importedAudioUrl = '';
            }
            if (typeof window.showToast === 'function') {
              window.showToast('Музыка', 'Файл трека не найден на ПК. Укажите его заново в настройках профиля.');
            }
          }
        }).catch(() => {});
      }

      console.log('[init-app] User loaded:', user.username);
      return user;
    } catch (err) {
      console.error('[init-app] Failed to load user:', err);
      return null;
    }
  }

  // ── Load DM conversations ─────────────────────────────────────────────
  async function loadRealDMConversations() {
    try {
      const data = await DMAPI.getAll();
      const conversations = data.conversations || data || [];
      const mockArr = window._mockConversations;
      if (!mockArr) { console.warn('[init-app] _mockConversations not exposed'); return; }

      if (!Array.isArray(conversations)) return;

      // Запоминаем уже загруженную историю существующих диалогов,
      // чтобы не затирать её при обновлении списка (например на dm:new_message).
      const prevById = new Map();
      mockArr.forEach(c => { if (c._realId) prevById.set(String(c._realId), c); });

      mockArr.length = 0;
      _dmReverseMap.clear();

      conversations.forEach(conv => {
        const other = conv.participants?.find(p => String(p._id) !== String(window.currentUser?._id));
        if (!other) return;

        const mockId      = 'dm-' + conv._id;
        const displayName = other.nickname || other.username || 'User';
        const lastMsg     = conv.lastMessage;

        const statusMap = { online: 'в сети', idle: 'отошел', dnd: 'не беспокоить' };
        const statusText  = statusMap[other.status] || 'не в сети';

        const prev = prevById.get(String(conv._id));

        const mockConv = {
          id:      mockId,
          name:    displayName,
          avatar:  _initials(displayName),
          avatarUrl: other.avatar || '',   // реальный URL аватара (если есть)
          status:  statusText,
          online:  other.status === 'online' || other.status === 'idle',
          unread:  !!conv.unread,
          messages: prev ? prev.messages : [],
          replies: [],
          // Real backend references
          _realId:    conv._id,
          _channelId: conv.channel || conv.channelId,
          _otherUser: other,
          // Сохраняем флаг загрузки полной истории
          _messagesLoaded: prev ? prev._messagesLoaded : false
        };

        // Если историю ещё не грузили — показываем хотя бы последнее сообщение
        if (!mockConv._messagesLoaded && mockConv.messages.length === 0 && lastMsg) {
          const isOwn = String(lastMsg.author?._id || lastMsg.author) === String(window.currentUser?._id);
          mockConv.messages.push({
            sender: isOwn ? 'own' : 'partner',
            text:   lastMsg.content || '',
            time:   _formatTime(lastMsg.createdAt),
            _id:    lastMsg._id
          });
        }

        mockArr.push(mockConv);
        _dmReverseMap.set(mockId, {
          realConvId: conv._id,
          channelId:  conv.channel || conv.channelId,
          otherUser:  other
        });
      });

      // Re-render conversation list
      if (typeof renderConversationsList === 'function') {
        renderConversationsList('');
      }

      console.log('[init-app] DM conversations loaded:', mockArr.length);
    } catch (err) {
      console.error('[init-app] Failed to load DM conversations:', err);
    }
  }

  // ── Открыть (или создать) ЛС-беседу с пользователем ───────────────────
  // Используется кнопкой «чат» в панели друзей. Раньше клик только искал
  // уже существующую беседу в списке — а после принятия заявки её ещё нет
  // (DM создаётся на сервере при первом открытии). Теперь создаём через
  // DMAPI.openConversation, догружаем список и открываем чат.
  async function openDMWithUser(realUserId, fallbackName, fallbackAvatarUrl) {
    const mockArr = window._mockConversations || [];
    const navChats = document.getElementById('logo-nav-chats');

    let conv = mockArr.find(c => c._otherUser && String(c._otherUser._id) === String(realUserId));

    if (!conv && realUserId) {
      try {
        const res = await DMAPI.openConversation(realUserId);
        const created = (res && res.conversation) || res;
        // Полностью перечитываем список ЛС, чтобы новая беседа корректно
        // легла в _mockConversations и _dmReverseMap.
        await loadRealDMConversations();
        const createdId = created && created._id;
        conv = mockArr.find(c => createdId && String(c._realId) === String(createdId))
            || mockArr.find(c => c._otherUser && String(c._otherUser._id) === String(realUserId));
      } catch (err) {
        console.error('[init-app] openDMWithUser failed:', err);
        if (typeof window.showToast === 'function') {
          window.showToast('Ошибка', 'Не удалось открыть личный чат.');
        }
      }
    }

    // Переходим в раздел чатов
    if (navChats) navChats.click();

    if (conv && typeof window.selectConversation === 'function') {
      window.selectConversation(conv.id);
    } else if (typeof renderConversationsList === 'function') {
      renderConversationsList('');
    }

    return conv;
  }
  window.openDMWithUser = openDMWithUser;

  // ── Load servers and rooms ────────────────────────────────────────────
  async function loadRealServers() {
    try {
      const [serversRes, roomsRes] = await Promise.allSettled([
        ServersAPI.getAll(),
        RoomsAPI.getAll()
      ]);

      const allServers = [];

      if (serversRes.status === 'fulfilled') {
        const srvs = serversRes.value.servers || serversRes.value || [];
        if (Array.isArray(srvs)) allServers.push(...srvs);
      }
      if (roomsRes.status === 'fulfilled') {
        const rooms = roomsRes.value.servers || roomsRes.value || [];
        if (Array.isArray(rooms)) {
          rooms.forEach(r => {
            if (!allServers.find(s => String(s._id) === String(r._id))) {
              allServers.push(r);
            }
          });
        }
      }

      // Store on window for socket.js
      window.servers = allServers;

      // Map to mockServers format
      const mockSrv = window._mockServers;
      if (!mockSrv) { console.warn('[init-app] _mockServers not exposed'); return; }

      // Clear existing mock data
      Object.keys(mockSrv).forEach(k => delete mockSrv[k]);
      _srvReverseMap.clear();

      allServers.forEach(server => {
        const mockId = 'srv-' + server._id;
        const kind   = server.settings?.kind === 'room' ? 'room' : 'server';

        const channels = (server.channels || []).map(ch => ({
          id:   'ch-' + ch._id,
          name: ch.name || 'general',
          type: ch.type || 'text',
          messages: [],
          _realId: ch._id
        }));

        mockSrv[mockId] = {
          name:        server.name || 'Server',
          description: server.description || '',
          channels:    channels,
          _realId:     server._id,
          _kind:       kind,
          _icon:       server.icon,
          _banner:     server.banner,
          _members:    server.members || [],
          _ownerId:    server.owner || server.ownerId,
          _inviteCode: (server.invites && server.invites[0]) ? server.invites[0].code : ''
        };

        const channelMap = new Map();
        channels.forEach(ch => channelMap.set(ch.id, ch._realId));
        _srvReverseMap.set(mockId, { realServerId: server._id, channels: channelMap, kind });
      });

      // Re-render unified sidebar (clear cached cards first)
      const accordion = document.getElementById('spaces-accordion-container');
      if (accordion) accordion.innerHTML = '';
      if (typeof renderUnifiedSidebar === 'function') {
        renderUnifiedSidebar();
      }

      // Update active state to first server/room if any
      if (Object.keys(mockSrv).length > 0 && window._setActiveState) {
        const firstId = Object.keys(mockSrv)[0];
        const firstSrv = mockSrv[firstId];
        const firstTextCh = firstSrv.channels?.find(ch => ch.type === 'text');
        window._setActiveState({
          activeServerId: firstId,
          activeServerChannelId: firstTextCh ? firstTextCh.id : (firstSrv.channels?.[0]?.id || '')
        });
      }

      console.log('[init-app] Servers loaded:', allServers.length);
    } catch (err) {
      console.error('[init-app] Failed to load servers:', err);
    }
  }

  // ── Load friends ──────────────────────────────────────────────────────
  async function loadRealFriends() {
    try {
      const data = await FriendsAPI.getAll();
      const setFriends = window._setMockFriends;
      if (!setFriends) { console.warn('[init-app] _setMockFriends not exposed'); return; }

      const result = [];
      const moodPool = ['smile', 'star', 'music', 'cloud', 'code'];

      // Map accepted friends
      const friends = data.friends || [];
      friends.forEach((f, idx) => {
        const statusMap = { online: 'в сети', idle: 'отошел', dnd: 'не беспокоить' };
        result.push({
          name:       f.nickname || f.username || 'User',
          avatar:     _initials(f.nickname || f.username),
          avatarUrl:  f.avatar || '',
          online:     f.status === 'online' || f.status === 'idle',
          statusText: f.customStatus || statusMap[f.status] || 'не в сети',
          type:       'friend',
          mood:       moodPool[idx % moodPool.length],
          listening:  '',
          hobbies:    [],
          _realId:    f._id
        });
      });

      // Map incoming requests
      const incoming = data.requestsReceived || [];
      incoming.forEach(req => {
        const from = req.from || req;
        result.push({
          name:       from.nickname || from.username || 'User',
          avatar:     _initials(from.nickname || from.username),
          avatarUrl:  from.avatar || '',
          online:     false,
          statusText: 'Входящий запрос',
          type:       'pending',
          direction:  'incoming',
          _realId:    from._id
        });
      });

      // Map outgoing requests
      const outgoing = data.requestsSent || [];
      outgoing.forEach(req => {
        const to = req.to || req;
        result.push({
          name:       to.nickname || to.username || 'User',
          avatar:     _initials(to.nickname || to.username),
          avatarUrl:  to.avatar || '',
          online:     false,
          statusText: 'Исходящий запрос',
          type:       'pending',
          direction:  'outgoing',
          _realId:    to._id
        });
      });

      setFriends(result);

      // Перерисовываем список друзей РЕНДЕРЕРОМ (не loadRealFriends — иначе
      // рекурсия, т.к. window.loadFriends здесь = этот же загрузчик). Рендерер
      // сам берёт активную вкладку и читает обновлённый mockFriends.
      if (typeof window.renderFriendsTab === 'function') window.renderFriendsTab();

      console.log('[init-app] Friends loaded:', result.length);
    } catch (err) {
      console.error('[init-app] Failed to load friends:', err);
    }
  }

  // ── Load full DM message history (on demand) ──────────────────────────
  async function loadDMMessages(conv) {
    if (!conv?._realId || conv._messagesLoaded) return;
    conv._messagesLoaded = true;

    try {
      const data = await DMAPI.getMessages(conv._realId);
      const messages = data.messages || data || [];
      if (!Array.isArray(messages)) return;

      conv.messages = messages.map(msg => {
        const isOwn = String(msg.author?._id || msg.author) === String(window.currentUser?._id);
        return {
          sender: isOwn ? 'own' : 'partner',
          text:   msg.content || '',
          time:   _formatTime(msg.createdAt),
          _id:    msg._id,
          attachments: msg.attachments || []
        };
      });

      // Set the DM channel ID for socket events
      if (data.channelId) {
        conv._channelId = data.channelId;
        const reverse = _dmReverseMap.get(conv.id);
        if (reverse) reverse.channelId = data.channelId;
      }

      // Re-render current chat view
      if (typeof renderChatMessages === 'function') {
        renderChatMessages(conv);
      }
      console.log('[init-app] DM messages loaded for:', conv.name, '(', conv.messages.length, ')');
    } catch (err) {
      console.error('[init-app] Failed to load DM messages:', err);
      conv._messagesLoaded = false; // allow retry
    }
  }

  // ── Load full channel message history (on demand) ─────────────────────
  async function loadChannelMessages(serverId, channelId) {
    const mockSrv = window._mockServers;
    if (!mockSrv?.[serverId]) return;

    const channel = mockSrv[serverId].channels?.find(ch => ch.id === channelId);
    if (!channel || !channel._realId || channel._messagesLoaded) return;
    channel._messagesLoaded = true;

    try {
      const data = await MessagesAPI.getMessages(channel._realId);
      const messages = data.messages || data || [];
      if (!Array.isArray(messages)) return;

      channel.messages = messages.map(msg => ({
        sender: msg.author?.username || msg.author?.nickname || 'User',
        text:   msg.content || '',
        time:   _formatTime(msg.createdAt),
        _id:    msg._id,
        author: msg.author?._id || msg.author,
        authorAvatar: msg.author?.avatar || '',
        attachments: msg.attachments || []
      }));

      // Перерисовываем чат после ленивой загрузки. Для комнаты — её внутренний
      // чат (renderRoomChat не трогает панели); для сервера — серверный.
      // renderServerChat прячет roomPanel и показывает chatPanel, поэтому для
      // активной комнаты его звать нельзя — иначе чат перекроет комнату.
      const isRoom = mockSrv[serverId]._kind === 'room' || mockSrv[serverId].kind === 'room';
      if (isRoom) {
        if (typeof renderRoomChat === 'function') renderRoomChat();
      } else if (typeof renderServerChat === 'function') {
        renderServerChat();
      }
      console.log('[init-app] Channel messages loaded:', channel.name, '(', channel.messages.length, ')');
    } catch (err) {
      console.error('[init-app] Failed to load channel messages:', err);
      channel._messagesLoaded = false; // allow retry
    }
  }

  // ── Уведомления: маппинг серверного формата в формат ленты UI ─────────
  let _notifIdCounter = 1;

  function _mapServerNotification(n) {
    const rawName = n.actorName || 'Уведомление';
    const avatar = rawName.charAt(0).toUpperCase();
    const base = {
      id: _notifIdCounter++,
      _realId: n._id,
      actorId: n.actor,
      name: _esc(rawName),
      avatar: _esc(avatar),
      text: _esc(n.preview || ''),
      time: _formatTime(n.createdAt),
      unread: !n.read
    };
    switch (n.type) {
      case 'mention':
        return Object.assign(base, {
          type: 'mention',
          groupName: _esc(n.serverName || 'Сервер'),
          groupAvatar: _esc((n.serverName || 'S').charAt(0).toUpperCase()),
          senderAvatar: _esc(avatar),
          serverId: n.serverId ? ('srv-' + n.serverId) : ''
        });
      case 'new_dm':
        return Object.assign(base, {
          type: 'dm',
          convId: n.conversationId ? ('dm-' + n.conversationId) : ''
        });
      case 'friend_request':
        return Object.assign(base, { type: 'request', isFriend: false, convId: '' });
      case 'missed_call':
        return Object.assign(base, { type: 'system_call' });
      case 'friend_accepted':
      case 'system':
      default:
        return Object.assign(base, { type: 'system_joined' });
    }
  }
  window._mapServerNotification = _mapServerNotification;

  async function loadRealNotifications() {
    try {
      const data = await NotificationsAPI.getAll();
      const list = (data.notifications || []).map(_mapServerNotification);
      if (typeof window._applyServerNotifications === 'function') {
        window._applyServerNotifications(list);
      }
      console.log('[init-app] Notifications loaded:', list.length);
    } catch (err) {
      console.error('[init-app] Failed to load notifications:', err);
    }
  }
  window.loadRealNotifications = loadRealNotifications;

  // Expose loaders on window for socket.js references
  window.loadDMConversations = loadRealDMConversations;
  window.loadFriendsFromAPI  = loadRealFriends;
  // socket.js зовёт window.loadFriends при friend:request_received/accepted
  window.loadFriends         = loadRealFriends;

  // ── On-demand hooks (called from script.js patches) ───────────────────
  window._onConversationSelected = function (id, conv) {
    if (!conv || !conv._realId) return;

    // Always update currentDMConversation state for socket.js when selected
    const reverse = _dmReverseMap.get(id);
    if (reverse) {
      window.currentDMConversationId = reverse.realConvId;
      window.currentDMConversation   = { _id: reverse.realConvId, channelId: reverse.channelId };
      window.currentChannelId        = reverse.channelId;
    }

    if (!conv._messagesLoaded) {
      loadDMMessages(conv);
    }
  };

  window._onServerChatRendered = function (serverId, channelId) {
    // Load real messages for the channel
    loadChannelMessages(serverId, channelId);

    // Set currentServer state for socket.js
    const reverse = _srvReverseMap.get(serverId);
    if (reverse) {
      window.currentServerId = reverse.realServerId;
      window.currentServer   = window.servers?.find(s => String(s._id) === String(reverse.realServerId)) || null;

      const mockSrv = window._mockServers;
      if (mockSrv?.[serverId]) {
        const ch = mockSrv[serverId].channels?.find(c => c.id === channelId);
        if (ch?._realId) {
          window.currentChannelId = ch._realId;
        }
      }
    }
  };

  // ══════════════════════════════════════════════════════════════════════
  // 5. DM MESSAGE SENDING BRIDGE
  //    Intercepts form submits to send via real socket when applicable
  // ══════════════════════════════════════════════════════════════════════

  window._sendRealDMMessage = function (conv, text, attachments) {
    if (!conv?._channelId || !window.socket) return false;

    // Emit via socket. attachments — массив объектов вложений (image/file/video/audio).
    const tempId = 'temp-' + Date.now();
    const payload = { channelId: conv._channelId, content: text || '', tempId };
    if (attachments && attachments.length) payload.attachments = attachments;
    window.socket.emit('message:send', payload);

    return true; // signal that message was sent via real socket
  };

  window._sendRealChannelMessage = function (channelRealId, text, attachments) {
    if (!channelRealId || !window.socket) return false;

    const tempId = 'temp-' + Date.now();
    const payload = { channelId: channelRealId, content: text || '', tempId };
    if (attachments && attachments.length) payload.attachments = attachments;
    window.socket.emit('message:send', payload);

    return true;
  };


  // ══════════════════════════════════════════════════════════════════════
  // 6. MAIN initApp()
  // ══════════════════════════════════════════════════════════════════════

  window.initApp = async function () {
    console.log('[init-app] ═══ Bootstrapping application ═══');

    // Detect mobile
    const isMobile = window.innerWidth <= 768;
    window._isMobile = isMobile;

    // 1. Load user profile (required — everything depends on currentUser)
    const user = await loadRealUser();
    if (!user) {
      console.error('[init-app] Cannot bootstrap without authenticated user');
      if (typeof window.showNotification === 'function') {
        window.showNotification('error', 'Не удалось загрузить профиль. Попробуйте перезайти.', 'Ошибка');
      }
      return;
    }

    // 2. Load data in parallel
    const results = await Promise.allSettled([
      loadRealDMConversations(),
      loadRealServers(),
      loadRealFriends(),
      loadRealNotifications()
    ]);

    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        const names = ['DM conversations', 'Servers', 'Friends', 'Notifications'];
        console.error(`[init-app] ${names[i]} failed:`, r.reason);
      }
    });

    // 3. Auto-select first conversation on desktop
    if (!isMobile) {
      const mockConvs = window._mockConversations;
      if (mockConvs && mockConvs.length > 0 && typeof selectConversation === 'function') {
        selectConversation(mockConvs[0].id);
      }
    }

    // 4. Connect socket
    if (typeof initSocket === 'function') {
      try {
        await initSocket();
        console.log('[init-app] Socket connected');

        // Лента уведомлений в реальном времени
        if (window.socket) {
          window.socket.on('notification:new', (n) => {
            if (!n) return;
            const mapped = _mapServerNotification(n);
            // Добавляем в ленту уведомлений
            if (typeof window._prependNotification === 'function') {
              window._prependNotification(mapped);
            }
            // Показываем тост для уведомлений кроме DM-сообщений (те идут через showMessageNotification)
            if (n.type !== 'new_dm' && typeof window.showAppNotification === 'function') {
              const titles = {
                mention: 'Упоминание',
                friend_request: 'Запрос в друзья',
                friend_accepted: 'Запрос принят',
                missed_call: 'Пропущенный звонок'
              };
              window.showAppNotification({
                title: titles[n.type] || 'Уведомление',
                text: n.preview || '',
                avatar: (n.actorName || '?').charAt(0).toUpperCase(),
                onClick: () => {
                  // Переходим в нужный раздел
                  if (n.type === 'friend_request' || n.type === 'friend_accepted') {
                    const btn = document.querySelector('[data-target="view-contacts"]');
                    if (btn) btn.click();
                  } else {
                    const navNotif = document.querySelector('[data-target="view-notifications"]');
                    if (navNotif) navNotif.click();
                  }
                }
              });
            }
          });
        }

        // Join all server rooms
        if (window.servers && Array.isArray(window.servers) && typeof window.socketJoinServer === 'function') {
          window.servers.forEach(s => {
            window.socketJoinServer(s._id);
          });
        }

        // Subscribe to DM channels
        if (window.socket && window._mockConversations) {
          window._mockConversations.forEach(conv => {
            if (conv._channelId) {
              window.socket.emit('channel:join', conv._channelId);
            }
          });
        }
      } catch (err) {
        console.error('[init-app] Socket connection failed:', err);
        if (typeof window.showNotification === 'function') {
          window.showNotification('warning', 'Подключение к серверу не установлено. Некоторые функции недоступны.', 'Внимание');
        }
      }
    }

    // 5. Mobile adjustments
    if (isMobile) {
      const appContainer = document.querySelector('.app-container');
      if (appContainer) {
        appContainer.classList.remove('sidebar-collapsed');
      }
      // Move toast container above mobile nav
      const toastContainer = document.getElementById('toast-container');
      if (toastContainer) {
        toastContainer.style.bottom = '80px';
      }
    }

    console.log('[init-app] ═══ Bootstrap complete ═══');
  };

  // ══════════════════════════════════════════════════════════════════════
  // 7. REAL-TIME VOICE & NOTIFICATION INTEGRATION BRIDGES
  // ══════════════════════════════════════════════════════════════════════

  // ── Voice UI panels ───────────────────────────────────────────────────
  const originalShowVoicePanel = window.showVoicePanel;
  window.showVoicePanel = function (channelName, serverName) {
    const activeServer = (typeof mockServers !== 'undefined' && typeof activeServerId !== 'undefined') ? mockServers[activeServerId] : null;
    const isRoom = activeServer && (activeServer._kind === 'room' || activeServer.kind === 'room');

    if (isRoom) {
      // If we are in a room, don't show the full server voice panel.
      // Instead, just ensure the room voice preconnect is hidden and connected bar is shown.
      const preconnect = document.getElementById('room-voice-preconnect');
      const connectedBar = document.getElementById('room-voice-connected-bar');
      if (preconnect) preconnect.classList.add('hidden');
      if (connectedBar) connectedBar.classList.remove('hidden');
      if (typeof roomVoiceConnected !== 'undefined') {
        roomVoiceConnected = activeServerId;
      }
      if (typeof syncRoomBtns === 'function') syncRoomBtns();
    } else {
      // Standard server voice channel UI
      if (typeof showServerVoice === 'function') {
        showServerVoice(channelName);
        // Disable local simulation timers to keep WebRTC voice clean
        if (window.voiceSimTimer1) { clearTimeout(window.voiceSimTimer1); window.voiceSimTimer1 = null; }
        if (window.voiceSimTimer2) { clearTimeout(window.voiceSimTimer2); window.voiceSimTimer2 = null; }
      }
      if (typeof originalShowVoicePanel === 'function') {
        originalShowVoicePanel(channelName, serverName);
      }
    }
  };

  const originalHideVoicePanel = window.hideVoicePanel;
  window.hideVoicePanel = function () {
    if (typeof originalHideVoicePanel === 'function') {
      originalHideVoicePanel();
    }
    
    const activeServer = (typeof mockServers !== 'undefined' && typeof activeServerId !== 'undefined') ? mockServers[activeServerId] : null;
    const isRoom = activeServer && (activeServer._kind === 'room' || activeServer.kind === 'room');

    const voicePanel = document.getElementById("server-voice-panel");
    const chatPanel = document.getElementById("server-chat-panel");
    if (voicePanel) voicePanel.classList.add("hidden");
    
    if (!isRoom) {
      if (chatPanel) chatPanel.classList.remove("hidden");
    }

    // Also reset room voice preconnect state
    const preconnect = document.getElementById('room-voice-preconnect');
    const connectedBar = document.getElementById('room-voice-connected-bar');
    if (preconnect) preconnect.classList.remove('hidden');
    if (connectedBar) connectedBar.classList.add('hidden');
    if (typeof roomVoiceConnected !== 'undefined') {
      roomVoiceConnected = false;
    }
  };

  // ── Voice Members State mapping ───────────────────────────────────────
  const originalUpdateVoiceChannelMembersUI = window.updateVoiceChannelMembersUI;
  window.updateVoiceChannelMembersUI = function (channelId, members) {
    if (typeof originalUpdateVoiceChannelMembersUI === 'function') {
      originalUpdateVoiceChannelMembersUI(channelId, members);
    }
    
    // Map backend WebRTC members into window.voiceMembers
    const mapped = (members || []).map(m => {
      const name = m.nickname || m.username || 'User';
      const isOwn = String(m.userId) === String(window.currentUser?._id);
      return {
        name: name,
        avatar: (m.avatarLetters || _initials(name)).slice(0, 2),
        avatarUrl: m.avatar || '',
        speaking: !!m.speaking,
        // Статус стримов берём из состояния сервера (screenSharing/cameraOn),
        // не полагаясь только на факт прилёта webrtc-трека.
        hasCam: !!(m.hasCam || m.cameraOn),
        hasShare: !!(m.hasShare || m.screenSharing),
        isOwn: isOwn,
        micActive: !m.muted,
        soundActive: !m.deafened,
        userId: m.userId,
        socketId: m.socketId
      };
    });

    if (typeof voiceMembers !== 'undefined') {
      voiceMembers = mapped;
    }
    window.voiceMembers = mapped;

    if (typeof renderVoiceChannel === 'function') {
      renderVoiceChannel();
    }
  };

  // ── Speaking and User Voice state indicators ──────────────────────────
  const originalUpdateSpeakingIndicator = window.updateSpeakingIndicator;
  window.updateSpeakingIndicator = function (userId, speaking) {
    // Check if user is muted or deafened
    let isMutedOrDeafened = false;
    let list = window.voiceMembers;
    if (typeof voiceMembers !== 'undefined') {
      list = voiceMembers;
    }
    if (Array.isArray(list)) {
      const member = list.find(m => String(m.userId || m.name) === String(userId));
      if (member) {
        const isMicMuted = member.isOwn ? !voiceState.micActive : !member.micActive;
        const isSoundMuted = member.isOwn ? !voiceState.soundActive : !member.soundActive;
        if (isMicMuted || isSoundMuted) {
          isMutedOrDeafened = true;
        }
      }
    }

    const effectiveSpeaking = isMutedOrDeafened ? false : !!speaking;

    if (typeof originalUpdateSpeakingIndicator === 'function') {
      originalUpdateSpeakingIndicator(userId, effectiveSpeaking);
    }
    
    if (Array.isArray(list)) {
      const member = list.find(m => String(m.userId || m.name) === String(userId));
      if (member) {
        member.speaking = effectiveSpeaking;
        // Direct DOM update instead of full renderVoiceChannel() to prevent video stream resets
        const targetId = member.isOwn ? 'own' : member.name;
        const cards = document.querySelectorAll(`.voice-pcard[data-user-id="${targetId}"]`);
        cards.forEach(card => {
          if (effectiveSpeaking) {
            card.classList.add("speaking");
          } else {
            card.classList.remove("speaking");
          }
        });
      }
    }
  };

  const originalUpdateUserVoiceState = window.updateUserVoiceState;
  window.updateUserVoiceState = function (userId, muted, deafened) {
    if (typeof originalUpdateUserVoiceState === 'function') {
      originalUpdateUserVoiceState(userId, muted, deafened);
    }

    let list = window.voiceMembers;
    if (typeof voiceMembers !== 'undefined') {
      list = voiceMembers;
    }
    if (Array.isArray(list)) {
      const member = list.find(m => String(m.userId || m.name) === String(userId));
      if (member) {
        if (muted !== undefined) member.micActive = !muted;
        if (deafened !== undefined) member.soundActive = !deafened;
        
        // If muted or deafened, force speaking to false
        const isMicMuted = member.isOwn ? !voiceState.micActive : !member.micActive;
        const isSoundMuted = member.isOwn ? !voiceState.soundActive : !member.soundActive;
        if (isMicMuted || isSoundMuted) {
          member.speaking = false;
          if (typeof originalUpdateSpeakingIndicator === 'function') {
            originalUpdateSpeakingIndicator(userId, false);
          }
        }

        const targetId = member.isOwn ? 'own' : member.name;
        const card = document.querySelector(`.voice-pcard[data-user-id="${targetId}"]`);
        if (card) {
          const micBadge = card.querySelector('.voice-status-badge.mic-muted');
          const soundBadge = card.querySelector('.voice-status-badge.sound-muted');
          if (micBadge) micBadge.style.display = isMicMuted ? '' : 'none';
          if (soundBadge) soundBadge.style.display = isSoundMuted ? '' : 'none';
        }
      }
    }
  };

  // ── Global document click listener for voice disconnect ───────────────
  document.addEventListener('click', (e) => {
    const disconnectBtn = e.target.closest('#voice-btn-disconnect, #room-voice-btn-disconnect, #voice-disconnect-btn');
    if (disconnectBtn) {
      if (typeof leaveVoiceChannel === 'function') {
        leaveVoiceChannel();
      }
    }
  });

  // ── Тосты сообщений ───────────────────────────────────────────────────
  // Лента уведомлений теперь приходит из бэкенда (событие notification:new),
  // поэтому здесь оставляем только всплывающие тосты/бейдж, без записи в ленту.
  // ════════════════════════════════════════════════════════════════
  // REAL VOICE + CALL CONTROLS BRIDGE
  // Подключает UI-кнопки mic/cam/screenshare к реальному voiceManager
  // ════════════════════════════════════════════════════════════════
  let _camStream = null;

  async function _startCam() {
    if (_camStream) return _camStream;
    try {
      _camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      return _camStream;
    } catch (e) {
      // Нет камеры или доступ отклонён — возвращаем null (покажем заглушку в UI)
      return null;
    }
  }
  function _stopCam() {
    if (_camStream) {
      _camStream.getTracks().forEach(t => t.stop());
      _camStream = null;
    }
  }

  // ── Mic/Deafen: реальные toggleMute/toggleDeafen ──────────────
  // Оборачиваем оригинальные click-обработчики script.js, добавляя WebRTC-вызов
  document.addEventListener('click', (e) => {
    if (!window.voiceManager) return;
    const vm = window.voiceManager;

    // Слушаем только серверные кнопки. Кнопки комнаты делегируются на них
    // через roomMap (script.js: room-btn.click() → voice-btn.click()), поэтому
    // ловить #room-voice-btn-* здесь нельзя — иначе двойное срабатывание
    // (реальный клик по room-btn + синтетический по voice-btn) отменяет toggle.
    const micBtn = e.target.closest('#voice-btn-mic');
    if (micBtn) {
      // Капча идёт ДО script.js: класс ещё в дотогловом состоянии → целевое = !текущее.
      // toggleMute идемпотентно сам шлёт socketToggleMute — отдельный вызов убран
      // (двойной эмит ломал синхронизацию при спам-кликах).
      const muted = !!micBtn.classList.contains('muted-state');
      if (typeof vm.toggleMute === 'function') vm.toggleMute(!muted);
      return;
    }
  }, true); // capture phase — до оригинальных обработчиков, чтобы WebRTC успел обновиться

  // ── Screenshare в войсе: открываем пикер из screenshare.js ─────
  // bubbling (не capture), чтобы script.js успел переключить класс до нас
  document.addEventListener('click', (e) => {
    // Только серверная кнопка — room-btn делегируется через roomMap (иначе
    // двойное срабатывание: stopScreenShare при ещё не готовом screenStream).
    const shareBtn = e.target.closest('#voice-btn-share');
    if (!shareBtn) return;
    // После клика script.js уже переключил: active-state = демка включена
    const nowActive = shareBtn.classList.contains('active-state');
    if (nowActive && typeof openScreenshareModal === 'function') {
      openScreenshareModal('voice-btn-share');
    } else if (!nowActive && window.voiceManager && typeof window.voiceManager.stopScreenShare === 'function') {
      window.voiceManager.stopScreenShare();
    }
  });

  // ── ЛС-звонок: Mic ─────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#call-btn-mute');
    if (!btn || !window.voiceManager) return;
    const nowMuted = btn.classList.contains('muted-active'); // после toggle script.js
    if (typeof window.voiceManager.toggleMute === 'function') {
      window.voiceManager.toggleMute(nowMuted);
    }
  });

  // ── ЛС-звонок: Screenshare ─────────────────────────────────────
  // bubbling — после script.js, проверяем итоговый класс
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#call-btn-screenshare');
    if (!btn) return;
    // script.js уже переключил screenshare-active
    const nowActive = btn.classList.contains('screenshare-active');
    if (nowActive && typeof openScreenshareModal === 'function') {
      openScreenshareModal('call-btn-screenshare');
    } else if (!nowActive && window.voiceManager && typeof window.voiceManager.stopScreenShare === 'function') {
      window.voiceManager.stopScreenShare();
    }
  });

  // ── ЛС-звонок: Камера ──────────────────────────────────────────
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('#call-btn-video');
    if (!btn || !window.voiceManager) return;
    const vm = window.voiceManager;
    const nowActive = !btn.classList.contains('video-inactive'); // script.js уже переключил
    if (nowActive) {
      const stream = await _startCam();
      const video = document.getElementById('call-local-video');
      if (stream && video) {
        video.srcObject = stream;
        video.play().catch(() => {});
      }
      if (stream) {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && vm.peerConnections) {
          vm.peerConnections.forEach(async (pc) => {
            const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
            if (sender) await sender.replaceTrack(videoTrack);
            else pc.addTrack(videoTrack, stream);
          });
        }
      } else {
        if (typeof showToast === 'function') showToast('Камера', 'Камера недоступна или доступ отклонён');
        // Откатываем UI
        btn.classList.add('video-inactive');
        btn.querySelector('.icon-video-on')?.classList.add('hidden');
        btn.querySelector('.icon-video-off')?.classList.remove('hidden');
      }
    } else {
      _stopCam();
      const video = document.getElementById('call-local-video');
      if (video) video.srcObject = null;
      if (vm.peerConnections) {
        vm.peerConnections.forEach(async (pc) => {
          const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) sender.replaceTrack(null).catch(() => {});
        });
      }
    }
  });

  // Когда звонок завершается — освобождаем камеру
  const _origEndCallFull = window.endCallFull;
  window.endCallFull = function () {
    _stopCam();
    if (typeof _origEndCallFull === 'function') _origEndCallFull();
  };
  const originalShowNotification = window.showNotification;
  window.showNotification = function (type, message, title) {
    if (typeof showToast === 'function') {
      showToast(title || (type === 'error' ? 'Ошибка' : 'Информация'), message || type);
    } else if (typeof originalShowNotification === 'function') {
      originalShowNotification(type, message, title);
    }
  };

  // ── Реалтайм: метаданные сервера/сферы (название/описание/иконка/баннер) ──
  // Приходит по сокету server:updated. Обновляем локальное состояние и UI
  // без перезагрузки приложения.
  function _media(u) {
    if (!u) return '';
    return /^https?:|^data:|^blob:/.test(u) ? u : (window.BASE_URL || '') + u;
  }

  window.applyServerUpdated = function (data) {
    if (!data || !data.serverId) return;
    const realId = String(data.serverId);
    const localId = 'srv-' + realId;
    const map = window._mockServers || (typeof mockServers !== 'undefined' ? mockServers : null);
    const local = map ? map[localId] : null;

    if (local) {
      if (data.name !== undefined) local.name = data.name;
      if (data.description !== undefined) local.description = data.description;
      if (data.icon !== undefined) local._icon = data.icon;
      if (data.banner !== undefined) local._banner = data.banner;
    }
    // Синхронизируем «сырой» объект сервера, которым пользуются другие части UI.
    if (Array.isArray(window.servers)) {
      const raw = window.servers.find(s => String(s._id) === realId);
      if (raw) {
        if (data.name !== undefined) raw.name = data.name;
        if (data.description !== undefined) raw.description = data.description;
        if (data.icon !== undefined) raw.icon = data.icon;
        if (data.banner !== undefined) raw.banner = data.banner;
      }
    }

    if (typeof renderUnifiedSidebar === 'function') renderUnifiedSidebar();

    const isActive = (typeof activeServerId !== 'undefined') && activeServerId === localId;
    if (isActive && local) {
      // Шапка комнаты
      const roomTitle = document.querySelector('#server-room-panel .room-header-title');
      if (roomTitle) roomTitle.textContent = local.name || '';
      const roomIcon = document.querySelector('#server-room-panel .room-header-icon');
      if (roomIcon) {
        if (local._icon) { roomIcon.style.backgroundImage = `url("${_media(local._icon)}")`; roomIcon.classList.add('has-avatar'); }
        else { roomIcon.style.backgroundImage = ''; roomIcon.classList.remove('has-avatar'); }
      }
      // Шапка сферы
      const titleEl = document.getElementById('server-title-display');
      if (titleEl) titleEl.textContent = local.name || '';

      // Превью в открытых настройках (только превью, поля ввода не трогаем).
      const settingsModal = document.getElementById('space-settings-modal');
      if (settingsModal && !settingsModal.classList.contains('hidden')) {
        const avatarPrev = document.getElementById('space-avatar-preview');
        if (avatarPrev) { avatarPrev.style.backgroundImage = local._icon ? `url("${_media(local._icon)}")` : ''; if (local._icon) avatarPrev.textContent = ''; }
        const bannerPrev = document.getElementById('space-banner-preview');
        if (bannerPrev) bannerPrev.style.backgroundImage = local._banner ? `url("${_media(local._banner)}")` : '';
      }
    }
  };

  // Новый участник вошёл в сервер — обновляем счётчик/список (server:member_joined).
  window.applyServerMemberJoined = function (data) {
    if (!data || !data.serverId) return;
    const localId = 'srv-' + String(data.serverId);
    const map = window._mockServers || (typeof mockServers !== 'undefined' ? mockServers : null);
    const local = map ? map[localId] : null;
    if (local && data.member && Array.isArray(local._members)) {
      const exists = local._members.some(m => {
        const uid = m && (m.user && (m.user._id || m.user) || m._id);
        return String(uid) === String(data.member._id);
      });
      if (!exists) local._members.push({ user: data.member });
    }
    const isActive = (typeof activeServerId !== 'undefined') && activeServerId === localId;
    if (isActive && typeof data.memberCount === 'number') {
      const onlineTextEl = document.querySelector('#server-room-panel .room-header-online-text');
      if (onlineTextEl) onlineTextEl.textContent = `${data.memberCount} участников`;
    }
  };

  // ── Карточка приглашения в чате ──
  // Если в тексте сообщения есть инвайт-ссылка (https://loveapp.chat/invite/КОД),
  // под сообщением показываем карточку сервера с кнопкой «Присоединиться».
  const _invitePreviewCache = new Map(); // code -> preview | Promise

  function _esc(s) {
    if (typeof escHTML === 'function') return escHTML(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function _fetchInvitePreview(code) {
    if (_invitePreviewCache.has(code)) return Promise.resolve(_invitePreviewCache.get(code));
    if (typeof ServersAPI === 'undefined' || !ServersAPI.invitePreview) return Promise.resolve(null);
    const p = ServersAPI.invitePreview(code)
      .then(res => { _invitePreviewCache.set(code, res); return res; })
      .catch(() => { _invitePreviewCache.set(code, null); return null; });
    _invitePreviewCache.set(code, p); // временно кладём промис, чтобы не дублировать запрос
    return p;
  }

  window.attachInviteCard = function (bubbleWrap, text) {
    if (!bubbleWrap || !text) return;
    const re = window.INVITE_LINK_REGEX;
    const code = (typeof parseInviteCode === 'function' && re) ? (re.test(text) ? parseInviteCode(text) : null) : null;
    if (!code) return;
    if (bubbleWrap.querySelector('.invite-card')) return; // уже отрисована

    const card = document.createElement('div');
    card.className = 'invite-card is-loading';
    card.innerHTML = '<div class="invite-card-body"><div class="invite-card-info"><div class="invite-card-label">Приглашение</div><div class="invite-card-name">Загрузка…</div></div></div>';
    bubbleWrap.appendChild(card);

    Promise.resolve(_fetchInvitePreview(code)).then(preview => {
      if (!preview || !preview.name) {
        card.classList.remove('is-loading');
        card.innerHTML = '<div class="invite-card-body"><div class="invite-card-info"><div class="invite-card-label">Приглашение</div><div class="invite-card-name">Недействительная ссылка</div></div></div>';
        return;
      }
      const kindLabel = preview.kind === 'room' ? 'комнату' : 'сферу';
      const initial = (preview.name || '?').trim().charAt(0).toUpperCase();
      const bannerHtml = preview.banner
        ? `<div class="invite-card-banner" style="background-image:url('${_media(preview.banner)}')"></div>` : '';
      const avatarHtml = preview.icon
        ? `<div class="invite-card-avatar" style="background-image:url('${_media(preview.icon)}')"></div>`
        : `<div class="invite-card-avatar">${_esc(initial)}</div>`;

      card.classList.remove('is-loading');
      card.classList.toggle('has-banner', !!preview.banner);
      card.innerHTML = `
        ${bannerHtml}
        <div class="invite-card-body">
          ${avatarHtml}
          <div class="invite-card-info">
            <div class="invite-card-label">Приглашение в ${kindLabel}</div>
            <div class="invite-card-name">${_esc(preview.name)}</div>
            <div class="invite-card-meta">${preview.memberCount || 1} участников</div>
          </div>
          <button type="button" class="lvs-btn invite-card-join">Присоединиться</button>
        </div>`;

      const joinBtn = card.querySelector('.invite-card-join');
      if (joinBtn) {
        joinBtn.addEventListener('click', async () => {
          joinBtn.disabled = true;
          joinBtn.textContent = 'Входим…';
          const id = (typeof window.joinSpaceByCode === 'function') ? await window.joinSpaceByCode(code) : null;
          if (id) {
            joinBtn.textContent = 'Открыто';
          } else {
            joinBtn.disabled = false;
            joinBtn.textContent = 'Присоединиться';
          }
        });
      }
    });
  };

  // ── Рендер вложений сообщения (image/video/audio/file) ──
  const _FILE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>';
  const _DL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

  function _attType(att) {
    // Сначала по mimetype, потом по расширению — надёжнее, чем att.type
    // (сервер иногда отдаёт type:'file' для видео/аудио, и тогда плеер не строился).
    const m = (att.mimetype || '').toLowerCase();
    if (m.startsWith('image/')) return 'image';
    if (m.startsWith('video/')) return 'video';
    if (m.startsWith('audio/')) return 'audio';
    const name = String(att.url || att.filename || att.originalName || '').toLowerCase();
    if (/\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/.test(name)) return 'image';
    if (/\.(mp4|mov|mkv|avi|m4v)(\?|$)/.test(name)) return 'video';
    if (/\.(mp3|wav|ogg|m4a|aac|flac|opus|weba|webm)(\?|$)/.test(name)) return 'audio';
    if (att.type && ['image', 'video', 'audio'].includes(att.type)) return att.type;
    return 'file';
  }
  function _bytes(n) {
    n = +n || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  // ── Медиа-плееры: громкость 40%, пауза вне видимости, лайтбокс ──
  const DEFAULT_MEDIA_VOLUME = 0.4;

  // Пауза видео/аудио при уходе из видимости (скролл или выход из чата).
  // Запоминаем позицию видео, чтобы не сбрасывать при возврате.
  const _videoPosStore = new Map(); // url → { currentTime, paused }
  const _mediaIO = (typeof IntersectionObserver !== 'undefined')
    ? new IntersectionObserver((entries) => {
        entries.forEach(en => {
          if (!en.isIntersecting || en.intersectionRatio < 0.2) {
            const m = en.target;
            if ((m.tagName === 'VIDEO' || m.tagName === 'AUDIO') && !m.paused) {
              // Запоминаем позицию перед паузой.
              if (m.tagName === 'VIDEO' && m.src) _videoPosStore.set(m.src, { currentTime: m.currentTime, paused: true });
              m.pause();
            }
          }
        });
      }, { threshold: [0, 0.2] })
    : null;
  function _observeMedia(el) { if (_mediaIO && el) _mediaIO.observe(el); }

  function _fmtT(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  }

  // Корректная длительность для WebM от MediaRecorder: до проигрывания
  // duration приходит Infinity/NaN. Форсим перемоткой в «конец» — браузер
  // дочитывает метаданные и выставляет реальный duration. onReady(dur) — колбэк.
  // useSeekTrick=false для видео: там seek в конец грузил бы весь файл, а у
  // настоящих mp4 длительность и так известна из метаданных.
  function _resolveDuration(media, onReady, useSeekTrick = true) {
    const ok = (d) => isFinite(d) && d > 0;
    if (ok(media.duration)) { onReady(media.duration); return; }
    let done = false;
    const finish = (d) => { if (done) return; done = true; try { media.currentTime = 0; } catch (_) {} onReady(d); };
    const onMeta = () => {
      if (ok(media.duration)) { finish(media.duration); return; }
      if (!useSeekTrick) { finish(0); return; }
      // Трюк: перемотка в заведомо большую позицию заставляет дочитать метаданные.
      const onSeeked = () => {
        media.removeEventListener('seeked', onSeeked);
        finish(isFinite(media.duration) ? media.duration : 0);
      };
      media.addEventListener('seeked', onSeeked);
      try { media.currentTime = 1e7; } catch (_) { finish(0); }
    };
    if (media.readyState >= 1) onMeta();
    else media.addEventListener('loadedmetadata', onMeta, { once: true });
  }

  // Безопасный показ длительности (Infinity/NaN → пусто).
  function _durStr(d) { return (isFinite(d) && d > 0) ? _fmtT(d) : '--:--'; }

  function _bindMediaScrub(timeline, media, getDuration, paint) {
    if (!timeline || !media) return;
    const seek = (clientX) => {
      const d = getDuration();
      if (!d) return;
      const r = timeline.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - r.left) / Math.max(1, r.width)));
      media.currentTime = pct * d;
      if (typeof paint === 'function') paint();
    };

    timeline.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      timeline.classList.add('is-scrubbing');
      try { timeline.setPointerCapture(e.pointerId); } catch (_) {}
      seek(e.clientX);
    });
    timeline.addEventListener('pointermove', (e) => {
      if (!timeline.classList.contains('is-scrubbing')) return;
      e.preventDefault();
      seek(e.clientX);
    });
    const stop = (e) => {
      if (!timeline.classList.contains('is-scrubbing')) return;
      timeline.classList.remove('is-scrubbing');
      try { timeline.releasePointerCapture(e.pointerId); } catch (_) {}
    };
    timeline.addEventListener('pointerup', stop);
    timeline.addEventListener('pointercancel', stop);
    timeline.addEventListener('lostpointercapture', () => timeline.classList.remove('is-scrubbing'));
  }

  const _PLAY_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
  const _PAUSE_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
  const _FS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  const _PIP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="14" rx="2"/><rect x="12" y="11" width="7" height="5" rx="1" fill="currentColor"/></svg>';
  const _VOL_SVG = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 9v6h4l5 5V4L9 9H5z"/></svg>';

  // Кнопка-ссылка «скачать» для медиа.
  function _downloadAnchor(url, name, cls) {
    const a = document.createElement('a');
    a.href = url;
    a.className = cls || '';
    a.title = 'Скачать';
    a.setAttribute('download', name || '');
    a.target = '_blank';
    a.rel = 'noopener';
    a.innerHTML = _DL_SVG;
    return a;
  }

  // Лайтбокс изображения: кнопки зума сверху, колесо мыши, перетаскивание при зуме.
  function openImageLightbox(url) {
    const ov = document.createElement('div');
    ov.className = 'img-lightbox';
    const stage = document.createElement('div');
    stage.className = 'img-lightbox-stage';
    const img = document.createElement('img');
    img.className = 'img-lightbox-img';
    img.src = url;
    img.draggable = false;
    stage.appendChild(img);
    ov.appendChild(stage);

    const bar = document.createElement('div');
    bar.className = 'img-lightbox-bar';
    bar.innerHTML = `
      <button class="ilb-btn ilb-zoom-out" title="Уменьшить">−</button>
      <span class="ilb-zoom-label">100%</span>
      <button class="ilb-btn ilb-zoom-in" title="Увеличить">+</button>
      <button class="ilb-btn ilb-reset" title="Сбросить">⟲</button>
      <button class="ilb-btn ilb-close" title="Закрыть">✕</button>`;
    ov.appendChild(bar);

    let scale = 1, tx = 0, ty = 0, dragging = false, sx = 0, sy = 0;
    const label = bar.querySelector('.ilb-zoom-label');
    // Ограничиваем смещение, чтобы картинка не уезжала за края окна
    // (по краю отмасштабированной картинки vs размера окна).
    const clampPan = () => {
      const w = img.clientWidth * scale, h = img.clientHeight * scale;
      const maxX = Math.max(0, (w - window.innerWidth) / 2);
      const maxY = Math.max(0, (h - window.innerHeight) / 2);
      tx = Math.min(maxX, Math.max(-maxX, tx));
      ty = Math.min(maxY, Math.max(-maxY, ty));
    };
    const apply = () => {
      clampPan();
      img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
      img.style.cursor = scale > 1 ? 'grab' : 'default';
      label.textContent = Math.round(scale * 100) + '%';
    };
    const setScale = (ns) => { scale = Math.min(8, Math.max(0.2, ns)); if (scale <= 1) { tx = 0; ty = 0; } apply(); };

    function onWheel(e) { e.preventDefault(); setScale(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }
    function onDown(e) { if (scale <= 1) return; dragging = true; sx = e.clientX - tx; sy = e.clientY - ty; img.style.cursor = 'grabbing'; e.preventDefault(); }
    function onMove(e) { if (!dragging) return; tx = e.clientX - sx; ty = e.clientY - sy; apply(); }
    function onUp() { dragging = false; img.style.cursor = scale > 1 ? 'grab' : 'default'; }
    function onKey(e) { if (e.key === 'Escape') close(); }
    let closing = false;
    function close() {
      if (closing) return;
      closing = true;
      ov.classList.remove('is-open');           // плавное закрытие
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setTimeout(() => ov.remove(), 200);
    }

    img.addEventListener('wheel', onWheel, { passive: false });
    img.addEventListener('mousedown', onDown);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKey);
    bar.querySelector('.ilb-zoom-in').addEventListener('click', () => setScale(scale * 1.25));
    bar.querySelector('.ilb-zoom-out').addEventListener('click', () => setScale(scale / 1.25));
    bar.querySelector('.ilb-reset').addEventListener('click', () => { scale = 1; tx = 0; ty = 0; apply(); });
    bar.querySelector('.ilb-close').addEventListener('click', close);
    ov.addEventListener('click', (e) => { if (e.target === ov || e.target === stage) close(); });

    apply();
    document.body.appendChild(ov);
    // Плавное появление (fade + лёгкий зум) на следующем кадре.
    requestAnimationFrame(() => ov.classList.add('is-open'));
  }
  window.openImageLightbox = openImageLightbox;

  // Кастомный видеоплеер: play/seek/время/громкость(40%)/фуллскрин/PiP-сворачивание.
  function _buildVideoPlayer(url, name) {
    const wrap = document.createElement('div');
    wrap.className = 'media-video-wrapper';
    const video = document.createElement('video');
    video.src = url; video.playsInline = true; video.preload = 'metadata';
    video.volume = DEFAULT_MEDIA_VOLUME;
    // Восстановить позицию, если видео было приостановлено (а не сброшено).
    const savedPos = _videoPosStore.get(url);
    if (savedPos && savedPos.paused && isFinite(savedPos.currentTime)) {
      video.currentTime = savedPos.currentTime;
      _videoPosStore.delete(url);
    }
    wrap.appendChild(video);

    const bigPlay = document.createElement('button');
    bigPlay.className = 'media-video-play-btn';
    bigPlay.innerHTML = _PLAY_SVG;
    wrap.appendChild(bigPlay);

    const controls = document.createElement('div');
    controls.className = 'media-video-controls';
    controls.innerHTML = `
      <button class="mv-btn mv-play">${_PLAY_SVG}</button>
      <div class="media-video-timeline"><div class="media-video-timeline-fill"></div></div>
      <span class="mv-time">0:00</span>
      <button class="mv-btn mv-vol-btn">${_VOL_SVG}</button>
      <input class="mv-vol" type="range" min="0" max="1" step="0.05" value="${DEFAULT_MEDIA_VOLUME}">
      <button class="mv-btn mv-pip" title="Свернуть в окошко">${_PIP_SVG}</button>
      <button class="mv-btn mv-fs" title="Во весь экран">${_FS_SVG}</button>`;
    wrap.appendChild(controls);

    const playBtn = controls.querySelector('.mv-play');
    const fill = controls.querySelector('.media-video-timeline-fill');
    const timeline = controls.querySelector('.media-video-timeline');
    const timeEl = controls.querySelector('.mv-time');
    const vol = controls.querySelector('.mv-vol');

    let realDur = 0;
    const dur = () => (isFinite(video.duration) && video.duration > 0) ? video.duration : realDur;
    const paint = () => {
      const d = dur();
      fill.style.width = (d ? Math.min(100, video.currentTime / d * 100) : 0) + '%';
      timeEl.textContent = _fmtT(video.currentTime) + ' / ' + _durStr(d);
    };
    _resolveDuration(video, (d) => { realDur = d || 0; paint(); });

    const setUI = () => { playBtn.innerHTML = video.paused ? _PLAY_SVG : _PAUSE_SVG; bigPlay.style.display = video.paused ? 'flex' : 'none'; };
    const toggle = () => { if (video.paused) video.play().catch(() => {}); else video.pause(); };
    bigPlay.addEventListener('click', toggle);
    playBtn.addEventListener('click', toggle);
    video.addEventListener('click', toggle);
    video.addEventListener('play', setUI);
    video.addEventListener('pause', setUI);
    video.addEventListener('timeupdate', paint);
    _bindMediaScrub(timeline, video, dur, paint);
    vol.addEventListener('input', () => { video.muted = false; video.volume = parseFloat(vol.value); });
    controls.querySelector('.mv-vol-btn').addEventListener('click', () => { video.muted = !video.muted; vol.value = video.muted ? 0 : video.volume; });
    controls.querySelector('.mv-fs').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (wrap.requestFullscreen) wrap.requestFullscreen();
    });
    controls.querySelector('.mv-pip').addEventListener('click', async () => {
      try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else if (video.requestPictureInPicture) await video.requestPictureInPicture();
      } catch (_) {}
    });
    // Кнопка скачивания — в конце, чтобы не вытеснять «во весь экран»
    controls.appendChild(_downloadAnchor(url, name, 'mv-btn mv-dl'));
    // Если видео не удалось загрузить — показываем понятную заглушку со скачиванием.
    video.addEventListener('error', () => {
      wrap.classList.add('media-video-error');
      bigPlay.style.display = 'none';
    });
    setUI();
    _observeMedia(video);
    return wrap;
  }

  // Кастомный аудио/музыка плеер: play/seek/время/громкость(40%).
  function _buildAudioPlayer(url, name) {
    const wrap = document.createElement('div');
    wrap.className = 'media-audio-attachment media-audio-player';
    wrap.innerHTML = `
      <button class="ma-play media-audio-icon">${_PLAY_SVG}</button>
      <div class="media-audio-info">
        <div class="ma-timeline"><div class="ma-fill"></div></div>
        <div class="ma-time">0:00</div>
      </div>
      <button class="mv-btn ma-vol-btn">${_VOL_SVG}</button>
      <input class="ma-vol" type="range" min="0" max="1" step="0.05" value="${DEFAULT_MEDIA_VOLUME}">`;
    const audio = document.createElement('audio');
    audio.src = url; audio.preload = 'metadata'; audio.volume = DEFAULT_MEDIA_VOLUME;
    wrap.appendChild(audio);

    const playBtn = wrap.querySelector('.ma-play');
    const fill = wrap.querySelector('.ma-fill');
    const timeline = wrap.querySelector('.ma-timeline');
    const timeEl = wrap.querySelector('.ma-time');
    const vol = wrap.querySelector('.ma-vol');

    let realDur = 0;
    const dur = () => (isFinite(audio.duration) && audio.duration > 0) ? audio.duration : realDur;
    const paint = () => {
      const d = dur();
      fill.style.width = (d ? Math.min(100, audio.currentTime / d * 100) : 0) + '%';
      timeEl.textContent = _fmtT(audio.currentTime) + ' / ' + _durStr(d);
    };
    _resolveDuration(audio, (d) => { realDur = d || 0; paint(); });

    const setUI = () => { playBtn.innerHTML = audio.paused ? _PLAY_SVG : _PAUSE_SVG; };
    playBtn.addEventListener('click', () => { if (audio.paused) audio.play().catch(() => {}); else audio.pause(); });
    audio.addEventListener('play', setUI);
    audio.addEventListener('pause', setUI);
    audio.addEventListener('timeupdate', paint);
    _bindMediaScrub(timeline, audio, dur, paint);
    vol.addEventListener('input', () => { audio.muted = false; audio.volume = parseFloat(vol.value); });
    wrap.querySelector('.ma-vol-btn').addEventListener('click', () => { audio.muted = !audio.muted; vol.value = audio.muted ? 0 : audio.volume; });
    wrap.appendChild(_downloadAnchor(url, name, 'mv-btn ma-dl'));
    setUI();
    _observeMedia(audio);
    return wrap;
  }

  window.renderMessageAttachments = function (bubbleWrap, attachments) {
    if (!bubbleWrap || !attachments || !attachments.length) return;
    if (bubbleWrap.querySelector('.message-attachments')) return;
    const box = document.createElement('div');
    box.className = 'message-attachments';

    // Имя файла без «tmp/служебных»: предпочитаем originalName, затем filename;
    // если выглядит как сгенерированное (tmp..., длинный hex) — даём дружелюбное.
    const niceName = (att) => {
      const cand = att.originalName || att.filename || '';
      if (!cand || /^tmp[-_.]/i.test(cand) || /^[a-f0-9]{16,}$/i.test(cand.replace(/\.[^.]+$/, ''))) {
        const ext = (cand.match(/\.[^.]+$/) || [''])[0];
        return 'Файл' + ext;
      }
      return cand;
    };

    attachments.forEach(att => {
      try {
        if (!att || !att.url) return;
        const url = _media(att.url);
        const type = _attType(att);

        if (type === 'image') {
          const w = document.createElement('div');
          w.className = 'media-image-wrapper';
          const img = document.createElement('img');
          img.src = url; img.loading = 'lazy'; img.alt = att.originalName || '';
          img.style.width = '100%'; img.style.display = 'block'; img.style.cursor = 'zoom-in';
          img.addEventListener('click', () => openImageLightbox(url));
          w.appendChild(img);
          const dl = _downloadAnchor(url, niceName(att), 'media-img-dl');
          dl.addEventListener('click', (ev) => ev.stopPropagation());
          w.appendChild(dl);
          box.appendChild(w);
        } else if (type === 'video') {
          box.appendChild(_buildVideoPlayer(url, niceName(att)));
        } else if (type === 'audio') {
          box.appendChild(_buildAudioPlayer(url, niceName(att)));
        } else {
          const chip = document.createElement('a');
          chip.className = 'media-audio-attachment';
          chip.href = url; chip.target = '_blank'; chip.rel = 'noopener';
          chip.setAttribute('download', niceName(att));
          chip.style.textDecoration = 'none';
          chip.innerHTML = `<div class="media-audio-icon">${_FILE_SVG}</div>
            <div class="media-audio-info">
              <div class="media-audio-name">${_esc(niceName(att))}</div>
              <div class="media-audio-size">${_bytes(att.size)}</div>
            </div>
            <div class="media-download-btn">${_DL_SVG}</div>`;
          box.appendChild(chip);
        }
      } catch (err) {
        console.error('[attachments] render failed:', err, att);
      }
    });

    if (box.children.length) bubbleWrap.appendChild(box);
  };

})();
