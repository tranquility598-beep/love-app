/**
 * API модуль
 * Все HTTP запросы к backend серверу
 */

const API_BASE = 'https://love-app-2ou3.onrender.com/api';

// Получаем токен из localStorage
function getToken() {
  return localStorage.getItem('token');
}

// Базовый fetch с авторизацией
async function apiFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const data = await response.json();

  if (!response.ok) {
    const error = new Error(data.message || 'Ошибка запроса');
    error.status = response.status;
    throw error;
  }

  return data;
}

// Загрузка файла
async function apiUpload(endpoint, formData) {
  const token = getToken();
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
