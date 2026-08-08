import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import '../../theme/love_tokens.dart';
import '../../widgets/love_avatar.dart';
import '../../widgets/screen_share_viewer.dart';
import 'call_session.dart';

/// Полноэкранный звонок — один экран для ЛС и войса сфер (ч/б стиль).
///
/// - «Скрыть» (стрелка вниз) или жест назад — звонок НЕ завершается,
///   остаются плашка ActiveCallBar и уведомление в шторке.
/// - Когда звонок заканчивается (с любой стороны или из уведомления),
///   экран закрывается сам — никуда не перебрасывает.
/// - Кнопки: микрофон, камера, смена камеры, демонстрация экрана, выйти.
///   Кнопки динамика НЕТ — звук всегда через громкий динамик.
class CallScreen extends StatefulWidget {
  const CallScreen({required this.session, super.key});

  final CallSession session;

  /// Одновременно открыт только один полноэкранный звонок.
  /// ValueNotifier — чтобы глобальная «таблетка» (CallPill) знала,
  /// когда прятаться.
  static final ValueNotifier<bool> openNotifier = ValueNotifier<bool>(false);

  static bool get isOpen => openNotifier.value;

  static Future<void> open(BuildContext context, CallSession session) {
    final navigator = Navigator.of(context, rootNavigator: true);
    return push(navigator, session);
  }

  static Future<void> push(NavigatorState navigator, CallSession session) {
    if (isOpen) return Future.value();
    return navigator.push(
      MaterialPageRoute(
        fullscreenDialog: true,
        builder: (_) => CallScreen(session: session),
      ),
    );
  }

  @override
  State<CallScreen> createState() => _CallScreenState();
}

class _CallScreenState extends State<CallScreen> {
  Timer? _ticker;

  CallSession get session => widget.session;

  @override
  void initState() {
    super.initState();
    CallScreen.openNotifier.value = true;
    session.listenable.addListener(_onChanged);
    _syncTicker();
  }

  @override
  void dispose() {
    CallScreen.openNotifier.value = false;
    session.listenable.removeListener(_onChanged);
    _ticker?.cancel();
    super.dispose();
  }

  void _onChanged() {
    if (!mounted) return;
    if (!session.isActive) {
      // Звонок завершён — просто закрываем экран,
      // пользователь остаётся там, где был.
      Navigator.of(context).maybePop();
      return;
    }
    setState(() {});
    _syncTicker();
  }

