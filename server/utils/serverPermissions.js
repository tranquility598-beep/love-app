/**
 * Проверки прав на сервере (учёт владельца и кастомных ролей с правами)
 */

/**
 * Есть ли у пользователя указанное право на сервере.
 *
 * member.roles хранит ObjectId ролей. Строки 'owner'/'admin' остались
 * от ранней версии схемы — поддерживаем их для старых документов,
 * но основной путь это server.roles.id(roleId).permissions.
 *
 * @param {object} server — документ Server (не lean: нужен .roles.id())
 * @param {string|object} userId
 * @param {string} permission — ключ из server.roles[].permissions
 */
function hasServerPermission(server, userId, permission) {
  if (!server || !userId) return false;
  const uid = userId.toString();
  if (server.owner && server.owner.toString() === uid) return true;

  const member = (server.members || []).find(
    (m) => m.user && m.user.toString() === uid
  );
  if (!member || !member.roles || !member.roles.length) return false;

  for (const r of member.roles) {
    // Legacy-строки из ранней схемы.
    if (r === 'owner' || r === 'admin') return true;
    const role = server.roles && server.roles.id ? server.roles.id(r) : null;
    if (!role || !role.permissions) continue;
    if (role.permissions.administrator) return true;
    if (permission && role.permissions[permission]) return true;
  }
  return false;
}

function canManageServerChannels(server, userId) {
  return hasServerPermission(server, userId, 'manageChannels');
}

function canManageServerMessages(server, userId) {
  return hasServerPermission(server, userId, 'manageMessages');
}

function canManageServerRoles(server, userId) {
  return hasServerPermission(server, userId, 'manageRoles');
}

module.exports = {
  hasServerPermission,
  canManageServerChannels,
  canManageServerMessages,
  canManageServerRoles
};
