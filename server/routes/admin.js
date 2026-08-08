/**
 * Роуты для панели управления (Admin App API)
 * Защищены проверкой JWT и иерархическими ролями (Founder, Admin, Moderator, Support)
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticator } = require('otplib');

// Модели
const User = require('../models/User');
const Server = require('../models/Server');
const Message = require('../models/Message');
const Report = require('../models/Report');
const AuditLog = require('../models/AuditLog');
const LoginLog = require('../models/LoginLog');
const ModerationAction = require('../models/ModerationAction');
const Case = require('../models/Case');
const DevLogPost = require('../models/DevLogPost');
const CommunityComment = require('../models/CommunityComment');
const CommunityVote = require('../models/CommunityVote');
const Announcement = require('../models/Announcement');
const RiskSignal = require('../models/RiskSignal');
const AdminSession = require('../models/AdminSession');

// Middleware
const { adminSessionAuth: authMiddleware } = require('../middleware/adminSessionAuth');
const { otpLimiter } = require('../middleware/rateLimiter');
const {
  isSupport,
  isJuniorModerator,
  isModerator,
  isAdmin,
  isSeniorAdmin,
  isDeputyDeveloper,
  isFounder,
  requirePermission
} = require('../middleware/adminAuth');
const {
  ROLE_ORDER,
  ROLE_LABELS,
  canonicalRole,
  roleLevel,
  canActOn,
  isStaffRole
} = require('../config/adminRoles');
const {
  applyModerationAction,
  revokeModerationAction,
  activeWarnings
} = require('../services/moderationService');
const { createNotification } = require('../utils/notify');
const { sendEmail, escapeHtml } = require('../utils/emailService');
const { getAnalytics } = require('../services/analyticsService');
const { requestIp } = require('../utils/security');
const { decryptSecret } = require('../utils/security');
const { publishAdminUpdate, subscribeAdminUpdates } = require('../services/adminRealtime');
const { ADMIN_POLICY_VERSION } = require('../config/adminPolicy');
const {
  canWorkCase,
  canAssignCases,
  canChangeCasePriority,
  canArchiveOpenCase
} = require('../config/caseWorkPolicy');

/**
 * Логирование действий администратора/модератора в БД
 */
async function logAudit(actorId, action, targetType, targetId, details = {}, req = null) {
  try {
    await AuditLog.create({
      actor: actorId,
      action,
      targetType,
      targetId,
      details,
      ip: req ? requestIp(req) : '',
      userAgent: req?.headers?.['user-agent'] || ''
    });
  } catch (err) {
    console.error('[AuditLog] Error creating audit log:', err.message);
  }
}

function emitSupportUpdated(req, userId, caseId, details = {}) {
  const io = req.app.get('io');
  if (io && userId) {
    io.to(`user:${userId}`).emit('support:updated', {
      caseId: caseId ? String(caseId) : null,
      ...details,
      at: new Date().toISOString()
    });
  }
}

function realtimeCaseNote(note, author) {
  return {
    _id: String(note._id),
    body: note.body,
    internal: Boolean(note.internal),
    createdAt: note.createdAt,
    author: {
      _id: String(author._id),
      username: author.username,
      nickname: author.nickname,
      avatar: author.avatar,
      role: author.role
    }
  };
}

function realtimeScope(path) {
  if (path.startsWith('/cases')) return 'cases';
  if (path.startsWith('/devlog') || path.startsWith('/comments')) return 'community';
  if (path.startsWith('/announcements')) return 'announcements';
  if (path.includes('/role') || path.startsWith('/roles')) return 'team';
  if (path.includes('/actions') || path.startsWith('/moderation-actions')) return 'moderation';
  if (path.startsWith('/users')) return 'users';
  if (path.startsWith('/servers')) return 'servers';
  return 'dashboard';
}

router.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && !res.locals.adminRealtimeHandled) {
      publishAdminUpdate(realtimeScope(req.path), { method: req.method });
    }
  });
  next();
});

