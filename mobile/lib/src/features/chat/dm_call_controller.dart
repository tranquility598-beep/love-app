import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/realtime/love_socket.dart';
import '../../core/prefs/love_prefs.dart';
import 'chat_models.dart';

enum DmCallPhase {
  idle,
  outgoing,
  incoming,
  connecting,
  connected,
  error,
}

class DmCallController extends ChangeNotifier {
  DmCallController({
    required this.socket,
    required this.conversationId,
    required this.channelId,
    required this.peerId,
    required this.peerName,
    required this.peerAvatar,
  });

  final LoveSocket socket;
  final String conversationId;
  String channelId;
  final String peerId;
  final String peerName;
  final String peerAvatar;

  DmCallPhase phase = DmCallPhase.idle;
  bool muted = false;
  bool speakerOn = true;
  String? errorMessage;

  /// Called when an incoming call was missed (not answered before remote hung up).
  void Function(String peerName)? onMissedCall;

  final _peerConnections = <String, RTCPeerConnection>{};
  final _remoteRenderers = <String, RTCVideoRenderer>{};
  final _iceCandidateBuffer = <String, List<RTCIceCandidate>>{};

  MediaStream? _localStream;
  String? _activeRoomId;
  String? _activePeerId;
  String? _incomingConversationId;
  String? _incomingChannelId;
  String? _incomingPeerName;
  bool _attached = false;
  bool _disposed = false;

  bool get isVisible => phase != DmCallPhase.idle;
  bool get canStart => phase == DmCallPhase.idle && peerId.isNotEmpty;

  String get displayName => _incomingPeerName ?? peerName;

  String get statusText {
    switch (phase) {
      case DmCallPhase.outgoing:
        return 'Ожидание ответа...';
      case DmCallPhase.incoming:
        return 'Входящий звонок';
      case DmCallPhase.connecting:
        return 'Подключение к звонку...';
      case DmCallPhase.connected:
        return 'Звонок идет';
      case DmCallPhase.error:
        return errorMessage ?? 'Звонок не удался';
      case DmCallPhase.idle:
        return '';
    }
  }

  void attach() {
    if (_attached) return;
    _attached = true;
    socket.on('call:incoming', _handleIncomingCall);
    socket.on('call:response', _handleCallResponse);
    socket.on('call:terminated', _handleCallTerminated);
    socket.on('call:error', _handleCallError);
    socket.on('voice:existing_members', _handleExistingMembers);
    socket.on('voice:user_left', _handleUserLeft);
    socket.on('voice:left', _handleVoiceLeft);
    socket.on('webrtc:offer', _handleOffer);
    socket.on('webrtc:answer', _handleAnswer);
    socket.on('webrtc:ice_candidate', _handleIceCandidate);
  }

  void updateChannelId(String value) {
    if (value.isNotEmpty) channelId = value;
  }

  Future<void> startOutgoing() async {
    if (!canStart) return;
    if (!socket.isConnected) {
      _setError('Сокет еще не подключен');
      return;
    }
    _activePeerId = peerId;
    phase = DmCallPhase.outgoing;
    errorMessage = null;
    _safeNotify();
    socket.emit('call:request', {'targetUserId': peerId});
  }

  Future<void> acceptIncoming() async {
    if (phase != DmCallPhase.incoming || _activePeerId == null) return;
    final callerId = _activePeerId!;
    socket.emit('call:response', {
      'callerId': callerId,
      'accepted': true,
      'conversationId': _incomingConversationId ?? conversationId,
      'channelId': _incomingChannelId ?? channelId,
    });
    await _joinCall(
      _roomId(
        _incomingConversationId ?? conversationId,
        _incomingChannelId ?? channelId,
        callerId,
      ),
    );
  }

  void declineIncoming() {
    if (phase != DmCallPhase.incoming || _activePeerId == null) return;
    socket.emit('call:response', {
      'callerId': _activePeerId,
      'accepted': false,
      'conversationId': _incomingConversationId ?? conversationId,
      'channelId': _incomingChannelId ?? channelId,
    });
    _resetToIdle();
  }

