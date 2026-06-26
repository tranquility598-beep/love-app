/**
 * Роуты авторизации
 * Регистрация, вход, выход, обновление токена
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const axios = require('axios');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { authLimiter, registerLimiter, otpLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');
const { validateEmail, validateUsername, validatePassword, sanitizeBody } = require('../middleware/validation');

const JWT_SECRET = process.env.JWT_SECRET || 'love-app-secret-key-2024';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';
const TWO_FACTOR_TOKEN_EXPIRES = '10m';

const { generateOTP, sendOTPEmail, sendPasswordResetEmail } = require('../utils/emailService');
const LoginLog = require('../models/LoginLog');
const { isFounderUser } = require('../utils/founder');

// Регулярка для пароля: минимум 8 символов, 1 буква и 1 цифра
const passwordRegex = /^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/;

function getPublicAppUrl(req) {
  const envUrl = process.env.PUBLIC_APP_URL || process.env.APP_URL || process.env.CLIENT_URL || process.env.SITE_URL;
  if (envUrl) return String(envUrl).replace(/\/+$/, '');
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host') || 'loveapp.chat';
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function buildResetPasswordUrl(req, email, code) {
  const base = getPublicAppUrl(req);
  const params = new URLSearchParams({ email, code });
  return `${base}/reset-password?${params.toString()}`;
}

function normalizeIp(ip) {
  if (!ip || typeof ip !== 'string') return 'unknown';
  const value = ip.split(',')[0].trim().replace(/^::ffff:/, '');
  if (value.includes(':') && value.lastIndexOf(':') > value.indexOf(':') && !value.includes('::')) {
    return value.slice(0, value.lastIndexOf(':'));
  }
  return value;
}

function isLocalIp(ip) {
  return ['::1', '127.0.0.1', 'localhost', 'unknown'].includes(ip) || ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip);
}

function getClientIp(req) {
  const forwarded = [
    req.headers['cf-connecting-ip'],
    req.headers['x-real-ip'],
    req.headers['x-forwarded-for'],
    req.ip,
    req.socket?.remoteAddress
  ].filter(Boolean).flatMap(value => String(value).split(',').map(normalizeIp));

  return forwarded.find(ip => ip && !isLocalIp(ip)) || forwarded[0] || 'unknown';
}

function buildAuthUser(user, extra = {}) {
  return {
    ...user.toPublicJSON(),
    ...extra,
    email: user.email,
    hasPassword: Boolean(user.password),
    hasGoogle: Boolean(user.googleId),
    isFounder: isFounderUser(user)
  };
}

async function getPublicNetworkInfo() {
  try {
    const response = await axios.get('http://ip-api.com/json/?fields=status,query,country,city');
    if (response.data.status === 'success') {
      return {
        ip: response.data.query || 'unknown',
        location: [response.data.city, response.data.country].filter(Boolean).join(', ') || 'Неизвестно'
      };
    }
  } catch (error) {
    console.error('Public IP Error:', error.message);
  }
  return { ip: 'unknown', location: 'Неизвестно' };
}

/**
 * Получение местоположения по IP
 */
async function getGeoLocation(ip) {
  try {
    if (isLocalIp(normalizeIp(ip))) return 'Локальная сеть (Local)';
    
    const response = await axios.get(`http://ip-api.com/json/${ip}?fields=status,message,country,city`);
    if (response.data.status === 'success') {
      return `${response.data.city}, ${response.data.country}`;
    }
    return 'Неизвестно';
  } catch (error) {
    console.error('GeoIP Error:', error.message);
    return 'Неизвестно';
  }
}

async function getLoginNetworkInfo(req) {
  const ip = getClientIp(req);
  if (isLocalIp(ip)) return getPublicNetworkInfo();
  return { ip, location: await getGeoLocation(ip) };
}

/**
 * POST /api/auth/register
 * Регистрация нового пользователя с OTP
 */
