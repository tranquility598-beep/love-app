/**
 * Вызовы в личке, которые ещё звонят: кто кому, в каком диалоге и сколько
 * осталось до «нет ответа».
 *
 * Раньше звонок офлайн-собеседнику сразу падал ошибкой «Пользователь не в
 * сети», а неотвеченный онлайн-звонок звонил бесконечно и нигде не оставлял
 * следа. Теперь звонок ждёт RING_TIMEOUT_MS: если собеседник за это время
 * откроет приложение — вызов до него дойдёт; если нет — в чат ляжет
 * «Пропущенный звонок», а звонящий получит «Нет ответа».
 */

const RING_TIMEOUT_MS = 45000;

function ringKey(callerId, targetId) {
  return `${callerId}:${targetId}`;
}

function createRingRegistry({ timeoutMs = RING_TIMEOUT_MS, onTimeout } = {}) {
  const rings = new Map();

  function clear(callerId, targetId) {
    const key = ringKey(callerId, targetId);
    const ring = rings.get(key);
    if (!ring) return null;
    clearTimeout(ring.timer);
    rings.delete(key);
    return ring;
  }

  function start(ring) {
    clear(ring.callerId, ring.targetId);
    const key = ringKey(ring.callerId, ring.targetId);
    const entry = { ...ring, startedAt: Date.now() };
    entry.timer = setTimeout(() => {
      if (rings.get(key) !== entry) return;
      rings.delete(key);
      if (typeof onTimeout === 'function') onTimeout(entry);
    }, timeoutMs);
    if (entry.timer && typeof entry.timer.unref === 'function') entry.timer.unref();
    rings.set(key, entry);
    return entry;
  }

  function forTarget(targetId) {
    return Array.from(rings.values()).filter(ring => ring.targetId === targetId);
  }

  function get(callerId, targetId) {
    return rings.get(ringKey(callerId, targetId)) || null;
  }

  function forCaller(callerId) {
    return Array.from(rings.values()).filter(ring => ring.callerId === callerId);
  }

  return { start, clear, get, forTarget, forCaller, get size() { return rings.size; } };
}

function missedCallText(kind) {
  return kind === 'video' ? '📞 Пропущенный видеозвонок' : '📞 Пропущенный звонок';
}

/**
 * Пропущенный звонок — сообщением в сам диалог (видно обоим, на любом
 * устройстве, в том числе на ПК, где push нет) и записью в уведомлениях
 * с кнопкой «Перезвонить».
 */
async function recordMissedCall({ io, ring, Message, DirectMessage, createNotification }) {
  const { callerId, targetId, conversationId, channelId, kind, from } = ring;
  const preview = `Пропущенный звонок от ${from?.username || 'пользователя'}`;

  if (channelId && conversationId) {
    const message = new Message({
      content: missedCallText(kind),
      author: callerId,
      channel: channelId,
      type: 'system'
    });
    await message.save();
    await message.populate('author', 'username nickname avatar discriminator role');

    await DirectMessage.findByIdAndUpdate(conversationId, {
      $inc: { 'unreadCount.$[elem].count': 1 },
      lastMessage: message._id,
      updatedAt: new Date()
    }, {
      arrayFilters: [{ 'elem.user': targetId }]
    });

    if (io) {
      for (const userId of [targetId, callerId]) {
        io.to(`user:${userId}`).emit('dm:new_message', { conversationId, message });
      }
    }
  }

  await createNotification(io, {
    user: targetId,
    type: 'missed_call',
    actor: callerId,
    actorName: from?.username || '',
    actorAvatar: from?.avatar || null,
    preview,
    conversationId: conversationId || null,
    channelId: channelId || null
  });
}

module.exports = {
  RING_TIMEOUT_MS,
  createRingRegistry,
  recordMissedCall,
  missedCallText
};
