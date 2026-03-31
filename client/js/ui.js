/**
 * UI модуль - вспомогательные функции интерфейса
 * Исправлены все ID и имена функций для соответствия HTML
 */

// ===== УВЕДОМЛЕНИЯ =====
function showNotification(type, message, title) {
  const container = document.getElementById('notifications-container');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const titles = { success: 'Успешно', error: 'Ошибка', warning: 'Предупреждение', info: 'Уведомление' };

  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.innerHTML = `
    <div class="notification-icon">${icons[type] || 'ℹ️'}</div>
    <div class="notification-content">
      <div class="notification-title">${title || titles[type]}</div>
      <div class="notification-body">${message}</div>
    </div>
  `;

  container.appendChild(notif);
  setTimeout(() => {
    notif.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => notif.remove(), 300);
  }, 4000);
}

function showMessageNotification(message) {
  if (document.hasFocus()) return;
  showNotification('info', message.content?.substring(0, 80) || 'Новое сообщение', message.author?.username);
}

// ===== МОДАЛЬНЫЕ ОКНА =====
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('hidden');
}

document.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.add('hidden');
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay:not(.hidden)').forEach(m => m.classList.add('hidden'));
    hideContextMenu();
    const emojiPicker = document.getElementById('emoji-picker-container');
    if (emojiPicker) emojiPicker.classList.add('hidden');
  }
});

// ===== АВАТАРЫ И УТИЛИТЫ =====
function getAvatarUrl(avatar, fallbackUsername) {
  if (!avatar || avatar === '' || avatar === 'undefined' || avatar === 'null') {
    return generateDefaultAvatar(fallbackUsername || (window.currentUser ? window.currentUser.username : '?'));
  }
  if (avatar.startsWith('http') || avatar.startsWith('data:')) return avatar;
  const baseUrl = window.BASE_URL || 'http://localhost:5555';
  return `${baseUrl}${avatar}`;
}

