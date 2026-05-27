# PHASE 2: UX STABILITY AUDIT

**Project:** Love Desktop Chat App  
**Phase:** 2 - UX Stability  
**Status:** ✅ Complete  
**Started:** 2026-05-22  
**Completed:** 2026-05-22

---

## OVERVIEW

Phase 2 focuses on auditing system stability, session management, reconnection behavior, voice reliability, and memory management. This is a documentation-only phase. No refactoring, optimization, or architectural changes are performed.

**Scope:**
- Event and notification system classification
- Session stability and token management
- Reconnect handling and UI feedback
- Voice system reliability
- Memory leak verification

**Out of Scope:**
- Performance optimization
- Architecture refactoring
- UI/UX improvements
- Feature additions

---

## ITEM 1: EVENT AND NOTIFICATION CLASSIFICATION

**Status:** ✅ Complete  
**Date:** 2026-05-22

### Socket Event Listener Inventory

**Total socket event listeners: 53**
- Managed via `attachListener()`: 38 (in socket.js)
- Direct `socket.on()` calls: 15 (in other files)

### Event Classification (socket.js managed)

**GLOBAL SCOPE (11 listeners):**
- `connect` - Connection established
- `disconnect` - Connection lost
- `connect_error` - Connection failed
- `reconnect` - Reconnection successful
- `user:status` - User online/offline status
- `friend:request_received` - Incoming friend request
- `friend:request_accepted` - Friend request accepted
- `founder:stats` - Founder statistics
- `founder:announcement` - Founder broadcast
- `founder:logs` - Founder logs
- `error` - Socket error

**CONTEXT SCOPE (10 listeners):**
- `message:new` - New message in channel
- `message:edited` - Message edited
- `message:update` - Message updated (legacy)
- `message:deleted` - Message deleted
- `message:reaction` - Reaction added/removed
- `message:rate_limited` - Rate limit triggered
- `typing:start` - User started typing
- `typing:stop` - User stopped typing
- `dm:new_message` - New DM message
- `notification:mention` - User mentioned

**VOICE SCOPE (12 listeners):**
- `voice:existing_members` - Members in voice channel
- `voice:user_joined` - User joined voice
- `voice:user_left` - User left voice
- `voice:members_update` - Voice members updated
- `voice:user_speaking` - User speaking indicator
- `voice:user_muted` - User muted/unmuted
- `voice:left` - Self left voice
- `screen:started` - Screen share started
- `screen:stopped` - Screen share stopped
- `webrtc:offer` - WebRTC offer
- `webrtc:answer` - WebRTC answer
- `webrtc:ice_candidate` - ICE candidate

**CALL SCOPE (4 listeners):**
- `call:incoming` - Incoming DM call
- `call:response` - Call response (accept/decline)
- `call:terminated` - Call ended
- `call:error` - Call error

### Unmanaged Socket Listeners (15 direct socket.on calls)

**profile.js (5 listeners):**
- `profile:data` - Profile data received
- `profile:update_success` - Profile updated successfully
- `profile:updated` - Profile updated (broadcast)
- `user:blocked` - User blocked
- `user:unblocked` - User unblocked

**roles.js (5 listeners):**
- `role:created` - Role created
- `role:updated` - Role updated
- `role:deleted` - Role deleted
- `role:assigned` - Role assigned to user
- `role:removed` - Role removed from user

**pinned.js (3 listeners):**
- `message:pinned` - Message pinned
- `message:unpinned` - Message unpinned
- `message:pinned_list` - Pinned messages list

**search.js (1 listener):**
- `message:search_results` - Search results received

**socket.js (1 internal):**
- Used by `attachListener()` function itself

### Duplication Analysis

**Lifecycle Management:**
- Managed (38): Use `attachListener()` with scope-based cleanup
- Unmanaged (15): Direct `socket.on()` with no cleanup mechanism
- **Issue:** 28% of listeners not managed by lifecycle system

**Cleanup Behavior:**
- Managed: Removed on `detachScope()` or `detachAllListeners()`
- Unmanaged: Never removed (potential memory leak on repeated registration)

**Registration Pattern:**
- Managed: Centralized in `attachAllSocketListeners()` function
- Unmanaged: Scattered across 4 files (profile.js, roles.js, pinned.js, search.js)

### Behavioral Patterns

**Managed Listeners:**
- Registered once in `attachAllSocketListeners()`
- Cleaned up on reconnect (detach → reattach)
- Cleaned up on logout (detachAllListeners)
- Scope-based cleanup available

**Unmanaged Listeners:**
- Registered on file load (immediate execution)
- Never cleaned up
- No scope management
- Potential duplication on reconnect

### Classification

**Event system state:** Dual pattern (managed + unmanaged), 28% unmanaged, no breaking issues, cleanup inconsistency.

**Lifecycle adoption:** 72% managed, 28% unmanaged

**System state:** Stable, baseline established.

---

## ITEM 2: SESSION STABILITY

**Status:** ✅ Complete  
**Date:** 2026-05-22

### Session Management Mechanisms

**Dual Token System:**

1. **Main Auth Token** (Long-lived)
   - Storage: Electron secure storage (main process) OR localStorage (web fallback)
   - Functions: `storeAuthToken()`, `clearAuthToken()` in api.js
   - Used for: API requests via IPC proxy
   - Lifetime: Not specified (server-controlled)
   - Refresh: No automatic refresh mechanism

2. **Socket Token** (Short-lived)
   - Storage: Memory only (not persisted)
   - Function: `fetchSocketToken()` in socket.js
   - Used for: Socket.io authentication
   - Lifetime: 5 minutes (TTL)
   - Refresh: On every reconnect attempt

### Token Storage Patterns

**Main Auth Token:**
- **Electron (packaged):** `window.electronAPI.storeToken()` → Secure storage in main process
- **Web (fallback):** `localStorage.setItem('token', token)` → Browser localStorage
- **Cleanup:** Both storage locations cleared on logout/401

