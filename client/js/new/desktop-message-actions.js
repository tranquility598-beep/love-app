/* Desktop message actions, reply previews and context menu. */
(function () {
  'use strict';

  const ICONS = {
    reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 17-5-5 5-5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>',
    report: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/></svg>'
  };

  const TEMP_ID = /^temp[-_]/;
  let contextMenu = null;
  let contextWrap = null;

  function own(wrap) {
    const msg = wrap._msgData;
    if (msg) {
      if (msg.sender === 'own') return true;
      if (msg.sender === 'partner') return false;
      const author = msg.author && (msg.author._id || msg.author);
      if (author && window.currentUser) return String(author) === String(window.currentUser._id);
    }
    return !!wrap.closest('.message-group.own');
  }

  function sourceText(wrap) {
    const msg = wrap._msgData || {};
    return String(msg.text || wrap.querySelector('.message-bubble')?.textContent || '').trim();
  }

  function messageId(wrap) {
    const msg = wrap._msgData || {};
    return msg._id || msg.id || wrap.getAttribute('data-message-id') || wrap.getAttribute('data-temp-id') || '';
  }

  function isTemporary(id) {
    return !id || TEMP_ID.test(String(id));
  }

  function replyComposerFor(wrap) {
    const feed = wrap.closest('#chat-feed-container, #server-chat-feed, #room-chat-feed');
    if (!feed) return null;
    if (feed.id === 'chat-feed-container') return document.getElementById('message-form');
    if (feed.id === 'server-chat-feed') return document.getElementById('server-message-form');
    return document.getElementById('room-message-form');
  }

  function authorName(wrap) {
    const msg = wrap._msgData || {};
    if (own(wrap)) return 'Вы';
    if (typeof msg.sender === 'string' && msg.sender !== 'partner') return msg.sender;
    const author = msg.author;
    if (author && typeof author === 'object') return author.nickname || author.username || 'Участник';
    return wrap.closest('.message-group')?.querySelector('.msg-sender-name')?.textContent?.trim() || 'Участник';
  }

  function clearReplyTarget() {
    window.__loveReplyTarget = null;
    document.querySelectorAll('.love-reply-preview').forEach(node => node.remove());
  }
  window._clearLoveReplyTarget = clearReplyTarget;

  function startReply(wrap) {
    const msg = wrap._msgData || {};
    const id = messageId(wrap);
    if (!id) return;
    const form = replyComposerFor(wrap);
    const input = form?.querySelector('textarea, input[type="text"]');
    if (!form || !input) return;

    clearReplyTarget();
    window.__loveReplyTarget = {
      id: String(id),
      text: sourceText(wrap),
      author: authorName(wrap),
      message: msg
    };

    const preview = document.createElement('div');
    preview.className = 'love-reply-preview';
    preview.innerHTML = '<span class="love-reply-preview__icon">' + ICONS.reply + '</span><span class="love-reply-preview__body"><strong></strong><span class="love-reply-preview__text"></span></span><button type="button" aria-label="Отменить ответ">&times;</button>';
    preview.querySelector('strong').textContent = 'Ответ для ' + authorName(wrap);
    preview.querySelector('.love-reply-preview__text').textContent = sourceText(wrap) || 'Вложение';
    preview.querySelector('button').addEventListener('click', clearReplyTarget);
    form.parentNode.insertBefore(preview, form);
    input.focus();
  }

  function sendEdit(id, content) {
    if (window.socket) window.socket.emit('message:edit', { messageId: id, content });
    else if (window.MessagesAPI) window.MessagesAPI.edit(id, content);
  }

  function editMessage(wrap) {
    if (!own(wrap)) return;
    const msg = wrap._msgData || {};
    const bubble = wrap.querySelector('.message-bubble');
    const oldText = sourceText(wrap);
    if (!bubble || !oldText || wrap.classList.contains('editing')) return;

    wrap.classList.add('editing');
    bubble.innerHTML = '';
    const input = document.createElement('textarea');
    input.className = 'msg-edit-input';
    input.value = oldText;
    input.rows = 1;
    input.setAttribute('aria-label', 'Текст сообщения');
    const hint = document.createElement('div');
    hint.className = 'msg-edit-hint';
    hint.textContent = 'Enter - сохранить, Esc - отмена';
    bubble.append(input, hint);
    input.focus();
    input.select();

    const finish = (content) => {
      bubble.textContent = content;
      wrap.classList.remove('editing');
    };
    input.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish(oldText);
        return;
      }
      if (event.key !== 'Enter' || event.shiftKey) return;
      event.preventDefault();
      const content = input.value.trim();
      if (!content) return;
      if (content !== oldText) {
        msg.text = content;
        const id = messageId(wrap);
        if (isTemporary(id) || msg._pending) msg._queuedEdit = content;
        else sendEdit(id, content);
      }
      finish(content);
    });
  }

  function removeFromLocalModels(msg, id) {
    const matches = item => item === msg || (id && String(item?._id || item?._tempId || '') === String(id));
    (window._mockConversations || []).forEach(conv => {
      if (Array.isArray(conv.messages)) conv.messages = conv.messages.filter(item => !matches(item));
    });
    Object.values(window._mockServers || {}).forEach(server => {
      (server.channels || []).forEach(channel => {
        if (Array.isArray(channel.messages)) channel.messages = channel.messages.filter(item => !matches(item));
      });
    });
  }

  function deleteMessage(wrap) {
    if (!own(wrap) || !confirm('Удалить это сообщение?')) return;
    const msg = wrap._msgData || {};
    const id = messageId(wrap);
    if (!isTemporary(id) && !msg._pending) {
      if (window.socket) window.socket.emit('message:delete', { messageId: id });
      else if (window.MessagesAPI) window.MessagesAPI.delete(id);
    }
    removeFromLocalModels(msg, id);
    wrap.remove();
  }

  async function copyMessage(wrap) {
    const text = sourceText(wrap);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      if (typeof window.showToast === 'function') window.showToast('Скопировано', 'Текст сообщения в буфере.');
    } catch (_) {
      if (typeof window.showToast === 'function') window.showToast('Не удалось скопировать', 'Попробуйте ещё раз.');
    }
  }

  function getActions(wrap, includeCopy) {
    const actions = [{ kind: 'reply', title: 'Ответить', run: () => startReply(wrap) }];
    if (includeCopy && sourceText(wrap)) actions.push({ kind: 'copy', title: 'Копировать', run: () => copyMessage(wrap) });
    if (!own(wrap) && !isTemporary(messageId(wrap))) actions.push({ kind: 'report', title: 'Пожаловаться', run: () => window.openMessageReport?.({ messageId: messageId(wrap), author: authorName(wrap), preview: sourceText(wrap) }) });
    if (own(wrap) && sourceText(wrap)) actions.push({ kind: 'edit', title: 'Редактировать', run: () => editMessage(wrap) });
    if (own(wrap)) actions.push({ kind: 'trash', title: 'Удалить', danger: true, run: () => deleteMessage(wrap) });
    return actions;
  }

  function closeContextMenu() {
    if (contextMenu) contextMenu.remove();
    if (contextWrap) contextWrap.classList.remove('actions-open');
    contextMenu = null;
    contextWrap = null;
  }

  function openContextMenu(wrap, x, y) {
    closeContextMenu();
    contextWrap = wrap;
    wrap.classList.add('actions-open');
    contextMenu = document.createElement('div');
    contextMenu.className = 'msg-context-menu msg-context-menu--desktop';
    contextMenu.setAttribute('role', 'menu');

    getActions(wrap, true).forEach(action => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'msg-context-item' + (action.danger ? ' danger' : '');
      button.setAttribute('role', 'menuitem');
      button.innerHTML = ICONS[action.kind] + '<span></span>';
      button.querySelector('span').textContent = action.title;
      button.addEventListener('click', event => {
        event.stopPropagation();
        closeContextMenu();
        action.run();
      });
      contextMenu.appendChild(button);
    });
    document.body.appendChild(contextMenu);

    const viewportWidth = window.visualViewport?.width || window.innerWidth;
    const viewportHeight = window.visualViewport?.height || window.innerHeight;
    const rect = contextMenu.getBoundingClientRect();
    contextMenu.style.left = Math.max(10, Math.min(x, viewportWidth - rect.width - 10)) + 'px';
    contextMenu.style.top = Math.max(10, Math.min(y, viewportHeight - rect.height - 10)) + 'px';
  }

  function findMessageWrap(id) {
    if (!id) return null;
    return Array.from(document.querySelectorAll('.message-bubble-wrap')).find(wrap => String(messageId(wrap)) === String(id)) || null;
  }

  function normalizeReply(msg) {
    const raw = msg?.replyTo || msg?.reply;
    if (!raw && !msg?.replyToId) return null;
    if (raw && typeof raw === 'object') {
      const author = raw.author;
      return {
        id: raw._id || raw.id || msg.replyToId || '',
        text: raw.content || raw.text || msg.replyToText || '',
        author: msg.replyToAuthor || (author && typeof author === 'object' ? author.nickname || author.username : '') || ''
      };
    }
    return {
      id: msg.replyToId || raw || '',
      text: msg.replyToText || msg.replyToContent || '',
      author: msg.replyToAuthor || ''
    };
  }

  function renderReplyReference(wrap) {
    if (wrap.querySelector('.message-reply-reference')) return;
    const reply = normalizeReply(wrap._msgData);
    if (!reply?.id) return;
    const source = findMessageWrap(reply.id);
    const sourceMsg = source?._msgData;
    const author = reply.author || (source ? authorName(source) : 'Сообщение');
    const text = reply.text || sourceMsg?.text || (source ? sourceText(source) : '') || 'Сообщение недоступно';

    const preview = document.createElement('button');
    preview.type = 'button';
    preview.className = 'message-reply-reference';
    preview.innerHTML = '<span class="message-reply-line"></span><span class="message-reply-copy"><strong></strong><span></span></span>';
    preview.querySelector('strong').textContent = author;
    preview.querySelector('.message-reply-copy > span').textContent = text;
    preview.addEventListener('click', () => {
      const target = findMessageWrap(reply.id);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      target.classList.add('message-highlight');
      setTimeout(() => target.classList.remove('message-highlight'), 1200);
    });
    const bubble = wrap.querySelector('.message-bubble');
    if (bubble) wrap.insertBefore(preview, bubble);
    else wrap.prepend(preview);
  }

  function addActions(wrap) {
    if (!wrap) return;
    renderReplyReference(wrap);
    if (wrap.dataset.loveActionsReady === '1') return;
    wrap.dataset.loveActionsReady = '1';
    const overlay = document.createElement('div');
    overlay.className = 'msg-actions-overlay';
    overlay.setAttribute('role', 'toolbar');
    overlay.setAttribute('aria-label', 'Действия с сообщением');
    getActions(wrap, false).forEach(action => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'msg-action-btn' + (action.danger ? ' delete' : '');
      button.setAttribute('aria-label', action.title);
      button.setAttribute('data-tooltip', action.title);
      button.innerHTML = ICONS[action.kind];
      button.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        action.run();
      });
      overlay.appendChild(button);
    });
    wrap.appendChild(overlay);
  }

  function scan(root) {
    const wraps = root instanceof Element && root.matches?.('.message-bubble-wrap')
      ? [root]
      : root.querySelectorAll?.('.message-bubble-wrap') || [];
    wraps.forEach(addActions);
  }

  const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType === 1) scan(node);
  })));

  function init() {
    scan(document);
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('contextmenu', event => {
      const wrap = event.target.closest?.('.message-bubble-wrap');
      if (!wrap) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      openContextMenu(wrap, event.clientX, event.clientY);
    }, true);
    document.addEventListener('pointerdown', event => {
      if (contextMenu && !contextMenu.contains(event.target)) closeContextMenu();
    }, true);
    document.addEventListener('scroll', closeContextMenu, true);
    window.addEventListener('blur', closeContextMenu);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeContextMenu();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
