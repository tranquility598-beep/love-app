const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { buildIceServers, parseTurnUrls } = require('../routes/webrtc');

const TURN_URLS = 'turn:turn.example.com:3478, turn:turn.example.com:3478?transport=tcp';

test('parseTurnUrls filters non-TURN entries and trims whitespace', () => {
  assert.deepEqual(parseTurnUrls(TURN_URLS), [
    'turn:turn.example.com:3478',
    'turn:turn.example.com:3478?transport=tcp'
  ]);
  assert.deepEqual(parseTurnUrls('http://evil.example, , turns:t.example.com:443'), ['turns:t.example.com:443']);
  assert.deepEqual(parseTurnUrls(''), []);
});

test('stun-only mode when TURN is not configured', () => {
  const result = buildIceServers('user1', {});
  assert.equal(result.mode, 'stun-only');
  assert.ok(result.iceServers.every(s => String(s.urls).startsWith('stun:')));
});

test('ephemeral credentials follow coturn REST API scheme', () => {
  const secret = 'test-shared-secret';
  const now = 1_800_000_000_000; // фиксированное время для детерминизма
  const result = buildIceServers('user42', {
    TURN_URLS,
    TURN_SECRET: secret,
    TURN_TTL: '3600'
  }, now);

  assert.equal(result.mode, 'ephemeral');
  assert.equal(result.ttl, 3600);

  const turn = result.iceServers.find(s => Array.isArray(s.urls));
  assert.ok(turn, 'TURN server entry must be present');

  const expectedExpiry = Math.floor(now / 1000) + 3600;
  assert.equal(turn.username, `${expectedExpiry}:user42`);

  const expectedCredential = crypto
    .createHmac('sha1', secret)
    .update(turn.username)
    .digest('base64');
  assert.equal(turn.credential, expectedCredential);
});

test('static env credentials are used as a transitional fallback', () => {
  const result = buildIceServers('user1', {
    TURN_URLS,
    TURN_USERNAME: 'u',
    TURN_CREDENTIAL: 'p'
  });
  assert.equal(result.mode, 'static-env');
  const turn = result.iceServers.find(s => Array.isArray(s.urls));
  assert.equal(turn.username, 'u');
  assert.equal(turn.credential, 'p');
});

test('TURN_SECRET takes precedence over static credentials', () => {
  const result = buildIceServers('user1', {
    TURN_URLS,
    TURN_SECRET: 's',
    TURN_USERNAME: 'u',
    TURN_CREDENTIAL: 'p'
  });
  assert.equal(result.mode, 'ephemeral');
});

test('urls without credentials fall back to stun-only', () => {
  const result = buildIceServers('user1', { TURN_URLS });
  assert.equal(result.mode, 'stun-only');
});