**User Data:**
- Storage: `localStorage.setItem('user', JSON.stringify(user))`
- Used by: 11 locations across codebase
- Cleared on: Logout, 401 errors on authenticated endpoints

**Settings:**
- Storage: `localStorage` with key prefix pattern
- Managed by: settings.js SettingsManager
- Persisted across sessions

### Token Refresh Patterns

**Main Auth Token:**
- **No automatic refresh**
- On 401 error: Clear token + redirect to login
- Exception: Auth entry endpoints (login, register, verify-otp) don't trigger logout

**Socket Token:**
- **Automatic refresh on reconnect**
- Fetched via `AuthAPI.getSocketToken()` before each reconnect attempt
- Updated in `socket.auth` object dynamically
- Logged: "[socket-auth] refreshed token for reconnect_attempt"

### Reconnection Behavior

**Socket.io Configuration:**
```javascript
reconnection: true
reconnectionAttempts: 5
reconnectionDelay: 1000 (ms)
```

**Reconnect Flow:**
1. Connection lost → `handleDisconnect(reason)` called
2. Socket.io attempts reconnect (up to 5 times, 1s delay)
3. Before each attempt: `reconnect_attempt` event → fetch fresh socket token
4. On successful reconnect: `handleReconnect(attemptNumber)` called
5. Listener cleanup: `detachAllListeners()` → `attachAllSocketListeners()`

**Listener Management on Reconnect:**
- All listeners detached before reattach (prevents duplication)
- Logged: "[socket-lifecycle] Reconnect detected - reinitializing listeners"
- Stats logged after reattach

### Session Lifecycle

**Login Flow:**
1. User authenticates (login/register/Google OAuth)
2. Server returns main auth token
3. `storeAuthToken(token)` → Secure storage
4. `localStorage.setItem('user', JSON.stringify(user))`
5. `initSocket()` → Fetch socket token → Connect

**Reconnect Flow:**
1. Network drop or server restart
2. Socket.io auto-reconnect (5 attempts)
3. Fresh socket token fetched before each attempt
4. On success: Listeners reinitialized
5. On failure after 5 attempts: Connection lost (no auto-recovery)

**Logout Flow:**
1. `clearAuthToken()` → Remove from secure storage + localStorage
2. `localStorage.removeItem('user')`
3. `disconnectSocket()` → `detachAllListeners()` → `socket.disconnect()`
4. Redirect to auth screen

**401 Error Flow:**
1. API request returns 401
2. Check if auth entry endpoint → If yes, show error in UI
3. If not auth entry → `clearAuthToken()` + `localStorage.removeItem('user')`
4. Call `showAuthScreen()` (no page reload)

### Stability Issues Identified

**Token Expiration:**
- Main auth token has no automatic refresh
- On expiration: Hard logout (user must re-authenticate)
- No warning before expiration
- No silent token refresh mechanism

**Reconnection Limits:**
- Max 5 reconnect attempts
- After 5 failures: No further attempts
- User must manually reload app to reconnect
- No UI indication of reconnection state

**Session Persistence:**
- User data stored in localStorage (not encrypted in web fallback)
- Settings stored in localStorage (not synced to server)
- No session recovery after app restart if token expired

**Dual Storage Pattern:**
- Main token: Secure storage (Electron) OR localStorage (web)
- User data: Always localStorage
- Inconsistent security model between storage types

### Behavioral Patterns

**Server Warmup:**
- Function: `warmupServer()` in api.js
- Purpose: Wake up Render free-tier server (15min sleep)
- Max attempts: 12, timeout: 8s each, delay: 3s between
- Used on: App startup (auth screen)

**Error Handling:**
- 401 on authenticated endpoints → Logout
- 401 on auth endpoints → Show error in UI
- Network errors → Generic "server unavailable" message
- HTML responses → "Server not updated" or "incorrect response"

### Classification

**Session stability state:** Dual token system, no auto-refresh for main token, limited reconnection attempts, functional but constrained.

**Token security:** Electron uses secure storage, web fallback uses localStorage.

**System state:** Stable, baseline established.

---

## ITEM 3: RECONNECT HANDLING

**Status:** ✅ Complete  
**Date:** 2026-05-22

### Reconnect Code Paths Identified

**Socket Reconnection (socket.js):**
1. `handleDisconnect(reason)` - Called when socket disconnects
2. `handleReconnect(attemptNumber)` - Called after successful reconnect
3. `socket.io.on('reconnect_attempt')` - Before each reconnect attempt
4. Socket.io config: 5 attempts, 1000ms delay

**Server Warmup (api.js + app.js):**
1. `warmupServer(opts)` - Pings /api/health until response
2. Used on: App startup (auth screen)
3. Max attempts: 12, timeout: 8s each, delay: 3s between
4. UI callback: `onAttempt(attempt, max)`

### Reconnect State Management

**Socket Reconnection:**
- **State tracking:** None (no UI state variable)
- **Listener cleanup:** `detachAllListeners()` → `attachAllSocketListeners()`
- **Token refresh:** Fresh socket token fetched before each attempt
- **Logging:** Console only
  - "❌ Socket disconnected: [reason]"
  - "🔄 Socket reconnected after [N] attempts"
  - "[socket-auth] refreshed token for reconnect_attempt"

**Server Warmup:**
- **State tracking:** Progress via `onAttempt` callback
- **UI elements:**
  - `#loading-status` - Status text
  - `#loading-progress-fill` - Progress bar width
  - `#loading-content` - Transform for layout shift
- **Progress messages:**
  - Attempt 1: Silent (no UI)
  - Attempt 2-4: "Подождите немного..."
  - Attempt 5+: "Это занимает чуть дольше обычного..."
  - Failure: "Сервер недоступен. Проверьте интернет и попробуйте позже."

### UI Feedback During Reconnection

**Socket Reconnection:**
- **No UI feedback**
- User sees: Nothing (silent reconnection)
- Console logs only
- No loading indicator
- No status message
- No visual indication of connection state

