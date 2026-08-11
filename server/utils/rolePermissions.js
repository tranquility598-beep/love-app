/**
 * Санитизация прав роли, приходящих от клиента.
 *
 * role:create/role:update раньше клали объект permissions из payload
 * в документ как есть. Участник с manageRoles мог создать роль с
 * administrator: true и выдать её себе — полный обход прав сервера.
 *
 * Здесь два правила:
 *  1. Разрешены только известные ключи (whitelist, никаких лишних полей).
 *  2. administrator выдаёт только владелец сервера. manageRoles — не
 *     достаточное основание раздавать права выше своих.
 */

// Ключи должны совпадать с server/models/Server.js → roles[].permissions
const PERMISSION_KEYS = [
  'administrator',
  'manageServer',
  'manageRoles',
  'manageChannels',
  'kickMembers',
  'banMembers',
  'manageMessages',
  'sendMessages',
  'readMessages',
  'mentionEveryone',
  'manageNicknames',
  'connect',
  'speak',
  'muteMembers',
  'deafenMembers'
];

const DEFAULT_PERMISSIONS = {
  sendMessages: true,
  readMessages: true,
  connect: true,
  speak: true
};

/**
 * @param {object} raw — permissions из клиентского payload
 * @param {object} options
 * @param {boolean} options.isOwner — владелец сервера (только он даёт administrator)
 * @returns {object} безопасный объект прав
 */
function sanitizeRolePermissions(raw, { isOwner = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_PERMISSIONS };
  }

  const result = {};
  for (const key of PERMISSION_KEYS) {
    if (!(key in raw)) continue;
    // administrator — эскалация до полного контроля над сервером.
    if (key === 'administrator' && !isOwner) continue;
    result[key] = raw[key] === true;
  }

  // Если клиент прислал только запрещённые/неизвестные ключи — дефолт.
  return Object.keys(result).length ? result : { ...DEFAULT_PERMISSIONS };
}

module.exports = { sanitizeRolePermissions, PERMISSION_KEYS, DEFAULT_PERMISSIONS };
