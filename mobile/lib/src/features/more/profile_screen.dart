import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:just_audio/just_audio.dart';

import '../../config/app_config.dart';
import '../../core/network/love_api.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_background.dart';
import '../../widgets/love_surface.dart';
import '../chat/chat_models.dart';
import '../settings/settings_screen.dart';
import '../shell/screen_frame.dart';

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  final _api = LoveApi();
  bool _uploadingAvatar = false;

  @override
  Widget build(BuildContext context) {
    final session = AppSessionScope.of(context);
    final user = session.user;
    final mood = _text(user?.mood);
    final status = _text(user?.customStatus);
    final bio = _text(user?.bio);
    final musicTitle = _text(user?.musicTitle);
    final musicUrl = _text(user?.musicUrl);
    final listening = _text(user?.listening);
    final hobbies = [
      for (final hobby in user?.hobbies ?? const [])
        asText(hobby['text'], asText(hobby['icon'])),
    ].where((item) => item.isNotEmpty).toList();

    return Scaffold(
      body: LoveBackground(
        child: ScreenFrame(
          title: 'профиль',
          leading: IconButton(
            tooltip: 'Назад',
            onPressed: () => Navigator.of(context).pop(),
            color: LoveColors.textSecondary,
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          ),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
            children: [
              Center(child: _Avatar(
                user: user,
                uploading: _uploadingAvatar,
                onEdit: () => _changeAvatar(session),
              )),
              const SizedBox(height: 18),
              Text(
                user?.displayName ?? 'Love user',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontFamily: LoveFonts.serif,
                  fontStyle: FontStyle.italic,
                  fontSize: 26,
                  fontWeight: FontWeight.w500,
                  color: LoveColors.textPrimary,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                '@${(user?.username ?? 'love').toUpperCase()}',
                textAlign: TextAlign.center,
                style: const TextStyle(
                  fontFamily: LoveFonts.mono,
                  fontSize: 11,
                  letterSpacing: 1.5,
                  color: LoveColors.textMuted,
                ),
              ),
              if (status.isNotEmpty) ...[
                const SizedBox(height: 14),
                Center(child: _StatusPill(text: status)),
              ],
              const SizedBox(height: 22),
              const _HeartDivider(),
              const SizedBox(height: 22),
              OutlinedButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(
                    builder: (_) => const SettingsScreen(showBack: true),
                  ),
                ),
                icon: const Icon(Icons.tune_rounded, size: 18),
                label: const Text('Настроить профиль'),
              ),
              if (bio.isNotEmpty)
                _Section(
                  label: 'О себе',
                  child: Text(
                    bio,
                    style: const TextStyle(
                      color: LoveColors.textSecondary,
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
                    style: const TextStyle(
                      color: LoveColors.textPrimary,
                      fontSize: 15,
                    ),
                  ),
                ),
              if (musicTitle.isNotEmpty || musicUrl.isNotEmpty || listening.isNotEmpty)
                _Section(
                  label: 'Сейчас слушает',
                  child: _NowPlaying(
                    title: musicTitle.isNotEmpty
                        ? musicTitle
                        : (listening.isNotEmpty ? listening : 'Музыка профиля'),
                    onPlay: musicUrl.isEmpty
                        ? null
                        : () => _openMusicPlayer(
                              context,
                              musicTitle.isNotEmpty ? musicTitle : 'Музыка профиля',
                              musicUrl,
                            ),
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
          ),
        ),
      ),
    );
  }

  Future<void> _changeAvatar(AppSession session) async {
    final messenger = ScaffoldMessenger.of(context);
    try {
      final picker = ImagePicker();
      final file = await picker.pickImage(
        source: ImageSource.gallery,
        maxWidth: 1024,
        maxHeight: 1024,
        imageQuality: 88,
      );
      if (file == null) return;
      setState(() => _uploadingAvatar = true);
      final response = await _api.uploadAvatar(file.path);
      final userJson = response['user'] ?? response;
      if (userJson is Map) {
        session.updateUserFromJson(userJson.cast<String, dynamic>());
      }
      messenger.showSnackBar(
        const SnackBar(content: Text('Аватар обновлён')),
      );
    } catch (error) {
      messenger.showSnackBar(SnackBar(content: Text('Не удалось: $error')));
    } finally {
      if (mounted) setState(() => _uploadingAvatar = false);
    }
  }
}

String _text(String? value) => value?.trim() ?? '';

class _Avatar extends StatelessWidget {
  const _Avatar({required this.user, required this.uploading, required this.onEdit});

