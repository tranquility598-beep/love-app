/**
 * Хелпер для создания персистентных уведомлений.
 * Сохраняет документ Notification и шлёт получателю событие 'notification:new'.
 * Никогда не бросает наружу — сбой уведомления не должен ломать основной поток.
 */

const Notification = require('../models/Notification');

/**
 * @param {object} io      - экземпляр socket.io
 * @param {object} payload - { user, type, actor, actorName, actorAvatar, preview,
 *                             conversationId, channelId, serverId, serverName }
 * @returns {Promise<object|null>} сохранённое уведомление (lean) или null
 */
async function createNotification(io, payload) {
  try {
    if (!payload || !payload.user || !payload.type) return null;

    const notif = await Notification.create({
      user: payload.user,
      type: payload.type,
      actor: payload.actor || null,
      actorName: payload.actorName || '',
      actorAvatar: payload.actorAvatar || null,
      preview: (payload.preview || '').toString().slice(0, 300),
      conversationId: payload.conversationId || null,
      channelId: payload.channelId || null,
      serverId: payload.serverId || null,
      serverName: payload.serverName || ''
    });

    if (io) {
      io.to(`user:${payload.user}`).emit('notification:new', notif.toObject());
    }

    return notif;
  } catch (err) {
    console.error('[notify] Failed to create notification:', err.message);
    return null;
  }
}

module.exports = { createNotification };
