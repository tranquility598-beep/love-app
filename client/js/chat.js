/**
 * Chat модуль - управление сообщениями
 */

// Состояние чата
let replyingTo = null;
let replyingToMessage = null; // Полный объект сообщения для оптимистичного отображения
let editingMessageId = null;
let pendingFiles = [];
let isLoadingMessages = false;
let isSending = false;
let activeChatVideo = null;

/**
 * Загрузить сообщения канала
 */
async function loadMessages(channelId, options = {}) {
  const list = document.getElementById('messages-list');
  if (!list) return;

  list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Загрузка...</div>';

  const globalSeq = options.globalSeq || window._activeNavigationRequestId;

  try {
    const data = await MessagesAPI.getMessages(channelId);
    
    // Strict guards
    if (window.currentChannelId !== channelId) {
      console.warn('⚠️ Stale message load aborted (channelId mismatch):', channelId);
      return;
    }
    if (options && options.requestSeq !== undefined && window.NavigationController && options.requestSeq !== window.NavigationController._channelNavigationSeq) {
      console.warn('⚠️ Stale message load aborted (seq mismatch):', channelId);
      return;
    }
    if (globalSeq !== undefined && globalSeq !== window._activeNavigationRequestId) {
      console.warn('⚠️ Stale message load aborted (global execution context mismatch):', channelId);
      return;
    }

    renderMessages(data.messages || []);
    scrollToBottom();
  } catch (error) {
    if (window.currentChannelId === channelId) {
      list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Ошибка загрузки сообщений</div>';
    }
  }
}

/**
 * Отрендерить список сообщений
 */
