let isPackaged = false;
let usesProductionBackend = false;
try {
  if (window.electronAPI && window.electronAPI.getBackendModeSync) {
    const mode = window.electronAPI.getBackendModeSync();
    usesProductionBackend = mode?.production === true;
    isPackaged = window.electronAPI.isPackagedSync?.() === true;
  } else if (window.electronAPI && window.electronAPI.isPackagedSync) {
    isPackaged = window.electronAPI.isPackagedSync();
    usesProductionBackend = isPackaged;
  } else if (!window.electronAPI) {
    // Fallback if opened in a regular web browser (e.g. hosted on Vercel/Netlify)
    const isCapacitor = Boolean(window.Capacitor) || window.location.protocol === 'capacitor:' || window.location.hostname === 'localhost' && window.location.protocol === 'https:';
    const isLocalhost = !isCapacitor && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isFileProtocol = window.location.protocol === 'file:';
    const isNgrok = window.location.hostname.includes('ngrok');
    // В Electron-приложении (даже не упакованном) и на хостинге используем логику адекватного определения продакшена
    if (!isLocalhost && !isFileProtocol && !isNgrok) {
      isPackaged = true; // Use production API if hosted anywhere else
      usesProductionBackend = true;
    }
  }
} catch (e) {
  console.error('Failed to get app mode synchronously:', e);
}

// ПРИНУДИТЕЛЬНО исправляем: если это Electron и он упакован — ВСЕГДА используем Render
// Если же это не упакованный Electron или обычный браузер на localhost/ngrok — используем текущий хост
const currentHost = window.location.origin;
const isNgrokHost = window.location.hostname.includes('ngrok');
const isCapacitorRuntime = Boolean(window.Capacitor) || window.location.protocol === 'capacitor:' || (window.location.protocol === 'https:' && window.location.hostname === 'localhost');
window.BASE_URL = (usesProductionBackend || isCapacitorRuntime) ? 'https://api.loveapp.chat' : (isNgrokHost ? currentHost : 'http://localhost:5555');
let API_BASE = window.BASE_URL + '/api';
window.API_BASE = API_BASE;

if (usesProductionBackend) {
  console.log('🌐 Production mode: using remote API', API_BASE);
} else {
  console.log('🛠 Development mode: using local API', API_BASE);
}

// Промис для инициализации конфига (оставлен для обратной совместимости, если где-то используется await)
window.apiReady = Promise.resolve();

/**
 * Прогрев сервера: пингуем /api/health пока не ответит.
 * Render free-план "засыпает" через 15 минут — первый запрос может занять до 60 сек.
 * Возвращает true если сервер ответил, false если все попытки исчерпаны.
 *
 * @param {object} opts
 * @param {number} opts.maxAttempts — сколько раз пробовать (default 12)
 * @param {number} opts.timeoutMs — таймаут одного запроса (default 8000)
 * @param {number} opts.delayMs — пауза между попытками (default 3000)
 * @param {(attempt:number, max:number)=>void} opts.onAttempt — колбэк для UI
 */
async function warmupServer(opts = {}) {
  const {
    maxAttempts = 12,
    timeoutMs = 8000,
    delayMs = 3000,
    onAttempt = null
  } = opts;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (onAttempt) {
      try { onAttempt(attempt, maxAttempts); } catch (_) {}
    }

    try {
      // В Electron используем IPC (обходит CORS и работает идентично остальным запросам)
      if (window.electronAPI && window.electronAPI.apiRequest) {
        const result = await Promise.race([
          window.electronAPI.apiRequest({ path: '/health', method: 'GET' }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs))
        ]);
        if (result && result.ok) return true;
      } else {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
          const response = await fetch(`${API_BASE}/health`, { signal: ctrl.signal });
          if (response.ok) return true;
        } finally {
          clearTimeout(timer);
        }
      }
    } catch (_) {
      // молча — это ожидаемое поведение для холодного старта
    }

    if (attempt < maxAttempts) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return false;
}
window.warmupServer = warmupServer;

// Безопасное сохранение токена (только для login/register)
async function storeAuthToken(token) {
  if (window.electronAPI && window.electronAPI.storeToken) {
    await window.electronAPI.storeToken(token);
  } else {
    // Fallback для веб-версии (не Electron)
    localStorage.setItem('token', token);
  }
}

