import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

import '../../core/realtime/love_socket.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_surface.dart';
import '../chat/chat_models.dart';

/// Presence view + join controls for a voice channel, shared by rooms and
/// spheres. Emits `voice:join` / `voice:leave` / `voice:toggle_mute` /
/// `voice:toggle_deafen` and reflects the roster from `voice:existing_members`
/// / `voice:members_update` / `voice:left`.
///
/// NOTE: this currently mirrors the desktop presence UX (who is in the voice
/// channel + mic/deafen state). Bidirectional WebRTC audio is handled by the
/// call/voice controller and layered on separately.
class ChannelVoicePanel extends StatefulWidget {
  const ChannelVoicePanel({
    required this.title,
    required this.channel,
    required this.socket,
    super.key,
  });

  /// Display name shown on the join card (channel or room name).
  final String title;
  final Map<String, dynamic>? channel;
  final LoveSocket socket;

  @override
  State<ChannelVoicePanel> createState() => _ChannelVoicePanelState();
}

class _ChannelVoicePanelState extends State<ChannelVoicePanel> {
  final _members = <Map<String, dynamic>>[];
  bool _joined = false;
  bool _muted = false;
  bool _deafened = false;
  String? _error;

  String get _channelId => asId(widget.channel?['_id']);

  @override
  void initState() {
    super.initState();
    widget.socket.on('voice:existing_members', _handleMembers);
    widget.socket.on('voice:members_update', _handleMembers);
    widget.socket.on('voice:left', _handleLeft);
  }

  @override
  void didUpdateWidget(covariant ChannelVoicePanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (asId(oldWidget.channel?['_id']) != _channelId) {
      _members.clear();
      _joined = false;
      _error = null;
    }
  }

  @override
  void dispose() {
    if (_joined && _channelId.isNotEmpty) {
      widget.socket.emit('voice:leave', {'channelId': _channelId});
    }
    widget.socket.off('voice:existing_members', _handleMembers);
    widget.socket.off('voice:members_update', _handleMembers);
    widget.socket.off('voice:left', _handleLeft);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.channel == null || _channelId.isEmpty) {
      return const EmptyState(
        icon: Icons.mic_none_rounded,
        title: 'Войс не создан',
        message: 'Здесь нет голосового канала.',
      );
    }

    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
      children: [
        LoveSurface(
          padding: const EdgeInsets.all(18),
          radius: 18,
          color: LoveColors.surfaceStrong,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                widget.title,
                style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                _joined
                    ? 'Вы подключены к голосовому каналу'
                    : '${_members.length} в войсе',
                style: const TextStyle(color: LoveColors.textMuted),
              ),
              if (_error != null) ...[
                const SizedBox(height: 10),
                Text(
                  _error!,
                  style: const TextStyle(color: LoveColors.textPrimary),
                ),
              ],
              const SizedBox(height: 16),
              FilledButton.icon(
                onPressed: _joined ? _leave : _join,
                icon: Icon(_joined
                    ? Icons.call_end_rounded
                    : Icons.keyboard_voice_rounded),
                label: Text(_joined ? 'Отключиться' : 'Войти в войс'),
              ),
              if (_joined) ...[
                const SizedBox(height: 10),
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _toggleMute,
                        icon: Icon(
                            _muted ? Icons.mic_off_rounded : Icons.mic_rounded),
                        label: Text(_muted ? 'Микрофон выкл.' : 'Микрофон'),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _toggleDeafen,
                        icon: Icon(_deafened
                            ? Icons.volume_off_rounded
                            : Icons.volume_up_rounded),
                        label: Text(_deafened ? 'Звук выкл.' : 'Звук'),
                      ),
                    ),
                  ],
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 14),
        if (_members.isEmpty)
          const EmptyState(
            icon: Icons.people_outline_rounded,
            title: 'Войс пустой',
            message: 'Участники появятся здесь после подключения.',
          )
        else
          for (final member in _members) ...[
            VoiceMemberTile(member: member),
            const SizedBox(height: 8),
          ],
      ],
    );
  }

  Future<void> _join() async {
    setState(() => _error = null);
    final status = await Permission.microphone.request();
    if (!status.isGranted) {
      setState(() => _error = 'Нет доступа к микрофону');
      return;
    }
    if (!widget.socket.isConnected) {
      setState(() => _error = 'Сокет еще не подключен');
      return;
    }
    widget.socket.emit('voice:join', {'channelId': _channelId});
    setState(() => _joined = true);
  }

  void _leave() {
    widget.socket.emit('voice:leave', {'channelId': _channelId});
    setState(() {
      _joined = false;
      _muted = false;
      _deafened = false;
    });
  }

  void _toggleMute() {
    final next = !_muted;
    widget.socket.emit('voice:toggle_mute', {
      'channelId': _channelId,
      'muted': next,
    });
    setState(() => _muted = next);
  }

  void _toggleDeafen() {
    final next = !_deafened;
    widget.socket.emit('voice:toggle_deafen', {
      'channelId': _channelId,
      'deafened': next,
    });
    setState(() => _deafened = next);
  }

  void _handleMembers(dynamic data) {
    if (data is! Map || asId(data['channelId']) != _channelId) return;
    final members = data['members'];
    if (members is! List || !mounted) return;
    setState(() {
      _members
        ..clear()
        ..addAll(members.whereType<Map>().map(
              (item) => item.cast<String, dynamic>(),
            ));
    });
  }

  void _handleLeft(dynamic data) {
    if (data is! Map || asId(data['channelId']) != _channelId || !mounted) {
      return;
    }
    setState(() {
      _joined = false;
      _muted = false;
      _deafened = false;
    });
  }
}

class VoiceMemberTile extends StatelessWidget {
  const VoiceMemberTile({required this.member, super.key});

  final Map<String, dynamic> member;

  @override
  Widget build(BuildContext context) {
    final user = member['user'] is Map
        ? (member['user'] as Map).cast<String, dynamic>()
        : member;
    final name = userDisplayName(user);
    final muted = member['muted'] == true || member['isMuted'] == true;
    return LoveSurface(
      padding: const EdgeInsets.all(12),
      radius: 14,
      color: Colors.white.withValues(alpha: 0.035),
      child: Row(
        children: [
          LoveAvatar(
            label: name,
            imageUrl: asText(user['avatar']),
            size: 36,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
          ),
          Icon(
            muted ? Icons.mic_off_rounded : Icons.mic_rounded,
            color: LoveColors.textMuted,
            size: 18,
          ),
        ],
      ),
    );
  }
}
