/**
 * App модуль - главная логика приложения
 * Инициализация, загрузка данных, навигация
 */

// Глобальные переменные состояния
window.currentUser = null;
// window.currentServer = null; (Handled by NavigationController StateGuard getters)
// window.currentChannel = null; (Handled by NavigationController StateGuard getters)
// window.currentChannelId = null; (Handled by NavigationController StateGuard getters)
// window.currentVoiceChannel = null; (Handled by NavigationController StateGuard getters)
// window.currentDMConversation = null; (Handled by NavigationController StateGuard getters)
window._dmNavigationSeq = 0;
window._globalNavigationSeq = 0;
window._activeNavigationRequestId = 0;
window.currentView = 'welcome'; // 'welcome' | 'server' | 'dm'

function setNavigationState(nextState = {}) {
  if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
    const currentView = nextState.currentView || window.NavigationController.state.currentView || 'welcome';
    const activeServerId = Object.prototype.hasOwnProperty.call(nextState, 'activeServerId')
      ? nextState.activeServerId
      : window.NavigationController.state.currentServerId;

    window.NavigationController._commitState({
      currentView,
      currentServerId: activeServerId
    }, 'setNavigationState');
  }

  window.currentView = window.navigationState.currentView;
  applyNavigationState();
}

function applyNavigationState() {
  const { currentView, activeServerId, activeDMId } = window.navigationState;

  document.querySelectorAll('.server-icon[data-server-id]').forEach(el => {
    el.classList.toggle('active', currentView === 'server' && el.dataset.serverId === activeServerId);
  });

  document.getElementById('dm-btn')?.classList.toggle('active', currentView === 'dm');

  document.querySelectorAll('.dm-item').forEach(el => {
    el.classList.toggle('active', currentView === 'dm' && el.dataset.convId === activeDMId);
  });
}

window.setNavigationState = setNavigationState;
window.applyNavigationState = applyNavigationState;

// Ручное тестирование warmup UI без ожидания реального холодного старта.
// Вызов из DevTools: testWarmupUI()
window.testWarmupUI = async function() {
  const loadingScreen = document.getElementById('loading-screen');
  const content = document.getElementById('loading-content');
  const status = document.getElementById('loading-status');
  const fill = document.getElementById('loading-progress-fill');
  const progressBar = document.querySelector('.loading-progress-bar');

  loadingScreen.style.display = '';
  loadingScreen.classList.remove('hidden');
  loadingScreen.style.opacity = '1';
  loadingScreen.style.transition = '';
  if (content) content.style.transform = '';
  if (status) { status.style.opacity = '0'; status.textContent = ''; }
  if (progressBar) progressBar.style.opacity = '0';
  if (fill) fill.style.width = '0%';

  const steps = 8;
  for (let i = 1; i <= steps; i++) {
    await new Promise(r => setTimeout(r, 600));

    if (i === 2) {
      if (content) content.style.transform = 'translateY(-40px)';
      setTimeout(() => {
        if (status) status.style.opacity = '1';
        if (progressBar) progressBar.style.opacity = '1';
      }, 300);
    }

    if (i >= 2) {
      if (status) {
        status.style.opacity = '0';
        await new Promise(r => setTimeout(r, 200));
        if (i === 2) status.textContent = 'Сервер просыпается...';
        else if (i <= 5) status.textContent = 'Подождите немного...';
        else status.textContent = 'Это занимает чуть дольше обычного...';
        status.style.opacity = '1';
      }
      if (fill) fill.style.width = (i / steps * 100) + '%';
    }
  }

  await new Promise(r => setTimeout(r, 800));
  loadingScreen.style.transition = 'opacity 0.5s ease';
  loadingScreen.style.opacity = '0';
  setTimeout(() => {
    loadingScreen.style.display = 'none';
    loadingScreen.classList.add('hidden');
    if (content) content.style.transform = '';
    if (status) status.style.opacity = '0';
    if (progressBar) progressBar.style.opacity = '0';
    loadingScreen.style.opacity = '';
    loadingScreen.style.transition = '';
  }, 500);
};

/**
 * Инициализация приложения при загрузке страницы
 */
