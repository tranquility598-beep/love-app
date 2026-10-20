const { createHash } = require('node:crypto');

// Keep completed auth responses briefly so a lost connection cannot consume an
// OTP twice. This cache contains session tokens; it stays private to this process.
function createAuthReplay({ ttlMs = 180000, maxEntries = 1000 } = {}) {
  const entries = new Map();
  const paths = new Set(['/register', '/login', '/verify-otp', '/verify-2fa', '/resend-otp', '/registration-email']);
  return async function authReplay(req, res, next) {
    if (req.method !== 'POST' || !paths.has(req.path)) return next();
    res.setHeader('Cache-Control', 'no-store');
    const requestId = req.get('X-Auth-Request-Id');
    if (!requestId) return next(); // Existing desktop releases remain supported.
    if (!/^[a-zA-Z0-9-]{20,80}$/.test(requestId)) {
      return res.status(400).json({ message: 'Некорректный идентификатор запроса' });
    }
    const now = Date.now();
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) { entry.resolve(null); entries.delete(key); }
    }
    const key = `${req.ip}:${requestId}`;
    const fingerprint = createHash('sha256').update(req.path + JSON.stringify(req.body)).digest('hex');
    const previous = entries.get(key);
    if (previous) {
      if (previous.fingerprint !== fingerprint) {
        return res.status(409).json({ message: 'Этот запрос уже использован. Повторите действие.' });
      }
      const result = await previous.promise;
      if (!result) return res.status(503).json({ message: 'Запрос ещё обрабатывается. Повторите действие позже.' });
      if (result.retryAfter) res.setHeader('Retry-After', result.retryAfter);
      return res.status(result.status).json(result.body);
    }
    if (entries.size >= maxEntries) {
      return res.status(503).json({ message: 'Сервис входа занят. Попробуйте через минуту.' });
    }
    let resolve;
    const promise = new Promise(done => { resolve = done; });
    const entry = { fingerprint, promise, resolve, expiresAt: now + ttlMs };
    entries.set(key, entry);
    const timer = setTimeout(() => {
      resolve(null);
      if (entries.get(key) === entry) entries.delete(key);
    }, ttlMs);
    timer.unref?.();
    const json = res.json;
    let completed = false;
    res.json = function (body) {
      completed = true;
      resolve({ status: res.statusCode, body, retryAfter: res.getHeader('Retry-After') });
      return json.call(this, body);
    };
    res.once('finish', () => {
      if (!completed) { resolve(null); entries.delete(key); }
    });
    next();
  };
}

module.exports = { createAuthReplay };
