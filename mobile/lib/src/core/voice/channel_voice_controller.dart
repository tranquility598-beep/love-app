import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../features/chat/chat_models.dart';
import '../prefs/love_prefs.dart';
import '../realtime/love_socket.dart';
import 'screen_share_service.dart';

/// Фазы голосового подключения к каналу.
enum ChannelVoicePhase { idle, connecting, connected }

/// Общий контроллер войса для голосовых каналов сфер и комнат.
///
/// Singleton: живёт всё время работы приложения, поэтому звук НЕ
/// обрывается при навигации между экранами. Протокол тот же, что на
/// десктопе и в ЛС: `voice:*` + `webrtc:*`.
///
/// Изменения относительно версии из love-voice-rework:
/// - кнопка динамика УБРАНА — звук всегда через громкий динамик;
/// - добавлены камера и демонстрация экрана с renegotiation.
class ChannelVoiceController extends ChangeNotifier {
  ChannelVoiceController._();

  static final ChannelVoiceController instance = ChannelVoiceController._();

  LoveSocket? _socket;
  bool _attached = false;

  ChannelVoicePhase phase = ChannelVoicePhase.idle;
  String channelId = '';
  String channelTitle = '';
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

  /// Актуальный состав канала (обновляется, пока мы подключены).
  final members = <Map<String, dynamic>>[];

  final _peerConnections = <String, RTCPeerConnection>{};
  final _remoteRenderers = <String, RTCVideoRenderer>{};
  final _iceCandidateBuffer = <String, List<RTCIceCandidate>>{};
  MediaStream? _localStream;
  MediaStream? _videoStream;

  bool get isActive => phase != ChannelVoicePhase.idle;
  bool get isConnected => phase == ChannelVoicePhase.connected;

  /// Рендереры участников по socketId (для полноэкранного звонка).
  Map<String, RTCVideoRenderer> get renderers => _remoteRenderers;

  /// Подключить контроллер к сокету. Вызывается один раз из MainShell.
  void init(LoveSocket socket) {
    _socket = socket;
    if (_attached) return;
    _attached = true;
    socket.on('voice:existing_members', _handleExistingMembers);
    socket.on('voice:members_update', _handleMembersUpdate);
    socket.on('voice:user_left', _handleUserLeft);
    socket.on('voice:left', _handleVoiceLeft);
    socket.on('webrtc:offer', _handleOffer);
    socket.on('webrtc:answer', _handleAnswer);
    socket.on('webrtc:ice_candidate', _handleIceCandidate);
  }

  /// Войти в голосовой канал. Если уже в другом канале — сначала выходим.
  Future<bool> join({required String id, required String title}) async {
    final socket = _socket;
    if (socket == null || id.isEmpty) return false;
    if (isActive && channelId == id) return true;
    if (isActive) await leave();

    errorMessage = null;
    if (!socket.isConnected) {
      errorMessage = 'Сокет еще не подключен';
      notifyListeners();
      return false;
    }
    final status = await Permission.microphone.request();
    if (!status.isGranted) {
      errorMessage = 'Нет доступа к микрофону';
      notifyListeners();
      return false;
    }

    phase = ChannelVoicePhase.connecting;
    channelId = id;
    channelTitle = title;
    notifyListeners();

    try {
      await _ensureLocalStream();
    } catch (_) {
      await _abortJoin('Не удалось включить микрофон');
      return false;
    }
    try {
      // Динамик всегда включён — отдельной кнопки больше нет.
      await Helper.setSpeakerphoneOn(true);
    } catch (_) {
      // Некоторые Android-сборки не дают менять аудио-маршрут — не критично.
    }

    final response =
        await socket.emitWithAck('voice:join', {'channelId': id});
    if (response['status'] != 'ok') {
      await _abortJoin(asText(response['message'], 'Не удалось войти в войс'));
      return false;
    }

    phase = ChannelVoicePhase.connected;
    connectedAt = DateTime.now();
    if (muted) {
      socket.emit('voice:toggle_mute', {'channelId': id, 'muted': true});
    }
    notifyListeners();
    return true;
  }

  /// Выйти из голосового канала.
  Future<void> leave() async {
    if (channelId.isNotEmpty) {
      _socket?.emit('voice:leave', {'channelId': channelId});
    }
    await _cleanupMedia();
    _resetToIdle();
  }

  /// Переключить микрофон.
  void toggleMute() {
    muted = !muted;
    final stream = _localStream;
    if (stream != null) {
      for (final track in stream.getAudioTracks()) {
        // track.enabled полностью останавливает отправку аудио.
        // Helper.setMicrophoneMute не используем: на части Android он
        // «залипает» и микрофон не возвращается после включения.
        track.enabled = !muted;
      }
    }
    if (channelId.isNotEmpty) {
      _socket?.emit('voice:toggle_mute', {
        'channelId': channelId,
        'muted': muted,
      });
    }
    notifyListeners();
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
      notifyListeners();
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
      notifyListeners();
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
    notifyListeners();
  }

