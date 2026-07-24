import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:just_audio/just_audio.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import '../../config/app_config.dart';
import '../../theme/love_tokens.dart';
import 'chat_models.dart';

/// Renders one message attachment the way desktop does: inline images and
/// gifs, an audio player for voice messages and music, an inline video
/// player, and a file chip as the fallback.
class AttachmentView extends StatelessWidget {
  const AttachmentView({
    required this.attachment,
    required this.own,
    super.key,
  });

  final ChatAttachment attachment;
  final bool own;

  @override
  Widget build(BuildContext context) {
    final url = AppConfig.mediaUrl(attachment.url) ?? attachment.url;
    if (url.isEmpty) return const SizedBox.shrink();

    if (attachment.isImage) {
      return _ImageAttachment(url: url, name: attachment.name, own: own);
    }
    // Voice first: desktop voice notes are `.webm` audio.
    if (attachment.isVoice) {
      final isVoiceNote = attachment.name.toLowerCase().endsWith('.webm');
      return AudioAttachmentPlayer(
        url: url,
        title: isVoiceNote ? 'Голосовое сообщение' : attachment.name,
        own: own,
      );
    }
    if (attachment.isVideo) {
      return VideoAttachmentPlayer(url: url);
    }
    return FileChip(name: attachment.name, url: url, own: own);
  }
}

// ---------------------------------------------------------------------------
// Images / GIFs
// ---------------------------------------------------------------------------

class _ImageAttachment extends StatelessWidget {
  const _ImageAttachment({
    required this.url,
    required this.name,
    required this.own,
  });

  final String url;
  final String name;
  final bool own;

  @override
  Widget build(BuildContext context) {
    final maxWidth = MediaQuery.sizeOf(context).width * 0.6;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: GestureDetector(
        onTap: () => Navigator.of(context).push(
          MaterialPageRoute(
            fullscreenDialog: true,
            builder: (_) => _ImageViewerScreen(url: url, name: name),
          ),
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: ConstrainedBox(
            constraints: BoxConstraints(maxWidth: maxWidth, maxHeight: 320),
            child: Image.network(
              url,
              fit: BoxFit.cover,
              loadingBuilder: (context, child, progress) {
                if (progress == null) return child;
                return Container(
                  width: maxWidth,
                  height: 150,
                  color: Colors.white.withValues(alpha: 0.05),
                  child: const Center(
                    child: SizedBox(
                      width: 22,
                      height: 22,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  ),
                );
              },
              errorBuilder: (context, error, stack) =>
                  FileChip(name: name, url: url, own: own),
            ),
          ),
        ),
      ),
    );
  }
}

class _ImageViewerScreen extends StatelessWidget {
  const _ImageViewerScreen({required this.url, required this.name});

