const test = require('node:test');
const assert = require('node:assert/strict');
const { purgeUser, purgeFootprint } = require('../services/userPurge');
const { canDeleteUsers, canReceiveDeleteRight } = require('../config/adminRoles');

test('право удаления: Разработчик всегда, администратор — только с выданным правом', () => {
  assert.equal(canDeleteUsers({ role: 'developer' }), true);
  assert.equal(canDeleteUsers({ role: 'founder' }), true);
  assert.equal(canDeleteUsers({ role: 'senior_admin' }), false);
  assert.equal(canDeleteUsers({ role: 'senior_admin', canDeleteUsers: true }), true);
  assert.equal(canDeleteUsers({ role: 'junior_admin', canDeleteUsers: true }), true);
  // Понизили до модератора — право само перестаёт действовать.
  assert.equal(canDeleteUsers({ role: 'senior_moderator', canDeleteUsers: true }), false);
  assert.equal(canDeleteUsers({ role: 'user', canDeleteUsers: true }), false);
});

test('право удаления выдаётся только администраторам', () => {
  assert.equal(canReceiveDeleteRight({ role: 'junior_admin' }), true);
  assert.equal(canReceiveDeleteRight({ role: 'deputy_developer' }), true);
  assert.equal(canReceiveDeleteRight({ role: 'senior_moderator' }), false);
  assert.equal(canReceiveDeleteRight({ role: 'support' }), false);
  assert.equal(canReceiveDeleteRight({ role: 'user' }), false);
  assert.equal(canReceiveDeleteRight({ role: 'developer' }), false);
});

function fakeModels(data = {}) {
  const calls = [];
  const model = name => new Proxy({}, {
    get: (_target, method) => (...args) => {
      calls.push({ model: name, method, args });
      const result = data[`${name}.${method}`];
      const value = typeof result === 'function' ? result(...args) : result;
      const chain = {
        select: () => chain,
        lean: async () => value ?? [],
        then: (resolve, reject) => Promise.resolve(value ?? { deletedCount: 0 }).then(resolve, reject)
      };
      return chain;
    }
  });
  const names = ['User', 'Message', 'Channel', 'DirectMessage', 'Server', 'Notification', 'LoginLog',
    'AdminSession', 'AdminAuthChallenge', 'AnalyticsEvent', 'CommunityVote', 'ProfilePage', 'RiskSignal'];
  return { models: Object.fromEntries(names.map(name => [name, model(name)])), calls };
}

test('удаление: серверы и личные чаты целиком, аккаунт — последним', async () => {
  const { models, calls } = fakeModels({
    'Server.find': [{ _id: 's1', name: 'Мой сервер' }],
    'Channel.find': [{ _id: 'c1' }, { _id: 'c2' }],
    'DirectMessage.find': [{ _id: 'dm1', channel: 'dmc1' }],
    'Message.deleteMany': { deletedCount: 3 },
    'User.deleteOne': { deletedCount: 1 }
  });
  const counts = await purgeUser(models, 'u1');

  assert.equal(counts.user, 1);
  assert.equal(counts.servers, 1);
  assert.equal(counts.conversations, 1);
  const last = calls[calls.length - 1];
  assert.equal(`${last.model}.${last.method}`, 'User.deleteOne');
  assert.ok(calls.some(c => c.model === 'Server' && c.method === 'deleteMany'));
  assert.ok(calls.some(c => c.model === 'DirectMessage' && c.method === 'deleteMany'));
  assert.ok(calls.some(c => c.model === 'User' && c.method === 'updateMany'
    && JSON.stringify(c.args[1]).includes('friendRequestsReceived')));
  // История модерации и аудит не трогаются.
  assert.ok(!calls.some(c => ['AuditLog', 'Case', 'Report', 'ModerationAction'].includes(c.model)));
});

test('предпросмотр показывает, что удалится', async () => {
  const { models } = fakeModels({
    'Message.countDocuments': 12,
    'DirectMessage.countDocuments': 2,
    'Server.find': [{ _id: 's1', name: 'Love Dev' }]
  });
  const footprint = await purgeFootprint(models, 'u1');
  assert.deepEqual(footprint, { messages: 12, conversations: 2, ownedServers: [{ id: 's1', name: 'Love Dev' }] });
});