function renderMessages(messages, isDM) {
  const list = document.getElementById('messages-list');
  if (!list) return;

  if (messages.length === 0) {
    const channelName = window.currentChannel?.name || 'этот канал';
    list.innerHTML = `
      <div class="channel-start">
        <div class="channel-start-icon">${isDM ? '💬' : '#'}</div>
        <div class="channel-start-title">${isDM ? 'Начало разговора' : `#${channelName}`}</div>
        <div class="channel-start-desc">${isDM ? 'Это начало вашего разговора.' : `Это начало канала #${channelName}.`}</div>
      </div>
    `;
    return;
  }

  let html = '';
  let prevAuthorId = null;
  let prevTime = null;

  messages.forEach((msg, i) => {
    const msgTime = new Date(msg.createdAt).getTime();
    const timeDiff = prevTime ? (msgTime - prevTime) / 60000 : 999;
    const sameAuthor = prevAuthorId === (msg.author?._id || msg.author);
    const isGrouped = sameAuthor && timeDiff < 5;

    html += renderMessage(msg, isGrouped);
    prevAuthorId = msg.author?._id || msg.author;
    prevTime = msgTime;
  });

  list.innerHTML = html;

  // Добавляем обработчики событий
  list.querySelectorAll('.message-group').forEach(el => {
    const msgId = el.dataset.messageId;
    const authorId = el.dataset.authorId;
    el.addEventListener('contextmenu', (e) => showContextMenu(e, msgId, authorId));
  });

  // Обработчики изображений
  list.querySelectorAll('.message-image').forEach(img => {
    img.addEventListener('click', () => openImageViewer(img.src));
  });

  // Инициализация кастомных видеоплееров
  list.querySelectorAll('.custom-video-player').forEach(player => {
    initVideoPlayer(player);
  });

  // Инициализация превью текстовых файлов
  list.querySelectorAll('.txt-preview').forEach(preview => {
    initTxtPreview(preview);
  });
}

function resolveAttachmentUrl(url) {
  if (!url) return '';
  const value = String(url);
  if (/^https?:\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
    return value;
  }
  const baseUrl = window.BASE_URL || 'http://localhost:5555';
  return `${baseUrl}${value}`;
}

/**
 * Отрендерить одно сообщение
 */
function renderMessage(msg, isGrouped) {
  const author = msg.author || {};
  const authorId = author._id || author;
  const authorName = author.nickname || author.username || 'Неизвестный';
  const authorAvatar = getAvatarUrl(author.avatar, author.username || author.nickname, authorId);
  const time = formatTime(msg.createdAt);
  const fullTime = formatDate(msg.createdAt);
  const isOwn = authorId === window.currentUser?._id;

  // Ответ на сообщение (безопасно через DOM API)
  let replyHtml = '';
  if (msg.replyTo) {
    const replyAuthor = escapeHtml(msg.replyTo.author?.nickname || msg.replyTo.author?.username || 'Неизвестный'); // ИСПРАВЛЕНО: sanitize username
    const replyContent = msg.replyTo.content?.substring(0, 60) || '';
    const replyPreview = escapeHtml(replyContent);
    const replyId = msg.replyTo._id || '';
    const isOwner = msg.replyTo.author?.role === 'owner';
    
    replyHtml = `
      <div class="message-reply" onclick="scrollToMessage('${replyId}')" style="cursor: pointer;">
        <div class="message-reply-info">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          <strong>${replyAuthor}${isOwner ? ' 👑' : ''}</strong>: ${replyPreview}
        </div>
      </div>
    `;
  }

  // Текст сообщения
  const content = msg.deleted
    ? '<span class="message-text deleted">Сообщение удалено</span>'
    : `<span class="message-text">${formatMessageContent(msg.content || '', msg)}</span>
       ${msg.edited ? '<span class="message-edited-tag">(изм.)</span>' : ''}`;

  // Вложения
  let attachmentsHtml = '';
  if (msg.attachments && msg.attachments.length > 0) {
    attachmentsHtml = '<div class="message-attachments">';
    msg.attachments.forEach(att => {
      const isAudio =
        att.type === 'audio' ||
        (att.mimetype && att.mimetype.startsWith('audio/')) ||
        (att.url && String(att.url).includes('/audio/'));
      const isVideo =
        att.type === 'video' ||
        (att.mimetype && att.mimetype.startsWith('video/')) ||
        (att.url && String(att.url).includes('/video/') && !isAudio);
      if (att.mimetype?.startsWith('image/') || att.type === 'image') {
        const fn = att.filename || att.originalName || 'image';
        attachmentsHtml += `<img class="message-image" src="${resolveAttachmentUrl(att.url)}" alt="${fn}" loading="lazy">`;
      } else if (isAudio && typeof renderVoiceMessage === 'function') {
        attachmentsHtml += renderVoiceMessage(att, isOwn);
      } else if (isVideo) {
        const fn = att.filename || att.originalName || 'video';
        const safeUrl = resolveAttachmentUrl(att.url);
        attachmentsHtml += `
          <div class="custom-video-player" data-src="${safeUrl}">
              <video class="cvp-video" preload="metadata" src="${safeUrl}"></video>
              <div class="cvp-overlay">
                  <button class="cvp-play-btn">▶</button>
              </div>
              <div class="cvp-controls">
                  <button class="cvp-play-pause">▶</button>
                  <input type="range" class="cvp-progress" min="0" max="100" value="0" step="0.1">
                  <span class="cvp-time">0:00 / 0:00</span>
                  <div class="cvp-volume-wrap">
                      <button class="cvp-mute-btn">🔊</button>
                      <input type="range" class="cvp-volume" min="0" max="100" value="100">
                  </div>
                  <button class="cvp-fullscreen-btn">⛶</button>
              </div>
          </div>
        `;
      } else if (att.mimetype === 'text/plain') {
        let displayName = att.originalName || att.filename || 'файл.txt';
        try {
          displayName = decodeURIComponent(displayName);
        } catch (e) {}
        const fn = escapeHtml(displayName);
        const safeUrl = resolveAttachmentUrl(att.url);
        attachmentsHtml += `
          <div class="txt-preview" data-url="${safeUrl}">
              <div class="txt-preview-header">
                  <span>📄 ${fn}</span>
                  <div class="txt-preview-actions">
                      <button class="txt-expand-btn">Показать</button>
                      <a href="${safeUrl}" download="${fn}">Скачать</a>
                  </div>
              </div>
              <pre class="txt-preview-content hidden"></pre>
          </div>
        `;
      } else {
        let rawFn = att.filename || att.originalName || 'file';
        try {
          rawFn = decodeURIComponent(rawFn);
        } catch (e) {}
        const fn = escapeHtml(rawFn);
        attachmentsHtml += `
          <div class="message-file" onclick="window.open('${resolveAttachmentUrl(att.url)}')">
            <span class="message-file-icon">${getFileIcon(att.mimetype)}</span>
            <div class="message-file-info">
              <div class="message-file-name">${fn}</div>
              <div class="message-file-size">${formatFileSize(att.size)}</div>
            </div>
          </div>
        `;
      }
    });
    attachmentsHtml += '</div>';
  }

  // Реакции
  let reactionsHtml = '';
  if (msg.reactions && msg.reactions.length > 0) {
    reactionsHtml = '<div class="message-reactions">';
    msg.reactions.forEach(r => {
      const hasReacted = r.users?.includes(window.currentUser?._id);
      reactionsHtml += `
        <button class="reaction-btn ${hasReacted ? 'reacted' : ''}"
                onclick="socketReactMessage('${msg._id}', '${r.emoji}')">
          ${r.emoji} <span class="reaction-count">${r.count || r.users?.length || 1}</span>
        </button>
      `;
    });
    reactionsHtml += '</div>';
  }

  // Кнопки действий
  const actionsHtml = `
    <div class="message-actions">
      <button class="message-action-btn" onclick="startReply('${msg._id}')" title="Ответить">💬</button>
      <button class="message-action-btn" onclick="toggleEmojiPickerForReaction('${msg._id}')" title="Реакция">😊</button>
      <button class="message-action-btn pin-btn" onclick="pinMessage('${msg._id}', '${msg.channel}')" title="Закрепить">📌</button>
      ${isOwn ? `<button class="message-action-btn" onclick="startEditMessage('${msg._id}')" title="Редактировать">✏️</button>` : ''}
      ${isOwn ? `<button class="message-action-btn danger" onclick="confirmDeleteMessage('${msg._id}')" title="Удалить">🗑️</button>` : ''}
    </div>
  `;

  if (isGrouped) {
    return `
      <div class="message-group message-continuation" data-message-id="${msg._id}" data-author-id="${authorId}">
        <span class="message-timestamp" title="${fullTime}">${time}</span>
        ${replyHtml}
        ${content}
        ${attachmentsHtml}
        ${reactionsHtml}
        ${actionsHtml}
      </div>
    `;
  }

  return `
    <div class="message-group message-with-avatar" data-message-id="${msg._id}" data-author-id="${authorId}">
      <img class="message-avatar" src="${authorAvatar}" alt="${authorName}">
      <div class="message-content-wrapper">
        <div class="message-header">
          <span class="message-author" data-user-id="${authorId}">${authorName}${author.role === 'owner' ? ' <span title="Создатель" style="font-size:1.1em">👑</span>' : ''}</span>
          <span class="message-time" title="${fullTime}">${time}</span>
        </div>
        ${replyHtml}
        ${content}
        ${attachmentsHtml}
        ${reactionsHtml}
      </div>
      ${actionsHtml}
    </div>
  `;
}

/**
 * Форматировать содержимое сообщения (эмодзи, ссылки)
 */
function formatMessageContent(content, msg) {
  // Используем безопасную функцию из sanitize.js
  let formatted = window.XSS.formatMarkdown(content);
  // Highlight mentions
  formatted = formatted.replace(/@(everyone|here|[A-Za-z0-9_.-]+)/g, (match, name) => {
    if (name === 'everyone' || name === 'here') {
      let isServerOwner = false;
      if (window.currentServer && msg) {
        const ownerId = String(window.currentServer.ownerId || window.currentServer.owner?._id || window.currentServer.owner || '');
        const authorId = String(msg.authorId || (msg.author && (msg.author._id || msg.author)) || '');
        if (ownerId && authorId && ownerId === authorId) {
          isServerOwner = true;
        }
      }
      if (isServerOwner) {
        return `<span class="mention-highlight">@${name}</span>`;
      } else {
        return `@${name}`;
      }
    }
    return `<span class="mention-highlight">@${name}</span>`;
  });
  return formatted;
}

/**
 * Экранировать HTML
 */
function escapeHtml(text) {
  // Используем безопасную функцию из sanitize.js
  return window.XSS.escapeHtml(text);
}

/**
 * Добавить новое сообщение в DOM
 */
function appendMessage(msg) {
  const list = document.getElementById('messages-list');
  if (!list) return;

  // Убираем заглушку если есть
  const placeholder = list.querySelector('.channel-start');

  const lastGroup = list.lastElementChild;
  const lastAuthorId = lastGroup?.dataset?.authorId;
  const lastTime = lastGroup ? new Date(lastGroup.dataset.time || 0).getTime() : 0;
  const msgTime = new Date(msg.createdAt).getTime();
  const timeDiff = (msgTime - lastTime) / 60000;
  const sameAuthor = lastAuthorId === (msg.author?._id || msg.author);
  const isGrouped = sameAuthor && timeDiff < 5 && !placeholder;

  const div = document.createElement('div');
  div.innerHTML = renderMessage(msg, isGrouped);
  const el = div.firstElementChild;
  if (el) {
    el.dataset.time = msg.createdAt;
    // Читаем ID динамически из data-message-id при открытии меню
    el.addEventListener('contextmenu', (e) => {
      const currentId = el.dataset.messageId;
      const currentAuthorId = el.dataset.authorId;
      showContextMenu(e, currentId, currentAuthorId);
    });
    el.querySelectorAll('.message-image').forEach(img => {
      img.addEventListener('click', () => openImageViewer(img.src));
    });
    el.querySelectorAll('.custom-video-player').forEach(player => {
      initVideoPlayer(player);
    });
    el.querySelectorAll('.txt-preview').forEach(preview => {
      initTxtPreview(preview);
    });
    list.appendChild(el);
  }
}

/**
 * Обновить сообщение в DOM
 */
function updateMessageInDOM(msg) {
  const el = document.querySelector(`[data-message-id="${msg._id}"]`);
  if (!el) return;

  const textEl = el.querySelector('.message-text');
  if (textEl) {
    textEl.innerHTML = formatMessageContent(msg.content || '', msg);
  }

  // Добавляем тег "изменено"
  let editTag = el.querySelector('.message-edited-tag');
  if (!editTag && msg.edited) {
    editTag = document.createElement('span');
    editTag.className = 'message-edited-tag';
    editTag.textContent = '(изм.)';
    const textSpan = el.querySelector('.message-text');
    if (textSpan) textSpan.after(editTag);
  }
}

/**
 * Обновить временное сообщение реальными данными
 */
function updateTempMessageInDOM(tempId, msg) {
  const el = document.querySelector(`[data-message-id="${tempId}"]`);
  if (!el) return;

  // Обновляем ID
  el.dataset.messageId = msg._id;
  
  // Удаляем ВСЕ старые блоки .message-actions
  const oldActionsEls = el.querySelectorAll('.message-actions');
  oldActionsEls.forEach(oldEl => oldEl.remove());
  
  // Создаем новый блок с кнопками
  const isOwn = msg.author?._id === window.currentUser?._id;
  
  const newActionsEl = document.createElement('div');
  newActionsEl.className = 'message-actions';
  
  // Создаем кнопки с addEventListener вместо onclick
  const replyBtn = document.createElement('button');
  replyBtn.className = 'message-action-btn';
  replyBtn.title = 'Ответить';
  replyBtn.textContent = '💬';
  replyBtn.addEventListener('click', () => startReply(msg._id));
  
  const reactionBtn = document.createElement('button');
  reactionBtn.className = 'message-action-btn';
  reactionBtn.title = 'Реакция';
  reactionBtn.textContent = '😊';
  reactionBtn.addEventListener('click', () => toggleEmojiPickerForReaction(msg._id));
  
  newActionsEl.appendChild(replyBtn);
  newActionsEl.appendChild(reactionBtn);
  
  if (isOwn) {
    const editBtn = document.createElement('button');
    editBtn.className = 'message-action-btn';
    editBtn.title = 'Редактировать';
    editBtn.textContent = '✏️';
    editBtn.addEventListener('click', () => startEditMessage(msg._id));
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'message-action-btn danger';
    deleteBtn.title = 'Удалить';
    deleteBtn.textContent = '🗑️';
    deleteBtn.addEventListener('click', () => confirmDeleteMessage(msg._id));
    
    newActionsEl.appendChild(editBtn);
    newActionsEl.appendChild(deleteBtn);
  }
  
  // Добавляем новый блок в конец элемента сообщения
  el.appendChild(newActionsEl);
  
  // Обновляем реакции если есть
  const reactionsEl = el.querySelector('.message-reactions');
  if (reactionsEl) {
    const reactionBtns = reactionsEl.querySelectorAll('.reaction-btn');
    reactionBtns.forEach(btn => {
      const onclick = btn.getAttribute('onclick');
      if (onclick && onclick.includes(tempId)) {
        // Создаем новую кнопку вместо изменения атрибута
        const newBtn = btn.cloneNode(true);
        newBtn.setAttribute('onclick', onclick.replace(new RegExp(tempId, 'g'), msg._id));
        btn.replaceWith(newBtn);
      }
    });
  }
  
  // Обновляем содержимое если нужно
  const textEl = el.querySelector('.message-text');
  if (textEl && msg.content) {
    textEl.innerHTML = formatMessageContent(msg.content, msg);
  }

  // Обновляем время
  const timeEl = el.querySelector('.message-time, .message-timestamp');
  if (timeEl) {
    timeEl.title = formatDate(msg.createdAt);
    timeEl.textContent = formatTime(msg.createdAt);
  }
}

/**
 * Удалить сообщение из DOM
 */
function removeMessageFromDOM(messageId) {
  const el = document.querySelector(`[data-message-id="${messageId}"]`);
  if (el) {
    el.querySelectorAll('.message-attachments, .message-reactions, .message-reply').forEach(node => node.remove());
    const textEl = el.querySelector('.message-text');
    if (textEl) {
      textEl.className = 'message-text deleted';
      textEl.textContent = 'Сообщение удалено';
    }
  }
}

/**
 * Обновить реакции сообщения
 */
function updateMessageReactions(messageId, reactions) {
  const el = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!el) return;

  let reactionsEl = el.querySelector('.message-reactions');
  if (!reactionsEl) {
    reactionsEl = document.createElement('div');
    reactionsEl.className = 'message-reactions';
    const content = el.querySelector('.message-content-wrapper') || el;
    content.appendChild(reactionsEl);
  }

  reactionsEl.innerHTML = reactions.map(r => {
    const hasReacted = r.users?.includes(window.currentUser?._id);
    return `
      <button class="reaction-btn ${hasReacted ? 'reacted' : ''}"
              onclick="socketReactMessage('${messageId}', '${r.emoji}')">
        ${r.emoji} <span class="reaction-count">${r.count || r.users?.length || 1}</span>
      </button>
    `;
  }).join('');
}

/**
 * Прокрутить чат вниз
 */
function scrollToBottom() {
  const area = document.getElementById('messages-area');
  if (area) area.scrollTop = area.scrollHeight;
}

/**
 * Прокрутить к конкретному сообщению и подсветить его
 */
function scrollToMessage(messageId) {
  if (!messageId) return;
  
  const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!msgEl) {
    console.warn('Сообщение не найдено');
    return;
  }
  
  // Прокручиваем к сообщению
  msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  // Подсвечиваем сообщение
  msgEl.style.transition = 'background-color 0.3s';
  msgEl.style.backgroundColor = 'rgba(88, 101, 242, 0.2)';
  
  setTimeout(() => {
    msgEl.style.backgroundColor = '';
  }, 2000);
}

/* ============================================================
 * Anti-spam (ступенчатый, с warning modal)
 * ------------------------------------------------------------
 * UX-зеркало backend-защиты (server/middleware/messageAntiSpam.js).
 * Настоящая безопасность — на сервере. Этот код:
 *   - предотвращает обращение к socket/apiUpload во время cooldown'а;
 *   - показывает modal в стиле LOVE с таймером;
 *   - при 429 / 'message:rate_limited' от backend подхватывает
 *     warningTitle/warningText/retryAfter/violationLevel и обновляет modal;
 *   - после окончания cooldown'а modal закрывается автоматически.
 *
 * Лимиты совпадают с backend — менять в обоих местах одновременно.
 * ============================================================ */
const MSG_ANTISPAM = {
  BASE_MAX_MESSAGES: 10,
  STRICT_MAX_MESSAGES: 5,
  WINDOW_MS: 5000,
  FIRST_COOLDOWN_MS: 2000,
  STRICT_COOLDOWN_MS: 3000,
  RESET_AFTER_MS: 10000,
};

// Fallback тексты, если backend не прислал warningTitle/warningText.
const _FALLBACK_WARNINGS = {
  1: {
    title: 'Харе так спешить!',
    text: 'Ты отправляешь сообщения слишком быстро. Подожди пару секунд.',
  },
  2: {
    title: 'Опять слишком быстро',
    text: 'Похоже на спам. Сделай небольшую паузу.',
  },
  3: {
    title: 'Притормози',
    text: 'Сообщения идут слишком часто. Подожди немного.',
  },
};

function _fallbackWarning(level) {
  if (level <= 1) return _FALLBACK_WARNINGS[1];
  if (level === 2) return _FALLBACK_WARNINGS[2];
  return _FALLBACK_WARNINGS[3];
}

/**
 * Нормализация retryAfter из любого источника (socket message:rate_limited,
 * REST 429, локальный предиктор) к единственным легальным значениям 2 или 3.
 *
 * Backend по протоколу присылает только 2 (FIRST_COOLDOWN_MS) или 3
 * (STRICT_COOLDOWN_MS). Всё остальное — мусор: WINDOW_MS=5 (5000ms),
 * RESET_AFTER_MS=10, стейл-renderer и т.п. — НЕ должно попадать в cooldown.
 *
 *   raw <= 2  → 2  (первое нарушение)
 *   raw  > 2  → 3  (повторное)
 *   raw невалиден → по violationLevel: >=2 → 3, иначе 2
 */
function normalizeAntispamRetryAfter(value, violationLevel) {
  const raw = Number(value);
  if (Number.isFinite(raw) && raw > 0) {
    if (raw <= 2) return 2;
    return 3;
  }
  return Number.isFinite(violationLevel) && violationLevel >= 2 ? 3 : 2;
}

// Состояние per-channel: повторяет backend-bucket для локального предсказания.
// modalShownForChannelId — какому каналу принадлежит сейчас открытый modal.
const _antispamState = new Map();
let _modalShownForChannelId = null;
let _modalCountdownInterval = null;

function _getAntispamBucket(channelId) {
  if (!channelId) return null;
  let b = _antispamState.get(channelId);
  if (!b) {
    b = {
      timestamps: [],
      cooldownUntil: 0,
      violationLevel: 0,
      lastViolationAt: 0,
      tickInterval: null,
    };
    _antispamState.set(channelId, b);
  }
  return b;
}

function isMessageCooldownActive(channelId) {
  const b = _getAntispamBucket(channelId);
  if (!b) return { active: false, retryAfter: 0 };
  const now = Date.now();
  if (b.cooldownUntil > now) {
    return { active: true, retryAfter: Math.max(1, Math.ceil((b.cooldownUntil - now) / 1000)) };
  }
  return { active: false, retryAfter: 0 };
}

/**
 * Локальная проверка/запись попытки отправки. Используется только как
 * быстрый предохранитель — настоящее решение всё равно за backend.
 *
 * Если локально предсказали превышение, возвращаем violationLevel=null,
 * чтобы дать backend назначить уровень (тексты возьмутся из его ответа,
 * либо из fallback'а до его прихода).
 */
function recordMessageAttempt(channelId) {
  const b = _getAntispamBucket(channelId);
  if (!b) return { active: false };
  const now = Date.now();

  // Local reset (зеркало серверного).
  if (b.violationLevel > 0 && b.lastViolationAt && now - b.lastViolationAt >= MSG_ANTISPAM.RESET_AFTER_MS) {
    b.violationLevel = 0;
    b.timestamps = [];
  }

  const limit = b.violationLevel === 0 ? MSG_ANTISPAM.BASE_MAX_MESSAGES : MSG_ANTISPAM.STRICT_MAX_MESSAGES;
  // После cooldown'а старые таймстемпы (которые сами и привели к warning'у)
  // не должны участвовать в новом окне подсчёта. Иначе первое же сообщение
  // после ожидания сразу триггерит второй warning. См. зеркальную правку
  // в server/middleware/messageAntiSpam.js.
  const cutoff = Math.max(now - MSG_ANTISPAM.WINDOW_MS, b.cooldownUntil || 0);
  b.timestamps = b.timestamps.filter((t) => t >= cutoff);

  if (b.timestamps.length >= limit) {
    // Локально — оптимистично поднимаем уровень, чтобы UX был мгновенным.
    // Backend всё равно пришлёт авторитетные значения и при необходимости
    // мы перезапишем их в triggerMessageCooldown.
    const predictedLevel = b.violationLevel + 1;
    const cooldownMs = predictedLevel === 1 ? MSG_ANTISPAM.FIRST_COOLDOWN_MS : MSG_ANTISPAM.STRICT_COOLDOWN_MS;
    triggerMessageCooldown(channelId, Math.ceil(cooldownMs / 1000), {
      violationLevel: predictedLevel,
    });
    return { active: true };
  }

  b.timestamps.push(now);
  return { active: false };
}

/**
 * Запустить (или продлить) cooldown с показом warning modal.
 * @param {string} channelId
 * @param {number} retryAfterSeconds
 * @param {object} [info] — { violationLevel, warningTitle, warningText }
 */
function triggerMessageCooldown(channelId, retryAfterSeconds, info = {}) {
  const b = _getAntispamBucket(channelId);
  if (!b) return;
  const now = Date.now();
  // Нормализация retryAfter. Легальные значения — ТОЛЬКО 2 или 3 секунды
  // (см. server/middleware/messageAntiSpam.js: FIRST_COOLDOWN_MS=2000,
  // STRICT_COOLDOWN_MS=3000). Любое другое значение — мусор от стейл-
  // renderer'а / старого кода / WINDOW_MS=5000, попавшего в cooldown по
  // ошибке. Нормализуем агрессивно, чтобы UI никогда не показывал 5 сек.
  //   raw <= 2  → 2 сек (первое нарушение, level<=1)
  //   raw  > 2  → 3 сек (повторные нарушения, level>=2)
  //   raw невалиден → по violationLevel: >=2 → 3, иначе 2
  const safeSeconds = normalizeAntispamRetryAfter(retryAfterSeconds, info.violationLevel);
  const newUntil = now + safeSeconds * 1000;
  // Прямая установка (не Math.max со старым значением): свежий ответ
  // backend — источник истины и должен исправлять застрявший «грязный»
  // cooldownUntil от прошлых вызовов.
  b.cooldownUntil = newUntil;
  b.lastViolationAt = now;
  b.timestamps = [];
  if (Number.isFinite(info.violationLevel) && info.violationLevel > b.violationLevel) {
    b.violationLevel = info.violationLevel;
  }

  _showAntispamModal(channelId, {
    title: info.warningTitle || _fallbackWarning(b.violationLevel).title,
    text: info.warningText || _fallbackWarning(b.violationLevel).text,
  });
  _startCooldownUiTimer(channelId);
}

/**
 * UI-таймер на send-btn. Тикает каждые 250 мс, по окончании cooldown'а
 * сам себя гасит, снимает disabled, закрывает modal (если открыт для
 * этого канала).
 */
function _startCooldownUiTimer(channelId) {
  const b = _getAntispamBucket(channelId);
  if (!b) return;
  if (b.tickInterval) {
    _refreshCooldownUi(channelId);
    return;
  }
  _refreshCooldownUi(channelId);
  b.tickInterval = setInterval(() => {
    const now = Date.now();
    if (b.cooldownUntil <= now) {
      clearInterval(b.tickInterval);
      b.tickInterval = null;
      _refreshCooldownUi(channelId);
      // Закрываем modal только если он принадлежал ЭТОМУ каналу.
      if (_modalShownForChannelId === channelId) hideAntispamModal();
      return;
    }
    _refreshCooldownUi(channelId);
    if (_modalShownForChannelId === channelId) _updateAntispamCountdown(channelId);
  }, 250);
}

function _refreshCooldownUi(channelId) {
  if (channelId !== window.currentChannelId) return;
  const btn = document.getElementById('send-btn');
  const label = document.getElementById('send-btn-cooldown');
  const { active, retryAfter } = isMessageCooldownActive(channelId);
  if (btn) {
    btn.disabled = active;
    btn.classList.toggle('is-cooldown', active);
    btn.title = active ? `Подожди ${retryAfter} сек` : 'Отправить';
  }
  if (label) {
    label.textContent = active ? `${retryAfter}` : '';
  }
}

/* ---------- Antispam modal ---------- */

/**
 * Показать (или обновить) warning modal. Если modal уже открыт, просто
 * обновляем тексты и countdown — нового окна не плодим.
 */
function _showAntispamModal(channelId, { title, text }) {
  const overlay = document.getElementById('antispam-modal');
  const titleEl = document.getElementById('antispam-modal-title');
  const textEl = document.getElementById('antispam-modal-text');
  if (!overlay || !titleEl || !textEl) return;

  // textContent — никакого innerHTML с пользовательскими данными.
  titleEl.textContent = title;
  textEl.textContent = text;
  _modalShownForChannelId = channelId;

  if (overlay.classList.contains('hidden')) {
    openModal('antispam-modal', { allowEscape: true, allowClickOutside: true });
    overlay.setAttribute('aria-hidden', 'false');
  }
  _updateAntispamCountdown(channelId);
  _ensureAntispamModalBindings();
}

function _updateAntispamCountdown(channelId) {
  const timerEl = document.getElementById('antispam-modal-timer');
  if (!timerEl) return;
  const { active, retryAfter } = isMessageCooldownActive(channelId);
  timerEl.textContent = active
    ? `Можно писать через ${retryAfter} сек.`
    : 'Можно писать.';
}

function hideAntispamModal() {
  const overlay = document.getElementById('antispam-modal');
  if (!overlay) return;
  // Guard: only call closeModal if the modal is actually open in the stack.
  // Without this check, repeated calls (e.g. from the cooldown timer after
  // user already clicked "OK") trigger "[ModalManager] Modal not in stack".
  const isInStack = window.ModalManager &&
    window.ModalManager.stack.some(m => m.id === 'antispam-modal');
  if (isInStack) {
    closeModal('antispam-modal');
  }
  overlay.classList.add('hidden');
  overlay.setAttribute('aria-hidden', 'true');
  _modalShownForChannelId = null;
}

/**
 * Биндинги для modal вешаются один раз. Кнопка "Понял" просто прячет
 * окно — cooldown сам по себе не отменяется (это backend-state).
 * Кликом по затемнению или Escape тоже можно закрыть.
 */
let _antispamModalBound = false;
function _ensureAntispamModalBindings() {
  if (_antispamModalBound) return;
  const overlay = document.getElementById('antispam-modal');
  const okBtn = document.getElementById('antispam-modal-ok');
  if (!overlay || !okBtn) return;
  okBtn.addEventListener('click', hideAntispamModal);
  
  // Note: Click-outside and ESC are now handled by ModalManager
  // Keep custom Enter key handling for "OK" action
  document.addEventListener('keydown', (e) => {
    if (overlay.classList.contains('hidden')) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      // stopImmediatePropagation — чтобы Enter ГАРАНТИРОВАННО не дошёл
      // до handleMessageKeydown на textarea (который тоже навешен в
      // capture-фазе, см. client/js/app.js). Иначе после закрытия
      // модалки сразу же вызывается sendMessage: input очищается,
      // создаётся optimistic temp message, всё это улетает в socket
      // во время cooldown'а или сразу после.
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      hideAntispamModal();
    }
  }, true);
  _antispamModalBound = true;
}

// Перерисовываем UI при переключении канала. Modal не трогаем — он
// логически принадлежит каналу, на котором сработал.
window.addEventListener('chat:channel-changed', () => {
  _refreshCooldownUi(window.currentChannelId);
});

// Экспорт для socket.js.
window.triggerMessageCooldown = triggerMessageCooldown;
window.isMessageCooldownActive = isMessageCooldownActive;
window.hideAntispamModal = hideAntispamModal;

/**
 * Отправить сообщение
 */
async function sendMessage() {
  const input = document.getElementById('message-input');
  if (!input) return;

  if (isSending) return;

  const content = input.value.trim();
  let channelId = window.currentChannelId;

  const isDM = window.NavigationController?.state?.currentView === 'dm' && window.currentDMConversation;
  if (!channelId && isDM) {
    channelId = window.currentDMConversation.channelId || window.currentDMConversation.channel?._id;
  }

  if (!channelId) {
    if (!isDM) {
      console.warn('Выберите канал для отправки сообщения');
    }
    return;
  }

  if (!content && pendingFiles.length === 0) return;

  // === Anti-spam cooldown ===
  // Если cooldown активен — НЕ вызываем ни socket, ни apiUpload.
  // Не очищаем input и не трогаем pendingFiles: пользователь сможет
  // отправить то же самое сразу после окончания cooldown'а.
  // Modal уже показан (или мы покажем его повторно через countdown update),
  // нового окна не плодим.
  const cd = isMessageCooldownActive(channelId);
  if (cd.active) {
    _updateAntispamCountdown(channelId);
    _refreshCooldownUi(channelId);
    return;
  }

  // Локальный предохранитель: если уже видно, что это превышение —
  // показываем modal сразу, не дожидаясь backend.
  const after = recordMessageAttempt(channelId);
  if (after.active) return;

  // Пасхалка: триггер на слова
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes('love') || lowerContent.includes('люблю')) {
    if (window.triggerHeartBurst) window.triggerHeartBurst();
  }

  isSending = true;
  const sendButton = document.getElementById('send-btn');
  if (sendButton) {
    sendButton.disabled = true;
    sendButton.style.opacity = '0.5';
  }

  const filesLoading = pendingFiles.length > 0;
  const originalPlaceholder = input.placeholder;
  if (filesLoading) {
    input.disabled = true;
    input.placeholder = 'Загрузка файла...';
    input.value = 'Загрузка файла...';
  } else {
    // Очищаем поле ввода сразу
    input.value = '';
    input.style.height = 'auto';
  }

  const currentReplyTo = replyingTo;
  const currentReplyToMessage = replyingToMessage;
  cancelReply();

  try {
    if (pendingFiles.length > 0) {
      // Отправляем файлы.
      //
      // Раньше тут был баг: после apiUpload фронт НЕ создавал Message —
      // файл сохранялся на диск, но в чат ничего не приходило. Теперь
      // после успешной загрузки эмитим socket message:send с attachments,
      // чтобы Message действительно создался и появился в чате.
      for (const file of pendingFiles) {
        const formData = new FormData();
        formData.append('file', file);
        // content/replyTo передадим уже в message:send, не дублируем в upload.
        const uploaded = await apiUpload('/upload/file', formData);
        if (!uploaded || !uploaded.url) {
          throw new Error('Сервер не вернул URL файла');
        }
        const attachment = {
          url: uploaded.url,
          filename: uploaded.filename,
          originalName: uploaded.originalName,
          size: uploaded.size,
          type: uploaded.type,
          mimetype: uploaded.mimetype
        };
        const tempId = 'temp_' + Date.now() + '_' + (window.currentUser?._id || '') + '_' + Math.random().toString(36).slice(2, 8);
        socketSendMessage(channelId, content, currentReplyTo, [attachment], tempId);
      }
      // Очищаем pendingFiles и прячем preview-плашку (#file-preview).
      // Раньше тут стояла несуществующая cancelFileUpload() — это
      // приводило к ReferenceError, обрывая sendMessage и оставляя
      // input/preview не очищенными после отправки.
      cancelFile();
    } else {
      // Оптимистичное отображение: показываем сообщение мгновенно
      const tempId = 'temp_' + Date.now() + '_' + (window.currentUser?._id || '');
      
      // Проверяем если replyTo это временный ID, заменяем на реальный
      let actualReplyTo = currentReplyTo;
      if (currentReplyTo && currentReplyTo.startsWith('temp_')) {
        // Импортируем tempIdMapping из socket.js
        if (window.tempIdMapping && window.tempIdMapping.has(currentReplyTo)) {
          actualReplyTo = window.tempIdMapping.get(currentReplyTo);
        }
      }
      
      const tempMessage = {
        _id: tempId,
        content: content,
        author: {
          _id: window.currentUser?._id,
          username: window.currentUser?.username,
          nickname: window.currentUser?.nickname,
          avatar: window.currentUser?.avatar,
          discriminator: window.currentUser?.discriminator
        },
        replyTo: currentReplyToMessage || null, // Используем сохраненный объект
        attachments: [],
        createdAt: new Date().toISOString(),
        reactions: []
      };

      // Показываем сообщение в чате мгновенно
      appendMessage(tempMessage);
      scrollToBottom();

      // Отправляем текстовое сообщение через сокет с реальным ID ответа
      socketSendMessage(channelId, content, actualReplyTo, null, tempId);
    }

    replyingTo = null;
    socketStopTyping(channelId);
    isTyping = false; // Сбрасываем флаг печати
    clearTimeout(typingDebounce); // Очищаем таймер
  } catch (error) {
    console.error('sendMessage error:', error);
    // Backend rate-limit на upload: 429 + code MESSAGE_SPAM_COOLDOWN.
    // НЕ показываем техническую ошибку, не чистим токен, не делаем reload.
    // Запускаем локальный cooldown и возвращаем pendingFiles, чтобы
    // пользователь мог отправить тот же файл после паузы.
    const data = error?.data;
    const isSpam = error?.status === 429 || data?.code === 'MESSAGE_SPAM_COOLDOWN';
    if (isSpam) {
      const retryAfter = Number(data?.retryAfter) || 2;
      triggerMessageCooldown(channelId, retryAfter, {
        violationLevel: Number(data?.violationLevel) || undefined,
        warningTitle: data?.warningTitle,
        warningText: data?.warningText,
      });
      // Возвращаем текст и не сбрасываем pendingFiles (cancelFile вызывается
      // только в успешной ветке — здесь файлы остаются как были).
      input.value = content;
      return;
    }
    // Обычная ошибка загрузки.
    const reason = (error && error.message) ? error.message : '';
    console.error(reason ? `Не удалось отправить файл: ${reason}` : 'Не удалось отправить сообщение');
    input.value = content;
  } finally {
    isSending = false;
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.style.opacity = '1';
    }
    if (input.value === 'Загрузка файла...' || input.disabled) {
      input.value = '';
    }
    input.disabled = false;
    input.placeholder = originalPlaceholder;
    if (!input.value && !filesLoading) {
      input.style.height = 'auto';
    }
  }
}

/**
 * Обработка нажатий клавиш в поле ввода
 */
function handleMessageKeydown(e) {
  if (e.key === 'Enter') {
    if (!e.shiftKey) {
      e.preventDefault();
      e.stopPropagation(); // Дополнительная защита от всплытия
      sendMessage();
    }
    return;
  }
  if (e.key === 'Escape') {
    cancelReply();
    cancelEditMessage();
  }
}

/**
 * Автоматическое изменение высоты textarea
 */
function autoResizeTextarea(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
}

/**
 * Обработка ввода (индикатор печати)
 */
let typingDebounce = null;
let isTyping = false;

function handleMessageInput(e) {
  const input = e.target;
  const channelId = window.currentChannelId;
  if (!channelId) return;
  const hasText = input.value.trim().length > 0;
  
  // Обработка автодополнения упоминаний
  handleMentionAutocomplete(input);

  if (!hasText) {
    if (isTyping) {
      socketStopTyping(channelId);
      isTyping = false;
    }
    clearTimeout(typingDebounce);
    return;
  }
  
  // Проверяем настройку индикатора печати
  if (window.settingsManager && !window.settingsManager.get('privacy-typing-indicator')) {
    if (isTyping) {
      socketStopTyping(channelId);
      isTyping = false;
      clearTimeout(typingDebounce);
    }
    return; // Не отправляем индикатор если настройка выключена
  }
  
  // Отправляем typing:start только если еще не печатаем
  if (!isTyping) {
    socketStartTyping(channelId);
    isTyping = true;
  }
  
  // Сбрасываем таймер
  clearTimeout(typingDebounce);
  
  // Если пользователь перестал печатать на 3 секунды, отправляем typing:stop
  typingDebounce = setTimeout(() => {
    socketStopTyping(channelId);
    isTyping = false;
  }, 3000);
}

/**
 * Обработка автодополнения упоминаний
 */
let mentionAutocompleteIndex = 0;
let mentionAutocompleteList = [];

function handleMentionAutocomplete(input) {
  const value = input.value;
  const cursorPos = input.selectionStart;
  
  // Ищем @ перед курсором
  const textBeforeCursor = value.substring(0, cursorPos);
  const match = textBeforeCursor.match(/@(\w*)$/);
  
  const autocomplete = document.getElementById('mention-autocomplete');
  if (!autocomplete) return;
  
  if (match) {
    const query = match[1].toLowerCase();
    
    // Добавляем @everyone и @here в начало списка
    let suggestions = [];
    
    if ('everyone'.startsWith(query)) {
      suggestions.push({ type: 'special', name: 'everyone', icon: '📢' });
    }
    if ('here'.startsWith(query)) {
      suggestions.push({ type: 'special', name: 'here', icon: '👥' });
    }
    
    // Получаем список участников сервера
    const server = window.currentServer;
    if (server && server.members) {
      const members = server.members
        .map(m => ({ type: 'user', user: m.user || m }))
        .filter(item => item.user.username && item.user.username.toLowerCase().startsWith(query))
        .slice(0, 5);
      
      suggestions = suggestions.concat(members);
    }
    
    mentionAutocompleteList = suggestions;
    
    // Очищаем автокомплит безопасно
    autocomplete.innerHTML = '';
    
    if (mentionAutocompleteList.length > 0) {
      mentionAutocompleteList.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `mention-autocomplete-item ${index === mentionAutocompleteIndex ? 'selected' : ''}`;
        itemDiv.dataset.index = index;
        
        if (item.type === 'special') {
          const iconSpan = document.createElement('span');
          iconSpan.style.fontSize = '24px';
          iconSpan.textContent = item.icon;
          
          const nameSpan = document.createElement('span');
          nameSpan.className = 'mention-autocomplete-name';
          nameSpan.textContent = '@' + item.name; // Безопасно через textContent
          
          itemDiv.appendChild(iconSpan);
          itemDiv.appendChild(nameSpan);
          itemDiv.addEventListener('click', () => selectMention(item.name));
        } else {
          const avatarImg = document.createElement('img');
          avatarImg.className = 'mention-autocomplete-avatar';
          avatarImg.src = getAvatarUrl(item.user.avatar, item.user.username, item.user._id);
          avatarImg.alt = escapeHtml(item.user.username);
          
          const nameSpan = document.createElement('span');
          nameSpan.className = 'mention-autocomplete-name';
          nameSpan.textContent = item.user.username; // ИСПРАВЛЕНО: Безопасно через textContent
          
          itemDiv.appendChild(avatarImg);
          itemDiv.appendChild(nameSpan);
          itemDiv.addEventListener('click', () => selectMention(item.user.username));
        }
        
        autocomplete.appendChild(itemDiv);
      });
      
      autocomplete.classList.remove('hidden');
    } else {
      autocomplete.classList.add('hidden');
    }
  } else {
    autocomplete.classList.add('hidden');
    mentionAutocompleteIndex = 0;
  }
}

/**
 * Выбрать упоминание из автодополнения
 */
function selectMention(username) {
  const input = document.getElementById('message-input');
  if (!input) return;
  
  const value = input.value;
  const cursorPos = input.selectionStart;
  const textBeforeCursor = value.substring(0, cursorPos);
  const textAfterCursor = value.substring(cursorPos);
  
  // Заменяем @query на @username
  const newTextBefore = textBeforeCursor.replace(/@(\w*)$/, `@${username} `);
  input.value = newTextBefore + textAfterCursor;
  input.selectionStart = input.selectionEnd = newTextBefore.length;
  
  // Скрываем автодополнение
  const autocomplete = document.getElementById('mention-autocomplete');
  if (autocomplete) {
    autocomplete.classList.add('hidden');
  }
  
  input.focus();
}

/**
 * Начать ответ на сообщение
 */
function startReply(messageId) {
  const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!msgEl) return;

  replyingTo = messageId;
  
  // Сохраняем полный объект сообщения для оптимистичного отображения
  const authorId = msgEl.dataset.authorId;
  const authorName = msgEl.querySelector('.message-author')?.textContent || 'Пользователь';
  const content = msgEl.querySelector('.message-text')?.textContent || '';
  
  replyingToMessage = {
    _id: messageId,
    author: {
      _id: authorId,
      username: authorName
    },
    content: content
  };
  
  const contentPreview = content.substring(0, 50);

  const preview = document.getElementById('reply-preview');
  const authorEl = document.getElementById('reply-author-name');
  const contentEl = document.getElementById('reply-content-preview');

  if (preview) preview.classList.remove('hidden');
  if (authorEl) authorEl.textContent = authorName;
  if (contentEl) contentEl.textContent = contentPreview;

  document.getElementById('message-input')?.focus();
}

/**
 * Отменить ответ
 */
function cancelReply() {
  replyingTo = null;
  replyingToMessage = null;
  const preview = document.getElementById('reply-preview');
  if (preview) preview.classList.add('hidden');
}

/**
 * Начать редактирование сообщения
 */
function startEditMessage(messageId) {
  const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!msgEl) return;

  editingMessageId = messageId;
  const textEl = msgEl.querySelector('.message-text');
  const currentContent = textEl?.textContent || '';

  // Заменяем текст на textarea безопасно через DOM API
  const wrapper = textEl?.parentElement || msgEl;
  const editArea = document.createElement('div');
  
  // Создаем textarea
  const textarea = document.createElement('textarea');
  textarea.className = 'message-edit-input';
  textarea.rows = 2;
  textarea.value = currentContent; // ИСПРАВЛЕНО: Безопасно через .value вместо innerHTML
  
  // Создаем подсказку
  const hint = document.createElement('div');
  hint.className = 'message-edit-hint';
  hint.textContent = 'Нажмите ';
  
  const saveLink = document.createElement('a');
  saveLink.textContent = 'Enter';
  saveLink.style.cursor = 'pointer';
  saveLink.addEventListener('click', () => saveEditMessage(messageId));
  
  hint.appendChild(saveLink);
  hint.appendChild(document.createTextNode(' для сохранения, '));
  
  const cancelLink = document.createElement('a');
  cancelLink.textContent = 'Escape';
  cancelLink.style.cursor = 'pointer';
  cancelLink.addEventListener('click', () => cancelEditMessage());
  
  hint.appendChild(cancelLink);
  hint.appendChild(document.createTextNode(' для отмены'));
  
  editArea.appendChild(textarea);
  editArea.appendChild(hint);

  if (textEl) textEl.replaceWith(editArea);

  // Фокусируемся на textarea
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      saveEditMessage(messageId);
    }
    if (e.key === 'Escape') cancelEditMessage();
  });
}

/**
 * Сохранить отредактированное сообщение
 */
async function saveEditMessage(messageId) {
  const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!msgEl) return;

  const textarea = msgEl.querySelector('.message-edit-input');
  const newContent = textarea?.value.trim();

  if (!newContent) return;

  try {
    socketEditMessage(messageId, newContent);
    cancelEditMessage();
  } catch (error) {
    console.error('Не удалось отредактировать сообщение', error);
  }
}

/**
 * Отменить редактирование
 */
function cancelEditMessage() {
  if (!editingMessageId) return;

  const msgEl = document.querySelector(`[data-message-id="${editingMessageId}"]`);
  if (msgEl) {
    const editArea = msgEl.querySelector('.message-edit-input')?.closest('div');
    if (editArea) {
      const span = document.createElement('span');
      span.className = 'message-text';
      editArea.replaceWith(span);
    }
  }

  editingMessageId = null;
}

/**
 * Подтвердить удаление сообщения
 */
function confirmDeleteMessage(messageId) {
  if (confirm('Удалить это сообщение?')) {
    socketDeleteMessage(messageId);
  }
}

/**
 * Показать индикатор печати
 */
const typingUsers = new Map();
function showTypingIndicator(userId, username) {
  if (!userId || !username) return;
  const lastSeen = Date.now();
  typingUsers.set(userId, { username, lastSeen });
  setTimeout(() => {
    if (typingUsers.get(userId)?.lastSeen === lastSeen) {
      hideTypingIndicator(userId);
    }
  }, 5000);
  updateTypingIndicator();
}

function hideTypingIndicator(userId) {
  typingUsers.delete(userId);
  updateTypingIndicator();
}

function updateTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  if (!indicator) return;

  const now = Date.now();
  typingUsers.forEach((value, userId) => {
    if (now - value.lastSeen > 5000) typingUsers.delete(userId);
  });

  const users = Array.from(typingUsers.values()).map((value) => value.username);
  if (users.length === 0) {
    indicator.classList.add('hidden');
    return;
  }

  indicator.classList.remove('hidden');
  
  // Очищаем индикатор безопасно
  indicator.innerHTML = '';
  
  // Создаем текст безопасно
  const textSpan = document.createElement('span');
  textSpan.style.color = 'var(--text-muted)';
  textSpan.style.fontSize = '13px';
  
  let text = '';
  if (users.length === 1) text = `${escapeHtml(users[0])} печатает`; // ИСПРАВЛЕНО: sanitize username
  else if (users.length === 2) text = `${escapeHtml(users[0])} и ${escapeHtml(users[1])} печатают`; // ИСПРАВЛЕНО: sanitize usernames
  else text = `Несколько человек печатают`;
  
  textSpan.textContent = text;
  
  // Создаем точки анимации
  const dotsDiv = document.createElement('div');
  dotsDiv.className = 'typing-dots';
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement('span');
    dotsDiv.appendChild(dot);
  }
  
  indicator.appendChild(textSpan);
  indicator.appendChild(dotsDiv);
}

/**
 * Загрузка файлов
 */
function triggerFileUpload() {
  const fileInput = document.getElementById('file-input');
  if (!fileInput) return;
  fileInput.click();
}

function handleFileSelect(event) {
  const files = Array.from(event.target.files);
  if (files.length === 0) return;

  pendingFiles = files;
  const preview = document.getElementById('file-preview');
  const previewName = document.getElementById('file-preview-name');

  if (preview) preview.classList.remove('hidden');
  if (previewName) {
    if (files.length === 1) {
      previewName.textContent = files[0].name;
    } else {
      previewName.textContent = `${files.length} файлов`;
    }
  }

  // Сбрасываем input
  event.target.value = '';

  // После выбора файла возвращаем фокус в поле сообщения:
  // Enter должен отправлять выбранный файл, а не повторно активировать
  // кнопку прикрепления/открывать file picker.
  const input = document.getElementById('message-input');
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function cancelFile() {
  pendingFiles = [];
  const preview = document.getElementById('file-preview');
  if (preview) preview.classList.add('hidden');
}

/**
 * Emoji picker для реакций
 */
function toggleEmojiPickerForReaction(messageId) {
  const container = document.getElementById('emoji-picker-container');
  if (!container) return;

  container.classList.toggle('hidden');

  const picker = document.getElementById('emoji-picker');
  if (picker) {
    // Временно переключаем обработчик для реакций
    const handler = (event) => {
      socketReactMessage(messageId, event.detail.unicode);
      container.classList.add('hidden');
      picker.removeEventListener('emoji-click', handler);
      // Восстанавливаем обработчик для ввода
      setupEmojiPicker();
    };
    picker.addEventListener('emoji-click', handler);
  }
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds === Infinity) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

function initVideoPlayer(container) {
  const video = container.querySelector('.cvp-video');
  const overlay = container.querySelector('.cvp-overlay');
  const playPauseBtn = container.querySelector('.cvp-play-pause');
  const progressInput = container.querySelector('.cvp-progress');
  const timeDisplay = container.querySelector('.cvp-time');
  const muteBtn = container.querySelector('.cvp-mute-btn');
  const volumeSlider = container.querySelector('.cvp-volume');
  const fullscreenBtn = container.querySelector('.cvp-fullscreen-btn');

  function updateTimeDisplay() {
    timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration || 0)}`;
  }

  function togglePlay() {
    if (video.paused) {
      video.play().catch(err => console.log('Video play error:', err));
      overlay.style.display = 'none';
      playPauseBtn.textContent = '⏸';
    } else {
      video.pause();
      overlay.style.display = 'flex';
      playPauseBtn.textContent = '▶';
    }
  }

  overlay.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlay();
  });
  playPauseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlay();
  });
  video.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlay();
  });

  video.addEventListener('play', () => {
    overlay.style.display = 'none';
    playPauseBtn.textContent = '⏸';
  });
  video.addEventListener('pause', () => {
    overlay.style.display = 'flex';
    playPauseBtn.textContent = '▶';
  });

  video.addEventListener('timeupdate', () => {
    if (video.duration && progressInput && !progressInput.matches(':active')) {
      const pct = (video.currentTime / video.duration) * 100;
      progressInput.value = pct;
      progressInput.style.setProperty('--progress', pct + '%');
    }
    updateTimeDisplay();
  });

  video.addEventListener('loadedmetadata', () => {
    if (progressInput) {
      const pct = (video.currentTime / (video.duration || 1)) * 100;
      progressInput.value = pct;
      progressInput.style.setProperty('--progress', pct + '%');
    }
    updateTimeDisplay();
  });

  if (progressInput) {
    progressInput.addEventListener('input', (e) => {
      e.stopPropagation();
      if (video.duration) {
        video.currentTime = (progressInput.value / 100) * video.duration;
        progressInput.style.setProperty('--progress', progressInput.value + '%');
      }
    });
  }

  volumeSlider.addEventListener('input', (e) => {
    e.stopPropagation();
    const vol = volumeSlider.value / 100;
    video.volume = vol;
    video.muted = (vol === 0);
    updateVolumeIcon(vol, video.muted);
  });

  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    video.muted = !video.muted;
    updateVolumeIcon(video.volume, video.muted);
  });

  function updateVolumeIcon(vol, isMuted) {
    if (isMuted || vol === 0) {
      muteBtn.textContent = '🔇';
      volumeSlider.value = 0;
    } else {
      muteBtn.textContent = '🔊';
      volumeSlider.value = vol * 100;
    }
  }

  fullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const overlay = document.getElementById('video-fullscreen-overlay');
    const fsVideo = document.getElementById('video-fs-player');
    if (overlay && fsVideo) {
      activeChatVideo = video;
      const wasPlaying = !video.paused;
      fsVideo.src = video.src;
      fsVideo.currentTime = video.currentTime;
      overlay.classList.remove('hidden');
      if (wasPlaying) {
        fsVideo.play().catch(err => console.log('Fullscreen video play error:', err));
      }
      video.pause();
    }
  });

  // Остановка при выходе из viewport
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) {
        video.pause();
      }
    });
  }, { threshold: 0.2 });
  observer.observe(container);

  // Остановка при смене канала/навигации
  const navHandler = () => {
    if (!document.body.contains(container)) {
      document.removeEventListener('navigation:changed', navHandler);
      return;
    }
    video.pause();
  };
  document.addEventListener('navigation:changed', navHandler);
}