  final String url;
  final String name;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text(
          name,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
          style: const TextStyle(fontSize: 14),
        ),
      ),
      body: Center(
        child: InteractiveViewer(
          minScale: 0.6,
          maxScale: 5,
          child: Image.network(
            url,
            errorBuilder: (context, error, stack) => const Padding(
              padding: EdgeInsets.all(24),
              child: Text(
                'Не удалось загрузить изображение',
                style: TextStyle(color: Colors.white70),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Audio (voice messages + music files)
// ---------------------------------------------------------------------------

class AudioAttachmentPlayer extends StatefulWidget {
  const AudioAttachmentPlayer({
    required this.url,
    required this.title,
    required this.own,
    super.key,
  });

  final String url;
  final String title;
  final bool own;

  @override
  State<AudioAttachmentPlayer> createState() => _AudioAttachmentPlayerState();
}

class _AudioAttachmentPlayerState extends State<AudioAttachmentPlayer> {
  final AudioPlayer _player = AudioPlayer();
  bool _loaded = false;
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _player.playerStateStream.listen((state) {
      if (state.processingState == ProcessingState.completed) {
        _player.pause();
        _player.seek(Duration.zero);
      }
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _player.dispose();
    super.dispose();
  }

  Future<void> _toggle() async {
    try {
      if (!_loaded) {
        setState(() {
          _loading = true;
          _error = null;
        });
        await _player.setUrl(widget.url);
        _loaded = true;
      }
      if (_player.playing) {
        await _player.pause();
      } else {
        unawaited(_player.play());
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Не удалось воспроизвести');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final base = widget.own ? Colors.black : Colors.white;
    return Container(
      width: 236,
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.fromLTRB(8, 8, 12, 8),
      decoration: BoxDecoration(
        color: base.withValues(alpha: widget.own ? 0.07 : 0.055),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: base.withValues(alpha: 0.1)),
      ),
      child: Row(
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(18),
            onTap: _loading ? null : _toggle,
            child: Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: base.withValues(alpha: 0.12),
              ),
              child: _loading
                  ? Padding(
                      padding: const EdgeInsets.all(9),
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: base,
                      ),
                    )
                  : Icon(
                      _player.playing
                          ? Icons.pause_rounded
                          : Icons.play_arrow_rounded,
                      size: 22,
                      color: base,
                    ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  _error ?? widget.title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                    color: base.withValues(alpha: 0.85),
                  ),
                ),
                StreamBuilder<Duration>(
                  stream: _player.positionStream,
                  builder: (context, snapshot) {
                    final duration = _player.duration ?? Duration.zero;
                    var position = snapshot.data ?? Duration.zero;
                    if (position > duration) position = duration;
                    final maxMs = duration.inMilliseconds.toDouble();
                    return Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        SliderTheme(
                          data: SliderThemeData(
                            trackHeight: 2,
                            activeTrackColor: base.withValues(alpha: 0.8),
                            inactiveTrackColor: base.withValues(alpha: 0.18),
                            thumbColor: base,
                            thumbShape: const RoundSliderThumbShape(
                              enabledThumbRadius: 5,
                            ),
                            overlayShape: SliderComponentShape.noOverlay,
                          ),
                          child: Slider(
                            value: maxMs > 0
                                ? position.inMilliseconds
                                    .toDouble()
                                    .clamp(0, maxMs)
                                : 0,
                            max: maxMs > 0 ? maxMs : 1,
                            onChanged: !_loaded || maxMs <= 0
                                ? null
                                : (value) => _player.seek(
                                      Duration(milliseconds: value.round()),
                                    ),
                          ),
                        ),
                        Text(
                          maxMs > 0
                              ? '${_fmtDuration(position)} / ${_fmtDuration(duration)}'
                              : ' ',
                          style: TextStyle(
                            fontSize: 10,
                            color: base.withValues(alpha: 0.55),
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

class VideoAttachmentPlayer extends StatefulWidget {
  const VideoAttachmentPlayer({required this.url, super.key});

  final String url;

  @override
  State<VideoAttachmentPlayer> createState() => _VideoAttachmentPlayerState();
}

class _VideoAttachmentPlayerState extends State<VideoAttachmentPlayer> {
  VideoPlayerController? _controller;
  bool _initializing = false;
  String? _error;

  @override
  void dispose() {
    _controller?.dispose();
    super.dispose();
  }

  Future<void> _start() async {
    final existing = _controller;
    if (existing != null) {
      if (existing.value.isPlaying) {
        await existing.pause();
      } else {
        await existing.play();
      }
      if (mounted) setState(() {});
      return;
    }
    setState(() {
      _initializing = true;
      _error = null;
    });
    try {
      final controller = VideoPlayerController.networkUrl(
        Uri.parse(widget.url),
      );
      await controller.initialize();
      controller.addListener(() {
        if (mounted) setState(() {});
      });
      _controller = controller;
      await controller.play();
    } catch (_) {
      _error = 'Не удалось загрузить видео';
    } finally {
      if (mounted) setState(() => _initializing = false);
    }
  }

  Future<void> _openFullscreen() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    await SystemChrome.setPreferredOrientations(DeviceOrientation.values);
    if (!mounted) return;
    await Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => FullscreenVideoPage(controller: controller),
      ),
    );
    await SystemChrome.setPreferredOrientations(
      const [DeviceOrientation.portraitUp],
    );
  }

  @override
  Widget build(BuildContext context) {
    final maxWidth = MediaQuery.sizeOf(context).width * 0.64;
    final controller = _controller;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: maxWidth,
          child: controller == null || !controller.value.isInitialized
              ? GestureDetector(
                  onTap: _initializing ? null : _start,
                  child: AspectRatio(
                    aspectRatio: 16 / 9,
                    child: Container(
                      color: Colors.black.withValues(alpha: 0.45),
                      child: Center(
                        child: _initializing
                            ? const SizedBox(
                                width: 26,
                                height: 26,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                ),
                              )
                            : _error != null
                                ? Padding(
                                    padding: const EdgeInsets.all(12),
                                    child: Text(
                                      _error!,
                                      textAlign: TextAlign.center,
                                      style: const TextStyle(
                                        color: Colors.white70,
                                        fontSize: 12,
                                      ),
                                    ),
                                  )
                                : Container(
                                    width: 52,
                                    height: 52,
                                    decoration: BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: Colors.white.withValues(
                                        alpha: 0.14,
                                      ),
                                      border: Border.all(
                                        color: Colors.white.withValues(
                                          alpha: 0.4,
                                        ),
                                      ),
                                    ),
                                    child: const Icon(
                                      Icons.play_arrow_rounded,
                                      size: 30,
                                      color: Colors.white,
                                    ),
                                  ),
                      ),
                    ),
                  ),
                )
              : AspectRatio(
                  aspectRatio: controller.value.aspectRatio <= 0
                      ? 16 / 9
                      : controller.value.aspectRatio,
                  child: Stack(
                    alignment: Alignment.center,
                    children: [
                      VideoPlayer(controller),
                      GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: _start,
                        child: AnimatedOpacity(
                          opacity: controller.value.isPlaying ? 0 : 1,
                          duration: const Duration(milliseconds: 160),
                          child: Container(
                            color: Colors.black.withValues(alpha: 0.25),
                            child: const Center(
                              child: Icon(
                                Icons.play_arrow_rounded,
                                size: 46,
                                color: Colors.white,
                              ),
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        top: 6,
                        right: 6,
                        child: _VideoOverlayButton(
                          icon: Icons.fullscreen_rounded,
                          onTap: _openFullscreen,
                        ),
                      ),
                      Positioned(
                        left: 0,
                        right: 0,
                        bottom: 0,
                        child: VideoProgressIndicator(
                          controller,
                          allowScrubbing: true,
                          padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
                          colors: const VideoProgressColors(
                            playedColor: Colors.white,
                            bufferedColor: Colors.white24,
                            backgroundColor: Colors.white12,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Fallback file chip (old behaviour)
// ---------------------------------------------------------------------------

class FileChip extends StatelessWidget {
  const FileChip({
    required this.name,
    required this.url,
    required this.own,
    super.key,
  });

  final String name;
  final String url;
  final bool own;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: url.isEmpty ? null : () => launchUrl(Uri.parse(url)),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: own
                ? Colors.black.withValues(alpha: 0.08)
                : Colors.white.withValues(alpha: 0.055),
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: own
                  ? Colors.black.withValues(alpha: 0.08)
                  : LoveColors.border,
            ),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Icon(Icons.attach_file_rounded, size: 17),
              const SizedBox(width: 8),
              Flexible(
                child: Text(
                  name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _fmtDuration(Duration value) {
  final minutes = value.inMinutes;
  final seconds = (value.inSeconds % 60).toString().padLeft(2, '0');
  return '$minutes:$seconds';
}

// ---------------------------------------------------------------------------
// Fullscreen video
// ---------------------------------------------------------------------------

class _VideoOverlayButton extends StatelessWidget {
  const _VideoOverlayButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black.withValues(alpha: 0.45),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 34,
          height: 34,
          child: Icon(icon, size: 20, color: Colors.white),
        ),
      ),
    );
  }
}

/// Fullscreen playback for video attachments. Reuses the inline controller,
/// so position and play state stay in sync with the bubble player.
class FullscreenVideoPage extends StatefulWidget {
  const FullscreenVideoPage({required this.controller, super.key});

  final VideoPlayerController controller;

  @override
  State<FullscreenVideoPage> createState() => _FullscreenVideoPageState();
}

class _FullscreenVideoPageState extends State<FullscreenVideoPage> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_onTick);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onTick);
    super.dispose();
  }

  void _onTick() {
    if (mounted) setState(() {});
  }

  Future<void> _togglePlay() async {
    final controller = widget.controller;
    if (controller.value.isPlaying) {
      await controller.pause();
    } else {
      await controller.play();
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = widget.controller;
    final ratio = controller.value.aspectRatio;
    final double aspect = ratio <= 0 ? 16 / 9 : ratio;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Center(
            child: AspectRatio(
              aspectRatio: aspect,
              child: VideoPlayer(controller),
            ),
          ),
          GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: _togglePlay,
            child: AnimatedOpacity(
              opacity: controller.value.isPlaying ? 0 : 1,
              duration: const Duration(milliseconds: 160),
              child: Container(
                color: Colors.black.withValues(alpha: 0.3),
                child: const Center(
                  child: Icon(
                    Icons.play_arrow_rounded,
                    size: 68,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(8),
              child: Align(
                alignment: Alignment.topLeft,
                child: _VideoOverlayButton(
                  icon: Icons.close_rounded,
                  onTap: () => Navigator.of(context).pop(),
                ),
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SafeArea(
              top: false,
              child: VideoProgressIndicator(
                controller,
                allowScrubbing: true,
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
                colors: const VideoProgressColors(
                  playedColor: Colors.white,
                  bufferedColor: Colors.white24,
                  backgroundColor: Colors.white12,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
