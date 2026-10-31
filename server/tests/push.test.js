/**
 * Push через FCM: без ключа ничего не отправляем, с ключом — правильное тело
 * запроса, звонок отдельно от сообщения, мёртвые токены удаляются.
 *
 * Сеть не нужна: global.fetch подменяется в тесте, ключ сервисного аккаунта
 * генерируется здесь же (RSA 2048) — настоящий секрет в тесты не попадает.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const jwt = require('jsonwebtoken');

const PushToken = require('../models/PushToken');
const push = require('../services/push');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const { privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const SERVICE_ACCOUNT = JSON.stringify({
  type: 'service_account',
  project_id: 'love-test',
  client_email: 'love-test@love-test.iam.gserviceaccount.com',
  private_key: privateKey
});

// ── подмена сети и базы ──

const calls = [];
let sendResponder = () => ({ ok: true, status: 200, json: async () => ({ name: 'ok' }) });

function installFetch() {
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    if (url === TOKEN_URL) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: 'ya29.test', expires_in: 3600 })
      };
    }
    return sendResponder(url, options);
  };
}

function tokenCalls() {
  return calls.filter(call => call.url === TOKEN_URL);
}

function sendCalls() {
  return calls.filter(call => call.url.includes('messages:send'))
    .map(call => JSON.parse(call.options.body).message);
}

function stubTokens(tokens) {
  PushToken.find = () => ({
    select: () => ({
      lean: async () => tokens.map(token => ({ token }))
    })
  });
}

let deleted = [];
function stubDelete() {
  deleted = [];
  PushToken.deleteMany = async (filter) => {
    deleted.push(filter);
    return { deletedCount: filter.token.$in.length };
  };
}

const originalFind = PushToken.find;
const originalDeleteMany = PushToken.deleteMany;
const originalFetch = global.fetch;

test.beforeEach(() => {
  calls.length = 0;
  deleted = [];
  sendResponder = () => ({ ok: true, status: 200, json: async () => ({ name: 'ok' }) });
  installFetch();
  stubTokens([]);
  stubDelete();
  process.env.FCM_SERVICE_ACCOUNT = SERVICE_ACCOUNT;
  delete process.env.FCM_SERVICE_ACCOUNT_FILE;
  delete process.env.FCM_PROJECT_ID;
  push.__resetForTests();
});

test.after(() => {
  global.fetch = originalFetch;
  PushToken.find = originalFind;
  PushToken.deleteMany = originalDeleteMany;
  delete process.env.FCM_SERVICE_ACCOUNT;
  push.__resetForTests();
});

test('без ключа Firebase push молча выключен', async () => {
  delete process.env.FCM_SERVICE_ACCOUNT;
  push.__resetForTests();

  assert.equal(push.isConfigured(), false);
  const result = await push.sendToUser('user-1', { kind: 'message', title: 'a', body: 'b' });
  assert.deepEqual(result, { sent: 0, removed: 0 });
  assert.equal(calls.length, 0);
});

test('ключ читается из переменной окружения', () => {
  assert.equal(push.isConfigured(), true);
});

test('access token запрашивается один раз и кешируется', async () => {
  assert.equal(await push.getAccessToken(), 'ya29.test');
  assert.equal(await push.getAccessToken(), 'ya29.test');
  assert.equal(tokenCalls().length, 1);

  const assertion = new URLSearchParams(tokenCalls()[0].options.body).get('assertion');
  const decoded = jwt.decode(assertion, { complete: true });
  assert.equal(decoded.header.alg, 'RS256');
  assert.equal(decoded.payload.iss, 'love-test@love-test.iam.gserviceaccount.com');
  assert.equal(decoded.payload.scope, 'https://www.googleapis.com/auth/firebase.messaging');
  assert.equal(decoded.payload.aud, TOKEN_URL);
});

test('сообщение уходит уведомлением в канал сообщений', async () => {
  stubTokens(['tok-a', 'tok-b']);

  const result = await push.sendMessagePush('user-1', {
    title: 'Александр',
    body: 'привет',
    conversationId: 'conv-1',
    channelId: 'chan-1',
    messageId: 'msg-1'
  });

  assert.equal(result.sent, 2);
  const messages = sendCalls();
  assert.equal(messages.length, 2);
  for (const message of messages) {
    assert.equal(message.notification.title, 'Александр');
    assert.equal(message.notification.body, 'привет');
    assert.equal(message.android.notification.channel_id, 'love_messages');
    assert.equal(message.android.priority, 'high');
    assert.equal(message.data.type, 'new_dm');
    assert.equal(message.data.conversationId, 'conv-1');
    assert.equal(message.data.messageId, 'msg-1');
  }
  assert.deepEqual(messages.map(m => m.token).sort(), ['tok-a', 'tok-b']);
  assert.match(calls.find(c => c.url.includes('messages:send')).url, /projects\/love-test\/messages:send/);
});

test('входящий звонок — только данные, чтобы клиент открыл полный экран', async () => {
  stubTokens(['tok-a']);

  await push.sendCallPush('user-2', {
    callerName: 'Мария',
    callerId: 'user-9',
    conversationId: 'conv-2',
    channelId: 'chan-2',
    kind: 'video'
  });

  const [message] = sendCalls();
  assert.equal(message.notification, undefined);
  assert.equal(message.android.notification, undefined);
  assert.equal(message.android.priority, 'high');
  assert.equal(message.android.ttl, '45s');
  assert.equal(message.data.type, 'incoming_call');
  assert.equal(message.data.callKind, 'video');
  assert.equal(message.data.callerName, 'Мария');
});

test('пропущенный звонок — обычное уведомление в канал звонков', async () => {
  stubTokens(['tok-a']);

  await push.sendMissedCallPush('user-3', {
    callerName: 'Мария',
    conversationId: 'conv-3',
    channelId: 'chan-3',
    kind: 'audio'
  });

  const [message] = sendCalls();
  assert.equal(message.notification.title, 'Пропущенный звонок');
  assert.equal(message.notification.body, 'от Мария');
  assert.equal(message.android.notification.channel_id, 'love_calls');
  assert.equal(message.data.type, 'missed_call');
});

test('мёртвый токен удаляется, живой остаётся', async () => {
  stubTokens(['dead-token', 'live-token']);
  sendResponder = (url, options) => {
    const message = JSON.parse(options.body).message;
    if (message.token === 'dead-token') {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { status: 'UNREGISTERED', message: 'Requested entity was not found.' } })
      };
    }
    return { ok: true, status: 200, json: async () => ({ name: 'ok' }) };
  };

  const result = await push.sendToUser('user-4', { kind: 'message', title: 'a', body: 'b' });

  assert.equal(result.sent, 1);
  assert.equal(result.removed, 1);
  assert.equal(deleted.length, 1);
  assert.deepEqual(deleted[0], { token: { $in: ['dead-token'] } });
});

test('сбой одного устройства не мешает остальным', async () => {
  stubTokens(['boom', 'fine']);
  sendResponder = (url, options) => {
    const message = JSON.parse(options.body).message;
    if (message.token === 'boom') throw new Error('ECONNRESET');
    return { ok: true, status: 200, json: async () => ({ name: 'ok' }) };
  };

  const result = await push.sendToUser('user-5', { kind: 'message', title: 'a', body: 'b' });

  assert.equal(result.sent, 1);
  assert.equal(deleted.length, 0);
});

test('ошибка Google при выдаче access token не бросается наружу', async () => {
  global.fetch = async (url) => {
    calls.push({ url });
    if (url === TOKEN_URL) {
      return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant' }) };
    }
    return { ok: true, status: 200, json: async () => ({}) };
  };
  stubTokens(['tok-a']);

  const result = await push.sendToUser('user-6', { kind: 'message', title: 'a', body: 'b' });

  assert.equal(result.sent, 0);
  assert.equal(sendCalls().length, 0);
});