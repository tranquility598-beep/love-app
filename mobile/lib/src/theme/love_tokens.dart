import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// Рабочая палитра приложения.
///
/// Раньше все цвета были `static const` в [LoveColors] и переключить тему в
/// рантайме было невозможно. Теперь палитра — обычный объект: тёмная и
/// светлая версии собираются один раз, а виджеты берут активную через
/// `context.palette` (см. [LovePaletteScope]). Поля намеренно не const:
/// палитра выбирается на лету, и нельзя дать компилятору «запечь» одну из
/// тем в константы.
///
/// Приложение строго монохромное: серое на почти чёрном (тёмная) или
/// серое на почти белом (светлая). Единственный цветной акцент —
/// разрушающий красный (`#E5544F`); зелёный success и золотой warning
/// существовали раньше и остаются без новых оттенков.
class LovePalette {
  LovePalette({
    required this.brightness,
    required this.bgDeep,
    required this.bgPrimary,
    required this.bgSecondary,
    required this.bgTertiary,
    required this.bgAndroid,
    required this.surface,
    required this.surfaceStrong,
    required this.surfaceRaised,
    required this.surfaceHighlight,
    required this.accent,
    required this.accentWarm,
    required this.accentCool,
    required this.onAccent,
    required this.success,
    required this.successBg,
    required this.successBorder,
    required this.warning,
    required this.warningBg,
    required this.bubbleOwn,
    required this.bubbleOwnText,
    required this.bubblePartner,
    required this.bubblePartnerText,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.textBright,
    required this.border,
    required this.borderActive,
    required this.borderStrong,
    required this.glass,
    required this.glassStrong,
    required this.scrim,
    required this.danger,
    required this.dangerHover,
    required this.dangerText,
    required this.dangerBg,
    required this.dangerBorder,
    required this.authError,
    required this.presenceOnline,
    required this.presenceOffline,
  });

  final Brightness brightness;

  // Backgrounds
  final Color bgDeep;
  final Color bgPrimary;
  final Color bgSecondary;
  final Color bgTertiary;

  /// True Android/WebView runtime background (perf-lite): flat, no gradient.
  final Color bgAndroid;

  // Surfaces
  final Color surface;
  final Color surfaceStrong;
  final Color surfaceRaised;
  final Color surfaceHighlight;

  /// Акцент: белый в тёмной теме, почти чёрный в светлой.
  final Color accent;
  final Color accentWarm;
  final Color accentCool;

  /// Чернила на акцентной поверхности (текст чёрным по белой кнопке —
  /// в светлой теме наоборот).
  final Color onAccent;

  // Статусные цвета (существовали до светлой темы, новых оттенков нет)
  final Color success;
  final Color successBg;
  final Color successBorder;
  final Color warning;
  final Color warningBg;

  // Message bubbles
  final Color bubbleOwn;
  final Color bubbleOwnText;
  final Color bubblePartner;
  final Color bubblePartnerText;

  // Text
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color textBright;

  // Borders
  final Color border;
  final Color borderActive;
  final Color borderStrong;

  // Glass (rendered as a solid translucent fill on Android — no BackdropFilter)
  final Color glass;
  final Color glassStrong;

  /// Шторка под модалками и затемнение под меню.
  final Color scrim;

  // Destructive red — the only chromatic color in the app.
  final Color danger;
  final Color dangerHover;
  final Color dangerText;
  final Color dangerBg;
  final Color dangerBorder;

  /// Auth error red (slightly brighter).
  final Color authError;

  // Presence
  final Color presenceOnline;
  final Color presenceOffline;

  /// Полупрозрачное «чернило»: рамки, ховеры, лёгкий текст поверх фона.
  /// В тёмной теме это белый, в светлой — чёрный (замена россыпи
  /// `Colors.white.withValues(alpha: …)`).
  Color inkA(double a) => accent.withValues(alpha: a);

  /// Полупрозрачная «глубина» поверх видеокадра: плашка с именем, кружок под
  /// иконкой, градиент под подписью. В обеих темах настоящий чёрный, потому что
  /// кадр тёмный независимо от темы приложения, а подпись на такой плашке
  /// светлая ([onShade]) — приглуши альфу, и она перестанет читаться.
  ///
  /// Для поверхностей самого приложения это не годится: тени и шторки — [dropA],
  /// утопленные плашки — [sinkA].
  Color shadeA(double a) => Colors.black.withValues(alpha: a);