document.addEventListener('DOMContentLoaded', async () => {
  // --- SPLASH SCREEN SYSTEM ---
  const splashStartTime = Date.now();
  const MIN_SPLASH_TIME = 2500; 
  const isFirstSession = sessionStorage.getItem('hasPlayedSplash') !== 'true';

  const logo = document.querySelector('.loading-logo');
  if (isFirstSession) {
    if (window.SoundManager) window.SoundManager.play('app_splash');
    if (logo) logo.classList.add('animate-heart');
  } else {
    if (logo) logo.classList.add('animate-heart');
  }

  const hideSplashScreen = (callback) => {
    const elapsed = Date.now() - splashStartTime;
    const remaining = isFirstSession ? Math.max(0, MIN_SPLASH_TIME - elapsed) : 0;
    
    setTimeout(() => {
      if (window.SoundManager) window.SoundManager.stop('app_splash');

      const loadingScreen = document.getElementById('loading-screen');
      if (loadingScreen) {
        loadingScreen.style.transition = 'opacity 0.4s ease';
        loadingScreen.style.opacity = '0';
        
        setTimeout(() => {
          loadingScreen.classList.add('hidden');
          loadingScreen.style.display = 'none';
          loadingScreen.style.opacity = '';
          loadingScreen.style.transition = '';
          
          const content = document.getElementById('loading-content');
          const progressBar = document.querySelector('.loading-progress-bar');
          const status = document.getElementById('loading-status');
          if (content) content.style.transform = '';
          if (status) status.style.opacity = '0';
          if (progressBar) progressBar.style.opacity = '0';
          
          if (callback) callback();
        }, 400);
      } else if (callback) {
        callback();
      }
    }, remaining);
  };
  // ----------------------------

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
  // Токен теперь хранится в main process, проверяем наличие пользователя
  const savedUser = localStorage.getItem('user');

  if (savedUser) {
    try {
      window.currentUser = JSON.parse(savedUser);

      // Прогреваем сервер (Render free-план может спать до 60 сек).
      // Не делаем reload окна — просто ждём, пока /api/health ответит.
      const loadingStatus = document.getElementById('loading-status');
      const loadingProgressFill = document.getElementById('loading-progress-fill');
      const warmedUp = await warmupServer({
        onAttempt: (attempt, max) => {
          if (attempt === 1) {
            // сервер скорее всего ответит быстро — не показываем UI ожидания
            return;
          }

          if (attempt === 2) {
            // Сдвигаем всю группу (логотип + текст + спиннер) вверх как единое целое.
            const content = document.getElementById('loading-content');
            const progressBar = document.querySelector('.loading-progress-bar');
            if (content) content.style.transform = 'translateY(-40px)';

            // Через 300ms показываем прогресс-бар и статус
            setTimeout(() => {
              if (loadingStatus) loadingStatus.style.opacity = '1';
              if (progressBar) progressBar.style.opacity = '1';
            }, 300);
          }

          let msg;
          if (attempt <= 4) msg = 'Подождите немного...';
          else msg = 'Это занимает чуть дольше обычного...';
          if (loadingStatus) {
            loadingStatus.textContent = msg;
          }
          if (loadingProgressFill) {
            loadingProgressFill.style.width = `${(attempt / max) * 100}%`;
          }
        }
      });

      if (!warmedUp) {
        if (loadingStatus) {
          loadingStatus.textContent = 'Сервер недоступен. Проверьте интернет и попробуйте позже.';
          loadingStatus.style.opacity = '1';
        }
        return;
      }

      if (loadingStatus) {
        loadingStatus.textContent = 'Входим...';
        loadingStatus.style.opacity = '1';
      }

      // Верифицируем токен на сервере (токен добавится автоматически в main process)
      const data = await AuthAPI.getMe();
      window.currentUser = data.user;
      localStorage.setItem('user', JSON.stringify(data.user));

      // Скрываем экран загрузки плавно
      hideSplashScreen(async () => {
        await initApp();
      });
      return;
    } catch (error) {
      // Токен недействителен — выкидываем на экран логина
      if (error.status === 401 || error.status === 403 || (error.message && error.message.includes('не найден'))) {
        await clearAuthToken();
        localStorage.removeItem('user');
      } else if (error.status === 429) {
        // Rate limit — НЕ перезагружаемся, иначе цикл reload→429→reload.
        const status = document.getElementById('loading-status');
        if (status) {
          status.textContent = 'Слишком много запросов. Подождите минуту и попробуйте снова.';
          status.style.opacity = '1';
        }
        return;
      } else {
        // Прочая ошибка после успешного прогрева — показываем юзеру и не циклимся.
        const status = document.getElementById('loading-status');
        if (status) {
          status.textContent = 'Не удалось войти. Перезапустите приложение.';
          status.style.opacity = '1';
        }
        console.error('Init error:', error);
        return;
      }
    }
  }
  
  hideSplashScreen(() => {
    showAuthScreen();
  });
});

