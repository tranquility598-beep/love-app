import 'package:flutter/material.dart';

import '../../core/prefs/love_prefs.dart';
import '../../theme/love_tokens.dart';
import '../../widgets/love_surface.dart';

/// Settings-local accent colours. The main app is strictly monochrome + red,
/// but the desktop Settings surface uses a green "success" and amber "warning"
/// accent (settings.css `--settings-success` / warning banner). We mirror those
/// here, scoped to settings/hub only.
const settingsSuccess = Color(0xFF4CB96A);
const settingsSuccessBg = Color(0x1A4CB96A);
const settingsSuccessBorder = Color(0x404CB96A);
const settingsWarning = Color(0xFFE8B341);
const settingsWarningBg = Color(0x12E8B341);
const settingsWarningBorder = Color(0x40E8B341);

const _rowDivider = Color(0x0DFFFFFF); // rgba(255,255,255,0.05)
const _rowFill = Color(0x08FFFFFF); // faint row fill inside cards

// ── Section header ──────────────────────────────────────────────────────────

/// The big header at the top of a settings section (`.lvs-section-head`).
class SettingsSectionHead extends StatelessWidget {
  const SettingsSectionHead({required this.title, this.desc, super.key});

  final String title;
  final String? desc;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontFamily: LoveFonts.serif,
            fontStyle: FontStyle.italic,
            fontSize: 23,
            fontWeight: FontWeight.w500,
            letterSpacing: -0.4,
            color: LoveColors.textPrimary,
          ),
        ),
        if (desc != null) ...[
          const SizedBox(height: 4),
          Text(
            desc!,
            style: const TextStyle(
              color: LoveColors.textMuted,
              fontSize: 13,
              height: 1.35,
            ),
          ),
        ],
      ],
    );
  }
}

/// Tiny uppercase mono label — used for card subtitles and nav group headers
/// (`.lvs-section-subtitle`).
class SettingsSubtitle extends StatelessWidget {
  const SettingsSubtitle(this.text, {this.padding, super.key});

  final String text;
  final EdgeInsetsGeometry? padding;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: padding ?? const EdgeInsets.fromLTRB(4, 2, 4, 10),
      child: Text(
        text.toUpperCase(),
        style: const TextStyle(
          fontFamily: LoveFonts.mono,
          color: LoveColors.textMuted,
          fontSize: 11,
          fontWeight: FontWeight.w500,
          letterSpacing: 1.0,
        ),
      ),
    );
  }
}

// ── Card ──────────────────────────────────────────────────────────────────

/// A settings card (`.lvs-card`) that stacks rows with hairline dividers.
class SettingsCard extends StatelessWidget {
  const SettingsCard({
    required this.children,
    this.title,
    this.padding = const EdgeInsets.symmetric(horizontal: 16),
    super.key,
  });

  final List<Widget> children;
  final String? title;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    final rows = <Widget>[];
    for (var i = 0; i < children.length; i++) {
      rows.add(children[i]);
      if (i != children.length - 1) {
        rows.add(const Divider(height: 1, thickness: 1, color: _rowDivider));
      }
    }
    return LoveSurface(
      padding: EdgeInsets.zero,
      radius: 16,
      color: LoveColors.surfaceStrong,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (title != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 2),
              child: SettingsSubtitle(title!, padding: EdgeInsets.zero),
            ),
          Padding(
            padding: padding,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: rows,
            ),
          ),
        ],
      ),
    );
  }
}

/// The left label block (title + optional sub-label) shared by rows.
class _RowLabel extends StatelessWidget {
  const _RowLabel({required this.title, this.subtitle, this.icon});