// Безопасное удаление токена
async function clearAuthToken() {
  if (window.electronAPI && window.electronAPI.clearToken) {
    await window.electronAPI.clearToken();
  }
  // Всегда очищаем localStorage на случай старых данных
  localStorage.removeItem('token');
}

// FIX: 401 от auth-эндпоинтов (login/register/verify-otp) НЕ должен
// триггерить clearAuthToken+reload — это нормальный ответ "неверные креды"
// и ошибку нужно показать в UI. Reload оставляем только для 401 на
// уже-авторизованных запросах (протух токен).
function isAuthEntryEndpoint(endpoint) {
  return typeof endpoint === 'string' && (
    endpoint.startsWith('/auth/login') ||
    endpoint.startsWith('/auth/register') ||
    endpoint.startsWith('/auth/verify-otp') ||
    endpoint.startsWith('/auth/forgot-password') ||
    endpoint.startsWith('/auth/reset-password') ||
    endpoint.startsWith('/auth/resend-otp')
    || endpoint.startsWith('/auth/verify-2fa')
    || endpoint.startsWith('/auth/registration-email')
  );
}

// Пользователь сейчас на экране авторизации (не залогинен)?
// Если да — 401 на любом запросе НЕ должен чистить токен и дёргать
// showAuthScreen(): мы и так на экране входа, а такой редирект сбрасывает
// форму регистрации на форму входа (баг: проверка занятости ника шлёт
// /users/search без токена → 401 → форма прыгает на вход).
function isOnAuthScreen() {
  try {
    const screen = document.getElementById('auth-screen');
    return Boolean(screen) && !screen.classList.contains('auth-hidden');
  } catch (e) {
    return false;
  }
}

function normalizeApiErrorMessage(message, status) {
  if (typeof message !== 'string') return 'Ошибка запроса';
  if (/failed to fetch|fetch failed|networkerror|load failed/i.test(message)) {
    return 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.';
  }
  if (/timeout|timed out|operation was aborted/i.test(message)) {
    return 'Сервер долго не отвечает. Изменения остались в форме — попробуйте ещё раз.';
  }
  if (message.includes('<!DOCTYPE html>') || message.includes('Cannot POST') || message.includes('Cannot GET')) {
    if (status === 404) return 'Сервер еще не обновлен. Обновите backend и попробуйте снова.';
    return 'Сервер вернул некорректный ответ. Попробуйте позже.';
  }
  return message;
}

