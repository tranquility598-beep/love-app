const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { randomUUID } = require('node:crypto');
const jwt = require('jsonwebtoken');
process.env.JWT_SECRET = 'auth-regression-test-secret-not-production';

const records = new Map();
const sessions = [];
const sent = [];
let mailAvailable = true;
let counter = 1;
function matches(record, query) {
  return Object.entries(query).every(([key, value]) => {
    if (value && typeof value === 'object' && '$gt' in value) return record[key] > value.$gt;
    if (value == null) return record[key] == null;
    return String(record[key]) === String(value);
  });
}
function clone(record) { return record ? new FakeUser(structuredClone(record)) : null; }
class FakeUser {
  constructor(data) {
    Object.assign(this, { _id: String(counter++).padStart(24, '0'), isVerified: false, googleId: null, role: 'user', otpLastSentAt: null }, data);
  }
  async save() { records.set(this._id, structuredClone({ ...this })); return this; }
  async comparePassword(password) { return this.password === password; }
  toPublicJSON() { return { _id: this._id, username: this.username }; }
  static findOne(query) {
    const promise = Promise.resolve(clone([...records.values()].find(record => matches(record, query))));
    promise.collation = () => promise;
    return promise;
  }
  static async findOneAndUpdate(query, update, options) {
    const record = [...records.values()].find(value => matches(value, query));
    if (!record) return null;
    const before = clone(record);
    Object.assign(record, update.$set);
    return options.new ? clone(record) : before;
  }
  static async countDocuments() { return records.size; }
}
function stub(relative, exports) {
  const filename = require.resolve(relative);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
}
stub('../models/User', FakeUser);
stub('../models/LoginLog', { create: async data => { const log = { ...data, _id: randomUUID() }; sessions.push(log); return log; } });
stub('../utils/emailService', {
  generateOTP: () => '123456',
  sendOTPEmail: async (email, code) => { sent.push({ email, code }); return mailAvailable; },
  sendPasswordResetEmail: async () => true
});
stub('../utils/founder', { isFounderUser: () => false });
stub('../services/moderationService', { refreshModerationState: async () => {} });
const limiters = require('../middleware/rateLimiter');
const router = require('../routes/auth');

