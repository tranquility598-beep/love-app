/**
 * Роуты для панели управления (Admin App API)
 * Защищены проверкой JWT и иерархическими ролями (Founder, Admin, Moderator, Support)
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Модели
const User = require('../models/User');
const Server = require('../models/Server');
const Message = require('../models/Message');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const LoginLog = require('../models/LoginLog');

// Middleware
const authMiddleware = require('../middleware/auth');
const { isSupport, isModerator, isAdmin, isFounder } = require('../middleware/adminAuth');

/**
 * Логирование действий администратора/модератора в БД
 */
async function logAudit(actorId, action, targetType, targetId, details = {}) {
  try {
    await AuditLog.create({
      actor: actorId,
      action,
      targetType,
      targetId,
      details
    });
  } catch (err) {
    console.error('[AuditLog] Error creating audit log:', err.message);
  }
}

// ==================== 1. УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ====================

/**
 * GET /api/admin/users
 * Поиск и список пользователей (минимальная роль: Support)
 */
router.get('/users', authMiddleware, isSupport, async (req, res) => {
  try {
    const { query = '' } = req.query;
    
    const filter = {};
    if (query.trim()) {
      filter.$or = [
        { username: new RegExp(query.trim(), 'i') },
        { nickname: new RegExp(query.trim(), 'i') },
        { email: new RegExp(query.trim(), 'i') }
      ];
      
      // Если передан валидный ObjectId, ищем также по нему
      if (mongoose.Types.ObjectId.isValid(query.trim())) {
        filter.$or.push({ _id: query.trim() });
      }
    }

    const users = await User.find(filter)
      .select('-password -otpCode -twoFactorCode')
      .limit(50)
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error('[Admin API] Get users error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * GET /api/admin/users/:id
 * Подробная информация о пользователе и его сессиях (минимальная роль: Support)
 */
router.get('/users/:id', authMiddleware, isSupport, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Некорректный ID пользователя' });
    }

    const user = await User.findById(id).select('-password -otpCode -twoFactorCode');
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Получаем последние 20 входов пользователя
    const loginHistory = await LoginLog.find({ userId: id })
      .sort({ timestamp: -1 })
      .limit(20);

    // Получаем количество серверов, которыми владеет пользователь
    const ownedServersCount = await Server.countDocuments({ owner: id });

    res.json({
      user,
      loginHistory,
      ownedServersCount
    });
  } catch (error) {
    console.error('[Admin API] Get user details error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * PUT /api/admin/users/:id/role
 * Изменение роли пользователя (минимальная роль: Founder)
 */
router.put('/users/:id/role', authMiddleware, isFounder, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const allowedRoles = ['user', 'moderator', 'admin', 'founder', 'support'];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: 'Неверная роль' });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Некорректный ID пользователя' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Защита: нельзя разжаловать единственного основателя (или самого себя)
    if (user._id.toString() === req.user._id.toString() && role !== 'founder') {
      return res.status(400).json({ message: 'Вы не можете изменить роль самому себе' });
    }

    const oldRole = user.role;
    user.role = role;

    // Управляем значком основателя в профиле
    if (role === 'founder' && !user.badges.includes('founder')) {
      user.badges.push('founder');
    } else if (role !== 'founder' && user.badges.includes('founder')) {
      user.badges = user.badges.filter(b => b !== 'founder');
    }

    await user.save();

    await logAudit(req.user._id, 'UPDATE_ROLE', 'user', user._id, { oldRole, newRole: role });

    res.json({ message: 'Роль успешно изменена', role: user.role });
  } catch (error) {
    console.error('[Admin API] Update role error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/admin/users/:id/ban
 * Блокировка пользователя и сброс его сессий (минимальная роль: Moderator)
 */
router.post('/users/:id/ban', authMiddleware, isModerator, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = '' } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Некорректный ID пользователя' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (user.role === 'founder' || (user.role === 'admin' && req.user.role === 'moderator')) {
      return res.status(403).json({ message: 'Вы не можете заблокировать пользователя с более высокой ролью' });
    }

    user.isBanned = true;
    user.banReason = reason;
    await user.save();

    // Удаляем все логины сессий пользователя, чтобы аннулировать JWT токены
    await LoginLog.deleteMany({ userId: id });

    // Принудительно отключаем сокет пользователя, если он онлайн
    const io = req.app.get('io');
    if (io) {
      const sockets = await io.fetchSockets();
      let disconnectCount = 0;
      for (const s of sockets) {
        if (s.user && s.user._id.toString() === id) {
          s.emit('user:banned', { reason });
          setTimeout(() => {
            s.disconnect(true);
          }, 500);
          disconnectCount++;
        }
      }
      if (disconnectCount > 0) {
        console.log(`🔌 Admin banned user ${user.username} and disconnected ${disconnectCount} sockets.`);
      }
    }

    await logAudit(req.user._id, 'BAN_USER', 'user', user._id, { reason });

    res.json({ message: 'Пользователь успешно заблокирован и отключен от сети' });
  } catch (error) {
    console.error('[Admin API] Ban user error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/admin/users/:id/unban
 * Разблокировка пользователя (минимальная роль: Moderator)
 */
router.post('/users/:id/unban', authMiddleware, isModerator, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Некорректный ID пользователя' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    user.isBanned = false;
    user.banReason = '';
    await user.save();

    await logAudit(req.user._id, 'UNBAN_USER', 'user', user._id);

    res.json({ message: 'Пользователь успешно разблокирован' });
  } catch (error) {
    console.error('[Admin API] Unban user error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/admin/users/:id/mute
 * Заглушение пользователя (минимальная роль: Moderator)
 */
router.post('/users/:id/mute', authMiddleware, isModerator, async (req, res) => {
  try {
    const { id } = req.params;
    const { duration = null } = req.body; // Длительность в миллисекундах (null для бессрочного)

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Некорректный ID пользователя' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    user.isMuted = true;
    user.muteUntil = duration ? new Date(Date.now() + duration) : null;
    await user.save();

    await logAudit(req.user._id, 'MUTE_USER', 'user', user._id, { duration });

    res.json({ 
      message: 'Пользователь успешно заглушен', 
      isMuted: user.isMuted, 
      muteUntil: user.muteUntil 
    });
  } catch (error) {
    console.error('[Admin API] Mute user error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/admin/users/:id/unmute
 * Снятие заглушения (минимальная роль: Moderator)
 */
router.post('/users/:id/unmute', authMiddleware, isModerator, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Некорректный ID пользователя' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    user.isMuted = false;
    user.muteUntil = null;
    await user.save();

    await logAudit(req.user._id, 'UNMUTE_USER', 'user', user._id);

    res.json({ message: 'Заглушение успешно снято' });
  } catch (error) {
    console.error('[Admin API] Unmute user error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/admin/users/:id/kick
 * Принудительный выход (разрыв сокетов) (минимальная роль: Moderator)
 */
router.post('/users/:id/kick', authMiddleware, isModerator, async (req, res) => {
  try {
    const { id } = req.params;

    const io = req.app.get('io');
    if (!io) return res.status(500).json({ message: 'Socket.io не инициализирован на сервере' });

    const sockets = await io.fetchSockets();
    let kickedCount = 0;
    for (const s of sockets) {
      if (s.user && s.user._id.toString() === id) {
        s.disconnect(true);
        kickedCount++;
      }
    }

    res.json({ message: `Пользователь отключен от сети. Закрыто сокетов: ${kickedCount}` });
  } catch (error) {
    console.error('[Admin API] Kick user error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});


// ==================== 2. УПРАВЛЕНИЕ СЕРВЕРАМИ ====================

/**
 * GET /api/admin/servers
 * Список всех серверов платформы (минимальная роль: Support)
 */
router.get('/servers', authMiddleware, isSupport, async (req, res) => {
  try {
    const { query = '' } = req.query;

    const filter = {};
    if (query.trim()) {
      filter.name = new RegExp(query.trim(), 'i');
      if (mongoose.Types.ObjectId.isValid(query.trim())) {
        filter.$or = [{ _id: query.trim() }, { owner: query.trim() }];
      }
    }

    const servers = await Server.find(filter)
      .populate('owner', 'username email')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(servers);
  } catch (error) {
    console.error('[Admin API] Get servers error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/admin/servers/:id
 * Удаление сервера платформы (минимальная роль: Admin)
 */
router.delete('/servers/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Некорректный ID сервера' });
    }

    const serverObj = await Server.findById(id);
    if (!serverObj) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }

    // Удаляем связанные каналы и сообщения
    const Channel = require('../models/Channel');
    const channels = await Channel.find({ server: id });
    const channelIds = channels.map(c => c._id);
    
    await Message.deleteMany({ channel: { $in: channelIds } });
    await Channel.deleteMany({ server: id });
    
    // Удаляем сам сервер
    await Server.deleteOne({ _id: id });

    // Чистим сервер в объектах User.servers
    await User.updateMany(
      { servers: id },
      { $pull: { servers: id } }
    );

    // Уведомляем клиентов через WebSocket об удалении сервера
    const io = req.app.get('io');
    if (io) {
      io.to(`server:${id}`).emit('server:deleted', { serverId: id });
    }

    await logAudit(req.user._id, 'DELETE_SERVER', 'server', id, { serverName: serverObj.name });

    res.json({ message: 'Сервер и все его данные успешно удалены' });
  } catch (error) {
    console.error('[Admin API] Delete server error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});


// ==================== 3. ЖАЛОБЫ (MODERATION REPORTS) ====================

/**
 * GET /api/admin/reports
 * Получить список всех жалоб (минимальная роль: Moderator)
 */
router.get('/reports', authMiddleware, isModerator, async (req, res) => {
  try {
    const { status } = req.query;
    
    const filter = {};
    if (status) filter.status = status;

    const reports = await Report.find(filter)
      .populate('reporter', 'username email avatar')
      .populate('reportedUser', 'username email avatar')
      .populate('reportedMessage')
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(reports);
  } catch (error) {
    console.error('[Admin API] Get reports error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * PUT /api/admin/reports/:id/status
 * Обновить статус рассмотрения жалобы (минимальная роль: Moderator)
 */
router.put('/reports/:id/status', authMiddleware, isModerator, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, moderatorAction = '' } = req.body;

    const allowedStatuses = ['pending', 'reviewed', 'resolved', 'dismissed'];
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({ message: 'Неверный статус' });
    }

    const report = await Report.findById(id);
    if (!report) {
      return res.status(404).json({ message: 'Жалоба не найдена' });
    }

    report.status = status;
    if (moderatorAction) {
      report.moderatorAction = moderatorAction;
    }
    await report.save();

    res.json({ message: 'Статус жалобы успешно обновлен', report });
  } catch (error) {
    console.error('[Admin API] Update report status error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});


// ==================== 4. АНОНСЫ (LOVE HUB BROADCAST) ====================

/**
 * POST /api/admin/announcements
 * Отправка системного анонса во фронтенд (минимальная роль: Admin)
 */
router.post('/announcements', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { title, content, type = 'normal' } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Заголовок и содержание анонса обязательны' });
    }

    const io = req.app.get('io');
    if (io) {
      // Эмитим сокет-событие на весь клиент
      io.emit('admin:announcement', {
        title,
        content,
        type, // 'silent' (просто в хаб), 'normal' (всплывающий тост), 'global' (модалка поверх всего)
        from: req.user.username,
        timestamp: new Date()
      });

      
      await logAudit(req.user._id, 'PUBLISH_ANNOUNCEMENT', 'announcement', new mongoose.Types.ObjectId(), { title, type });
      res.json({ message: 'Анонс успешно отправлен всем пользователям' });
    } else {
      res.status(500).json({ message: 'Ошибка сокетов на сервере' });
    }
  } catch (error) {
    console.error('[Admin API] Publish announcement error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});


// ==================== 5. АНАЛИТИКА (RECHARTS-READY DATA) ====================

/**
 * GET /api/admin/analytics
 * Сбор статистики по активности пользователей и контенту (минимальная роль: Admin)
 */
router.get('/analytics', authMiddleware, isAdmin, async (req, res) => {
  try {
    // 1. Общие KPI
    const totalUsers = await User.countDocuments();
    const totalServers = await Server.countDocuments();
    const totalMessages = await Message.countDocuments();

    // 2. DAU (Daily Active Users): Уникальные входы за последние 24 часа
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dauUsers = await LoginLog.distinct('userId', { 
      timestamp: { $gte: dayAgo },
      status: 'success'
    });
    const dau = dauUsers.length;

    // 3. MAU (Monthly Active Users): Уникальные входы за последние 30 дней
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const mauUsers = await LoginLog.distinct('userId', { 
      timestamp: { $gte: monthAgo },
      status: 'success'
    });
    const mau = mauUsers.length;

    // 4. История регистраций по дням (за последние 7 дней)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const registrationsRaw = await User.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          registrations: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 5. Количество сообщений по дням (за последние 7 дней)
    const messagesRaw = await Message.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          messages: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // Мапим данные для Recharts по датам
    const dateMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateString = d.toISOString().split('T')[0];
      dateMap[dateString] = { date: dateString, registrations: 0, messages: 0 };
    }

    registrationsRaw.forEach(item => {
      if (dateMap[item._id]) dateMap[item._id].registrations = item.registrations;
    });

    messagesRaw.forEach(item => {
      if (dateMap[item._id]) dateMap[item._id].messages = item.messages;
    });

    const chartsData = Object.values(dateMap);

    res.json({
      kpis: {
        totalUsers,
        totalServers,
        totalMessages,
        dau,
        mau
      },
      chartsData
    });
  } catch (error) {
    console.error('[Admin API] Analytics error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});


// ==================== 6. ИНФРАСТРУКТУРА (HEALTH CHECKS) ====================

/**
 * GET /api/admin/infrastructure
 * Состояние базы данных и количество WebSocket-подключений (минимальная роль: Founder)
 */
router.get('/infrastructure', authMiddleware, isFounder, async (req, res) => {
  try {
    const io = req.app.get('io');
    const onlineSocketsCount = io ? io.sockets.sockets.size : 0;
    
    // DB state
    const dbStates = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    };
    const dbState = dbStates[mongoose.connection.readyState] || 'unknown';

    // Cloudinary check
    let cloudinaryOk = false;
    try {
      const cloudinary = require('../config/cloudinary');
      if (cloudinary.config().cloud_name) {
        cloudinaryOk = true;
      }
    } catch (e) {}

    res.json({
      database: {
        status: dbState === 'connected' ? 'ok' : 'error',
        state: dbState,
        host: mongoose.connection.host
      },
      cloudinary: {
        status: cloudinaryOk ? 'ok' : 'error'
      },
      server: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version,
        platform: process.platform
      },
      sockets: {
        status: io ? 'ok' : 'error',
        activeConnections: onlineSocketsCount
      }
    });
  } catch (error) {
    console.error('[Admin API] Infrastructure check error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});


// ==================== 7. ЛОГИ АУДИТА ====================

/**
 * GET /api/admin/logs
 * Просмотр логов действий модераторов и админов (минимальная роль: Founder)
 */
router.get('/logs', authMiddleware, isFounder, async (req, res) => {
  try {
    const { action, limit = 50 } = req.query;

    const filter = {};
    if (action) filter.action = action;

    const logs = await AuditLog.find(filter)
      .populate('actor', 'username email avatar')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json(logs);
  } catch (error) {
    console.error('[Admin API] Get logs error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
