/**
 * Полное удаление аккаунта из админ-панели (DELETE /api/admin/users/:id).
 *
 * Что удаляется: сам аккаунт, его сообщения, личные чаты (целиком — вместе
 * с сообщениями собеседника: без второго участника такой чат никому не
 * нужен, а сообщения с удалённым автором ломали бы клиенты), серверы, где он
 * владелец (с каналами и сообщениями), публичная страница, уведомления,
 * сессии и коды входа, голоса, аналитика.
 *
 * Что вычищается у других: друзья, заявки, блокировки, участие в серверах,
 * реакции, «Близкие» и пара на чужих публичных страницах, Duo-оплата.
 *
 * Что остаётся: журнал аудита, обращения, жалобы, история модерации и
 * служебная переписка — это история действий команды, её удаление сделало бы
 * разбор спорных случаев невозможным. Сами записи хранят только id.
 *
 * Модели передаются аргументом — так сервис проверяется в тестах без базы.
 */

function idOf(value) {
  return value && value._id ? value._id : value;
}

/** Что затронет удаление — для окна подтверждения в админке. */
async function purgeFootprint(models, userId) {
  const { Message, DirectMessage, Server } = models;
  const [messages, conversations, ownedServers] = await Promise.all([
    Message.countDocuments({ author: userId }),
    DirectMessage.countDocuments({ participants: userId }),
    Server.find({ owner: userId }).select('name').lean()
  ]);
  return {
    messages,
    conversations,
    ownedServers: ownedServers.map(server => ({ id: String(server._id), name: server.name }))
  };
}

async function purgeUser(models, userId) {
  const {
    User, Message, Channel, DirectMessage, Server, Notification, LoginLog,
    AdminSession, AdminAuthChallenge, AnalyticsEvent, CommunityVote, ProfilePage, RiskSignal
  } = models;
  const counts = {};

  // 1. Серверы, где он владелец, — вместе с каналами и сообщениями
  //    (так же, как DELETE /api/admin/servers/:id).
  const ownedServers = await Server.find({ owner: userId }).select('_id name').lean();
  const ownedServerIds = ownedServers.map(server => server._id);
  if (ownedServerIds.length) {
    const serverChannels = await Channel.find({ server: { $in: ownedServerIds } }).select('_id').lean();
    const serverChannelIds = serverChannels.map(channel => channel._id);
    counts.serverMessages = (await Message.deleteMany({ channel: { $in: serverChannelIds } })).deletedCount || 0;
    await Channel.deleteMany({ server: { $in: ownedServerIds } });
    await Server.deleteMany({ _id: { $in: ownedServerIds } });
    await User.updateMany({ servers: { $in: ownedServerIds } }, { $pull: { servers: { $in: ownedServerIds } } });
  }
  counts.servers = ownedServerIds.length;

  // 2. Личные чаты целиком.
  const conversations = await DirectMessage.find({ participants: userId }).select('_id channel').lean();
  const dmChannelIds = conversations.map(dm => idOf(dm.channel)).filter(Boolean);
  if (conversations.length) {
    counts.dmMessages = (await Message.deleteMany({ channel: { $in: dmChannelIds } })).deletedCount || 0;
    await Channel.deleteMany({ _id: { $in: dmChannelIds } });
    await DirectMessage.deleteMany({ _id: { $in: conversations.map(dm => dm._id) } });
  }
  counts.conversations = conversations.length;

  // 3. Его сообщения в чужих серверах; его реакции и упоминания у других.
  counts.messages = (await Message.deleteMany({ author: userId })).deletedCount || 0;
  await Message.updateMany(
    { 'reactions.users': userId },
    { $pull: { 'reactions.$[r].users': userId }, $inc: { 'reactions.$[r].count': -1 } },
    { arrayFilters: [{ 'r.users': userId }] }
  );
  await Message.updateMany({ mentions: userId }, { $pull: { mentions: userId } });

  // 4. Следы у других людей и в серверах.
  await Server.updateMany({ 'members.user': userId }, { $pull: { members: { user: userId } } });
  await User.updateMany(
    {
      $or: [
        { friends: userId }, { blockedUsers: userId },
        { 'friendRequestsReceived.from': userId }, { 'friendRequestsSent.to': userId }
      ]
    },
    {
      $pull: {
        friends: userId,
        blockedUsers: userId,
        friendRequestsReceived: { from: userId },
        friendRequestsSent: { to: userId }
      }
    }
  );
  // Duo: тариф у партнёра остаётся, просто без ссылки на плательщика.
  await User.updateMany({ planPaidBy: userId }, { $set: { planPaidBy: null } });
  await ProfilePage.updateMany({ closeFriends: userId }, { $pull: { closeFriends: userId } });
  await ProfilePage.updateMany(
    { 'pair.partner': userId },
    { $set: { 'pair.partner': null, 'pair.since': null, 'pair.visible': false } }
  );

  // 5. Его собственные данные.
  await Promise.all([
    ProfilePage.deleteMany({ user: userId }),
    Notification.deleteMany({ $or: [{ user: userId }, { actor: userId }] }),
    LoginLog.deleteMany({ userId }),
    AdminSession.deleteMany({ user: userId }),
    AdminAuthChallenge.deleteMany({ user: userId }),
    AnalyticsEvent.deleteMany({ $or: [{ user: userId }, { relatedUser: userId }] }),
    CommunityVote.deleteMany({ user: userId }),
    RiskSignal.deleteMany({ user: userId })
  ]);

  // 6. Сам аккаунт — последним: если что-то выше упало, аккаунт остаётся,
  //    и удаление можно повторить.
  counts.user = (await User.deleteOne({ _id: userId })).deletedCount || 0;
  return counts;
}

module.exports = { purgeUser, purgeFootprint };
