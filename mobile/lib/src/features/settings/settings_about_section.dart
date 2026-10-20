import 'package:flutter/material.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/app_config.dart';
import '../../core/network/love_api.dart';
import '../../theme/love_tokens.dart';
import '../support/support_center_screen.dart';
import 'settings_widgets.dart';

/// Same content and hierarchy as desktop: hero, six links, team, signature.
class AboutSettingsSection extends StatefulWidget {
  const AboutSettingsSection({required this.api, super.key});
  final LoveApi api;

  @override
  State<AboutSettingsSection> createState() => _AboutSettingsSectionState();
}

class _AboutSettingsSectionState extends State<AboutSettingsSection> {
  late final _info = PackageInfo.fromPlatform();

  Future<void> _open(String address) async {
    try {
      if (await launchUrl(Uri.parse(address),
          mode: LaunchMode.externalApplication)) {
        return;
      }
    } catch (_) {}
    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Не удалось открыть ссылку. Попробуйте позже.'),
      ));
    }
  }

  Widget _surface(Widget child,
          {EdgeInsets padding = const EdgeInsets.all(18)}) =>
      Container(
        padding: padding,
        decoration: BoxDecoration(
          color: context.palette.surfaceStrong,
          border: Border.all(color: context.palette.border),
          borderRadius: BorderRadius.circular(18),
        ),
        child: child,
      );

  @override
  Widget build(BuildContext context) {
    final tiles = <Widget>[
      _AboutTile(
          icon: Icons.language_rounded,
          title: 'Сайт',
          subtitle: 'loveapp.chat',
          onTap: () => _open(AppConfig.website)),
      _AboutTile(
          icon: Icons.auto_awesome_outlined,
          title: 'Что нового',
          subtitle: 'История обновлений',
          onTap: () => _open('${AppConfig.website}/changelog.html')),
      _AboutTile(
          icon: Icons.support_rounded,
          title: 'Поддержка',
          subtitle: 'Вопросы и нарушения',
          internal: true,
          onTap: () => Navigator.of(context).push(MaterialPageRoute<void>(
              builder: (_) => SupportCenterScreen(api: widget.api)))),
      _AboutTile(
          icon: Icons.mail_outline_rounded,
          title: 'Написать нам',
          subtitle: AppConfig.supportEmail,
          onTap: () => _open('mailto:${AppConfig.supportEmail}')),
      _AboutTile(
          icon: Icons.shield_outlined,
          title: 'Конфиденциальность',
          subtitle: 'Как мы храним данные',
          onTap: () => _open('${AppConfig.website}/privacy.html')),
      _AboutTile(
          icon: Icons.description_outlined,
          title: 'Условия',
          subtitle: 'Правила использования',
          onTap: () => _open('${AppConfig.website}/terms.html')),
    ];
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const SettingsSectionHead(
          title: 'О приложении', desc: 'Информация о Love'),
      const SizedBox(height: 16),
      _surface(
          Column(children: [
            Icon(Icons.favorite_rounded,
                size: 52, color: context.palette.textBright),
            const SizedBox(height: 12),
            const Text('L O V E',
                style: TextStyle(
                    fontFamily: LoveFonts.serif,
                    fontSize: 30,
                    fontWeight: FontWeight.w600,
                    letterSpacing: 6)),
            const SizedBox(height: 10),
            Text('Мессенджер, сделанный с любовью.',
                textAlign: TextAlign.center,
                style: TextStyle(
                    color: context.palette.textSecondary, height: 1.5)),
            const SizedBox(height: 16),
            FutureBuilder<PackageInfo>(
                future: _info,
                builder: (context, snapshot) {
                  final info = snapshot.data;
                  return Wrap(
                      alignment: WrapAlignment.center,
                      spacing: 10,
                      runSpacing: 8,
                      children: [
                        LoveBadge(
                            'v${info?.version ?? AppConfig.productVersion}'),
                        if (info != null && info.buildNumber.isNotEmpty)
                          LoveBadge('build ${info.buildNumber}'),
                      ]);
                }),
          ]),
          padding: const EdgeInsets.fromLTRB(24, 36, 24, 28)),
      const SizedBox(height: 26),
      const SettingsSubtitle('Ссылки'),
      LayoutBuilder(builder: (context, constraints) {
        final twoColumns = constraints.maxWidth >= 600;
        return Wrap(spacing: 10, runSpacing: 10, children: [
          for (final tile in tiles)
            SizedBox(
              width: twoColumns
                  ? (constraints.maxWidth - 10) / 2
                  : constraints.maxWidth,
              child: tile,
            ),
        ]);
      }),
      const SizedBox(height: 26),
      const SettingsSubtitle('Команда'),
      _surface(Row(children: [
        CircleAvatar(
            radius: 19,
            backgroundColor: context.palette.textPrimary,
            foregroundColor: context.palette.bgPrimary,
            child: const Text('А',
                style: TextStyle(
                    fontFamily: LoveFonts.serif, fontStyle: FontStyle.italic))),
        const SizedBox(width: 14),
        Expanded(
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('Александр',
              style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 2),
          Text('Основатель',
              style: TextStyle(color: context.palette.textMuted, fontSize: 12)),
        ])),
      ])),
      const SizedBox(height: 26),
      Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Text('Сделано с ',
            style: TextStyle(color: context.palette.textMuted, fontSize: 12)),
        Icon(Icons.favorite_rounded,
            size: 14, color: context.palette.textMuted),
      ]),
    ]);
  }
}

class _AboutTile extends StatelessWidget {
  const _AboutTile(
      {required this.icon,
      required this.title,
      required this.subtitle,
      required this.onTap,
      this.internal = false});
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool internal;

  @override
  Widget build(BuildContext context) => Material(
        color: context.palette.surfaceStrong,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: BorderSide(color: context.palette.border)),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
            onTap: onTap,
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(children: [
                Container(
                    width: 38,
                    height: 38,
                    decoration: BoxDecoration(
                        color: context.palette.bgTertiary,
                        borderRadius: BorderRadius.circular(11),
                        border: Border.all(color: context.palette.border)),
                    child: Icon(icon, size: 18)),
                const SizedBox(width: 14),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(title,
                          style: const TextStyle(
                              fontSize: 14, fontWeight: FontWeight.w500)),
                      const SizedBox(height: 2),
                      Text(subtitle,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                              fontSize: 12, color: context.palette.textMuted)),
                    ])),
                const SizedBox(width: 8),
                Icon(
                    internal
                        ? Icons.chevron_right_rounded
                        : Icons.north_east_rounded,
                    size: 17,
                    color: context.palette.textMuted),
              ]),
            )),
      );
}
