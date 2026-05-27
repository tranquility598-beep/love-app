/**
 * NavigationController
 * 
 * Single source of truth for ALL navigation in the application.
 * 
 * Architecture:
 * - Centralized state store
 * - Atomic transitions with lock protection
 * - Navigation mode state machine (idle / transition / sync)
 * - Socket event adapter layer
 * - Full trace logging for debugging
 * 
 * Rules:
 * - NO direct view manipulation outside this controller
 * - ALL navigation must go through controller API
 * - State mutations are atomic and validated
 * 
 * @version 1.0.0 - Phase 1: Foundation Layer
 */

(function() {
  'use strict';

  // Navigation modes
  const MODE = {
    IDLE: 'idle',           // Normal state, full access
    TRANSITION: 'transition', // Navigation in progress, only navigation allowed
    SYNC: 'sync'            // Socket sync in progress, data updates allowed
  };

  // Transition lock timeout (5 seconds)
  const LOCK_TIMEOUT = 5000;

  // Max trace entries to keep in memory
  const MAX_TRACE_ENTRIES = 50;

  class NavigationController {
    constructor() {
      // Internal state store
      this._state = this._getInitialState();
      
      // Navigation mode state machine
      this._mode = MODE.IDLE;
      
      // Transition lock
      this._transitionLock = false;
      this._lockAcquiredAt = null;
      
      // Navigation trace (lightweight)
      this._trace = [];
      this._traceEnabled = true;
      
      // State change listeners
      this._listeners = [];

      this._serverNavigationSeq = 0;
      this._channelNavigationSeq = 0;
      this._dmNavigationSeq = 0;
      
      console.log('[NavigationController] Initialized (Phase 1: Foundation)');
    }

    get state() {
      return this._state;
    }

    // ========================================================================
    // INITIAL STATE
    // ========================================================================

    _getInitialState() {
      return {
        // Current view mode
        currentView: 'welcome', // 'welcome' | 'server' | 'room' | 'dm' | 'voice'
        
        // Server/Guild state
        currentServer: null,
        currentServerId: null,
        
        // Channel state
        currentChannel: null,
        currentChannelId: null,
        
        // Room state
        currentRoom: null,
        
        // DM state
        currentDMConversation: null,
        
        // Voice state
        currentVoiceChannel: null,
        
        // Navigation history (for back button)
        navigationHistory: [],
        
        // Transition flag
        isTransitioning: false
      };
    }

    // ========================================================================
    // PUBLIC API (Phase 1: Stubs only, no implementation yet)
    // ========================================================================

    /**
     * Navigate to a server (guild or room)
     * @param {String} serverId - Server ID
     * @param {Object} options - Navigation options
     */
    async navigateToServer(serverId, options = {}) {
      if (window.socketLifecycle && typeof window.socketLifecycle.detachScope === 'function') {
        window.socketLifecycle.detachScope('context');
      }
      const requestSeq = ++this._serverNavigationSeq;
      const globalSeq = ++window._globalNavigationSeq;
      window._activeNavigationRequestId = globalSeq;
      const triggeredBy = options.triggeredBy || 'navigateToServer';

      try {
        const data = await ServersAPI.get(serverId);

        if (requestSeq !== this._serverNavigationSeq) {
          console.warn('[NavigationController] Ignored stale server navigation:', serverId);
          return { stale: true };
        }

        this._acquireLock();

        try {
          const server = data.server;

          if (window.servers) {
            const index = window.servers.findIndex(s => s._id === serverId);
            if (index !== -1) {
              window.servers[index] = server;
            }
          }

          if (typeof socketJoinServer === 'function') {
            socketJoinServer(serverId);
          }

          if (server?.settings?.kind === 'room') {
            this._commitState({
              currentView: 'server',
              currentServer: server,
              currentServerId: serverId,
              currentDMConversation: null
            }, triggeredBy);

            if (typeof setNavigationState === 'function') {
              setNavigationState({
                currentView: 'server',
                activeServerId: serverId,
                activeDMId: null
              });
            }

            if (window.socketLifecycle && typeof window.socketLifecycle.attachAllSocketListeners === 'function') {
              window.socketLifecycle.attachAllSocketListeners();
            }

            return { server, isRoom: true };
          }

          this._commitState({
            currentView: 'server',
            currentServer: server,
            currentServerId: serverId,
            currentDMConversation: null
          }, triggeredBy);

          if (typeof setNavigationState === 'function') {
            setNavigationState({
              currentView: 'server',
              activeServerId: serverId,
              activeDMId: null
            });
          }

          if (typeof showServerChannels === 'function') {
            showServerChannels(server);
          }

          if (window.socketLifecycle && typeof window.socketLifecycle.attachAllSocketListeners === 'function') {
            window.socketLifecycle.attachAllSocketListeners();
          }

          return { server, isRoom: false };
        } finally {
          this._releaseLock();
        }
      } catch (error) {
        if (typeof showNotification === 'function') {
          showNotification('error', 'Не удалось загрузить сервер');
        }
        return { error };
      }
    }

    /**
     * Navigate to a channel
     * @param {String} channelId - Channel ID
     * @param {String} name - Channel name
     * @param {String} type - Channel type ('text' | 'voice')
     */
    async navigateToChannel(channelId, name, type, options = {}) {
      window.unreadCount = 0;
      if (window.electronAPI?.setBadgeCount) {
        window.electronAPI.setBadgeCount(0);
      }
      if (window.socketLifecycle && typeof window.socketLifecycle.detachScope === 'function') {
        window.socketLifecycle.detachScope('context');
      }
      const requestSeq = ++this._channelNavigationSeq;
      const globalSeq = ++window._globalNavigationSeq;
      window._activeNavigationRequestId = globalSeq;

      const triggeredBy = options.triggeredBy || 'navigateToChannel';
      const isStale = () => (
        requestSeq !== this._channelNavigationSeq ||
        String(window.currentChannelId || '') !== String(channelId || '')
      );

      const fromState = { ...this._state };
      this._state = {
        ...this._state,
        currentChannel: { _id: channelId, name, type },
        currentChannelId: channelId,
        currentDMConversation: null
      };
      this._logTransition(fromState, this._state, triggeredBy, { channelType: type });
      this._notifyListeners();

      document.querySelectorAll('.channel-item').forEach(el => {
        el.classList.toggle('active', el.dataset.channelId === channelId);
      });

      const headerName = document.getElementById('chat-header-name');
      const headerIcon = document.getElementById('chat-header-icon');
      if (headerName) headerName.textContent = name;
      if (headerIcon) headerIcon.innerHTML = `
    <svg width="20" height="20" viewBox="0 0 24 24" fill="#8e9297">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>
    </svg>`;

      const membersToggleBtn = document.getElementById('members-toggle-btn');
      if (membersToggleBtn) membersToggleBtn.style.display = '';

      if (typeof showChatView === 'function') {
        showChatView();
      }

      const callBtn = document.getElementById('dm-call-btn');
      if (callBtn) callBtn.style.display = 'none';

      if (typeof loadMessages === 'function') {
        await loadMessages(channelId, { requestSeq, globalSeq });
        if (isStale()) return { stale: true };
      }

      if (typeof loadPinnedMessages === 'function') {
        loadPinnedMessages(channelId);
      }
      if (isStale()) return { stale: true };

      if (typeof loadChannelMembers === 'function') {
        await loadChannelMembers();
        if (isStale()) return { stale: true };
      }

      const input = document.getElementById('message-input');
      if (input) input.dataset.placeholder = `${window.i18n.t('message_write_in') || 'Написать в'} #${name}`;

      if (window.socketLifecycle && typeof window.socketLifecycle.attachAllSocketListeners === 'function') {
        window.socketLifecycle.attachAllSocketListeners();
      }

      return { channelId, stale: false };
    }

    /**
     * Navigate to a room
     * @param {String} roomId - Room ID
     * @param {Object} hints - Room hints (textChannelId, voiceChannelId)
     */
    async navigateToRoom(roomId, hints = {}) {
      console.log('[NavigationController] navigateToRoom:', roomId, '(stub - Phase 5)');
      // TODO: Implement in Phase 5
    }

    /**
     * Navigate to a DM conversation
     * @param {Object|String} conversationOrId - DM conversation object or ID
     * @param {Object} options - Navigation options
     */
    async navigateToDM(conversationOrId, options = {}) {
      window.unreadCount = 0;
      if (window.electronAPI?.setBadgeCount) {
        window.electronAPI.setBadgeCount(0);
      }
      const requestSeq = ++this._dmNavigationSeq;
      const globalSeq = ++window._globalNavigationSeq;
      window._activeNavigationRequestId = globalSeq;
      const triggeredBy = options.triggeredBy || 'navigateToDM';

      try {
        let conversation;
        if (typeof conversationOrId === 'string') {
          if (typeof DMAPI !== 'undefined' && typeof DMAPI.getAll === 'function') {
            const data = await DMAPI.getAll();
            conversation = data.conversations?.find(c => c._id === conversationOrId);
          }
          if (!conversation) {
            console.error('[NavigationController] DM conversation not found:', conversationOrId);
            return { error: 'Not found' };
          }
        } else {
          conversation = conversationOrId;
        }

        const conversationId = conversation._id;

        if (requestSeq !== this._dmNavigationSeq) {
          console.warn('[NavigationController] Ignored stale DM navigation:', conversationId);
          return { stale: true };
        }

        this._acquireLock();

        try {
          const other = conversation.participants?.find(p => p._id !== window.currentUser?._id);
          if (!other) {
            console.error('[NavigationController] DM other participant not found');
            return { error: 'Invalid participant' };
          }

          // Вызвать detachScope('context') на socketLifecycle перед переходом
          if (window.socketLifecycle && typeof window.socketLifecycle.detachScope === 'function') {
            window.socketLifecycle.detachScope('context');
          }

          // Commit state
          window.currentDMConversationId = conversationId;
          this._commitState({
            currentView: 'dm',
            currentDMConversation: conversation,
            currentServer: null,
            currentServerId: null,
            currentChannel: null,
            currentChannelId: null,
            currentRoom: null
          }, triggeredBy);

          // Update navigationState (if exists)
          if (typeof setNavigationState === 'function') {
            setNavigationState({
              currentView: 'dm',
              activeServerId: null,
              activeDMId: conversationId
            });
          }

          // Update active DM styling in sidebar
          document.querySelectorAll('.dm-item').forEach(el => {
            el.classList.toggle('active', el.dataset.convId === conversationId);
          });

          // Update header UI
          const headerName = document.getElementById('chat-header-name');
          const headerIcon = document.getElementById('chat-header-icon');
          if (headerName) headerName.textContent = other.nickname || other.username;
          if (headerIcon) {
            const avatarUrl = (typeof getAvatarUrl === 'function') ? getAvatarUrl(other.avatar, other.username, other._id) : '';
            headerIcon.innerHTML = `
              <img src="${avatarUrl}" style="width:24px;height:24px;border-radius:50%;object-fit:cover" alt="">
            `;
          }

          // Show call button
          const callBtn = document.getElementById('dm-call-btn');
          if (callBtn) callBtn.style.display = 'flex';

          // Hide members sidebar and button
          const membersSidebar = document.getElementById('members-sidebar');
          if (membersSidebar) membersSidebar.classList.add('hidden');
          const membersToggleBtn = document.getElementById('members-toggle-btn');
          if (membersToggleBtn) membersToggleBtn.style.display = 'none';

          // Show views
          if (typeof showDMView === 'function') showDMView();
          if (typeof showChatView === 'function') showChatView();

          // Load DM messages
          if (typeof loadDMMessages === 'function') {
            // Sync with window._dmNavigationSeq to satisfy internal message rendering guards
            window._dmNavigationSeq = requestSeq;
            await loadDMMessages(conversationId, { requestSeq, globalSeq });
          }

          // Re-attach context listeners to the current channel room after state commit
          if (window.socketLifecycle && typeof window.socketLifecycle.attachAllSocketListeners === 'function') {
            window.socketLifecycle.attachAllSocketListeners();
          }

          // Update message input placeholder
          const input = document.getElementById('message-input');
          if (input) input.dataset.placeholder = `${window.i18n.t('message_write') || 'Написать'} ${other.nickname || other.username}`;

          return { conversation, stale: false };
        } finally {
          this._releaseLock();
        }
      } catch (error) {
        console.error('[NavigationController] Error navigating to DM:', error);
        return { error };
      }
    }

    /**
     * Navigate to voice channel
     * @param {String} channelId - Voice channel ID
     */
    async navigateToVoice(channelId) {
      console.log('[NavigationController] navigateToVoice:', channelId, '(stub - Phase 6)');
      // TODO: Implement in Phase 6
    }

    /**
     * Navigate to welcome screen
     */
    navigateToWelcome() {
      console.log('[NavigationController] navigateToWelcome (stub)');
      // TODO: Implement
    }

    /**
     * Navigate back in history
     */
    navigateBack() {
      console.log('[NavigationController] navigateBack (stub)');
      // TODO: Implement
    }

    /**
     * Reset navigation to initial state
     */
    resetNavigation() {
      console.log('[NavigationController] resetNavigation');
      this._state = this._getInitialState();
      this._mode = MODE.IDLE;
      this._syncWindowState();
    }

    // ========================================================================
    // TRANSITION LOCK (with timeout safety)
    // ========================================================================

    _acquireLock() {
      if (this._transitionLock) {
        const lockAge = Date.now() - this._lockAcquiredAt;
        
        // Emergency unlock if lock is stuck
        if (lockAge > LOCK_TIMEOUT) {
          console.error('[NavigationController] Lock timeout detected. Force releasing.');
          console.error('[NavigationController] Lock was acquired at:', new Date(this._lockAcquiredAt).toISOString());
          this._releaseLock();
        } else {
          throw new Error('Navigation transition already in progress');
        }
      }
      
      this._transitionLock = true;
      this._lockAcquiredAt = Date.now();
      this._mode = MODE.TRANSITION;
    }

    _releaseLock() {
      this._transitionLock = false;
      this._lockAcquiredAt = null;
      this._mode = MODE.IDLE;
    }

    // ========================================================================
    // NAVIGATION TRACE (lightweight logging)
    // ========================================================================

    _logTransition(from, to, triggeredBy, metadata = {}) {
      if (!this._traceEnabled) return;
      
      const entry = {
        timestamp: Date.now(),
        from: {
          view: from.currentView,
          serverId: from.currentServerId,
          channelId: from.currentChannelId,
          roomId: from.currentRoom?._id || null
        },
        to: {
          view: to.currentView,
          serverId: to.currentServerId,
          channelId: to.currentChannelId,
          roomId: to.currentRoom?._id || null
        },
        triggeredBy: triggeredBy,
        metadata: metadata
      };
      
      this._trace.push(entry);
      
      // Keep only last N entries
      if (this._trace.length > MAX_TRACE_ENTRIES) {
        this._trace.shift();
      }
      
      // Log to console (dev mode only)
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log('[NavigationController] Transition:', {
          from: entry.from.view,
          to: entry.to.view,
          triggeredBy: triggeredBy
        });
      }
    }

    // ========================================================================
    // STATE MANAGEMENT
    // ========================================================================

    _commitState(newState, triggeredBy = 'unknown') {
      const fromState = { ...this._state };
      
      // Atomic state update
      this._state = { ...this._state, ...newState };
      
      // Sync to window.* for backward compatibility
      this._syncWindowState();
      
      // Log transition
      this._logTransition(fromState, this._state, triggeredBy);
      
      // Notify listeners
      this._notifyListeners();

      // Dispatch navigation changed event
      document.dispatchEvent(new CustomEvent('navigation:changed'));
    }

    _syncWindowState() {
      // No-op because window.* variables are now ES6 getters pointing directly to controller state.
    }

    _notifyListeners() {
      this._listeners.forEach(fn => {
        try {
          fn(this._state);
        } catch (error) {
          console.error('[NavigationController] Listener error:', error);
        }
      });
    }

    /**
     * Subscribe to state changes
     * @param {Function} listener - Callback function
     * @returns {Function} Unsubscribe function
     */
    subscribe(listener) {
      this._listeners.push(listener);
      return () => {
        this._listeners = this._listeners.filter(fn => fn !== listener);
      };
    }

    // ========================================================================
    // SOCKET EVENT ADAPTER (Phase 1: Stub only)
    // ========================================================================

    /**
     * Handle socket events (centralized entry point)
     * Phase 1: Empty stub
     * Phase 7: Full implementation
     * 
     * @param {String} eventType - Socket event type
     * @param {Object} payload - Event payload
     */
    _handleSocketEvent(eventType, payload) {
      console.log('[NavigationController] Socket event:', eventType, '(stub - Phase 7)');
      // TODO: Implement in Phase 7
      // This will handle:
      // - server:update
      // - channel:update
      // - voice:members_update
      // - etc.
    }

    // ========================================================================
    // DEBUG API
    // ========================================================================

    getCurrentState() {
      return {
        ...this._state,
        currentRoom: window.currentRoom,
        currentDMConversation: window.currentDMConversation,
        currentServer: window.currentServer,
        currentServerId: window.currentServerId,
        currentChannel: window.currentChannel,
        currentChannelId: window.currentChannelId,
        currentVoiceChannel: window.currentVoiceChannel
      };
    }

    /**
     * Get navigation trace history
     * @returns {Array} Trace entries
     */
    getNavigationTrace() {
      return [...this._trace];
    }

    /**
     * Get current navigation mode
     * @returns {String} Current mode ('idle' | 'transition' | 'sync')
     */
    getNavigationMode() {
      return this._mode;
    }

    /**
     * Validate state consistency
     * @returns {Array} List of issues found
     */
    validateStateConsistency() {
      const issues = [];
      const currentRoom = window.currentRoom;
      const hasRoomClass = document.body.classList.contains('room-mode');
      
      // Check: currentRoom set but room-mode class missing
      if (currentRoom && !hasRoomClass) {
        issues.push({
          severity: 'medium',
          issue: 'window.currentRoom is set but body lacks room-mode class',
          location: 'window.currentRoom vs DOM'
        });
      }
      
      // Check: room-mode class but no currentRoom
      if (!currentRoom && hasRoomClass) {
        issues.push({
          severity: 'medium',
          issue: 'body has room-mode class but window.currentRoom is null',
          location: 'DOM vs window.currentRoom'
        });
      }
      
      // Check: currentServer vs currentServerId mismatch
      if ((window.currentServer && !window.currentServerId) ||
          (!window.currentServer && window.currentServerId)) {
        issues.push({
          severity: 'high',
          issue: 'window.currentServer and window.currentServerId are out of sync',
          location: 'window state'
        });
      }
      
      // Check: currentChannel vs currentChannelId mismatch
      if ((window.currentChannel && !window.currentChannelId) ||
          (!window.currentChannel && window.currentChannelId)) {
        issues.push({
          severity: 'medium',
          issue: 'window.currentChannel and window.currentChannelId are out of sync',
          location: 'window state'
        });
      }
      
      return issues;
    }

    /**
     * Enable trace logging
     */
    enableTrace() {
      this._traceEnabled = true;
      console.log('[NavigationController] Trace logging enabled');
    }

    /**
     * Disable trace logging
     */
    disableTrace() {
      this._traceEnabled = false;
      console.log('[NavigationController] Trace logging disabled');
    }

    /**
     * Clear trace history
     */
    clearTrace() {
      this._trace = [];
      console.log('[NavigationController] Trace history cleared');
    }

    /**
     * Get debug info (full diagnostic dump)
     * @returns {Object} Debug information
     */
    getDebugInfo() {
      return {
        state: this.getCurrentState(),
        mode: this.getNavigationMode(),
        trace: this.getNavigationTrace(),
        issues: this.validateStateConsistency(),
        lockStatus: {
          locked: this._transitionLock,
          acquiredAt: this._lockAcquiredAt,
          age: this._lockAcquiredAt ? Date.now() - this._lockAcquiredAt : null
        },
        listeners: this._listeners.length
      };
    }
  }

  // ========================================================================
  // SINGLETON INSTANCE
  // ========================================================================

  const controller = new NavigationController();

  // Expose globally
  window.NavigationController = controller;

  // Expose MODE enum for external use
  window.NavigationController.MODE = MODE;

  // ES6 getters / State Guards for backward compatibility and protection
  const variables = [
    'currentServer',
    'currentServerId',
    'currentChannel',
    'currentChannelId',
    'currentRoom',
    'currentDMConversation',
    'currentVoiceChannel'
  ];

  variables.forEach(varName => {
    Object.defineProperty(window, varName, {
      get: () => window.NavigationController?.state?.[varName] ?? null,
      set: (val) => {
        console.warn(`[StateGuard] Direct write to window.${varName} blocked. Use NavigationController. Caller:`, new Error().stack.split('\n')[2]);
      },
      configurable: true
    });
  });

  Object.defineProperty(window, 'navigationState', {
    get: () => {
      const state = window.NavigationController?.state;
      return {
        currentView: state?.currentView ?? 'welcome',
        activeServerId: state?.currentServerId ?? null,
        activeDMId: state?.currentDMConversation?._id ?? null
      };
    },
    set: (val) => {
      console.warn('[StateGuard] Direct write to window.navigationState blocked. Use NavigationController. Caller:', new Error().stack.split('\n')[2]);
    },
    configurable: true
  });

  console.log('[NavigationController] Ready. Phase 1: Foundation layer active.');
  console.log('[NavigationController] Debug API available: NavigationController.getDebugInfo()');

})();