router.post('/register', registerLimiter, sanitizeBody, validateEmail, validateUsername, validatePassword, async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Валидация
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Все поля обязательны' });
    }
    
    // Проверка сложности пароля
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ 
        message: 'Пароль должен быть не менее 8 символов и содержать хотя бы одну букву и одну цифру' 
      });
    }
    
    // Проверяем существование пользователя
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });
    
    const COOLDOWN_MS = 60 * 1000;
    
    if (existingUser) {
      // Если пользователь есть но не верифицирован — проверяем кулдаун, затем удаляем и создаем заново
      if (!existingUser.isVerified) {
        if (existingUser.otpLastSentAt && (Date.now() - existingUser.otpLastSentAt.getTime() < COOLDOWN_MS)) {
          const retryAfter = Math.ceil((COOLDOWN_MS - (Date.now() - existingUser.otpLastSentAt.getTime())) / 1000);
          return res.status(429).json({ code: 'OTP_COOLDOWN', message: 'Слишком частые запросы', retryAfter });
        }
        await User.deleteOne({ _id: existingUser._id });
      } else {
        if (existingUser.email === email.toLowerCase()) {
          return res.status(400).json({ message: 'Email уже используется' });
        }
        return res.status(400).json({ message: 'Имя пользователя уже занято' });
      }
    }
    
    // Генерация OTP
    const otp = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 минут
    
    // Если это самый первый пользователь, он становится Создателем (owner)
    const userCount = await User.countDocuments();
    const role = userCount === 0 ? 'owner' : 'user';
    
    // Создаем пользователя (пока не верифицирован)
    const user = new User({
      username,
      email: email.toLowerCase(),
      password,
      role,
      otpCode: otp,
      otpExpires,
      isVerified: false,
      onboardingPending: true
    });
    
    await user.save();
    
    // Отправляем OTP на почту
    const emailSent = await sendOTPEmail(user.email, otp, 'verification');
    
    if (!emailSent) {
      return res.status(500).json({ message: 'Ошибка отправки письма. Проверьте настройки Gmail.' });
    }
    
    user.otpLastSentAt = new Date();
    await user.save();
    
    res.status(201).json({
      message: 'OTP отправлен на вашу почту',
      requireVerification: true,
      email: user.email
    });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Ошибка сервера при регистрации' });
  }
});

/**
 * POST /api/auth/verify-otp
 * Верификация по коду
 */
router.post('/verify-otp', otpLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    
    const user = await User.findOne({ 
      email: email.toLowerCase(),
      otpCode: code,
      otpExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ message: 'Неверный или истекший код' });
    }
    
    // Верифицируем пользователя
    user.isVerified = true;
    user.status = 'online';
    user.statusPreference = 'online';
    user.otpCode = null;
    user.otpExpires = null;
    const shouldStartOnboarding = Boolean(user.onboardingPending);
    user.onboardingPending = false;
    await user.save();
    
    // Логируем успешный вход (после верификации)
    const userAgent = req.headers['user-agent'] || 'unknown';
    const { ip, location } = await getLoginNetworkInfo(req);
    
    const log = await LoginLog.create({
      userId: user._id,
      email: user.email,
      ip,
      userAgent,
      location,
      loginMethod: 'password',
      status: 'success'
    });
    
    // Создаем JWT токен с ID сессии (sid)
    const token = jwt.sign(
      { userId: user._id, sid: log._id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    
    res.json({
      message: 'Почта подтверждена',
      token,
      user: buildAuthUser(user, { onboardingPending: shouldStartOnboarding })
    });
    
  } catch (error) {
    res.status(500).json({ message: 'Ошибка при верификации' });
  }
});

/**
 * POST /api/auth/resend-otp
 * Повторная отправка кода
 */
router.post('/resend-otp', otpLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    
    const COOLDOWN_MS = 60 * 1000;
    if (user.otpLastSentAt && (Date.now() - user.otpLastSentAt.getTime() < COOLDOWN_MS)) {
      const retryAfter = Math.ceil((COOLDOWN_MS - (Date.now() - user.otpLastSentAt.getTime())) / 1000);
      return res.status(429).json({ code: 'OTP_COOLDOWN', message: 'Слишком частые запросы', retryAfter });
    }
    
    const otp = generateOTP();
    user.otpCode = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    
    const emailSent = await sendOTPEmail(user.email, otp, 'verification');
    if (!emailSent) {
      return res.status(500).json({ message: 'Ошибка отправки письма. Проверьте настройки SMTP.' });
    }
    
    user.otpLastSentAt = new Date();
    await user.save();
    
    res.json({ message: 'Новый код отправлен' });
    
  } catch (error) {
    res.status(500).json({ message: 'Ошибка отправки кода' });
  }
});

