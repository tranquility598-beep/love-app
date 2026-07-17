import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../config/app_config.dart';
import '../../core/network/love_api.dart';
import '../../core/prefs/love_prefs.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_background.dart';
import '../shell/screen_frame.dart';
import 'settings_account_section.dart';
import 'settings_profile_section.dart';
import 'settings_widgets.dart';

enum SettingsSection {
  profile,
  account,
  privacy,
  appearance,
  notifications,
  voice,
  hub,
  updates,
  advanced,
  about,
}

class _SectionMeta {
  const _SectionMeta(this.section, this.icon, this.title, this.subtitle);
  final SettingsSection section;
  final IconData icon;
  final String title;
  final String subtitle;
}

const _sectionGroups = <String, List<_SectionMeta>>{
  'Пользователь': [
    _SectionMeta(SettingsSection.profile, Icons.person_outline_rounded,
        'Профиль', 'Имя, аватар, статус и увлечения'),
    _SectionMeta(SettingsSection.account, Icons.lock_outline_rounded, 'Аккаунт',
        'Почта, пароль и безопасность'),
    _SectionMeta(SettingsSection.privacy, Icons.shield_outlined,
        'Конфиденциальность', 'Кто и что видит о вас'),
  ],
  'Приложение': [
    _SectionMeta(SettingsSection.appearance, Icons.palette_outlined,
        'Внешний вид', 'Тема, масштаб и эффекты'),
    _SectionMeta(SettingsSection.notifications, Icons.notifications_none_rounded,
        'Уведомления', 'Что и где вам показывать'),
    _SectionMeta(SettingsSection.voice, Icons.mic_none_rounded, 'Голос и звук',
        'Микрофон, динамики и обработка'),
    _SectionMeta(SettingsSection.hub, Icons.favorite_border_rounded, 'Love Hub',
        'Уведомления из центра сообщества'),
  ],
  'Система': [
    _SectionMeta(SettingsSection.updates, Icons.refresh_rounded, 'Обновления',
        'Версия и канал обновлений'),
    _SectionMeta(SettingsSection.advanced, Icons.tune_rounded, 'Расширенные',
        'Для продвинутых пользователей'),
    _SectionMeta(SettingsSection.about, Icons.info_outline_rounded,
        'О приложении', 'Информация о Love'),
  ],
};

class SettingsScreen extends StatelessWidget {
  const SettingsScreen({this.showBack = false, this.api, super.key});

  final bool showBack;
  final LoveApi? api;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LoveBackground(
        child: ScreenFrame(
          title: 'Настройки',
          leading: IconButton(
            tooltip: 'Назад',
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
            children: [
              for (final entry in _sectionGroups.entries) ...[
                SettingsSubtitle(entry.key,
                    padding: const EdgeInsets.fromLTRB(6, 8, 6, 10)),
                for (final meta in entry.value)
                  _NavItem(
                    meta: meta,
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => SettingsDetailPage(
                          section: meta.section,
                          title: meta.title,
                          api: api ?? LoveApi(),
                        ),
                      ),
                    ),
                  ),
                const SizedBox(height: 8),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem({required this.meta, required this.onTap});
  final _SectionMeta meta;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: LoveColors.surfaceStrong,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: const Color(0x0DFFFFFF)),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            child: Row(
              children: [
                Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.white.withValues(alpha: 0.07),
                    border: Border.all(color: LoveColors.border),
                  ),
                  child: Icon(meta.icon, size: 21),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        meta.title,
                        style: const TextStyle(
                            fontWeight: FontWeight.w800, fontSize: 15),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        meta.subtitle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                            color: LoveColors.textMuted, fontSize: 12.5),
                      ),
                    ],
                  ),
                ),
                const Icon(Icons.chevron_right_rounded,
                    color: LoveColors.textMuted),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class SettingsDetailPage extends StatelessWidget {
  const SettingsDetailPage({
    required this.section,
    required this.title,
    required this.api,
    super.key,
  });

  final SettingsSection section;
  final String title;
  final LoveApi api;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: LoveBackground(
        child: ScreenFrame(
          title: title,
          leading: IconButton(
            tooltip: 'Назад',
            onPressed: () => Navigator.of(context).maybePop(),
            icon: const Icon(Icons.arrow_back_rounded),
          ),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 40),
            children: [_body(context)],
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context) {
    switch (section) {
      case SettingsSection.profile:
        return ProfileSettingsSection(api: api);
      case SettingsSection.account:
        return AccountSettingsSection(api: api);
      case SettingsSection.privacy:
        return const _PrivacySection();
      case SettingsSection.appearance:
        return const _AppearanceSection();
      case SettingsSection.notifications:
        return const _NotificationsSection();
      case SettingsSection.voice:
        return const _VoiceSection();
      case SettingsSection.hub:
        return const _HubChannelsSection();
      case SettingsSection.updates:
        return const _UpdatesSection();
      case SettingsSection.advanced:
        return const _AdvancedSection();
      case SettingsSection.about:
        return const _AboutSection();
    }
  }
}

