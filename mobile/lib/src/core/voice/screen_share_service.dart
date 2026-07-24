import 'package:flutter/services.dart';

/// Нативный foreground-сервис для активной демонстрации экрана Android.
///
/// Порядок критичен на Android 14–16:
/// 1. flutter_webrtc getDisplayMedia показывает системный picker и создаёт
///    настоящий MediaProjection token;
/// 2. только затем [start] поднимает сервис типа mediaProjection.
///
/// Запуск сервиса раньше первого шага приводит к SecurityException и убийству
/// процесса. flutter_background здесь намеренно НЕ используется: он не умеет
/// работать с токеном MediaProjection.
class ScreenShareService {
  ScreenShareService._();

  static const _channel = MethodChannel('love_mobile/screen_share_service');

  static Future<void> start() async {
    await _channel.invokeMethod<void>('start');
  }

  static Future<void> stop() async {
    try {
      await _channel.invokeMethod<void>('stop');
    } on PlatformException {
      // Сервис мог быть уже остановлен системой/пользователем.
    }
  }
}
