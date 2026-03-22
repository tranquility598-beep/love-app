/**
 * Роуты авторизации
 * Регистрация, вход, выход, обновление токена
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'discord-clone-secret-key-2024';
const JWT_EXPIRES = process.env.JWT_EXPIRES || '7d';

/**
 * POST /api/auth/register
 * Регистрация нового пользователя
 */
router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    // Валидация
    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Все поля обязательны' });
    }
    
    if (username.length < 2 || username.length > 32) {
      return res.status(400).json({ message: 'Имя пользователя должно быть от 2 до 32 символов' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ message: 'Пароль должен быть не менее 6 символов' });
    }
    
    // Проверяем существование пользователя
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }]
    });
    
    if (existingUser) {
      if (existingUser.email === email.toLowerCase()) {
        return res.status(400).json({ message: 'Email уже используется' });
      }
      return res.status(400).json({ message: 'Имя пользователя уже занято' });
    }
    
    // Создаем пользователя
    const user = new User({
      username,
      email: email.toLowerCase(),
      password
    });
    
    await user.save();
    
    // Создаем JWT токен
    const token = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    
    res.status(201).json({
      message: 'Регистрация успешна',
      token,
      user: user.toPublicJSON()
    });
    
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ message: 'Ошибка сервера при регистрации' });
  }
});

/**
 * POST /api/auth/login
 * Вход в аккаунт
 */
router.post('/login', async (req, res) => {
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
    
    // Проверяем пароль
    const isPasswordValid = await user.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Неверный email или пароль' });
    }
    
    // Обновляем статус
    user.status = 'online';
    user.lastSeen = new Date();
    await user.save();
    
    // Создаем JWT токен
    const token = jwt.sign(
      { userId: user._id },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );
    
    res.json({
      message: 'Вход выполнен успешно',
      token,
      user: user.toPublicJSON()
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Ошибка сервера при входе' });
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
      .populate('friends', 'username avatar status discriminator')
      .select('-password');
    
    res.json({ user });
    
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
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