  /// Accepts an incoming call event from CallCenter when the chat screen
  /// is not open and the controller hasn't been created yet.
  void adoptIncoming({
    required String callerId,
    required String conversationId,
    required String channelId,
    required String callerName,
  }) {
    if (phase != DmCallPhase.idle) return;
    _activePeerId = callerId;
    _incomingConversationId =
        conversationId.isNotEmpty ? conversationId : null;
    _incomingChannelId = channelId.isNotEmpty ? channelId : null;
    _incomingPeerName = callerName.isNotEmpty ? callerName : null;
    phase = DmCallPhase.incoming;
    errorMessage = null;
    _safeNotify();
  }

  Future<void> endCall() async {
    final targetId = _activePeerId ?? peerId;
    if (targetId.isNotEmpty && phase != DmCallPhase.idle) {
      socket.emit('call:end', {'targetUserId': targetId});
    }
    await _leaveCall();
    _resetToIdle();
  }

  Future<void> toggleMute() async {
    final next = !muted;
    final stream = _localStream;
    if (stream != null) {
      for (final track in stream.getAudioTracks()) {
        // track.enabled полностью останавливает отправку аудио.
        // Helper.setMicrophoneMute убран: на части Android он «залипает»
        // и микрофон не возвращается после включения.
        track.enabled = !next;
      }
    }
    muted = next;
    final roomId = _activeRoomId;
    if (roomId != null) {
      socket.emit('voice:toggle_mute', {
        'channelId': roomId,
        'muted': muted,
      });
    }
    _safeNotify();
  }

  Future<void> toggleSpeaker() async {
    final next = !speakerOn;
    try {
      await Helper.setSpeakerphoneOn(next);
    } catch (_) {
      // Some Android builds reject audio route changes; keep the call alive.
    }
    speakerOn = next;
    _safeNotify();
  }

  void dismissError() {
    if (phase == DmCallPhase.error) _resetToIdle();
  }

  void _handleIncomingCall(dynamic data) {
    if (data is! Map) return;
    final raw = data.cast<String, dynamic>();
    final from = raw['from'] is Map
        ? (raw['from'] as Map).cast<String, dynamic>()
        : <String, dynamic>{};
    final callerId = asId(from['_id']);
    final incomingConversationId = asId(raw['conversationId']);
    if (callerId != peerId && incomingConversationId != conversationId) {
      return;
    }
    if (phase != DmCallPhase.idle) {
      socket.emit('call:response', {
        'callerId': callerId,
        'accepted': false,
        'conversationId': incomingConversationId,
        'channelId': asId(raw['channelId']),
      });
      return;
    }
    _activePeerId = callerId;
    _incomingConversationId = incomingConversationId;
    _incomingChannelId = asId(raw['channelId']);
    _incomingPeerName = userDisplayName(from);
    phase = DmCallPhase.incoming;
    errorMessage = null;
    _safeNotify();
  }

  void _handleCallResponse(dynamic data) {
    unawaited(_handleCallResponseAsync(data));
  }

  Future<void> _handleCallResponseAsync(dynamic data) async {
    if (phase != DmCallPhase.outgoing || data is! Map) return;
    final raw = data.cast<String, dynamic>();
    final responderId = asId(raw['responderId']);
    if (responderId.isNotEmpty && responderId != peerId) return;
    if (raw['accepted'] != true) {
      await _leaveCall();
      _setError('Вызов отклонен');
      return;
    }
    _activePeerId = responderId.isNotEmpty ? responderId : peerId;
    await _joinCall(
      _roomId(
        asId(raw['conversationId']).isNotEmpty
            ? asId(raw['conversationId'])
            : conversationId,
        asId(raw['channelId']).isNotEmpty ? asId(raw['channelId']) : channelId,
        _activePeerId!,
      ),
    );
  }

  void _handleCallTerminated(dynamic data) {
    if (phase == DmCallPhase.idle) return;
    if (data is Map) {
      final by = asId(data['by']);
      if (by.isNotEmpty && _activePeerId != null && by != _activePeerId) {
        return;
      }
    }
    final missedFrom = phase == DmCallPhase.incoming ? displayName : null;
    unawaited(_leaveCall());
    _resetToIdle();
    if (missedFrom != null) onMissedCall?.call(missedFrom);
  }

