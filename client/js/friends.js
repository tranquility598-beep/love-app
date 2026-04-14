/**
 * Friends модуль - система друзей
 */

let currentFriendsTab = 'online';

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

  switch (tab) {
    case 'online':
      const onlineFriends = friends.filter(f => f.status !== 'offline');
      content.innerHTML = renderFriendsList(onlineFriends, window.i18n.t('tab_online').toUpperCase(), window.i18n.t('friends_empty_online'), true);
      break;

    case 'all':
      content.innerHTML = renderFriendsList(friends, `${window.i18n.t('tab_all').toUpperCase()} — ${friends.length}`, window.i18n.t('friends_empty_all'), true);
      break;

    case 'pending':
      let pendingHtml = '';
      if (incoming.length > 0) {
        pendingHtml += `<div class="friends-section-title">${window.i18n.t('friends_incoming')} — ${incoming.length}</div>`;
        pendingHtml += incoming.map(item => renderPendingItem(item.from, 'incoming')).join('');
      }
      if (pending.length > 0) {
        pendingHtml += `<div class="friends-section-title" style="margin-top:16px">${window.i18n.t('friends_outgoing')} — ${pending.length}</div>`;
        pendingHtml += pending.map(item => renderPendingItem(item.to, 'outgoing')).join('');
      }
      if (incoming.length === 0 && pending.length === 0) {
        pendingHtml = renderEmptyState('📭', window.i18n.t('friends_empty_pending_title'), window.i18n.t('friends_empty_pending_desc'));
      }
      content.innerHTML = pendingHtml;
      break;

    case 'add':
      content.innerHTML = `
        <div class="add-friend-section">
          <div class="add-friend-title">${window.i18n.t('tab_add').toUpperCase()}</div>
          <div class="add-friend-desc">${window.i18n.t('friends_add_desc')}</div>
          <div class="add-friend-input-wrapper">
            <input type="text" class="add-friend-input" id="add-friend-input"
                   placeholder="${window.i18n.t('auth_username')}"
                   onkeydown="if(event.key==='Enter') sendFriendRequest()">
            <button class="add-friend-btn" onclick="sendFriendRequest()">${window.i18n.t('friends_add_btn')}</button>
          </div>
          <div id="add-friend-result" style="margin-top:12px;font-size:14px"></div>
        </div>
      `;
      break;
  }
}

/**
 * Отрендерить список друзей
 */
function renderFriendsList(friends, title, emptyText, showActions) {
  if (friends.length === 0) {
    return renderEmptyState('👥', emptyText, '');
  }

  return `
    <div class="friends-section-title">${title}</div>
    ${friends.map(friend => renderFriendItem(friend, showActions)).join('')}
  `;
}

/**
 * Отрендерить элемент друга
 */
