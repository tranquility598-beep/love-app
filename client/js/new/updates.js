/* ════════════════════════════════════════════════════════════════
   LOVE — Система обновлений (рендер).
   Связывает electron-updater (main.js) с UI в Настройки → Обновления:
   фоновое авто-скачивание, уведомление, кнопка «обновить сейчас»,
   и канал stable/beta (allowPrerelease).
   На вебе (без electronAPI) модуль тихо выключается.
   ════════════════════════════════════════════════════════════════ */
(function () {
  const api = window.electronAPI;
  const CHANNEL_KEY = 'love_update_channel'; // 'stable' | 'beta'
  const DOWNLOAD_PAGE = 'https://loveapp.chat';

  function $(id) { return document.getElementById(id); }

  function isBetaChannel() {
    try { return localStorage.getItem(CHANNEL_KEY) === 'beta'; } catch (e) { return false; }
  }

  function currentVersion() {
    try { return (api && api.getVersion && api.getVersion()) || ''; } catch (e) { return ''; }
  }

  // ─── Веб-версия: автообновлений нет, прячем кнопку, выходим ───
  if (!api || typeof api.onUpdateMessage !== 'function') {
    document.addEventListener('DOMContentLoaded', () => {
      const status = $('settings-updates-status');
      const check = $('lvs-check-updates');
      const beta = $('lvs-beta-channel');
      const ver = $('settings-updates-version');
      if (ver) ver.textContent = currentVersion() || ver.textContent;
      if (status) status.textContent = 'Обновления — в приложении';
      if (check) check.style.display = 'none';
      if (beta) { const row = beta.closest('.lvs-row'); if (row) row.style.display = 'none'; }
    });
    return;
  }

  const isMac = api.platform === 'darwin';

  const state = {
    status: 'idle',   // idle | checking | available | downloading | downloaded | not-available | error
    info: null,
    percent: 0,
    error: null,
    notified: false
  };
  window._updateState = state;

  // releaseNotes → массив коротких строк (поддержка строки с HTML или массива)
  function parseNotes(notes) {
    if (!notes) return [];
    if (Array.isArray(notes)) {
      return notes.map(n => String((n && n.note) || n || '').replace(/<[^>]+>/g, ' ').trim()).filter(Boolean).slice(0, 12);
    }
    return String(notes)
      .replace(/<\/(p|li|div|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .split(/\r?\n/)
      .map(s => s.replace(/^[\s\-*•#>]+/, '').trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  function updateVersionOf() {
    return state.info && (state.info.version || state.info.tag || '');
  }

  function paint() {
    const verEl = $('settings-updates-version');
    if (verEl) verEl.textContent = currentVersion() || verEl.textContent;

    const betaEl = $('lvs-beta-channel');
    if (betaEl) betaEl.checked = isBetaChannel();

    const statusEl = $('settings-updates-status');
    if (!statusEl) return; // секции ещё нет в DOM

    const progRow = $('settings-updates-progress');
    const progFill = $('settings-updates-progress-fill');
    const progPct = $('settings-updates-progress-pct');
    const checkBtn = $('lvs-check-updates');
    const actionBtn = $('settings-updates-action');
    const clogCard = $('settings-updates-changelog-card');
    const clogTitle = $('settings-updates-changelog-title');
    const clog = $('settings-updates-changelog');

    // сброс
    statusEl.className = 'lvs-badge';
    if (progRow) progRow.style.display = 'none';
    if (actionBtn) { actionBtn.style.display = 'none'; actionBtn.onclick = null; }
    if (checkBtn) { checkBtn.style.display = ''; checkBtn.disabled = false; checkBtn.textContent = 'Проверить обновления'; }

    const v = updateVersionOf();

    switch (state.status) {
      case 'checking':
        statusEl.textContent = 'Проверка обновлений…';
        if (checkBtn) { checkBtn.disabled = true; checkBtn.textContent = 'Проверка…'; }
        break;

      case 'available':
      case 'downloading':
        statusEl.classList.add('lvs-badge--success');
        statusEl.textContent = 'Доступно' + (v ? ' v' + v : ' обновление');
        if (checkBtn) checkBtn.style.display = 'none';
        if (progRow) progRow.style.display = '';
        if (progFill) progFill.style.width = Math.max(2, state.percent) + '%';
        if (progPct) progPct.textContent = Math.round(state.percent) + '%';
        if (actionBtn) { actionBtn.style.display = ''; actionBtn.disabled = true; actionBtn.textContent = 'Загрузка…'; }
        break;

      case 'downloaded':
        statusEl.classList.add('lvs-badge--success');
        statusEl.textContent = 'Готово к установке' + (v ? ' v' + v : '');
        if (checkBtn) checkBtn.style.display = 'none';
        if (actionBtn) {
          actionBtn.style.display = '';
          actionBtn.disabled = false;
          actionBtn.textContent = 'Перезапустить и установить';
          actionBtn.onclick = () => api.installUpdate();
        }
        break;

      case 'not-available':
        statusEl.classList.add('lvs-badge--success');
        statusEl.textContent = 'Актуальная версия';
        break;

      case 'error':
        statusEl.textContent = 'Не удалось проверить';
        // macOS (без подписи) и прочие ошибки авто-апдейта — даём ручное скачивание
        if (actionBtn) {
          actionBtn.style.display = '';
          actionBtn.disabled = false;
          actionBtn.textContent = 'Скачать с сайта';
          actionBtn.onclick = () => api.openExternal(DOWNLOAD_PAGE);
        }
        break;

      default:
        statusEl.classList.add('lvs-badge--success');
        statusEl.textContent = 'Актуальная версия';
    }

    // «Что нового»
    const notes = parseNotes(state.info && state.info.releaseNotes);
    const showClog = (state.status === 'available' || state.status === 'downloading' || state.status === 'downloaded') && (v || notes.length);
    if (clogCard) clogCard.style.display = showClog ? '' : 'none';
    if (showClog && clog) {
      if (clogTitle) clogTitle.textContent = v ? ('Что нового в v' + v) : 'Что нового';
      clog.innerHTML = '';
      const items = notes.length ? notes : ['Улучшения и исправления.'];
      items.forEach(t => {
        const li = document.createElement('div');
        li.className = 'lvs-changelog-item';
        li.style.cssText = 'padding:4px 0;color:rgba(255,255,255,0.7);font-size:14px;';
        li.textContent = '• ' + t;
        clog.appendChild(li);
      });
    }
  }
  window.renderUpdatesSection = paint;

  function openUpdatesSection() {
    const navBtn = $('nav-settings');
    if (navBtn) navBtn.click();
    setTimeout(() => {
      const tab = document.querySelector('[data-settings-section="settings-updates"]');
      if (tab) tab.click();
      paint();
    }, 70);
  }
  window.openUpdatesSection = openUpdatesSection;

  function toast(title, text) {
    if (typeof window.showAppNotification === 'function') {
      window.showAppNotification({ title, text, useHeart: true, onClick: openUpdatesSection });
    }
  }

  // ─── События апдейтера из main ───
  api.onUpdateMessage((data) => {
    if (!data || !data.type) return;
    switch (data.type) {
      case 'checking':
        state.status = 'checking';
        break;
      case 'available':
        state.status = 'available';
        state.info = data.info || null;
        state.percent = 0;
        if (!state.notified) {
          state.notified = true;
          const v = updateVersionOf();
          toast('Доступно обновление' + (v ? ' v' + v : ''), 'Загружается в фоне — нажмите, чтобы установить.');
        }
        break;
      case 'progress':
        state.status = 'downloading';
        state.percent = (data.progress && data.progress.percent) || 0;
        break;
      case 'downloaded': {
        state.status = 'downloaded';
        state.info = data.info || state.info;
        state.percent = 100;
        const v = updateVersionOf();
        toast('Обновление готово' + (v ? ' v' + v : ''), 'Нажмите, чтобы перезапустить и установить.');
        break;
      }
      case 'not-available':
        state.status = 'not-available';
        state.notified = false;
        break;
      case 'error':
        state.status = 'error';
        state.error = data.error || 'error';
        break;
    }
    paint();
  });

  // ─── Делегированные клики (работают независимо от инициализации настроек) ───
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    if (t.closest('#lvs-check-updates')) {
      if (state.status === 'checking' || state.status === 'downloading') return;
      state.status = 'checking';
      state.notified = false;
      paint();
      api.checkForUpdates();
      // если за 9с тишина (нет сети) — вернём «актуальная версия»
      setTimeout(() => { if (state.status === 'checking') { state.status = 'not-available'; paint(); } }, 9000);
    }
  });

  // ─── Тумблер канала stable/beta ───
  document.addEventListener('change', (e) => {
    const t = e.target;
    if (!t || t.id !== 'lvs-beta-channel') return;
    const beta = !!t.checked;
    try { localStorage.setItem(CHANNEL_KEY, beta ? 'beta' : 'stable'); } catch (_) {}
    api.setUpdateChannel(beta);
    // сразу перепроверяем по новому каналу
    state.status = 'checking';
    state.info = null;
    state.notified = false;
    paint();
    api.checkForUpdates();
    setTimeout(() => { if (state.status === 'checking') { state.status = 'not-available'; paint(); } }, 9000);
    toast(beta ? 'Канал: Beta' : 'Канал: Stable', beta ? 'Теперь вы получаете бета-версии.' : 'Только стабильные версии.');
  });

  // ─── Старт: применяем сохранённый канал в main + первая отрисовка ───
  function boot() {
    try { api.setUpdateChannel(isBetaChannel()); } catch (_) {}
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
