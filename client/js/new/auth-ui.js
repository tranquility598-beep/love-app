/* ════════════════════════════════════════════════════════════════
   LOVE — Реальный контроллер экрана авторизации.
   Связывает дизайн-систему Wabi-Sabi с AuthAPI бэкенда.
   ════════════════════════════════════════════════════════════════ */

(function () {
  // Инициализация кастомного тайтлбара для Electron
  if (window.electronAPI) {
    const initTitlebar = () => {
      document.body.classList.add('is-electron');
      
      const platform = window.electronAPI.platform;
      if (platform === 'darwin') {
        document.body.classList.add('platform-macos');
      } else {
        document.body.classList.add('platform-windows');
      }
      
      // Навешиваем обработчики на кнопки macOS
      const macClose = document.getElementById('mac-close');
      const macMin = document.getElementById('mac-minimize');
      const macMax = document.getElementById('mac-maximize');
      
      if (macClose) macClose.addEventListener('click', () => window.electronAPI.closeWindow());
      if (macMin) macMin.addEventListener('click', () => window.electronAPI.minimizeWindow());
      if (macMax) macMax.addEventListener('click', () => window.electronAPI.maximizeWindow());
      
      // Навешиваем обработчики на кнопки Windows
      const winClose = document.getElementById('win-close');
      const winMin = document.getElementById('win-minimize');
      const winMax = document.getElementById('win-maximize');
      
      if (winClose) winClose.addEventListener('click', () => window.electronAPI.closeWindow());
      if (winMin) winMin.addEventListener('click', () => window.electronAPI.minimizeWindow());
      if (winMax) winMax.addEventListener('click', () => window.electronAPI.maximizeWindow());
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initTitlebar);
    } else {
      initTitlebar();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
  } else {
    initAuth();
  }

  /* ───────────── SVG-иконки статусов ───────────── */
  const ICON_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  const ICON_CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
  const ICON_SPIN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg>';

  async function initAuth() {
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
          if (s.includes(seq.slice(i, i + 5))) return true;
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
        return { ok: false, level: 'weak', msg: 'Пароль слишком слабый — избегайте простых комбинаций' };
      }
      let classes = 0;
      if (/[a-z]/.test(pw)) classes++;
      if (/[A-Z]/.test(pw)) classes++;
      if (/[0-9]/.test(pw)) classes++;
      if (/[^a-zA-Z0-9]/.test(pw)) classes++;
      if (pw.length >= 10 && classes >= 3) return { ok: true, level: 'strong', msg: 'Надёжный пароль' };
      return { ok: true, level: 'medium', msg: 'Пароль подходит' };
    }

    /* ─────── Переключатель форм ─────── */
    const sw = $('auth-switch');
    const formLogin = $('auth-form-login');
    const formRegister = $('auth-form-register');
    const formOtp = $('auth-form-otp');
    const formForgot = $('auth-form-forgot');
    const formReset = $('auth-form-reset');

    function showForm(formId) {
      [formLogin, formRegister, formOtp, formForgot, formReset].forEach(f => {
        if (!f) return;
        f.classList.remove('active');
        f.style.display = 'none';
      });

      const target = $(formId);
      if (target) {
        target.classList.add('active');
        target.style.display = 'block';
      }

      if (sw) {
        if (formId === 'auth-form-login' || formId === 'auth-form-register') {
          sw.style.display = 'flex';
          const isReg = formId === 'auth-form-register';
          sw.classList.toggle('is-register', isReg);
          sw.querySelectorAll('.auth-switch-btn').forEach(b => b.classList.toggle('active', isReg ? b.dataset.authTab === 'register' : b.dataset.authTab === 'login'));
        } else {
          sw.style.display = 'none';
        }
      }
    }

    if (sw) {
      sw.querySelectorAll('.auth-switch-btn').forEach(b => {
        b.addEventListener('click', () => {
          showForm(b.dataset.authTab === 'register' ? 'auth-form-register' : 'auth-form-login');
        });
      });
    }

    /* Навигация "Назад" во всех формах */
    document.querySelectorAll('.go-to-login').forEach(btn => {
      btn.addEventListener('click', () => showForm('auth-form-login'));
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

    /* ─────── Форма Регистрации (Валидация + Сабмит) ─────── */
    const reg = { email: false, username: false, password: false, terms: false };
    const regSubmit = $('register-submit');
    const regEmail = $('reg-email');
    const regEmailStatus = $('reg-email-status');
    const regEmailHint = $('reg-email-hint');
    const regUser = $('reg-username');
    const regUserStatus = $('reg-username-status');
    const regUserHint = $('reg-username-hint');
    const regPass = $('reg-password');
    const regPassHint = $('reg-password-hint');
    const regStrength = $('reg-strength-fill');
    const regTerms = $('reg-terms');

    function refreshRegSubmit() {
      if (regSubmit) {
        regSubmit.disabled = !(reg.email && reg.username && reg.password && reg.terms);
      }
    }

    if (regEmail) {
      regEmail.addEventListener('input', () => {
        const v = regEmail.value.trim();
        if (!v) { reg.email = false; setStatus(regEmailStatus, ''); setWrap(regEmail, ''); setHint(regEmailHint, ''); return refreshRegSubmit(); }
        if (!validEmail(v)) { reg.email = false; setStatus(regEmailStatus, 'error'); setWrap(regEmail, 'error'); setHint(regEmailHint, 'Некорректный адрес почты', 'error'); return refreshRegSubmit(); }
        reg.email = true; setStatus(regEmailStatus, 'ok'); setWrap(regEmail, 'ok'); setHint(regEmailHint, 'Почта корректна', 'ok'); refreshRegSubmit();
      });
    }

    let userTimer = null;
    if (regUser) {
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
        userTimer = setTimeout(async () => {
          try {
            const result = await UsersAPI.search(v);
            const users = Array.isArray(result) ? result : (result.users || []);
            const taken = users.some(u => u.username && u.username.toLowerCase() === v.toLowerCase());
            if (taken) {
              reg.username = false; setStatus(regUserStatus, 'error'); setWrap(regUser, 'error');
              setHint(regUserHint, 'Это имя уже занято', 'error');
            } else {
              reg.username = true; setStatus(regUserStatus, 'ok'); setWrap(regUser, 'ok');
              setHint(regUserHint, 'Имя свободно', 'ok');
            }
          } catch (e) {
            reg.username = true; setStatus(regUserStatus, 'ok'); setWrap(regUser, 'ok');
            setHint(regUserHint, 'Имя доступно', 'ok');
          }
          refreshRegSubmit();
        }, 600);
      });
    }

    if (regPass) {
      regPass.addEventListener('input', () => {
        const v = regPass.value;
        if (!v) { reg.password = false; if (regStrength) regStrength.style.width = '0%'; setWrap(regPass, ''); setHint(regPassHint, ''); return refreshRegSubmit(); }
        const res = checkPassword(v);
        reg.password = res.ok;
        if (regStrength) {
          regStrength.style.width = res.level === 'strong' ? '100%' : res.level === 'medium' ? '60%' : '30%';
          regStrength.style.background = res.level === 'strong' ? '#ffffff' : res.level === 'medium' ? '#888888' : '#333333';
        }
        setWrap(regPass, res.ok ? 'ok' : 'error');
        setHint(regPassHint, res.msg, res.ok ? 'ok' : 'error');
        refreshRegSubmit();
      });
    }

    if (regTerms) {
      regTerms.addEventListener('change', () => { reg.terms = regTerms.checked; refreshRegSubmit(); });
    }

    if (formRegister) {
      formRegister.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (regSubmit.disabled) return;

        const email = regEmail.value.trim();
        const username = regUser.value.trim();
        const password = regPass.value;

        try {
          regSubmit.disabled = true;
          regSubmit.textContent = 'Создание...';
          setHint(regEmailHint, 'Регистрация на сервере...', 'loading');

          const data = await AuthAPI.register(username, email, password);
          if (data.requireVerification) {
            window.lastAuthEmail = email;
            window.otpType = 'verification';
            showOtpForm(email, 'verification');
          }
        } catch (err) {
          console.error(err);
          setWrap(regEmail, 'error');
          setHint(regEmailHint, err.message || 'Ошибка регистрации', 'error');
        } finally {
          regSubmit.disabled = false;
          regSubmit.textContent = 'Создать аккаунт';
        }
      });
    }

    /* ─────── Форма Входа (Валидация + Сабмит) ─────── */
    const loginEmail = $('login-email');
    const loginPass = $('login-password');
    const loginEmailHint = $('login-email-hint');
    const loginPassHint = $('login-password-hint');
    const loginSubmit = $('login-submit');

    if (formLogin) {
      formLogin.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginEmail.value.trim();
        const password = loginPass.value;

        if (!email || !password) {
          if (!email) setWrap(loginEmail, 'error');
          if (!password) setWrap(loginPass, 'error');
          setHint(loginEmailHint, 'Заполните все поля', 'error');
          return;
        }

        try {
          loginSubmit.disabled = true;
          loginSubmit.textContent = 'Вход...';
          setHint(loginEmailHint, 'Выполняем вход...', '');

          const data = await AuthAPI.login(email, password);

          if (data.requireTwoFactor) {
            window.pendingTwoFactorToken = data.pendingToken;
            window.lastAuthEmail = email;
            window.otpType = 'login';
            showOtpForm(email, 'login');
            return;
          }

          await storeAuthToken(data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          window.currentUser = data.user;

          afterAuth(false, 'С возвращением!');
        } catch (err) {
          console.error(err);
          if (err.status === 403 && err.data && err.data.requireVerification) {
            window.lastAuthEmail = email;
            window.otpType = 'verification';
            showOtpForm(email, 'verification');
          } else {
            setWrap(loginEmail, 'error');
            setWrap(loginPass, 'error');
            setHint(loginEmailHint, err.message || 'Неверный email или пароль', 'error');
          }
        } finally {
          loginSubmit.disabled = false;
          loginSubmit.textContent = 'Войти';
        }
      });

      [loginEmail, loginPass].forEach(el => el && el.addEventListener('input', () => {
        setWrap(el, ''); setHint(loginEmailHint, '', '');
      }));
    }

    /* ─────── Восстановление пароля (Запрос кода) ─────── */
    const forgotEmail = $('forgot-email');
    const forgotError = $('forgot-error');
    const forgotSuccess = $('forgot-success');
    const forgotSubmit = $('forgot-submit');

    if ($('go-to-forgot')) {
      $('go-to-forgot').addEventListener('click', () => showForm('auth-form-forgot'));
    }

    if (formForgot) {
      formForgot.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = forgotEmail.value.trim();
        if (!email || !validEmail(email)) {
          setWrap(forgotEmail, 'error');
          forgotError.textContent = 'Введите корректную почту';
          forgotError.classList.remove('hidden');
          return;
        }

        try {
          forgotSubmit.disabled = true;
          forgotSubmit.textContent = 'Отправка...';
          forgotError.classList.add('hidden');
          forgotSuccess.classList.add('hidden');

          await AuthAPI.forgotPassword(email);
          window.lastAuthEmail = email;
          forgotSuccess.textContent = 'Код сброса отправлен на вашу почту!';
          forgotSuccess.classList.remove('hidden');

          setTimeout(() => showResetForm(email), 1200);
        } catch (err) {
          setWrap(forgotEmail, 'error');
          forgotError.textContent = err.message || 'Ошибка отправки кода';
          forgotError.classList.remove('hidden');
        } finally {
          forgotSubmit.disabled = false;
          forgotSubmit.textContent = 'Отправить код';
        }
      });

      if (forgotEmail) {
        forgotEmail.addEventListener('input', () => {
          setWrap(forgotEmail, '');
          forgotError.classList.add('hidden');
        });
      }
    }

    /* ─────── Сброс пароля (Ввод кода + Новый пароль) ─────── */
    const resetOtpDigits = document.querySelectorAll('#auth-form-reset .reset-otp-digit');
    const resetPass = $('reset-password');
    const resetPassHint = $('reset-password-hint');
    const resetError = $('reset-error');
    const resetSubmit = $('reset-submit');

    resetOtpDigits.forEach((input, index) => {
      input.addEventListener('input', () => {
        if (input.value.length === 1 && index < 5) {
          resetOtpDigits[index + 1].focus();
        }
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && index > 0) {
          resetOtpDigits[index - 1].focus();
        }
      });
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedData = (e.clipboardData || window.clipboardData).getData('text');
        const digits = pastedData.replace(/\D/g, '').slice(0, 6);
        for (let i = 0; i < digits.length; i++) {
          if (resetOtpDigits[i]) resetOtpDigits[i].value = digits[i];
        }
        const focusIndex = Math.min(digits.length, 5);
        if (resetOtpDigits[focusIndex]) resetOtpDigits[focusIndex].focus();
      });
    });

    if (formReset) {
      formReset.addEventListener('submit', async (e) => {
        e.preventDefault();
        let code = '';
        resetOtpDigits.forEach(input => code += input.value);
        const newPassword = resetPass.value;

        if (code.length < 6 || !newPassword) {
          resetError.textContent = 'Заполните все поля';
          resetError.classList.remove('hidden');
          return;
        }

        const passRes = checkPassword(newPassword);
        if (!passRes.ok) {
          setWrap(resetPass, 'error');
          setHint(resetPassHint, passRes.msg, 'error');
          return;
        }

        try {
          resetSubmit.disabled = true;
          resetSubmit.textContent = 'Сброс...';
          resetError.classList.add('hidden');

          await AuthAPI.resetPassword(window.lastAuthEmail, code, newPassword);

          if (typeof window.showToast === 'function') {
            window.showToast('Пароль сброшен', 'Используйте новый пароль для входа');
          }
          showForm('auth-form-login');
        } catch (err) {
          resetError.textContent = err.message || 'Неверный код сброса или ошибка';
          resetError.classList.remove('hidden');
        } finally {
          resetSubmit.disabled = false;
          resetSubmit.textContent = 'Сбросить пароль';
        }
      });
    }

    /* ─────── Верификация OTP / 2FA (Ввод кода) ─────── */
    const otpDigits = document.querySelectorAll('#auth-form-otp .otp-digit');
    const otpError = $('otp-error');
    const otpSubmit = $('otp-submit');
    const resendLink = $('resend-link');

    otpDigits.forEach((input, index) => {
      input.addEventListener('input', () => {
        if (input.value.length === 1 && index < 5) {
          otpDigits[index + 1].focus();
        }
        checkOtpSubmitEnable();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && index > 0) {
          otpDigits[index - 1].focus();
        }
      });
      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pastedData = (e.clipboardData || window.clipboardData).getData('text');
        const digits = pastedData.replace(/\D/g, '').slice(0, 6);
        for (let i = 0; i < digits.length; i++) {
          if (otpDigits[i]) otpDigits[i].value = digits[i];
        }
        const focusIndex = Math.min(digits.length, 5);
        if (otpDigits[focusIndex]) otpDigits[focusIndex].focus();
        checkOtpSubmitEnable();
      });
    });

    function checkOtpSubmitEnable() {
      let code = '';
      otpDigits.forEach(input => code += input.value);
      if (otpSubmit) {
        otpSubmit.disabled = code.length < 6;
      }
    }

    if (formOtp) {
      formOtp.addEventListener('submit', async (e) => {
        e.preventDefault();
        let code = '';
        otpDigits.forEach(input => code += input.value);
        if (code.length < 6) return;

        try {
          otpSubmit.disabled = true;
          otpSubmit.textContent = 'Проверка...';
          otpError.classList.add('hidden');

          const shouldStartOnboarding = window.otpType !== 'login';
          const data = window.otpType === 'login'
            ? await AuthAPI.verifyTwoFactor(window.pendingTwoFactorToken, code)
            : await AuthAPI.verifyOtp(window.lastAuthEmail, code);

          window.pendingTwoFactorToken = null;
          await storeAuthToken(data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          window.currentUser = data.user;

          afterAuth(shouldStartOnboarding, 'Вход выполнен успешно');
        } catch (err) {
          console.error(err);
          otpError.textContent = err.message || 'Неверный код';
          otpError.classList.remove('hidden');

          const container = document.querySelector('#auth-form-otp .otp-input-container');
          if (container) {
            container.classList.add('shake');
            setTimeout(() => container.classList.remove('shake'), 500);
          }
        } finally {
          otpSubmit.disabled = false;
          otpSubmit.textContent = 'Подтвердить';
        }
      });
    }

    let resendTimer = null;
    function startResendTimer() {
      clearInterval(resendTimer);
      let count = 60;
      const counterEl = $('resend-counter');
      const timerText = $('resend-timer-text');
      if (timerText) timerText.classList.remove('hidden');
      if (resendLink) resendLink.classList.add('hidden');
      if (counterEl) counterEl.textContent = count;

      resendTimer = setInterval(() => {
        count--;
        if (counterEl) counterEl.textContent = count;
        if (count <= 0) {
          clearInterval(resendTimer);
          if (timerText) timerText.classList.add('hidden');
          if (resendLink) resendLink.classList.remove('hidden');
        }
      }, 1000);
    }

    if (resendLink) {
      resendLink.addEventListener('click', async () => {
        try {
          if (window.otpType === 'login') {
            otpError.textContent = 'Для получения нового кода повторите вход';
            otpError.classList.remove('hidden');
            return;
          }
          await AuthAPI.resendOtp(window.lastAuthEmail);
          startResendTimer();
        } catch (err) {
          otpError.textContent = err.message || 'Ошибка отправки кода';
          otpError.classList.remove('hidden');
        }
      });
    }

    function showOtpForm(email, type) {
      showForm('auth-form-otp');
      const title = $('otp-title');
      const subtitle = $('otp-subtitle');
      if (title) title.textContent = type === 'login' ? 'Код входа' : 'Подтвердите почту';
      if (subtitle) subtitle.textContent = `Мы отправили код на почту ${email}`;
      otpDigits.forEach(input => input.value = '');
      checkOtpSubmitEnable();
      setTimeout(() => { if (otpDigits[0]) otpDigits[0].focus(); }, 100);
      startResendTimer();
    }

    function showResetForm(email) {
      showForm('auth-form-reset');
      const subtitle = $('reset-subtitle');
      if (subtitle) subtitle.textContent = `Код сброса отправлен на ${email}`;
      resetOtpDigits.forEach(input => input.value = '');
      resetPass.value = '';
      setTimeout(() => { if (resetOtpDigits[0]) resetOtpDigits[0].focus(); }, 100);
    }

    /* ─────── Google OAuth → шаг выбора username ─────── */
    const oauthStep = $('auth-oauth-step');
    const oauthUser = $('oauth-username');
    const oauthStatus = $('oauth-username-status');
    const oauthHint = $('oauth-username-hint');
    const oauthContinue = $('oauth-continue');

    function validateOAuthUser() {
      const v = oauthUser.value.trim();
      if (!validUsername(v)) { setStatus(oauthStatus, 'error'); setWrap(oauthUser, 'error'); setHint(oauthHint, '3–24 символа: латиница, цифры, _', 'error'); return false; }
      setStatus(oauthStatus, 'ok'); setWrap(oauthUser, 'ok'); setHint(oauthHint, 'Имя свободно', 'ok'); return true;
    }
    
    if (oauthUser) {
      oauthUser.addEventListener('input', validateOAuthUser);
    }

    function openGoogleAuth() {
      if (window.electronAPI && window.electronAPI.openGoogleLogin) {
        window.electronAPI.openGoogleLogin();
      } else {
        const baseUrl = window.BASE_URL || 'http://localhost:5555';
        const url = `${baseUrl}/api/auth/google`;
        window.open(url, 'Google Login', 'width=500,height=600');
      }
    }

    if ($('login-google')) $('login-google').addEventListener('click', openGoogleAuth);
    if ($('register-google')) $('register-google').addEventListener('click', openGoogleAuth);

    function maybeShowGoogleOnboarding() {
      const user = window.currentUser;
      if (user && user.hasGoogle && !user.hasPassword && !user.googleOnboardingComplete) {
        let suggested = 'newuser';
        const email = user.email || '';
        if (email.includes('@')) {
          suggested = email.split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24) || 'newuser';
        }
        oauthUser.value = suggested;
        validateOAuthUser();
        
        oauthStep.classList.add('is-visible');
        screen.classList.add('oauth-active');
        return true;
      }
      return false;
    }

    if (oauthContinue) {
      oauthContinue.addEventListener('click', async () => {
        if (!validateOAuthUser()) return;
        
        try {
          oauthContinue.disabled = true;
          oauthContinue.textContent = 'Сохранение...';
          
          const username = oauthUser.value.trim();
          const data = await AuthAPI.completeGoogleOnboarding({
            username,
            keepCurrent: false
          });
          
          window.currentUser = data.user;
          localStorage.setItem('user', JSON.stringify(data.user));
          
          oauthStep.classList.remove('is-visible');
          screen.classList.remove('oauth-active');
          
          afterAuth(true, 'Добро пожаловать в Love!');
        } catch (err) {
          console.error(err);
          setHint(oauthHint, err.message || 'Ошибка сохранения имени', 'error');
        } finally {
          oauthContinue.disabled = false;
          oauthContinue.textContent = 'Продолжить';
        }
      });
    }

    // Слушаем сообщения из попапа (для веб-версии)
    window.addEventListener('message', async (event) => {
      const baseUrl = window.BASE_URL || 'http://localhost:5555';
      if (event.origin !== baseUrl) return;
      
      if (event.data.type === 'google-auth-success' && event.data.token) {
        try {
          await storeAuthToken(event.data.token);
          const getMeData = await AuthAPI.getMe();
          window.currentUser = getMeData.user;
          localStorage.setItem('user', JSON.stringify(getMeData.user));
          
          const onboardingNeeded = maybeShowGoogleOnboarding();
          if (!onboardingNeeded) {
            afterAuth(false, 'Вход выполнен успешно через Google');
          }
        } catch (error) {
          console.error(error);
          setHint(loginEmailHint, 'Ошибка входа через Google', 'error');
        }
      }
    });

    // Слушаем события от Electron main process
    if (window.electronAPI && window.electronAPI.onGoogleAuthSuccess) {
      window.electronAPI.onGoogleAuthSuccess(async (token) => {
        try {
          await storeAuthToken(token);
          const getMeData = await AuthAPI.getMe();
          window.currentUser = getMeData.user;
          localStorage.setItem('user', JSON.stringify(getMeData.user));
          
          const onboardingNeeded = maybeShowGoogleOnboarding();
          if (!onboardingNeeded) {
            afterAuth(false, 'Вход выполнен успешно через Google');
          }
        } catch (error) {
          console.error(error);
          setHint(loginEmailHint, 'Ошибка входа через Google в Electron', 'error');
        }
      });
    }

    /* ─────── Вход в приложение ─────── */
    // Скрыть загрузочный экран (не раньше минимального времени показа, чтобы не мигал).
    const _splashStart = Date.now();
    function hideSplash() {
      const splash = document.getElementById('app-splash');
      if (!splash || splash.classList.contains('is-hiding')) return;
      const wait = Math.max(0, 600 - (Date.now() - _splashStart));
      setTimeout(() => {
        splash.classList.add('is-hiding');
        setTimeout(() => splash.remove(), 450);
      }, wait);
    }

    function enterApp(msg) {
      hideSplash();
      screen.classList.add('auth-hidden');
      if (typeof window.showToast === 'function' && msg) {
        setTimeout(() => window.showToast('Love', msg), 350);
      }
      if (typeof window.initApp === 'function') {
        window.initApp();
      }
    }
    function openAuth() {
      hideSplash();
      screen.classList.remove('auth-hidden');
      showForm('auth-form-login');
      if (oauthStep) oauthStep.classList.remove('is-visible');
      screen.classList.remove('oauth-active');
    }

    /* Экспорт в глобальную область для редиректа при 401 */
    window.showAuthScreen = openAuth;

    /* ─────── Проверка сессии при загрузке ─────── */
    async function checkExistingSession() {
      try {
        const getMeData = await AuthAPI.getMe();
        if (getMeData && getMeData.user) {
          window.currentUser = getMeData.user;
          localStorage.setItem('user', JSON.stringify(getMeData.user));
          afterAuth(false, 'Сессия восстановлена');
        }
      } catch (err) {
        console.log('Нет активной сессии:', err.message);
        // Показываем форму логина
        hideSplash();
        showForm('auth-form-login');
      }
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

    /* ─────── Эффект: 3D-наклон карточки за курсором (плавный, через rAF) ─────── */
    const card = $('auth-card');
    if (card && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const MAX = 6;       // максимальный угол наклона
      const EASE = 0.18;   // коэффициент сглаживания (lerp)
      let targetX = 0, targetY = 0;   // куда стремимся (по курсору)
      let curX = 0, curY = 0;         // текущее значение
      let active = false;             // курсор над экраном
      let rafId = null;

      function loop() {
        curX += (targetX - curX) * EASE;
        curY += (targetY - curY) * EASE;
        card.style.transform = 'rotateY(' + curX.toFixed(2) + 'deg) rotateX(' + curY.toFixed(2) + 'deg)';
        // Останавливаем цикл, когда почти доехали и курсор ушёл
        if (!active && Math.abs(targetX - curX) < 0.01 && Math.abs(targetY - curY) < 0.01) {
          card.style.transform = '';
          rafId = null;
          return;
        }
        rafId = requestAnimationFrame(loop);
      }
      function ensureLoop() { if (rafId === null) rafId = requestAnimationFrame(loop); }

      screen.addEventListener('mousemove', (e) => {
        if (window.innerWidth < 700) return;
        const r = card.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        let dx = (e.clientX - cx) / (r.width / 2);
        let dy = (e.clientY - cy) / (r.height / 2);
        dx = Math.max(-1, Math.min(1, dx));
        dy = Math.max(-1, Math.min(1, dy));
        targetX = dx * MAX;
        targetY = -dy * MAX;
        active = true;
        ensureLoop();
      });
      screen.addEventListener('mouseleave', () => {
        active = false;
        targetX = 0; targetY = 0;
        ensureLoop();
      });
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

    // Доступ снаружи
    window.LoveAuth = { open: openAuth, enter: enterApp, setTab: showForm, startOnboarding: () => startSpotlightOnboarding({ force: true }) };

    // Запускаем проверку сессии на старте
    checkExistingSession();
    // Страховка: не оставляем сплеш висеть, если ветки выше не сработали.
    setTimeout(hideSplash, 8000);
  }
})();
