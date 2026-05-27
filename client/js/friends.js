/**
 * Friends модуль - система друзей
 */

let currentFriendsTab = 'all';

/**
 * Загрузить список друзей
 */
async function loadFriends() {
  try {
    const data = await FriendsAPI.getAll();
    window.friendsData = data;
    renderFriendsTab(currentFriendsTab, data);
  } catch (error) {
    console.error('Error loading friends:', error);
  }
}

window.loadFriends = loadFriends;

/**
 * Переключить вкладку друзей
 */
function switchFriendsTab(tab) {
  currentFriendsTab = tab;

  // Обновляем активную вкладку
  document.querySelectorAll('.friends-tab').forEach(el => el.classList.remove('active'));
  const activeTab = document.getElementById(`tab-${tab}`);
  if (activeTab) activeTab.classList.add('active');

  if (window.friendsData) {
    renderFriendsTab(tab, window.friendsData);
  } else {
    loadFriends();
  }
}

// Алиас для HTML onclick
function showFriendsTab(tab) {
  switchFriendsTab(tab);
}

/**
 * Отрендерить вкладку друзей
 */
function renderFriendsTab(tab, data) {
  const content = document.getElementById('friends-content');
  if (!content) return;

  const friends = data.friends || [];
  const pending = data.requestsSent || [];
  const incoming = data.requestsReceived || [];

  // Очищаем безопасно — пустой контейнер, потом наполняем DOM API.
  content.innerHTML = '';

  switch (tab) {
    case 'all': {
      if (friends.length === 0) {
        content.appendChild(buildEmptyAllFriends());
      } else {
        const title = document.createElement('div');
        title.className = 'friends-section-title';
        title.textContent = `${(window.i18n?.t('tab_all') || 'Все').toUpperCase()} — ${friends.length}`;
        content.appendChild(title);
        friends.forEach(f => content.appendChild(buildFriendItem(f, true)));
      }
      break;
    }

    case 'online': {
      const onlineFriends = friends.filter(f => f.status !== 'offline');
      if (onlineFriends.length === 0) {
        content.appendChild(buildEmptyOnlineFriends());
      } else {
        const title = document.createElement('div');
        title.className = 'friends-section-title';
        title.textContent = `${(window.i18n?.t('tab_online') || 'В сети').toUpperCase()} — ${onlineFriends.length}`;
        content.appendChild(title);
        onlineFriends.forEach(f => content.appendChild(buildFriendItem(f, true)));
      }
      break;
    }

    case 'pending': {
      if (incoming.length === 0 && pending.length === 0) {
        content.appendChild(buildEmptyPending());
        break;
      }
      if (incoming.length > 0) {
        const t = document.createElement('div');
        t.className = 'friends-section-title';
        t.textContent = `${window.i18n?.t('friends_incoming') || 'ВХОДЯЩИЕ'} — ${incoming.length}`;
        content.appendChild(t);
        incoming.forEach(item => content.appendChild(buildPendingItem(item.from, 'incoming')));
      }
      if (pending.length > 0) {
        const t = document.createElement('div');
        t.className = 'friends-section-title friends-section-title--spaced';
        t.textContent = `${window.i18n?.t('friends_outgoing') || 'ИСХОДЯЩИЕ'} — ${pending.length}`;
        content.appendChild(t);
        pending.forEach(item => content.appendChild(buildPendingItem(item.to, 'outgoing')));
      }
      break;
    }

    case 'add': {
      content.appendChild(buildAddFriendSection());
      break;
    }
  }
}

/**
 * Empty state — общий конструктор. ВАЖНО: title/desc приходят из i18n
 * (статика), но всё равно вставляем через textContent — никогда не
 * рендерим пользовательские данные через innerHTML.
 */
function buildEmptyState(icon, title, desc, action) {
  const wrap = document.createElement('div');
  wrap.className = 'empty-state';

  const iconEl = document.createElement('div');
  iconEl.className = 'empty-state-icon';
  iconEl.textContent = icon;
  wrap.appendChild(iconEl);

  const titleEl = document.createElement('div');
  titleEl.className = 'empty-state-title';
  titleEl.textContent = title;
  wrap.appendChild(titleEl);

  if (desc) {
    const descEl = document.createElement('div');
    descEl.className = 'empty-state-desc';
    descEl.textContent = desc;
    wrap.appendChild(descEl);
  }

  if (action && typeof action.onClick === 'function') {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'empty-state-btn';
    btn.textContent = action.label;
    btn.addEventListener('click', action.onClick);
    wrap.appendChild(btn);
  }

  return wrap;
}

