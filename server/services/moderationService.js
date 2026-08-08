const User = require('../models/User');
const AdminSession = require('../models/AdminSession');
const ModerationAction = require('../models/ModerationAction');
const Case = require('../models/Case');
const { canActOn, canonicalRole, roleLevel } = require('../config/adminRoles');
const { createNotification } = require('../utils/notify');

const DAY_MS = 24 * 60 * 60 * 1000;
const WARNING_ACTIVE_MS = 90 * DAY_MS;

function durationLimit(role, type) {
  const level = roleLevel(role);
  if (type === 'warning') return Infinity;
  if (type === 'mute') {
    if (level >= roleLevel('junior_admin')) return Infinity;
    if (level >= roleLevel('senior_moderator')) return 30 * DAY_MS;
    if (level >= roleLevel('junior_moderator')) return DAY_MS;
  }
  if (type === 'ban') {
    if (level >= roleLevel('senior_admin')) return Infinity;
    if (level >= roleLevel('junior_admin')) return 30 * DAY_MS;
    if (level >= roleLevel('senior_moderator')) return 7 * DAY_MS;
  }
  if (['deactivate', 'restore', 'device_block', 'device_unblock'].includes(type)) {
    return level >= roleLevel('senior_admin') ? Infinity : -1;
  }
  return -1;
}

async function refreshModerationState(user) {
  if (!user) return user;
  let changed = false;
  const now = Date.now();
  if (user.isMuted && user.muteUntil && user.muteUntil.getTime() <= now) {
    user.isMuted = false;
    user.muteUntil = null;
    user.muteReason = '';
    user.activeMuteAction = null;
    changed = true;
  }
  if (user.isBanned && user.banUntil && user.banUntil.getTime() <= now) {
    user.isBanned = false;
    user.banUntil = null;
    user.banReason = '';
    user.activeBanAction = null;
    changed = true;
  }
  if (changed) await user.save();
  return user;
}

function assertDuration(actor, type, duration, permanent) {
  const limit = durationLimit(actor.role, type);
  if (limit < 0) throw Object.assign(new Error('Недостаточно прав для этого наказания'), { status: 403 });
  if (permanent && limit !== Infinity) {
    throw Object.assign(new Error('Ваш ранг не может выдавать бессрочное наказание'), { status: 403 });
  }
  if (!permanent && ['mute', 'ban'].includes(type) && (!Number.isFinite(duration) || duration <= 0)) {
    throw Object.assign(new Error('Укажите корректную длительность'), { status: 400 });
  }
  if (!permanent && ['mute', 'ban'].includes(type) && Number.isFinite(limit) && duration > limit) {
    throw Object.assign(new Error('Выбранный срок превышает полномочия вашего ранга'), { status: 403 });
  }
}

function canRevokeModerationAction(actor, action) {
  if (!actor || !action?.targetUser || !action?.issuedBy) return false;
  if (!['warning', 'mute', 'ban', 'deactivate'].includes(action.type)) return false;
  if (!canActOn(actor, action.targetUser)) return false;

  const ownAction = String(action.issuedBy?._id || action.issuedBy) === String(actor._id);
  if (ownAction) return durationLimit(actor.role, action.type) >= 0;

  return roleLevel(actor.role) >= roleLevel('senior_moderator')
    && canActOn(actor, action.issuedBy);
}

async function activeWarnings(targetUserId) {
  const warnings = await ModerationAction.find({
    targetUser: targetUserId,
    type: 'warning',
    expiresAt: { $gt: new Date() }
  }).select('_id').lean();
  if (!warnings.length) return [];
  const revoked = await ModerationAction.distinct('reverses', {
    type: 'revoke',
    reverses: { $in: warnings.map(item => item._id) }
  });
  const revokedIds = new Set(revoked.map(String));
  return warnings.filter(item => !revokedIds.has(String(item._id)));
}

