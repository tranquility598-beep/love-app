/**
 * Push-уведомления на Android через Firebase Cloud Messaging (HTTP v1).
 *
 * Зачем это вообще: socket.io держит соединение, только пока жив процесс
 * приложения. Когда Android его убивает (человек смахнул приложение или
 * система освободила память), события до телефона не доходят вообще —
 * ни сообщения, ни входящий звонок. Разбудить убитое приложение может
 * только системная служба Google, поэтому сервер отправляет ей запрос по
 * токену устройства; сервисы Google сами решают, показать уведомление или
 * поднять приложение.
 *
 * Оплаты здесь нет: FCM бесплатен, а Cloud Functions нам не нужны —
 * отправка идёт прямо из этого файла обычным HTTPS-запросом с ключом
 * сервисного аккаунта (Firebase → Настройки проекта → Сервисные аккаунты).
 *
 * Без ключа модуль не падает и ничего не ломает: isConfigured() === false,
 * отправка превращается в пустую операцию. Так локальный сервер и тесты
 * работают как обычно.
 */

const fs = require('node:fs');
const jwt = require('jsonwebtoken');

const PushToken = require('../models/PushToken');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

// Канал уведомлений на телефоне (AndroidNotificationChannel в Flutter-клиенте).
const CHANNEL_MESSAGES = 'love_messages';
const CHANNEL_CALLS = 'love_calls';

let credentials = null;
let credentialsLoaded = false;
let accessToken = null;
let accessTokenExpiresAt = 0;
let accessTokenPromise = null;
let missingCredentialsLogged = false;

/**
 * Ключ сервисного аккаунта: переменная окружения содержит либо JSON целиком,
 * либо путь к файлу. Файл в репозиторий не кладём — это секрет.
 */
function readCredentials() {
  if (credentialsLoaded) return credentials;
  credentialsLoaded = true;

  const raw = process.env.FCM_SERVICE_ACCOUNT || '';
  const file = process.env.FCM_SERVICE_ACCOUNT_FILE || '';
  try {
    if (raw.trim().startsWith('{')) {
      credentials = JSON.parse(raw);
    } else if (file) {
      credentials = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (error) {
    console.error('[push] не удалось прочитать ключ сервисного аккаунта:', error.message);
    credentials = null;
  }
  return credentials;
}

function isConfigured() {
  const creds = readCredentials();
  if (creds && creds.client_email && creds.private_key && projectId()) return true;

  if (!missingCredentialsLogged && creds !== null) {
    console.warn('[push] ключ FCM неполный — push выключен');
    missingCredentialsLogged = true;
  }
  return false;
}

function projectId() {
  const creds = readCredentials();
  return creds?.project_id || process.env.FCM_PROJECT_ID || '';
}

/** Access token Google (OAuth2 JWT-bearer), кешируется на час. */
async function getAccessToken() {
  if (accessToken && Date.now() < accessTokenExpiresAt) return accessToken;
  if (accessTokenPromise) return accessTokenPromise;

  const creds = readCredentials();
  if (!creds?.client_email || !creds?.private_key) return null;

  accessTokenPromise = (async () => {
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
      {
        iss: creds.client_email,
        scope: SCOPE,
        aud: TOKEN_URL,
        iat: now,
        exp: now + 3600
      },
      creds.private_key,
      { algorithm: 'RS256' }
    );

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion
      }).toString()
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      throw new Error(`Google token ${response.status}: ${data.error_description || data.error || 'нет ответа'}`);
    }

    accessToken = data.access_token;
    // Запас 60 с: не отправлять запрос ровно на истечении.
    accessTokenExpiresAt = Date.now() + Math.max(0, (Number(data.expires_in) || 3600) - 60) * 1000;
    return accessToken;
  })();

  try {
    return await accessTokenPromise;
  } finally {
    accessTokenPromise = null;
  }
}

/**
 * Одно сообщение одному токену.
 *
 * kind 'call' — data-only с высоким приоритетом: приложение само показывает
 * полноэкранный вызов (обычная плашка FCM не умеет fullScreenIntent).
 * kind 'message' — обычное уведомление в канал сообщений.
 */