function buildEmptyAllFriends() {
  return buildEmptyState(
    '👥',
    'У тебя пока нет друзей',
    'Добавь друга по имени пользователя, чтобы начать общение.',
    {
      label: 'Добавить в друзья',
      onClick: () => {
        switchFriendsTab('add');
        // Дать DOM перерисоваться, потом сфокусировать input.
        requestAnimationFrame(() => {
          const input = document.getElementById('add-friend-input');
          if (input) input.focus();
        });
      }
    }
  );
}

function buildEmptyOnlineFriends() {
  return buildEmptyState(
    '🌙',
    'Сейчас никого нет в сети',
    'Когда друзья появятся онлайн, они будут здесь.'
  );
}

function buildEmptyPending() {
  return buildEmptyState(
    '📭',
    'Нет ожидающих заявок',
    'Новые входящие и исходящие заявки появятся здесь.'
  );
}

/**
 * Add Friend секция — собирается через DOM API, обработчики через
 * addEventListener (никаких inline onclick / onkeydown).
 */
function buildAddFriendSection() {
  const section = document.createElement('div');
  section.className = 'add-friend-section';

  const title = document.createElement('div');
  title.className = 'add-friend-title';
  title.textContent = (window.i18n?.t('tab_add') || 'Добавить').toUpperCase();
  section.appendChild(title);

  const desc = document.createElement('div');
  desc.className = 'add-friend-desc';
  desc.textContent = window.i18n?.t('friends_add_desc') || 'Вы можете добавить друга по его имени пользователя.';
  section.appendChild(desc);

  const wrapper = document.createElement('div');
  wrapper.className = 'add-friend-input-wrapper';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'add-friend-input';
  input.id = 'add-friend-input';
  input.placeholder = window.i18n?.t('auth_username') || 'Имя пользователя';
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendFriendRequest();
  });
  wrapper.appendChild(input);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'add-friend-btn';
  btn.textContent = window.i18n?.t('friends_add_btn') || 'Добавить';
  btn.addEventListener('click', sendFriendRequest);
  wrapper.appendChild(btn);

  section.appendChild(wrapper);

  const result = document.createElement('div');
  result.id = 'friend-request-status';
  result.className = 'friend-request-status';
  section.appendChild(result);

  return section;
}

/**
 * Построить DOM-элемент друга. Все пользовательские данные (username,
 * status) вставляются через textContent — никаких innerHTML для user
 * data. SVG-иконки кнопок — статика, поэтому innerHTML допустим только
 * для них.
 */
