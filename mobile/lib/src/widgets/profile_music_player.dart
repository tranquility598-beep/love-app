import 'dart:async';

import 'package:flutter/material.dart';
import 'package:just_audio/just_audio.dart';

import '../config/app_config.dart';
import '../theme/love_tokens.dart';
import 'love_surface.dart';

/// Full inline music player for profiles — like the desktop client:
/// play/pause, seek bar and timings instead of a bare «Слушать» button.
class ProfileMusicPlayer extends StatefulWidget {
  const ProfileMusicPlayer({
    required this.title,
    required this.url,
    super.key,
  });

  final String title;
  final String url;

  @override
  State<ProfileMusicPlayer> createState() => _ProfileMusicPlayerState();
}

class _ProfileMusicPlayerState extends State<ProfileMusicPlayer> {
  final AudioPlayer _player = AudioPlayer();
  StreamSubscription<PlayerState>? _stateSub;
  bool _ready = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _stateSub = _player.playerStateStream.listen((state) {
      if (state.processingState == ProcessingState.completed) {
        _player.pause();
        _player.seek(Duration.zero);
      }
      if (mounted) setState(() {});
    });
    _load();
  }

  Future<void> _load() async {
    try {
      await _player.setUrl(AppConfig.mediaUrl(widget.url) ?? widget.url);
      if (mounted) setState(() => _ready = true);
    } catch (_) {
      if (mounted) setState(() => _error = 'Не удалось загрузить трек');
    }
  }

  @override
  void dispose() {
    _stateSub?.cancel();
    _player.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LoveSurface(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
      radius: 16,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: context.palette.inkA(0.08),
                  border: Border.all(color: context.palette.border),
                ),
                child: const Icon(Icons.music_note_rounded, size: 20),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      widget.title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style:  TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: context.palette.textPrimary,
                      ),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 2),
                      Text(
                        _error!,
                        style:  TextStyle(
                          fontSize: 11,
                          color: context.palette.textMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Material(
                color: context.palette.accent,
                shape: const CircleBorder(),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: !_ready
                      ? null
                      : () {
                          if (_player.playing) {
                            _player.pause();
                          } else {
                            _player.play();
                          }
                        },
                  child: SizedBox(
                    width: 42,
                    height: 42,
                    child: !_ready && _error == null
                        ?  Padding(
                            padding: EdgeInsets.all(12),
                            child: CircularProgressIndicator(
                              strokeWidth: 2,
                              color: context.palette.onAccent,
                            ),
                          )
                        : Icon(
                            _player.playing
                                ? Icons.pause_rounded
                                : Icons.play_arrow_rounded,
                            size: 24,
                            color: context.palette.onAccent,
                          ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          StreamBuilder<Duration>(
            stream: _player.positionStream,
            builder: (context, snapshot) {
              final duration = _player.duration ?? Duration.zero;
              var position = snapshot.data ?? Duration.zero;
              if (position > duration) position = duration;
              final maxMs = duration.inMilliseconds.toDouble();
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  SliderTheme(
                    data: SliderThemeData(
                      trackHeight: 3,
                      activeTrackColor: context.palette.accent,
                      inactiveTrackColor:
                          context.palette.inkA(0.14),
                      thumbColor: context.palette.accent,
                      thumbShape: const RoundSliderThumbShape(
                        enabledThumbRadius: 6,
                      ),
                      overlayShape: SliderComponentShape.noOverlay,
                    ),
                    child: Slider(
                      value: maxMs > 0
                          ? position.inMilliseconds.toDouble().clamp(0, maxMs)
                          : 0,
                      max: maxMs > 0 ? maxMs : 1,
                      onChanged: !_ready || maxMs <= 0
                          ? null
                          : (value) => _player.seek(
                                Duration(milliseconds: value.round()),
                              ),
                    ),
                  ),
                  const SizedBox(height: 2),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        _fmt(position),
                        style:  TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: context.palette.textMuted,
                        ),
                      ),
                      Text(
                        maxMs > 0 ? _fmt(duration) : '--:--',
                        style:  TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: context.palette.textMuted,
                        ),
                      ),
                    ],
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

String _fmt(Duration value) {
  final minutes = value.inMinutes;
  final seconds = (value.inSeconds % 60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
}
