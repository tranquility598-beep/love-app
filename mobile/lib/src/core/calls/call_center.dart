import '../../features/chat/chat_models.dart';
import '../../features/chat/dm_call_controller.dart';
import '../notifications/in_app_notifications.dart';
import '../notifications/local_notifications.dart';
import '../realtime/love_socket.dart';

/// Глобальный центр звонков. Живёт на уровне приложения, а не экрана чата:
/// - звонок НЕ обрывается при выходе из чата (контроллер хранится здесь);
/// - уведомление о входящем звонке с кнопками «Принять»/«Отклонить»;
/// - уведомление о пропущенном звонке;
/// - постоянное уведомление во время звонка с «Микрофон»/«Завершить».
class CallCenter {
  CallCenter._();
  static final CallCenter instance = CallCenter._();

  LoveSocket? _socket;
  DmCallController? _controller; // основной (текущий/последний звонок)
  DmCallController? _temp; // чат, открытый во время звонка в другом чате

  /// Приложение развёрнуто? Обновляется из main_shell.
  bool foreground = true;

  DmCallPhase _lastPhase = DmCallPhase.idle;
  bool _lastMuted = false;

  void init(LoveSocket socket) {
    if (_socket != null) return;
    _socket = socket;
    socket.on('call:incoming', _onGlobalIncoming);
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
  /// именно поэтому звонок теперь переживает выход из чата.
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

  /// Кнопки в уведомлениях (подключается в main_shell).
  void handleNotificationAction(String actionId, String? payload) {
    final c = _activeCall();
    if (c == null) return;
    switch (actionId) {
      case 'call_accept':
        c.acceptIncoming();
        break;
      case 'call_decline':
        c.declineIncoming();
        LocalNotifications.cancelIncomingCall();
        break;
      case 'call_mute':
        c.toggleMute();
        break;
      case 'call_hangup':
        c.endCall();
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

  /// call:incoming пришёл, а чат с этим человеком не открыт — раньше звонок
  /// просто терялся. Теперь создаём контроллер здесь и показываем уведомление.
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
    if (phase == _lastPhase && muted == _lastMuted) return;

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
        // Показ уведомления делает _onGlobalIncoming.
        break;
      default: // idle, outgoing, error
        LocalNotifications.cancelIncomingCall();
        LocalNotifications.cancelOngoingCall();
        break;
    }
    _lastPhase = phase;
    _lastMuted = muted;
  }
}
