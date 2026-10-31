/**
 * Вехи страницы: «Вашу страницу открыли 1 000 раз», «100 сердечек».
 *
 * Повод вернуться в редактор и снова поделиться ссылкой. Уведомление приходит
 * в обычную ленту Love (системное, от «Love»). Каждая веха — один раз: порог
 * записывается атомарно, и из двух параллельных показов уведомит только один.
 *
 * У страниц, где вехи ещё не считали (milestones = null), первый подсчёт
 * только запоминает достигнутое — иначе старые популярные страницы получили
 * бы пачку уведомлений о прошлом в первый же показ.
 */

const ProfilePage = require('../models/ProfilePage');
const { createNotification } = require('./notify');

const STEPS = Object.freeze({
  views: [100, 500, 1000, 5000, 10000, 50000, 100000, 500000, 1000000],
  hearts: [10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000]
});

const number = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function words(kind, n) {
  const mod10 = n % 10, mod100 = n % 100;
  const few = mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14);
  if (kind === 'views') {
    return `Вашу страницу открыли ${number(n)} ${few ? 'раза' : 'раз'}. Самое время снова поделиться ссылкой.`;
  }
  const form = mod10 === 1 && mod100 !== 11 ? 'сердечко' : few ? 'сердечка' : 'сердечек';
  return `Ваша страница набрала ${number(n)} ${form}. Поделитесь ею ещё раз — пусть увидят больше людей.`;
}

const reachedStep = (kind, value) => STEPS[kind].filter(step => value >= step).pop() || 0;

async function checkMilestones(io, pageId) {
  try {
    const page = await ProfilePage.findById(pageId).select('user views.total hearts.count milestones notifyMilestones').lean();
    if (!page) return [];
    const sent = [];
    for (const kind of ['views', 'hearts']) {
      const value = kind === 'views' ? page.views?.total || 0 : page.hearts?.count || 0;
      const reached = reachedStep(kind, value);
      const known = page.milestones?.[kind];
      const path = `milestones.${kind}`;
      if (known == null) {
        await ProfilePage.updateOne({ _id: page._id, [path]: null }, { $set: { [path]: reached } });
        continue;
      }
      if (reached <= known) continue;
      // Атомарно «занимаем» веху: второй параллельный показ её уже не получит.
      const claim = await ProfilePage.updateOne({ _id: page._id, [path]: { $lt: reached } }, { $set: { [path]: reached } });
      if (!claim.modifiedCount || page.notifyMilestones === false) continue;
      await createNotification(io, { user: page.user, type: 'system', actorName: 'Love', preview: words(kind, reached) });
      sent.push({ kind, reached });
    }
    return sent;
  } catch (error) {
    console.error('[profile-page] milestones error:', error.message);
    return [];
  }
}

module.exports = { STEPS, checkMilestones, reachedStep, words };