  final String title;
  final String? subtitle;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        if (icon != null) ...[
          Icon(icon, size: 19, color: LoveColors.textSecondary),
          const SizedBox(width: 12),
        ],
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14.5,
                  fontWeight: FontWeight.w500,
                  color: LoveColors.textPrimary,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(height: 2),
                Text(
                  subtitle!,
                  style: const TextStyle(
                    color: LoveColors.textMuted,
                    fontSize: 12,
                    height: 1.3,
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

// ── Toggle row ──────────────────────────────────────────────────────────────

class SettingsToggleRow extends StatelessWidget {
  const SettingsToggleRow({
    required this.title,
    required this.value,
    required this.onChanged,
    this.subtitle,
    this.icon,
    super.key,
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Expanded(child: _RowLabel(title: title, subtitle: subtitle, icon: icon)),
          const SizedBox(width: 12),
          LoveSwitch(value: value, onChanged: onChanged),
        ],
      ),
    );
  }
}

/// Toggle bound directly to a [LovePrefs] key. Handles its own persistence.
class PrefToggleRow extends StatefulWidget {
  const PrefToggleRow({
    required this.title,
    required this.prefKey,
    required this.defaultValue,
    this.subtitle,
    this.icon,
    this.onChanged,
    super.key,
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final String prefKey;
  final bool defaultValue;
  final ValueChanged<bool>? onChanged;

  @override
  State<PrefToggleRow> createState() => _PrefToggleRowState();
}

class _PrefToggleRowState extends State<PrefToggleRow> {
  late bool _value =
      LovePrefs.instance.getBool(widget.prefKey, widget.defaultValue);

  @override
  Widget build(BuildContext context) {
    return SettingsToggleRow(
      title: widget.title,
      subtitle: widget.subtitle,
      icon: widget.icon,
      value: _value,
      onChanged: (v) {
        setState(() => _value = v);
        LovePrefs.instance.setBool(widget.prefKey, v);
        widget.onChanged?.call(v);
      },
    );
  }
}

/// White-on-dark switch matching the desktop `.lvs-toggle`.
class LoveSwitch extends StatelessWidget {
  const LoveSwitch({required this.value, required this.onChanged, super.key});

  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Switch(
      value: value,
      onChanged: onChanged,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      activeThumbColor: Colors.black,
      activeTrackColor: Colors.white,
      inactiveThumbColor: LoveColors.textSecondary,
      inactiveTrackColor: Colors.white.withValues(alpha: 0.06),
      trackOutlineColor:
          WidgetStateProperty.all(value ? Colors.transparent : LoveColors.borderActive),
    );
  }
}

// ── Select row ──────────────────────────────────────────────────────────────

class SettingsOption<T> {
  const SettingsOption(this.value, this.label);
  final T value;
  final String label;
}

class SettingsSelectRow<T> extends StatelessWidget {
  const SettingsSelectRow({
    required this.title,
    required this.value,
    required this.options,
    required this.onChanged,
    this.subtitle,
    this.icon,
    super.key,
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final T value;
  final List<SettingsOption<T>> options;
  final ValueChanged<T> onChanged;

  @override
  Widget build(BuildContext context) {
    final current = options.firstWhere(
      (o) => o.value == value,
      orElse: () => options.first,
    );
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Expanded(child: _RowLabel(title: title, subtitle: subtitle, icon: icon)),
          const SizedBox(width: 12),
          _SelectButton(
            label: current.label,
            onTap: () async {
              final picked = await showLoveSelect<T>(
                context,
                title: title,
                options: options,
                selected: value,
              );
              if (picked != null && picked != value) onChanged(picked);
            },
          ),
        ],
      ),
    );
  }
}

class PrefSelectRow extends StatefulWidget {
  const PrefSelectRow({
    required this.title,
    required this.prefKey,
    required this.defaultValue,
    required this.options,
    this.subtitle,
    this.icon,
    super.key,
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final String prefKey;
  final String defaultValue;
  final List<SettingsOption<String>> options;

  @override
  State<PrefSelectRow> createState() => _PrefSelectRowState();
}

class _PrefSelectRowState extends State<PrefSelectRow> {
  late String _value =
      LovePrefs.instance.getString(widget.prefKey, widget.defaultValue);

  @override
  Widget build(BuildContext context) {
    return SettingsSelectRow<String>(
      title: widget.title,
      subtitle: widget.subtitle,
      icon: widget.icon,
      value: _value,
      options: widget.options,
      onChanged: (v) {
        setState(() => _value = v);
        LovePrefs.instance.setString(widget.prefKey, v);
      },
    );
  }
}

class _SelectButton extends StatelessWidget {
  const _SelectButton({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.05),
      borderRadius: BorderRadius.circular(10),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minWidth: 120, maxWidth: 190),
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: LoveColors.borderActive),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Flexible(
                child: Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w500,
                    color: LoveColors.textPrimary,
                  ),
                ),
              ),
              const SizedBox(width: 6),
              const Icon(Icons.keyboard_arrow_down_rounded,
                  size: 18, color: LoveColors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

Future<T?> showLoveSelect<T>(
  BuildContext context, {
  required String title,
  required List<SettingsOption<T>> options,
  required T selected,
}) {
  return showLoveSheet<T>(
    context,
    title: title,
    builder: (context) => Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final option in options)
          _SheetOption(
            label: option.label,
            selected: option.value == selected,
            onTap: () => Navigator.of(context).pop(option.value),
          ),
      ],
    ),
  );
}

