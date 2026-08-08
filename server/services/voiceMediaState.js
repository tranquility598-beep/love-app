'use strict';

const VOICE_MEDIA_MODES = new Set(['none', 'camera', 'screen']);

function normalizeVoiceMediaMode(value) {
  const mode = String(value || 'none').trim().toLowerCase();
  return VOICE_MEDIA_MODES.has(mode) ? mode : null;
}

function applyVoiceMediaMode(member, value) {
  const mode = normalizeVoiceMediaMode(value);
  if (!member || !mode) return false;

  member.mediaMode = mode;
  member.cameraOn = mode === 'camera';
  member.screenSharing = mode === 'screen';
  return true;
}

function serializeVoiceMember(member) {
  const explicitMode = member?.mediaMode == null
    ? null
    : normalizeVoiceMediaMode(member.mediaMode);
  const mode = explicitMode
    || (member?.screenSharing ? 'screen' : member?.cameraOn ? 'camera' : 'none');

  return {
    userId: member?.userId,
    socketId: member?.socketId,
    username: member?.username,
    nickname: member?.nickname,
    avatar: member?.avatar,
    muted: !!member?.muted,
    deafened: !!member?.deafened,
    mediaMode: mode,
    cameraOn: mode === 'camera',
    screenSharing: mode === 'screen'
  };
}

module.exports = {
  applyVoiceMediaMode,
  normalizeVoiceMediaMode,
  serializeVoiceMember
};
