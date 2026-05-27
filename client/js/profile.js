/**
 * Управление профилями пользователей
 */

let currentProfileUserId = null;
window.currentProfileUserId = null; // Export for socket handlers

/**
 * Открыть профиль пользователя
 */
function openProfile(userId) {
  if (!window.socket) {
    console.error('Socket not connected');
    return;
  }
  
  currentProfileUserId = userId;
  window.currentProfileUserId = userId;
  const modal = document.getElementById('profile-modal');
  const editBtn = document.getElementById('profile-edit-btn');
  const messageBtn = document.getElementById('profile-message-btn');
  const blockBtn = document.getElementById('profile-block-btn');
  
  // Показываем модалку через ModalManager
  if (modal && typeof openModal === 'function') {
    openModal('profile-modal');
  }
  
  // Проверяем свой ли это профиль
  const isOwnProfile = userId === window.currentUser._id;
  
  if (isOwnProfile) {
    // В большой карточке прячем кнопку "Редактировать" — она теперь в popover
    if (editBtn) editBtn.style.display = 'none';
    if (messageBtn) messageBtn.style.display = 'none';
    if (blockBtn) blockBtn.style.display = 'none';
    // Сразу показываем свои данные, чтобы не было пустой карточки до ответа сервера
    displayProfile(window.currentUser);
  } else {
    if (editBtn) editBtn.style.display = 'none';
    if (messageBtn) messageBtn.style.display = 'block';
    if (blockBtn) blockBtn.style.display = 'block';
  }
  
  // Запрашиваем актуальные данные профиля
  window.socket.emit('profile:get', { userId });
}

/**
 * Закрыть модалку профиля
 */
function closeProfileModal() {
  if (typeof closeModal === 'function') {
    closeModal('profile-modal');
  }
  currentProfileUserId = null;
  window.currentProfileUserId = null;
}

// Функции редактирования профиля перенесены в настройки (settings.js/ui.js)

/**
 * Отобразить данные профиля
 */
function displayProfile(profile) {
  const banner = document.getElementById('profile-banner');
  const avatar = document.getElementById('profile-avatar');
  const username = document.getElementById('profile-username');
  const bio = document.getElementById('profile-bio');
  const memberSince = document.getElementById('profile-member-since');
  const badges = document.getElementById('profile-badges');
  
  // Баннер
  banner.style.backgroundImage = '';
  banner.style.background = '';
  if (profile.banner) {
    banner.style.backgroundImage = `url(${profile.banner})`;
  } else if (profile.profileColor) {
    // Допускаем только hex (#RGB / #RRGGBB) — защита от CSS-инъекций.
    const c = String(profile.profileColor);
    if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) {
      banner.style.background = c;
    }
  }
  
  // Аватар
  avatar.src = typeof getAvatarUrl === 'function' ? getAvatarUrl(profile.avatar, profile.username) : (profile.avatar || 'https://via.placeholder.com/100?text=' + (profile.username ? profile.username[0] : '?'));
  
  // Render status dot overlay
  const statusDot = document.getElementById('profile-status-dot');
  if (statusDot) {
    const profileId = profile._id || profile.id;
    let currentStatus = profile.status || 'online';
    
    // Check if it's current user
    if (window.currentUser && window.currentUser._id === profileId) {
      currentStatus = window.currentUser.status || 'online';
    } else if (profileId) {
      // Find any existing status dot for this user on the page to get real-time state
      const existingDot = document.querySelector(`[data-user-id="${profileId}"] .status-dot`);
      if (existingDot) {
        if (existingDot.classList.contains('online')) currentStatus = 'online';
        else if (existingDot.classList.contains('idle')) currentStatus = 'idle';
        else if (existingDot.classList.contains('dnd')) currentStatus = 'dnd';
        else if (existingDot.classList.contains('offline')) currentStatus = 'offline';
      }
    }
    
    statusDot.className = 'status-dot ' + currentStatus;
  }
  
  // Имя пользователя (Никнейм)
  if (username) {
    username.textContent = profile.nickname || profile.username;
    
    // Системный юзернейм (ручка)
    let handle = document.getElementById('profile-username-handle');
    if (!handle) {
      handle = document.createElement('div');
      handle.id = 'profile-username-handle';
      handle.className = 'profile-username-handle';
      username.parentNode.insertBefore(handle, username.nextSibling);
    }
    handle.textContent = `@${profile.username}`;
  }
  
  // Биография
  bio.textContent = profile.bio ? profile.bio : 'Биография не указана';
  
  // Дата регистрации
  if (profile.createdAt) {
    const date = new Date(profile.createdAt);
    memberSince.textContent = `Участник с: ${!isNaN(date.valueOf()) ? date.toLocaleDateString('ru-RU') : 'Неизвестно'}`;
    memberSince.style.display = 'block';
  } else {
    memberSince.style.display = 'none';
  }

  // Соцсети
  const socialLinks = document.getElementById('profile-social-links');
  if (socialLinks) {
    socialLinks.innerHTML = '';
    socialLinks.style.display = 'none';
    if (profile.connectedAccounts) {
      if (profile.connectedAccounts.youtube && profile.connectedAccounts.youtube.verified) {
        socialLinks.style.display = 'flex';
        const a = document.createElement('a');
        a.className = 'social-badge youtube';
        a.href = profile.connectedAccounts.youtube.url;
        a.target = '_blank';
        a.innerHTML = '<span class="social-icon">📺</span> YouTube';
        socialLinks.appendChild(a);
      }
      if (profile.connectedAccounts.tiktok && profile.connectedAccounts.tiktok.verified) {
        socialLinks.style.display = 'flex';
        const a = document.createElement('a');
        a.className = 'social-badge tiktok';
        a.href = profile.connectedAccounts.tiktok.url;
        a.target = '_blank';
        a.innerHTML = '<span class="social-icon">🎵</span> TikTok';
        socialLinks.appendChild(a);
      }
    }
  }

  // Значки
  badges.innerHTML = '';
  if (profile.badges && profile.badges.length > 0) {
    profile.badges.forEach(badge => {
      const badgeEl = document.createElement('span');
      badgeEl.className = 'profile-badge';
      badgeEl.title = getBadgeTitle(badge);
      badgeEl.textContent = getBadgeEmoji(badge);
      badges.appendChild(badgeEl);
    });
  }
}

