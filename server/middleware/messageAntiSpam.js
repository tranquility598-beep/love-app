/**
 * Per-user-per-channel ступенчатый anti-spam.
 *
 * Логика:
 *   - violationLevel === 0: лимит BASE_MAX_MESSAGES за WINDOW_MS,
 *     cooldown FIRST_COOLDOWN_MS, окно "Харе так спешить!".
 *   - violationLevel >= 1: лимит ужесточается до STRICT_MAX_MESSAGES,
 *     cooldown STRICT_COOLDOWN_MS. Тексты:
 *       level 1 (первый раз после первого нарушения) → "Опять слишком быстро";
 *       level 2+ → "Притормози".
 *     (Сам level увеличивается при каждом срабатывании, поэтому 2-е нарушение
 *      => violationLevel становится 2 в ответе и т.д. — но границы текстов
 *      стабильны, см. _buildWarning ниже.)
 *   - Reset: если cooldown закончился и прошло RESET_AFTER_MS без новых
 *     нарушений, violationLevel сбрасывается в 0 и снова работает первая
 *     ступень.
 *
 * Используется и в REST (server/routes/messages.js, middleware), и в
 * сокете (server/socket/socketHandler.js, обработчик 'message:send').
 *
 * Хранилище — in-memory Map. Для multi-instance backend нужно перенести
 * в Redis (общая структура bucket'а одинаковая).
 */

// === Единые константы лимита ===
const BASE_MAX_MESSAGES = 10;
const STRICT_MAX_MESSAGES = 5;
const WINDOW_MS = 5000;
const FIRST_COOLDOWN_MS = 2000;
const STRICT_COOLDOWN_MS = 3000;
const RESET_AFTER_MS = 10000;
const SPAM_CODE = 'MESSAGE_SPAM_COOLDOWN';

// key = `${userId}:${channelId}` -> bucket
// bucket = { timestamps: number[], cooldownUntil: number,
//            violationLevel: number, lastViolationAt: number }
const buckets = new Map();

// Периодический GC. Удаляем записи, у которых:
//   - cooldown истёк;
//   - все timestamps старше окна;
//   - последнее нарушение давно (> RESET_AFTER_MS).
const GC_INTERVAL_MS = 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    const cooldownActive = b.cooldownUntil && b.cooldownUntil > now;
    const hasFresh = b.timestamps.some((t) => now - t < WINDOW_MS);
    const recentViolation = b.lastViolationAt && now - b.lastViolationAt < RESET_AFTER_MS;
    if (!cooldownActive && !hasFresh && !recentViolation) {
      buckets.delete(key);
    }
  }
}, GC_INTERVAL_MS).unref?.();

function _getBucket(key) {
  let b = buckets.get(key);
  if (!b) {
    b = { timestamps: [], cooldownUntil: 0, violationLevel: 0, lastViolationAt: 0 };
    buckets.set(key, b);
  }
  return b;
}

/**
 * Сформировать тексты и cooldown в зависимости от текущего violationLevel
 * (значение УЖЕ после увеличения, т.е. >= 1).
 *   level === 1 → первое нарушение, cooldown 2 сек, "Харе так спешить!";
 *   level === 2 → второе, cooldown 3 сек, "Опять слишком быстро";
 *   level >= 3  → дальнейшие, cooldown 3 сек, "Притормози".
 */
function _buildWarning(level) {
  if (level <= 1) {
    return {
      cooldownMs: FIRST_COOLDOWN_MS,
      retryAfter: Math.ceil(FIRST_COOLDOWN_MS / 1000),
      message: 'Ты отправляешь сообщения слишком быстро. Подождите немного.',
      warningTitle: 'Харе так спешить!',
      warningText: 'Ты отправляешь сообщения слишком быстро. Подожди 2 секунды, потом можно продолжить.',
    };
  }
  if (level === 2) {
    return {
      cooldownMs: STRICT_COOLDOWN_MS,
      retryAfter: Math.ceil(STRICT_COOLDOWN_MS / 1000),
      message: 'Ты снова отправляешь сообщения слишком быстро.',
      warningTitle: 'Опять слишком быстро',
      warningText: 'Похоже на спам. Сделай паузу на 3 секунды перед следующим сообщением.',
    };
  }
  return {
    cooldownMs: STRICT_COOLDOWN_MS,
    retryAfter: Math.ceil(STRICT_COOLDOWN_MS / 1000),
    message: 'Сообщения идут слишком часто.',
    warningTitle: 'Притормози',
    warningText: 'Сообщения идут слишком часто. Подожди 3 секунды, чтобы чат не превращался в спам.',
  };
}

