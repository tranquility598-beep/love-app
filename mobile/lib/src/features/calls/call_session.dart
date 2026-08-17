import 'package:flutter/foundation.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../../core/voice/channel_voice_controller.dart';
import '../chat/chat_models.dart';
import '../chat/dm_call_controller.dart';

/// Участник звонка для полноэкранного UI.
class CallParticipant {
  const CallParticipant({
    required this.id,
    required this.name,
    this.avatar = '',
    this.isSelf = false,
    this.muted = false,
    this.renderer,
    this.hasVideo = false,
    this.mirror = false,
  });

  final String id;
  final String name;
  final String avatar;
  final bool isSelf;
  final bool muted;
  final RTCVideoRenderer? renderer;
  final bool hasVideo;

  /// Mirror only the local front-camera preview, never a remote stream.
  final bool mirror;
}

/// Общий интерфейс полноэкранного звонка: один экран [CallScreen]
/// работает и для звонков в ЛС, и для войса сфер — один стиль везде.
abstract class CallSession {
  Listenable get listenable;
  String get title;
  String get subtitle;
  bool get isActive;
  bool get isConnected;
  bool get isIncoming;
  DateTime? get connectedAt;
  bool get muted;
  bool get cameraOn;
  bool get screenSharing;
  bool get frontCamera;
  RTCVideoRenderer? get localRenderer;
  String? get errorMessage;

  /// Участники без себя для ЛС (своё превью — оверлей),
  /// и С собой первым — для сфер (сетка тайлов).
  List<CallParticipant> get participants;

  Future<void> toggleMute();
  Future<void> toggleCamera();
  Future<void> switchCamera();
  Future<void> toggleScreenShare();
  Future<void> accept();
  Future<void> decline();
  Future<void> hangup();
}

/// Сессия звонка в ЛС поверх [DmCallController].
class DmCallSession implements CallSession {
  DmCallSession(this.controller);

  final DmCallController controller;

  @override
  Listenable get listenable => controller;

  @override
  String get title => controller.displayName;

  @override
  String get subtitle => controller.statusText;

  @override
  bool get isActive =>
      controller.phase != DmCallPhase.idle &&
      controller.phase != DmCallPhase.error;

  @override
  bool get isConnected => controller.phase == DmCallPhase.connected;

  @override
  bool get isIncoming => controller.phase == DmCallPhase.incoming;

  @override
  DateTime? get connectedAt => controller.connectedAt;

  @override
  bool get muted => controller.muted;

  @override
  bool get cameraOn => controller.cameraOn;

  @override
  bool get screenSharing => controller.screenSharing;

  @override
  bool get frontCamera => controller.frontCamera;

  @override
  RTCVideoRenderer? get localRenderer => controller.localRenderer;

  @override
  String? get errorMessage => controller.errorMessage;

  @override
  List<CallParticipant> get participants => [
        CallParticipant(
          id: controller.peerId,
          name: controller.displayName,
          avatar: controller.peerAvatar,
          renderer: controller.peerHasVideo ? controller.remoteRenderer : null,
          hasVideo: controller.peerHasVideo,
        ),
      ];

  @override
  Future<void> toggleMute() => controller.toggleMute();

  @override
  Future<void> toggleCamera() => controller.toggleCamera();

  @override
  Future<void> switchCamera() => controller.switchCamera();

  @override
  Future<void> toggleScreenShare() => controller.toggleScreenShare();

  @override
  Future<void> accept() => controller.acceptIncoming();

  @override
  Future<void> decline() async => controller.declineIncoming();

  @override
  Future<void> hangup() => controller.endCall();
}

/// Сессия войса сферы/комнаты поверх [ChannelVoiceController].
class ChannelCallSession implements CallSession {
  ChannelCallSession({
    this.selfId = '',
    this.selfName = 'Вы',
    this.selfAvatar = '',
  });

  final String selfId;
  final String selfName;
  final String selfAvatar;

  ChannelVoiceController get voice => ChannelVoiceController.instance;

  @override
  Listenable get listenable => voice;

  @override
  String get title => voice.channelTitle;

  @override
  String get subtitle =>
      voice.isConnected ? 'Вы в войсе' : 'Подключение...';

  @override
  bool get isActive => voice.isActive;

  @override
  bool get isConnected => voice.isConnected;

  @override
  bool get isIncoming => false;

  @override
  DateTime? get connectedAt => voice.connectedAt;

  @override
  bool get muted => voice.muted;

  @override
  bool get cameraOn => voice.cameraOn;

  @override
  bool get screenSharing => voice.screenSharing;

  @override
  bool get frontCamera => voice.frontCamera;

  @override
  RTCVideoRenderer? get localRenderer => voice.localRenderer;

  @override
  String? get errorMessage => voice.errorMessage;

  @override
  List<CallParticipant> get participants {
    final result = <CallParticipant>[
      CallParticipant(
        id: selfId.isEmpty ? 'self' : selfId,
        name: selfName,
        avatar: selfAvatar,
        isSelf: true,
        muted: voice.muted,
        renderer: (voice.cameraOn || voice.screenSharing)
            ? voice.localRenderer
            : null,
        hasVideo: voice.cameraOn || voice.screenSharing,
        mirror: voice.cameraOn && voice.frontCamera,
      ),
    ];
    for (final member in voice.members) {
      final user = member['user'] is Map
          ? (member['user'] as Map).cast<String, dynamic>()
          : member;
      // Сервер отдаёт участника войса как {userId, socketId, username, …} —
      // поля `_id` там нет. Раньше себя искали только по `user['_id']`, отсев
      // не срабатывал никогда, и в сетке висели две карточки одного меня.
      final userId = asId(user['_id']).isNotEmpty
          ? asId(user['_id'])
          : asText(member['userId']);
      if (selfId.isNotEmpty && userId == selfId) continue;
      final socketId = asText(member['socketId']);
      final hasVideo = voice.remoteVideo[socketId] ?? false;
      result.add(CallParticipant(
        id: socketId.isNotEmpty ? socketId : userId,
        name: userDisplayName(user),
        avatar: asText(user['avatar']),
        muted: member['muted'] == true || member['isMuted'] == true,
        renderer: hasVideo ? voice.renderers[socketId] : null,
        hasVideo: hasVideo,
      ));
    }
    return result;
  }

  @override
  Future<void> toggleMute() async => voice.toggleMute();

  @override
  Future<void> toggleCamera() => voice.toggleCamera();

  @override
  Future<void> switchCamera() => voice.switchCamera();

  @override
  Future<void> toggleScreenShare() => voice.toggleScreenShare();

  @override
  Future<void> accept() async {}

  @override
  Future<void> decline() async {}

  @override
  Future<void> hangup() => voice.leave();
}