// Базовый fetch с авторизацией через IPC proxy
async function apiFetchOnce(endpoint, options = {}) {
  await window.apiReady;

  // В Electron используем безопасный IPC proxy
  if (window.electronAPI && window.electronAPI.apiRequest) {
    try {
      const result = await window.electronAPI.apiRequest({
        path: endpoint,
        method: options.method || 'GET',
        body: options.body,
        headers: options.headers || {},
        timeoutMs: options.timeoutMs || 35000
      });

      if (!result.ok) {
        if (result.networkError || result.status === 0) {
          const error = new Error(normalizeApiErrorMessage(result.data?.message, 0));
          error.isNetworkError = true;
          throw error;
        }
        if (result.aborted) {
          const abortError = new Error('Отменено');
          abortError.isAborted = true;
          throw abortError;
        }
        console.error('API request failed:', endpoint, result.status);
        if (result.status === 401 && !isAuthEntryEndpoint(endpoint) && !isOnAuthScreen()) {
          // Авторизованный запрос с протухшим токеном — чистим и
          // мягко выкидываем на экран логина. БЕЗ reload, чтобы не было
          // циклов перезагрузки при долгоживущих сбоях.
          await clearAuthToken();
          localStorage.removeItem('user');
          if (typeof disconnectSocket === 'function') disconnectSocket();
          if (typeof showAuthScreen === 'function') {
            try { showAuthScreen(); } catch (_) {}
          }
        }
        const error = new Error(normalizeApiErrorMessage(result.data?.message, result.status));
        error.status = result.status;
        error.data = result.data;
        throw error;
      }
      
      return result.data;
    } catch (error) {
      // Если это уже наша ошибка с статусом, пробрасываем дальше
      if (error.status || error.isNetworkError || error.isAborted) throw error;
      
      // Иначе это сетевая ошибка
      console.error('Network error:', error.message);
      const networkError = new Error('Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.');
      networkError.isNetworkError = true;
      throw networkError;
    }
  }
  
  // Fallback для веб-версии (не Electron) - используем прямой fetch с localStorage
  const token = localStorage.getItem('token');
  const headers = {
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  // Only add JSON content type if not sending FormData
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  let data;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (options.signal?.aborted) controller.abort();
  else options.signal?.addEventListener('abort', onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 35000);
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal
    });
    const responseText = await response.text();
    try { data = responseText ? JSON.parse(responseText) : {}; }
    catch (_) {
      const error = new Error('Сервер вернул некорректный ответ. Попробуйте позже.');
      error.status = response.status;
      throw error;
    }
  } catch (networkError) {
    if (networkError.status) throw networkError;
    console.error('Network error:', networkError.message, 'URL:', `${API_BASE}${endpoint}`);
    const error = new Error(controller.signal.aborted
      ? 'Сервер долго не отвечает. Попробуйте ещё раз.'
      : 'Не удалось связаться с сервером. Проверьте интернет и попробуйте ещё раз.');
    error.isAborted = options.signal?.aborted === true;
    error.isNetworkError = !error.isAborted;
    throw error;
  } finally {
    clearTimeout(timeout);
    options.signal?.removeEventListener('abort', onAbort);
  }

  if (!response.ok) {
    if (response.status === 401 && !isAuthEntryEndpoint(endpoint) && !isOnAuthScreen()) {
      await clearAuthToken();
      localStorage.removeItem('user');
      if (typeof disconnectSocket === 'function') disconnectSocket();
      if (typeof showAuthScreen === 'function') {
        try { showAuthScreen(); } catch (_) {}
      }
    }
    const error = new Error(normalizeApiErrorMessage(data.message, response.status));
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

const replayAuthPaths = new Set(['/auth/register', '/auth/login', '/auth/verify-otp', '/auth/verify-2fa', '/auth/resend-otp', '/auth/registration-email']);
const pendingAuthRequests = new Map();
let authCapabilitiesPromise;

async function apiFetch(endpoint, options = {}) {
  // This endpoint only sets profile fields. Reapplying the same PUT is safe
  // when the connection was lost after MongoDB accepted the update.
  if (endpoint === '/users/profile' && options.method === 'PUT') {
    try { return await apiFetchOnce(endpoint, options); }
    catch (error) {
      if (!error.isNetworkError) throw error;
      await new Promise(resolve => setTimeout(resolve, 400));
      return apiFetchOnce(endpoint, options);
    }
  }
  if (!replayAuthPaths.has(endpoint) || options.method !== 'POST' || !globalThis.crypto?.subtle) {
    return apiFetchOnce(endpoint, options);
  }
  // Negotiate first: older servers cannot replay a consumed OTP safely.
  if (!authCapabilitiesPromise) authCapabilitiesPromise = apiFetchOnce('/auth/capabilities', { timeoutMs: 8000 }).catch(error => {
    if (error.isNetworkError) authCapabilitiesPromise = null;
    return {};
  });
  const capabilities = await authCapabilitiesPromise;
  if (!capabilities.authReplay) return apiFetchOnce(endpoint, options);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint + options.body));
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  for (const [id, entry] of pendingAuthRequests) if (entry.expiresAt <= Date.now() && !entry.promise) pendingAuthRequests.delete(id);
  let entry = pendingAuthRequests.get(key);
  if (entry?.promise) return entry.promise;
  if (!entry || entry.expiresAt <= Date.now()) {
    // Leave enough server-cache lifetime for both bounded network attempts.
    entry = { requestId: crypto.randomUUID(), expiresAt: Date.now() + 90000 };
    pendingAuthRequests.set(key, entry);
  }
  const requestOptions = { ...options, headers: { ...options.headers, 'X-Auth-Request-Id': entry.requestId } };
  entry.promise = (async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const result = await apiFetchOnce(endpoint, requestOptions);
          pendingAuthRequests.delete(key);
          return result;
        } catch (error) {
          if (!error.isNetworkError) { pendingAuthRequests.delete(key); throw error; }
          if (attempt === 1) throw error;
          await new Promise(resolve => setTimeout(resolve, 400));
        }
      }
    } finally { entry.promise = null; }
  })();
  return entry.promise;
}

