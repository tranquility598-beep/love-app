import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/network/love_api.dart';
import '../../core/realtime/love_socket.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_search_field.dart';
import '../../widgets/love_surface.dart';
import '../chat/chat_models.dart';
import '../chat/chat_screen.dart';
import '../shell/screen_frame.dart';

class ConversationsScreen extends StatefulWidget {
  const ConversationsScreen({
    required this.api,
    required this.socket,
    super.key,
  });

  final LoveApi api;
  final LoveSocket socket;

  @override
  State<ConversationsScreen> createState() => _ConversationsScreenState();
}

class _ConversationsScreenState extends State<ConversationsScreen>
    with WidgetsBindingObserver {
  final _searchController = TextEditingController();

  /// Live presence overrides received over the socket (userId -> status).
  final _liveStatus = <String, String>{};

  List<Map<String, dynamic>>? _conversations;
  String? _error;
  Timer? _refreshDebounce;
  String _query = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _load();
    // Live updates: presence dots and new conversations/messages appear
    // without reloading the tab.
    widget.socket.on('user:status', _onUserStatus);
    widget.socket.on('dm:new_message', _onDmActivity);
    // Пока приложение было свёрнуто, сокет молчал: превью и счётчики
    // непрочитанного остались вчерашними. Перечитываем список, когда связь
    // возвращается.
    widget.socket.addConnectListener(_onSocketConnected);
  }

  /// Вернулись в приложение — список мог устареть, пока сокет был мёртв.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _conversations != null) {
      unawaited(_silentRefresh());
    }
  }

  void _onSocketConnected() {
    if (mounted && _conversations != null) unawaited(_silentRefresh());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    widget.socket.off('user:status', _onUserStatus);
    widget.socket.off('dm:new_message', _onDmActivity);
    widget.socket.removeConnectListener(_onSocketConnected);
    _refreshDebounce?.cancel();
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return ScreenFrame(
      title: 'беседы',
      trailing: IconButton(
        tooltip: 'Новая беседа',
        onPressed: _openStartDmSheet,
        color: context.palette.textSecondary,
        iconSize: 22,
        icon: const Icon(Icons.edit_square),
      ),
      child: Column(
        children: [
          LoveSearchField(
            controller: _searchController,
            onChanged: (value) =>
                setState(() => _query = value.trim().toLowerCase()),
          ),
          Expanded(child: _body()),
        ],
      ),
    );
  }

  Widget _body() {
    final conversations = _conversations;
    if (conversations == null) {
      if (_error != null) {
        return ListView(
          padding: const EdgeInsets.only(top: 60),
          children: [
            EmptyState(
              icon: Icons.wifi_off_rounded,
              title: 'Не удалось загрузить',
              message: _error!,
              action: FilledButton(
                onPressed: _load,
                child: const Text('Повторить'),
              ),
            ),
          ],
        );
      }
      return const Center(child: CircularProgressIndicator());
    }
    final filtered = _filter(conversations);
    return RefreshIndicator(
      onRefresh: _silentRefresh,
      child: filtered.isEmpty
          ? ListView(
              padding: const EdgeInsets.only(top: 60),
              children: [
                EmptyState(
                  icon: Icons.chat_bubble_outline,
                  title: _query.isEmpty
                      ? 'Диалогов пока нет'
                      : 'Ничего не найдено',
                  message: _query.isEmpty
                      ? 'Найдите пользователя и начните личный чат.'
                      : 'Попробуйте другой запрос.',
                  action: _query.isEmpty
                      ? FilledButton.icon(
                          onPressed: _openStartDmSheet,
                          icon: const Icon(Icons.edit_square, size: 18),
                          label: const Text('Новая беседа'),
                        )
                      : null,
                ),
              ],
            )
          : ListView.builder(
              padding: const EdgeInsets.fromLTRB(8, 4, 8, 24),
              itemCount: filtered.length,
              itemBuilder: (context, index) {
                final conversation = filtered[index];
                final other = _otherParticipant(conversation);
                final title = userDisplayName(other);
                final last = conversation['lastMessage'];
                final preview = last is Map ? asText(last['content'], '') : '';
                return _ConversationTile(
                  title: title,
                  subtitle: preview,
                  status: _statusOf(other),
                  imageUrl: other?['avatar']?.toString(),
                  unread: _unreadCount(conversation) > 0,
                  timeLabel: _timeLabel(last),
                  onTap: () => _openConversation(conversation, title),
                );
              },
            ),
    );
  }

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  Future<void> _load() async {
    setState(() {
      _error = null;
    });
    try {
      final items = await widget.api.conversations();
      if (!mounted) return;
      setState(() => _conversations = items);
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    }
  }

  /// Refreshes the list without dropping the current data (no flicker).
  Future<void> _silentRefresh() async {
    try {
      final items = await widget.api.conversations();
      if (!mounted) return;
      setState(() => _conversations = items);
    } catch (_) {
      // Keep showing the current data.
    }
  }

  // -------------------------------------------------------------------------
  // Socket events
  // -------------------------------------------------------------------------

  void _onDmActivity(dynamic data) {
    // New message in any DM: refresh previews/unread and pick up brand-new
    // conversations started by other users. Debounced to batch bursts.
    _refreshDebounce?.cancel();
    _refreshDebounce = Timer(const Duration(milliseconds: 350), () {
      if (mounted) _silentRefresh();
    });
  }

  void _onUserStatus(dynamic data) {
    if (data is! Map) return;
    final map = data.cast<String, dynamic>();
    var id = '';
    final rawUser = map['user'];
    if (rawUser is Map) {
      id = asId(rawUser['_id'] ?? rawUser['id']);
    }
    if (id.isEmpty) {
      id = asId(map['userId'] ?? map['_id'] ?? map['id']);
    }
    final status = asText(map['status']);
    if (id.isEmpty || status.isEmpty || !mounted) return;
    setState(() => _liveStatus[id] = status);
  }

  String? _statusOf(Map<String, dynamic>? other) {
    if (other == null) return null;
    return _liveStatus[asId(other['_id'])] ?? other['status']?.toString();
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  List<Map<String, dynamic>> _filter(List<Map<String, dynamic>> all) {
    if (_query.isEmpty) return all;
    return all.where((conversation) {
      final other = _otherParticipant(conversation);
      final name = userDisplayName(other).toLowerCase();
      final username = asText(other?['username']).toLowerCase();
      return name.contains(_query) || username.contains(_query);
    }).toList();
  }

  void _openConversation(Map<String, dynamic> conversation, String title) {
    final other = _otherParticipant(conversation);
    Navigator.of(context)
        .push(
          MaterialPageRoute<void>(
            builder: (_) => ChatScreen(
              title: title,
              conversationId: asId(conversation['_id']),
              channelId: asId(conversation['channel']),
              peerId: asId(other?['_id']),
              peerAvatar: asText(other?['avatar']),
              api: widget.api,
              socket: widget.socket,
            ),
          ),
        )
        .then((_) {
      if (mounted) _silentRefresh();
    });
  }

  Future<void> _openStartDmSheet() async {
    final conversation = await showModalBottomSheet<Map<String, dynamic>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _StartDmSheet(api: widget.api),
    );
    if (conversation == null || !mounted) return;
    await _silentRefresh();
    if (!mounted) return;
    final other = _otherParticipant(conversation);
    _openConversation(conversation, userDisplayName(other));
  }

  Map<String, dynamic>? _otherParticipant(Map<String, dynamic> conversation) {
    final currentUserId = AppSessionScope.of(context).user?.id ?? '';
    final participants = conversation['participants'];
    if (participants is! List) return null;
    for (final item in participants.whereType<Map>()) {
      final user = item.cast<String, dynamic>();
      if (asId(user['_id']) != currentUserId) return user;
    }
    for (final item in participants.whereType<Map>()) {
      return item.cast<String, dynamic>();
    }
    return null;
  }

  int _unreadCount(Map<String, dynamic> conversation) {
    final currentUserId = AppSessionScope.of(context).user?.id ?? '';
    final unread = conversation['unreadCount'];
    if (unread is! List) return 0;
    for (final item in unread.whereType<Map>()) {
      final row = item.cast<String, dynamic>();
      if (asId(row['user']) == currentUserId) {
        return int.tryParse(asText(row['count'])) ?? 0;
      }
    }
    return 0;
  }

  String _timeLabel(Object? lastMessage) {
    if (lastMessage is! Map) return '';
    final createdAt = DateTime.tryParse(asText(lastMessage['createdAt']));
    if (createdAt == null) return '';
    final local = createdAt.toLocal();
    final now = DateTime.now();
    if (local.year == now.year &&
        local.month == now.month &&
        local.day == now.day) {
      return '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
    }
    return '${local.day.toString().padLeft(2, '0')}.${local.month.toString().padLeft(2, '0')}';
  }
}

