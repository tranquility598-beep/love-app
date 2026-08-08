/**
 * Роут WebRTC-конфигурации.
 * Выдаёт клиенту ICE-серверы без хранения TURN-секретов в клиентском коде.
 *
 * Режимы (по приоритету):
 * 1. TURN_SECRET задан → временные credentials по схеме coturn REST API
 *    (use-auth-secret + static-auth-secret): username = "<expiry>:<userId>",
 *    credential = base64(HMAC-SHA1(username, TURN_SECRET)). TTL: TURN_TTL (сек, по умолчанию 86400).
 * 2. Заданы TURN_USERNAME/TURN_CREDENTIAL → статические credentials из серверного env
 *    (переходный режим; секреты не покидают сервер).
 * 3. Иначе → только STUN (TURN не сконфигурирован).
 */

const express = require('express');
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth');

const router = express.Router();

const DEFAULT_STUN_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

const DEFAULT_TURN_TTL = 24 * 60 * 60; // 24 часа

function parseTurnUrls(raw) {
  return String(raw || '')
    .split(',')
    .map(value => value.trim())
    .filter(value => /^turns?:/i.test(value));
}

function buildIceServers(userId, env = process.env, now = Date.now()) {
  const iceServers = [...DEFAULT_STUN_SERVERS];
  const urls = parseTurnUrls(env.TURN_URLS);
  if (!urls.length) {
    return { iceServers, mode: 'stun-only' };
  }

  if (env.TURN_SECRET) {
    const ttl = Number.parseInt(env.TURN_TTL || String(DEFAULT_TURN_TTL), 10) || DEFAULT_TURN_TTL;
    const expiry = Math.floor(now / 1000) + ttl;
    const username = `${expiry}:${userId}`;
    const credential = crypto.createHmac('sha1', env.TURN_SECRET).update(username).digest('base64');
    iceServers.push({ urls, username, credential });
    return { iceServers, mode: 'ephemeral', ttl };
  }

  if (env.TURN_USERNAME && env.TURN_CREDENTIAL) {
    iceServers.push({ urls, username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL });
    return { iceServers, mode: 'static-env' };
  }

  return { iceServers, mode: 'stun-only' };
}

/**
 * GET /api/webrtc/ice-config
 * Возвращает конфигурацию ICE-серверов для текущего пользователя.
 */
router.get('/ice-config', authMiddleware, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(buildIceServers(String(req.user._id)));
});

module.exports = router;
module.exports.buildIceServers = buildIceServers;
module.exports.parseTurnUrls = parseTurnUrls;
