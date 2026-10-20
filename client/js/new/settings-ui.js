/* ════════════════════════════════════════════════════════════════
   LOVE — SETTINGS controller (новый дизайн)
   Управляет разделом #settings-shell внутри #view-settings.
   ════════════════════════════════════════════════════════════════ */

(function () {
  document.addEventListener('DOMContentLoaded', initSettings);

  function initSettings() {
    const shell = document.getElementById('settings-shell');
    if (!shell) return;

    const showSection = initNavigation(shell);
    initSettingsSearch(shell, showSection);
    initModal(shell);
    initProfile(shell);
    initSelects(shell);
    initSliders(shell);
    initThemeOptions(shell);
    initSeasonOptions(shell);
    initNotifPreview(shell);
    initVoice(shell);
    initDangerActions(shell);
    initUpdates(shell);
    initAbout(shell);
    initVersions(shell);
    initAdvanced(shell);
    initAccount(shell);
    initProfilePage(shell);
    initSubscriptions(shell);
    initBlockedUsers(shell);
    initSupportCenter(shell);
    initPrefsPersistence(shell);
    initDirtyTracking(shell);
  }

  function _toast(title, msg) {
    if (typeof window.showToast === 'function') window.showToast(title, msg);
  }

  /* ───────────────  Навигация между секциями  ─────────────── */

  function initNavigation(shell) {
    const navItems = shell.querySelectorAll('.settings-nav-item');
    const sections = shell.querySelectorAll('.settings-section');
    const backBtn = shell.querySelector('#settings-back-btn');
    const mobileTitle = shell.querySelector('#settings-mobile-title');

    function showSection(sectionId) {
      sections.forEach(s => s.classList.toggle('active', s.id === sectionId));
      navItems.forEach(n => {
        const active = n.dataset.settingsSection === sectionId;
        n.classList.toggle('active', active);
        if (active && mobileTitle) {
          mobileTitle.textContent = n.querySelector('span')?.textContent || '';
        }
      });
      // Прокрутка контента наверх при смене секции
      const scroll = shell.querySelector('.settings-content-scroll');
      if (scroll) scroll.scrollTop = 0;
    }

    navItems.forEach(item => {
      item.addEventListener('click', () => {
        showSection(item.dataset.settingsSection);
        // Мобайл: выезд панели контента
        if (window.innerWidth <= 768) shell.classList.add('section-open');
      });
    });

    if (backBtn) {
      backBtn.addEventListener('click', () => shell.classList.remove('section-open'));
    }

    return showSection;
  }

  /* ───────────────  Поиск по настройкам  ─────────────── */

  // Ищет и по названиям разделов, и по отдельным настройкам внутри них
  // (подписи переключателей, полей, подзаголовки). Клик по результату
  // открывает раздел, прокручивает к настройке и коротко её подсвечивает.
  // Индекс строится из разметки при каждом поиске: часть строк добавляется
  // скриптами позже (звук, темы), и так они тоже находятся.
  const SETTINGS_SEARCH_TARGETS = '.lvs-row-label, .lvs-label, .lvs-section-subtitle, .lvs-theme-name, .lvs-plan-card-head';

  // Как люди называют настройки своими словами: «микрофон», а не «Устройство
  // ввода». Ключ — подпись в разметке, значение — дополнительные слова поиска.
  const SETTINGS_SEARCH_SYNONYMS = {
    'Устройство ввода': 'микрофон микро',
    'Громкость ввода': 'микрофон чувствительность',
    'Устройство вывода': 'динамики наушники колонки звук',
    'Громкость вывода': 'звук громкость динамики наушники',
    'Шумоподавление': 'шум фон',
    'Эхоподавление': 'эхо',
    'Пароль': 'сменить пароль безопасность',
    'Тема': 'темная светлая тёмная оформление цвет',
    'Сезонная тема': 'хэллоуин хеллоуин тыква праздник'
  };

  function escSearch(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function normalizeSearch(text) {
    return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
  }

  function buildSettingsIndex(shell) {
    const entries = [];
    shell.querySelectorAll('.settings-nav-item').forEach(nav => {
      const sectionId = nav.dataset.settingsSection;
      const section = shell.querySelector('#' + sectionId);
      const sectionName = nav.querySelector('span')?.textContent.trim() || '';
      if (!section || !sectionName) return;
      const desc = section.querySelector('.lvs-section-desc')?.textContent || '';
      entries.push({ sectionId, sectionName, label: sectionName, haystack: normalizeSearch(sectionName + ' ' + desc), el: null });
      const seen = new Set();
      section.querySelectorAll(SETTINGS_SEARCH_TARGETS).forEach(el => {
        const label = el.textContent.replace(/\s+/g, ' ').trim();
        if (!label || label.length > 80 || seen.has(label) || el.closest('[hidden]')) return;
        seen.add(label);
        const extra = SETTINGS_SEARCH_SYNONYMS[label] || '';
        entries.push({ sectionId, sectionName, label, haystack: normalizeSearch(label + ' ' + extra), el });
      });
    });
    return entries;
  }

  function initSettingsSearch(shell, showSection) {
    const input = shell.querySelector('#settings-search-input');
    const box = shell.querySelector('#settings-search-results');
    const nav = shell.querySelector('.settings-nav');
    if (!input || !box || !nav || typeof showSection !== 'function') return;
    let matches = [];

    function reset() {
      matches = [];
      box.hidden = true;
      box.innerHTML = '';
      nav.hidden = false;
    }

    function open(entry) {
      if (!entry) return;
      showSection(entry.sectionId);
      if (window.innerWidth <= 768) shell.classList.add('section-open');
      const target = entry.el && (entry.el.closest('.lvs-row, .lvs-field, .lvs-card') || entry.el);
      if (target) {
        requestAnimationFrame(() => {
          target.scrollIntoView({ block: 'center', behavior: 'smooth' });
          target.classList.remove('lvs-search-hit');
          void target.offsetWidth; // перезапуск анимации подсветки
          target.classList.add('lvs-search-hit');
          setTimeout(() => target.classList.remove('lvs-search-hit'), 1800);
        });
      }
    }

    function render(query) {
      const q = normalizeSearch(query);
      if (q.length < 2) { reset(); return; }
      const words = q.split(' ');
      matches = buildSettingsIndex(shell)
        .filter(entry => words.every(word => entry.haystack.includes(word)))
        .slice(0, 30);
      nav.hidden = true;
      box.hidden = false;
      if (!matches.length) {
        box.innerHTML = '<div class="settings-search-empty">Ничего не нашли</div>';
        return;
      }
      box.innerHTML = matches.map((entry, index) => `
        <button type="button" class="settings-search-item" data-search-index="${index}">
          <span class="settings-search-label">${escSearch(entry.label)}</span>
          ${entry.el ? `<span class="settings-search-where">${escSearch(entry.sectionName)}</span>` : '<span class="settings-search-where">Раздел</span>'}
        </button>`).join('');
    }

    input.addEventListener('input', () => render(input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && matches.length) {
        e.preventDefault();
        open(matches[0]);
      } else if (e.key === 'Escape' && input.value) {
        e.preventDefault();
        e.stopPropagation();
        input.value = '';
        reset();
      }
    });
    box.addEventListener('click', (e) => {
      const item = e.target.closest('.settings-search-item');
      if (item) open(matches[Number(item.dataset.searchIndex)]);
    });
  }

  /* ───────────────  Помощь, обращения и нарушения  ─────────────── */

  function initSubscriptions(shell) {
    const section = shell.querySelector('#settings-subscriptions');
    if (!section) return;
    const names = { free: 'Free', pro: 'Pro', premium: 'Premium', duo: 'Duo' };

    function render() {
      const user = window.currentUser;
      if (!user) {
        section.querySelector('#lvs-current-plan').textContent = 'Нет данных об аккаунте';
        section.querySelector('#lvs-current-plan-detail').textContent = 'Откройте раздел после входа в Love.';
        section.querySelectorAll('[data-love-plan]').forEach(card => {
          card.classList.remove('is-current');
          card.querySelector('.lvs-plan-current').hidden = true;
        });
        return;
      }
      const storedPlan = Object.hasOwn(names, user.plan) ? user.plan : 'free';
      const expiresAt = user.planExpiresAt ? new Date(user.planExpiresAt) : null;
      const validDate = expiresAt && Number.isFinite(expiresAt.getTime());
      const expired = storedPlan !== 'free' && validDate && expiresAt.getTime() <= Date.now();
      const plan = expired ? 'free' : storedPlan;
      section.querySelector('#lvs-current-plan').textContent = `Love ${names[plan]}`;
      section.querySelector('#lvs-current-plan-detail').textContent = plan === 'free'
        ? (expired ? 'Срок подписки завершён. Сейчас доступны возможности Free.' : 'Бесплатный тариф без ограничения по сроку.')
        : (validDate ? `Действует до ${expiresAt.toLocaleDateString('ru-RU')}.` : 'Тариф активен на вашем аккаунте.');
      section.querySelectorAll('[data-love-plan]').forEach(card => {
        const current = card.dataset.lovePlan === plan;
        card.classList.toggle('is-current', current);
        card.querySelector('.lvs-plan-current').hidden = !current;
      });
    }

    // Read the account again on opening: authentication may finish after DOMContentLoaded.
    new MutationObserver(() => { if (section.classList.contains('active')) render(); })
      .observe(section, { attributes: true, attributeFilter: ['class'] });
    render();
  }

  /* ───────────────  Заблокированные пользователи  ─────────────── */

  function initBlockedUsers(shell) {
    const section = shell.querySelector('#settings-privacy');
    const card = section?.querySelector('.lvs-blocked-card');
    const list = card?.querySelector('#lvs-blocked-list');
    const status = card?.querySelector('#lvs-blocked-status');
    const count = card?.querySelector('#lvs-blocked-count');
    const refresh = card?.querySelector('#lvs-blocked-refresh');
    if (!card || !list || !status || !count || !refresh) return;
    const view = document.getElementById('view-settings');
    const auth = document.getElementById('auth-screen');
    let users = [], owner = '', revision = 0, pending = '';
    let loading = false, loaded = false, shown = false;
    const accountId = () => String(window.currentUser?._id || '');
    const visible = () => section.classList.contains('active')
      && (!view || !view.classList.contains('panel-hidden'))
      && (!auth || auth.classList.contains('auth-hidden'));
    const current = (id, version) => id === accountId() && id === owner && version === revision;

    function render(message = '') {
      list.replaceChildren();
      count.hidden = !loaded;
      count.textContent = String(users.length);
      status.textContent = message || (loaded && !users.length ? 'Вы никого не заблокировали.' : '');
      refresh.disabled = loading || Boolean(pending) || !accountId();
      list.setAttribute('aria-busy', String(loading || Boolean(pending)));
      for (const user of users) {
        const row = document.createElement('li');
        row.className = 'lvs-blocked-user';
        const avatar = document.createElement('div');
        avatar.className = 'lvs-blocked-avatar';
        avatar.setAttribute('aria-hidden', 'true');
        const name = user.nickname || user.username || 'Пользователь';
        avatar.textContent = Array.from(name)[0]?.toLocaleUpperCase('ru-RU') || '?';
        if (typeof user.avatar === 'string' && user.avatar) {
          try {
            const url = new URL(user.avatar, window.BASE_URL || window.location.href);
            if (url.protocol === 'https:' || url.protocol === 'http:') {
              const image = document.createElement('img');
              image.alt = '';
              image.loading = 'lazy';
              image.referrerPolicy = 'no-referrer';
              image.addEventListener('error', () => image.remove(), { once: true });
              image.src = url.href;
              avatar.appendChild(image);
            }
          } catch (_) { /* Невалидный аватар заменяется инициалом. */ }
        }
        const identity = document.createElement('div');
        identity.className = 'lvs-blocked-identity';
        const title = document.createElement('span');
        title.className = 'lvs-blocked-name';
        title.textContent = name;
        const username = document.createElement('span');
        username.className = 'lvs-blocked-username';
        username.textContent = user.username ? '@' + user.username : 'Без имени пользователя';
        identity.append(title, username);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'lvs-btn';
        button.textContent = pending === user._id ? 'Разблокируем…' : 'Разблокировать';
        button.setAttribute('aria-label', 'Разблокировать ' + name);
        button.disabled = Boolean(pending) || loading;
        button.addEventListener('click', () => unblock(user));
        row.append(avatar, identity, button);
        list.appendChild(row);
      }
    }

    function reset() {
      ++revision; // Поздний ответ старого аккаунта не должен попадать в новый.
      users = []; owner = ''; pending = ''; loading = false; loaded = false;
      render();
    }

    async function load() {
      const id = accountId();
      if (owner && owner !== id) reset();
      if (!visible() || !id || pending || loading) return;
      const version = ++revision;
      owner = id; users = []; loaded = false; loading = true;
      render('Загружаем список…');
      try {
        const result = await UsersAPI.getBlocked();
        if (!current(id, version)) return;
        if (!Array.isArray(result?.blockedUsers)) throw new Error('Сервер не вернул список. Попробуйте обновить приложение.');
        users = [...new Map(result.blockedUsers
          .filter(user => user && /^[a-f\d]{24}$/i.test(user._id))
          .map(user => [user._id, user])).values()];
        loaded = true; loading = false;
        render();
      } catch (error) {
        if (!current(id, version)) return;
        loading = false;
        render(error.message || 'Не удалось загрузить список. Нажмите «Обновить», чтобы повторить.');
      }
    }

    async function unblock(user) {
      if (pending || loading || owner !== accountId() || !visible()) return;
      const id = owner, version = ++revision;
      pending = user._id;
      render();
      try {
        const result = await UsersAPI.unblock(user._id);
        if (!current(id, version)) return;
        if (result?.userId !== user._id) throw new Error('Сервер не подтвердил разблокировку. Обновите список.');
        users = users.filter(item => item._id !== user._id);
        pending = '';
        render('Пользователь разблокирован. Ваша блокировка снята.');
        _toast('Пользователь разблокирован', user.nickname || '@' + user.username);
      } catch (error) {
        if (!current(id, version)) return;
        pending = '';
        render(error.message || 'Не удалось разблокировать пользователя. Попробуйте ещё раз.');
      }
    }

    function sync() {
      if (!visible() || !accountId()) {
        if (shown || owner) reset();
        shown = false;
      } else if (!shown || owner !== accountId()) {
        shown = true;
        load();
      }
    }
    refresh.addEventListener('click', load);
    const observer = new MutationObserver(sync);
    for (const element of [section, view, auth]) {
      if (element) observer.observe(element, { attributes: true, attributeFilter: ['class'] });
    }
    window.addEventListener('focus', () => { if (visible()) load(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && visible()) load(); });
    sync();
  }

  function initSupportCenter(shell) {
    const section = shell.querySelector('#settings-support');
    if (!section || typeof window.CasesAPI === 'undefined') return;

    const safe = value => String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
    const formatDate = value => value
      ? new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '—';
    const statusLabels = {
      new: 'Новое', triaged: 'Принято', in_progress: 'В работе', waiting_user: 'Ждёт ответа',
      resolved: 'Решено', rejected: 'Отклонено', archived: 'Архив'
    };
    const kindLabels = { support: 'Поддержка', appeal: 'Апелляция', report: 'Жалоба', bug: 'Баг', idea: 'Идея' };
    const actionLabels = { warning: 'Предупреждение', mute: 'Мут', ban: 'Блокировка', deactivate: 'Деактивация' };
    let cases = [];
    let selectedCaseId = null;
    let statusData = null;
    let loading = false;
    let submittingCase = false;
    let submissionState = { allowed: false, code: 'CASE_POLICY_LOADING', message: 'Проверяем доступность новых обращений…' };
    let submissionClockSkew = 0;
    let submissionTimer;

    const list = section.querySelector('#support-case-list');
    const thread = section.querySelector('#support-case-thread');
    const newForm = section.querySelector('#support-new-case-form');
    const appealForm = section.querySelector('#support-appeal-form');
    const caseDescription = section.querySelector('#support-case-description');

    function resetDescriptionSize() {
      caseDescription.style.removeProperty('height');
      caseDescription.style.removeProperty('width');
      caseDescription.scrollTop = 0;
    }

    // Closing a section or modal hides the same DOM instead of rebuilding it.
    // Reset geometry on re-entry without discarding the description draft.
    new MutationObserver(resetDescriptionSize).observe(section, { attributes: true, attributeFilter: ['class'] });
    const settingsView = document.getElementById('view-settings');
    if (settingsView) new MutationObserver(resetDescriptionSize)
      .observe(settingsView, { attributes: true, attributeFilter: ['class'] });
    const submissionNotice = section.querySelector('#support-submission-notice');
    const submissionMessage = section.querySelector('#support-submission-message');
    const openActiveCaseButton = section.querySelector('#support-open-active-case');

    function updateSubmissionState(state) {
      submissionState = state || { allowed: false, code: 'CASE_SERVER_OUTDATED',
        message: 'Сервер ещё не обновился. Отправка новых обращений временно недоступна.' };
      const serverNow = Date.parse(state?.serverNow || '');
      submissionClockSkew = Number.isFinite(serverNow) ? Date.now() - serverNow : 0;
      renderSubmissionLimit();
    }

    function renderSubmissionLimit() {
      clearTimeout(submissionTimer);
      if (submissionState?.code === 'CASE_COOLDOWN') {
        const deadline = Date.parse(submissionState.nextAllowedAt) + submissionClockSkew;
        const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        if (!seconds) submissionState = null;
        else {
          submissionMessage.textContent = `После закрытия обращения действует пауза 15 минут. Новое можно отправить через ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}.`;
          const view = document.getElementById('view-settings');
          if (!document.hidden && section.classList.contains('active') && !view?.classList.contains('panel-hidden')) {
            submissionTimer = setTimeout(renderSubmissionLimit, 1000);
          }
        }
      } else if (submissionState?.allowed === false) {
        submissionMessage.textContent = submissionState.message || 'У вас уже есть открытое обращение. Дождитесь его закрытия.';
      }
      const blocked = submissionState?.allowed === false;
      submissionNotice.hidden = !blocked;
      openActiveCaseButton.hidden = !submissionState?.activeCase?._id;
      section.querySelector('#support-new-case-btn').disabled = blocked || submittingCase;
      section.querySelector('#support-report-bug-btn').disabled = blocked || submittingCase;
      newForm.querySelector('[type="submit"]').disabled = blocked || submittingCase;
    }

    openActiveCaseButton.addEventListener('click', () => {
      if (submissionState?.activeCase?._id) openCase(submissionState.activeCase._id);
    });
    document.addEventListener('visibilitychange', renderSubmissionLimit);
    new MutationObserver(renderSubmissionLimit).observe(section, { attributes: true, attributeFilter: ['class'] });
    const fileInput = section.querySelector('#support-case-files');
    const fileList = section.querySelector('#support-pending-files');
    const fileStatus = section.querySelector('#support-file-status');
    const prioritySelect = section.querySelector('#support-priority-select');
    const priorityButton = prioritySelect.querySelector('button');
    const priorityMenu = prioritySelect.querySelector('ul');
    const priorityOptions = [...priorityMenu.querySelectorAll('li')];
    priorityButton.setAttribute('aria-haspopup', 'listbox');
    priorityMenu.id = 'support-priority-menu';
    priorityMenu.setAttribute('role', 'listbox');
    priorityMenu.setAttribute('aria-labelledby', 'support-priority-label');
    priorityButton.setAttribute('aria-controls', priorityMenu.id);
    function syncPriorityAccessibility() {
      priorityButton.setAttribute('aria-expanded', String(prioritySelect.classList.contains('open')));
      priorityOptions.forEach(option => {
        option.tabIndex = -1;
        option.setAttribute('role', 'option');
        option.setAttribute('aria-selected', String(option.dataset.value === prioritySelect.dataset.value));
      });
    }
    new MutationObserver(syncPriorityAccessibility).observe(prioritySelect, { attributes: true, attributeFilter: ['class', 'data-value'] });
    syncPriorityAccessibility();
    priorityButton.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      if (!prioritySelect.classList.contains('open')) priorityButton.click();
      (priorityOptions.find(option => option.dataset.value === prioritySelect.dataset.value) || priorityOptions[0]).focus();
    });
    priorityMenu.addEventListener('keydown', event => {
      const index = priorityOptions.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? priorityOptions.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + priorityOptions.length) % priorityOptions.length;
        priorityOptions[next].focus();
      } else if (['Enter', ' ', 'Escape', 'Tab'].includes(event.key)) {
        if (event.key !== 'Tab') event.preventDefault();
        if (event.key === 'Enter' || event.key === ' ') priorityOptions[index]?.click();
        else if (prioritySelect.classList.contains('open')) priorityButton.click();
        priorityButton.focus();
      }
    });
    prioritySelect.addEventListener('lvs-change', event => {
      section.querySelector('#support-case-priority').value = event.detail;
    });
    newForm.addEventListener('reset', () => {
      resetDescriptionSize();
      section.querySelector('#support-case-priority').value = 'normal';
      prioritySelect.dataset.value = 'normal';
      prioritySelect.querySelector('.lvs-select-btn span').textContent = 'Обычный — нужна помощь';
      prioritySelect.querySelectorAll('li').forEach(item => item.classList.toggle('selected', item.dataset.value === 'normal'));
      fileStatus.textContent = '';
    });
    const pendingFiles = [];
    const attachmentTypes = {
      jpg: ['image/jpeg', 10], jpeg: ['image/jpeg', 10], png: ['image/png', 10],
      gif: ['image/gif', 10], webp: ['image/webp', 10], mp4: ['video/mp4', 50],
      webm: ['video/webm', 50], mov: ['video/quicktime', 50], avi: ['video/x-msvideo', 50],
      txt: ['text/plain', 5], log: ['text/plain', 5], pdf: ['application/pdf', 5]
    };
    const fileSize = size => Number(size) >= 1048576
      ? `${(Number(size) / 1048576).toFixed(1)} МБ`
      : `${Math.max(1, Math.ceil((Number(size) || 0) / 1024))} КБ`;

    function renderPendingFiles() {
      fileList.replaceChildren();
      pendingFiles.forEach(entry => {
        const row = document.createElement('li');
        const info = document.createElement('span');
        const name = document.createElement('strong');
        name.textContent = entry.file.name;
        const detail = document.createElement('small');
        detail.textContent = `${fileSize(entry.file.size)} · ${entry.uploaded ? 'Загружен' : 'Готов к отправке'}`;
        info.append(name, detail);
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'support-file-remove';
        remove.textContent = '×';
        remove.setAttribute('aria-label', `Убрать файл ${entry.file.name}`);
        remove.disabled = submittingCase;
        remove.addEventListener('click', () => {
          pendingFiles.splice(pendingFiles.indexOf(entry), 1);
          fileStatus.textContent = '';
          renderPendingFiles();
        });
        row.append(info, remove);
        fileList.appendChild(row);
      });
    }

    section.querySelector('#support-attach-files').addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => {
      const errors = [];
      for (const file of fileInput.files) {
        const extension = file.name.split('.').pop().toLowerCase();
        const type = attachmentTypes[extension];
        if (!type) { errors.push(`${file.name}: формат не поддерживается.`); continue; }
        if (!file.size || file.size > type[1] * 1048576) {
          errors.push(`${file.name}: выберите непустой файл до ${type[1]} МБ.`);
          continue;
        }
        if (pendingFiles.some(entry => entry.file.name === file.name && entry.file.size === file.size && entry.file.lastModified === file.lastModified)) continue;
        if (pendingFiles.length >= 5) { errors.push('Можно прикрепить до 5 файлов.'); break; }
        pendingFiles.push({ file, extension, mimeType: type[0], uploaded: null });
      }
      fileInput.value = '';
      fileStatus.textContent = errors.join(' ');
      renderPendingFiles();
    });

    function caseFilesMarkup(files) {
      if (!Array.isArray(files)) return '';
      const links = files.map(file => {
        try {
          const url = new URL(file.url, window.BASE_URL || location.origin);
          if (!['http:', 'https:'].includes(url.protocol)) return '';
          return `<a href="${safe(url.href)}" target="_blank" rel="noopener noreferrer"><span>${safe(file.name || 'Файл')}</span><small>${safe(fileSize(file.size))}</small></a>`;
        } catch (_) { return ''; }
      }).join('');
      return links ? `<div class="support-case-files" aria-label="Файлы обращения">${links}</div>` : '';
    }

    function supportNoteMarkup(note, forceOwn = null) {
      const own = forceOwn == null
        ? String(note.author?._id || note.author) === String(window.currentUser?._id)
        : Boolean(forceOwn);
      const author = own ? 'Вы' : (note.author?.nickname || note.author?.username || 'Love Support');
      return `<article class="${own ? 'own' : 'staff'}" data-note-id="${safe(note._id)}"><div><strong>${safe(author)}</strong><time>${safe(formatDate(note.createdAt))}</time></div><p>${safe(note.body)}</p></article>`;
    }

    function appendSupportNote(note, forceOwn = null) {
      const messages = thread.querySelector('.support-thread-messages');
      if (!messages || !note?._id || messages.querySelector(`[data-note-id="${String(note._id).replace(/"/g, '\\"')}"]`)) return;
      messages.querySelector('.support-thread-empty')?.remove();
      messages.insertAdjacentHTML('beforeend', supportNoteMarkup(note, forceOwn));
      messages.scrollTo({ top: messages.scrollHeight, behavior: 'smooth' });
    }

    function touchCase(caseId, changes = {}) {
      const item = cases.find(entry => String(entry._id) === String(caseId));
      if (!item) return null;
      Object.assign(item, changes);
      renderCaseList();
      return item;
    }

    function remainingLabel(action) {
      if (action.permanent || !action.expiresAt) return 'Бессрочно';
      const milliseconds = new Date(action.expiresAt).getTime() - Date.now();
      if (milliseconds <= 0) return 'Завершено';
      const hours = Math.ceil(milliseconds / 3600000);
      if (hours < 24) return `Осталось ${hours} ч.`;
      return `Осталось ${Math.ceil(hours / 24)} дн.`;
    }

    function renderCaseList() {
      section.querySelector('#support-cases-count').textContent = cases.length;
      if (!cases.length) {
        list.innerHTML = '<div class="support-thread-empty"><strong>Обращений пока нет</strong><span>Создайте обращение, и переписка с командой появится здесь.</span></div>';
        thread.innerHTML = '<div class="support-thread-empty">Выберите обращение, чтобы открыть переписку.</div>';
        return;
      }
      list.innerHTML = cases.map(item => `
        <button type="button" class="support-case-item ${String(item._id) === String(selectedCaseId) ? 'active' : ''}" data-case-id="${safe(item._id)}">
          <span><b>${safe(kindLabels[item.kind] || item.kind)}</b><i>${safe(statusLabels[item.status] || item.status)}</i></span>
          <strong>${safe(item.title)}</strong>
          ${item._hasLiveReply ? '<em class="support-case-live-reply">Новый ответ</em>' : ''}
          <small>${safe(item.number)} · ${safe(formatDate(item.updatedAt || item.createdAt))}</small>
        </button>`).join('');
      list.querySelectorAll('[data-case-id]').forEach(button => {
        button.addEventListener('click', () => openCase(button.dataset.caseId));
      });
    }

    async function openCase(id) {
      selectedCaseId = id;
      const selectedItem = cases.find(item => String(item._id) === String(id));
      if (selectedItem) selectedItem._hasLiveReply = false;
      window._markCaseNotificationsRead?.(id);
      renderCaseList();
      thread.innerHTML = '<div class="support-loading">Открываем переписку...</div>';
      try {
        const result = await window.CasesAPI.get(id);
        const item = result.case || result;
        const closed = ['resolved', 'rejected', 'archived'].includes(item.status);
        const notes = item.notes || [];
        thread.innerHTML = `
          <header><div><span>${safe(item.number)} · ${safe(kindLabels[item.kind] || item.kind)}</span><h3>${safe(item.title)}</h3></div><i>${safe(statusLabels[item.status] || item.status)}</i></header>
          <p class="support-case-description">${safe(item.description)}</p>
          ${caseFilesMarkup(item.attachments)}
          <div class="support-thread-messages">
            ${notes.length ? notes.map(note => supportNoteMarkup(note)).join('') : '<div class="support-thread-empty">Команда ещё не ответила.</div>'}
          </div>
          ${closed ? `<div class="support-case-closed">Обращение закрыто со статусом «${safe(statusLabels[item.status] || item.status)}».</div>` : `
            <form class="support-thread-reply"><textarea name="support-thread-reply" rows="3" maxlength="4000" placeholder="Ответить команде Love" aria-label="Ответ команде Love" required></textarea><button type="submit" class="lvs-btn" title="Отправить ответ сотруднику">Отправить</button></form>`}`;
        thread.querySelector('.support-thread-reply')?.addEventListener('submit', async event => {
          event.preventDefault();
          const textarea = event.currentTarget.querySelector('textarea');
          const button = event.currentTarget.querySelector('button');
          const body = textarea.value.trim();
          if (!body) return;
          button.disabled = true;
          try {
            const result = await window.CasesAPI.reply(item._id, body);
            appendSupportNote(result.note, true);
            textarea.value = '';
            button.disabled = false;
            touchCase(item._id, { status: 'triaged', updatedAt: result.note?.createdAt || new Date().toISOString() });
          } catch (error) {
            _toast('Ответ не отправлен', error.message || 'Попробуйте ещё раз.');
            button.disabled = false;
          }
        });
      } catch (error) {
        thread.innerHTML = `<div class="support-thread-empty">${safe(error.message || 'Не удалось открыть обращение')}</div>`;
      }
    }

    function renderStatus() {
      if (!statusData) return;
      const count = Math.min(7, Number(statusData.warningCount) || 0);
      const reputation = statusData.reputation || { label: 'Состояние неизвестно', tone: 'attention' };
      const reputationCard = section.querySelector('#support-reputation-card');
      reputationCard.dataset.tone = reputation.tone;
      section.querySelector('#support-reputation-label').textContent = reputation.label;
      section.querySelector('#support-trust-score').textContent = Number(statusData.trustScore) || 0;
      section.querySelector('#support-warnings-count').textContent = statusData.warningCount || 0;
      section.querySelector('#support-warning-current').textContent = statusData.warningCount || 0;
      section.querySelector('#support-warning-progress').style.width = `${Math.min(100, (count / 7) * 100)}%`;
      section.querySelector('#support-reputation-summary').textContent = count === 0
        ? 'Активных предупреждений и ограничений нет.'
        : `Активных предупреждений: ${statusData.warningCount}. Срок предупреждения составляет 90 дней.`;
      section.querySelector('#support-warning-thresholds').innerHTML = (statusData.thresholds || []).map(item => `<span><b>${safe(item.count)}</b>${safe(item.consequence)}</span>`).join('');

      const restriction = section.querySelector('#support-active-restriction');
      if (statusData.activeRestriction) {
        const action = statusData.activeRestriction;
        restriction.classList.remove('hidden');
        restriction.innerHTML = `<div><strong>${safe(actionLabels[action.type] || action.type)} действует</strong><span>${safe(remainingLabel(action))}</span></div><p>${safe(action.reason)}</p>`;
      } else {
        restriction.classList.add('hidden');
        restriction.innerHTML = '';
      }

      const violationList = section.querySelector('#support-violation-list');
      const actions = statusData.actions || [];
      violationList.innerHTML = actions.length ? actions.map(action => `
        <article class="support-violation ${action.active ? 'active' : ''}">
          <div><span><strong>${safe(actionLabels[action.type] || action.type)}</strong><i>${action.active ? safe(remainingLabel(action)) : (action.revoked ? 'Снято' : 'Завершено')}</i></span><time>${safe(formatDate(action.startsAt))}</time></div>
          <p>${safe(action.reason)}</p>
          <footer>${action.appeal
            ? `<span>Апелляция ${safe(action.appeal.number)} · ${safe(statusLabels[action.appeal.status] || action.appeal.status)}</span>`
            : action.canAppeal
              ? `<button class="support-appeal-btn" type="button" data-appeal-action="${safe(action._id)}" title="Попросить команду Love пересмотреть это наказание">Подать апелляцию</button>`
              : action.revoked
                ? '<span class="support-appeal-unavailable">Наказание снято, апелляция не требуется</span>'
                : ''}</footer>
        </article>`).join('') : '<div class="support-thread-empty"><strong>История чистая</strong><span>Нарушений и наказаний нет.</span></div>';
      violationList.querySelectorAll('[data-appeal-action]').forEach(button => {
        button.addEventListener('click', () => {
          section.querySelector('#support-appeal-action').value = button.dataset.appealAction;
          appealForm.classList.remove('hidden');
          section.querySelector('#support-appeal-description').focus();
        });
      });
    }

    async function load(showLoader = true) {
      if (loading) return;
      loading = true;
      if (showLoader) list.innerHTML = '<div class="support-loading">Загружаем обращения...</div>';
      try {
        const [caseResult, moderationResult] = await Promise.all([
          window.CasesAPI.mine(),
          window.CasesAPI.status()
        ]);
        cases = caseResult.cases || [];
        updateSubmissionState(window.CasesAPI.submissionStateFromResponse?.(caseResult) || caseResult.submission);
        statusData = moderationResult;
        if (selectedCaseId && !cases.some(item => String(item._id) === String(selectedCaseId))) selectedCaseId = null;
        renderCaseList();
        renderStatus();
      } catch (error) {
        list.innerHTML = `<div class="support-thread-empty">${safe(error.message || 'Центр помощи временно недоступен')}</div>`;
      } finally {
        loading = false;
      }
    }

    window.refreshSupportCenter = async function (eventData = {}) {
      if (loading) {
        window.setTimeout(() => window.refreshSupportCenter?.(eventData), 180);
        return;
      }
      if (eventData.kind === 'staff_reply' && eventData.caseId && eventData.note) {
        const isOpen = String(selectedCaseId || '') === String(eventData.caseId);
        const changes = {
          updatedAt: eventData.updatedAt || eventData.note.createdAt || new Date().toISOString(),
          _hasLiveReply: !isOpen
        };
        if (eventData.status) changes.status = eventData.status;
        const item = touchCase(eventData.caseId, changes);
        if (!item) {
          await load(false);
          return;
        }
        if (isOpen) {
          appendSupportNote(eventData.note, false);
          const status = thread.querySelector('header > i');
          if (status && eventData.status) status.textContent = statusLabels[eventData.status] || eventData.status;
        }
        return;
      }
      await load(false);
      if (selectedCaseId) await openCase(selectedCaseId);
    };

    window.isSupportCenterVisible = function () {
      const settingsView = document.getElementById('view-settings');
      return !document.hidden
        && settingsView && !settingsView.classList.contains('panel-hidden')
        && section.classList.contains('active');
    };

    window.isSupportCaseVisible = function (caseId) {
      return window.isSupportCenterVisible()
        && Boolean(selectedCaseId)
        && String(selectedCaseId) === String(caseId || '');
    };

    window.openSupportCase = async function (caseId) {
      document.getElementById('nav-settings')?.click();
      const supportNav = shell.querySelector('[data-settings-section="settings-support"]');
      supportNav?.click();
      const casesTab = section.querySelector('[data-support-tab="cases"]');
      casesTab?.click();
      await load(false);
      if (caseId && cases.some(item => String(item._id) === String(caseId))) await openCase(caseId);
    };

    section.querySelectorAll('[data-support-tab]').forEach(button => {
      button.addEventListener('click', () => {
        section.querySelectorAll('[data-support-tab]').forEach(item => item.classList.toggle('active', item === button));
        section.querySelectorAll('[data-support-pane]').forEach(pane => pane.classList.toggle('active', pane.dataset.supportPane === button.dataset.supportTab));
      });
    });

    function showNewCaseForm(kind) {
      renderSubmissionLimit();
      if (submittingCase || submissionState?.allowed === false) return;
      const bug = kind === 'bug';
      section.querySelector('#support-case-kind').value = bug ? 'bug' : 'support';
      section.querySelector('#support-new-case-heading').textContent = bug ? 'Сообщить о баге' : 'Новое обращение';
      section.querySelector('#support-bug-hint').hidden = !bug;
      const title = section.querySelector('#support-case-title');
      title.placeholder = bug ? 'Например: не включается микрофон' : 'Кратко опишите вопрос';
      section.querySelector('#support-case-description').placeholder = bug
        ? '1. Что вы делали?\n2. Что ожидали увидеть?\n3. Что произошло вместо этого?'
        : 'Расскажите, что произошло и чем команда может помочь';
      newForm.classList.remove('hidden');
      resetDescriptionSize();
      title.focus({ preventScroll: true });
    }
    section.querySelector('#support-new-case-btn').addEventListener('click', () => showNewCaseForm('support'));
    section.querySelector('#support-report-bug-btn').addEventListener('click', () => showNewCaseForm('bug'));
    section.querySelector('#support-new-case-cancel').addEventListener('click', () => {
      newForm.classList.add('hidden');
      resetDescriptionSize();
    });
    newForm.addEventListener('submit', async event => {
      event.preventDefault();
      const title = section.querySelector('#support-case-title').value.trim();
      const description = section.querySelector('#support-case-description').value.trim();
      const priority = section.querySelector('#support-case-priority').value;
      const kind = section.querySelector('#support-case-kind').value === 'bug' ? 'bug' : 'support';
      const submit = newForm.querySelector('[type="submit"]');
      if (submit.disabled) return;
      submittingCase = true;
      const controls = [...newForm.elements].map(element => ({ element, disabled: element.disabled }));
      controls.forEach(({ element }) => { element.disabled = true; });
      const submitLabel = submit.textContent;
      submit.textContent = 'Проверяем…';
      fileStatus.textContent = '';
      try {
        // Refresh from the server before uploading files. Another device may
        // already have opened a case while this form was being filled in.
        const latest = await window.CasesAPI.mine();
        updateSubmissionState(window.CasesAPI.submissionStateFromResponse?.(latest) || latest.submission);
        if (submissionState?.allowed === false) {
          throw Object.assign(new Error(submissionState.message), { data: { submission: submissionState } });
        }
        for (let i = 0; i < pendingFiles.length; i++) {
          const entry = pendingFiles[i];
          if (entry.uploaded) continue;
          submit.textContent = `Загрузка ${i + 1} / ${pendingFiles.length}…`;
          if (typeof apiUpload !== 'function') throw new Error('Загрузка файлов временно недоступна.');
          // LOG отправляется как текстовый файл: серверный whitelist принимает TXT.
          const filename = entry.extension === 'log' ? `${entry.file.name}.txt` : entry.file.name;
          const file = new File([entry.file], filename, { type: entry.mimeType });
          const data = new FormData();
          data.append('file', file);
          const uploaded = await apiUpload('/upload', data, 'POST');
          if (!uploaded?.url) throw new Error(`Не удалось загрузить ${entry.file.name}.`);
          entry.uploaded = { name: entry.file.name, url: uploaded.url, mimeType: entry.mimeType, size: entry.file.size };
          renderPendingFiles();
        }
        submit.textContent = 'Отправляем…';
        const attachments = pendingFiles.map(entry => entry.uploaded);
        const result = await window.CasesAPI.create({ kind, title, description, priority, attachments });
        pendingFiles.length = 0;
        renderPendingFiles();
        newForm.reset();
        newForm.classList.add('hidden');
        selectedCaseId = result.case?._id || null;
        await load();
        if (selectedCaseId) await openCase(selectedCaseId);
        _toast(kind === 'bug' ? 'Сообщение о баге отправлено' : 'Обращение создано', 'Команда Love увидит его в центре обращений.');
      } catch (error) {
        fileStatus.textContent = error.message || 'Попробуйте отправить ещё раз. Файлы и текст сохранены в форме.';
        if (error.data?.submission) updateSubmissionState(error.data.submission);
        else _toast('Не удалось создать обращение', error.message || 'Проверьте введённые данные.');
      } finally {
        submittingCase = false;
        submit.textContent = submitLabel;
        controls.forEach(({ element, disabled }) => { element.disabled = disabled; });
        renderPendingFiles();
        renderSubmissionLimit();
      }
    });

    section.querySelector('#support-appeal-cancel').addEventListener('click', () => appealForm.classList.add('hidden'));
    appealForm.addEventListener('submit', async event => {
      event.preventDefault();
      const actionId = section.querySelector('#support-appeal-action').value;
      const description = section.querySelector('#support-appeal-description').value.trim();
      if (description.length < 20) {
        _toast('Добавьте подробности', 'Для апелляции нужно минимум 20 символов.');
        return;
      }
      const submit = appealForm.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        await window.CasesAPI.appeal(actionId, description);
        appealForm.reset();
        appealForm.classList.add('hidden');
        await load(false);
        _toast('Апелляция отправлена', 'Ответ появится в ваших обращениях.');
      } catch (error) {
        _toast('Апелляция не отправлена', error.message || 'Попробуйте ещё раз.');
      } finally {
        submit.disabled = false;
      }
    });

    shell.querySelector('[data-settings-section="settings-support"]')?.addEventListener('click', () => {
      resetDescriptionSize();
      load();
    });
    renderSubmissionLimit();
    load();
    window.setInterval(() => {
      if (section.classList.contains('active') && !document.hidden) load(false);
    }, 15_000);
  }

  /* ───────────────  Модальное окно: открытие/закрытие перенесено в initDirtyTracking  ─────────────── */

  function initModal(shell) {
  }

  /* ───────────────  Профиль: живое превью + аватар + настроение + музыка + увлечения  ─────────────── */

  function initProfile(shell) {
    const nameInput = shell.querySelector('#lvs-input-name');
    const userInput = shell.querySelector('#lvs-input-username');
    const bioInput = shell.querySelector('#lvs-input-bio');
    const statusInput = shell.querySelector('#lvs-input-status');
    const listeningInput = shell.querySelector('#lvs-input-listening');

    const nameCount = shell.querySelector('#lvs-name-count');
    const bioCount = shell.querySelector('#lvs-bio-count');

    const avatarBox = shell.querySelector('#lvs-avatar-preview');
    const avatarLetters = shell.querySelector('#lvs-avatar-letters');
    const uploadBtn = shell.querySelector('#lvs-avatar-upload');
    const removeBtn = shell.querySelector('#lvs-avatar-remove');
    const fileInput = shell.querySelector('#lvs-avatar-input');

    const usernameResult = shell.querySelector('#lvs-username-result');

    const audioUploadBtn = shell.querySelector('#lvs-audio-upload');
    const audioFileInput = shell.querySelector('#lvs-audio-input');

    const moodPicker = shell.querySelector('#lvs-mood-picker');
    const hobbiesEditor = shell.querySelector('#lvs-hobbies-editor');

    const data = (typeof window !== 'undefined' && window.ownProfileData) || null;
    if (data) {
      if (nameInput && data.name) nameInput.value = data.name;
      if (userInput && data.username) userInput.value = String(data.username).replace(/^@/, '');
      if (statusInput && data.statusText) statusInput.value = data.statusText;
      if (bioInput && data.bio) bioInput.value = data.bio;
      if (listeningInput && data.listening) listeningInput.value = data.listening;
    }

    // Имя пользователя редактируется в разделе «Аккаунт» (требуется пароль),
    // здесь оно только для просмотра.
    if (userInput) userInput.readOnly = true;
    if (usernameResult) usernameResult.textContent = 'Имя пользователя меняется в разделе «Аккаунт».';

    function lettersFrom(name) {
      const parts = (name || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '?';
      const first = parts[0][0] || '';
      const second = parts.length > 1 ? parts[1][0] : (parts[0][1] || '');
      return (first + second).toUpperCase();
    }

    function syncVitrine() {
      const name = nameInput?.value || '';
      const user = userInput?.value || '';
      const bio = bioInput?.value || '';
      const status = statusInput?.value || '';
      const listening = listeningInput?.value || '';
      const letters = lettersFrom(name);

      const vName = shell.querySelector('#lvs-vitrine-name');
      const vUser = shell.querySelector('#lvs-vitrine-username');
      const vStatus = shell.querySelector('#lvs-vitrine-status');
      const vAvatar = shell.querySelector('#lvs-vitrine-avatar');
      const vAvatarText = shell.querySelector('#lvs-vitrine-avatar-text');
      const vTrackTitle = shell.querySelector('#lvs-vitrine-track-title');
      const vTrackArtist = shell.querySelector('#lvs-vitrine-track-artist');
      const vMood = shell.querySelector('#lvs-vitrine-mood');
      const vHobbies = shell.querySelector('#lvs-vitrine-hobbies');

      if (vName) vName.textContent = name || 'Без имени';
      if (vUser) vUser.textContent = '@' + (user || 'username');
      if (vStatus) { vStatus.textContent = status; vStatus.style.display = status ? '' : 'none'; }

      if (!avatarBox?.style.backgroundImage && avatarLetters) avatarLetters.textContent = letters;
      if (vAvatar && !vAvatar.style.backgroundImage) {
        const span = vAvatar.querySelector('span');
        if (span) span.textContent = letters;
      }

      const parse = (typeof window.parseListening === 'function') ? window.parseListening : function(s) {
        if (!s) return { artist: 'Love Wave FM', title: 'Lofi Wabi-Sabi Ambient' };
        const p = s.split('-');
        return p.length > 1 ? { artist: p[0].trim(), title: p.slice(1).join('-').trim() } : { artist: 'Неизвестный', title: s.trim() };
      };
      const { artist, title } = parse(listening);
      if (vTrackTitle) vTrackTitle.textContent = title;
      if (vTrackArtist) vTrackArtist.textContent = artist;

      if (vMood && window.moodIcons) {
        const currentMood = (window.ownProfileData && window.ownProfileData.mood) || 'tea';
        const icon = window.moodIcons.find(m => m.name === currentMood) || window.moodIcons[0];
        vMood.innerHTML = icon.svg;
      }

      if (vHobbies && typeof window.renderHobbyTags === 'function') {
        window.renderHobbyTags(vHobbies, { editable: false });
      }

      if (nameCount) nameCount.textContent = name.length;
      if (bioCount) bioCount.textContent = bio.length;

      if (window.ownProfileData) {
        window.ownProfileData.name = name;
        window.ownProfileData.username = '@' + user;
        window.ownProfileData.statusText = status;
        window.ownProfileData.bio = bio;
        window.ownProfileData.listening = listening;
      }

      if (window.__settingsRefreshDirty) window.__settingsRefreshDirty();
    }

    [nameInput, userInput, bioInput, statusInput, listeningInput].forEach(el => {
      if (el) el.addEventListener('input', () => { syncVitrine(); });
    });

    function applyAvatar(bg) {
      [avatarBox, shell.querySelector('#lvs-vitrine-avatar')].forEach(box => {
        if (!box) return;
        box.style.backgroundImage = bg;
        const span = box.querySelector('span');
        if (span) span.style.display = bg ? 'none' : '';
      });
    }

    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        applyAvatar('url("' + url + '")');
        if (window.ownProfileData) window.ownProfileData.avatarUrl = 'url("' + url + '")';
        // Запоминаем файл — он будет загружен на сервер при сохранении
        window.__pendingAvatarFile = file;
        syncVitrine();
      });
    }
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        applyAvatar('');
        if (fileInput) fileInput.value = '';
        if (window.ownProfileData) window.ownProfileData.avatarUrl = '';
        window.__pendingAvatarFile = null;
        syncVitrine();
      });
    }

    if (audioUploadBtn && audioFileInput) {
      audioUploadBtn.addEventListener('click', () => audioFileInput.click());
      audioFileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const name = file.name.replace(/\.[^.]+$/, '');
        if (listeningInput) {
          listeningInput.value = name;
          if (window.ownProfileData) window.ownProfileData.listening = name;
        }
        // Локальный blob — для немедленного прослушивания владельцем
        const url = URL.createObjectURL(file);
        if (window.ownProfileData) window.ownProfileData.importedAudioUrl = url;
        syncVitrine();

        // Сохраняем: локальный путь + копия на Cloudinary + запись в профиль
        if (window.ProfileMusic && typeof window.ProfileMusic.setOwnMusic === 'function') {
          try {
            audioUploadBtn.disabled = true;
            audioUploadBtn.textContent = 'Загрузка…';
            await window.ProfileMusic.setOwnMusic(file);
            if (typeof window.showToast === 'function') {
              window.showToast('Музыка', 'Трек сохранён в профиле.');
            }
          } catch (err) {
            if (typeof window.showToast === 'function') {
              window.showToast('Ошибка', 'Не удалось сохранить музыку.');
            }
          } finally {
            audioUploadBtn.disabled = false;
            audioUploadBtn.textContent = 'Загрузить';
          }
        }
      });
    }

    if (moodPicker && window.moodIcons) {
      moodPicker.innerHTML = '';
      window.moodIcons.forEach(icon => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'lvs-mood-item';
        btn.setAttribute('data-mood', icon.name);
        btn.innerHTML = icon.svg;
        btn.title = icon.name;
        const currentMood = (window.ownProfileData && window.ownProfileData.mood) || 'tea';
        if (icon.name === currentMood) btn.classList.add('active');
        btn.addEventListener('click', () => {
          moodPicker.querySelectorAll('.lvs-mood-item').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          if (window.ownProfileData) window.ownProfileData.mood = icon.name;
          syncVitrine();
        });
        moodPicker.appendChild(btn);
      });
    }

    if (hobbiesEditor && window.hobbyIcons && window.myHobbies) {
      renderHobbiesEditor();
    }

    function renderHobbiesEditor() {
      if (!hobbiesEditor) return;
      hobbiesEditor.innerHTML = '';
      const hobbies = window.myHobbies || [];
      hobbies.forEach((hobby, index) => {
        const iconData = (window.hobbyIcons || []).find(i => i.name === hobby.icon) || (window.hobbyIcons || [])[0];
        const row = document.createElement('div');
        row.className = 'lvs-hobby-row';
        const esc = typeof window.escapeHTML === 'function' ? window.escapeHTML : (s => s);
        row.innerHTML = (iconData ? iconData.svg : '') + '<span>' + esc(hobby.text) + '</span>';
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'lvs-hobby-delete';
        delBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
        delBtn.addEventListener('click', () => {
          hobbies.splice(index, 1);
          renderHobbiesEditor();
          syncVitrine();
        });
        row.appendChild(delBtn);
        hobbiesEditor.appendChild(row);
      });

      if (hobbies.length < 5) {
        const addBtn = document.createElement('button');
        addBtn.type = 'button';
        addBtn.className = 'lvs-hobby-add';
        addBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg><span>Добавить</span>';
        addBtn.addEventListener('click', () => {
          if (typeof window.openHobbyEditor === 'function') {
            window.openHobbyEditor(-1, () => {
              renderHobbiesEditor();
              syncVitrine();
            });
          }
        });
        hobbiesEditor.appendChild(addBtn);
      }

      hobbiesEditor.querySelectorAll('.lvs-hobby-row').forEach((row, index) => {
        row.addEventListener('click', (e) => {
          if (e.target.closest('.lvs-hobby-delete')) return;
          if (typeof window.openHobbyEditor === 'function') {
            window.openHobbyEditor(index, () => {
              renderHobbiesEditor();
              syncVitrine();
            });
          }
        });
      });
    }

    // Применить данные профиля обратно в форму (для отката изменений)
    function profileRerender() {
      const d = window.ownProfileData || {};
      if (nameInput && d.name != null) nameInput.value = d.name;
      if (userInput && d.username != null) userInput.value = String(d.username).replace(/^@/, '');
      if (statusInput && d.statusText != null) statusInput.value = d.statusText;
      if (bioInput && d.bio != null) bioInput.value = d.bio;
      if (listeningInput && d.listening != null) listeningInput.value = d.listening;
      applyAvatar(d.avatarUrl ? d.avatarUrl : '');
      if (moodPicker) {
        const cm = d.mood || 'tea';
        moodPicker.querySelectorAll('.lvs-mood-item').forEach(b =>
          b.classList.toggle('active', b.getAttribute('data-mood') === cm));
      }
      renderHobbiesEditor();
      syncVitrine();
    }
    window.__profileRerender = profileRerender;

    syncVitrine();
  }

  /* ───────────────  Кастомные селекты  ─────────────── */

  function initSelects(shell) {
    const selects = shell.querySelectorAll('.lvs-select');
    let activeSelect = null;
    let activeMenu = null; // текущее открытое меню (в body)

    function resetMenuStyles(menu) {
      if (!menu) return;
      menu.style.position = '';
      menu.style.left = '';
      menu.style.top = '';
      menu.style.minWidth = '';
      menu.style.width = '';
      menu.style.maxHeight = '';
      menu.style.overflowY = '';
    }

    function positionActiveMenu() {
      if (!activeMenu || !activeSelect) return;
      const btn = activeSelect.querySelector('.lvs-select-btn');
      if (!btn) return;
      const btnRect = btn.getBoundingClientRect();
      if (btnRect.bottom < 0 || btnRect.top > window.innerHeight || btnRect.right < 0 || btnRect.left > window.innerWidth) {
        closeAllSelects();
        return;
      }
      activeMenu.style.position = 'fixed';
      activeMenu.style.left = Math.max(12, Math.min(btnRect.left, window.innerWidth - btnRect.width - 12)) + 'px';
      activeMenu.style.top = (btnRect.bottom + 6) + 'px';
      activeMenu.style.minWidth = btnRect.width + 'px';
      activeMenu.style.width = Math.min(btnRect.width, window.innerWidth - 24) + 'px';
      activeMenu.style.maxHeight = Math.max(140, window.innerHeight - 24) + 'px';
      activeMenu.style.overflowY = 'auto';
      const menuH = activeMenu.scrollHeight || 150;
      if (btnRect.bottom + menuH + 10 > window.innerHeight) {
        activeMenu.style.top = Math.max(12, btnRect.top - menuH - 6) + 'px';
      }
      if (btnRect.left + activeMenu.offsetWidth + 10 > window.innerWidth) {
        activeMenu.style.left = Math.max(12, window.innerWidth - activeMenu.offsetWidth - 12) + 'px';
      }
    }

    selects.forEach(select => {
      const btn = select.querySelector('.lvs-select-btn');
      const label = btn?.querySelector('span');
      const menu = select.querySelector('.lvs-select-menu');
      if (!btn || !menu) return;

      // Подсветить текущее значение
      const cur = select.dataset.value;
      menu.querySelectorAll('li').forEach(li => {
        li.classList.toggle('selected', li.dataset.value === cur);
      });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasOpen = select.classList.contains('open');
        closeAllSelects();
        if (!wasOpen) {
          // Переносим меню в document.body, чтобы backdrop-filter не ломал position:fixed
          document.body.appendChild(menu);
          activeMenu = menu;
          activeSelect = select;
          positionActiveMenu();
          menu.classList.add('is-open');
          select.classList.add('open');
        }
      });

      menu.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
          select.dataset.value = li.dataset.value;
          if (label) label.textContent = li.textContent;
          menu.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
          li.classList.add('selected');
          // Возвращаем меню обратно в .lvs-select
          menu.classList.remove('is-open');
          select.appendChild(menu);
          activeMenu = null;
          activeSelect = null;
          resetMenuStyles(menu);
          select.classList.remove('open');
          select.dispatchEvent(new CustomEvent('lvs-change', { detail: li.dataset.value }));
        });
      });
    });

    function closeAllSelects() {
      // Возвращаем активное меню обратно в родителя
      if (activeMenu && activeSelect) {
        activeMenu.classList.remove('is-open');
        if (activeMenu.parentElement !== activeSelect) {
          activeSelect.appendChild(activeMenu);
        }
        resetMenuStyles(activeMenu);
        activeSelect.classList.remove('open');
        activeMenu = null;
        activeSelect = null;
      }
      selects.forEach(s => {
        s.classList.remove('open');
        const menu = s.querySelector('.lvs-select-menu');
        if (menu) menu.classList.remove('is-open');
      });
    }

    document.addEventListener('click', () => closeAllSelects());
    document.addEventListener('scroll', positionActiveMenu, true);
    window.addEventListener('resize', positionActiveMenu);
  }

  /* ───────────────  Слайдеры  ─────────────── */

  function initSliders(shell) {
    // Пока ползунок тянут, меняется только подпись с процентами. Сам масштаб
    // применяется, когда ползунок отпустили (change → saveSetting в
    // initPrefsPersistence). Раньше масштаб менялся на каждом движении:
    // окно перестраивалось, ползунок уезжал из-под курсора, и точно
    // выставить значение было невозможно.
    bindSlider(shell, '#lvs-scale-slider', '#lvs-scale-value', (v) => v + '%');
    bindSlider(shell, '#lvs-mic-volume', '#lvs-mic-volume-value', (v) => v + '%');
    // Громкость вывода применяем на каждом движении — иначе ползунок ощущался
    // бы мёртвым (сохранение — на change, в initPrefsPersistence).
    bindSlider(shell, '#lvs-out-volume', '#lvs-out-volume-value', (v) => v + '%', (v) => {
      if (window.settingsManager) window.settingsManager.applyOutputVolume(Number(v));
    });
  }

  function bindSlider(shell, sliderSel, valueSel, fmt, onInput) {
    const slider = shell.querySelector(sliderSel);
    const value = shell.querySelector(valueSel);
    if (!slider) return;
    const render = () => { if (value) value.textContent = fmt(slider.value); };
    slider.addEventListener('input', () => {
      render();
      if (onInput) onInput(slider.value);
    });
    render();
  }

  /* ───────────────  Темы  ─────────────── */

  function initThemeOptions(shell) {
    const options = shell.querySelectorAll('.lvs-theme-option[data-theme]');
    // Все три темы рабочие; применение идёт через settingsManager.applyTheme
    // (атрибут на <html> + событие для starfield), здесь только подсветка.
    options.forEach(opt => {
      opt.addEventListener('click', () => {
        options.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        const sm = window.settingsManager;
        if (sm) sm.saveSetting('app-theme', opt.dataset.theme);
      });
    });
  }

  /* ───────────────  Сезонная тема  ─────────────── */

  // Отдельно от тёмной/светлой: ключ app-season, применяет settingsManager.
  // Выбор «Обычная» сохраняется так же, как «Halloween», и сам не меняется.
  function initSeasonOptions(shell) {
    const options = shell.querySelectorAll('.lvs-season-option');
    if (!options.length) return;
    const sync = season => options.forEach(option => {
      const active = option.dataset.seasonOption === season;
      option.classList.toggle('active', active);
      option.setAttribute('aria-pressed', String(active));
    });
    const sm = window.settingsManager;
    sync((sm ? sm.get('app-season') : localStorage.getItem('app-season')) === 'halloween' ? 'halloween' : 'none');
    options.forEach(option => option.addEventListener('click', () => {
      const season = option.dataset.seasonOption === 'halloween' ? 'halloween' : 'none';
      if (sm) sm.saveSetting('app-season', season);
      sync(season);
    }));
    document.addEventListener('love:season-change', event => sync(event.detail.season));
  }

  /* ───────────────  Превью уведомления (повтор анимации)  ─────────────── */

  function initNotifPreview(shell) {
    const preview = shell.querySelector('#lvs-notif-preview');
    if (!preview) return;
    preview.addEventListener('click', () => {
      preview.classList.remove('replay');
      // reflow для перезапуска анимации
      void preview.offsetWidth;
      preview.classList.add('replay');
    });
  }

  /* ───────────────  Голос: устройства + mic meter  ─────────────── */

  function initVoice(shell) {
    populateDevices(shell);

    // Список устройств меняется на ходу (подключили гарнитуру) — перечитываем,
    // иначе в меню остались бы мёртвые id.
    if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      let deviceChangeTimer = null;
      navigator.mediaDevices.addEventListener('devicechange', () => {
        populateDevices(shell);
        // Выбран «Микрофон по умолчанию», а в Windows сменили устройство
        // (подключили гарнитуру): уже открытый захват так и слушал старый
        // микрофон до перезапуска. Перезахватываем — в войсе и в проверке.
        // devicechange приходит пачкой, поэтому с небольшой паузой.
        clearTimeout(deviceChangeTimer);
        deviceChangeTimer = setTimeout(() => {
          const sm = window.settingsManager;
          if ((sm && sm.get('voice-input-device')) && sm.get('voice-input-device') !== 'default') return;
          if (window.voiceManager && typeof window.voiceManager.switchMicrophone === 'function') {
            window.voiceManager.switchMicrophone();
          }
          window.dispatchEvent(new CustomEvent('love:mic-device-changed'));
        }, 600);
      });
    }

    const testBtn = shell.querySelector('#lvs-mic-test');
    const monitorBtn = shell.querySelector('#lvs-mic-monitor');
    const meter = shell.querySelector('#lvs-mic-meter');

    if (testBtn && meter) {
      const TEST_IDLE = '🎙 Проверить микрофон';
      const TEST_BUSY = '⏹ Остановить';
      const MON_IDLE = '🎧 Слышать себя';
      const MON_BUSY = '🔇 Не слышать себя';

      let stream = null;      // один захват на уровень и на мониторинг
      let streamPromise = null; // захват в процессе — чтобы не открыть микрофон дважды
      let raf = null;         // индикатор уровня активен
      let audioCtx = null;
      let monitorAudio = null;
      let monitoring = false;
      let meterStarting = false;
      let monitorStarting = false;
      // Номер «сессии» проверки. Растёт при каждом полном выключении, чтобы
      // разрешение на микрофон, выданное уже после закрытия настроек, не
      // оставило микрофон включённым.
      let generation = 0;

      /**
       * Захват один на всех: и полоска уровня, и «слышать себя» слушают один
       * трек. Констрейнты берём из настроек — раньше здесь стояло `audio: true`,
       * поэтому проверка тестировала системный микрофон, а не выбранный.
       *
       * Незавершённый захват возвращаем как есть: если нажать обе кнопки
       * подряд, getUserMedia не должен уйти дважды — второй стрим просто
       * потерялся бы, оставив микрофон открытым.
       */
      function ensureStream(gen) {
        if (stream) return Promise.resolve(stream);
        if (!streamPromise) {
          const base = typeof window.getVoiceAudioConstraints === 'function'
            ? window.getVoiceAudioConstraints()
            : {};
          // Эхоподавление в проверке выключено: «Слышать себя» проигрывает
          // ваш же голос, и эхоподавитель принимал его за эхо и вырезал
          // кусками — звук рвался, пока говоришь. Шумодав и автогромкость
          // остаются как в настройках.
          const constraints = { ...(base && typeof base === 'object' ? base : {}), echoCancellation: false };
          streamPromise = navigator.mediaDevices
            .getUserMedia({ audio: constraints, video: false })
            .then(s => {
              streamPromise = null;
              if (gen !== generation) {
                // Пока браузер спрашивал доступ, проверку успели выключить
                // (например, закрыли настройки). Микрофон гасим сразу.
                s.getTracks().forEach(t => t.stop());
                return null;
              }
              stream = s;
              return s;
            })
            .catch(err => { streamPromise = null; throw err; });
        }
        return streamPromise;
      }

      // Отпускаем микрофон только когда он больше никому не нужен — включая
      // того, кто как раз в процессе запуска.
      function releaseStreamIfIdle() {
        if (raf || monitoring || meterStarting || monitorStarting) return;
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      }

      async function startMeter() {
        const s = await ensureStream(generation);
        if (!s) return;   // проверку выключили, пока запрашивался доступ
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // Свежий контекст может создаться в состоянии suspended — тогда
        // анализатор отдавал бы нули и полоска выглядела бы мёртвой.
        if (audioCtx.state === 'suspended') { try { await audioCtx.resume(); } catch (_) { /* ok */ } }
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);

        const tick = () => {
          analyser.getByteFrequencyData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i];
          meter.style.width = Math.min(100, (sum / buf.length) * 1.6) + '%';
          raf = requestAnimationFrame(tick);
        };
        tick();
        testBtn.textContent = TEST_BUSY;
      }

      function stopMeter() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        if (audioCtx) { try { audioCtx.close(); } catch (_) { /* уже закрыт */ } audioCtx = null; }
        meter.style.width = '0%';
        testBtn.textContent = TEST_IDLE;
        releaseStreamIfIdle();
      }

      /**
       * «Слышать себя» — через <audio srcObject>, а не через AudioContext
       * destination: только у медиа-элемента есть setSinkId, то есть только так
       * мониторинг уходит в выбранное в настройках устройство вывода. Элемент
       * держим в DOM с data-voice-output — тогда ползунок громкости вывода и
       * смена устройства применяются к нему автоматически (см. settings.js).
       */
      async function startMonitor() {
        const s = await ensureStream(generation);
        if (!s) return;   // мониторинг выключили, пока запрашивался доступ
        monitorAudio = document.createElement('audio');
        monitorAudio.autoplay = true;
        monitorAudio.style.display = 'none';
        monitorAudio.srcObject = stream;
        document.body.appendChild(monitorAudio);
        if (typeof window.applyAudioOutputDevice === 'function') {
          await window.applyAudioOutputDevice(monitorAudio);
        }
        try { await monitorAudio.play(); } catch (_) { /* autoplay уже сработал */ }
        monitoring = true;
        if (monitorBtn) monitorBtn.textContent = MON_BUSY;
        _toast('Слышать себя', 'Лучше в наушниках — через динамики микрофон поймает сам себя.');
      }

      function stopMonitor() {
        monitoring = false;
        if (monitorAudio) {
          monitorAudio.pause();
          monitorAudio.srcObject = null;
          monitorAudio.remove();
          monitorAudio = null;
        }
        if (monitorBtn) monitorBtn.textContent = MON_IDLE;
        releaseStreamIfIdle();
      }

      function stopAll() {
        // Отменяем и то, что ещё только взлетает: иначе выданное с задержкой
        // разрешение оставило бы микрофон открытым после закрытия настроек.
        generation++;
        meterStarting = false;
        monitorStarting = false;
        stopMeter();
        stopMonitor();
      }

      function noAccess(btn, idle) {
        btn.textContent = '🎙 Нет доступа к микрофону';
        setTimeout(() => { btn.textContent = idle; }, 2000);
      }

      testBtn.addEventListener('click', async () => {
        if (meterStarting) return;
        if (raf) { stopMeter(); return; }
        meterStarting = true;
        try { await startMeter(); }
        catch (err) { meterStarting = false; stopMeter(); noAccess(testBtn, TEST_IDLE); }
        finally { meterStarting = false; }
      });

      if (monitorBtn) {
        monitorBtn.addEventListener('click', async () => {
          if (monitorStarting) return;
          if (monitoring) { stopMonitor(); return; }
          monitorStarting = true;
          try { await startMonitor(); }
          catch (err) { monitorStarting = false; stopMonitor(); noAccess(monitorBtn, MON_IDLE); }
          finally { monitorStarting = false; }
        });
      }

      // Сменили микрофон, пока тест открыт — перезахватываем, иначе проверка
      // продолжила бы слушать прежнее устройство.
      window.addEventListener('love:mic-device-changed', async () => {
        if (!stream) return;
        const meterWas = !!raf;
        const monitorWas = monitoring;
        stopAll();
        try {
          if (meterWas) await startMeter();
          if (monitorWas) await startMonitor();
        } catch (_) { stopAll(); }
      });

      // Закрыли настройки — микрофон обязан погаснуть. Ловим через класс панели,
      // потому что закрыть можно по-разному: крестиком, кликом по фону,
      // переходом на другую вкладку сайдбара.
      const settingsPanel = document.getElementById('view-settings');
      if (settingsPanel && window.MutationObserver) {
        new MutationObserver(() => {
          if (settingsPanel.classList.contains('panel-hidden')) stopAll();
        }).observe(settingsPanel, { attributes: true, attributeFilter: ['class'] });
      }
    }

    // Тест звука — короткий beep через WebAudio
    const soundBtn = shell.querySelector('#lvs-sound-test');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain); gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.value = 440;
          gain.gain.setValueAtTime(0.0001, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
          osc.start();
          osc.stop(ctx.currentTime + 0.42);
        } catch (e) { /* noop */ }
      });
    }
  }

  async function populateDevices(shell) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      fillSelect(shell.querySelector('#lvs-input-device'), devices.filter(d => d.kind === 'audioinput'),
        'Микрофон', 'voice-input-device', 'Микрофон по умолчанию');
      fillSelect(shell.querySelector('#lvs-output-device'), devices.filter(d => d.kind === 'audiooutput'),
        'Динамик', 'voice-output-device', 'Динамики по умолчанию');
    } catch (e) { /* noop */ }
  }

  function fillSelect(select, devices, fallback, settingKey, defaultLabel) {
    if (!select) return;
    const menu = select.querySelector('.lvs-select-menu');
    const label = select.querySelector('.lvs-select-btn span');
    if (!menu) return;

    const sm = window.settingsManager;
    const saved = (sm && sm.get(settingKey)) || 'default';
    // Метку храним рядом со значением: id устройств меняются между сессиями,
    // и по одному id сохранённый микрофон после перезапуска уже не найти.
    const savedLabel = localStorage.getItem(settingKey + '-label') || '';

    // «По умолчанию» держим всегда: до выдачи доступа к микрофону
    // enumerateDevices отдаёт устройства без меток, и выбирать было бы не из чего.
    const items = [{ value: 'default', text: defaultLabel }];
    devices.forEach((d, i) => {
      if (d.deviceId === 'default') return; // уже стоит первой строкой
      items.push({ value: d.deviceId || ('dev' + i), text: d.label || `${fallback} ${i + 1}` });
    });

    let active = items.find(it => it.value === saved);
    if (!active && savedLabel) active = items.find(it => it.text === savedLabel);
    if (!active && saved !== 'default' && savedLabel) {
      // Устройство сейчас недоступно (например, отключили гарнитуру). Показываем
      // его выбранным и настройку НЕ переписываем: выбор должен ожить сам, когда
      // устройство вернётся. Захват при этом не падает — getVoiceAudioConstraints()
      // просит deviceId через `ideal`, а не `exact`.
      items.push({ value: saved, text: savedLabel + ' (недоступно)' });
      active = items[items.length - 1];
    }
    if (!active) active = items[0];

    menu.innerHTML = '';
    items.forEach(it => {
      const li = document.createElement('li');
      li.dataset.value = it.value;
      li.textContent = it.text;
      if (it === active) li.classList.add('selected');
      li.addEventListener('click', () => {
        select.dataset.value = it.value;
        if (label) label.textContent = it.text;
        menu.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
        li.classList.add('selected');
        select.classList.remove('open');
        // Раньше выбор жил только в select.dataset.value — то есть не доживал
        // ни до входа в войс, ни до перезапуска. Сохраняем через менеджер: он же
        // применит устройство на живом соединении (см. applySetting в settings.js).
        if (sm) sm.saveSetting(settingKey, it.value);
        localStorage.setItem(settingKey + '-label', it.text);
        // Тест микрофона держит свой захват — ему нужно перезапуститься,
        // иначе он продолжит слушать прежнее устройство.
        if (settingKey === 'voice-input-device') {
          window.dispatchEvent(new CustomEvent('love:mic-device-changed'));
        }
      });
      menu.appendChild(li);
    });

    select.dataset.value = active.value;
    if (label) label.textContent = active.text;
  }

  /* ───────────────  Опасные действия  ─────────────── */

  function initDangerActions(shell) {
    const del = shell.querySelector('#lvs-delete-account');
    if (del) del.addEventListener('click', () => {
      confirmDanger('Удалить аккаунт безвозвратно? Все данные будут стёрты.');
    });

    const reset = shell.querySelector('#lvs-reset-settings');
    if (reset) reset.addEventListener('click', () => {
      if (confirmDanger('Сбросить все настройки к значениям по умолчанию?')) {
        resetSettings(shell);
      }
    });

    const clearCache = shell.querySelector('#lvs-clear-cache');
    const cacheSize = shell.querySelector('#lvs-cache-size');

    function fmtMB(bytes) {
      const mb = bytes / (1024 * 1024);
      if (mb < 0.1) return bytes > 0 ? (Math.round(bytes / 1024) + ' КБ') : '0 МБ';
      return mb.toFixed(1) + ' МБ';
    }
    async function refreshCacheSize() {
      if (!cacheSize || !window.ProfileMusic) return;
      try {
        const bytes = await window.ProfileMusic.getCacheSizeBytes();
        cacheSize.textContent = 'Занято ' + fmtMB(bytes);
      } catch (e) { /* noop */ }
    }
    refreshCacheSize();

    if (clearCache && cacheSize) clearCache.addEventListener('click', async () => {
      clearCache.disabled = true;
      clearCache.textContent = 'Очистка…';
      try {
        if (window.ProfileMusic && window.ProfileMusic.clearCache) {
          await window.ProfileMusic.clearCache();
        }
      } catch (e) { /* noop */ }
      cacheSize.textContent = 'Занято 0 МБ';
      clearCache.textContent = 'Готово';
      setTimeout(() => {
        clearCache.textContent = 'Очистить';
        clearCache.disabled = false;
        refreshCacheSize();
      }, 1200);
    });
  }

  function confirmDanger(msg) {
    return window.confirm(msg);
  }

  function resetSettings(shell) {
    const sm = window.settingsManager;

    // Тоглы возвращаем к значению из разметки и, если ключ известен
    // менеджеру, сразу сохраняем и применяем — иначе после перезапуска
    // вернулось бы старое.
    shell.querySelectorAll('.lvs-toggle input[type="checkbox"]').forEach(cb => {
      cb.checked = cb.hasAttribute('checked');
      const key = cb.dataset.settingKey;
      if (key && sm) sm.saveSetting(key, cb.checked);
    });

    const scale = shell.querySelector('#lvs-scale-slider');
    if (scale) {
      scale.value = 100;
      scale.dispatchEvent(new Event('input'));
      if (sm) sm.saveSetting('ui-scale', 100);
    }

    // Инлайновый font-size могла оставить прежняя версия масштаба.
    document.documentElement.style.fontSize = '';
  }

  /* ───────────────  Обновления  ─────────────── */

  function initUpdates(shell) {
    // Реальная логика обновлений живёт в js/new/updates.js (Electron):
    // проверка/скачивание/установка + канал stable/beta через electron-updater.
    // Здесь только перерисовываем секцию под текущее состояние при открытии настроек.
    if (typeof window.renderUpdatesSection === 'function') {
      window.renderUpdatesSection();
    }
  }

  // Единый источник версии: сначала Electron (версия установленной сборки),
  // затем общий APP_VERSION из script.js. Своих зашитых номеров здесь нет —
  // из-за них настройки показывали 2.0.0 даже на 2.1.0.
  function getAppVersion() {
    if (window.electronAPI && typeof window.electronAPI.getVersion === 'function') {
      const fromApp = window.electronAPI.getVersion();
      if (fromApp) return fromApp;
    }
    return window.LOVE_APP_VERSION || '';
  }

  function initVersions(shell) {
    const ver = getAppVersion();
    // About page
    const aboutVer = document.getElementById('settings-about-version');
    if (aboutVer && ver) aboutVer.textContent = 'v' + ver;
    const aboutBuild = document.getElementById('settings-about-build');
    if (aboutBuild) aboutBuild.textContent = 'build ' + new Date().toISOString().slice(0, 10).replace(/-/g, '');
    // Updates page
    const updVer = document.getElementById('settings-updates-version');
    if (updVer && ver) updVer.textContent = ver;
  }

  function initAdvanced(shell) {
    // Режим отладки — включает Verbose-логи в консоль.
    const debugToggle = shell.querySelector('#lvs-debug-mode');
    if (debugToggle) {
      const stored = String(localStorage.getItem('love_debug_mode')) === 'true';
      debugToggle.checked = stored;
      if (stored) { window.__LOVE_DEBUG = true; console.log('[Love] Режим отладки включён.'); }
      debugToggle.addEventListener('change', () => {
        localStorage.setItem('love_debug_mode', debugToggle.checked);
        window.__LOVE_DEBUG = debugToggle.checked;
        if (debugToggle.checked) console.log('[Love] Режим отладки включён.');
      });
    }

    // Аппаратное ускорение — перезапустить без GPU или с GPU (Electron only).
    const hwToggle = shell.querySelector('#lvs-hw-accel');
    if (hwToggle) {
      const storedHw = localStorage.getItem('love_hw_accel');
      hwToggle.checked = storedHw !== 'off';
      hwToggle.addEventListener('change', () => {
        localStorage.setItem('love_hw_accel', hwToggle.checked ? 'on' : 'off');
        if (window.electronAPI && typeof window.electronAPI.restartForHwAccel === 'function') {
          window.electronAPI.restartForHwAccel(hwToggle.checked);
        } else {
          if (typeof showToast === 'function') showToast('Перезапустите приложение', 'Изменение вступит в силу после перезагрузки.');
        }
      });
    }

    // Диагностика — вся полезная инфа в консоль + toast.
    const diagBtn = shell.querySelector('#lvs-diagnostics');
    if (diagBtn) {
      diagBtn.addEventListener('click', () => {
        const info = {
          version: getAppVersion(),
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          online: navigator.onLine,
          screen: `${window.screen.width}x${window.screen.height}`,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
        console.table(info);
        if (typeof showToast === 'function') showToast('Диагностика', 'Сведения выведены в консоль (F12 → Console).');
      });
    }
  }
  /* ───────────────  О приложении: кнопки-заглушки  ─────────────── */

  function initAbout(shell) {
    // Плитка «Поддержка» ведёт в раздел «Помощь и нарушения» здесь же.
    shell.querySelectorAll('[data-about-open]').forEach(btn => {
      btn.addEventListener('click', () => {
        shell.querySelector(`.settings-nav-item[data-settings-section="${btn.dataset.aboutOpen}"]`)?.click();
      });
    });
    shell.querySelectorAll('a[data-stub]').forEach(link => {
      const original = link.innerHTML;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        if (link.dataset.busy) return;
        link.dataset.busy = '1';
        link.textContent = 'Скоро';
        setTimeout(() => {
          link.innerHTML = original;
          delete link.dataset.busy;
        }, 1400);
      });
    });
  }

  /* ───────────────  Глобальный dirty-tracker (несохранённые изменения)  ─────────────── */

  function initDirtyTracking(shell) {
    const saveBar = document.getElementById('lvs-save-bar');
    const saveBtn = document.getElementById('lvs-save-btn');
    const resetBtn = document.getElementById('lvs-reset-btn');
    const confirmModal = document.getElementById('lvs-close-confirm');
    const confirmSave = document.getElementById('lvs-close-confirm-save');
    const confirmCancel = document.getElementById('lvs-close-confirm-cancel');

    const overlay = document.getElementById('view-settings');
    const closeBtn = shell.querySelector('#settings-close-btn');
    const navSettingsBtn = document.getElementById('nav-settings');

    let lastView = 'view-chats';
    let dirty = false;
    let pendingClose = false;
    let pendingNavBtn = null;

    const snapshot = {};

    function takeSnapshot() {
      snapshot.name = (shell.querySelector('#lvs-input-name') || {}).value || '';
      snapshot.user = (shell.querySelector('#lvs-input-username') || {}).value || '';
      snapshot.bio = (shell.querySelector('#lvs-input-bio') || {}).value || '';
      snapshot.status = (shell.querySelector('#lvs-input-status') || {}).value || '';
      snapshot.listening = (shell.querySelector('#lvs-input-listening') || {}).value || '';
      snapshot.mood = (window.ownProfileData && window.ownProfileData.mood) || 'tea';
      snapshot.avatarUrl = (window.ownProfileData && window.ownProfileData.avatarUrl) || '';
      snapshot.hobbies = JSON.stringify((window.myHobbies || []).map(h => ({ text: h.text, icon: h.icon })));
    }

    // Перечитать форму профиля из ownProfileData и зафиксировать новый снапшот.
    // Вызывается после загрузки реального пользователя с бэкенда (init-app).
    window.__syncProfileForm = function () {
      if (typeof window.__profileRerender === 'function') window.__profileRerender();
      takeSnapshot();
      checkDirty();
    };

    function checkDirty() {
      const cur = {
        name: (shell.querySelector('#lvs-input-name') || {}).value || '',
        user: (shell.querySelector('#lvs-input-username') || {}).value || '',
        bio: (shell.querySelector('#lvs-input-bio') || {}).value || '',
        status: (shell.querySelector('#lvs-input-status') || {}).value || '',
        listening: (shell.querySelector('#lvs-input-listening') || {}).value || '',
        mood: (window.ownProfileData && window.ownProfileData.mood) || 'tea',
        avatarUrl: (window.ownProfileData && window.ownProfileData.avatarUrl) || '',
        hobbies: JSON.stringify((window.myHobbies || []).map(h => ({ text: h.text, icon: h.icon })))
      };
      dirty = cur.name !== snapshot.name || cur.user !== snapshot.user || cur.bio !== snapshot.bio ||
              cur.status !== snapshot.status || cur.listening !== snapshot.listening ||
              cur.mood !== snapshot.mood || cur.avatarUrl !== snapshot.avatarUrl ||
              cur.hobbies !== snapshot.hobbies;
      if (saveBar) saveBar.classList.toggle('visible', dirty);
    }

    window.__settingsRefreshDirty = checkDirty;

    let saving = false;
    const saveLabel = saveBtn ? saveBtn.textContent : 'Сохранить';
    const confirmSaveLabel = confirmSave ? confirmSave.textContent : 'Сохранить';
    const saveStatus = saveBar?.querySelector('.lvs-save-bar-text') || document.createElement('span');
    saveStatus.className = 'lvs-save-bar-text lvs-save-status';
    saveStatus.id = 'lvs-save-status';
    saveStatus.setAttribute('role', 'status');
    saveStatus.setAttribute('aria-live', 'polite');
    if (saveBar && !saveStatus.parentNode) saveBar.prepend(saveStatus);

    function savingState(active, message) {
      saving = active;
      if (message) saveStatus.textContent = message;
      for (const button of [saveBtn, confirmSave]) {
        if (!button) continue;
        button.disabled = active;
        button.setAttribute('aria-busy', String(active));
        button.textContent = active ? 'Сохраняем…' : (button === saveBtn ? saveLabel : confirmSaveLabel);
      }
      if (resetBtn) resetBtn.disabled = active;
    }

    async function doSave() {
      if (saving) return;
      const usernameResult = shell.querySelector('#lvs-username-result');
      const inputs = {
        name: shell.querySelector('#lvs-input-name'),
        bio: shell.querySelector('#lvs-input-bio'),
        status: shell.querySelector('#lvs-input-status'),
        listening: shell.querySelector('#lvs-input-listening')
      };
      const submitted = Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input?.value || '']));
      Object.assign(submitted, {
        user: shell.querySelector('#lvs-input-username')?.value || '',
        mood: window.ownProfileData?.mood || 'tea',
        hobbies: JSON.stringify((window.myHobbies || []).map(h => ({ text: h.text, icon: h.icon }))),
        avatarUrl: window.ownProfileData?.avatarUrl || ''
      });
      const payload = {
        nickname: submitted.name.trim(), bio: submitted.bio.trim(),
        customStatus: submitted.status.trim(), listening: submitted.listening.trim(),
        mood: submitted.mood,
        hobbies: JSON.parse(submitted.hobbies).map(h => ({ text: h.text, icon: h.icon }))
      };
      if (!submitted.avatarUrl && snapshot.avatarUrl) payload.avatar = null;
      if (!payload.nickname) {
        saveStatus.textContent = 'Введите имя профиля';
        inputs.name?.focus();
        return;
      }
      // Render feedback before the first upload or network request.
      savingState(true, 'Сохраняем изменения…');
      const slowTimer = setTimeout(() => {
        saveStatus.textContent = 'Сервер отвечает дольше обычного. Изменения остаются здесь.';
      }, 5000);
      try {
        if (typeof UsersAPI === 'undefined') throw new Error('Сервис профиля ещё не готов. Попробуйте снова.');
        const avatarFile = window.__pendingAvatarFile;
        if (avatarFile) {
          saveStatus.textContent = 'Загружаем аватар…';
          const uploaded = await UsersAPI.uploadAvatar(avatarFile);
          const url = uploaded?.user?.avatar || uploaded?.url || uploaded?.avatar;
          if (!url) throw new Error('Сервер не подтвердил загрузку аватара. Попробуйте ещё раз.');
          submitted.avatarUrl = 'url("' + url + '")';
          if (window.currentUser) window.currentUser.avatar = url;
          if (window.__pendingAvatarFile === avatarFile) {
            window.__pendingAvatarFile = null;
            if (window.ownProfileData) window.ownProfileData.avatarUrl = submitted.avatarUrl;
          }
          saveStatus.textContent = 'Сохраняем профиль…';
        }
        const result = await UsersAPI.updateProfile(payload);
        const user = result?.user || result;
        if (!user || !user._id) throw new Error('Сервер не подтвердил сохранение. Попробуйте ещё раз.');
        if (window.currentUser) {
          Object.assign(window.currentUser, user);
          try { localStorage.setItem('user', JSON.stringify(window.currentUser)); } catch (_) {}
        }
        const saved = {
          name: user.nickname ?? payload.nickname, bio: user.bio ?? payload.bio,
          status: user.customStatus ?? payload.customStatus, listening: user.listening ?? payload.listening
        };
        // Edits typed while a request is running remain dirty and are never
        // labelled as saved or overwritten by the older response.
        for (const [key, input] of Object.entries(inputs)) {
          if (input && input.value === submitted[key]) {
            input.value = saved[key];
            if (window.ownProfileData) {
              const property = key === 'status' ? 'statusText' : key;
              window.ownProfileData[property] = saved[key];
            }
          }
        }
        Object.assign(snapshot, submitted, saved, {
          mood: user.mood ?? submitted.mood,
          hobbies: JSON.stringify((user.hobbies ?? payload.hobbies).map(h => ({ text: h.text, icon: h.icon })))
        });
        checkDirty();
        saveStatus.textContent = dirty ? 'Сохранено. Есть новые изменения.' : 'Все изменения сохранены';
        if (typeof window.showToast === 'function') window.showToast('Профиль', dirty ? 'Сохранено. Новые правки можно сохранить отдельно.' : 'Изменения сохранены.');
        if (typeof window.refreshProfileVitrine === 'function') window.refreshProfileVitrine();
        const navAvatarLetter = document.querySelector('#nav-profile-btn .avatar-letter');
        if (navAvatarLetter) navAvatarLetter.textContent = saved.name.charAt(0).toUpperCase();
        if (usernameResult) { usernameResult.textContent = 'Имя пользователя меняется в разделе «Аккаунт».'; usernameResult.style.color = ''; }
        if (!dirty && pendingNavBtn) {
          const button = pendingNavBtn;
          pendingNavBtn = null;
          pendingClose = false;
          button.click();
        } else if (!dirty && pendingClose) {
          pendingClose = false;
          doClose();
        }
      } catch (error) {
        console.warn('[settings] profile save failed:', error.status || 'network');
        const message = error.message || 'Не удалось сохранить. Ваши изменения остались в форме.';
        saveStatus.textContent = message;
        if (usernameResult) { usernameResult.textContent = message; usernameResult.style.color = '#ff8080'; }
        if (typeof window.showToast === 'function') window.showToast('Не сохранено', message);
        checkDirty();
      } finally {
        clearTimeout(slowTimer);
        savingState(false);
      }
    }

    function doReset() {
      if (saving) return;
      window.__pendingAvatarFile = null;
      const hobbies = JSON.parse(snapshot.hobbies || '[]');
      if (Array.isArray(window.myHobbies)) window.myHobbies.splice(0, window.myHobbies.length, ...hobbies);
      else window.myHobbies = hobbies;
      const d = window.ownProfileData || {};
      const nameInput = shell.querySelector('#lvs-input-name');
      const userInput = shell.querySelector('#lvs-input-username');
      const bioInput = shell.querySelector('#lvs-input-bio');
      const statusInput = shell.querySelector('#lvs-input-status');
      const listeningInput = shell.querySelector('#lvs-input-listening');
      const moodPicker = shell.querySelector('#lvs-mood-picker');
      const avatarBox = shell.querySelector('#lvs-avatar-preview');
      const vitrineAvatar = shell.querySelector('#lvs-vitrine-avatar');

      if (nameInput) nameInput.value = snapshot.name;
      if (userInput) userInput.value = snapshot.user;
      if (bioInput) bioInput.value = snapshot.bio;
      if (statusInput) statusInput.value = snapshot.status;
      if (listeningInput) listeningInput.value = snapshot.listening;

      if (window.ownProfileData) {
        window.ownProfileData.name = snapshot.name;
        window.ownProfileData.username = '@' + snapshot.user;
        window.ownProfileData.statusText = snapshot.status;
        window.ownProfileData.bio = snapshot.bio;
        window.ownProfileData.listening = snapshot.listening;
        window.ownProfileData.mood = snapshot.mood;
        window.ownProfileData.avatarUrl = snapshot.avatarUrl;
      }

      const bg = snapshot.avatarUrl || '';
      [avatarBox, vitrineAvatar].forEach(box => {
        if (!box) return;
        box.style.backgroundImage = bg;
        const span = box.querySelector('span');
        if (span) span.style.display = bg ? 'none' : '';
      });

      if (moodPicker) {
        moodPicker.querySelectorAll('.lvs-mood-item').forEach(b =>
          b.classList.toggle('active', b.getAttribute('data-mood') === snapshot.mood));
      }

      if (typeof window.__profileRerender === 'function') window.__profileRerender();

      checkDirty();
      if (typeof window.showToast === 'function') window.showToast('Настройки', 'Изменения сброшены.');
    }

    function doClose() {
      const prevBtn = document.querySelector('[data-target="' + lastView + '"]');
      if (prevBtn) {
        prevBtn.click();
      } else {
        if (overlay) overlay.classList.add('panel-hidden');
        if (navSettingsBtn) navSettingsBtn.classList.remove('active');
      }
    }

    function tryClose() {
      if (dirty) {
        pendingClose = true;
        if (confirmModal) confirmModal.classList.remove('hidden');
      } else {
        doClose();
      }
    }

    // Плашка: кнопки
    if (saveBtn) saveBtn.addEventListener('click', doSave);
    if (resetBtn) resetBtn.addEventListener('click', doReset);

    // Модалка подтверждения
    if (confirmSave) confirmSave.addEventListener('click', () => {
      if (confirmModal) confirmModal.classList.add('hidden');
      doSave();
    });
    if (confirmCancel) confirmCancel.addEventListener('click', () => {
      if (confirmModal) confirmModal.classList.add('hidden');
      pendingClose = false;
      pendingNavBtn = null;
    });
    if (confirmModal) confirmModal.addEventListener('click', (e) => {
      if (e.target === confirmModal) { confirmModal.classList.add('hidden'); pendingClose = false; pendingNavBtn = null; }
    });

    // Перехват закрытия настроек
    if (navSettingsBtn) {
      navSettingsBtn.addEventListener('click', () => {
        const visible = document.querySelector('.view-panel:not(.panel-hidden)');
        if (visible && visible.id && visible.id !== 'view-settings') lastView = visible.id;
        if (window.innerWidth <= 768) shell.classList.remove('section-open');
      }, true);
    }

    // Перехват переключения на другую вкладку сайдбара при несохранённых изменениях.
    // Когда настройки открыты и есть dirty — блокируем навигацию и показываем модалку.
    const navTargetBtns = document.querySelectorAll('[data-target]');
    navTargetBtns.forEach(btn => {
      if (btn === navSettingsBtn) return;
      btn.addEventListener('click', (e) => {
        const settingsOpen = overlay && !overlay.classList.contains('panel-hidden');
        if (settingsOpen && dirty) {
          e.preventDefault();
          e.stopImmediatePropagation();
          pendingNavBtn = btn;
          if (confirmModal) confirmModal.classList.remove('hidden');
        }
      }, true);
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopImmediatePropagation();
        tryClose();
      });
    }

    if (overlay) {
      overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) tryClose();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay && !overlay.classList.contains('panel-hidden')) {
        if (confirmModal && !confirmModal.classList.contains('hidden')) {
          confirmModal.classList.add('hidden');
          pendingClose = false;
          pendingNavBtn = null;
        } else {
          tryClose();
        }
      }
    });

    // Начальный снапшот
    takeSnapshot();
  }

  /* ───────────────  Персист настроек (тема, масштаб, тоглы)  ─────────────── */

  function initPrefsPersistence(shell) {
    const sm = window.settingsManager;

    // Тема: восстановление активной кнопки из settingsManager — он же
    // применяет атрибут на старте (и до первой отрисовки это делает ещё
    // раньше инлайновый скрипт в index.html, см. ключ app-theme).
    const savedTheme = sm ? sm.get('app-theme') : localStorage.getItem('app-theme');
    const activeTheme = (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'system')
      ? savedTheme
      : 'dark';
    shell.querySelectorAll('.lvs-theme-option[data-theme]').forEach(o =>
      o.classList.toggle('active', o.dataset.theme === activeTheme));

    // Масштаб интерфейса (через settingsManager — он применяет на старте)
    const scale = shell.querySelector('#lvs-scale-slider');
    const scaleVal = shell.querySelector('#lvs-scale-value');
    if (scale && sm) {
      const saved = Number(sm.get('ui-scale')) || 100;
      scale.value = saved;
      if (scaleVal) scaleVal.textContent = saved + '%';
      scale.addEventListener('change', () => sm.saveSetting('ui-scale', Number(scale.value)));
    }

    // Громкость вывода: раньше ползунок жил сам по себе и не сохранялся —
    // то есть «Громкость вывода» не делала вообще ничего, хотя ключ
    // output-volume читают и войс, и голосовые, и звуки уведомлений.
    const outVol = shell.querySelector('#lvs-out-volume');
    const outVolVal = shell.querySelector('#lvs-out-volume-value');
    if (outVol && sm) {
      const savedVol = Number(sm.get('output-volume'));
      const vol = Number.isFinite(savedVol) ? savedVol : 100;
      outVol.value = vol;
      if (outVolVal) outVolVal.textContent = vol + '%';
      outVol.addEventListener('change', () => sm.saveSetting('output-volume', Number(outVol.value)));
    }

    // Общие тоглы по [data-setting-key]
    shell.querySelectorAll('input[type="checkbox"][data-setting-key]').forEach(cb => {
      const key = cb.dataset.settingKey;
      if (sm) {
        const cur = sm.get(key);
        if (typeof cur === 'boolean') cb.checked = cur;
      }
      cb.addEventListener('change', () => {
        if (sm) sm.saveSetting(key, cb.checked);
      });
    });
  }

  /* ───────────────  Публичная страница профиля  ─────────────── */

  /*
   * Карточка-вход в редактор на me.loveapp.chat/build.
   *
   * Сам редактор живёт на другом домене и работает со своим узким токеном:
   * приложение просит у сервера одноразовый код и открывает ссылку во внешнем
   * браузере. Токен из приложения на публичный хост при этом не уезжает — в
   * этом весь смысл такой передачи.
   *
   * Карточка спрятана, пока сервер не ответил, и остаётся спрятанной при любой
   * ошибке. Отдельно это важно для 404: так отвечает requireFeature, когда
   * функция ещё выключена флагом. Показать в этом случае кнопку — значит
   * пообещать раздел, которого нет.
   */
  function initProfilePage() {
    const card = document.getElementById('lvs-pp-card');
    const stateEl = document.getElementById('lvs-pp-state');
    const badge = document.getElementById('lvs-pp-badge');
    const note = document.getElementById('lvs-pp-note');
    const button = document.getElementById('lvs-pp-open');
    const buttonLabel = document.getElementById('lvs-pp-open-label');
    const copyBtn = document.getElementById('lvs-pp-copy');
    const visitBtn = document.getElementById('lvs-pp-visit');
    if (!card || !button || !window.ProfilePageAPI) return;

    let summary = null;
    let publicUrl = '';

    function paint() {
      if (!summary) return;
      const urls = summary.urls || {};
      const address = (urls.shortAvailable && urls.short ? urls.short : urls.long) || '';
      const shown = address.replace(/^https?:\/\//, '');

      if (summary.enabled) {
        badge.textContent = 'открыта';
        badge.className = 'lvs-badge lvs-badge--success';
      } else {
        badge.textContent = 'не опубликована';
        badge.className = 'lvs-badge';
      }
      badge.hidden = false;

      stateEl.textContent = summary.enabled
        ? shown
        : (shown ? shown + ' — пока никому не видна' : 'Оформите визитку и откройте её по ссылке');

      // Скрытую модерацией страницу настройки всё ещё считают опубликованной,
      // а по ссылке её нет. Промолчать — оставить человека с мёртвым адресом.
      let text = '';
      if (summary.moderation === 'hidden') text = 'Страницу скрыла модерация — по ссылке её сейчас не видно.';
      else if (summary.moderation === 'flagged') text = 'На страницу пожаловались, её смотрит модерация.';
      else if (summary.restricted) text = 'Пока аккаунт ограничен, страница недоступна.';
      note.textContent = text;
      note.hidden = !text;

      if (buttonLabel) buttonLabel.textContent = summary.exists ? 'Настроить' : 'Создать';
      else button.textContent = summary.exists ? 'Настроить' : 'Создать';
      // Скопировать адрес можно всегда, открыть — только опубликованную.
      publicUrl = address;
      if (copyBtn) copyBtn.hidden = !address;
      if (visitBtn) visitBtn.hidden = !(address && summary.enabled && summary.moderation !== 'hidden');
      card.classList.toggle('is-live', !!summary.enabled);
      card.hidden = false;
    }

    async function load() {
      try {
        summary = await window.ProfilePageAPI.summary();
        paint();
      } catch (error) {
        // 404 — функции нет; всё остальное — сервер недоступен. В обоих случаях
        // молча ничего не рисуем: настройки не место для отчётов о недоступности.
        card.hidden = true;
      }
    }

    button.addEventListener('click', async () => {
      button.classList.add('is-loading');
      try {
        const res = await window.ProfilePageAPI.editorSession();
        // Код лежит во фрагменте ссылки, поэтому открывать её нужно во внешнем
        // браузере целиком и без правок — внутри Electron редактор оказался бы
        // на том же процессе, что и приложение с полным токеном.
        if (window.electronAPI && window.electronAPI.openExternal) {
          window.electronAPI.openExternal(res.url);
        } else {
          window.open(res.url, '_blank', 'noopener');
        }
        _toast('Редактор открыт', 'Продолжайте в браузере. Ссылка действует две минуты.');
        // Состояние могло измениться, пока человек редактировал, — обновим при
        // возврате в приложение, а не сейчас: сейчас ничего ещё не поменялось.
        setTimeout(load, 60000);
      } catch (error) {
        _toast('Не удалось открыть редактор', (error && error.message) || 'Попробуйте ещё раз.');
      } finally {
        button.classList.remove('is-loading');
      }
    });

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        if (!publicUrl) return;
        try {
          await navigator.clipboard.writeText(publicUrl);
          _toast('Ссылка скопирована', publicUrl.replace(/^https?:\/\//, ''));
        } catch (_) {
          _toast('Не удалось скопировать', 'Выделите адрес и скопируйте вручную.');
        }
      });
    }
    if (visitBtn) {
      visitBtn.addEventListener('click', () => {
        if (!publicUrl) return;
        if (window.electronAPI && window.electronAPI.openExternal) window.electronAPI.openExternal(publicUrl);
        else window.open(publicUrl, '_blank', 'noopener');
      });
    }

    load();
    window.__reloadProfilePageCard = load;
  }

  /* ───────────────  Аккаунт: данные + безопасность  ─────────────── */

  let _accountSubmit = null;

  function initAccount() {
    fillAccountInfo();
    window.__fillAccountSettings = fillAccountInfo;
    window.__doLogout = doLogout;

    const twoFa = document.getElementById('lvs-2fa-toggle');
    if (twoFa) {
      twoFa.addEventListener('change', async () => {
        const enabled = twoFa.checked;
        twoFa.disabled = true;
        try {
          if (typeof AuthAPI !== 'undefined') await AuthAPI.toggleTwoFactor(enabled);
          if (window.currentUser) window.currentUser.twoFactorEnabled = enabled;
          _toast('Безопасность', enabled ? 'Двухфакторная аутентификация включена.' : 'Двухфакторная аутентификация выключена.');
        } catch (err) {
          twoFa.checked = !enabled;
          _toast('Ошибка', (err && err.message) || 'Не удалось изменить настройку');
        } finally {
          twoFa.disabled = false;
        }
      });
    }

    const logoutBtn = document.getElementById('lvs-logout-btn');
    if (logoutBtn) logoutBtn.addEventListener('click', async () => {
      // Кнопка теперь всегда на виду внизу панели — спрашиваем, чтобы не выйти случайно.
      const ok = typeof window.loveConfirm === 'function'
        ? await window.loveConfirm({ title: 'Выйти из аккаунта?', text: 'Чтобы вернуться, нужно будет снова ввести почту и пароль.', confirmText: 'Выйти', danger: true })
        : true;
      if (ok) doLogout();
    });

    const emailBtn = document.getElementById('lvs-acc-email-btn');
    const usernameBtn = document.getElementById('lvs-acc-username-btn');
    const passwordBtn = document.getElementById('lvs-acc-password-btn');
    if (emailBtn) emailBtn.addEventListener('click', () => openAccountModal('email'));
    if (usernameBtn) usernameBtn.addEventListener('click', () => openAccountModal('username'));
    if (passwordBtn) passwordBtn.addEventListener('click', () => openAccountModal('password'));

    initAccountModal();
  }

  function fillAccountInfo() {
    const u = window.currentUser;
    if (!u) return;
    const emailEl = document.getElementById('lvs-acc-email');
    const usernameEl = document.getElementById('lvs-acc-username');
    const createdEl = document.getElementById('lvs-acc-created');
    const ageEl = document.getElementById('lvs-acc-age');
    const twoFa = document.getElementById('lvs-2fa-toggle');
    if (emailEl) emailEl.textContent = u.email || '—';
    if (usernameEl) usernameEl.textContent = '@' + (u.username || '');
    if (createdEl && u.createdAt) {
      const d = new Date(u.createdAt);
      if (!isNaN(d.getTime())) {
        createdEl.textContent = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
        if (ageEl) ageEl.textContent = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000)) + ' дн.';
      }
    }
    if (twoFa) twoFa.checked = !!u.twoFactorEnabled;
  }

  async function doLogout() {
    // Останавливаем музыку и убираем мини-плашку перед выходом
    try { if (typeof window.__teardownMusic === 'function') window.__teardownMusic(); } catch (e) {}
    try { if (typeof AuthAPI !== 'undefined') await AuthAPI.logout(); } catch (e) { /* ignore */ }
    try { if (typeof disconnectSocket === 'function') disconnectSocket(); } catch (e) {}
    try { if (typeof clearAuthToken === 'function') await clearAuthToken(); } catch (e) {}
    try { localStorage.removeItem('user'); } catch (e) {}
    window.currentUser = null;
    // Уведомления прошлого аккаунта не должны пережить выход (CODEX-0019).
    try { if (typeof window.resetNotificationsForLogout === 'function') window.resetNotificationsForLogout(); } catch (e) {}
    if (typeof window.showAuthScreen === 'function') window.showAuthScreen();
    else location.reload();
  }

  function initAccountModal() {
    const modal = document.getElementById('lvs-account-modal');
    if (!modal) return;
    const closeBtn = document.getElementById('lvs-account-close');
    const submitBtn = document.getElementById('lvs-account-submit');
    const close = () => modal.classList.add('hidden');
    if (closeBtn) closeBtn.addEventListener('click', close);
    modal.addEventListener('mousedown', (e) => { if (e.target === modal) close(); });
    if (submitBtn) submitBtn.addEventListener('click', async () => {
      if (!_accountSubmit) return;
      const errorEl = document.getElementById('lvs-account-error');
      submitBtn.disabled = true;
      if (errorEl) errorEl.textContent = '';
      try {
        const okMsg = await _accountSubmit();
        _toast('Аккаунт', okMsg || 'Готово');
        modal.classList.add('hidden');
      } catch (err) {
        if (errorEl) errorEl.textContent = (err && err.message) || 'Ошибка';
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  function openAccountModal(type) {
    const modal = document.getElementById('lvs-account-modal');
    const title = document.getElementById('lvs-account-title');
    const fields = document.getElementById('lvs-account-fields');
    const errorEl = document.getElementById('lvs-account-error');
    if (!modal || !fields) return;
    if (errorEl) errorEl.textContent = '';
    fields.innerHTML = '';

    const mk = (labelText, inputType, placeholder, maxlen) => {
      const wrap = document.createElement('div');
      wrap.style.marginBottom = '12px';
      const label = document.createElement('label');
      label.className = 'lvs-label';
      label.textContent = labelText;
      const input = document.createElement('input');
      input.className = 'lvs-input';
      input.type = inputType;
      input.style.width = '100%';
      if (placeholder) input.placeholder = placeholder;
      if (maxlen) input.maxLength = maxlen;
      wrap.appendChild(label);
      wrap.appendChild(input);
      fields.appendChild(wrap);
      return input;
    };

    if (type === 'password') {
      title.textContent = 'Изменить пароль';
      const cur = mk('Текущий пароль', 'password', '••••••••');
      const next = mk('Новый пароль', 'password', 'Минимум 8 символов', 128);
      const conf = mk('Повторите новый пароль', 'password', '••••••••', 128);
      _accountSubmit = async () => {
        if (!cur.value || !next.value) throw new Error('Заполните все поля');
        if (next.value.length < 8) throw new Error('Новый пароль — минимум 8 символов');
        if (next.value !== conf.value) throw new Error('Пароли не совпадают');
        await AuthAPI.changePassword(cur.value, next.value);
        return 'Пароль изменён';
      };
    } else if (type === 'email') {
      title.textContent = 'Изменить почту';
      const email = mk('Новая почта', 'email', 'name@example.com');
      const pass = mk('Текущий пароль', 'password', '••••••••');
      _accountSubmit = async () => {
        if (!email.value.trim()) throw new Error('Введите новую почту');
        const res = await UsersAPI.updateAccount({ email: email.value.trim(), currentPassword: pass.value });
        const u = (res && res.user) || res;
        if (window.currentUser) window.currentUser.email = (u && u.email) || email.value.trim();
        fillAccountInfo();
        return 'Почта обновлена';
      };
    } else if (type === 'username') {
      title.textContent = 'Изменить имя пользователя';
      const uname = mk('Новое имя пользователя', 'text', 'username', 32);
      const pass = mk('Текущий пароль', 'password', '••••••••');
      _accountSubmit = async () => {
        const v = uname.value.trim();
        if (v.length < 2) throw new Error('Имя — минимум 2 символа');
        const res = await UsersAPI.updateAccount({ username: v, currentPassword: pass.value });
        const u = (res && res.user) || res;
        const newName = (u && u.username) || v;
        if (window.currentUser) window.currentUser.username = newName;
        if (window.ownProfileData) window.ownProfileData.username = '@' + newName;
        const userInput = document.getElementById('lvs-input-username');
        if (userInput) userInput.value = newName;
        fillAccountInfo();
        return 'Имя пользователя обновлено';
      };
    }

    modal.classList.remove('hidden');
  }

})();
