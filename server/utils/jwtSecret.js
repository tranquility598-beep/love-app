/**
 * Единая точка доступа к JWT-секрету.
 *
 * Раньше в четырёх модулях был захардкожен публичный fallback
 * ('love-app-secret-key-2024'), утёкший в репозиторий. Теперь:
 * - production: JWT_SECRET обязателен (>= 32 символов), иначе ошибка при старте;
 * - dev без JWT_SECRET: генерируется эфемерный секрет на время жизни процесса
 *   (все токены инвалидируются при перезапуске — безопасный дефолт).
 */

const crypto = require('crypto');

let cachedSecret = null;

function getJwtSecret() {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set and at least 32 characters in production');
  }

  if (fromEnv) {
    console.warn('⚠️  JWT_SECRET короче 32 символов — допустимо только вне production.');
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  cachedSecret = crypto.randomBytes(32).toString('hex');
  console.warn('⚠️  JWT_SECRET не задан — сгенерирован эфемерный секрет (dev). Все токены сбросятся при перезапуске.');
  return cachedSecret;
}

module.exports = { getJwtSecret };