function buildFriendItem(friend, showActions) {
  const status = friend.status || 'offline';
  const statusText = { 
    online: window.i18n.t('status_online'), 
    idle: window.i18n.t('status_idle'), 
    dnd: window.i18n.t('status_dnd'), 
    offline: window.i18n.t('status_offline') 
  }[status] || window.i18n.t('status_offline');

  // Создаем элемент через DOM API для безопасности
  const friendItem = document.createElement('div');
  friendItem.className = 'friend-item';
  friendItem.dataset.userId = friend._id;
  
  // Аватар
  const friendAvatar = document.createElement('div');
  friendAvatar.className = 'friend-avatar';
  
  const avatarImg = document.createElement('img');
  avatarImg.src = getAvatarUrl(friend.avatar, friend.username, friend._id);
  avatarImg.alt = escapeHtml(friend.username);
  
  friendAvatar.appendChild(avatarImg);
  
  // Информация
  const friendInfo = document.createElement('div');
  friendInfo.className = 'friend-info';
  
  const friendName = document.createElement('div');
  friendName.className = 'friend-name';
  friendName.textContent = friend.nickname || friend.username; // ИСПРАВЛЕНО: Безопасно через textContent
  
  if (friend.role === 'owner') {
    const crownSpan = document.createElement('span');
    crownSpan.title = window.i18n.t('role_creator');
    crownSpan.style.fontSize = '1.1em';
    crownSpan.textContent = ' 👑';
    friendName.appendChild(crownSpan);
  }
  
  const friendStatus = document.createElement('div');
  friendStatus.className = 'friend-status';
  friendStatus.textContent = statusText;
  
  friendInfo.appendChild(friendName);
  friendInfo.appendChild(friendStatus);
  
  friendItem.appendChild(friendAvatar);
  friendItem.appendChild(friendInfo);
  
  // Действия
  if (showActions) {
    const friendActions = document.createElement('div');
    friendActions.className = 'friend-actions';
    
    // Кнопка сообщения
    const msgBtn = document.createElement('button');
    msgBtn.className = 'friend-action-btn';
    msgBtn.title = window.i18n.t('friends_action_msg');
    msgBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
    </svg>`;
    msgBtn.addEventListener('click', () => openDMWithUser(friend._id));
    
    // Кнопка удаления
    const removeBtn = document.createElement('button');
    removeBtn.className = 'friend-action-btn remove';
    removeBtn.title = window.i18n.t('friends_action_remove');
    removeBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
    </svg>`;
    removeBtn.addEventListener('click', () => removeFriend(friend._id));
    
    friendActions.appendChild(msgBtn);
    friendActions.appendChild(removeBtn);
    friendItem.appendChild(friendActions);
  }

  return friendItem;
}

/**
 * Построить DOM-элемент ожидающей заявки.
 */
