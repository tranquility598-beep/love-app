const test = require('node:test');
const assert = require('node:assert/strict');
const { canonicalRole, roleLevel, permissionsFor, canActOn } = require('../config/adminRoles');
const { durationLimit, canRevokeModerationAction, DAY_MS } = require('../services/moderationService');
const { hashToken, safeEqual } = require('../utils/security');
const { adminOriginGuard } = require('../middleware/adminSecurity');
const { assertProductionSecurity } = require('../config/security');

test('legacy roles migrate into the new hierarchy', () => {
  assert.equal(canonicalRole('founder'), 'developer');
  assert.equal(canonicalRole('admin'), 'senior_admin');
  assert.equal(canonicalRole('moderator'), 'senior_moderator');
  assert.ok(roleLevel('developer') > roleLevel('senior_admin'));
});

test('permissions are cumulative and developer is protected', () => {
  const supportPermissions = permissionsFor('support');
  const permissions = permissionsFor('senior_moderator');
  assert.ok(supportPermissions.has('cases.read_report_evidence'));
  assert.equal(supportPermissions.has('cases.read_evidence'), false);
  assert.ok(permissions.has('cases.reply'));
  assert.ok(permissions.has('moderation.warn'));
  assert.ok(permissions.has('moderation.ban_7d'));
  assert.equal(permissionsFor('junior_moderator').has('community.publish'), false);
  assert.equal(permissionsFor('senior_moderator').has('community.publish'), false);
  assert.equal(permissionsFor('junior_admin').has('community.publish'), true);
  assert.equal(canActOn({ role: 'senior_admin' }, { role: 'developer' }), false);
  assert.equal(canActOn({ role: 'developer' }, { role: 'senior_admin' }), true);
  assert.equal(canActOn({ role: 'senior_moderator' }, { role: 'senior_moderator' }), false);
});

test('moderation durations follow rank limits', () => {
  assert.equal(durationLimit('junior_moderator', 'mute'), DAY_MS);
  assert.equal(durationLimit('senior_moderator', 'ban'), 7 * DAY_MS);
  assert.equal(durationLimit('junior_admin', 'ban'), 30 * DAY_MS);
  assert.equal(durationLimit('senior_admin', 'ban'), Infinity);
  assert.equal(durationLimit('support', 'mute'), -1);
});

test('staff cannot revoke penalties issued by equal or higher ranks', () => {
  const target = { _id: 'user-1', role: 'user' };
  const junior = { _id: 'junior-1', role: 'junior_moderator' };
  const otherJunior = { _id: 'junior-2', role: 'junior_moderator' };
  const senior = { _id: 'senior-1', role: 'senior_moderator' };

  assert.equal(canRevokeModerationAction(junior, { type: 'mute', targetUser: target, issuedBy: junior }), true);
  assert.equal(canRevokeModerationAction(junior, { type: 'warning', targetUser: target, issuedBy: otherJunior }), false);
  assert.equal(canRevokeModerationAction(junior, { type: 'ban', targetUser: target, issuedBy: senior }), false);
  assert.equal(canRevokeModerationAction(senior, { type: 'warning', targetUser: target, issuedBy: junior }), true);
  assert.equal(canRevokeModerationAction(senior, { type: 'ban', targetUser: target, issuedBy: senior }), true);
  assert.equal(canRevokeModerationAction(senior, { type: 'mute', targetUser: { role: 'senior_admin' }, issuedBy: junior }), false);
  assert.equal(canRevokeModerationAction(senior, { type: 'revoke', targetUser: target, issuedBy: junior }), false);
});

test('security token comparison rejects changed values', () => {
  const hash = hashToken('csrf-token');
  assert.equal(safeEqual(hash, hashToken('csrf-token')), true);
  assert.equal(safeEqual(hash, hashToken('different-token')), false);
  assert.equal(safeEqual('short', 'longer'), false);
});

test('admin origin guard blocks an untrusted browser origin', () => {
  const req = { headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }, ip: '127.0.0.1', socket: {} };
  let statusCode = 200;
  let payload = null;
  const res = {
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; }
  };
  let nextCalled = false;
  adminOriginGuard(req, res, () => { nextCalled = true; });
  assert.equal(statusCode, 403);
  assert.equal(nextCalled, false);
  assert.match(payload.message, /недоверенного/);
});

test('admin origin guard accepts the configured local origin', () => {
  const req = { headers: { origin: 'http://127.0.0.1:5173', 'sec-fetch-site': 'same-site' }, ip: '127.0.0.1', socket: {} };
  const res = { status() { return this; }, json() { return this; } };
  let nextCalled = false;
  adminOriginGuard(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});

test('production refuses weak or unsafe admin configuration', () => {
  const names = [
    'NODE_ENV',
    'JWT_SECRET',
    'ADMIN_2FA_ENCRYPTION_KEY',
    'ADMIN_ORIGINS',
    'ALLOWED_ORIGINS',
    'ADMIN_ALLOW_NO_ORIGIN',
    'ADMIN_BOOTSTRAP_CODE_HASH',
    'ADMIN_LOCAL_EMAIL_PREVIEW'
  ];
  const original = Object.fromEntries(names.map(name => [name, process.env[name]]));
  try {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'x'.repeat(64);
    process.env.ADMIN_2FA_ENCRYPTION_KEY = 'y'.repeat(64);
    process.env.ADMIN_ORIGINS = 'https://admin.loveapp.chat';
    process.env.ALLOWED_ORIGINS = 'https://loveapp.chat,https://api.loveapp.chat';
    process.env.ADMIN_ALLOW_NO_ORIGIN = 'false';
    delete process.env.ADMIN_BOOTSTRAP_CODE_HASH;
    delete process.env.ADMIN_LOCAL_EMAIL_PREVIEW;
    assert.doesNotThrow(assertProductionSecurity);

    process.env.ADMIN_ORIGINS = '*';
    assert.throws(assertProductionSecurity, /exact HTTPS origins/);
    process.env.ADMIN_ORIGINS = 'https://admin.loveapp.chat';
    process.env.ADMIN_ALLOW_NO_ORIGIN = 'true';
    assert.throws(assertProductionSecurity, /cannot be enabled/);
    process.env.ADMIN_ALLOW_NO_ORIGIN = 'false';
    process.env.JWT_SECRET = 'short';
    assert.throws(assertProductionSecurity, /missing or too short/);
    process.env.JWT_SECRET = 'x'.repeat(64);
    process.env.ADMIN_BOOTSTRAP_CODE_HASH = 'a'.repeat(64);
    assert.throws(assertProductionSecurity, /forbidden in production/);
    delete process.env.ADMIN_BOOTSTRAP_CODE_HASH;
    process.env.ADMIN_LOCAL_EMAIL_PREVIEW = 'true';
    assert.throws(assertProductionSecurity, /LOCAL_EMAIL_PREVIEW is forbidden/);
  } finally {
    for (const name of names) {
      if (original[name] === undefined) delete process.env[name];
      else process.env[name] = original[name];
    }
  }
});
