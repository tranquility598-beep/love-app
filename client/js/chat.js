/**
 * Chat модуль - управление сообщениями
 */

// Состояние чата
let replyingTo = null;
let replyingToMessage = null; // Полный объект сообщения для оптимистичного отображения
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
    const replyPreview = escapeHtml(replyContent);
    const replyId = msg.replyTo._id || '';
    replyHtml = `
      <div class="message-reply" onclick="scrollToMessage('${replyId}')" style="cursor: pointer;">
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
      const isAudio =
        att.type === 'audio' ||
        (att.mimetype && att.mimetype.startsWith('audio/')) ||
        (att.url && String(att.url).includes('/audio/'));
      if (att.mimetype?.startsWith('image/') || att.type === 'image') {
        const baseUrl = window.BASE_URL || 'http://localhost:5555';
        const fn = att.filename || att.originalName || 'image';
        attachmentsHtml += `<img class="message-image" src="${baseUrl}${att.url}" alt="${fn}" loading="lazy">`;
      } else if (isAudio && typeof renderVoiceMessage === 'function') {
        attachmentsHtml += renderVoiceMessage(att, isOwn);
      } else {
        const baseUrl = window.BASE_URL || 'http://localhost:5555';
        const fn = att.filename || att.originalName || 'file';
        attachmentsHtml += `
          <div class="message-file" onclick="window.open('${baseUrl}${att.url}')">
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
function formatMessageContent(content) {
  // Используем безопасную функцию из sanitize.js
  return window.XSS.formatMarkdown(content);
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
 * Прокрутить к конкретному сообщению и подсветить его
 */
function scrollToMessage(messageId) {
  if (!messageId) return;
  
  const msgEl = document.querySelector(`[data-message-id="${messageId}"]`);
  if (!msgEl) {
    showNotification('warning', 'Сообщение не найдено');
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
  const currentReplyToMessage = replyingToMessage;
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
let typingDebounce = null;
let isTyping = false;

function handleMessageInput(e) {
  const input = e.target;
  const channelId = window.currentChannelId;
  if (!channelId) return;
  
  // Обработка автодополнения упоминаний
  handleMentionAutocomplete(input);
  
  // Проверяем настройку индикатора печати
  if (window.settingsManager && !window.settingsManager.get('privacy-typing-indicator')) {
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
    
    if (mentionAutocompleteList.length > 0) {
      autocomplete.innerHTML = mentionAutocompleteList.map((item, index) => {
        if (item.type === 'special') {
          return `
            <div class="mention-autocomplete-item ${index === mentionAutocompleteIndex ? 'selected' : ''}" 
                 onclick="selectMention('${item.name}')"
                 data-index="${index}">
              <span style="font-size: 24px;">${item.icon}</span>
              <span class="mention-autocomplete-name">@${item.name}</span>
            </div>
          `;
        } else {
          return `
            <div class="mention-autocomplete-item ${index === mentionAutocompleteIndex ? 'selected' : ''}" 
                 onclick="selectMention('${item.user.username}')"
                 data-index="${index}">
              <img class="mention-autocomplete-avatar" src="${getAvatarUrl(item.user.avatar)}" alt="${item.user.username}">
              <span class="mention-autocomplete-name">${item.user.username}</span>
            </div>
          `;
        }
      }).join('');
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
  if (!indicator) return;

  const users = Array.from(typingUsers.keys());
  if (users.length === 0) {
    indicator.classList.add('hidden');
    return;
  }

  indicator.classList.remove('hidden');
  
  let text = '';
  if (users.length === 1) text = `${users[0]} печатает`;
  else if (users.length === 2) text = `${users[0]} и ${users[1]} печатают`;
  else text = `Несколько человек печатают`;
  
  indicator.innerHTML = `
    <span style="color: var(--text-muted); font-size: 13px;">${text}</span>
    <div class="typing-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
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