  void _handleCallError(dynamic data) {
    final message = data is Map ? asText(data['message']) : '';
    if (phase != DmCallPhase.idle) {
      unawaited(_leaveCall());
      _setError(message.isEmpty ? 'Звонок не удался' : message);
    }
  }

  void _handleExistingMembers(dynamic data) {
    if (data is! Map || asId(data['channelId']) != _activeRoomId) return;
    final members = data['members'];
    if (members is! List) return;
    for (final item in members.whereType<Map>()) {
      final member = item.cast<String, dynamic>();
      final socketId = asText(member['socketId']);
      if (socketId.isNotEmpty) {
        unawaited(_initiateConnection(socketId));
      }
    }
  }

  void _handleUserLeft(dynamic data) {
    if (data is! Map || asId(data['channelId']) != _activeRoomId) return;
    final socketId = asText(data['socketId']);
    if (socketId.isNotEmpty) unawaited(_removeConnection(socketId));
  }

  void _handleVoiceLeft(dynamic data) {
    if (data is! Map || asId(data['channelId']) != _activeRoomId) return;
    unawaited(_cleanupMedia());
    _resetToIdle();
  }

  void _handleOffer(dynamic data) {
    unawaited(_handleOfferAsync(data));
  }

  Future<void> _handleOfferAsync(dynamic data) async {
    if (data is! Map || asId(data['channelId']) != _activeRoomId) return;
    final raw = data.cast<String, dynamic>();
    final fromSocketId = asText(raw['fromSocketId']);
    if (fromSocketId.isEmpty) return;
    try {
      final pc = await _createPeerConnection(fromSocketId);
      if (pc.signalingState != RTCSignalingState.RTCSignalingStateStable) {
        await _removeConnection(fromSocketId);
      }
      final activePc = await _createPeerConnection(fromSocketId);
      await activePc.setRemoteDescription(_sessionDescription(raw['offer']));
      await _flushIceCandidates(fromSocketId);
      final answer = await activePc.createAnswer();
      await activePc.setLocalDescription(answer);
      socket.emit('webrtc:answer', {
        'targetSocketId': fromSocketId,
        'answer': answer.toMap(),
        'channelId': _activeRoomId,
      });
    } catch (error) {
      _setError('Не удалось принять WebRTC offer');
    }
  }

  void _handleAnswer(dynamic data) {
    unawaited(_handleAnswerAsync(data));
  }

  Future<void> _handleAnswerAsync(dynamic data) async {
    if (data is! Map || asId(data['channelId']) != _activeRoomId) return;
    final raw = data.cast<String, dynamic>();
    final fromSocketId = asText(raw['fromSocketId']);
    final pc = _peerConnections[fromSocketId];
    if (pc == null) return;
    if (pc.signalingState !=
        RTCSignalingState.RTCSignalingStateHaveLocalOffer) {
      return;
    }
    try {
      await pc.setRemoteDescription(_sessionDescription(raw['answer']));
      await _flushIceCandidates(fromSocketId);
    } catch (_) {
      _setError('Не удалось подключить ответ звонка');
    }
  }

  void _handleIceCandidate(dynamic data) {
    unawaited(_handleIceCandidateAsync(data));
  }

  Future<void> _handleIceCandidateAsync(dynamic data) async {
    if (data is! Map || asId(data['channelId']) != _activeRoomId) return;
    final raw = data.cast<String, dynamic>();
    final fromSocketId = asText(raw['fromSocketId']);
    if (fromSocketId.isEmpty) return;
    final candidate = _iceCandidate(raw['candidate']);
    final pc = _peerConnections[fromSocketId];
    final remoteDescription = await pc?.getRemoteDescription();
    if (pc == null || remoteDescription?.type == null) {
      _iceCandidateBuffer
          .putIfAbsent(fromSocketId, () => <RTCIceCandidate>[])
          .add(candidate);
      return;
    }
    try {
      await pc.addCandidate(candidate);
    } catch (_) {
      _iceCandidateBuffer
          .putIfAbsent(fromSocketId, () => <RTCIceCandidate>[])
          .add(candidate);
    }
  }

