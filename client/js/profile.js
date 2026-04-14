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
  const editForm = document.getElementById('profile-edit-form');
  const editBtn = document.getElementById('profile-edit-btn');
  const messageBtn = document.getElementById('profile-message-btn');
  const blockBtn = document.getElementById('profile-block-btn');
  
  // Показываем модалку
  modal.classList.remove('hidden');
  editForm.classList.add('hidden');
  
  // Проверяем свой ли это профиль
  const isOwnProfile = userId === window.currentUser._id;
  
  if (isOwnProfile) {
    editBtn.style.display = 'block';
    messageBtn.style.display = 'none';
    blockBtn.style.display = 'none';
  } else {
    editBtn.style.display = 'none';
    messageBtn.style.display = 'block';
    blockBtn.style.display = 'block';
  }
  
  // Запрашиваем данные профиля
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

/**
 * Показать форму редактирования профиля
 */
function showEditProfile() {
  const editForm = document.getElementById('profile-edit-form');
  const editBioTextarea = document.getElementById('profile-edit-bio');
  const editBannerInput = document.getElementById('profile-edit-banner');
  const editColorInput = document.getElementById('profile-edit-color');
  const editUsernameInput = document.getElementById('profile-edit-username');
  const editYoutubeInput = document.getElementById('profile-edit-youtube');
  const editTiktokInput = document.getElementById('profile-edit-tiktok');
  
  // Заполняем форму текущими данными
  if (editUsernameInput) editUsernameInput.value = window.currentUser.username || '';
  editBioTextarea.value = window.currentUser.bio || '';
  editBannerInput.value = window.currentUser.banner || '';
  editColorInput.value = window.currentUser.profileColor || '#5865F2';
  
  if (window.currentUser.connectedAccounts) {
    if (window.currentUser.connectedAccounts.youtube && editYoutubeInput) {
      editYoutubeInput.value = window.currentUser.connectedAccounts.youtube.url || '';
    }
    if (window.currentUser.connectedAccounts.tiktok && editTiktokInput) {
      editTiktokInput.value = window.currentUser.connectedAccounts.tiktok.url || '';
    }
  }
  
  updateBioCharCount();
  
  editForm.classList.remove('hidden');
}

/**
 * Отменить редактирование профиля
 */
function cancelEditProfile() {
  const editForm = document.getElementById('profile-edit-form');
  editForm.classList.add('hidden');
}

/**
 * Сохранить изменения профиля
 */
async function submitProfileModal() {
  const username = document.getElementById('profile-edit-username').value;
  const bio = document.getElementById('profile-edit-bio').value;
  const banner = document.getElementById('profile-edit-banner').value;
  const profileColor = document.getElementById('profile-edit-color').value;
  const avatarFileEl = document.getElementById('profile-edit-avatar-file');
  const avatarFile = avatarFileEl ? avatarFileEl.files[0] : null;

  if (avatarFile) {
    try {
      const formData = new FormData();
      formData.append('avatar', avatarFile);
      const res = await fetch((window.BASE_URL || '') + '/api/users/avatar', {
        method: 'PUT',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') },
        body: formData
      });
      if (!res.ok) throw new Error('Ошибка загрузки аватара');
    } catch (e) {
      console.error(e);
      showNotification('Ошибка загрузки аватара', 'error');
    }
  }

  window.socket.emit('profile:update', {
    username,
    bio,
    banner: banner || null,
    profileColor
  });
  
  cancelEditProfile();
}

function connectIntegration(platform) {
  const inputId = platform === 'youtube' ? 'profile-edit-youtube' : 'profile-edit-tiktok';
  const url = document.getElementById(inputId).value;
  if (!url) return showNotification('Введите URL', 'error');
  
  window.socket.emit('integration:connect', { platform, url });
}

/**
 * Обновить счетчик символов биографии
 */
function updateBioCharCount() {
  const textarea = document.getElementById('profile-edit-bio');
  const counter = document.getElementById('bio-char-count');
  if (textarea && counter) {
    counter.textContent = textarea.value.length;
  }
}

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
    banner.style.background = profile.profileColor;
  }
  
  // Аватар
  avatar.src = typeof getAvatarUrl === 'function' ? getAvatarUrl(profile.avatar, profile.username) : (profile.avatar || 'https://via.placeholder.com/100?text=' + (profile.username ? profile.username[0] : '?'));
  
  // Имя пользователя
  username.textContent = profile.username;
  
  // Биография
  bio.textContent = profile.bio || 'Биография не указана';
  
  // Дата регистрации
  if (profile.createdAt) {
    const date = new Date(profile.createdAt);
    memberSince.textContent = `Участник с: ${!isNaN(date.valueOf()) ? date.toLocaleDateString('ru-RU') : 'Неизвестно'}`;
  } else {
    memberSince.textContent = 'Участник с: Неизвестно';
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
    showNotification('Профиль успешно обновлен', 'success');
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
    showNotification('Пользователь заблокирован', 'success');
  });
  
  // Пользователь разблокирован
  window.socket.on('user:unblocked', (data) => {
    showNotification('Пользователь разблокирован', 'success');
  });
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', () => {
  // Кнопка редактирования профиля
  const editBtn = document.getElementById('profile-edit-btn');
  if (editBtn) {
    editBtn.addEventListener('click', showEditProfile);
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
  
  // Счетчик символов биографии
  const bioTextarea = document.getElementById('profile-edit-bio');
  if (bioTextarea) {
    bioTextarea.addEventListener('input', updateBioCharCount);
  }
  
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

// Показать уведомление
function showNotification(message, type = 'info') {
  // Создаем элемент уведомления
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.textContent = message;
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 20px;
    background: ${type === 'success' ? '#43b581' : type === 'error' ? '#f04747' : '#5865f2'};
    color: white;
    border-radius: 4px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
    z-index: 10000;
    animation: slideIn 0.3s ease;
  `;
  
  document.body.appendChild(notification);
  
  // Удаляем через 3 секунды
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}
