const ROLE_ORDER = [
  'support',
  'junior_moderator',
  'senior_moderator',
  'junior_admin',
  'senior_admin',
  'deputy_developer',
  'developer'
];

const LEGACY_ROLE_MAP = Object.freeze({
  moderator: 'senior_moderator',
  admin: 'senior_admin',
  founder: 'developer'
});

const ROLE_LABELS = Object.freeze({
  user: 'Пользователь',
  support: 'Support',
  junior_moderator: 'Младший модератор',
  senior_moderator: 'Старший модератор',
  junior_admin: 'Младший администратор',
  senior_admin: 'Старший администратор',
  deputy_developer: 'Зам. разработчика',
  developer: 'Разработчик'
});

const ROLE_PERMISSIONS = Object.freeze({
  support: [
    'dashboard.basic', 'users.read_basic', 'cases.read_basic', 'cases.triage',
    'cases.reply', 'cases.note', 'cases.read_report_evidence', 'community.moderate_submissions'
  ],
  junior_moderator: [
    'users.read_basic', 'cases.read_evidence', 'moderation.warn', 'moderation.mute_24h',
    'community.moderate_comments'
  ],
  senior_moderator: [
    'moderation.mute_30d', 'moderation.ban_7d', 'moderation.revoke_lower',
    'cases.resolve_appeal', 'staff.supervise_moderators'
  ],
  junior_admin: [
    'dashboard.analytics', 'moderation.mute_permanent', 'moderation.ban_30d',
    'servers.manage', 'announcements.manage', 'community.publish'
  ],
  senior_admin: [
    'users.read_sensitive', 'users.deactivate', 'users.restore', 'moderation.ban_permanent',
    'risk.manage', 'staff.assign_senior_moderator'
  ],
  deputy_developer: [
    'audit.read', 'infrastructure.read', 'analytics.export', 'staff.assign_senior_admin'
  ],
  developer: ['*']
});

function canonicalRole(role) {
  return LEGACY_ROLE_MAP[role] || role;
}

function roleLevel(role) {
  return ROLE_ORDER.indexOf(canonicalRole(role));
}

function isStaffRole(role) {
  return roleLevel(role) >= 0;
}

function permissionsFor(role) {
  const level = roleLevel(role);
  if (level < 0) return new Set();

  const permissions = new Set();
  for (let index = 0; index <= level; index += 1) {
    for (const permission of ROLE_PERMISSIONS[ROLE_ORDER[index]] || []) permissions.add(permission);
  }
  return permissions;
}

function hasPermission(role, permission) {
  const permissions = permissionsFor(role);
  return permissions.has('*') || permissions.has(permission);
}

function canActOn(actor, target) {
  const actorLevel = roleLevel(actor?.role);
  const targetLevel = roleLevel(target?.role);
  if (actorLevel < 0) return false;
  if (canonicalRole(target?.role) === 'developer') return canonicalRole(actor?.role) === 'developer';
  return targetLevel < 0 || actorLevel > targetLevel;
}

module.exports = {
  ROLE_ORDER,
  ROLE_LABELS,
  canonicalRole,
  roleLevel,
  isStaffRole,
  permissionsFor,
  hasPermission,
  canActOn
};
