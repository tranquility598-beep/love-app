const test = require('node:test');
const assert = require('node:assert/strict');
const User = require('../models/User');
const { PROFILE_REPORT_PARTS, findProfileReportPart } = require('../config/profileReportParts');

test('значок подписки в профиле: только действующий платный тариф', () => {
  const day = 86400000;
  const badge = fields => new User({ username: 'tester', email: 't@example.com', ...fields }).toPublicJSON().planBadge;
  assert.equal(badge({}), null);
  assert.equal(badge({ plan: 'free' }), null);
  assert.equal(badge({ plan: 'premium' }), 'premium');                       // бессрочно
  assert.equal(badge({ plan: 'pro', planExpiresAt: new Date(Date.now() + day) }), 'pro');
  assert.equal(badge({ plan: 'duo', planExpiresAt: new Date(Date.now() - day) }), null); // истекла
  // Срок и источник наружу не уходят.
  const json = new User({ username: 'x', email: 'x@example.com', plan: 'pro', planExpiresAt: new Date() }).toPublicJSON();
  assert.equal('planExpiresAt' in json, false);
  assert.equal('planSource' in json, false);
});

test('части профиля для жалобы', () => {
  assert.deepEqual(PROFILE_REPORT_PARTS.map(part => part.id),
    ['avatar', 'name', 'bio', 'status', 'listening', 'hobbies', 'whole']);
  assert.equal(findProfileReportPart('bio').label, 'Описание «О себе»');
  assert.equal(findProfileReportPart('password'), null);
});
