import 'package:flutter/services.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

/// Правильный запуск демонстрации экрана на Android 14+ (targetSdk 34-36).
///
/// Железный порядок (менять нельзя — иначе SecurityException):
///   1. Helper.requestCapturePermission() — системный диалог согласия.
///      Согласие выдаёт app-op android:project_media, без него FGS типа
///      mediaProjection не имеет права стартовать.
///   2. startScreenShareService — нативный FGS с типом
///      FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION. Метод возвращается ТОЛЬКО
///      после того, как startForeground() реально выполнился (никаких
///      Future.delayed / "подождём 900мс").
///   3. getDisplayMedia() — теперь система видит живой FGS нужного типа.
class ScreenShareManager {
  static const MethodChannel _channel = MethodChannel('love/screen_share');

  static bool _serviceRunning = false;

  /// Запускает демонстрацию экрана и возвращает готовый MediaStream.
  /// Бросает ScreenShareException с понятной причиной, если что-то не так.
  static Future<MediaStream> startScreenShare({bool withAudio = false}) async {
    // ШАГ 1: согласие пользователя ДО всего остального.
    bool granted;
    try {
      granted = await Helper.requestCapturePermission();
    } on MissingPluginException {
      throw ScreenShareException(
        'flutter_webrtc слишком старый: нет Helper.requestCapturePermission(). '
        'Обнови flutter_webrtc до >= 0.11.0 в pubspec.yaml.',
      );
    }
    if (!granted) {
      throw ScreenShareException('Пользователь отклонил захват экрана');
    }

    // ШАГ 2: стартуем FGS и ЖДЁМ подтверждения из нативного кода.
    final bool started =
        await _channel.invokeMethod<bool>('startScreenShareService') ?? false;
    if (!started) {
      throw ScreenShareException(
        'Foreground-сервис демонстрации не смог стартовать',
      );
    }
    _serviceRunning = true;

    // ШАГ 3: только теперь можно захватывать экран.
    try {
      final MediaStream stream =
          await navigator.mediaDevices.getDisplayMedia(<String, dynamic>{
        'video': true,
        'audio': withAudio,
      });

      // Если пользователь остановит демку через системный UI —
      // погасим сервис сами.
      for (final track in stream.getVideoTracks()) {
        track.onEnded = () {
          stopScreenShare();
        };
      }
      return stream;
    } catch (e) {
      // getDisplayMedia не взлетел — сервис больше не нужен.
      await stopScreenShare();
      rethrow;
    }
  }

  /// Останавливает foreground-сервис демонстрации.
  /// Вызывать при завершении демки и при выходе из звонка.
  static Future<void> stopScreenShare() async {
    if (!_serviceRunning) return;
    _serviceRunning = false;
    try {
      await _channel.invokeMethod('stopScreenShareService');
    } catch (_) {
      // Сервис уже мог быть остановлен системой — не критично.
    }
  }
}

class ScreenShareException implements Exception {
  ScreenShareException(this.message);
  final String message;

  @override
  String toString() => 'ScreenShareException: $message';
}
