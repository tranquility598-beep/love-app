import axios from 'axios';

const localDevelopment = window.location.hostname === 'localhost'
  || window.location.hostname === '127.0.0.1';

// Production uses a same-origin reverse proxy on admin.loveapp.chat. Keeping
// UI, API, SSE and Socket.IO on one origin avoids cross-site cookies and CORS.
// The legacy api.loveapp.chat/admin path also remains same-origin.
export const API_ORIGIN = import.meta.env.VITE_API_URL
  || (localDevelopment ? `http://${window.location.hostname}:5555` : window.location.origin);

export const api = axios.create({
  baseURL: `${API_ORIGIN}/api/admin`,
  withCredentials: true,
  timeout: 20000
});

api.interceptors.request.use(config => {
  const csrfToken = sessionStorage.getItem('loveAdminCsrf');
  if (csrfToken && !['get', 'head', 'options'].includes(config.method?.toLowerCase())) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

export function errorMessage(error, fallback = 'Не удалось выполнить запрос') {
  return error?.response?.data?.message || error?.message || fallback;
}

export function storeCsrf(csrfToken) {
  if (csrfToken) sessionStorage.setItem('loveAdminCsrf', csrfToken);
  else sessionStorage.removeItem('loveAdminCsrf');
}
