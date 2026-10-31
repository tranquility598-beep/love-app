/**
 * Сердечко на публичной странице: посетитель жмёт без регистрации.
 *
 * Защита от накрутки складывается из нескольких слоёв, каждый дешёвый:
 *  1. Подпись страницы. Кнопка несёт токен, выданный сервером при показе
 *     (HMAC от id страницы и времени, живёт 12 часов). Слать сердечки, не
 *     открывая страницу, нельзя — а каждый показ сам идёт через лимит.
 *  2. Одно сердечко на посетителя: уникальная отметка (страница, IP, браузер)
 *     в ProfileHeartMark. Повторное нажатие ничего не прибавляет.
 *  3. Не больше HEARTS_PER_IP разных «браузеров» с одного адреса на страницу —
 *     иначе накрутка сменой User-Agent была бы однострочной. Пять, а не один:
 *     за одним адресом мобильного оператора сидят тысячи людей.
 *  4. Частота: не больше HEART_ACTIONS нажатий с адреса за окно.
 *  5. Роботы и сам владелец не считаются.
 */

const crypto = require('crypto');
const { getJwtSecret } = require('./jwtSecret');

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;
const HEARTS_PER_IP = 5;
const HEART_ACTIONS = 40;
const HEART_WINDOW_MS = 10 * 60 * 1000;

const secret = () => `${process.env.PROFILE_HEART_SECRET || getJwtSecret()}:profile-hearts`;
const salt = () => process.env.IP_HASH_SALT || getJwtSecret();
const sign = (pageId, issued) => crypto.createHmac('sha256', secret()).update(`${pageId}.${issued}`).digest('base64url').slice(0, 32);

function issueHeartToken(pageId, now = Date.now()) {
  return `${now.toString(36)}.${sign(String(pageId), now.toString(36))}`;
}

function verifyHeartToken(token, pageId, now = Date.now()) {
  const [issued, signature] = String(token || '').split('.');
  if (!issued || !signature || signature.length !== 32) return false;
  const at = parseInt(issued, 36);
  if (!Number.isFinite(at) || at > now + 60 * 1000 || now - at > TOKEN_TTL_MS) return false;
  const expected = Buffer.from(sign(String(pageId), issued));
  const given = Buffer.from(signature);
  return expected.length === given.length && crypto.timingSafeEqual(expected, given);
}

const hash = value => crypto.createHash('sha256').update(`${salt()}:${value}`).digest('hex').slice(0, 40);
const ipHashOf = req => hash(`ip:${req.ip || ''}`);
const visitorKeyOf = (req, pageId) => hash(`heart:${pageId}:${req.ip || ''}:${req.headers['user-agent'] || ''}`);

// Частота нажатий — память процесса. После рестарта окно обнуляется, и это
// не дыра: остальные слои (подпись, отметка, потолок на адрес) в базе.
const buckets = new Map();
function heartRateOk(ipHash, now = Date.now()) {
  const bucket = buckets.get(ipHash);
  if (!bucket || now >= bucket.reset) {
    if (buckets.size > 20000) for (const [key, value] of buckets) if (now >= value.reset) buckets.delete(key);
    buckets.set(ipHash, { count: 1, reset: now + HEART_WINDOW_MS });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= HEART_ACTIONS;
}

/** 1 234 → «1,2 тыс.» — короткая подпись, как в соцсетях. */
function compactCount(value) {
  const n = Math.max(0, Math.floor(Number(value) || 0));
  if (n < 1000) return String(n);
  if (n < 1e6) return `${(n / 1000).toFixed(n < 1e4 ? 1 : 0).replace('.0', '').replace('.', ',')} тыс.`;
  return `${(n / 1e6).toFixed(1).replace('.0', '').replace('.', ',')} млн`;
}

module.exports = {
  HEARTS_PER_IP, issueHeartToken, verifyHeartToken, ipHashOf, visitorKeyOf, heartRateOk, compactCount
};