async function sendToToken(token, message) {
  const tokenValue = await getAccessToken();
  if (!tokenValue) return { ok: false, reason: 'no-credentials' };

  const body = {
    message: {
      token,
      android: {
        priority: 'high',
        ttl: message.ttl || '600s'
      }
    }
  };

  const data = {};
  for (const [key, value] of Object.entries(message.data || {})) {
    if (value == null) continue;
    data[key] = String(value);
  }

  if (message.kind === 'call') {
    // Только данные: уведомление строит клиент, чтобы показать звонок
    // поверх экрана блокировки.
    body.message.data = data;
  } else {
    body.message.notification = {
      title: message.title || 'Love',
      body: message.body || ''
    };
    body.message.data = data;
    body.message.android.notification = {
      channel_id: message.channelId || CHANNEL_MESSAGES,
      tag: message.tag || undefined
    };
  }

  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId()}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${tokenValue}`,
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  );

  if (response.ok) return { ok: true };

  const error = await response.json().catch(() => ({}));
  const status = error?.error?.status || '';
  return { ok: false, status, httpStatus: response.status, reason: error?.error?.message || status };
}

/** Токен недействителен — устройство удалило приложение или перевыпустило токен. */
function isDeadToken(result) {
  if (result?.ok) return false;
  return result?.httpStatus === 404
    || result?.status === 'UNREGISTERED'
    || result?.status === 'NOT_FOUND'
    || result?.status === 'INVALID_ARGUMENT';
}

/**
 * Отправка списку токенов. Мёртвые токены удаляются из базы: иначе они
 * копятся и каждый push тратит на них запрос.
 */
async function sendToTokens(tokens, message) {
  const list = (Array.isArray(tokens) ? tokens : []).filter(Boolean);
  if (!list.length) return { sent: 0, removed: 0 };
  if (!isConfigured()) return { sent: 0, removed: 0, skipped: true };

  const dead = [];
  let sent = 0;
  await Promise.all(list.map(async token => {
    try {
      const result = await sendToToken(token, message);
      if (result.ok) {
        sent += 1;
      } else if (isDeadToken(result)) {
        dead.push(token);
      } else if (result.reason) {
        console.warn('[push] отправка не удалась:', result.reason);
      }
    } catch (error) {
      // Сеть, таймаут, отказ Google — push не должен ломать основной поток.
      console.warn('[push] отправка не удалась:', error.message);
    }
  }));

  if (dead.length) {
    try {
      await PushToken.deleteMany({ token: { $in: dead } });
    } catch (error) {
      console.warn('[push] не удалось удалить мёртвые токены:', error.message);
    }
  }

  return { sent, removed: dead.length };
}

/** Отправка человеку на все его устройства. */
async function sendToUser(userId, message) {
  if (!userId || !isConfigured()) return { sent: 0, removed: 0 };
  try {
    const rows = await PushToken.find({ user: userId }).select('token').lean();
    return await sendToTokens(rows.map(row => row.token), message);
  } catch (error) {
    console.warn('[push] не удалось получить токены:', error.message);
    return { sent: 0, removed: 0 };
  }
}

/**
 * Новое сообщение. Заголовок — имя отправителя, текст — превью.
 * Клиент по data.type='new_dm' открывает нужный диалог.
 */
function sendMessagePush(userId, { title, body, conversationId, channelId, messageId }) {
  return sendToUser(userId, {
    kind: 'message',
    title: title || 'Love',
    body: body || '',
    channelId: CHANNEL_MESSAGES,
    data: {
      type: 'new_dm',
      conversationId,
      channelId,
      messageId
    }
  });
}

/**
 * Входящий звонок. Приложение поднимает полноэкранный вызов; если оно не
 * успело (телефон в глубоком сне) — покажет уведомление с «Принять»/«Отклонить».
 */
function sendCallPush(userId, { callerName, callerId, conversationId, channelId, kind }) {
  return sendToUser(userId, {
    kind: 'call',
    channelId: CHANNEL_CALLS,
    // Звонок живёт 45 с (RING_TIMEOUT_MS); после этого FCM уже не нужен.
    ttl: '45s',
    data: {
      type: 'incoming_call',
      callerName,
      callerId,
      conversationId,
      channelId,
      callKind: kind === 'video' ? 'video' : 'audio'
    }
  });
}

/** Пропущенный звонок — обычное уведомление, когда звонок уже не ждёт ответа. */
function sendMissedCallPush(userId, { callerName, conversationId, channelId, kind }) {
  const video = kind === 'video';
  return sendToUser(userId, {
    kind: 'message',
    title: video ? 'Пропущенный видеозвонок' : 'Пропущенный звонок',
    body: callerName ? `от ${callerName}` : '',
    channelId: CHANNEL_CALLS,
    data: {
      type: 'missed_call',
      conversationId,
      channelId
    }
  });
}

/** Только для тестов: сбросить кеши, чтобы подменить окружение. */
function __resetForTests() {
  credentials = null;
  credentialsLoaded = false;
  accessToken = null;
  accessTokenExpiresAt = 0;
  accessTokenPromise = null;
  missingCredentialsLogged = false;
}

module.exports = {
  isConfigured,
  getAccessToken,
  sendToTokens,
  sendToUser,
  sendMessagePush,
  sendCallPush,
  sendMissedCallPush,
  __resetForTests
};