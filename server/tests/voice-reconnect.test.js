/**
 * PEER-0048: после «Manager reconnect» клиент выходил из голосового канала.
 *
 * Здесь проверяются решения, которые принимает клиент: что догоняющее
 * voice:left не выбивает из канала, что список участников закрывает
 * peer-соединения исчезнувших собеседников и что вход в канал повторяется
 * без нового запроса микрофона.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CLIENT_JS = path.join(__dirname, '..', '..', 'client', 'js');
const SOCKET_JS = path.join(CLIENT_JS, 'socket.js');
const VOICE_JS = path.join(CLIENT_JS, 'voice.js');

function createClientContext(socketId = 'socket-new') {
  const context = {
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  context.window = context;
  context.globalThis = context;
  context.addEventListener = () => {};
  context.removeEventListener = () => {};
  context.document = {
    getElementById: () => null,
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    body: { appendChild() {}, classList: { add() {}, remove() {} } },
  };
  context.navigator = {
    mediaDevices: { getUserMedia: async () => { throw new Error('microphone is not used in these tests'); } },
    permissions: { query: async () => ({ state: 'granted' }) },
  };
  context.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
  context.window.socket = { id: socketId, connected: true };
  context.window.currentVoiceChannel = null;
  context.window.voiceManager = null;
  context.window.CallStageController = null;
  // Глобалы, которые клиентские модули ожидают от соседних файлов.
  context.hideVoicePanel = () => { context.__panelHidden = true; };
  context.updateVoiceChannelMembersUI = () => {};
  context.updateVoiceChannelUI = () => {};
  context.hideScreenShareVideo = () => {};
  context.showToast = () => {};
  vm.createContext(context);
  return context;
}

function loadSocketJs(context) {
  vm.runInContext(fs.readFileSync(SOCKET_JS, 'utf8'), context);
  // socket.js в конце файла выставляет window.socket = socket (там он ещё null).
  context.window.socket = { id: context.__socketId, connected: true };
}

function loadVoiceJs(context) {
  const source = fs.readFileSync(VOICE_JS, 'utf8');
  vm.runInContext(`${source}\n;globalThis.VoiceManager = VoiceManager;`, context);
}

function createManager(context, { socketId = null, channelId = 'voice-1' } = {}) {
  const manager = new context.VoiceManager();
  manager.channelId = channelId;
  manager._joinedSocketId = socketId;
  manager.localStream = {
    getAudioTracks: () => [{ readyState: 'live' }],
    getTracks: () => [],
  };
  return manager;
}

test('поздний voice:left от прежнего сокета не выбивает из канала', () => {
  const context = createClientContext('socket-new');
  context.__socketId = 'socket-new';
  loadSocketJs(context);

  let cleanups = 0;
  const manager = { channelId: 'voice-1', cleanup() { cleanups += 1; } };
  context.window.voiceManager = manager;
  context.window.currentVoiceChannel = 'voice-1';

  context.handleVoiceLeft({ channelId: 'voice-1', socketId: 'socket-old' });

  assert.equal(cleanups, 0);
  assert.equal(context.window.voiceManager, manager);
  assert.equal(context.window.currentVoiceChannel, 'voice-1');

  context.handleVoiceLeft({ channelId: 'voice-1', socketId: 'socket-new' });

  assert.equal(cleanups, 1);
  assert.equal(context.window.voiceManager, null);
  assert.equal(context.window.currentVoiceChannel, null);
});

test('voice:left без socketId (старый сервер) по-прежнему выводит из канала', () => {
  const context = createClientContext('socket-new');
  context.__socketId = 'socket-new';
  loadSocketJs(context);

  let cleanups = 0;
  context.window.voiceManager = { channelId: 'voice-1', cleanup() { cleanups += 1; } };
  context.window.currentVoiceChannel = 'voice-1';

  context.handleVoiceLeft({ channelId: 'voice-1' });

  assert.equal(cleanups, 1);
});

test('members_update закрывает peer-соединения исчезнувших участников', () => {
  const context = createClientContext('socket-me');
  context.__socketId = 'socket-me';
  loadSocketJs(context);

  const removed = [];
  const manager = {
    channelId: 'voice-1',
    peerConnections: new Map([['stale', {}], ['fresh', {}]]),
    channelMembers: [],
    removeConnection(socketId) {
      removed.push(socketId);
      this.peerConnections.delete(socketId);
    },
  };
  context.window.voiceManager = manager;

  context.handleVoiceMembersUpdate({
    channelId: 'voice-1',
    members: [{ socketId: 'fresh', userId: 'u2' }, { socketId: 'socket-me', userId: 'u1' }],
  });

  assert.deepEqual(removed, ['stale']);
  assert.equal(manager.peerConnections.has('fresh'), true);
  assert.deepEqual(manager.channelMembers.map(member => member.socketId), ['fresh', 'socket-me']);
});

test('resumeAfterReconnect повторяет вход без нового запроса микрофона', async () => {
  const context = createClientContext('socket-new');
  loadVoiceJs(context);

  const joins = [];
  const media = [];
  context.socketJoinVoice = channelId => {
    joins.push(channelId);
    return Promise.resolve({ status: 'ok' });
  };
  context.socketSetVoiceMediaState = (channelId, mode) => media.push([channelId, mode]);

  const manager = createManager(context, { socketId: 'socket-old' });
  manager.isScreenSharing = true;
  const microphone = manager.localStream;
  let closedPeers = 0;
  let removedAudio = 0;
  manager.peerConnections.set('peer-a', { close() { closedPeers += 1; } });
  manager.audioElements.set('peer-a', { srcObject: {}, remove() { removedAudio += 1; } });
  context.window.voiceManager = manager;

  const resumed = await manager.resumeAfterReconnect();

  assert.equal(resumed, true);
  assert.deepEqual(joins, ['voice-1']);
  assert.deepEqual(media, [['voice-1', 'screen']]);
  assert.equal(closedPeers, 1);
  assert.equal(removedAudio, 1);
  assert.equal(manager.peerConnections.size, 0);
  // Микрофон и сам канал переподключение не трогает.
  assert.equal(manager.localStream, microphone);
  assert.equal(manager.channelId, 'voice-1');
  assert.equal(manager._joinedSocketId, 'socket-new');
});

test('resumeAfterReconnect не повторяет вход тем же сокетом', async () => {
  const context = createClientContext('socket-same');
  loadVoiceJs(context);

  const joins = [];
  context.socketJoinVoice = channelId => {
    joins.push(channelId);
    return Promise.resolve({ status: 'ok' });
  };

  const manager = createManager(context, { socketId: 'socket-same' });
  context.window.voiceManager = manager;

  assert.equal(await manager.resumeAfterReconnect(), false);
  assert.deepEqual(joins, []);
});

test('resumeAfterReconnect молчит без сети, канала или живой дорожки', async () => {
  const context = createClientContext('socket-new');
  loadVoiceJs(context);

  const joins = [];
  context.socketJoinVoice = channelId => {
    joins.push(channelId);
    return Promise.resolve({ status: 'ok' });
  };

  const manager = createManager(context, { socketId: 'socket-old' });
  context.window.voiceManager = manager;

  context.window.socket = { id: 'socket-new', connected: false };
  assert.equal(await manager.resumeAfterReconnect(), false);

  context.window.socket = { id: 'socket-new', connected: true };
  manager.localStream = { getAudioTracks: () => [{ readyState: 'ended' }], getTracks: () => [] };
  assert.equal(await manager.resumeAfterReconnect(), false);

  manager.localStream = { getAudioTracks: () => [{ readyState: 'live' }], getTracks: () => [] };
  manager.channelId = null;
  assert.equal(await manager.resumeAfterReconnect(), false);

  assert.deepEqual(joins, []);
});

test('resumeVoiceAfterReconnect делит один вход между параллельными вызовами', async () => {
  const context = createClientContext('socket-new');
  loadVoiceJs(context);

  const joins = [];
  context.socketJoinVoice = channelId => {
    joins.push(channelId);
    return Promise.resolve({ status: 'ok' });
  };

  const manager = createManager(context, { socketId: 'socket-old' });
  context.window.voiceManager = manager;

  const [first, second] = await Promise.all([
    context.window.resumeVoiceAfterReconnect(),
    context.window.resumeVoiceAfterReconnect(),
  ]);

  assert.equal(first, true);
  assert.equal(second, true);
  assert.deepEqual(joins, ['voice-1']);
});