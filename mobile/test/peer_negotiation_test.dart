import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:love_mobile/src/core/voice/peer_negotiation.dart';

/// Поддельное соединение, которое ведёт себя как flutter_webrtc на Android:
/// кэш `signalingState` пуст (null), пока не придёт событие, а настоящее
/// состояние отдаёт только `getSignalingState()`.
class _FakePeer implements RTCPeerConnection {
  RTCSignalingState _native = RTCSignalingState.RTCSignalingStateStable;
  RTCSignalingState? _cached;          // как в RTCPeerConnectionNative
  RTCSessionDescription? _remote;
  final added = <RTCIceCandidate>[];

  @override
  Function(RTCSignalingState state)? onSignalingState;

  void _set(RTCSignalingState s, {bool event = false}) {
    _native = s;
    if (event) {
      _cached = s;
      onSignalingState?.call(s);
    }
  }

  @override
  RTCSignalingState? get signalingState => _cached;

  @override
  Future<RTCSignalingState?> getSignalingState() async => _native;

  @override
  Future<RTCSessionDescription> createOffer([Map<String, dynamic>? c]) async =>
      RTCSessionDescription('v=0 offer', 'offer');

  @override
  Future<RTCSessionDescription> createAnswer([Map<String, dynamic>? c]) async =>
      RTCSessionDescription('v=0 answer', 'answer');

  @override
  Future<void> setLocalDescription(RTCSessionDescription d) async {
    if (d.type == 'offer') _set(RTCSignalingState.RTCSignalingStateHaveLocalOffer);
    if (d.type == 'answer') _set(RTCSignalingState.RTCSignalingStateStable);
    if (d.type == 'rollback') {
      if (_native == RTCSignalingState.RTCSignalingStateStable) {
        throw StateError('rollback в stable');     // как в libwebrtc
      }
      _set(RTCSignalingState.RTCSignalingStateStable);
    }
  }

  @override
  Future<void> setRemoteDescription(RTCSessionDescription d) async {
    _remote = d;
    if (d.type == 'offer') _set(RTCSignalingState.RTCSignalingStateHaveRemoteOffer);
    if (d.type == 'answer') _set(RTCSignalingState.RTCSignalingStateStable);
  }

  @override
  Future<RTCSessionDescription?> getRemoteDescription() async => _remote;

  @override
  Future<void> addCandidate(RTCIceCandidate candidate) async => added.add(candidate);

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

void main() {
  late _FakePeer pc;
  late List<(String, Map<String, dynamic>)> sent;
  late PeerNegotiation n;

  setUp(() {
    pc = _FakePeer();
    sent = [];
    n = PeerNegotiation(
      channelId: () => 'room1',
      localSocketId: () => 'mmm-phone',
      createPeer: (_) async {
        return pc;
      },
      peer: (_) => pc,
      send: (event, payload) => sent.add((event, payload)),
    );
    n.bind('pc-socket', pc);
  });

  test('новое соединение (кэш состояния пуст) отправляет первый offer', () async {
    expect(pc.signalingState, isNull);
    await n.offer('pc-socket');
    expect(sent.map((e) => e.$1), ['webrtc:offer']);
    expect(sent.single.$2['channelId'], 'room1');
  });

  test('после offer ответ ПК применяется', () async {
    await n.offer('pc-socket');
    await n.receiveAnswer('pc-socket', RTCSessionDescription('v=0 answer', 'answer'));
    expect((await pc.getRemoteDescription())?.type, 'answer');
    expect(await pc.getSignalingState(), RTCSignalingState.RTCSignalingStateStable);
  });

  test('на offer ПК телефон отвечает (не принимает его за встречный)', () async {
    // локальный id меньше — телефон «невежливый», но коллизии нет
    await n.receiveOffer('zzz-pc', RTCSessionDescription('v=0 offer', 'offer'));
    expect(sent.map((e) => e.$1), ['webrtc:answer']);
  });

  test('ICE до remote description буферизуется и применяется после', () async {
    await n.candidate('pc-socket', RTCIceCandidate('candidate:1 1 udp 1 1.1.1.1 1 typ host', '0', 0));
    expect(pc.added, isEmpty);
    await n.receiveOffer('pc-socket', RTCSessionDescription('v=0 offer', 'offer'));
    expect(pc.added, hasLength(1));
  });
}
