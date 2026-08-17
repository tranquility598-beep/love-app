import 'dart:io' show Platform;

import 'package:flutter/services.dart';

class PickedAudioFile {
  const PickedAudioFile({
    required this.path,
    required this.name,
    this.mimeType = '',
    this.size = 0,
  });

  final String path;
  final String name;
  final String mimeType;
  final int size;
}

class AudioFilePicker {
  static const _channel = MethodChannel('love_mobile/audio_picker');

  static Future<PickedAudioFile?> pickAudio() async {
    if (!Platform.isAndroid) return null;
    final result = await _channel.invokeMapMethod<String, Object?>('pickAudio');
    if (result == null) return null;
    final path = result['path']?.toString() ?? '';
    if (path.isEmpty) return null;
    return PickedAudioFile(
      path: path,
      name: result['name']?.toString() ?? 'audio',
      mimeType: result['mimeType']?.toString() ?? '',
      size: int.tryParse(result['size']?.toString() ?? '') ?? 0,
    );
  }
}

class PickedChatFile {
  const PickedChatFile({
    required this.path,
    required this.name,
    this.mimeType = '',
    this.size = 0,
  });

  final String path;
  final String name;
  final String mimeType;
  final int size;

  bool get isImage => mimeType.startsWith('image/');
  bool get isAudio => mimeType.startsWith('audio/');
}

class RecordedVoiceMessage {
  const RecordedVoiceMessage({
    required this.path,
    required this.name,
    required this.durationMs,
    this.mimeType = 'audio/mp4',
    this.size = 0,
  });

  final String path;
  final String name;
  final String mimeType;
  final int durationMs;
  final int size;
}

class ChatNativeFiles {
  static const _channel = MethodChannel('love_mobile/audio_picker');

  static Future<PickedChatFile?> pickFile() async {
    if (!Platform.isAndroid) return null;
    final result = await _channel.invokeMapMethod<String, Object?>('pickFile');
    if (result == null) return null;
    final path = result['path']?.toString() ?? '';
    if (path.isEmpty) return null;
    return PickedChatFile(
      path: path,
      name: result['name']?.toString() ?? 'file',
      mimeType: result['mimeType']?.toString() ?? '',
      size: int.tryParse(result['size']?.toString() ?? '') ?? 0,
    );
  }

  static Future<void> startVoiceRecording() async {
    if (!Platform.isAndroid) return;
    await _channel.invokeMethod<void>('startVoiceRecording');
  }

  static Future<RecordedVoiceMessage?> stopVoiceRecording() async {
    if (!Platform.isAndroid) return null;
    final result =
        await _channel.invokeMapMethod<String, Object?>('stopVoiceRecording');
    if (result == null) return null;
    final path = result['path']?.toString() ?? '';
    if (path.isEmpty) return null;
    return RecordedVoiceMessage(
      path: path,
      name: result['name']?.toString() ?? 'voice.m4a',
      mimeType: result['mimeType']?.toString() ?? 'audio/mp4',
      durationMs: int.tryParse(result['durationMs']?.toString() ?? '') ?? 0,
      size: int.tryParse(result['size']?.toString() ?? '') ?? 0,
    );
  }

  static Future<void> cancelVoiceRecording() async {
    if (!Platform.isAndroid) return;
    await _channel.invokeMethod<void>('cancelVoiceRecording');
  }

  /// Текущий пик микрофона, 0..32767 (0 — записи нет).
  ///
  /// Нативный MediaRecorder не отдаёт поток амплитуд, поэтому живая волна
  /// при записи голосового строится опросом: каждый вызов возвращает максимум
  /// с прошлого вызова.
  static Future<int> voiceAmplitude() async {
    if (!Platform.isAndroid) return 0;
    final value = await _channel.invokeMethod<int>('voiceAmplitude');
    return value ?? 0;
  }
}