**Server Warmup (Startup Only):**
- **Loading screen with progress:**
  - Attempt 1: No UI (optimistic fast response)
  - Attempt 2+: Show progress bar + status text
  - Layout shift: Content moves up 40px
  - Fade-in: 300ms delay for progress bar + status
  - Progress bar: Width = (attempt / max) * 100%
- **Success:**
  - Status: "Входим..."
  - Fade out: 500ms opacity transition
  - Cleanup: Reset transform, opacity, display
- **Failure:**
  - Status remains visible with error message
  - No retry button
  - User must manually restart app

**Voice Reconnection (Room Voice):**
- **UI elements:**
  - `#room-voice-preconnect` - "Присоединиться" button
  - Shown when: `connected === false`
  - Hidden when: `connected === true`
- **No reconnection UI** - Only initial connection button

### Reconnection Scenarios

**Scenario 1: Network Drop (Socket)**
1. Socket disconnects → `handleDisconnect()` called
2. Socket.io auto-reconnect (5 attempts, 1s delay)
3. Before each attempt: Fetch fresh socket token
4. On success: `handleReconnect()` → Reinitialize listeners
5. On failure: No further attempts, no UI indication
6. **User experience:** Silent (no feedback)

**Scenario 2: Server Restart (Socket)**
- Same as Scenario 1
- **User experience:** Silent (no feedback)

**Scenario 3: Cold Start (Warmup)**
1. App starts → Loading screen visible
2. `warmupServer()` called (12 attempts, 8s timeout, 3s delay)
3. Attempt 1: Silent
4. Attempt 2+: Show progress bar + status
5. On success: Fade out loading screen → Init app
6. On failure: Show error, no retry
7. **User experience:** Progress feedback, but no retry option

**Scenario 4: Token Expiration**
1. API request returns 401
2. Clear token + user data
3. Call `showAuthScreen()`
4. **User experience:** Forced logout, must re-authenticate

**Scenario 5: Rate Limit (429)**
1. API request returns 429
2. Show error: "Слишком много запросов. Подождите минуту..."
3. No reload (prevents reload loop)
4. **User experience:** Stuck on loading screen, must manually restart

### State Persistence Across Reconnects

**Preserved:**
- User data in localStorage
- Settings in localStorage
- Current view/route (no navigation reset)
- Socket listeners (reinitialized, not lost)

**Lost:**
- Socket connection state (no recovery after 5 failed attempts)
- In-flight messages (not queued during disconnect)
- Typing indicators (cleared on disconnect)
- Voice connection (must manually reconnect)

### Classification

**Reconnect handling state:** Socket auto-reconnect (5 attempts, silent), server warmup (12 attempts, UI feedback on startup only), no runtime reconnection UI.

**UI feedback:** Startup only, no runtime feedback for socket reconnection.

**System state:** Stable, baseline established.

---

## ITEM 4: VOICE RELIABILITY

**Status:** ✅ Complete  
**Date:** 2026-05-22

### Voice System Components

**VoiceManager Class (voice.js):**
- **State Properties:**
  - `localStream` - Local microphone MediaStream
  - `screenStream` - Screen share MediaStream
  - `peerConnections` - Map<socketId, RTCPeerConnection>
  - `audioElements` - Map<socketId, HTMLAudioElement>
  - `audioListeners` - Map<socketId, {playing, pause, error}>
  - `channelId` - Current voice channel ID
  - `isMuted`, `isDeafened`, `isSpeaking`, `isScreenSharing` - Boolean flags
  - `audioContext`, `analyser` - Web Audio API for speaking detection
  - `speakingCheckInterval` - Interval for speaking detection
  - `remoteAudioStatsIntervals` - Map<socketId, intervalId>

**ICE Servers Configuration:**
- STUN: 3 Google STUN servers
- TURN: 3 OpenRelay TURN servers (80, 443, 443/tcp)
- Credentials: openrelayproject/openrelayproject

### Voice Lifecycle

**Join Flow:**
1. `joinChannel(channelId)` called
2. Request microphone access via `getUserMedia()`
3. Setup audio analyser for speaking detection
4. Emit `socketJoinVoice(channelId)` to server
5. Play join sound
6. Server responds with existing members
7. For each member: `initiateConnection(socketId)` → Create offer

**Peer Connection Flow:**
1. `createPeerConnection(socketId)` - Create RTCPeerConnection
2. Add local audio tracks to peer connection
3. Create WebRTC offer
4. Send offer via socket
5. Receive answer from peer
6. Exchange ICE candidates
7. On `pc.ontrack`: Receive remote audio → `playRemoteAudio()`
8. On `pc.connectionState === 'connected'`: Start stats monitoring

**Leave Flow:**
1. `leaveChannel()` called
2. Emit `socketLeaveVoice(channelId)` to server
3. Call `cleanup()`
4. Play disconnect sound

### WebRTC Connection Management

**Peer Connection Creation:**
- Check if connection already exists and not closed
- Create new `RTCPeerConnection` with ICE servers
- Store in `peerConnections` Map
- Setup handlers: `onicecandidate`, `ontrack`, `onconnectionstatechange`

**Connection State Handling:**
- **connected:** Start remote audio stats monitoring (3s interval)
- **failed:** 
  - If DM call and first failure: Attempt ICE restart via `restartConnection()`
  - Otherwise: Remove connection via `removeConnection()`
- **closed:** Connection removed from Map

**ICE Restart (DM Calls Only):**
- Flag: `pc._iceRestartAttempted` (prevents infinite loops)
- Creates new offer with `iceRestart: true`
- One retry only per connection

**Duplicate Connection Prevention:**
- Check `peerConnections.has(socketId)` before creating
- If exists and `signalingState !== 'closed'`: Return existing connection

### Cleanup and Resource Management

