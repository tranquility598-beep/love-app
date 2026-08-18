/* ════════════════════════════════════════════════════════════════
   LOVE — SETTINGS controller (новый дизайн)
   Управляет разделом #settings-shell внутри #view-settings.
   ════════════════════════════════════════════════════════════════ */

(function () {
  document.addEventListener('DOMContentLoaded', initSettings);

  function initSettings() {
    const shell = document.getElementById('settings-shell');
    if (!shell) return;

    initNavigation(shell);
    initModal(shell);
    initProfile(shell);
    initSelects(shell);
    initSliders(shell);
    initThemeOptions(shell);
    initNotifPreview(shell);
    initVoice(shell);
    initDangerActions(shell);
    initUpdates(shell);
    initAbout(shell);
    initVersions(shell);
    initAdvanced(shell);
    initAccount(shell);
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
  }

  /* ───────────────  Помощь, обращения и нарушения  ─────────────── */

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

    const list = section.querySelector('#support-case-list');
    const thread = section.querySelector('#support-case-thread');
    const newForm = section.querySelector('#support-new-case-form');
    const appealForm = section.querySelector('#support-appeal-form');

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

    section.querySelector('#support-new-case-btn').addEventListener('click', () => newForm.classList.remove('hidden'));
    section.querySelector('#support-new-case-cancel').addEventListener('click', () => newForm.classList.add('hidden'));
    newForm.addEventListener('submit', async event => {
      event.preventDefault();
      const title = section.querySelector('#support-case-title').value.trim();
      const description = section.querySelector('#support-case-description').value.trim();
      const priority = section.querySelector('#support-case-priority').value;
      const submit = newForm.querySelector('[type="submit"]');
      submit.disabled = true;
      try {
        const result = await window.CasesAPI.create({ kind: 'support', title, description, priority });
        newForm.reset();
        newForm.classList.add('hidden');
        selectedCaseId = result.case?._id || null;
        await load();
        if (selectedCaseId) await openCase(selectedCaseId);
        _toast('Обращение создано', 'Команда Love увидит его в центре обращений.');
      } catch (error) {
        _toast('Не удалось создать обращение', error.message || 'Проверьте введённые данные.');
      } finally {
        submit.disabled = false;
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

    shell.querySelector('[data-settings-section="settings-support"]')?.addEventListener('click', () => load());
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
    // Масштаб применяем только когда ползунок реально двигают: на старте
    // в разметке стоит 100%, а сохранённое значение подставит
    // initPrefsPersistence — иначе при запуске масштаб бы моргал на 100%.
    bindSlider(shell, '#lvs-scale-slider', '#lvs-scale-value', (v) => v + '%', (v) => {
      if (window.settingsManager) window.settingsManager.applyUIScale(v);
    });
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
    const options = shell.querySelectorAll('.lvs-theme-option');
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
      navigator.mediaDevices.addEventListener('devicechange', () => populateDevices(shell));
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
          const constraints = typeof window.getVoiceAudioConstraints === 'function'
            ? window.getVoiceAudioConstraints()
            : true;
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
      snapshot.hobbies = JSON.stringify(window.myHobbies || []);
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
        hobbies: JSON.stringify(window.myHobbies || [])
      };
      dirty = cur.name !== snapshot.name || cur.user !== snapshot.user || cur.bio !== snapshot.bio ||
              cur.status !== snapshot.status || cur.listening !== snapshot.listening ||
              cur.mood !== snapshot.mood || cur.avatarUrl !== snapshot.avatarUrl ||
              cur.hobbies !== snapshot.hobbies;
      if (saveBar) saveBar.classList.toggle('visible', dirty);
    }

    window.__settingsRefreshDirty = checkDirty;

    async function doSave() {
      const usernameResult = shell.querySelector('#lvs-username-result');
      const nameVal = ((shell.querySelector('#lvs-input-name') || {}).value || '').trim();
      const bioVal = ((shell.querySelector('#lvs-input-bio') || {}).value || '').trim();
      const statusVal = ((shell.querySelector('#lvs-input-status') || {}).value || '').trim();
      const listeningVal = ((shell.querySelector('#lvs-input-listening') || {}).value || '').trim();

      if (!nameVal) {
        if (usernameResult) { usernameResult.textContent = 'Имя не может быть пустым'; usernameResult.style.color = '#ff4a4a'; }
        return;
      }

      const payload = {
        nickname: nameVal,
        bio: bioVal,
        customStatus: statusVal,
        listening: listeningVal,
        mood: (window.ownProfileData && window.ownProfileData.mood) || 'tea',
        hobbies: (window.myHobbies || []).map(h => ({ text: h.text, icon: h.icon }))
      };

      if (saveBtn) saveBtn.disabled = true;
      try {
        if (typeof UsersAPI !== 'undefined') {
          // Сначала грузим аватар, если выбран новый файл
          if (window.__pendingAvatarFile) {
            try {
              const res = await UsersAPI.uploadAvatar(window.__pendingAvatarFile);
              const url = (res && res.user && res.user.avatar) || (res && res.url) || (res && res.avatar);
              if (url) {
                if (window.ownProfileData) window.ownProfileData.avatarUrl = 'url("' + url + '")';
                if (window.currentUser) window.currentUser.avatar = url;
              }
              window.__pendingAvatarFile = null;
            } catch (e) {
              console.error('[settings] avatar upload failed:', e);
            }
          }

          const result = await UsersAPI.updateProfile(payload);
          const u = (result && result.user) || result;
          if (u && window.currentUser) {
            window.currentUser.nickname     = u.nickname;
            window.currentUser.bio          = u.bio;
            window.currentUser.customStatus = u.customStatus;
            window.currentUser.mood         = u.mood;
            window.currentUser.listening    = u.listening;
            window.currentUser.hobbies      = u.hobbies;
          }
        }

        // Синхронизируем локальную витрину
        if (window.ownProfileData) {
          window.ownProfileData.name       = payload.nickname;
          window.ownProfileData.bio        = payload.bio;
          window.ownProfileData.statusText = payload.customStatus;
          window.ownProfileData.listening  = payload.listening;
        }

        takeSnapshot();
        checkDirty();
        if (typeof window.showToast === 'function') window.showToast('Профиль', 'Изменения сохранены.');
        if (typeof window.refreshProfileVitrine === 'function') window.refreshProfileVitrine();
        const navAvatarLetter = document.querySelector('#nav-profile-btn .avatar-letter');
        if (navAvatarLetter) navAvatarLetter.textContent = (payload.nickname || 'U').charAt(0).toUpperCase();
        if (usernameResult) { usernameResult.textContent = 'Имя пользователя меняется в разделе «Аккаунт».'; usernameResult.style.color = ''; }

        if (pendingNavBtn) {
          const btn = pendingNavBtn;
          pendingNavBtn = null;
          pendingClose = false;
          btn.click();
        } else if (pendingClose) {
          pendingClose = false;
          doClose();
        }
      } catch (err) {
        console.error('[settings] save profile failed:', err);
        const msg = (err && err.message) || 'Не удалось сохранить изменения';
        if (usernameResult) { usernameResult.textContent = msg; usernameResult.style.color = '#ff4a4a'; }
        if (typeof window.showToast === 'function') window.showToast('Ошибка', msg);
      } finally {
        if (saveBtn) saveBtn.disabled = false;
      }
    }

    function doReset() {
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
    shell.querySelectorAll('.lvs-theme-option').forEach(o =>
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
    if (logoutBtn) logoutBtn.addEventListener('click', doLogout);

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
