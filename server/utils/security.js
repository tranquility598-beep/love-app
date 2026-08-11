const crypto = require('crypto');

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hashToken(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function encryptionKey() {
  const source = process.env.ADMIN_2FA_ENCRYPTION_KEY
    || process.env.JWT_SECRET
    || 'love-admin-development-key';
  return crypto.createHash('sha256').update(source).digest();
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map(part => part.toString('base64url')).join('.');
}

function decryptSecret(payload) {
  const [ivEncoded, tagEncoded, valueEncoded] = String(payload || '').split('.');
  if (!ivEncoded || !tagEncoded || !valueEncoded) throw new Error('Invalid encrypted secret');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivEncoded, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tagEncoded, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(valueEncoded, 'base64url')),
    decipher.final()
  ]).toString('utf8');
}

function requestIp(req) {
  const raw = (process.env.TRUST_CLOUDFLARE === 'true' && req.headers['cf-connecting-ip'])
    || req.ip
    || req.socket?.remoteAddress
    || '';
  return String(raw).trim().replace(/^::ffff:/, '');
}

/**
 * Экранирует спецсимволы regex в пользовательском вводе.
 *
 * Обязательно для любого $regex из query/body: без этого '.*' выгружает
 * всю коллекцию, а конструкции вида '(a+)+$' вешают процесс (ReDoS).
 */
function escapeRegex(value) {
  return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
  randomToken,
  hashToken,
  safeEqual,
  encryptSecret,
  decryptSecret,
  requestIp,
  escapeRegex
};
