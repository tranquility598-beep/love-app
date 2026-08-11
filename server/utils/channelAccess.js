/**
 * Единая проверка доступа к каналам.
 *
 * До появления этого модуля проверка членства была размазана по роутам:
 * /api/dm и /api/channels её делали, а /api/messages и socket-обработчики —
 * нет. Из-за этого любой авторизованный пользователь мог читать и писать
 * в чужой канал (включая ЛС), зная только его _id. Все пути к сообщениям
 * теперь обязаны идти через эти функции.
 *
 * DM-каналы: участники хранятся в Channel.participants, но у каналов,
 * созданных ранними версиями, поле может быть пустым — тогда падаем
 * обратно на DirectMessage.participants.
 */

const mongoose = require('mongoose');
const Channel = require('../models/Channel');
const Server = require('../models/Server');
const DirectMessage = require('../models/DirectMessage');

/**
 * Является ли строка валидным ObjectId.
 * Защищает от кастов вида { $ne: null } и от мусорных ключей в Map.
 */
function isValidObjectId(value) {
  return typeof value === 'string'
    ? mongoose.Types.ObjectId.isValid(value) && String(new mongoose.Types.ObjectId(value)) === value
    : mongoose.Types.ObjectId.isValid(value);
}

/** Состоит ли пользователь в участниках сервера. */
function isServerMember(server, userId) {
  if (!server || !userId) return false;
  const uid = userId.toString();
  if (server.owner && server.owner.toString() === uid) return true;
  return (server.members || []).some(m => m.user && m.user.toString() === uid);
}

/**
 * Доступ к серверу (сфере/комнате) по id.
 * @returns {Promise<{allowed: boolean, server: object|null, status: number}>}
 */
async function checkServerAccess(serverId, userId) {
  if (!isValidObjectId(serverId)) {
    return { allowed: false, server: null, status: 404 };
  }
  const server = await Server.findById(serverId);
  if (!server) return { allowed: false, server: null, status: 404 };
  if (!isServerMember(server, userId)) {
    return { allowed: false, server, status: 403 };
  }
  return { allowed: true, server, status: 200 };
}

/**
 * Доступ к каналу по id.
 *
 * status отражает, что можно безопасно сказать клиенту:
 *  404 — канала нет ИЛИ он не наш (не подтверждаем существование чужого канала);
 *  403 — канал наш по типу, но доступа нет.
 *
 * Для чужих каналов сознательно возвращаем 404, а не 403: иначе по коду ответа
 * перебором id можно узнать, какие каналы существуют.
 *
 * @returns {Promise<{allowed: boolean, channel: object|null, status: number, conversation: object|null}>}
 */
async function checkChannelAccess(channelId, userId) {
  const denied = { allowed: false, channel: null, status: 404, conversation: null };
  if (!isValidObjectId(channelId) || !userId) return denied;

  const channel = await Channel.findById(channelId);
  if (!channel) return denied;

  const uid = userId.toString();

  // Серверный канал — нужно членство на сервере.
  if (channel.server) {
    const server = await Server.findById(channel.server);
    if (!server) return { ...denied, channel };
    if (!isServerMember(server, uid)) {
      return { allowed: false, channel, status: 404, conversation: null };
    }
    return { allowed: true, channel, status: 200, conversation: null };
  }

  // DM-канал — нужно быть участником диалога.
  const inChannelParticipants = (channel.participants || [])
    .some(p => p && p.toString() === uid);
  if (inChannelParticipants) {
    return { allowed: true, channel, status: 200, conversation: null };
  }

  // Fallback для старых DM-каналов без participants.
  const conversation = await DirectMessage.findOne({ channel: channel._id });
  if (conversation && conversation.participants.some(p => p.toString() === uid)) {
    return { allowed: true, channel, status: 200, conversation };
  }

  return { allowed: false, channel, status: 404, conversation: null };
}

/**
 * Обёртка для Express: отдаёт ошибку сама и возвращает null,
 * либо возвращает { channel, conversation } при успехе.
 */
async function requireChannelAccess(req, res, channelId) {
  const access = await checkChannelAccess(channelId, req.user._id);
  if (!access.allowed) {
    res.status(access.status).json({
      message: access.status === 403 ? 'Нет доступа к этому каналу' : 'Канал не найден'
    });
    return null;
  }
  return access;
}

module.exports = {
  isValidObjectId,
  isServerMember,
  checkServerAccess,
  checkChannelAccess,
  requireChannelAccess
};