class _SheetOption extends StatelessWidget {
  const _SheetOption({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 14),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: TextStyle(
                    fontSize: 15,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                    color: selected
                        ? LoveColors.textPrimary
                        : LoveColors.textSecondary,
                  ),
                ),
              ),
              if (selected)
                const Icon(Icons.check_rounded, size: 20, color: Colors.white),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Slider row ──────────────────────────────────────────────────────────────

class SettingsSliderRow extends StatelessWidget {
  const SettingsSliderRow({
    required this.title,
    required this.value,
    required this.min,
    required this.max,
    required this.onChanged,
    this.divisions,
    this.subtitle,
    this.valueLabel,
    super.key,
  });

  final String title;
  final String? subtitle;
  final double value;
  final double min;
  final double max;
  final int? divisions;
  final String? valueLabel;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 10),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(child: _RowLabel(title: title, subtitle: subtitle)),
              if (valueLabel != null)
                LoveBadge(valueLabel!),
            ],
          ),
          SliderTheme(
            data: SliderTheme.of(context).copyWith(
              trackHeight: 4,
              activeTrackColor: Colors.white,
              inactiveTrackColor: Colors.white.withValues(alpha: 0.08),
              thumbColor: Colors.white,
              overlayColor: Colors.white.withValues(alpha: 0.12),
              thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 8),
            ),
            child: Slider(
              value: value.clamp(min, max),
              min: min,
              max: max,
              divisions: divisions,
              onChanged: onChanged,
            ),
          ),
        ],
      ),
    );
  }
}

// ── Action / navigation rows ─────────────────────────────────────────────────

/// A row with a label block on the left and an arbitrary control (button) on
/// the right — e.g. "Кэш приложения" + «Очистить».
class SettingsActionRow extends StatelessWidget {
  const SettingsActionRow({
    required this.title,
    this.subtitle,
    this.icon,
    this.trailing,
    super.key,
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Expanded(child: _RowLabel(title: title, subtitle: subtitle, icon: icon)),
          if (trailing != null) ...[const SizedBox(width: 12), trailing!],
        ],
      ),
    );
  }
}

/// A tappable row that opens something (change email, nav to a section), with a
/// trailing chevron.
class SettingsNavRow extends StatelessWidget {
  const SettingsNavRow({
    required this.title,
    required this.onTap,
    this.subtitle,
    this.icon,
    this.trailing,
    super.key,
  });

  final String title;
  final String? subtitle;
  final IconData? icon;
  final Widget? trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(10),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(
            children: [
              Expanded(child: _RowLabel(title: title, subtitle: subtitle, icon: icon)),
              const SizedBox(width: 12),
              trailing ??
                  const Icon(Icons.chevron_right_rounded,
                      color: LoveColors.textMuted),
            ],
          ),
        ),
      ),
    );
  }
}

