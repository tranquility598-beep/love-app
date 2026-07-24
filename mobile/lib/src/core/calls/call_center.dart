import 'dart:async';
import 'dart:isolate';
import 'dart:ui';

import 'package:flutter/material.dart';

import '../../features/calls/call_screen.dart';
import '../../features/calls/call_session.dart';
import '../../features/chat/chat_models.dart';
import '../../features/chat/dm_call_controller.dart';
import '../notifications/in_app_notifications.dart';
import '../notifications/local_notifications.dart';
import '../realtime/love_socket.dart';
import '../voice/channel_voice_controller.dart';

/// Глобальный центр звонков. Живёт на уровне приложения:
/// - звонок НЕ обрывается при выходе из чата (контроллер хранится здесь);
/// - входящий звонок открывает полноэкранный [CallScreen] (если приложение
///   развёрнуто) и/или уведомление с «Принять»/«Отклонить»;
/// - во время звонка/войса висит постоянное уведомление с «Микрофон»/
///   «Завершить» — кнопки работают БЕЗ открытия приложения (фоновый изолят
///   → порт [kLoveCallActionPort] → сюда).
///
/// ВАЖНО: в MaterialApp нужно прокинуть `navigatorKey: CallCenter.navigatorKey`
/// (см. PATCHES.md), иначе входящий звонок не сможет открыться поверх
/// любого экрана.
class CallCenter extends ChangeNotifier {
  CallCenter._();
  static final CallCenter instance = CallCenter._();

  /// Подключается к MaterialApp, чтобы открывать полноэкранный звонок
  /// из любого места приложения.
  static final navigatorKey = GlobalKey<NavigatorState>();

  LoveSocket? _socket;
  DmCallController? _controller; // основной (текущий/последний звонок)
  DmCallController? _temp; // чат, открытый во время звонка в другом чате

  /// Приложение развёрнуто? Обновляется из main_shell.
  bool foreground = true;

  DmCallPhase _lastPhase = DmCallPhase.idle;
  bool _lastMuted = false;
  bool _lastVoiceActive = false;
  bool _lastVoiceMuted = false;
  String _lastVoiceTitle = '';

  /// Активный звонок в ЛС (для плашки ActiveCallBar и полноэкранного UI).
  DmCallController? get activeDm {
    final c = _activeCall();
    if (c == null ||
        c.phase == DmCallPhase.idle ||
        c.phase == DmCallPhase.error) {
      return null;
    }
    return c;
  }

  void init(LoveSocket socket) {
    if (_socket != null) return;
    _socket = socket;
    socket.on('call:incoming', _onGlobalIncoming);
    ChannelVoiceController.instance.addListener(_onVoiceChanged);
    _registerActionPort();
  }

  /// Принимает нажатия кнопок уведомлений из фонового изолята
  /// (showsUserInterface: false — приложение НЕ открывается).
  void _registerActionPort() {
    IsolateNameServer.removePortNameMapping(kLoveCallActionPort);
    final port = ReceivePort();
    IsolateNameServer.registerPortWithName(port.sendPort, kLoveCallActionPort);
    port.listen((message) {
      final text = '$message';
      final index = text.indexOf('|');
      final action = index < 0 ? text : text.substring(0, index);
      final payload = index < 0 ? '' : text.substring(index + 1);
      handleNotificationAction(action, payload.isEmpty ? null : payload);
    });
  }

  /// Экран чата берёт контроллер отсюда, а не создаёт свой.
  DmCallController obtain({
    required LoveSocket socket,
    required String conversationId,
    required String channelId,
    required String peerId,
    required String peerName,
    required String peerAvatar,
  }) {
    final current = _controller;
    if (current != null && current.conversationId == conversationId) {
      current.updateChannelId(channelId);
      return current;
    }
    if (current == null || current.phase == DmCallPhase.idle) {
      _dropController();
      _controller = _create(
        socket: socket,
        conversationId: conversationId,
        channelId: channelId,
        peerId: peerId,
        peerName: peerName,
        peerAvatar: peerAvatar,
      );
      return _controller!;
    }
    // Идёт звонок в другом чате — этому экрану даём временный контроллер.
    if (_temp == null || _temp!.conversationId != conversationId) {
      _dropTemp();
      _temp = _create(
        socket: socket,
        conversationId: conversationId,
        channelId: channelId,
        peerId: peerId,
        peerName: peerName,
        peerAvatar: peerAvatar,
      );
    }
    return _temp!;
  }

  /// Экран чата закрывается. Основной контроллер НЕ уничтожаем —
  /// именно поэтому звонок переживает выход из чата.
  void release(DmCallController controller) {
    if (!identical(controller, _temp)) return;
    if (_temp!.phase == DmCallPhase.idle) {
      _dropTemp();
    } else if (_controller == null ||
        _controller!.phase == DmCallPhase.idle) {
      // Во временном контроллере начался звонок — делаем его основным.
      _dropController();
      _controller = _temp;
      _temp = null;
    }
  }

  /// Кнопки в уведомлениях: и из основного изолята («Принять» открывает
  /// приложение), и из фонового через порт (микрофон/завершить/отклонить
  /// работают, НЕ открывая приложение). Обрабатывает и звонки в ЛС,
  /// и войс сфер.
  void handleNotificationAction(String actionId, String? payload) {
    final c = _activeCall();
    final voice = ChannelVoiceController.instance;
    switch (actionId) {
      case 'call_accept':
        if (c != null) {
          unawaited(c.acceptIncoming());
          _openCallScreen();
        }
        break;
      case 'call_decline':
        c?.declineIncoming();
        LocalNotifications.cancelIncomingCall();
        break;
      case 'call_mute':
        if (c != null && c.phase != DmCallPhase.idle) {
          unawaited(c.toggleMute());
        } else if (voice.isActive) {
          voice.toggleMute();
        }
        break;
      case 'call_hangup':
        if (c != null && c.phase != DmCallPhase.idle) {
          unawaited(c.endCall());
        } else if (voice.isActive) {
          unawaited(voice.leave());
        }
        break;
    }
  }

