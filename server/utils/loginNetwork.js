const axios = require('axios');
const { isIP } = require('node:net');

function createLoginNetworkInfo({ lookup = axios.get, timeoutMs = 1200, cacheMs = 600000 } = {}) {
  const cache = new Map();
  return async function getLoginNetworkInfo(req) {
    // Express applies the configured trust proxy policy to req.ip.
    const ip = String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
    if (!isIP(ip)) return { ip: 'unknown', location: 'Неизвестно' };
    if (ip === '::1' || ip.startsWith('127.') || ip.startsWith('10.') || ip.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) {
      return { ip, location: 'Локальная сеть (Local)' };
    }
    const cached = cache.get(ip);
    if (cached && cached.expiresAt > Date.now()) return { ip, location: cached.location };
    let timer;
    let location = 'Неизвестно';
    try {
      const response = await Promise.race([
        lookup(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,city`, { timeout: timeoutMs }),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('GeoIP timeout')), timeoutMs); })
      ]);
      if (response.data?.status === 'success') {
        location = [response.data.city, response.data.country].filter(Boolean).join(', ') || location;
      }
    } catch (_) {
      // Location is optional. A failed geolocation service must not block login.
    } finally { clearTimeout(timer); }
    if (cache.size >= 256) cache.delete(cache.keys().next().value);
    cache.set(ip, { location, expiresAt: Date.now() + (location === 'Неизвестно' ? 30000 : cacheMs) });
    return { ip, location };
  };
}

module.exports = { createLoginNetworkInfo, getLoginNetworkInfo: createLoginNetworkInfo() };
