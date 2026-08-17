import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/network/love_api.dart';
import '../../core/realtime/love_socket.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/async_value_view.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_pill_tabs.dart';
import '../../widgets/love_search_field.dart';
import '../../widgets/love_surface.dart';
import '../chat/chat_models.dart';
import '../chat/chat_screen.dart';
import '../shell/screen_frame.dart';

class FriendsScreen extends StatefulWidget {
  const FriendsScreen({required this.api, required this.socket, super.key});

  final LoveApi api;
  final LoveSocket socket;

  @override
  State<FriendsScreen> createState() => _FriendsScreenState();
}

class _FriendsScreenState extends State<FriendsScreen> {
  late Future<Map<String, dynamic>> _future;
  Map<String, dynamic> _data = const {};
  final _search = TextEditingController();
  String _query = '';
  int _tab = 1; // 0=online, 1=all, 2=requests

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  void _load() {
    _future = widget.api.friends()
      ..then((data) {
        if (mounted) setState(() => _data = data);
      });
  }

  List<Map<String, dynamic>> _friends() => _list(_data['friends']);
  List<Map<String, dynamic>> _received() => _list(_data['requestsReceived']);
  List<Map<String, dynamic>> _sent() => _list(_data['requestsSent']);

  int get _onlineCount =>
      _friends().where((f) => asText(f['status']) == 'online').length;

