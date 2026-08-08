const express = require('express');
const bcrypt = require('bcryptjs');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AdminSession = require('../models/AdminSession');
const AdminAuthChallenge = require('../models/AdminAuthChallenge');
const { authLimiter, otpLimiter } = require('../middleware/rateLimiter');
const { adminSessionAuth, SESSION_MAX_MS, setAdminCookie, clearAdminCookie } = require('../middleware/adminSessionAuth');
const { isStaffRole, canonicalRole, ROLE_LABELS, permissionsFor } = require('../config/adminRoles');
const { generateOTP, sendOTPEmail } = require('../utils/emailService');
const { randomToken, hashToken, safeEqual, encryptSecret, decryptSecret, requestIp } = require('../utils/security');
const { getJwtSecret } = require('../utils/jwtSecret');

const router = express.Router();
const CHALLENGE_MS = 10 * 60 * 1000;

function canUseLocalBootstrap(req, user) {
  const configuredHash = String(process.env.ADMIN_BOOTSTRAP_CODE_HASH || '').trim().toLowerCase();
  const ip = requestIp(req);
  return process.env.NODE_ENV !== 'production'
    && /^[a-f0-9]{64}$/.test(configuredHash)
    && ['127.0.0.1', '::1'].includes(ip)
    && String(user.username || '').toLowerCase() === 'goodvexel'
    && canonicalRole(user.role) === 'developer'
    && !user.adminTotpEnabled
    && !user.adminBootstrapConsumedAt;
}

function canUseLocalEmailPreview(req) {
  return process.env.NODE_ENV !== 'production'
    && process.env.ADMIN_LOCAL_EMAIL_PREVIEW === 'true'
    && ['127.0.0.1', '::1'].includes(requestIp(req));
}

function publicAdminUser(user) {
  const role = canonicalRole(user.role);
  return {
    ...user.toPublicJSON(),
    role,
    roleLabel: ROLE_LABELS[role],
    permissions: [...permissionsFor(role)],
    adminTotpEnabled: Boolean(user.adminTotpEnabled),
    adminPolicyRequiredVersion: user.adminPolicyRequiredVersion || '',
    adminPolicyAcceptedVersion: user.adminPolicyAcceptedVersion || '',
    adminPolicyAcceptedAt: user.adminPolicyAcceptedAt || null
  };
}

async function loadChallenge(rawToken) {
  if (!rawToken) return null;
  return AdminAuthChallenge.findOne({
    tokenHash: hashToken(rawToken),
    expiresAt: { $gt: new Date() }
  }).select('+emailCodeHash').populate({
    path: 'user',
    select: '+adminTotpSecret +adminRecoveryCodeHashes'
  });
}

router.post('/login', authLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const user = await User.findOne({ email }).select('+adminTotpSecret +adminRecoveryCodeHashes');
    if (!user || !await user.comparePassword(password)) {
      return res.status(401).json({ message: 'Неверный email или пароль' });
    }
    if (!isStaffRole(user.role)) return res.status(403).json({ message: 'Нет доступа к админ-панели' });
    if (user.isBanned || user.deactivatedAt) return res.status(403).json({ message: 'Аккаунт недоступен' });

    await AdminAuthChallenge.deleteMany({ user: user._id });
    const challengeToken = randomToken();
    await AdminAuthChallenge.create({
      user: user._id,
      tokenHash: hashToken(challengeToken),
      expiresAt: new Date(Date.now() + CHALLENGE_MS)
    });

    const methods = ['email'];
    if (user.adminTotpEnabled && user.adminTotpSecret) methods.unshift('totp');
    if (user.adminRecoveryCodeHashes?.length) methods.push('recovery');
    if (canUseLocalBootstrap(req, user)) methods.unshift('bootstrap');
    res.json({ challengeToken, methods, expiresIn: CHALLENGE_MS / 1000 });
  } catch (error) {
    console.error('[admin-auth] login:', error);
    res.status(500).json({ message: 'Ошибка входа в админ-панель' });
  }
});