function renderFriendItem(friend, showActions) {
  const status = friend.status || 'offline';
  const statusText = { 
    online: window.i18n.t('status_online'), 
    idle: window.i18n.t('status_idle'), 
    dnd: window.i18n.t('status_dnd'), 
    offline: window.i18n.t('status_offline') 
  }[status] || window.i18n.t('status_offline');

  return `
    <div class="friend-item" data-user-id="${friend._id}">
      <div class="friend-avatar">
        <img src="${getAvatarUrl(friend.avatar)}" alt="${friend.username}">
        <div class="status-dot ${status}"></div>
      </div>
      <div class="friend-info">
        <div class="friend-name">${friend.username}${friend.role === 'owner' ? ` <span title="${window.i18n.t('role_creator')}" style="font-size:1.1em">👑</span>` : ''}</div>
        <div class="friend-status">${statusText}</div>
      </div>
      ${showActions ? `
        <div class="friend-actions">
          <button class="friend-action-btn" onclick="openDMWithUser('${friend._id}')" title="${window.i18n.t('friends_action_msg')}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
            </svg>
          </button>
          <button class="friend-action-btn remove" onclick="removeFriend('${friend._id}')" title="${window.i18n.t('friends_action_remove')}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

/**
 * Отрендерить ожидающий запрос
 */
function renderPendingItem(user, type) {
  return `
    <div class="friend-item" data-user-id="${user._id}">
      <div class="friend-avatar">
        <img src="${getAvatarUrl(user.avatar)}" alt="${user.username}">
      </div>
      <div class="friend-info">
        <div class="friend-name">${user.username}${user.role === 'owner' ? ` <span title="${window.i18n.t('role_creator')}" style="font-size:1.1em">👑</span>` : ''}</div>
        <div class="friend-status">${type === 'incoming' ? window.i18n.t('friends_req_incoming') : window.i18n.t('friends_req_outgoing')}</div>
      </div>
      <div class="friend-actions">
        ${type === 'incoming' ? `
          <button class="friend-action-btn accept" onclick="acceptFriendRequest('${user._id}')" title="${window.i18n.t('friends_action_accept')}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
            </svg>
          </button>
          <button class="friend-action-btn decline" onclick="declineFriendRequest('${user._id}')" title="${window.i18n.t('friends_action_decline')}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        ` : `
          <button class="friend-action-btn decline" onclick="cancelFriendRequest('${user._id}')" title="${window.i18n.t('friends_action_cancel')}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
          </button>
        `}
      </div>
    </div>
  `;
}

// Алиас для совместимости с HTML
window.acceptFriendRequest = acceptFriendRequest;
window.declineFriendRequest = declineFriendRequest;
window.cancelFriendRequest = cancelFriendRequest;
window.sendFriendRequest = sendFriendRequest;
window.removeFriend = removeFriend;

/**
 * Отрендерить пустое состояние
 */
function renderEmptyState(icon, title, desc) {
  return `
    <div class="empty-state">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-title">${title}</div>
      <div class="empty-state-desc">${desc}</div>
    </div>
  `;
}

/**
 * Отправить запрос в друзья
 */
async function sendFriendRequest() {
  const input = document.getElementById('add-friend-input');
  const resultEl = document.getElementById('add-friend-result');
  const username = input?.value.trim();

  if (!username) return;

  try {
    // Ищем пользователя
    const searchData = await UsersAPI.search(username);
    const users = searchData.users || [];

    if (users.length === 0) {
      if (resultEl) {
        resultEl.innerHTML = `<span style="color:var(--red)">${window.i18n.t('friends_err_not_found')}</span>`;
      }
      return;
    }

    const targetUser = users.find(u => u.username.toLowerCase() === username.toLowerCase()) || users[0];

    if (targetUser._id === window.currentUser?._id) {
      if (resultEl) resultEl.innerHTML = `<span style="color:var(--red)">${window.i18n.t('friends_err_self')}</span>`;
      return;
    }

    const data = await FriendsAPI.sendRequest(targetUser._id);

    // Проверяем, был ли автоматически принят входящий запрос
    if (data.autoAccepted) {
      showNotification('success', data.message);
      if (resultEl) {
        resultEl.innerHTML = `<span style="color:var(--green)">${data.message}</span>`;
      }
    } else {
      socketNotifyFriendRequest(targetUser._id);
      showNotification('success', `Запрос в друзья отправлен ${targetUser.username}`);
      if (resultEl) {
        resultEl.innerHTML = `<span style="color:var(--green)">Запрос отправлен пользователю ${targetUser.username}!</span>`;
      }
    }

    if (input) input.value = '';
    loadFriends();
  } catch (error) {
    if (resultEl) {
      resultEl.innerHTML = `<span style="color:var(--red)">${error.message}</span>`;
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
    showNotification('success', 'Запрос принят!');
    loadFriends();
  } catch (error) {
    showNotification('error', error.message);
  }
}

/**
 * Отклонить запрос в друзья
 */
async function declineFriendRequest(userId) {
  try {
    await FriendsAPI.decline(userId);
    showNotification('info', 'Запрос отклонен');
    loadFriends();
  } catch (error) {
    showNotification('error', error.message);
  }
}

/**
 * Отменить исходящий запрос
 */
async function cancelFriendRequest(userId) {
  try {
    await FriendsAPI.cancelRequest(userId);
    showNotification('info', 'Запрос отменен');
    loadFriends();
  } catch (error) {
    showNotification('error', error.message);
  }
}

/**
 * Удалить из друзей
 */
async function removeFriend(userId) {
  if (!confirm('Удалить этого пользователя из друзей?')) return;
  try {
    await FriendsAPI.remove(userId);
    showNotification('info', 'Пользователь удален из друзей');
    loadFriends();
  } catch (error) {
    showNotification('error', error.message);
  }
}