router.get('/events', authMiddleware, isSupport, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();

  const send = update => {
    res.write(`event: update\ndata: ${JSON.stringify(update)}\n\n`);
    res.flush?.();
  };
  res.write(`event: ready\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
  const unsubscribe = subscribeAdminUpdates(send);
  const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 20_000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// ==================== 1. УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ ====================

/**
 * GET /api/admin/users
 * Поиск и список пользователей (минимальная роль: Support)
 */
router.get('/users', authMiddleware, isSupport, async (req, res) => {
  try {
    const { query = '', status = 'all', role = 'all' } = req.query;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(10, Number.parseInt(req.query.limit, 10) || 25));
    
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

    if (status === 'verified') filter.isVerified = true;
    if (status === 'pending') filter.isVerified = false;
    if (status === 'banned') filter.isBanned = true;
    if (status === 'muted') filter.isMuted = true;
    if (status === 'deactivated') filter.deactivatedAt = { $ne: null };
    if (role === 'staff') filter.role = { $in: ROLE_ORDER };
    else if (role !== 'all') filter.role = role;

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -otpCode -twoFactorCode -adminTotpSecret -adminRecoveryCodeHashes')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 }),
      User.countDocuments(filter)
    ]);

    const canReadSensitive = req.adminPermissions.has('*') || req.adminPermissions.has('users.read_sensitive');
    const safeUsers = users.map(user => {
      const value = user.toObject();
      if (!canReadSensitive && value.email) {
        const [name, domain = ''] = value.email.split('@');
        value.email = `${name.slice(0, 2)}***@${domain}`;
      }
      value.role = canonicalRole(value.role);
      value.roleLabel = ROLE_LABELS[value.role] || value.role;
      return value;
    });

    res.json({ users: safeUsers, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
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

    const canReadSensitive = req.adminPermissions.has('*') || req.adminPermissions.has('users.read_sensitive');
    const value = user.toObject();
    value.role = canonicalRole(value.role);
    value.roleLabel = ROLE_LABELS[value.role] || value.role;
    if (!canReadSensitive) {
      if (value.email) {
        const [name, domain = ''] = value.email.split('@');
        value.email = `${name.slice(0, 2)}***@${domain}`;
      }
      loginHistory.forEach(item => {
        item.ip = '';
        item.location = '';
        item.userAgent = '';
      });
    }
    const warningCount = (await activeWarnings(user._id)).length;

    res.json({ user: value, loginHistory, ownedServersCount, warningCount });
  } catch (error) {
    console.error('[Admin API] Get user details error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * PUT /api/admin/users/:id/role
 * Изменение роли пользователя (минимальная роль: Founder)
 */
router.put('/users/:id/role', authMiddleware, isSeniorAdmin, otpLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const allowedRoles = ['user', ...ROLE_ORDER];
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

    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Вы не можете изменить роль самому себе' });
    }

    if (canonicalRole(user.role) === 'developer') {
      return res.status(403).json({ message: 'Ранг Разработчика защищён' });
    }

    if (!canActOn(req.user, user)) {
      return res.status(403).json({ message: 'Нельзя изменять роль равного или более высокого сотрудника' });
    }

    if (role === 'developer' && user.username.toLowerCase() !== 'goodvexel') {
      return res.status(403).json({ message: 'Ранг Разработчика закреплён за goodvexel' });
    }

    const actorLevel = roleLevel(req.user.role);
    const nextLevel = roleLevel(role);
    if (nextLevel >= actorLevel && canonicalRole(req.user.role) !== 'developer') {
      return res.status(403).json({ message: 'Нельзя назначить равный или более высокий ранг' });
    }

    const assignCaps = {
      senior_admin: roleLevel('senior_moderator'),
      deputy_developer: roleLevel('senior_admin'),
      developer: roleLevel('deputy_developer')
    };
    const actorRole = canonicalRole(req.user.role);
    if (nextLevel > (assignCaps[actorRole] ?? -1) && role !== 'user') {
      return res.status(403).json({ message: 'Этот ранг выше полномочий назначения для вашей роли' });
    }

    if (process.env.NODE_ENV === 'production') {
      const actor = await User.findById(req.user._id).select('+adminTotpSecret');
      const totpCode = String(req.body.totpCode || '').replace(/\s/g, '');
      if (!actor?.adminTotpEnabled || !actor.adminTotpSecret || !authenticator.check(totpCode, decryptSecret(actor.adminTotpSecret))) {
        return res.status(403).json({ code: 'ROLE_TOTP_REQUIRED', message: 'Подтвердите изменение роли кодом Authenticator' });
      }
    }

    const oldRole = user.role;
    user.role = role;
    if (isStaffRole(role)) {
      user.adminPolicyRequiredVersion = ADMIN_POLICY_VERSION;
      user.adminPolicyAcceptedVersion = '';
      user.adminPolicyAcceptedAt = null;
    } else {
      user.adminPolicyRequiredVersion = '';
      user.adminPolicyAcceptedVersion = '';
      user.adminPolicyAcceptedAt = null;
    }

    // Управляем значком основателя в профиле
    if (role === 'developer' && !user.badges.includes('developer')) {
      user.badges.push('developer');
    } else if (role !== 'developer' && user.badges.includes('developer')) {
      user.badges = user.badges.filter(b => b !== 'developer');
    }

    await user.save();

    await logAudit(req.user._id, 'UPDATE_ROLE', 'user', user._id, { oldRole, newRole: role }, req);

    await Promise.all([
      LoginLog.deleteMany({ userId: user._id }),
      AdminSession.updateMany({ user: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } })
    ]);
    req.app.get('io')?.to(`user:${user._id}`).emit('admin:role_updated', { role, at: new Date().toISOString() });
    res.json({ message: 'Роль успешно изменена. Активные сессии завершены.', role: user.role });
  } catch (error) {
    console.error('[Admin API] Update role error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

router.get('/users/:id/moderation', authMiddleware, isJuniorModerator, async (req, res) => {
  try {
    const actions = await ModerationAction.find({ targetUser: req.params.id })
      .populate('issuedBy', 'username nickname role avatar')
      .populate('case', 'number kind status')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ actions, activeWarnings: (await activeWarnings(req.params.id)).length });
  } catch (error) {
    console.error('[Admin API] Moderation history:', error);
    res.status(500).json({ message: 'Не удалось загрузить историю наказаний' });
  }
});

router.get('/moderation-actions', authMiddleware, isJuniorModerator, async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(10, Number.parseInt(req.query.limit, 10) || 25));
    const filter = {};
    if (req.query.type && req.query.type !== 'all') filter.type = req.query.type;
    if (req.query.active === 'true') {
      filter.type = { $in: ['warning', 'mute', 'ban', 'deactivate'] };
      filter.$or = [{ permanent: true }, { expiresAt: null }, { expiresAt: { $gt: new Date() } }];
    }
    const [actions, total] = await Promise.all([
      ModerationAction.find(filter)
        .populate('targetUser', 'username nickname avatar role isMuted isBanned deactivatedAt')
        .populate('issuedBy', 'username nickname avatar role')
        .populate('case', 'number kind status')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      ModerationAction.countDocuments(filter)
    ]);
    res.json({ actions, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('[Admin API] Moderation actions:', error);
    res.status(500).json({ message: 'Не удалось загрузить журнал модерации' });
  }
});

router.post('/users/:id/actions', authMiddleware, isJuniorModerator, async (req, res) => {
  try {
    const { type, reason, duration, permanent, evidence, caseId } = req.body;
    if (!['warning', 'mute', 'ban', 'deactivate', 'restore'].includes(type)) {
      return res.status(400).json({ message: 'Неизвестный тип действия' });
    }
    const result = await applyModerationAction({
      actor: req.user,
      targetUserId: req.params.id,
      type,
      reason,
      duration: duration === null ? null : Number(duration),
      permanent: type === 'deactivate' ? true : Boolean(permanent),
      evidence: Array.isArray(evidence) ? evidence.slice(0, 20) : [],
      caseId: caseId || null,
      io: req.app.get('io')
    });
    await logAudit(req.user._id, `MODERATION_${type.toUpperCase()}`, 'moderation_action', result.action._id, {
      targetUser: req.params.id,
      duration: duration || null,
      permanent: type === 'deactivate' ? true : Boolean(permanent),
      caseId: caseId || null
    }, req);
    res.status(201).json({ action: result.action, user: result.user });
  } catch (error) {
    console.error('[Admin API] Apply moderation:', error);
    res.status(error.status || 500).json({ message: error.message || 'Ошибка применения наказания' });
  }
});

router.post('/moderation-actions/:id/revoke', authMiddleware, isJuniorModerator, async (req, res) => {
  try {
    const result = await revokeModerationAction({
      actor: req.user,
      actionId: req.params.id,
      reason: req.body.reason,
      io: req.app.get('io')
    });
    await logAudit(req.user._id, 'MODERATION_REVOKE', 'moderation_action', result.action._id, {
      originalAction: req.params.id,
      targetUser: result.user._id
    }, req);
    res.status(201).json({ action: result.action, user: result.user });
  } catch (error) {
    console.error('[Admin API] Revoke moderation:', error);
    res.status(error.status || 500).json({ message: error.message || 'Ошибка снятия наказания' });
  }
});

/**
 * POST /api/admin/users/:id/ban
 * Блокировка пользователя и сброс его сессий (минимальная роль: Moderator)
 */
router.post('/users/:id/ban', authMiddleware, isModerator, async (req, res) => {
  try {
    const duration = req.body.duration == null ? null : Number(req.body.duration);
    const result = await applyModerationAction({
      actor: req.user,
      targetUserId: req.params.id,
      type: 'ban',
      reason: req.body.reason || 'Блокировка сотрудником',
      duration,
      permanent: duration == null,
      io: req.app.get('io')
    });
    await logAudit(req.user._id, 'BAN_USER', 'moderation_action', result.action._id, { targetUser: req.params.id }, req);
    res.json({ message: 'Пользователь заблокирован', action: result.action, user: result.user });
  } catch (error) {
    console.error('[Admin API] Ban user error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Ошибка сервера' });
  }
});

/**
 * POST /api/admin/users/:id/unban
 * Разблокировка пользователя (минимальная роль: Moderator)
 */
router.post('/users/:id/unban', authMiddleware, isModerator, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    if (!user.activeBanAction) {
      user.isBanned = false;
      user.banUntil = null;
      user.banReason = '';
      await user.save();
      return res.json({ message: 'Старая блокировка снята', user });
    }
    const result = await revokeModerationAction({ actor: req.user, actionId: user.activeBanAction, reason: req.body.reason, io: req.app.get('io') });
    res.json({ message: 'Пользователь разблокирован', action: result.action, user: result.user });
  } catch (error) {
    console.error('[Admin API] Unban user error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Ошибка сервера' });
  }
});

/**
 * POST /api/admin/users/:id/mute
 * Заглушение пользователя (минимальная роль: Moderator)
 */
router.post('/users/:id/mute', authMiddleware, isModerator, async (req, res) => {
  try {
    const duration = req.body.duration == null ? null : Number(req.body.duration);
    const result = await applyModerationAction({
      actor: req.user,
      targetUserId: req.params.id,
      type: 'mute',
      reason: req.body.reason || 'Ограничение общения сотрудником',
      duration,
      permanent: duration == null,
      io: req.app.get('io')
    });
    res.json({ message: 'Мут выдан', action: result.action, user: result.user });
  } catch (error) {
    console.error('[Admin API] Mute user error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Ошибка сервера' });
  }
});

/**
 * POST /api/admin/users/:id/unmute
 * Снятие заглушения (минимальная роль: Moderator)
 */
router.post('/users/:id/unmute', authMiddleware, isModerator, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    if (!user.activeMuteAction) {
      user.isMuted = false;
      user.muteUntil = null;
      user.muteReason = '';
      await user.save();
      return res.json({ message: 'Старый мут снят', user });
    }
    const result = await revokeModerationAction({ actor: req.user, actionId: user.activeMuteAction, reason: req.body.reason, io: req.app.get('io') });
    res.json({ message: 'Мут снят', action: result.action, user: result.user });
  } catch (error) {
    console.error('[Admin API] Unmute user error:', error);
    res.status(error.status || 500).json({ message: error.message || 'Ошибка сервера' });
  }
});

/**
 * POST /api/admin/users/:id/kick
 * Принудительный выход (разрыв сокетов) (минимальная роль: Moderator)
 */
router.post('/users/:id/kick', authMiddleware, isModerator, async (req, res) => {
  try {
    const { id } = req.params;

    const target = mongoose.Types.ObjectId.isValid(id)
      ? await User.findById(id).select('role username')
      : null;
    if (!target) return res.status(404).json({ message: 'Пользователь не найден' });
    if (!canActOn(req.user, target)) {
      return res.status(403).json({ message: 'Нельзя отключить равного или более высокого сотрудника' });
    }

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

    await logAudit(req.user._id, 'KICK_USER', 'user', target._id, { kickedCount }, req);

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
router.get('/servers', authMiddleware, isAdmin, requirePermission('servers.manage'), async (req, res) => {
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
router.delete('/servers/:id', authMiddleware, isAdmin, requirePermission('servers.manage'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Некорректный ID сервера' });
    }

    const serverObj = await Server.findById(id);
    if (!serverObj) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }

    const owner = await User.findById(serverObj.owner).select('role username');
    if (owner && !canActOn(req.user, owner)) {
      return res.status(403).json({ message: 'Нельзя удалить сервер равного или более высокого сотрудника' });
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

    await logAudit(req.user._id, 'DELETE_SERVER', 'server', id, { serverName: serverObj.name }, req);

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

    const caseStatus = { pending: 'new', reviewed: 'in_progress', resolved: 'resolved', dismissed: 'rejected' }[status];
    await Case.updateOne(
      { sourceReport: report._id },
      {
        $set: { status: caseStatus, ...(caseStatus === 'resolved' || caseStatus === 'rejected' ? { resolvedAt: new Date() } : {}) },
        $push: { activity: { actor: req.user._id, action: 'updated_via_legacy_api', details: { status, moderatorAction } } }
      }
    );

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
router.get('/announcements', authMiddleware, isSupport, async (req, res) => {
  try {
    const announcements = await Announcement.find()
      .populate('author', 'username nickname avatar role')
      .sort({ publishedAt: -1 })
      .limit(100);
    res.json({ announcements });
  } catch (error) {
    console.error('[Admin API] Get announcements error:', error);
    res.status(500).json({ message: 'Не удалось загрузить анонсы' });
  }
});

router.post('/announcements', authMiddleware, isAdmin, requirePermission('announcements.manage'), async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '').trim();
    const type = ['silent', 'normal', 'global'].includes(req.body.type) ? req.body.type : 'normal';

    if (!title || !content) {
      return res.status(400).json({ message: 'Заголовок и содержание анонса обязательны' });
    }

    const announcement = await Announcement.create({
      author: req.user._id,
      title,
      content,
      type
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('admin:announcement', {
        id: announcement._id,
        title,
        content,
        type,
        from: req.user.username,
        timestamp: announcement.publishedAt
      });
    }

    await logAudit(req.user._id, 'PUBLISH_ANNOUNCEMENT', 'announcement', announcement._id, { title, type }, req);
    res.status(201).json({ message: 'Анонс опубликован', announcement });
  } catch (error) {
    console.error('[Admin API] Publish announcement error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

router.delete('/announcements/:id', authMiddleware, isFounder, async (req, res) => {
  try {
    const announcement = await Announcement.findByIdAndDelete(req.params.id);
    if (!announcement) return res.status(404).json({ message: 'Анонс не найден' });
    await logAudit(req.user._id, 'DELETE_ANNOUNCEMENT', 'announcement', announcement._id, {
      title: announcement.title,
      type: announcement.type
    }, req);
    req.app.get('io')?.emit('admin:announcement_removed', { id: announcement._id });
    res.json({ message: 'Анонс удалён' });
  } catch (error) {
    console.error('[Admin API] Delete announcement error:', error);
    res.status(500).json({ message: 'Не удалось удалить анонс' });
  }
});


// ==================== 5. АНАЛИТИКА (RECHARTS-READY DATA) ====================

/**
 * GET /api/admin/analytics
 * Сбор статистики по активности пользователей и контенту (минимальная роль: Admin)
 */
router.get('/analytics', authMiddleware, isAdmin, async (req, res) => {
  try {
    const presence = req.app.get('presence') || { connectedUsers: new Map(), voiceChannels: new Map() };
    res.json(await getAnalytics(req.query, presence));
  } catch (error) {
    console.error('[Admin API] Analytics v2 error:', error);
    res.status(500).json({ message: 'Не удалось собрать аналитику' });
  }
});

router.get('/dashboard', authMiddleware, isSupport, async (req, res) => {
  try {
    const presence = req.app.get('presence') || { connectedUsers: new Map() };
    const [totalUsers, newCases, criticalCases, mutedUsers, bannedUsers, recentCases] = await Promise.all([
      User.countDocuments(),
      Case.countDocuments({ status: 'new' }),
      Case.countDocuments({ priority: 'critical', status: { $nin: ['resolved', 'rejected', 'archived'] } }),
      User.countDocuments({ isMuted: true }),
      User.countDocuments({ isBanned: true }),
      Case.find({ status: { $nin: ['resolved', 'rejected', 'archived'] } })
        .select('number kind title priority status assignedTo createdAt')
        .populate('assignedTo', 'username nickname avatar role')
        .sort({ priority: -1, createdAt: -1 })
        .limit(8)
    ]);
    res.json({
      kpis: { totalUsers, onlineUsers: presence.connectedUsers.size, newCases, criticalCases, mutedUsers, bannedUsers },
      recentCases
    });
  } catch (error) {
    console.error('[Admin API] Dashboard:', error);
    res.status(500).json({ message: 'Не удалось загрузить дашборд' });
  }
});

router.get('/analytics/legacy', authMiddleware, isAdmin, async (req, res) => {
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
router.get('/infrastructure', authMiddleware, isDeputyDeveloper, async (req, res) => {
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

router.post('/infrastructure/revoke-admin-sessions', authMiddleware, isFounder, async (req, res) => {
  try {
    const result = await AdminSession.updateMany(
      { _id: { $ne: req.adminSession._id }, revokedAt: null },
      { revokedAt: new Date() }
    );
    await logAudit(
      req.user._id,
      'admin_sessions_revoked',
      'system',
      null,
      { revoked: result.modifiedCount },
      req
    );
    res.json({ message: 'Остальные административные сессии завершены', revoked: result.modifiedCount });
  } catch (error) {
    console.error('[Admin API] revoke sessions:', error);
    res.status(500).json({ message: 'Не удалось завершить административные сессии' });
  }
});


// ==================== 7. CASE CENTER И COMMUNITY ====================

router.get('/roles', authMiddleware, isSupport, (req, res) => {
  res.json({
    roles: ['user', ...ROLE_ORDER].map(role => ({
      value: role,
      label: ROLE_LABELS[role] || role,
      level: roleLevel(role)
    }))
  });
});

router.get('/policy', authMiddleware, isSupport, (req, res) => {
  res.json({
    version: ADMIN_POLICY_VERSION,
    requiredVersion: req.user.adminPolicyRequiredVersion || '',
    acceptedVersion: req.user.adminPolicyAcceptedVersion || '',
    acceptedAt: req.user.adminPolicyAcceptedAt || null
  });
});

router.post('/policy/accept', authMiddleware, isSupport, async (req, res) => {
  try {
    if (req.body.accepted !== true) return res.status(400).json({ message: 'Подтвердите согласие с правилами команды' });
    const user = await User.findById(req.user._id);
    user.adminPolicyRequiredVersion = user.adminPolicyRequiredVersion || ADMIN_POLICY_VERSION;
    user.adminPolicyAcceptedVersion = ADMIN_POLICY_VERSION;
    user.adminPolicyAcceptedAt = new Date();
    await user.save();
    await logAudit(req.user._id, 'ACCEPT_ADMIN_POLICY', 'user', user._id, { version: ADMIN_POLICY_VERSION }, req);
    res.json({ message: 'Правила команды приняты', version: ADMIN_POLICY_VERSION, acceptedAt: user.adminPolicyAcceptedAt });
  } catch (error) {
    console.error('[Admin API] Accept policy:', error);
    res.status(500).json({ message: 'Не удалось сохранить принятие правил' });
  }
});

router.get('/cases', authMiddleware, isSupport, async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(10, Number.parseInt(req.query.limit, 10) || 25));
    const filter = {};
    if (req.query.kind && req.query.kind !== 'all') filter.kind = req.query.kind;
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    else filter.status = { $ne: 'archived' };
    if (req.query.priority && req.query.priority !== 'all') filter.priority = req.query.priority;
    if (req.query.assigned === 'me') filter.assignedTo = req.user._id;
    if (req.query.query) {
      const escaped = String(req.query.query).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { number: new RegExp(escaped, 'i') },
        { title: new RegExp(escaped, 'i') },
        { description: new RegExp(escaped, 'i') }
      ];
    }

    const [cases, total] = await Promise.all([
      Case.find(filter)
        .select('-diagnostics')
        .populate('reporter', 'username nickname avatar')
        .populate('subjectUser', 'username nickname avatar role')
        .populate('assignedTo', 'username nickname avatar role')
        .sort({ priority: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Case.countDocuments(filter)
    ]);
    res.json({ cases, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('[Admin API] Cases:', error);
    res.status(500).json({ message: 'Не удалось загрузить обращения' });
  }
});

router.get('/cases/:id', authMiddleware, isSupport, async (req, res) => {
  try {
    const canSeeFullEvidence = req.adminPermissions.has('*') || req.adminPermissions.has('cases.read_evidence');
    const canSeeReportEvidence = canSeeFullEvidence || req.adminPermissions.has('cases.read_report_evidence');
    let query = Case.findById(req.params.id);
    if (canSeeFullEvidence) query = query.select('+diagnostics +evidenceSnapshot');
    else if (canSeeReportEvidence) query = query.select('+evidenceSnapshot');
    const item = await query
      .populate('reporter', 'username nickname avatar email')
      .populate('subjectUser', 'username nickname avatar role')
      .populate('assignedTo', 'username nickname avatar role')
      .populate('notes.author', 'username nickname avatar role')
      .populate('activity.actor', 'username nickname avatar role')
      .populate({ path: 'moderationAction', populate: { path: 'issuedBy', select: 'username nickname role' } })
      .populate('subjectMessage');
    if (!item) return res.status(404).json({ message: 'Обращение не найдено' });
    const canSeeThisEvidence = canSeeFullEvidence || (canSeeReportEvidence && item.kind === 'report');
    if (!canSeeThisEvidence) item.evidenceSnapshot = undefined;
    if (!canSeeFullEvidence) {
      item.attachments = item.attachments.filter(file => !file.private);
      item.subjectMessage = null;
    }
    res.json({ case: item });
  } catch (error) {
    console.error('[Admin API] Case details:', error);
    res.status(500).json({ message: 'Не удалось загрузить обращение' });
  }
});

router.patch('/cases/:id', authMiddleware, isSupport, async (req, res) => {
  try {
    const item = await Case.findById(req.params.id)
      .populate('reporter', 'email username')
      .populate({ path: 'moderationAction', populate: { path: 'issuedBy', select: 'username role' } });
    if (!item) return res.status(404).json({ message: 'Обращение не найдено' });
    if (!canWorkCase(req.user.role, item.kind)) {
      return res.status(403).json({ message: 'Ваш ранг не может изменять этот тип обращения' });
    }
    const allowedStatuses = ['new', 'triaged', 'in_progress', 'waiting_user', 'resolved', 'rejected', 'archived'];
    const allowedPriorities = ['low', 'normal', 'high', 'critical'];
    const wasArchived = item.status === 'archived';
    const changes = {};
    if (req.body.status && allowedStatuses.includes(req.body.status)) {
      if (item.kind === 'appeal' && ['resolved', 'rejected'].includes(req.body.status) && !['resolved', 'rejected'].includes(item.status)) {
        return res.status(409).json({ message: 'Решение по апелляции принимается только через отдельное действие' });
      }
      if (req.body.status === 'archived'
        && !['resolved', 'rejected'].includes(item.status)
        && !canArchiveOpenCase(req.user.role)) {
        return res.status(403).json({ message: 'Открытое обращение может архивировать только старший администратор или выше' });
      }
      if (item.kind === 'appeal' && ['resolved', 'rejected'].includes(req.body.status)) {
        if (!req.adminPermissions.has('*') && !req.adminPermissions.has('cases.resolve_appeal')) {
          return res.status(403).json({ message: 'Ваш ранг не может принимать решение по апелляции' });
        }
        const issuer = item.moderationAction?.issuedBy;
        if (issuer && String(issuer._id) === String(req.user._id)) {
          return res.status(403).json({ message: 'Нельзя рассматривать апелляцию на собственное наказание' });
        }
        if (issuer && !canActOn(req.user, issuer)) {
          return res.status(403).json({ message: 'Апелляцию должен рассмотреть сотрудник более высокого ранга' });
        }
      }
      const previousStatus = item.status;
      item.status = req.body.status;
      changes.status = req.body.status;
      if (req.body.status === 'archived') {
        changes.previousStatus = previousStatus;
        item.assignedTo = null;
        changes.assignedTo = null;
        if (item.public?.published) {
          item.public.published = false;
          changes.publicPublished = false;
        }
      }
      if (['resolved', 'rejected'].includes(req.body.status)) item.resolvedAt = new Date();
    }
    if (req.body.priority && allowedPriorities.includes(req.body.priority)) {
      if (!canChangeCasePriority(req.user.role, item.kind)) {
        return res.status(403).json({ message: 'Приоритет может менять только старший модератор или выше' });
      }
      item.priority = req.body.priority;
      item.prioritySource = 'staff';
      changes.priority = req.body.priority;
      changes.prioritySource = 'staff';
    }
    if (Array.isArray(req.body.tags)) {
      item.tags = req.body.tags.map(value => String(value).trim()).filter(Boolean).slice(0, 20);
      changes.tags = item.tags;
    }
    if (req.body.assignedTo !== undefined) {
      const targetId = req.body.assignedTo || null;
      if (!targetId) {
        const assignedToSelf = String(item.assignedTo || '') === String(req.user._id);
        if (!assignedToSelf && !canAssignCases(req.user.role)) {
          return res.status(403).json({ message: 'Снять назначение может текущий исполнитель или старший администратор' });
        }
        item.assignedTo = null;
        changes.assignedTo = null;
      } else {
        if (!mongoose.Types.ObjectId.isValid(targetId)) {
          return res.status(400).json({ message: 'Некорректный исполнитель' });
        }
        const target = await User.findById(targetId).select('username nickname role');
        if (!target || !isStaffRole(target.role)) {
          return res.status(400).json({ message: 'Исполнитель должен быть действующим сотрудником' });
        }
        const assigningSelf = String(target._id) === String(req.user._id);
        if (!assigningSelf && !canAssignCases(req.user.role)) {
          return res.status(403).json({ message: 'Назначать обращения другим может старший администратор или выше' });
        }
        if (!canWorkCase(target.role, item.kind)) {
          return res.status(409).json({
            message: `${ROLE_LABELS[canonicalRole(target.role)] || target.role} не может быть исполнителем для типа «${item.kind}»`
          });
        }
        if (!assigningSelf && roleLevel(target.role) > roleLevel(req.user.role)) {
          return res.status(403).json({ message: 'Нельзя назначить обращение сотруднику выше вашего ранга' });
        }
        item.assignedTo = target._id;
        changes.assignedTo = target._id;
      }
    }
    item.activity.push({ actor: req.user._id, action: 'case_updated', details: changes });
    await item.save();
    emitSupportUpdated(req, item.reporter?._id, item._id);

    if (changes.status && changes.status !== 'archived' && item.reporter) {
      const preview = `Обращение ${item.number}: статус изменён на ${changes.status}`;
      await createNotification(req.app.get('io'), { user: item.reporter._id, type: 'system', actorName: 'Love Support', preview, caseId: item._id });
      if (item.reporter.email) {
        sendEmail(item.reporter.email, `Love: обновление обращения ${item.number}`, `<p>${escapeHtml(preview)}</p>`).catch(() => {});
      }
    }
    const auditAction = changes.status === 'archived' ? 'ARCHIVE_CASE' : (wasArchived && changes.status ? 'RESTORE_CASE' : 'UPDATE_CASE');
    await logAudit(req.user._id, auditAction, 'case', item._id, changes, req);
    res.json({ case: item });
  } catch (error) {
    console.error('[Admin API] Update case:', error);
    res.status(500).json({ message: 'Не удалось обновить обращение' });
  }
});

router.post('/cases/:id/appeal-decision', authMiddleware, isSupport, async (req, res) => {
  try {
    const decision = String(req.body.decision || '');
    if (!['accepted', 'rejected'].includes(decision)) {
      return res.status(400).json({ message: 'Выберите решение по апелляции' });
    }
    if (!req.adminPermissions.has('*') && !req.adminPermissions.has('cases.resolve_appeal')) {
      return res.status(403).json({ message: 'Ваш ранг не может принимать решение по апелляции' });
    }
    const item = await Case.findOne({ _id: req.params.id, kind: 'appeal' })
      .populate('reporter', 'email username')
      .populate({ path: 'moderationAction', populate: [
        { path: 'issuedBy', select: 'username role' },
        { path: 'targetUser', select: 'username role' }
      ] });
    if (!item) return res.status(404).json({ message: 'Апелляция не найдена' });
    if (['resolved', 'rejected'].includes(item.status)) {
      return res.status(409).json({ message: 'По этой апелляции уже принято решение' });
    }
    if (!item.moderationAction) {
      return res.status(409).json({ message: 'Связанное наказание не найдено' });
    }

    const ownPunishment = String(item.moderationAction.issuedBy?._id) === String(req.user._id);
    const developerOverride = ownPunishment
      && canonicalRole(req.user.role) === 'developer'
      && req.body.overrideOwn === true
      && String(req.body.overrideReason || '').trim().length >= 10;
    if (ownPunishment && !developerOverride) {
      return res.status(403).json({
        code: 'OWN_APPEAL_REVIEW',
        message: canonicalRole(req.user.role) === 'developer'
          ? 'Для решения собственной апелляции подтвердите исключение Разработчика и укажите причину'
          : 'Нельзя рассматривать апелляцию на собственное наказание'
      });
    }
    if (!ownPunishment && item.moderationAction.issuedBy && !canActOn(req.user, item.moderationAction.issuedBy)) {
      return res.status(403).json({ message: 'Апелляцию должен рассмотреть сотрудник более высокого ранга' });
    }

    const reason = String(req.body.reason || (decision === 'accepted' ? 'Апелляция удовлетворена' : 'Апелляция отклонена')).trim().slice(0, 1000);
    if (decision === 'accepted') {
      await revokeModerationAction({
        actor: req.user,
        actionId: item.moderationAction._id,
        reason,
        io: req.app.get('io')
      });
      item.status = 'resolved';
    } else {
      item.status = 'rejected';
      await createNotification(req.app.get('io'), {
        user: item.reporter._id,
        type: 'system',
        actorName: 'Love Safety',
        preview: `Апелляция ${item.number} отклонена: ${reason.slice(0, 180)}`,
        caseId: item._id
      });
    }
    item.resolvedAt = new Date();
    item.activity.push({
      actor: req.user._id,
      action: decision === 'accepted' ? 'appeal_accepted' : 'appeal_rejected',
      details: { reason, developerOverride }
    });
    item.notes.push({ author: req.user._id, body: reason, internal: false });
    await item.save();
    emitSupportUpdated(req, item.reporter?._id, item._id);
    await logAudit(req.user._id, decision === 'accepted' ? 'ACCEPT_APPEAL' : 'REJECT_APPEAL', 'case', item._id, {
      moderationAction: item.moderationAction._id,
      developerOverride,
      overrideReason: developerOverride ? String(req.body.overrideReason).trim().slice(0, 500) : ''
    }, req);
    res.json({ case: item, message: decision === 'accepted' ? 'Апелляция принята, наказание снято' : 'Апелляция отклонена' });
  } catch (error) {
    console.error('[Admin API] Appeal decision:', error);
    res.status(error.status || 500).json({ message: error.message || 'Не удалось сохранить решение' });
  }
});

router.post('/cases/:id/notes', authMiddleware, isSupport, async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ message: 'Заметка не может быть пустой' });
    const item = await Case.findById(req.params.id).populate('reporter', 'email username');
    if (!item) return res.status(404).json({ message: 'Обращение не найдено' });
    if (!canWorkCase(req.user.role, item.kind)) {
      return res.status(403).json({ message: 'Ваш ранг не может отвечать в этом типе обращения' });
    }
    const internal = req.body.internal !== false;
    item.notes.push({ author: req.user._id, body, internal });
    item.activity.push({ actor: req.user._id, action: internal ? 'internal_note' : 'staff_reply' });
    await item.save();
    const note = realtimeCaseNote(item.notes[item.notes.length - 1], req.user);
    res.locals.adminRealtimeHandled = true;
    publishAdminUpdate('cases', {
      kind: internal ? 'internal_note' : 'staff_reply',
      caseId: String(item._id),
      note,
      status: item.status,
      updatedAt: item.updatedAt
    });
    if (!internal) emitSupportUpdated(req, item.reporter?._id, item._id, {
      kind: 'staff_reply',
      number: item.number,
      title: item.title,
      preview: body.slice(0, 180),
      note,
      status: item.status,
      updatedAt: item.updatedAt
    });
    if (!internal && item.reporter) {
      const preview = `Новый ответ по обращению ${item.number}: ${body.slice(0, 180)}`;
      await createNotification(req.app.get('io'), { user: item.reporter._id, type: 'system', actorName: 'Love Support', preview, caseId: item._id });
      if (item.reporter.email) sendEmail(item.reporter.email, `Love: ответ по обращению ${item.number}`, `<p>${escapeHtml(preview)}</p>`).catch(() => {});
    }
    await logAudit(req.user._id, internal ? 'ADD_CASE_NOTE' : 'REPLY_CASE', 'case', item._id, {}, req);
    res.status(201).json({ note });
  } catch (error) {
    console.error('[Admin API] Case note:', error);
    res.status(500).json({ message: 'Не удалось добавить заметку' });
  }
});

router.delete('/cases/:id/notes/:noteId', authMiddleware, isSupport, async (req, res) => {
  try {
    const item = await Case.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Обращение не найдено' });
    if (!canWorkCase(req.user.role, item.kind)) {
      return res.status(403).json({ message: 'Ваш ранг не может изменять заметки этого обращения' });
    }
    const note = item.notes.id(req.params.noteId);
    if (!note) return res.status(404).json({ message: 'Заметка не найдена' });
    const ownsNote = String(note.author) === String(req.user._id);
    const isDeveloper = canonicalRole(req.user.role) === 'developer';
    if (!ownsNote && !isDeveloper) {
      return res.status(403).json({ message: 'Удалить эту заметку может её автор или Разработчик' });
    }
    const wasInternal = note.internal;
    item.notes.pull(note._id);
    item.activity.push({
      actor: req.user._id,
      action: 'note_deleted',
      details: { noteId: req.params.noteId, internal: wasInternal }
    });
    await item.save();
    if (!wasInternal) emitSupportUpdated(req, item.reporter, item._id);
    await logAudit(req.user._id, 'DELETE_CASE_NOTE', 'case', item._id, {
      noteId: req.params.noteId,
      internal: wasInternal
    }, req);
    res.json({ message: 'Заметка удалена' });
  } catch (error) {
    console.error('[Admin API] Delete case note:', error);
    res.status(500).json({ message: 'Не удалось удалить заметку' });
  }
});

router.delete('/cases/:id', authMiddleware, isFounder, async (req, res) => {
  try {
    const item = await Case.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'Обращение не найдено' });
    await Promise.all([
      CommunityVote.deleteMany({ targetType: 'idea', target: item._id }),
      Case.deleteOne({ _id: item._id })
    ]);
    emitSupportUpdated(req, item.reporter, item._id);
    await logAudit(req.user._id, 'DELETE_CASE', 'case', item._id, {
      number: item.number,
      kind: item.kind,
      title: item.title,
      sourceReport: item.sourceReport || null
    }, req);
    res.json({ message: 'Обращение удалено' });
  } catch (error) {
    console.error('[Admin API] Delete case:', error);
    res.status(500).json({ message: 'Не удалось удалить обращение' });
  }
});

router.post('/cases/:id/publish', authMiddleware, isAdmin, requirePermission('community.publish'), async (req, res) => {
  try {
    const item = await Case.findById(req.params.id);
    if (!item || item.kind !== 'idea') return res.status(404).json({ message: 'Публиковать можно только идеи' });
    const allowedStatuses = ['under_review', 'planned', 'in_progress', 'completed', 'declined'];
    const allowedCategories = ['messaging', 'voice', 'servers', 'profile', 'mobile', 'safety', 'accessibility', 'other'];
    if (req.body.status && !allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ message: 'Выберите корректный публичный статус идеи' });
    }
    if (req.body.category && !allowedCategories.includes(req.body.category)) {
      return res.status(400).json({ message: 'Выберите корректную категорию идеи' });
    }
    item.public.published = req.body.published !== false;
    item.public.status = String(req.body.status || item.public.status || 'under_review');
    item.public.summary = String(req.body.summary || item.public.summary || item.description).slice(0, 1000);
    item.public.category = String(req.body.category || item.public.category || 'other').slice(0, 60);
    item.activity.push({ actor: req.user._id, action: item.public.published ? 'published' : 'unpublished' });
    await item.save();
    await logAudit(req.user._id, item.public.published ? 'PUBLISH_CASE' : 'UNPUBLISH_CASE', 'case', item._id, {}, req);
    res.json({ case: item });
  } catch (error) {
    console.error('[Admin API] Publish case:', error);
    res.status(500).json({ message: 'Не удалось изменить публикацию' });
  }
});

router.get('/devlog', authMiddleware, isSupport, async (req, res) => {
  const filter = req.query.status === 'archived' ? { status: 'archived' } : { status: { $ne: 'archived' } };
  const posts = await DevLogPost.find(filter).populate('author', 'username nickname avatar').sort({ createdAt: -1 }).limit(100);
  res.json({ posts });
});

router.post('/devlog', authMiddleware, isAdmin, requirePermission('community.publish'), async (req, res) => {
  try {
    const status = ['draft', 'scheduled', 'published'].includes(req.body.status) ? req.body.status : 'draft';
    const post = await DevLogPost.create({
      author: req.user._id,
      title: req.body.title,
      body: req.body.body,
      tags: Array.isArray(req.body.tags) ? req.body.tags.slice(0, 20) : [],
      media: Array.isArray(req.body.media) ? req.body.media.slice(0, 10) : [],
      status,
      scheduledAt: status === 'scheduled' ? req.body.scheduledAt : null,
      publishedAt: status === 'published' ? new Date() : null
    });
    await logAudit(req.user._id, 'CREATE_DEVLOG', 'community', post._id, { status }, req);
    res.status(201).json({ post });
  } catch (error) {
    console.error('[Admin API] Create devlog:', error);
    res.status(400).json({ message: error.message || 'Не удалось создать запись' });
  }
});

router.patch('/devlog/:id', authMiddleware, isAdmin, requirePermission('community.publish'), async (req, res) => {
  try {
    const post = await DevLogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Запись не найдена' });
    if (post.status === 'archived') return res.status(409).json({ message: 'Сначала восстановите запись из архива' });
    const allowedStatus = ['draft', 'scheduled', 'published'].includes(req.body.status) ? req.body.status : undefined;
    ['title', 'body', 'scheduledAt'].forEach(field => {
      if (req.body[field] !== undefined) post[field] = req.body[field];
    });
    if (allowedStatus) post.status = allowedStatus;
    if (Array.isArray(req.body.tags)) post.tags = req.body.tags.slice(0, 20);
    if (Array.isArray(req.body.media)) post.media = req.body.media.slice(0, 10);
    if (post.status === 'published' && !post.publishedAt) post.publishedAt = new Date();
    await post.save();
    await logAudit(req.user._id, 'UPDATE_DEVLOG', 'community', post._id, { status: post.status }, req);
    res.json({ post });
  } catch (error) {
    console.error('[Admin API] Update devlog:', error);
    res.status(400).json({ message: error.message || 'Не удалось обновить запись' });
  }
});

router.post('/devlog/:id/archive', authMiddleware, isAdmin, requirePermission('community.publish'), async (req, res) => {
  try {
    const post = await DevLogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Запись не найдена' });
    if (post.status !== 'archived') {
      post.archivedFromStatus = post.status;
      post.archivedAt = new Date();
      post.status = 'archived';
      await post.save();
      req.app.get('io')?.emit('community:devlog:update', { postId: post._id, removed: true });
      await logAudit(req.user._id, 'ARCHIVE_DEVLOG', 'community', post._id, { previousStatus: post.archivedFromStatus }, req);
    }
    res.json({ post });
  } catch (error) {
    console.error('[Admin API] Archive devlog:', error);
    res.status(500).json({ message: 'Не удалось архивировать запись' });
  }
});

router.post('/devlog/:id/restore', authMiddleware, isAdmin, requirePermission('community.publish'), async (req, res) => {
  try {
    const post = await DevLogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Запись не найдена' });
    if (post.status === 'archived') {
      const restoredStatus = ['draft', 'scheduled', 'published'].includes(post.archivedFromStatus) ? post.archivedFromStatus : 'draft';
      post.status = restoredStatus;
      post.archivedFromStatus = null;
      post.archivedAt = null;
      if (restoredStatus === 'published' && !post.publishedAt) post.publishedAt = new Date();
      await post.save();
      req.app.get('io')?.emit('community:devlog:update', { postId: post._id, refresh: restoredStatus === 'published' });
      await logAudit(req.user._id, 'RESTORE_DEVLOG', 'community', post._id, { restoredStatus }, req);
    }
    res.json({ post });
  } catch (error) {
    console.error('[Admin API] Restore devlog:', error);
    res.status(500).json({ message: 'Не удалось восстановить запись' });
  }
});

router.delete('/devlog/:id', authMiddleware, isFounder, async (req, res) => {
  try {
    const post = await DevLogPost.findById(req.params.id);
    if (!post) return res.status(404).json({ message: 'Запись не найдена' });
    await Promise.all([
      CommunityComment.deleteMany({ post: post._id }),
      CommunityVote.deleteMany({ targetType: 'devlog', target: post._id }),
      DevLogPost.deleteOne({ _id: post._id })
    ]);
    req.app.get('io')?.emit('community:devlog:update', { postId: post._id, removed: true });
    await logAudit(req.user._id, 'DELETE_DEVLOG', 'community', post._id, {
      title: post.title,
      status: post.status,
      commentCount: post.commentCount,
      upVotes: post.upVotes,
      downVotes: post.downVotes
    }, req);
    res.json({ message: 'Запись Dev Log удалена' });
  } catch (error) {
    console.error('[Admin API] Delete devlog:', error);
    res.status(500).json({ message: 'Не удалось удалить запись' });
  }
});

router.get('/devlog/:id/comments', authMiddleware, isSupport, async (req, res) => {
  try {
    const post = await DevLogPost.findById(req.params.id).select('_id');
    if (!post) return res.status(404).json({ message: 'Запись не найдена' });
    const comments = await CommunityComment.find({ post: post._id })
      .populate('author', 'username nickname avatar role')
      .populate('moderatedBy', 'username nickname avatar role')
      .sort({ createdAt: 1 })
      .limit(500);
    res.json({ comments });
  } catch (error) {
    console.error('[Admin API] Devlog comments:', error);
    res.status(500).json({ message: 'Не удалось загрузить комментарии' });
  }
});

router.patch('/comments/:id', authMiddleware, requirePermission('community.moderate_comments'), async (req, res) => {
  try {
    const status = ['active', 'hidden', 'deleted'].includes(req.body.status) ? req.body.status : 'hidden';
    const comment = await CommunityComment.findById(req.params.id)
      .populate('author', 'role username')
      .populate('moderatedBy', 'role username');
    if (!comment) return res.status(404).json({ message: 'Комментарий не найден' });
    if (isStaffRole(comment.author?.role) && !canActOn(req.user, comment.author)) {
      return res.status(403).json({ message: 'Нельзя модерировать комментарий равного или более высокого сотрудника' });
    }
    if (status === 'active'
      && comment.moderatedBy
      && String(comment.moderatedBy._id) !== String(req.user._id)
      && !canActOn(req.user, comment.moderatedBy)) {
      return res.status(403).json({ message: 'Нельзя отменить решение равного или более высокого сотрудника' });
    }
    comment.status = status;
    comment.moderatedBy = req.user._id;
    comment.moderationReason = String(req.body.reason || '').slice(0, 500);
    await comment.save();
    const commentCount = await CommunityComment.countDocuments({ post: comment.post, status: 'active' });
    await DevLogPost.findByIdAndUpdate(comment.post, { commentCount });
    req.app.get('io')?.emit('community:devlog:update', { postId: comment.post, commentCount });
    await logAudit(req.user._id, 'MODERATE_COMMENT', 'community', comment._id, { status }, req);
    res.json({ comment });
  } catch (error) {
    console.error('[Admin API] Moderate comment:', error);
    res.status(500).json({ message: 'Не удалось изменить комментарий' });
  }
});

router.get('/comments', authMiddleware, isSupport, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status && req.query.status !== 'all') filter.status = req.query.status;
    const comments = await CommunityComment.find(filter)
      .populate('author', 'username nickname avatar')
      .populate('moderatedBy', 'username nickname avatar')
      .sort({ createdAt: -1 })
      .limit(200);
    res.json({ comments });
  } catch (error) {
    console.error('[Admin API] Community comments:', error);
    res.status(500).json({ message: 'Не удалось загрузить комментарии' });
  }
});

router.get('/risk-signals', authMiddleware, isSeniorAdmin, async (req, res) => {
  const signals = await RiskSignal.find().select('+displayValue').populate('user', 'username nickname').sort({ lastSeenAt: -1 }).limit(200);
  res.json({ signals });
});

router.patch('/risk-signals/:id', authMiddleware, isSeniorAdmin, async (req, res) => {
  const signal = await RiskSignal.findByIdAndUpdate(req.params.id, {
    blocked: Boolean(req.body.blocked),
    reason: String(req.body.reason || '').slice(0, 500),
    blockedBy: req.body.blocked ? req.user._id : null
  }, { new: true });
  if (!signal) return res.status(404).json({ message: 'Сигнал не найден' });
  await logAudit(req.user._id, 'UPDATE_RISK_SIGNAL', 'risk_signal', signal._id, { blocked: signal.blocked }, req);
  res.json({ signal });
});

// ==================== 8. ЛОГИ АУДИТА ====================

/**
 * GET /api/admin/logs
 * Просмотр логов действий модераторов и админов (минимальная роль: Founder)
 */
router.get('/logs', authMiddleware, isDeputyDeveloper, async (req, res) => {
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
