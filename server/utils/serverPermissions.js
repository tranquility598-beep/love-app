/**
 * Проверки прав на сервере (учёт владельца и кастомных ролей с правами)
 */

function canManageServerChannels(server, userId) {
  if (!server || !userId) return false;
  const uid = userId.toString();
  if (server.owner && server.owner.toString() === uid) return true;

  const member = server.members.find(
    (m) => m.user && m.user.toString() === uid
  );
  if (!member || !member.roles || !member.roles.length) return false;

  for (const r of member.roles) {
    if (r === 'owner' || r === 'admin') return true;
    const role = server.roles && server.roles.id ? server.roles.id(r) : null;
    if (
      role &&
      role.permissions &&
      (role.permissions.administrator || role.permissions.manageChannels)
    ) {
      return true;
    }
  }
  return false;
}

module.exports = { canManageServerChannels };
