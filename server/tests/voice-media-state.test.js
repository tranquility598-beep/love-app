const test = require('node:test');
const assert = require('node:assert/strict');
const {
  applyVoiceMediaMode,
  normalizeVoiceMediaMode,
  serializeVoiceMember
} = require('../services/voiceMediaState');

test('voice media mode accepts only canonical values', () => {
  assert.equal(normalizeVoiceMediaMode('camera'), 'camera');
  assert.equal(normalizeVoiceMediaMode(' SCREEN '), 'screen');
  assert.equal(normalizeVoiceMediaMode('none'), 'none');
  assert.equal(normalizeVoiceMediaMode(' чужой режим '), null);
});

test('camera and screen share remain mutually exclusive', () => {
  const member = { userId: 'u1', socketId: 's1' };

  assert.equal(applyVoiceMediaMode(member, 'camera'), true);
  assert.deepEqual(
    { mode: member.mediaMode, camera: member.cameraOn, screen: member.screenSharing },
    { mode: 'camera', camera: true, screen: false }
  );

  assert.equal(applyVoiceMediaMode(member, 'screen'), true);
  assert.deepEqual(
    { mode: member.mediaMode, camera: member.cameraOn, screen: member.screenSharing },
    { mode: 'screen', camera: false, screen: true }
  );

  assert.equal(applyVoiceMediaMode(member, 'none'), true);
  assert.deepEqual(
    { mode: member.mediaMode, camera: member.cameraOn, screen: member.screenSharing },
    { mode: 'none', camera: false, screen: false }
  );
});

test('serialized members always include reconnect-safe media flags', () => {
  const serialized = serializeVoiceMember({
    userId: 'u1',
    socketId: 's1',
    cameraOn: true,
    muted: 1
  });

  assert.equal(serialized.mediaMode, 'camera');
  assert.equal(serialized.cameraOn, true);
  assert.equal(serialized.screenSharing, false);
  assert.equal(serialized.muted, true);
  assert.equal(serialized.deafened, false);
});