/// Read-only value row (`.lvs-row` display), label + value.
class SettingsValueRow extends StatelessWidget {
  const SettingsValueRow({
    required this.title,
    required this.value,
    this.subtitle,
    this.badge,
    super.key,
  });

  final String title;
  final String? subtitle;
  final String value;
  final Widget? badge;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 12),
      child: Row(
        children: [
          Expanded(child: _RowLabel(title: title, subtitle: subtitle)),
          const SizedBox(width: 12),
          if (badge != null)
            badge!
          else
            Flexible(
              child: Text(
                value,
                textAlign: TextAlign.right,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: const TextStyle(
                  fontSize: 13.5,
                  fontWeight: FontWeight.w600,
                  color: LoveColors.textSecondary,
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Banners & badges ─────────────────────────────────────────────────────────

enum BannerVariant { info, warning }

class LoveBanner extends StatelessWidget {
  const LoveBanner(this.text, {this.variant = BannerVariant.info, super.key});

  final String text;
  final BannerVariant variant;

  @override
  Widget build(BuildContext context) {
    final warn = variant == BannerVariant.warning;
    final fg = warn ? settingsWarning : LoveColors.textSecondary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: warn ? settingsWarningBg : Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: warn ? settingsWarningBorder : LoveColors.border,
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(
            warn ? Icons.warning_amber_rounded : Icons.info_outline_rounded,
            size: 18,
            color: fg,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              text,
              style: TextStyle(
                color: warn ? settingsWarning : LoveColors.textSecondary,
                fontSize: 12.5,
                height: 1.4,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class LoveBadge extends StatelessWidget {
  const LoveBadge(this.text, {this.success = false, super.key});

  final String text;
  final bool success;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: success ? settingsSuccessBg : Colors.white.withValues(alpha: 0.05),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(
          color: success ? settingsSuccessBorder : LoveColors.borderActive,
        ),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontFamily: LoveFonts.mono,
          fontSize: 11.5,
          fontWeight: FontWeight.w500,
          color: success ? settingsSuccess : LoveColors.textSecondary,
        ),
      ),
    );
  }
}

/// White-text-on-red destructive button (`.lvs-btn--danger`).
class DangerButton extends StatelessWidget {
  const DangerButton({
    required this.label,
    required this.onPressed,
    this.icon,
    super.key,
  });

  final String label;
  final IconData? icon;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return FilledButton.icon(
      onPressed: onPressed,
      icon: Icon(icon ?? Icons.warning_amber_rounded, size: 18),
      label: Text(label),
      style: FilledButton.styleFrom(
        backgroundColor: LoveColors.danger,
        foregroundColor: Colors.white,
        disabledBackgroundColor: LoveColors.danger.withValues(alpha: 0.4),
      ),
    );
  }
}

// ── Modal bottom sheet helper ────────────────────────────────────────────────

/// Presents a styled modal bottom sheet with the dark Love card look —
/// the mobile equivalent of the desktop `.hub-modal-card` / account modal.
Future<T?> showLoveSheet<T>(
  BuildContext context, {
  required String title,
  required WidgetBuilder builder,
}) {
  return showModalBottomSheet<T>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.6),
    builder: (context) {
      final bottom = MediaQuery.of(context).viewInsets.bottom;
      return Padding(
        padding: EdgeInsets.only(bottom: bottom),
        child: Container(
          decoration: const BoxDecoration(
            color: Color(0xFF0E0E0E),
            borderRadius: BorderRadius.vertical(top: Radius.circular(22)),
            border: Border(top: BorderSide(color: LoveColors.borderActive)),
          ),
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 40,
                      height: 4,
                      margin: const EdgeInsets.only(bottom: 16),
                      decoration: BoxDecoration(
                        color: Colors.white.withValues(alpha: 0.14),
                        borderRadius: BorderRadius.circular(99),
                      ),
                    ),
                  ),
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          title,
                          style: const TextStyle(
                            fontFamily: LoveFonts.serif,
                            fontStyle: FontStyle.italic,
                            fontSize: 21,
                            fontWeight: FontWeight.w500,
                            color: LoveColors.textPrimary,
                          ),
                        ),
                      ),
                      IconButton(
                        onPressed: () => Navigator.of(context).pop(),
                        icon: const Icon(Icons.close_rounded),
                        color: LoveColors.textSecondary,
                        tooltip: 'Закрыть',
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Flexible(
                    child: SingleChildScrollView(child: builder(context)),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
}

// ── Mood & hobby icon maps ───────────────────────────────────────────────────

/// Web `moodIcons` order: tea, smile, frown, heart, star, moon, sun, cloud,
/// music, book.
const moodIconNames = <String>[
  'tea', 'smile', 'frown', 'heart', 'star', 'moon', 'sun', 'cloud', 'music',
  'book',
];

IconData moodIcon(String name) {
  switch (name) {
    case 'tea':
      return Icons.local_cafe_rounded;
    case 'smile':
      return Icons.sentiment_satisfied_alt_rounded;
    case 'frown':
      return Icons.sentiment_dissatisfied_rounded;
    case 'heart':
      return Icons.favorite_rounded;
    case 'star':
      return Icons.star_rounded;
    case 'moon':
      return Icons.nightlight_round;
    case 'sun':
      return Icons.wb_sunny_rounded;
    case 'cloud':
      return Icons.cloud_rounded;
    case 'music':
      return Icons.music_note_rounded;
    case 'book':
      return Icons.menu_book_rounded;
    default:
      return Icons.local_cafe_rounded;
  }
}

/// Web `hobbyIcons` order: tea, palette, code, music, book, camera, globe,
/// game, heart, activity.
const hobbyIconNames = <String>[
  'tea', 'palette', 'code', 'music', 'book', 'camera', 'globe', 'game', 'heart',
  'activity',
];

IconData hobbyIcon(String name) {
  switch (name) {
    case 'tea':
      return Icons.local_cafe_rounded;
    case 'palette':
      return Icons.palette_rounded;
    case 'code':
      return Icons.code_rounded;
    case 'music':
      return Icons.music_note_rounded;
    case 'book':
      return Icons.menu_book_rounded;
    case 'camera':
      return Icons.photo_camera_rounded;
    case 'globe':
      return Icons.public_rounded;
    case 'game':
      return Icons.sports_esports_rounded;
    case 'heart':
      return Icons.favorite_rounded;
    case 'activity':
      return Icons.bolt_rounded;
    default:
      return Icons.local_cafe_rounded;
  }
}

/// Grid mood picker (`#lvs-mood-picker`).
class MoodPicker extends StatelessWidget {
  const MoodPicker({required this.value, required this.onChanged, super.key});

  final String value;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (final name in moodIconNames)
          _MoodChip(
            icon: moodIcon(name),
            selected: name == value,
            onTap: () => onChanged(name),
          ),
      ],
    );
  }
}

class _MoodChip extends StatelessWidget {
  const _MoodChip({
    required this.icon,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? Colors.white : _rowFill,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: onTap,
        child: Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: selected ? Colors.white : LoveColors.border,
            ),
          ),
          child: Icon(
            icon,
            size: 22,
            color: selected ? Colors.black : LoveColors.textSecondary,
          ),
        ),
      ),
    );
  }
}

