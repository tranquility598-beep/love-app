/**
 * Middleware для проверки JWT токена
 * Защищает роуты требующие авторизации
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'love-app-secret-key-2024';

/**
 * Проверяет JWT токен и добавляет пользователя в req.user
 */
const authMiddleware = async (req, res, next) => {
  try {
    // Получаем токен из заголовка
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Токен авторизации не предоставлен' });
    }
    
    const token = authHeader.substring(7); // Убираем "Bearer "
    
    // Верифицируем токен
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // ПРОВЕРКА СЕССИИ (Session ID)
    if (decoded.sid) {
      const LoginLog = require('../models/LoginLog');
      const sessionExists = await LoginLog.findById(decoded.sid);
      if (!sessionExists) {
        return res.status(401).json({ message: 'Сессия завершена или удалена. Пожалуйста, войдите снова.' });
      }
    }
    
    // Находим пользователя
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ message: 'Пользователь не найден' });
    }
    
    // Добавляем пользователя и ID сессии в запрос
    req.user = user;
    req.sid = decoded.sid;
    next();
    
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Недействительный токен' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Токен истек' });
    }
    console.error('Auth middleware error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

module.exports = authMiddleware;
