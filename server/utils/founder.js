/**
 * Доступ к событиям founder/admin (сокет) и расширенным правам
 * Логика должна совпадать с client/js/founder.js (и опционально .env)
 */

// Совпадает с client/js/founder.js — иначе UI показывает панель, а сокет отвечает «Недостаточно прав»
const CLIENT_LEGACY_FOUNDER_ID = '69b26a1f2ab0c77d91a105d4';
const CLIENT_LEGACY_FOUNDER_EMAIL = 'putinalnksandr@gmail.com';

function isFounderUser(user) {
  if (!user) return false;
  const uid = user._id != null ? String(user._id) : '';

  const envIds = (process.env.FOUNDER_IDS || process.env.FOUNDER_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (envIds.length && envIds.includes(uid)) return true;

  const email = (user.email || '').toLowerCase().trim();

  const founderEmailEnv = (process.env.FOUNDER_EMAIL || '').toLowerCase().trim();
  if (founderEmailEnv && email === founderEmailEnv) return true;

  if (email === CLIENT_LEGACY_FOUNDER_EMAIL) return true;

  if (Array.isArray(user.badges) && user.badges.includes('founder')) return true;

  if (user.role === 'admin' || user.role === 'owner') return true;

  const legacyId = process.env.LEGACY_FOUNDER_ID || CLIENT_LEGACY_FOUNDER_ID;
  return uid === legacyId;
}

module.exports = { isFounderUser };