  void _syncTicker() {
    final need = session.isConnected;
    if (need && _ticker == null) {
      _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() {});
      });
    } else if (!need && _ticker != null) {
      _ticker?.cancel();
      _ticker = null;
    }
  }

  String get _durationText {
    final started = session.connectedAt;
    if (started == null) return '';
    final d = DateTime.now().difference(started);
    String two(int v) => v.toString().padLeft(2, '0');
    final m = d.inMinutes % 60;
    final s = d.inSeconds % 60;
    return d.inHours > 0
        ? '${d.inHours}:${two(m)}:${two(s)}'
        : '${two(m)}:${two(s)}';
  }

  void _hide() {
    Navigator.of(context).maybePop();
  }

  @override
  Widget build(BuildContext context) {
    final subtitle = session.isConnected && _durationText.isNotEmpty
        ? '${session.subtitle} • $_durationText'
        : session.subtitle;

    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(8, 8, 8, 4),
              child: Row(
                children: [
                  IconButton(
                    tooltip: 'Скрыть',
                    onPressed: _hide,
                    icon: const Icon(
                      Icons.keyboard_arrow_down_rounded,
                      color: Colors.white,
                      size: 30,
                    ),
                  ),
                  Expanded(
                    child: Column(
                      children: [
                        Text(
                          session.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontFamily: LoveFonts.serif,
                            fontSize: 19,
                            fontWeight: FontWeight.w900,
                            color: Colors.white,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          subtitle,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: const TextStyle(
                            fontSize: 12.5,
                            color: LoveColors.textMuted,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: 46),
                ],
              ),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 14),
                child: session.isIncoming ? _incomingBody() : _callBody(),
              ),
            ),
            if (session.errorMessage != null)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 24),
                child: Text(
                  session.errorMessage!,
                  textAlign: TextAlign.center,
                  style: const TextStyle(color: LoveColors.textMuted),
                ),
              ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 16, 22),
              child: session.isIncoming ? _incomingControls() : _controls(),
            ),
          ],
        ),
      ),
    );
  }

  // ── Входящий звонок ──

  Widget _incomingBody() {
    final peer =
        session.participants.isEmpty ? null : session.participants.first;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          LoveAvatar(
            label: peer?.name ?? '',
            imageUrl: peer?.avatar ?? '',
            size: 116,
          ),
          const SizedBox(height: 20),
          Text(
            peer?.name ?? session.title,
            style: const TextStyle(
              fontFamily: LoveFonts.serif,
              fontSize: 26,
              fontWeight: FontWeight.w900,
              color: Colors.white,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Входящий звонок',
            style: TextStyle(color: LoveColors.textMuted, fontSize: 14),
          ),
        ],
      ),
    );
  }

  Widget _incomingControls() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
      children: [
        _RoundCallButton(
          icon: Icons.call_end_rounded,
          caption: 'Отклонить',
          filled: true,
          size: 68,
          onTap: () => session.decline(),
        ),
        _RoundCallButton(
          icon: Icons.call_rounded,
          caption: 'Принять',
          filled: true,
          size: 68,
          onTap: () => session.accept(),
        ),
      ],
    );
  }

  // ── Активный звонок ──

  Widget _callBody() {
    final participants = session.participants;
    final hasSelfTile = participants.any((p) => p.isSelf);
    final showSelfPreview = !hasSelfTile &&
        session.localRenderer != null &&
        (session.cameraOn || session.screenSharing);

    Widget grid;
    if (participants.isEmpty) {
      grid = const Center(
        child: Text(
          'Никого нет',
          style: TextStyle(color: LoveColors.textMuted),
        ),
      );
    } else if (participants.length == 1) {
      grid = _ParticipantTile(participant: participants.first);
    } else if (participants.length == 2) {
      grid = Column(
        children: [
          Expanded(child: _ParticipantTile(participant: participants[0])),
          const SizedBox(height: 10),
          Expanded(child: _ParticipantTile(participant: participants[1])),
        ],
      );
    } else {
      grid = GridView.count(
        crossAxisCount: 2,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        childAspectRatio: 0.86,
        children: [
          for (final participant in participants)
            _ParticipantTile(participant: participant),
        ],
      );
    }

    if (!showSelfPreview) return grid;
    // Своя камера/демка — плавающее окно: таскается, меняет размер щипком,
    // сворачивается двойным тапом и прячется за край, как войс-таблетка.
    // Границы берём у самого Stack: он уже внутри SafeArea и отступов,
    // так что MediaQuery дал бы съехавшие координаты.
    return LayoutBuilder(
      builder: (context, constraints) => Stack(
        clipBehavior: Clip.none,
        children: [
          Positioned.fill(child: grid),
          DraggablePipTile(
            bounds: constraints.biggest,
            width: 108,
            height: 148,
            onExpand: () => Navigator.of(context, rootNavigator: true).push(
              MaterialPageRoute<void>(
                fullscreenDialog: true,
                builder: (_) => CallVideoFullscreen(
                  renderer: session.localRenderer!,
                  title: session.screenSharing
                      ? 'Ваша демонстрация'
                      : 'Ваша камера',
                  mirror: session.cameraOn && session.frontCamera,
                ),
              ),
            ),
            child: RTCVideoView(
              session.localRenderer!,
              mirror: session.cameraOn && session.frontCamera,
              objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
            ),
          ),
        ],
      ),
    );
  }

  Widget _controls() {
    return Wrap(
      alignment: WrapAlignment.center,
      spacing: 16,
      runSpacing: 12,
      children: [
        _RoundCallButton(
          icon: session.muted ? Icons.mic_off_rounded : Icons.mic_rounded,
          caption: session.muted ? 'Мик выкл' : 'Мик',
          filled: session.muted,
          onTap: () => session.toggleMute(),
        ),
        _RoundCallButton(
          icon: session.cameraOn
              ? Icons.videocam_rounded
              : Icons.videocam_off_rounded,
          caption: 'Камера',
          filled: session.cameraOn,
          onTap: () => session.toggleCamera(),
        ),
        if (session.cameraOn)
          _RoundCallButton(
            icon: Icons.cameraswitch_rounded,
            caption: 'Сменить',
            filled: false,
            onTap: () => session.switchCamera(),
          ),
        _RoundCallButton(
          icon: session.screenSharing
              ? Icons.stop_screen_share_rounded
              : Icons.screen_share_rounded,
          caption: 'Экран',
          filled: session.screenSharing,
          onTap: () => session.toggleScreenShare(),
        ),
        _RoundCallButton(
          icon: Icons.call_end_rounded,
          caption: 'Выйти',
          filled: true,
          onTap: () => session.hangup(),
        ),
      ],
    );
  }
}

/// Тайл участника: видео, если есть, иначе аватар + имя.
class _ParticipantTile extends StatelessWidget {
  const _ParticipantTile({required this.participant});

  final CallParticipant participant;

