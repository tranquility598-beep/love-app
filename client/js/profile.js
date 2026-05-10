/**
 * Управление профилями пользователей
 */

let currentProfileUserId = null;

/**
 * Открыть профиль пользователя
 */
function openProfile(userId) {
  if (!window.socket) {
    console.error('Socket not connected');
    return;
  }
  
  currentProfileUserId = userId;
  const modal = document.getElementById('profile-modal');
  const editBtn = document.getElementById('profile-edit-btn');
  const messageBtn = document.getElementById('profile-message-btn');
  const blockBtn = document.getElementById('profile-block-btn');
  
  // Показываем модалку
  if (modal) modal.classList.remove('hidden');
  
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
  const modal = document.getElementById('profile-modal');
  modal.classList.add('hidden');
  currentProfileUserId = null;
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
  const status = document.getElementById('profile-status');
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
  
  // Имя пользователя
  username.textContent = profile.username;
  
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
  
  // Статус
  status.className = 'profile-status-indicator ' + (profile.status || 'offline');
  
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

if (window.socket) {
  // Получены данные профиля
  window.socket.on('profile:data', (profile) => {
    displayProfile(profile);
  });
  
  // Профиль успешно обновлен
  window.socket.on('profile:update_success', (profile) => {
    // Обновляем текущего пользователя
    window.currentUser = { ...window.currentUser, ...profile };
    
    // Обновляем отображение профиля если он открыт
    if (currentProfileUserId === profile._id) {
      displayProfile(profile);
    }
    
    // Показываем уведомление
    if (typeof showNotification === 'function') {
      showNotification('success', 'Профиль успешно обновлен');
    }
  });
  
  // Профиль другого пользователя обновлен
  window.socket.on('profile:updated', (data) => {
    // Обновляем отображение если профиль открыт
    if (currentProfileUserId === data.userId) {
      displayProfile(data.profile);
    }
  });
  
  // Пользователь заблокирован
  window.socket.on('user:blocked', (data) => {
    if (typeof showNotification === 'function') showNotification('success', 'Пользователь заблокирован');
  });
  
  // Пользователь разблокирован
  window.socket.on('user:unblocked', (data) => {
    if (typeof showNotification === 'function') showNotification('success', 'Пользователь разблокирован');
  });
}

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
  
  // Закрытие модалки по клику вне её
  const modal = document.getElementById('profile-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeProfileModal();
      }
    });
  }
});

// Дубликат функции showNotification удален. Используется глобальная из ui.js