async function notifyRestriction(io, user, action) {
  const typeLabels = { warning: 'Предупреждение', mute: 'Мут', ban: 'Блокировка', deactivate: 'Деактивация' };
  const until = action.permanent || !action.expiresAt
    ? 'бессрочно'
    : `до ${action.expiresAt.toLocaleString('ru-RU')}`;
  await createNotification(io, {
    user: user._id,
    type: 'system',
    actorName: 'Love Safety',
    preview: `${typeLabels[action.type] || 'Ограничение'}: ${action.reason}${action.type === 'warning' ? '' : ` (${until})`}`
  });
}

async function applyModerationAction({ actor, targetUserId, type, reason, duration = null, permanent = false, evidence = [], caseId = null, automatic = false, sourceKey = null, io = null }) {
  const target = await User.findById(targetUserId);
  if (!target) throw Object.assign(new Error('Пользователь не найден'), { status: 404 });
  if (!canActOn(actor, target)) {
    throw Object.assign(new Error('Нельзя применить действие к равному или более высокому рангу'), { status: 403 });
  }
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) throw Object.assign(new Error('Причина обязательна'), { status: 400 });

  if (automatic) {
    if (permanent || (['mute', 'ban'].includes(type) && (!Number.isFinite(Number(duration)) || Number(duration) <= 0))) {
      throw Object.assign(new Error('Некорректное автоматическое наказание'), { status: 500 });
    }
  } else {
    assertDuration(actor, type, Number(duration), permanent);
  }
  const now = new Date();
  const expiresAt = type === 'warning'
    ? new Date(now.getTime() + WARNING_ACTIVE_MS)
    : (['mute', 'ban'].includes(type) && !permanent ? new Date(now.getTime() + Number(duration)) : null);

  const action = await ModerationAction.create({
    targetUser: target._id,
    issuedBy: actor._id,
    type,
    reason: cleanReason,
    startsAt: now,
    expiresAt,
    permanent,
    case: caseId || null,
    evidence,
    automatic,
    sourceKey
  });

  if (type === 'mute') {
    target.isMuted = true;
    target.muteUntil = expiresAt;
    target.muteReason = cleanReason;
    target.activeMuteAction = action._id;
  } else if (type === 'ban') {
    target.isBanned = true;
    target.banUntil = expiresAt;
    target.banReason = cleanReason;
    target.activeBanAction = action._id;
  } else if (type === 'deactivate') {
    target.deactivatedAt = now;
    target.deactivationReason = cleanReason;
    target.activeDeactivationAction = action._id;
  } else if (type === 'restore') {
    target.deactivatedAt = null;
    target.deactivationReason = '';
    target.activeDeactivationAction = null;
  }
  await target.save();

  if (io) {
    io.to(`user:${target._id}`).emit('moderation:updated', {
      actionId: action._id,
      type,
      at: new Date().toISOString()
    });
  }

  if (['ban', 'deactivate'].includes(type)) {
    await AdminSession.updateMany(
      { user: target._id, revokedAt: null },
      { $set: { revokedAt: new Date() } }
    );
    if (io) {
      const sockets = await io.in(`user:${target._id}`).fetchSockets();
      for (const socket of sockets) {
        socket.emit('moderation:restricted', {
          type,
          reason: cleanReason,
          expiresAt,
          caseId,
          actionId: action._id
        });
        socket.disconnect(true);
      }
    }
  }

  await notifyRestriction(io, target, action);

  if (type === 'warning') {
    const warnings = await activeWarnings(target._id);
    if (warnings.length === 3) {
      await applyModerationAction({
        actor,
        targetUserId: target._id,
        type: 'mute',
        reason: 'Автоматический мут после трёх активных предупреждений',
        duration: DAY_MS,
        automatic: true,
        sourceKey: `warning-mute:${target._id}:${warnings.map(item => item._id).sort().join('-')}`,
        io
      });
    }
    if (warnings.length === 5) {
      await applyModerationAction({
        actor,
        targetUserId: target._id,
        type: 'ban',
        reason: 'Автоматическая блокировка на 7 дней после пяти активных предупреждений',
        duration: 7 * DAY_MS,
        automatic: true,
        sourceKey: `warning-ban:${target._id}:${warnings.map(item => item._id).sort().join('-')}`,
        io
      });
    }
    if (warnings.length === 7) {
      const warningIds = warnings.map(item => String(item._id)).sort();
      await Case.findOneAndUpdate(
        { sourceKey: `warning-review:${target._id}:${warningIds.join('-')}` },
        {
          $setOnInsert: {
            kind: 'report',
            reporter: actor._id,
            subjectUser: target._id,
            title: `Проверка семи предупреждений: @${target.username}`,
            description: 'Система зафиксировала семь активных предупреждений. Требуется решение старшего сотрудника о бессрочной блокировке.',
            priority: 'critical',
            sourceKey: `warning-review:${target._id}:${warningIds.join('-')}`,
            tags: ['automatic', 'warning-threshold']
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
  }

  return { action, user: target };
}

async function revokeModerationAction({ actor, actionId, reason, io = null }) {
  const original = await ModerationAction.findById(actionId)
    .populate('targetUser')
    .populate('issuedBy', 'role username');
  if (!original) throw Object.assign(new Error('Наказание не найдено'), { status: 404 });
  if (!canRevokeModerationAction(actor, original)) {
    throw Object.assign(new Error('Недостаточно прав для снятия наказания'), { status: 403 });
  }
  const alreadyRevoked = await ModerationAction.exists({ type: 'revoke', reverses: original._id });
  if (alreadyRevoked) throw Object.assign(new Error('Наказание уже снято'), { status: 409 });

  const reversal = await ModerationAction.create({
    targetUser: original.targetUser._id,
    issuedBy: actor._id,
    type: 'revoke',
    reason: String(reason || 'Наказание снято сотрудником').trim(),
    reverses: original._id,
    metadata: { originalType: original.type }
  });

  const target = original.targetUser;
  if (original.type === 'mute' && String(target.activeMuteAction || '') === String(original._id)) {
    target.isMuted = false;
    target.muteUntil = null;
    target.muteReason = '';
    target.activeMuteAction = null;
  }
  if (original.type === 'ban' && String(target.activeBanAction || '') === String(original._id)) {
    target.isBanned = false;
    target.banUntil = null;
    target.banReason = '';
    target.activeBanAction = null;
  }
  if (original.type === 'deactivate' && String(target.activeDeactivationAction || '') === String(original._id)) {
    target.deactivatedAt = null;
    target.deactivationReason = '';
    target.activeDeactivationAction = null;
  }
  await target.save();
  if (io) {
    io.to(`user:${target._id}`).emit('moderation:updated', {
      actionId: original._id,
      type: original.type,
      revoked: true,
      at: new Date().toISOString()
    });
  }
  await createNotification(io, {
    user: target._id,
    type: 'system',
    actorName: 'Love Safety',
    preview: `Ограничение снято: ${reversal.reason}`
  });
  return { action: reversal, user: target };
}

async function communicationRestriction(userOrId) {
  const user = typeof userOrId === 'object' && userOrId?._id
    ? userOrId
    : await User.findById(userOrId);
  await refreshModerationState(user);
  if (!user) return { blocked: true, type: 'account', message: 'Пользователь не найден' };
  if (user.deactivatedAt) return { blocked: true, type: 'deactivated', message: 'Аккаунт деактивирован' };
  if (user.isBanned) return { blocked: true, type: 'ban', message: user.banReason || 'Аккаунт заблокирован', expiresAt: user.banUntil };
  if (user.isMuted) return { blocked: true, type: 'mute', message: user.muteReason || 'Общение временно ограничено', expiresAt: user.muteUntil };
  return { blocked: false };
}

function requireCanCommunicate(req, res, next) {
  communicationRestriction(req.user)
    .then(restriction => {
      if (restriction.blocked) return res.status(403).json({ code: 'COMMUNICATION_RESTRICTED', ...restriction });
      next();
    })
    .catch(error => {
      console.error('[moderation] communication guard:', error);
      res.status(500).json({ message: 'Ошибка проверки ограничений' });
    });
}

module.exports = {
  DAY_MS,
  WARNING_ACTIVE_MS,
  durationLimit,
  refreshModerationState,
  activeWarnings,
  applyModerationAction,
  revokeModerationAction,
  canRevokeModerationAction,
  communicationRestriction,
  requireCanCommunicate
};