**Full Cleanup (`cleanup()`):**
1. Stop screen share tracks → `screenStream = null`
2. Stop local audio tracks → `localStream = null`
3. Close all peer connections → `peerConnections.clear()`
4. Remove audio element listeners (3 per peer: playing, pause, error)
5. Remove audio elements → `audioElements.clear()`, `audioListeners.clear()`
6. Clear stats intervals → `remoteAudioStatsIntervals.clear()`
7. Stop speaking detection interval
8. Close AudioContext
9. Reset all state flags
10. Hide screen share video elements

**Per-Peer Cleanup (`removeConnection(socketId)`):**
1. Close peer connection → `pc.close()`
2. Remove from `peerConnections` Map
3. Remove audio element listeners (3 listeners)
4. Set `audio.srcObject = null`
5. Remove audio element from DOM
6. Delete from `audioElements` and `audioListeners` Maps
7. Clear stats interval for this peer
8. Hide screen share video for this peer

**Audio Listener Management:**
- **Stored:** Named functions in `audioListeners` Map
- **Added:** On `playRemoteAudio()` (playing, pause, error)
- **Removed:** On `removeConnection()` and `cleanup()`
- **Pattern:** Symmetric add/remove (Phase 1 fix applied)

### Reliability Features

**Connection Recovery:**
- ICE restart on first failure (DM calls only)
- Flag `_iceRestartAttempted` prevents retry loops
- No recovery for regular voice channels (immediate disconnect)

**Stats Monitoring:**
- Remote audio stats logged every 3s when connected
- Tracks: bytesReceived, packetsReceived, packetsLost, jitter, audioLevel
- Auto-cleanup when connection closes

**Track State Monitoring:**
- Handlers: `track.onmute`, `track.onunmute`, `track.onended`
- Console logging for debugging
- No automatic recovery on track end

**Speaking Detection:**
- AudioContext + AnalyserNode
- Threshold: 20 (configurable)
- Interval-based checking
- Emits speaking state to server

### Resource Leak Prevention

**MediaStream Cleanup:**
- All tracks stopped via `track.stop()`
- Streams set to null
- Applied to: localStream, screenStream

**RTCPeerConnection Cleanup:**
- All connections closed via `pc.close()`
- Map cleared
- No orphaned connections

**Audio Element Cleanup:**
- Event listeners removed before element removal
- `srcObject` set to null before removal
- Elements removed from DOM
- Maps cleared

**Interval Cleanup:**
- Speaking detection interval cleared
- Stats intervals cleared per peer
- All intervals tracked in Maps

**AudioContext Cleanup:**
- Closed via `audioContext.close()`
- Set to null after close

### Failure Scenarios

**Microphone Access Denied:**
- Error: NotAllowedError
- Notification: "Нет доступа к микрофону..."
- No retry mechanism
- User must manually grant permission and rejoin

**WebRTC Connection Failed:**
- DM calls: One ICE restart attempt
- Regular voice: Immediate disconnect
- No automatic reconnection
- User must manually rejoin

**Track Ended:**
- Logged to console
- No automatic recovery
- Connection remains but no audio

**Peer Disconnects:**
- Server emits `voice:user_left`
- `removeConnection(socketId)` called
- Full cleanup for that peer

### Classification

**Voice reliability state:** WebRTC peer-to-peer, ICE restart for DM calls only, full resource cleanup implemented (Phase 1 fix), no automatic reconnection for regular voice.

**Cleanup adoption:** 100% (all resources properly cleaned up)

**System state:** Stable, baseline established.

---

## ITEM 5: MEMORY LEAKS VERIFICATION

**Status:** ✅ Complete  
**Date:** 2026-05-22

### Event Listener Lifecycle

**Total DOM event listeners: 170 addEventListener calls**

**Managed listeners (with cleanup):**
- **rooms.js:** 100% managed (33 listeners)
  - Storage: `roomListeners` object with named functions
  - Registration: `registerRoomListeners()` with `_registered` flag
  - Cleanup: `destroyRoomListeners()` - symmetric removal
  - Lifecycle: Called on `enterRoomMode()` / `exitRoomMode()`
  - Pattern: Named functions stored, removed via `removeEventListener()`

**Unmanaged listeners (no cleanup):**
- **chat.js:** Dynamic message rendering (67+ listeners)
  - `renderMessages()`: Adds contextmenu + click listeners to all messages
  - `appendMessage()`: Adds contextmenu + click listeners per message
  - `updateTempMessageInDOM()`: Adds click listeners to action buttons
  - Issue: Listeners added on every render, never removed
  - Accumulation: On channel switch, old messages remain in DOM with listeners
  
- **ui.js:** Global document/window listeners (8 listeners)
  - `document.addEventListener('click')` - context menu close (line 468)
  - `document.addEventListener('keydown')` - Escape handler (line 479)
  - `document.addEventListener('click')` - popover close (line 1007)
  - Never removed, persist entire session

- **auth.js:** Global listeners (2 listeners)
  - `window.addEventListener('message')` - Google OAuth (line 140)
  - `document.addEventListener('keydown')` - Enter handler (line 389)
  - Never removed, persist entire session

- **voice.js:** Temporary audio resume listeners (2 per peer)
  - `document.addEventListener('click', resumeAudio)` (line 477)
  - `document.addEventListener('keydown', resumeAudio)` (line 478)
  - Removed after first interaction via `removeEventListener()`
  - Pattern: Self-cleaning, no leak

- **app.js, settings.js, servers.js, profile.js, founder.js, emojis.js, search.js, pinned.js, roles.js, formatting.js, starfield.js:**
  - Multiple `DOMContentLoaded` listeners (once: true or never removed)
  - Global click/keydown handlers
  - No cleanup on logout

**Listener Accumulation Pattern:**
- **chat.js message listeners:** Accumulate on every `renderMessages()` call
- **Detached DOM nodes:** Old message elements may remain in memory with listeners
- **Channel switching:** No cleanup of previous channel's message listeners

