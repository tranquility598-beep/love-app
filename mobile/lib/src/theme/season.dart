import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../core/prefs/love_prefs.dart';
import 'love_tokens.dart';

/// Сезонное оформление поверх тёмной/светлой темы — тот же ключ `app-season`
/// и тот же характер, что на ПК (client/styles/halloween.css): чёрно-белая
/// основа, тыквенный оранжевый только как акцент, без сплошных заливок.
/// По календарю само не включается — только выбор пользователя.
class Season {
  Season._();

  static ValueNotifier<String> get notifier => LovePrefs.instance.season;

  static bool get isHalloween => notifier.value == 'halloween';

  /// Тыквенный оранжевый. На светлом фоне темнее — ради контраста иконок.
  static Color accent(LovePalette palette) => palette.brightness == Brightness.dark
      ? const Color(0xFFF28C28)
      : const Color(0xFFC4610F);

  static Color glow(LovePalette palette, [double alpha = 0.24]) =>
      const Color(0xFFF28C28).withValues(alpha: alpha);
}

/// Пересобирает поддерево при смене сезона.
class SeasonBuilder extends StatelessWidget {
  const SeasonBuilder({required this.builder, super.key});

  final Widget Function(BuildContext context, bool halloween) builder;

  @override
  Widget build(BuildContext context) {
    return ValueListenableBuilder<String>(
      valueListenable: Season.notifier,
      builder: (context, season, _) => builder(context, season == 'halloween'),
    );
  }
}

/// Фоновый декор экрана: тёплый отсвет внизу и паутина в верхнем углу.
/// Лежит под содержимым и не ловит касания.
class HalloweenBackdrop extends StatelessWidget {
  const HalloweenBackdrop({super.key});

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    return IgnorePointer(
      child: Stack(
        children: [
          Positioned.fill(
            child: DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(-0.85, 1.15),
                  radius: 0.9,
                  colors: [Season.glow(palette, 0.07), Season.glow(palette, 0)],
                ),
              ),
            ),
          ),
          Positioned(
            top: 0,
            right: 0,
            child: Transform.flip(
              flipX: true,
              child: SvgPicture.asset(
                'assets/season/web.svg',
                width: 104,
                height: 104,
                colorFilter: ColorFilter.mode(palette.inkA(0.14), BlendMode.srcIn),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Знак пустого состояния в Halloween: фонарь-тыква с мягким свечением и
/// призрак рядом. Призрак парит, только если анимации включены.
class HalloweenEmptyMark extends StatefulWidget {
  const HalloweenEmptyMark({this.size = 88, super.key});

  final double size;

  @override
  State<HalloweenEmptyMark> createState() => _HalloweenEmptyMarkState();
}

class _HalloweenEmptyMarkState extends State<HalloweenEmptyMark>
    with SingleTickerProviderStateMixin {
  late final AnimationController _float = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 3200),
  );

  @override
  void initState() {
    super.initState();
    LovePrefs.instance.reduceMotion.addListener(_syncMotion);
    _syncMotion();
  }

  void _syncMotion() {
    if (LovePrefs.instance.reduceMotion.value) {
      _float.stop();
      _float.value = 0;
    } else if (!_float.isAnimating) {
      _float.repeat(reverse: true);
    }
  }

  @override
  void dispose() {
    LovePrefs.instance.reduceMotion.removeListener(_syncMotion);
    _float.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final size = widget.size;
    return SizedBox(
      width: size + 40,
      height: size + 12,
      child: Stack(
        clipBehavior: Clip.none,
        alignment: Alignment.center,
        children: [
          Container(
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              // Цвет фона внутри обязателен: у прозрачного круга тень свечения
              // просвечивает насквозь и выглядит сплошной оранжевой заливкой.
              color: palette.bgAndroid,
              border: Border.all(color: Season.accent(palette).withValues(alpha: 0.45)),
              boxShadow: [BoxShadow(color: Season.glow(palette, 0.22), blurRadius: 22)],
            ),
            padding: EdgeInsets.all(size * 0.16),
            child: SvgPicture.asset('assets/season/pumpkin.svg'),
          ),
          Positioned(
            top: -6,
            right: 2,
            child: AnimatedBuilder(
              animation: _float,
              builder: (context, child) => Transform.translate(
                offset: Offset(0, -5 * Curves.easeInOut.transform(_float.value)),
                child: child,
              ),
              child: SvgPicture.asset(
                'assets/season/ghost.svg',
                width: size * 0.27,
                height: size * 0.32,
                colorFilter: ColorFilter.mode(palette.inkA(0.8), BlendMode.srcIn),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Карточка выбора сезонной темы в «Внешний вид».
class SeasonPicker extends StatelessWidget {
  const SeasonPicker({super.key});

  @override
  Widget build(BuildContext context) {
    return SeasonBuilder(
      builder: (context, halloween) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 10),
        child: Row(
          children: [
            _SeasonOption(
              label: 'Обычная',
              active: !halloween,
              leading: Icon(Icons.circle_outlined,
                  size: 20,
                  color: !halloween ? context.palette.accent : context.palette.textSecondary),
              onTap: () => LovePrefs.instance.setString(K.season, 'none'),
            ),
            const SizedBox(width: 8),
            _SeasonOption(
              label: 'Halloween',
              active: halloween,
              leading: SvgPicture.asset('assets/season/pumpkin.svg', width: 22, height: 22),
              onTap: () => LovePrefs.instance.setString(K.season, 'halloween'),
            ),
          ],
        ),
      ),
    );
  }
}

class _SeasonOption extends StatelessWidget {
  const _SeasonOption({
    required this.label,
    required this.active,
    required this.leading,
    required this.onTap,
  });

  final String label;
  final bool active;
  final Widget leading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final palette = context.palette;
    final halloweenActive = active && label == 'Halloween';
    final border = halloweenActive ? Season.accent(palette) : (active ? palette.accent : palette.border);
    return Expanded(
      child: Material(
        color: active ? palette.inkA(0.08) : palette.inkA(0.03),
        borderRadius: BorderRadius.circular(12),
        child: InkWell(
          borderRadius: BorderRadius.circular(12),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 14),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: border),
              boxShadow: halloweenActive
                  ? [BoxShadow(color: Season.glow(palette, 0.2), blurRadius: 16)]
                  : null,
            ),
            child: Column(
              children: [
                leading,
                const SizedBox(height: 6),
                Text(
                  label,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w600,
                    color: active ? palette.textPrimary : palette.textSecondary,
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
