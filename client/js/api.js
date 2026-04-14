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

// Базовый fetch с авторизацией
async function apiFetch(endpoint, options = {}) {
  await window.apiReady;
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
    // Ошибка сети (сервер недоступен, нет интернета)
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
    if (response.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.reload();
    }
    const error = new Error(data.message || 'Ошибка запроса');
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

// Загрузка файла
async function apiUpload(endpoint, formData, method = 'POST') {
  await window.apiReady;
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
    
  resendOtp: (email) =>
    apiFetch('/auth/resend-otp', { method: 'POST', body: JSON.stringify({ email }) }),
    
  forgotPassword: (email) =>
    apiFetch('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
    
  resetPassword: (email, code, newPassword) =>
    apiFetch('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, code, newPassword }) }),

  logout: () =>
    apiFetch('/auth/logout', { method: 'POST' }),

  getMe: () =>
    apiFetch('/auth/me'),

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