/**
 * Проверить и (при успехе) зафиксировать попытку отправки.
 * Возвращает либо `{ ok: true }`, либо отказ с полями для ответа клиенту.
 */
function checkAndRecord(userId, channelId) {
  if (!userId || !channelId) return { ok: true };
  const key = `${userId}:${channelId}`;
  const now = Date.now();
  const b = _getBucket(key);

  // 1) Активный cooldown — отказ. Тексты строим по ТЕКУЩЕМУ уровню.
  if (b.cooldownUntil > now) {
    const w = _buildWarning(b.violationLevel);
    return {
      ok: false,
      retryAfter: Math.max(1, Math.ceil((b.cooldownUntil - now) / 1000)),
      code: SPAM_CODE,
      message: w.message,
      warningTitle: w.warningTitle,
      warningText: w.warningText,
      violationLevel: b.violationLevel,
    };
  }

  // 2) Reset: прошло RESET_AFTER_MS с момента последнего нарушения и
  //    cooldown давно закончился — возвращаемся в обычный режим.
  if (b.violationLevel > 0 && b.lastViolationAt && now - b.lastViolationAt >= RESET_AFTER_MS) {
    b.violationLevel = 0;
    b.timestamps = [];
  }

  // 3) Лимит зависит от ступени.
  const limit = b.violationLevel === 0 ? BASE_MAX_MESSAGES : STRICT_MAX_MESSAGES;

  // 4) Чистим timestamps вне окна И всё, что было ДО окончания последнего
  //    cooldown'а. Иначе сообщения, которыми пользователь уже "наспамил"
  //    до warning-а, продолжают считаться после ожидания и сразу триггерят
  //    второй cooldown на первом же новом сообщении. После cooldown
  //    подсчёт начинается с чистого листа в новом окне.
  const cutoff = Math.max(now - WINDOW_MS, b.cooldownUntil || 0);
  b.timestamps = b.timestamps.filter((t) => t >= cutoff);

  // 5) Если уже накопили лимит — повышаем уровень и включаем cooldown.
  if (b.timestamps.length >= limit) {
    b.violationLevel += 1;
    const w = _buildWarning(b.violationLevel);
    b.cooldownUntil = now + w.cooldownMs;
    b.lastViolationAt = now;
    b.timestamps = []; // после cooldown — чистый лист
    return {
      ok: false,
      retryAfter: w.retryAfter,
      code: SPAM_CODE,
      message: w.message,
      warningTitle: w.warningTitle,
      warningText: w.warningText,
      violationLevel: b.violationLevel,
    };
  }

  // 6) Всё ок — записываем эту попытку.
  b.timestamps.push(now);
  return { ok: true };
}

/**
 * Express-middleware. Использовать ПОСЛЕ authMiddleware и messageLimiter.
 * При отказе отвечает 429 JSON с полями warningTitle/warningText/retryAfter/violationLevel.
 */
function messageAntiSpamMiddleware(req, res, next) {
  const userId = req.user?._id?.toString();
  const channelId = req.params?.channelId;
  if (!userId || !channelId) return next();

  const r = checkAndRecord(userId, channelId);
  if (r.ok) return next();

  res.status(429).json({
    message: r.message,
    retryAfter: r.retryAfter,
    code: r.code,
    warningTitle: r.warningTitle,
    warningText: r.warningText,
    violationLevel: r.violationLevel,
  });
}

module.exports = {
  checkAndRecord,
  messageAntiSpamMiddleware,
  BASE_MAX_MESSAGES,
  STRICT_MAX_MESSAGES,
  WINDOW_MS,
  FIRST_COOLDOWN_MS,
  STRICT_COOLDOWN_MS,
  RESET_AFTER_MS,
  SPAM_CODE,
};