  /// Затемнение поверх обычных экранов: тень под плавающим элементом (нижняя
  /// навигация, таблетка звонка, тост) и шторка под модальным листом.
  ///
  /// В тёмной теме это [shadeA] без изменений, в светлой альфа режется до 45%.
  /// Значения тут подбирались в тёмной теме, где их фактически не видно: чёрное
  /// поверх #0A0A0A почти не отличается от фона, поэтому «0.5» ощущалось как
  /// мягкая тень. На #F2F2F2 та же альфа — не глубина, а грязное серое пятно.
  ///
  /// Коэффициент не на глаз: это рампа ПК-клиента. Светлая тема там мягчит всю
  /// лестницу `--shade-a-*` (`client/styles/appearance.css:192-204`:
  /// 0.25→0.12, 0.4→0.18, 0.5→0.22, 0.6→0.26, 0.7→0.3) против тождественной
  /// тёмной (`:348-359`). Отношение по всему используемому диапазону ≈0.45.
  ///
  /// Там же видно и границу применения: область видеокадра
  /// (`appearance.css:309-314`) возвращает полную глубину, потому что «поверх
  /// кадра плашка обязана читаться». На мобиле эту роль играет
  /// `LoveFrameScope`, а внутри него палитра тёмная — значит [dropA] сам
  /// вернётся к полной альфе, отдельного правила не нужно.
  Color dropA(double a) => Colors.black.withValues(
        alpha: brightness == Brightness.dark ? a : a * 0.45,
      );

  /// Утопленная поверхность приложения: шапка сферы, плашка-заглушка внутри
  /// сообщения — всё, что должно читаться на ступень ниже соседней панели.
  ///
  /// Через [shadeA] это писать нельзя. В тёмной теме затемнение почти не видно
  /// (чёрное поверх почти чёрного) и работает именно как лёгкая ступень вниз.
  /// В светлой то же значение даёт не оттенок, а серую плиту: 22% чёрного
  /// поверх #F2F2F2 — это #BDBDBD. Поэтому в светлой теме ступень мягче в
  /// разы: смысл («чуть ниже соседней поверхности») остаётся, плита не
  /// появляется. Коэффициент подобран так, чтобы совпасть с веб-клиентом,
  /// где шапка чата на светлой плите нарисована как rgba(0,0,0,0.035).
  Color sinkA(double a) => brightness == Brightness.dark
      ? Colors.black.withValues(alpha: a)
      : Colors.black.withValues(alpha: a * 0.16);

  /// Свечение вокруг мелкого индикатора: точка онлайна, непрочитанное.
  ///
  /// В тёмной теме это белый ореол — свет, исходящий от элемента. В светлой
  /// приём не переводится: [inkA] там чёрный, и вокруг маленькой тёмной точки
  /// получается грязное пятно. Сама точка на светлом фоне видна и без ореола,
  /// поэтому в светлой теме свечения нет.
  Color glowA(double a) => brightness == Brightness.dark
      ? accent.withValues(alpha: a)
      : const Color(0x00000000);

  /// Чернила на плашке поверх кадра. Такие плашки залиты настоящим чёрным
  /// ([shadeA]) в обеих темах — значит и подпись на них в обеих темах светлая.
  /// Через `accent` это писать нельзя: в светлой теме он почти чёрный, и текст
  /// исчезал на собственной плашке.
  Color get onShade => const Color(0xFFFFFFFF);

  /// Плашка внутри своего баббла. Свой баббл инвертируется вместе с темой
  /// (светлый в тёмной, тёмный в светлой), поэтому «затемнить на 8%» работает
  /// только в одной из них. Берём чернила самого баббла — они контрастны его
  /// фону по определению.
  Color onBubbleOwnA(double a) => bubbleOwnText.withValues(alpha: a);

  /// Цвет иконок статус-бара: на тёмном фоне — белые, на светлом — тёмные.
  SystemUiOverlayStyle get systemUiOverlay => brightness == Brightness.dark
      ? SystemUiOverlayStyle.light
      : SystemUiOverlayStyle.dark;
}

