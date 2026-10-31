/**
 * Карточка «Вступить в мою сферу» на публичной странице.
 *
 * На странице хранится только код приглашения и id сферы. Название, иконка и
 * число участников берутся из самой сферы на каждом показе: переименовали её —
 * карточка обновилась, отозвали приглашение или владелец страницы вышел из
 * сферы — карточка пропала сама, без мёртвой кнопки.
 */

const mongoose = require('mongoose');
const Server = require('../models/Server');
const { CODE_PATTERN, webInviteUrl } = require('./inviteLinks');
const { mediaOrigin } = require('./profilePageUrls');
const { publicAvatar } = require('./profilePageView');

/**
 * Код из того, что человек вставил: веб-ссылка …/invite/КОД, ссылка
 * love-app://invite/КОД или голый код. Всё прочее — null.
 */
function extractInviteCode(raw) {
  const text = String(raw == null ? '' : raw).trim();
  if (!text || text.length > 300) return null;
  const tail = text.split(/[?#]/)[0].replace(/\/+$/, '').split('/').pop();
  return CODE_PATTERN.test(tail) ? tail : null;
}

function inviteUsable(invite) {
  if (!invite) return false;
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now()) return false;
  if (invite.maxUses && invite.uses >= invite.maxUses) return false;
  return true;
}

/** Сфера по коду, если владелец страницы в ней состоит и приглашение живое. */
async function findInviteServer(code, userId) {
  if (!code || !mongoose.isValidObjectId(String(userId))) return null;
  const [server] = await Server.aggregate([
    { $match: { 'invites.code': code, 'members.user': new mongoose.Types.ObjectId(String(userId)) } },
    { $limit: 1 },
    {
      $project: {
        name: 1,
        icon: 1,
        kind: '$settings.kind',
        members: { $size: { $ifNull: ['$members', []] } },
        invite: { $arrayElemAt: [{ $filter: { input: '$invites', cond: { $eq: ['$$this.code', code] } } }, 0] }
      }
    }
  ]);
  return server && inviteUsable(server.invite) ? server : null;
}

/**
 * Проверка при сохранении: { code, server } или { error }.
 * null/'' — убрать карточку.
 */
async function resolveInvitePatch(raw, user) {
  if (raw === null || raw === '' || (raw && typeof raw === 'object' && !raw.code)) return { clear: true };
  const code = extractInviteCode(typeof raw === 'object' ? raw.code : raw);
  if (!code) return { error: 'Вставьте ссылку-приглашение из Love' };
  const server = await findInviteServer(code, user._id);
  if (!server) return { error: 'Приглашение не найдено, истекло или вы не состоите в этой сфере' };
  return { code, server: server._id };
}

function iconUrl(icon, req) {
  const value = String(icon || '').trim();
  if (value.startsWith('/uploads/')) return publicAvatar(`${mediaOrigin(req)}${value}`);
  return publicAvatar(value);
}

/** Данные карточки для рендера или null. */
async function loadInviteCard(page, req) {
  const code = page?.invite?.code;
  if (!code || !page.invite.server) return null;
  try {
    const server = await findInviteServer(code, page.user?._id || page.user);
    if (!server) return null;
    return {
      name: String(server.name || 'Сфера').slice(0, 60),
      icon: iconUrl(server.icon, req),
      kind: server.kind === 'room' ? 'room' : 'guild',
      members: Number(server.members) || 0,
      url: webInviteUrl(req, code)
    };
  } catch (error) {
    // Карточка — украшение: без неё страница всё равно должна открыться.
    console.error('[profile-page] invite card error:', error.message);
    return null;
  }
}

module.exports = { extractInviteCode, resolveInvitePatch, loadInviteCard };
