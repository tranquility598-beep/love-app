import 'package:flutter/material.dart';

/// Core Love color palette. Ported 1:1 from the web `:root` tokens.
///
/// The app is monochrome grey-on-near-black. The ONLY chromatic accent is the
/// destructive red (`#E5544F`). Do not introduce other hues.
class LoveColors {
  // Backgrounds
  static const bgPrimary = Color(0xFF080808);
  static const bgSecondary = Color(0xFF0D0D0D);
  static const bgTertiary = Color(0xFF121212);

  /// True Android/WebView runtime background (perf-lite): flat, no gradient.
  static const bgAndroid = Color(0xFF0A0A0A);

  // Surfaces
  static const surface = Color(0xEB111111);
  static const surfaceStrong = Color(0xF5161616);

  // Accents (white is the "primary")
  static const accent = Color(0xFFFFFFFF);
  static const accentWarm = Color(0xFFE8E8E8);
  static const accentCool = Color(0xFFBDBDBD);
  static const success = Color(0xFFEDEDED);

  // Message bubbles
  static const bubbleOwn = Color(0xFFE2E2E2);
  static const bubbleOwnText = Color(0xFF080808);
  static const bubblePartner = Color(0xFF171717);
  static const bubblePartnerText = Color(0xFFDFDFDF);

  // Text
  static const textPrimary = Color(0xFFF5F5F5);
  static const textSecondary = Color(0xFFA2A2A2);
  static const textMuted = Color(0xFF646464);

  // Borders (web: 0.04 / 0.12 white)
  static const border = Color(0x0AFFFFFF); // rgba(255,255,255,0.04)
  static const borderActive = Color(0x1FFFFFFF); // rgba(255,255,255,0.12)

  // Glass (rendered as a solid translucent fill on Android — no BackdropFilter)
  static const glass = Color(0xF20A0A0A); // rgba(10,10,10,0.95) bottom nav / glass

  // Destructive red — the only chromatic color in the app.
  static const danger = Color(0xFFE5544F);
  static const dangerHover = Color(0xFFD13B36);
  static const dangerBg = Color(0x12E5544F); // rgba(229,84,79,0.07)
  static const dangerBorder = Color(0x38E5544F); // rgba(229,84,79,0.22)

  // Auth error red (slightly brighter)
  static const authError = Color(0xFFEB5A5A);

  // Presence
  static const presenceOnline = Color(0xFFFFFFFF);
  static const presenceOffline = Color(0x33FFFFFF); // rgba(255,255,255,0.2)
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
class LoveText {
  /// Big serif title used for list/page headers ("беседы", "Друзья"…).
  /// Lora italic, lowercase in the source, ~20px, weight 400, tight tracking.
  static const screenTitle = TextStyle(
    fontFamily: LoveFonts.serif,
    fontStyle: FontStyle.italic,
    fontSize: 26,
    fontWeight: FontWeight.w500,
    letterSpacing: -0.5,
    color: LoveColors.textPrimary,
    height: 1.0,
  );

  /// Serif non-italic title (auth form title, empty-state title).
  static const serifTitle = TextStyle(
    fontFamily: LoveFonts.serif,
    fontSize: 22,
    fontWeight: FontWeight.w600,
    color: LoveColors.textPrimary,
    height: 1.15,
  );

  /// Tiny uppercase mono label (input labels, section headers, timestamps).
  static const monoLabel = TextStyle(
    fontFamily: LoveFonts.mono,
    fontSize: 10,
    fontWeight: FontWeight.w400,
    letterSpacing: 1.4,
    color: LoveColors.textMuted,
  );

  /// Mono timestamp inside chat / notifications.
  static const monoTime = TextStyle(
    fontFamily: LoveFonts.mono,
    fontSize: 10,
    fontWeight: FontWeight.w400,
    letterSpacing: 0.2,
    color: Color(0x59FFFFFF), // rgba(255,255,255,0.35)
  );
}