/// Тёмная палитра — та, что раньше была единственной (`LoveColors`).
final LovePalette lovePaletteDark = LovePalette(
  brightness: Brightness.dark,
  bgDeep: const Color(0xFF040404),
  bgPrimary: const Color(0xFF080808),
  bgSecondary: const Color(0xFF0D0D0D),
  bgTertiary: const Color(0xFF121212),
  bgAndroid: const Color(0xFF0A0A0A),
  surface: const Color(0xEB111111),
  surfaceStrong: const Color(0xF5161616),
  surfaceRaised: const Color(0xFF161616),
  surfaceHighlight: const Color(0xFF1A1A1A),
  accent: const Color(0xFFFFFFFF),
  accentWarm: const Color(0xFFE8E8E8),
  accentCool: const Color(0xFFBDBDBD),
  onAccent: const Color(0xFF000000),
  success: const Color(0xFFEDEDED),
  successBg: const Color(0x1A4CB96A),
  successBorder: const Color(0x404CB96A),
  warning: const Color(0xFFE8B341),
  warningBg: const Color(0x12E8B341),
  bubbleOwn: const Color(0xFFE2E2E2),
  bubbleOwnText: const Color(0xFF080808),
  bubblePartner: const Color(0xFF171717),
  bubblePartnerText: const Color(0xFFDFDFDF),
  textPrimary: const Color(0xFFF5F5F5),
  textSecondary: const Color(0xFFA2A2A2),
  textMuted: const Color(0xFF646464),
  textBright: const Color(0xFFFFFFFF),
  border: const Color(0x0AFFFFFF), // rgba(255,255,255,0.04)
  borderActive: const Color(0x1FFFFFFF), // rgba(255,255,255,0.12)
  borderStrong: const Color(0x33FFFFFF),
  glass: const Color(0xF20A0A0A), // rgba(10,10,10,0.95) bottom nav / glass
  glassStrong: const Color(0xF21A1A1A),
  scrim: const Color(0xB3000000),
  danger: const Color(0xFFE5544F),
  dangerHover: const Color(0xFFD13B36),
  dangerText: const Color(0xFFEB5A5A),
  dangerBg: const Color(0x12E5544F), // rgba(229,84,79,0.07)
  dangerBorder: const Color(0x38E5544F), // rgba(229,84,79,0.22)
  authError: const Color(0xFFEB5A5A),
  presenceOnline: const Color(0xFFFFFFFF),
  presenceOffline: const Color(0x33FFFFFF), // rgba(255,255,255,0.2)
);

/// Светлая палитра: те же роли, значения перевёрнуты (серое на почти
/// белом). Свой баббл инвертируется — тёмный со светлым текстом, иначе
/// он исчезал бы на светлом фоне.
final LovePalette lovePaletteLight = LovePalette(
  brightness: Brightness.light,
  bgDeep: const Color(0xFFEDEDED),
  bgPrimary: const Color(0xFFF4F4F4),
  bgSecondary: const Color(0xFFFFFFFF),
  bgTertiary: const Color(0xFFECECEC),
  bgAndroid: const Color(0xFFF2F2F2),
  surface: const Color(0xF2FFFFFF),
  surfaceStrong: const Color(0xF7FFFFFF),
  surfaceRaised: const Color(0xFFE7E7E7),
  surfaceHighlight: const Color(0xFFDEDEDE),
  accent: const Color(0xFF0A0A0A),
  accentWarm: const Color(0xFF2A2A2A),
  accentCool: const Color(0xFF6E6E6E),
  onAccent: const Color(0xFFFFFFFF),
  // Зелёный и золотой берём темнее, чем в тёмной теме: на почти белом фоне
  // светлые оттенки давали 3:1 и ниже. Значения совпадают с веб-клиентом
  // (--success-text / --warning-text), там же посчитан контраст: 4.29 и 4.63.
  success: const Color(0xFF1F7A3D),
  successBg: const Color(0x1A4CB96A),
  successBorder: const Color(0x404CB96A),
  warning: const Color(0xFF8F6300),
  warningBg: const Color(0x14E8B341),
  bubbleOwn: const Color(0xFF1F1F1F),
  bubbleOwnText: const Color(0xFFF5F5F5),
  bubblePartner: const Color(0xFFFFFFFF),
  bubblePartnerText: const Color(0xFF1C1C1C),
  textPrimary: const Color(0xFF1C1C1C),
  textSecondary: const Color(0xFF5F5F5F),
  // Было #949494 — 2.64:1 на светлой плите, то есть ниже порога читаемости.
  // Роль та же (самый тихий текст), но теперь 4.01:1. В тёмной теме этот же
  // токен даёт 3.16:1, так что светлая тема больше не хуже тёмной.
  textMuted: const Color(0xFF757575),
  textBright: const Color(0xFF0A0A0A),
  border: const Color(0x17000000), // rgba(0,0,0,0.09)
  borderActive: const Color(0x3D000000), // rgba(0,0,0,0.24)
  borderStrong: const Color(0x42000000),
  glass: const Color(0xF7F7F7F7),
  glassStrong: const Color(0xFCFCFCFC),
  scrim: const Color(0x59000000),
  danger: const Color(0xFFE5544F),
  dangerHover: const Color(0xFFD13B36),
  dangerText: const Color(0xFFD6453F),
  dangerBg: const Color(0x14E5544F),
  dangerBorder: const Color(0x47E5544F),
  authError: const Color(0xFFD6453F),
  presenceOnline: const Color(0xFF1C1C1C),
  presenceOffline: const Color(0x33000000),
);

