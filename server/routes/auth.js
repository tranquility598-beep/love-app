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

const { generateOTP, sendOTPEmail } = require('../utils/emailService');
const LoginLog = require('../models/LoginLog');
const { isFounderUser } = require('../utils/founder');

// Регулярка для пароля: минимум 8 символов, 1 буква и 1 цифра
const passwordRegex = /^(?=.*[a-zA-Z])(?=.*[0-9]).{8,}$/;

/**
 * Получение местоположения по IP
 */
async function getGeoLocation(ip) {
  try {
    if (ip === '::1' || ip === '127.0.0.1' || ip === '::ffff:127.0.0.1') return 'Локальная сеть (Local)';
    
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
    
    if (existingUser) {
      // Если пользователь есть но не верифицирован — удаляем и создаем заново или просто обновляем
      if (!existingUser.isVerified) {
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
      isVerified: false
    });
    
    await user.save();
    
    // Отправляем OTP на почту
    const emailSent = await sendOTPEmail(user.email, otp, 'verification');
    
    if (!emailSent) {
      return res.status(500).json({ message: 'Ошибка отправки письма. Проверьте настройки Gmail.' });
    }
    
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
    user.otpCode = null;
    user.otpExpires = null;
    await user.save();
    
    // Логируем успешный вход (после верификации)
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const location = await getGeoLocation(ip);
    
    const log = await LoginLog.create({
      userId: user._id,
      email: user.email,
      ip,
      userAgent,
      location,
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
      user: { ...user.toPublicJSON(), email: user.email, isFounder: isFounderUser(user) }
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
    
    const otp = generateOTP();
    user.otpCode = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    
    await sendOTPEmail(user.email, otp, 'verification');
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
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';

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
        status: 'failed'
      });

      return res.status(401).json({ message });
    }
    
    // Сбрасываем попытки при успешном входе
    user.loginAttempts = 0;
    user.lockUntil = null;
    
    // Проверяем верификацию
    if (!user.isVerified) {
      const otp = generateOTP();
      user.otpCode = otp;
      user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();
      await sendOTPEmail(user.email, otp, 'verification');
      
      // Логируем попытку входа (но еще не полноценный вход)
      await LoginLog.create({ userId: user._id, email: user.email, ip, userAgent, status: 'success' });

      return res.status(403).json({ 
        message: 'Почта не подтверждена. Новый код отправлен.',
        requireVerification: true,
        email: user.email
      });
    }
    
    user.status = 'online';
    user.lastSeen = new Date();
    await user.save();

    const location = await getGeoLocation(ip);

    // Логируем успешный вход
    const log = await LoginLog.create({
      userId: user._id,
      email: user.email,
      ip,
      userAgent,
      location,
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
      user: { ...user.toPublicJSON(), email: user.email, isFounder: isFounderUser(user) }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Ошибка сервера при входе' });
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
    
    const otp = generateOTP();
    user.otpCode = otp;
    user.otpExpires = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();
    
    await sendOTPEmail(user.email, otp, 'reset');
    res.json({ message: 'Код восстановления отправлен на почту' });
    
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
    await user.save();
    
    res.json({ message: 'Пароль успешно изменен. Теперь вы можете войти.' });
    
  } catch (error) {
    res.status(500).json({ message: 'Ошибка сервера при сбросе пароля' });
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
 * GET /api/auth/me
 * Получить данные текущего пользователя
 */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('servers', 'name icon')
      .populate('friends', 'username avatar status role')
      .select('-password');

    const userObj = user.toObject ? user.toObject() : { ...user };
    userObj.isFounder = isFounderUser(user);

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
    if (status) updateData.status = status;
    if (customStatus !== undefined) updateData.customStatus = customStatus;
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    ).select('-password');
    
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
    
    res.json({ logs });
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
    const userAgent = req.headers['user-agent'] || 'unknown';
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const location = await getGeoLocation(ip);
    
    // Создаем запись в истории входов
    const log = await LoginLog.create({
      userId: user._id,
      email: user.email,
      ip,
      userAgent,
      location,
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