### Interval/Timeout Lifecycle

**Total intervals/timeouts: 85 occurrences**

**Properly managed intervals:**
- **voice.js:**
  - `speakingCheckInterval` - Cleared in `cleanup()` (line 150)
  - `remoteAudioStatsIntervals` - Map of intervals, all cleared in `cleanup()` (line 145)
  - Pattern: Tracked in class properties, cleaned on `leaveChannel()`

- **auth.js:**
  - `resendTimer` - Cleared before new timer (line 86)
  - `resetResendTimer` - Cleared before new timer (line 111)
  - Pattern: Single global variable, cleared before reassignment

- **chat.js:**
  - `typingDebounce` - Cleared before new timeout (line 872, 946, 967)
  - Pattern: Single global variable, cleared before reassignment

- **search.js:**
  - `searchTimeout` - Cleared before new timeout (line 244, 263)
  - Pattern: Single global variable, cleared before reassignment

- **voice-messages.js:**
  - `recordingInterval` - Cleared on stop/cancel (line 97, 116)
  - Pattern: Local variable, cleaned on completion

**Unmanaged intervals:**
- **founder.js:**
  - `statsInterval` - Created in `startStatsUpdate()` (line 233)
  - Cleanup: `stopStatsUpdate()` exists (line 243)
  - Issue: `stopStatsUpdate()` NOT called on logout
  - Leak: Interval continues after logout, attempts to emit on null socket

- **main.js (Electron):**
  - Auto-update check interval (line 572)
  - Never cleared, runs entire app lifetime
  - Acceptable: Main process interval, not renderer leak

**Timeout patterns:**
- Most timeouts are one-shot (animations, delays)
- No cleanup needed for completed timeouts
- Debounce timeouts properly cleared before reassignment

### DOM References and Detached Nodes

**Dynamic DOM creation patterns:**

**Modal overlays:**
- **founder.js:** `founder-logs-modal-overlay` (line 255-309)
  - Created: `document.createElement('div')`
  - Cleanup: `overlay.remove()` on close
  - Pattern: Proper cleanup, no leak

- **ui.js:** Context menus (line 1717, 1756)
  - Created: Dynamic context menu generation
  - Cleanup: `menu.remove()` on close
  - Pattern: Proper cleanup, no leak

- **app.js:** User context menu (line 996, 1027)
  - Created: Dynamic menu generation
  - Cleanup: `menu.remove()` on close
  - Pattern: Proper cleanup, no leak

**Message rendering:**
- **chat.js:** `renderMessages()` (line 64)
  - Pattern: `list.innerHTML = html` - replaces entire content
  - Issue: Old elements with listeners discarded, listeners not explicitly removed
  - Browser behavior: Modern browsers clean up listeners on element removal
  - Risk: Low (browser handles cleanup), but not explicit

**Emoji picker:**
- **chat.js:** `toggleEmojiPickerForReaction()` (line 1361-1379)
  - Pattern: Adds listener, removes after use (line 1373)
  - Issue: Adds new listener without removing previous
  - Accumulation: Multiple calls add multiple listeners
  - Cleanup: Only removes current handler, previous handlers remain

**Notification elements:**
- **ui.js:** `showNotification()` (line 92-125)
  - Created: `document.createElement('div')`
  - Cleanup: `notif.remove()` after timeout (line 125)
  - Pattern: Proper cleanup, no leak

### WebRTC PeerConnection Cleanup

**VoiceManager cleanup (voice.js):**

**Full cleanup on `leaveChannel()` / `cleanup()`:**
1. **Screen stream:** All tracks stopped, stream set to null (line 111-114)
2. **Local stream:** All tracks stopped, stream set to null (line 118-121)
3. **Peer connections:** All closed, Map cleared (line 124-127)
4. **Audio elements:** Listeners removed, srcObject nulled, elements removed (line 130-143)
5. **Audio listeners Map:** Cleared (line 143)
6. **Stats intervals:** All cleared, Map cleared (line 145-146)
7. **Speaking interval:** Cleared (line 149-152)
8. **AudioContext:** Closed (line 154-157)
9. **State flags:** Reset (line 159-162)

**Per-peer cleanup on `removeConnection(socketId)`:**
1. **Peer connection:** Closed, removed from Map (line 488-491)
2. **Audio element:** Listeners removed, srcObject nulled, removed from DOM (line 493-507)
3. **Stats interval:** Cleared, removed from Map (line 509-513)
4. **Screen share video:** Hidden (line 516)

**Cleanup completeness:** 100%
- All resources explicitly cleaned
- No orphaned connections
- No orphaned intervals
- No orphaned DOM elements
- Pattern: Symmetric create/destroy

### Audio/Video Stream Cleanup

**MediaStream lifecycle:**

**Local audio stream:**
- Created: `navigator.mediaDevices.getUserMedia()` (line 57)
- Cleanup: All tracks stopped via `track.stop()` (line 119)
- Set to null: Yes (line 120)
- Pattern: Complete cleanup

**Screen share stream:**
- Created: `navigator.mediaDevices.getDisplayMedia()` (line 601)
- Cleanup: All tracks stopped via `track.stop()` (line 112)
- Set to null: Yes (line 113)
- Pattern: Complete cleanup

**Remote audio streams:**
- Received: `pc.ontrack` event (line 333)
- Attached: `audio.srcObject = stream` (line 449)
- Cleanup: `audio.srcObject = null` before removal (line 504)
- Pattern: Complete cleanup

**Audio element lifecycle:**
- Created: `new Audio()` (line 417)
- Listeners: 3 per element (playing, pause, error) - stored in Map (line 426-437)
- Cleanup: Listeners removed via `removeEventListener()` (line 498-500)
- Removal: `audio.remove()` from DOM (line 505)
- Pattern: Complete cleanup, no leaks

**AudioContext lifecycle:**
- Created: For speaking detection (line 729)
- Cleanup: `audioContext.close()` (line 155)
- Set to null: Yes (line 156)
- Pattern: Complete cleanup