function generateDefaultAvatar(username) {
  const colors = ['#5865f2','#eb459e','#3ba55c','#faa61a','#ed4245','#00b0f4'];
  const color = colors[Math.floor(Math.random() * colors.length)];
  const letter = username ? username[0].toUpperCase() : '?';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="${color}"/><text x="20" y="26" text-anchor="middle" fill="white" font-size="18" font-family="Arial" font-weight="bold">${letter}</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

function formatTime(date) {
  const d = new Date(date);
  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(date) {
  const d = new Date(date);
  const now = new Date();
  const diff = now - d;
  if (diff < 86400000) return 'Сегодня в ' + formatTime(d);
  if (diff < 172800000) return 'Вчера в ' + formatTime(d);
  return d.toLocaleDateString('ru-RU') + ' в ' + formatTime(d);
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' Б';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' КБ';
  return (bytes / 1048576).toFixed(1) + ' МБ';
}

function getFileIcon(mimetype) {
  if (mimetype?.startsWith('image/')) return '🖼️';
  if (mimetype?.startsWith('video/')) return '🎬';
  if (mimetype?.startsWith('audio/')) return '🎵';
  if (mimetype?.includes('pdf')) return '📄';
  if (mimetype?.includes('zip') || mimetype?.includes('rar')) return '📦';
  return '📎';
}

function updateUserStatusInDOM(userId, status) {
  document.querySelectorAll(`[data-user-id="${userId}"] .status-dot`).forEach(dot => {
    dot.className = `status-dot ${status}`;
  });
  document.querySelectorAll(`[data-user-id="${userId}"] .user-status-dot`).forEach(dot => {
    dot.className = `user-status-dot ${status}`;
  });
}

// ===== ПАНЕЛЬ ПОЛЬЗОВАТЕЛЯ =====
// updateUserPanel - использует правильный ID 'user-avatar' из HTML
function updateUserPanel() {
  const user = window.currentUser;
  if (!user) return;

  const nameEl = document.getElementById('user-panel-name');
  const tagEl = document.getElementById('user-panel-tag');
  const avatarEl = document.getElementById('user-avatar'); // ID в HTML: user-avatar
  const statusDot = document.getElementById('user-status-dot');

  if (nameEl) {
    nameEl.textContent = user.username || 'Пользователь';
    if (user.role === 'owner') {
      nameEl.innerHTML += ' <span class="owner-badge" title="Создатель" style="font-size:1.1em; margin-left:4px;">👑</span>';
    }
  }
  if (avatarEl) avatarEl.src = getAvatarUrl(user.avatar, user.username);
  if (statusDot) statusDot.className = 'user-status-dot ' + (user.status || 'online');
}

// ===== КНОПКИ УПРАВЛЕНИЯ =====
function toggleMembersList() {
  const sidebar = document.getElementById('members-sidebar');
  const btn = document.getElementById('members-toggle-btn');
  if (sidebar) {
    sidebar.classList.toggle('hidden');
    if (btn) btn.classList.toggle('active', !sidebar.classList.contains('hidden'));
  }
}

// Переключить микрофон
let globalMicMuted = false;
function toggleMic() {
  globalMicMuted = !globalMicMuted;
  const btn = document.getElementById('mic-btn');
  if (btn) {
    btn.classList.toggle('muted', globalMicMuted);
    // Update icon
    const icon = btn.querySelector('svg');
    if (icon) {
      if (globalMicMuted) {
        icon.innerHTML = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/><line x1="1" y1="1" x2="23" y2="23"/>';
      } else {
        icon.innerHTML = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>';
      }
    }
  }
  if (window.voiceManager) {
    window.voiceManager.isMuted = globalMicMuted;
    if (window.voiceManager.localStream) {
      window.voiceManager.localStream.getAudioTracks().forEach(function(t) { t.enabled = !globalMicMuted; });
    }
  }
}

// toggleDeafen - вызывается из HTML onclick="toggleDeafen()"
let globalDeafened = false;
function toggleDeafen() {
  globalDeafened = !globalDeafened;
  const btn = document.getElementById('headset-btn');
  if (btn) {
    btn.classList.toggle('muted', globalDeafened);
    // Update icon
    const icon = btn.querySelector('svg');
    if (icon) {
      if (globalDeafened) {
        icon.innerHTML = '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/><line x1="1" y1="1" x2="23" y2="23"/>';
      } else {
        icon.innerHTML = '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>';
      }
    }
  }
  document.querySelectorAll('#remote-audio-container audio').forEach(function(audio) {
    audio.muted = globalDeafened;
  });
}

// Переключить голосовой микрофон (в голосовом канале)
function toggleVoiceMute() {
  const btn = document.getElementById('voice-mute-btn');
  if (btn) {
    btn.classList.toggle('muted');
    // Update icon
    const icon = btn.querySelector('svg');
    if (icon) {
      const isMuted = btn.classList.contains('muted');
      if (isMuted) {
        icon.innerHTML = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="1" y1="1" x2="23" y2="23"/>';
      } else {
        icon.innerHTML = '<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/>';
      }
    }
  }
  toggleMic();
}

// Переключить голосовой звук (в голосовом канале)
function toggleVoiceDeafen() {
  const btn = document.getElementById('voice-deafen-btn');
  if (btn) {
    btn.classList.toggle('deafened');
    // Update icon
    const icon = btn.querySelector('svg');
    if (icon) {
      const isDeafened = btn.classList.contains('deafened');
      if (isDeafened) {
        icon.innerHTML = '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/><line x1="1" y1="1" x2="23" y2="23"/>';
      } else {
        icon.innerHTML = '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>';
      }
    }
  }
  toggleDeafen();
}

// ===== CREATE CHANNEL MODAL =====
function showCreateChannelModal(type) {
  window._selectedChannelType = type || 'text';
  const prefix = document.getElementById('channel-prefix');
  if (prefix) prefix.textContent = type === 'voice' ? '🔊' : '#';
  
  // Update channel type selector
  document.querySelectorAll('.channel-type-option').forEach(function(opt) {
    opt.classList.remove('active');
    if (opt.dataset.type === type) opt.classList.add('active');
  });
  
  openModal('create-channel-modal');
}

// Create channel
async function createChannel() {
  const name = document.getElementById('channel-name-input') ? document.getElementById('channel-name-input').value.trim() : '';
  const type = window._selectedChannelType || 'text';
  
  if (!name) {
    showNotification('warning', 'Введите название канала');
    return;
  }
  
  if (!window.currentServer) {
    showNotification('error', 'Сервер не выбран');
    return;
  }
  
  try {
    const data = await ChannelsAPI.create(name, type, window.currentServer._id);
    showNotification('success', 'Канал создан');
    closeModal('create-channel-modal');
    
    // Refresh server channels
    const serverData = await ServersAPI.get(window.currentServer._id);
    window.currentServer = serverData.server;
    renderServerChannels(serverData.server);
    
    // Clear input
    const input = document.getElementById('channel-name-input');
    if (input) input.value = '';
    
  } catch (error) {
    showNotification('error', error.message || 'Ошибка создания канала');
  }
}

// ===== PERSONAL PROFILE MODAL =====
function showPersonalProfile() {
  const user = window.currentUser;
  if (!user) return;
  
  // Create personal profile modal if it doesn't exist
  let modal = document.getElementById('personal-profile-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'personal-profile-modal';
    modal.className = 'modal-overlay hidden';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2>Личный профиль</h2>
          <button class="modal-close" onclick="closeModal('personal-profile-modal')">✕</button>
        </div>
        <div class="modal-body">
          <div class="profile-banner">
            <div class="profile-avatar-wrapper" onclick="document.getElementById('personal-avatar-input').click()">
              <img class="profile-avatar" id="personal-avatar" src="" alt="Avatar">
              <div class="avatar-overlay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                <span>Изменить</span>
              </div>
            </div>
            <div>
              <div style="font-size:18px;font-weight:700;color:var(--text-primary)" id="personal-username-display"></div>
              <div style="font-size:13px;color:var(--text-muted)" id="personal-tag-display"></div>
            </div>
          </div>
          <input type="file" id="personal-avatar-input" accept="image/*" style="display:none" onchange="uploadPersonalAvatar(event)">
          <div class="settings-field">
            <label class="settings-label">Имя пользователя</label>
            <input type="text" id="personal-username" class="settings-input" placeholder="username">
          </div>
          <div class="settings-field">
            <label class="settings-label">О себе</label>
            <textarea id="personal-bio" class="settings-textarea" placeholder="Расскажи о себе..." rows="3"></textarea>
          </div>
          <button class="settings-save-btn" onclick="savePersonalProfile()">Сохранить изменения</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
  
  // Populate modal with user data
  const avatarEl = document.getElementById('personal-avatar');
  const usernameEl = document.getElementById('personal-username');
  const bioEl = document.getElementById('personal-bio');
  const usernameDisplay = document.getElementById('personal-username-display');
  const tagDisplay = document.getElementById('personal-tag-display');
  
  if (avatarEl) avatarEl.src = getAvatarUrl(user.avatar);
  if (usernameEl) usernameEl.value = user.username || '';
  if (bioEl) bioEl.value = user.bio || '';
  if (usernameDisplay) {
    usernameDisplay.textContent = user.username || '';
    if (user.role === 'owner') usernameDisplay.innerHTML += ' 👑';
  }
  
  openModal('personal-profile-modal');
}

// Upload personal avatar
async function uploadPersonalAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  try {
    const data = await UsersAPI.uploadAvatar(file);
    window.currentUser.avatar = data.url;
    localStorage.setItem('user', JSON.stringify(window.currentUser));
    
    const personalAvatar = document.getElementById('personal-avatar');
    if (personalAvatar) personalAvatar.src = getAvatarUrl(data.url);
    updateUserPanel();
    showNotification('success', 'Аватар обновлен');
  } catch (error) {
    showNotification('error', error.message || 'Ошибка загрузки аватара');
  }
}

// Save personal profile
async function savePersonalProfile() {
  const username = document.getElementById('personal-username') ? document.getElementById('personal-username').value.trim() : '';
  const bio = document.getElementById('personal-bio') ? document.getElementById('personal-bio').value : '';
  
  if (!username) {
    showNotification('warning', 'Введите имя пользователя');
    return;
  }
  
  try {
    const data = await UsersAPI.updateProfile({ username, bio });
    window.currentUser = Object.assign({}, window.currentUser, (data.user || {}));
    localStorage.setItem('user', JSON.stringify(window.currentUser));
    updateUserPanel();
    
    const usernameDisplay = document.getElementById('personal-username-display');
    if (usernameDisplay) usernameDisplay.textContent = username;
    
    showNotification('success', 'Профиль сохранен');
    closeModal('personal-profile-modal');
  } catch (error) {
    showNotification('error', error.message || 'Ошибка сохранения');
  }
}

// ===== НАСТРОЙКИ ПОЛЬЗОВАТЕЛЯ =====
// showSettings - вызывается из HTML onclick="showSettings()"
function showSettings() {
  const user = window.currentUser;
  if (!user) return;

  const avatarEl = document.getElementById('settings-avatar');
  const usernameEl = document.getElementById('settings-username');
  const bioEl = document.getElementById('settings-bio');
  const statusEl = document.getElementById('settings-status');
  const usernameDisplay = document.getElementById('settings-username-display');
  const tagDisplay = document.getElementById('settings-tag-display');

  if (avatarEl) avatarEl.src = user.avatar ? getAvatarUrl(user.avatar) : generateDefaultAvatar(user.username);
  if (usernameEl) usernameEl.value = user.username || '';
  if (bioEl) bioEl.value = user.bio || '';
  if (statusEl) statusEl.value = user.status || 'online';
  if (usernameDisplay) {
    usernameDisplay.textContent = user.username || '';
    if (user.role === 'owner') usernameDisplay.innerHTML += ' 👑';
  }

  openModal('settings-modal');
}

// Алиас для совместимости
function showUserSettings() {
  showSettings();
}

function showSettingsTab(tab, el) {
  document.querySelectorAll('#settings-modal .settings-tab').forEach(function(t) { t.classList.add('hidden'); });
  document.querySelectorAll('#settings-modal .settings-nav-item').forEach(function(i) { i.classList.remove('active'); });

  const tabEl = document.getElementById('settings-' + tab);
  if (tabEl) tabEl.classList.remove('hidden');
  if (el) el.classList.add('active');
}

async function saveProfile() {
  const username = document.getElementById('settings-username') ? document.getElementById('settings-username').value.trim() : '';
  const bio = document.getElementById('settings-bio') ? document.getElementById('settings-bio').value : '';
  const status = document.getElementById('settings-status') ? document.getElementById('settings-status').value : 'online';

  if (!username) {
    showNotification('warning', 'Введите имя пользователя');
    return;
  }

  try {
    const data = await UsersAPI.updateProfile({ username, bio });
    if (status) await AuthAPI.updateStatus(status);
    window.currentUser = Object.assign({}, window.currentUser, (data.user || {}), { status });
    localStorage.setItem('user', JSON.stringify(window.currentUser));
    updateUserPanel();

    const usernameDisplay = document.getElementById('settings-username-display');
    if (usernameDisplay) usernameDisplay.textContent = username;

    showNotification('success', 'Профиль сохранен');
  } catch (error) {
    showNotification('error', error.message || 'Ошибка сохранения');
  }
}

async function uploadAvatar(event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const data = await UsersAPI.uploadAvatar(file);
    window.currentUser.avatar = data.url;
    localStorage.setItem('user', JSON.stringify(window.currentUser));

    const settingsAvatar = document.getElementById('settings-avatar');
    if (settingsAvatar) settingsAvatar.src = getAvatarUrl(data.url);
    updateUserPanel();
    showNotification('success', 'Аватар обновлен');
  } catch (error) {
    showNotification('error', error.message || 'Ошибка загрузки аватара');
  }
}

// ===== ТЕМА =====
function setTheme(theme, el) {
  document.body.classList.toggle('light-theme', theme === 'light');
  localStorage.setItem('love-theme', theme);
  document.querySelectorAll('.theme-option').forEach(function(opt) { opt.classList.remove('active'); });
  if (el) el.classList.add('active');
}

// ===== НАСТРОЙКИ СЕРВЕРА =====
function showServerSettings() {
  const server = window.currentServer;
  if (!server) return;

  // Используем правильные ID из HTML: server-settings-name, server-settings-desc
  const nameInput = document.getElementById('server-settings-name');
  const descInput = document.getElementById('server-settings-desc');

  if (nameInput) nameInput.value = server.name || '';
  if (descInput) descInput.value = server.description || '';

  // Инвайт-код
  if (server.invites && server.invites.length > 0) {
    const codeEl = document.getElementById('server-invite-code');
    if (codeEl) codeEl.textContent = server.invites[server.invites.length - 1].code || '------';
  } else {
    loadServerInvite(server._id);
  }

  // Участники
  const membersList = document.getElementById('server-members-list');
  if (membersList && server.members) {
    membersList.innerHTML = server.members.map(function(m) {
      const user = m.user || m;
      return '<div class="server-member-item">' +
        '<img class="server-member-avatar" src="' + getAvatarUrl(user.avatar) + '" alt="' + user.username + '">' +
        '<div class="server-member-info">' +
          '<div class="server-member-name">' + user.username + (user.role === 'owner' ? ' <span title="Создатель" style="font-size:1.1em">👑</span>' : '') + '</div>' +
          '<div class="server-member-role">' + (m.roles ? m.roles.join(', ') : 'участник') + '</div>' +
        '</div></div>';
    }).join('');
  }

  openModal('server-settings-modal');
}

async function loadServerInvite(serverId) {
  try {
    const data = await ServersAPI.createInvite(serverId);
    const codeEl = document.getElementById('server-invite-code');
    if (codeEl) codeEl.textContent = data.inviteCode || data.code || '------';
  } catch (e) {
    console.error('Error loading invite:', e);
  }
}

function showServerSettingsTab(tab, el) {
  document.querySelectorAll('#server-settings-modal .settings-tab').forEach(function(t) { t.classList.add('hidden'); });
  document.querySelectorAll('#server-settings-modal .settings-nav-item').forEach(function(i) { i.classList.remove('active'); });

  const tabEl = document.getElementById('server-settings-' + tab);
  if (tabEl) tabEl.classList.remove('hidden');
  if (el) el.classList.add('active');
}

async function saveServerSettings() {
  const nameEl = document.getElementById('server-settings-name');
  const descEl = document.getElementById('server-settings-desc');
  const name = nameEl ? nameEl.value.trim() : '';
  const description = descEl ? descEl.value : '';

  if (!window.currentServer) return;
  if (!name) { showNotification('warning', 'Введите название сервера'); return; }

  try {
    const data = await ServersAPI.update(window.currentServer._id, { name, description });
    window.currentServer = Object.assign({}, window.currentServer, (data.server || { name, description }));
    const headerTitle = document.getElementById('channels-header-title');
    if (headerTitle) headerTitle.textContent = name;
    showNotification('success', 'Настройки сервера сохранены');
    closeModal('server-settings-modal');
    await loadServers();
  } catch (error) {
    showNotification('error', error.message || 'Ошибка сохранения');
  }
}

async function regenerateInviteCode() {
  if (!window.currentServer) return;
  try {
    const data = await ServersAPI.createInvite(window.currentServer._id);
    const codeEl = document.getElementById('server-invite-code');
    if (codeEl) codeEl.textContent = data.inviteCode || data.code || '------';
    showNotification('success', 'Новый код создан');
  } catch (error) {
    showNotification('error', error.message || 'Ошибка');
  }
}

function copyInviteCode() {
  const code = document.getElementById('server-invite-code') ? document.getElementById('server-invite-code').textContent : '';
  if (code && code !== '------') {
    navigator.clipboard.writeText(code).then(function() { showNotification('success', 'Код скопирован'); });
  }
}

async function deleteServer() {
  if (!window.currentServer) return;
  if (!confirm('Вы действительно хотите удалить сервер "' + window.currentServer.name + '"? Это действие необратимо!')) return;

  try {
    await ServersAPI.delete(window.currentServer._id);
    closeModal('server-settings-modal');
    window.currentServer = null;
    showDMView();
    await loadServers();
    showNotification('success', 'Сервер удален');
  } catch (error) {
    showNotification('error', error.message || 'Ошибка удаления сервера');
  }
}

async function leaveServer() {
  if (!window.currentServer) return;
  if (!confirm('Покинуть сервер "' + window.currentServer.name + '"?')) return;

  try {
    await ServersAPI.leave(window.currentServer._id);
    closeModal('server-settings-modal');
    window.currentServer = null;
    showDMView();
    await loadServers();
    showNotification('success', 'Вы покинули сервер');
  } catch (error) {
    showNotification('error', error.message || 'Ошибка');
  }
}

// ===== КОНТЕКСТНОЕ МЕНЮ =====
let contextMenuTarget = null;

function showContextMenu(e, messageId, authorId) {
  e.preventDefault();
  contextMenuTarget = { messageId, authorId };

  const oldMenu = document.querySelector('.context-menu');
  if (oldMenu) oldMenu.remove();

  const isOwn = authorId === (window.currentUser && window.currentUser._id);

  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.innerHTML =
    '<div class="context-menu-item emoji-reactions">' +
      '<div class="quick-reactions">' +
        '<span onclick="addQuickReaction(\'👍\')">👍</span>' +
        '<span onclick="addQuickReaction(\'❤️\')">❤️</span>' +
        '<span onclick="addQuickReaction(\'😂\')">😂</span>' +
        '<span onclick="addQuickReaction(\'😮\')">😮</span>' +
        '<span onclick="addQuickReaction(\'😢\')">😢</span>' +
        '<span onclick="addQuickReaction(\'🔥\')">🔥</span>' +
      '</div>' +
    '</div>' +
    '<div class="context-menu-divider"></div>' +
    '<div class="context-menu-item" onclick="replyToMessage()">Ответить</div>' +
    (isOwn ?
      '<div class="context-menu-item" onclick="editMessage()">Редактировать</div>' +
      '<div class="context-menu-item danger" onclick="deleteMessage()">Удалить</div>'
    : '');

  document.body.appendChild(menu);

  const x = Math.min(e.clientX, window.innerWidth - 200);
  const y = Math.min(e.clientY, window.innerHeight - 250);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';

  setTimeout(function() {
    document.addEventListener('click', hideContextMenu, { once: true });
  }, 10);
}

function hideContextMenu() {
  const menu = document.querySelector('.context-menu');
  if (menu) menu.remove();
  contextMenuTarget = null;
}

function replyToMessage() {
  if (contextMenuTarget && typeof startReply === 'function') {
    startReply(contextMenuTarget.messageId);
  }
  hideContextMenu();
}

function editMessage() {
  if (contextMenuTarget && typeof startEditMessage === 'function') {
    startEditMessage(contextMenuTarget.messageId);
  }
  hideContextMenu();
}

function deleteMessage() {
  if (contextMenuTarget && typeof confirmDeleteMessage === 'function') {
    confirmDeleteMessage(contextMenuTarget.messageId);
  }
  hideContextMenu();
}

function addQuickReaction(emoji) {
  if (contextMenuTarget && typeof socketReactMessage === 'function') {
    socketReactMessage(contextMenuTarget.messageId, emoji);
  }
  hideContextMenu();
}

// ===== ПРОСМОТР ИЗОБРАЖЕНИЙ =====
function openImageViewer(url) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '9999';
  overlay.innerHTML =
    '<div class="image-viewer">' +
      '<button class="image-viewer-close" onclick="this.closest(\'.modal-overlay\').remove()">✕</button>' +
      '<img src="' + url + '" alt="Image">' +
    '</div>';
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });
}

// ===== EMOJI INPUT =====
function insertEmojiIntoInput(emoji) {
  const input = document.getElementById('message-input');
  if (!input) return;

  input.focus();
  
  // Для textarea используем другой подход
  const start = input.selectionStart;
  const end = input.selectionEnd;
  const text = input.value;
  const before = text.substring(0, start);
  const after = text.substring(end);
  
  input.value = before + emoji + after;
  input.selectionStart = input.selectionEnd = start + emoji.length;
  
  // Триггерим событие input для авто-ресайза
  input.dispatchEvent(new Event('input'));
}

// ===== AUTO RESIZE TEXTAREA =====
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}
