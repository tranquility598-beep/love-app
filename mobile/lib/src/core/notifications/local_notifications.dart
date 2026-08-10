import 'dart:ui';

import 'package:flutter_local_notifications/flutter_local_notifications.dart';

/// Имя порта, через который фоновый изолят передаёт нажатия кнопок
/// уведомлений в основной изолят (слушает CallCenter).
const String kLoveCallActionPort = 'love_call_actions';

/// Обработчик кнопок уведомлений без открытия приложения
/// (showsUserInterface: false). Работает в ОТДЕЛЬНОМ изоляте, поэтому
/// не трогает состояние напрямую, а шлёт событие через IsolateNameServer.
@pragma('vm:entry-point')
void loveNotificationBackgroundHandler(NotificationResponse response) {
  final action = response.actionId;
  if (action == null || action.isEmpty) return;
  final port = IsolateNameServer.lookupPortByName(kLoveCallActionPort);
  port?.send('$action|${response.payload ?? ''}');
}

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

  /// Кнопки уведомлений, ОТКРЫВАЮЩИЕ приложение (сейчас — только
  /// «Принять» у входящего звонка). Остальные кнопки (микрофон,
  /// завершить, отклонить) работают БЕЗ открытия приложения — через
  /// [loveNotificationBackgroundHandler] и порт [kLoveCallActionPort].
  static void Function(String actionId, String? payload)? onAction;

  /// Накопленные строки по каждому диалогу — сообщения одного человека
  /// складываются стопкой в ОДНО уведомление (как в Telegram).
  static final Map<String, List<String>> _convLines = {};

  static const _incomingCallId = 0x21001;
  static const _ongoingCallId = 0x21002;

  static const AndroidNotificationChannel _channel = AndroidNotificationChannel(
    'love_messages',
    'Сообщения и события',
    description: 'Новые сообщения, упоминания, заявки в друзья',
    importance: Importance.high,
  );

  static const AndroidNotificationChannel _callChannel =
      AndroidNotificationChannel(
    'love_calls',
    'Звонки',
    description: 'Входящие звонки и звонок в процессе',
    importance: Importance.max,
  );

  static Future<void> init() async {
    if (_ready) return;
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const settings = InitializationSettings(android: android);
    await _plugin.initialize(
      settings,
      onDidReceiveNotificationResponse: (response) {
        final action = response.actionId;
        if (action != null && action.isNotEmpty) {
          onAction?.call(action, response.payload);
        } else {
          onTap?.call(response.payload);
        }
      },
      onDidReceiveBackgroundNotificationResponse:
          loveNotificationBackgroundHandler,
    );
    final android_ = _plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    await android_?.createNotificationChannel(_channel);
    await android_?.createNotificationChannel(_callChannel);
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
  /// стопкой последних строк.
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
          summaryText:
              lines.length > 1 ? 'Сообщений: ${lines.length}' : null,
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

  /// Убрать уведомления диалога из шторки (при открытии чата).
  static Future<void> clearConversation(String conversationId) async {
    _convLines.remove(conversationId);
    if (!_ready) return;
    await _plugin.cancel(_conversationNotificationId(conversationId));
  }

  // ── Звонки ──

  /// Входящий звонок: полноэкранное уведомление с «Принять»/«Отклонить».
  /// «Принять» открывает приложение (полноэкранный звонок),
  /// «Отклонить» отрабатывает БЕЗ открытия приложения.
  static Future<void> showIncomingCall({
    required String caller,
    String? payload,
  }) async {
    if (!_ready) await init();
    final details = NotificationDetails(
      android: AndroidNotificationDetails(
        _callChannel.id,
        _callChannel.name,
        channelDescription: _callChannel.description,
        importance: Importance.max,
        priority: Priority.max,
        category: AndroidNotificationCategory.call,
        fullScreenIntent: true,
        ongoing: true,
        autoCancel: false,
        icon: '@mipmap/ic_launcher',
        actions: const [
          AndroidNotificationAction(
            'call_accept',
            'Принять',
            showsUserInterface: true,
          ),
          AndroidNotificationAction(
            'call_decline',
            'Отклонить',
            showsUserInterface: false,
            cancelNotification: true,
          ),
        ],
      ),
    );
    await _plugin.show(
      _incomingCallId,
      caller,
      'Входящий звонок',
      details,
      payload: payload,
    );
  }

  /// Звонок/войс идёт: несмахиваемое уведомление с кнопками микрофона и
  /// завершения. Кнопки работают БЕЗ открытия приложения: нажал —
  /// микрофон выключился, текст/кнопка в уведомлении обновились.
  /// Обновляется без звука (onlyAlertOnce).
  static Future<void> showOngoingCall({
    required String peer,
    required bool muted,
    String? body,
    String? payload,
  }) async {
    if (!_ready) await init();
    final details = NotificationDetails(
      android: AndroidNotificationDetails(
        _callChannel.id,
        _callChannel.name,
        channelDescription: _callChannel.description,
        importance: Importance.low,
        priority: Priority.low,
        category: AndroidNotificationCategory.call,
        ongoing: true,
        autoCancel: false,
        onlyAlertOnce: true,
        usesChronometer: true,
        icon: '@mipmap/ic_launcher',
        actions: [
          AndroidNotificationAction(
            'call_mute',
            muted ? 'Вкл. микрофон' : 'Выкл. микрофон',
            showsUserInterface: false,
          ),
          const AndroidNotificationAction(
            'call_hangup',
            'Завершить',
            showsUserInterface: false,
            cancelNotification: true,
          ),
        ],
      ),
    );
    await _plugin.show(
      _ongoingCallId,
      peer,
      body ??
          (muted ? 'Звонок идёт · микрофон выключен' : 'Звонок идёт'),
      details,
      payload: payload,
    );
  }

  /// Пропущенный звонок.
  static Future<void> showMissedCall(String name) =>
      show(title: 'Пропущенный звонок', body: name);

  static Future<void> cancelIncomingCall() async {
    if (!_ready) return;
    await _plugin.cancel(_incomingCallId);
  }

  static Future<void> cancelOngoingCall() async {
    if (!_ready) return;
    await _plugin.cancel(_ongoingCallId);
  }

  /// Стабильный ID на диалог, смещён на 0x10000, чтобы не пересекаться
  /// с ID из show() (_counter % 1000) и ID звонков (0x21001/0x21002).
  static int _conversationNotificationId(String conversationId) =>
      0x10000 + (conversationId.hashCode & 0xFFFF);
}