// Загрузка файла через IPC proxy
async function apiUpload(endpoint, formData, method = 'POST') {
  await window.apiReady;
  
  // В Electron используем безопасный IPC proxy для загрузки файлов
  if (window.electronAPI && window.electronAPI.apiUpload) {
    try {
      // Извлекаем файл из FormData
      const file = formData.get('file') || formData.get('avatar') || formData.get('icon') || formData.get('emoji') || formData.get('banner');
      const additionalFields = {};
      
      // Собираем дополнительные поля
      for (const [key, value] of formData.entries()) {
        if (key !== 'file' && key !== 'avatar' && key !== 'icon' && key !== 'emoji' && key !== 'banner') {
          additionalFields[key] = value;
        }
      }
      
      let fileData = null;
      let fileName = null;
      let mimeType = null;
      
      if (file && file instanceof File) {
        fileData = await file.arrayBuffer();
        fileName = file.name;
        mimeType = file.type;
      }
      
      const result = await window.electronAPI.apiUpload({
        path: endpoint,
        method: method,
        fileData: fileData,
        fileName: fileName,
        mimeType: mimeType,
        additionalFields: additionalFields
      });
      
      if (!result.ok) {
        const error = new Error(normalizeApiErrorMessage(result.data?.message || 'Ошибка загрузки', result.status));
        error.status = result.status;
        error.isNetworkError = result.networkError === true;
        throw error;
      }
      
      return result.data;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }
  
  // Fallback для веб-версии (не Electron)
  const token = localStorage.getItem('token');
  let response;
  try { response = await fetch(`${API_BASE}${endpoint}`, {
    method: method,
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: formData
  }); } catch (_) { throw new Error('Не удалось загрузить файл. Проверьте интернет и попробуйте ещё раз.'); }

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Ошибка загрузки');
  return data;
}

// ===== AUTH API =====
const AuthAPI = {
  checkUsername: (username) =>
    apiFetch(`/auth/username-availability?username=${encodeURIComponent(username)}`),

  register: (username, email, password) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) }),

  login: (email, password) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    
  verifyOtp: (email, code) =>
    apiFetch('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, code }) }),

  verifyTwoFactor: (pendingToken, code) =>
    apiFetch('/auth/verify-2fa', { method: 'POST', body: JSON.stringify({ pendingToken, code }) }),

  getRestriction: () => apiFetch('/auth/restriction'),
    
  resendOtp: (email) =>
    apiFetch('/auth/resend-otp', { method: 'POST', body: JSON.stringify({ email }) }),

  changeRegistrationEmail: (registrationToken, email) =>
    apiFetch('/auth/registration-email', { method: 'POST', body: JSON.stringify({ registrationToken, email }) }),
    
  forgotPassword: (email) =>
    apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
    
  resetPassword: (email, code, newPassword) =>
    apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, code, newPassword }) }),

  changePassword: (currentPassword, newPassword) =>
    apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),

  toggleTwoFactor: (enabled) =>
    apiFetch('/auth/security/2fa', { method: 'POST', body: JSON.stringify({ enabled }) }),

  completeGoogleOnboarding: (data) =>
    apiFetch('/auth/google-onboarding', { method: 'POST', body: JSON.stringify(data) }),

  logout: () =>
    apiFetch('/auth/logout', { method: 'POST' }),

  getMe: () =>
    apiFetch('/auth/me'),

  // Короткоживущий socket-token. Используется ТОЛЬКО в socket.js перед io().
  // Не сохранять, не логировать. Получается заново при каждом (re)connect.
  getSocketToken: () =>
    apiFetch('/auth/socket-token', { method: 'POST' }),

  updateStatus: (status, customStatus) =>
    apiFetch('/auth/update-status', { method: 'PUT', body: JSON.stringify({ status, customStatus }) }),

  getLoginLogs: () =>
    apiFetch('/auth/login-logs'),

  deleteLoginLog: (logId) =>
    apiFetch(`/auth/login-logs/${logId}`, { method: 'DELETE' }),

  logoutAll: () =>
    apiFetch('/auth/logout-all', { method: 'POST' })
};