/**
 * Получить эмодзи для значка
 */
function getBadgeEmoji(badge) {
  const emojis = {
    'founder': '👑',
    'verified': '✓',
    'early_supporter': '⭐',
    'bug_hunter': '🐛',
    'developer': '💻',
    'moderator': '🛡️',
    'partner': '🤝'
  };
  return emojis[badge] || '🏅';
}

/**
 * Получить название значка
 */
function getBadgeTitle(badge) {
  const titles = {
    'founder': 'Основатель',
    'verified': 'Верифицирован',
    'early_supporter': 'Ранний сторонник',
    'bug_hunter': 'Охотник за багами',
    'developer': 'Разработчик',
    'moderator': 'Модератор',
    'partner': 'Партнер'
  };
  return titles[badge] || badge;
}

/**
 * Заблокировать пользователя
 */
function blockUser() {
  if (!currentProfileUserId) return;
  
  if (confirm('Вы уверены, что хотите заблокировать этого пользователя?')) {
    window.socket.emit('user:block', { userId: currentProfileUserId });
    closeProfileModal();
  }
}

/**
 * Написать сообщение пользователю
 */
function messageUser() {
  if (!currentProfileUserId) return;
  
  // Закрываем профиль и открываем DM
  closeProfileModal();
  
  // TODO: Открыть DM с пользователем
  console.log('Opening DM with user:', currentProfileUserId);
}

// ==================== SOCKET ОБРАБОТЧИКИ ====================

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', () => {
  // Кнопка редактирования профиля
  const editBtn = document.getElementById('profile-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      closeProfileModal();
      if (typeof showSettings === 'function') {
        showSettings();
        setTimeout(() => {
          const profileTabBtn = document.querySelector('.settings-nav-item'); // Первый пункт - обычно профиль
          if (profileTabBtn && typeof showSettingsTab === 'function') {
            showSettingsTab('profile', profileTabBtn);
          }
        }, 10);
      }
    });
  }
  
  // Кнопка блокировки
  const blockBtn = document.getElementById('profile-block-btn');
  if (blockBtn) {
    blockBtn.addEventListener('click', blockUser);
  }
  
  // Кнопка написать сообщение
  const messageBtn = document.getElementById('profile-message-btn');
  if (messageBtn) {
    messageBtn.addEventListener('click', messageUser);
  }
  
  // Счетчик символов удален вместе с формой
  
  // Клик по имени пользователя в сообщениях
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('message-author')) {
      const userId = e.target.dataset.userId;
      if (userId) {
        openProfile(userId);
      }
    }
  });
  
  // Click-outside handler is now managed by ModalManager in ui.js
  // Removed duplicate event listener
});

// Дубликат функции showNotification удален. Используется глобальная из ui.js
