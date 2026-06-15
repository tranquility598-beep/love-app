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
    members: null,
    roomChannelId: null,
    roomMembers: null,
    speaking: new Set(),
    screenShares: new Map(),
    miniBarDrag: null,
    renderQueued: false
  };

  const EASE_OUT = 'cubic-bezier(0.16, 1, 0.3, 1)';
  const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';

  const targets = [
    {
      parentId: 'voice-panel',
      shellId: 'server-voice-constellation-shell',
      gridId: 'server-voice-grid-constellation',
      linesId: 'server-voice-lines',
      source: 'voice',
      compact: true
    },
    {
      parentId: 'voice-view',
      shellId: 'voice-view-constellation-shell',
      gridId: 'voice-view-grid-constellation',
      linesId: 'voice-view-lines',
      source: 'voice'
    },
    {
      parentId: 'room-voice-channel-container',
      shellId: 'room-voice-constellation-shell',
      gridId: 'room-voice-grid-constellation',
      linesId: 'room-voice-lines',
      source: 'room'
    }
  ];

  function getMemberUser(member) {
    return member?.user || member || {};
  }

  function getUserId(member) {
    const user = getMemberUser(member);
    return String(member?.userId || user?.userId || user?._id || user?.id || member?.socketId || '');
  }

  function getSocketId(member) {
    const user = getMemberUser(member);
    return String(member?.socketId || user?.socketId || '');
  }

  function getDisplayName(member) {
    const user = getMemberUser(member);
    return user?.nickname || user?.username || user?.name || member?.nickname || member?.username || member?.name || 'User';
  }

  function getInitials(name) {
    const clean = String(name || 'U').trim();
    return clean.slice(0, 2).toUpperCase();
  }

  function getAvatarSrc(member) {
    const name = getDisplayName(member);
    const user = getMemberUser(member);
    if (typeof window.getAvatarUrl === 'function') {
      return window.getAvatarUrl(user?.avatar || member?.avatar, name, getUserId(member));
    }
    return user?.avatar || member?.avatar || '';
  }

  function getVoiceMembers() {
    if (Array.isArray(state.members)) return state.members;
    if (Array.isArray(window.voiceManager?.channelMembers)) return window.voiceManager.channelMembers;
    return [];
  }

  function getRoomMembers() {
    if (Array.isArray(state.roomMembers)) return state.roomMembers;
    return getVoiceMembers();
  }

  function getMembersForTarget(target) {
    return target?.source === 'room' ? getRoomMembers() : getVoiceMembers();
  }

  function setMembers(channelId, members) {
    state.channelId = channelId || window.currentVoiceChannel || window.voiceManager?.channelId || null;
    state.members = Array.isArray(members) ? members.slice() : [];
    queueRender();
  }

  function setRoomMembers(channelId, members) {
    state.roomChannelId = channelId || window.currentRoom?.voiceChannelId || null;
    state.roomMembers = Array.isArray(members) ? members.slice() : [];
    queueRender();
  }

  function updateMemberVoiceState(userId, muted, deafened) {
    const id = String(userId || '');
    if (!id) return;

    const applyState = member => {
      if (getUserId(member) !== id) return member;
      return {
        ...member,
        muted: muted === undefined ? member.muted : !!muted,
        deafened: deafened === undefined ? member.deafened : !!deafened
      };
    };

    state.members = getVoiceMembers().map(applyState);
    state.roomMembers = getRoomMembers().map(applyState);
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
    const socketId = getSocketId(member);
    const hasStream = state.screenShares.has(userId) || state.screenShares.has(socketId);
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

  function createMemberCard(member, target) {
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
    if (target?.compact) {
      card.classList.add('compact');
    }

    const avatar = createAvatar(member);
    card.appendChild(avatar);

    if (member?.muted || getMemberUser(member)?.muted) {
      avatar.appendChild(createStatusBadge('mic-muted', MIC_MUTED_SVG));
    }
    if (member?.deafened || getMemberUser(member)?.deafened) {
      avatar.appendChild(createStatusBadge('sound-muted', SOUND_MUTED_SVG));
    }

    const name = document.createElement('div');
    name.className = 'voice-member-name';
    name.textContent = getDisplayName(member);
    card.appendChild(name);

    return card;
  }

  function syncTargetVisibility(target) {
    const shell = document.getElementById(target.shellId);
    const parent = document.getElementById(target.parentId);
    if (!shell || !parent) return;

    shell.classList.remove('hidden');
    shell.setAttribute('aria-hidden', 'false');
    parent.classList.add('using-constellation');
    parent.classList.toggle('voice-constellation-has-media', state.screenShares.size > 0);
  }

  function syncVisibility() {
    targets.forEach(syncTargetVisibility);
  }

  function renderTarget(target, members) {
    const shell = document.getElementById(target.shellId);
    const grid = document.getElementById(target.gridId);
    if (!shell || !grid) return;

    const lineSvg = document.getElementById(target.linesId);
    grid.querySelectorAll('.voice-pcard').forEach(node => node.remove());

    members.forEach(member => {
      grid.appendChild(createMemberCard(member, target));
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
    syncVisibility();
    targets.forEach(target => renderTarget(target, getMembersForTarget(target)));
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
    syncVisibility();
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

  function installReplaceWrapper(name, replacementFactory) {
    const original = window[name];
    if (typeof original !== 'function' || original.__voiceConstellationWrapped) return;

    const wrapped = replacementFactory(original);
    if (typeof wrapped !== 'function') return;
    wrapped.__voiceConstellationWrapped = true;
    window[name] = wrapped;
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
      state.roomMembers = [];
      state.speaking.clear();
      state.screenShares.clear();
      syncVisibility();
      queueRender();
    });
  }

  function getCallMiniElements() {
    return {
      overlay: document.getElementById('dm-call-overlay'),
      overlayContent: document.querySelector('#dm-call-overlay .call-overlay-content'),
      mini: document.getElementById('dm-call-mini-bar'),
      miniAvatar: document.getElementById('dm-call-mini-avatar-img'),
      miniName: document.getElementById('dm-call-mini-name'),
      miniStatus: document.getElementById('dm-call-mini-status')
    };
  }

  function syncCallMiniInfo() {
    const { miniAvatar, miniName, miniStatus } = getCallMiniElements();
    const peerName = document.getElementById('call-overlay-peer-name');
    const status = document.getElementById('call-overlay-status');
    const peerImg = document.getElementById('caller-mini-peer-img');

    if (miniName && peerName) miniName.textContent = peerName.textContent || 'Звонок';
    if (miniStatus && status) miniStatus.textContent = status.textContent || 'В трее';
    if (miniAvatar && peerImg) miniAvatar.src = peerImg.src || '';
  }

  function showCallMiniBar() {
    const { mini } = getCallMiniElements();
    if (!mini) return;

    syncCallMiniInfo();
    mini.classList.remove('hidden', 'is-leaving', 'is-ending');
    mini.setAttribute('aria-hidden', 'false');
  }

  function hideCallMiniBar(className = 'is-leaving') {
    const { mini } = getCallMiniElements();
    if (!mini || mini.classList.contains('hidden')) return Promise.resolve();

    mini.classList.remove('is-leaving', 'is-ending');
    mini.classList.add(className);
    const animation = mini.animate([
      { opacity: 1, filter: 'blur(0)' },
      { opacity: 0, filter: 'blur(6px)' }
    ], { duration: 220, easing: EASE_IN, fill: 'both' });

    return animation.finished.finally(() => {
      mini.classList.add('hidden');
      mini.classList.remove('is-leaving', 'is-ending');
      mini.setAttribute('aria-hidden', 'true');
    }).catch(() => {});
  }

  function animateOverlayToMini() {
    const { overlay, overlayContent, mini } = getCallMiniElements();
    if (!overlay || !overlayContent || !mini || overlay.classList.contains('hidden')) return;

    syncCallMiniInfo();
    overlay.classList.add('is-minimizing');
    overlay.style.pointerEvents = 'none';
    mini.classList.remove('hidden', 'is-leaving', 'is-ending');
    mini.setAttribute('aria-hidden', 'false');

    const from = overlayContent.getBoundingClientRect();
    const to = mini.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scaleX = Math.max(0.18, to.width / Math.max(from.width, 1));
    const scaleY = Math.max(0.18, to.height / Math.max(from.height, 1));

    const overlayAnim = overlayContent.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'blur(0)' },
      { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`, opacity: 0, filter: 'blur(8px)' }
    ], { duration: 340, easing: EASE_IN, fill: 'forwards' });

    mini.animate([
      { opacity: 0, filter: 'blur(6px)' },
      { opacity: 1, filter: 'blur(0)' }
    ], { duration: 300, easing: EASE_OUT, fill: 'both' }).finished.catch(() => {});

    overlayAnim.finished.finally(() => {
      overlay.classList.add('hidden');
      overlay.classList.remove('minimized', 'is-minimizing');
      overlay.style.pointerEvents = '';
      overlayContent.style.transform = '';
      overlayContent.style.opacity = '';
      overlayContent.style.filter = '';
    }).catch(() => {});
  }

  function animateMiniToOverlay() {
    const { overlay, overlayContent, mini } = getCallMiniElements();
    if (!overlay || !overlayContent || !mini) return;

    const from = mini.getBoundingClientRect();
    overlay.classList.remove('hidden', 'minimized');
    overlay.style.pointerEvents = 'none';
    overlayContent.style.opacity = '0';
    const to = overlayContent.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const scaleX = Math.max(0.18, from.width / Math.max(to.width, 1));
    const scaleY = Math.max(0.18, from.height / Math.max(to.height, 1));

    hideCallMiniBar('is-leaving');

    overlayContent.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`, opacity: 0, filter: 'blur(8px)' },
      { transform: 'translate(0, 0) scale(1)', opacity: 1, filter: 'blur(0)' }
    ], { duration: 360, easing: EASE_OUT, fill: 'both' }).finished.finally(() => {
      overlay.style.pointerEvents = '';
      overlayContent.style.opacity = '';
    }).catch(() => {});
  }

  function installCallWrappers() {
    installReplaceWrapper('toggleCallOverlay', original => function wrappedToggleCallOverlay() {
      const { overlay, mini } = getCallMiniElements();
      if (overlay && !overlay.classList.contains('hidden')) {
        animateOverlayToMini();
        return;
      }
      if (mini && !mini.classList.contains('hidden')) {
        animateMiniToOverlay();
        return;
      }
      original.apply(this, arguments);
    });

    installReplaceWrapper('showDMCallOverlay', original => function wrappedShowDMCallOverlay() {
      const result = original.apply(this, arguments);
      const { overlay, mini } = getCallMiniElements();
      if (overlay) overlay.classList.remove('minimized');
      if (mini) {
        mini.classList.add('hidden');
        mini.setAttribute('aria-hidden', 'true');
      }
      syncCallMiniInfo();
      return result;
    });

    installReplaceWrapper('handleDMCallEnd', original => function wrappedHandleDMCallEnd() {
      hideCallMiniBar('is-ending');
      return original.apply(this, arguments);
    });

    installReplaceWrapper('endDMCall', original => function wrappedEndDMCall() {
      const { overlayContent } = getCallMiniElements();
      if (overlayContent) {
        overlayContent.animate([
          { transform: 'scale(1)', opacity: 1, filter: 'blur(0)' },
          { transform: 'scale(0.88)', opacity: 0, filter: 'blur(8px)' }
        ], { duration: 220, easing: EASE_IN, fill: 'both' }).finished.catch(() => {});
      }
      hideCallMiniBar('is-ending');
      return original.apply(this, arguments);
    });
  }

  function startMiniDrag(mini, clientX, clientY) {
    const rect = mini.getBoundingClientRect();
    state.miniBarDrag = {
      el: mini,
      offsetX: clientX - rect.left,
      offsetY: clientY - rect.top,
      renderX: rect.left,
      renderY: rect.top,
      targetX: rect.left,
      targetY: rect.top,
      rafId: null
    };
    mini.classList.add('dragging', 'is-moved');
    mini.style.setProperty('--call-mini-transform', 'none');
    mini.style.setProperty('--call-mini-left', `${rect.left}px`);
    mini.style.setProperty('--call-mini-top', `${rect.top}px`);
  }

  function moveMiniDrag(clientX, clientY) {
    const drag = state.miniBarDrag;
    if (!drag) return;

    const { el } = drag;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    drag.targetX = Math.max(8, Math.min(clientX - drag.offsetX, window.innerWidth - w - 8));
    drag.targetY = Math.max(8, Math.min(clientY - drag.offsetY, window.innerHeight - h - 8));

    if (drag.rafId) return;
    const tick = () => {
      const current = state.miniBarDrag;
      if (!current) return;
      current.renderX += (current.targetX - current.renderX) * 0.25;
      current.renderY += (current.targetY - current.renderY) * 0.25;
      current.el.style.setProperty('--call-mini-left', `${current.renderX}px`);
      current.el.style.setProperty('--call-mini-top', `${current.renderY}px`);

      if (Math.abs(current.targetX - current.renderX) > 0.3 || Math.abs(current.targetY - current.renderY) > 0.3) {
        current.rafId = requestAnimationFrame(tick);
      } else {
        current.renderX = current.targetX;
        current.renderY = current.targetY;
        current.el.style.setProperty('--call-mini-left', `${current.renderX}px`);
        current.el.style.setProperty('--call-mini-top', `${current.renderY}px`);
        current.rafId = null;
      }
    };
    drag.rafId = requestAnimationFrame(tick);
  }

  function finishMiniDrag() {
    const drag = state.miniBarDrag;
    if (!drag) return;
    if (drag.rafId) cancelAnimationFrame(drag.rafId);
    drag.el.classList.remove('dragging');
    drag.el.classList.add('is-moved');
    state.miniBarDrag = null;
  }

  function makeMiniBarPassive() {
    const mini = document.getElementById('dm-call-mini-bar');
    if (!mini || mini.dataset.voiceConstellationBound === 'true') return;
    mini.dataset.voiceConstellationBound = 'true';

    const expand = document.getElementById('dm-call-mini-expand');
    const end = document.getElementById('dm-call-mini-end');
    if (expand) {
      expand.addEventListener('click', () => {
        animateMiniToOverlay();
      });
    }
    if (end) {
      end.addEventListener('click', () => {
        if (typeof window.endDMCall === 'function') window.endDMCall();
      });
    }

    mini.addEventListener('mousedown', event => {
      if (event.target.closest('button')) return;
      startMiniDrag(mini, event.clientX, event.clientY);
      event.preventDefault();
    });

    mini.addEventListener('touchstart', event => {
      if (event.target.closest('button')) return;
      const touch = event.touches[0];
      if (!touch) return;
      startMiniDrag(mini, touch.clientX, touch.clientY);
      event.preventDefault();
    }, { passive: false });

    document.addEventListener('mousemove', event => moveMiniDrag(event.clientX, event.clientY));
    document.addEventListener('mouseup', finishMiniDrag);
    document.addEventListener('touchmove', event => {
      const touch = event.touches[0];
      if (!touch) return;
      moveMiniDrag(touch.clientX, touch.clientY);
      if (state.miniBarDrag) event.preventDefault();
    }, { passive: false });
    document.addEventListener('touchend', finishMiniDrag);
    document.addEventListener('touchcancel', finishMiniDrag);
  }

  function init() {
    installWrappers();
    makeMiniBarPassive();
    installCallWrappers();
    syncVisibility();
    queueRender();
  }

  window.LoveVoiceConstellation = {
    render: renderAll,
    queueRender,
    setMembers,
    setRoomMembers,
    setSpeaking,
    updateMemberVoiceState,
    syncVisibility,
    animateOverlayToMini,
    animateMiniToOverlay,
    getState: () => ({
      channelId: state.channelId,
      members: getVoiceMembers().slice(),
      roomChannelId: state.roomChannelId,
      roomMembers: getRoomMembers().slice(),
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
