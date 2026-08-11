/**
 * Rate Limiting Middleware
 * Защита от DDoS и брутфорс атак
 */

const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../utils/jwtSecret');

const JWT_SECRET = getJwtSecret();

/**
 * Дешёвое опознание пользователя ДО authMiddleware.
 *
 * generalLimiter подключён на app.use('/api', ...) — то есть выполняется
 * раньше, чем роут доберётся до authMiddleware. Поэтому req.user там был
 * всегда undefined, и вся «лимитим по userId» логика никогда не работала:
 * счётчик всегда шёл по IP. За одним NAT это значило общий лимит на всех.
 *
 * Здесь только verify подписи, без запроса в БД: цель — получить ключ для
 * счётчика, а не авторизовать. Настоящая проверка сессии и бана остаётся
 * в authMiddleware.
 */
function attachRateLimitIdentity(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(authHeader.substring(7), JWT_SECRET);
      if (decoded && decoded.userId) {
        req.rateLimitUserId = String(decoded.userId);
      }
    } catch (_) {
      // Битый/просроченный токен — лимитим по IP, ошибку отдаст authMiddleware.
    }
  }
  next();
}

// Общий лимит для API.
// ВАЖНО: лимит должен быть адекватным для Electron-клиента. В обычной
// сессии клиент дёргает /auth/me, /auth/socket-token, /servers,
// /servers/rooms, /channels/:id, /messages/:channelId на каждое
// переключение канала / комнаты / сервера. Старый лимит 150/15мин
// съедался за пару минут активного использования и приводил к 429.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 600, // 600 запросов в минуту = 10 rps — с запасом на reconnect-штормы и быстрое переключение каналов
  message: { message: 'Слишком много запросов с этого IP, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false,
  // Лимитим по userId, если запрос авторизован — иначе несколько юзеров за
  // одним NAT/корпоративным IP делят один счётчик и быстро упираются.
  // Для неавторизованных запросов используем IP (стандарт).
  keyGenerator: (req, res) => {
    if (req.rateLimitUserId) return `u:${req.rateLimitUserId}`;
    if (req.user && req.user._id) return `u:${req.user._id}`;
    // Используем хелпер библиотеки для корректной нормализации IPv6 (/64 префикс).
    return ipKeyGenerator(req, res);
  },
  // Не считаем поллинговые/служебные endpoint'ы.
  //
  // Раньше здесь пропускались ВСЕ GET на /messages/, /servers/, /channels/,
  // /dm/ — то есть выкачивание всей истории и поиск по сообщениям не
  // лимитировались вообще. Оставляем только точечные лёгкие маршруты;
  // чтение сообщений теперь считается как обычный запрос (600/мин с запасом
  // хватает даже на быстрое перещёлкивание каналов).
  skip: (req) => {
    const p = req.path || '';
    if (p === '/health' || p === '/auth/me' || p === '/auth/socket-token') return true;
    if (req.method === 'GET') {
      return p === '/friends' || p === '/dm' || p === '/servers';
    }
    return false;
  },
  handler: (req, res) => {
    console.warn(`⚠️  Rate limit exceeded for IP: ${req.ip} on ${req.method} ${req.originalUrl}`);
    res.status(429).json({
      message: 'Слишком много запросов с этого IP, попробуйте позже',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

// Строгий лимит для авторизации (login)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10, // 10 попыток
  message: { message: 'Слишком много попыток входа, попробуйте через 15 минут' },
  handler: (req, res) => {
    console.warn(`⚠️  Auth rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ 
      message: 'Слишком много попыток входа, попробуйте через 15 минут' 
    });
  }
});

// Лимит для регистрации
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 5, // 5 попыток
  message: { message: 'Слишком много попыток регистрации, попробуйте через час' },
  handler: (req, res) => {
    console.warn(`⚠️  Register rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ 
      message: 'Слишком много попыток регистрации, попробуйте через час' 
    });
  }
});

// Лимит для сообщений
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 60, // 60 сообщений в минуту (1 в секунду)
  message: { message: 'Слишком быстро отправляете сообщения, подождите немного' },
  handler: (req, res) => {
    console.warn(`⚠️  Message rate limit exceeded for user: ${req.user?._id || req.ip}`);
    res.status(429).json({ 
      message: 'Слишком быстро отправляете сообщения, подождите немного' 
    });
  }
});

// Лимит для загрузки файлов
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 минут
  max: 20, // 20 файлов
  message: { message: 'Слишком много загрузок файлов, попробуйте позже' },
  handler: (req, res) => {
    console.warn(`⚠️  Upload rate limit exceeded for user: ${req.user?._id || req.ip}`);
    res.status(429).json({ 
      message: 'Слишком много загрузок файлов, попробуйте позже' 
    });
  }
});

// Лимит для OTP операций
const otpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10, // 10 попыток
  message: { message: 'Слишком много попыток ввода кода, попробуйте позже' },
  handler: (req, res) => {
    console.warn(`⚠️  OTP rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ 
      message: 'Слишком много попыток ввода кода, попробуйте позже' 
    });
  }
});

// Лимит для сброса пароля
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 5, // 5 попыток
  message: { message: 'Слишком много попыток сброса пароля, попробуйте через час' },
  handler: (req, res) => {
    console.warn(`⚠️  Password reset rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({ 
      message: 'Слишком много попыток сброса пароля, попробуйте через час' 
    });
  }
});

// Лимит для публичных HTML-страниц вне /api (страница приглашения).
// Она без авторизации ходит в базу, поэтому считаем по IP отдельно от
// generalLimiter: 60 открытий в минуту хватает живому человеку с запасом,
// а перебор инвайт-кодов при таком темпе бессмыслен (кодов 16^8).
const publicPageLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`⚠️  Public page rate limit exceeded for IP: ${req.ip} on ${req.originalUrl}`);
    res.status(429).type('text/plain; charset=utf-8').send('Слишком много запросов, попробуйте позже');
  }
});

module.exports = {
  attachRateLimitIdentity,
  generalLimiter,
  authLimiter,
  registerLimiter,
  messageLimiter,
  uploadLimiter,
  otpLimiter,
  passwordResetLimiter,
  publicPageLimiter
};
