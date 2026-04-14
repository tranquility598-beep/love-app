/**
 * Управление закрепленными сообщениями
 */

let currentChannelPinnedMessages = [];

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
 * Показать модальное окно с закрепленными сообщениями
 */
function showPinnedMessages() {
  const modal = document.getElementById('pinned-modal');
  const list = document.getElementById('pinned-messages-list');
  
  modal.classList.remove('hidden');
  list.innerHTML = '<div class="loading-spinner">Загрузка...</div>';
  
  // Отображаем закрепленные сообщения
  if (currentChannelPinnedMessages.length === 0) {
    list.innerHTML = '<div class="loading-spinner">Нет закрепленных сообщений</div>';
    return;
  }
  
  list.innerHTML = '';
  currentChannelPinnedMessages.forEach(msg => {
    const messageEl = createPinnedMessageElement(msg);
    list.appendChild(messageEl);
  });
}

/**
 * Закрыть модальное окно закрепленных сообщений
 */
function closePinnedModal() {
  const modal = document.getElementById('pinned-modal');
  modal.classList.add('hidden');
}

/**
 * Создать элемент закрепленного сообщения
 */
function createPinnedMessageElement(msg) {
  const div = document.createElement('div');
  div.className = 'pinned-message-item';
  div.dataset.messageId = msg._id;
  
  const author = msg.author || {};
  const authorName = author.username || 'Неизвестный';
  const authorAvatar = author.avatar || `https://via.placeholder.com/32?text=${authorName[0]}`;
  
  const date = new Date(msg.createdAt);
  const time = date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  div.innerHTML = `
    <div class="pinned-message-header">
      <img class="pinned-message-avatar" src="${authorAvatar}" alt="${authorName}">
      <span class="pinned-message-author">${authorName}</span>
      <span class="pinned-message-time">${time}</span>
    </div>
    <div class="pinned-message-body">${escapeHtml(msg.content || '')}</div>
    <div class="pinned-message-actions">
      <button class="pinned-action-btn" onclick="jumpToMessage('${msg._id}')">Перейти</button>
      <button class="pinned-action-btn unpin" onclick="unpinMessage('${msg._id}', '${msg.channel}')">Открепить</button>
    </div>
  `;
  
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
    
    // Подсветка сообщения
    messageEl.style.background = 'var(--accent-primary)';
    messageEl.style.opacity = '0.3';
    setTimeout(() => {
      messageEl.style.transition = 'all 0.5s';
      messageEl.style.background = '';
      messageEl.style.opacity = '';
    }, 100);
    setTimeout(() => {
      messageEl.style.transition = '';
    }, 600);
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

if (window.socket) {
  // Сообщение закреплено
  window.socket.on('message:pinned', (data) => {
    const { messageId, channelId } = data;
    
    // Обновляем список закрепленных
    loadPinnedMessages(channelId);
    
    // Показываем уведомление
    showNotification('Сообщение закреплено', 'success');
  });
  
  // Сообщение откреплено
  window.socket.on('message:unpinned', (data) => {
    const { messageId, channelId } = data;
    
    // Обновляем список закрепленных
    loadPinnedMessages(channelId);
    
    // Показываем уведомление
    showNotification('Сообщение откреплено', 'success');
  });
  
  // Получен список закрепленных сообщений
  window.socket.on('message:pinned_list', (data) => {
    const { channelId, messages } = data;
    
    currentChannelPinnedMessages = messages || [];
    
    // Обновляем баннер
    showPinnedBanner(currentChannelPinnedMessages.length);
    
    // Если модалка открыта, обновляем её
    const modal = document.getElementById('pinned-modal');
    if (!modal.classList.contains('hidden')) {
      showPinnedMessages();
    }
  });
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', () => {
  // Закрытие модалки по клику вне её
  const modal = document.getElementById('pinned-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closePinnedModal();
      }
    });
  }
});

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