/**
 * POST /api/auth/login
 * Вход в аккаунт
 */
router.post('/login', authLimiter, sanitizeBody, validateEmail, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ message: 'Email и пароль обязательны' });
    }
    
    // Находим пользователя
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(401).json({ message: 'Неверный email или пароль' });
    }

    if (user.isBanned) {
      return res.status(403).json({ 
        message: `Ваш аккаунт заблокирован${user.banReason ? ': ' + user.banReason : ''}`,
        isBanned: true,
        reason: user.banReason || ''
      });
    }

    // --- ЛОГИКА БЛОКИРОВКИ (Account Lockout) ---
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const remainingMinutes = Math.ceil((user.lockUntil - Date.now()) / (60 * 1000));
      return res.status(403).json({ 
        message: `Аккаунт временно заблокирован из-за множества ошибок входа. Попробуйте через ${remainingMinutes} мин.` 
      });
    }
    
    // Проверяем пароль
    const isPasswordValid = await user.comparePassword(password);
    
    const userAgent = req.headers['user-agent'] || 'unknown';
    const { ip, location } = await getLoginNetworkInfo(req);

    if (!isPasswordValid) {
      // Увеличиваем счетчик ошибок
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      
      let message = 'Неверный email или пароль';
      
      if (user.loginAttempts >= 5) {
        user.lockUntil = new Date(Date.now() + 30 * 60 * 1000); // Блок на 30 мин
        user.loginAttempts = 0; // Сбрасываем счетчик после установки блока
        message = 'Слишком много ошибок входа. Аккаунт заблокирован на 30 минут.';
      }
      
      await user.save();

      // Логируем неудачный вход
      await LoginLog.create({
        userId: user._id,
        email: user.email,
        ip,
        userAgent,
        location,
        loginMethod: 'password',
        status: 'failed'
      });

      return res.status(401).json({ message });
    }
    
    // Сбрасываем попытки при успешном входе
    user.loginAttempts = 0;
    user.lockUntil = null;
    
    // Проверяем верификацию
    if (!user.isVerified) {
      const COOLDOWN_MS = 60 * 1000;
      if (user.otpLastSentAt && (Date.now() - user.otpLastSentAt.getTime() < COOLDOWN_MS)) {
        const retryAfter = Math.ceil((COOLDOWN_MS - (Date.now() - user.otpLastSentAt.getTime())) / 1000);
        return res.status(429).json({ code: 'OTP_COOLDOWN', message: 'Слишком частые запросы', retryAfter });
      }

      const otp = generateOTP();
      user.otpCode = otp;
      user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
      user.onboardingPending = false;
      await user.save();
      const emailSent = await sendOTPEmail(user.email, otp, 'verification');
      if (!emailSent) {
        return res.status(500).json({ message: 'Ошибка отправки письма с кодом подтверждения.' });
      }
      
      user.otpLastSentAt = new Date();
      await user.save();
      
      // Логируем попытку входа (но еще не полноценный вход)
      await LoginLog.create({ userId: user._id, email: user.email, ip, userAgent, location, loginMethod: 'password', status: 'success' });

      return res.status(403).json({ 
        message: 'Почта не подтверждена. Новый код отправлен.',
        requireVerification: true,
        email: user.email
      });
    }
    
    if (user.twoFactorEnabled) {
      const COOLDOWN_MS = 60 * 1000;
      if (user.otpLastSentAt && (Date.now() - user.otpLastSentAt.getTime() < COOLDOWN_MS)) {
        const retryAfter = Math.ceil((COOLDOWN_MS - (Date.now() - user.otpLastSentAt.getTime())) / 1000);
        return res.status(429).json({ code: 'OTP_COOLDOWN', message: 'Слишком частые запросы', retryAfter });
      }

      const code = generateOTP();
      user.twoFactorCode = code;
      user.twoFactorExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      const emailSent = await sendOTPEmail(user.email, code, 'login');
      if (!emailSent) {
        return res.status(500).json({ message: 'Не удалось отправить код входа' });
      }

      user.otpLastSentAt = new Date();
      await user.save();

      const pendingToken = jwt.sign(
        { userId: user._id, purpose: '2fa-login' },
        JWT_SECRET,
        { expiresIn: TWO_FACTOR_TOKEN_EXPIRES }
      );

      return res.json({
        requireTwoFactor: true,
        pendingToken,
        email: user.email,
        message: 'Код входа отправлен на почту'
      });
    }

    user.status = user.statusPreference || 'online';
    user.lastSeen = new Date();
    await user.save();

    // Логируем успешный вход
    const log = await LoginLog.create({
      userId: user._id,
      email: user.email,
      ip,
      userAgent,
      location,
      loginMethod: 'password',
      status: 'success'
    });
    
    // Создаем JWT токен с ID сессии (log._id)
    const token = jwt.sign(
      { userId: user._id, sid: log._id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    
    res.json({
      message: 'Вход выполнен успешно',
      token,
      user: buildAuthUser(user)
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Ошибка сервера при входе' });
  }
});

router.post('/verify-2fa', otpLimiter, async (req, res) => {
  try {
    const { pendingToken, code } = req.body;
    if (!pendingToken || !code) {
      return res.status(400).json({ message: 'Код обязателен' });
    }

    const decoded = jwt.verify(pendingToken, JWT_SECRET);
    if (decoded.purpose !== '2fa-login') {
      return res.status(401).json({ message: 'Недействительный токен подтверждения' });
    }

    const user = await User.findById(decoded.userId);
    if (!user || user.twoFactorCode !== code || !user.twoFactorExpires || user.twoFactorExpires < Date.now()) {
      return res.status(400).json({ message: 'Неверный или истекший код' });
    }

    user.twoFactorCode = null;
    user.twoFactorExpires = null;
    user.status = user.statusPreference || 'online';
    user.lastSeen = new Date();
    await user.save();

    const userAgent = req.headers['user-agent'] || 'unknown';
    const { ip, location } = await getLoginNetworkInfo(req);
    const log = await LoginLog.create({
      userId: user._id,
      email: user.email,
      ip,
      userAgent,
      location,
      loginMethod: 'password',
      status: 'success'
    });

    const token = jwt.sign(
      { userId: user._id, sid: log._id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      message: 'Вход подтвержден',
      token,
      user: buildAuthUser(user)
    });
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Код входа истек. Войдите заново.' });
    }
    console.error('Verify 2FA error:', error);
    res.status(500).json({ message: 'Ошибка проверки 2FA' });
  }
});

