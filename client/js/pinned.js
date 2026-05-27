/**
 * Управление закрепленными сообщениями
 */

let currentChannelPinnedMessages = [];

// Export for socket handlers
window.currentChannelPinnedMessages = [];

/**
 * Закрепить сообщение
 */
function pinMessage(messageId, channelId) {
  if (!window.socket) {
    console.error('Socket not connected');
    return;
  }
  
  // Если channelId не передан, используем текущий канал
  if (!channelId) {
    channelId = window.currentChannelId;
  }
  
  if (!channelId) {
    console.error('No channel ID');
    return;
  }
  
  window.socket.emit('message:pin', { messageId, channelId });
}

/**
 * Открепить сообщение
 */
function unpinMessage(messageId, channelId) {
  if (!window.socket) return;
  
  window.socket.emit('message:unpin', { messageId, channelId });
}

/**
 * Загрузить закрепленные сообщения для канала
 */
function loadPinnedMessages(channelId) {
  if (!window.socket) return;
  
  window.socket.emit('message:get_pinned', { channelId });
}

/**
 * Обновить закрепленные сообщения для текущего канала
 */
function updatePinnedForCurrentChannel() {
  if (window.currentChannelId) {
    loadPinnedMessages(window.currentChannelId);
  }
}

/**
 * Показать баннер закрепленных сообщений
 */
function showPinnedBanner(count) {
  const banner = document.getElementById('pinned-messages-banner');
  const countEl = document.getElementById('pinned-count');
  const badge = document.getElementById('pinned-count-badge');
  
  if (count > 0) {
    countEl.textContent = count;
    banner.classList.remove('hidden');
    
    // Обновляем бейдж на кнопке
    if (badge) {
      badge.textContent = count;
      badge.classList.remove('hidden');
    }
  } else {
    banner.classList.add('hidden');
    
    // Скрываем бейдж
    if (badge) {
      badge.classList.add('hidden');
    }
  }
}

/**
 * Закрыть баннер закрепленных сообщений
 */
function closePinnedBanner() {
  const banner = document.getElementById('pinned-messages-banner');
  banner.classList.add('hidden');
}

/**
 * Обновить список закрепленных сообщений (только данные, без открытия модалки)
 * Вызывается из socket handlers для обновления данных
 */
function updatePinnedMessagesData() {
  // Обновляем баннер с количеством
  showPinnedBanner(window.currentChannelPinnedMessages.length);
  
  // Если модалка уже открыта, обновляем её содержимое
  const modal = document.getElementById('pinned-modal');
  if (modal && !modal.classList.contains('hidden')) {
    renderPinnedMessagesList();
  }
}

/**
 * Отрендерить список закрепленных сообщений в модалке
 * (не открывает модалку, только обновляет содержимое)
 */
function renderPinnedMessagesList() {
  const list = document.getElementById('pinned-messages-list');
  if (!list) return;
  
  if (window.currentChannelPinnedMessages.length === 0) {
    list.innerHTML = '<div class="loading-spinner">Нет закрепленных сообщений</div>';
    return;
  }
  
  list.innerHTML = '';
  window.currentChannelPinnedMessages.forEach(msg => {
    const messageEl = createPinnedMessageElement(msg);
    list.appendChild(messageEl);
  });
}

/**
 * Показать модальное окно с закрепленными сообщениями
 * Вызывается только при клике пользователя на кнопку
 */
function showPinnedMessages() {
  const modal = document.getElementById('pinned-modal');
  const list = document.getElementById('pinned-messages-list');
  
  if (typeof openModal === 'function') {
    openModal('pinned-modal');
  }
  list.innerHTML = '<div class="loading-spinner">Загрузка...</div>';
  
  // Отображаем закрепленные сообщения
  renderPinnedMessagesList();
}

/**
 * Закрыть модальное окно закрепленных сообщений
 */
function closePinnedModal() {
  if (typeof closeModal === 'function') {
    closeModal('pinned-modal');
  }
}

/**
 * Создать элемент закрепленного сообщения
 */
