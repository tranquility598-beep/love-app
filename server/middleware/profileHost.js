/**
 * Сторож публичного хоста страниц профиля (me.loveapp.chat).
 *
 * ЗАЧЕМ. В server/index.js стоит app.use(express.static(client)) без привязки
 * к хосту — то есть по умолчанию ЛЮБОЙ домен, направленный на этот сервер,
 * отдаёт веб-клиент Love. Для нового поддомена это недопустимо: клиент хранит
 * токен аккаунта в localStorage, а на me.loveapp.chat рендерится оформление,
 * которое придумали пользователи. Один origin для того и другого — это способ
 * потерять аккаунты, а не поддомен.
 *
 * Поэтому здесь белый список: на публичном хосте живут только страницы,
 * редактор и его API. Всё остальное — 404, включая /uploads (медиа страниц
 * ссылается на api.loveapp.chat, см. utils/profilePageUrls.mediaOrigin) и весь
 * прочий API.
 *
 * Подключать ОБЯЗАТЕЛЬНО раньше express.static и раньше роутов — иначе список
 * ничего не решает.
 *
 * Список именно белый, а не чёрный. Чёрный пришлось бы дополнять при каждом
 * новом роуте в проекте, и первая же забытая строка открыла бы на публичном
 * хосте что-нибудь лишнее.
 */

const { isProfileHost } = require('../utils/profilePageUrls');

// Ровно эти пути.
const EXACT = new Set([
  '/',
  '/build',
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/health',
  '/api/health'
]);

// Эти и всё, что под ними.
const PREFIXES = [
  '/build/',            // ассеты редактора
  '/api/profile-page/', // API редактора и жалоб
  '/u/',                // длинная ссылка на страницу
  '/og/'                // картинка превью для соцсетей
];

// Одиночный сегмент по форме ника — короткая ссылка (Pro и выше).
// Форма повторяет usernameRegex из middleware/validation: если здесь окажется
// шире, на публичный хост попадут пути, которые ником быть не могут.
const USERNAME_PATH = /^\/[a-zA-Z0-9_а-яА-ЯёЁ]{2,32}\/?$/;

function isAllowedPath(pathname) {
  if (EXACT.has(pathname)) return true;
  if (PREFIXES.some(prefix => pathname.startsWith(prefix))) return true;
  return USERNAME_PATH.test(pathname);
}

module.exports = function profileHostGuard(req, res, next) {
  if (!isProfileHost(req)) return next();

  // req.path без query — сравнивать надо именно его.
  if (isAllowedPath(req.path)) return next();

  // Коротко и без подсказок: перечислять, что тут есть, незачем.
  return res.status(404).type('text/plain; charset=utf-8').send('Не найдено');
};