router.post('/challenge/email', otpLimiter, async (req, res) => {
  try {
    const challenge = await loadChallenge(req.body.challengeToken);
    if (!challenge) return res.status(401).json({ message: 'Запрос входа истёк' });
    if (challenge.emailCodeSentAt && Date.now() - challenge.emailCodeSentAt.getTime() < 60 * 1000) {
      return res.status(429).json({ message: 'Код уже отправлен. Подождите минуту.' });
    }

    const code = generateOTP();
    const localPreview = canUseLocalEmailPreview(req);
    if (!localPreview) {
      const sent = await sendOTPEmail(challenge.user.email, code, 'login');
      if (!sent) {
        return res.status(502).json({
          code: 'EMAIL_DELIVERY_UNAVAILABLE',
          message: 'Почтовый сервис не принял письмо. Выберите Authenticator или обратитесь к разработчику.'
        });
      }
    }

    challenge.emailCodeHash = hashToken(`${req.body.challengeToken}:${code}`);
    challenge.emailCodeSentAt = new Date();
    await challenge.save();
    if (localPreview) {
      return res.json({
        message: 'Локальный код создан. В production он никогда не возвращается в браузер.',
        developmentCode: code
      });
    }
    res.json({ message: 'Код отправлен на подтверждённую почту' });
  } catch (error) {
    console.error('[admin-auth] email challenge:', error);
    res.status(500).json({ message: 'Ошибка отправки кода' });
  }
});

router.post('/verify', otpLimiter, async (req, res) => {
  try {
    const { challengeToken, method, code } = req.body;
    const challenge = await loadChallenge(challengeToken);
    if (!challenge) return res.status(401).json({ message: 'Запрос входа истёк' });
    if (challenge.attempts >= 5) return res.status(429).json({ message: 'Слишком много попыток' });

    const normalizedCode = String(code || '').replace(/\s/g, '');
    let valid = false;
    if (method === 'email') {
      valid = Boolean(challenge.emailCodeHash)
        && safeEqual(challenge.emailCodeHash, hashToken(`${challengeToken}:${normalizedCode}`));
    } else if (method === 'totp' && challenge.user.adminTotpEnabled && challenge.user.adminTotpSecret) {
      valid = authenticator.check(normalizedCode, decryptSecret(challenge.user.adminTotpSecret));
    } else if (method === 'recovery') {
      const hashes = challenge.user.adminRecoveryCodeHashes || [];
      for (let index = 0; index < hashes.length; index += 1) {
        if (await bcrypt.compare(normalizedCode.toUpperCase(), hashes[index])) {
          valid = true;
          hashes.splice(index, 1);
          challenge.user.adminRecoveryCodeHashes = hashes;
          await challenge.user.save();
          break;
        }
      }
    } else if (method === 'bootstrap' && canUseLocalBootstrap(req, challenge.user)) {
      valid = safeEqual(
        hashToken(normalizedCode.toUpperCase()),
        String(process.env.ADMIN_BOOTSTRAP_CODE_HASH || '').trim().toLowerCase()
      );
    }

    if (!valid) {
      challenge.attempts += 1;
      await challenge.save();
      return res.status(400).json({ message: 'Неверный или истёкший код' });
    }

    const sessionToken = randomToken();
    const csrfToken = randomToken();
    await AdminSession.create({
      user: challenge.user._id,
      tokenHash: hashToken(sessionToken),
      csrfHash: hashToken(csrfToken),
      twoFactorMethod: method,
      ip: requestIp(req),
      userAgent: req.headers['user-agent'] || '',
      expiresAt: new Date(Date.now() + SESSION_MAX_MS)
    });
    await AdminAuthChallenge.deleteOne({ _id: challenge._id });
    setAdminCookie(res, sessionToken);
    res.json({ csrfToken, user: publicAdminUser(challenge.user) });
  } catch (error) {
    console.error('[admin-auth] verify:', error);
    res.status(500).json({ message: 'Ошибка подтверждения входа' });
  }
});

