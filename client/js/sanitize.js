/**
 * Sanitize API
 * Утилиты для безопасного рендеринга текста, предотвращения XSS атак
 */

// Экранирование всех HTML тегов
function escapeHtml(unsafe) {
  if (!unsafe || typeof unsafe !== 'string') return '';
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Экранирование текста с поддержкой простых тегов
// Разрешены: <b>, <i>, <s>, <u>, <code>, <pre>, <br> и ссылки <a>
function sanitizeMessage(html) {
  if (!html || typeof html !== 'string') return '';
  
  if (window.DOMPurify) {
    // Добавляем хук для безопасных ссылок
    window.DOMPurify.addHook('afterSanitizeAttributes', function(node) {
      if ('target' in node) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
      if (node.hasAttribute('href')) {
        const href = node.getAttribute('href') || '';
        if (!href.startsWith('http://') && !href.startsWith('https://')) {
          node.removeAttribute('href'); // Удаляем опасные ссылки (javascript:, data:, file:)
        }
      }
    });

    const clean = window.DOMPurify.sanitize(html, {
      ALLOWED_TAGS: ['b', 'i', 's', 'u', 'code', 'pre', 'br', 'a'],
      ALLOWED_ATTR: ['href', 'target', 'rel']
    });
    
    window.DOMPurify.removeHook('afterSanitizeAttributes');
    return clean;
  }

  // Fallback
  let safeHtml = escapeHtml(html);
  safeHtml = safeHtml.replace(/&lt;a href=&quot;(https?:\/\/[^&]+)&quot;( target=&quot;_blank&quot;)?&gt;(.*?)&lt;\/a&gt;/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$3</a>');
  safeHtml = safeHtml
    .replace(/&lt;b&gt;(.*?)&lt;\/b&gt;/g, '<b>$1</b>')
    .replace(/&lt;i&gt;(.*?)&lt;\/i&gt;/g, '<i>$1</i>')
    .replace(/&lt;s&gt;(.*?)&lt;\/s&gt;/g, '<s>$1</s>')
    .replace(/&lt;u&gt;(.*?)&lt;\/u&gt;/g, '<u>$1</u>')
    .replace(/&lt;br\s*\/?[&gt;]?/g, '<br>')
    .replace(/&lt;code&gt;(.*?)&lt;\/code&gt;/g, '<code>$1</code>')
    .replace(/&lt;pre&gt;(.*?)&lt;\/pre&gt;/g, '<pre>$1</pre>');
    
  return safeHtml;
}

// Безопасное установление текстового содержимого
function safeSetText(element, text) {
  if (!element) return;
  element.textContent = text;
}

// Глобальный экспорт (для браузера)
window.escapeHtml = escapeHtml;
window.sanitizeMessage = sanitizeMessage;
window.safeSetText = safeSetText;

// FIX: chat.js обращается к window.XSS.escapeHtml / window.XSS.formatMarkdown,
// но namespace раньше не существовал → TypeError "Cannot read properties of
// undefined (reading 'escapeHtml')" при открытии чата.
// Добавляем namespace-обёртку поверх уже определённых функций, не меняя их.
// formatMarkdown = алиас на sanitizeMessage (поддерживает b/i/s/u/code/pre/br/a + ссылки).
window.XSS = {
  escapeHtml: escapeHtml,
  sanitizeMessage: sanitizeMessage,
  formatMarkdown: sanitizeMessage,
  safeSetText: safeSetText
};