  @override
  Widget build(BuildContext context) {
    final requestsCount = _received().length + _sent().length;
    return ScreenFrame(
      title: 'Друзья',
      child: Column(
        children: [
          const SizedBox(height: 12),
          LovePillTabs(
            tabs: [
              LovePillTab('В сети', count: _onlineCount),
              LovePillTab('Все', count: _friends().length),
              LovePillTab('Запросы',
                  count: requestsCount, showDot: _received().isNotEmpty),
              const LovePillTab('Добавить'),
            ],
            selected: _tab,
            onSelected: (index) {
              if (index == 3) {
                _openAddFriend();
              } else {
                setState(() => _tab = index);
              }
            },
          ),
          LoveSearchField(
            controller: _search,
            hint: 'Поиск по имени…',
            onChanged: (v) => setState(() => _query = v.trim().toLowerCase()),
          ),
          Expanded(
            child: AsyncValueView<Map<String, dynamic>>(
              future: _future,
              onRetry: _refresh,
              builder: (context, _) => RefreshIndicator(
                onRefresh: _refresh,
                child: _buildList(),
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildList() {
    if (_tab == 2) {
      final received = _filter(_received(), fromField: true);
      final sent = _filter(_sent(), fromField: true);
      if (received.isEmpty && sent.isEmpty) {
        return _empty(
          title: 'Заявок нет',
          message: 'Входящие и исходящие заявки в друзья появятся здесь.',
        );
      }
      return ListView(
        padding: const EdgeInsets.only(top: 8, bottom: 24),
        children: [
          if (received.isNotEmpty) ...[
            const _CategoryHeader('Входящие запросы'),
            for (final request in received)
              _RequestTile(
                user: _from(request),
                incoming: true,
                onAccept: () => _accept(asId(_from(request)['_id'])),
                onReject: () => _decline(asId(_from(request)['_id'])),
              ),
          ],
          if (sent.isNotEmpty) ...[
            const _CategoryHeader('Исходящие запросы'),
            for (final request in sent)
              _RequestTile(
                user: _to(request),
                incoming: false,
                onCancel: () => _decline(asId(_to(request)['_id'])),
              ),
          ],
        ],
      );
    }

    var friends = _friends();
    if (_tab == 0) {
      friends = friends.where((f) => asText(f['status']) == 'online').toList();
    }
    friends = _filter(friends);

    if (friends.isEmpty) {
      return _empty(
        title: _tab == 0 ? 'Никого нет в сети' : 'Пока нет друзей',
        message: _tab == 0
            ? 'Как только кто-то из друзей появится онлайн — увидите здесь.'
            : 'Добавьте первого человека, чтобы писать, звонить и видеть статус.',
        action: _tab == 0
            ? null
            : FilledButton(
                onPressed: _openAddFriend,
                child: const Text('Добавить'),
              ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.only(top: 6, bottom: 24),
      itemCount: friends.length,
      itemBuilder: (context, index) {
        final friend = friends[index];
        return _FriendTile(
          friend: friend,
          onChat: () => _openChat(friend),
          onCall: () => _openChat(friend),
          onRemove: () => _confirmRemove(friend),
        );
      },
    );
  }

  Widget _empty({required String title, required String message, Widget? action}) {
    return ListView(
      padding: const EdgeInsets.only(top: 48),
      children: [
        EmptyState(
          icon: Icons.person_add_alt,
          title: title,
          message: message,
          action: action,
        ),
      ],
    );
  }

  List<Map<String, dynamic>> _filter(List<Map<String, dynamic>> items,
      {bool fromField = false}) {
    if (_query.isEmpty) return items;
    return items.where((item) {
      final user = fromField ? (_from(item)) : item;
      final name = userDisplayName(user).toLowerCase();
      final username = asText(user['username']).toLowerCase();
      return name.contains(_query) || username.contains(_query);
    }).toList();
  }

  Map<String, dynamic> _from(Map<String, dynamic> request) {
    final from = request['from'];
    if (from is Map) return from.cast<String, dynamic>();
    return request;
  }

  Map<String, dynamic> _to(Map<String, dynamic> request) {
    final to = request['to'];
    if (to is Map) return to.cast<String, dynamic>();
    return request;
  }

  List<Map<String, dynamic>> _list(Object? value) {
    if (value is! List) return const [];
    return value
        .whereType<Map>()
        .map((item) => item.cast<String, dynamic>())
        .toList();
  }

  Future<void> _openChat(Map<String, dynamic> friend) async {
    try {
      final response = await widget.api.openConversation(asId(friend['_id']));
      final conversation = response['conversation'];
      if (!mounted || conversation is! Map) return;
      final convo = conversation.cast<String, dynamic>();
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChatScreen(
            title: userDisplayName(friend),
            conversationId: asId(convo['_id']),
            channelId: asId(convo['channel']),
            peerId: asId(friend['_id']),
            peerAvatar: asText(friend['avatar']),
            api: widget.api,
            socket: widget.socket,
          ),
        ),
      );
    } catch (error) {
      _snack(error.toString());
    }
  }

  Future<void> _confirmRemove(Map<String, dynamic> friend) async {
    final name = userDisplayName(friend);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: context.palette.bgTertiary,
        title: const Text('Удалить из друзей?'),
        content: Text('$name будет удалён из вашего списка друзей.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(context, true),
            style: TextButton.styleFrom(foregroundColor: context.palette.danger),
            child: const Text('Удалить'),
          ),
        ],
      ),
    );
    if (confirmed == true) {
      try {
        await widget.api.removeFriend(asId(friend['_id']));
        await _refresh();
      } catch (error) {
        _snack(error.toString());
      }
    }
  }

  Future<void> _accept(String userId) async {
    try {
      await widget.api.acceptFriend(userId);
      await _refresh();
    } catch (error) {
      _snack(error.toString());
    }
  }

  Future<void> _decline(String userId) async {
    try {
      await widget.api.declineFriend(userId);
      await _refresh();
    } catch (error) {
      _snack(error.toString());
    }
  }

  Future<void> _openAddFriend() async {
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      backgroundColor: Colors.transparent,
      builder: (context) => _AddFriendSheet(api: widget.api),
    );
    if (mounted) await _refresh();
  }

  Future<void> _refresh() async {
    final next = widget.api.friends();
    setState(() => _future = next);
    final data = await next;
    if (mounted) setState(() => _data = data);
  }

  void _snack(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

class _CategoryHeader extends StatelessWidget {
  const _CategoryHeader(this.text);
  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 12),
      child: Text(
        text.toUpperCase(),
        style:  TextStyle(
          color: context.palette.inkA(0.35),
          fontSize: 11,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.8,
        ),
      ),
    );
  }
}

class _FriendTile extends StatelessWidget {
  const _FriendTile({
    required this.friend,
    required this.onChat,
    required this.onCall,
    required this.onRemove,
  });

  final Map<String, dynamic> friend;
  final VoidCallback onChat;
  final VoidCallback onCall;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final name = userDisplayName(friend);
    final online = asText(friend['status']) == 'online';
    final statusText = () {
      final custom = asText(friend['customStatus']).trim();
      if (custom.isNotEmpty) return custom;
      return online ? 'В сети' : 'Не в сети';
    }();
    return Material(
      type: MaterialType.transparency,
      child: InkWell(
        onTap: onChat,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
          child: Row(
            children: [
              LoveAvatar(
                label: name,
                imageUrl: asText(friend['avatar']),
                status: online ? 'online' : 'offline',
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
                        fontWeight: FontWeight.w500,
                        color: context.palette.textPrimary,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      statusText,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style:  TextStyle(
                        fontSize: 12,
                        color: context.palette.inkA(0.3),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _FriendActionButton(icon: Icons.chat_bubble_outline_rounded, onTap: onChat),
              const SizedBox(width: 6),
              _FriendActionButton(icon: Icons.call_outlined, onTap: onCall),
              const SizedBox(width: 6),
              _FriendActionButton(icon: Icons.close_rounded, onTap: onRemove),
            ],
          ),
        ),
      ),
    );
  }
}

/// Web `.friend-actions-inline .action-btn`: 32×32, radius 8, faint fill+border.
class _FriendActionButton extends StatelessWidget {
  const _FriendActionButton({
    required this.icon,
    required this.onTap,
    this.emphasized = false,
  });

  final IconData icon;
  final VoidCallback onTap;
  final bool emphasized;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: emphasized
          ? context.palette.inkA(0.04)
          : context.palette.inkA(0.02),
      borderRadius: BorderRadius.circular(8),
      child: InkWell(
        borderRadius: BorderRadius.circular(8),
        onTap: onTap,
        child: Container(
          width: 32,
          height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(8),
            border: Border.all(
              color: emphasized
                  ? context.palette.inkA(0.2)
                  : context.palette.inkA(0.08),
            ),
          ),
          child: Icon(
            icon,
            size: 16,
            color: emphasized ? context.palette.accent :  context.palette.inkA(0.5),
          ),
        ),
      ),
    );
  }
}