// ── Privacy ──────────────────────────────────────────────────────────────────

class _PrivacySection extends StatelessWidget {
  const _PrivacySection();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SettingsSectionHead(
          title: 'Конфиденциальность',
          desc: 'Кто и что может видеть о вас',
        ),
        const SizedBox(height: 16),
        SettingsCard(
          title: 'Видимость',
          children: [
            PrefToggleRow(
              title: 'Статус «в сети»',
              subtitle: 'Показывать, когда вы онлайн',
              prefKey: K.privacyOnline,
              defaultValue: true,
            ),
            PrefSelectRow(
              title: 'Кто видит профиль',
              prefKey: K.privacyProfile,
              defaultValue: 'all',
              options: const [
                SettingsOption('all', 'Все'),
                SettingsOption('friends', 'Друзья'),
                SettingsOption('none', 'Никто'),
              ],
            ),
            PrefToggleRow(
              title: 'Показывать активность',
              subtitle: 'Что вы слушаете и во что играете',
              prefKey: K.privacyActivity,
              defaultValue: true,
            ),
          ],
        ),
        const SizedBox(height: 14),
        SettingsCard(
          title: 'Запросы',
          children: [
            PrefSelectRow(
              title: 'Запросы в друзья',
              prefKey: K.privacyFriendReq,
              defaultValue: 'all',
              options: const [
                SettingsOption('all', 'Все'),
                SettingsOption('fof', 'Друзья друзей'),
                SettingsOption('none', 'Никто'),
              ],
            ),
            PrefSelectRow(
              title: 'Личные сообщения',
              prefKey: K.privacyDm,
              defaultValue: 'friends',
              options: const [
                SettingsOption('all', 'Все'),
                SettingsOption('friends', 'Друзья'),
                SettingsOption('none', 'Никто'),
              ],
            ),
          ],
        ),
      ],
    );
  }
}

// ── Appearance ───────────────────────────────────────────────────────────────

class _AppearanceSection extends StatefulWidget {
  const _AppearanceSection();

  @override
  State<_AppearanceSection> createState() => _AppearanceSectionState();
}

class _AppearanceSectionState extends State<_AppearanceSection> {
  late int _scale = LovePrefs.instance.getInt(K.uiScale, 100);

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SettingsSectionHead(
          title: 'Внешний вид',
          desc: 'Тема, масштаб и эффекты интерфейса',
        ),
        const SizedBox(height: 16),
        SettingsCard(
          title: 'Тема',
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 10),
              child: Row(
                children: [
                  _ThemeOption(
                    label: 'Тёмная',
                    icon: Icons.dark_mode_rounded,
                    active: true,
                    onTap: () {},
                  ),
                  const SizedBox(width: 8),
                  _ThemeOption(
                    label: 'Светлая',
                    icon: Icons.light_mode_rounded,
                    active: false,
                    onTap: () => _comingSoon(context),
                  ),
                  const SizedBox(width: 8),
                  _ThemeOption(
                    label: 'Системная',
                    icon: Icons.brightness_auto_rounded,
                    active: false,
                    onTap: () => _comingSoon(context),
                  ),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        SettingsCard(
          title: 'Масштаб и режимы',
          children: [
            SettingsSliderRow(
              title: 'Масштаб интерфейса',
              subtitle: 'Размер текста и элементов',
              value: _scale.toDouble(),
              min: 75,
              max: 125,
              divisions: 10,
              valueLabel: '$_scale%',
              onChanged: (v) {
                setState(() => _scale = v.round());
                LovePrefs.instance.setInt(K.uiScale, _scale);
              },
            ),
            PrefToggleRow(
              title: 'Компактный режим',
              subtitle: 'Плотнее размещать сообщения',
              prefKey: K.compactMode,
              defaultValue: false,
            ),
            PrefToggleRow(
              title: 'Анимации',
              subtitle: 'Плавные переходы интерфейса',
              prefKey: K.animations,
              defaultValue: true,
            ),
            PrefToggleRow(
              title: 'Эффекты прозрачности',
              subtitle: 'Размытие и стекло',
              prefKey: K.transparency,
              defaultValue: true,
            ),
          ],
        ),
      ],
    );
  }

  void _comingSoon(BuildContext context) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Пока доступна только тёмная тема')),
    );
  }
}

