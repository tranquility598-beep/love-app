/* ════════════════════════════════════════════════════════════════
   LOVE — Контроллер экрана авторизации (МАКЕТ).
   Только UI + поверхностная мок-валидация. Реальная логика — в проде.
   ════════════════════════════════════════════════════════════════ */

(function () {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }

  /* ───────────── Мок-данные ───────────── */
  const TAKEN_USERNAMES = ['founder', 'maria', 'ivan', 'admin', 'love', 'test', 'support', 'moderator', 'alex'];
  const REGISTERED_EMAILS = ['founder@loveapp.chat', 'test@test.com', 'user@love.app'];

  /* ───────────── SVG-иконки статусов ───────────── */
  const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const ICON_CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const ICON_SPIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>';

  function initAuth() {
    const screen = document.getElementById('auth-screen');
    if (!screen) return;

    /* ─────── Утилиты ─────── */
    function $(id) { return document.getElementById(id); }
    function setStatus(el, state) {
      if (!el) return;
      el.className = 'auth-status' + (state ? ' is-' + state : '');
      el.innerHTML = state === 'ok' ? ICON_CHECK : state === 'error' ? ICON_CROSS : state === 'loading' ? ICON_SPIN : '';
    }
    function setWrap(input, state) {
      const wrap = input ? input.closest('.auth-input-wrap') : null;
      if (!wrap) return;
      wrap.classList.remove('is-ok', 'is-error');
      if (state === 'ok') wrap.classList.add('is-ok');
      else if (state === 'error') wrap.classList.add('is-error');
    }
    function setHint(el, msg, state) {
      if (!el) return;
      el.textContent = msg || '';
      el.className = 'auth-hint' + (state ? ' is-' + state : '');
    }
    function validEmail(e) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((e || '').trim());
    }
    function validUsername(u) {
      return /^[a-zA-Z0-9_]{3,24}$/.test(u || '');
    }

    /* ─────── Проверка силы пароля ─────── */
    function hasSequence(pw) {
      const s = (pw || '').toLowerCase();
      const seqs = ['0123456789', '9876543210', 'qwertyuiop', 'poiuytrewq',
        'asdfghjkl', 'lkjhgfdsa', 'zxcvbnm', 'mnbvcxz', 'abcdefghijklmnopqrstuvwxyz'];
      for (const seq of seqs) {
        for (let i = 0; i + 5 <= seq.length; i++) {
          if (s.includes(seq.slice(i, i + 5))) return true; // ряд из 5+ подряд
        }
      }
      return false;
    }
    const COMMON_WEAK = ['password', 'parol', '12345678', '123456789', 'qwerty', 'iloveyou', '11111111', '00000000', 'qwerty123'];
    function checkPassword(pw) {
      pw = pw || '';
      if (pw.length < 8) return { ok: false, level: 'weak', msg: 'Минимум 8 символов' };
      if (!/[0-9]/.test(pw)) return { ok: false, level: 'weak', msg: 'Добавьте хотя бы одну цифру' };
      if (COMMON_WEAK.includes(pw.toLowerCase()) || hasSequence(pw)) {
        return { ok: false, level: 'weak', msg: 'Пароль слишком слабый — избегайте «qwerty», «123456» и подобных' };
      }
      let classes = 0;
      if (/[a-z]/.test(pw)) classes++;
      if (/[A-Z]/.test(pw)) classes++;
      if (/[0-9]/.test(pw)) classes++;
      if (/[^a-zA-Z0-9]/.test(pw)) classes++;
      if (pw.length >= 10 && classes >= 3) return { ok: true, level: 'strong', msg: 'Надёжный пароль' };
      return { ok: true, level: 'medium', msg: 'Пароль подходит' };
    }

    /* ─────── Переключатель Вход / Регистрация ─────── */
    const sw = $('auth-switch');
    const formLogin = $('auth-form-login');
    const formRegister = $('auth-form-register');
    function setTab(tab) {
      const isReg = tab === 'register';
      sw.classList.toggle('is-register', isReg);
      sw.querySelectorAll('.auth-switch-btn').forEach(b => b.classList.toggle('active', b.dataset.authTab === tab));
      formLogin.classList.toggle('active', !isReg);
      formRegister.classList.toggle('active', isReg);
    }
    sw.querySelectorAll('.auth-switch-btn').forEach(b => {
      b.addEventListener('click', () => setTab(b.dataset.authTab));
    });

    /* ─────── Показать/скрыть пароль ─────── */
    document.querySelectorAll('[data-toggle-pass]').forEach(btn => {
      btn.addEventListener('click', () => {
        const input = $(btn.dataset.togglePass);
        if (!input) return;
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.querySelector('.auth-eye-on').classList.toggle('hidden', show);
        btn.querySelector('.auth-eye-off').classList.toggle('hidden', !show);
      });
    });

    /* ─────── Состояние формы регистрации ─────── */
    const reg = { email: false, username: false, password: false, terms: false };
    const regSubmit = $('register-submit');
    function refreshRegSubmit() {
      regSubmit.disabled = !(reg.email && reg.username && reg.password && reg.terms);
    }

    /* почта регистрации */
    const regEmail = $('reg-email');
    const regEmailStatus = $('reg-email-status');
    const regEmailHint = $('reg-email-hint');
    regEmail.addEventListener('input', () => {
      const v = regEmail.value.trim();
      if (!v) { reg.email = false; setStatus(regEmailStatus, ''); setWrap(regEmail, ''); setHint(regEmailHint, ''); return refreshRegSubmit(); }
      if (!validEmail(v)) { reg.email = false; setStatus(regEmailStatus, 'error'); setWrap(regEmail, 'error'); setHint(regEmailHint, 'Некорректный адрес почты', 'error'); return refreshRegSubmit(); }
      if (REGISTERED_EMAILS.includes(v.toLowerCase())) { reg.email = false; setStatus(regEmailStatus, 'error'); setWrap(regEmail, 'error'); setHint(regEmailHint, 'Эта почта уже зарегистрирована', 'error'); return refreshRegSubmit(); }
      reg.email = true; setStatus(regEmailStatus, 'ok'); setWrap(regEmail, 'ok'); setHint(regEmailHint, 'Почта свободна', 'ok'); refreshRegSubmit();
    });

    /* имя пользователя — проверка доступности с задержкой */
    const regUser = $('reg-username');
    const regUserStatus = $('reg-username-status');
    const regUserHint = $('reg-username-hint');
    let userTimer = null;
    regUser.addEventListener('input', () => {
      const v = regUser.value.trim();
      reg.username = false; refreshRegSubmit();
      clearTimeout(userTimer);
      if (!v) { setStatus(regUserStatus, ''); setWrap(regUser, ''); setHint(regUserHint, ''); return; }
      if (!validUsername(v)) {
        setStatus(regUserStatus, 'error'); setWrap(regUser, 'error');
        setHint(regUserHint, '3–24 символа: латиница, цифры, _', 'error');
        return;
      }
      setStatus(regUserStatus, 'loading'); setWrap(regUser, '');
      setHint(regUserHint, 'Проверяем доступность…', '');
      userTimer = setTimeout(() => {
        if (TAKEN_USERNAMES.includes(v.toLowerCase())) {
          reg.username = false; setStatus(regUserStatus, 'error'); setWrap(regUser, 'error');
          setHint(regUserHint, 'Это имя уже занято', 'error');
        } else {
          reg.username = true; setStatus(regUserStatus, 'ok'); setWrap(regUser, 'ok');
          setHint(regUserHint, 'Имя свободно', 'ok');
        }
        refreshRegSubmit();
      }, 700);
    });

    /* пароль регистрации */
    const regPass = $('reg-password');
    const regPassHint = $('reg-password-hint');
    const regStrength = $('reg-strength');
    regPass.addEventListener('input', () => {
      const v = regPass.value;
      if (!v) { reg.password = false; regStrength.removeAttribute('data-level'); setWrap(regPass, ''); setHint(regPassHint, ''); return refreshRegSubmit(); }
      const r = checkPassword(v);
      regStrength.setAttribute('data-level', r.level);
      reg.password = r.ok;
      setWrap(regPass, r.ok ? 'ok' : 'error');
      setHint(regPassHint, r.msg, r.ok ? 'ok' : 'error');
      refreshRegSubmit();
    });

    /* соглашение */
    const regTerms = $('reg-terms');
    regTerms.addEventListener('change', () => { reg.terms = regTerms.checked; refreshRegSubmit(); });

    /* ─────── Сабмиты ─────── */
    formRegister.addEventListener('submit', (e) => {
      e.preventDefault();
      if (regSubmit.disabled) return;
      afterAuth(true);
    });

    /* вход */
    const loginEmail = $('login-email');
    const loginPass = $('login-password');
    const loginEmailHint = $('login-email-hint');
    const loginPassHint = $('login-password-hint');
    formLogin.addEventListener('submit', (e) => {
      e.preventDefault();
      const em = loginEmail.value.trim();
      const pw = loginPass.value;
      let ok = true;
      if (!validEmail(em)) { setWrap(loginEmail, 'error'); setHint(loginEmailHint, 'Некорректный адрес почты', 'error'); ok = false; }
      else if (!REGISTERED_EMAILS.includes(em.toLowerCase())) { setWrap(loginEmail, 'error'); setHint(loginEmailHint, 'Аккаунт с такой почтой не найден', 'error'); ok = false; }
      else { setWrap(loginEmail, 'ok'); setHint(loginEmailHint, '', ''); }
      if (!pw) { setWrap(loginPass, 'error'); setHint(loginPassHint, 'Введите пароль', 'error'); ok = false; }
      else if (pw.length < 8) { setWrap(loginPass, 'error'); setHint(loginPassHint, 'Неверный пароль', 'error'); ok = false; }
      else { setWrap(loginPass, ''); setHint(loginPassHint, '', ''); }
      if (ok) afterAuth(!onboardingDone(), 'С возвращением!');
    });
    [loginEmail, loginPass].forEach(el => el && el.addEventListener('input', () => {
      setWrap(el, ''); setHint(el === loginEmail ? loginEmailHint : loginPassHint, '', '');
    }));

    /* ─────── Google OAuth → шаг выбора username ─────── */
    const oauthStep = $('auth-oauth-step');
    const oauthUser = $('oauth-username');
    const oauthStatus = $('oauth-username-status');
    const oauthHint = $('oauth-username-hint');
    function startOAuth() {
      let suggested = 'newuser';
      const src = (regEmail.value || loginEmail.value || '').trim();
      if (src.includes('@')) suggested = src.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'newuser';
      oauthUser.value = suggested;
      validateOAuthUser();
      oauthStep.classList.add('is-visible');
      screen.classList.add('oauth-active');
    }
    function validateOAuthUser() {
      const v = oauthUser.value.trim();
      if (!validUsername(v)) { setStatus(oauthStatus, 'error'); setWrap(oauthUser, 'error'); setHint(oauthHint, '3–24 символа: латиница, цифры, _', 'error'); return false; }
      if (TAKEN_USERNAMES.includes(v.toLowerCase())) { setStatus(oauthStatus, 'error'); setWrap(oauthUser, 'error'); setHint(oauthHint, 'Это имя уже занято, выберите другое', 'error'); return false; }
      setStatus(oauthStatus, 'ok'); setWrap(oauthUser, 'ok'); setHint(oauthHint, 'Имя свободно', 'ok'); return true;
    }
    oauthUser.addEventListener('input', validateOAuthUser);
    $('login-google').addEventListener('click', startOAuth);
    $('register-google').addEventListener('click', startOAuth);
    $('oauth-continue').addEventListener('click', () => {
      if (validateOAuthUser()) { oauthStep.classList.remove('is-visible'); screen.classList.remove('oauth-active'); afterAuth(true); }
    });

    /* ─────── Модалка документов ─────── */
    const DOCS = {
      terms: {
        title: 'Условия пользования',
        html: '<p>Используя Love, вы соглашаетесь с настоящими условиями. Это демонстрационный текст для макета.</p>' +
          '<h4>1. Аккаунт</h4><p>Вы отвечаете за сохранность данных для входа и за действия в своём аккаунте.</p>' +
          '<h4>2. Поведение</h4><ul><li>Уважайте других участников.</li><li>Не публикуйте запрещённый контент.</li><li>Не используйте сервис для спама и мошенничества.</li></ul>' +
          '<h4>3. Контент</h4><p>Вы сохраняете права на свой контент и предоставляете Love лицензию на его отображение в рамках работы сервиса.</p>' +
          '<h4>4. Прекращение</h4><p>Мы можем ограничить доступ при нарушении правил.</p>'
      },
      privacy: {
        title: 'Политика конфиденциальности',
        html: '<p>Мы бережно относимся к вашим данным. Это демонстрационный текст для макета.</p>' +
          '<h4>Какие данные мы собираем</h4><ul><li>Почта и имя пользователя.</li><li>Сообщения и медиа, которые вы отправляете.</li><li>Технические данные сессии.</li></ul>' +
          '<h4>Как мы их используем</h4><p>Только для работы сервиса, безопасности и улучшения продукта. Мы не продаём ваши данные.</p>' +
          '<h4>Шифрование</h4><p>Звонки защищены WebRTC. Доступ к данным ограничен.</p>' +
          '<h4>Ваши права</h4><p>Вы можете запросить экспорт или удаление аккаунта в настройках.</p>'
      }
    };
    const docModal = $('auth-doc-modal');
    function openDoc(key) {
      const d = DOCS[key]; if (!d) return;
      $('auth-doc-title').textContent = d.title;
      $('auth-doc-body').innerHTML = d.html;
      docModal.classList.remove('hidden');
    }
    document.querySelectorAll('.auth-link[data-doc]').forEach(l => l.addEventListener('click', () => openDoc(l.dataset.doc)));
    $('auth-doc-close').addEventListener('click', () => docModal.classList.add('hidden'));
    docModal.addEventListener('click', (e) => { if (e.target === docModal) docModal.classList.add('hidden'); });

    /* ─────── Вход в приложение ─────── */
    function enterApp(msg) {
      screen.classList.add('auth-hidden');
      if (typeof window.showToast === 'function' && msg) {
        setTimeout(() => window.showToast('Love', msg), 350);
      }
    }
    function openAuth() {
      screen.classList.remove('auth-hidden');
      oauthStep.classList.remove('is-visible'); screen.classList.remove('oauth-active');
    }

    /* ─────── Эффект: частицы ─────── */
    const particles = $('auth-particles');
    if (particles && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const heart = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
      for (let i = 0; i < 14; i++) {
        const p = document.createElement('span');
        p.className = 'auth-particle';
        const size = 6 + Math.random() * 12;
        p.style.left = (Math.random() * 100) + '%';
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        p.style.animationDuration = (14 + Math.random() * 16) + 's';
        p.style.animationDelay = (-Math.random() * 20) + 's';
        p.style.opacity = (0.1 + Math.random() * 0.25).toFixed(2);
        p.innerHTML = Math.random() > 0.5 ? heart : '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>';
        particles.appendChild(p);
      }
    }

    /* ─────── Эффект: 3D-наклон карточки за курсором ─────── */
    const card = $('auth-card');
    if (card && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      screen.addEventListener('mousemove', (e) => {
        if (window.innerWidth < 700) return;
        const r = card.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        let dx = (e.clientX - cx) / (r.width / 2);
        let dy = (e.clientY - cy) / (r.height / 2);
        // Кламп, чтобы при уводе курсора далеко карточка не вращалась за пределы
        dx = Math.max(-1, Math.min(1, dx));
        dy = Math.max(-1, Math.min(1, dy));
        const max = 5;
        card.style.transform = 'rotateY(' + (dx * max).toFixed(2) + 'deg) rotateX(' + (-dy * max).toFixed(2) + 'deg)';
      });
      screen.addEventListener('mouseleave', () => { card.style.transform = ''; });
    }

    /* ─────── Онбординг: intro + Spotlight ─────── */
    const ONBOARD_KEY = 'love_onboarding_done';
    function onboardingDone() { try { return localStorage.getItem(ONBOARD_KEY) === '1'; } catch (e) { return false; } }
    function markOnboarding() { try { localStorage.setItem(ONBOARD_KEY, '1'); } catch (e) {} }

    function afterAuth(isNew, msg) {
      if (isNew && !onboardingDone()) startOnboardingIntro();
      else enterApp(msg);
    }

    function ensureOnboardingStage() {
      let stage = document.getElementById('onboarding-stage');
      if (stage) return stage;
      stage = document.createElement('div');
      stage.id = 'onboarding-stage';
      stage.className = 'onboarding-stage hidden';
      stage.innerHTML = `
        <div class="onboarding-stage-heart" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </div>
        <div class="onboarding-stage-text"></div>
        <button type="button" class="onboarding-stage-skip">Пропустить обучение</button>
      `;
      document.body.appendChild(stage);
      return stage;
    }

    function startOnboardingIntro() {
      const stage = ensureOnboardingStage();
      const text = stage.querySelector('.onboarding-stage-text');
      const skip = stage.querySelector('.onboarding-stage-skip');
      let done = false;
      screen.classList.add('auth-hidden');
      document.body.classList.add('onboarding-stage-active');
      text.textContent = 'Давайте пройдем небольшое обучение';
      stage.className = 'onboarding-stage onboarding-intro';
      skip.style.display = '';

      const go = () => {
        if (done) return;
        done = true;
        stage.classList.add('is-leaving');
        setTimeout(() => {
          stage.className = 'onboarding-stage hidden';
          document.body.classList.remove('onboarding-stage-active');
          enterApp('');
          startSpotlightOnboarding({ force: true });
        }, 420);
      };
      const skipIntro = () => {
        if (done) return;
        done = true;
        markOnboarding();
        stage.classList.add('is-leaving');
        setTimeout(() => showFinalWelcome(), 420);
      };

      skip.onclick = skipIntro;
      setTimeout(go, 1800);
    }

    function showFinalWelcome() {
      const stage = ensureOnboardingStage();
      const text = stage.querySelector('.onboarding-stage-text');
      const skip = stage.querySelector('.onboarding-stage-skip');
      skip.style.display = 'none';
      resetToMainScreen();
      document.body.classList.add('onboarding-stage-active');
      text.innerHTML = buildFinalWelcomeText('Добро Пожаловать в Love!');
      stage.className = 'onboarding-stage onboarding-final';
      enterApp('');
      setTimeout(() => {
        stage.classList.add('is-leaving');
        setTimeout(() => {
          stage.className = 'onboarding-stage hidden';
          document.body.classList.remove('onboarding-stage-active');
          resetToMainScreen();
        }, 700);
      }, 4300);
    }

    function buildFinalWelcomeText(value) {
      let index = 0;
      const escape = char => char.replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
      return value.split(' ').map(word => {
        const chars = word.split('').map(char => {
          const safeChar = escape(char);
          return `<span class="glow-char" style="--i:${index++}" data-char="${safeChar}">${safeChar}</span>`;
        }).join('');
        return `<span class="glow-word">${chars}</span>`;
      }).join('');
    }

    function resetToMainScreen() {
      const profileModal = document.getElementById('profile-modal');
      if (profileModal) profileModal.classList.add('hidden');
      const settingsPanel = document.getElementById('view-settings');
      if (settingsPanel) settingsPanel.classList.add('panel-hidden');
      const sidebar = document.querySelector('.global-sidebar');
      if (sidebar) sidebar.classList.remove('more-open');
      closeMobileDrawer();
      const logo = document.getElementById('logo-nav-chats');
      if (logo) logo.click();
    }

    const DESKTOP_SPOTLIGHT_STEPS = [
      { target: '#logo-nav-chats', title: 'Навигация', text: 'Сердце всегда возвращает к личным чатам. Нажмите на него, чтобы продолжить.', action: 'click', before: closeMobileMore },
      { target: '#conversations-container .conversation-item, #conversations-container', title: 'Чаты', text: 'Здесь список диалогов. Справа остается текущая переписка и поле ввода.', action: 'next', before: () => { closeMobileMore(); clickIfVisible('#logo-nav-chats'); } },
      { target: '#nav-servers', title: 'Сферы и комнаты', text: 'Здесь общие пространства: комнаты, серверы, текстовые и голосовые каналы. Нажмите кнопку.', action: 'click', before: closeMobileMore },
      { target: '#spaces-accordion-container .space-card, #spaces-accordion-container', title: 'Пространства', text: 'Сферы раскрываются как аккордеон, а комнаты открываются сразу.', action: 'next', before: () => clickIfVisible('#nav-servers') },
      { target: '#quick-voice-lounge', title: 'Voice', text: 'Быстрый войс переносит в голосовую сцену. Нажмите подсвеченную кнопку.', action: 'click', before: closeMobileMore },
      { target: '#server-voice-panel .voice-footer-bar, #voice-channel-container, #server-voice-panel', title: 'Голосовая сцена', text: 'Участники, mute-состояния, камера и демонстрация собираются в один живой экран.', action: 'next', before: () => clickIfVisible('#quick-voice-lounge') },
      { target: '#nav-friends', title: 'Друзья', text: 'Раздел друзей помогает быстро перейти к контактам, звонкам и личным сообщениям.', action: 'click', before: closeMobileMore },
      { target: '#nav-hub', title: 'Love Hub', text: 'Здесь обновления, идеи сообщества и обратная связь по развитию Love.', action: 'click', before: closeMobileMore },
      { target: '#nav-settings', title: 'Настройки', text: 'Профиль, звук, приватность, внешний вид и служебные разделы живут здесь.', action: 'click', before: closeMobileMore },
      { target: '#nav-profile-btn', title: 'Профиль', text: 'Аватар открывает вашу витрину: настроение, музыка, хобби и быстрые настройки.', action: 'click', before: () => { closeMobileMore(); clickIfVisible('#logo-nav-chats'); } }
    ];

    const MOBILE_SPOTLIGHT_STEPS = [
      { target: '#logo-nav-chats', title: 'Нижняя навигация', text: 'Сердце возвращает к личным чатам. Нажмите на него, чтобы продолжить.', action: 'click', before: () => { closeMobileMore(); closeMobileDrawer(); } },
      { target: '#view-chats .chat-area > .sidebar-toggle-trigger', title: 'Панели разделов', text: 'На телефоне эта стрелка открывает список чатов, сфер и других боковых панелей. Нажмите ее.', action: 'click', before: () => { clickIfVisible('#logo-nav-chats'); closeMobileMore(); closeMobileDrawer(); } },
      { target: '#conversations-container .conversation-item, #conversations-container .empty-state, #conversations-container', title: 'Чаты', text: 'Здесь ваши личные диалоги. Если список пустой, отсюда удобно перейти к добавлению друзей.', action: 'next', before: openMobileDrawer },
      { target: '#nav-servers', title: 'Сферы', text: 'Кнопка сфер открывает комнаты, серверы, текстовые и голосовые каналы. Нажмите ее.', action: 'click', before: () => { closeMobileMore(); closeMobileDrawer(); } },
      { target: '#view-servers #sidebar-drawer-toggle', title: 'Список сфер', text: 'После перехода стрелка открывает список сфер и комнат. Нажмите ее.', action: 'click', before: closeMobileDrawer },
      { target: '#spaces-accordion-container .space-card, #spaces-accordion-container .empty-state, #spaces-accordion-container', title: 'Комнаты и серверы', text: 'Сферы раскрываются как аккордеон, а комнаты открываются сразу.', action: 'next', before: openMobileDrawer },
      { target: '.space-card[data-id="music-lounge"] .channel-item[data-type="voice"], .channel-item[data-type="voice"]', title: 'Voice', text: 'Голосовые комнаты живут внутри сфер. Нажмите подсвеченный голосовой канал.', action: 'click', before: prepareMobileVoiceStep },
      { target: '#server-voice-panel .voice-footer-bar, #voice-channel-container, #server-voice-panel', title: 'Голосовая сцена', text: 'Здесь управление микрофоном, камерой, звуком и демонстрацией.', action: 'next', before: closeMobileDrawer },
      { target: '#nav-friends', title: 'Друзья', text: 'Раздел друзей помогает быстро перейти к контактам, звонкам и личным сообщениям. Нажмите кнопку.', action: 'click', before: () => { closeMobileMore(); closeMobileDrawer(); } },
      { target: '#mobile-more-trigger', title: 'Еще', text: 'На телефоне Love Hub, настройки и профиль спрятаны в меню More. Нажмите кнопку.', action: 'click', before: () => { closeMobileDrawer(); closeMobileMore(); } },
      { target: '#nav-hub', title: 'Love Hub', text: 'Здесь обновления, идеи сообщества и обратная связь по развитию Love. Нажмите кнопку.', action: 'click', before: openMobileMore },
      { target: '#mobile-more-trigger', title: 'Еще раз', text: 'Откройте More еще раз, чтобы перейти к настройкам.', action: 'click', before: () => { closeMobileDrawer(); closeMobileMore(); } },
      { target: '#nav-settings', title: 'Настройки', text: 'Профиль, звук, приватность, внешний вид и служебные разделы живут здесь. Нажмите кнопку.', action: 'click', before: openMobileMore },
      { target: '#mobile-more-trigger', title: 'Профиль рядом', text: 'Откройте More последний раз, чтобы показать кнопку профиля.', action: 'click', before: () => { closeMobileDrawer(); closeMobileMore(); } },
      { target: '#nav-profile-btn', title: 'Профиль', text: 'Аватар открывает вашу витрину: настроение, музыка, хобби и быстрые настройки. Нажмите его.', action: 'click', before: openMobileMore }
    ];

    let spotlightState = null;

    function isMobileSpotlight() {
      return window.matchMedia('(max-width: 768px)').matches;
    }

    function getSpotlightSteps() {
      return isMobileSpotlight() ? MOBILE_SPOTLIGHT_STEPS : DESKTOP_SPOTLIGHT_STEPS;
    }

    function clickIfVisible(selector) {
      const el = document.querySelector(selector);
      if (el && isSpotlightTargetUsable(el)) el.click();
    }

    function openMobileDrawer() {
      if (!isMobileSpotlight()) return;
      const app = document.querySelector('.app-container');
      if (app) app.classList.remove('sidebar-collapsed');
    }

    function closeMobileDrawer() {
      if (!isMobileSpotlight()) return;
      const app = document.querySelector('.app-container');
      if (app) app.classList.add('sidebar-collapsed');
    }

    function openMobileMore() {
      const sidebar = document.querySelector('.global-sidebar');
      if (sidebar) sidebar.classList.add('more-open');
    }

    function closeMobileMore() {
      const sidebar = document.querySelector('.global-sidebar');
      if (sidebar) sidebar.classList.remove('more-open');
    }

    function prepareMobileVoiceStep() {
      if (!isMobileSpotlight()) return;
      openMobileDrawer();
      const card = document.querySelector('.space-card[data-id="music-lounge"]') || document.querySelector('.space-card:not([data-kind="room"])');
      if (card) {
        card.classList.add('expanded');
        card.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      }
    }

    function isSpotlightTargetUsable(el) {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    }

    function findSpotlightTarget(selector) {
      return selector.split(',').map(part => document.querySelector(part.trim())).find(el => el && isSpotlightTargetUsable(el)) || null;
    }

    function ensureSpotlight() {
      if (spotlightState) return spotlightState;
      const root = document.createElement('div');
      root.className = 'spotlight-onboarding hidden';
      root.innerHTML = `
        <div class="spotlight-scrim spotlight-scrim-top"></div>
        <div class="spotlight-scrim spotlight-scrim-right"></div>
        <div class="spotlight-scrim spotlight-scrim-bottom"></div>
        <div class="spotlight-scrim spotlight-scrim-left"></div>
        <div class="spotlight-ring" aria-hidden="true"></div>
        <section class="spotlight-card" role="dialog" aria-live="polite" aria-label="Обучение Love">
          <div class="spotlight-progress"><span></span></div>
          <div class="spotlight-count"></div>
          <h2 class="spotlight-title"></h2>
          <p class="spotlight-text"></p>
          <div class="spotlight-actions">
            <button type="button" class="spotlight-skip">Пропустить</button>
            <button type="button" class="spotlight-next">Далее</button>
          </div>
        </section>
      `;
      document.body.appendChild(root);
      spotlightState = {
        root,
        index: 0,
        steps: [],
        target: null,
        targetHandler: null,
        ring: root.querySelector('.spotlight-ring'),
        card: root.querySelector('.spotlight-card'),
        progress: root.querySelector('.spotlight-progress span'),
        count: root.querySelector('.spotlight-count'),
        title: root.querySelector('.spotlight-title'),
        text: root.querySelector('.spotlight-text'),
        next: root.querySelector('.spotlight-next'),
        skip: root.querySelector('.spotlight-skip'),
        scrims: {
          top: root.querySelector('.spotlight-scrim-top'),
          right: root.querySelector('.spotlight-scrim-right'),
          bottom: root.querySelector('.spotlight-scrim-bottom'),
          left: root.querySelector('.spotlight-scrim-left')
        }
      };
      spotlightState.next.addEventListener('click', nextSpotlightStep);
      spotlightState.skip.addEventListener('click', () => finishSpotlight(true));
      return spotlightState;
    }

    function startSpotlightOnboarding(options = {}) {
      if (!options.force && onboardingDone()) return;
      const state = ensureSpotlight();
      state.steps = getSpotlightSteps();
      state.index = 0;
      document.body.classList.add('spotlight-active');
      state.root.classList.remove('hidden');
      state.root.classList.toggle('is-mobile', isMobileSpotlight());
      window.addEventListener('resize', updateSpotlightLayout);
      window.addEventListener('scroll', updateSpotlightLayout, true);
      showSpotlightStep(0);
    }

    function showSpotlightStep(index) {
      const state = ensureSpotlight();
      cleanupSpotlightTarget();
      const steps = state.steps && state.steps.length ? state.steps : getSpotlightSteps();
      state.steps = steps;
      state.index = Math.max(0, Math.min(index, steps.length - 1));
      const step = steps[state.index];
      if (typeof step.before === 'function') step.before();
      setTimeout(() => {
        const target = findSpotlightTarget(step.target);
        if (!target) return nextSpotlightStep();
        state.target = target;
        target.classList.add('spotlight-target-active');
        state.title.textContent = step.title;
        state.text.textContent = step.text;
        state.count.textContent = `${state.index + 1} / ${steps.length}`;
        state.progress.style.width = `${((state.index + 1) / steps.length) * 100}%`;
        state.next.textContent = state.index === steps.length - 1 ? 'Готово' : 'Далее';
        state.next.style.display = step.action === 'click' ? 'none' : '';
        if (step.action === 'click') {
          state.targetHandler = () => setTimeout(nextSpotlightStep, 180);
          target.addEventListener('click', state.targetHandler, { once: true });
        }
        updateSpotlightLayout();
      }, 120);
    }

    function cleanupSpotlightTarget() {
      const state = spotlightState;
      if (!state || !state.target) return;
      if (state.targetHandler) state.target.removeEventListener('click', state.targetHandler);
      state.target.classList.remove('spotlight-target-active');
      state.target = null;
      state.targetHandler = null;
    }

    function updateSpotlightLayout() {
      const state = spotlightState;
      if (!state || !state.target) return;
      const rect = getSpotlightRect(state.target);
      const pad = Math.max(10, Math.min(18, window.innerWidth * 0.025));
      const left = Math.max(8, rect.left - pad);
      const top = Math.max(8, rect.top - pad);
      const right = Math.min(window.innerWidth - 8, rect.right + pad);
      const bottom = Math.min(window.innerHeight - 8, rect.bottom + pad);
      const width = Math.max(1, right - left);
      const height = Math.max(1, bottom - top);

      Object.assign(state.scrims.top.style, { left: '0px', top: '0px', width: '100vw', height: `${top}px` });
      Object.assign(state.scrims.bottom.style, { left: '0px', top: `${bottom}px`, width: '100vw', height: `${Math.max(0, window.innerHeight - bottom)}px` });
      Object.assign(state.scrims.left.style, { left: '0px', top: `${top}px`, width: `${left}px`, height: `${height}px` });
      Object.assign(state.scrims.right.style, { left: `${right}px`, top: `${top}px`, width: `${Math.max(0, window.innerWidth - right)}px`, height: `${height}px` });
      Object.assign(state.ring.style, {
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        borderRadius: Math.abs(width - height) < 10 && width <= 96 ? '50%' : '16px'
      });

      const isMobile = isMobileSpotlight();
      const cardWidth = Math.min(340, window.innerWidth - (isMobile ? 24 : 28));
      state.card.style.width = `${cardWidth}px`;
      const cardRect = state.card.getBoundingClientRect();
      let cardLeft = right + 18;
      let cardTop = top + height / 2 - cardRect.height / 2;
      if (cardLeft + cardWidth > window.innerWidth - 14) cardLeft = left - cardWidth - 18;
      if (cardLeft < 14) cardLeft = Math.max(14, Math.min(window.innerWidth - cardWidth - 14, left));
      if (isMobile) {
        const safeTop = 12;
        const safeBottom = window.innerHeight - 76;
        cardLeft = 12;
        cardTop = bottom + 12;
        if (cardTop + cardRect.height > safeBottom) cardTop = top - cardRect.height - 12;
        if (cardTop < safeTop) cardTop = Math.max(safeTop, Math.min(safeBottom - cardRect.height, window.innerHeight * 0.5 - cardRect.height * 0.5));
      }
      const maxCardTop = (isMobile ? window.innerHeight - 76 : window.innerHeight - 14) - cardRect.height;
      cardTop = Math.max(isMobile ? 12 : 14, Math.min(maxCardTop, cardTop));
      state.card.style.left = `${cardLeft}px`;
      state.card.style.top = `${cardTop}px`;
    }

    function getSpotlightRect(target) {
      const rect = target.getBoundingClientRect();
      const mobile = isMobileSpotlight();
      const hugeTarget = rect.height > window.innerHeight * (mobile ? 0.34 : 0.52) || rect.width > window.innerWidth * 0.9;
      const isContainer = target.matches('#conversations-container, #spaces-accordion-container, #server-voice-panel, #voice-channel-container, .voice-channel-panel');
      if (!hugeTarget && !isContainer) return rect;

      const maxWidth = Math.min(rect.width, mobile ? window.innerWidth - 38 : 460);
      const maxHeight = Math.min(rect.height, mobile ? 154 : 240);
      const left = rect.left + Math.max(0, (rect.width - maxWidth) / 2);
      const top = Math.max(12, Math.min(rect.top + 18, window.innerHeight - maxHeight - (mobile ? 88 : 18)));
      return {
        left,
        top,
        right: left + maxWidth,
        bottom: top + maxHeight,
        width: maxWidth,
        height: maxHeight
      };
    }

    function nextSpotlightStep() {
      const state = spotlightState;
      if (!state) return;
      const steps = state.steps && state.steps.length ? state.steps : getSpotlightSteps();
      if (state.index >= steps.length - 1) return finishSpotlight(false);
      showSpotlightStep(state.index + 1);
    }

    function finishSpotlight(skipped) {
      cleanupSpotlightTarget();
      markOnboarding();
      if (spotlightState) spotlightState.root.classList.add('hidden');
      document.body.classList.remove('spotlight-active');
      document.body.classList.remove('onboarding-stage-active');
      window.removeEventListener('resize', updateSpotlightLayout);
      window.removeEventListener('scroll', updateSpotlightLayout, true);
      resetToMainScreen();
      showFinalWelcome();
    }

    /* ─────── Тест-панель ─────── */
    const tp = $('auth-test-panel');
    if (tp) {
      $('auth-test-collapse').addEventListener('click', () => tp.classList.toggle('collapsed'));
      tp.querySelectorAll('.auth-test-btn').forEach(b => {
        b.addEventListener('click', () => {
          const a = b.dataset.test;
          if (a === 'open') openAuth();
          else if (a === 'login') { openAuth(); setTab('login'); }
          else if (a === 'register') { openAuth(); setTab('register'); }
          else if (a === 'oauth') { openAuth(); startOAuth(); }
          else if (a === 'welcome') { startOnboardingIntro(); }
          else if (a === 'guide') { screen.classList.add('auth-hidden'); enterApp(''); setTimeout(() => startSpotlightOnboarding({ force: true }), 180); }
          else if (a === 'reset-onboard') { try { localStorage.removeItem(ONBOARD_KEY); } catch (e) {} if (typeof window.showToast === 'function') window.showToast('Онбординг', 'Флаг сброшен — приветствие покажется снова.'); }
          else if (a === 'enter') enterApp('');
        });
      });
    }

    // Доступ снаружи (на будущее)
    window.LoveAuth = { open: openAuth, enter: enterApp, setTab: setTab, startOnboarding: () => startSpotlightOnboarding({ force: true }) };
  }
})();
