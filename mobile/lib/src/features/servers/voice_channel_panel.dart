import 'dart:async';

import 'package:flutter/material.dart';

import '../../core/realtime/love_socket.dart';
import '../../core/voice/channel_voice_controller.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/empty_state.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_surface.dart';
import '../../session/app_session.dart';
import '../calls/call_screen.dart';
import '../calls/call_session.dart';
import '../chat/chat_models.dart';

/// Голосовой канал сферы/комнаты с реальным звуком (WebRTC) и ч/б-стилем.
///
/// Подключением управляет глобальный [ChannelVoiceController], поэтому звук
/// не обрывается при уходе с экрана — снизу остаётся плашка «В войсе».
/// Состав канала виден и без подключения (пассивный ростер).
class ChannelVoicePanel extends StatefulWidget {
  const ChannelVoicePanel({
    required this.title,
    required this.channel,
    required this.socket,
    super.key,
  });

  /// Имя канала/комнаты на карточке подключения.
  final String title;
  final Map<String, dynamic>? channel;
  final LoveSocket socket;

  @override
  State<ChannelVoicePanel> createState() => _ChannelVoicePanelState();
}

class _ChannelVoicePanelState extends State<ChannelVoicePanel> {
  final _passiveMembers = <Map<String, dynamic>>[];
  Timer? _ticker;

  ChannelVoiceController get _voice => ChannelVoiceController.instance;
  String get _channelId => asId(widget.channel?['_id']);
  bool get _joinedHere => _voice.isActive && _voice.channelId == _channelId;

  @override
  void initState() {
    super.initState();
    _voice.init(widget.socket);
    _voice.addListener(_onVoiceChanged);
    widget.socket.on('voice:existing_members', _handleMembers);
    widget.socket.on('voice:members_update', _handleMembers);
    _syncTicker();
  }

  @override
  void didUpdateWidget(covariant ChannelVoicePanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (asId(oldWidget.channel?['_id']) != _channelId) {
      _passiveMembers.clear();
      _syncTicker();
    }
  }

  @override
  void dispose() {
    // ВАЖНО: войс НЕ завершается при закрытии экрана — он живёт в
    // ChannelVoiceController до явного «Выйти».
    _voice.removeListener(_onVoiceChanged);
    widget.socket.off('voice:existing_members', _handleMembers);
    widget.socket.off('voice:members_update', _handleMembers);
    _ticker?.cancel();
    super.dispose();
  }

  void _onVoiceChanged() {
    if (!mounted) return;
    setState(() {});
    _syncTicker();
  }

  void _syncTicker() {
    final need = _joinedHere && _voice.isConnected;
    if (need && _ticker == null) {
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    } else if (!need && _ticker != null) {
      _ticker?.cancel();
      _ticker = null;
    }
  }

  void _handleMembers(dynamic data) {
    if (data is! Map || asId(data['channelId']) != _channelId) return;
    final list = data['members'];
    if (list is! List || !mounted) return;
    setState(() {
      _passiveMembers
        ..clear()
        ..addAll(list.whereType<Map>().map(
              (item) => item.cast<String, dynamic>(),
            ));
    });
  }

  String get _durationText {
    final started = _voice.connectedAt;
    if (started == null) return '';
    final d = DateTime.now().difference(started);
    String two(int v) => v.toString().padLeft(2, '0');
    final m = d.inMinutes % 60;
    final s = d.inSeconds % 60;
    return d.inHours > 0 ? '${d.inHours}:${two(m)}:${two(s)}' : '${two(m)}:${two(s)}';
  }

  String get _statusText {
    if (!_joinedHere) return '${_members.length} в войсе';
    if (!_voice.isConnected) return 'Подключение...';
    final time = _durationText;
    return time.isEmpty ? 'Вы в войсе' : 'Вы в войсе • $time';
  }

  List<Map<String, dynamic>> get _members =>
      _joinedHere && _voice.members.isNotEmpty
          ? _voice.members
          : _passiveMembers;

  Future<void> _join() async {
    final ok = await _voice.join(id: _channelId, title: widget.title);
    if (ok && mounted) _openCallScreen();
  }

