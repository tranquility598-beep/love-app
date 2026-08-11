import 'package:flutter/foundation.dart';

import '../../features/chat/chat_models.dart';

class AppEvents extends ChangeNotifier {
  AppEvents._();

  static final AppEvents instance = AppEvents._();

  final List<Map<String, dynamic>> _notifications = [];
  int supportRevision = 0;
  int moderationRevision = 0;
  int devLogRevision = 0;
  int spacesRevision = 0;
  String? activeCaseId;
  String? pendingCaseId;
  Map<String, dynamic> lastSupportUpdate = const {};
  Map<String, dynamic> lastDevLogUpdate = const {};

  List<Map<String, dynamic>> get notifications =>
      List.unmodifiable(_notifications);

  void replaceNotifications(List<Map<String, dynamic>> values) {
    _notifications
      ..clear()
      ..addAll(values.map((item) => Map<String, dynamic>.from(item)));
    notifyListeners();
  }

  void addNotification(Map<String, dynamic> value) {
    final id = asId(value['_id']);
    if (id.isNotEmpty) {
      _notifications.removeWhere((item) => asId(item['_id']) == id);
    }
    _notifications.insert(0, Map<String, dynamic>.from(value));
    notifyListeners();
  }

  void markRead(String id) {
    final item = _notifications.cast<Map<String, dynamic>?>().firstWhere(
          (entry) => asId(entry?['_id']) == id,
          orElse: () => null,
        );
    if (item == null) return;
    item['read'] = true;
    notifyListeners();
  }

  void markAllRead() {
    for (final item in _notifications) {
      item['read'] = true;
    }
    notifyListeners();
  }

  void clearNotifications() {
    _notifications.clear();
    notifyListeners();
  }

  void removeNotification(String id) {
    _notifications.removeWhere((item) => asId(item['_id']) == id);
    notifyListeners();
  }

  void supportChanged({String? caseId, Map<String, dynamic>? payload}) {
    supportRevision += 1;
    lastSupportUpdate =
        payload == null ? const {} : Map<String, dynamic>.from(payload);
    if (caseId != null && caseId.isNotEmpty) pendingCaseId = caseId;
    notifyListeners();
  }

  void moderationChanged() {
    moderationRevision += 1;
    notifyListeners();
  }

  /// Список сфер и комнат изменился не с экрана сфер — например, вступили по
  /// deep link'у. Слушатели сверяют [spacesRevision] со своей копией, чтобы не
  /// перезагружать список на каждое уведомление: шина одна на всё приложение.
  void spacesChanged() {
    spacesRevision += 1;
    notifyListeners();
  }

  void devLogChanged([Map<String, dynamic>? payload]) {
    devLogRevision += 1;
    lastDevLogUpdate =
        payload == null ? const {} : Map<String, dynamic>.from(payload);
    notifyListeners();
  }

  String? takePendingCase() {
    final value = pendingCaseId;
    pendingCaseId = null;
    return value;
  }
}