  final dynamic user;
  final bool uploading;
  final VoidCallback onEdit;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 116,
      height: 116,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              boxShadow: [
                BoxShadow(
                  color: Colors.white.withValues(alpha: 0.10),
                  blurRadius: 34,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: LoveAvatar(
              label: user?.displayName ?? 'Love user',
              imageUrl: user?.avatar,
              size: 110,
              borderColor: LoveColors.borderActive,
            ),
          ),
          if (uploading)
            const SizedBox(
              width: 28,
              height: 28,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          Positioned(
            right: 2,
            bottom: 2,
            child: Material(
              color: const Color(0xFF1A1A1A),
              shape: const CircleBorder(
                side: BorderSide(color: LoveColors.bgAndroid, width: 2),
              ),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: uploading ? null : onEdit,
                child: const SizedBox(
                  width: 34,
                  height: 34,
                  child: Icon(Icons.photo_camera_outlined,
                      size: 17, color: LoveColors.textPrimary),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: LoveColors.border),
      ),
      child: Text(
        text,
        style: const TextStyle(
          color: LoveColors.textSecondary,
          fontSize: 13,
        ),
      ),
    );
  }
}

class _HeartDivider extends StatelessWidget {
  const _HeartDivider();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: const [
        Expanded(child: Divider(color: LoveColors.border, height: 1)),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 12),
          child: Icon(Icons.favorite, size: 12, color: LoveColors.textMuted),
        ),
        Expanded(child: Divider(color: LoveColors.border, height: 1)),
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
          Text(label.toUpperCase(), style: LoveText.monoLabel),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}

class _NowPlaying extends StatelessWidget {
  const _NowPlaying({required this.title, this.onPlay});

  final String title;
  final VoidCallback? onPlay;

  @override
  Widget build(BuildContext context) {
    return LoveSurface(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      radius: 14,
      child: Row(
        children: [
          const Icon(Icons.graphic_eq_rounded, size: 20, color: LoveColors.textSecondary),
          const SizedBox(width: 12),
          Expanded(
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontWeight: FontWeight.w500, fontSize: 14),
            ),
          ),
          if (onPlay != null)
            IconButton(
              onPressed: onPlay,
              iconSize: 22,
              color: LoveColors.textPrimary,
              icon: const Icon(Icons.play_circle_outline_rounded),
            ),
        ],
      ),
    );
  }
}

Future<void> _openMusicPlayer(BuildContext context, String title, String url) {
  return showModalBottomSheet<void>(
    context: context,
    useSafeArea: true,
    backgroundColor: Colors.transparent,
    builder: (_) => _MusicPlayerSheet(title: title, url: url),
  );
}

class _MusicPlayerSheet extends StatefulWidget {
  const _MusicPlayerSheet({required this.title, required this.url});

  final String title;
  final String url;

  @override
  State<_MusicPlayerSheet> createState() => _MusicPlayerSheetState();
}

class _MusicPlayerSheetState extends State<_MusicPlayerSheet> {
  late final AudioPlayer _player = AudioPlayer();
  bool _loading = true;
  bool _playing = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _player.playerStateStream.listen((state) {
      if (mounted) setState(() => _playing = state.playing);
    });
    _start();
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
      child: LoveSurface(
        padding: const EdgeInsets.all(18),
        radius: 22,
        color: const Color(0xF2161616),
        borderColor: LoveColors.borderActive,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Container(
                  width: 46,
                  height: 46,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.08),
                    border: Border.all(color: LoveColors.border),
                  ),
                  child: const Icon(Icons.music_note_rounded),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    widget.title,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                  ),
                ),
                IconButton(
                  tooltip: 'Закрыть',
                  onPressed: () => Navigator.of(context).pop(),
                  icon: const Icon(Icons.close_rounded),
                ),
              ],
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: const TextStyle(color: LoveColors.textPrimary)),
            ],
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: _loading ? null : _toggle,
              icon: _loading
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2, color: Colors.black),
                    )
                  : Icon(_playing ? Icons.pause_rounded : Icons.play_arrow_rounded),
              label: Text(_playing ? 'Пауза' : 'Слушать'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _start() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await _player.setUrl(AppConfig.mediaUrl(widget.url) ?? widget.url);
      await _player.play();
    } catch (error) {
      if (mounted) setState(() => _error = error.toString());
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggle() async {
    if (_playing) {
      await _player.pause();
    } else {
      await _player.play();
    }
  }
}
