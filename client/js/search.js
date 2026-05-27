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
async function searchMessages(query, channelId) {
  try {
    const data = await apiFetch(`/messages/search?q=${encodeURIComponent(query)}&channelId=${channelId}`);
    return data;
  } catch (error) {
    console.error('Search error:', error);
    throw error;
  }
}

/**
 * Выполнить поиск
 */
async function performSearch(query) {
  if (!query || query.trim().length === 0) {
    showSearchPlaceholder();
    return;
  }
  
  if (!currentSearchChannelId) {
    showSearchError('Выберите канал для поиска');
    return;
  }
  
  // Показываем индикатор загрузки
  showSearchLoading();
  
  try {
    const data = await searchMessages(query.trim(), currentSearchChannelId);
    displaySearchResults({ results: data.results, query: query.trim() });
  } catch (error) {
    showSearchError('Произошла ошибка при поиске');
  }
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
  const authorName = author.username || author.nickname || 'Unknown';
  const authorAvatar = (typeof getAvatarUrl === 'function') ? getAvatarUrl(author.avatar, authorName, author._id || author.id) : (author.avatar || `assets/images/default-avatar.png`);
  
  const date = new Date(msg.createdAt);
  const time = date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  // Создаем элементы безопасно через DOM API
  const header = document.createElement('div');
  header.className = 'search-result-header';
  
  const avatar = document.createElement('img');
  avatar.className = 'search-result-avatar';
  avatar.src = authorAvatar;
  avatar.alt = escapeHtml(authorName);
  
  const authorSpan = document.createElement('span');
  authorSpan.className = 'search-result-author';
  authorSpan.textContent = authorName; // ИСПРАВЛЕНО: Безопасно через textContent
  
  header.appendChild(avatar);
  header.appendChild(authorSpan);
  
  // Информация о канале (если поиск по серверу)
  if (msg.channel && msg.channel.name) {
    const channelSpan = document.createElement('span');
    channelSpan.className = 'search-result-channel';
    channelSpan.textContent = '#' + msg.channel.name;
    header.appendChild(channelSpan);
  }
  
  const timeSpan = document.createElement('span');
  timeSpan.className = 'search-result-time';
  timeSpan.textContent = time;
  
  header.appendChild(timeSpan);
  
  // Контент с подсветкой
  const contentDiv = document.createElement('div');
  contentDiv.className = 'search-result-content';
  
  // Подсвечиваем найденный текст безопасно
  let content = escapeHtml(msg.content || '');
  if (query) {
    const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
    content = content.replace(regex, '<mark>$1</mark>');
  }
  contentDiv.innerHTML = content; // Безопасно, т.к. content уже экранирован через escapeHtml
  
  div.appendChild(header);
  div.appendChild(contentDiv);
  
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
}

// ==================== SOCKET ОБРАБОТЧИКИ ====================

// Socket listeners now managed via socket.js lifecycle system

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

// Export function for socket handlers
window.displaySearchResults = displaySearchResults;
