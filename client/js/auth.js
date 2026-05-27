/**
 * Auth модуль - авторизация и регистрация
 * Работает с login-screen и register-screen в HTML
 */

let resendTimer;
let resetResendTimer;

// State Isolation (Version Guard & Debounce Locks)
window.authTransitionId = 0;
let authLoginLock = false;
let authRegisterLock = false;
let authForgotLock = false;
let authResetLock = false;

// Единая точка входа для смены экранов авторизации
function switchAuthScreen(screenId) {
  hideAllAuthScreens();
  resetAuthUI();
  document.getElementById(screenId).classList.remove('hidden');
}

// Показать форму входа
function showLogin() {
  switchAuthScreen('login-screen');
}

// Показать форму регистрации
function showRegister() {
  switchAuthScreen('register-screen');
}

// Показать форму OTP
function showOtpScreen(email, type = 'verification') {
  switchAuthScreen('otp-screen');
  const title = document.querySelector('#otp-screen .auth-title');
  const subtitle = document.querySelector('#otp-screen .auth-subtitle');
  if (title) title.textContent = type === 'login' ? 'Код входа' : 'Подтвердите почту';
  if (subtitle) subtitle.innerHTML = type === 'login'
    ? `Мы отправили код входа на <br><strong id="otp-email-display">${email}</strong>`
    : `Мы отправили 6-значный код на <br><strong id="otp-email-display">${email}</strong>`;
  document.getElementById('otp-email-display').textContent = email;
  window.lastAuthEmail = email;
  window.otpType = type;
  
  // Фокус на первом поле
  setTimeout(() => document.getElementById('otp-1').focus(), 100);
  startResendTimer();
}

// Показать форму "Забыл пароль"
function showForgotPassword() {
  switchAuthScreen('forgot-password-screen');
}

// Показать форму сброса пароля (ввод кода + новый пароль)
function showResetPassword(email) {
  switchAuthScreen('reset-password-screen');
  window.lastAuthEmail = email;
  setTimeout(() => document.getElementById('reset-otp-1').focus(), 100);
}

function resetAuthUI() {
  authLoginLock = false;
  authRegisterLock = false;
  authForgotLock = false;
  authResetLock = false;

  const btnMap = {
    'login-btn': 'Войти',
    'register-btn': 'Создать аккаунт',
    'verify-btn': 'Подтвердить',
    'forgot-btn': 'Отправить',
    'reset-btn': 'Изменить пароль'
  };

  for (const [id, text] of Object.entries(btnMap)) {
    const btn = document.getElementById(id);
    if (btn) {
      btn.disabled = false;
      btn.textContent = text;
      btn.classList.remove('loading');
    }
  }
}

function hideAllAuthScreens() {
  window.authTransitionId++; // Убиваем старые async контексты
  const screens = ['login-screen', 'register-screen', 'otp-screen', 'forgot-password-screen', 'reset-password-screen'];
  screens.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  
  // Строгий сброс всех ошибок (State Isolation)
  const errorIds = ['login-error', 'register-error', 'otp-error', 'forgot-error', 'reset-error'];
  errorIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.textContent = '';
      el.classList.add('hidden');
    }
  });
  
  // Очистка всех OTP инпутов от предыдущих попыток
  const otpInputs = document.querySelectorAll('input[id^="otp-"], input[id^="reset-otp-"]');
  if (otpInputs) {
    otpInputs.forEach(input => input.value = '');
  }
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

// Перехват вставки из буфера обмена
function handleOtpPaste(e, type = 'verify') {
  e.preventDefault();
  const pastedData = (e.clipboardData || window.clipboardData).getData('text');
  const digits = pastedData.replace(/\D/g, '').slice(0, 6); // Только цифры, макс 6
  
  const prefix = type === 'reset' ? 'reset-otp-' : 'otp-';
  for (let i = 0; i < digits.length; i++) {
    const input = document.getElementById(prefix + (i + 1));
    if (input) input.value = digits[i];
  }
  
  if (digits.length > 0) {
    const focusIndex = Math.min(digits.length + 1, 6);
    const nextInput = document.getElementById(prefix + focusIndex);
    if (nextInput) nextInput.focus();
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
    await storeAuthToken(token);
    
    try {
      const data = await AuthAPI.getMe();
      localStorage.setItem('user', JSON.stringify(data.user));
      window.currentUser = data.user;
      await initApp();
      maybeShowGoogleOnboarding();
    } catch (error) {
      showAuthError('login-error', 'Ошибка получения данных пользователя');
    }
  }
});

