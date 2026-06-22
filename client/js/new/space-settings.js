// ───────────────── Настройки сферы / комнаты ─────────────────
// Универсальная модалка: и сфера (сервер), и комната — это один Server-документ
// с _kind. RoomsAPI — тонкая обёртка над ServersAPI, поэтому используем ServersAPI.
(function () {
  'use strict';

  let currentSpaceId = null;

  function srv() {
    const map = window._mockServers || (typeof mockServers !== 'undefined' ? mockServers : null);
    return map && currentSpaceId ? map[currentSpaceId] : null;
  }

  // owner может прийти как ObjectId-строка (GET /servers) или как populated-объект
  // {_id, username} (ответ при создании) — извлекаем _id в обоих случаях.
  function ownerId(data) {
    const o = data && data._ownerId;
    if (!o) return null;
    return (typeof o === 'object') ? (o._id || o.id) : o;
  }

  function isOwner(data) {
    const me = window.currentUser && (window.currentUser._id || window.currentUser.id);
    const oid = ownerId(data);
    return !!(oid && me && String(oid) === String(me));
  }

  function esc(s) {
    return (typeof escHTML === 'function') ? escHTML(s) : String(s == null ? '' : s);
  }

  // Иконки/баннеры с сервера приходят относительным путём (/uploads/...),
  // поэтому для отображения добавляем BASE_URL.
  function mediaUrl(u) {
    if (!u) return '';
    return /^https?:|^data:|^blob:/.test(u) ? u : (window.BASE_URL || '') + u;
  }

  function toast(title, msg) {
    if (typeof showToast === 'function') showToast(title, msg);
  }

  // Выполнить async-действие с индикацией на кнопке (блокировка + текст «...»)
  async function withBusy(btn, busyText, fn) {
    if (!btn) return fn();
    const original = btn.textContent;
    const wasDisabled = btn.disabled;
    btn.disabled = true;
    btn.classList.add('is-busy');
    if (busyText) btn.textContent = busyText;
    try {
      return await fn();
    } finally {
      btn.disabled = wasDisabled;
      btn.classList.remove('is-busy');
      btn.textContent = original;
    }
  }

  // Двухшаговое подтверждение прямо на кнопке: первый клик меняет текст на
  // «Точно?», второй клик в течение 3 сек выполняет действие.
  const _confirmTimers = new WeakMap();
  function confirmTwoStep(btn, confirmText, fn) {
    if (!btn) return;
    if (btn.dataset.confirming === '1') {
      clearTimeout(_confirmTimers.get(btn));
      btn.dataset.confirming = '';
      btn.textContent = btn.dataset.originalText || btn.textContent;
      btn.classList.remove('is-confirming');
      fn();
      return;
    }
    btn.dataset.originalText = btn.textContent;
    btn.dataset.confirming = '1';
    btn.textContent = confirmText;
    btn.classList.add('is-confirming');
    const t = setTimeout(() => {
      btn.dataset.confirming = '';
      btn.textContent = btn.dataset.originalText || btn.textContent;
      btn.classList.remove('is-confirming');
    }, 3000);
    _confirmTimers.set(btn, t);
  }

  // ── Открытие ───────────────────────────────────────────────
  function openSpaceSettings(spaceId) {
    const map = window._mockServers || (typeof mockServers !== 'undefined' ? mockServers : null);
    if (!map || !map[spaceId]) return;
    currentSpaceId = spaceId;
    const data = map[spaceId];
    const kind = (data._kind || data.kind) === 'room' ? 'room' : 'server';
    const owner = isOwner(data);

    console.log('[space-settings] open:', {
      spaceId, kind, owner,
      _ownerId: data._ownerId,
      currentUserId: window.currentUser && (window.currentUser._id || window.currentUser.id),
      hasIcon: !!data._icon, icon: data._icon
    });

    const card = document.querySelector('#space-settings-modal .space-settings-shell');
    if (card) card.classList.toggle('is-not-owner', !owner);

    const titleEl = document.getElementById('space-settings-title');
    if (titleEl) titleEl.textContent = kind === 'room' ? 'Настройки комнаты' : 'Настройки сферы';

    // Баннер доступен и сферам, и комнатам — секция видна всегда.
    const bannerEdit = document.getElementById('space-banner-edit');
    if (bannerEdit) bannerEdit.classList.remove('hidden');

    // Обзор
    const nameInput = document.getElementById('space-name-input');
    if (nameInput) nameInput.value = data.name || '';
    const descInput = document.getElementById('space-desc-input');
    if (descInput) descInput.value = data.description || '';

    const avatarPrev = document.getElementById('space-avatar-preview');
    if (avatarPrev) {
      if (data._icon) {
        avatarPrev.style.backgroundImage = `url("${mediaUrl(data._icon)}")`;
        avatarPrev.textContent = '';
      } else {
        avatarPrev.style.backgroundImage = '';
        avatarPrev.textContent = (data.name || '?').charAt(0).toUpperCase();
      }
    }
    const bannerPrev = document.getElementById('space-banner-preview');
    if (bannerPrev) bannerPrev.style.backgroundImage = data._banner ? `url("${mediaUrl(data._banner)}")` : '';

    // Показываем текущую ССЫЛКУ приглашения из данных. Обновление — по кнопке.
    const inviteCode = document.getElementById('space-invite-code');
    if (inviteCode) inviteCode.value = data._inviteCode ? inviteLink(data._inviteCode) : '';

    // Владелец не может «выйти» (только удалить) — прячем строку выхода для него.
    const leaveRow = document.getElementById('space-leave-row');
    if (leaveRow) leaveRow.classList.toggle('hidden', owner);
    const leaveHint = document.getElementById('space-leave-hint');
    if (leaveHint) leaveHint.textContent = (kind === 'room' ? 'Вы выйдете из этой комнаты.' : 'Вы выйдете из этой сферы.');

    renderMembers(data);
    showTab('overview');

    // На мобиле открываемся со списка разделов (панель раздела убрана за край).
    document.querySelector('#space-settings-modal .space-settings-shell')?.classList.remove('section-open');

    const modal = document.getElementById('space-settings-modal');
    if (modal) modal.classList.remove('hidden');
  }

  function closeSpaceSettings() {
    const modal = document.getElementById('space-settings-modal');
    if (modal) modal.classList.add('hidden');
    currentSpaceId = null;
  }

  // ── Вкладки ────────────────────────────────────────────────
  function showTab(tab) {
    let navLabel = '';
    document.querySelectorAll('#space-settings-modal [data-space-tab]').forEach(t => {
      const active = t.dataset.spaceTab === tab;
      t.classList.toggle('active', active);
      if (active) navLabel = t.textContent.trim();
    });
    document.querySelectorAll('#space-settings-modal [data-space-section]').forEach(s => {
      s.classList.toggle('active', s.dataset.spaceSection === tab);
    });
    // Заголовок мобильной панели (кнопка «Назад») — название открытого раздела.
    const mobileTitle = document.getElementById('space-mobile-title');
    if (mobileTitle && navLabel) mobileTitle.textContent = navLabel;
  }

  // ── Участники ──────────────────────────────────────────────
  function renderMembers(data) {
    const list = document.getElementById('space-members-list');
    if (!list) return;
    list.innerHTML = '';
    const members = data._members || [];
    if (!members.length) {
      const empty = document.createElement('div');
      empty.className = 'space-hint';
      empty.textContent = 'Список участников пуст.';
      list.appendChild(empty);
      return;
    }
    members.forEach(m => {
      const user = m.user || m;
      const name = user.nickname || user.username || user.name || 'Участник';
      const avatarUrl = user.avatar || user.avatarUrl || '';
      const row = document.createElement('div');
      row.className = 'space-member-item';

      const av = document.createElement('div');
      av.className = 'space-member-avatar';
      if (avatarUrl) av.style.backgroundImage = `url("${avatarUrl}")`;
      else av.textContent = name.charAt(0).toUpperCase();

      const nm = document.createElement('span');
      nm.className = 'space-member-name';
      nm.textContent = name;

      row.appendChild(av);
      row.appendChild(nm);

      const isOwn = String(user._id || user.id) === String(ownerId(data));
      if (isOwn) {
        const role = document.createElement('span');
        role.className = 'space-member-role';
        role.textContent = 'владелец';
        row.appendChild(role);
      }
      list.appendChild(row);
    });
  }

  // ── Сохранение названия/описания ───────────────────────────
  async function saveOverview() {
    const data = srv();
    if (!data || !data._realId) return;
    const name = document.getElementById('space-name-input')?.value.trim();
    const description = document.getElementById('space-desc-input')?.value.trim();
    if (!name) { toast('Настройки', 'Название не может быть пустым.'); return; }
    try {
      await ServersAPI.update(data._realId, { name, description });
      data.name = name;
      data.description = description;
      if (typeof renderUnifiedSidebar === 'function') renderUnifiedSidebar();
      syncHeaderTitles(data);
      toast('Сохранено', 'Изменения применены.');
    } catch (err) {
      console.error('[space-settings] save failed:', err);
      toast('Ошибка', 'Не удалось сохранить.');
    }
  }

  function syncHeaderTitles(data) {
    const roomName = document.getElementById('room-view-name');
    if (roomName && currentSpaceId === (typeof activeServerId !== 'undefined' ? activeServerId : null)) {
      roomName.textContent = data.name;
    }
  }

  // ── Аватар / баннер ────────────────────────────────────────
  async function uploadImage(kind, file) {
    const data = srv();
    if (!data || !data._realId || !file) return;
    try {
      const res = kind === 'icon'
        ? await ServersAPI.uploadIcon(data._realId, file)
        : await ServersAPI.uploadBanner(data._realId, file);
      // Роут возвращает { server, message } — URL лежит в res.server.icon/banner
      const srvObj = (res && res.server) ? res.server : res;
      const url = srvObj && (kind === 'icon' ? srvObj.icon : srvObj.banner) || (res && res.url);
      if (kind === 'icon') {
        data._icon = url || data._icon;
        const prev = document.getElementById('space-avatar-preview');
        if (prev && data._icon) { prev.style.backgroundImage = `url("${mediaUrl(data._icon)}")`; prev.textContent = ''; }
        if (typeof renderUnifiedSidebar === 'function') renderUnifiedSidebar();
      } else {
        data._banner = url || data._banner;
        const prev = document.getElementById('space-banner-preview');
        if (prev && data._banner) prev.style.backgroundImage = `url("${mediaUrl(data._banner)}")`;
      }
      toast('Готово', kind === 'icon' ? 'Аватар обновлён.' : 'Баннер обновлён.');
    } catch (err) {
      console.error('[space-settings] upload failed:', err);
      toast('Ошибка', 'Не удалось загрузить изображение.');
    }
  }

  async function deleteImage(kind) {
    const data = srv();
    if (!data || !data._realId) return;
    try {
      if (kind === 'icon') {
        await ServersAPI.deleteIcon(data._realId);
        data._icon = null;
        const prev = document.getElementById('space-avatar-preview');
        if (prev) { prev.style.backgroundImage = ''; prev.textContent = (data.name || '?').charAt(0).toUpperCase(); }
        if (typeof renderUnifiedSidebar === 'function') renderUnifiedSidebar();
      } else {
        await ServersAPI.deleteBanner(data._realId);
        data._banner = null;
        const prev = document.getElementById('space-banner-preview');
        if (prev) prev.style.backgroundImage = '';
      }
      toast('Готово', 'Убрано.');
    } catch (err) {
      console.error('[space-settings] delete image failed:', err);
      toast('Ошибка', 'Не удалось убрать.');
    }
  }

  // ── Приглашение ────────────────────────────────────────────
  // Сгенерировать НОВЫЙ уникальный код приглашения (обновление). Сервер
  // гарантирует, что код не совпадёт с кодом другого сервера/комнаты.
  async function regenerateInvite() {
    const data = srv();
    if (!data || !data._realId) return;
    try {
      const res = await ServersAPI.createInvite(data._realId);
      const code = res && (res.inviteCode || res.code || res.invite);
      if (code) {
        data._inviteCode = code;
        const input = document.getElementById('space-invite-code');
        if (input) input.value = inviteLink(code);
        toast('Готово', 'Ссылка приглашения обновлена.');
      }
    } catch (err) {
      console.error('[space-settings] invite failed:', err);
      toast('Ошибка', 'Не удалось обновить код.');
    }
  }

  function copyInvite() {
    const input = document.getElementById('space-invite-code');
    if (!input || !input.value) return;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(input.value).then(
        () => toast('Скопировано', 'Ссылка в буфере обмена.'),
        () => { input.select(); document.execCommand('copy'); }
      );
    } else {
      input.select();
      document.execCommand('copy');
      toast('Скопировано', 'Ссылка в буфере обмена.');
    }
  }

  // ── Выход / удаление ───────────────────────────────────────
  async function leaveSpace() {
    const data = srv();
    if (!data || !data._realId) return;
    try {
      await ServersAPI.leave(data._realId);
      removeFromLocal(currentSpaceId);
      toast('Готово', 'Вы покинули пространство.');
      closeSpaceSettings();
    } catch (err) {
      console.error('[space-settings] leave failed:', err);
      toast('Ошибка', 'Не удалось выйти.');
    }
  }

  async function deleteSpace() {
    const data = srv();
    if (!data || !data._realId) return;
    try {
      await ServersAPI.delete(data._realId);
      removeFromLocal(currentSpaceId);
      toast('Удалено', 'Пространство удалено.');
      closeSpaceSettings();
    } catch (err) {
      console.error('[space-settings] delete failed:', err);
      toast('Ошибка', 'Не удалось удалить.');
    }
  }

  function removeFromLocal(spaceId) {
    const map = window._mockServers || (typeof mockServers !== 'undefined' ? mockServers : null);
    if (map && map[spaceId]) delete map[spaceId];
    // Сбрасываем активную сущность и перерисовываем сайдбар
    const accordion = document.getElementById('spaces-accordion-container');
    if (accordion) accordion.innerHTML = '';
    if (typeof renderUnifiedSidebar === 'function') renderUnifiedSidebar();
    // Переключаемся на первую доступную или на друзей
    if (window._setActiveState) {
      const keys = map ? Object.keys(map) : [];
      if (keys.length) {
        window._setActiveState({ activeServerId: keys[0] });
        if (typeof selectServerOrRoom === 'function') {
          const d = map[keys[0]];
          selectServerOrRoom(keys[0], (d._kind || d.kind) === 'room' ? 'room' : 'server');
        }
      }
    }
  }

  // ── Делегированные обработчики ─────────────────────────────
  document.addEventListener('click', (e) => {
    // Точки входа
    if (e.target.closest('#room-settings-btn') || e.target.closest('#server-settings-btn')) {
      const id = (typeof activeServerId !== 'undefined') ? activeServerId : null;
      if (id) openSpaceSettings(id);
      return;
    }

    // Закрытие
    if (e.target.closest('#space-settings-close')) { closeSpaceSettings(); return; }
    const modal = document.getElementById('space-settings-modal');
    if (modal && e.target === modal) { closeSpaceSettings(); return; }

    // Назад (мобайл) — вернуться к списку разделов
    if (e.target.closest('#space-settings-back')) {
      document.querySelector('#space-settings-modal .space-settings-shell')?.classList.remove('section-open');
      return;
    }

    // Вкладки
    const tab = e.target.closest('#space-settings-modal [data-space-tab]');
    if (tab) {
      showTab(tab.dataset.spaceTab);
      // На мобиле панель раздела выезжает поверх списка разделов.
      if (window.innerWidth <= 768) {
        document.querySelector('#space-settings-modal .space-settings-shell')?.classList.add('section-open');
      }
      return;
    }

    // Действия
    const saveBtn = e.target.closest('#space-save-btn');
    if (saveBtn) { withBusy(saveBtn, 'Сохраняем…', saveOverview); return; }
    if (e.target.closest('#space-avatar-upload')) { document.getElementById('space-icon-file')?.click(); return; }
    if (e.target.closest('#space-avatar-delete')) { deleteImage('icon'); return; }
    if (e.target.closest('#space-banner-upload')) { document.getElementById('space-banner-file')?.click(); return; }
    if (e.target.closest('#space-banner-delete')) { deleteImage('banner'); return; }
    const inviteBtn = e.target.closest('#space-invite-create');
    if (inviteBtn) { withBusy(inviteBtn, 'Обновляем…', regenerateInvite); return; }
    if (e.target.closest('#space-invite-copy')) { copyInvite(); return; }
    const leaveBtn = e.target.closest('#space-leave-btn');
    if (leaveBtn) { confirmTwoStep(leaveBtn, 'Точно выйти?', () => withBusy(leaveBtn, 'Выходим…', leaveSpace)); return; }
    const deleteBtn = e.target.closest('#space-delete-btn');
    if (deleteBtn) { confirmTwoStep(deleteBtn, 'Точно удалить?', () => withBusy(deleteBtn, 'Удаляем…', deleteSpace)); return; }
  });

  // Файловые инпуты
  document.addEventListener('change', (e) => {
    if (e.target.id === 'space-icon-file' && e.target.files[0]) {
      uploadImage('icon', e.target.files[0]);
      e.target.value = '';
    } else if (e.target.id === 'space-banner-file' && e.target.files[0]) {
      uploadImage('banner', e.target.files[0]);
      e.target.value = '';
    }
  });

  // Примечание: пункт «Настройки» в контекст-меню (правый клик) добавляется
  // в общем меню закрепа — см. initContextMenu в script.js. Здесь отдельный
  // перехват contextmenu НЕ вешаем, чтобы не конфликтовать с закрепом.

  // Экспорт
  window.openSpaceSettings = openSpaceSettings;
})();