// ===== USERS API =====
const UsersAPI = {
  search: (query) =>
    apiFetch(`/users/search?q=${encodeURIComponent(query)}`),

  getUser: (userId) =>
    apiFetch(`/users/${userId}`),

  getByUsername: (username) =>
    apiFetch(`/users/by-username/${encodeURIComponent(username)}`),

  getBlocked: () =>
    apiFetch('/users/me/blocked'),

  unblock: (userId) =>
    apiFetch(`/users/me/blocked/${encodeURIComponent(userId)}`, { method: 'DELETE' }),

  updateProfile: (data) =>
    apiFetch('/users/profile', { method: 'PUT', body: JSON.stringify(data) }),

  updateAccount: (data) =>
    apiFetch('/users/account', { method: 'PUT', body: JSON.stringify(data) }),

  uploadAvatar: (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return apiUpload('/users/avatar', formData, 'PUT');
  },

  // Загрузка музыки профиля на Cloudinary (сжатая копия для других слушателей)
  uploadMusic: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiUpload('/upload', formData, 'POST');
  }
};

// ===== SERVERS API =====
const ServersAPI = {
  getAll: () =>
    apiFetch('/servers'),

  get: (serverId) =>
    apiFetch(`/servers/${serverId}`),

  create: (name, description) =>
    apiFetch('/servers', { method: 'POST', body: JSON.stringify({ name, description }) }),

  update: (serverId, data) =>
    apiFetch(`/servers/${serverId}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (serverId) =>
    apiFetch(`/servers/${serverId}`, { method: 'DELETE' }),

  createInvite: (serverId) =>
    apiFetch(`/servers/${serverId}/invite`, { method: 'POST' }),

  // Публичное превью сервера/сферы по инвайт-коду (для карточки в чате
  // и экрана входа по ссылке). Роут на бэкенде без авторизации.
  invitePreview: (code) =>
    apiFetch(`/servers/invite/${encodeURIComponent(code)}/preview`),

  join: (code) =>
    apiFetch(`/servers/join/${code}`, { method: 'POST' }),

  leave: (serverId) =>
    apiFetch(`/servers/${serverId}/leave`, { method: 'DELETE' }),

  uploadIcon: (serverId, file) => {
    const formData = new FormData();
    formData.append('icon', file);
    return apiUpload(`/servers/${serverId}/icon`, formData, 'PUT');
  },

  deleteIcon: (serverId) =>
    apiFetch(`/servers/${serverId}/icon`, { method: 'DELETE' }),

  uploadBanner: (serverId, file) => {
    const formData = new FormData();
    formData.append('banner', file);
    return apiUpload(`/servers/${serverId}/banner`, formData, 'PUT');
  },

  deleteBanner: (serverId) =>
    apiFetch(`/servers/${serverId}/banner`, { method: 'DELETE' }),

  addCategory: (serverId, name) =>
    apiFetch(`/servers/${serverId}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name })
    }),

  deleteCategory: (serverId, categoryId) =>
    apiFetch(`/servers/${serverId}/categories/${categoryId}`, {
      method: 'DELETE'
    })
};

// ===== INVITE LINK HELPERS =====
// Приглашение — это ссылка вида https://api.loveapp.chat/invite/КОД.
// Базой берём хост API: именно он отдаёт страницу /invite/:code с превью
// сферы и установщиком (см. server/routes/invitePage.js). Раньше здесь был
// зашит https://loveapp.chat — сайт на статике, такого роута у него нет,
// и скопированная ссылка в браузере просто отдавала 404.
const INVITE_BASE = (window.BASE_URL || 'https://api.loveapp.chat').replace(/\/+$/, '') + '/invite/';

// Собрать полную ссылку-приглашение из кода.
function inviteLink(code) {
  return INVITE_BASE + String(code || '').trim();
}

// Хост ссылки-приглашения: любой поддомен loveapp.chat (сейчас страницу
// отдаёт api.loveapp.chat) плюс локальный сервер для разработки. Оставлять
// «любой хост» нельзя: тогда ссылка вида discord.com/invite/... в сообщении
// превратилась бы в нашу карточку и провалилась на превью. Поддомены
// разбираем как `(?:sub.)*loveapp.chat`, а не `[^\s/]*loveapp.chat`:
// второе поймало бы и чужой `evil-loveapp.chat`.
const INVITE_HOSTS = String.raw`(?:(?:[a-z0-9-]+\.)*loveapp\.chat|localhost(?::\d+)?|127\.0\.0\.1(?::\d+)?)`;
const INVITE_LINK_SOURCE = String.raw`(?:https?:\/\/${INVITE_HOSTS}\/invite\/|love-app:\/\/invite\/)([A-Za-z0-9-]{4,32})`;