### Socket Listener Accumulation

**Managed socket listeners (socket.js):**

**Lifecycle system:**
- Storage: `socketListeners` Map with 4 scopes (global, context, voice, call)
- Registration: `attachListener(scope, eventName, handler)` (line 38-58)
- Deregistration: `detachListener(scope, eventName)` (line 66-76)
- Scope cleanup: `detachScope(scope)` (line 83-100)
- Full cleanup: `detachAllListeners()` (line 106-123)

**Managed listeners (38 total):**
- Global scope: 11 listeners (connect, disconnect, user:status, friends, founder, error)
- Context scope: 10 listeners (message:*, typing:*, dm:*, notification:*)
- Voice scope: 12 listeners (voice:*, webrtc:*, screen:*)
- Call scope: 4 listeners (call:*)

**Reconnect behavior:**
- On reconnect: `detachAllListeners()` → `attachAllSocketListeners()` (line 164-165)
- Pattern: Full cleanup before reattach, prevents duplication
- Logging: "[socket-lifecycle] Reconnect detected - reinitializing listeners"

**Unmanaged socket listeners (15 total):**

**profile.js (5 listeners):**
- `socket.on('profile:data')` (line 203)
- `socket.on('profile:update_success')` (line 208)
- `socket.on('profile:updated')` (line 224)
- `socket.on('user:blocked')` (line 232)
- `socket.on('user:unblocked')` (line 237)
- Registration: On file load (immediate execution)
- Cleanup: None
- Issue: Never removed, accumulate on reconnect

**roles.js (5 listeners):**
- `socket.on('role:created')` (line 682)
- `socket.on('role:updated')` (line 702)
- `socket.on('role:deleted')` (line 740)
- `socket.on('role:assigned')` (line 760)
- `socket.on('role:removed')` (line 793)
- Registration: On file load (immediate execution)
- Cleanup: None
- Issue: Never removed, accumulate on reconnect

**pinned.js (3 listeners):**
- `socket.on('message:pinned')` (line 278)
- `socket.on('message:unpinned')` (line 289)
- `socket.on('message:pinned_list')` (line 300)
- Registration: On file load (immediate execution)
- Cleanup: None
- Issue: Never removed, accumulate on reconnect

**search.js (1 listener):**
- `socket.on('message:search_results')` (line 227)
- Registration: On file load (immediate execution)
- Cleanup: None
- Issue: Never removed, accumulate on reconnect

**socket.js (1 internal):**
- Used by `attachListener()` function itself
- Managed by lifecycle system

**Accumulation pattern:**
- Unmanaged listeners registered on file load
- On reconnect: `detachAllListeners()` only removes managed listeners
- Unmanaged listeners remain attached
- New unmanaged listeners added on reconnect (if files re-execute)
- Result: Potential duplication of 15 listeners per reconnect

### Cleanup Completeness Verification

**Disconnect scenario:**
- Trigger: Network drop, server restart
- Socket cleanup: `detachAllListeners()` called (line 596)
- Managed listeners: Removed (38 listeners)
- Unmanaged listeners: NOT removed (15 listeners remain)
- Voice cleanup: NOT called automatically
- Intervals: `typingTimeout` cleared in socket.js (line 682, 691)
- Result: Partial cleanup

**Reconnect scenario:**
- Trigger: Socket.io auto-reconnect (5 attempts)
- Socket cleanup: `detachAllListeners()` → `attachAllSocketListeners()` (line 164-165)
- Managed listeners: Removed and re-added (no duplication)
- Unmanaged listeners: NOT removed (accumulate if re-registered)
- Voice cleanup: NOT called (voice connection lost, no cleanup)
- Result: Managed listeners OK, unmanaged listeners accumulate

**Logout scenario:**

**auth.js `handleLogout()` (line 369-381):**
1. `AuthAPI.logout()` - Server-side logout
2. `localStorage.removeItem('token')`
3. `localStorage.removeItem('user')`
4. `window.currentUser = null`
5. `disconnectSocket()` - Calls `detachAllListeners()` + `socket.disconnect()`
6. `closeModal('settings-modal')`
7. Show auth screen

**ui.js `deleteLoginLogRecord()` (line 2127-2138):**
1. `clearAuthToken()` - Remove from secure storage
2. `localStorage.removeItem('user')`
3. `window.currentUser = null`
4. `disconnectSocket()` - Calls `detachAllListeners()` + `socket.disconnect()`
5. `closeModal('settings-modal')`
6. Show auth screen

**Missing cleanup on logout:**
- Voice system: `voiceManager.cleanup()` NOT called
- Founder stats: `founderSystem.stopStatsUpdate()` NOT called
- Room listeners: `destroyRoomListeners()` NOT called
- Global DOM listeners: NOT removed (auth.js, ui.js, app.js)
- Unmanaged socket listeners: NOT removed (profile, roles, pinned, search)
- Intervals: `founder.statsInterval` continues running
- Result: Incomplete cleanup, resources leak

**401 error scenario (token expiration):**
- Trigger: API request returns 401
- Cleanup: `clearAuthToken()` + `localStorage.removeItem('user')`
- Socket: `disconnectSocket()` NOT called in api.js (line 153-156, 213-216)
- Voice: NOT cleaned
- Intervals: NOT cleared
- Result: Incomplete cleanup, socket remains connected

### Memory Leak Classification

**HIGH RISK (confirmed leaks):**

1. **Unmanaged socket listeners (15 listeners)**
   - Location: profile.js, roles.js, pinned.js, search.js
   - Trigger: Reconnect
   - Impact: 15 duplicate listeners per reconnect
   - Accumulation: Linear growth with reconnect count
   - Severity: High (functional impact after multiple reconnects)

2. **Founder stats interval**
   - Location: founder.js `statsInterval`
   - Trigger: Logout without `stopStatsUpdate()`
   - Impact: Interval continues, attempts socket.emit on null socket
   - Accumulation: One interval per session
   - Severity: Medium (console errors, wasted CPU)

