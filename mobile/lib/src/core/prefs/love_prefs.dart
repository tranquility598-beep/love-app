import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Client-local settings store.
///
/// Preferences must never make a settings screen fail to build. If Android's
/// SharedPreferences is temporarily unavailable, values are kept in memory for
/// the current app session and all getters return their supplied defaults.
class LovePrefs {
  LovePrefs._();

  static final LovePrefs instance = LovePrefs._();

  SharedPreferences? _prefs;
  final Map<String, Object> _memory = <String, Object>{};
  bool _initializing = false;

  /// True when the platform-backed store is available.
  bool get isReady => _prefs != null;

  /// Applied globally by the app root (text scaling). 1.0 == 100%.
  final ValueNotifier<double> uiScale = ValueNotifier<double>(1.0);

  /// When true, the app should minimise motion (matches web `no-animations`).
  final ValueNotifier<bool> reduceMotion = ValueNotifier<bool>(false);

  /// Initializes the persistent store without making the application unusable
  /// if the plugin/platform call fails on a particular device.
  Future<void> init() async {
    if (_prefs != null || _initializing) return;
    _initializing = true;
    try {
      _prefs = await SharedPreferences.getInstance();
    } catch (error, stackTrace) {
      debugPrint('LovePrefs.init failed; using in-memory preferences: $error');
      debugPrintStack(stackTrace: stackTrace);
    } finally {
      _initializing = false;
    }

    uiScale.value = (getInt(K.uiScale, 100) / 100).clamp(0.75, 1.25);
    reduceMotion.value = !getBool(K.animations, true);
  }

  // ── Typed accessors ──────────────────────────────────────────────────────

  bool getBool(String key, bool fallback) {
    final value = _prefs?.getBool(key) ?? _memory[key];
    return value is bool ? value : fallback;
  }

  Future<void> setBool(String key, bool value) async {
    _memory[key] = value;
    final prefs = _prefs;
    try {
      if (prefs != null) await prefs.setBool(key, value);
    } catch (error) {
      debugPrint('LovePrefs.setBool failed for $key: $error');
    }
    if (key == K.animations) reduceMotion.value = !value;
  }

  int getInt(String key, int fallback) {
    final value = _prefs?.getInt(key) ?? _memory[key];
    return value is int ? value : fallback;
  }

  Future<void> setInt(String key, int value) async {
    _memory[key] = value;
    final prefs = _prefs;
    try {
      if (prefs != null) await prefs.setInt(key, value);
    } catch (error) {
      debugPrint('LovePrefs.setInt failed for $key: $error');
    }
    if (key == K.uiScale) {
      uiScale.value = (value / 100).clamp(0.75, 1.25);
    }
  }

  String getString(String key, String fallback) {
    final value = _prefs?.getString(key) ?? _memory[key];
    return value is String ? value : fallback;
  }

  Future<void> setString(String key, String value) async {
    _memory[key] = value;
    final prefs = _prefs;
    try {
      if (prefs != null) await prefs.setString(key, value);
    } catch (error) {
      debugPrint('LovePrefs.setString failed for $key: $error');
    }
  }

  // ── Dev Log votes ────────────────────────────────────────────────────────

  Map<String, String> devLogVotes() {
    final raw = getString(K.devLogVotes, '');
    if (raw.isEmpty) return <String, String>{};
    try {
      final decoded = jsonDecode(raw);
      if (decoded is Map) {
        return decoded.map((key, value) =>
            MapEntry(key.toString(), value.toString()));
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
    await setString(K.devLogVotes, jsonEncode(votes));
  }

  /// Reset every client-local setting to its default.
  Future<void> resetAll() async {
    _memory.clear();
    final prefs = _prefs;
    if (prefs != null) {
      for (final key in K.all) {
        try {
          await prefs.remove(key);
        } catch (error) {
          debugPrint('LovePrefs.resetAll failed for $key: $error');
        }
      }
    }
    uiScale.value = 1.0;
    reduceMotion.value = false;
  }
}

/// Preference keys. Values mirror the desktop localStorage keys where one
/// exists; the rest use a stable love_ prefix.
class K {
  static const theme = 'app-theme';
  static const uiScale = 'ui-scale';
  static const compactMode = 'compact-mode';
  static const animations = 'animations';
  static const transparency = 'transparency-effects';

  static const privacyOnline = 'privacy-online-status';
  static const privacyProfile = 'privacy-profile-visibility';
  static const privacyActivity = 'privacy-activity';
  static const privacyFriendReq = 'privacy-friend-requests';
  static const privacyDm = 'privacy-dm';

  static const notifDesktop = 'notif-desktop';
  static const notifPush = 'notif-push';
  static const notifMessages = 'notif-messages';
  static const notifMentions = 'notif-mentions';
  static const notifAppUpdates = 'notif-app-updates';
  static const notifHub = 'notif-hub';

  static const voiceInputDevice = 'voice-input-device';
  static const voiceOutputDevice = 'voice-output-device';
  static const inputVolume = 'input-volume';
  static const outputVolume = 'output-volume';
  static const noiseSuppression = 'noise-suppression';
  static const echoCancellation = 'echo-cancellation';
  static const voiceActivation = 'voice-activation';

  static const hubAnnouncements = 'hub-announcements';
  static const hubDevlog = 'hub-devlog';
  static const hubIdeas = 'hub-ideas';
  static const hubFeedback = 'hub-feedback';

  static const debugMode = 'love_debug_mode';
  static const hwAccel = 'love_hw_accel';
  static const updateChannel = 'love_update_channel';
  static const devLogVotes = 'love_devlog_votes';

  static const all = <String>[
    theme, uiScale, compactMode, animations, transparency,
    privacyOnline, privacyProfile, privacyActivity, privacyFriendReq, privacyDm,
    notifDesktop, notifPush, notifMessages, notifMentions, notifAppUpdates,
    notifHub,
    voiceInputDevice, voiceOutputDevice, inputVolume, outputVolume,
    noiseSuppression, echoCancellation, voiceActivation,
    hubAnnouncements, hubDevlog, hubIdeas, hubFeedback,
    debugMode, hwAccel, updateChannel,
  ];
}
