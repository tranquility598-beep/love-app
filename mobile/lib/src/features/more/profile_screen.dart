import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/network/love_api.dart';
import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_background.dart';
import '../../widgets/profile_music_player.dart';
import '../../widgets/staff_role_badge.dart';
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
            color: context.palette.textSecondary,
            icon: const Icon(Icons.arrow_back_ios_new_rounded, size: 20),
          ),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(20, 24, 20, 32),
            children: [
              Center(
                  child: _Avatar(
                user: user,
                uploading: _uploadingAvatar,
                onEdit: () => _changeAvatar(session),
              )),
              const SizedBox(height: 18),
              Text(
                user?.displayName ?? 'Love user',
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
                '@${(user?.username ?? 'love').toUpperCase()}',
                textAlign: TextAlign.center,
                style:  TextStyle(
                  fontFamily: LoveFonts.mono,
                  fontSize: 11,
                  letterSpacing: 1.5,
                  color: context.palette.textMuted,
                ),
              ),
              if (staffRoleLabel(user?.role).isNotEmpty) ...[
                const SizedBox(height: 10),
                Center(child: StaffRoleLabel(role: user?.role)),
              ],
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
              if (musicTitle.isNotEmpty ||
                  musicUrl.isNotEmpty ||
                  listening.isNotEmpty)
                _Section(
                  label: 'Сейчас слушает',
                  child: musicUrl.isEmpty
                      ? Text(
                          listening.isNotEmpty ? listening : musicTitle,
                          style:  TextStyle(
                              color: context.palette.textPrimary, fontSize: 15),
                        )
                      : ProfileMusicPlayer(
                          title: musicTitle.isNotEmpty
                              ? musicTitle
                              : 'Музыка профиля',
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
  const _Avatar(
      {required this.user, required this.uploading, required this.onEdit});

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
                  color: context.palette.inkA(0.10),
                  blurRadius: 34,
                  spreadRadius: 2,
                ),
              ],
            ),
            child: LoveAvatar(
              label: user?.displayName ?? 'Love user',
              imageUrl: user?.avatar,
              size: 110,
              borderColor: context.palette.borderActive,
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
              color:  context.palette.surfaceHighlight,
              shape:  CircleBorder(
                side: BorderSide(color: context.palette.bgAndroid, width: 2),
              ),
              clipBehavior: Clip.antiAlias,
              child: InkWell(
                onTap: uploading ? null : onEdit,
                child:  SizedBox(
                  width: 34,
                  height: 34,
                  child: Icon(Icons.photo_camera_outlined,
                      size: 17, color: context.palette.textPrimary),
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
        color: context.palette.inkA(0.05),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: context.palette.border),
      ),
      child: Text(
        text,
        style:  TextStyle(
          color: context.palette.textSecondary,
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
      children:  [
        Expanded(child: Divider(color: context.palette.border, height: 1)),
        Padding(
          padding: EdgeInsets.symmetric(horizontal: 12),
          child: Icon(Icons.favorite, size: 12, color: context.palette.textMuted),
        ),
        Expanded(child: Divider(color: context.palette.border, height: 1)),
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