/**
 * Показать экран авторизации
 */
function showAuthScreen() {
  // loadingScreen is managed by hideSplashScreen
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
  const loadingScreen = document.getElementById('loading-screen');
  if (loadingScreen) {
    loadingScreen.style.transition = 'opacity 0.5s ease';
    loadingScreen.style.opacity = '0';
    setTimeout(() => {
      loadingScreen.classList.add('hidden');
      loadingScreen.style.display = 'none';
      loadingScreen.style.opacity = '';
      loadingScreen.style.transition = '';
      const content = document.getElementById('loading-content');
      const progressBar = document.querySelector('.loading-progress-bar');
      const status = document.getElementById('loading-status');
      if (content) content.style.transform = '';
      if (status) status.style.opacity = '0';
      if (progressBar) progressBar.style.opacity = '0';
    }, 500);
  }
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

  // Инициализируем Socket.io (токен будет получен внутри initSocket)
  initSocket();

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

  list.innerHTML = ''; // Очищаем список безопасно
  
  servers.forEach(server => {
    const iconDiv = document.createElement('div');
    iconDiv.className = `server-icon ${window.navigationState?.currentView === 'server' && window.navigationState?.activeServerId === server._id ? 'active' : ''}`;
    iconDiv.dataset.serverId = server._id;
    iconDiv.title = server.name; // Защита браузера: title экранируется автоматически
    iconDiv.onclick = () => selectServer(server._id); // Это безопасно, так как мы назначаем функцию, а не строку

    if (server.icon) {
      const img = document.createElement('img');
      img.src = getAvatarUrl(server.icon);
      img.alt = server.name; // Защита браузера
      iconDiv.appendChild(img);
    } else {
      const span = document.createElement('span');
      span.style.fontSize = '14px';
      span.style.fontWeight = '700';
      span.textContent = server.name.substring(0, 2).toUpperCase(); // textContent защищает от XSS
      iconDiv.appendChild(span);
    }

    const tooltip = document.createElement('div');
    tooltip.className = 'server-tooltip';
    tooltip.textContent = server.name; // textContent защищает от XSS
    iconDiv.appendChild(tooltip);

    list.appendChild(iconDiv);
  });
}

/**
 * Выбрать сервер
 */
