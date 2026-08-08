import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/prefs/love_prefs.dart';
import '../../core/realtime/love_socket.dart';
import '../../core/services/screen_share_manager.dart';
import 'chat_models.dart';

enum DmCallPhase {
  idle,
  outgoing,
  incoming,
  connecting,
  connected,
  error,
}

/// Контроллер звонка в ЛС: аудио + камера + демонстрация экрана.
///
/// Изменения относительно старой версии:
/// - переключение динамика УБРАНО — звук всегда через громкий динамик;
/// - добавлены камера ([toggleCamera], [switchCamera]) и демонстрация
///   экрана ([toggleScreenShare]) с renegotiation по тем же webrtc:*-событиям;
/// - ICE-конфиг очищен до трёх STUN-серверов Google (мусорные записи
///   из старого файла удалены);
/// - [connectedAt] для таймера длительности на полноэкранном звонке.
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
  String? errorMessage;
  DateTime? connectedAt;

  // Видео (камера ИЛИ демонстрация — одновременно только одно).
  bool cameraOn = false;
  bool screenSharing = false;
  bool frontCamera = true;
  RTCVideoRenderer? localRenderer;

  /// Есть ли видео от конкретного пира (ключ — socketId).
  final remoteVideo = <String, bool>{};

  /// Called when an incoming call was missed.
  void Function(String peerName)? onMissedCall;

  final _peerConnections = <String, RTCPeerConnection>{};
  final _remoteRenderers = <String, RTCVideoRenderer>{};
  final _iceCandidateBuffer = <String, List<RTCIceCandidate>>{};

  MediaStream? _localStream;
  MediaStream? _videoStream;
  String? _activeRoomId;
  String? _activePeerId;
  String? _incomingConversationId;
  String? _incomingChannelId;
  String? _incomingPeerName;
  String _incomingKind = 'audio';
  bool _outgoingVideoRequested = false;
  bool _attached = false;
  bool _disposed = false;

  bool get isVisible => phase != DmCallPhase.idle;
  bool get canStart => phase == DmCallPhase.idle && peerId.isNotEmpty;

  String get displayName => _incomingPeerName ?? peerName;

  /// Рендерер собеседника (в ЛС пир один).
  RTCVideoRenderer? get remoteRenderer =>
      _remoteRenderers.isEmpty ? null : _remoteRenderers.values.first;

  /// Собеседник сейчас передаёт видео (камера или экран).
  bool get peerHasVideo => remoteVideo.values.any((value) => value);

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

  Future<void> startOutgoing({bool video = false}) async {
    if (!canStart) return;
    if (!socket.isConnected) {
      _setError('Сокет еще не подключен');
      return;
    }
    _activePeerId = peerId;
    _outgoingVideoRequested = video;
    phase = DmCallPhase.outgoing;
    errorMessage = null;
    _safeNotify();
    socket.emit('call:request', {
      'targetUserId': peerId,
      'kind': video ? 'video' : 'audio',
    });
  }

  Future<void> acceptIncoming() async {
    if (phase != DmCallPhase.incoming || _activePeerId == null) return;
    final callerId = _activePeerId!;
    socket.emit('call:response', {
      'callerId': callerId,
      'accepted': true,
      'conversationId': _incomingConversationId ?? conversationId,
      'channelId': _incomingChannelId ?? channelId,
      'kind': _incomingKind,
    });
    await _joinCall(
      _roomId(
        _incomingConversationId ?? conversationId,
        _incomingChannelId ?? channelId,
        callerId,
      ),
    );
    if (_incomingKind == 'video' && !cameraOn) await toggleCamera();
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
    String kind = 'audio',
  }) {
    if (phase != DmCallPhase.idle) return;
    _activePeerId = callerId;
    _incomingConversationId = conversationId.isNotEmpty ? conversationId : null;
    _incomingChannelId = channelId.isNotEmpty ? channelId : null;
    _incomingPeerName = callerName.isNotEmpty ? callerName : null;
    _incomingKind = kind == 'video' ? 'video' : 'audio';
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
        // Helper.setMicrophoneMute не используем: на части Android он
        // «залипает» и микрофон не возвращается после включения.
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

  // ── Камера и демонстрация экрана ──

  Future<void> toggleCamera() async {
    if (cameraOn) {
      await stopVideo();
      return;
    }
    final status = await Permission.camera.request();
    if (!status.isGranted) {
      errorMessage = 'Нет доступа к камере';
      _safeNotify();
      return;
    }
    MediaStream stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        'audio': false,
        'video': {
          'facingMode': frontCamera ? 'user' : 'environment',
          'width': {'ideal': 1280},
          'height': {'ideal': 720},
        },
      });
    } catch (_) {
      errorMessage = 'Не удалось включить камеру';
      _safeNotify();
      return;
    }
    await _startVideo(stream, screen: false);
  }

  Future<void> switchCamera() async {
    if (!cameraOn) return;
    final tracks = _videoStream?.getVideoTracks();
    if (tracks == null || tracks.isEmpty) return;
    try {
      await Helper.switchCamera(tracks.first);
      frontCamera = !frontCamera;
    } catch (_) {
      // На устройстве одна камера — ничего не меняем.
    }
    _safeNotify();
  }

  Future<void> toggleScreenShare() async {
    if (screenSharing) {
      await stopVideo();
      return;
    }
    MediaStream stream;
    try {
      stream = await ScreenShareManager.startScreenShare();
    } on ScreenShareException catch (e) {
      errorMessage = e.message;
      _safeNotify();
      return;
    } catch (_) {
      errorMessage = 'Демонстрация экрана отменена или недоступна';
      _safeNotify();
      return;
    }
    if (stream.getVideoTracks().isEmpty) {
      try {
        await stream.dispose();
      } catch (_) {}
      await ScreenShareManager.stopScreenShare();
      errorMessage = 'Android не передал видеопоток демонстрации';
      _safeNotify();
      return;
    }
    await _startVideo(stream, screen: true);
  }

  Future<void> _startVideo(MediaStream stream, {required bool screen}) async {
    // Камера и демонстрация взаимоисключающие — гасим предыдущее.
    if (_videoStream != null) {
      await stopVideo(silent: true);
    }
    _videoStream = stream;
    final tracks = stream.getVideoTracks();
    if (tracks.isEmpty) return;
    final track = tracks.first;
    // Пользователь остановил захват из системного UI Android.
    track.onEnded = () => unawaited(stopVideo());
    if (localRenderer == null) {
      final renderer = RTCVideoRenderer();
      await renderer.initialize();
      localRenderer = renderer;
    }
    localRenderer!.srcObject = stream;
    for (final pc in _peerConnections.values) {
      try {
        await pc.addTrack(track, stream);
      } catch (_) {
        // Пир в процессе переподключения — добавим трек при пересоздании.
      }
    }
    cameraOn = !screen;
    screenSharing = screen;
    _emitMediaState(screen ? 'screen' : 'camera');
    _safeNotify();
    await _renegotiateAll();
  }

  /// Выключить камеру/демонстрацию (звонок продолжается).
  Future<void> stopVideo({bool silent = false}) async {
    final hadVideo = _videoStream != null;
    final wasScreen = screenSharing;
    if (hadVideo) {
      _emitMediaState('none', previousMode: wasScreen ? 'screen' : 'camera');
    }
    for (final pc in _peerConnections.values) {
      try {
        final senders = await pc.getSenders();
        for (final sender in senders) {
          if (sender.track?.kind == 'video') {
            await pc.removeTrack(sender);
          }
        }
      } catch (_) {
        // Соединение уже закрывается.
      }
    }
    final stream = _videoStream;
    _videoStream = null;
    if (stream != null) {
      for (final track in stream.getTracks()) {
        try {
          await track.stop();
        } catch (_) {}
      }
      await stream.dispose();
    }
    localRenderer?.srcObject = null;
    cameraOn = false;
    screenSharing = false;
    if (wasScreen) await ScreenShareManager.stopScreenShare();
    if (!silent) {
      _safeNotify();
      if (hadVideo) await _renegotiateAll();
    }
  }

  Future<void> _renegotiateAll() async {
    final roomId = _activeRoomId;
    if (roomId == null) return;
    for (final entry in _peerConnections.entries.toList()) {
      try {
        final offer = await entry.value.createOffer({
          'offerToReceiveAudio': true,
          'offerToReceiveVideo': true,
        });
        await entry.value.setLocalDescription(offer);
        socket.emit('webrtc:offer', {
          'targetSocketId': entry.key,
          'offer': offer.toMap(),
          'channelId': roomId,
        });
      } catch (_) {
        // Пир переподключится штатным путём.
      }
    }
  }

  void _emitMediaState(String mode, {String? previousMode}) {
    final roomId = _activeRoomId;
    if (roomId == null || roomId.isEmpty) return;
    unawaited(_sendMediaState(roomId, mode, previousMode));
  }

  Future<void> _sendMediaState(
    String roomId,
    String mode,
    String? previousMode,
  ) async {
    try {
      final response = await socket.emitWithAck(
        'voice:media_state',
        {'channelId': roomId, 'mode': mode},
        timeout: const Duration(seconds: 3),
      );
      if (response['status'] == 'ok') return;
    } catch (_) {}

    final legacyMode = mode == 'none' ? previousMode : mode;
    if (legacyMode == 'screen') {
      socket.emit(mode == 'none' ? 'screen:stop' : 'screen:start', {
        'channelId': roomId,
      });
    } else if (legacyMode == 'camera') {
      socket.emit(mode == 'none' ? 'camera:stop' : 'camera:start', {
        'channelId': roomId,
      });
    }
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
    _incomingKind = raw['kind'] == 'video' ? 'video' : 'audio';
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
    if (_outgoingVideoRequested && !cameraOn) await toggleCamera();
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
      var pc = _peerConnections[fromSocketId];
      if (pc != null &&
          pc.signalingState ==
              RTCSignalingState.RTCSignalingStateHaveLocalOffer) {
        // Glare: обе стороны отправили offer одновременно —
        // пересоздаём соединение и принимаем чужой.
        await _removeConnection(fromSocketId);
        pc = null;
      }
      // Существующее stable-соединение НЕ пересоздаём:
      // renegotiation (вкл/выкл камеры и демонстрации) приходит
      // обычным offer на том же соединении.
      pc ??= await _createPeerConnection(fromSocketId);
      await pc.setRemoteDescription(_sessionDescription(raw['offer']));
      await _flushIceCandidates(fromSocketId);
      final answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
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
      _iceCandidateBuffer.putIfAbsent(fromSocketId, () => []).add(candidate);
      return;
    }
    try {
      await pc.addCandidate(candidate);
    } catch (_) {
      _iceCandidateBuffer.putIfAbsent(fromSocketId, () => []).add(candidate);
    }
  }

  Future<void> _joinCall(String roomId) async {
    try {
      phase = DmCallPhase.connecting;
      errorMessage = null;
      _safeNotify();
      await _ensureLocalStream();
      _activeRoomId = roomId;
      try {
        // Динамик всегда включён — отдельной кнопки больше нет.
        await Helper.setSpeakerphoneOn(true);
      } catch (_) {
        // Часть сборок Android не даёт менять аудио-маршрут — не критично.
      }
      final response =
          await socket.emitWithAck('voice:join', {'channelId': roomId});
      if (response['status'] != 'ok') {
        throw StateError(
            asText(response['message'], 'Сервер не подтвердил вход в звонок'));
      }
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
        'offerToReceiveVideo': true,
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
      if (event.streams.isEmpty) return;
      if (event.track.kind == 'video') {
        remoteVideo[socketId] = true;
      }
      unawaited(_attachRemoteStream(socketId, event.streams.first));
      _safeNotify();
    };

    pc.onRemoveTrack = (stream, track) {
      if (track.kind == 'video') {
        remoteVideo[socketId] = false;
        _safeNotify();
      }
    };

    pc.onConnectionState = (state) {
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        phase = DmCallPhase.connected;
        connectedAt ??= DateTime.now();
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
    final videoStream = _videoStream;
    if (videoStream != null) {
      for (final track in videoStream.getVideoTracks()) {
        await pc.addTrack(track, videoStream);
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
    remoteVideo.remove(socketId);
  }

  Future<void> _leaveCall() async {
    final roomId = _activeRoomId;
    if (roomId != null) {
      socket.emit('voice:leave', {'channelId': roomId});
    }
    await _cleanupMedia();
  }

  Future<void> _cleanupMedia() async {
    await stopVideo(silent: true);
    for (final socketId in _peerConnections.keys.toList()) {
      await _removeConnection(socketId);
    }
    for (final renderer in _remoteRenderers.values) {
      renderer.srcObject = null;
      await renderer.dispose();
    }
    _remoteRenderers.clear();
    _iceCandidateBuffer.clear();
    remoteVideo.clear();
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
    connectedAt = null;
  }

  void _resetToIdle() {
    phase = DmCallPhase.idle;
    errorMessage = null;
    _activePeerId = null;
    _incomingConversationId = null;
    _incomingChannelId = null;
    _incomingPeerName = null;
    _incomingKind = 'audio';
    _outgoingVideoRequested = false;
    connectedAt = null;
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
    final renderer = localRenderer;
    localRenderer = null;
    if (renderer != null) {
      renderer.srcObject = null;
      unawaited(renderer.dispose());
    }
    super.dispose();
  }
}