router.get('/me', adminSessionAuth, (req, res) => {
  res.json({ user: publicAdminUser(req.user) });
});

router.get('/csrf', adminSessionAuth, async (req, res) => {
  const csrfToken = randomToken();
  req.adminSession.csrfHash = hashToken(csrfToken);
  await req.adminSession.save();
  res.json({ csrfToken });
});

router.post('/socket-token', adminSessionAuth, (req, res) => {
  if (!req.user.adminTotpEnabled) {
    return res.status(428).json({ code: 'ADMIN_TOTP_REQUIRED', message: 'Для служебной связи подключите Authenticator' });
  }
  if (req.user.adminPolicyRequiredVersion
    && req.user.adminPolicyAcceptedVersion !== req.user.adminPolicyRequiredVersion) {
    return res.status(428).json({ code: 'ADMIN_POLICY_REQUIRED', message: 'Сначала прочитайте и примите правила команды' });
  }
  const token = jwt.sign({
    userId: String(req.user._id),
    sid: String(req.adminSession._id),
    uaHash: hashToken(String(req.headers['user-agent'] || '').trim()),
    ipHash: hashToken(requestIp(req))
  }, getJwtSecret(), {
    audience: 'admin-socket',
    issuer: 'love-admin',
    expiresIn: '5m'
  });
  res.json({ token, expiresIn: 300 });
});

router.post('/logout', adminSessionAuth, async (req, res) => {
  req.adminSession.revokedAt = new Date();
  await req.adminSession.save();
  clearAdminCookie(res);
  res.json({ message: 'Сессия завершена' });
});

router.post('/totp/setup', adminSessionAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+adminTotpPendingSecret');
    const secret = authenticator.generateSecret();
    user.adminTotpPendingSecret = encryptSecret(secret);
    await user.save();
    const otpauth = authenticator.keyuri(user.email, 'Love Admin', secret);
    res.json({ qrCode: await QRCode.toDataURL(otpauth), manualKey: secret });
  } catch (error) {
    console.error('[admin-auth] totp setup:', error);
    res.status(500).json({ message: 'Не удалось подготовить Authenticator' });
  }
});

router.post('/totp/confirm', adminSessionAuth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('+adminTotpPendingSecret +adminTotpSecret +adminRecoveryCodeHashes');
    if (!user.adminTotpPendingSecret) return res.status(400).json({ message: 'Сначала создайте QR-код' });
    const secret = decryptSecret(user.adminTotpPendingSecret);
    if (!authenticator.check(String(req.body.code || '').replace(/\s/g, ''), secret)) {
      return res.status(400).json({ message: 'Неверный код Authenticator' });
    }

    const recoveryCodes = Array.from({ length: 10 }, () =>
      `${randomToken(4).slice(0, 4)}-${randomToken(4).slice(0, 4)}`.toUpperCase()
    );
    user.adminTotpSecret = encryptSecret(secret);
    user.adminTotpPendingSecret = null;
    user.adminTotpEnabled = true;
    user.twoFactorEnabled = true;
    user.adminBootstrapConsumedAt = new Date();
    user.adminRecoveryCodeHashes = await Promise.all(recoveryCodes.map(value => bcrypt.hash(value, 10)));
    await user.save();
    await AdminSession.updateMany(
      { user: user._id, _id: { $ne: req.adminSession._id }, twoFactorMethod: 'bootstrap', revokedAt: null },
      { revokedAt: new Date() }
    );
    res.json({ message: 'Authenticator подключён', recoveryCodes });
  } catch (error) {
    console.error('[admin-auth] totp confirm:', error);
    res.status(500).json({ message: 'Не удалось подключить Authenticator' });
  }
});

module.exports = router;
