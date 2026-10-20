import 'dart:async';

import 'peer_negotiation.dart';

import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../features/chat/chat_models.dart';
import '../audio/love_sounds.dart';
import '../calls/call_center.dart';
import '../network/api_client.dart';
import '../prefs/love_prefs.dart';
import '../realtime/love_socket.dart';
import '../services/screen_share_manager.dart';

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
  int _generation = 0;
  final _peerGenerations = <String, int>{};
  bool mediaBusy = false;
  Future<void>? _cleanupTask;
  final remoteMediaModes = <String, String>{};
  final _remoteStreams = <String, MediaStream>{};
  final _remoteTasks = <String, Future<void>>{};
  final _reconnectTimers = <String, Timer>{};
  late final _negotiation = PeerNegotiation(
    channelId: () => channelId,
    localSocketId: () => (_socket?.socketId ?? ''),
    createPeer: _createPeerConnection,
    peer: (id) => _peerConnections[id],
    send: (event, data) => _socket?.emit(event, data),
  );
  bool _current(int generation) => generation == _generation && isActive;
  Map<String, dynamic> _iceConfiguration = _stunIceConfiguration;
  MediaStream? _localStream;
  MediaStream? _videoStream;

  bool get isActive => phase != ChannelVoicePhase.idle;
  bool get isConnected => phase == ChannelVoicePhase.connected;

  /// Рендереры участников по socketId (для полноэкранного звонка).
  Map<String, RTCVideoRenderer> get renderers => _remoteRenderers;

  /// Подключить контроллер к сокету. Вызывается один раз из MainShell.
  void init(LoveSocket socket) {
    final previous = _socket;
    if (previous != null && !identical(previous, socket)) detach(previous);
    _socket = socket;
    if (_attached) return;
    _attached = true;
    socket.on('voice:existing_members', _handleExistingMembers);
    socket.on('voice:members_update', _handleMembersUpdate);
    socket.on('voice:user_left', _handleUserLeft);
    socket.on('voice:user_muted', _handleUserMuted);
    socket.on('voice:left', _handleVoiceLeft);
    socket.on('voice:media_state', _handleMediaState);
    socket.on('webrtc:offer', _handleOffer);
    socket.on('webrtc:answer', _handleAnswer);
    socket.on('webrtc:ice_candidate', _handleIceCandidate);
  }

  void detach(LoveSocket socket) {
    if (!identical(_socket, socket)) return;
    if (channelId.isNotEmpty) {
      socket.emit('voice:leave', {'channelId': channelId});
    }
    unawaited(_cleanupMedia(notify: false));
    socket.off('voice:existing_members', _handleExistingMembers);
    socket.off('voice:members_update', _handleMembersUpdate);
    socket.off('voice:user_left', _handleUserLeft);
    socket.off('voice:user_muted', _handleUserMuted);
    socket.off('voice:left', _handleVoiceLeft);
    socket.off('voice:media_state', _handleMediaState);
    socket.off('webrtc:offer', _handleOffer);
    socket.off('webrtc:answer', _handleAnswer);
    socket.off('webrtc:ice_candidate', _handleIceCandidate);
    _socket = null;
    _attached = false;
  }

  /// Войти в голосовой канал. Если уже в другом канале — сначала выходим.
  Future<bool> join({required String id, required String title}) async {
    final socket = _socket;
    if (socket == null || id.isEmpty) return false;
    if (isActive && channelId == id) return true;

    // Звонок в ЛС уже держит микрофон и свою WebRTC-комнату. Заход в войс
    // поверх звонка отбирал поток, и звонок оставался «висеть» без звука.
    if (CallCenter.instance.dmBusy) {
      errorMessage =
          'Сначала завершите звонок — во время звонка нельзя зайти в войс';
      notifyListeners();
      return false;
    }

    if (isActive) await leave();
    await _cleanupTask;

    errorMessage = null;
    final generation = ++_generation;
    phase = ChannelVoicePhase.connecting;
    channelId = id;
    channelTitle = title;
    _iceConfiguration = _stunIceConfiguration;
    notifyListeners();
    final online = socket.isConnected ||
        await socket.connectAndWait(const Duration(seconds: 8));
    if (!_current(generation)) return false;
    if (!online) {
      await _abortJoin(
          'Нет связи с сервером. Проверьте подключение и попробуйте ещё раз.');
      return false;
    }
    final status = await Permission.microphone.request();
    if (!_current(generation)) return false;
    if (!status.isGranted) {
      await _abortJoin('Нет доступа к микрофону');
      return false;
    }

    try {
      unawaited(_refreshIceConfiguration());
      await _ensureLocalStream();
      if (!_current(generation)) return false;
    } catch (_) {
      if (!_current(generation)) return false;
      await _abortJoin('Не удалось включить микрофон');
      return false;
    }
    try {
      // Динамик всегда включён — отдельной кнопки больше нет.
      await Helper.setSpeakerphoneOn(true);
    } catch (_) {
      // Некоторые Android-сборки не дают менять аудио-маршрут — не критично.
    }

    try {
      if (!_current(generation)) return false;
      final response = await socket.emitWithAck(
        'voice:join',
        {'channelId': id},
        timeout: const Duration(seconds: 15),
      );
      if (!_current(generation)) {
        if (channelId != id) socket.emit('voice:leave', {'channelId': id});
        return false;
      }
      if (response['status'] != 'ok') {
        if (!_current(generation)) return false;
        await _abortJoin(
            asText(response['message'], 'Не удалось войти в войс'));
        return false;
      }
    } on TimeoutException {
      if (!_current(generation)) return false;
      await _abortJoin(
          'Сервер долго не отвечает. Проверь подключение и попробуй снова.');
      return false;
    } catch (_) {
      if (!_current(generation)) return false;
      await _abortJoin('Не удалось подключиться к голосовому каналу');
      return false;
    }

    phase = ChannelVoicePhase.connected;
    connectedAt = DateTime.now();
    unawaited(LoveSounds.instance.play('user_join'));
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
      if (phase == ChannelVoicePhase.connected) {
        unawaited(LoveSounds.instance.play('user_leave'));
      }
    }
    final closing = _cleanupMedia();
    _resetToIdle();
    await closing;
  }

  /// Переключить микрофон.
  void toggleMute() {
    muted = !muted;
    unawaited(LoveSounds.instance.play(muted ? 'voice_mute' : 'voice_unmute'));
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
    if (mediaBusy || !isActive) return;
    final generation = _generation;
    mediaBusy = true;
    notifyListeners();
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
        notifyListeners();
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
    notifyListeners();
  }

  Future<void> toggleScreenShare() async {
    if (mediaBusy || !isActive) return;
    final generation = _generation;
    mediaBusy = true;
    notifyListeners();
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
        notifyListeners();
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
    notifyListeners();
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
    notifyListeners();
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
    if (channelId.isEmpty) return;
    unawaited(_sendMediaState(channelId, mode, previousMode));
  }

  Future<void> _sendMediaState(
    String roomId,
    String mode,
    String? previousMode,
  ) async {
    final socket = _socket;
    if (socket == null) return;
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
    members.removeWhere((member) => asText(member['socketId']) == socketId);
    if (socketId.isNotEmpty) unawaited(_removeConnection(socketId));
    notifyListeners();
  }

  void _handleVoiceLeft(dynamic data) {
    if (data is! Map || channelId.isEmpty) return;
    if (asId(data['channelId']) != channelId) return;
    // Сервер завершил наше участие (например, вход с другого устройства).
    unawaited(_cleanupMedia());
    _resetToIdle();
  }

  void _handleMediaState(dynamic data) {
    if (channelId.isEmpty ||
        data is! Map ||
        asId(data['channelId']) != channelId) {
      return;
    }
    final id = asText(data['socketId']);
    if (id.isEmpty || id == _socket?.socketId) return;
    final mode = asText(data['mode']);
    remoteMediaModes[id] = mode;
    remoteVideo[id] = mode == 'camera' || mode == 'screen';
    notifyListeners();
  }

  void _handleUserMuted(dynamic data) {
    if (data is! Map || channelId.isEmpty) return;
    if (asId(data['channelId']) != channelId) return;
    final userId = asId(data['userId']);
    if (userId.isEmpty) return;
    for (final member in members) {
      final user = member['user'] is Map ? member['user'] as Map : member;
      if (asId(user['_id'] ?? member['userId']) == userId) {
        member['muted'] = data['muted'] == true;
      }
    }
    notifyListeners();
  }

  void _applyMembers(Object? raw) {
    if (raw is! List) return;
    final before = _memberIds();
    members
      ..clear()
      ..addAll(raw.whereType<Map>().map(
            (item) => item.cast<String, dynamic>(),
          ));
    for (final member in members) {
      final id = asText(member['socketId']);
      if (id.isNotEmpty &&
          id != _socket?.socketId &&
          member.containsKey('mediaMode')) {
        final mode = asText(member['mediaMode']);
        remoteMediaModes[id] = mode;
        remoteVideo[id] = mode == 'camera' || mode == 'screen';
      }
    }
    // Кто-то другой зашёл или вышел. Свой вход уже прозвучал в join(), а
    // первый список после входа — это уже сидящие в канале, не новые люди.
    final after = _memberIds();
    if (phase == ChannelVoicePhase.connected && before.isNotEmpty) {
      if (after.difference(before).isNotEmpty) {
        unawaited(LoveSounds.instance.play('user_join'));
      } else if (before.difference(after).isNotEmpty) {
        unawaited(LoveSounds.instance.play('user_leave'));
      }
    }
    notifyListeners();
  }

  Set<String> _memberIds() => members
      .map((member) => asId(member['userId'] ?? member['_id'] ?? member['id']))
      .where((id) => id.isNotEmpty)
      .toSet();

  // ── WebRTC mesh (тот же подход, что в DmCallController) ─────

  void _handleOffer(dynamic data) {
    unawaited(_handleOfferAsync(data));
  }

  Future<void> _handleOfferAsync(dynamic data) async {
    final room = channelId;
    if (room.isEmpty || data is! Map || asId(data['channelId']) != room) return;
    final id = asText(data['fromSocketId']);
    if (id.isEmpty || id == (_socket?.socketId ?? '')) return;
    await _negotiation.receiveOffer(id, _sessionDescription(data['offer']));
  }

  void _handleAnswer(dynamic data) {
    unawaited(_handleAnswerAsync(data));
  }

  Future<void> _handleAnswerAsync(dynamic data) async {
    final room = channelId;
    if (room.isEmpty || data is! Map || asId(data['channelId']) != room) return;
    final id = asText(data['fromSocketId']);
    if (id.isEmpty || id == (_socket?.socketId ?? '')) return;
    await _negotiation.receiveAnswer(id, _sessionDescription(data['answer']));
  }

  void _handleIceCandidate(dynamic data) {
    unawaited(_handleIceCandidateAsync(data));
  }

  Future<void> _handleIceCandidateAsync(dynamic data) async {
    final room = channelId;
    if (room.isEmpty || data is! Map || asId(data['channelId']) != room) return;
    final id = asText(data['fromSocketId']);
    if (id.isEmpty || id == (_socket?.socketId ?? '')) return;
    await _negotiation.candidate(id, _iceCandidate(data['candidate']));
  }

  Future<void> _ensureLocalStream() async {
    if (_localStream != null) return;
    final generation = _generation;
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
    if (muted) {
      for (final track in _localStream!.getAudioTracks()) {
        track.enabled = false;
      }
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

  Future<void> _initiateConnection(String socketId) =>
      _negotiation.offer(socketId);

  Future<RTCPeerConnection> _createPeerConnection(String socketId) async {
    final existing = _peerConnections[socketId];
    if (existing != null) return existing;
    final peerGeneration = _peerGenerations[socketId] ?? 0;
    final generation = _generation, room = channelId;
    final pc = await createPeerConnection(_iceConfiguration);
    if ((_peerGenerations[socketId] ?? 0) != peerGeneration ||
        !_current(generation) ||
        channelId != room) {
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
      _socket?.emit('webrtc:ice_candidate', {
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
        if (current()) notifyListeners();
      }).catchError((Object _) {});
      _remoteTasks[socketId] = task;
      notifyListeners();
    };
    pc.onRemoveTrack = (stream, track) {
      if (current() && track.kind == 'video') {
        remoteVideo[socketId] = false;
        notifyListeners();
      }
    };
    pc.onConnectionState = (state) {
      if (!current()) return;
      if (state == RTCPeerConnectionState.RTCPeerConnectionStateConnected) {
        _reconnectTimers.remove(socketId)?.cancel();

        notifyListeners();
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
    notifyListeners();
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

  Future<void> _abortJoin(String message) async {
    final closing = _cleanupMedia();
    phase = ChannelVoicePhase.idle;
    channelId = '';
    channelTitle = '';
    connectedAt = null;
    members.clear();
    errorMessage = message;
    notifyListeners();
    await closing;
  }

  Future<void> _cleanupMedia({bool notify = true}) {
    final pending = _cleanupTask;
    if (pending != null) return pending;
    ++_generation;
    _peerGenerations.clear();
    _negotiation.reset();
    channelId = '';
    channelTitle = '';
    members.clear();
    phase = ChannelVoicePhase.idle;
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
    if (notify) notifyListeners();
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

  static const _stunIceConfiguration = {
    'iceServers': [
      {'urls': 'stun:stun.l.google.com:19302'},
      {'urls': 'stun:stun1.l.google.com:19302'},
      {'urls': 'stun:stun2.l.google.com:19302'},
    ],
  };
}