3. **Chat message listeners**
   - Location: chat.js `renderMessages()`, `appendMessage()`
   - Trigger: Channel switch, message updates
   - Impact: Listeners accumulate on message elements
   - Accumulation: Growth with message count and channel switches
   - Severity: Medium (browser cleans up on element removal, but not explicit)

4. **Emoji picker listeners**
   - Location: chat.js `toggleEmojiPickerForReaction()`
   - Trigger: Multiple reaction picker opens
   - Impact: Multiple `emoji-click` listeners accumulate
   - Accumulation: Linear growth with picker usage
   - Severity: Low (only one picker element, limited accumulation)

**MEDIUM RISK (potential leaks):**

5. **Voice resources on 401 logout**
   - Location: api.js 401 handler
   - Trigger: Token expiration
   - Impact: Voice streams, peer connections, intervals not cleaned
   - Accumulation: One set of resources per session
   - Severity: Medium (only if in voice when 401 occurs)

6. **Room listeners on logout**
   - Location: rooms.js `destroyRoomListeners()` not called
   - Trigger: Logout while in room mode
   - Impact: 33 DOM listeners remain attached
   - Accumulation: One set per session
   - Severity: Low (only if in room mode, page reload clears)

**LOW RISK (acceptable patterns):**

7. **Global DOM listeners**
   - Location: auth.js, ui.js, app.js, settings.js, etc.
   - Trigger: Never removed
   - Impact: Persist entire session
   - Accumulation: None (registered once)
   - Severity: Low (intentional global handlers, no accumulation)

8. **DOMContentLoaded listeners**
   - Location: Multiple files
   - Trigger: Page load
   - Impact: Execute once, remain attached
   - Accumulation: None (fire once)
   - Severity: None (standard pattern, no leak)

### Classification

**Memory leak state:** 4 confirmed leaks (high risk), 2 potential leaks (medium risk), 2 acceptable patterns (low risk).

**Cleanup adoption:** 
- WebRTC/Voice: 100% (complete cleanup)
- Socket managed listeners: 100% (complete cleanup on reconnect)
- Socket unmanaged listeners: 0% (no cleanup, accumulate on reconnect)
- DOM event listeners: 19% (33/170 managed with cleanup)
- Intervals: 90% (founder.statsInterval not cleaned on logout)

**System state:** Stable, leaks identified and documented, no critical breaking issues.

---

## SUMMARY

**Phase 2 Progress:** 5/5 items complete ✅

**Key Findings:**

**Event System (Item 1):**
- 53 total socket listeners: 38 managed (72%), 15 unmanaged (28%)
- Unmanaged listeners in profile.js, roles.js, pinned.js, search.js
- Managed listeners use lifecycle system with scope-based cleanup
- Duplication risk on reconnect for unmanaged listeners

**Session Stability (Item 2):**
- Dual token system: main auth token (long-lived) + socket token (5min TTL)
- No automatic refresh for main auth token
- Socket token refreshed on every reconnect attempt
- 401 error triggers hard logout with no warning

**Reconnect Handling (Item 3):**
- Socket auto-reconnect: 5 attempts, 1s delay, silent (no UI feedback)
- Server warmup: 12 attempts, 8s timeout, UI feedback on startup only
- Listener cleanup on reconnect: managed listeners OK, unmanaged accumulate
- No runtime reconnection UI for users

**Voice Reliability (Item 4):**
- WebRTC peer-to-peer with ICE restart for DM calls only
- Full resource cleanup implemented (Phase 1 fix verified)
- 100% cleanup adoption: streams, connections, intervals, audio elements
- No automatic reconnection for regular voice channels

**Memory Leaks (Item 5):**
- **4 confirmed leaks (HIGH RISK):**
  - Unmanaged socket listeners accumulate on reconnect (15 listeners)
  - Founder stats interval not cleared on logout
  - Chat message listeners accumulate on channel switch
  - Emoji picker listeners accumulate on repeated use
- **2 potential leaks (MEDIUM RISK):**
  - Voice resources not cleaned on 401 logout
  - Room listeners not cleaned on logout
- **Cleanup adoption:**
  - WebRTC/Voice: 100%
  - Socket managed listeners: 100%
  - Socket unmanaged listeners: 0%
  - DOM event listeners: 19% (33/170)
  - Intervals: 90%

**System State:** Stable, all audits complete, memory leaks identified and documented, no critical breaking issues found.

---

## PHASE 2: FINAL ARCHITECTURE SUMMARY

**Assessment Date:** 2026-05-22  
**System:** Love Desktop Chat App  
**Architecture Review:** UX Stability & Resource Management

### Global Architecture Health

**Event System Architecture:**
- **Pattern:** Dual lifecycle model (72% managed, 28% unmanaged)
- **Strength:** Scope-based lifecycle system with explicit cleanup for managed listeners
- **Weakness:** 15 socket listeners outside lifecycle control, accumulate on reconnect
- **State:** Functional with architectural inconsistency

**Session Management Architecture:**
- **Pattern:** Dual token system (long-lived auth + short-lived socket)
- **Strength:** Socket token auto-refresh on reconnect, secure storage in Electron
- **Weakness:** No auto-refresh for main token, hard logout on expiration
- **State:** Functional but constrained, no graceful degradation

**Reconnection Architecture:**
- **Pattern:** Silent auto-reconnect (5 attempts, 1s delay)
- **Strength:** Automatic token refresh, listener reinitialization on reconnect
- **Weakness:** No UI feedback during runtime reconnection, no recovery after 5 failures
- **State:** Functional but invisible to users

**Voice System Architecture:**
- **Pattern:** WebRTC peer-to-peer with full resource lifecycle management
- **Strength:** 100% cleanup adoption, symmetric create/destroy, no resource leaks
- **Weakness:** No automatic reconnection for regular voice channels
- **State:** Architecturally sound, complete resource management