// Слушатель для Electron (через IPC)
if (window.electronAPI && window.electronAPI.onGoogleAuthSuccess) {
  window.electronAPI.onGoogleAuthSuccess(async (token) => {
    await storeAuthToken(token);
    try {
      const data = await AuthAPI.getMe();
      localStorage.setItem('user', JSON.stringify(data.user));
      window.currentUser = data.user;
      await initApp();
      maybeShowGoogleOnboarding();
    } catch (error) {
      showAuthError('login-error', 'Ошибка получения данных пользователя через Google');
    }
  });
}

function maybeShowGoogleOnboarding() {
  if (!window.currentUser?.hasGoogle || window.currentUser?.hasPassword || window.currentUser?.googleOnboardingComplete) return;
  const modal = document.getElementById('google-onboarding-modal');
  const input = document.getElementById('google-onboarding-username');
  if (input) input.value = window.currentUser?.username || '';
  if (modal) {
    openModal('google-onboarding-modal', { allowEscape: false, allowClickOutside: false });
  }
}

window.completeGoogleOnboarding = completeGoogleOnboarding;

async function completeGoogleOnboarding(keepCurrent) {
  const input = document.getElementById('google-onboarding-username');
  const error = document.getElementById('google-onboarding-error');
  try {
    const data = await AuthAPI.completeGoogleOnboarding({
      keepCurrent,
      username: input?.value.trim()
    });
    window.currentUser = data.user;
    localStorage.setItem('user', JSON.stringify(data.user));
    closeModal('google-onboarding-modal');
  } catch (e) {
    if (error) {
      error.textContent = e.message || 'Не удалось сохранить имя';
      error.classList.remove('hidden');
    }
  }
}