// ── Hobbies editor (`#lvs-hobbies-editor`) ───────────────────────────────────

class HobbyItem {
  const HobbyItem({required this.text, required this.icon});
  final String text;
  final String icon;

  Map<String, String> toJson() => {'text': text, 'icon': icon};
}

/// Editable list of up to 5 hobby chips (max 20 chars each). Tapping a chip
/// edits it; the trailing "+" adds a new one — both via a modal editor.
class HobbiesEditor extends StatelessWidget {
  const HobbiesEditor({
    required this.hobbies,
    required this.onChanged,
    super.key,
  });

  final List<HobbyItem> hobbies;
  final ValueChanged<List<HobbyItem>> onChanged;

  static const maxHobbies = 5;

  @override
  Widget build(BuildContext context) {
    return Wrap(
      spacing: 8,
      runSpacing: 8,
      children: [
        for (var i = 0; i < hobbies.length; i++)
          _HobbyChip(
            item: hobbies[i],
            onTap: () => _edit(context, i),
            onDelete: () {
              final next = [...hobbies]..removeAt(i);
              onChanged(next);
            },
          ),
        if (hobbies.length < maxHobbies)
          _AddHobbyChip(onTap: () => _edit(context, -1)),
      ],
    );
  }

  Future<void> _edit(BuildContext context, int index) async {
    final existing = index >= 0 ? hobbies[index] : null;
    final result = await _showHobbyEditor(context, existing);
    if (result == null) return;
    final next = [...hobbies];
    if (result.deleted) {
      if (index >= 0) next.removeAt(index);
    } else if (index >= 0) {
      next[index] = result.item!;
    } else {
      next.add(result.item!);
    }
    onChanged(next);
  }
}

