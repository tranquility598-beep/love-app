/**
 * XSS Protection Utility для Frontend
 * Санитизация HTML с поддержкой Markdown
 */

// DOMPurify загружается из CDN в index.html
// Проверяем доступность
if (typeof DOMPurify === 'undefined') {
  console.error('DOMPurify not loaded! XSS protection disabled.');
}

// Конфигурация DOMPurify
const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['strong', 'em', 'code', 'a', 'br', 's', 'del', 'span', 'img'],
  ALLOWED_ATTR: ['href', 'target', 'rel', 'style', 'class', 'data-user-id', 'src', 'alt', 'title'],
  ALLOW_DATA_ATTR: false,
  ALLOWED_URI_REGEXP: /^(?:https?:|\/)/i // Только http/https и относительные пути
};

/**
 * Санитизация HTML контента
 */
function sanitizeHtml(dirty) {
  if (!dirty) return '';
  if (typeof DOMPurify === 'undefined') return '';
  return DOMPurify.sanitize(dirty, PURIFY_CONFIG);
}

/**
 * Экранирование HTML (для plain text)
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Форматирование markdown с защитой от XSS
 */
function formatMarkdown(content) {
  if (!content) return '';
  
  // Сначала экранируем весь HTML
  let text = escapeHtml(content);
  
  // Кастомные эмодзи :name:
  text = text.replace(/:(\w+):/g, (match, name) => {
    const server = window.currentServer;
    if (server && server.emojis) {
      const emoji = server.emojis.find(e => e.name === name);
      if (emoji) {
        const baseUrl = window.BASE_URL || 'http://localhost:5555';
        return `<img class="custom-emoji" src="${baseUrl}${emoji.url}" alt=":${name}:" title=":${name}:">`;
      }
    }
    return match;
  });
  
  // Упоминания @everyone и @here
  text = text.replace(/@(everyone|here)/g, (match, type) => {
    return `<span class="mention mention-${type}">@${type}</span>`;
  });
  
  // Упоминания пользователей @username
  text = text.replace(/@(\w+)/g, (match, username) => {
    // Пропускаем уже обработанные everyone и here
    if (username === 'everyone' || username === 'here') {
      return match;
    }
    
    // Проверяем, существует ли пользователь на текущем сервере
    const server = window.currentServer;
    if (server && server.members) {
      const member = server.members.find(m => {
        const user = m.user || m;
        return user.username === username;
      });
      
      if (member) {
        const userId = member.user?._id || member.user || member._id;
        const isMentioned = userId === window.currentUser?._id;
        return `<span class="mention ${isMentioned ? 'mention-me' : ''}" data-user-id="${userId}">@${username}</span>`;
      }
    }
    
    // Если пользователь не найден, оставляем как обычный текст
    return match;
  });
  
  // Применяем markdown форматирование
  // Жирный **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  
  // Зачеркнутый ~~text~~
  text = text.replace(/~~(.+?)~~/g, '<s style="text-decoration:line-through">$1</s>');
  
  // Курсив *text* (но не внутри ссылок)
  text = text.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
  
  // Код `code`
  text = text.replace(/`(.+?)`/g, '<code style="background:var(--bg-tertiary);padding:2px 4px;border-radius:3px;font-family:monospace">$1</code>');
  
  // Ссылки - БЕЗОПАСНО
  text = text.replace(/(https?:\/\/[^\s<]+)/g, (match) => {
    try {
      // Проверяем что это валидный URL
      const url = new URL(match);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        // Экранируем URL для безопасности
        const safeUrl = match.replace(/"/g, '&quot;');
        return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:var(--text-link)">${match}</a>`;
      }
      return match;
    } catch (e) {
      return match; // Невалидный URL - оставляем как текст
    }
  });
  
  // Финальная санитизация через DOMPurify
  return sanitizeHtml(text);
}

/**
 * Безопасная установка innerHTML
 */
function safeSetInnerHTML(element, html) {
  if (!element) return;
  element.innerHTML = sanitizeHtml(html);
}

/**
 * Безопасная установка текста с markdown
 */
function safeSetMarkdown(element, markdown) {
  if (!element) return;
  element.innerHTML = formatMarkdown(markdown);
}

// Для использования в браузере
if (typeof window !== 'undefined') {
  window.XSS = {
    sanitizeHtml,
    escapeHtml,
    formatMarkdown,
    safeSetInnerHTML,
    safeSetMarkdown
  };
}