class _ConversationTile extends StatelessWidget {
  const _ConversationTile({
    required this.title,
    required this.subtitle,
    required this.onTap,
    required this.unread,
    required this.timeLabel,
    this.status,
    this.imageUrl,
  });

  final String title;
  final String subtitle;
  final String? status;
  final String? imageUrl;
  final bool unread;
  final String timeLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final hasPreview = subtitle.trim().isNotEmpty;
    return Material(
      type: MaterialType.transparency,
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(8),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          child: Row(
            children: [
              LoveAvatar(
                label: title,
                imageUrl: imageUrl,
                status: status,
                size: 38,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: TextStyle(
                              fontSize: 14.5,
                              fontWeight:
                                  unread ? FontWeight.w700 : FontWeight.w500,
                              color: context.palette.textPrimary,
                            ),
                          ),
                        ),
                        if (timeLabel.isNotEmpty) ...[
                          const SizedBox(width: 8),
                          Text(
                            timeLabel,
                            style:  TextStyle(
                              color: context.palette.textMuted,
                              fontSize: 11,
                            ),
                          ),
                        ],
                      ],
                    ),
                    if (hasPreview) ...[
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(
                          color: unread
                              ? context.palette.textSecondary
                              : context.palette.textMuted,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              if (unread) ...[
                const SizedBox(width: 8),
                Container(
                  width: 6,
                  height: 6,
                  decoration:  BoxDecoration(
                    shape: BoxShape.circle,
                    color: context.palette.textPrimary,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _StartDmSheet extends StatefulWidget {
  const _StartDmSheet({required this.api});

  final LoveApi api;

  @override
  State<_StartDmSheet> createState() => _StartDmSheetState();
}

class _StartDmSheetState extends State<_StartDmSheet> {
  final _query = TextEditingController();
  final _results = <Map<String, dynamic>>[];
  Timer? _debounce;
  bool _searching = false;
  bool _opening = false;
  String? _error;

  @override
  void dispose() {
    _debounce?.cancel();
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.viewInsetsOf(context).bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(12, 0, 12, inset + 12),
      child: LoveSurface(
        radius: 22,
        color: context.palette.surfaceStrong,
        shadow: true,
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 560),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  const Expanded(
                    child: Text(
                      'Новая беседа',
                      style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                  ),
                  IconButton(
                    tooltip: 'Закрыть',
                    onPressed:
                        _opening ? null : () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close_rounded),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _query,
                enabled: !_opening,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: 'Поиск',
                  hintText: 'username',
                  prefixIcon: const Icon(Icons.search_rounded),
                  suffixIcon: _searching
                      ? const Padding(
                          padding: EdgeInsets.all(14),
                          child: SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          ),
                        )
                      : null,
                ),
                onChanged: _onQueryChanged,
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(
                  _error!,
                  style:  TextStyle(
                    color: context.palette.textPrimary,
                    height: 1.35,
                  ),
                ),
              ],
              const SizedBox(height: 12),
              Flexible(
                child: _results.isEmpty
                    ?  Center(
                        child: Padding(
                          padding: EdgeInsets.symmetric(vertical: 28),
                          child: Text(
                            'Введите минимум 2 символа',
                            style: TextStyle(color: context.palette.textMuted),
                          ),
                        ),
                      )
                    : ListView.separated(
                        shrinkWrap: true,
                        itemCount: _results.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 8),
                        itemBuilder: (context, index) {
                          final user = _results[index];
                          final name = userDisplayName(user);
                          return _UserResultTile(
                            name: name,
                            username: asText(user['username']),
                            status: asText(user['status'], 'offline'),
                            imageUrl: asText(user['avatar']),
                            disabled: _opening,
                            onTap: () => _openUser(user),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _onQueryChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 320), () {
      _search(value);
    });
  }

  Future<void> _search(String rawQuery) async {
    final query = rawQuery.trim();
    if (query.length < 2) {
      setState(() {
        _results.clear();
        _error = null;
        _searching = false;
      });
      return;
    }
    setState(() {
      _searching = true;
      _error = null;
    });
    try {
      final users = await widget.api.searchUsers(query);
      if (!mounted || query != _query.text.trim()) return;
      setState(() {
        _results
          ..clear()
          ..addAll(users);
      });
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _openUser(Map<String, dynamic> user) async {
    setState(() {
      _opening = true;
      _error = null;
    });
    try {
      final response = await widget.api.openConversation(asId(user['_id']));
      final conversation = response['conversation'];
      if (mounted && conversation is Map) {
        Navigator.of(context).pop(conversation.cast<String, dynamic>());
      }
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _opening = false);
    }
  }
}

class _UserResultTile extends StatelessWidget {
  const _UserResultTile({
    required this.name,
    required this.username,
    required this.status,
    required this.imageUrl,
    required this.disabled,
    required this.onTap,
  });

  final String name;
  final String username;
  final String status;
  final String imageUrl;
  final bool disabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return LoveSurface(
      padding: EdgeInsets.zero,
      radius: 14,
      color: context.palette.inkA(0.035),
      child: Material(
        type: MaterialType.transparency,
        borderRadius: BorderRadius.circular(14),
        clipBehavior: Clip.antiAlias,
        child: ListTile(
          enabled: !disabled,
          onTap: disabled ? null : onTap,
          contentPadding: const EdgeInsets.symmetric(horizontal: 12),
          leading: LoveAvatar(
            label: name,
            imageUrl: imageUrl,
            status: status,
          ),
          title: Text(
            name,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w900),
          ),
          subtitle: Text(
            username.isEmpty ? status : '@$username · $status',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style:  TextStyle(color: context.palette.textMuted),
          ),
          trailing: const Icon(Icons.chevron_right_rounded),
        ),
      ),
    );
  }
}
