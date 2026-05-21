let isPackaged = false;
try {
  if (window.electronAPI && window.electronAPI.isPackagedSync) {
    isPackaged = window.electronAPI.isPackagedSync();
  } else if (!window.electronAPI) {
    // Fallback if opened in a regular web browser (e.g. hosted on Vercel/Netlify)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isFileProtocol = window.location.protocol === 'file:';
    const isNgrok = window.location.hostname.includes('ngrok');
    // В Electron-приложении (даже не упакованном) и на хостинге используем логику адекватного определения продакшена
    if (!isLocalhost && !isFileProtocol && !isNgrok) {
      isPackaged = true; // Use production API if hosted anywhere else
    }
  }
} catch (e) {
  console.error('Failed to get app mode synchronously:', e);
}

// ПРИНУДИТЕЛЬНО исправляем: если это Electron и он упакован — ВСЕГДА используем Render
// Если же это не упакованный Electron или обычный браузер на localhost/ngrok — используем текущий хост
const currentHost = window.location.origin;
const isNgrokHost = window.location.hostname.includes('ngrok');
window.BASE_URL = isPackaged ? 'https://love-app-2ou3.onrender.com' : (isNgrokHost ? currentHost : 'http://localhost:5555');
let API_BASE = window.BASE_URL + '/api';
window.API_BASE = API_BASE;

if (isPackaged) {
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
  );
}

function normalizeApiErrorMessage(message, status) {
  if (typeof message !== 'string') return 'Ошибка запроса';
  if (message.includes('<!DOCTYPE html>') || message.includes('Cannot POST') || message.includes('Cannot GET')) {
    if (status === 404) return 'Сервер еще не обновлен. Обновите backend и попробуйте снова.';
    return 'Сервер вернул некорректный ответ. Попробуйте позже.';
  }
  return message;
}

// Базовый fetch с авторизацией через IPC proxy
async function apiFetch(endpoint, options = {}) {
  await window.apiReady;

  // В Electron используем безопасный IPC proxy
  if (window.electronAPI && window.electronAPI.apiRequest) {
    try {
      const result = await window.electronAPI.apiRequest({
        path: endpoint,
        method: options.method || 'GET',
        body: options.body,
        headers: options.headers || {}
      });

      if (!result.ok) {
        console.error('API request failed:', endpoint, result.status, result.data);
        if (result.status === 401 && !isAuthEntryEndpoint(endpoint)) {
          // Авторизованный запрос с протухшим токеном — чистим и
          // мягко выкидываем на экран логина. БЕЗ reload, чтобы не было
          // циклов перезагрузки при долгоживущих сбоях.
          await clearAuthToken();
          localStorage.removeItem('user');
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
      if (error.status) throw error;
      
      // Иначе это сетевая ошибка
      console.error('Network error:', error.message);
      throw new Error('Сервер недоступен. Проверьте подключение к интернету или подождите — сервер может загружаться.');
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
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });
  } catch (networkError) {
    console.error('Network error:', networkError.message, 'URL:', `${API_BASE}${endpoint}`);
    throw new Error('Сервер недоступен. Проверьте подключение к интернету или подождите — сервер может загружаться.');
  }

  let data;
  try {
    data = await response.json();
  } catch (e) {
    if (!response.ok) {
      const error = new Error(`Сервер недоступен или загружается (Ожидайте...)`);
      error.status = response.status;
      throw error;
    }
    throw new Error('Ошибка формата ответа от сервера');
  }

  if (!response.ok) {
    if (response.status === 401 && !isAuthEntryEndpoint(endpoint)) {
      await clearAuthToken();
      localStorage.removeItem('user');
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
        throw new Error(result.data?.message || 'Ошибка загрузки');
      }
      
      return result.data;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    }
  }
  
  // Fallback для веб-версии (не Electron)
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: method,
    headers: {
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    },
    body: formData
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.message || 'Ошибка загрузки');
  return data;
}

// ===== AUTH API =====
const AuthAPI = {
  register: (username, email, password) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) }),

  login: (email, password) =>
    apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    
  verifyOtp: (email, code) =>
    apiFetch('/auth/verify-otp', { method: 'POST', body: JSON.stringify({ email, code }) }),

  verifyTwoFactor: (pendingToken, code) =>
    apiFetch('/auth/verify-2fa', { method: 'POST', body: JSON.stringify({ pendingToken, code }) }),
    
  resendOtp: (email) =>
    apiFetch('/auth/resend-otp', { method: 'POST', body: JSON.stringify({ email }) }),
    
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
    apiFetch(`/auth/login-logs/${logId}`, { method: 'DELETE' })
};

// ===== USERS API =====
const UsersAPI = {
  search: (query) =>
    apiFetch(`/users/search?q=${encodeURIComponent(query)}`),

  getUser: (userId) =>
    apiFetch(`/users/${userId}`),

  updateProfile: (data) =>
    apiFetch('/users/profile', { method: 'PUT', body: JSON.stringify(data) }),

  uploadAvatar: (file) => {
    const formData = new FormData();
    formData.append('avatar', file);
    return apiUpload('/users/avatar', formData, 'PUT');
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

  send: (channelId, content, replyTo) =>
    apiFetch(`/messages/${channelId}`, { method: 'POST', body: JSON.stringify({ content, replyTo }) }),

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
