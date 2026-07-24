import 'package:permission_handler/permission_handler.dart';

/// Разрешения камеры/микрофона. Вызывать ПЕРЕД getUserMedia.
///
/// pubspec.yaml:
///   permission_handler: ^11.0.0
class MediaPermissions {
  /// true = можно включать камеру.
  static Future<bool> ensureCamera() async {
    final status = await Permission.camera.status;
    if (status.isGranted) return true;

    if (status.isPermanentlyDenied) {
      // Пользователь ранее выбрал «больше не спрашивать» —
      // системный диалог больше не покажется. Ведём в настройки.
      await openAppSettings();
      return false;
    }

    final result = await Permission.camera.request();
    return result.isGranted;
  }

  /// true = можно включать микрофон.
  static Future<bool> ensureMicrophone() async {
    final status = await Permission.microphone.status;
    if (status.isGranted) return true;
    if (status.isPermanentlyDenied) {
      await openAppSettings();
      return false;
    }
    final result = await Permission.microphone.request();
    return result.isGranted;
  }

  /// Оба сразу (для видеозвонка).
  static Future<bool> ensureCameraAndMic() async {
    final statuses =
        await [Permission.camera, Permission.microphone].request();
    final cam = statuses[Permission.camera];
    final mic = statuses[Permission.microphone];
    if (cam?.isPermanentlyDenied == true ||
        mic?.isPermanentlyDenied == true) {
      await openAppSettings();
      return false;
    }
    return cam?.isGranted == true && mic?.isGranted == true;
  }
}

// Пример использования перед включением камеры:
//
// Future<void> toggleCamera() async {
//   if (!await MediaPermissions.ensureCamera()) {
//     showSnack('Нет доступа к камере — разрешите в настройках');
//     return;
//   }
//   final stream = await navigator.mediaDevices.getUserMedia({
//     'video': {'facingMode': 'user'},
//     'audio': false,
//   });
//   ...
// }