function initTxtPreview(container) {
  const expandBtn = container.querySelector('.txt-expand-btn');
  const pre = container.querySelector('.txt-preview-content');
  const url = container.dataset.url;
  
  if (!expandBtn || !pre || !url) return;
  
  expandBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (pre.classList.contains('hidden')) {
      try {
        expandBtn.disabled = true;
        expandBtn.textContent = 'Загрузка...';
        const res = await fetch(url);
        if (!res.ok) throw new Error('Ошибка загрузки');
        const text = await res.text();
        
        const lines = text.split('\n');
        if (lines.length > 100) {
          const displayedText = lines.slice(0, 100).join('\n');
          pre.textContent = displayedText;
          
          const showAllBtn = document.createElement('span');
          showAllBtn.className = 'txt-preview-more';
          showAllBtn.textContent = '\n\n... [показать полностью]';
          showAllBtn.style.cursor = 'pointer';
          showAllBtn.style.color = 'var(--accent, #5865f2)';
          showAllBtn.style.display = 'inline-block';
          showAllBtn.addEventListener('click', (eInner) => {
            eInner.stopPropagation();
            pre.textContent = text;
          });
          pre.appendChild(showAllBtn);
        } else {
          pre.textContent = text;
        }
        
        pre.classList.remove('hidden');
        expandBtn.textContent = 'Скрыть';
        expandBtn.disabled = false;
      } catch (err) {
        console.error('Text preview load error:', err);
        pre.textContent = 'Не удалось загрузить содержимое файла';
        pre.classList.remove('hidden');
        expandBtn.textContent = 'Скрыть';
        expandBtn.disabled = false;
      }
    } else {
      pre.classList.add('hidden');
      expandBtn.textContent = 'Показать';
    }
  });
}

