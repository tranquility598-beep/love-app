/**
 * App модуль - главная логика приложения
 * Инициализация, загрузка данных, навигация
 */

// Глобальные переменные состояния
window.currentUser = null;
window.currentServer = null;
window.currentChannel = null;
window.currentChannelId = null;
window.currentVoiceChannel = null;
window.currentDMConversation = null;
window.currentView = 'welcome'; // 'welcome' | 'chat' | 'friends' | 'dm'

/**
 * Инициализация приложения при загрузке страницы
 */
document.addEventListener('DOMContentLoaded', async () => {
  // Применяем сохраненную тему (по умолчанию Космос)
  const savedTheme = localStorage.getItem('love-theme') || 'space';
  setTheme(savedTheme);
  
  // Устанавливаем активную кнопку темы в настройках (если настройки есть в DOM)
  const themeOptions = document.querySelectorAll('.theme-option');
  if (themeOptions.length > 0) {
    const themeMap = {
      'dark': 0,
      'light': 1,
      'space': 2,
      'dark-blue': 3,
      'purple': 4,
      'amoled': 5,
      'cyberpunk': 6,
      'green': 7,
      'gradient': 8
    };
    const themeIndex = themeMap[savedTheme] || 0;
    if (themeOptions[themeIndex]) {
      themeOptions[themeIndex].classList.add('active');
    }
  }

  // Инициализация автообновлений
  setupUpdater();

  // Проверяем авторизацию
  const token = localStorage.getItem('token');
  const savedUser = localStorage.getItem('user');

  if (token && savedUser) {
    try {
      window.currentUser = JSON.parse(savedUser);
      // Верифицируем токен на сервере
      const data = await AuthAPI.getMe();
      window.currentUser = data.user;
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // Скрываем экран загрузки сразу
      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.classList.add('hidden');
      }
      
      await initApp();
      return;
    } catch (error) {
      // Проверяем, действительно ли токен недействителен (401)
      if (error.status === 401 || error.status === 403 || (error.message && error.message.includes('не найден'))) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      } else {
        // Скорее всего сервер Render просто "просыпается" или нет сети
        const retryCount = parseInt(sessionStorage.getItem('connectRetries') || '0');
        if (retryCount < 3) {
          sessionStorage.setItem('connectRetries', String(retryCount + 1));
          const loadingText = document.querySelector('.loading-text');
          if (loadingText) {
            loadingText.textContent = 'ПРОБУЖДЕНИЕ СЕРВЕРА... (' + (retryCount + 1) + '/3)';
            loadingText.style.fontSize = '18px';
          }
          setTimeout(() => window.location.reload(), 5000);
          return;
        } else {
          sessionStorage.removeItem('connectRetries');
        }
      }
    }
  }
  
  // Показываем экран загрузки только если нет сохраненной сессии
  setTimeout(() => {
    const loadingScreen = document.getElementById('loading-screen');
    if (loadingScreen) {
      loadingScreen.style.opacity = '0';
      setTimeout(() => loadingScreen.classList.add('hidden'), 500);
    }
  }, 1500);

  showAuthScreen();
});

/**
 * Показать экран авторизации
 */
function showAuthScreen() {
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('register-screen').classList.add('hidden');
  
  // Новые экраны
  const otpScreen = document.getElementById('otp-screen');
  const forgotScreen = document.getElementById('forgot-password-screen');
  const resetScreen = document.getElementById('reset-password-screen');
  if (otpScreen) otpScreen.classList.add('hidden');
  if (forgotScreen) forgotScreen.classList.add('hidden');
  if (resetScreen) resetScreen.classList.add('hidden');
  
  document.getElementById('app').classList.add('hidden');
}

/**
 * Инициализация главного приложения после авторизации
 */