/// Носитель активной палитры. Ставится выше MaterialApp (см. app.dart),
/// чтобы `context.palette` был доступен везде, включая вложенные
/// навигаторы и диалоги.
class LovePaletteScope extends InheritedWidget {
  const LovePaletteScope({
    super.key,
    required this.palette,
    required super.child,
  });

  final LovePalette palette;

  static LovePalette of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<LovePaletteScope>()?.palette ??
      lovePaletteDark;

  @override
  bool updateShouldNotify(LovePaletteScope oldWidget) =>
      oldWidget.palette != palette;
}

extension LovePaletteContext on BuildContext {
  /// Активная палитра (тёмная или светлая) — замена бывшим `LoveColors.*`.
  LovePalette get palette => LovePaletteScope.of(this);
}

/// Font family names as registered in pubspec.yaml.
///
/// NOTE: `Outfit` ships without Cyrillic glyphs (same as the web bundle), so
/// Cyrillic text falls back to the platform font — exactly matching the web.
/// `Lora` (serif titles, often italic) and `FiraMono` (tiny uppercase labels)
/// both include Cyrillic.
class LoveFonts {
  static const sans = 'Outfit';
  static const serif = 'Lora';
  static const mono = 'FiraMono';
}

class LoveRadii {
  static const sm = Radius.circular(8);
  static const md = Radius.circular(12);
  static const lg = Radius.circular(16);
  static const xl = Radius.circular(20);
}

class LoveSpacing {
  static const xs = 4.0;
  static const sm = 8.0;
  static const md = 16.0;
  static const lg = 24.0;
  static const xl = 32.0;
}

/// Shared text styles that recur across screens.
///
/// Раньше были `static const` с цветами из `LoveColors` — то есть навсегда
/// тёмными. Теперь строятся от палитры вызывающего кода.
class LoveText {
  /// Big serif title used for list/page headers ("беседы", "Друзья"…).
  /// Lora italic, lowercase in the source, ~20px, weight 400, tight tracking.
  static TextStyle screenTitle(LovePalette palette) => TextStyle(
        fontFamily: LoveFonts.serif,
        fontStyle: FontStyle.italic,
        fontSize: 26,
        fontWeight: FontWeight.w500,
        letterSpacing: -0.5,
        color: palette.textPrimary,
        height: 1.0,
      );

  /// Serif non-italic title (auth form title, empty-state title).
  static TextStyle serifTitle(LovePalette palette) => TextStyle(
        fontFamily: LoveFonts.serif,
        fontSize: 22,
        fontWeight: FontWeight.w600,
        color: palette.textPrimary,
        height: 1.15,
      );

  /// Tiny uppercase mono label (input labels, section headers, timestamps).
  static TextStyle monoLabel(LovePalette palette) => TextStyle(
        fontFamily: LoveFonts.mono,
        fontSize: 10,
        fontWeight: FontWeight.w400,
        letterSpacing: 1.4,
        color: palette.textMuted,
      );

  /// Mono timestamp inside chat / notifications.
  static TextStyle monoTime(LovePalette palette) => TextStyle(
        fontFamily: LoveFonts.mono,
        fontSize: 10,
        fontWeight: FontWeight.w400,
        letterSpacing: 0.2,
        color: palette.inkA(0.35),
      );
}