function closeFullscreen() {
  const overlay = document.getElementById('video-fullscreen-overlay');
  const fsVideo = document.getElementById('video-fs-player');
  if (!overlay || !fsVideo) return;

  const wasPlaying = !fsVideo.paused;
  
  if (activeChatVideo) {
    activeChatVideo.currentTime = fsVideo.currentTime;
  }
  
  fsVideo.pause();
  fsVideo.src = '';
  overlay.classList.add('hidden');
  
  if (wasPlaying && activeChatVideo) {
    activeChatVideo.play().catch(err => console.log('Chat video play error:', err));
  }
  
  // Reset fullscreen progress indicators
  const fsProgress = document.querySelector('.video-fs-progress');
  if (fsProgress) {
    fsProgress.value = 0;
    fsProgress.style.setProperty('--progress', '0%');
  }
  
  activeChatVideo = null;
}

function initFullscreenOverlayListeners() {
  const backdrop = document.querySelector('.video-fs-backdrop');
  if (backdrop) backdrop.addEventListener('click', closeFullscreen);

  const closeBtn = document.querySelector('.video-fs-close');
  if (closeBtn) closeBtn.addEventListener('click', closeFullscreen);

  const fsVideo = document.getElementById('video-fs-player');
  const fsPlayPause = document.querySelector('.video-fs-play-pause');
  const fsProgress = document.querySelector('.video-fs-progress');
  const fsTime = document.querySelector('.video-fs-time');
  const fsMuteBtn = document.querySelector('.video-fs-mute-btn');
  const fsVolume = document.querySelector('.video-fs-volume');

  if (!fsVideo) return;

  // Play/pause
  if (fsPlayPause) {
    fsPlayPause.addEventListener('click', () => {
      if (fsVideo.paused) {
        fsVideo.play().catch(err => console.log('fs play error:', err));
        fsPlayPause.textContent = '⏸';
      } else {
        fsVideo.pause();
        fsPlayPause.textContent = '▶';
      }
    });
  }

  // Прогресс
  fsVideo.addEventListener('timeupdate', () => {
    if (fsProgress && !fsProgress.matches(':active')) {
      const pct = (fsVideo.currentTime / fsVideo.duration) * 100 || 0;
      fsProgress.value = pct;
      fsProgress.style.setProperty('--progress', pct + '%');
    }
    if (fsTime) fsTime.textContent = formatTime(fsVideo.currentTime) + ' / ' + formatTime(fsVideo.duration);
  });

  // Перемотка при перетаскивании
  if (fsProgress) {
    fsProgress.addEventListener('input', () => {
      fsVideo.currentTime = (fsProgress.value / 100) * fsVideo.duration;
      fsProgress.style.setProperty('--progress', fsProgress.value + '%');
    });
  }

  // Громкость
  if (fsVolume) {
    fsVolume.addEventListener('input', () => {
      fsVideo.volume = fsVolume.value / 100;
      if (fsMuteBtn) fsMuteBtn.textContent = fsVolume.value == 0 ? '🔇' : '🔊';
    });
  }

  // Мут
  if (fsMuteBtn) {
    fsMuteBtn.addEventListener('click', () => {
      fsVideo.muted = !fsVideo.muted;
      fsMuteBtn.textContent = fsVideo.muted ? '🔇' : '🔊';
    });
  }

  // Обновить кнопку при старте/паузе
  fsVideo.addEventListener('play', () => {
    if (fsPlayPause) fsPlayPause.textContent = '⏸';
  });
  fsVideo.addEventListener('pause', () => {
    if (fsPlayPause) fsPlayPause.textContent = '▶';
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFullscreenOverlayListeners);
} else {
  initFullscreenOverlayListeners();
}

// Перехват нативного fullscreen
document.addEventListener('fullscreenchange', () => {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  }
});
