const AdminSession = require('../models/AdminSession');
const { hashToken, safeEqual, requestIp } = require('../utils/security');
const { isStaffRole, canonicalRole, permissionsFor } = require('../config/adminRoles');

const ADMIN_COOKIE = process.env.NODE_ENV === 'production' ? '__Host-love_admin_session' : 'love_admin_session';
const SESSION_MAX_MS = 8 * 60 * 60 * 1000;
const SESSION_IDLE_MS = 30 * 60 * 1000;

function clearAdminCookie(res) {
  res.clearCookie(ADMIN_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: process.env.NODE_ENV === 'production' ? '/' : '/api/admin'
  });
}

function setAdminCookie(res, token) {
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: process.env.NODE_ENV === 'production' ? '/' : '/api/admin',
    maxAge: SESSION_MAX_MS
  });
}

async function adminSessionAuth(req, res, next) {
  try {
    const rawToken = req.cookies?.[ADMIN_COOKIE];
    if (!rawToken) return res.status(401).json({ message: 'Необходим вход в админ-панель' });

    const session = await AdminSession.findOne({ tokenHash: hashToken(rawToken), revokedAt: null })
      .select('+csrfHash')
      .populate('user');
    const now = Date.now();
    if (!session || !session.user || session.expiresAt.getTime() <= now) {
      clearAdminCookie(res);
      return res.status(401).json({ message: 'Административная сессия истекла' });
    }
    if (now - session.lastSeenAt.getTime() > SESSION_IDLE_MS) {
      session.revokedAt = new Date();
      await session.save();
      clearAdminCookie(res);
      return res.status(401).json({ message: 'Сессия завершена из-за бездействия' });
    }

    const user = session.user;
    if (!isStaffRole(user.role)) {
      session.revokedAt = new Date();
      await session.save();
      clearAdminCookie(res);
      return res.status(403).json({ message: 'Недостаточно прав для админ-панели' });
    }
    if (user.isBanned || user.deactivatedAt) {
      return res.status(403).json({ message: 'Административный аккаунт недоступен' });
    }

    const currentUserAgent = String(req.headers['user-agent'] || '').slice(0, 500);
    const strictIp = process.env.ADMIN_STRICT_IP === 'true' || process.env.NODE_ENV === 'production';
    if (!safeEqual(userAgentFingerprint(session.userAgent), userAgentFingerprint(currentUserAgent))
      || (strictIp && !safeEqual(session.ip, requestIp(req)))) {
      session.revokedAt = new Date();
      await session.save();
      clearAdminCookie(res);
      console.warn(`[admin-security] session binding mismatch for user ${user._id}`);
      return res.status(401).json({ message: 'Параметры защищённой сессии изменились. Войдите снова.' });
    }

    if (!user.adminTotpEnabled && req.baseUrl !== '/api/admin/auth') {
      return res.status(428).json({ code: 'ADMIN_TOTP_REQUIRED', message: 'Для доступа к админ-панели подключите Authenticator' });
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const csrfToken = req.headers['x-csrf-token'];
      if (!csrfToken || !safeEqual(hashToken(csrfToken), session.csrfHash)) {
        return res.status(403).json({ message: 'Неверный CSRF-токен' });
      }
    }

    if (now - session.lastSeenAt.getTime() > 60 * 1000) {
      session.lastSeenAt = new Date();
      await session.save();
    }

    req.user = user;
    req.adminSession = session;
    req.adminRole = canonicalRole(user.role);
    req.adminPermissions = permissionsFor(user.role);
    next();
  } catch (error) {
    console.error('[admin-auth] session error:', error);
    res.status(500).json({ message: 'Ошибка проверки административной сессии' });
  }
}

function userAgentFingerprint(value) {
  return hashToken(String(value || '').trim());
}

module.exports = {
  adminSessionAuth,
  ADMIN_COOKIE,
  SESSION_MAX_MS,
  setAdminCookie,
  clearAdminCookie
};