class _RequestTile extends StatelessWidget {
  const _RequestTile({
    required this.user,
    required this.incoming,
    this.onAccept,
    this.onReject,
    this.onCancel,
  });

  final Map<String, dynamic> user;
  final bool incoming;
  final VoidCallback? onAccept;
  final VoidCallback? onReject;
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final name = userDisplayName(user);
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        children: [
          LoveAvatar(
            label: name,
            imageUrl: asText(user['avatar']),
            status: 'offline',
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
                    fontWeight: FontWeight.w500,
                    color: context.palette.textPrimary,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  incoming ? 'Хочет добавить вас' : 'Заявка отправлена',
                  style:  TextStyle(fontSize: 12, color: context.palette.inkA(0.3)),
                ),
              ],
            ),
          ),
          const SizedBox(width: 8),
          if (incoming) ...[
            _FriendActionButton(
              icon: Icons.check_rounded,
              onTap: onAccept ?? () {},
              emphasized: true,
            ),
            const SizedBox(width: 6),
            _FriendActionButton(icon: Icons.close_rounded, onTap: onReject ?? () {}),
          ] else
            _FriendActionButton(icon: Icons.close_rounded, onTap: onCancel ?? () {}),
        ],
      ),
    );
  }
}

/// Add-friend bottom sheet — search users and send friend requests.
class _AddFriendSheet extends StatefulWidget {
  const _AddFriendSheet({required this.api});
  final LoveApi api;