/**
 * POST /api/auth/forgot-password
 * Запрос на сброс пароля (отправка OTP)
 */
router.post('/forgot-password', passwordResetLimiter, sanitizeBody, validateEmail, async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (!user) {
      return res.status(404).json({ message: 'Пользователь с такой почтой не найден' });
    }
    
    const COOLDOWN_MS = 60 * 1000;
    if (user.otpLastSentAt && (Date.now() - user.otpLastSentAt.getTime() < COOLDOWN_MS)) {
      const retryAfter = Math.ceil((COOLDOWN_MS - (Date.now() - user.otpLastSentAt.getTime())) / 1000);
      return res.status(429).json({ code: 'OTP_COOLDOWN', message: 'Слишком частые запросы', retryAfter });
    }
    
    const otp = generateOTP();
    user.otpCode = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    
    const resetUrl = buildResetPasswordUrl(req, user.email, otp);
    const emailSent = await sendPasswordResetEmail(user.email, otp, resetUrl);
    if (!emailSent) {
      return res.status(500).json({ message: 'Ошибка отправки письма для восстановления пароля.' });
    }
    
    user.otpLastSentAt = new Date();
    await user.save();
    
    res.json({ message: 'Письмо для восстановления отправлено на почту' });
    
  } catch (error) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/auth/reset-password
 * Сброс пароля по OTP
 */