**Memory Management Architecture:**
- **Pattern:** Mixed cleanup discipline (100% WebRTC, 19% DOM listeners, 0% unmanaged sockets)
- **Strength:** Voice system exemplifies proper resource lifecycle
- **Weakness:** Inconsistent cleanup patterns across subsystems
- **State:** Stable with confirmed leaks in non-critical paths

### Critical Risk Areas

**1. Socket Listener Accumulation (HIGH IMPACT)**
- **Risk:** 15 unmanaged listeners duplicate on every reconnect
- **Trigger:** Network instability, server restarts
- **Impact:** Linear memory growth, potential functional degradation after multiple reconnects
- **Blast Radius:** profile.js, roles.js, pinned.js, search.js
- **Mitigation:** System remains functional, browser limits prevent catastrophic failure

**2. Session Expiration Without Warning (HIGH IMPACT)**
- **Risk:** Main auth token expires without user notification
- **Trigger:** Token TTL expiration (server-controlled)
- **Impact:** Hard logout, loss of unsaved state, poor UX
- **Blast Radius:** All authenticated operations
- **Mitigation:** None (architectural limitation)

**3. Invisible Reconnection State (MEDIUM IMPACT)**
- **Risk:** Users unaware of connection loss/recovery
- **Trigger:** Network drops, server restarts
- **Impact:** Confusion during silent reconnection, no feedback on failure
- **Blast Radius:** All real-time features (messages, voice, notifications)
- **Mitigation:** Console logging only (not user-facing)

### System Stability Assessment

**Overall Classification:** STABLE WITH KNOWN LEAKS

**Stability Indicators:**
- No critical breaking issues identified
- All subsystems functional under normal operation
- Resource leaks contained to non-critical paths
- Voice system demonstrates architectural maturity

**Degradation Scenarios:**
- **Reconnect cycles:** Memory growth from unmanaged listeners (gradual)
- **Extended sessions:** Founder interval leak (minor CPU waste)
- **Channel switching:** Message listener accumulation (browser-mitigated)
- **Token expiration:** Hard logout (functional but poor UX)

**Resilience Assessment:**
- **Network instability:** Partial (5 reconnect attempts, then manual recovery)
- **Server restarts:** Partial (auto-reconnect works, but listener leaks)
- **Resource exhaustion:** Low risk (leaks are gradual, not catastrophic)
- **Session continuity:** Low (no token refresh, hard logout on expiration)

### Lifecycle Consistency Summary

**Consistent Lifecycle Patterns (Exemplary):**
- **Voice system (voice.js):** 100% cleanup, symmetric create/destroy, tracked resources
- **Room UI (rooms.js):** 100% cleanup, named functions, registration flag
- **Managed socket listeners (socket.js):** 100% cleanup, scope-based, reconnect-safe

**Inconsistent Lifecycle Patterns (Problematic):**
- **Unmanaged socket listeners:** 0% cleanup, scattered registration, reconnect-unsafe
- **Chat message listeners:** Implicit cleanup (browser-dependent), not explicit
- **Global DOM listeners:** Intentionally persistent, but no logout cleanup
- **Founder stats interval:** Cleanup function exists but not called

**Lifecycle Maturity Score:**
- WebRTC/Voice: 10/10 (complete)
- Socket managed: 10/10 (complete)
- Socket unmanaged: 0/10 (absent)
- DOM listeners: 2/10 (minimal)
- Intervals: 9/10 (one exception)
- **Overall: 6.2/10** (mixed discipline)

### Main Architectural Weaknesses

**1. Lifecycle Discipline Inconsistency**
- **Issue:** Two competing patterns (managed vs unmanaged) for socket listeners
- **Root Cause:** Incremental feature additions without architectural enforcement
- **Impact:** 28% of socket listeners outside lifecycle control
- **Consequence:** Memory leaks on reconnect, maintenance burden

**2. Cleanup Orchestration Absence**
- **Issue:** No centralized cleanup coordinator on logout/401
- **Root Cause:** Distributed cleanup responsibility across modules
- **Impact:** Voice, founder stats, room listeners not cleaned on logout
- **Consequence:** Resource leaks persist across session boundaries

**3. Silent Failure Modes**
- **Issue:** No user-facing feedback for reconnection state or failures
- **Root Cause:** Console-only logging, no UI state management
- **Impact:** Users unaware of connection issues until functionality breaks
- **Consequence:** Poor UX, confusion, support burden

**4. Token Lifecycle Rigidity**
- **Issue:** No automatic refresh for main auth token
- **Root Cause:** Security-first design without graceful degradation
- **Impact:** Hard logout on token expiration, no warning
- **Consequence:** Loss of unsaved state, poor UX

**5. DOM Listener Proliferation**
- **Issue:** 170 addEventListener calls, only 19% with explicit cleanup
- **Root Cause:** Dynamic rendering without listener lifecycle management
- **Impact:** Accumulation on channel switches, reliance on browser cleanup
- **Consequence:** Implicit memory management, potential leaks in older browsers

---

## FINAL ASSESSMENT

**System Maturity:** Production-ready with known technical debt

**Architectural Strengths:**
- Voice system demonstrates best-in-class resource management
- Managed socket listeners show proper lifecycle discipline
- Dual token system provides security with operational flexibility
- No critical breaking issues under normal operation

**Architectural Debt:**
- Lifecycle inconsistency across subsystems (managed vs unmanaged patterns)
- Missing cleanup orchestration on session boundaries
- Silent failure modes without user feedback
- DOM listener proliferation without explicit cleanup

**Recommended Posture:**
- System is stable for production use
- Memory leaks are gradual, not catastrophic
- Monitoring recommended for long-running sessions with frequent reconnects
- Architectural consolidation needed for long-term maintainability

**Phase 2 Status:** ✅ COMPLETE

---

**End of Phase 2 Audit Document**