// Извлечь инвайт-код из строки: полной ссылки (https://api.loveapp.chat/invite/КОД
// или love-app://invite/КОД) либо «голого» кода. Возвращает код или null.
function parseInviteCode(text) {
  if (!text) return null;
  const s = String(text).trim();
  // Сначала пробуем полноценную ссылку (web или deep-link).
  const linkMatch = s.match(new RegExp(INVITE_LINK_SOURCE, 'i'));
  if (linkMatch) return linkMatch[1].toUpperCase();
  // Иначе — «голый» код целиком (8 символов как генерит бэкенд, допускаем 4–16).
  const bare = s.match(/^([A-Za-z0-9]{4,16})$/);
  if (bare) return bare[1].toUpperCase();
  return null;
}

// Регекс для поиска инвайт-ССЫЛКИ внутри текста сообщения (строгий —
// только полная ссылка, чтобы не превращать любое слово в карточку).
const INVITE_LINK_REGEX = new RegExp(INVITE_LINK_SOURCE, 'i');

window.inviteLink = inviteLink;
window.parseInviteCode = parseInviteCode;
window.INVITE_LINK_REGEX = INVITE_LINK_REGEX;

// ===== ROOMS API =====
// Тонкая обёртка поверх ServersAPI. Не дублирует функциональность,
// а лишь добавляет два эндпоинта для упрощённых "комнат" (settings.kind='room').
// Управление, инвайты, выход, аплоад иконки и т.п. для комнат идут через
// существующие ServersAPI (room — это тот же Server-документ).
const RoomsAPI = {
  // Список только комнат пользователя
  getAll: () =>
    apiFetch('/servers/rooms'),

  // Создание комнаты (бекенд сам создаёт 1 text + 1 voice канал)
  create: (name, description) =>
    apiFetch('/servers/rooms', {
      method: 'POST',
      body: JSON.stringify({ name, description })
    }),

  // Присоединение по инвайт-коду переиспользует существующий endpoint
  join: (code) => ServersAPI.join(code),

  // Выход / удаление / обновление — те же, что у Server
  leave: (roomId) => ServersAPI.leave(roomId),
  delete: (roomId) => ServersAPI.delete(roomId),
  update: (roomId, data) => ServersAPI.update(roomId, data),
  uploadIcon: (roomId, file) => ServersAPI.uploadIcon(roomId, file),
  deleteIcon: (roomId) => ServersAPI.deleteIcon(roomId),
  uploadBanner: (roomId, file) => ServersAPI.uploadBanner(roomId, file),
  deleteBanner: (roomId) => ServersAPI.deleteBanner(roomId),
  createInvite: (roomId) => ServersAPI.createInvite(roomId)
};

// ===== CHANNELS API =====
const ChannelsAPI = {
  create: (name, type, serverId, category = null) =>
    apiFetch('/channels', {
      method: 'POST',
      body: JSON.stringify({ name, type, serverId, category })
    }),

  get: (channelId) =>
    apiFetch(`/channels/${channelId}`),

  update: (channelId, data) =>
    apiFetch(`/channels/${channelId}`, { method: 'PUT', body: JSON.stringify(data) }),

  delete: (channelId) =>
    apiFetch(`/channels/${channelId}`, { method: 'DELETE' })
};

