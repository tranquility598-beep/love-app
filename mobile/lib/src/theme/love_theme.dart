import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';

import 'love_page_transitions.dart';
import 'love_tokens.dart';

class LoveTheme {
  static ThemeData dark() {
    final base = ThemeData.dark(useMaterial3: true);

    // Outfit lacks Cyrillic → fall back to platform fonts for those glyphs.
    const fallback = <String>['Roboto', 'sans-serif'];

    final textTheme = base.textTheme
        .apply(
          fontFamily: LoveFonts.sans,
          bodyColor: LoveColors.textPrimary,
          displayColor: LoveColors.textPrimary,
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
      scaffoldBackgroundColor: LoveColors.bgAndroid,
      colorScheme: const ColorScheme.dark(
        primary: LoveColors.accent,
        onPrimary: Colors.black,
        secondary: LoveColors.accentCool,
        surface: LoveColors.bgSecondary,
        onSurface: LoveColors.textPrimary,
        error: LoveColors.danger,
      ),
      splashColor: Colors.white.withValues(alpha: 0.06),
      highlightColor: Colors.white.withValues(alpha: 0.03),
      iconTheme: const IconThemeData(color: LoveColors.textPrimary, size: 20),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: LoveColors.textSecondary,
      ),
      textTheme: textTheme,
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white.withValues(alpha: 0.03),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        border: OutlineInputBorder(
          borderRadius: const BorderRadius.all(LoveRadii.md),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(LoveRadii.md),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(LoveRadii.md),
          borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.35)),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(LoveRadii.md),
          borderSide: BorderSide(color: LoveColors.authError.withValues(alpha: 0.55)),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: const BorderRadius.all(LoveRadii.md),
          borderSide: BorderSide(color: LoveColors.authError.withValues(alpha: 0.75)),
        ),
        prefixIconColor: LoveColors.textMuted,
        labelStyle: const TextStyle(color: LoveColors.textMuted),
        hintStyle: const TextStyle(color: LoveColors.textMuted),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          backgroundColor: Colors.white,
          foregroundColor: Colors.black,
          disabledBackgroundColor: Colors.white.withValues(alpha: 0.35),
          disabledForegroundColor: Colors.black.withValues(alpha: 0.5),
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
          backgroundColor: Colors.white.withValues(alpha: 0.06),
          foregroundColor: LoveColors.textPrimary,
          minimumSize: const Size.fromHeight(46),
          side: BorderSide(color: Colors.white.withValues(alpha: 0.10)),
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
          foregroundColor: LoveColors.textPrimary,
          textStyle: const TextStyle(
            fontFamily: LoveFonts.sans,
            fontWeight: FontWeight.w500,
          ),
        ),
      ),
      iconButtonTheme: IconButtonThemeData(
        style: IconButton.styleFrom(
          foregroundColor: LoveColors.textSecondary,
          disabledForegroundColor: LoveColors.textMuted,
        ),
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: Colors.white.withValues(alpha: 0.05),
        selectedColor: Colors.white.withValues(alpha: 0.12),
        disabledColor: Colors.white.withValues(alpha: 0.04),
        labelStyle: const TextStyle(
          color: LoveColors.textPrimary,
          fontFamily: LoveFonts.sans,
          fontSize: 13,
        ),
        secondaryLabelStyle: const TextStyle(color: LoveColors.textPrimary),
        side: BorderSide(color: Colors.white.withValues(alpha: 0.08)),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xF21A1A1A),
        contentTextStyle: const TextStyle(
          color: LoveColors.textPrimary,
          fontFamily: LoveFonts.sans,
        ),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
          side: BorderSide(color: LoveColors.border),
        ),
      ),
      pageTransitionsTheme: const PageTransitionsTheme(
        builders: {
          TargetPlatform.android: LovePageTransitionsBuilder(),
          TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
        },
      ),
      dividerTheme: const DividerThemeData(
        color: LoveColors.border,
        thickness: 1,
        space: 1,
      ),
    );
  }
}