async function selectServer(serverId) {
  if (!window.NavigationController || typeof window.NavigationController.navigateToServer !== 'function') {
    showNotification('error', 'Навигация недоступна');
    return;
  }

  return window.NavigationController.navigateToServer(serverId, {
    triggeredBy: 'legacy-selectServer'
  });
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

  // Показываем соответствующий вид в зависимости от состояния канала
  if (window.currentChannelId) {
    // Пользователь был в канале - проверяем, существует ли он на новом сервере
    const channelExists = server.channels?.some(ch => ch._id === window.currentChannelId);
    if (channelExists) {
      showChatView();
    } else {
      // Предыдущий канал не существует на этом сервере, очищаем и показываем welcome
      if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
        window.NavigationController._commitState({
          currentChannelId: null,
          currentChannel: null
        }, 'showServerChannels');
      }
      showWelcomeView();
    }
  } else {
    // Канал не выбран, показываем приветственный экран
    showWelcomeView();
  }
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

  // Очищаем контейнер безопасно
  container.innerHTML = '';
  
  Object.keys(grouped).forEach(catName => {
    const catChannels = grouped[catName];
    // Сортировка: текст выше голоса, потом по позиции
    catChannels.sort((a,b) => {
      if (a.type !== b.type) return a.type === 'text' ? -1 : 1;
      return (a.position || 0) - (b.position || 0);
    });

    const isVoiceCat = catName.toLowerCase().includes('голос');

    // Создаем категорию через DOM API (безопасно)
    const categoryDiv = document.createElement('div');
    categoryDiv.className = 'channel-category';
    
    // Заголовок категории
    const headerDiv = document.createElement('div');
    headerDiv.className = 'channel-category-header';
    headerDiv.addEventListener('click', function() { toggleCategory(this); });
    
    // SVG стрелка
    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('class', 'channel-category-arrow');
    arrow.setAttribute('width', '12');
    arrow.setAttribute('height', '12');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('fill', 'currentColor');
    const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrowPath.setAttribute('d', 'M7 10l5 5 5-5z');
    arrow.appendChild(arrowPath);
    
    headerDiv.appendChild(arrow);
    headerDiv.appendChild(document.createTextNode(' ' + catName.toUpperCase())); // Безопасно через textContent
    
    // Кнопка добавления канала
    const addBtn = document.createElement('button');
    addBtn.className = 'channel-category-add channel-action-btn';
    addBtn.title = 'Создать канал';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showCreateChannelModal(isVoiceCat ? 'voice' : 'text', catName);
    });
    
    const addSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    addSvg.setAttribute('width', '14');
    addSvg.setAttribute('height', '14');
    addSvg.setAttribute('viewBox', '0 0 24 24');
    addSvg.setAttribute('fill', 'none');
    addSvg.setAttribute('stroke', 'currentColor');
    addSvg.setAttribute('stroke-width', '2');
    
    const line1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line1.setAttribute('x1', '12');
    line1.setAttribute('y1', '5');
    line1.setAttribute('x2', '12');
    line1.setAttribute('y2', '19');
    
    const line2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line2.setAttribute('x1', '5');
    line2.setAttribute('y1', '12');
    line2.setAttribute('x2', '19');
    line2.setAttribute('y2', '12');
    
    addSvg.appendChild(line1);
    addSvg.appendChild(line2);
    addBtn.appendChild(addSvg);
    
    headerDiv.appendChild(addBtn);
    
    // Список каналов
    const channelList = document.createElement('div');
    channelList.className = 'channel-list';
    
    if (catChannels.length > 0) {
      catChannels.forEach(ch => {
        const channelItemHtml = renderChannelItem(ch, server);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = channelItemHtml;
        if (tempDiv.firstElementChild) {
          channelList.appendChild(tempDiv.firstElementChild);
        }
      });
    } else {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'channel-empty-msg';
      emptyMsg.textContent = window.i18n.t('server_no_channels') || 'Каналов пока нет';
      channelList.appendChild(emptyMsg);
    }
    
    categoryDiv.appendChild(headerDiv);
    categoryDiv.appendChild(channelList);
    container.appendChild(categoryDiv);
  });
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
async function __legacyNavigateToChannel(channelId, channelName, channelType, options = {}) {
  const isStale = typeof options.isStale === 'function' ? options.isStale : () => false;

  const globalSeq = ++window._globalNavigationSeq;
  window._activeNavigationRequestId = globalSeq;

  if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
    window.NavigationController._commitState({
      currentChannelId: channelId,
      currentChannel: { _id: channelId, name: channelName, type: channelType }
    }, '__legacyNavigateToChannel');
  }

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
  await loadMessages(channelId, { globalSeq });
  if (isStale()) return { stale: true };
  
  // Загружаем закрепленные сообщения
  if (typeof loadPinnedMessages === 'function') {
    loadPinnedMessages(channelId);
  }
  if (isStale()) return { stale: true };

  // Загружаем участников
  await loadChannelMembers();
  if (isStale()) return { stale: true };

  // Обновляем placeholder
  const input = document.getElementById('message-input');
  if (input) input.dataset.placeholder = `${window.i18n.t('message_write_in') || 'Написать в'} #${channelName}`;
}

window.__legacyNavigateToChannel = __legacyNavigateToChannel;

async function selectChannel(channelId, channelName, channelType) {
  if (window.NavigationController && typeof window.NavigationController.navigateToChannel === 'function') {
    return window.NavigationController.navigateToChannel(channelId, channelName, channelType, {
      triggeredBy: 'legacy-selectChannel'
    });
  }

  return __legacyNavigateToChannel(channelId, channelName, channelType);
}

/**
 * Показать DM вид
 */
function showDMView() {
  if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
    window.NavigationController._commitState({
      currentServer: null,
      currentServerId: null,
      currentRoom: null,
      currentChannel: null,
      currentChannelId: null
    }, 'showDMView');
  }

  setNavigationState({
    currentView: 'dm',
    activeServerId: null
  });

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
/**
 * Force clear and disable pointer events for all room overlays to prevent stuck overlays blocking click events.
 */
function forceClearRoomOverlays() {
  if (window.ModalManager && typeof window.ModalManager.closeAll === 'function') {
    window.ModalManager.closeAll();
  }
}
window.forceClearRoomOverlays = forceClearRoomOverlays;

function switchMainView(visibleId) {
  const views = ['welcome-view', 'friends-view', 'chat-view', 'voice-view', 'room-view'];
  views.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === visibleId) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });
}
window.switchMainView = switchMainView;

