/**
 * Капсулы времени — клиентская часть.
 *
 * Капсула это обычное сообщение с датой доставки в будущем. Пользователь
 * ставит дату в композере, сервер прячет сообщение до срока и потом
 * рассылает его обычным 'message:new'.
 *
 * Здесь три вещи:
 *  1) кнопка с часами в каждом композере + выбор даты;
 *  2) плашка над композером, пока дата выставлена (её видно, чтобы никто
 *     не отправил капсулу случайно, забыв про выставленный срок);
 *  3) список «Мои капсулы» с возможностью отменить до доставки.
 *
 * Дату забирает init-app.js через window._consumeCapsuleDeliverAt() в момент
 * отправки — так один выставленный срок уходит ровно с одним сообщением.
 */
(function () {
  'use strict';

  const COMPOSERS = [
    { form: 'message-form', input: 'message-input' },
    { form: 'server-message-form', input: 'server-message-input' },
    { form: 'room-message-form', input: 'room-message-input' }
  ];

  // Сервер требует минимум минуту вперёд (MIN_DELIVER_AHEAD_MS) и максимум
  // 5 лет. Держим тот же диапазон на клиенте, чтобы не ловить 400.
  const MIN_AHEAD_MS = 60 * 1000;
  const MAX_AHEAD_MS = 5 * 365 * 24 * 60 * 60 * 1000;

  const CLOCK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15.5 14"></polyline></svg>';

  let armedDate = null;

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function fmt(date) {
    try {
      return new Intl.DateTimeFormat('ru-RU', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      }).format(date);
    } catch (e) {
      return date.toLocaleString();
    }
  }

  function toast(title, body) {
    if (typeof window.showToast === 'function') window.showToast(title, body);
  }

  // datetime-local хочет локальное время без Z, поэтому смещение вычитаем сами.
  function toLocalInputValue(date) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }

  // ── Выставленная дата ────────────────────────────────────────────────────

  function arm(date) {
    armedDate = date;
    renderBanners();
  }

  function disarm() {
    armedDate = null;
    renderBanners();
  }

  window._consumeCapsuleDeliverAt = function () {
    if (!armedDate) return null;
    const iso = armedDate.toISOString();
    disarm();
    return iso;
  };

  // ── Плашка над композером ────────────────────────────────────────────────

  function renderBanners() {
    COMPOSERS.forEach(({ form }) => {
      const formEl = document.getElementById(form);
      if (!formEl) return;
      const area = formEl.parentElement;
      if (!area) return;

      let banner = area.querySelector('.capsule-banner');
      if (!armedDate) {
        if (banner) banner.remove();
        return;
      }
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'capsule-banner';
        area.insertBefore(banner, formEl);
      }
      banner.innerHTML =
        `<span class="capsule-banner-icon">${CLOCK_ICON}</span>` +
        '<span class="capsule-banner-text">Следующее сообщение уйдёт капсулой — ' +
        `откроется <b>${esc(fmt(armedDate))}</b>. Напиши текст и отправь.</span>` +
        '<button type="button" class="capsule-banner-cancel" title="Отменить капсулу">&times;</button>';
    });
  }

  // Отмена через делегирование: плашку может пересобрать перерисовка
  // композера, и повешенный на кнопку onclick тогда теряется.
  document.addEventListener('click', (e) => {
    if (e.target.closest('.capsule-banner-cancel')) {
      e.preventDefault();
      disarm();
    }
  });

  // ── Выбор даты ───────────────────────────────────────────────────────────

  const PRESETS = [
    { label: 'Через час', ms: 60 * 60 * 1000 },
    { label: 'Завтра', ms: 24 * 60 * 60 * 1000 },
    { label: 'Через неделю', ms: 7 * 24 * 60 * 60 * 1000 },
    { label: 'Через месяц', ms: 30 * 24 * 60 * 60 * 1000 },
    { label: 'Через год', ms: 365 * 24 * 60 * 60 * 1000 }
  ];

  function closeModal() {
    const existing = document.getElementById('capsule-modal');
    if (existing) existing.remove();
  }

  function buildModal(title, bodyHtml) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.id = 'capsule-modal';
    overlay.className = 'capsule-modal-overlay';
    overlay.innerHTML =
      '<div class="capsule-modal" role="dialog" aria-modal="true">' +
        '<header class="capsule-modal-header">' +
          `<h3>${esc(title)}</h3>` +
          '<button type="button" class="capsule-modal-close" aria-label="Закрыть">&times;</button>' +
        '</header>' +
        `<div class="capsule-modal-body">${bodyHtml}</div>` +
      '</div>';
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    overlay.querySelector('.capsule-modal-close').onclick = closeModal;
    document.body.appendChild(overlay);
    return overlay;
  }

  function openPicker() {
    const initial = armedDate || new Date(Date.now() + 24 * 60 * 60 * 1000);
    const overlay = buildModal('Капсула времени',
      '<p class="capsule-hint">Выбери дату, затем напиши сообщение и отправь его как обычно — ' +
      'оно спрячется до срока. Получатель ничего не увидит и не получит уведомление раньше времени.</p>' +
      '<div class="capsule-presets">' +
        PRESETS.map((p, i) => `<button type="button" class="capsule-preset" data-preset="${i}">${esc(p.label)}</button>`).join('') +
      '</div>' +
      `<label class="capsule-field"><span>Точная дата и время</span><input type="datetime-local" id="capsule-datetime" value="${esc(toLocalInputValue(initial))}" min="${esc(toLocalInputValue(new Date(Date.now() + MIN_AHEAD_MS)))}"></label>` +
      '<div class="capsule-error" id="capsule-error"></div>' +
      '<div class="capsule-modal-actions">' +
        '<button type="button" class="capsule-btn-ghost" id="capsule-open-list">Мои капсулы</button>' +
        '<button type="button" class="capsule-btn-primary" id="capsule-confirm">Выбрать дату</button>' +
      '</div>');

    const input = overlay.querySelector('#capsule-datetime');
    const errorEl = overlay.querySelector('#capsule-error');

    overlay.querySelectorAll('.capsule-preset').forEach(btn => {
      btn.onclick = () => {
        const preset = PRESETS[Number(btn.dataset.preset)];
        input.value = toLocalInputValue(new Date(Date.now() + preset.ms));
        errorEl.textContent = '';
      };
    });

    overlay.querySelector('#capsule-confirm').onclick = () => {
      const date = new Date(input.value);
      if (Number.isNaN(date.getTime())) {
        errorEl.textContent = 'Выбери дату и время.';
        return;
      }
      const delta = date.getTime() - Date.now();
      if (delta < MIN_AHEAD_MS) {
        errorEl.textContent = 'Дата должна быть минимум на минуту в будущем.';
        return;
      }
      if (delta > MAX_AHEAD_MS) {
        errorEl.textContent = 'Максимум — 5 лет вперёд.';
        return;
      }
      arm(date);
      closeModal();
      const composerInput = document.getElementById(activeComposer()?.input || '');
      if (composerInput) composerInput.focus();
    };

    overlay.querySelector('#capsule-open-list').onclick = () => {
      closeModal();
      openCapsuleList();
    };
  }

  // Какой композер сейчас на экране — по видимости формы.
  function activeComposer() {
    return COMPOSERS.find(({ form }) => {
      const el = document.getElementById(form);
      return el && el.offsetParent !== null;
    }) || null;
  }

  // ── Мои капсулы ──────────────────────────────────────────────────────────

  async function openCapsuleList() {
    const overlay = buildModal('Мои капсулы', '<div class="capsule-list" id="capsule-list">Загружаю…</div>');
    const listEl = overlay.querySelector('#capsule-list');

    if (typeof MessagesAPI === 'undefined' || !MessagesAPI.getCapsules) {
      listEl.textContent = 'Список недоступен.';
      return;
    }

    try {
      const data = await MessagesAPI.getCapsules();
      const capsules = (data && data.capsules) || [];
      if (!capsules.length) {
        listEl.innerHTML = '<p class="capsule-hint">Запланированных капсул нет.</p>';
        return;
      }
      listEl.innerHTML = capsules.map(c => {
        const when = c.deliverAt ? fmt(new Date(c.deliverAt)) : '—';
        const where = c.channel && c.channel.name ? `# ${c.channel.name}` : 'Личные сообщения';
        const preview = (c.content || '').slice(0, 140) || 'Вложение';
        return '<div class="capsule-item">' +
            '<div class="capsule-item-main">' +
              `<div class="capsule-item-when">${esc(when)}</div>` +
              `<div class="capsule-item-text">${esc(preview)}</div>` +
              `<div class="capsule-item-where">${esc(where)}</div>` +
            '</div>' +
            `<button type="button" class="capsule-item-cancel" data-id="${esc(c._id)}">Отменить</button>` +
          '</div>';
      }).join('');

      listEl.querySelectorAll('.capsule-item-cancel').forEach(btn => {
        btn.onclick = async () => {
          btn.disabled = true;
          try {
            await MessagesAPI.cancelCapsule(btn.dataset.id);
            btn.closest('.capsule-item').remove();
            if (!listEl.querySelector('.capsule-item')) {
              listEl.innerHTML = '<p class="capsule-hint">Запланированных капсул нет.</p>';
            }
            toast('Капсула отменена', 'Сообщение не будет отправлено.');
          } catch (err) {
            btn.disabled = false;
            toast('Не удалось отменить', err?.message || 'Попробуй ещё раз.');
          }
        };
      });
    } catch (err) {
      listEl.textContent = 'Не удалось загрузить капсулы.';
    }
  }

  // ── Реакция на события сервера ───────────────────────────────────────────

  // Оптимистичный баббл нарисован композером до ответа сервера. Капсулы
  // в ленте быть не должно — убираем его из модели и перерисовываем.
  function removeLocalByTempId(tempId) {
    if (!tempId) return;
    const match = m => String(m._tempId || '') === String(tempId);

    const convs = window._mockConversations || [];
    for (const conv of convs) {
      const idx = (conv.messages || []).findIndex(match);
      if (idx !== -1) {
        conv.messages.splice(idx, 1);
        if (typeof renderChatMessages === 'function') renderChatMessages(conv);
        return;
      }
    }

    const servers = window._mockServers || {};
    for (const srv of Object.values(servers)) {
      for (const ch of srv.channels || []) {
        const idx = (ch.messages || []).findIndex(match);
        if (idx !== -1) {
          ch.messages.splice(idx, 1);
          if (typeof renderServerChat === 'function') renderServerChat();
          if (typeof renderRoomChat === 'function') renderRoomChat();
          return;
        }
      }
    }
  }

  function onScheduled(data) {
    removeLocalByTempId(data && data.tempId);
    const when = data && data.deliverAt ? fmt(new Date(data.deliverAt)) : '';
    toast('Капсула запланирована', when ? `Откроется ${when}.` : 'Сообщение придёт в срок.');
  }

  function onDelivered(data) {
    const author = data?.message?.author;
    const name = author?.nickname || author?.username || '';
    const isMine = window.currentUser && author &&
      String(author._id) === String(window.currentUser._id);
    toast('Капсула открылась', isMine
      ? 'Твоя капсула времени доставлена.'
      : `Капсула от ${name || 'друга'} открылась.`);
  }

  // ── Кнопка в композерах ──────────────────────────────────────────────────

  function injectButtons() {
    COMPOSERS.forEach(({ form }) => {
      const formEl = document.getElementById(form);
      if (!formEl || formEl.querySelector('.capsule-trigger')) return;
      const controls = formEl.querySelector('.input-controls-left');
      if (!controls) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'input-control-btn capsule-trigger';
      btn.title = 'Капсула времени';
      btn.innerHTML = CLOCK_ICON;
      btn.addEventListener('click', openPicker);
      controls.appendChild(btn);
    });
  }

  function init() {
    injectButtons();
    renderBanners();
    // Композеры серверов/комнат появляются в DOM сразу, но на всякий случай
    // добиваем ещё раз после старта приложения.
    setTimeout(injectButtons, 1500);
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && document.getElementById('capsule-modal')) closeModal();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.LoveCapsules = { openPicker, openCapsuleList, onScheduled, onDelivered, disarm };
})();
