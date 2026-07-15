# LOVE — voice fixes (apply on current `main`)

This pack is for Claude Code: apply the patches against the latest committed repository, then run the project checks. Do not copy the `.patch` files as source files.

## Why this is split

The desktop failure shown in the console is **not signalling**: `getUserMedia` fails with `OverconstrainedError` before the desktop joins a voice channel. The server also has a genuine multi-device / stale socket issue. Mobile server voice currently only renders presence and emits `voice:join`; it does not yet contain a Flutter WebRTC peer controller, so a full bidirectional implementation still has to be added after the fixes in this pack.

## Apply order

1. Apply `server/socket/socketHandler.js.patch`.
2. In the desktop file that contains `async function joinChannel` and the reported `voice.js:195`, apply the `getUserMedia` replacement from `desktop/voice-get-user-media.patch`.
3. In mobile, replace the current optimistic `voice:join` handling with an acknowledgement-aware join (snippet in `mobile/channel-voice-panel.patch`).
4. Implement `VoiceChannelController` with `flutter_webrtc` before claiming that server-channel audio works on Android. The exact integration contract is below.

## Server acceptance criteria

- A person logged in on PC and Android stays `online` while either socket is connected.
- A DM call emits `call:incoming` to **both** sessions by using `io.to('user:<id>')`.
- A stale socket disconnect does not mark the account offline or remove a replacement voice session.
- WebRTC packets are only relayed if both sockets are members of the same voice room.
- A rejoining socket receives fresh `voice:existing_members` with the current socket IDs.

## Mobile WebRTC contract (required next)

Add `flutter_webrtc` in `mobile/pubspec.yaml`, then create one application-scoped `VoiceChannelController` (not per screen) that:

- calls `navigator.mediaDevices.getUserMedia({'audio': true, 'video': false})` after microphone permission;
- maintains `Map<String, RTCPeerConnection>` by remote socket ID;
- on `voice:existing_members`, creates an offer to every existing member;
- on `webrtc:offer`, creates/gets a peer, adds local tracks, sets remote description, creates answer and sends it back;
- queues ICE candidates until a remote description is set;
- reacts to `voice:user_left` / `voice:left` / reconnect by closing peers and streams;
- sends `{channelId, targetSocketId, offer|answer|candidate}` exactly as the server patch expects;
- owns the local stream beyond a screen change, so navigation does not silently leave the voice channel.

Do **not** make both sides create offers on `voice:user_joined`; the entering/rejoining participant is the deterministic offerer via `voice:existing_members`.

## Verification

```bash
# server
node --check server/socket/socketHandler.js

# desktop: verify the selected-mic fallback was installed
rg "Selected microphone is unavailable" -n .

# mobile
cd mobile
flutter pub get
flutter analyze
flutter build apk --debug --dart-define=LOVE_API_BASE_URL=https://api.loveapp.chat
```

Test with two distinct accounts on PC ↔ Android, then test one account logged in on PC + Android while another account calls it. A TURN server is required for reliable audio across restrictive NATs; STUN-only is not production-safe.
