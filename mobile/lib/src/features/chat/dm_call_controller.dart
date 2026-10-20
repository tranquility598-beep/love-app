import 'dart:async';

import '../../core/voice/peer_negotiation.dart';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/audio/love_sounds.dart';
import '../../core/prefs/love_prefs.dart';
import '../../core/network/api_client.dart';
import '../../core/realtime/love_socket.dart';
import '../../core/services/screen_share_manager.dart';
import '../../core/voice/channel_voice_controller.dart';
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
  int _generation = 0;
  final _peerGenerations = <String, int>{};
  bool mediaBusy = false;
  Future<void>? _cleanupTask;
  final remoteMediaModes = <String, String>{};
  final _remoteStreams = <String, MediaStream>{};
  final _remoteTasks = <String, Future<void>>{};
  final _reconnectTimers = <String, Timer>{};
  late final _negotiation = PeerNegotiation(
    channelId: () => (_activeRoomId ?? ''),
    localSocketId: () => socket.socketId,
    createPeer: _createPeerConnection,
    peer: (id) => _peerConnections[id],
    send: (event, data) => socket.emit(event, data),
  );
  bool _current(int generation) =>
      generation == _generation && (!_disposed && _activeRoomId != null);
  Map<String, dynamic> _iceConfiguration = _stunIceConfiguration;

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
  Timer? _connectionTimeout;

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
        return _peerOffline
            ? 'Не в сети · ждём ответа...'
            : 'Ожидание ответа...';
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

  /// Сервер сообщил, что собеседник не в сети: вызов всё равно ждёт 45 с —
  /// вдруг откроет приложение (server/services/callRings.js).
  bool _peerOffline = false;

  void attach() {
    if (_attached) return;
    _attached = true;
    socket.on('call:ringing', _handleCallRinging);
    socket.on('call:incoming', _handleIncomingCall);
    socket.on('call:response', _handleCallResponse);
    socket.on('call:terminated', _handleCallTerminated);
    socket.on('call:error', _handleCallError);
    socket.on('voice:existing_members', _handleExistingMembers);
    socket.on('voice:user_left', _handleUserLeft);
    socket.on('voice:left', _handleVoiceLeft);
    socket.on('voice:media_state', _handleMediaState);
    socket.on('webrtc:offer', _handleOffer);
    socket.on('webrtc:answer', _handleAnswer);
    socket.on('webrtc:ice_candidate', _handleIceCandidate);
  }

  void updateChannelId(String value) {
    if (value.isNotEmpty) channelId = value;
  }

  Future<void> startOutgoing({bool video = false}) async {
    if (!canStart) return;
    if (!socket.isConnected &&
        !await socket.connectAndWait(const Duration(seconds: 6))) {
      _setError(
          'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.');
      return;
    }
    if (!canStart || _disposed) return;
    // Из войса звонить нельзя: микрофон и WebRTC-комната одни, звонок
    // отобрал бы поток, а в канале остался бы «призрак».
    if (ChannelVoiceController.instance.isActive) {
      _setError('Сначала выйдите из войса — оттуда звонить нельзя');
      return;
    }
    _activePeerId = peerId;
    _outgoingVideoRequested = video;
    _peerOffline = false;
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
    phase = DmCallPhase.connecting;
    _safeNotify();
    // Принимаем звонок, находясь в войсе — выходим из канала сами, иначе
    // микрофон уйдёт звонку, а участники продолжат видеть нас в войсе.
    if (ChannelVoiceController.instance.isActive) {
      await ChannelVoiceController.instance.leave();
    }
    if (_disposed ||
        phase != DmCallPhase.connecting ||
        _activePeerId != callerId) {
      return;
    }
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
    final closing = _leaveCall();
    _resetToIdle();
    await closing;
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
    if (mediaBusy || !(!_disposed && _activeRoomId != null)) return;
    final generation = _generation;
    mediaBusy = true;
    _safeNotify();
    try {
      if (cameraOn) {
        await stopVideo();
        return;
      }
      final status = await Permission.camera.request();
      if (!_current(generation)) return;
      if (!status.isGranted) throw StateError('Нет доступа к камере');
      final stream = await navigator.mediaDevices.getUserMedia({
        'audio': false,
        'video': {
          'facingMode': frontCamera ? 'user' : 'environment',
          'width': {'ideal': 1280},
          'height': {'ideal': 720}
        }
      });
      if (!_current(generation)) {
        await _releaseStream(stream);
        return;
      }
      await _startVideo(stream, screen: false);
    } catch (_) {
      if (_current(generation)) {
        errorMessage = 'Не удалось включить камеру. Проверьте разрешение.';
      }
    } finally {
      if (_current(generation)) {
        mediaBusy = false;
        _safeNotify();
      }
    }
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
    if (mediaBusy || !(!_disposed && _activeRoomId != null)) return;
    final generation = _generation;
    mediaBusy = true;
    _safeNotify();
    try {
      if (screenSharing) {
        await stopVideo();
        return;
      }
      final stream = await ScreenShareManager.startScreenShare();
      if (!_current(generation)) {
        await _releaseStream(stream);
        await ScreenShareManager.stopScreenShare();
        return;
      }
      if (stream.getVideoTracks().isEmpty) {
        await _releaseStream(stream);
        await ScreenShareManager.stopScreenShare();
        throw StateError('empty-capture');
      }
      await _startVideo(stream, screen: true);
    } on ScreenShareException catch (error) {
      if (_current(generation)) errorMessage = error.message;
    } catch (_) {
      if (_current(generation)) {
        errorMessage = 'Демонстрация экрана отменена или недоступна';
      }
    } finally {
      if (_current(generation)) {
        mediaBusy = false;
        _safeNotify();
      }
    }
  }

  Future<void> _startVideo(MediaStream stream, {required bool screen}) async {
    final generation = _generation;
    if (_videoStream != null) await stopVideo(silent: true);
    if (!_current(generation)) {
      await _releaseStream(stream);
      return;
    }
    _videoStream = stream;
    final track = stream.getVideoTracks().first;
    track.onEnded = () {
      if (identical(_videoStream, stream)) unawaited(stopVideo());
    };
    if (localRenderer == null) {
      final renderer = RTCVideoRenderer();
      await renderer.initialize();
      if (!_current(generation)) {
        await renderer.dispose();
        return;
      }
      localRenderer = renderer;
    }
    localRenderer!.srcObject = stream;
    for (final pc in _peerConnections.values.toList()) {
      if (!_current(generation)) return;
      try {
        await pc.addTrack(track, stream);
      } catch (_) {}
    }
    if (!_current(generation)) return;
    cameraOn = !screen;
    screenSharing = screen;
    _emitMediaState(screen ? 'screen' : 'camera');
    _safeNotify();
    await _renegotiateAll();
  }

  Future<void> stopVideo({bool silent = false}) async {
    final generation = _generation,
        stream = _videoStream,
        wasScreen = screenSharing;
    _videoStream = null;
    localRenderer?.srcObject = null;
    cameraOn = false;
    screenSharing = false;
    if (stream != null) {
      _emitMediaState('none', previousMode: wasScreen ? 'screen' : 'camera');
    }
    _safeNotify();
    final ids = stream?.getVideoTracks().map((t) => t.id).toSet() ?? <String>{};
    for (final pc in _peerConnections.values.toList()) {
      try {
        for (final sender in await pc.getSenders()) {
          if (ids.contains(sender.track?.id)) await pc.removeTrack(sender);
        }
      } catch (_) {}
    }
    await _releaseStream(stream);
    if (wasScreen) await ScreenShareManager.stopScreenShare();
    if (!silent && _current(generation) && stream != null) {
      await _renegotiateAll();
    }
  }

  Future<void> _renegotiateAll() async {
    await Future.wait(_peerConnections.keys.toList().map(_negotiation.offer));
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

  void _handleCallRinging(dynamic data) {
    if (phase != DmCallPhase.outgoing || data is! Map) return;
    if (data['online'] == false) {
      _peerOffline = true;
      _safeNotify();
    }
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

  // Единственный надёжный признак того, что собеседник выключил камеру или
  // демонстрацию: onRemoveTrack в unified-plan не приходит, трек лишь уходит в
  // muted, и на телефоне оставался застывший кадр.
  void _handleMediaState(dynamic data) {
    if (data is! Map ||
        _activeRoomId == null ||
        asId(data['channelId']) != _activeRoomId) {
      return;
    }
    final id = asText(data['socketId']);
    if (id.isEmpty || id == socket.socketId) return;
    final mode = asText(data['mode']);
    remoteMediaModes[id] = mode;
    remoteVideo[id] = mode == 'camera' || mode == 'screen';
    _safeNotify();
  }

  void _handleOffer(dynamic data) {
    unawaited(_handleOfferAsync(data));
  }

  Future<void> _handleOfferAsync(dynamic data) async {
    final room = (_activeRoomId ?? '');
    if (room.isEmpty || data is! Map || asId(data['channelId']) != room) return;
    final id = asText(data['fromSocketId']);
    if (id.isEmpty || id == socket.socketId) return;
    await _negotiation.receiveOffer(id, _sessionDescription(data['offer']));
  }

  void _handleAnswer(dynamic data) {
    unawaited(_handleAnswerAsync(data));
  }

  Future<void> _handleAnswerAsync(dynamic data) async {
    final room = (_activeRoomId ?? '');
    if (room.isEmpty || data is! Map || asId(data['channelId']) != room) return;
    final id = asText(data['fromSocketId']);
    if (id.isEmpty || id == socket.socketId) return;
    await _negotiation.receiveAnswer(id, _sessionDescription(data['answer']));
  }

  void _handleIceCandidate(dynamic data) {
    unawaited(_handleIceCandidateAsync(data));
  }

  Future<void> _handleIceCandidateAsync(dynamic data) async {
    final room = (_activeRoomId ?? '');
    if (room.isEmpty || data is! Map || asId(data['channelId']) != room) return;
    final id = asText(data['fromSocketId']);
    if (id.isEmpty || id == socket.socketId) return;
    await _negotiation.candidate(id, _iceCandidate(data['candidate']));
  }

  Future<void> _joinCall(String roomId) async {
    await _cleanupTask;
    if (_activeRoomId == roomId && phase == DmCallPhase.connecting) return;
    if (_disposed ||
        phase != DmCallPhase.connecting && phase != DmCallPhase.outgoing) {
      return;
    }
    final generation = ++_generation;
    _activeRoomId = roomId;
    _iceConfiguration = _stunIceConfiguration;
    try {
      phase = DmCallPhase.connecting;
      errorMessage = null;
      _safeNotify();
      unawaited(_refreshIceConfiguration());
      await _ensureLocalStream();
      if (!_current(generation)) return;
      try {
        // Динамик всегда включён — отдельной кнопки больше нет.
        await Helper.setSpeakerphoneOn(true);
      } catch (_) {
        // Часть сборок Android не даёт менять аудио-маршрут — не критично.
      }
      if (!_current(generation)) return;
      final response = await socket.emitWithAck(
        'voice:join',
        {'channelId': roomId},
        timeout: const Duration(seconds: 15),
      );
      if (!_current(generation)) {
        if ((_activeRoomId ?? '') != roomId) {
          socket.emit('voice:leave', {'channelId': roomId});
        }
        return;
      }
      if (response['status'] != 'ok') {
        throw StateError(
            asText(response['message'], 'Сервер не подтвердил вход в звонок'));
      }
      _startConnectionTimeout();
    } on TimeoutException {
      if (!_current(generation)) return;
      await _leaveCall();
      _setError('Время ожидания подтверждения звонка истекло');
    } on StateError catch (error) {
      if (!_current(generation)) return;
      await _leaveCall();
      final message = error.message.toString();
      _setError(message == 'microphone-denied'
          ? 'Нет доступа к микрофону'
          : asText(message, 'Не удалось подключиться к звонку'));
    } catch (_) {
      if (!_current(generation)) return;
      await _leaveCall();
      _setError('Не удалось подключиться к звонку');
    }
  }

  Future<void> _refreshIceConfiguration() async {
    final generation = _generation;
    try {
      final response = await ApiClient().get('/webrtc/ice-config');
      final servers = response['iceServers'];
      if (!_current(generation) || servers is! List || servers.isEmpty) return;
      _iceConfiguration = {'iceServers': servers};
      for (final entry in _peerConnections.entries.toList()) {
        if (!_current(generation)) return;
        try {
          await entry.value.setConfiguration(_iceConfiguration);
        } catch (_) {}
        if (_current(generation)) {
          unawaited(_negotiation.offer(entry.key, iceRestart: true));
        }
      }
    } catch (_) {}
  }

  void _startConnectionTimeout() {
    _connectionTimeout?.cancel();
    _connectionTimeout = Timer(const Duration(seconds: 30), () {
      if (_disposed || phase != DmCallPhase.connecting) return;
      unawaited(_leaveCall());
      _setError('Не удалось соединиться. Попробуйте ещё раз.');
    });
  }

  void _cancelConnectionTimeout() {
    _connectionTimeout?.cancel();
    _connectionTimeout = null;
  }

  Future<void> _ensureLocalStream() async {
    if (_localStream != null) return;
    final generation = _generation;
    final status = await Permission.microphone.request();
    if (!_current(generation)) throw StateError('stale-call');
    if (!status.isGranted) {
      throw StateError('microphone-denied');
    }
    final stream = await navigator.mediaDevices.getUserMedia({
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
    if (!_current(generation)) {
      await _releaseStream(stream);
      throw StateError('stale-call');
    }
    _localStream = stream;
  }

  Future<void> _initiateConnection(String socketId) =>
      _negotiation.offer(socketId);

  Future<RTCPeerConnection> _createPeerConnection(String socketId) async {
    final existing = _peerConnections[socketId];
    if (existing != null) return existing;
    final peerGeneration = _peerGenerations[socketId] ?? 0;
    final generation = _generation, room = (_activeRoomId ?? '');
    final pc = await createPeerConnection(_iceConfiguration);
    if ((_peerGenerations[socketId] ?? 0) != peerGeneration ||
        !_current(generation) ||
        (_activeRoomId ?? '') != room) {
      await pc.close();
      await pc.dispose();
      throw StateError('stale-peer');
    }
    _peerConnections[socketId] = pc;
    bool current() =>
        _current(generation) && identical(_peerConnections[socketId], pc);
    _negotiation.bind(socketId, pc);
    pc.onIceCandidate = (candidate) {
      if (!current() || candidate.candidate?.isNotEmpty != true) return;
      socket.emit('webrtc:ice_candidate', {
        'targetSocketId': socketId,
        'candidate': candidate.toMap(),
        'channelId': room
      });
    };
    pc.onTrack = (event) {
      if (!current()) return;
      final track = event.track;
      final volume = (LovePrefs.instance.getInt(K.outputVolume, 100) / 100)
          .clamp(0.0, 1.0);
      if (track.kind == 'audio') {
        // Звук собеседника Android/iOS воспроизводят сами — здесь только
        // громкость. В рендерер звук класть не нужно.
        unawaited(Helper.setVolume(volume, track).catchError((Object _) {}));
        return;
      }
      if (track.kind != 'video') return;
      final mode = remoteMediaModes[socketId];
      remoteVideo[socketId] =
          mode == null || mode == 'camera' || mode == 'screen';
      final previous = _remoteTasks[socketId] ?? Future<void>.value();
      final task = previous.catchError((Object _) {}).then((_) async {
        if (!current()) return;
        // Раньше все дорожки собеседника складывались в один «свой» поток, а
        // старую видеодорожку из него удаляли. На Android removeTrack снимает
        // только ЛОКАЛЬНЫЕ дорожки: на чужой он падал, ошибка глоталась, и
        // новая видеодорожка (повторная камера, камера → демонстрация) так и
        // не попадала в рендерер — собеседник видел застывший кадр или пусто.
        // Теперь рендерер просто берёт поток самой дорожки.
        MediaStream stream;
        if (event.streams.isNotEmpty) {
          stream = event.streams.first;
        } else {
          stream =
              await createLocalMediaStream('love-remote-$socketId-${track.id}');
          if (!current()) {
            await stream.dispose();
            return;
          }
          await stream.addTrack(track);
        }
        if (!current()) return;
        var renderer = _remoteRenderers[socketId];
        if (renderer == null) {
          renderer = RTCVideoRenderer();
          await renderer.initialize();
          if (!current()) {
            await renderer.dispose();
            return;
          }
          _remoteRenderers[socketId] = renderer;
        }
        renderer.srcObject = stream;
        final replaced = _remoteStreams[socketId];
        _remoteStreams[socketId] = stream;
        // Свои временные потоки (love-remote-…) освобождаем; потоки
        // соединения освободит само соединение.
        if (replaced != null &&
            !identical(replaced, stream) &&
            replaced.id.startsWith('love-remote-')) {
          await replaced.dispose();
        }
        if (current()) _safeNotify();
      }).catchError((Object _) {});
      _remoteTasks[socketId] = task;
      _safeNotify();
    };
    pc.onRemoveTrack = (stream, track) {
      if (current() && track.kind == 'video') {
        remoteVideo[socketId] = false;
        _safeNotify();
      }
    };
    pc.onConnectionState = (state) {
      if (!current()) return;
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        _reconnectTimers.remove(socketId)?.cancel();
        _cancelConnectionTimeout();
        phase = DmCallPhase.connected;
        connectedAt ??= DateTime.now();
        errorMessage = null;
        _safeNotify();
      } else if (state ==
              RTCPeerConnectionState.RTCPeerConnectionStateDisconnected ||
          state == RTCPeerConnectionState.RTCPeerConnectionStateFailed) {
        _reconnectTimers.putIfAbsent(
            socketId,
            () => Timer(const Duration(seconds: 6), () {
                  _reconnectTimers.remove(socketId);
                  if (current() &&
                      pc.connectionState !=
                          RTCPeerConnectionState
                              .RTCPeerConnectionStateConnected) {
                    unawaited(_negotiation.offer(socketId, iceRestart: true));
                  }
                }));
      } else if (state == RTCPeerConnectionState.RTCPeerConnectionStateClosed) {
        unawaited(_removeConnection(socketId));
      }
    };
    final audio = _localStream, video = _videoStream;
    if (audio != null) {
      for (final track in audio.getAudioTracks()) {
        if (!current()) throw StateError('stale-peer');
        await pc.addTrack(track, audio);
      }
    }
    if (video != null) {
      for (final track in video.getVideoTracks()) {
        if (!current()) throw StateError('stale-peer');
        await pc.addTrack(track, video);
      }
    }
    return pc;
  }

  Future<void> _removeConnection(String socketId) async {
    _peerGenerations[socketId] = (_peerGenerations[socketId] ?? 0) + 1;
    _negotiation.remove(socketId);
    _reconnectTimers.remove(socketId)?.cancel();
    final pc = _peerConnections.remove(socketId);
    final renderer = _remoteRenderers.remove(socketId);
    final stream = _remoteStreams.remove(socketId);
    final task = _remoteTasks.remove(socketId);
    remoteVideo.remove(socketId);
    remoteMediaModes.remove(socketId);
    _safeNotify();
    await task;
    renderer?.srcObject = null;
    try {
      await pc?.close();
      await pc?.dispose();
    } catch (_) {}
    try {
      await renderer?.dispose();
      await stream?.dispose();
    } catch (_) {}
  }

  Future<void> _leaveCall() async {
    final roomId = _activeRoomId;
    if (roomId != null) {
      socket.emit('voice:leave', {'channelId': roomId});
    }
    await _cleanupMedia();
  }

  Future<void> _cleanupMedia() {
    final pending = _cleanupTask;
    if (pending != null) return pending;
    ++_generation;
    _peerGenerations.clear();
    _negotiation.reset();
    _activeRoomId = null;
    _cancelConnectionTimeout();
    final pcs = _peerConnections.values.toList();
    _peerConnections.clear();
    final renderers = _remoteRenderers.values.toList();
    _remoteRenderers.clear();
    final streams = _remoteStreams.values.toList();
    _remoteStreams.clear();
    final tasks = _remoteTasks.values.toList();
    _remoteTasks.clear();
    for (final timer in _reconnectTimers.values) {
      timer.cancel();
    }
    _reconnectTimers.clear();
    remoteVideo.clear();
    remoteMediaModes.clear();
    final audio = _localStream, video = _videoStream, wasScreen = screenSharing;
    _localStream = null;
    _videoStream = null;
    localRenderer?.srcObject = null;
    cameraOn = false;
    screenSharing = false;
    mediaBusy = false;
    muted = false;
    connectedAt = null;
    _safeNotify();
    final task = () async {
      await Future.wait(tasks);
      for (final pc in pcs) {
        try {
          await pc.close();
          await pc.dispose();
        } catch (_) {}
      }
      for (final renderer in renderers) {
        renderer.srcObject = null;
        try {
          await renderer.dispose();
        } catch (_) {}
      }
      for (final stream in streams) {
        try {
          await stream.dispose();
        } catch (_) {}
      }
      await _releaseStream(audio);
      await _releaseStream(video);
      if (wasScreen) await ScreenShareManager.stopScreenShare();
    }();
    _cleanupTask = task;
    return task.whenComplete(() {
      if (identical(_cleanupTask, task)) _cleanupTask = null;
    });
  }

  Future<void> _releaseStream(MediaStream? stream) async {
    if (stream == null) return;
    for (final track in stream.getTracks()) {
      try {
        await track.stop();
      } catch (_) {}
    }
    try {
      await stream.dispose();
    } catch (_) {}
  }

  void _resetToIdle() {
    _cancelConnectionTimeout();
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
    _cancelConnectionTimeout();
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
    return id.startsWith('dm_call:') ? id : 'dm_call:$id';
  }

  void _safeNotify() {
    _syncRingSound();
    if (!_disposed) notifyListeners();
  }

  /// Входящий — мелодия, исходящий — гудки; любая другая фаза их гасит.
  void _syncRingSound() {
    final sounds = LoveSounds.instance;
    if (!_disposed && phase == DmCallPhase.incoming) {
      unawaited(sounds.startLoop('call_incoming'));
    } else if (!_disposed && phase == DmCallPhase.outgoing) {
      unawaited(sounds.startLoop('call_outgoing'));
    } else {
      unawaited(sounds.stopLoop());
    }
  }

  static const _stunIceConfiguration = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {'urls': 'stun:stun2.l.google.com:19302'},
    ],
  };

  @override
  void dispose() {
    _disposed = true;
    unawaited(LoveSounds.instance.stopLoop());
    if (_attached) {
      socket.off('call:ringing', _handleCallRinging);
      socket.off('call:incoming', _handleIncomingCall);
      socket.off('call:response', _handleCallResponse);
      socket.off('call:terminated', _handleCallTerminated);
      socket.off('call:error', _handleCallError);
      socket.off('voice:existing_members', _handleExistingMembers);
      socket.off('voice:user_left', _handleUserLeft);
      socket.off('voice:left', _handleVoiceLeft);
      socket.off('voice:media_state', _handleMediaState);
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
