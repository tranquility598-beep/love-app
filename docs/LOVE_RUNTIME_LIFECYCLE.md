PROJECT: LOVE (Electron realtime communication app)



CURRENT PHASE: STABILITY PHASE



CORE PROBLEM:

\- event listeners leak memory

\- socket listeners duplicate on reconnect

\- DOM listeners accumulate on navigation

\- no lifecycle ownership system



━━━━━━━━━━━━━━━━━━━━━━

GLOBAL RULES

━━━━━━━━━━━━━━━━━━━━━━



1\. Every listener MUST belong to a lifecycle scope

2\. Every scope MUST have mount/unmount

3\. socket.on MUST ALWAYS have paired socket.off

4\. addEventListener MUST ALWAYS have removeEventListener

5\. reconnect = FULL socket cleanup before rebind

6\. context switch = full unmount old context before mount new

7\. no global listeners without owner scope



━━━━━━━━━━━━━━━━━━━━━━

SCOPES

━━━━━━━━━━━━━━━━━━━━━━



APP\_SCOPE

SOCKET\_SCOPE

CONTEXT\_SCOPE (server/channel/dm)

ROOM\_SCOPE (voice/screen share)

VOICE\_PEER\_SCOPE (per user in voice)

UI\_ELEMENT\_SCOPE (dynamic DOM elements)

SETTINGS\_SCOPE



━━━━━━━━━━━━━━━━━━━━━━

LIFECYCLE RULES

━━━━━━━━━━━━━━━━━━━━━━



APP\_SCOPE:

\- global IPC listeners

\- keyboard shortcuts

\- window events

UNMOUNT only on app close or logout



SOCKET\_SCOPE:

\- global realtime events

\- must clean all listeners on reconnect and logout



CONTEXT\_SCOPE:

\- message events

\- typing events

\- reactions

\- must unmount on navigation switch



ROOM\_SCOPE:

\- voice events

\- WebRTC events

\- DOM controls for voice UI

\- full cleanup on leave room



VOICE\_PEER\_SCOPE:

\- RTCPeerConnection

\- audio element + listeners

\- must cleanup on peer leave



UI\_ELEMENT\_SCOPE:

\- modal listeners

\- message listeners

\- context menu listeners

\- must cleanup before DOM remove



SETTINGS\_SCOPE:

\- devicechange listener

\- form listeners

\- must cleanup on close settings



━━━━━━━━━━━━━━━━━━━━━━

CRITICAL CLEANUP RULES

━━━━━━━━━━━━━━━━━━━━━━



\- socket.on ALWAYS paired with socket.off

\- addEventListener ALWAYS paired with removeEventListener

\- peerConnection ALWAYS closed on unmount

\- audio elements ALWAYS removed on unmount

\- no listener survives scope death



━━━━━━━━━━━━━━━━━━━━━━

RECONNECT LOGIC

━━━━━━━━━━━━━━━━━━━━━━



disconnect:

\- do NOT unmount

\- show reconnect UI



reconnect:

\- FULL socket.off cleanup

\- rebind all socket listeners

\- restore active context



failed reconnect:

\- full app unmount

\- redirect to login



━━━━━━━━━━━━━━━━━━━━━━

FORBIDDEN PATTERNS

━━━━━━━━━━━━━━━━━━━━━━



\- socket.on outside SOCKET\_SCOPE

\- DOM listeners outside UI\_ELEMENT\_SCOPE

\- reconnect without cleanup

\- global listeners without lifecycle owner

