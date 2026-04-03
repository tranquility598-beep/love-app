/**
 * Chat модуль - управление сообщениями
 */

// Состояние чата
let replyingTo = null;
let editingMessageId = null;
let pendingFiles = [];
let isLoadingMessages = false;

/**
 * Загрузить сообщения канала
 */
async function loadMessages(channelId) {
  const list = document.getElementById('messages-list');
  if (!list) return;

  list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Загрузка...</div>';

  try {
    const data = await MessagesAPI.getMessages(channelId);
    renderMessages(data.messages || []);
    scrollToBottom();
  } catch (error) {
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">Ошибка загрузки сообщений</div>';
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
}

/**
 * Отрендерить одно сообщение
 */
function renderMessage(msg, isGrouped) {
  const author = msg.author || {};
  const authorId = author._id || author;
  const authorName = author.username || 'Неизвестный';
  const authorAvatar = getAvatarUrl(author.avatar);
  const time = formatTime(msg.createdAt);
  const fullTime = formatDate(msg.createdAt);
  const isOwn = authorId === window.currentUser?._id;

  // Ответ на сообщение
  let replyHtml = '';
  if (msg.replyTo) {
    const replyAuthor = msg.replyTo.author?.username || 'Неизвестный';
    const replyContent = msg.replyTo.content?.substring(0, 60) || '';
    const replyPreview = escapeHtml(replyContent); // Define replyPreview
    replyHtml = `
      <div class="message-reply">
        <div class="message-reply-info">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
          <strong>${replyAuthor}${msg.replyTo.author?.role === 'owner' ? ' 👑' : ''}</strong>: ${replyPreview}
        </div>
      </div>
    `;
  }

  // Текст сообщения
  const content = msg.deleted
    ? '<span class="message-text deleted">Сообщение удалено</span>'
    : `<span class="message-text">${formatMessageContent(msg.content || '')}</span>
       ${msg.edited ? '<span class="message-edited-tag">(изм.)</span>' : ''}`;

  // Вложения
  let attachmentsHtml = '';
  if (msg.attachments && msg.attachments.length > 0) {
    attachmentsHtml = '<div class="message-attachments">';
    msg.attachments.forEach(att => {
      if (att.mimetype?.startsWith('image/')) {
        const baseUrl = window.BASE_URL || 'http://localhost:5555';
        attachmentsHtml += `<img class="message-image" src="${baseUrl}${att.url}" alt="${att.filename}" loading="lazy">`;
      } else {
        const baseUrl = window.BASE_URL || 'http://localhost:5555';
        attachmentsHtml += `
          <div class="message-file" onclick="window.open('${baseUrl}${att.url}')">
            <span class="message-file-icon">${getFileIcon(att.mimetype)}</span>
            <div class="message-file-info">
              <div class="message-file-name">${att.filename}</div>
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
          <span class="message-author">${authorName}${author.role === 'owner' ? ' <span title="Создатель" style="font-size:1.1em">👑</span>' : ''}</span>
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
function formatMessageContent(content) {
  let text = escapeHtml(content);
  // Ссылки
  text = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color:var(--text-link)">$1</a>');
  // Жирный текст **text**
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Курсив *text*
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Код `code`
  text = text.replace(/`(.+?)`/g, '<code style="background:var(--bg-tertiary);padding:2px 4px;border-radius:3px;font-family:monospace">$1</code>');
  return text;
}

/**
 * Экранировать HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
    el.addEventListener('contextmenu', (e) => showContextMenu(e, msg._id, msg.author?._id));
    el.querySelectorAll('.message-image').forEach(img => {
      img.addEventListener('click', () => openImageViewer(img.src));
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
    textEl.innerHTML = formatMessageContent(msg.content || '');
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
  
  // Обновляем содержимое если нужно
  const textEl = el.querySelector('.message-text');
  if (textEl && msg.content) {
    textEl.innerHTML = formatMessageContent(msg.content);
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
 * Отправить сообщение
 */
async function sendMessage() {
  const input = document.getElementById('message-input');
  if (!input) return;

  const content = input.value.trim();
  const channelId = window.currentChannelId;

  if (!channelId) {
    showNotification('warning', 'Выберите канал для отправки сообщения');
    return;
  }

  if (!content && pendingFiles.length === 0) return;

  // Пасхалка: триггер на слова
  const lowerContent = content.toLowerCase();
  if (lowerContent.includes('love') || lowerContent.includes('люблю')) {
    if (window.triggerHeartBurst) window.triggerHeartBurst();
  }

  // Очищаем поле ввода
  input.value = '';
  input.style.height = 'auto';
  const currentReplyTo = replyingTo;
  cancelReply();

  try {
    if (pendingFiles.length > 0) {
      // Отправляем файлы
      for (const file of pendingFiles) {
        const formData = new FormData();
        formData.append('file', file);
        if (content) formData.append('content', content);
        if (currentReplyTo) formData.append('replyTo', currentReplyTo);
        formData.append('channelId', channelId);
        formData.append('isDM', window.currentDMConversation ? 'true' : 'false');
        await apiUpload('/upload/file', formData);
      }
      pendingFiles = [];
      cancelFileUpload();
    } else {
      // Оптимистичное отображение: показываем сообщение мгновенно
      const tempId = 'temp_' + Date.now() + '_' + (window.currentUser?._id || '');
      const tempMessage = {
        _id: tempId,
        content: content,
        author: {
          _id: window.currentUser?._id,
          username: window.currentUser?.username,
          avatar: window.currentUser?.avatar,
          discriminator: window.currentUser?.discriminator
        },
        replyTo: currentReplyTo || null,
        attachments: [],
        createdAt: new Date().toISOString(),
        reactions: []
      };

      // Показываем сообщение в чате мгновенно
      appendMessage(tempMessage);
      scrollToBottom();

      // Отправляем текстовое сообщение через сокет
      socketSendMessage(channelId, content, currentReplyTo);
    }

    replyingTo = null;
    socketStopTyping(channelId);
  } catch (error) {
    showNotification('error', 'Не удалось отправить сообщение');
    input.value = content;
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
function handleMessageInput(e) {
  const channelId = window.currentChannelId;
  if (channelId) socketStartTyping(channelId);
}

/**
 * Начать ответ на сообщение
 */
function startReply(messageId) {
  const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!msgEl) return;

  replyingTo = messageId;
  const authorId = msgEl.dataset.authorId;
  const authorName = msgEl.querySelector('.message-author')?.textContent || 'Пользователь';
  const content = msgEl.querySelector('.message-text')?.textContent?.substring(0, 50) || '';

  const preview = document.getElementById('reply-preview');
  const authorEl = document.getElementById('reply-author-name'); // Corrected ID
  const contentEl = document.getElementById('reply-content-preview');

  if (preview) preview.classList.remove('hidden');
  if (authorEl) authorEl.textContent = authorName;
  if (contentEl) contentEl.textContent = content;

  document.getElementById('message-input')?.focus();
}

/**
 * Отменить ответ
 */
function cancelReply() {
  replyingTo = null;
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

  // Заменяем текст на textarea
  const wrapper = textEl?.parentElement || msgEl;
  const editArea = document.createElement('div');
  editArea.innerHTML = `
    <textarea class="message-edit-input" rows="2">${currentContent}</textarea>
    <div class="message-edit-hint">
      Нажмите <a onclick="saveEditMessage('${messageId}')">Enter</a> для сохранения,
      <a onclick="cancelEditMessage()">Escape</a> для отмены
    </div>
  `;

  if (textEl) textEl.replaceWith(editArea);

  const textarea = editArea.querySelector('textarea');
  if (textarea) {
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
    showNotification('error', 'Не удалось отредактировать сообщение');
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
function showTypingIndicator(username) {
  typingUsers.set(username, Date.now());
  updateTypingIndicator();
}

function hideTypingIndicator(userId) {
  // Удаляем по userId
  typingUsers.delete(userId);
  updateTypingIndicator();
}

function updateTypingIndicator() {
  const indicator = document.getElementById('typing-indicator');
  const text = document.getElementById('typing-text');
  if (!indicator || !text) return;

  const users = Array.from(typingUsers.keys());
  if (users.length === 0) {
    indicator.classList.add('hidden');
    return;
  }

  indicator.classList.remove('hidden');
  if (users.length === 1) text.textContent = `${users[0]} печатает...`;
  else if (users.length === 2) text.textContent = `${users[0]} и ${users[1]} печатают...`;
  else text.textContent = `Несколько человек печатают...`;
}

/**
 * Загрузка файлов
 */
function triggerFileUpload() {
  document.getElementById('file-input')?.click();
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