function showChatView() {
  switchMainView('chat-view');
}

/**
 * Показать приветственный экран
 */
function showWelcomeView() {
  switchMainView('welcome-view');
  
  // Скрываем кнопку звонка
  const callBtn = document.getElementById('dm-call-btn');
  if (callBtn) callBtn.style.display = 'none';
}

/**
 * Показать вид друзей
 */
function showFriendsView() {
  switchMainView('friends-view');
  setNavigationState({
    currentView: 'dm',
    activeServerId: null,
    activeDMId: null
  });
  loadFriends();
}

/**
 * Показать полноэкранный голосовой чат
 */
function showVoiceView() {
  switchMainView('voice-view');
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

  // Очищаем список безопасно
  membersList.innerHTML = '';
  
  // Секция онлайн
  if (online.length > 0) {
    const onlineTitle = document.createElement('div');
    onlineTitle.className = 'members-section-title';
    onlineTitle.textContent = `${window.i18n.t('tab_online').toUpperCase()} — ${online.length}`;
    membersList.appendChild(onlineTitle);
    
    online.forEach(m => {
      const memberEl = createMemberElement(m);
      membersList.appendChild(memberEl);
    });
  }
  
  // Секция оффлайн
  if (offline.length > 0) {
    const offlineTitle = document.createElement('div');
    offlineTitle.className = 'members-section-title';
    offlineTitle.textContent = `${window.i18n.t('status_offline').toUpperCase()} — ${offline.length}`;
    membersList.appendChild(offlineTitle);
    
    offline.forEach(m => {
      const memberEl = createMemberElement(m);
      membersList.appendChild(memberEl);
    });
  }
}

/**
 * Создать элемент участника безопасно через DOM API
 */
function createMemberElement(member) {
  const user = member.user || member;
  const status = user.status || 'offline';
  
  // Получаем роли участника
  let topRole = null;
  
  if (window.currentServer && member.roles && member.roles.length > 0) {
    const server = window.currentServer;
    const memberRoles = member.roles
      .map(roleId => server.roles?.find(r => r._id.toString() === roleId.toString()))
      .filter(role => role && role.hoist)
      .sort((a, b) => b.position - a.position);
    
    if (memberRoles.length > 0) {
      topRole = memberRoles[0];
    }
  }
  
  // Создаем элемент через DOM API
  const memberItem = document.createElement('div');
  memberItem.className = 'member-item';
  memberItem.dataset.userId = user._id;
  memberItem.addEventListener('click', () => openDMWithUser(user._id));
  memberItem.addEventListener('contextmenu', (e) => showMemberContextMenu(e, user._id, user.username));
  
  // Аватар
  const memberAvatar = document.createElement('div');
  memberAvatar.className = 'member-avatar';
  
  const avatarImg = document.createElement('img');
  avatarImg.src = getAvatarUrl(user.avatar);
  avatarImg.alt = escapeHtml(user.username);
  
  const statusDot = document.createElement('div');
  statusDot.className = `status-dot ${status}`;
  
  memberAvatar.appendChild(avatarImg);
  memberAvatar.appendChild(statusDot);
  
  // Информация
  const memberInfo = document.createElement('div');
  memberInfo.className = 'member-info';
  
  const memberName = document.createElement('div');
  memberName.className = 'member-name';
  if (topRole) {
    memberName.style.color = topRole.color;
  }
  memberName.textContent = user.nickname || user.username; // Безопасно через textContent
  
  if (user.role === 'owner') {
    const crownSpan = document.createElement('span');
    crownSpan.title = window.i18n.t('role_creator');
    crownSpan.style.fontSize = '1.1em';
    crownSpan.textContent = '👑';
    memberName.appendChild(document.createTextNode(' '));
    memberName.appendChild(crownSpan);
  }
  
  memberInfo.appendChild(memberName);
  
  // Роль или статус
  if (topRole) {
    const memberRole = document.createElement('div');
    memberRole.className = 'member-role';
    memberRole.style.color = topRole.color;
    memberRole.textContent = topRole.name;
    memberInfo.appendChild(memberRole);
  } else {
    const memberStatus = document.createElement('div');
    memberStatus.className = 'member-status';
    memberStatus.textContent = getStatusText(status);
    memberInfo.appendChild(memberStatus);
  }
  
  // Индикатор говорения
  const speakingIndicator = document.createElement('div');
  speakingIndicator.className = 'member-speaking-indicator';
  speakingIndicator.style.display = 'none';
  
  memberItem.appendChild(memberAvatar);
  memberItem.appendChild(memberInfo);
  memberItem.appendChild(speakingIndicator);
  
  return memberItem;
}