// ===== MESSAGES API =====
const MessagesAPI = {
  getMessages: (channelId, before, limit) => {
    let url = `/messages/${channelId}?limit=${limit || 50}`;
    if (before) url += `&before=${before}`;
    return apiFetch(url);
  },

  // deliverAt (ISO-строка) превращает сообщение в капсулу времени:
  // сервер сохранит его скрытым и разошлёт, когда наступит срок.
  send: (channelId, content, replyTo, deliverAt) =>
    apiFetch(`/messages/${channelId}`, { method: 'POST', body: JSON.stringify({ content, replyTo, deliverAt }) }),

  edit: (messageId, content) =>
    apiFetch(`/messages/${messageId}`, { method: 'PUT', body: JSON.stringify({ content }) }),

  delete: (messageId) =>
    apiFetch(`/messages/${messageId}`, { method: 'DELETE' }),

  react: (messageId, emoji) =>
    apiFetch(`/messages/${messageId}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }),

  uploadFile: (channelId, file, content, replyTo) => {
    const formData = new FormData();
    formData.append('file', file);
    if (content) formData.append('content', content);
    if (replyTo) formData.append('replyTo', replyTo);
    return apiUpload(`/upload/file`, formData);
  },

  // ===== Капсулы времени =====
  // Свои ещё не доставленные капсулы (во всех каналах сразу).
  getCapsules: () =>
    apiFetch('/messages/capsules'),

  // Отменить капсулу можно только до срока — после доставки это уже
  // обычное сообщение, и сервер вернёт 404.
  cancelCapsule: (capsuleId) =>
    apiFetch(`/messages/capsules/${capsuleId}`, { method: 'DELETE' }),

  // ===== Медиатека канала =====
  // Все вложения канала, новые сверху. type: image|video|audio|file.
  getMedia: (channelId, { type, before, limit } = {}) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (before) params.set('before', before);
    params.set('limit', String(limit || 60));
    return apiFetch(`/messages/${channelId}/media?${params.toString()}`);
  }
};

// ===== FRIENDS API =====
const FriendsAPI = {
  getAll: () =>
    apiFetch('/friends'),

  sendRequest: (userId) =>
    apiFetch(`/friends/request/${userId}`, { method: 'POST' }),

  accept: (userId) =>
    apiFetch(`/friends/accept/${userId}`, { method: 'POST' }),

  decline: (userId) =>
    apiFetch(`/friends/decline/${userId}`, { method: 'POST' }),

  cancelRequest: (userId) =>
    apiFetch(`/friends/request/${userId}`, { method: 'DELETE' }),

  remove: (userId) =>
    apiFetch(`/friends/${userId}`, { method: 'DELETE' })
};

// ===== DM API =====
const DMAPI = {
  getAll: () =>
    apiFetch('/dm'),

  openConversation: (userId) =>
    apiFetch(`/dm/${userId}`, { method: 'POST' }),

  getMessages: (conversationId, before) => {
    let url = `/dm/${conversationId}/messages`;
    if (before) url += `?before=${before}`;
    return apiFetch(url);
  },

  delete: (conversationId) =>
    apiFetch(`/dm/${conversationId}`, { method: 'DELETE' })
};

// ===== NOTIFICATIONS API =====
const NotificationsAPI = {
  getAll: () =>
    apiFetch('/notifications'),

  // markRead() — все; markRead(id) — одно
  markRead: (id) =>
    apiFetch('/notifications/read', { method: 'POST', body: JSON.stringify(id ? { id } : {}) }),

  remove: (id) =>
    apiFetch(`/notifications/${id}`, { method: 'DELETE' }),

  clearAll: () =>
    apiFetch('/notifications', { method: 'DELETE' })
};

// ===== COMMUNITY & CASES API =====
// Public reads work without a token. Voting, comments and submissions use the
// same authenticated request path as the rest of the client.
const CommunityAPI = {
  topIdeas: () => apiFetch('/community/ideas/top'),
  ideas: (query = '') => apiFetch(`/community/ideas${query ? `?${query}` : ''}`),
  bugs: (query = '') => apiFetch(`/community/bugs${query ? `?${query}` : ''}`),
  announcements: (limit = 20) => apiFetch(`/community/announcements?limit=${limit}`),
  devLog: (page = 1, limit = 20) => apiFetch(`/community/devlog?page=${page}&limit=${limit}`),
  voteIdea: (id, value) => apiFetch(`/community/ideas/${id}/vote`, {
    method: 'PUT',
    body: JSON.stringify({ value })
  }),
  removeIdeaVote: (id) => apiFetch(`/community/ideas/${id}/vote`, { method: 'DELETE' }),
  voteDevLog: (id, value) => apiFetch(`/community/devlog/${id}/vote`, {
    method: 'PUT',
    body: JSON.stringify({ value })
  }),
  comments: (id) => apiFetch(`/community/devlog/${id}/comments`),
  addComment: (id, body, parent = null) => apiFetch(`/community/devlog/${id}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body, parent })
  })
};

