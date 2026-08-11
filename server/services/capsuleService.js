/**
 * Капсулы времени.
 *
 * Капсула — обычное сообщение с deliverAt в будущем и delivered=false.
 * До срока оно лежит в БД, но не попадает ни в одну выдачу: все читающие
 * запросы фильтруют по delivered: { $ne: false } (см. routes/messages.js,
 * routes/directMessages.js, socketHandler). Автор видит свои капсулы
 * отдельным списком — они не смешиваются с лентой канала.
 *
 * Планировщик раз в минуту берёт созревшие капсулы, помечает delivered=true
 * и рассылает их так же, как обычное новое сообщение.
 *
 * Почему $ne: false, а не === true: у миллионов старых сообщений поля
 * delivered нет вообще. Они должны продолжать отображаться.
 */

const Message = require('../models/Message');
const Channel = require('../models/Channel');
const DirectMessage = require('../models/DirectMessage');
const { createNotification } = require('../utils/notify');

// Насколько далеко в будущее разрешено ставить капсулу.
const MAX_DELIVER_AHEAD_MS = 5 * 365 * 24 * 60 * 60 * 1000; // 5 лет
// Минимальный отступ — иначе «капсула» на 10 секунд вперёд просто
// путает пользователя: он не понимает, почему сообщение исчезло.
const MIN_DELIVER_AHEAD_MS = 60 * 1000; // 1 минута

const TICK_INTERVAL_MS = 60 * 1000;
// Ограничиваем пачку: если планировщик долго не работал, не тянем
// в память всё разом.
const BATCH_SIZE = 200;

let timer = null;

/**
 * Разбор и проверка даты доставки из клиентского payload.
 *
 * @param {*} raw — значение deliverAt (ISO-строка или timestamp)
 * @returns {{ok: true, date: Date} | {ok: false, error: string}}
 */
function parseDeliverAt(raw) {
  if (raw === undefined || raw === null || raw === '') {
    return { ok: true, date: null };
  }

  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'Некорректная дата доставки' };
  }

  const delta = date.getTime() - Date.now();
  if (delta < MIN_DELIVER_AHEAD_MS) {
    return { ok: false, error: 'Дата капсулы должна быть минимум на минуту в будущем' };
  }
  if (delta > MAX_DELIVER_AHEAD_MS) {
    return { ok: false, error: 'Капсулу можно отправить максимум на 5 лет вперёд' };
  }

  return { ok: true, date };
}

/**
 * Кому рассылать доставленную капсулу.
 * Серверный канал — всей комнате сервера, ЛС — обоим участникам.
 */
async function resolveRecipients(message) {
  const channel = await Channel.findById(message.channel).select('server participants').lean();
  if (!channel) return { channel: null, conversation: null, rooms: [], userIds: [] };

  if (channel.server) {
    return { channel, conversation: null, rooms: [`server:${channel.server}`], userIds: [] };
  }

  const conversation = await DirectMessage.findOne({ channel: channel._id }).select('participants').lean();
  let participants = channel.participants || [];
  if (!participants.length) {
    participants = conversation ? conversation.participants || [] : [];
  }

  return {
    channel,
    conversation,
    rooms: participants.map(p => `user:${p}`),
    userIds: participants.map(p => p.toString())
  };
}

/**
 * Доставить одну созревшую капсулу.
 * Отмечаем доставленной атомарно (findOneAndUpdate по delivered:false),
 * чтобы два тика подряд — или два процесса — не разослали её дважды.
 */
async function deliverCapsule(io, capsuleId) {
  const message = await Message.findOneAndUpdate(
    { _id: capsuleId, delivered: false },
    { $set: { delivered: true } },
    { new: true }
  ).populate('author', 'username nickname avatar discriminator role');

  // Уже забрал другой тик.
  if (!message) return false;

  const { channel, conversation, rooms, userIds } = await resolveRecipients(message);
  if (!channel) return true;

  // Капсула становится последним сообщением канала только сейчас.
  await Channel.findByIdAndUpdate(message.channel, { lastMessage: message._id });

  const channelId = message.channel.toString();
  const authorId = message.author && message.author._id
    ? message.author._id.toString()
    : String(message.author);

  if (io) {
    const payload = { channelId, message, capsule: true };
    rooms.forEach(room => {
      io.to(room).emit('message:new', payload);
      io.to(room).emit('capsule:delivered', payload);
    });
  }

  // ЛС: список диалогов и счётчик непрочитанных живут в DirectMessage,
  // а не в Channel. Без этого капсула приходит в открытый чат, но диалог
  // не поднимается наверх и остаётся «прочитанным».
  if (conversation) {
    const others = (conversation.participants || [])
      .map(p => p.toString())
      .filter(p => p !== authorId);

    await DirectMessage.findByIdAndUpdate(conversation._id, {
      lastMessage: message._id,
      updatedAt: new Date()
    });

    for (const userId of others) {
      await DirectMessage.updateOne(
        { _id: conversation._id, 'unreadCount.user': userId },
        { $inc: { 'unreadCount.$.count': 1 } }
      );
      if (io) {
        io.to(`user:${userId}`).emit('dm:new_message', {
          conversationId: conversation._id,
          message
        });
      }
    }
  }

  // Уведомление получателю — капсула обычно приходит,
  // когда чат давно закрыт, иначе её просто не заметят.
  for (const userId of userIds) {
    if (userId === authorId) continue;
    await createNotification(io, {
      user: userId,
      type: 'capsule',
      actor: authorId,
      actorName: message.author?.username || '',
      actorAvatar: message.author?.avatar || null,
      preview: `Капсула времени от ${message.author?.username || 'пользователя'} открылась`,
      channelId: message.channel,
      conversationId: conversation ? conversation._id : null
    });
  }

  return true;
}

/**
 * Один проход планировщика: разобрать все созревшие капсулы.
 * Экспортируется отдельно — удобно дёрнуть вручную и в тестах.
 */
async function processDueCapsules(io) {
  const due = await Message.find({
    delivered: false,
    deliverAt: { $lte: new Date() },
    deleted: false
  })
    .select('_id')
    .limit(BATCH_SIZE)
    .lean();

  let count = 0;
  for (const item of due) {
    try {
      if (await deliverCapsule(io, item._id)) count += 1;
    } catch (error) {
      // Одна битая капсула не должна останавливать остальные.
      console.error('[capsule] Ошибка доставки', item._id, error.message);
    }
  }

  if (count) console.log(`⏳ Доставлено капсул времени: ${count}`);
  return count;
}

function startCapsuleScheduler(io) {
  if (timer) return timer;

  // Первый прогон сразу после старта: пока сервер лежал,
  // сроки могли наступить.
  processDueCapsules(io).catch(err => console.error('[capsule] Первый проход:', err.message));

  timer = setInterval(() => {
    processDueCapsules(io).catch(err => console.error('[capsule] Тик планировщика:', err.message));
  }, TICK_INTERVAL_MS);

  // Не держим процесс живым только ради таймера.
  if (typeof timer.unref === 'function') timer.unref();

  console.log('⏳ Планировщик капсул времени запущен');
  return timer;
}

function stopCapsuleScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = {
  parseDeliverAt,
  processDueCapsules,
  deliverCapsule,
  startCapsuleScheduler,
  stopCapsuleScheduler,
  MIN_DELIVER_AHEAD_MS,
  MAX_DELIVER_AHEAD_MS
};