class _ThemeOption extends StatelessWidget {
  const _ThemeOption({
    required this.label,
    required this.icon,
    required this.active,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Expanded(
      child: Material(
        color: active ? Colors.white.withValues(alpha: 0.08) : _fill,
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: active ? Colors.white : LoveColors.border,
              ),
            ),
            child: Column(
              children: [
                Icon(icon,
                    size: 20,
                    color: active ? Colors.white : LoveColors.textSecondary),
                const SizedBox(height: 6),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: active ? Colors.white : LoveColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

const _fill = Color(0x08FFFFFF);

// ── Notifications ────────────────────────────────────────────────────────────

class _NotificationsSection extends StatelessWidget {
  const _NotificationsSection();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SettingsSectionHead(
          title: 'Уведомления',
          desc: 'Что и где вам показывать',
        ),
        const SizedBox(height: 16),
        // Preview toast
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: LoveColors.surfaceStrong,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: LoveColors.borderActive),
          ),
          child: Row(
            children: [
              Container(
                width: 38,
                height: 38,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.08),
                  border: Border.all(color: LoveColors.borderActive),
                ),
                child: const Icon(Icons.favorite_rounded, size: 18),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Love',
                        style: TextStyle(fontWeight: FontWeight.w800)),
                    SizedBox(height: 2),
                    Text('Так будут выглядеть ваши уведомления',
                        style: TextStyle(
                            color: LoveColors.textMuted, fontSize: 12.5)),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        SettingsCard(
          children: [
            PrefToggleRow(
              title: 'Push на телефон',
              subtitle: 'Уведомления, когда приложение свёрнуто',
              prefKey: K.notifPush,
              defaultValue: true,
            ),
            PrefToggleRow(
              title: 'Сообщения',
              prefKey: K.notifMessages,
              defaultValue: true,
            ),
            PrefToggleRow(
              title: 'Упоминания',
              prefKey: K.notifMentions,
              defaultValue: true,
            ),
            PrefToggleRow(
              title: 'Обновления приложения',
              prefKey: K.notifAppUpdates,
              defaultValue: false,
            ),
            PrefToggleRow(
              title: 'Love Hub',
              subtitle: 'Анонсы и ответы сообщества',
              prefKey: K.notifHub,
              defaultValue: true,
            ),
          ],
        ),
      ],
    );
  }
}

// ── Voice ────────────────────────────────────────────────────────────────────
// Possible reasons why this section may appear empty at runtime:
// 1. LovePrefs.init() threw and _prefs is null → late field crash
// 2. SharedPreferences plugin not properly linked in the APK
// 3. Permission.microphone dependency missing (AndroidManifest)
// 4. Stale APK — code was rebuilt without the latest patches applied

class _VoiceSection extends StatefulWidget {
  const _VoiceSection();

  @override
  State<_VoiceSection> createState() => _VoiceSectionState();
}

