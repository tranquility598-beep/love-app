import 'package:flutter_test/flutter_test.dart';
import 'package:love_mobile/src/core/realtime/app_events.dart';

void main() {
  final events = AppEvents.instance;

  setUp(events.clearNotifications);

  test('notifications are deduplicated and can be marked read', () {
    events.addNotification({'_id': 'n1', 'title': 'Первый', 'read': false});
    events
        .addNotification({'_id': 'n1', 'title': 'Обновлённый', 'read': false});

    expect(events.notifications, hasLength(1));
    expect(events.notifications.single['title'], 'Обновлённый');

    events.markRead('n1');
    expect(events.notifications.single['read'], isTrue);
  });

  test('support event exposes pending case once', () {
    events.supportChanged(caseId: 'case-1');

    expect(events.takePendingCase(), 'case-1');
    expect(events.takePendingCase(), isNull);
  });
}
