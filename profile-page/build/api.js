/**
 * Разговор редактора с сервером.
 *
 * Здесь живёт токен редактора — узкий (`aud: 'profile-editor'`, 30 минут) и
 * умеющий ровно одно: править свою страницу. Полного токена аккаунта на этом
 * домене нет и быть не должно; см. комментарий в server/routes/profilePages.js.
 *
 * Токен лежит в sessionStorage, а не в переменной модуля. Причина простая:
 * иначе любое обновление страницы (F5, «вернуться назад») выбрасывало бы из
 * редактора с требованием пароля — одноразовый код уже сгорел, повторно его не
 * обменять. И не в localStorage: sessionStorage умирает вместе с вкладкой, то
 * есть закрыл вкладку — сессии нет, даже если 30 минут не вышли.
 */

const BASE = '/api/profile-page';
const STORE_KEY = 'love.profile-editor.session';

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, errors = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.errors = errors;
  }
}

let session = null; // { token, expiresAt }

function persist() {
  try {
    if (session) sessionStorage.setItem(STORE_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STORE_KEY);
  } catch (_) {
    // Приватный режим Safari умеет запрещать запись. Работать в памяти — не
    // повод падать, просто F5 попросит войти заново.
  }
}

/** Достаёт сессию из прошлой загрузки страницы. Просроченную выбрасывает. */
export function restoreSession() {
  try {
    const raw = sessionStorage.getItem(STORE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved.token !== 'string' || !(saved.expiresAt > Date.now())) {
      session = null;
      persist();
      return false;
    }
    session = { token: saved.token, expiresAt: saved.expiresAt };
    return true;
  } catch (_) {
    session = null;
    return false;
  }
}

function setSession(token, expiresInSeconds) {
  // Минута форы: если токен истечёт по дороге, лучше показать экран входа
  // заранее, чем дать человеку набрать текст и получить 401 при сохранении.
  const ttl = Math.max(0, (Number(expiresInSeconds) || 0) * 1000 - 60_000);
  session = { token, expiresAt: Date.now() + ttl };
  persist();
}

export function clearSession() {
  session = null;
  persist();
}

export function hasSession() {
  return Boolean(session && session.expiresAt > Date.now());
}

/** Сколько осталось до конца сессии, мс. */
export function sessionLeft() {
  return session ? Math.max(0, session.expiresAt - Date.now()) : 0;
}

/**
 * Ошибки сервера приходят как {message, code} — по возможности показываем
 * именно их текст: он на русском и написан для человека. Своё сообщение
 * подставляем только когда ответ нечитаемый (упал прокси, обрыв сети).
 */
async function parse(response) {
  let data = null;
  try {
    data = await response.json();
  } catch (_) {
    data = null;
  }
  if (response.ok) return data;

  if (response.status === 401 && data && data.code === 'EDITOR_SESSION_EXPIRED') {
    clearSession();
  }
  const message = (data && data.message)
    || (response.status === 429 ? 'Слишком часто. Подождите немного.' : null)
    || (response.status >= 500 ? 'Сервер не ответил. Попробуйте ещё раз.' : 'Не получилось.');
  throw new ApiError(message, {
    status: response.status,
    code: (data && data.code) || null,
    errors: (data && data.errors) || null
  });
}

async function send(path, { method = 'GET', body, auth = true, formData } = {}) {
  if (auth && !hasSession()) {
    throw new ApiError('Сессия редактора истекла.', { status: 401, code: 'EDITOR_SESSION_EXPIRED' });
  }
  const headers = {};
  if (auth && session) headers.Authorization = `Bearer ${session.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), formData ? 60000 : 25000);
  try {
    response = await fetch(BASE + path, {
      method,
      headers,
      body: formData || (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal
    });
    return await parse(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(controller.signal.aborted ? 'Сервер отвечает дольше обычного. Правки остаются в редакторе.' : 'Нет связи с сервером. Правки остаются в редакторе.', { status: 0 });
  } finally { clearTimeout(timer); }
}

// --- вход -------------------------------------------------------------------

/**
 * Обмен одноразового кода из приложения на токен редактора.
 * Код сгорает на сервере при первой же попытке — повторить нельзя.
 */
export async function exchangeCode(code) {
  const data = await send('/session', { method: 'POST', auth: false, body: { code } });
  setSession(data.token, data.expiresIn);
  return data;
}

/** Запасной вход по паролю: когда ссылку открыли не на том устройстве. */
export async function loginWithPassword(login, password) {
  const data = await send('/login', { method: 'POST', auth: false, body: { login, password } });
  setSession(data.token, data.expiresIn);
  return data;
}

// --- данные -----------------------------------------------------------------

export const api = {
  page: () => send('/'),
  capabilities: () => send('/capabilities'),
  save: (patch) => send('/', { method: 'PUT', body: patch }),
  preview: (patch) => send('/preview', { method: 'POST', body: patch || {} }),
  enable: () => send('/enable', { method: 'POST' }),
  disable: () => send('/disable', { method: 'POST' }),
  stats: () => send('/stats'),
  resolveFriend: (username) => send('/resolve-friend', { method: 'POST', body: { username } }),

  /** Загрузка файла в слот (avatar | banner | background | music | og). */
  upload(slot, file) {
    const form = new FormData();
    form.append('file', file);
    return send(`/asset?slot=${encodeURIComponent(slot)}`, { method: 'POST', formData: form });
  }
};