class _VoiceSectionState extends State<_VoiceSection> {
  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SettingsSectionHead(
          title: 'Голос и звук',
          desc: 'Микрофон, динамики и обработка',
        ),
        const SizedBox(height: 16),
        SettingsCard(
          title: 'Микрофон',
          children: [
            const PrefSelectRow(
              title: 'Устройство ввода',
              prefKey: K.voiceInputDevice,
              defaultValue: 'default',
              options: [SettingsOption('default', 'Микрофон по умолчанию')],
            ),
            const _VolumeSlider(
              title: 'Громкость ввода',
              prefKey: K.inputVolume,
              defaultValue: 80,
            ),
            SettingsActionRow(
              title: 'Проверить микрофон',
              subtitle: 'Разрешение и запись',
              trailing: OutlinedButton(
                onPressed: _testMic,
                child: const Text('Проверить'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        SettingsCard(
          title: 'Динамики',
          children: [
            const PrefSelectRow(
              title: 'Устройство вывода',
              prefKey: K.voiceOutputDevice,
              defaultValue: 'default',
              options: [SettingsOption('default', 'Динамики по умолчанию')],
            ),
            const _VolumeSlider(
              title: 'Громкость вывода',
              prefKey: K.outputVolume,
              defaultValue: 100,
            ),
            SettingsActionRow(
              title: 'Проверить звук',
              trailing: OutlinedButton(
                onPressed: () => SystemSound.play(SystemSoundType.alert),
                child: const Text('Проверить'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        SettingsCard(
          title: 'Обработка',
          children: [
            PrefToggleRow(
              title: 'Шумоподавление',
              prefKey: K.noiseSuppression,
              defaultValue: true,
            ),
            PrefToggleRow(
              title: 'Эхоподавление',
              prefKey: K.echoCancellation,
              defaultValue: true,
            ),
            PrefToggleRow(
              title: 'Активация по голосу',
              prefKey: K.voiceActivation,
              defaultValue: true,
            ),
          ],
        ),
      ],
    );
  }

  Future<void> _testMic() async {
    final status = await Permission.microphone.request();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(
          status.isGranted
              ? 'Микрофон доступен ✓'
              : 'Нет доступа к микрофону',
        ),
      ),
    );
  }
}

/// Self-contained volume slider that only rebuilds itself on drag, not the
/// entire parent settings section.
class _VolumeSlider extends StatefulWidget {
  const _VolumeSlider({
    required this.title,
    required this.prefKey,
    required this.defaultValue,
  });

  final String title;
  final String prefKey;
  final int defaultValue;

  @override
  State<_VolumeSlider> createState() => _VolumeSliderState();
}

class _VolumeSliderState extends State<_VolumeSlider> {
  late int _value =
      LovePrefs.instance.getInt(widget.prefKey, widget.defaultValue);

  @override
  Widget build(BuildContext context) {
    return SettingsSliderRow(
      title: widget.title,
      value: _value.toDouble(),
      min: 0,
      max: 100,
      divisions: 20,
      valueLabel: '$_value%',
      onChanged: (v) {
        setState(() => _value = v.round());
        LovePrefs.instance.setInt(widget.prefKey, _value);
      },
    );
  }
}

// ── Love Hub channels ────────────────────────────────────────────────────────

class _HubChannelsSection extends StatefulWidget {
  const _HubChannelsSection();

  @override
  State<_HubChannelsSection> createState() => _HubChannelsSectionState();
}

class _HubChannelsSectionState extends State<_HubChannelsSection> {
  final _channels = <String, bool>{};

  @override
  void initState() {
    super.initState();
    _channels[K.hubAnnouncements] =
        LovePrefs.instance.getBool(K.hubAnnouncements, true);
    _channels[K.hubDevlog] = LovePrefs.instance.getBool(K.hubDevlog, true);
    _channels[K.hubIdeas] = LovePrefs.instance.getBool(K.hubIdeas, false);
    _channels[K.hubFeedback] = LovePrefs.instance.getBool(K.hubFeedback, true);
  }

  int get _subscribed => _channels.values.where((v) => v).length;

  void _set(String key, bool value) {
    setState(() => _channels[key] = value);
    LovePrefs.instance.setBool(key, value);
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SettingsSectionHead(
          title: 'Love Hub',
          desc: 'Уведомления из центра сообщества',
        ),
        const SizedBox(height: 16),
        SettingsCard(
          children: [
            SettingsToggleRow(
              title: 'Анонсы',
              subtitle: 'Новости и важные объявления',
              value: _channels[K.hubAnnouncements]!,
              onChanged: (v) => _set(K.hubAnnouncements, v),
            ),
            SettingsToggleRow(
              title: 'Dev Log',
              subtitle: 'Заметки разработки',
              value: _channels[K.hubDevlog]!,
              onChanged: (v) => _set(K.hubDevlog, v),
            ),
            SettingsToggleRow(
              title: 'Идеи',
              subtitle: 'Предложения сообщества',
              value: _channels[K.hubIdeas]!,
              onChanged: (v) => _set(K.hubIdeas, v),
            ),
            SettingsToggleRow(
              title: 'Обратная связь',
              subtitle: 'Ответы на ваши отзывы',
              value: _channels[K.hubFeedback]!,
              onChanged: (v) => _set(K.hubFeedback, v),
            ),
          ],
        ),
        const SizedBox(height: 14),
        LoveBanner('Вы подписаны на $_subscribed из 4 каналов Love Hub.'),
      ],
    );
  }
}

// ── Updates ──────────────────────────────────────────────────────────────────

class _UpdatesSection extends StatelessWidget {
  const _UpdatesSection();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SettingsSectionHead(
          title: 'Обновления',
          desc: 'Версия и канал обновлений',
        ),
        const SizedBox(height: 16),
        SettingsCard(
          children: [
            SettingsValueRow(
              title: 'Текущая версия',
              value: '',
              badge: LoveBadge('v${AppConfig.productVersion}'),
            ),
            const SettingsValueRow(
              title: 'Статус',
              value: '',
              badge: LoveBadge('Актуальная версия', success: true),
            ),
          ],
        ),
        const SizedBox(height: 14),
        const LoveBanner('Новые версии — на loveapp.chat'),
        const SizedBox(height: 14),
        OutlinedButton.icon(
          onPressed: () => launchUrl(
            Uri.parse(AppConfig.website),
            mode: LaunchMode.externalApplication,
          ),
          icon: const Icon(Icons.open_in_new_rounded, size: 18),
          label: const Text('Открыть loveapp.chat'),
        ),
      ],
    );
  }
}

