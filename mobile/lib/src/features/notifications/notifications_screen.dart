import 'package:flutter/material.dart';

import '../../config/app_config.dart';
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

  /// Личные сообщения от одного человека сходятся в одну карточку: десять
  /// сообщений подряд раньше давали десять одинаковых карточек. Список приходит
  /// от новых к старым, поэтому первый элемент группы — самый свежий, его время
  /// и попадает в заголовок.
  static List<List<Map<String, dynamic>>> _groupNotifications(
    List<Map<String, dynamic>> list,
  ) {
    final groups = <List<Map<String, dynamic>>>[];
    final byActor = <String, List<Map<String, dynamic>>>{};

    for (final n in list) {
      if (asText(n['type']) != 'new_dm') {
        groups.add([n]);
        continue;
      }
      final actor = asId(n['actor']);
      final key = actor.isNotEmpty ? actor : asText(n['actorName']);
      final existing = byActor[key];
      if (existing != null) {
        existing.add(n);
        continue;
      }
      final group = [n];
      byActor[key] = group;
      groups.add(group);
    }

    return groups;
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
                final groups = _groupNotifications(items);
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
                                  style:  TextStyle(
                                    color: context.palette.inkA(0.35),
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
                          itemCount: groups.length,
                          separatorBuilder: (_, __) =>
                              const SizedBox(height: 16),
                          itemBuilder: (context, index) {
                            final group = groups[index];
                            final head = group.first;
                            return _NotificationCard(
                              items: group,
                              onTap: () => _tapNotification(group),
                              onClose: () => _dismiss(group),
                              onAccept: _isFriendRequest(head)
                                  ? () => _accept(head)
                                  : null,
                              onReject: _isFriendRequest(head)
                                  ? () => _reject(head)
                                  : null,
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

  // Карточка может закрывать несколько уведомлений (сгруппированная личка), так
  // что читаем и стираем всё, что она показывает, иначе счётчик непрочитанных
  // останется висеть.
  void _markRead(List<Map<String, dynamic>> group) {
    for (final n in group) {
      if (asBool(n['read'])) continue;
      final id = asId(n['_id']);
      if (id.isEmpty) continue;
      widget.events.markRead(id);
      widget.api.markNotificationsRead(id: id);
    }
  }

  void _tapNotification(List<Map<String, dynamic>> group) {
    _markRead(group);
    final caseId = asId(group.first['caseId']);
    if (caseId.isNotEmpty) widget.onOpenCase(caseId);
  }

  Future<void> _dismiss(List<Map<String, dynamic>> group) async {
    var failed = false;
    for (final n in group) {
      final id = asId(n['_id']);
      if (id.isEmpty) continue;
      widget.events.removeNotification(id);
      try {
        await widget.api.deleteNotification(id);
      } catch (_) {
        failed = true;
      }
    }
    if (failed) _snack('Уведомление стёрто только на этом устройстве');
  }

  Future<void> _accept(Map<String, dynamic> n) async {
    try {
      await widget.api.acceptFriend(asId(n['actor']));
      await _dismiss([n]);
    } catch (error) {
      _snack(error.toString());
    }
  }

  Future<void> _reject(Map<String, dynamic> n) async {
    try {
      await widget.api.declineFriend(asId(n['actor']));
      await _dismiss([n]);
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
        foregroundColor: context.palette.textSecondary,
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

/// Сколько превью показываем внутри сгруппированной карточки.
const _notifPreviewLimit = 3;

/// Значок вместо картинки, когда во вложении не фото. previewKind приходит с
/// сервера (server/utils/messagePreview.js).
const _notifKindIcons = <String, IconData>{
  'image': Icons.image_outlined,
  'video': Icons.videocam_outlined,
  'voice': Icons.mic_none_rounded,
  'audio': Icons.music_note_outlined,
  'file': Icons.insert_drive_file_outlined,
  'mixed': Icons.attach_file_rounded,
};

String _messagesWord(int count) {
  final mod100 = count % 100;
  final mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'сообщений';
  if (mod10 == 1) return 'сообщение';
  if (mod10 >= 2 && mod10 <= 4) return 'сообщения';
  return 'сообщений';
}

class _NotificationCard extends StatelessWidget {
  const _NotificationCard({
    required this.items,
    required this.onTap,
    required this.onClose,
    this.onAccept,
    this.onReject,
  });

  /// Одно или несколько уведомлений, которые показывает карточка. Первое —
  /// самое свежее: список приходит от новых к старым.
  final List<Map<String, dynamic>> items;
  final VoidCallback onTap;
  final VoidCallback onClose;
  final VoidCallback? onAccept;
  final VoidCallback? onReject;

  @override
  Widget build(BuildContext context) {
    final head = items.first;
    final unread = items.any((n) => !asBool(n['read']));
    final name = asText(head['actorName'], 'Love');
    final time = _relativeTime(head['createdAt']);
    final count = items.length;
    final shown = items.take(_notifPreviewLimit).toList();
    final hidden = count - shown.length;

    return Material(
      color: unread
          ? context.palette.inkA(0.025)
          : context.palette.inkA(0.015),
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
                  ? context.palette.inkA(0.06)
                  : context.palette.inkA(0.03),
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
                    imageUrl: asText(head['actorAvatar']),
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
                          style:  TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: context.palette.textPrimary,
                          ),
                        ),
                        if (time.isNotEmpty || count > 1) ...[
                          const SizedBox(height: 3),
                          Row(
                            children: [
                              if (time.isNotEmpty)
                                Text(
                                  time,
                                  style: LoveText.monoTime(context.palette),
                                ),
                              if (count > 1) ...[
                                if (time.isNotEmpty) const SizedBox(width: 8),
                                Flexible(
                                  child: _CountBadge(
                                    count: count,
                                    unread: unread,
                                  ),
                                ),
                              ],
                            ],
                          ),
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
                        color: context.palette.accent,
                        boxShadow: [
                          BoxShadow(
                            color: context.palette.glowA(0.7),
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
              for (var i = 0; i < shown.length; i++) ...[
                if (i == 0)
                  const SizedBox(height: 8)
                else
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    child: Container(
                      height: 1,
                      color: context.palette.inkA(0.05),
                    ),
                  ),
                _NotifPreviewRow(
                  notification: shown[i],
                  unread: unread,
                  // «Новое событие» вместо пустоты нужно только когда карточка
                  // одна: в группе пустая строка и так подпёрта соседями.
                  fallback: count == 1 ? 'Новое событие' : '',
                ),
              ],
              if (hidden > 0) ...[
                const SizedBox(height: 8),
                Text(
                  'и ещё $hidden ${_messagesWord(hidden)}',
                  style: LoveText.monoTime(context.palette),
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
                          backgroundColor: context.palette.inkA(0.08),
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
                          backgroundColor: context.palette.inkA(0.02),
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

class _CountBadge extends StatelessWidget {
  const _CountBadge({required this.count, required this.unread});
  final int count;
  final bool unread;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        color: context.palette.inkA(unread ? 0.12 : 0.08),
      ),
      child: Text(
        '$count ${_messagesWord(count)}',
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: TextStyle(
          fontFamily: LoveFonts.mono,
          fontSize: 10,
          letterSpacing: 0.2,
          color: unread
              ? context.palette.textPrimary
              : context.palette.inkA(0.55),
        ),
      ),
    );
  }
}

/// Одна строка превью: миниатюра, если в сообщении было фото, иначе значок
/// вложения. Раньше в карточку уходил только текст, поэтому сообщение из одной
/// фотографии выглядело как имя и пустота.
class _NotifPreviewRow extends StatelessWidget {
  const _NotifPreviewRow({
    required this.notification,
    required this.unread,
    this.fallback = '',
  });

  final Map<String, dynamic> notification;
  final bool unread;
  final String fallback;

  @override
  Widget build(BuildContext context) {
    final kind = asText(notification['previewKind'], 'text');
    final thumb = AppConfig.mediaUrl(asText(notification['previewImage']));
    final text = asText(notification['preview'], fallback);
    final icon = thumb == null ? _notifKindIcons[kind] : null;

    final textStyle = TextStyle(
      fontSize: 13.5,
      height: 1.55,
      color: unread
          ? context.palette.textPrimary
          : context.palette.inkA(0.75),
    );

    if (thumb == null && icon == null) {
      if (text.isEmpty) return const SizedBox.shrink();
      return Text(text, style: textStyle);
    }

    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        if (thumb != null)
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: Image.network(
              thumb,
              width: 44,
              height: 44,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Container(
                width: 44,
                height: 44,
                color: context.palette.inkA(0.06),
                child: Icon(
                  Icons.image_outlined,
                  size: 16,
                  color: context.palette.inkA(0.35),
                ),
              ),
            ),
          )
        else
          Container(
            width: 26,
            height: 26,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(8),
              color: context.palette.inkA(0.07),
            ),
            child: Icon(icon, size: 14, color: context.palette.inkA(0.6)),
          ),
        if (text.isNotEmpty) ...[
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: textStyle,
            ),
          ),
        ],
      ],
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
      child:  SizedBox(
        width: 32,
        height: 32,
        child: Icon(Icons.close_rounded, size: 16, color: context.palette.inkA(0.25)),
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
