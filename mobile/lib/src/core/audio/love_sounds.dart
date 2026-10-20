import 'dart:async';

import 'package:just_audio/just_audio.dart';

import '../prefs/love_prefs.dart';

/// Звуки интерфейса Love — тот же набор Soft v3, что и на ПК
/// (client/assets/sounds). Короткие события играются поверх всего, гудки
/// звонков — по кругу, пока звонок в нужной фазе.
///
/// Плееры не забирают аудиофокус: щелчок микрофона не должен ставить на паузу
/// музыку, а звук входа в войс — перебивать сам войс.
class LoveSounds {
  LoveSounds._();

  static final LoveSounds instance = LoveSounds._();

  static const events = <String>{
    'message_send',
    'message_receive',
    'notification',
    'system',
    'user_join',
    'user_leave',
    'voice_mute',
    'voice_unmute',
    'voice_deafen',
    'voice_undeafen',
    'call_incoming',
    'call_outgoing',
  };

  final _players = <String, AudioPlayer>{};
  String? _loop;

  bool get enabled => LovePrefs.instance.getBool(K.uiSounds, true);

  double get _volume =>
      (LovePrefs.instance.getInt(K.outputVolume, 100) / 100).clamp(0.0, 1.0);

  /// Короткий звук события. Ошибки воспроизведения не мешают интерфейсу.
  Future<void> play(String event) async {
    if (!enabled || !events.contains(event)) return;
    try {
      final player = await _player(event);
      await player.setLoopMode(LoopMode.off);
      await player.setVolume(_volume);
      await player.seek(Duration.zero);
      unawaited(player.play());
    } catch (_) {
      // Нет звука — не повод ломать кнопку.
    }
  }

  /// Луп звонка. Повторный вызов с тем же событием ничего не перезапускает.
  Future<void> startLoop(String event) async {
    if (_loop == event) return;
    await stopLoop();
    if (!enabled || !events.contains(event)) return;
    _loop = event;
    try {
      final player = await _player(event);
      await player.setLoopMode(LoopMode.one);
      await player.setVolume(_volume);
      await player.seek(Duration.zero);
      if (_loop == event) unawaited(player.play());
    } catch (_) {
      if (_loop == event) _loop = null;
    }
  }

  Future<void> stopLoop() async {
    final event = _loop;
    _loop = null;
    if (event == null) return;
    try {
      await _players[event]?.stop();
    } catch (_) {}
  }

  Future<AudioPlayer> _player(String event) async {
    final existing = _players[event];
    if (existing != null) return existing;
    final player = AudioPlayer(
      handleAudioSessionActivation: false,
      handleInterruptions: false,
    );
    await player.setAsset('assets/sounds/ui/$event.ogg');
    _players[event] = player;
    return player;
  }
}
