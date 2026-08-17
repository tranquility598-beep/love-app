import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:just_audio/just_audio.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:video_player/video_player.dart';

import '../../config/app_config.dart';
import 'chat_models.dart';
import '../../theme/love_theme.dart';
import '../../theme/love_tokens.dart';

/// Скорости воспроизведения — тот же набор и тот же порядок перебора, что в
/// десктопном плеере (`init-app.js`), чтобы привычка переносилась.
const List<double> _playbackSpeeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

/// Одновременно играет только один вложенный плеер.
///
/// Без этого два голосовых из разных сообщений накладываются друг на друга:
/// на телефоне у пузырей нет общего владельца звука, каждый плеер сам себе
/// хозяин. Регистрируемся здесь при старте и глушим предыдущего.
class MediaSession {
  MediaSession._();

  static final MediaSession instance = MediaSession._();

  int _token = 0;
  void Function()? _pause;

  /// Забирает звук себе, останавливая того, кто играл до этого. Возвращает
  /// токен, с которым потом нужно вызвать [release].
  int claim(void Function() pause) {
    final previous = _pause;
    _token += 1;
    _pause = pause;
    // Токен уже сдвинут, поэтому release от предыдущего плеера не затрёт нас.
    previous?.call();
    return _token;
  }

  void release(int token) {
    if (token == _token) _pause = null;
  }
}

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
        size: attachment.size,
        own: own,
      );
    }
    if (attachment.isVideo) {
      return VideoAttachmentPlayer(
        url: url,
        name: attachment.name,
        size: attachment.size,
      );
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
                  color: context.palette.inkA(0.05),
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

/// Полноэкранный просмотр фото.
///
/// Ключевое: зона зума занимает весь экран, а картинка внутри неё —
/// `BoxFit.contain`. Раньше [InteractiveViewer] оборачивал саму картинку,
/// та занимала только полосу по центру, и зум считался от её маленькой
/// коробки — увеличение уезжало вбок, а сверху и снизу оставались чёрные
/// поля, за которые нельзя было вытянуть изображение.
class _ImageViewerScreen extends StatefulWidget {
  const _ImageViewerScreen({required this.url, required this.name});

  final String url;
  final String name;

  @override
  State<_ImageViewerScreen> createState() => _ImageViewerScreenState();
}

class _ImageViewerScreenState extends State<_ImageViewerScreen>
    with SingleTickerProviderStateMixin {
  final TransformationController _transform = TransformationController();
  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  )..addListener(_applyAnim);

  Animation<Matrix4>? _zoomTween;
  bool _chrome = true;
  Offset _tapPoint = Offset.zero;

  @override
  void dispose() {
    _anim.dispose();
    _transform.dispose();
    super.dispose();
  }

  void _applyAnim() {
    final tween = _zoomTween;
    if (tween != null) _transform.value = tween.value;
  }

  void _animateTo(Matrix4 target) {
    _zoomTween = Matrix4Tween(begin: _transform.value, end: target).animate(
      CurvedAnimation(parent: _anim, curve: Curves.easeOutCubic),
    );
    _anim
      ..value = 0
      ..forward();
  }

  /// Зум с сохранением точки под пальцем: `s*(v - p) + p`, то есть сдвиг
  /// `p*(1 - s)` и потом масштаб.
  Matrix4 _zoomedAt(Offset point, double scale) {
    return Matrix4.identity()
      ..translateByDouble(
        point.dx * (1 - scale),
        point.dy * (1 - scale),
        0,
        1,
      )
      ..scaleByDouble(scale, scale, 1, 1);
  }

  void _handleDoubleTap(Offset point) {
    final zoomed = _transform.value.getMaxScaleOnAxis() > 1.05;
    _animateTo(zoomed ? Matrix4.identity() : _zoomedAt(point, 2.5));
  }

  @override
  Widget build(BuildContext context) {
    // Просмотрщик целиком занят кадром, поэтому внутри тёмная палитра
    // независимо от темы приложения. Без этого в светлой теме подложка
    // становилась белой (`onAccent` там белый), а подписи поверх картинки —
    // чёрными на чёрной плашке. Тело вынесено в отдельный метод, потому что
    // область действия обёртки — только её потомки: `context.palette` в самом
    // `build` смотрел бы мимо неё.
    return LoveFrameScope(builder: _viewer);
  }

  Widget _viewer(BuildContext context) {
    return Scaffold(
      backgroundColor: context.palette.onAccent,
      // AppBar убран намеренно: он отъедал верх и добавлял ещё одну чёрную
      // полосу. Название и закрытие лежат поверх картинки.
      body: Stack(
        fit: StackFit.expand,
        children: [
          // GestureDetector снаружи InteractiveViewer, а не внутри: вложенный
          // детектор с onTap/onDoubleTap отбирал жест у щипка, и зум не
          // работал вообще. Заодно localPosition теперь в координатах
          // вьюпорта — ровно в них считает трансформацию сам просмотрщик.
          GestureDetector(
            onTap: () => setState(() => _chrome = !_chrome),
            onDoubleTapDown: (details) => _tapPoint = details.localPosition,
            onDoubleTap: () => _handleDoubleTap(_tapPoint),
            child: InteractiveViewer(
              transformationController: _transform,
              minScale: 1,
              maxScale: 6,
              boundaryMargin: EdgeInsets.zero,
              child: SizedBox.expand(
                child: Image.network(
                  widget.url,
                  fit: BoxFit.contain,
                  loadingBuilder: (context, child, progress) {
                    if (progress == null) return child;
                    return const Center(
                      child: SizedBox(
                        width: 26,
                        height: 26,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    );
                  },
                  errorBuilder: (context, error, stack) =>  Center(
                    child: Padding(
                      padding: EdgeInsets.all(24),
                      child: Text(
                        'Не удалось загрузить изображение',
                        style: TextStyle(color: context.palette.inkA(0.7)),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
          // Панель именно в Positioned: непозиционированный ребёнок в
          // StackFit.expand растягивается на весь экран, и Row центрировал
          // кнопки по вертикали — они висели посередине картинки.
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: IgnorePointer(
              ignoring: !_chrome,
              child: AnimatedOpacity(
                opacity: _chrome ? 1 : 0,
                duration: const Duration(milliseconds: 180),
                child: _topBar(context),
              ),
            ),
          ),
        ],
      ),
    );
  }

  /// Контекст передаём аргументом: `State.context` лежит выше [LoveFrameScope],
  /// и палитра из него была бы светлой.
  Widget _topBar(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            context.palette.shadeA(0.65),
            Colors.transparent,
          ],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 8, 8, 20),
          child: Row(
            children: [
              _VideoOverlayButton(
                icon: Icons.close_rounded,
                onTap: () => Navigator.of(context).pop(),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  widget.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                    fontSize: 12.5,
                    fontWeight: FontWeight.w700,
                    color: context.palette.inkA(0.8),
                  ),
                ),
              ),
              _VideoOverlayButton(
                icon: Icons.open_in_new_rounded,
                onTap: () => launchUrl(
                  Uri.parse(widget.url),
                  mode: LaunchMode.externalApplication,
                ),
              ),
            ],
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
    this.size = 0,
    super.key,
  });

  final String url;
  final String title;
  final bool own;

  /// Размер файла в байтах: показываем, пока длительность неизвестна.
  final int size;

  @override
  State<AudioAttachmentPlayer> createState() => _AudioAttachmentPlayerState();
}

class _AudioAttachmentPlayerState extends State<AudioAttachmentPlayer> {
  final AudioPlayer _player = AudioPlayer();
  int _sessionToken = 0;
  bool _loaded = false;
  bool _loading = false;
  double _speed = 1;
  String? _error;

  @override
  void initState() {
    super.initState();
    _player.playerStateStream.listen((state) {
      if (state.processingState == ProcessingState.completed) {
        _player.pause();
        _player.seek(Duration.zero);
        MediaSession.instance.release(_sessionToken);
      }
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    MediaSession.instance.release(_sessionToken);
    _player.dispose();
    super.dispose();
  }

  /// Метаданные тянем только по первому тапу: в переписке голосовых бывает
  /// десятки, и готовить их все на старте — лишние соединения и ExoPlayer'ы.
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
        MediaSession.instance.release(_sessionToken);
      } else {
        _sessionToken = MediaSession.instance.claim(_pauseFromSession);
        unawaited(_player.play());
      }
    } catch (_) {
      if (mounted) setState(() => _error = 'Не удалось воспроизвести');
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  void _pauseFromSession() {
    _player.pause();
    if (mounted) setState(() {});
  }

  Future<void> _cycleSpeed() async {
    final index = _playbackSpeeds.indexOf(_speed);
    final next = _playbackSpeeds[(index + 1) % _playbackSpeeds.length];
    await _player.setSpeed(next);
    if (mounted) setState(() => _speed = next);
  }

  @override
  Widget build(BuildContext context) {
    final base = widget.own ? context.palette.onAccent : context.palette.accent;
    return Container(
      width: 250,
      margin: const EdgeInsets.only(top: 6),
      padding: const EdgeInsets.fromLTRB(8, 8, 8, 6),
      decoration: BoxDecoration(
        // Без рамки: плашка уже лежит внутри пузыря сообщения, и обводка
        // читалась как второй контур.
        color: base.withValues(alpha: widget.own ? 0.07 : 0.055),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          InkWell(
            borderRadius: BorderRadius.circular(19),
            onTap: _loading ? null : _toggle,
            child: Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: base.withValues(alpha: 0.12),
              ),
              child: _loading
                  ? Padding(
                      padding: const EdgeInsets.all(10),
                      child: CircularProgressIndicator(
                        strokeWidth: 2,
                        color: base,
                      ),
                    )
                  : Icon(
                      _player.playing
                          ? Icons.pause_rounded
                          : Icons.play_arrow_rounded,
                      size: 23,
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
                    return Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        MediaScrubber(
                          position: position,
                          buffered: _player.bufferedPosition,
                          duration: duration,
                          accent: base,
                          height: 18,
                          onSeek: _loaded ? _player.seek : null,
                        ),
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                duration > Duration.zero
                                    ? '${fmtMediaTime(position)} / '
                                        '${fmtMediaTime(duration)}'
                                    : _fallbackLabel(),
                                style: TextStyle(
                                  fontSize: 10,
                                  color: base.withValues(alpha: 0.55),
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            // Ускорение для голосовых — самое частое
                            // действие, поэтому кнопка всегда на виду.
                            _SpeedButton(
                              speed: _speed,
                              color: base,
                              onTap: _loaded ? _cycleSpeed : null,
                            ),
                          ],
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

  String _fallbackLabel() {
    if (widget.size <= 0) return 'Нажми, чтобы послушать';
    return fmtBytes(widget.size);
  }
}

class _SpeedButton extends StatelessWidget {
  const _SpeedButton({
    required this.speed,
    required this.color,
    required this.onTap,
  });

  final double speed;
  final Color color;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(6),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
        child: Text(
          fmtSpeed(speed),
          style: TextStyle(
            fontSize: 10.5,
            fontWeight: FontWeight.w900,
            color: color.withValues(alpha: onTap == null ? 0.3 : 0.75),
          ),
        ),
      ),
    );
  }
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

class VideoAttachmentPlayer extends StatefulWidget {
  const VideoAttachmentPlayer({
    required this.url,
    this.name = '',
    this.size = 0,
    super.key,
  });

  final String url;
  final String name;
  final int size;

  @override
  State<VideoAttachmentPlayer> createState() => _VideoAttachmentPlayerState();
}

class _VideoAttachmentPlayerState extends State<VideoAttachmentPlayer> {
  VideoPlayerController? _controller;
  int _sessionToken = 0;
  bool _initializing = false;
  String? _error;

  @override
  void dispose() {
    MediaSession.instance.release(_sessionToken);
    _controller?.dispose();
    super.dispose();
  }

  /// Контроллер создаём по тапу, а не при построении пузыря: иначе каждое
  /// видео в переписке открывало бы свой декодер ещё до просмотра.
  Future<void> _start() async {
    final existing = _controller;
    if (existing != null) {
      if (existing.value.isPlaying) {
        await existing.pause();
        MediaSession.instance.release(_sessionToken);
      } else {
        _sessionToken = MediaSession.instance.claim(_pauseFromSession);
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
      // Слушателя на каждый кадр вешает уже _VideoStage — он и рисует
      // панель. Пузырь целиком 60 раз в секунду перестраивать не нужно.
      _controller = controller;
      _sessionToken = MediaSession.instance.claim(_pauseFromSession);
      await controller.play();
    } catch (_) {
      _error = 'Не удалось загрузить видео';
    } finally {
      if (mounted) setState(() => _initializing = false);
    }
  }

  void _pauseFromSession() {
    _controller?.pause();
    if (mounted) setState(() {});
  }

  Future<void> _openFullscreen() async {
    final controller = _controller;
    if (controller == null || !controller.value.isInitialized) return;
    // Ландшафт разрешаем только на время фуллскрина: остальное приложение
    // рассчитано на портрет. Широкое видео при этом сразу разворачиваем —
    // в портрете 16/9 занимает меньше трети экрана и кадр читается как
    // «сломанный», хотя геометрия верная.
    final size = controller.value.size;
    final wide = size.height > 0 && size.width / size.height > 1.2;
    await SystemChrome.setPreferredOrientations(
      wide
          ? const [
              DeviceOrientation.landscapeLeft,
              DeviceOrientation.landscapeRight,
            ]
          : DeviceOrientation.values,
    );
    // В фуллскрине убираем строку статуса и навигацию: sticky возвращает их
    // по свайпу от края, поэтому выйти из просмотра всё равно можно.
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    if (!mounted) return;
    await Navigator.of(context, rootNavigator: true).push(
      MaterialPageRoute<void>(
        fullscreenDialog: true,
        builder: (_) => FullscreenVideoPage(
          controller: controller,
          title: widget.name,
        ),
      ),
    );
    await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    await SystemChrome.setPreferredOrientations(
      const [DeviceOrientation.portraitUp],
    );
  }

  @override
  Widget build(BuildContext context) {
    final maxWidth = MediaQuery.sizeOf(context).width * 0.64;
    final controller = _controller;
    final ready = controller != null && controller.value.isInitialized;
    return Padding(
      padding: const EdgeInsets.only(top: 6),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(12),
        child: SizedBox(
          width: maxWidth,
          child: ready
              ? _VideoStage(
                  controller: controller,
                  onFullscreen: _openFullscreen,
                  fullscreen: false,
                )
              : _poster(),
        ),
      ),
    );
  }

  Widget _poster() {
    return GestureDetector(
      onTap: _initializing ? null : _start,
      child: AspectRatio(
        aspectRatio: 16 / 9,
        child: Container(
          color:  context.palette.bgSecondary,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Center(
                child: _initializing
                    ? const SizedBox(
                        width: 26,
                        height: 26,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : _error != null
                        ? Padding(
                            padding: const EdgeInsets.all(12),
                            child: Text(
                              _error!,
                              textAlign: TextAlign.center,
                              style:  TextStyle(
                                color: context.palette.inkA(0.7),
                                fontSize: 12,
                              ),
                            ),
                          )
                        : Container(
                            width: 54,
                            height: 54,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: context.palette.inkA(0.14),
                            ),
                            child:  Icon(
                              Icons.play_arrow_rounded,
                              size: 32,
                              color: context.palette.accent,
                            ),
                          ),
              ),
              if (_error == null)
                Positioned(
                  left: 10,
                  right: 10,
                  bottom: 8,
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          widget.name.isEmpty ? 'Видео' : widget.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: context.palette.inkA(0.75),
                          ),
                        ),
                      ),
                      if (widget.size > 0) ...[
                        const SizedBox(width: 8),
                        Text(
                          fmtBytes(widget.size),
                          style: TextStyle(
                            fontSize: 10.5,
                            fontWeight: FontWeight.w700,
                            color: context.palette.inkA(0.45),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Кадр видео плюс управление: тап показывает панель, через пару секунд она
/// сама уезжает, двойной тап по краю мотает на ±10 секунд.
class _VideoStage extends StatefulWidget {
  const _VideoStage({
    required this.controller,
    required this.onFullscreen,
    required this.fullscreen,
  });

  final VideoPlayerController controller;
  final VoidCallback onFullscreen;
  final bool fullscreen;

  @override
  State<_VideoStage> createState() => _VideoStageState();
}

class _VideoStageState extends State<_VideoStage> {
  static const _hideAfter = Duration(milliseconds: 2600);

  Timer? _hideTimer;
  Timer? _hudTimer;
  bool _controlsVisible = true;
  bool _muted = false;
  String _hud = '';
  double _lastTapX = 0;
  double _stageWidth = 0;

  @override
  void initState() {
    super.initState();
    // Панель живёт и во встроенном плеере, и в фуллскрине, поэтому слушает
    // контроллер сама: иначе в фуллскрине время и кнопки замирали бы.
    widget.controller.addListener(_onTick);
    _muted = widget.controller.value.volume == 0;
    _restartHideTimer();
  }

  @override
  void dispose() {
    widget.controller.removeListener(_onTick);
    _hideTimer?.cancel();
    _hudTimer?.cancel();
    super.dispose();
  }

  void _onTick() {
    if (mounted) setState(() {});
  }

  void _restartHideTimer() {
    _hideTimer?.cancel();
    _hideTimer = Timer(_hideAfter, () {
      if (mounted && widget.controller.value.isPlaying) {
        setState(() => _controlsVisible = false);
      }
    });
  }

  void _showControls() {
    setState(() => _controlsVisible = true);
    _restartHideTimer();
  }

  void _flash(String text) {
    setState(() => _hud = text);
    _hudTimer?.cancel();
    _hudTimer = Timer(const Duration(milliseconds: 650), () {
      if (mounted) setState(() => _hud = '');
    });
  }

  Future<void> _toggle() async {
    final controller = widget.controller;
    if (controller.value.isPlaying) {
      await controller.pause();
      setState(() => _controlsVisible = true);
      _hideTimer?.cancel();
    } else {
      await controller.play();
      _restartHideTimer();
    }
  }

  Future<void> _seekBy(int seconds) async {
    final value = widget.controller.value;
    final total = value.duration;
    if (total <= Duration.zero) return;
    var target = value.position + Duration(seconds: seconds);
    if (target < Duration.zero) target = Duration.zero;
    if (target > total) target = total;
    await widget.controller.seekTo(target);
    _flash('${seconds > 0 ? '+' : ''}$seconds с');
  }

  Future<void> _toggleMute() async {
    final next = !_muted;
    await widget.controller.setVolume(next ? 0 : 1);
    setState(() => _muted = next);
    _flash(next ? 'Без звука' : 'Звук');
    _restartHideTimer();
  }

  Future<void> _cycleSpeed() async {
    final current = widget.controller.value.playbackSpeed;
    var index = _playbackSpeeds.indexWhere((item) => item == current);
    if (index < 0) index = _playbackSpeeds.indexOf(1);
    final next = _playbackSpeeds[(index + 1) % _playbackSpeeds.length];
    await widget.controller.setPlaybackSpeed(next);
    _flash(fmtSpeed(next));
    _restartHideTimer();
  }

  @override
  Widget build(BuildContext context) {
    // Кадр видео тёмный в обеих темах: плашки поверх него залиты настоящим
    // чёрным, значит и подписи, кнопки и спиннер на них должны быть светлыми.
    // Заглушку до загрузки (`_poster`) оборачивать нельзя — она белая плашка с
    // тёмным значком и в светлой теме уже права.
    return LoveFrameScope(builder: _buildStage);
  }

  Widget _buildStage(BuildContext context) {
    final controller = widget.controller;
    final value = controller.value;
    final ratio = value.aspectRatio <= 0 ? 16 / 9 : value.aspectRatio;

    final stage = Stack(
      alignment: Alignment.center,
      children: [
        Positioned.fill(
          child: FittedBox(
            fit: widget.fullscreen ? BoxFit.contain : BoxFit.cover,
            child: SizedBox(
              width: value.size.width <= 0 ? 16 : value.size.width,
              height: value.size.height <= 0 ? 9 : value.size.height,
              child: VideoPlayer(controller),
            ),
          ),
        ),
        // Ловим жесты на всём кадре: одиночный тап — панель, двойной по
        // левой/правой половине — перемотка.
        Positioned.fill(
          child: LayoutBuilder(
            builder: (context, constraints) {
              _stageWidth = constraints.maxWidth;
              return GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: () {
                  if (_controlsVisible && value.isPlaying) {
                    setState(() => _controlsVisible = false);
                    _hideTimer?.cancel();
                  } else {
                    _showControls();
                  }
                },
                onDoubleTapDown: (details) =>
                    _lastTapX = details.localPosition.dx,
                onDoubleTap: () {
                  final half = _stageWidth / 2;
                  _seekBy(_lastTapX < half ? -10 : 10);
                  _showControls();
                },
                child: const SizedBox.expand(),
              );
            },
          ),
        ),
        if (!value.isPlaying)
          IgnorePointer(
            child: Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: context.palette.shadeA(0.45),
              ),
              child:  Icon(
                Icons.play_arrow_rounded,
                size: 34,
                color: context.palette.accent,
              ),
            ),
          ),
        if (value.isBuffering)
          const IgnorePointer(
            child: SizedBox(
              width: 30,
              height: 30,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
          ),
        if (_hud.isNotEmpty)
          IgnorePointer(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: context.palette.shadeA(0.6),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                _hud,
                style:  TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w900,
                  color: context.palette.accent,
                ),
              ),
            ),
          ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: IgnorePointer(
            ignoring: !_controlsVisible,
            child: AnimatedOpacity(
              opacity: _controlsVisible ? 1 : 0,
              duration: const Duration(milliseconds: 180),
              child: _controlsBar(context, value),
            ),
          ),
        ),
      ],
    );

    if (widget.fullscreen) return stage;
    return AspectRatio(aspectRatio: ratio, child: stage);
  }

  /// Контекст передаём аргументом: `State.context` лежит выше [LoveFrameScope],
  /// и палитра из него была бы светлой.
  Widget _controlsBar(BuildContext context, VideoPlayerValue value) {
    final buffered = value.buffered.isEmpty
        ? Duration.zero
        : value.buffered.last.end;
    return Container(
      padding: EdgeInsets.fromLTRB(4, 12, 4, widget.fullscreen ? 6 : 2),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Colors.transparent,
            context.palette.shadeA(0.55),
          ],
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            child: MediaScrubber(
              position: value.position,
              buffered: buffered,
              duration: value.duration,
              height: 20,
              onSeek: (target) {
                widget.controller.seekTo(target);
                _restartHideTimer();
              },
            ),
          ),
          Row(
            children: [
              _BarButton(
                icon: value.isPlaying
                    ? Icons.pause_rounded
                    : Icons.play_arrow_rounded,
                onTap: _toggle,
              ),
              Text(
                '${fmtMediaTime(value.position)} / '
                '${fmtMediaTime(value.duration)}',
                style:  TextStyle(
                  fontSize: 10.5,
                  fontWeight: FontWeight.w800,
                  color: context.palette.accent,
                ),
              ),
              const Spacer(),
              InkWell(
                onTap: _cycleSpeed,
                borderRadius: BorderRadius.circular(6),
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 5),
                  child: Text(
                    fmtSpeed(value.playbackSpeed),
                    style:  TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w900,
                      color: context.palette.accent,
                    ),
                  ),
                ),
              ),
              _BarButton(
                icon: _muted
                    ? Icons.volume_off_rounded
                    : Icons.volume_up_rounded,
                onTap: _toggleMute,
              ),
              _BarButton(
                icon: widget.fullscreen
                    ? Icons.fullscreen_exit_rounded
                    : Icons.fullscreen_rounded,
                onTap: widget.onFullscreen,
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _BarButton extends StatelessWidget {
  const _BarButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(18),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Icon(icon, size: 20, color: context.palette.accent),
      ),
    );
  }
}

/// Тонкая дорожка прокрутки с буфером — общая для видео и аудио.
///
/// Собственная вместо [Slider]: нужен слой «сколько уже загружено», иначе
/// непонятно, почему перемотка вперёд подвисает.
class MediaScrubber extends StatefulWidget {
  const MediaScrubber({
    required this.position,
    required this.buffered,
    required this.duration,
    required this.onSeek,
    this.accent,
    this.height = 20,
    super.key,
  });

  final Duration position;
  final Duration buffered;
  final Duration duration;

  /// null — дорожка неактивна (файл ещё не загружен).
  final ValueChanged<Duration>? onSeek;
  final Color? accent;
  final double height;

  @override
  State<MediaScrubber> createState() => _MediaScrubberState();
}

class _MediaScrubberState extends State<MediaScrubber> {
  double? _dragFraction;

  @override
  Widget build(BuildContext context) {
    final total = widget.duration.inMilliseconds;
    final enabled = widget.onSeek != null && total > 0;
    final played = total <= 0
        ? 0.0
        : (widget.position.inMilliseconds / total).clamp(0.0, 1.0);
    final buffered = total <= 0
        ? 0.0
        : (widget.buffered.inMilliseconds / total).clamp(0.0, 1.0);
    final value = _dragFraction ?? played;

    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth <= 0 ? 1.0 : constraints.maxWidth;

        void track(double dx) {
          if (!enabled) return;
          setState(() => _dragFraction = (dx / width).clamp(0.0, 1.0));
        }

        void commit() {
          final fraction = _dragFraction;
          if (fraction != null && enabled) {
            widget.onSeek!(
              Duration(milliseconds: (total * fraction).round()),
            );
          }
          if (mounted) setState(() => _dragFraction = null);
        }

        final accent = widget.accent ?? context.palette.accent;
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (details) => track(details.localPosition.dx),
          onTapUp: (_) => commit(),
          onTapCancel: () => setState(() => _dragFraction = null),
          onHorizontalDragStart: (details) => track(details.localPosition.dx),
          onHorizontalDragUpdate: (details) => track(details.localPosition.dx),
          onHorizontalDragEnd: (_) => commit(),
          child: SizedBox(
            height: widget.height,
            child: Center(
              child: SizedBox(
                height: 12,
                child: Stack(
                  alignment: Alignment.centerLeft,
                  children: [
                    _bar(1, accent.withValues(alpha: 0.2)),
                    _bar(buffered, accent.withValues(alpha: 0.32)),
                    _bar(value, accent.withValues(alpha: 0.95)),
                    Align(
                      alignment: Alignment(-1 + 2 * value, 0),
                      child: Container(
                        width: 10,
                        height: 10,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: enabled
                              ? accent
                              : accent.withValues(alpha: 0.35),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _bar(double factor, Color color) {
    return FractionallySizedBox(
      widthFactor: factor.clamp(0.0, 1.0),
      child: Container(
        height: 3,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(2),
        ),
      ),
    );
  }
}

/// Fullscreen playback for video attachments. Reuses the inline controller,
/// so position, speed and play state stay in sync with the bubble player.
class FullscreenVideoPage extends StatelessWidget {
  const FullscreenVideoPage({
    required this.controller,
    this.title = '',
    super.key,
  });

  final VideoPlayerController controller;
  final String title;

  @override
  Widget build(BuildContext context) => LoveFrameScope(builder: _page);

  Widget _page(BuildContext context) {
    return Scaffold(
      backgroundColor: context.palette.onAccent,
      body: Stack(
        // Без expand Stack считает размер по непозиционированному ребёнку —
        // а это верхняя панель. Scaffold.body даёт нежёсткие констрейнты,
        // поэтому стек схлопывался до высоты панели, и кадр видео жался в
        // полоску сверху. Панель поэтому же ушла в Positioned.
        fit: StackFit.expand,
        children: [
          _VideoStage(
            controller: controller,
            fullscreen: true,
            onFullscreen: () => Navigator.of(context).pop(),
          ),
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(8),
                child: Row(
                  children: [
                    _VideoOverlayButton(
                      icon: Icons.close_rounded,
                      onTap: () => Navigator.of(context).pop(),
                    ),
                    if (title.isNotEmpty) ...[
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w700,
                            color: context.palette.inkA(0.8),
                          ),
                        ),
                      ),
                    ],
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _VideoOverlayButton extends StatelessWidget {
  const _VideoOverlayButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: context.palette.shadeA(0.45),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: SizedBox(
          width: 34,
          height: 34,
          child: Icon(icon, size: 20, color: context.palette.accent),
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
                ? context.palette.onBubbleOwnA(0.08)
                : context.palette.inkA(0.055),
            borderRadius: BorderRadius.circular(12),
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

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

/// `m:ss`, а от часа — `h:mm:ss`.
String fmtMediaTime(Duration value) {
  final seconds = (value.inSeconds % 60).toString().padLeft(2, '0');
  if (value.inHours > 0) {
    final minutes = (value.inMinutes % 60).toString().padLeft(2, '0');
    return '${value.inHours}:$minutes:$seconds';
  }
  return '${value.inMinutes}:$seconds';
}

/// `1×`, `1.5×`, `0.75×` — без болтающихся нулей.
String fmtSpeed(double value) {
  final text = value
      .toStringAsFixed(2)
      .replaceFirst(RegExp(r'0+$'), '')
      .replaceFirst(RegExp(r'\.$'), '');
  return '$text×';
}

String fmtBytes(int value) {
  if (value <= 0) return '';
  if (value < 1024) return '$value Б';
  if (value < 1024 * 1024) return '${(value / 1024).toStringAsFixed(0)} КБ';
  return '${(value / (1024 * 1024)).toStringAsFixed(1)} МБ';
}
