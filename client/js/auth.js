/**
 * Auth модуль - авторизация и регистрация
 * Работает с login-screen и register-screen в HTML
 */

let resendTimer;
let resetResendTimer;

// Показать форму входа
function showLogin() {
  hideAllAuthScreens();
  document.getElementById('login-screen').classList.remove('hidden');
}

// Показать форму регистрации
function showRegister() {
  hideAllAuthScreens();
  document.getElementById('register-screen').classList.remove('hidden');
}

// Показать форму OTP
function showOtpScreen(email, type = 'verification') {
  hideAllAuthScreens();
  document.getElementById('otp-screen').classList.remove('hidden');
  document.getElementById('otp-email-display').textContent = email;
  window.lastAuthEmail = email;
  window.otpType = type;
  
  // Фокус на первом поле
  setTimeout(() => document.getElementById('otp-1').focus(), 100);
  startResendTimer();
}

// Показать форму "Забыл пароль"
function showForgotPassword() {
  hideAllAuthScreens();
  document.getElementById('forgot-password-screen').classList.remove('hidden');
}

// Показать форму сброса пароля (ввод кода + новый пароль)
function showResetPassword(email) {
  hideAllAuthScreens();
  document.getElementById('reset-password-screen').classList.remove('hidden');
  window.lastAuthEmail = email;
  setTimeout(() => document.getElementById('reset-otp-1').focus(), 100);
}

