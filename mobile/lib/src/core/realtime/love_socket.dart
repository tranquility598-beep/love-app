import 'package:socket_io_client/socket_io_client.dart' as io;

import '../../config/app_config.dart';
import '../../features/auth/auth_repository.dart';

typedef SocketEventHandler = void Function(dynamic data);

class LoveSocket {
  LoveSocket({AuthRepository? authRepository})
      : authRepository = authRepository ?? AuthRepository();

  final AuthRepository authRepository;
  final _handlers = <String, Set<SocketEventHandler>>{};
  io.Socket? _socket;

  bool get isConnected => _socket?.connected == true;

  Future<void> connect({
    void Function()? onConnect,
    void Function(dynamic error)? onError,
  }) async {
    await disconnect();
    final token = await authRepository.issueSocketToken();
    _socket = io.io(
      AppConfig.socketUrl,
      io.OptionBuilder()
          .setTransports(['websocket', 'polling'])
          .enableReconnection()
          .setAuth({'token': token})
          .disableAutoConnect()
          .build(),
    );

    _socket!
      ..onConnect((_) => onConnect?.call())
      ..onConnectError((error) => onError?.call(error))
      ..onError((error) => onError?.call(error));
    _attachSavedHandlers(_socket!);

    _socket!.io.on('reconnect_attempt', (_) async {
      final freshToken = await authRepository.issueSocketToken();
      _socket?.auth = {'token': freshToken};
    });

    _socket!.connect();
  }

  Future<void> ensureConnected() async {
    if (isConnected) return;
    await connect();
  }

  void on(String event, SocketEventHandler handler) {
    _handlers.putIfAbsent(event, () => <SocketEventHandler>{}).add(handler);
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
    _socket?.emit(event, data);
  }

  Future<Map<String, dynamic>> emitWithAck(
    String event,
    dynamic data, {
    Duration timeout = const Duration(seconds: 10),
  }) async {
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
    final socket = _socket;
    if (socket != null) {
      for (final entry in _handlers.entries) {
        for (final handler in entry.value) {
          socket.off(entry.key, handler);
        }
      }
      socket.dispose();
      socket.disconnect();
    }
    _socket = null;
  }

  void _attachSavedHandlers(io.Socket socket) {
    for (final entry in _handlers.entries) {
      for (final handler in entry.value) {
        socket.on(entry.key, handler);
      }
    }
  }
}