// ── Advanced ─────────────────────────────────────────────────────────────────
// Possible reasons why this section may appear empty at runtime:
// Same as Voice section — check LovePrefs init, plugin linkage, stale APK.

class _AdvancedSection extends StatefulWidget {
  const _AdvancedSection();

  @override
  State<_AdvancedSection> createState() => _AdvancedSectionState();
}

class _AdvancedSectionState extends State<_AdvancedSection> {
  bool _clearing = false;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SettingsSectionHead(
          title: 'Расширенные',
          desc: 'Для продвинутых пользователей',
        ),
        const SizedBox(height: 16),
        const LoveBanner(
          'Изменяйте эти настройки, только если понимаете последствия.',
          variant: BannerVariant.warning,
        ),
        const SizedBox(height: 14),
        SettingsCard(
          children: [
            PrefToggleRow(
              title: 'Режим отладки',
              subtitle: 'Подробные логи в консоли',
              prefKey: K.debugMode,
              defaultValue: false,
            ),
            PrefToggleRow(
              title: 'Аппаратное ускорение',
              subtitle: 'Использовать GPU для отрисовки',
              prefKey: K.hwAccel,
              defaultValue: true,
              onChanged: (_) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content:
                        Text('Изменение вступит в силу после перезапуска'),
                  ),
                );
              },
            ),
            SettingsActionRow(
              title: 'Кэш приложения',
              subtitle: 'Временные файлы и изображения',
              trailing: OutlinedButton(
                onPressed: _clearing ? null : _clearCache,
                child: Text(_clearing ? 'Очистка…' : 'Очистить'),
              ),
            ),
            SettingsActionRow(
              title: 'Диагностика',
              subtitle: 'Сведения о среде выполнения',
              trailing: OutlinedButton(
                onPressed: () => _showDiagnostics(context),
                child: const Text('Показать'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        DangerButton(
          label: 'Сбросить все настройки',
          icon: Icons.restart_alt_rounded,
          onPressed: _resetAll,
        ),
      ],
    );
  }

  Future<void> _clearCache() async {
    setState(() => _clearing = true);
    PaintingBinding.instance.imageCache.clear();
    PaintingBinding.instance.imageCache.clearLiveImages();
    await Future<void>.delayed(const Duration(milliseconds: 600));
    if (!mounted) return;
    setState(() => _clearing = false);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Кэш очищен')),
    );
  }

  void _showDiagnostics(BuildContext context) {
    final media = MediaQuery.of(context);
    final size = media.size;
    showLoveSheet<void>(
      context,
      title: 'Диагностика',
      builder: (context) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _diagRow('Версия', 'v${AppConfig.productVersion}'),
          _diagRow('Платформа', 'Android'),
          _diagRow('Локаль', Localizations.localeOf(context).toString()),
          _diagRow('Экран',
              '${size.width.round()}×${size.height.round()} @${media.devicePixelRatio}x'),
          _diagRow('API', AppConfig.apiBaseUrl),
        ],
      ),
    );
  }

  Widget _diagRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 96,
            child: Text(label,
                style: const TextStyle(
                    color: LoveColors.textMuted, fontSize: 13)),
          ),
          Expanded(
            child: Text(value,
                style: const TextStyle(
                    fontFamily: LoveFonts.mono, fontSize: 12.5)),
          ),
        ],
      ),
    );
  }

  Future<void> _resetAll() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: const Color(0xFF121212),
        title: const Text('Сбросить настройки?'),
        content: const Text(
            'Все настройки приложения вернутся к значениям по умолчанию.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Отмена'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: TextButton.styleFrom(foregroundColor: LoveColors.danger),
            child: const Text('Сбросить'),
          ),
        ],
      ),
    );
    if (confirmed != true) return;
    await LovePrefs.instance.resetAll();
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Настройки сброшены')),
    );
    Navigator.of(context).maybePop();
  }
}