function createPinnedMessageElement(msg) {
  const div = document.createElement('div');
  div.className = 'pinned-message-item';
  div.dataset.messageId = msg._id;
  
  const author = msg.author || {};
  const authorName = author.username || author.nickname || 'Unknown';
  const authorAvatar = (typeof getAvatarUrl === 'function') ? getAvatarUrl(author.avatar, authorName, author._id || author.id) : (author.avatar || `assets/images/default-avatar.png`);
  
  const date = new Date(msg.createdAt);
  const time = date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Создаем элементы безопасно через DOM API
  const header = document.createElement('div');
  header.className = 'pinned-message-header';
  
  const avatar = document.createElement('img');
  avatar.className = 'pinned-message-avatar';
  avatar.src = authorAvatar;
  avatar.alt = escapeHtml(authorName);
  
  const authorSpan = document.createElement('span');
  authorSpan.className = 'pinned-message-author';
  authorSpan.textContent = authorName; // ИСПРАВЛЕНО: Безопасно через textContent
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'pinned-message-time';
  timeSpan.textContent = time;
  
  header.appendChild(avatar);
  header.appendChild(authorSpan);
  header.appendChild(timeSpan);
  
  // Тело сообщения
  const body = document.createElement('div');
  body.className = 'pinned-message-body';
  body.textContent = msg.content || ''; // ИСПРАВЛЕНО: Безопасно через textContent (уже было escapeHtml, но textContent надежнее)
  
  // Действия
  const actions = document.createElement('div');
  actions.className = 'pinned-message-actions';
  
  const jumpBtn = document.createElement('button');
  jumpBtn.className = 'pinned-action-btn';
  jumpBtn.textContent = 'Перейти';
  jumpBtn.addEventListener('click', () => jumpToMessage(msg._id));
  
  const unpinBtn = document.createElement('button');
  unpinBtn.className = 'pinned-action-btn unpin';
  unpinBtn.textContent = 'Открепить';
  unpinBtn.addEventListener('click', () => unpinMessage(msg._id, msg.channel));
  
  actions.appendChild(jumpBtn);
  actions.appendChild(unpinBtn);
  
  div.appendChild(header);
  div.appendChild(body);
  div.appendChild(actions);
  
  return div;
}

/**
 * Перейти к сообщению
 */
function jumpToMessage(messageId) {
  closePinnedModal();
  
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (messageEl) {
    messageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Подсветка сообщения (белый свет)
    messageEl.style.transition = 'background-color 0.2s ease';
    messageEl.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
    setTimeout(() => {
      messageEl.style.transition = 'background-color 1.5s ease';
      messageEl.style.backgroundColor = '';
    }, 1000);
    setTimeout(() => {
      messageEl.style.transition = '';
    }, 2500);
  }
}

/**
 * Добавить кнопку закрепления в действия сообщения
 */
function addPinButtonToMessage(messageId, channelId, isPinned) {
  const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!messageEl) return;
  
  const actionsEl = messageEl.querySelector('.message-actions');
  if (!actionsEl) return;
  
  // Проверяем есть ли уже кнопка
  let pinBtn = actionsEl.querySelector('.pin-btn');
  if (!pinBtn) {
    pinBtn = document.createElement('button');
    pinBtn.className = 'message-action-btn pin-btn';
    pinBtn.title = 'Закрепить';
    pinBtn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M22 12l-9.899-9.899-1.415 1.413 1.415 1.415-4.95 4.95-5.657-5.657-1.414 1.414 5.657 5.657-4.95 4.95-1.415-1.413L0 16.243 7.071 23.314l1.414-1.414-1.413-1.415 4.95-4.95 5.657 5.657 1.414-1.414-5.657-5.657 4.95-4.95 1.415 1.413L22 12z"/>
      </svg>
    `;
    pinBtn.onclick = () => {
      if (isPinned) {
        unpinMessage(messageId, channelId);
      } else {
        pinMessage(messageId, channelId);
      }
    };
    
    // Вставляем перед кнопкой удаления
    const deleteBtn = actionsEl.querySelector('.delete-btn');
    if (deleteBtn) {
      actionsEl.insertBefore(pinBtn, deleteBtn);
    } else {
      actionsEl.appendChild(pinBtn);
    }
  }
  
  // Обновляем состояние кнопки
  if (isPinned) {
    pinBtn.classList.add('pinned');
    pinBtn.title = 'Открепить';
  } else {
    pinBtn.classList.remove('pinned');
    pinBtn.title = 'Закрепить';
  }
}

/**
 * Экранирование HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== SOCKET ОБРАБОТЧИКИ ====================

// Socket listeners now managed via socket.js lifecycle system

// ==================== EVENT LISTENERS ====================

// Click-outside handler is now managed by ModalManager in ui.js
// No need for duplicate event listeners here

// Показать уведомление (если не определена в profile.js)
if (typeof showNotification === 'undefined') {
  function showNotification(message, type = 'info') {
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
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Export functions for socket handlers
window.loadPinnedMessages = loadPinnedMessages;
window.updatePinnedMessagesData = updatePinnedMessagesData; // For socket handlers - does NOT open modal
window.showPinnedMessages = showPinnedMessages; // For user clicks - DOES open modal
