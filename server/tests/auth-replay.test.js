const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { randomUUID } = require('node:crypto');
const { createAuthReplay } = require('../middleware/authReplay');

test('duplicate OTP requests share one execution, including a response lost after consumption', async t => {
  const app = express();
  app.use(express.json(), createAuthReplay());
  let consumed = 0;
  app.post('/verify-otp', async (req, res) => {
    consumed++;
    await new Promise(resolve => setTimeout(resolve, 15));
    res.json({ token: 'one-session', consumed });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/verify-otp`;
  const headers = { 'Content-Type': 'application/json', 'X-Auth-Request-Id': randomUUID() };
  const options = { method: 'POST', headers, body: JSON.stringify({ email: 'friend@example.test', code: '123456' }) };
  const responses = await Promise.all([fetch(url, options), fetch(url, options)]);
  assert.ok(responses.every(response => response.status === 200));
  assert.deepEqual(await responses[0].json(), await responses[1].json());
  await fetch(url, options); // Original response may never have reached the UI.
  assert.equal(consumed, 1);
  const conflict = await fetch(url, { ...options, body: JSON.stringify({ email: 'other@example.test', code: '123456' }) });
  assert.equal(conflict.status, 409);
  assert.equal(consumed, 1);
});
