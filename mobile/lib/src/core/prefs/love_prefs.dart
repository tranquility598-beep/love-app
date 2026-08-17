import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Client-local settings store — the mobile equivalent of the web's
/// `localStorage` + `SettingsManager`. The desktop app persists everything
/// except profile/account here (appearance, privacy, notifications, voice, hub
/// channels, advanced flags, update channel, Dev Log votes). None of these hit
/// the server, so mobile mirrors that with `shared_preferences`.
///
/// Keys deliberately match the desktop keys 1:1 where the desktop defines one,
/// so the two clients stay conceptually in sync.
class LovePrefs {
  LovePrefs._();

  static final LovePrefs instance = LovePrefs._();

  SharedPreferences? _prefs;
  SharedPreferences get _p {
    final prefs = _prefs;
    assert(prefs != null, 'LovePrefs.init() must be awaited before use');
    return prefs!;
  }

  /// Applied globally by the app root (text scaling). 1.0 == 100%.
  final ValueNotifier<double> uiScale = ValueNotifier<double>(1.0);

  /// When true, the app should minimise motion (matches web `no-animations`).
  final ValueNotifier<bool> reduceMotion = ValueNotifier<bool>(false);

  /// When true, chat lists render denser (matches web `compact-mode`).
  final ValueNotifier<bool> compactMode = ValueNotifier<bool>(false);

  /// Выбранная тема: dark | light | system (matches web `app-theme`).
  /// «Системная» не хранится как итоговое значение — рендерится на лету
  /// по platformBrightness, чтобы смена темы ОС подхватывалась живьём.
  final ValueNotifier<String> theme = ValueNotifier<String>('dark');

  Future<void> init() async {
    if (_prefs != null) return;
    _prefs = await SharedPreferences.getInstance();
    uiScale.value = (getInt(K.uiScale, 100) / 100).clamp(0.75, 1.25);
    reduceMotion.value = !getBool(K.animations, true);
    compactMode.value = getBool(K.compactMode, false);
    final savedTheme = getString(K.theme, 'dark');
    theme.value =
        savedTheme == 'light' || savedTheme == 'system' ? savedTheme : 'dark';
  }

  // ── Typed accessors ──────────────────────────────────────────────────

  bool getBool(String key, bool fallback) => _p.getBool(key) ?? fallback;

  Future<void> setBool(String key, bool value) async {
    await _p.setBool(key, value);
    if (key == K.animations) reduceMotion.value = !value;
    if (key == K.compactMode) compactMode.value = value;
  }

  int getInt(String key, int fallback) => _p.getInt(key) ?? fallback;

  Future<void> setInt(String key, int value) async {
    await _p.setInt(key, value);
    if (key == K.uiScale) {
      uiScale.value = (value / 100).clamp(0.75, 1.25);
    }
  }

  String getString(String key, String fallback) =>
      _p.getString(key) ?? fallback;

  Future<void> setString(String key, String value) async {
    await _p.setString(key, value);
    if (key == K.theme) theme.value = value;
  }

  // ── Dev Log votes (matches localStorage["love_devlog_votes"]) ────────────

  Map<String, String> devLogVotes() {
    final raw = _p.getString(K.devLogVotes);
    if (raw == null || raw.isEmpty) return <String, String>{};
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        return decoded.map((k, v) => MapEntry(k.toString(), v.toString()));
      }
    } catch (_) {}
    return <String, String>{};
  }

  Future<void> setDevLogVote(String postId, String? vote) async {
    final votes = devLogVotes();
    if (vote == null) {
      votes.remove(postId);
    } else {
      votes[postId] = vote;
    }
    await _p.setString(K.devLogVotes, jsonEncode(votes));
  }

  /// Reset every client-local setting to its default (web `resetSettings()`).
  Future<void> resetAll() async {
    for (final key in K.all) {
      await _p.remove(key);
    }
    uiScale.value = 1.0;
    reduceMotion.value = false;
    compactMode.value = false;
  }
}

/// Preference keys. Values mirror the desktop `localStorage` keys where one
/// exists; the rest use a stable `love_` prefix.
class K {
  // Appearance
  static const theme = 'app-theme'; // dark | light | system
  static const uiScale = 'ui-scale'; // 75..125
  static const compactMode = 'compact-mode';
  static const animations = 'animations';
  static const transparency = 'transparency-effects';

  // Privacy
  static const privacyOnline = 'privacy-online-status';
  static const privacyProfile = 'privacy-profile-visibility'; // all|friends|none
  static const privacyActivity = 'privacy-activity';
  static const privacyFriendReq = 'privacy-friend-requests'; // all|fof|none
  static const privacyDm = 'privacy-dm'; // all|friends|none

  /// Предупреждать при переходе по ссылке на сторонний сайт (свои домены —
  /// без вопросов). Одноимённый ключ живёт в localStorage на ПК.
  static const linkWarning = 'love_link_warning';

  // Notifications
  static const notifDesktop = 'notif-desktop';
  static const notifPush = 'notif-push';
  static const notifMessages = 'notif-messages';
  static const notifMentions = 'notif-mentions';
  static const notifAppUpdates = 'notif-app-updates';
  static const notifHub = 'notif-hub';

  // Voice
  static const voiceInputDevice = 'voice-input-device';
  static const voiceOutputDevice = 'voice-output-device';
  static const inputVolume = 'input-volume';
  static const outputVolume = 'output-volume';
  static const noiseSuppression = 'noise-suppression';
  static const echoCancellation = 'echo-cancellation';
  static const voiceActivation = 'voice-activation';

  // Hub channels
  static const hubAnnouncements = 'hub-announcements';
  static const hubDevlog = 'hub-devlog';
  static const hubIdeas = 'hub-ideas';
  static const hubFeedback = 'hub-feedback';

  // Advanced
  static const debugMode = 'love_debug_mode';
  static const hwAccel = 'love_hw_accel';

  // Updates
  static const updateChannel = 'love_update_channel'; // stable | beta

  // Dev Log
  static const devLogVotes = 'love_devlog_votes';

  static const all = <String>[
    theme, uiScale, compactMode, animations, transparency,
    privacyOnline, privacyProfile, privacyActivity, privacyFriendReq, privacyDm,
    linkWarning,
    notifDesktop, notifPush, notifMessages, notifMentions, notifAppUpdates,
    notifHub,
    voiceInputDevice, voiceOutputDevice, inputVolume, outputVolume,
    noiseSuppression, echoCancellation, voiceActivation,
    hubAnnouncements, hubDevlog, hubIdeas, hubFeedback,
    debugMode, hwAccel, updateChannel,
  ];
}
