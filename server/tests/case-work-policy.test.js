const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveReportPath } = require('../config/messageReportTaxonomy');
const {
  canWorkCase,
  canAssignCases,
  canChangeCasePriority,
  canArchiveOpenCase,
  minimumRoleForCase
} = require('../config/caseWorkPolicy');

test('message report taxonomy accepts only complete server-defined paths', () => {
  const spam = resolveReportPath(['spam', 'repeated_messages']);
  assert.deepEqual(spam.ids, ['spam', 'repeated_messages']);
  assert.equal(spam.severity, 'high');

  const threat = resolveReportPath(['abuse', 'harassment', 'threats']);
  assert.equal(threat.descriptionRequired, true);
  assert.equal(threat.severity, 'critical');

  assert.equal(resolveReportPath(['abuse', 'harassment']), null);
  assert.equal(resolveReportPath(['unknown']), null);
  assert.equal(resolveReportPath(['spam', 'scam', 'unknown']), null);
});

test('case queues follow staff responsibility boundaries', () => {
  assert.equal(minimumRoleForCase('support'), 'support');
  assert.equal(minimumRoleForCase('report'), 'junior_moderator');
  assert.equal(minimumRoleForCase('appeal'), 'senior_moderator');

  assert.equal(canWorkCase('support', 'support'), true);
  assert.equal(canWorkCase('support', 'report'), false);
  assert.equal(canWorkCase('junior_moderator', 'report'), true);
  assert.equal(canWorkCase('junior_moderator', 'appeal'), false);
  assert.equal(canWorkCase('senior_moderator', 'appeal'), true);
});

test('only senior administrators and above assign cases to other staff', () => {
  assert.equal(canAssignCases('senior_moderator'), false);
  assert.equal(canAssignCases('junior_admin'), false);
  assert.equal(canAssignCases('senior_admin'), true);
  assert.equal(canAssignCases('deputy_developer'), true);
  assert.equal(canAssignCases('developer'), true);
});

test('case priority is controlled by senior moderators and above', () => {
  assert.equal(canChangeCasePriority('support', 'support'), false);
  assert.equal(canChangeCasePriority('junior_moderator', 'report'), false);
  assert.equal(canChangeCasePriority('senior_moderator', 'report'), true);
  assert.equal(canChangeCasePriority('senior_moderator', 'appeal'), true);
  assert.equal(canChangeCasePriority('senior_admin', 'support'), true);
});

test('only senior administrators can archive a still-open case', () => {
  assert.equal(canArchiveOpenCase('junior_moderator'), false);
  assert.equal(canArchiveOpenCase('senior_moderator'), false);
  assert.equal(canArchiveOpenCase('junior_admin'), false);
  assert.equal(canArchiveOpenCase('senior_admin'), true);
});