router.post('/reset-password', otpLimiter, sanitizeBody, validateEmail, validatePassword, async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    
    const user = await User.findOne({ 
      email: email.toLowerCase(),
      otpCode: code,
      otpExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ message: 'Неверный или истекший код' });
    }
    
    // Проверка сложности нового пароля
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ 
        message: 'Новый пароль должен быть не менее 8 символов и содержать хотя бы одну букву и одну цифру' 
      });
    }
    
    // Обновляем пароль и очищаем OTP
    user.password = newPassword;
    user.otpCode = null;
    user.otpExpires = null;
    user.isVerified = true; // Сброс пароля по почте подтверждает владение почтой
    user.onboardingPending = false;
    // Сбрасываем блокировку аккаунта: владелец почты подтверждён, держать
    // его залоченным после успешного сброса пароля бессмысленно.
    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();
    
    res.json({ message: 'Пароль успешно изменен. Теперь вы можете войти.' });
    
  } catch (error) {
    res.status(500).json({ message: 'Ошибка сервера при сбросе пароля' });
  }
});

router.post('/change-password', authMiddleware, sanitizeBody, validatePassword, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ message: 'Новый пароль обязателен' });
    }

    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({
        message: 'Пароль должен быть не менее 8 символов и содержать хотя бы одну букву и одну цифру'
      });
    }

    const user = await User.findById(req.user._id).select('+password');
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (user.password) {
      const isPasswordValid = await user.comparePassword(currentPassword);
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'Текущий пароль указан неверно' });
      }
    }

    user.password = newPassword;
    await user.save();

    res.json({
      user: buildAuthUser(user),
      message: 'Пароль изменен'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Ошибка смены пароля' });
  }
});

router.post('/security/2fa', authMiddleware, async (req, res) => {
  try {
    const { enabled } = req.body;
    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    if (enabled && !user.password) {
      return res.status(400).json({ message: 'Сначала добавьте пароль для аккаунта' });
    }
    user.twoFactorEnabled = Boolean(enabled);
    user.twoFactorCode = null;
    user.twoFactorExpires = null;
    await user.save();
    res.json({ user: buildAuthUser(user), message: user.twoFactorEnabled ? '2FA включена' : '2FA выключена' });
  } catch (error) {
    console.error('Toggle 2FA error:', error);
    res.status(500).json({ message: 'Ошибка настройки 2FA' });
  }
});

router.post('/google-onboarding', authMiddleware, sanitizeBody, validateUsername, async (req, res) => {
  try {
    const { username, keepCurrent } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    if (!user.googleId) return res.status(400).json({ message: 'Аккаунт не привязан к Google' });

    if (!keepCurrent && username && username !== user.username) {
      const nextUsername = String(username).trim();
      const existingUser = await User.findOne({ username: nextUsername, _id: { $ne: user._id } });
      if (existingUser) return res.status(400).json({ message: 'Имя пользователя уже занято' });
      user.username = nextUsername;
      user.usernameChangedAt = new Date();
    }

    user.googleOnboardingComplete = true;
    const shouldStartOnboarding = Boolean(user.onboardingPending);
    user.onboardingPending = false;
    await user.save();
    res.json({ user: buildAuthUser(user, { onboardingPending: shouldStartOnboarding }), message: 'Настройка завершена' });
  } catch (error) {
    console.error('Google onboarding error:', error);
    res.status(500).json({ message: 'Ошибка настройки аккаунта' });
  }
});

/**
 * POST /api/auth/logout
 * Выход из аккаунта
 */
