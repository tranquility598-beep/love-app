/**
 * Runtime Diagnostics Tool
 * Passive monitoring system for detecting state inconsistencies
 * DEV MODE ONLY - Auto-runs in development
 */

(function() {
  'use strict';

  const DIAGNOSTICS_ENABLED = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.protocol === 'file:';
  const CHECK_INTERVAL = 3000; // 3 seconds
  let intervalId = null;
  const issues = [];

  function log(subsystem, issue, severity, fileRef, funcRef, suggestion) {
    const timestamp = new Date().toISOString();
    const entry = {
      timestamp,
      subsystem,
      issue,
      severity,
      fileRef: fileRef || 'unknown',
      funcRef: funcRef || 'unknown',
      suggestion: suggestion || 'Manual investigation required'
    };

    console.group(`%c[DIAGNOSTICS] ${severity.toUpperCase()} - ${subsystem}`, 
      `color: ${severity === 'high' ? '#ff4444' : severity === 'medium' ? '#ffaa00' : '#888888'}; font-weight: bold`);
    console.log(`Issue: ${issue}`);
    console.log(`Location: ${fileRef} → ${funcRef}`);
    console.log(`Suggestion: ${suggestion}`);
    console.log(`Time: ${timestamp}`);
    console.groupEnd();

    issues.push(entry);
  }

  function checkModalStack() {
    if (!window.ModalManager) return;

    const stack = window.ModalManager.stack || [];
    const visibleModals = document.querySelectorAll('.modal-overlay:not(.hidden)');

    // Check: Stack count vs visible modals
    if (stack.length !== visibleModals.length) {
      log(
        'modal',
        `Stack has ${stack.length} modals but ${visibleModals.length} are visible in DOM`,
        'high',
        'ui.js',
        'ModalManager',
        'Call ModalManager.close() for stuck modals or remove stale stack entries'
      );
    }

    // Check: Modals in stack but hidden in DOM
    stack.forEach(modalData => {
      const el = document.getElementById(modalData.id);
      if (el && el.classList.contains('hidden')) {
        log(
          'modal',
          `Modal "${modalData.id}" is in stack but has hidden class`,
          'medium',
          'ui.js',
          'ModalManager.open/close',
          'Remove from stack or show modal'
        );
      }
    });

    // Check: Visible modals not in stack
    visibleModals.forEach(modal => {
      const inStack = stack.some(m => m.id === modal.id);
      if (!inStack) {
        log(
          'modal',
          `Modal "${modal.id}" is visible but not in ModalManager stack`,
          'medium',
          'ui.js',
          'ModalManager.open',
          'Add to stack or hide modal'
        );
      }
    });

    // Check: Scroll lock mismatch
    const scrollLockCount = window.ModalManager.scrollLockCount || 0;
    const bodyOverflow = document.body.style.overflow;
    if (scrollLockCount > 0 && bodyOverflow !== 'hidden') {
      log(
        'modal',
        `Scroll lock count is ${scrollLockCount} but body overflow is "${bodyOverflow}"`,
        'low',
        'ui.js',
        'ModalManager.enableScrollLock',
        'Sync scroll lock state with body overflow'
      );
    }
  }

  function checkNavigationState() {
    const currentView = window.currentView;
    const navState = window.navigationState;

    // Check: currentView vs navigationState.currentView
    if (navState && currentView !== navState.currentView) {
      log(
        'navigation',
        `window.currentView="${currentView}" but navigationState.currentView="${navState.currentView}"`,
        'high',
        'app.js',
        'setNavigationState',
        'Use setNavigationState() to update both values together'
      );
    }

    // Check: Server state consistency
    const hasServer = !!window.currentServer;
    const hasServerId = !!window.currentServerId;
    if (hasServer !== hasServerId) {
      log(
        'navigation',
        `currentServer=${hasServer ? 'set' : 'null'} but currentServerId=${hasServerId ? 'set' : 'null'}`,
        'high',
        'app.js',
        'selectServer/showDMView',
        'Clear both currentServer and currentServerId together'
      );
    }

    // Check: Channel state consistency
    const hasChannel = !!window.currentChannel;
    const hasChannelId = !!window.currentChannelId;
    if (hasChannel !== hasChannelId) {
      log(
        'navigation',
        `currentChannel=${hasChannel ? 'set' : 'null'} but currentChannelId=${hasChannelId ? 'set' : 'null'}`,
        'medium',
        'app.js',
        'selectChannel',
        'Clear both currentChannel and currentChannelId together'
      );
    }

    // Check: DM state in server view
    if (currentView === 'server' && window.currentDMConversation) {
      log(
        'navigation',
        `currentView="server" but currentDMConversation is still set`,
        'medium',
        'app.js',
        'selectServer',
        'Clear currentDMConversation when entering server view'
      );
    }

    // Check: Server state in DM view
    if (currentView === 'dm' && window.currentServer) {
      log(
        'navigation',
        `currentView="dm" but currentServer is still set`,
        'medium',
        'app.js',
        'showDMView',
        'Clear currentServer when entering DM view'
      );
    }
  }

  function checkViewVisibility() {
    const views = [
      { id: 'welcome-view', name: 'welcome' },
      { id: 'friends-view', name: 'friends' },
      { id: 'chat-view', name: 'chat' },
      { id: 'voice-view', name: 'voice' },
      { id: 'room-view', name: 'room' }
    ];

    const visibleViews = views.filter(v => {
      const el = document.getElementById(v.id);
      return el && !el.classList.contains('hidden');
    });

    // Check: Multiple main views visible
    if (visibleViews.length > 1) {
      log(
        'ui',
        `Multiple main views visible: ${visibleViews.map(v => v.name).join(', ')}`,
        'high',
        'app.js',
        'showChatView/showWelcomeView/etc',
        'Ensure only one main view is visible at a time'
      );
    }

    // Check: No views visible
    if (visibleViews.length === 0) {
      log(
        'ui',
        'No main views are visible',
        'medium',
        'app.js',
        'view switching functions',
        'Show at least one main view'
      );
    }
  }

  function checkVoiceState() {
    const hasVoiceChannel = !!window.currentVoiceChannel;
    const hasVoiceManager = !!window.voiceManager;

    // Check: Voice channel set but no manager
    if (hasVoiceChannel && !hasVoiceManager) {
      log(
        'voice',
        'currentVoiceChannel is set but voiceManager is null',
        'high',
        'voice.js',
        'joinVoiceChannel',
        'Clear currentVoiceChannel or create voiceManager'
      );
    }

    // Check: Voice manager exists but no channel
    if (!hasVoiceChannel && hasVoiceManager) {
      log(
        'voice',
        'voiceManager exists but currentVoiceChannel is null',
        'medium',
        'voice.js',
        'leaveVoiceChannel',
        'Clear voiceManager or set currentVoiceChannel'
      );
    }

    // Check: Voice panel visibility
    const voicePanel = document.getElementById('voice-panel');
    if (voicePanel && !voicePanel.classList.contains('hidden') && !hasVoiceChannel) {
      log(
        'voice',
        'Voice panel is visible but currentVoiceChannel is null',
        'medium',
        'voice.js',
        'hideVoicePanel',
        'Hide voice panel when not in voice channel'
      );
    }
  }

  function checkRoomMode() {
    const isRoomMode = document.body.classList.contains('room-mode');
    const hasCurrentRoom = !!window.currentRoom;

    // Check: Room mode class but no currentRoom
    if (isRoomMode && !hasCurrentRoom) {
      log(
        'rooms',
        'Body has room-mode class but currentRoom is null',
        'medium',
        'rooms.js',
        'exitRoomMode',
        'Remove room-mode class or set currentRoom'
      );
    }

    // Check: currentRoom but no room mode class
    if (!isRoomMode && hasCurrentRoom) {
      log(
        'rooms',
        'currentRoom is set but body lacks room-mode class',
        'medium',
        'rooms.js',
        'enterRoomMode',
        'Add room-mode class or clear currentRoom'
      );
    }
  }

  function checkDOMOverlays() {
    // Check: Stuck backdrops
    const backdrops = document.querySelectorAll('[class*="backdrop"]:not(.hidden):not(.video-fs-backdrop)');
    const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
    
    if (backdrops.length > 0 && openModals.length === 0) {
      log(
        'ui',
        `${backdrops.length} backdrop(s) visible but no modals open`,
        'low',
        'ui.js/rooms.js',
        'modal close handlers',
        'Hide backdrops when no modals are open'
      );
    }
  }

  function runDiagnostics() {
    issues.length = 0; // Clear previous issues

    try {
      checkModalStack();
      checkNavigationState();
      checkViewVisibility();
      checkVoiceState();
      checkRoomMode();
      checkDOMOverlays();

      if (issues.length === 0) {
        console.log('%c[DIAGNOSTICS] ✓ No issues detected', 'color: #00ff00; font-weight: bold');
      } else {
        console.log(`%c[DIAGNOSTICS] Found ${issues.length} issue(s)`, 'color: #ff8800; font-weight: bold');
      }
    } catch (error) {
      console.error('[DIAGNOSTICS] Error during check:', error);
    }

    return issues;
  }

  // Auto-start
  function start() {
    if (intervalId) return;
    console.log('%c[DIAGNOSTICS] Runtime diagnostics enabled', 'color: #00aaff; font-weight: bold');
    console.log('[DIAGNOSTICS] Running checks every', CHECK_INTERVAL / 1000, 'seconds');
    console.log('[DIAGNOSTICS] Manual trigger: window.runRuntimeDiagnostics()');
    
    intervalId = setInterval(runDiagnostics, CHECK_INTERVAL);
    runDiagnostics(); // Run immediately
  }

  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      console.log('%c[DIAGNOSTICS] Stopped', 'color: #888888');
    }
  }

  // Expose API (always expose, even if disabled)
  window.runRuntimeDiagnostics = runDiagnostics;
  window.stopRuntimeDiagnostics = stop;
  window.startRuntimeDiagnostics = start;

  // Auto-start after DOM ready (only if enabled)
  if (!DIAGNOSTICS_ENABLED) {
    console.log('[DIAGNOSTICS] Disabled (not localhost). Functions available but auto-start skipped.');
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(start, 2000); // Wait 2s for app initialization
    });
  } else {
    setTimeout(start, 2000);
  }

})();