class _HobbyChip extends StatelessWidget {
  const _HobbyChip({
    required this.item,
    required this.onTap,
    required this.onDelete,
  });

  final HobbyItem item;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: _rowFill,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: LoveColors.borderActive),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(hobbyIcon(item.icon), size: 16, color: LoveColors.textSecondary),
              const SizedBox(width: 7),
              Text(
                item.text,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: LoveColors.textPrimary,
                ),
              ),
              const SizedBox(width: 4),
              GestureDetector(
                onTap: onDelete,
                child: const Padding(
                  padding: EdgeInsets.all(2),
                  child: Icon(Icons.close_rounded, size: 15, color: LoveColors.textMuted),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddHobbyChip extends StatelessWidget {
  const _AddHobbyChip({required this.onTap});

  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 9),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(999),
            border: Border.all(color: LoveColors.borderActive),
          ),
          child: const Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.add_rounded, size: 16, color: LoveColors.textSecondary),
              SizedBox(width: 6),
              Text(
                'Добавить',
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                  color: LoveColors.textSecondary,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HobbyEditResult {
  const _HobbyEditResult({this.item, this.deleted = false});
  final HobbyItem? item;
  final bool deleted;
}

Future<_HobbyEditResult?> _showHobbyEditor(
  BuildContext context,
  HobbyItem? existing,
) {
  final nameController = TextEditingController(text: existing?.text ?? '');
  var selectedIcon = existing?.icon ?? 'tea';
  return showLoveSheet<_HobbyEditResult>(
    context,
    title: existing == null ? 'Добавить сферу' : 'Изменить сферу',
    builder: (context) => StatefulBuilder(
      builder: (context, setSheetState) {
        return Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: nameController,
              maxLength: 20,
              autofocus: true,
              decoration: const InputDecoration(
                labelText: 'Название',
                hintText: 'Фотография',
              ),
            ),
            const SizedBox(height: 8),
            const SettingsSubtitle('Иконка', padding: EdgeInsets.only(bottom: 8)),
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: [
                for (final name in hobbyIconNames)
                  _MoodChip(
                    icon: hobbyIcon(name),
                    selected: name == selectedIcon,
                    onTap: () => setSheetState(() => selectedIcon = name),
                  ),
              ],
            ),
            const SizedBox(height: 20),
            Row(
              children: [
                if (existing != null) ...[
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => Navigator.of(context)
                          .pop(const _HobbyEditResult(deleted: true)),
                      child: const Text('Удалить'),
                    ),
                  ),
                  const SizedBox(width: 10),
                ],
                Expanded(
                  flex: 2,
                  child: FilledButton(
                    onPressed: () {
                      final text = nameController.text.trim();
                      if (text.isEmpty) return;
                      Navigator.of(context).pop(
                        _HobbyEditResult(
                          item: HobbyItem(text: text, icon: selectedIcon),
                        ),
                      );
                    },
                    child: const Text('Сохранить'),
                  ),
                ),
              ],
            ),
          ],
        );
      },
    ),
  );
}
