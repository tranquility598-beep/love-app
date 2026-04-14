/**
 * Rate Limiting Middleware
 * Защита от DDoS и брутфорс атак
 */

const rateLimit = require('express-rate-limit');

// Общий лимит для API
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 150, // 150 запросов
  message: { message: 'Слишком много запросов с этого IP, попробуйте позже' },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`⚠️  Rate limit exceeded for IP: ${req.ip}`);
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
  skipSuccessfulRequests: true, // Не считаем успешные попытки
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

module.exports = {
  generalLimiter,
  authLimiter,
  registerLimiter,
  messageLimiter,
  uploadLimiter,
  otpLimiter,
  passwordResetLimiter
};