  Future<void> _joinCall(String roomId) async {
    try {
      phase = DmCallPhase.connecting;
      errorMessage = null;
      _safeNotify();
      await _ensureLocalStream();
      _activeRoomId = roomId;
      await Helper.setSpeakerphoneOn(speakerOn);
      socket.emit('voice:join', {'channelId': roomId});
    } catch (error) {
      await _leaveCall();
      _setError('Нет доступа к микрофону');
    }
  }

  Future<void> _ensureLocalStream() async {
    if (_localStream != null) return;
    final status = await Permission.microphone.request();
    if (!status.isGranted) {
      throw StateError('microphone-denied');
    }
    _localStream = await navigator.mediaDevices.getUserMedia({
      'audio': {
        'echoCancellation':
            LovePrefs.instance.getBool(K.echoCancellation, true),
        'noiseSuppression':
            LovePrefs.instance.getBool(K.noiseSuppression, true),
        'autoGainControl': true,
        'channelCount': 1,
      },
      'video': false,
    });
  }

  Future<void> _initiateConnection(String socketId) async {
    try {
      final pc = await _createPeerConnection(socketId);
      final offer = await pc.createOffer({
        'offerToReceiveAudio': true,
        'offerToReceiveVideo': false,
      });
      await pc.setLocalDescription(offer);
      socket.emit('webrtc:offer', {
        'targetSocketId': socketId,
        'offer': offer.toMap(),
        'channelId': _activeRoomId,
      });
    } catch (_) {
      _setError('Не удалось начать WebRTC соединение');
    }
  }

