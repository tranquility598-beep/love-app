import 'package:flutter/material.dart';

import '../../core/network/love_api.dart';
import '../../core/realtime/app_events.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_pill_tabs.dart';
import '../chat/chat_models.dart';
import '../shell/screen_frame.dart';

class NotificationsScreen extends StatefulWidget {
  const NotificationsScreen({
    required this.api,
    required this.events,
    required this.onOpenCase,
    super.key,
  });

  final LoveApi api;
  final AppEvents events;
  final ValueChanged<String> onOpenCase;

  @override
  State<NotificationsScreen> createState() => _NotificationsScreenState();
}

class _NotificationsScreenState extends State<NotificationsScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  List<Map<String, dynamic>> _items = const [];
  int _tab = 0; // 0 = normal, 1 = system

  static const _systemKeywords = [
    'call',
    'join',
    'system',
    'accept',
    'announce',
    'release',
    'update',
    'welcome',
    'support',
    'case',
    'moderation',
    'warning',
    'ban',
    'mute',
  ];

  @override
  void initState() {
    super.initState();
    widget.events.addListener(_syncEvents);
    _items = widget.events.notifications;
    _load();
  }

  @override
  void dispose() {
    widget.events.removeListener(_syncEvents);
    super.dispose();
  }

  void _syncEvents() {
    if (mounted) setState(() => _items = widget.events.notifications);
  }

  void _load() {
    _future = widget.api.notifications()
      ..then((list) {
        if (mounted) widget.events.replaceNotifications(list);
      });
  }

  bool _isSystem(Map<String, dynamic> n) {
    final type = asText(n['type']).toLowerCase();
    return _systemKeywords.any(type.contains);
  }

  @override
  Widget build(BuildContext context) {
    return ScreenFrame(
      title: 'Уведомления',
      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _HeaderTextButton(label: 'Прочитать\nвсе', onTap: _markAllRead),
          _HeaderTextButton(label: 'Очистить\nвсе', onTap: _clearAll),
        ],
      ),
      child: Column(
        children: [
          const SizedBox(height: 12),
          LovePillTabs(
            tabs: const [LovePillTab('Обычные'), LovePillTab('Системные')],
            selected: _tab,
            onSelected: (index) => setState(() => _tab = index),
          ),
          const SizedBox(height: 4),
          Expanded(
            child: AsyncValueView<List<Map<String, dynamic>>>(
              future: _future,
              onRetry: _refresh,
              builder: (context, _) {
                final items =
                    _items.where((n) => _isSystem(n) == (_tab == 1)).toList();
                return RefreshIndicator(
                  onRefresh: _refresh,
                  child: items.isEmpty
                      ? ListView(
                          children: [
                            const SizedBox(height: 120),
                            Center(
                              child: Padding(
                                padding:
                                    const EdgeInsets.symmetric(horizontal: 40),
                                child: Text(
                                  _tab == 0
                                      ? 'Ответы, упоминания, заявки в друзья и звонки появятся здесь.'
                                      : 'Системные события — принятые заявки, объявления — появятся здесь.',
                                  textAlign: TextAlign.center,
                                  style: const TextStyle(
                                    color: Color(0x59FFFFFF),
                                    fontSize: 14,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                          itemCount: items.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 16),
                          itemBuilder: (context, index) {
                            final n = items[index];
                            return _NotificationCard(
                              notification: n,
                              onTap: () => _tapNotification(n),
                              onClose: () => _dismiss(n),
                              onAccept:
                                  _isFriendRequest(n) ? () => _accept(n) : null,
                              onReject:
                                  _isFriendRequest(n) ? () => _reject(n) : null,
                            );
                          },
                        ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  bool _isFriendRequest(Map<String, dynamic> n) {
    final type = asText(n['type']).toLowerCase();
    return type.contains('friend') && type.contains('request');
  }

  void _markRead(Map<String, dynamic> n) {
    if (asBool(n['read'])) return;
    final id = asId(n['_id']);
    widget.events.markRead(id);
    widget.api.markNotificationsRead(id: id);
  }

  void _tapNotification(Map<String, dynamic> n) {
    _markRead(n);
    final caseId = asId(n['caseId']);
    if (caseId.isNotEmpty) widget.onOpenCase(caseId);
  }

  Future<void> _dismiss(Map<String, dynamic> n) async {
    final id = asId(n['_id']);
    widget.events.removeNotification(id);
    await widget.api.markNotificationsRead(id: id);
  }

  Future<void> _accept(Map<String, dynamic> n) async {
    try {
      await widget.api.acceptFriend(asId(n['actor']));
      await _dismiss(n);
    } catch (error) {
      _snack(error.toString());
    }
  }

  Future<void> _reject(Map<String, dynamic> n) async {
    try {
      await widget.api.declineFriend(asId(n['actor']));
      await _dismiss(n);
    } catch (error) {
      _snack(error.toString());
    }
  }

  Future<void> _markAllRead() async {
    widget.events.markAllRead();
    await widget.api.markNotificationsRead();
  }

  Future<void> _clearAll() async {
    final messenger = ScaffoldMessenger.of(context);
    widget.events.clearNotifications();
    await widget.api.clearNotifications();
    messenger.showSnackBar(const SnackBar(content: Text('Удалено')));
  }

  Future<void> _refresh() async {
    final next = widget.api.notifications();
    setState(() => _future = next);
    final list = await next;
    if (mounted) widget.events.replaceNotifications(list);
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context)
        .showSnackBar(SnackBar(content: Text(message)));
  }
}

class _HeaderTextButton extends StatelessWidget {
  const _HeaderTextButton({required this.label, required this.onTap});
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return TextButton(
      onPressed: onTap,
      style: TextButton.styleFrom(
        foregroundColor: LoveColors.textSecondary,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
      ),
      child: Text(
        label,
        textAlign: TextAlign.right,
        style: const TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w500,
          height: 1.2,
        ),
      ),
    );
  }
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({
    required this.notification,
    required this.onTap,
    required this.onClose,
    this.onAccept,
    this.onReject,
  });

  final Map<String, dynamic> notification;
  final VoidCallback onTap;
  final VoidCallback onClose;
  final VoidCallback? onAccept;
  final VoidCallback? onReject;

  @override
  Widget build(BuildContext context) {
    final unread = !asBool(notification['read']);
    final name = asText(notification['actorName'], 'Love');
    final body = asText(notification['preview'], 'Новое событие');
    final time = _relativeTime(notification['createdAt']);

    return Material(
      color: unread
          ? Colors.white.withValues(alpha: 0.025)
          : Colors.white.withValues(alpha: 0.015),
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: unread
                  ? Colors.white.withValues(alpha: 0.06)
                  : Colors.white.withValues(alpha: 0.03),
            ),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  LoveAvatar(
                    label: name,
                    imageUrl: asText(notification['actorAvatar']),
                    size: 44,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: LoveColors.textPrimary,
                          ),
                        ),
                        if (time.isNotEmpty) ...[
                          const SizedBox(height: 2),
                          Text(time, style: LoveText.monoTime),
                        ],
                      ],
                    ),
                  ),
                  if (unread) ...[
                    Container(
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: Colors.white,
                        boxShadow: [
                          BoxShadow(
                            color: Colors.white.withValues(alpha: 0.7),
                            blurRadius: 10,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                  ],
                  _CloseButton(onTap: onClose),
                ],
              ),
              if (body.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(
                  body,
                  style: TextStyle(
                    fontSize: 13.5,
                    height: 1.55,
                    color: unread
                        ? LoveColors.textPrimary
                        : Colors.white.withValues(alpha: 0.75),
                  ),
                ),
              ],
              if (onAccept != null) ...[
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton(
                        onPressed: onAccept,
                        style: OutlinedButton.styleFrom(
                          backgroundColor: Colors.white.withValues(alpha: 0.08),
                          minimumSize: const Size(0, 40),
                        ),
                        child: const Text('Принять'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton(
                        onPressed: onReject,
                        style: OutlinedButton.styleFrom(
                          backgroundColor: Colors.white.withValues(alpha: 0.02),
                          minimumSize: const Size(0, 40),
                        ),
                        child: const Text('Отклонить'),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _CloseButton extends StatelessWidget {
  const _CloseButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(16),
      child: const SizedBox(
        width: 32,
        height: 32,
        child: Icon(Icons.close_rounded, size: 16, color: Color(0x40FFFFFF)),
      ),
    );
  }
}

String _relativeTime(Object? raw) {
  final createdAt = DateTime.tryParse(asText(raw));
  if (createdAt == null) return '';
  final diff = DateTime.now().difference(createdAt.toLocal());
  if (diff.inMinutes < 1) return 'только что';
  if (diff.inMinutes < 60) return '${diff.inMinutes} мин назад';
  if (diff.inHours < 24) return '${diff.inHours} ч назад';
  if (diff.inDays < 7) return '${diff.inDays} дн назад';
  final d = createdAt.toLocal();
  return '${d.day.toString().padLeft(2, '0')}.${d.month.toString().padLeft(2, '0')}';
}
