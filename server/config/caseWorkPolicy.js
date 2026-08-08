const { roleLevel } = require('./adminRoles');

const CASE_MINIMUM_ROLE = Object.freeze({
  support: 'support',
  bug: 'support',
  idea: 'support',
  report: 'junior_moderator',
  appeal: 'senior_moderator'
});

function minimumRoleForCase(kind) {
  return CASE_MINIMUM_ROLE[kind] || 'support';
}

function canWorkCase(role, kind) {
  return roleLevel(role) >= roleLevel(minimumRoleForCase(kind));
}

function canAssignCases(role) {
  return roleLevel(role) >= roleLevel('senior_admin');
}

function canChangeCasePriority(role, kind) {
  return roleLevel(role) >= roleLevel('senior_moderator') && canWorkCase(role, kind);
}

function canArchiveOpenCase(role) {
  return roleLevel(role) >= roleLevel('senior_admin');
}

module.exports = {
  CASE_MINIMUM_ROLE,
  minimumRoleForCase,
  canWorkCase,
  canAssignCases,
  canChangeCasePriority,
  canArchiveOpenCase
};
