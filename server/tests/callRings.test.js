const test = require('node:test');
const assert = require('node:assert/strict');
const { createRingRegistry, recordMissedCall } = require('../services/callRings');

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('неотвеченный звонок по таймауту уходит в onTimeout и снимается', async () => {
  const timedOut = [];
  const rings = createRingRegistry({ timeoutMs: 20, onTimeout: ring => timedOut.push(ring) });
  rings.start({ callerId: 'a', targetId: 'b', kind: 'audio' });
  assert.equal(rings.forTarget('b').length, 1);
  await wait(40);
  assert.equal(timedOut.length, 1);
  assert.equal(timedOut[0].callerId, 'a');
  assert.equal(rings.size, 0);
});

test('ответ или сброс снимает ожидание, и таймаут уже не срабатывает', async () => {
  const timedOut = [];
  const rings = createRingRegistry({ timeoutMs: 20, onTimeout: ring => timedOut.push(ring) });
  rings.start({ callerId: 'a', targetId: 'b' });
  const cleared = rings.clear('a', 'b');
  assert.equal(cleared.targetId, 'b');
  assert.equal(rings.clear('a', 'b'), null);
  await wait(40);
  assert.equal(timedOut.length, 0);
});

test('повторный звонок тому же человеку заменяет прежний', async () => {
  const timedOut = [];
  const rings = createRingRegistry({ timeoutMs: 30, onTimeout: ring => timedOut.push(ring) });
  rings.start({ callerId: 'a', targetId: 'b', kind: 'audio' });
  rings.start({ callerId: 'a', targetId: 'b', kind: 'video' });
  assert.equal(rings.size, 1);
  assert.deepEqual(rings.forCaller('a').map(r => r.kind), ['video']);
  await wait(50);
  assert.equal(timedOut.length, 1);
});

test('пропущенный звонок попадает в чат обоим и в уведомления', async () => {
  const saved = [];
  class FakeMessage {
    constructor(data) { Object.assign(this, data); this._id = 'm1'; }
    async save() { saved.push(this); }
    async populate() { return this; }
  }
  const dmUpdates = [];
  const DirectMessage = { findByIdAndUpdate: async (...args) => { dmUpdates.push(args); } };
  const emitted = [];
  const io = { to: room => ({ emit: (event, payload) => emitted.push({ room, event, payload }) }) };
  const notifications = [];
  const createNotification = async (_io, payload) => { notifications.push(payload); };

  await recordMissedCall({
    io,
    ring: {
      callerId: 'caller', targetId: 'target', conversationId: 'dm1', channelId: 'ch1',
      kind: 'video', from: { username: 'vasya' }
    },
    Message: FakeMessage,
    DirectMessage,
    createNotification
  });

  assert.equal(saved.length, 1);
  assert.equal(saved[0].content, '📞 Пропущенный видеозвонок');
  assert.equal(saved[0].author, 'caller');
  assert.equal(saved[0].type, 'system');
  assert.equal(dmUpdates[0][0], 'dm1');
  assert.deepEqual(emitted.map(e => e.room).sort(), ['user:caller', 'user:target']);
  assert.ok(emitted.every(e => e.event === 'dm:new_message'));
  assert.equal(notifications[0].type, 'missed_call');
  assert.equal(notifications[0].user, 'target');
  assert.equal(notifications[0].preview, 'Пропущенный звонок от vasya');
});

test('ответ на звонок засчитывается один раз и только на ожидающий вызов', () => {
  const rings = createRingRegistry({ timeoutMs: 1000, onTimeout: () => {} });
  assert.equal(rings.get('a', 'b'), null); // «принято» без вызова — нечего принимать
  rings.start({ callerId: 'a', targetId: 'b', conversationId: 'dm1' });
  assert.equal(rings.get('a', 'b').conversationId, 'dm1');
  assert.equal(rings.get('b', 'a'), null); // встречный «ответ» второй стороны
  rings.clear('a', 'b');
  assert.equal(rings.get('a', 'b'), null); // повторный ответ со второго устройства
});
