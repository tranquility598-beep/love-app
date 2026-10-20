/**
 * Метка «этот браузер принадлежит владельцу страницы».
 *
 * Свои заходы владельца на свою же страницу просмотрами не считаются. Узнать
 * владельца на публичном хосте по аккаунту нельзя и не нужно: токен аккаунта
 * сюда намеренно не попадает (см. routes/profilePages.js). Зато в этом же
 * браузере владелец открывал редактор, и каждый запрос редактора с узким
 * токеном оставляет HttpOnly-cookie с подписью id его страницы.
 *
 * Подпись — HMAC от id страницы, сам id и аккаунт в cookie не видны. Подделать
 * её можно лишь для того, чтобы НЕ засчитать свой просмотр, — вреда в этом нет.
 * В одной cookie хранится несколько подписей: одним браузером могут
 * пользоваться двое владельцев страниц.
 */

const crypto = require('crypto');
const { getJwtSecret } = require('./jwtSecret');

const OWNER_COOKIE = 'pf_owner';
const MAX_TAGS = 4;
const OWNER_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

function ownerTag(pageId) {
  return crypto.createHmac('sha256', getJwtSecret())
    .update(`profile-owner:${String(pageId)}`)
    .digest('base64url')
    .slice(0, 22);
}

function ownerTags(req) {
  const raw = req.cookies?.[OWNER_COOKIE];
  if (typeof raw !== 'string') return [];
  return raw.split('.').filter(tag => /^[A-Za-z0-9_-]{22}$/.test(tag)).slice(0, MAX_TAGS);
}

function isOwnerVisit(req, pageId) {
  return ownerTags(req).includes(ownerTag(pageId));
}

function rememberOwner(req, res, pageId) {
  const tag = ownerTag(pageId);
  const tags = ownerTags(req);
  if (tags.includes(tag)) return;
  res.cookie(OWNER_COOKIE, [tag, ...tags].slice(0, MAX_TAGS).join('.'), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: OWNER_COOKIE_MAX_AGE_MS
  });
}

module.exports = { OWNER_COOKIE, ownerTag, isOwnerVisit, rememberOwner };
