import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// System-tray notifications for realtime events while the app process is alive
/// (foreground or briefly backgrounded). For delivery when the app is fully
/// killed, FCM push is required (separate integration).
class LocalNotifications {
  LocalNotifications._();

  static final FlutterLocalNotificationsPlugin _plugin =
      FlutterLocalNotificationsPlugin();
  static bool _ready = false;
  static int _counter = 0;
  static void Function(String? payload)? onTap;

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'love_messages',
    'Сообщения и события',
    description: 'Новые сообщения, упоминания, заявки в друзья и звонки',
    importance: Importance.high,
  );

  static Future<void> init() async {
    if (_ready) return;
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const settings = InitializationSettings(android: android);
    await _plugin.initialize(
      settings,
      onDidReceiveNotificationResponse: (response) =>
          onTap?.call(response.payload),
    );
    final android_ = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await android_?.createNotificationChannel(_channel);
    await android_?.requestNotificationsPermission();
    _ready = true;
  }

  static Future<void> show({
    required String title,
    String? body,
    String? payload,
  }) async {
    if (!_ready) await init();
    final details = NotificationDetails(
      android: AndroidNotificationDetails(
        _channel.id,
        _channel.name,
        channelDescription: _channel.description,
        importance: Importance.high,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
      ),
    );
    await _plugin.show(_counter++ % 1000, title, body, details,
        payload: payload);
  }
}
