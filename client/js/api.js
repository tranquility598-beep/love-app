let isPackaged = false;
try {
  if (window.electronAPI && window.electronAPI.isPackagedSync) {
    isPackaged = window.electronAPI.isPackagedSync();
  } else if (!window.electronAPI) {
    // Fallback if opened in a regular web browser (e.g. hosted on Vercel/Netlify)
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const isFileProtocol = window.location.protocol === 'file:';
    if (!isLocalhost && !isFileProtocol) {
      isPackaged = true; // Use production API if hosted anywhere else
    }
  }
} catch (e) {
  console.error('Failed to get app mode synchronously:', e);
}

window.BASE_URL = isPackaged ? 'https://love-app-2ou3.onrender.com' : 'http://localhost:5555';
let API_BASE = window.BASE_URL + '/api';

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
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

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
    const error = new Error(data.message || 'Ошибка запроса');
    error.status = response.status;
    throw error;
  }

  return data;
}

// Загрузка файла
async function apiUpload(endpoint, formData) {
  await window.apiReady;
  const token = localStorage.getItem('token');
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
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

  logout: () =>
    apiFetch('/auth/logout', { method: 'POST' }),

  getMe: () =>
    apiFetch('/auth/me'),

  updateStatus: (status, customStatus) =>
    apiFetch('/auth/update-status', { method: 'PUT', body: JSON.stringify({ status, customStatus }) })
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
    return apiUpload('/upload/avatar', formData);
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
    return apiUpload(`/servers/${serverId}/icon`, formData);
  }
};

// ===== CHANNELS API =====
const ChannelsAPI = {
  create: (name, type, serverId, topic, category) =>
    apiFetch('/channels', { method: 'POST', body: JSON.stringify({ name, type, serverId, topic, category }) }),

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
  }
};
