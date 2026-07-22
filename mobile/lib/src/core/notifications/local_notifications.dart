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

  /// Накопленные строки по каждому диалогу — сообщения одного человека
  /// складываются стопкой в ОДНО уведомление (как в Telegram).
  static final Map<String, List<String>> _convLines = {};

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

  /// Уведомление о сообщении в диалоге: обновляет ОДНУ карточку со
  /// стопкой последних строк. Каждое новое сообщение снова показывает
  /// уведомление, даже если предыдущее смахнули.
  static Future<void> showMessage({
    required String conversationId,
    required String sender,
    required String text,
    String? payload,
  }) async {
    if (!_ready) await init();
    final lines = _convLines.putIfAbsent(conversationId, () => <String>[]);
    lines.add(text);
    if (lines.length > 7) lines.removeAt(0);
    final details = NotificationDetails(
      android: AndroidNotificationDetails(
        _channel.id,
        _channel.name,
        channelDescription: _channel.description,
        importance: Importance.high,
        priority: Priority.high,
        icon: '@mipmap/ic_launcher',
        styleInformation: InboxStyleInformation(
          List<String>.from(lines),
          contentTitle: sender,
          summaryText: lines.length > 1 ? 'Сообщений: ${lines.length}' : null,
        ),
      ),
    );
    await _plugin.show(
      _conversationNotificationId(conversationId),
      sender,
      text,
      details,
      payload: payload,
    );
  }

  /// Убрать уведомления диалога из шторки и сбросить стопку
  /// (вызывается при открытии чата).
  static Future<void> clearConversation(String conversationId) async {
    _convLines.remove(conversationId);
    if (!_ready) return;
    await _plugin.cancel(_conversationNotificationId(conversationId));
  }

  /// Стабильный ID на диалог, смещён на 0x10000, чтобы не пересекаться
  /// с ID из show() (_counter % 1000).
  static int _conversationNotificationId(String conversationId) =>
      0x10000 + (conversationId.hashCode & 0xFFFF);
}