function buildPendingItem(user, type) {
  // Создаем элемент через DOM API для безопасности
  const friendItem = document.createElement('div');
  friendItem.className = 'friend-item';
  friendItem.dataset.userId = user._id;
  
  // Аватар
  const friendAvatar = document.createElement('div');
  friendAvatar.className = 'friend-avatar';
  
  const avatarImg = document.createElement('img');
  avatarImg.src = getAvatarUrl(user.avatar, user.username, user._id);
  avatarImg.alt = escapeHtml(user.username);
  
  friendAvatar.appendChild(avatarImg);
  
  // Информация
  const friendInfo = document.createElement('div');
  friendInfo.className = 'friend-info';
  
  const friendName = document.createElement('div');
  friendName.className = 'friend-name';
  friendName.textContent = user.nickname || user.username; // ИСПРАВЛЕНО: Безопасно через textContent
  
  if (user.role === 'owner') {
    const crownSpan = document.createElement('span');
    crownSpan.title = window.i18n.t('role_creator');
    crownSpan.style.fontSize = '1.1em';
    crownSpan.textContent = ' 👑';
    friendName.appendChild(crownSpan);
  }
  
  const friendStatus = document.createElement('div');
  friendStatus.className = 'friend-status';
  friendStatus.textContent = type === 'incoming' ? window.i18n.t('friends_req_incoming') : window.i18n.t('friends_req_outgoing');
  
  friendInfo.appendChild(friendName);
  friendInfo.appendChild(friendStatus);
  
  friendItem.appendChild(friendAvatar);
  friendItem.appendChild(friendInfo);
  
  // Действия
  const friendActions = document.createElement('div');
  friendActions.className = 'friend-actions';
  
  if (type === 'incoming') {
    // Кнопка принять
    const acceptBtn = document.createElement('button');
    acceptBtn.className = 'friend-action-btn accept';
    acceptBtn.title = window.i18n.t('friends_action_accept');
    acceptBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
    </svg>`;
    acceptBtn.addEventListener('click', () => acceptFriendRequest(user._id));
    
    // Кнопка отклонить
    const declineBtn = document.createElement('button');
    declineBtn.className = 'friend-action-btn decline';
    declineBtn.title = window.i18n.t('friends_action_decline');
    declineBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>`;
    declineBtn.addEventListener('click', () => declineFriendRequest(user._id));
    
    friendActions.appendChild(acceptBtn);
    friendActions.appendChild(declineBtn);
  } else {
    // Кнопка отменить
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'friend-action-btn decline';
    cancelBtn.title = window.i18n.t('friends_action_cancel');
    cancelBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>`;
    cancelBtn.addEventListener('click', () => cancelFriendRequest(user._id));
    
    friendActions.appendChild(cancelBtn);
  }
  
  friendItem.appendChild(friendActions);

  return friendItem;
}

// Алиас для совместимости с HTML
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;
window.cancelFriendRequest = cancelFriendRequest;
window.sendFriendRequest = sendFriendRequest;
window.removeFriend = removeFriend;

/**
 * Биндинг кнопок вкладок Friends. Никаких inline onclick — только
 * addEventListener. Делается один раз при загрузке DOM.
 */
function bindFriendsTabs() {
  // Берём ВСЕ элементы с data-friends-tab внутри friends-view:
  //  - .friends-tab — собственно вкладки;
  //  - #friends-add-btn — постоянная кнопка "Добавить в друзья" в шапке;
  //  - .empty-state-btn (динамические) биндятся отдельно при создании.
  document.querySelectorAll('#friends-view [data-friends-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-friends-tab');
      if (!tab) return;
      switchFriendsTab(tab);
      // Если переключаемся на "Добавить" — сразу фокусим input.
      if (tab === 'add') {
        requestAnimationFrame(() => {
          const input = document.getElementById('add-friend-input');
          if (input) input.focus();
        });
      }
    });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindFriendsTabs);
} else {
  bindFriendsTabs();
}

/**
 * Отправить запрос в друзья
 */
async function sendFriendRequest() {
  const input = document.getElementById('add-friend-input');
  const resultEl = document.getElementById('friend-request-status');
  const username = input?.value.trim();

  if (!username) return;

  // Утилита: задать сообщение результата с правильным состоянием
  const setResult = (text, kind) => {
    if (!resultEl) return;
    resultEl.textContent = text;
    resultEl.className = 'friend-request-status';
    if (kind) resultEl.classList.add(kind);
    
    setTimeout(() => {
      if (resultEl.textContent === text) {
        resultEl.textContent = '';
        resultEl.className = 'friend-request-status';
      }
    }, 4000);
  };

  try {
    // Ищем пользователя
    const searchData = await UsersAPI.search(username);
    const users = searchData.users || [];

    if (users.length === 0) {
      setResult('Пользователь не найден', 'error');
      return;
    }

    const targetUser = users.find(u => u.username.toLowerCase() === username.toLowerCase()) || users[0];

    if (targetUser._id === window.currentUser?._id) {
      setResult('Вы не можете добавить себя в друзья', 'error');
      return;
    }

    const data = await FriendsAPI.sendRequest(targetUser._id);

    // Проверяем, был ли автоматически принят входящий запрос
    if (data.autoAccepted) {
      setResult('Этот пользователь уже в друзьях', 'warning');
    } else {
      socketNotifyFriendRequest(targetUser._id);
      setResult('Заявка отправлена', 'success');
    }

    if (input) input.value = '';
    loadFriends();
  } catch (error) {
    if (error.message.includes('уже')) {
      setResult('Этот пользователь уже в друзьях', 'warning');
    } else {
      setResult('Не удалось отправить заявку', 'error');
    }
  }
}

/**
 * Принять запрос в друзья
 */
async function acceptFriendRequest(userId) {
  try {
    await FriendsAPI.accept(userId);
    socketNotifyFriendAccepted(userId);
    loadFriends();
  } catch (error) {
    console.error(error.message);
  }
}

/**
 * Отклонить запрос в друзья
 */
async function declineFriendRequest(userId) {
  try {
    await FriendsAPI.decline(userId);
    loadFriends();
  } catch (error) {
    console.error(error.message);
  }
}

/**
 * Отменить исходящий запрос
 */
async function cancelFriendRequest(userId) {
  try {
    await FriendsAPI.cancelRequest(userId);
    loadFriends();
  } catch (error) {
    console.error(error.message);
  }
}

/**
 * Удалить из друзей
 */
async function removeFriend(userId) {
  if (!confirm('Удалить этого пользователя из друзей?')) return;
  try {
    await FriendsAPI.remove(userId);
    loadFriends();
  } catch (error) {
    console.error(error.message);
  }
}