async function initApp() {
  document.getElementById('loading-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('register-screen').classList.add('hidden');
  
  // Скрываем новые экраны авторизации
  const otpScreen = document.getElementById('otp-screen');
  const forgotScreen = document.getElementById('forgot-password-screen');
  const resetScreen = document.getElementById('reset-password-screen');
  if (otpScreen) otpScreen.classList.add('hidden');
  if (forgotScreen) forgotScreen.classList.add('hidden');
  if (resetScreen) resetScreen.classList.add('hidden');

  document.getElementById('app').classList.remove('hidden');

  // Инициализируем Socket.io
  const token = localStorage.getItem('token');
  initSocket(token);

  if (window.founderSystem && window.currentUser) {
    window.founderSystem.checkFounder(window.currentUser);
  }

  // Обновляем панель пользователя
  updateUserPanel();

  // Загружаем серверы
  await loadServers();

  // Загружаем DM диалоги
  await loadDMConversations();

  // Загружаем друзей
  await loadFriends();

  // Показываем DM вид по умолчанию
  showDMView();

  // Настраиваем emoji picker
  setupEmojiPicker();

  // Настраиваем обработчики для поля ввода сообщений
  setupMessageInput();

  console.log('✅ App initialized for user:', window.currentUser?.username);
}

/**
 * Настройка поля ввода сообщений
 */
function setupMessageInput() {
  const messageInput = document.getElementById('message-input');
  if (messageInput) {
    // Обработка нажатий клавиш с capture phase для перехвата Enter
    messageInput.addEventListener('keydown', handleMessageKeydown, true);
    
    // Обработка ввода (индикатор печати)
    messageInput.addEventListener('input', handleMessageInput);
    
    // Автоматическое изменение высоты textarea
    messageInput.addEventListener('input', function() {
      autoResizeTextarea(this);
    });
    
    // Фокус на поле ввода при загрузке
    setTimeout(() => messageInput.focus(), 100);
  }
}

/**
 * Загрузить список серверов
 */
async function loadServers() {
  try {
    const data = await ServersAPI.getAll();
    const servers = data.servers || [];
    
    // Сохраняем серверы в глобальную переменную для доступа из других модулей
    window.servers = servers;
    
    renderServersList(servers);
    
    // Присоединяемся к комнатам сокетов для всех серверов
    servers.forEach(server => {
      socketJoinServer(server._id);
    });
  } catch (error) {
    console.error('Error loading servers:', error);
  }
}

/**
 * Отрендерить список серверов
 */
function renderServersList(servers) {
  const list = document.getElementById('server-list');
  if (!list) return;

  list.innerHTML = servers.map(server => {
    const initials = server.name.substring(0, 2).toUpperCase();
    return `
      <div class="server-icon ${window.currentServer?._id === server._id ? 'active' : ''}"
           data-server-id="${server._id}"
           onclick="selectServer('${server._id}')"
           title="${server.name}">
        ${server.icon
          ? `<img src="${getAvatarUrl(server.icon)}" alt="${server.name}">`
          : `<span style="font-size:14px;font-weight:700">${initials}</span>`
        }
        <div class="server-tooltip">${server.name}</div>
      </div>
    `;
  }).join('');
}

/**
 * Выбрать сервер
 */
async function selectServer(serverId) {
  try {
    const data = await ServersAPI.get(serverId);
    window.currentServer = data.server;
    window.currentServerId = serverId;
    
    // Обновляем сервер в кэше window.servers
    if (window.servers) {
      const index = window.servers.findIndex(s => s._id === serverId);
      if (index !== -1) {
        window.servers[index] = data.server;
      }
    }

    // Обновляем активный сервер в UI
    document.querySelectorAll('.server-icon').forEach(el => {
      el.classList.toggle('active', el.dataset.serverId === serverId);
    });

    // Обновляем кнопку DM
    document.getElementById('dm-btn')?.classList.remove('active');

    // Показываем каналы сервера
    showServerChannels(data.server);

    // Присоединяемся к серверу через сокет
    socketJoinServer(serverId);

  } catch (error) {
    showNotification('error', 'Не удалось загрузить сервер');
  }
}

/**
 * Показать каналы сервера
 */
function showServerChannels(server) {
  const header = document.getElementById('server-header-title');
  const headerBtn = document.getElementById('channels-header-btn');
  const dmList = document.getElementById('dm-list');
  const dmSearch = document.getElementById('dm-search-section');
  const serverChannels = document.getElementById('server-channels-list');
  const dmSidebarView = document.getElementById('dm-sidebar-view');
  const serverSidebarView = document.getElementById('server-sidebar-view');

  if (header) header.textContent = server.name;
  if (headerBtn) headerBtn.style.display = 'flex';
  if (dmList) dmList.classList.add('hidden');
  if (dmSearch) dmSearch.classList.add('hidden');
  if (serverChannels) serverChannels.classList.remove('hidden');
  
  // Переключаем sidebar views
  if (dmSidebarView) dmSidebarView.classList.add('hidden');
  if (serverSidebarView) serverSidebarView.classList.remove('hidden');

  // Показываем/скрываем кнопку удаления в зависимости от прав
  const deleteBtn = document.getElementById('delete-server-btn');
  if (deleteBtn) {
    const isOwner = server.owner === window.currentUser?._id || 
                    server.owner?._id === window.currentUser?._id;
    deleteBtn.style.display = isOwner ? 'flex' : 'none';
  }

  // Рендерим каналы
  renderServerChannels(server);

  // Показываем приветственный экран
  showWelcomeView();
}

/**
 * Отрендерить каналы сервера
 */
/**
 * Отрендерить каналы сервера
 */
function renderServerChannels(server) {
  const container = document.getElementById('server-channels-list');
  if (!container) return;

  const channels = server.channels || [];
  const serverCategories = server.categories || [];
  
  // Группировка каналов по категориям
  const grouped = {};
  const normalizedMap = {}; // Исправляем дубликаты (case-insensitive)

  const stdText = 'Текстовые каналы';
  const stdVoice = 'Голосовые каналы';

  // Инициализируем стандартными (в нужном порядке)
  [stdText, stdVoice].forEach(name => {
    const uc = name.toUpperCase();
    normalizedMap[uc] = name;
    grouped[name] = [];
  });

  // Добавляем категории сервера, если они еще не в списке
  serverCategories.forEach(cat => {
    const uc = cat.name.toUpperCase();
    if (!normalizedMap[uc]) {
      normalizedMap[uc] = cat.name;
      grouped[cat.name] = [];
    }
  });

  channels.forEach(ch => {
    let catName = ch.category;
    if (!catName) {
      catName = ch.type === 'voice' ? stdVoice : stdText;
    }
    
    const uc = catName.toUpperCase();
    const actualKey = normalizedMap[uc] || catName;
    if (!grouped[actualKey]) grouped[actualKey] = [];
    grouped[actualKey].push(ch);
  });

  // Рендерим по категориям
  container.innerHTML = Object.keys(grouped).map(catName => {
    const catChannels = grouped[catName];
    // Сортировка: текст выше голоса, потом по позиции
    catChannels.sort((a,b) => {
      if (a.type !== b.type) return a.type === 'text' ? -1 : 1;
      return (a.position || 0) - (b.position || 0);
    });

    const isVoiceCat = catName.toLowerCase().includes('голос');

    return `
      <div class="channel-category">
        <div class="channel-category-header" onclick="toggleCategory(this)">
          <svg class="channel-category-arrow" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M7 10l5 5 5-5z"/>
          </svg>
          ${catName.toUpperCase()}
          <button class="channel-category-add channel-action-btn" 
                  onclick="event.stopPropagation(); showCreateChannelModal('${isVoiceCat ? 'voice' : 'text'}', '${catName}')" 
                  title="Создать канал">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
        <div class="channel-list">
          ${catChannels.length > 0 
            ? catChannels.map(ch => renderChannelItem(ch, server)).join('')
            : `<div class="channel-empty-msg">${window.i18n.t('server_no_channels') || 'Каналов пока нет'}</div>`
          }
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Свернуть/развернуть категорию
 */
function toggleCategory(header) {
  const category = header.parentElement;
  category.classList.toggle('collapsed');
}

window.toggleCategory = toggleCategory;

/**
 * Отрендерить элемент канала
 */
function renderChannelItem(channel, server) {
  const isText = channel.type === 'text';
  const isActive = window.currentChannelId === channel._id;

  const textIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
  const voiceIcon = `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/></svg>`;

  const onclick = isText
    ? `selectChannel('${channel._id}', '${channel.name}', '${channel.type}')`
    : `joinVoiceChannel('${channel._id}', '${channel.name}', '${server.name}')`;

  return `
    <div class="channel-item ${isActive ? 'active' : ''}"
         data-channel-id="${channel._id}"
         onclick="${onclick}">
      <span class="channel-icon">${isText ? textIcon : voiceIcon}</span>
      <span class="channel-name">${channel.name}</span>
      <div class="channel-actions">
        <button class="channel-action-btn" onclick="event.stopPropagation();deleteChannelConfirm('${channel._id}')" title="Удалить">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
        </button>
      </div>
    </div>
    ${!isText ? `<div class="voice-channel-members" data-channel-id="${channel._id}"></div>` : ''}
  `;
}

/**
 * Выбрать текстовый канал
 */
async function selectChannel(channelId, channelName, channelType) {
  window.currentChannelId = channelId;
  window.currentChannel = { _id: channelId, name: channelName, type: channelType };

  // Обновляем активный канал в UI
  document.querySelectorAll('.channel-item').forEach(el => {
    el.classList.toggle('active', el.dataset.channelId === channelId);
  });

  // Обновляем заголовок чата
  const headerName = document.getElementById('chat-header-name');
  const headerIcon = document.getElementById('chat-header-icon');
  if (headerName) headerName.textContent = channelName;
  if (headerIcon) headerIcon.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#8e9297">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
    </svg>`;

  // Показываем вид чата
  showChatView();

  // Скрываем кнопку звонка (она только для ЛС)
  const callBtn = document.getElementById('dm-call-btn');
  if (callBtn) callBtn.style.display = 'none';

  // Загружаем сообщения
  await loadMessages(channelId);
  
  // Загружаем закрепленные сообщения
  if (typeof loadPinnedMessages === 'function') {
    loadPinnedMessages(channelId);
  }

  // Загружаем участников
  await loadChannelMembers();

  // Обновляем placeholder
  const input = document.getElementById('message-input');
  if (input) input.dataset.placeholder = `${window.i18n.t('message_write_in') || 'Написать в'} #${channelName}`;
}

/**
 * Показать DM вид
 */
function showDMView() {
  window.currentServer = null;

  // Обновляем UI
  document.querySelectorAll('.server-icon').forEach(el => el.classList.remove('active'));
  document.getElementById('dm-btn')?.classList.add('active');

  const header = document.getElementById('channels-header-title');
  const headerBtn = document.getElementById('channels-header-btn');
  const dmList = document.getElementById('dm-list');
  const dmSearch = document.getElementById('dm-search-section');
  const serverChannels = document.getElementById('server-channels-list');
  const dmSidebarView = document.getElementById('dm-sidebar-view');
  const serverSidebarView = document.getElementById('server-sidebar-view');

  if (header) header.textContent = window.i18n.t('dm_title');
  if (headerBtn) headerBtn.style.display = 'none';
  if (dmList) dmList.classList.remove('hidden');
  if (dmSearch) dmSearch.classList.remove('hidden');
  if (serverChannels) serverChannels.classList.add('hidden');
  
  // Переключаем sidebar views
  if (dmSidebarView) dmSidebarView.classList.remove('hidden');
  if (serverSidebarView) serverSidebarView.classList.add('hidden');

  // Показываем друзей только если нет активного DM разговора
  if (!window.currentDMConversation || !window.currentChannelId) {
    showFriendsView();
  }
}

/**
 * Показать вид чата
 */
function showChatView() {
  document.getElementById('welcome-view').classList.add('hidden');
  document.getElementById('friends-view').classList.add('hidden');
  const voiceView = document.getElementById('voice-view');
  if (voiceView) voiceView.classList.add('hidden');
  document.getElementById('chat-view').classList.remove('hidden');
}

/**
 * Показать приветственный экран
 */
function showWelcomeView() {
  document.getElementById('welcome-view').classList.remove('hidden');
  document.getElementById('friends-view').classList.add('hidden');
  document.getElementById('chat-view').classList.add('hidden');
  const voiceView = document.getElementById('voice-view');
  if (voiceView) voiceView.classList.add('hidden');

  // Скрываем кнопку звонка
  const callBtn = document.getElementById('dm-call-btn');
  if (callBtn) callBtn.style.display = 'none';
}

/**
 * Показать вид друзей
 */
function showFriendsView() {
  document.getElementById('welcome-view').classList.add('hidden');
  document.getElementById('chat-view').classList.add('hidden');
  const voiceView = document.getElementById('voice-view');
  if (voiceView) voiceView.classList.add('hidden');
  document.getElementById('friends-view').classList.remove('hidden');
  window.currentView = 'friends';
  loadFriends();
}

/**
 * Показать полноэкранный голосовой чат
 */
function showVoiceView() {
  document.getElementById('welcome-view').classList.add('hidden');
  document.getElementById('friends-view').classList.add('hidden');
  document.getElementById('chat-view').classList.add('hidden');
  
  const voiceView = document.getElementById('voice-view');
  if (voiceView) {
    voiceView.classList.remove('hidden');
  }
}

/**
 * Загрузить участников канала
 */
async function loadChannelMembers() {
  if (!window.currentServer) return;

    const membersList = document.getElementById('members-list');
  const membersCount = document.getElementById('members-count');
  if (!membersList) return;

  const members = window.currentServer.members || [];
  if (membersCount) membersCount.textContent = members.length;

  const online = members.filter(m => (m.user?.status || m.status) !== 'offline');
  const offline = members.filter(m => (m.user?.status || m.status) === 'offline');

  membersList.innerHTML = `
    ${online.length > 0 ? `<div class="members-section-title">${window.i18n.t('tab_online').toUpperCase()} — ${online.length}</div>` : ''}
    ${online.map(m => renderMemberItem(m)).join('')}
    ${offline.length > 0 ? `<div class="members-section-title">${window.i18n.t('status_offline').toUpperCase()} — ${offline.length}</div>` : ''}
    ${offline.map(m => renderMemberItem(m)).join('')}
  `;
}

/**
 * Отрендерить участника
 */
function renderMemberItem(member) {
  const user = member.user || member;
  const status = user.status || 'offline';
  
  // Получаем роли участника
  let rolesHtml = '';
  let topRole = null;
  
  if (window.currentServer && member.roles && member.roles.length > 0) {
    const server = window.currentServer;
    // Получаем роли с hoist (показывать отдельно) и сортируем по позиции
    const memberRoles = member.roles
      .map(roleId => server.roles?.find(r => r._id.toString() === roleId.toString()))
      .filter(role => role && role.hoist)
      .sort((a, b) => b.position - a.position);
    
    if (memberRoles.length > 0) {
      topRole = memberRoles[0];
      rolesHtml = `<div class="member-role" style="color: ${topRole.color}">${topRole.name}</div>`;
    }
  }
  
  return `
    <div class="member-item" 
         data-user-id="${user._id}" 
         onclick="openDMWithUser('${user._id}')"
         oncontextmenu="showMemberContextMenu(event, '${user._id}', '${escapeHtml(user.username)}')">
      <div class="member-avatar">
        <img src="${getAvatarUrl(user.avatar)}" alt="${user.username}">
        <div class="status-dot ${status}"></div>
      </div>
      <div class="member-info">
        <div class="member-name" style="${topRole ? `color: ${topRole.color}` : ''}">${user.username}${user.role === 'owner' ? ` <span title="${window.i18n.t('role_creator')}" style="font-size:1.1em">👑</span>` : ''}</div>
        ${rolesHtml}
        ${!rolesHtml ? `<div class="member-status">${getStatusText(status)}</div>` : ''}
      </div>
      <div class="member-speaking-indicator" style="display:none"></div>
    </div>
  `;
}

/**
 * Показать контекстное меню участника
 */
function showMemberContextMenu(event, userId, username) {
  event.preventDefault();
  
  // Удаляем старое меню если есть
  const oldMenu = document.querySelector('.context-menu');
  if (oldMenu) oldMenu.remove();
  
  // Создаем новое меню
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  menu.style.cssText = `
    position: fixed;
    left: ${event.clientX}px;
    top: ${event.clientY}px;
    background: var(--bg-secondary);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 8px 0;
    z-index: 10000;
    box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  `;
  
  menu.innerHTML = `
    <div class="context-menu-item" onclick="openMemberRolesModal('${userId}', '${username}'); this.parentElement.remove();">
      🎭 ${window.i18n.t('roles_manage') || 'Управление ролями'}
    </div>
    <div class="context-menu-item" onclick="openDMWithUser('${userId}'); this.parentElement.remove();">
      💬 ${window.i18n.t('friends_action_msg')}
    </div>
  `;
  
  document.body.appendChild(menu);
  
  // Закрываем меню при клике вне его
  setTimeout(() => {
    document.addEventListener('click', function closeMenu() {
      menu.remove();
      document.removeEventListener('click', closeMenu);
    });
  }, 0);
}

function getStatusText(status) {
  const texts = { 
    online: window.i18n.t('status_online'), 
    idle: window.i18n.t('status_idle'), 
    dnd: window.i18n.t('status_dnd'), 
    offline: window.i18n.t('status_offline') 
  };
  return texts[status] || window.i18n.t('status_offline');
}

/**
 * Открыть DM с пользователем
 */
async function openDMWithUser(userId) {
  try {
    const data = await DMAPI.openConversation(userId);
    await openDMConversation(data.conversation);
    // Обновляем список DM диалогов
    await loadDMConversations();
  } catch (error) {
    showNotification('error', 'Не удалось открыть диалог');
  }
}

/**
 * Загрузить DM диалоги
 */
async function loadDMConversations() {
  try {
    const data = await DMAPI.getAll();
    renderDMConversations(data.conversations || []);
  } catch (error) {
    console.error('Error loading DM conversations:', error);
  }
}

window.loadDMConversations = loadDMConversations;

/**
 * Удалить (скрыть) DM диалог
 */
async function deleteDMConversation(convId) {
  try {
    const dmItem = document.querySelector(`.dm-item[data-conv-id="${convId}"]`);
    
    // Эффект анимации перед удалением
    if (dmItem) {
      dmItem.classList.add('shrinking-out');
    }

    await DMAPI.delete(convId);
    
    // Если удаляем активный диалог - переходим в список друзей
    if (window.currentDMConversation?._id === convId) {
      window.currentDMConversation = null;
      window.currentDMConversationId = null;
      showFriendsView();
    }

    // Ждем окончания анимации и перезагружаем список
    setTimeout(async () => {
      await loadDMConversations();
    }, 300);

  } catch (error) {
    showNotification('error', 'Не удалось скрыть диалог');
  }
}

window.deleteDMConversation = deleteDMConversation;

/**
 * Отрендерить DM диалоги
 */
function renderDMConversations(conversations) {
  const container = document.getElementById('dm-conversations');
  if (!container) return;

  container.innerHTML = conversations.map(conv => {
    const other = conv.participants?.find(p => p._id !== window.currentUser?._id);
    if (!other) return '';

    return `
      <div class="dm-item ${window.currentDMConversation?._id === conv._id ? 'active' : ''}"
           data-conv-id="${conv._id}"
           onclick="openDMConversation(${JSON.stringify(conv).replace(/"/g, '&quot;')})">
        <div class="dm-avatar">
          <img src="${getAvatarUrl(other.avatar)}" alt="${other.username}">
          <div class="status-dot ${other.status || 'offline'}"></div>
        </div>
        <div class="dm-info">
          <div class="dm-name">${other.username}${other.role === 'owner' ? ` <span title="${window.i18n.t('role_creator')}" style="font-size:1.1em">👑</span>` : ''}</div>
          <div class="dm-last-message">${conv.lastMessage?.content?.substring(0, 30) || ''}</div>
        </div>
        <button class="dm-close-btn" onclick="event.stopPropagation(); deleteDMConversation('${conv._id}')">✕</button>
      </div>
    `;
  }).join('');
}

/**
 * Открыть DM диалог
 */
async function openDMConversation(conversation) {
  window.currentDMConversation = conversation;
  // Сохраняем ID диалога для API вызовов
  window.currentDMConversationId = conversation._id;

  const other = conversation.participants?.find(p => p._id !== window.currentUser?._id);
  if (!other) return;

  // Обновляем активный DM
  document.querySelectorAll('.dm-item').forEach(el => {
    el.classList.toggle('active', el.dataset.convId === conversation._id);
  });

  // Обновляем заголовок
  const headerName = document.getElementById('chat-header-name');
  const headerIcon = document.getElementById('chat-header-icon');
  if (headerName) headerName.textContent = other.username;
  if (headerIcon) headerIcon.innerHTML = `
    <img src="${getAvatarUrl(other.avatar)}" style="width:24px;height:24px;border-radius:50%;object-fit:cover" alt="">
  `;

  // Показываем кнопку звонка
  const callBtn = document.getElementById('dm-call-btn');
  if (callBtn) callBtn.style.display = 'flex';

  // Скрываем список участников для DM
  const membersSidebar = document.getElementById('members-sidebar');
  if (membersSidebar) membersSidebar.classList.add('hidden');

  // Показываем DM вид с чатом
  showDMView();
  showChatView();

  // Загружаем сообщения DM — это также установит правильный currentChannelId
  await loadDMMessages(conversation._id);

  const input = document.getElementById('message-input');
  if (input) input.dataset.placeholder = `${window.i18n.t('message_write') || 'Написать'} ${other.username}`;
}

/**
 * Загрузить сообщения DM
 */
async function loadDMMessages(conversationId) {
  try {
    const data = await DMAPI.getMessages(conversationId);
    // Устанавливаем правильный channelId (ID канала, не диалога)
    // Сервер использует channel ID для сокет-событий
    if (data.channelId) {
      window.currentChannelId = data.channelId.toString();
      console.log('📬 DM channel ID set to:', window.currentChannelId);
    }
    renderMessages(data.messages || [], true);
    scrollToBottom();
  } catch (error) {
    console.error('Error loading DM messages:', error);
  }
}

/**
 * Переключить категорию каналов
 */
function toggleCategory(header) {
  const category = header.closest('.channel-category');
  if (category) {
    category.classList.toggle('collapsed');
    const list = category.querySelector('.channel-list');
    if (list) list.style.display = category.classList.contains('collapsed') ? 'none' : '';
  }
}

/**
 * Настройка emoji picker
 */
function setupEmojiPicker() {
  const picker = document.getElementById('emoji-picker');
  if (picker) {
    // Для emoji-picker-element библиотеки
    picker.addEventListener('emoji-click', (event) => {
      const emoji = event.detail.unicode || event.detail.emoji?.unicode;
      if (emoji) {
        insertEmojiIntoInput(emoji);
        document.getElementById('emoji-picker-container')?.classList.add('hidden');
      }
    });
  }
}

/**
 * Переключить emoji picker
 */
function toggleEmojiPicker() {
  const container = document.getElementById('emoji-picker-container');
  if (container) {
    container.classList.toggle('hidden');
    
    // Показываем кастомные эмодзи при открытии
    if (!container.classList.contains('hidden') && window.showCustomEmojisInPicker) {
      window.showCustomEmojisInPicker();
    }
  }
}

// insertEmojiIntoInput определена в ui.js (работает с textarea)

// deleteChannelConfirm удалена отсюда, так как она определена в ui.js с использованием Modal.confirm

/**
 * Настройка логики автообновлений
 */
function setupUpdater() {
  if (window.electronAPI && window.electronAPI.onUpdateMessage) {
    window.electronAPI.onUpdateMessage((data) => {
      const banner = document.getElementById('update-banner');
      const text = document.getElementById('update-banner-text');
      const btn = document.getElementById('update-action-btn');
      const progress = document.getElementById('update-progress-bar');
      const fill = document.getElementById('update-progress-fill');

      if (!banner) return;

      if (data.type === 'available') {
        banner.classList.remove('hidden');
        text.textContent = 'Доступно новое обновление: ' + data.info.version;
        btn.textContent = 'Доступно (загрузка в фоне)';
        btn.disabled = true;
      } else if (data.type === 'progress') {
        progress.classList.remove('hidden');
        fill.style.width = data.progress.percent + '%';
        btn.textContent = Math.round(data.progress.percent) + '%';
      } else if (data.type === 'downloaded') {
        progress.classList.add('hidden');
        text.textContent = 'Обновление скачано и готово к установке';
        btn.textContent = 'Перезапустить и обновить';
        btn.disabled = false;
        btn.onclick = () => window.electronAPI.installUpdate();
      }
    });
  }
}

/**
 * Закрыть баннер обновления
 */
window.closeUpdateBanner = function() {
  const banner = document.getElementById('update-banner');
  if (banner) banner.classList.add('hidden');
};