  @override
  State<_AddFriendSheet> createState() => _AddFriendSheetState();
}

class _AddFriendSheetState extends State<_AddFriendSheet> {
  final _query = TextEditingController();
  final _results = <Map<String, dynamic>>[];
  final _sentTo = <String>{};
  Timer? _debounce;
  bool _searching = false;
  String? _status;

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
        color:  context.palette.surfaceStrong,
        borderColor: context.palette.borderActive,
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 20),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxHeight: 560),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text(
                'Кого ищем?',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontSize: 24,
                  fontWeight: FontWeight.w700,
                  letterSpacing: -0.2,
                ),
              ),
              const SizedBox(height: 18),
              TextField(
                controller: _query,
                autofocus: true,
                decoration: const InputDecoration(
                  hintText: 'Никнейм пользователя',
                  prefixIcon: Icon(Icons.search_rounded),
                ),
                onChanged: _onChanged,
              ),
              if (_status != null) ...[
                const SizedBox(height: 10),
                Text(
                  _status!,
                  textAlign: TextAlign.center,
                  style:  TextStyle(color: context.palette.textSecondary, fontSize: 12.5),
                ),
              ],
              const SizedBox(height: 12),
              Flexible(
                child: _results.isEmpty
                    ? Center(
                        child: Padding(
                          padding: const EdgeInsets.symmetric(vertical: 28),
                          child: Text(
                            _searching ? 'Ищем…' : 'Введите минимум 2 символа',
                            style:  TextStyle(color: context.palette.textMuted),
                          ),
                        ),
                      )
                    : ListView.builder(
                        shrinkWrap: true,
                        itemCount: _results.length,
                        itemBuilder: (context, index) {
                          final user = _results[index];
                          final id = asId(user['_id']);
                          final sent = _sentTo.contains(id);
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 6),
                            child: Row(
                              children: [
                                LoveAvatar(
                                  label: userDisplayName(user),
                                  imageUrl: asText(user['avatar']),
                                  size: 40,
                                ),
                                const SizedBox(width: 12),
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        userDisplayName(user),
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                            fontWeight: FontWeight.w500),
                                      ),
                                      Text(
                                        '@${asText(user['username'])}',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style:  TextStyle(
                                          color: context.palette.textMuted,
                                          fontSize: 12,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                sent
                                    ?  Padding(
                                        padding: EdgeInsets.symmetric(horizontal: 8),
                                        child: Text('Отправлено',
                                            style: TextStyle(
                                                color: context.palette.textMuted,
                                                fontSize: 12)),
                                      )
                                    : OutlinedButton(
                                        onPressed: () => _add(user),
                                        style: OutlinedButton.styleFrom(
                                          minimumSize: const Size(0, 38),
                                          padding: const EdgeInsets.symmetric(
                                              horizontal: 16),
                                        ),
                                        child: const Text('Добавить'),
                                      ),
                              ],
                            ),
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

  void _onChanged(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 320), () => _run(value));
  }

  Future<void> _run(String raw) async {
    final query = raw.trim();
    if (query.length < 2) {
      setState(() {
        _results.clear();
        _status = null;
        _searching = false;
      });
      return;
    }
    setState(() => _searching = true);
    try {
      final users = await widget.api.searchUsers(query);
      if (!mounted || query != _query.text.trim()) return;
      setState(() {
        _results
          ..clear()
          ..addAll(users);
        _status = users.isEmpty ? 'Никого не нашли' : null;
      });
    } catch (error) {
      if (mounted) setState(() => _status = error.toString());
    } finally {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _add(Map<String, dynamic> user) async {
    final id = asId(user['_id']);
    try {
      await widget.api.sendFriendRequest(id);
      if (mounted) {
        setState(() {
          _sentTo.add(id);
          _status = 'Заявка отправлена';
        });
      }
    } catch (error) {
      if (mounted) setState(() => _status = error.toString());
    }
  }
}
