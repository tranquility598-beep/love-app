import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'love_page_transitions.dart';
import 'love_tokens.dart';

class LoveTheme {
  /// Единый каркас темы: одна структура на обе палитры, чтобы светлая не
  /// разбегалась с тёмной в деталях, которых нет в токенах.
  static ThemeData build(LovePalette p) {
    final base = p.brightness == Brightness.dark
        ? ThemeData.dark(useMaterial3: true)
        : ThemeData.light(useMaterial3: true);

    // Outfit lacks Cyrillic → fall back to platform fonts for those glyphs.
    const fallback = <String>['Roboto', 'sans-serif'];

    final textTheme = base.textTheme
        .apply(
          fontFamily: LoveFonts.sans,
          bodyColor: p.textPrimary,
          displayColor: p.textPrimary,
          fontFamilyFallback: fallback,
        )
        .copyWith(
          headlineSmall: base.textTheme.headlineSmall?.copyWith(
            fontWeight: FontWeight.w700,
          ),
          titleLarge: base.textTheme.titleLarge?.copyWith(
            fontWeight: FontWeight.w700,
          ),
        );

    return base.copyWith(
      scaffoldBackgroundColor: p.bgAndroid,
      colorScheme: (p.brightness == Brightness.dark
              ? const ColorScheme.dark()
              : const ColorScheme.light())
          .copyWith(
        primary: p.accent,
        onPrimary: p.onAccent,
        secondary: p.accentCool,
        surface: p.bgSecondary,
        onSurface: p.textPrimary,
        error: p.danger,
      ),
      splashColor: p.inkA(0.06),
      highlightColor: p.inkA(0.03),
      iconTheme: IconThemeData(color: p.textPrimary, size: 20),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: p.textSecondary,
      ),
      textTheme: textTheme,
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: p.inkA(0.03),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: const BorderRadius.all(LoveRadii.md),
          borderSide: BorderSide(color: p.inkA(0.08)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(LoveRadii.md),
          borderSide: BorderSide(color: p.inkA(0.08)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(LoveRadii.md),
          borderSide: BorderSide(color: p.inkA(0.35)),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(LoveRadii.md),
          borderSide: BorderSide(color: p.authError.withValues(alpha: 0.55)),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(LoveRadii.md),
          borderSide: BorderSide(color: p.authError.withValues(alpha: 0.75)),
        ),
        prefixIconColor: p.textMuted,
        labelStyle: TextStyle(color: p.textMuted),
        hintStyle: TextStyle(color: p.textMuted),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: p.accent,
          foregroundColor: p.onAccent,
          disabledBackgroundColor: p.accent.withValues(alpha: 0.35),
          disabledForegroundColor: p.onAccent.withValues(alpha: 0.5),
          minimumSize: const Size.fromHeight(46),
          textStyle: const TextStyle(
            fontFamily: LoveFonts.sans,
            fontWeight: FontWeight.w600,
            fontSize: 14,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          backgroundColor: p.inkA(0.06),
          foregroundColor: p.textPrimary,
          minimumSize: const Size.fromHeight(46),
          side: BorderSide(color: p.inkA(0.10)),
          textStyle: const TextStyle(
            fontFamily: LoveFonts.sans,
            fontWeight: FontWeight.w500,
            fontSize: 13.5,
          ),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          foregroundColor: p.textPrimary,
          textStyle: const TextStyle(
            fontFamily: LoveFonts.sans,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: p.textSecondary,
          disabledForegroundColor: p.textMuted,
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: p.inkA(0.05),
        selectedColor: p.inkA(0.12),
        disabledColor: p.inkA(0.04),
        labelStyle: TextStyle(
          color: p.textPrimary,
          fontFamily: LoveFonts.sans,
          fontSize: 13,
        ),
        secondaryLabelStyle: TextStyle(color: p.textPrimary),
        side: BorderSide(color: p.inkA(0.08)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: p.glassStrong,
        contentTextStyle: TextStyle(
          color: p.textPrimary,
          fontFamily: LoveFonts.sans,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: p.border),
        ),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: LovePageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
      dividerTheme: DividerThemeData(
        color: p.border,
        thickness: 1,
        space: 1,
      ),
    );
  }

  static ThemeData dark() => build(lovePaletteDark);

  static ThemeData light() => build(lovePaletteLight);
}

/// Тёмная тема, посчитанная один раз: [LoveFrameScope] ставит её на каждый
/// кадр, а собирать ThemeData внутри build() слишком дорого.
final ThemeData _frameTheme = LoveTheme.dark();

/// Поддерево, целиком занятое видеокадром: фуллскрин фото, кадр видео,
/// просмотр демонстрации экрана.
///
/// Кадр тёмный независимо от темы приложения, поэтому внутри возвращаем тёмную
/// палитру целиком — подписи, кнопки, плашки и спиннеры поверх кадра красятся
/// сами, включая те, что появятся в этом поддереве позже.
///
/// Без этого светлая тема давала чёрное на чёрном: фон плашки берётся из
/// [LovePalette.shadeA] (настоящий чёрный в обеих темах), а чернила — из
/// `accent`, который в светлой теме почти чёрный. Тем же путём фуллскрин видео
/// и просмотр демки открывались на белом фоне: их подложка объявлена как
/// `onAccent`, и это чёрный только в тёмной теме.
///
/// Работает потому, что [LovePaletteScope] — обычный `InheritedWidget`, а
/// `dependOnInheritedWidgetOfExactType` находит ближайшего родителя: вложенная
/// область перекрывает внешнюю ровно так же, как переопределённая CSS-переменная
/// перекрывает её значение выше по дереву.
///
/// Оборачивать можно только то, что целиком занято кадром. Заглушку до загрузки
/// видео — белую плашку с тёмным значком — нельзя: в светлой теме она уже права,
/// и тёмная рампа сломала бы то, что работало.
///
/// Принимает `builder`, а не готовый `child`, и это не стилистика. Область
/// действия любого `InheritedWidget` — только его потомки, поэтому
/// `context.palette` в том же `build`, где объявлена обёртка, смотрел бы мимо
/// неё и возвращал светлую палитру. `builder` получает контекст уже под
/// обёрткой, так что ошибиться этим способом нельзя.
class LoveFrameScope extends StatelessWidget {
  const LoveFrameScope({required this.builder, super.key});

  final WidgetBuilder builder;

  @override
  Widget build(BuildContext context) => LovePaletteScope(
        palette: lovePaletteDark,
        child: Theme(
          data: _frameTheme,
          child: AnnotatedRegion<SystemUiOverlayStyle>(
            // Иконки статус-бара тоже часть «поддерево тёмное». Общий стиль
            // ставится один раз на всё приложение (`app.dart`), и в светлой
            // теме он тёмный — поверх чёрного кадра часы и батарея исчезали.
            // Вложенная область лежит глубже и перекрывает внешнюю; в тёмной
            // теме значение то же, что снаружи, так что ничего не меняется.
            value: lovePaletteDark.systemUiOverlay,
            child: Builder(builder: builder),
          ),
        ),
      );
}
