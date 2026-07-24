/*
 * LOVE Desktop — действия сообщений.
 * Подключается ПОСЛЕ init-app.js: добавляет кнопки прямо в баблы,
 * не зависит от старого пустого actionsHtml в script.js.
 */
(function () {
  'use strict';

  const ICONS = {
    reply: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 17-5-5 5-5"/><path d="M4 12h10a6 6 0 0 1 6 6v1"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4Z"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>'
  };

  function own(wrap) {
    const msg = wrap._msgData;
    if (msg) {
      if (msg.sender === 'own') return true;
      const author = msg.author && (msg.author._id || msg.author);
      if (author && window.currentUser) return String(author) === String(window.currentUser._id);
    }
    return !!wrap.closest('.message-group.own');
  }

  function sourceText(wrap) {
    const msg = wrap._msgData || {};
    return String(msg.text || wrap.querySelector('.message-bubble')?.textContent || '').trim();
  }

  function replyComposerFor(wrap) {
    const feed = wrap.closest('#chat-feed-container, #server-chat-feed, #room-chat-feed');
    if (!feed) return null;
    if (feed.id === 'chat-feed-container') return document.getElementById('message-form');
    if (feed.id === 'server-chat-feed') return document.getElementById('server-message-form');
    return document.getElementById('room-message-form');
  }

  function startReply(wrap) {
    const msg = wrap._msgData || {};
    const id = msg._id || wrap.getAttribute('data-message-id');
    if (!id || String(id).startsWith('temp-') || String(id).startsWith('temp_')) {
      if (typeof window.showToast === 'function') window.showToast('Подождите', 'Сообщение ещё отправляется.');
      return;
    }
    const form = replyComposerFor(wrap);
    const input = form?.querySelector('textarea, input[type="text"]');
    if (!form || !input) return;

    document.querySelectorAll('.love-reply-preview').forEach(node => node.remove());
    window.__loveReplyTarget = { id: String(id), text: sourceText(wrap) };
    const preview = document.createElement('div');
    preview.className = 'love-reply-preview';
    preview.innerHTML = '<span class="love-reply-preview__text"></span><button type="button" aria-label="Отменить ответ">×</button>';
    preview.querySelector('.love-reply-preview__text').textContent = 'Ответ: ' + (sourceText(wrap) || 'Вложение');
    preview.querySelector('button').addEventListener('click', () => {
      window.__loveReplyTarget = null;
      preview.remove();
    });
    form.parentNode.insertBefore(preview, form);
    input.focus();
  }

  function editMessage(wrap) {
    if (!own(wrap)) return;
    const msg = wrap._msgData || {};
    const id = msg._id || wrap.getAttribute('data-message-id');
    const bubble = wrap.querySelector('.message-bubble');
    const oldText = sourceText(wrap);
    if (!id || !bubble || !oldText) return;
    wrap.classList.add('editing');
    bubble.innerHTML = '';
    const input = document.createElement('input');
    input.className = 'msg-edit-input';
    input.value = oldText;
    input.setAttribute('aria-label', 'Текст сообщения');
    const hint = document.createElement('div');
    hint.className = 'msg-edit-hint';
    hint.textContent = 'Enter — сохранить, Esc — отмена';
    bubble.append(input, hint);
    input.focus();
    input.select();
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        bubble.textContent = oldText;
        wrap.classList.remove('editing');
        return;
      }
      if (event.key !== 'Enter' || event.shiftKey) return;
      const content = input.value.trim();
      if (!content) return;
      if (content !== oldText) {
        if (window.socket) window.socket.emit('message:edit', { messageId: id, content });
        else if (window.MessagesAPI) window.MessagesAPI.edit(id, content);
        if (msg) msg.text = content;
      }
      bubble.textContent = content;
      wrap.classList.remove('editing');
    });
  }

  function deleteMessage(wrap) {
    if (!own(wrap) || !confirm('Удалить это сообщение?')) return;
    const msg = wrap._msgData || {};
    const id = msg._id || wrap.getAttribute('data-message-id');
    if (id && !String(id).startsWith('temp-') && !String(id).startsWith('temp_')) {
      if (window.socket) window.socket.emit('message:delete', { messageId: id });
      else if (window.MessagesAPI) window.MessagesAPI.delete(id);
    }
    wrap.remove();
  }

  function addActions(wrap) {
    if (!wrap || wrap.dataset.loveActionsReady === '1') return;
    wrap.dataset.loveActionsReady = '1';
    const overlay = document.createElement('div');
    overlay.className = 'msg-actions-overlay';
    const actions = [{ kind: 'reply', title: 'Ответить', run: () => startReply(wrap) }];
    if (own(wrap)) {
      actions.push({ kind: 'edit', title: 'Редактировать', run: () => editMessage(wrap) });
      actions.push({ kind: 'trash delete', title: 'Удалить', run: () => deleteMessage(wrap) });
    }
    actions.forEach(action => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'msg-action-btn ' + action.kind;
      button.title = action.title;
      button.setAttribute('aria-label', action.title);
      button.innerHTML = ICONS[action.kind.split(' ')[0]];
      button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); action.run(); });
      overlay.appendChild(button);
    });
    wrap.appendChild(overlay);
  }

  function scan(root) {
    (root instanceof Element && root.matches?.('.message-bubble-wrap') ? [root] : root.querySelectorAll?.('.message-bubble-wrap') || [])
      .forEach(addActions);
  }

  const observer = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(node => {
    if (node.nodeType === 1) scan(node);
  })));

  function init() {
    scan(document);
    observer.observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