  /// Развернуть полноэкранный звонок войса.
  void _openCallScreen() {
    final user = AppSessionScope.of(context).user;
    CallScreen.open(
      context,
      ChannelCallSession(
        selfId: asText(user?.id),
        selfName: asText(user?.username),
        selfAvatar: asText(user?.avatar),
      ),
    );
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

    final members = _members;

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
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 5),
              Text(
                _statusText,
                textAlign: TextAlign.center,
                style: const TextStyle(color: LoveColors.textMuted),
              ),
              if (_voice.errorMessage != null) ...[
                const SizedBox(height: 10),
                Text(
                  _voice.errorMessage!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: LoveColors.textPrimary),
                ),
              ],
              if (!_joinedHere && _voice.isActive) ...[
                const SizedBox(height: 10),
                Text(
                  'Вы сейчас в «${_voice.channelTitle}» — при входе сюда переключитесь автоматически.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                    color: LoveColors.textMuted,
                    fontSize: 12.5,
                  ),
                ),
              ],
              const SizedBox(height: 18),
              if (!_joinedHere)
                SizedBox(
                  height: 54,
                  child: FilledButton.icon(
                    onPressed: _join,
                    style: FilledButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(27),
                      ),
                      textStyle: const TextStyle(
                        fontSize: 16,
                        fontWeight: FontWeight.w900,
                      ),
                    ),
                    icon: const Icon(Icons.keyboard_voice_rounded),
                    label: const Text('Войти в войс'),
                  ),
                )
              else
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    _RoundVoiceButton(
                      icon: _voice.muted
                          ? Icons.mic_off_rounded
                          : Icons.mic_rounded,
                      caption: _voice.muted ? 'Мик выкл' : 'Мик',
                      filled: _voice.muted,
                      onTap: _voice.toggleMute,
                    ),
                    const SizedBox(width: 22),
                    _RoundVoiceButton(
                      icon: Icons.open_in_full_rounded,
                      caption: 'Развернуть',
                      filled: false,
                      onTap: _openCallScreen,
                    ),
                    const SizedBox(width: 22),
                    _RoundVoiceButton(
                      icon: Icons.call_end_rounded,
                      caption: 'Выйти',
                      filled: true,
                      onTap: () => _voice.leave(),
                    ),
                  ],
                ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        if (members.isEmpty)
          const EmptyState(
            icon: Icons.people_outline_rounded,
            title: 'Войс пустой',
            message: 'Участники появятся здесь после подключения.',
          )
        else
          for (final member in members) ...[
            VoiceMemberTile(member: member),
            const SizedBox(height: 8),
          ],
      ],
    );
  }
}

/// Крупная круглая ч/б кнопка управления войсом.
class _RoundVoiceButton extends StatelessWidget {
  const _RoundVoiceButton({
    required this.icon,
    required this.caption,
    required this.onTap,
    this.filled = false,
  });

  final IconData icon;
  final String caption;
  final VoidCallback onTap;

  /// filled = белая кнопка с чёрной иконкой (активное состояние / «Выйти»).
  final bool filled;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            width: 60,
            height: 60,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: filled
                  ? Colors.white
                  : Colors.white.withValues(alpha: 0.06),
              border: Border.all(
                color: filled
                    ? Colors.white
                    : Colors.white.withValues(alpha: 0.16),
              ),
            ),
            child: Icon(
              icon,
              size: 26,
              color: filled ? Colors.black : Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          caption,
          style: const TextStyle(
            fontSize: 11,
            color: LoveColors.textMuted,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

/// Строка участника войса (имя + статус микрофона).
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
    final deafened = member['deafened'] == true;
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
          if (deafened) ...[
            const Icon(
              Icons.volume_off_rounded,
              color: LoveColors.textMuted,
              size: 18,
            ),
            const SizedBox(width: 8),
          ],
          Icon(
            muted ? Icons.mic_off_rounded : Icons.mic_rounded,
            color: muted ? LoveColors.textMuted : Colors.white,
            size: 18,
          ),
        ],
      ),
    );
  }
}