// ── About ────────────────────────────────────────────────────────────────────

class _AboutSection extends StatelessWidget {
  const _AboutSection();

  @override
  Widget build(BuildContext context) {
    final now = DateTime.now();
    final build =
        '${now.year}${now.month.toString().padLeft(2, '0')}${now.day.toString().padLeft(2, '0')}';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        const SettingsSectionHead(
          title: 'О приложении',
          desc: 'Информация о Love',
        ),
        const SizedBox(height: 16),
        LoveSurfaceCard(
          child: Column(
            children: [
              Container(
                width: 64,
                height: 64,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: Colors.white.withValues(alpha: 0.06),
                  border: Border.all(color: LoveColors.borderActive),
                ),
                child: const Icon(Icons.favorite_rounded, size: 30),
              ),
              const SizedBox(height: 14),
              const Text(
                'L O V E',
                style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 6,
                ),
              ),
              const SizedBox(height: 10),
              Wrap(
                spacing: 8,
                children: [
                  LoveBadge('v${AppConfig.productVersion}'),
                  LoveBadge('build $build'),
                ],
              ),
              const SizedBox(height: 12),
              const Text(
                'Мессенджер, сделанный с любовью.',
                textAlign: TextAlign.center,
                style: TextStyle(color: LoveColors.textSecondary),
              ),
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 18),
                child: Divider(height: 1, color: LoveColors.border),
              ),
              const Align(
                alignment: Alignment.centerLeft,
                child: SettingsSubtitle('Команда', padding: EdgeInsets.zero),
              ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withValues(alpha: 0.08),
                      border: Border.all(color: LoveColors.border),
                    ),
                    child: const Text('А',
                        style: TextStyle(fontWeight: FontWeight.w800)),
                  ),
                  const SizedBox(width: 12),
                  const Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Александр',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                      SizedBox(height: 2),
                      Text('Основатель',
                          style: TextStyle(
                              color: LoveColors.textMuted, fontSize: 12.5)),
                    ],
                  ),
                ],
              ),
            ],
          ),
        ),
        const SizedBox(height: 14),
        Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => launchUrl(
                  Uri.parse(AppConfig.website),
                  mode: LaunchMode.externalApplication,
                ),
                icon: const Icon(Icons.public_rounded, size: 18),
                label: const Text('Сайт'),
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => launchUrl(
                  Uri.parse('mailto:${AppConfig.supportEmail}'),
                ),
                icon: const Icon(Icons.mail_outline_rounded, size: 18),
                label: const Text('Поддержка'),
              ),
            ),
          ],
        ),
        const SizedBox(height: 14),
        Center(
          child: Text(
            AppConfig.supportEmail,
            style: const TextStyle(
                fontFamily: LoveFonts.mono,
                fontSize: 12,
                color: LoveColors.textMuted),
          ),
        ),
        const SizedBox(height: 6),
        const Center(
          child: Text('Сделано с ♥',
              style: TextStyle(color: LoveColors.textMuted, fontSize: 12.5)),
        ),
      ],
    );
  }
}

/// A plain padded card wrapper for centred content (About).
class LoveSurfaceCard extends StatelessWidget {
  const LoveSurfaceCard({required this.child, super.key});
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: LoveColors.surfaceStrong,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0x0DFFFFFF)),
      ),
      child: child,
    );
  }
}