  Future<RTCPeerConnection> _createPeerConnection(String socketId) async {
    final existing = _peerConnections[socketId];
    if (existing != null &&
        existing.signalingState != RTCSignalingState.RTCSignalingStateClosed) {
      return existing;
    }

    final pc = await createPeerConnection(_iceConfiguration);
    _peerConnections[socketId] = pc;

    pc.onIceCandidate = (candidate) {
      if (candidate.candidate == null || candidate.candidate!.isEmpty) return;
      socket.emit('webrtc:ice_candidate', {
        'targetSocketId': socketId,
        'candidate': candidate.toMap(),
        'channelId': _activeRoomId,
      });
    };

    pc.onTrack = (event) {
      if (event.streams.isEmpty || event.track.kind != 'audio') return;
      unawaited(_attachRemoteStream(socketId, event.streams.first));
    };

    pc.onConnectionState = (state) {
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        phase = DmCallPhase.connected;
        errorMessage = null;
        _safeNotify();
      }
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
          state == RTCPeerConnectionState.RTCPeerConnectionStateDisconnected ||
          state == RTCPeerConnectionState.RTCPeerConnectionStateClosed) {
        unawaited(_removeConnection(socketId));
      }
    };

    final stream = _localStream;
    if (stream != null) {
      for (final track in stream.getAudioTracks()) {
        await pc.addTrack(track, stream);
      }
    }
    return pc;
  }

  Future<void> _attachRemoteStream(String socketId, MediaStream stream) async {
    var renderer = _remoteRenderers[socketId];
    if (renderer == null) {
      renderer = RTCVideoRenderer();
      await renderer.initialize();
      _remoteRenderers[socketId] = renderer;
    }
    renderer.srcObject = stream;
    await renderer.setVolume(1);
  }

  Future<void> _flushIceCandidates(String socketId) async {
    final candidates = _iceCandidateBuffer.remove(socketId);
    final pc = _peerConnections[socketId];
    if (pc == null || candidates == null) return;
    for (final candidate in candidates) {
      try {
        await pc.addCandidate(candidate);
      } catch (_) {
        // Candidate became stale during renegotiation; ignore it.
      }
    }
  }

  Future<void> _removeConnection(String socketId) async {
    final pc = _peerConnections.remove(socketId);
    await pc?.close();
    await pc?.dispose();
    final renderer = _remoteRenderers.remove(socketId);
    renderer?.srcObject = null;
    await renderer?.dispose();
    _iceCandidateBuffer.remove(socketId);
  }

  Future<void> _leaveCall() async {
    final roomId = _activeRoomId;
    if (roomId != null) {
      socket.emit('voice:leave', {'channelId': roomId});
    }
    await _cleanupMedia();
  }

  Future<void> _cleanupMedia() async {
    for (final socketId in _peerConnections.keys.toList()) {
      await _removeConnection(socketId);
    }
    for (final renderer in _remoteRenderers.values) {
      renderer.srcObject = null;
      await renderer.dispose();
    }
    _remoteRenderers.clear();
    _iceCandidateBuffer.clear();
    final stream = _localStream;
    if (stream != null) {
      for (final track in stream.getTracks()) {
        await track.stop();
      }
      await stream.dispose();
    }
    _localStream = null;
    _activeRoomId = null;
    muted = false;
  }

  void _resetToIdle() {
    phase = DmCallPhase.idle;
    errorMessage = null;
    _activePeerId = null;
    _incomingConversationId = null;
    _incomingChannelId = null;
    _incomingPeerName = null;
    _safeNotify();
  }

  void _setError(String message) {
    phase = DmCallPhase.error;
    errorMessage = message;
    _safeNotify();
  }

  RTCSessionDescription _sessionDescription(Object? raw) {
    final map = raw is Map ? raw.cast<String, dynamic>() : <String, dynamic>{};
    return RTCSessionDescription(asText(map['sdp']), asText(map['type']));
  }

  RTCIceCandidate _iceCandidate(Object? raw) {
    final map = raw is Map ? raw.cast<String, dynamic>() : <String, dynamic>{};
    final lineIndex = map['sdpMLineIndex'];
    return RTCIceCandidate(
      asText(map['candidate']),
      asText(map['sdpMid']),
      lineIndex is int ? lineIndex : int.tryParse(asText(lineIndex)),
    );
  }

  String _roomId(String conversation, String channel, String fallbackPeer) {
    final id = conversation.isNotEmpty
        ? conversation
        : channel.isNotEmpty
            ? channel
            : fallbackPeer;
    return 'dm_call:$id';
  }

  void _safeNotify() {
    if (!_disposed) notifyListeners();
  }

  static const _iceConfiguration = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {'urls': 'stun:stun2.l.google.com:19302'},
      {
        'urls': 'turn:87.199.197.158:3478',
        'username': 'loveturn',
        'credential': 'Lv2026Turn_Xk9q',
      },
      {
        'urls': 'turn:87.199.197.158:3478?transport=tcp',
        'username': 'loveturn',
        'credential': 'Lv2026Turn_Xk9q',
      },
      {
        'urls': 'turn:free.expressturn.com:3478',
        'username': '000000002095347409',
        'credential': 'W1fE2z8UXd7ookqQdKtFKpC9cnA=',
      },
      {
        'urls': 'turn:free.expressturn.com:3478?transport=tcp',
        'username': '000000002095347409',
        'credential': 'W1fE2z8UXd7ookqQdKtFKpC9cnA=',
      },
      {
        'urls': 'turns:free.expressturn.com:443?transport=tcp',
        'username': '000000002095347409',
        'credential': 'W1fE2z8UXd7ookqQdKtFKpC9cnA=',
      },
    ],
  };

  @override
  void dispose() {
    _disposed = true;
    if (_attached) {
      socket.off('call:incoming', _handleIncomingCall);
      socket.off('call:response', _handleCallResponse);
      socket.off('call:terminated', _handleCallTerminated);
      socket.off('call:error', _handleCallError);
      socket.off('voice:existing_members', _handleExistingMembers);
      socket.off('voice:user_left', _handleUserLeft);
      socket.off('voice:left', _handleVoiceLeft);
      socket.off('webrtc:offer', _handleOffer);
      socket.off('webrtc:answer', _handleAnswer);
      socket.off('webrtc:ice_candidate', _handleIceCandidate);
    }
    final targetId = _activePeerId ?? peerId;
    if (phase != DmCallPhase.idle && targetId.isNotEmpty) {
      socket.emit('call:end', {'targetUserId': targetId});
    }
    final roomId = _activeRoomId;
    if (roomId != null) {
      socket.emit('voice:leave', {'channelId': roomId});
    }
    unawaited(_cleanupMedia());
    super.dispose();
  }
}
