import 'package:flutter/material.dart';

import '../../core/network/love_api.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_avatar.dart';
import '../chat/chat_models.dart';
import 'settings_widgets.dart';

class BlockedUsersSettings extends StatefulWidget {
  const BlockedUsersSettings({required this.api, super.key});
  final LoveApi api;

  @override
  State<BlockedUsersSettings> createState() => _BlockedUsersSettingsState();
}

class _BlockedUsersSettingsState extends State<BlockedUsersSettings>
    with WidgetsBindingObserver {
  List<Map<String, dynamic>> _users = [];
  String? _owner;
  String? _pending;
  String? _error;
  int _revision = 0;
  bool _loading = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final id = AppSessionScope.of(context).user?.id;
    if (_owner != id) {
      _owner = id;
      _users = [];
      _pending = null;
      _error = null;
      _loading = false;
      ++_revision;
      if (id != null) _load();
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && _owner != null) _load();
  }

  @override
  void dispose() {
    ++_revision;
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  Future<void> _load() async {
    if (_pending != null || _owner == null) return;
    final revision = ++_revision;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final users = await widget.api.blockedUsers();
      if (!mounted || revision != _revision) return;
      setState(() => _users = users);
    } catch (error) {
      if (mounted && revision == _revision) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted && revision == _revision) setState(() => _loading = false);
    }
  }

  Future<void> _unblock(Map<String, dynamic> user) async {
    if (_pending != null || _loading) return;
    final id = asId(user['_id']);
    if (id.isEmpty) return;
    final revision = ++_revision;
    setState(() {
      _pending = id;
      _error = null;
    });
    try {
      await widget.api.unblockUser(id);
      if (!mounted || revision != _revision) return;
      setState(() => _users.removeWhere((item) => asId(item['_id']) == id));
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Пользователь разблокирован')));
    } catch (error) {
      if (mounted && revision == _revision) {
        setState(() => _error = error.toString());
      }
    } finally {
      if (mounted && revision == _revision) setState(() => _pending = null);
    }
  }

  @override
  Widget build(BuildContext context) => SettingsCard(
        title: 'Заблокированные',
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text(
                      'Люди, которых вы заблокировали. Вы не можете писать и звонить друг другу или отправлять заявки в друзья.',
                      style: TextStyle(
                          color: context.palette.textMuted, height: 1.5)),
                  Align(
                      alignment: Alignment.centerRight,
                      child: TextButton.icon(
                        onPressed: _loading || _pending != null ? null : _load,
                        icon: const Icon(Icons.refresh_rounded, size: 18),
                        label: Text(_loading
                            ? 'Загружаем…'
                            : 'Обновить (${_users.length})'),
                      )),
                  if (_loading) const LinearProgressIndicator(minHeight: 2),
                  if (_error != null)
                    Text(_error!,
                        style: TextStyle(color: context.palette.textSecondary)),
                  if (!_loading && _error == null && _users.isEmpty)
                    const Padding(
                      padding: EdgeInsets.symmetric(vertical: 16),
                      child: Text('Вы никого не заблокировали.'),
                    ),
                  for (final user in _users)
                    Padding(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      child: Row(children: [
                        LoveAvatar(
                            label: userDisplayName(user),
                            imageUrl: asText(user['avatar']),
                            size: 40),
                        const SizedBox(width: 10),
                        Expanded(
                            child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                              Text(userDisplayName(user),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: const TextStyle(
                                      fontWeight: FontWeight.w600)),
                              Text('@${asText(user['username'])}',
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: TextStyle(
                                      color: context.palette.textMuted,
                                      fontSize: 12)),
                            ])),
                        const SizedBox(width: 4),
                        TextButton(
                            onPressed: _pending != null || _loading
                                ? null
                                : () => _unblock(user),
                            child: Text(_pending == asId(user['_id'])
                                ? 'Снимаем…'
                                : 'Разблокировать')),
                      ]),
                    ),
                  Text(
                      'Разблокировка не возвращает человека в друзья — понадобится новая заявка.',
                      style: TextStyle(
                          color: context.palette.textMuted,
                          fontSize: 12,
                          height: 1.5)),
                ]),
          ),
        ],
      );
}
