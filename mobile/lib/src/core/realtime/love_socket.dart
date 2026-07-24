import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../config/app_config.dart';
import '../../features/auth/auth_repository.dart';

typedef SocketEventHandler = void Function(dynamic data);

/// Socket wrapper with aggressive self-healing.
///
/// The old implementation relied only on socket.io's built-in reconnection.
/// On Android the OS can silently kill the connection (doze, network switch,
/// app in background) and the client would stay "dead" until an app restart,
/// which made the user look offline to everyone else. This version adds:
/// - a watchdog timer that fully recreates a dead socket with a fresh token;
/// - an app-lifecycle hook that re-checks the connection on resume;
/// - a quick re-check a few seconds after every disconnect;
/// - `emitWithAck` waits for a reconnect instead of failing instantly.
class LoveSocket with WidgetsBindingObserver {
  LoveSocket({AuthRepository? authRepository})
      : authRepository = authRepository ?? AuthRepository();

  final AuthRepository authRepository;
  final _handlers = <String, Set<SocketEventHandler>>{};
  io.Socket? _socket;
  Timer? _watchdog;
  bool _shouldBeConnected = false;
  bool _reconnecting = false;
  bool _observing = false;
  void Function()? _onConnect;
  void Function(dynamic error)? _onError;

  bool get isConnected => _socket?.connected == true;

  Future<void> connect({
    void Function()? onConnect,
    void Function(dynamic error)? onError,
  }) async {
    _onConnect = onConnect ?? _onConnect;
    _onError = onError ?? _onError;
    _shouldBeConnected = true;
    _startWatchdog();
    _startObserving();
    await _open();
  }

  Future<void> ensureConnected() async {
    _shouldBeConnected = true;
    _startWatchdog();
    _startObserving();
    if (isConnected) return;
    await _open();
  }

  /// Fire-and-forget reconnection attempt (safe to call from sync code).
  void kick() {
    if (!_shouldBeConnected || isConnected) return;
    unawaited(_checkNow());
  }

  void on(String event, SocketEventHandler handler) {
    _handlers.putIfAbsent(event, () => {}).add(handler);
    _socket?.on(event, handler);
  }

  void off(String event, [SocketEventHandler? handler]) {
    if (handler == null) {
      _handlers.remove(event);
      _socket?.off(event);
    } else {
      final handlers = _handlers[event];
      handlers?.remove(handler);
      if (handlers != null && handlers.isEmpty) _handlers.remove(event);
      _socket?.off(event, handler);
    }
  }

  void emit(String event, [dynamic data]) {
    if (!isConnected) kick();
    _socket?.emit(event, data);
  }

  Future<Map<String, dynamic>> emitWithAck(
    String event,
    dynamic data, {
    Duration timeout = const Duration(seconds: 10),
  }) async {
    if (!isConnected) {
      try {
        await ensureConnected();
      } catch (_) {
        // Fall through to the connectivity check below.
      }
      await _waitConnected(const Duration(seconds: 5));
    }
    final socket = _socket;
    if (socket == null || !socket.connected) {
      return {'status': 'error', 'message': 'Сокет еще не подключен'};
    }
    final result = await socket.emitWithAckAsync(event, data).timeout(timeout);
    return result is Map
        ? result.cast<String, dynamic>()
        : {'status': 'error', 'message': 'Некорректный ответ сервера'};
  }

  Future<void> disconnect() async {
    _shouldBeConnected = false;
    _watchdog?.cancel();
    _watchdog = null;
    if (_observing) {
      WidgetsBinding.instance.removeObserver(this);
      _observing = false;
    }
    await _teardownSocket();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      unawaited(_checkNow());
    }
  }

  Future<void> _open() async {
    if (_reconnecting) return;
    _reconnecting = true;
    try {
      await _teardownSocket();
      final token = await authRepository.issueSocketToken();
      final socket = io.io(
        AppConfig.socketUrl,
        io.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .enableReconnection()
            .setReconnectionDelay(1000)
            .setReconnectionDelayMax(5000)
            .setAuth({'token': token})
            .disableAutoConnect()
            .build(),
      );
      _socket = socket;
      socket
        ..onConnect((_) => _onConnect?.call())
        ..onConnectError((error) => _onError?.call(error))
        ..onError((error) => _onError?.call(error))
        ..onDisconnect((_) => _scheduleQuickCheck());
      _attachSavedHandlers(socket);

      socket.io.on('reconnect_attempt', (_) async {
        try {
          final freshToken = await authRepository.issueSocketToken();
          _socket?.auth = {'token': freshToken};
        } catch (_) {
          // Keep the old token; the watchdog retries with a fresh one.
        }
      });

      socket.connect();
    } finally {
      _reconnecting = false;
    }
  }

  Future<void> _checkNow() async {
    if (!_shouldBeConnected || isConnected || _reconnecting) return;
    try {
      await _open();
    } catch (_) {
      // Watchdog will retry on the next tick.
    }
  }

  void _scheduleQuickCheck() {
    Timer(const Duration(seconds: 3), () => unawaited(_checkNow()));
  }

  void _startWatchdog() {
    _watchdog ??= Timer.periodic(
      const Duration(seconds: 15),
      (_) => unawaited(_checkNow()),
    );
  }

  void _startObserving() {
    if (_observing) return;
    WidgetsBinding.instance.addObserver(this);
    _observing = true;
  }

  Future<bool> _waitConnected(Duration timeout) async {
    final deadline = DateTime.now().add(timeout);
    while (DateTime.now().isBefore(deadline)) {
      if (isConnected) return true;
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }
    return isConnected;
  }

  Future<void> _teardownSocket() async {
    final socket = _socket;
    _socket = null;
    if (socket == null) return;
    for (final entry in _handlers.entries) {
      for (final handler in entry.value) {
        socket.off(entry.key, handler);
      }
    }
    socket.dispose();
    socket.disconnect();
  }

  void _attachSavedHandlers(io.Socket socket) {
    for (final entry in _handlers.entries) {
      for (final handler in entry.value) {
        socket.on(entry.key, handler);
      }
    }
  }
}
