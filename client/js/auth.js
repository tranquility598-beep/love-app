/**
 * Auth модуль - авторизация и регистрация
 * Работает с login-screen и register-screen в HTML
 */

// Показать форму входа
function showLogin() {
  document.getElementById('register-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

// Показать форму регистрации
function showRegister() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('register-screen').classList.remove('hidden');
}

// Обработка входа
async function handleLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('login-btn');

  if (!email || !password) {
    showAuthError('login-error', 'Заполните все поля');
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Вход...';
  errorEl.classList.add('hidden');

  try {
    const data = await AuthAPI.login(email, password);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.currentUser = data.user;
    await initApp();
  } catch (error) {
    showAuthError('login-error', error.message || 'Ошибка входа');
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
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.currentUser = data.user;
    
    // Hide auth screens immediately
    document.getElementById('loading-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('register-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    
    await initApp();
  } catch (error) {
    showAuthError('register-error', error.message || 'Ошибка регистрации');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Создать аккаунт';
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
