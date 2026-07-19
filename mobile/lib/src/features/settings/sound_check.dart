import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:record/record.dart';

/// Проигрывает короткий тестовый сигнал через динамики.
///
/// Заменяет SystemSound.play(SystemSoundType.alert), который на Android
/// является тихим no-op — поэтому «Проверить звук» раньше молчал.
Future<void> playTestSound() async {
  final player = AudioPlayer();
  try {
    await player.setAsset('assets/sounds/test_tone.wav');
    await player.play();
  } catch (_) {
    // Тестовый звук не критичен — молча игнорируем сбой плеера.
  } finally {
    await player.dispose();
  }
}

/// Полноценный тест микрофона: запись 3 секунды → воспроизведение.
Future<void> showMicTestDialog(BuildContext context) async {
  final status = await Permission.microphone.request();
  if (!context.mounted) return;
  if (!status.isGranted) {
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Нет доступа к микрофону')),
    );
    return;
  }
  await showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (_) => const _MicTestDialog(),
  );
}

enum _MicPhase { recording, playing, done, error }

class _MicTestDialog extends StatefulWidget {
  const _MicTestDialog();

  @override
  State<_MicTestDialog> createState() => _MicTestDialogState();
}

class _MicTestDialogState extends State<_MicTestDialog> {
  final AudioRecorder _recorder = AudioRecorder();
  final AudioPlayer _player = AudioPlayer();

  _MicPhase _phase = _MicPhase.recording;
  int _secondsLeft = 3;
  Timer? _timer;
  String? _path;

  @override
  void initState() {
    super.initState();
    _startRecording();
  }

  Future<void> _startRecording() async {
    _timer?.cancel();
    setState(() {
      _phase = _MicPhase.recording;
      _secondsLeft = 3;
    });
    try {
      final path =
          '${Directory.systemTemp.path}/love_mic_test_${DateTime.now().millisecondsSinceEpoch}.m4a';
      await _recorder.start(
        const RecordConfig(encoder: AudioEncoder.aacLc),
        path: path,
      );
      _timer = Timer.periodic(const Duration(seconds: 1), (t) {
        if (!mounted) {
          t.cancel();
          return;
        }
        if (_secondsLeft <= 1) {
          t.cancel();
          _finishRecording();
        } else {
          setState(() => _secondsLeft -= 1);
        }
      });
    } catch (_) {
      if (mounted) setState(() => _phase = _MicPhase.error);
    }
  }

  Future<void> _finishRecording() async {
    try {
      final path = await _recorder.stop();
      if (path == null) {
        if (mounted) setState(() => _phase = _MicPhase.error);
        return;
      }
      _path = path;
      if (!mounted) return;
      setState(() => _phase = _MicPhase.playing);
      await _player.setFilePath(path);
      await _player.play();
      if (mounted) setState(() => _phase = _MicPhase.done);
    } catch (_) {
      if (mounted) setState(() => _phase = _MicPhase.error);
    }
  }

  Future<void> _replay() async {
    if (_path == null) return;
    setState(() => _phase = _MicPhase.playing);
    try {
      await _player.seek(Duration.zero);
      await _player.play();
    } catch (_) {
      // ignore
    }
    if (mounted) setState(() => _phase = _MicPhase.done);
  }

  @override
  void dispose() {
    _timer?.cancel();
    _recorder.dispose();
    _player.dispose();
    final path = _path;
    if (path != null) {
      File(path).delete().ignore();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Проверка микрофона'),
      content: _content(),
      actions: _actions(context),
    );
  }

  Widget _content() {
    switch (_phase) {
      case _MicPhase.recording:
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.mic_rounded, size: 40),
            const SizedBox(height: 12),
            Text('Говорите… $_secondsLeft'),
            const SizedBox(height: 12),
            const LinearProgressIndicator(),
          ],
        );
      case _MicPhase.playing:
        return const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.volume_up_rounded, size: 40),
            SizedBox(height: 12),
            Text('Слушайте свою запись…'),
          ],
        );
      case _MicPhase.done:
        return const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.check_circle_outline_rounded, size: 40),
            SizedBox(height: 12),
            Text('Слышали себя? Значит, микрофон работает.'),
          ],
        );
      case _MicPhase.error:
        return const Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.error_outline_rounded, size: 40),
            SizedBox(height: 12),
            Text('Не удалось записать звук.\nПроверьте доступ к микрофону.'),
          ],
        );
    }
  }

  List<Widget> _actions(BuildContext context) {
    switch (_phase) {
      case _MicPhase.recording:
      case _MicPhase.playing:
        return [
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Отмена'),
          ),
        ];
      case _MicPhase.done:
        return [
          TextButton(
            onPressed: _replay,
            child: const Text('Послушать ещё'),
          ),
          TextButton(
            onPressed: _startRecording,
            child: const Text('Записать заново'),
          ),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Готово'),
          ),
        ];
      case _MicPhase.error:
        return [
          TextButton(
            onPressed: _startRecording,
            child: const Text('Попробовать снова'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Закрыть'),
          ),
        ];
    }
  }
}