  @override
  Widget build(BuildContext context) {
    final renderer = participant.renderer;
    return GestureDetector(
      onTap: renderer != null && participant.hasVideo
          ? () => Navigator.of(context, rootNavigator: true).push(
                MaterialPageRoute<void>(
                  fullscreenDialog: true,
                  builder: (_) => CallVideoFullscreen(
                    renderer: renderer,
                    title: participant.isSelf
                        ? '${participant.name} (вы)'
                        : participant.name,
                    mirror: participant.mirror,
                  ),
                ),
              )
          : null,
      child: Container(
        clipBehavior: Clip.antiAlias,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          color: Colors.white.withValues(alpha: 0.045),
          border: Border.all(color: Colors.white.withValues(alpha: 0.12)),
        ),
        child: Stack(
          fit: StackFit.expand,
          children: [
            if (renderer != null && participant.hasVideo)
              RTCVideoView(
                renderer,
                mirror: participant.mirror,
                objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
              )
            else
              Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    LoveAvatar(
                      label: participant.name,
                      imageUrl: participant.avatar,
                      size: 68,
                    ),
                    const SizedBox(height: 10),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      child: Text(
                        participant.isSelf
                            ? '${participant.name} (вы)'
                            : participant.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w800,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            if (renderer != null && participant.hasVideo)
              Positioned(
                left: 8,
                bottom: 8,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Text(
                    participant.isSelf
                        ? '${participant.name} (вы)'
                        : participant.name,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ),
            if (participant.muted)
              Positioned(
                right: 8,
                bottom: 8,
                child: Container(
                  padding: const EdgeInsets.all(5),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.55),
                    shape: BoxShape.circle,
                  ),
                  child: const Icon(
                    Icons.mic_off_rounded,
                    color: Colors.white,
                    size: 15,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

/// Крупная круглая ч/б кнопка (тот же стиль, что в войсе сфер).
class _RoundCallButton extends StatelessWidget {
  const _RoundCallButton({
    required this.icon,
    required this.caption,
    required this.onTap,
    this.filled = false,
    this.size = 58,
  });

  final IconData icon;
  final String caption;
  final VoidCallback onTap;

  /// filled = белая кнопка с чёрной иконкой (активное состояние / «Выйти»).
  final bool filled;
  final double size;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeOut,
            width: size,
            height: size,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color:
                  filled ? Colors.white : Colors.white.withValues(alpha: 0.06),
              border: Border.all(
                color: filled
                    ? Colors.white
                    : Colors.white.withValues(alpha: 0.16),
              ),
            ),
            child: Icon(
              icon,
              size: size * 0.42,
              color: filled ? Colors.black : Colors.white,
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(
          caption,
          style: const TextStyle(
            fontSize: 11,
            color: LoveColors.textMuted,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

/// Полноэкранный просмотр удалённой камеры или демонстрации экрана.
class CallVideoFullscreen extends StatefulWidget {
  const CallVideoFullscreen({
    required this.renderer,
    required this.title,
    required this.mirror,
    super.key,
  });

  final RTCVideoRenderer renderer;
  final String title;
  final bool mirror;

  @override
  State<CallVideoFullscreen> createState() => _CallVideoFullscreenState();
}

class _CallVideoFullscreenState extends State<CallVideoFullscreen>
    with SingleTickerProviderStateMixin {
  bool _controls = true;

  final TransformationController _transform = TransformationController();
  late final AnimationController _resetAnim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  );
  Animation<Matrix4>? _resetTween;

  @override
  void initState() {
    super.initState();
    _resetAnim.addListener(() {
      if (_resetTween != null) _transform.value = _resetTween!.value;
    });
    _transform.addListener(() {
      final zoomed = _transform.value.getMaxScaleOnAxis() > 1.01;
      if (zoomed != _zoomed) setState(() => _zoomed = zoomed);
    });
  }

  bool _zoomed = false;

  @override
  void dispose() {
    _resetAnim.dispose();
    _transform.dispose();
    super.dispose();
  }

  void _resetZoom() {
    _resetTween = Matrix4Tween(
      begin: _transform.value,
      end: Matrix4.identity(),
    ).animate(
      CurvedAnimation(parent: _resetAnim, curve: Curves.easeOutCubic),
    );
    _resetAnim.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.black,
        body: GestureDetector(
          onTap: () => setState(() => _controls = !_controls),
          onDoubleTap: _resetZoom,
          child: Stack(
            fit: StackFit.expand,
            children: [
              // Щипок — зум 1x..5x, двойной тап — сброс. Пока приближено,
              // видео двигается пальцем.
              InteractiveViewer(
                transformationController: _transform,
                minScale: 1,
                maxScale: 5,
                clipBehavior: Clip.none,
                child: RTCVideoView(
                  widget.renderer,
                  mirror: widget.mirror,
                  objectFit: RTCVideoViewObjectFit.RTCVideoViewObjectFitContain,
                ),
              ),
              AnimatedOpacity(
                opacity: _controls ? 1 : 0,
                duration: const Duration(milliseconds: 180),
                child: IgnorePointer(
                  ignoring: !_controls,
                  child: SafeArea(
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          IconButton(
                            tooltip: 'Закрыть',
                            onPressed: () => Navigator.of(context).pop(),
                            icon: const Icon(Icons.close_rounded,
                                color: Colors.white),
                          ),
                          Expanded(
                            child: Padding(
                              padding: const EdgeInsets.only(top: 11),
                              child: Text(
                                widget.title,
                                textAlign: TextAlign.center,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontWeight: FontWeight.w800,
                                  fontSize: 15,
                                ),
                              ),
                            ),
                          ),
                          if (_zoomed)
                            IconButton(
                              tooltip: 'Сбросить зум',
                              onPressed: _resetZoom,
                              icon: const Icon(
                                Icons.zoom_out_map_rounded,
                                color: Colors.white,
                              ),
                            )
                          else
                            const SizedBox(width: 48),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      );
}
