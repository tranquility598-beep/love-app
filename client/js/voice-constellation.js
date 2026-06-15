/**
 * Voice constellation renderer.
 * Mirrors the existing voice.js state into the new DOM containers without
 * changing WebRTC, sockets, or the legacy visible voice UI yet.
 */
(function () {
  'use strict';

  const MIC_MUTED_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>';
  const SOUND_MUTED_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="1" y1="1" x2="23" y2="23"/><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>';
  const SCREEN_SVG = '<svg class="collapsed-stream-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>';

  const state = {
    channelId: null,
    members: [],
    speaking: new Set(),
    screenShares: new Map(),
    renderQueued: false
  };

  const targets = [
    {
      shellId: 'server-voice-constellation-shell',
      gridId: 'server-voice-grid-constellation',
      linesId: 'server-voice-lines'
    },
    {
      shellId: 'voice-view-constellation-shell',
      gridId: 'voice-view-grid-constellation',
      linesId: 'voice-view-lines'
    },
    {
      shellId: 'room-voice-constellation-shell',
      gridId: 'room-voice-grid-constellation',
      linesId: 'room-voice-lines'
    }
  ];

  function getUserId(member) {
    return String(member?.userId || member?._id || member?.id || member?.socketId || '');
  }

  function getDisplayName(member) {
    return member?.nickname || member?.username || member?.name || 'User';
  }

  function getInitials(name) {
    const clean = String(name || 'U').trim();
    return clean.slice(0, 2).toUpperCase();
  }

  function getAvatarSrc(member) {
    const name = getDisplayName(member);
    if (typeof window.getAvatarUrl === 'function') {
      return window.getAvatarUrl(member?.avatar, name, getUserId(member));
    }
    return member?.avatar || '';
  }

  function getMembers() {
    if (Array.isArray(state.members) && state.members.length > 0) return state.members;
    if (Array.isArray(window.voiceManager?.channelMembers)) return window.voiceManager.channelMembers;
    return [];
  }

  function setMembers(channelId, members) {
    state.channelId = channelId || window.currentVoiceChannel || window.voiceManager?.channelId || null;
    state.members = Array.isArray(members) ? members.slice() : [];
    queueRender();
  }

  function updateMemberVoiceState(userId, muted, deafened) {
    const id = String(userId || '');
    if (!id) return;

    state.members = getMembers().map(member => {
      if (getUserId(member) !== id) return member;
      return {
        ...member,
        muted: muted === undefined ? member.muted : !!muted,
        deafened: deafened === undefined ? member.deafened : !!deafened
      };
    });
    queueRender();
  }

  function setSpeaking(userId, speaking) {
    const id = String(userId || '');
    if (!id) return;
    if (speaking) state.speaking.add(id);
    else state.speaking.delete(id);
    queueRender();
  }

  function createStatusBadge(className, html) {
    const badge = document.createElement('span');
    badge.className = `voice-status-badge ${className}`;
    badge.innerHTML = html;
    return badge;
  }

  function createAvatar(member) {
    const wrap = document.createElement('div');
    const userId = getUserId(member);
    const hasStream = state.screenShares.has(userId) || state.screenShares.has(member?.socketId);
    wrap.className = hasStream ? 'collapsed-stream' : 'voice-member-avatar-wrap';

    if (hasStream) {
      wrap.innerHTML = SCREEN_SVG;
      return wrap;
    }

    const name = getDisplayName(member);
    const avatarSrc = getAvatarSrc(member);
    if (avatarSrc) {
      const img = document.createElement('img');
      img.className = 'voice-member-avatar';
      img.src = avatarSrc;
      img.alt = name;
      wrap.appendChild(img);
    } else {
      const initials = document.createElement('span');
      initials.className = 'voice-member-avatar';
      initials.textContent = getInitials(name);
      wrap.appendChild(initials);
    }

    return wrap;
  }

  function createMemberCard(member) {
    const userId = getUserId(member);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'voice-pcard';
    card.dataset.userId = userId;
    card.setAttribute('role', 'listitem');

    if (userId && userId === String(window.currentUser?._id || '')) {
      card.classList.add('is-own');
    }
    if (state.speaking.has(userId)) {
      card.classList.add('speaking');
    }

    const avatar = createAvatar(member);
    card.appendChild(avatar);

    if (member?.muted) {
      avatar.appendChild(createStatusBadge('mic-muted', MIC_MUTED_SVG));
    }
    if (member?.deafened) {
      avatar.appendChild(createStatusBadge('sound-muted', SOUND_MUTED_SVG));
    }

    const name = document.createElement('div');
    name.className = 'voice-member-name';
    name.textContent = getDisplayName(member);
    card.appendChild(name);

    return card;
  }

  function renderTarget(target, members) {
    const shell = document.getElementById(target.shellId);
    const grid = document.getElementById(target.gridId);
    if (!shell || !grid) return;

    const lineSvg = document.getElementById(target.linesId);
    grid.querySelectorAll('.voice-pcard').forEach(node => node.remove());

    members.forEach(member => {
      grid.appendChild(createMemberCard(member));
    });

    if (lineSvg) {
      requestAnimationFrame(() => renderLines(grid, lineSvg));
    }
  }

  function renderLines(grid, svg) {
    if (!grid || !svg || grid.offsetParent === null) return;

    const cards = Array.from(grid.querySelectorAll('.voice-pcard'));
    svg.replaceChildren();
    if (cards.length < 2) return;

    const gridRect = grid.getBoundingClientRect();
    const points = cards.map(card => {
      const rect = card.getBoundingClientRect();
      return {
        x: ((rect.left + rect.width / 2 - gridRect.left) / Math.max(gridRect.width, 1)) * 100,
        y: ((rect.top + rect.height / 2 - gridRect.top) / Math.max(gridRect.height, 1)) * 100
      };
    });

    points.slice(1).forEach((point, index) => {
      const prev = points[index];
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', prev.x.toFixed(2));
      line.setAttribute('y1', prev.y.toFixed(2));
      line.setAttribute('x2', point.x.toFixed(2));
      line.setAttribute('y2', point.y.toFixed(2));
      svg.appendChild(line);
    });
  }

  function renderAll() {
    state.renderQueued = false;
    const members = getMembers();
    targets.forEach(target => renderTarget(target, members));
  }

  function queueRender() {
    if (state.renderQueued) return;
    state.renderQueued = true;
    requestAnimationFrame(renderAll);
  }

  function setScreenShare(sourceId, active) {
    const key = String(sourceId || '');
    if (!key) return;
    if (active) state.screenShares.set(key, true);
    else state.screenShares.delete(key);
    queueRender();
  }

  function hideAllScreenShares() {
    state.screenShares.clear();
    queueRender();
  }

  function installWrapper(name, after) {
    const original = window[name];
    if (typeof original !== 'function') return;

    window[name] = function wrappedVoiceConstellation() {
      const result = original.apply(this, arguments);
      try {
        after.apply(this, arguments);
      } catch (error) {
        console.warn(`[voice-constellation] ${name} mirror failed:`, error);
      }
      return result;
    };
  }

  function installWrappers() {
    installWrapper('updateVoiceChannelMembersUI', (channelId, members) => {
      setMembers(channelId, members);
    });

    installWrapper('updateVoicePanelMembers', (channelId, members) => {
      setMembers(channelId, members);
    });

    installWrapper('updateSpeakingIndicator', (userId, speaking) => {
      setSpeaking(userId, speaking);
    });

    installWrapper('updateUserVoiceState', (userId, muted, deafened) => {
      updateMemberVoiceState(userId, muted, deafened);
    });

    installWrapper('showScreenShareVideo', (stream, sourceId) => {
      setScreenShare(sourceId, true);
    });

    installWrapper('hideScreenShareVideo', () => {
      hideAllScreenShares();
    });

    installWrapper('hideScreenShareVideoForUser', sourceId => {
      setScreenShare(sourceId, false);
    });

    installWrapper('hideVoicePanel', () => {
      state.members = [];
      state.speaking.clear();
      state.screenShares.clear();
      queueRender();
    });
  }

  function makeMiniBarPassive() {
    const mini = document.getElementById('dm-call-mini-bar');
    if (!mini || mini.dataset.voiceConstellationBound === 'true') return;
    mini.dataset.voiceConstellationBound = 'true';

    const expand = document.getElementById('dm-call-mini-expand');
    const end = document.getElementById('dm-call-mini-end');
    if (expand) {
      expand.addEventListener('click', () => {
        const overlay = document.getElementById('dm-call-overlay');
        if (overlay) overlay.classList.remove('minimized', 'hidden');
        mini.classList.add('hidden');
      });
    }
    if (end) {
      end.addEventListener('click', () => {
        if (typeof window.endDMCall === 'function') window.endDMCall();
      });
    }
  }

  function init() {
    installWrappers();
    makeMiniBarPassive();
    queueRender();
  }

  window.LoveVoiceConstellation = {
    render: renderAll,
    queueRender,
    setMembers,
    setSpeaking,
    updateMemberVoiceState,
    getState: () => ({
      channelId: state.channelId,
      members: getMembers().slice(),
      speaking: Array.from(state.speaking),
      screenShares: Array.from(state.screenShares.keys())
    })
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
