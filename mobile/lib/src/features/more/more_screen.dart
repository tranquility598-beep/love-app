import 'package:flutter/material.dart';

import '../../session/app_session.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/love_surface.dart';
import '../settings/settings_screen.dart';
import '../shell/screen_frame.dart';
import 'love_hub_screen.dart';
import 'profile_screen.dart';

class MoreScreen extends StatelessWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final session = AppSessionScope.of(context);
    final user = session.user;
    return ScreenFrame(
      title: 'Еще',
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 104),
        children: [
          LoveSurface(
            padding: const EdgeInsets.all(16),
            radius: 18,
            color: context.palette.surfaceStrong,
            child: Row(
              children: [
                LoveAvatar(
                  label: user?.displayName ?? 'Love user',
                  imageUrl: user?.avatar,
                  size: 58,
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        user?.displayName ?? 'Love user',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          fontSize: 18,
                          fontWeight: FontWeight.w900,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        _profileLine(user),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:  TextStyle(
                          color: context.palette.textMuted,
                          fontSize: 13,
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          _MoreTile(
            icon: Icons.person_outline_rounded,
            title: 'Профиль',
            subtitle: _profileSubtitle(user),
            onTap: () => _open(context, const ProfileScreen()),
          ),
          _MoreTile(
            icon: Icons.auto_awesome_rounded,
            title: 'Love Hub',
            subtitle: 'Центр сообщества, идеи и обновления',
            onTap: () => _open(context, const LoveHubScreen()),
          ),
          _MoreTile(
            icon: Icons.tune_rounded,
            title: 'Настройки',
            subtitle: _settingsSubtitle(user),
            onTap: () => _open(context, const SettingsScreen(showBack: true)),
          ),
        ],
      ),
    );
  }

  String _profileLine(dynamic user) {
    if (user == null) return 'mobile session';
    final status = user.customStatus?.toString().trim();
    if (status != null && status.isNotEmpty) return status;
    return user.email ?? 'mobile session';
  }

  String _profileSubtitle(dynamic user) {
    if (user == null) return 'Аккаунт и публичная карточка';
    final friends = user.friends.length;
    final servers = user.servers.length;
    return 'Друзей: $friends · Пространств: $servers';
  }

  String _settingsSubtitle(dynamic user) {
    if (user == null) return 'Безопасность, профиль, сессия и выход';
    final methods = [
      if (user.hasPassword) 'пароль',
      if (user.hasGoogle) 'Google',
      if (user.twoFactorEnabled) '2FA',
    ];
    return methods.isEmpty
        ? 'Безопасность, профиль, сессия и выход'
        : 'Вход: ${methods.join(', ')}';
  }

  void _open(BuildContext context, Widget screen) {
    Navigator.of(context).push(MaterialPageRoute(builder: (_) => screen));
  }
}

class _MoreTile extends StatelessWidget {
  const _MoreTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: LoveSurface(
        padding: EdgeInsets.zero,
        radius: 16,
        color: context.palette.surfaceStrong,
        child: Material(
          type: MaterialType.transparency,
          borderRadius: BorderRadius.circular(16),
          clipBehavior: Clip.antiAlias,
          child: ListTile(
            onTap: onTap,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 6,
            ),
            leading: Container(
              width: 42,
              height: 42,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: context.palette.inkA(0.07),
                border: Border.all(color: context.palette.border),
              ),
              child: Icon(icon, size: 21),
            ),
            title: Text(
              title,
              style: const TextStyle(fontWeight: FontWeight.w900),
            ),
            subtitle: Text(
              subtitle,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style:  TextStyle(color: context.palette.textMuted),
            ),
            trailing: const Icon(Icons.chevron_right_rounded),
          ),
        ),
      ),
    );
  }
}
