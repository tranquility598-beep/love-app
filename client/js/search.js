/**
 * Поиск сообщений
 */

let searchTimeout = null;
let currentSearchChannelId = null;

/**
 * Переключить панель поиска
 */
function toggleSearch() {
  const panel = document.getElementById('search-panel');
  const input = document.getElementById('search-input');
  
  if (panel.classList.contains('hidden')) {
    panel.classList.remove('hidden');
    input.focus();
    
    // Сохраняем текущий канал
    currentSearchChannelId = window.currentChannelId;
  } else {
    panel.classList.add('hidden');
    input.value = '';
    clearSearchResults();
  }
}

/**
 * Выполнить поиск
 */
function performSearch(query) {
  if (!query || query.trim().length === 0) {
    showSearchPlaceholder();
    return;
  }
  
  if (!currentSearchChannelId) {
    showSearchError('Выберите канал для поиска');
    return;
  }
  
  if (!window.socket) {
    showSearchError('Нет подключения к серверу');
    return;
  }
  
  // Показываем индикатор загрузки
  showSearchLoading();
  
  // Отправляем запрос на поиск
  window.socket.emit('message:search', {
    channelId: currentSearchChannelId,
    query: query.trim(),
    limit: 50
  });
}

/**
 * Показать placeholder
 */
function showSearchPlaceholder() {
  const results = document.getElementById('search-results');
  results.innerHTML = '<div class="search-placeholder">Введите запрос для поиска</div>';
}

/**
 * Показать индикатор загрузки
 */
function showSearchLoading() {
  const results = document.getElementById('search-results');
  results.innerHTML = '<div class="search-loading">Поиск...</div>';
}

/**
 * Показать ошибку
 */
function showSearchError(message) {
  const results = document.getElementById('search-results');
  results.innerHTML = `<div class="search-no-results">${message}</div>`;
}

/**
 * Очистить результаты поиска
 */
function clearSearchResults() {
  showSearchPlaceholder();
}

/**
 * Отобразить результаты поиска
 */
function displaySearchResults(data) {
  const { results, query } = data;
  const resultsContainer = document.getElementById('search-results');
  
  if (!results || results.length === 0) {
    resultsContainer.innerHTML = '<div class="search-no-results">Ничего не найдено</div>';
    return;
  }
  
  resultsContainer.innerHTML = '';
  
  results.forEach(msg => {
    const resultEl = createSearchResultElement(msg, query);
    resultsContainer.appendChild(resultEl);
  });
}

/**
 * Создать элемент результата поиска
 */
function createSearchResultElement(msg, query) {
  const div = document.createElement('div');
  div.className = 'search-result-item';
  div.dataset.messageId = msg._id;
  
  const author = msg.author || {};
  const authorName = author.username || 'Неизвестный';
  const authorAvatar = author.avatar || `https://via.placeholder.com/24?text=${authorName[0]}`;
  
  const date = new Date(msg.createdAt);
  const time = date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Подсвечиваем найденный текст
  let content = escapeHtml(msg.content || '');
  if (query) {
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    content = content.replace(regex, '<mark>$1</mark>');
  }
  
  // Информация о канале (если поиск по серверу)
  let channelInfo = '';
  if (msg.channel && msg.channel.name) {
    channelInfo = `<span class="search-result-channel">#${msg.channel.name}</span>`;
  }
  
  div.innerHTML = `
    <div class="search-result-header">
      <img class="search-result-avatar" src="${authorAvatar}" alt="${authorName}">
      <span class="search-result-author">${authorName}</span>
      ${channelInfo}
      <span class="search-result-time">${time}</span>
    </div>
    <div class="search-result-content">${content}</div>
  `;
  
  // Клик по результату - переход к сообщению
  div.addEventListener('click', () => {
    jumpToMessage(msg._id);
    toggleSearch(); // Закрываем поиск
  });
  
  return div;
}

/**
 * Экранирование HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Экранирование для регулярного выражения
 */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Перейти к сообщению (если не определена в pinned.js)
 */
if (typeof jumpToMessage === 'undefined') {
  function jumpToMessage(messageId) {
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
}

// ==================== SOCKET ОБРАБОТЧИКИ ====================

if (window.socket) {
  // Получены результаты поиска
  window.socket.on('message:search_results', (data) => {
    displaySearchResults(data);
  });
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('search-input');
  
  if (searchInput) {
    // Поиск с задержкой при вводе
    searchInput.addEventListener('input', (e) => {
      const query = e.target.value;
      
      // Очищаем предыдущий таймер
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      
      // Если пустой запрос, показываем placeholder
      if (!query || query.trim().length === 0) {
        showSearchPlaceholder();
        return;
      }
      
      // Запускаем поиск с задержкой 500ms
      searchTimeout = setTimeout(() => {
        performSearch(query);
      }, 500);
    });
    
    // Поиск по Enter
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (searchTimeout) {
          clearTimeout(searchTimeout);
        }
        performSearch(e.target.value);
      }
    });
  }
  
  // Закрытие панели поиска по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const panel = document.getElementById('search-panel');
      if (panel && !panel.classList.contains('hidden')) {
        toggleSearch();
      }
    }
  });
});
