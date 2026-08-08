/**
 * Middleware для проверки JWT токена
 * Защищает роуты требующие авторизации
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { refreshModerationState } = require('../services/moderationService');
const { getJwtSecret } = require('../utils/jwtSecret');

const JWT_SECRET = getJwtSecret();

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

    // ЖЁСТКАЯ ИЗОЛЯЦИЯ AUDIENCE:
    // socket-token (aud='socket', выпускается POST /api/auth/socket-token)
    // НЕ должен приниматься обычными REST API. Это часть security-модели:
    //  - socket-token имеет короткий TTL (5 мин) и расширенную поверхность
    //    (кладётся в io auth, в renderer памяти на время сессии);
    //  - REST API должен принимать только основной long-lived JWT с sid.
    // Лог без токена и без секретов.
    if (decoded.aud === 'socket') {
      console.warn('[auth] rejected socket-token used for REST; userId=', decoded.userId);
      return res.status(401).json({ message: 'Недействительный токен для REST API' });
    }

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

    await refreshModerationState(user);

    const restricted = Boolean(user.deactivatedAt || user.isBanned);
    if (restricted) {
      const canAccessCases = req.baseUrl === '/api/cases';
      const canReadRestriction = req.baseUrl === '/api/auth'
        && req.path === '/restriction'
        && req.method === 'GET';
      const canOpenRestrictedSocket = req.baseUrl === '/api/auth'
        && req.path === '/socket-token'
        && req.method === 'POST';
      if (!canAccessCases && !canReadRestriction && !canOpenRestrictedSocket) {
        return res.status(403).json(user.deactivatedAt ? {
          code: 'ACCOUNT_DEACTIVATED',
          message: 'Аккаунт деактивирован',
          reason: user.deactivationReason || ''
        } : {
          code: 'ACCOUNT_BANNED',
          message: 'Ваш аккаунт заблокирован',
          isBanned: true,
          reason: user.banReason || '',
          expiresAt: user.banUntil || null,
          actionId: user.activeBanAction || null
        });
      }
    } else if (decoded.restricted === true) {
      return res.status(401).json({ message: 'Ограниченная сессия завершена. Войдите снова.' });
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