/**
 * Отрендерить участника (устаревшая функция, используется только в старых местах)
 * TODO: Заменить все вызовы на createMemberElement
 */
function renderMemberItem(member) {
  // Используем безопасную версию
  const el = createMemberElement(member);
  const wrapper = document.createElement('div');
  wrapper.appendChild(el);
  return wrapper.innerHTML;
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

  // Очищаем контейнер безопасно
  container.innerHTML = '';
  
  conversations.forEach(conv => {
    const other = conv.participants?.find(p => p._id !== window.currentUser?._id);
    if (!other) return;

    // Создаем элементы через DOM API (безопасно)
    const dmItem = document.createElement('div');
    dmItem.className = `dm-item ${window.navigationState?.currentView === 'dm' && window.navigationState?.activeDMId === conv._id ? 'active' : ''}`;
    dmItem.dataset.convId = conv._id;
    dmItem.dataset.userId = other._id;
    dmItem.addEventListener('click', () => openDMConversation(conv));

    // Аватар
    const dmAvatar = document.createElement('div');
    dmAvatar.className = 'dm-avatar';
    
    const avatarImg = document.createElement('img');
    avatarImg.src = getAvatarUrl(other.avatar);
    avatarImg.alt = escapeHtml(other.username);
    
    const statusDot = document.createElement('div');
    statusDot.className = `status-dot ${other.status || 'offline'}`;
    
    dmAvatar.appendChild(avatarImg);
    dmAvatar.appendChild(statusDot);

    // Информация
    const dmInfo = document.createElement('div');
    dmInfo.className = 'dm-info';
    
    const dmName = document.createElement('div');
    dmName.className = 'dm-name';
    dmName.textContent = other.nickname || other.username; // Безопасно через textContent
    
    if (other.role === 'owner') {
      const crownSpan = document.createElement('span');
      crownSpan.title = window.i18n.t('role_creator');
      crownSpan.style.fontSize = '1.1em';
      crownSpan.textContent = '👑';
      dmName.appendChild(document.createTextNode(' '));
      dmName.appendChild(crownSpan);
    }
    
    const dmLastMessage = document.createElement('div');
    dmLastMessage.className = 'dm-last-message';
    dmLastMessage.textContent = conv.lastMessage?.content?.substring(0, 30) || ''; // Безопасно через textContent
    
    dmInfo.appendChild(dmName);
    dmInfo.appendChild(dmLastMessage);

    // Кнопка закрытия
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dm-close-btn';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteDMConversation(conv._id);
    });

    dmItem.appendChild(dmAvatar);
    dmItem.appendChild(dmInfo);
    dmItem.appendChild(closeBtn);
    
    container.appendChild(dmItem);
  });
}

/**
 * Открыть DM диалог
 */
async function openDMConversation(conversation) {
  return window.NavigationController.navigateToDM(conversation);
}

/**
 * Загрузить сообщения DM
 */
async function loadDMMessages(conversationId, options = {}) {
  const requestSeq = options.requestSeq;
  const globalSeq = options.globalSeq || window._activeNavigationRequestId;
  try {
    const data = await DMAPI.getMessages(conversationId);
    
    // Strict DM requestSeq guards before any write or render operation
    if (requestSeq !== undefined && requestSeq !== window._dmNavigationSeq) {
      console.warn('⚠️ Stale DM load aborted (seq mismatch) for conversation:', conversationId);
      return;
    }
    if (window.currentDMConversationId !== conversationId) {
      console.warn('⚠️ Stale DM load aborted (conversationId mismatch) for conversation:', conversationId);
      return;
    }
    if (globalSeq !== undefined && globalSeq !== window._activeNavigationRequestId) {
      console.warn('⚠️ Stale DM load aborted (global execution context mismatch) for conversation:', conversationId);
      return;
    }

    // Устанавливаем правильный channelId (ID канала, не диалога)
    // Сервер использует channel ID для сокет-событий
    if (data.channelId) {
      if (window.NavigationController && typeof window.NavigationController._commitState === 'function') {
        window.NavigationController._commitState({
          currentChannelId: data.channelId.toString()
        }, 'loadDMMessages');
      }
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