function hideAllAuthScreens() {
  const screens = ['login-screen', 'register-screen', 'otp-screen', 'forgot-password-screen', 'reset-password-screen'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

// Обработка ввода цифр OTP (автопереход)
function handleOtpInput(input, index, type = 'verify') {
  const prefix = type === 'reset' ? 'reset-otp-' : 'otp-';
  if (input.value.length === 1 && index < 6) {
    document.getElementById(prefix + (index + 1)).focus();
  }
}

function handleOtpKeyDown(e, index, type = 'verify') {
  const prefix = type === 'reset' ? 'reset-otp-' : 'otp-';
  if (e.key === 'Backspace' && !e.target.value && index > 1) {
    document.getElementById(prefix + (index - 1)).focus();
  }
}

// Таймер повторной отправки кода
function startResendTimer() {
  let count = 60;
  const counterEl = document.getElementById('resend-counter');
  const timerText = document.getElementById('resend-timer-text');
  const resendLink = document.getElementById('resend-link');
  
  if (!counterEl || !timerText || !resendLink) return;
  
  clearInterval(resendTimer);
  timerText.classList.remove('hidden');
  resendLink.classList.add('hidden');
  counterEl.textContent = count;
  
  resendTimer = setInterval(() => {
    count--;
    counterEl.textContent = count;
    if (count <= 0) {
      clearInterval(resendTimer);
      timerText.classList.add('hidden');
      resendLink.classList.remove('hidden');
    }
  }, 1000);
}

// Таймер для повторной отправки при восстановлении пароля
function startResetResendTimer() {
  let count = 60;
  const counterEl = document.getElementById('reset-resend-counter');
  const timerText = document.getElementById('reset-resend-timer-text');
  const resendLink = document.getElementById('reset-resend-link');
  
  if (!counterEl || !timerText || !resendLink) return;
  
  clearInterval(resetResendTimer);
  timerText.classList.remove('hidden');
  resendLink.classList.add('hidden');
  counterEl.textContent = count;
  
  resetResendTimer = setInterval(() => {
    count--;
    counterEl.textContent = count;
    if (count <= 0) {
      clearInterval(resetResendTimer);
      timerText.classList.add('hidden');
      resendLink.classList.remove('hidden');
    }
  }, 1000);
}

// Открыть окно авторизации Google через Electron
function openGoogleAuth() {
  if (window.electronAPI && window.electronAPI.openGoogleLogin) {
    window.electronAPI.openGoogleLogin();
  } else {
    // В браузере (для тестов)
    const baseUrl = window.BASE_URL || 'http://localhost:5555';
    const url = `${baseUrl}/api/auth/google`;
    window.open(url, 'Google Login', 'width=500,height=600');
  }
}

// Обработка сообщения об успехе (для браузера или Electron)
window.addEventListener('message', async (event) => {
  if (event.data.type === 'google-auth-success' && event.data.token) {
    const token = event.data.token;
    localStorage.setItem('token', token);
    
    try {
      const data = await AuthAPI.getMe();
      localStorage.setItem('user', JSON.stringify(data.user));
      window.currentUser = data.user;
      await initApp();
    } catch (error) {
      showAuthError('login-error', 'Ошибка получения данных пользователя');
    }
  }
});

// Слушатель для Electron (через IPC)
if (window.electronAPI && window.electronAPI.onGoogleAuthSuccess) {
  window.electronAPI.onGoogleAuthSuccess(async (token) => {
    localStorage.setItem('token', token);
    try {
      const data = await AuthAPI.getMe();
      localStorage.setItem('user', JSON.stringify(data.user));
      window.currentUser = data.user;
      await initApp();
    } catch (error) {
      showAuthError('login-error', 'Ошибка получения данных пользователя через Google');
    }
  });
}

// Обработка входа
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');

  if (!email || !password) {
    showAuthError('login-error', 'Заполните все поля');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Вход...';

  try {
    const data = await AuthAPI.login(email, password);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.currentUser = data.user;
    await initApp();
  } catch (error) {
    // Если требуется верификация (код 403 и флаг requireVerification)
    if (error.status === 403 && error.data && error.data.requireVerification) {
      showOtpScreen(email);
    } else {
      showAuthError('login-error', error.message || 'Ошибка входа');
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Войти';
  }
}

// Обработка регистрации
async function handleRegister() {
  const username = document.getElementById('register-username').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const btn = document.getElementById('register-btn');

  if (!username || !email || !password) {
    showAuthError('register-error', 'Заполните все поля');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Создание...';

  try {
    const data = await AuthAPI.register(username, email, password);
    if (data.requireVerification) {
      showOtpScreen(email);
    }
  } catch (error) {
    showAuthError('register-error', error.message || 'Ошибка регистрации');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Создать аккаунт';
  }
}

// Верификация OTP
async function handleVerifyOtp() {
  let code = '';
  for (let i = 1; i <= 6; i++) {
    code += document.getElementById('otp-' + i).value;
  }
  
  if (code.length < 6) return;
  
  const btn = document.getElementById('verify-btn');
  btn.disabled = true;
  
  try {
    const data = await AuthAPI.verifyOtp(window.lastAuthEmail, code);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.currentUser = data.user;
    await initApp();
  } catch (error) {
    showAuthError('otp-error', error.message || 'Неверный код');
    // Встряска инпутов при ошибке
    document.querySelector('.otp-input-container').classList.add('shake');
    setTimeout(() => document.querySelector('.otp-input-container').classList.remove('shake'), 500);
  } finally {
    btn.disabled = false;
  }
}

// Переотправка OTP
async function handleResendOtp() {
  try {
    await AuthAPI.resendOtp(window.lastAuthEmail);
    startResendTimer();
  } catch (error) {
    showAuthError('otp-error', 'Ошибка отправки кода');
  }
}

// Переотправка OTP для восстановления пароля
async function handleResendResetOtp() {
  try {
    await AuthAPI.forgotPassword(window.lastAuthEmail);
    startResetResendTimer();
  } catch (error) {
    showAuthError('reset-error', 'Ошибка отправки кода');
  }
}

// Запрос сброса пароля
async function handleForgotPassword() {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) return showAuthError('forgot-error', 'Введите email');
  
  const btn = document.getElementById('forgot-btn');
  btn.disabled = true;
  
  try {
    await AuthAPI.forgotPassword(email);
    showResetPassword(email);
    startResetResendTimer();
  } catch (error) {
    showAuthError('forgot-error', error.message || 'Ошибка');
  } finally {
    btn.disabled = false;
  }
}

// Сброс пароля по коду
async function handleResetPassword() {
  let code = '';
  for (let i = 1; i <= 6; i++) {
    code += document.getElementById('reset-otp-' + i).value;
  }
  const newPassword = document.getElementById('reset-new-password').value;
  
  if (code.length < 6 || !newPassword) return;
  
  const btn = document.getElementById('reset-btn');
  btn.disabled = true;
  
  try {
    await AuthAPI.resetPassword(window.lastAuthEmail, code, newPassword);
    alert('Пароль изменен! Теперь вы можете войти.');
    showLogin();
  } catch (error) {
    showAuthError('reset-error', error.message || 'Ошибка');
  } finally {
    btn.disabled = false;
  }
}

// Выход
async function handleLogout() {
  try {
    await AuthAPI.logout();
  } catch (e) {}
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.currentUser = null;
  if (typeof disconnectSocket === 'function') disconnectSocket();
  closeModal('settings-modal');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('register-screen').classList.add('hidden');
}

function showAuthError(id, message) {
  const el = document.getElementById(id);
  if (el) { el.textContent = message; el.classList.remove('hidden'); }
}

// Enter для форм авторизации
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const loginScreen = document.getElementById('login-screen');
    const registerScreen = document.getElementById('register-screen');
    if (loginScreen && !loginScreen.classList.contains('hidden')) {
      // Проверяем что фокус на поле ввода авторизации
      const active = document.activeElement;
      if (active && (active.id === 'login-email' || active.id === 'login-password')) {
        handleLogin();
      }
    } else if (registerScreen && !registerScreen.classList.contains('hidden')) {
      const active = document.activeElement;
      if (active && (active.id === 'register-email' || active.id === 'register-username' || active.id === 'register-password')) {
        handleRegister();
      }
    }
  }
});
