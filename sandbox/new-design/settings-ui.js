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
    initDirtyTracking(shell);
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
        syncVitrine();
      });
    }
    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        applyAvatar('');
        if (fileInput) fileInput.value = '';
        if (window.ownProfileData) window.ownProfileData.avatarUrl = '';
        syncVitrine();
      });
    }

    if (audioUploadBtn && audioFileInput) {
      audioUploadBtn.addEventListener('click', () => audioFileInput.click());
      audioFileInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        if (window.ownProfileData) window.ownProfileData.importedAudioUrl = url;
        if (listeningInput) {
          const name = file.name.replace(/\.[^.]+$/, '');
          listeningInput.value = name;
          if (window.ownProfileData) window.ownProfileData.listening = name;
        }
        syncVitrine();
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
        if (!wasOpen) select.classList.add('open');
      });

      menu.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
          select.dataset.value = li.dataset.value;
          if (label) label.textContent = li.textContent;
          menu.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
          li.classList.add('selected');
          select.classList.remove('open');
          select.dispatchEvent(new CustomEvent('lvs-change', { detail: li.dataset.value }));
        });
      });
    });

    function closeAllSelects() {
      selects.forEach(s => s.classList.remove('open'));
    }

    document.addEventListener('click', () => closeAllSelects());
  }

  /* ───────────────  Слайдеры  ─────────────── */

  function initSliders(shell) {
    bindSlider(shell, '#lvs-scale-slider', '#lvs-scale-value', (v) => {
      document.documentElement.style.fontSize = (16 * v / 100) + 'px';
      return v + '%';
    });
    bindSlider(shell, '#lvs-mic-volume', '#lvs-mic-volume-value', (v) => v + '%');
    bindSlider(shell, '#lvs-out-volume', '#lvs-out-volume-value', (v) => v + '%');
  }

  function bindSlider(shell, sliderSel, valueSel, fmt) {
    const slider = shell.querySelector(sliderSel);
    const value = shell.querySelector(valueSel);
    if (!slider) return;
    const update = () => { if (value) value.textContent = fmt(slider.value); };
    slider.addEventListener('input', update);
    update();
  }

  /* ───────────────  Темы  ─────────────── */

  function initThemeOptions(shell) {
    const options = shell.querySelectorAll('.lvs-theme-option');
    options.forEach(opt => {
      opt.addEventListener('click', () => {
        options.forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        const theme = opt.dataset.theme;
        document.documentElement.setAttribute('data-theme', theme);
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

    const testBtn = shell.querySelector('#lvs-mic-test');
    const meter = shell.querySelector('#lvs-mic-meter');
    if (testBtn && meter) {
      let running = false;
      let raf = null;
      let stream = null;
      let audioCtx = null;

      testBtn.addEventListener('click', async () => {
        if (running) { stopMeter(); return; }
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const buf = new Uint8Array(analyser.frequencyBinCount);

          running = true;
          testBtn.textContent = '⏹ Остановить';

          const tick = () => {
            analyser.getByteFrequencyData(buf);
            let sum = 0;
            for (let i = 0; i < buf.length; i++) sum += buf[i];
            const level = Math.min(100, (sum / buf.length) * 1.6);
            meter.style.width = level + '%';
            raf = requestAnimationFrame(tick);
          };
          tick();
        } catch (err) {
          testBtn.textContent = '🎙 Нет доступа к микрофону';
          setTimeout(() => { testBtn.textContent = '🎙 Проверить микрофон'; }, 2000);
        }
      });

      function stopMeter() {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        if (stream) stream.getTracks().forEach(t => t.stop());
        if (audioCtx) audioCtx.close();
        meter.style.width = '0%';
        testBtn.textContent = '🎙 Проверить микрофон';
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
      fillSelect(shell.querySelector('#lvs-input-device'), devices.filter(d => d.kind === 'audioinput'), 'Микрофон');
      fillSelect(shell.querySelector('#lvs-output-device'), devices.filter(d => d.kind === 'audiooutput'), 'Динамик');
    } catch (e) { /* noop */ }
  }

  function fillSelect(select, devices, fallback) {
    if (!select || !devices.length) return;
    const menu = select.querySelector('.lvs-select-menu');
    const label = select.querySelector('.lvs-select-btn span');
    if (!menu) return;
    menu.innerHTML = '';
    devices.forEach((d, i) => {
      const li = document.createElement('li');
      li.dataset.value = d.deviceId || ('dev' + i);
      li.textContent = d.label || `${fallback} ${i + 1}`;
      if (i === 0) { li.classList.add('selected'); if (label) label.textContent = li.textContent; }
      li.addEventListener('click', () => {
        select.dataset.value = li.dataset.value;
        if (label) label.textContent = li.textContent;
        menu.querySelectorAll('li').forEach(x => x.classList.remove('selected'));
        li.classList.add('selected');
        select.classList.remove('open');
      });
      menu.appendChild(li);
    });
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
    if (clearCache && cacheSize) clearCache.addEventListener('click', () => {
      cacheSize.textContent = 'Кэш очищен';
      clearCache.textContent = 'Готово';
      clearCache.disabled = true;
      setTimeout(() => {
        cacheSize.textContent = 'Занято 0 МБ';
        clearCache.textContent = 'Очистить';
        clearCache.disabled = false;
      }, 1500);
    });
  }

  function confirmDanger(msg) {
    return window.confirm(msg);
  }

  function resetSettings(shell) {
    shell.querySelectorAll('.lvs-toggle input[type="checkbox"]').forEach(cb => { cb.checked = cb.hasAttribute('checked'); });
    const scale = shell.querySelector('#lvs-scale-slider');
    if (scale) { scale.value = 100; scale.dispatchEvent(new Event('input')); }
    document.documentElement.style.fontSize = '';
  }

  /* ───────────────  Обновления  ─────────────── */

  function initUpdates(shell) {
    const btn = shell.querySelector('#lvs-check-updates');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (btn.classList.contains('is-loading')) return;
      const original = btn.textContent;
      btn.classList.add('is-loading');
      btn.textContent = 'Проверка…';
      setTimeout(() => {
        btn.classList.remove('is-loading');
        btn.textContent = 'Установлена последняя версия';
        setTimeout(() => { btn.textContent = original; }, 2200);
      }, 1400);
    });
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

    function doSave() {
      const user = (shell.querySelector('#lvs-input-username') || {}).value || '';
      const usernameResult = shell.querySelector('#lvs-username-result');
      if (!user.trim()) {
        if (usernameResult) { usernameResult.textContent = 'Имя не может быть пустым'; usernameResult.style.color = '#ff4a4a'; }
        return;
      }
      const taken = ['maria', 'ivan', 'alexey', 'darya', 'admin', 'moderator'];
      if (taken.includes(user.trim().toLowerCase())) {
        if (usernameResult) { usernameResult.textContent = 'Имя уже занято'; usernameResult.style.color = '#ff4a4a'; }
        return;
      }
      if (window.ownProfileData) window.ownProfileData.username = '@' + user.trim();

      takeSnapshot();
      checkDirty();
      if (typeof window.showToast === 'function') window.showToast('Настройки', 'Изменения сохранены.');
      if (typeof window.refreshProfileVitrine === 'function') window.refreshProfileVitrine();
      if (usernameResult) { usernameResult.textContent = 'Менять можно раз в 7 дней.'; usernameResult.style.color = ''; }

      if (pendingNavBtn) {
        const btn = pendingNavBtn;
        pendingNavBtn = null;
        pendingClose = false;
        btn.click();
      } else if (pendingClose) {
        pendingClose = false;
        doClose();
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

})();