function caseSubmissionStateFromResponse(response) {
  const state = response?.submission;
  if (Number(state?.policyVersion) >= 1 && typeof state.allowed === 'boolean') return state;
  // An old running backend can serve fresh JS from disk while its routes stay
  // in require.cache. Missing policy information must never permit a POST.
  const active = (Array.isArray(response?.cases) ? response.cases : []).find(item =>
    !['resolved', 'rejected', 'archived'].includes(item.status)
    && !String(item.sourceKey || '').startsWith('warning-review:'));
  if (active) return {
    allowed: false, code: 'CASE_ALREADY_OPEN', retryAfter: 0, activeCase: active,
    message: `У вас уже есть открытое обращение ${active.number || ''}. Дождитесь его закрытия; дополнения отправляйте в существующей переписке.`
  };
  return {
    allowed: false, code: 'CASE_SERVER_OUTDATED', retryAfter: 0,
    message: usesProductionBackend || isCapacitorRuntime
      ? 'Отправка новых обращений временно недоступна: требуется обновление сервера.'
      : 'Локальный сервер ещё не обновился. Полностью закройте Love, включая значок в трее, и запустите приложение заново.'
  };
}

let caseSubmissionInFlight = false;
async function submitNewCase(endpoint, options) {
  if (caseSubmissionInFlight) {
    const error = new Error('Обращение уже отправляется. Дождитесь результата.');
    error.status = 409;
    throw error;
  }
  caseSubmissionInFlight = true;
  try {
    const response = await apiFetch('/cases/mine');
    const state = caseSubmissionStateFromResponse(response);
    if (!state.allowed) {
      const error = new Error(state.message || 'Новое обращение пока недоступно.');
      error.status = state.code === 'CASE_COOLDOWN' ? 429 : state.code === 'CASE_SERVER_OUTDATED' ? 503 : 409;
      error.data = { ...state, submission: state };
      throw error;
    }
    return await apiFetch(endpoint, options);
  } finally {
    caseSubmissionInFlight = false;
  }
}

const CasesAPI = {
  submissionStateFromResponse: caseSubmissionStateFromResponse,
  create: (payload) => submitNewCase('/cases', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  mine: () => apiFetch('/cases/mine'),
  get: (id) => apiFetch(`/cases/${id}`),
  status: () => apiFetch('/cases/status'),
  reportTaxonomy: () => apiFetch('/cases/message-report-taxonomy'),
  profileReportOptions: () => apiFetch('/cases/profile-report-options'),
  reportProfile: (userId, part, path, description = '') => submitNewCase('/cases/profile-reports', {
    method: 'POST',
    body: JSON.stringify({ userId, part, path, description })
  }),
  reportMessage: (messageId, path, description = '') => submitNewCase('/cases/message-reports', {
    method: 'POST',
    body: JSON.stringify({ messageId, path, description })
  }),
  reply: (id, body) => apiFetch(`/cases/${id}/replies`, {
    method: 'POST',
    body: JSON.stringify({ body })
  }),
  appeal: (moderationAction, description) => submitNewCase('/cases/appeals', {
    method: 'POST',
    body: JSON.stringify({ moderationAction, description })
  })
};

window.CommunityAPI = CommunityAPI;
window.CasesAPI = CasesAPI;

// ===== ПУБЛИЧНАЯ СТРАНИЦА ПРОФИЛЯ =====
/*
 * Всего два вызова, и оба — из приложения с обычным токеном.
 *
 * Сам редактор живёт на другом домене (me.loveapp.chat/build) и работает уже
 * со своим узким токеном, который получает из одноразового кода. Поэтому здесь
 * нет ни чтения полей страницы, ни сохранения: приложению это не нужно и не
 * положено — токен из localStorage не должен уезжать на публичный хост.
 *
 * summary может ответить 404, если фича выключена флагом на сервере. Это не
 * ошибка, а нормальный ответ «раздела пока нет», и вызывающий код так его и
 * трактует.
 */
const ProfilePageAPI = {
  summary: () => apiFetch('/profile-page/summary'),
  editorSession: () => apiFetch('/profile-page/editor-session', { method: 'POST' })
};

window.ProfilePageAPI = ProfilePageAPI;