  // ── внутреннее ──

  DmCallController _create({
    required LoveSocket socket,
    required String conversationId,
    required String channelId,
    required String peerId,
    required String peerName,
    required String peerAvatar,
  }) {
    final c = DmCallController(
      socket: socket,
      conversationId: conversationId,
      channelId: channelId,
      peerId: peerId,
      peerName: peerName,
      peerAvatar: peerAvatar,
    )..attach();
    c.onMissedCall = _onMissed;
    c.addListener(_onControllerChanged);
    return c;
  }

  void _dropController() {
    _controller?.removeListener(_onControllerChanged);
    _controller?.dispose();
    _controller = null;
  }

  void _dropTemp() {
    _temp?.removeListener(_onControllerChanged);
    _temp?.dispose();
    _temp = null;
  }

  DmCallController? _activeCall() {
    if (_controller != null && _controller!.phase != DmCallPhase.idle) {
      return _controller;
    }
    if (_temp != null && _temp!.phase != DmCallPhase.idle) return _temp;
    return _controller ?? _temp;
  }

  /// Открыть полноэкранный звонок поверх любого экрана.
  void _openCallScreen() {
    final c = activeDm;
    final navigator = navigatorKey.currentState;
    if (c == null || navigator == null) return;
    unawaited(CallScreen.push(navigator, DmCallSession(c)));
  }

  /// call:incoming пришёл, а чат с этим человеком не открыт — создаём
  /// контроллер здесь и показываем полноэкранный звонок/уведомление.
  void _onGlobalIncoming(dynamic data) {
    if (data is! Map) return;
    final raw = data.cast<String, dynamic>();
    final from = raw['from'] is Map
        ? (raw['from'] as Map).cast<String, dynamic>()
        : <String, dynamic>{};
    final callerId = asId(from['_id']);
    final conversationId = asId(raw['conversationId']);
    final channelId = asId(raw['channelId']);
    final callerName = userDisplayName(from);
    if (callerId.isEmpty) return;

    final covered = (_controller != null &&
            (_controller!.peerId == callerId ||
                _controller!.conversationId == conversationId)) ||
        (_temp != null &&
            (_temp!.peerId == callerId ||
                _temp!.conversationId == conversationId));

    if (!covered) {
      // Уже в другом звонке — не вмешиваемся.
      if (_controller != null && _controller!.phase != DmCallPhase.idle) {
        return;
      }
      _dropController();
      _controller = _create(
        socket: _socket!,
        conversationId: conversationId,
        channelId: channelId,
        peerId: callerId,
        peerName: callerName,
        peerAvatar: '',
      );
      _controller!.adoptIncoming(
        callerId: callerId,
        conversationId: conversationId,
        channelId: channelId,
        callerName: callerName,
      );
    }

    // Приложение развёрнуто — показываем полноэкранный входящий звонок.
    if (foreground) {
      _openCallScreen();
    }
    // Уведомление — если приложение свёрнуто или открыт другой экран.
    if (!foreground || ActiveChat.conversationId != conversationId) {
      LocalNotifications.showIncomingCall(caller: callerName);
    }
  }

  void _onMissed(String name) {
    LocalNotifications.cancelIncomingCall();
    LocalNotifications.showMissedCall(name);
  }

  void _onControllerChanged() {
    final c = _activeCall();
    final phase = c?.phase ?? DmCallPhase.idle;
    final muted = c?.muted ?? false;
    if (phase != _lastPhase || muted != _lastMuted) {
      switch (phase) {
        case DmCallPhase.connecting:
        case DmCallPhase.connected:
          LocalNotifications.cancelIncomingCall();
          LocalNotifications.showOngoingCall(
            peer: c!.displayName,
            muted: muted,
          );
          break;
        case DmCallPhase.incoming:
          // Показ уведомления/экрана делает _onGlobalIncoming.
          break;
        default: // idle, outgoing, error
          LocalNotifications.cancelIncomingCall();
          _syncVoiceNotification(force: true);
          break;
      }
      _lastPhase = phase;
      _lastMuted = muted;
    }
    notifyListeners();
  }

  void _onVoiceChanged() {
    _syncVoiceNotification();
    notifyListeners();
  }

  /// Постоянное уведомление для войса сфер (если нет звонка в ЛС —
  /// у него приоритет, уведомление общее).
  void _syncVoiceNotification({bool force = false}) {
    final voice = ChannelVoiceController.instance;
    final dm = activeDm;
    final dmBusy = dm != null &&
        (dm.phase == DmCallPhase.connecting ||
            dm.phase == DmCallPhase.connected);
    if (dmBusy) return;
    if (voice.isActive) {
      final changed = voice.isActive != _lastVoiceActive ||
          voice.muted != _lastVoiceMuted ||
          voice.channelTitle != _lastVoiceTitle;
      if (force || changed) {
        LocalNotifications.showOngoingCall(
          peer: voice.channelTitle.isEmpty ? 'Войс' : voice.channelTitle,
          muted: voice.muted,
          body: voice.muted
              ? 'Вы в войсе · микрофон выключен'
              : 'Вы в войсе',
        );
      }
    } else if (_lastVoiceActive || force) {
      LocalNotifications.cancelOngoingCall();
    }
    _lastVoiceActive = voice.isActive;
    _lastVoiceMuted = voice.muted;
    _lastVoiceTitle = voice.channelTitle;
  }
}