router.post('/logout', authMiddleware, async (req, res) => {
  try {
    // Обновляем статус пользователя
    await User.findByIdAndUpdate(req.user._id, {
      status: 'offline',
      lastSeen: new Date()
    });
    
    res.json({ message: 'Выход выполнен успешно' });
    
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/auth/logout-all
 * Выход со всех устройств (удаление всех сессий)
 */
router.post('/logout-all', authMiddleware, async (req, res) => {
  try {
    // Удаляем все записи сессий пользователя в БД
    await LoginLog.deleteMany({ userId: req.user._id });

    // Устанавливаем статус пользователя в оффлайн
    await User.findByIdAndUpdate(req.user._id, {
      status: 'offline',
      lastSeen: new Date()
    });

    res.json({ message: 'Выход со всех устройств выполнен успешно' });
  } catch (error) {
    console.error('Logout-all error:', error);
    res.status(500).json({ message: 'Ошибка сервера при выходе со всех устройств' });
  }
});

/**
 * POST /api/auth/socket-token
 * Выдать короткоживущий JWT специально для Socket.io.
 *
 * Дизайн:
 *  - Доступ только для уже авторизованных пользователей (authMiddleware).
 *  - Срок жизни 5 минут, чтобы минимизировать ущерб при компрометации.
 *  - Audience claim 'socket' — socketHandler принимает ТОЛЬКО такие токены,
 *    обычный долгоживущий API JWT использовать для socket нельзя.
 *  - В payload — только userId. НИКАКИХ session id (sid) и других чувствительных
 *    полей. Основной токен пользователя НЕ возвращается.
 *  - Не логируем сам токен (это секрет).
 */
router.post('/socket-token', authMiddleware, async (req, res) => {
  try {
    const token = jwt.sign(
      { userId: req.user._id, aud: 'socket' },
      JWT_SECRET,
      { expiresIn: '5m' }
    );
    // Логируем только факт выдачи + userId. Без токена.
    console.log('[socket-token] issued for userId=', req.user._id.toString());
    res.json({ token, expiresIn: 300 });
  } catch (error) {
    console.error('socket-token error:', error.message);
    res.status(500).json({ message: 'Не удалось выдать socket-token' });
  }
});

/**
 * GET /api/auth/me
 * Получить данные текущего пользователя
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+password')
      .populate('servers', 'name icon')
      .populate('friends', 'username nickname avatar status role');

    const userObj = buildAuthUser(user, { servers: user.servers, friends: user.friends });

    res.json({ user: userObj });
    
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * PUT /api/auth/update-status
 * Обновить статус пользователя
 */
router.put('/update-status', authMiddleware, async (req, res) => {
  try {
    const { status, customStatus } = req.body;
    
    const validStatuses = ['online', 'idle', 'dnd', 'offline'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Недопустимый статус' });
    }
    
    const updateData = {};
    if (status) {
      updateData.status = status;
      updateData.statusPreference = status;
    }
    if (customStatus !== undefined) updateData.customStatus = customStatus;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    ).select('-password');
    
    // Broadcast status change if io is available
    try {
      const { io } = require('../index');
      if (io && status) {
        io.emit('user:status', {
          userId: req.user._id.toString(),
          status: status
        });
      }
    } catch (ioErr) {
      console.error('Error broadcasting status change:', ioErr);
    }
    
    res.json({ user });
    
  } catch (error) {
    console.error('Update status error:', error);
  }
});

/**
 * GET /api/auth/login-logs
 * Получить историю входов текущего пользователя
 */
router.get('/login-logs', authMiddleware, async (req, res) => {
  try {
    const logs = await LoginLog.find({ userId: req.user._id })
      .sort({ timestamp: -1 })
      .limit(20);

    // Возвращаем currentSid вместе с логами, чтобы UI мог пометить
    // текущую сессию БЕЗ парсинга JWT в renderer.
    // req.sid извлекается authMiddleware из верифицированного токена.
    res.json({ logs, currentSid: req.sid || null });
  } catch (error) {
    console.error('Get login logs error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/auth/login-logs/:id
 * Удалить запись из истории входов
 */
router.delete('/login-logs/:id', authMiddleware, async (req, res) => {
  try {
    const log = await LoginLog.findOne({ _id: req.params.id, userId: req.user._id });
    
    if (!log) {
      return res.status(404).json({ message: 'Запись не найдена' });
    }
    
    await LoginLog.deleteOne({ _id: req.params.id });
    res.json({ message: 'Запись удалена' });
  } catch (error) {
    console.error('Delete login log error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// ===== GOOGLE OAUTH ROUTES =====
const passport = require('passport');

// Начать авторизацию через Google
router.get('/google', passport.authenticate('google', {
  scope: ['profile', 'email'],
  prompt: 'select_account'
}));

// Коллбэк от Google
router.get('/google/callback', 
  passport.authenticate('google', { session: false, failureRedirect: '/api/auth/login-failure' }),
  async (req, res) => {
    // Успешная авторизация
    const user = req.user;
    
    if (user.isBanned) {
      return res.status(403).send(`
        <html>
          <head>
            <title>Доступ ограничен</title>
            <style>
              body {
                background: #000;
                color: #fff;
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                height: 100vh;
                margin: 0;
                overflow: hidden;
              }
              .card {
                background: rgba(20, 20, 20, 0.8);
                backdrop-filter: blur(20px);
                -webkit-backdrop-filter: blur(20px);
                border: 1px solid rgba(255, 59, 48, 0.2);
                border-radius: 20px;
                padding: 40px;
                max-width: 400px;
                text-align: center;
                box-shadow: 0 20px 50px rgba(0,0,0,0.5);
              }
              h2 {
                color: #ff3b30;
                font-size: 24px;
                margin-top: 0;
                margin-bottom: 16px;
                font-weight: 700;
              }
              p {
                color: rgba(255, 255, 255, 0.7);
                font-size: 14px;
                line-height: 1.6;
                margin-bottom: 24px;
              }
              .reason-box {
                background: rgba(255, 59, 48, 0.05);
                border: 1px solid rgba(255, 59, 48, 0.15);
                border-radius: 10px;
                padding: 12px 16px;
                text-align: left;
                margin-top: 20px;
              }
              .reason-title {
                font-size: 11px;
                color: #ff3b30;
                text-transform: uppercase;
                font-weight: bold;
                letter-spacing: 0.5px;
                margin-bottom: 4px;
              }
              .reason-text {
                font-size: 13px;
                color: #fff;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Доступ ограничен</h2>
              <p>Ваш аккаунт был заблокирован администратором платформы.</p>
              ${user.banReason ? `
                <div class="reason-box">
                  <div class="reason-title">Причина блокировки</div>
                  <div class="reason-text">${user.banReason}</div>
                </div>
              ` : ''}
            </div>
          </body>
        </html>
      `);
    }

    user.status = user.statusPreference || 'online';
    user.lastSeen = new Date();
    await user.save();
    
    const userAgent = req.headers['user-agent'] || 'unknown';
    const { ip, location } = await getLoginNetworkInfo(req);
    
    // Создаем запись в истории входов
    const log = await LoginLog.create({
      userId: user._id,
      email: user.email,
      ip,
      userAgent,
      location,
      loginMethod: 'google',
      status: 'success'
    });
    
    // Создаем JWT токен с ID сессии (sid)
    const token = jwt.sign(
      { userId: user._id, sid: log._id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    
    // Перенаправляем на страницу успеха (Electron перехватит этот URL)
    res.redirect(`/api/auth/google/success?token=${token}`);
  }
);

// Страница успеха (триггерим открытие приложения через deep link)
router.get('/google/success', (req, res) => {
  const token = req.query.token;
  const deepLink = `love-app://login-success?token=${token}`;
  
  res.send(`
    <html>
      <body style="background: #000; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; overflow: hidden;">
        <div style="text-align: center; max-width: 400px; padding: 20px;">
          <h2 style="font-size: 24px; margin-bottom: 20px;">Авторизация успешна!</h2>
          <p style="color: rgba(255,255,255,0.6); line-height: 1.5; margin-bottom: 30px;">
            Мы перенаправляем вас обратно в приложение. Если этого не произошло автоматически, нажмите кнопку ниже:
          </p>
          <a href="${deepLink}" style="display: inline-block; padding: 12px 24px; background: #fff; color: #000; text-decoration: none; border-radius: 8px; font-weight: 700; transition: transform 0.2s;">
            Вернуться в LOVE
          </a>
          <script>
            // Пытаемся открыть приложение автоматически через пару секунд
            setTimeout(() => {
              window.location.href = "${deepLink}";
            }, 1000);
          </script>
        </div>
      </body>
    </html>
  `);
});

router.get('/login-failure', (req, res) => {
  res.status(401).send('Ошибка входа через Google. Попробуйте еще раз.');
});

module.exports = router;