test('registration, email correction and lost-response recovery', async t => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  async function post(endpoint, data, requestId = randomUUID()) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth-Request-Id': requestId }, body: JSON.stringify(data)
    });
    return { status: response.status, data: await response.json() };
  }
  t.beforeEach(async () => {
    records.clear(); sessions.length = 0; sent.length = 0; mailAvailable = true;
    for (const limiter of [limiters.authLimiter, limiters.registerLimiter, limiters.otpLimiter, limiters.otpSendLimiter]) await limiter.resetKey('127.0.0.1');
  });
  const credentials = { username: 'testfriend', email: 'typo@example.test', password: 'example-pass1' };

  await t.test('corrects email on the same pending account and invalidates the old edit token', async () => {
    const registered = await post('register', credentials);
    assert.equal(registered.status, 201);
    const original = [...records.values()][0];
    original.otpLastSentAt = new Date(Date.now() - 61000);
    const changed = await post('registration-email', { registrationToken: registered.data.registrationToken, email: 'correct@example.test' });
    assert.equal(changed.status, 200);
    assert.equal(records.size, 1);
    assert.equal([...records.values()][0]._id, original._id);
    assert.equal([...records.values()][0].email, 'correct@example.test');
    assert.equal(sent.at(-1).email, 'correct@example.test');
    const stale = await post('registration-email', { registrationToken: registered.data.registrationToken, email: 'third@example.test' });
    assert.equal(stale.status, 409);
  });
  await t.test('neither an ordinary JWT nor a verified account can be used to change registration email', async () => {
    const registered = await post('register', credentials);
    const ordinary = jwt.sign({ userId: [...records.keys()][0] }, process.env.JWT_SECRET);
    assert.equal((await post('registration-email', { registrationToken: ordinary, email: 'other@example.test' })).status, 401);
    [...records.values()][0].isVerified = true;
    assert.equal((await post('registration-email', { registrationToken: registered.data.registrationToken, email: 'other@example.test' })).status, 409);
    assert.equal((await post('resend-otp', { email: credentials.email })).status, 404);
  });
  await t.test('resuming registration never replaces a pending password or creates a second user', async () => {
    await post('register', credentials);
    const resumed = await post('register', credentials);
    assert.equal(resumed.status, 200);
    assert.equal(sent.length, 1);
    assert.equal((await post('register', { ...credentials, password: 'different-pass2' })).status, 409);
    assert.equal([...records.values()][0].password, credentials.password);
    assert.equal(records.size, 1);
  });
  await t.test('successful password checks open the existing OTP challenge without spending failed-login attempts', async () => {
    await post('register', credentials);
    for (let attempt = 0; attempt < 12; attempt++) {
      const login = await post('login', credentials);
      assert.equal(login.status, 403);
      assert.equal(login.data.requireVerification, true);
      assert.ok(login.data.registrationToken);
    }
    assert.equal(sent.length, 1);
    assert.ok([...records.values()][0].onboardingPending);
  });
  await t.test('a lost successful OTP response can be recovered without creating a second session', async () => {
    await post('register', credentials);
    const requestId = randomUUID();
    const input = { email: credentials.email, code: '123456' };
    const first = await post('verify-otp', input, requestId);
    const replay = await post('verify-otp', input, requestId);
    assert.equal(first.status, 200);
    assert.equal(replay.data.token, first.data.token);
    assert.equal(sessions.length, 1);
    // A new request id (replay cache missed, e.g. another network) leads to sign-in.
    const late = await post('verify-otp', input);
    assert.equal(late.status, 409);
    assert.equal(late.data.code, 'EMAIL_ALREADY_VERIFIED');
    assert.equal(late.data.email, credentials.email);
    assert.equal(late.data.token, undefined);
    assert.equal(sessions.length, 1);
    const resend = await post('resend-otp', { email: credentials.email });
    assert.equal(resend.status, 409);
    assert.equal(resend.data.code, 'EMAIL_ALREADY_VERIFIED');
    assert.ok([...records.values()][0].verifiedAt);
  });
  await t.test('an old confirmation is not disclosed by verify-otp', async () => {
    await post('register', credentials);
    const record = [...records.values()][0];
    Object.assign(record, { isVerified: true, verifiedAt: new Date(Date.now() - 16 * 60 * 1000), otpCode: null });
    const result = await post('verify-otp', { email: credentials.email, code: '123456' });
    assert.equal(result.status, 400);
    assert.equal(result.data.code, undefined);
  });
  await t.test('registering again with the same name and password moves a mistyped address', async () => {
    await post('register', credentials);
    const original = [...records.values()][0];
    original.otpLastSentAt = new Date(Date.now() - 61000);
    const stranger = await post('register', { ...credentials, email: 'stranger@example.test', password: 'different-pass2' });
    assert.equal(stranger.status, 400);
    assert.equal([...records.values()][0].email, credentials.email);
    const moved = await post('register', { ...credentials, email: 'correct@example.test' });
    assert.equal(moved.status, 200);
    assert.equal(moved.data.email, 'correct@example.test');
    assert.ok(moved.data.registrationToken);
    assert.equal(records.size, 1);
    assert.equal([...records.values()][0]._id, original._id);
    assert.equal(sent.at(-1).email, 'correct@example.test');
    const tooSoon = await post('register', { ...credentials, email: 'third@example.test' });
    assert.equal(tooSoon.status, 429);
    assert.equal(tooSoon.data.code, 'OTP_COOLDOWN');
    assert.equal([...records.values()][0].email, 'correct@example.test');
  });
  await t.test('the name check lets the creator resume an unconfirmed registration', async () => {
    await post('register', credentials);
    const port = server.address().port;
    const pending = await fetch(`http://127.0.0.1:${port}/api/auth/username-availability?username=testfriend`).then(r => r.json());
    assert.deepEqual(pending, { available: false, pending: true });
    [...records.values()][0].isVerified = true;
    const taken = await fetch(`http://127.0.0.1:${port}/api/auth/username-availability?username=testfriend`).then(r => r.json());
    assert.deepEqual(taken, { available: false });
  });
  await t.test('a verified or Google account never moves to another address', async () => {
    await post('register', credentials);
    const record = [...records.values()][0];
    record.otpLastSentAt = new Date(Date.now() - 61000);
    record.googleId = 'test-google-link';
    assert.equal((await post('register', { ...credentials, email: 'correct@example.test' })).status, 400);
    Object.assign(record, { googleId: null, isVerified: true });
    assert.equal((await post('register', { ...credentials, email: 'correct@example.test' })).status, 400);
    assert.equal([...records.values()][0].email, credentials.email);
  });
  await t.test('mail failure keeps a pending account editable instead of pretending the email was sent', async () => {
    mailAvailable = false;
    const result = await post('register', credentials);
    assert.equal(result.status, 503);
    assert.equal(result.data.code, 'EMAIL_SEND_FAILED');
    assert.equal(result.data.requireVerification, true);
    assert.ok(result.data.registrationToken);
    assert.equal(result.data.retryAfter, 0);
    assert.equal(records.size, 1);
  });
  await t.test('a failed email change does not start a resend cooldown', async () => {
    const registered = await post('register', credentials);
    [...records.values()][0].otpLastSentAt = new Date(Date.now() - 61000);
    mailAvailable = false;
    const failed = await post('registration-email', { registrationToken: registered.data.registrationToken, email: 'correct@example.test' });
    assert.equal(failed.status, 503);
    assert.equal(failed.data.retryAfter, 0);
    mailAvailable = true;
    assert.equal((await post('resend-otp', { email: 'correct@example.test' })).status, 200);
  });
  await t.test('only one of two distinct requests can consume the same OTP', async () => {
    await post('register', credentials);
    const input = { email: credentials.email, code: '123456' };
    const results = await Promise.all([post('verify-otp', input), post('verify-otp', input)]);
    assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
    assert.equal(sessions.length, 1);
  });
  await t.test('a pending account linked to Google can still confirm its email without an email-edit token', async () => {
    await post('register', credentials);
    [...records.values()][0].googleId = 'test-google-link';
    const challenge = await post('login', credentials);
    assert.equal(challenge.status, 403);
    assert.equal(challenge.data.registrationToken, undefined);
    assert.equal((await post('verify-otp', { email: credentials.email, code: '123456' })).status, 200);
  });
  await t.test('failed OTP attempts still produce an actual remaining cooldown', async () => {
    await post('register', credentials);
    let response;
    for (let attempt = 0; attempt < 11; attempt++) response = await post('verify-otp', { email: credentials.email, code: '000000' });
    assert.equal(response.status, 429);
    assert.equal(response.data.code, 'OTP_RATE_LIMIT');
    assert.ok(response.data.retryAfter > 0 && response.data.retryAfter <= 900);
  });
});