// Обработка входа
async function handleLogin() {
  if (authLoginLock) return;

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('login-btn');

  if (!email || !password) {
    showAuthError('login-error', 'Заполните все поля');
    return;
  }

  authLoginLock = true;
  btn.disabled = true;
  btn.textContent = 'Вход...';

  const currentTransitionId = window.authTransitionId;

  try {
    const data = await AuthAPI.login(email, password);
    if (window.authTransitionId !== currentTransitionId) return;

    if (data.requireTwoFactor) {
      window.pendingTwoFactorToken = data.pendingToken;
      showOtpScreen(data.email || email, 'login');
      return;
    }
    await storeAuthToken(data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.currentUser = data.user;
    await initApp();
  } catch (error) {
    if (window.authTransitionId !== currentTransitionId || error.isAborted) return;

    // Если требуется верификация (код 403 и флаг requireVerification)
    if (error.status === 403 && error.data && error.data.requireVerification) {
      showOtpScreen(email);
    } else {
      showAuthError('login-error', error.message || 'Ошибка входа');
    }
  } finally {
    authLoginLock = false;
    if (window.authTransitionId === currentTransitionId) {
      btn.disabled = false;
      btn.textContent = 'Войти';
    }
  }
}

// Обработка регистрации
async function handleRegister() {
  if (authRegisterLock) return;

  const username = document.getElementById('register-username').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  const btn = document.getElementById('register-btn');

  if (!username || !email || !password) {
    showAuthError('register-error', 'Заполните все поля');
    return;
  }

  authRegisterLock = true;
  btn.disabled = true;
  btn.textContent = 'Создание...';

  const currentTransitionId = window.authTransitionId;

  try {
    const data = await AuthAPI.register(username, email, password);
    if (window.authTransitionId !== currentTransitionId) return;

    if (data.requireVerification) {
      showOtpScreen(email);
    }
  } catch (error) {
    if (window.authTransitionId !== currentTransitionId || error.isAborted) return;
    showAuthError('register-error', error.message || 'Ошибка регистрации');
  } finally {
    authRegisterLock = false;
    if (window.authTransitionId === currentTransitionId) {
      btn.disabled = false;
      btn.textContent = 'Создать аккаунт';
    }
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
  
  const currentTransitionId = window.authTransitionId;

  try {
    const data = window.otpType === 'login'
      ? await AuthAPI.verifyTwoFactor(window.pendingTwoFactorToken, code)
      : await AuthAPI.verifyOtp(window.lastAuthEmail, code);
      
    if (window.authTransitionId !== currentTransitionId) return;

    window.pendingTwoFactorToken = null;
    await storeAuthToken(data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    window.currentUser = data.user;
    await initApp();
  } catch (error) {
    if (window.authTransitionId !== currentTransitionId || error.isAborted) return;

    showAuthError('otp-error', error.message || 'Неверный код');
    // Встряска инпутов при ошибке
    document.querySelector('.otp-input-container').classList.add('shake');
    setTimeout(() => document.querySelector('.otp-input-container').classList.remove('shake'), 500);
  } finally {
    if (window.authTransitionId === currentTransitionId) {
      btn.disabled = false;
    }
  }
}

// Переотправка OTP
async function handleResendOtp() {
  try {
    if (window.otpType === 'login') {
      showAuthError('otp-error', 'Для нового кода повторите вход');
      return;
    }
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
  if (authForgotLock) return;

  const email = document.getElementById('forgot-email').value.trim();
  if (!email) return showAuthError('forgot-error', 'Введите email');
  
  const btn = document.getElementById('forgot-btn');
  authForgotLock = true;
  btn.disabled = true;
  
  const currentTransitionId = window.authTransitionId;

  try {
    await AuthAPI.forgotPassword(email);
    if (window.authTransitionId !== currentTransitionId) return;

    showResetPassword(email);
    startResetResendTimer();
  } catch (error) {
    if (window.authTransitionId !== currentTransitionId || error.isAborted) return;
    showAuthError('forgot-error', error.message || 'Ошибка');
  } finally {
    authForgotLock = false;
    if (window.authTransitionId === currentTransitionId) {
      btn.disabled = false;
    }
  }
}

// Сброс пароля по коду
async function handleResetPassword() {
  if (authResetLock) return;

  let code = '';
  for (let i = 1; i <= 6; i++) {
    code += document.getElementById('reset-otp-' + i).value;
  }
  const newPassword = document.getElementById('reset-new-password').value;
  
  if (code.length < 6 || !newPassword) return;
  
  const btn = document.getElementById('reset-btn');
  authResetLock = true;
  btn.disabled = true;
  
  const currentTransitionId = window.authTransitionId;

  try {
    await AuthAPI.resetPassword(window.lastAuthEmail, code, newPassword);
    if (window.authTransitionId !== currentTransitionId) return;

    alert('Пароль изменен! Теперь вы можете войти.');
    showLogin();
  } catch (error) {
    if (window.authTransitionId !== currentTransitionId || error.isAborted) return;
    showAuthError('reset-error', error.message || 'Ошибка');
  } finally {
    authResetLock = false;
    if (window.authTransitionId === currentTransitionId) {
      btn.disabled = false;
    }
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
  if (window.founderSystem && typeof window.founderSystem.stopStatsUpdate === 'function') {
    window.founderSystem.stopStatsUpdate();
  }
  if (window.RoomsUI && typeof window.RoomsUI.destroyRoomListeners === 'function') {
    window.RoomsUI.destroyRoomListeners();
  }
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

// Модалка условий использования / политики конфиденциальности
function openLegalModal(type) {
  const title = document.getElementById('legal-modal-title');
  const body = document.getElementById('legal-modal-body');

  if (type === 'terms') {
    title.textContent = 'Условия использования';
    body.innerHTML = `
      <h3>1. Что такое Love</h3>
      <p>Love — это приложение для общения, обмена сообщениями и голосовых звонков. Мы предоставляем вам платформу для создания серверов, каналов, комнат и личных переписок. Приложение разрабатывается независимой командой и не является продуктом крупной корпорации.</p>

      <h3>2. Кто может пользоваться</h3>
      <p>Приложение доступно всем, кому исполнилось 13 лет. Если вам меньше 18 лет, использование приложения подразумевает, что ваш родитель или опекун ознакомлен с этими условиями. Мы не проверяем возраст принудительно, но оставляем за собой право ограничить доступ при обоснованных подозрениях.</p>

      <h3>3. Ваш аккаунт</h3>
      <p>При регистрации вы создаёте аккаунт с уникальным именем пользователя и email. Вы отвечаете за всё, что происходит под вашим аккаунтом. Не передавайте свой пароль другим людям. Если вы подозреваете, что кто-то получил доступ к вашему аккаунту — немедленно смените пароль.</p>
      <p>Мы можем заблокировать или удалить аккаунт, если он используется с нарушением этих правил. Перед блокировкой мы постараемся предупредить вас, но в случае грубых нарушений блокировка может произойти без предупреждения.</p>

      <h3>4. Что можно делать</h3>
      <p>Вы можете свободно общаться, создавать серверы и комнаты, приглашать друзей, обмениваться файлами и участвовать в голосовых каналах. Мы создавали приложение, чтобы людям было удобно и приятно общаться, и просим использовать его именно для этого.</p>

      <h3>5. Что нельзя делать</h3>
      <p>Мы просим не делать следующее:</p>
      <p>• Рассылать спам, рекламу или нежелательные сообщения массово.</p>
      <p>• Оскорблять, угрожать, преследовать или унижать других пользователей.</p>
      <p>• Публиковать контент, нарушающий закон: порнографию с участием несовершеннолетних, призывы к насилию, экстремизм.</p>
      <p>• Распространять вирусы, вредоносные файлы или ссылки.</p>
      <p>• Пытаться получить доступ к чужим аккаунтам или данным сервиса.</p>
      <p>• Использовать ботов и автоматизацию для массовых действий без согласования с администрацией.</p>
      <p>• Выдавать себя за другого человека или за представителя администрации.</p>

      <h3>6. Контент</h3>
      <p>Всё, что вы пишете, отправляете и публикуете — ваша ответственность. Мы не проверяем каждое сообщение заранее, но можем удалить контент, который нарушает правила, по жалобам пользователей или при модерации. Вы сохраняете права на свой контент, но даёте нам техническое разрешение хранить и передавать его в рамках работы сервиса (например, чтобы ваше сообщение увидели другие участники чата).</p>

      <h3>7. Серверы и модерация</h3>
      <p>Создатели серверов и назначенные ими модераторы устанавливают свои правила в рамках своих серверов. Мы не несём ответственности за действия модераторов конкретных серверов, но общие правила платформы действуют везде. Если модератор сервера нарушает правила платформы — сообщите нам.</p>

      <h3>8. Доступность сервиса</h3>
      <p>Мы стараемся, чтобы приложение работало стабильно и без перебоев. Но мы небольшая команда, и иногда могут случаться технические проблемы, обновления или плановые работы. Мы не гарантируем бесперебойную работу 24/7 и не несём ответственности за временные перерывы в доступе.</p>

      <h3>9. Ограничение ответственности</h3>
      <p>Приложение предоставляется «как есть». Мы делаем всё возможное для его качества, но не даём гарантий, что оно будет работать идеально в каждом случае. Мы не несём ответственности за потерю данных, упущенную выгоду или любой ущерб, связанный с использованием приложения. Максимальная ответственность ограничена суммой, которую вы заплатили нам (если вы ничего не платили — ответственность равна нулю).</p>

      <h3>10. Изменения условий</h3>
      <p>Мы можем обновлять эти условия по мере развития приложения. При существенных изменениях мы уведомим вас через приложение. Продолжая пользоваться Love после изменений, вы принимаете обновлённые условия. Если вы не согласны — вы можете удалить аккаунт в любой момент.</p>

      <h3>11. Удаление аккаунта</h3>
      <p>Вы можете удалить свой аккаунт в любое время через настройки. После удаления ваши личные данные будут стёрты. Сообщения в общих чатах могут сохраниться, но будут обезличены.</p>
    `;
  } else {
    title.textContent = 'Политика конфиденциальности';
    body.innerHTML = `
      <h3>1. Главное коротко</h3>
      <p>Мы собираем минимум данных, необходимых для работы приложения. Мы не продаём ваши данные. Мы не показываем рекламу. У нас нет скрытых трекеров. Ваш пароль хранится в зашифрованном виде, и мы сами не можем его прочитать.</p>

      <h3>2. Какие данные мы собираем</h3>
      <p><strong>При регистрации:</strong> email, имя пользователя, пароль (сохраняется только в хешированном виде). Если вы входите через Google — мы получаем ваш email и имя из Google-аккаунта.</p>
      <p><strong>При использовании:</strong> сообщения, которые вы отправляете; файлы, которые вы загружаете; информация о серверах и каналах, в которых вы состоите; настройки вашего профиля (аватар, статус).</p>
      <p><strong>Автоматически:</strong> IP-адрес при входе в аккаунт, время входа, тип устройства (user-agent). Эти данные нужны для безопасности: обнаружения подозрительных входов и защиты от взлома.</p>

      <h3>3. Зачем мы используем данные</h3>
      <p>• Чтобы приложение работало: доставлять сообщения, показывать профили, управлять серверами.</p>
      <p>• Чтобы защитить аккаунт: фиксировать входы, блокировать подозрительную активность, отправлять коды подтверждения на почту.</p>
      <p>• Чтобы улучшать сервис: понимать, как люди используют приложение, и исправлять ошибки.</p>
      <p>Мы не используем ваши данные для таргетированной рекламы, не составляем рекламные профили и не продаём данные третьим лицам.</p>

      <h3>4. Кому мы передаём данные</h3>
      <p>Никому, за исключением случаев:</p>
      <p>• Когда это необходимо для работы сервиса (например, отправка email через почтовый сервер).</p>
      <p>• Когда этого требует закон (запрос суда или правоохранительных органов).</p>
      <p>Мы не делимся вашими данными с рекламными сетями, аналитическими платформами или другими коммерческими сервисами.</p>

      <h3>5. Как мы храним данные</h3>
      <p>Данные хранятся на защищённых серверах. Пароли хешируются алгоритмом bcrypt — даже при утечке базы данных ваш пароль невозможно прочитать напрямую. Соединение между приложением и сервером шифруется. Мы регулярно обновляем зависимости и следим за безопасностью инфраструктуры.</p>

      <h3>6. Как долго мы храним данные</h3>
      <p>Данные вашего аккаунта хранятся, пока аккаунт активен. Логи входов хранятся ограниченное время для безопасности. При удалении аккаунта ваши персональные данные стираются. Сообщения в групповых чатах могут сохраниться в обезличенном виде.</p>

      <h3>7. Ваши права</h3>
      <p>Вы имеете право:</p>
      <p>• Знать, какие данные мы о вас храним.</p>
      <p>• Исправить неточные данные в настройках профиля.</p>
      <p>• Удалить свой аккаунт и все связанные данные.</p>
      <p>• Отозвать согласие на обработку данных (это равнозначно удалению аккаунта).</p>
      <p>Для реализации этих прав используйте настройки приложения или свяжитесь с администрацией.</p>

      <h3>8. Безопасность</h3>
      <p>Мы используем двухфакторную аутентификацию (2FA), OTP-коды, ограничение попыток входа и блокировку аккаунтов при подозрительной активности. Мы делаем всё разумное для защиты ваших данных, но ни одна система в мире не может гарантировать абсолютную безопасность.</p>

      <h3>9. Дети</h3>
      <p>Приложение не предназначено для детей младше 13 лет. Мы не собираем данные детей намеренно. Если вы считаете, что ребёнок младше 13 лет зарегистрировался — сообщите нам, и мы удалим аккаунт.</p>

      <h3>10. Изменения политики</h3>
      <p>Мы можем обновлять эту политику. При значительных изменениях мы уведомим вас через приложение. Текущая версия всегда доступна на экране регистрации.</p>
    `;
  }

  openModal('legal-modal', { allowClickOutside: true });
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