  Future<void> toggleScreenShare() async {
    if (screenSharing) {
      await stopVideo();
      return;
    }
    // Сначала запускаем системный picker Android. Никакой foreground-service
    // до получения видеотрека: иначе targetSdk 36 убивает процесс.
    MediaStream stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({
        'audio': false,
        'video': {
          'frameRate': 15,
          'width': 1280,
          'height': 720,
        },
      });
    } catch (_) {
      errorMessage = 'Демонстрация экрана отменена или недоступна';
      notifyListeners();
      return;
    }
    if (stream.getVideoTracks().isEmpty) {
      try { await stream.dispose(); } catch (_) {}
      errorMessage = 'Android не передал видеопоток демонстрации';
      notifyListeners();
      return;
    }
    // Сначала действительно запускаем WebRTC-видео. Это важно для выбора
    // «весь экран» И «одно приложение»: токен MediaProjection становится
    // активным только после старта самого видеотрека.
    await _startVideo(stream, screen: true);
    // FGS поднимаем с небольшой задержкой и никогда не обрываем захват,
    // если прошивка временно отклонила foreground-service.
    unawaited(_enableScreenShareBackgroundMode());
  }

  Future<void> _enableScreenShareBackgroundMode() async {
    await Future<void>.delayed(const Duration(milliseconds: 900));
    if (!screenSharing || _videoStream == null) return;
    try {
      await ScreenShareService.start();
    } catch (_) {
      // Видео уже работает. Не выключаем его и не падаем: на некоторых
      // оболочках Android служба может быть разрешена повторной попыткой
      // после возврата приложения на передний план.
    }
  }

  Future<void> _startVideo(MediaStream stream, {required bool screen}) async {
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
        // Пир в процессе переподключения.
      }
    }
    cameraOn = !screen;
    screenSharing = screen;
    notifyListeners();
    await _renegotiateAll();
  }

  /// Выключить камеру/демонстрацию (войс продолжается).
  Future<void> stopVideo({bool silent = false}) async {
    final hadVideo = _videoStream != null;
    final wasScreen = screenSharing;
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
    if (wasScreen) await ScreenShareService.stop();
    if (!silent) {
      notifyListeners();
      if (hadVideo) await _renegotiateAll();
    }
  }

  Future<void> _renegotiateAll() async {
    if (channelId.isEmpty) return;
    for (final entry in _peerConnections.entries.toList()) {
      try {
        final offer = await entry.value.createOffer({
          'offerToReceiveAudio': true,
          'offerToReceiveVideo': true,
        });
        await entry.value.setLocalDescription(offer);
        _socket?.emit('webrtc:offer', {
          'targetSocketId': entry.key,
          'offer': offer.toMap(),
          'channelId': channelId,
        });
      } catch (_) {
        // Пир переподключится штатным путём.
      }
    }
  }

  void dismissError() {
    errorMessage = null;
    notifyListeners();
  }

  // ── Socket handlers ──────────────────────────────────

  void _handleExistingMembers(dynamic data) {
    if (data is! Map || channelId.isEmpty) return;
    if (asId(data['channelId']) != channelId) return;
    _applyMembers(data['members']);
    final list = data['members'];
    if (list is! List) return;
    for (final item in list.whereType<Map>()) {
      final member = item.cast<String, dynamic>();
      final socketId = asText(member['socketId']);
      if (socketId.isNotEmpty) {
        unawaited(_initiateConnection(socketId));
      }
    }
  }

  void _handleMembersUpdate(dynamic data) {
    if (data is! Map || channelId.isEmpty) return;
    if (asId(data['channelId']) != channelId) return;
    _applyMembers(data['members']);
  }

  void _handleUserLeft(dynamic data) {
    if (data is! Map || channelId.isEmpty) return;
    if (asId(data['channelId']) != channelId) return;
    final socketId = asText(data['socketId']);
    if (socketId.isNotEmpty) unawaited(_removeConnection(socketId));
  }

  void _handleVoiceLeft(dynamic data) {
    if (data is! Map || channelId.isEmpty) return;
    if (asId(data['channelId']) != channelId) return;
    // Сервер завершил наше участие (например, вход с другого устройства).
    unawaited(_cleanupMedia());
    _resetToIdle();
  }

  void _applyMembers(Object? raw) {
    if (raw is! List) return;
    members
      ..clear()
      ..addAll(raw.whereType<Map>().map(
            (item) => item.cast<String, dynamic>(),
          ));
    notifyListeners();
  }

  // ── WebRTC mesh (тот же подход, что в DmCallController) ─────

  void _handleOffer(dynamic data) {
    unawaited(_handleOfferAsync(data));
  }

  Future<void> _handleOfferAsync(dynamic data) async {
    if (data is! Map || channelId.isEmpty) return;
    if (asId(data['channelId']) != channelId) return;
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
      // renegotiation (камера/демонстрация) приходит обычным offer.
      pc ??= await _createPeerConnection(fromSocketId);
      await pc.setRemoteDescription(_sessionDescription(raw['offer']));
      await _flushIceCandidates(fromSocketId);
      final answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      _socket?.emit('webrtc:answer', {
        'targetSocketId': fromSocketId,
        'answer': answer.toMap(),
        'channelId': channelId,
      });
    } catch (_) {
      // Не роняем весь войс из-за одного неудачного пира.
    }
  }

  void _handleAnswer(dynamic data) {
    unawaited(_handleAnswerAsync(data));
  }

  Future<void> _handleAnswerAsync(dynamic data) async {
    if (data is! Map || channelId.isEmpty) return;
    if (asId(data['channelId']) != channelId) return;
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
      // Ответ устарел (renegotiation) — пир переподключится сам.
    }
  }

  void _handleIceCandidate(dynamic data) {
    unawaited(_handleIceCandidateAsync(data));
  }

  Future<void> _handleIceCandidateAsync(dynamic data) async {
    if (data is! Map || channelId.isEmpty) return;
    if (asId(data['channelId']) != channelId) return;
    final raw = data.cast<String, dynamic>();
    final fromSocketId = asText(raw['fromSocketId']);
    if (fromSocketId.isEmpty) return;
    final candidate = _iceCandidate(raw['candidate']);
    final pc = _peerConnections[fromSocketId];
    final remoteDescription = await pc?.getRemoteDescription();
    if (pc == null || remoteDescription?.type == null) {
      _iceCandidateBuffer
          .putIfAbsent(fromSocketId, () => [])
          .add(candidate);
      return;
    }
    try {
      await pc.addCandidate(candidate);
    } catch (_) {
      _iceCandidateBuffer
          .putIfAbsent(fromSocketId, () => [])
          .add(candidate);
    }
  }

  Future<void> _ensureLocalStream() async {
    if (_localStream != null) return;
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
    if (muted) {
      for (final track in _localStream!.getAudioTracks()) {
        track.enabled = false;
      }
    }
  }

  Future<void> _initiateConnection(String socketId) async {
    try {
      final pc = await _createPeerConnection(socketId);
      final offer = await pc.createOffer({
        'offerToReceiveAudio': true,
        'offerToReceiveVideo': true,
      });
      await pc.setLocalDescription(offer);
      _socket?.emit('webrtc:offer', {
        'targetSocketId': socketId,
        'offer': offer.toMap(),
        'channelId': channelId,
      });
    } catch (_) {
      // Пир недоступен — остальные соединения продолжают работать.
    }
  }

  Future<RTCPeerConnection> _createPeerConnection(String socketId) async {
    final existing = _peerConnections[socketId];
    if (existing != null &&
        existing.signalingState !=
            RTCSignalingState.RTCSignalingStateClosed) {
      return existing;
    }

    final pc = await createPeerConnection(_iceConfiguration);
    _peerConnections[socketId] = pc;

    pc.onIceCandidate = (candidate) {
      if (candidate.candidate == null || candidate.candidate!.isEmpty) return;
      _socket?.emit('webrtc:ice_candidate', {
        'targetSocketId': socketId,
        'candidate': candidate.toMap(),
        'channelId': channelId,
      });
    };

    pc.onTrack = (event) {
      if (event.streams.isEmpty) return;
      if (event.track.kind == 'video') {
        remoteVideo[socketId] = true;
      }
      unawaited(_attachRemoteStream(socketId, event.streams.first));
      notifyListeners();
    };

    pc.onRemoveTrack = (stream, track) {
      if (track.kind == 'video') {
        remoteVideo[socketId] = false;
        notifyListeners();
      }
    };

    pc.onConnectionState = (state) {
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateFailed ||
          state ==
              RTCPeerConnectionState.RTCPeerConnectionStateDisconnected ||
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
        // Кандидат устарел во время renegotiation — пропускаем.
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

  Future<void> _abortJoin(String message) async {
    await _cleanupMedia();
    phase = ChannelVoicePhase.idle;
    channelId = '';
    channelTitle = '';
    connectedAt = null;
    members.clear();
    errorMessage = message;
    notifyListeners();
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
  }

  void _resetToIdle() {
    phase = ChannelVoicePhase.idle;
    channelId = '';
    channelTitle = '';
    connectedAt = null;
    muted = false;
    members.clear();
    notifyListeners();
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

  static const _iceConfiguration = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {'urls': 'stun:stun2.l.google.com:19302'},
    ],
  };
}
