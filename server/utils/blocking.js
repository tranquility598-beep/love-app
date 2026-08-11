/**
 * Блокировка пользователей.
 *
 * До этого модуля user:block только записывал id в User.blockedUsers и
 * нигде не читался: заблокированный человек продолжал писать, звонить и
 * слать заявки в друзья. Кнопка обещала то, чего не было.
 *
 * Правило: блокировка симметрична по эффекту. Если А заблокировал Б,
 * общение не идёт ни в одну сторону — иначе Б продолжает писать в пустоту,
 * а А получает уведомления от того, кого заблокировал.
 */

const User = require('../models/User');

/**
 * Заблокировал ли кто-то из двоих другого.
 * @returns {Promise<boolean>}
 */
async function isBlockedBetween(userA, userB) {
  if (!userA || !userB) return false;
  const a = userA.toString();
  const b = userB.toString();
  if (a === b) return false;

  const users = await User.find({ _id: { $in: [a, b] } })
    .select('_id blockedUsers')
    .lean();

  for (const user of users) {
    const blocked = (user.blockedUsers || []).map(id => id.toString());
    const other = user._id.toString() === a ? b : a;
    if (blocked.includes(other)) return true;
  }
  return false;
}

/**
 * Заблокировал ли blockerId пользователя targetId (односторонняя проверка).
 * Нужна там, где важно направление — например, чтобы не показывать
 * заблокированного в поиске у того, кто его заблокировал.
 */
async function hasBlocked(blockerId, targetId) {
  if (!blockerId || !targetId) return false;
  const user = await User.findById(blockerId).select('blockedUsers').lean();
  if (!user) return false;
  return (user.blockedUsers || []).some(id => id.toString() === targetId.toString());
}

/**
 * Список id, заблокированных пользователем ИЛИ заблокировавших его.
 * Для фильтрации выдачи (поиск, список друзей).
 */
async function blockedIdsFor(userId) {
  if (!userId) return [];
  const uid = userId.toString();
  const [me, blockedMe] = await Promise.all([
    User.findById(uid).select('blockedUsers').lean(),
    User.find({ blockedUsers: uid }).select('_id').lean()
  ]);
  const ids = new Set();
  (me?.blockedUsers || []).forEach(id => ids.add(id.toString()));
  (blockedMe || []).forEach(u => ids.add(u._id.toString()));
  return [...ids];
}

module.exports = { isBlockedBetween, hasBlocked, blockedIdsFor };
