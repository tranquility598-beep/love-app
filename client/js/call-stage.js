(function () {
  'use strict';

  const state = {
    dmPeer: null,
    members: [],
    mediaModes: new Map(),
    remoteStreams: new Map(),
    localStream: null,
    localMode: 'none',
    focusedServerKey: null,
    avatarUrls: new Map()
  };

  const asId = value => String(value || '');
  const mediaMode = member => {
    const key = asId(member?.socketId || member?.userId);
    return state.mediaModes.get(key)
      || member?.mediaMode
      || (member?.screenSharing || member?.hasShare ? 'screen' : member?.cameraOn || member?.hasCam ? 'camera' : 'none');
  };
  const displayName = member => member?.nickname || member?.username || member?.name || 'Участник';
  const initials = name => String(name || '?').trim().slice(0, 2).toUpperCase();

  function normalizeAvatar(value) {
    const raw = String(value || '').trim();
    const cssUrl = raw.match(/^url\(["']?(.*?)["']?\)$/i);
    return cssUrl ? cssUrl[1] : raw;
  }

  function avatarUrl(member) {
    const own = asId(member?.userId) === asId(window.currentUser?._id) || member?.isOwn;
    const profileAvatar = own
      ? [document.getElementById('nav-profile-btn'), document.getElementById('profile-avatar-display')]
          .map(element => element ? getComputedStyle(element).backgroundImage : '')
          .find(value => value && value !== 'none')
      : '';
    const fallback = own
      ? window.currentUser?.avatar || window.currentUser?.avatarUrl || window.ownProfileData?.avatarUrl || profileAvatar
      : '';
    const raw = normalizeAvatar(member?.avatar || member?.avatarUrl || fallback);
    if (!raw) return '';
    return typeof window.getAvatarUrl === 'function'
      ? window.getAvatarUrl(raw, displayName(member), member?.userId)
      : raw;
  }

  function setAvatar(avatar, member, key, name) {
    const cacheKey = asId(member?.userId || key);
    const nextUrl = avatarUrl(member) || state.avatarUrls.get(cacheKey) || '';
    avatar.dataset.avatarUrl = nextUrl;

    if (!nextUrl) {
      avatar.style.backgroundImage = '';
      avatar.classList.remove('has-image');
      avatar.textContent = initials(name);
      return;
    }

    state.avatarUrls.set(cacheKey, nextUrl);
    const applyImage = () => {
      if (avatar.dataset.avatarUrl !== nextUrl) return;
      avatar.style.backgroundImage = `url("${String(nextUrl).replace(/"/g, '%22')}")`;
      avatar.classList.add('has-image');
      avatar.textContent = '';
    };
    if (avatar.classList.contains('has-image') && avatar.style.backgroundImage.includes(nextUrl)) return;

    const image = new Image();
    image.onload = applyImage;
    image.onerror = () => {
      if (avatar.dataset.avatarUrl !== nextUrl) return;
      state.avatarUrls.delete(cacheKey);
      avatar.style.backgroundImage = '';
      avatar.classList.remove('has-image');
      avatar.textContent = initials(name);
    };
    image.src = nextUrl;
  }

  function setVideo(video, stream, mode) {
    if (!video) return;
    video.muted = true;
    video.playsInline = true;
    video.classList.toggle('is-screenshare', mode === 'screen');
    if (video.srcObject !== stream) {
      video.srcObject = stream || null;
      if (stream) video.play().catch(() => {});
    }
  }

  function setDmTile(side, stream, mode) {
    const box = document.querySelector(`#call-video-grid .video-stream-box.${side}-video`);
    const video = document.getElementById(side === 'remote' ? 'call-remote-feed' : 'call-local-feed');
    const kind = document.getElementById(side === 'remote' ? 'call-remote-media-kind' : 'call-local-media-kind');
    const active = !!stream && mode !== 'none';
    setVideo(video, active ? stream : null, mode);
    video?.classList.toggle('hidden', !active);
    box?.classList.toggle('has-media', active);
    box?.classList.toggle('is-screen', mode === 'screen');
    if (kind) kind.textContent = mode === 'screen' ? 'Демонстрация экрана' : mode === 'camera' ? 'Камера' : '';
  }

  function remoteDmEntry() {
    for (const [socketId, stream] of state.remoteStreams) {
      const mode = state.mediaModes.get(asId(socketId)) || 'camera';
      if (mode !== 'none') return { stream, mode };
    }
    return { stream: null, mode: 'none' };
  }

  function renderDm() {
    const grid = document.getElementById('call-video-grid');
    const modal = document.getElementById('call-modal');
    if (!grid || !modal || modal.classList.contains('hidden')) return;
    grid.classList.remove('hidden');
    document.getElementById('call-voice-profile')?.classList.add('hidden');
    const remote = remoteDmEntry();
    setDmTile('remote', remote.stream, remote.mode);
    setDmTile('local', state.localStream, state.localMode);
  }

  function memberKey(member) {
    return asId(member?.userId || member?.socketId || member?.name);
  }

  function streamFor(member) {
    const own = asId(member?.userId) === asId(window.currentUser?._id) || member?.isOwn;
    const mode = mediaMode(member);
    if (own) {
      const manager = window.voiceManager;
      return {
        stream: mode === 'screen' ? manager?.screenStream : mode === 'camera' ? manager?.cameraStream : null,
        mode,
        own: true
      };
    }
    const socketId = asId(member?.socketId);
    return {
      stream: state.remoteStreams.get(socketId) || window.voiceManager?.remoteVideoStreams?.get(socketId) || null,
      mode,
      own: false
    };
  }

  function ensureServerTile(grid, key) {
    let tile = Array.from(grid.children).find(node => node.dataset?.memberKey === key);
    if (tile) return tile;
    tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'love-voice-tile';
    tile.dataset.memberKey = key;
    tile.innerHTML = `
      <video class="love-voice-tile-video" autoplay playsinline muted></video>
      <span class="love-voice-tile-placeholder"><span class="love-voice-tile-avatar"></span></span>
      <span class="love-voice-tile-footer">
        <span class="love-voice-tile-name"></span>
        <span class="love-voice-tile-mode"></span>
      </span>`;
    tile.addEventListener('click', () => {
      if (!tile.classList.contains('has-media')) return;
      state.focusedServerKey = state.focusedServerKey === key ? null : key;
      renderServer();
    });
    return tile;
  }

  function renderServer(members) {
    if (Array.isArray(members)) state.members = members.slice();
    const grid = document.getElementById('voice-grid-constellation');
    const panel = document.getElementById('server-voice-panel');
    const channelId = String(window.voiceManager?.channelId || '');
    if (!grid || !panel || panel.classList.contains('hidden') || channelId.startsWith('dm_call:')) return false;

    const list = state.members.length
      ? state.members
      : (window.voiceManager?.channelMembers || window.voiceMembers || []);
    const liveKeys = new Set();
    const fragment = document.createDocumentFragment();

    grid.classList.add('love-voice-grid');
    grid.dataset.count = String(list.length);
    list.forEach(member => {
      const key = memberKey(member);
      if (!key) return;
      liveKeys.add(key);
      const tile = ensureServerTile(grid, key);
      const name = displayName(member);
      const media = streamFor(member);
      const active = !!media.stream && media.mode !== 'none';
      const video = tile.querySelector('.love-voice-tile-video');
      const avatar = tile.querySelector('.love-voice-tile-avatar');

      tile.classList.toggle('has-media', active);
      tile.classList.toggle('is-screen', media.mode === 'screen');
      tile.classList.toggle('is-focused', state.focusedServerKey === key && active);
      tile.classList.toggle('speaking', !!member?.speaking);
      tile.title = active ? 'Нажмите, чтобы развернуть или вернуть плитку' : name;
      setVideo(video, active ? media.stream : null, media.mode);
      tile.querySelector('.love-voice-tile-name').textContent = name + (member?.muted || member?.micActive === false ? ' · микрофон выключен' : '');
      tile.querySelector('.love-voice-tile-mode').textContent = media.mode === 'screen' ? 'Экран' : media.mode === 'camera' ? 'Камера' : '';
      setAvatar(avatar, member, key, name);
      fragment.appendChild(tile);
    });

    // The legacy constellation renderer used the same container and leaves
    // `.voice-pcard` nodes behind. Keep this stage as the container's single
    // owner, otherwise a stale card is rendered alongside the new tile.
    Array.from(grid.children).forEach(node => {
      const isStageTile = node.classList.contains('love-voice-tile');
      const isCurrentMember = liveKeys.has(node.dataset?.memberKey);
      if (isStageTile && isCurrentMember) return;
      const video = node.querySelector('video');
      if (video) video.srcObject = null;
      node.remove();
    });
    grid.appendChild(fragment);
    const count = document.getElementById('voice-member-count-text');
    if (count) count.textContent = `${list.length} в канале`;
    return true;
  }

  function openDm(peer) {
    state.dmPeer = peer || null;
    renderDm();
  }

  function setRemoteMedia(sourceId, stream, mode) {
    const key = asId(sourceId);
    if (!key) return;
    if (stream) state.remoteStreams.set(key, stream);
    if (mode) state.mediaModes.set(key, mode);
    renderDm();
    renderServer();
  }

  function removeRemoteMedia(sourceId) {
    const key = asId(sourceId);
    state.remoteStreams.delete(key);
    state.mediaModes.set(key, 'none');
    renderDm();
    renderServer();
  }

  function setLocalMedia(stream, mode) {
    state.localStream = stream || null;
    state.localMode = stream ? mode : 'none';
    renderDm();
    renderServer();
  }

  function updateMediaState(data) {
    const socketId = asId(data?.socketId);
    const userId = asId(data?.userId);
    const mode = ['none', 'camera', 'screen'].includes(data?.mode) ? data.mode : 'none';
    if (socketId) state.mediaModes.set(socketId, mode);
    if (userId) state.mediaModes.set(userId, mode);
    if (mode === 'none' && socketId) state.remoteStreams.delete(socketId);
    state.members = state.members.map(member => {
      if (asId(member?.socketId) !== socketId && asId(member?.userId) !== userId) return member;
      return { ...member, mediaMode: mode, cameraOn: mode === 'camera', screenSharing: mode === 'screen' };
    });
    renderDm();
    renderServer();
  }

  function syncMembers(members) {
    state.members = Array.isArray(members) ? members.slice() : [];
    state.members.forEach(member => {
      const mode = mediaMode(member);
      const socketId = memberKey(member);
      if (socketId) state.mediaModes.set(socketId, mode);
      if (member?.userId) state.mediaModes.set(asId(member.userId), mode);
    });
    renderDm();
    renderServer();
  }

  function reset() {
    state.remoteStreams.clear();
    state.mediaModes.clear();
    state.members = [];
    state.dmPeer = null;
    state.localStream = null;
    state.localMode = 'none';
    state.focusedServerKey = null;
    document.querySelectorAll('.call-live-video, .love-voice-tile-video').forEach(video => { video.srcObject = null; });
  }

  function init() {
    document.getElementById('voice-stage-collapse')?.addEventListener('click', () => {
      document.getElementById('server-voice-panel')?.classList.add('hidden');
      document.getElementById('server-chat-panel')?.classList.remove('hidden');
      if (typeof window.updateVoiceMiniBar === 'function') window.updateVoiceMiniBar();
    });
    renderDm();
  }

  window.CallStageController = {
    openDm,
    renderDm,
    renderServer,
    setRemoteMedia,
    removeRemoteMedia,
    setLocalMedia,
    updateMediaState,
    syncMembers,
    reset,
    getState: () => state
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
})();
