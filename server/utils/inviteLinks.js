const { getBaseUrl } = require('./releaseInfo');

/**
 * Ссылки-приглашения.
 *
 * Их две, и они не взаимозаменяемы:
 *  - веб-ссылка `https://<host>/invite/КОД` — то, что человек кидает в чат или
 *    вставляет в браузер. По ней отдаётся страница с превью сферы, кнопкой
 *    «открыть в приложении» и установщиком под ОС гостя (см. routes/invitePage);
 *  - deep link `love-app://invite/КОД` — им уже установленное приложение
 *    открывается сразу на приглашении (Android-манифест ловит этот host).
 *
 * Раньше сервер отдавал наружу только deep link: вставленный в браузер, он
 * просто ничего не делал.
 *
 * INVITE_BASE_URL нужен, когда веб-ссылки надо повесить на публичный домен
 * (`https://loveapp.chat/invite`), а не на хост API. Сайт — статика на
 * Render, поэтому до появления там проксирования на API базой остаётся
 * тот же хост, что отдаёт этот роут.
 */

// Код генерится как uuidv4().substring(0, 8).toUpperCase() — hex и дефис.
// Границы шире фактических: код может измениться, а ломать старые ссылки
// не хочется. Всё, что не проходит проверку, до базы не доходит и в HTML
// не попадает.
const CODE_PATTERN = /^[A-Za-z0-9-]{4,32}$/;

function isInviteCode(value) {
  return CODE_PATTERN.test(String(value == null ? '' : value).trim());
}

function inviteBase(req) {
  const configured = process.env.INVITE_BASE_URL;
  if (configured) return String(configured).replace(/\/+$/, '');
  return `${getBaseUrl(req)}/invite`;
}

function webInviteUrl(req, code) {
  return `${inviteBase(req)}/${encodeURIComponent(String(code || '').trim())}`;
}

function deepInviteUrl(code) {
  return `love-app://invite/${encodeURIComponent(String(code || '').trim())}`;
}

module.exports = { CODE_PATTERN, isInviteCode, inviteBase, webInviteUrl, deepInviteUrl };
