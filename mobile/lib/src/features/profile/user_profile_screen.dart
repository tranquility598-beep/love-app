import 'package:flutter/material.dart';

import '../../core/network/love_api.dart';
import '../../core/realtime/love_socket.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_background.dart';
import '../../widgets/profile_music_player.dart';
import '../../widgets/staff_role_badge.dart';
import '../chat/chat_models.dart';
import '../chat/chat_screen.dart';
import '../shell/screen_frame.dart';

/// Public profile of another user — opened by tapping an avatar/name in
/// chats. Server: `GET /api/users/:id` (safe public fields only).
class UserProfileScreen extends StatefulWidget {
  const UserProfileScreen({
    required this.userId,
    this.api,
    this.socket,
    this.initialName,
    this.initialAvatar,
    super.key,
  });

  final String userId;
  final LoveApi? api;

  /// When provided, the «Написать» button is shown and opens a DM.
  final LoveSocket? socket;
  final String? initialName;
  final String? initialAvatar;

  @override
  State<UserProfileScreen> createState() => _UserProfileScreenState();
}

class _UserProfileScreenState extends State<UserProfileScreen> {
  late final LoveApi _api = widget.api ?? LoveApi();
  Map<String, dynamic>? _user;
  bool _loading = true;
  bool _openingDm = false;
  bool _sendingFriend = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final response = await _api.userProfile(widget.userId);
      final raw = response['user'] ?? response;
      if (raw is! Map) throw const FormatException('Профиль не найден');
      if (!mounted) return;
      setState(() {
        _user = raw.cast<String, dynamic>();
        _loading = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
        _loading = false;
      });
    }
  }

  String get _name {
    final user = _user;
    if (user != null) return userDisplayName(user);
    return widget.initialName ?? 'Love user';
  }

  String get _avatar {
    final user = _user;
    if (user != null) return asText(user['avatar']);
    return widget.initialAvatar ?? '';
  }

  Future<void> _openDm() async {
    final socket = widget.socket;
    if (socket == null || _openingDm) return;
    setState(() => _openingDm = true);
    try {
      final response = await _api.openConversation(widget.userId);
      final convRaw = response['conversation'] ?? response;
      final conv = convRaw is Map
          ? convRaw.cast<String, dynamic>()
          : <String, dynamic>{};
      final conversationId = asId(conv['_id']);
      if (conversationId.isEmpty) {
        throw const FormatException('Не удалось открыть диалог');
      }
      final channelId = asId(conv['channel']);
      if (!mounted) return;
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ChatScreen(
            title: _name,
            api: _api,
            socket: socket,
            conversationId: conversationId,
            channelId: channelId.isEmpty ? null : channelId,
            peerId: widget.userId,
            peerAvatar: _avatar,
          ),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    } finally {
      if (mounted) setState(() => _openingDm = false);
    }
  }

  Future<void> _addFriend() async {
    if (_sendingFriend) return;
    setState(() => _sendingFriend = true);
    try {
      final response = await _api.sendFriendRequest(widget.userId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(asText(response['message'], 'Заявка отправлена')),
        ),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error.toString())),
      );
    } finally {
      if (mounted) setState(() => _sendingFriend = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LoveBackground(
        child: ScreenFrame(
          title: 'профиль',
          leading: IconButton(
            tooltip: 'Назад',
            onPressed: () => Navigator.of(context).pop(),
            color: context.palette.textSecondary,
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          ),
          child: _body(),
        ),
      ),
    );
  }

  Widget _body() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(strokeWidth: 2));
    }
    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                _error!,
                textAlign: TextAlign.center,
                style:  TextStyle(color: context.palette.textMuted),
              ),
              const SizedBox(height: 14),
              OutlinedButton.icon(
                onPressed: _load,
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Повторить'),
              ),
            ],
          ),
        ),
      );
    }

    final user = _user ?? const <String, dynamic>{};
    final username = asText(user['username'], 'love');
    final status = asText(user['customStatus']).trim();
    final bio = asText(user['bio']).trim();
    final mood = asText(user['mood']).trim();
    final listening = asText(user['listening']).trim();
    final musicRaw = user['music'];
    var musicUrl = '';
    var musicTitle = '';
    if (musicRaw is Map) {
      musicUrl = asText(musicRaw['url']).trim();
      musicTitle = asText(musicRaw['title']).trim();
    }
    final hobbies = <String>[];
    final hobbiesRaw = user['hobbies'];
    if (hobbiesRaw is List) {
      for (final item in hobbiesRaw) {
        if (item is Map) {
          final text = asText(item['text'], asText(item['icon'])).trim();
          if (text.isNotEmpty) hobbies.add(text);
        }
      }
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
      children: [
        Center(
          child: LoveAvatar(
            label: _name,
            imageUrl: _avatar,
            size: 110,
            borderColor: context.palette.borderActive,
          ),
        ),
        const SizedBox(height: 18),
        Text(
          _name,
          textAlign: TextAlign.center,
          style:  TextStyle(
            fontFamily: LoveFonts.serif,
            fontStyle: FontStyle.italic,
            fontSize: 26,
            fontWeight: FontWeight.w500,
            color: context.palette.textPrimary,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          '@${username.toUpperCase()}',
          textAlign: TextAlign.center,
          style:  TextStyle(
            fontFamily: LoveFonts.mono,
            fontSize: 11,
            letterSpacing: 1.5,
            color: context.palette.textMuted,
          ),
        ),
        if (staffRoleLabel(asText(user['role'], asText(user['staffRank'])))
            .isNotEmpty) ...[
          const SizedBox(height: 10),
          Center(
            child: StaffRoleLabel(
              role: asText(user['role'], asText(user['staffRank'])),
            ),
          ),
        ],
        if (status.isNotEmpty) ...[
          const SizedBox(height: 14),
          Center(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
              decoration: BoxDecoration(
                color: context.palette.inkA(0.05),
                borderRadius: BorderRadius.circular(999),
                border: Border.all(color: context.palette.border),
              ),
              child: Text(
                status,
                style:  TextStyle(
                  color: context.palette.textSecondary,
                  fontSize: 13,
                ),
              ),
            ),
          ),
        ],
        const SizedBox(height: 22),
        Row(
          children: [
            if (widget.socket != null) ...[
              Expanded(
                child: FilledButton.icon(
                  onPressed: _openingDm ? null : _openDm,
                  icon: _openingDm
                      ?  SizedBox(
                          width: 16,
                          height: 16,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: context.palette.onAccent,
                          ),
                        )
                      : const Icon(Icons.chat_bubble_outline_rounded, size: 18),
                  label: const Text('Написать'),
                ),
              ),
              const SizedBox(width: 10),
            ],
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _sendingFriend ? null : _addFriend,
                icon: const Icon(Icons.person_add_alt_rounded, size: 18),
                label: const Text('В друзья'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 22),
        Row(
          children:  [
            Expanded(child: Divider(color: context.palette.border, height: 1)),
            Padding(
              padding: EdgeInsets.symmetric(horizontal: 12),
              child: Icon(
                Icons.favorite,
                size: 12,
                color: context.palette.textMuted,
              ),
            ),
            Expanded(child: Divider(color: context.palette.border, height: 1)),
          ],
        ),
        if (bio.isNotEmpty)
          _Section(
            label: 'О себе',
            child: Text(
              bio,
              style:  TextStyle(
                color: context.palette.textSecondary,
                height: 1.5,
                fontSize: 14,
              ),
            ),
          ),
        if (mood.isNotEmpty)
          _Section(
            label: 'Настроение',
            child: Text(
              mood,
              style:  TextStyle(
                color: context.palette.textPrimary,
                fontSize: 15,
              ),
            ),
          ),
        if (musicUrl.isNotEmpty ||
            musicTitle.isNotEmpty ||
            listening.isNotEmpty)
          _Section(
            label: 'Сейчас слушает',
            child: musicUrl.isEmpty
                ? Text(
                    listening.isNotEmpty ? listening : musicTitle,
                    style:  TextStyle(
                      color: context.palette.textPrimary,
                      fontSize: 15,
                    ),
                  )
                : ProfileMusicPlayer(
                    title: musicTitle.isNotEmpty
                        ? musicTitle
                        : (listening.isNotEmpty ? listening : 'Музыка профиля'),
                    url: musicUrl,
                  ),
          ),
        if (hobbies.isNotEmpty)
          _Section(
            label: 'Сферы увлечений',
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final hobby in hobbies)
                  Chip(
                    label: Text(hobby),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
          ),
      ],
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.label, required this.child});

  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(), style: LoveText.monoLabel(context.palette)),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}
