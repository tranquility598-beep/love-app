const { requestIp } = require('../utils/security');

function configuredOrigins() {
  const defaults = ['http://localhost:5173', 'http://127.0.0.1:5173'];
  return new Set((process.env.ADMIN_ORIGINS ? process.env.ADMIN_ORIGINS.split(',') : defaults)
    .map(value => value.trim().replace(/\/$/, ''))
    .filter(Boolean));
}

function adminSecurityHeaders(req, res, next) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    Expires: '0',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-site'
  });
  next();
}

function adminOriginGuard(req, res, next) {
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  const fetchSite = String(req.headers['sec-fetch-site'] || '');
  const production = process.env.NODE_ENV === 'production';

  if (fetchSite === 'cross-site') {
    console.warn(`[admin-security] cross-site request blocked from ${requestIp(req)}`);
    return res.status(403).json({ message: 'Запрос из недоверенного источника отклонён' });
  }
  if (!origin) {
    if (production && process.env.ADMIN_ALLOW_NO_ORIGIN !== 'true') {
      console.warn(`[admin-security] origin-less request blocked from ${requestIp(req)}`);
      return res.status(403).json({ message: 'Origin обязателен для административного API' });
    }
    return next();
  }
  if (!configuredOrigins().has(origin)) {
    console.warn(`[admin-security] untrusted origin blocked: ${origin}`);
    return res.status(403).json({ message: 'Источник не разрешён для административного API' });
  }
  next();
}

module.exports = { adminSecurityHeaders, adminOriginGuard };
