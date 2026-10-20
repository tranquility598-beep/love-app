const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { createApiProxy } = require('../../client/api-proxy');
const { createLoginNetworkInfo } = require('../utils/loginNetwork');

function renderer(apiRequest) {
  const context = vm.createContext({
    window: {
      electronAPI: { apiRequest }, location: { origin: 'file://', protocol: 'file:', hostname: '' }
    },
    console: { log() {}, warn() {}, error() {} },
    localStorage: { getItem: () => null, removeItem() {}, setItem() {} },
    document: { getElementById: () => null },
    crypto: webcrypto, TextEncoder, FormData, AbortController, setTimeout, clearTimeout, URLSearchParams
  });
  vm.runInContext(fs.readFileSync(require.resolve('../../client/js/api.js'), 'utf8'), context);
  return context;
}

test('desktop proxy reports a transport failure without inventing an HTTP 500', async () => {
  const proxy = createApiProxy({ origin: 'https://example.test', getToken: () => null, fetchImpl: async () => { throw new TypeError('fetch failed'); } });
  const result = await proxy({ path: '/auth/login', method: 'POST', body: '{}' });
  assert.equal(result.status, 0);
  assert.equal(result.networkError, true);
  assert.doesNotMatch(result.data.message, /fetch failed/i);
});

test('a second desktop POST does not abort the first one', async () => {
  const signals = [];
  const proxy = createApiProxy({ origin: 'https://example.test', getToken: () => null, fetchImpl: async (_url, options) => {
    signals.push(options.signal);
    await new Promise(resolve => setTimeout(resolve, 10));
    return new Response('{}', { status: 200 });
  } });
  await Promise.all([proxy({ path: '/auth/login', method: 'POST', body: '{}' }), proxy({ path: '/auth/login', method: 'POST', body: '{}' })]);
  assert.equal(signals.length, 2);
  assert.ok(signals.every(signal => !signal.aborted));
});

test('lost OTP response is retried with the same request id', async () => {
  const calls = [];
  const context = renderer(async options => {
    if (options.path === '/auth/capabilities') return { ok: true, status: 200, data: { authReplay: true } };
    calls.push(options);
    if (calls.length === 1) return { ok: false, status: 0, networkError: true, data: { message: 'offline' } };
    return { ok: true, status: 200, data: { token: 'test-session' } };
  });
  const data = await vm.runInContext("AuthAPI.verifyOtp('friend@example.test', '123456')", context);
  assert.equal(data.token, 'test-session');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].headers['X-Auth-Request-Id'], calls[1].headers['X-Auth-Request-Id']);
});

test('HTTP errors are not retried and preserve the cooldown', async () => {
  let calls = 0;
  const context = renderer(async options => {
    if (options.path === '/auth/capabilities') return { ok: true, status: 200, data: { authReplay: true } };
    calls++;
    return { ok: false, status: 429, data: { message: 'Подождите', retryAfter: 37 } };
  });
  await assert.rejects(vm.runInContext("AuthAPI.login('friend@example.test', 'test-pass1')", context), error => error.status === 429 && error.data.retryAfter === 37);
  assert.equal(calls, 1);
});

test('manual retry after two network failures retains the OTP replay id', async () => {
  const ids = [];
  const context = renderer(async options => {
    if (options.path === '/auth/capabilities') return { ok: true, status: 200, data: { authReplay: true } };
    ids.push(options.headers['X-Auth-Request-Id']);
    if (ids.length <= 2) return { ok: false, status: 0, networkError: true, data: { message: 'offline' } };
    return { ok: true, status: 200, data: { token: 'recovered-session' } };
  });
  const submit = () => vm.runInContext("AuthAPI.verifyOtp('friend@example.test', '123456')", context);
  await assert.rejects(submit(), error => error.isNetworkError);
  assert.equal((await submit()).token, 'recovered-session');
  assert.equal(ids.length, 3);
  assert.equal(new Set(ids).size, 1);
});

test('double submission of the same auth request shares one network operation', async () => {
  let calls = 0;
  const context = renderer(async options => {
    if (options.path === '/auth/capabilities') return { ok: true, status: 200, data: { authReplay: true } };
    calls++;
    await new Promise(resolve => setTimeout(resolve, 15));
    return { ok: true, status: 200, data: { token: 'one-session' } };
  });
  const results = await vm.runInContext("Promise.all([AuthAPI.verifyOtp('friend@example.test', '123456'), AuthAPI.verifyOtp('friend@example.test', '123456')])", context);
  assert.equal(calls, 1);
  assert.equal(results[0].token, results[1].token);
});

test('legacy servers are never sent an unsafe automatic OTP retry', async () => {
  let calls = 0;
  const context = renderer(async options => {
    if (options.path === '/auth/capabilities') return { ok: false, status: 404, data: { message: 'not found' } };
    calls++;
    assert.equal(options.headers['X-Auth-Request-Id'], undefined);
    return { ok: false, status: 0, networkError: true, data: { message: 'offline' } };
  });
  await assert.rejects(vm.runInContext("AuthAPI.verifyOtp('friend@example.test', '123456')", context));
  assert.equal(calls, 1);
});

test('profile PUT safely retries a lost response with exactly the same fields', async () => {
  const calls = [];
  const context = renderer(async options => {
    calls.push(options);
    if (calls.length === 1) return { ok: false, status: 0, networkError: true, data: { message: 'offline' } };
    return { ok: true, status: 200, data: { user: { _id: 'test-user', nickname: 'New name' } } };
  });
  const response = await vm.runInContext("UsersAPI.updateProfile({ nickname: 'New name', bio: 'My bio' })", context);
  assert.equal(response.user.nickname, 'New name');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body, calls[1].body);
  assert.ok(calls.every(call => call.path === '/users/profile' && call.method === 'PUT'));
});

test('profile validation errors do not trigger network retries', async () => {
  let calls = 0;
  const context = renderer(async () => { calls++; return { ok: false, status: 400, data: { message: 'Invalid profile' } }; });
  await assert.rejects(vm.runInContext("UsersAPI.updateProfile({ nickname: '' })", context), error => error.status === 400);
  assert.equal(calls, 1);
});

test('geolocation cannot hold login open, even if the provider never settles', async () => {
  let calls = 0;
  const getInfo = createLoginNetworkInfo({ timeoutMs: 20, lookup: () => { calls++; return new Promise(() => {}); } });
  const result = await getInfo({ ip: '8.8.8.8' });
  assert.equal(result.ip, '8.8.8.8');
  assert.equal(result.location, 'Неизвестно');
  assert.deepEqual(await getInfo({ ip: '8.8.8.8' }), result);
  assert.equal(calls, 1);
});

test('untrusted forwarding headers cannot replace the login IP', async () => {
  const getInfo = createLoginNetworkInfo({ lookup: () => { throw new Error('must not query for local IP'); } });
  const result = await getInfo({ ip: '127.0.0.1', headers: { 'cf-connecting-ip': '8.8.8.8' } });
  assert.equal(result.ip, '127.0.0.1');
});
