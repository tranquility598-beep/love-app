import 'dart:async';

import 'package:flutter/material.dart';

import '../core/calls/call_center.dart';
import '../core/voice/channel_voice_controller.dart';
import '../features/calls/call_screen.dart';
import '../features/calls/call_session.dart';
import '../features/chat/chat_models.dart';
import '../features/chat/dm_call_controller.dart';
import '../session/app_session.dart';
import '../theme/love_tokens.dart';

/// Глобальная «таблетка» активного войса/звонка (ч/б стиль).
///
/// Висит сверху ПОВЕРХ ЛЮБОГО экрана (вставляется в Overlay корневого
/// навигатора), поэтому видна и в чатах, и в сферах, и в настройках.
/// Показывается, когда есть активный звонок в ЛС или войс сферы,
/// а полноэкранный CallScreen скрыт.
///
/// Жесты:
/// - тап по видимой таблетке — развернуть полноэкранный звонок;
/// - тащить — таблетка едет за пальцем по обеим осям;
/// - утащить или смахнуть за боковой край — плавно уезжает туда сама,
///   у края остаётся торчать «язычок», чтобы не загораживать контент;
/// - вернуть — тап по язычку ИЛИ вытянуть его пальцем обратно;
/// - недоведённый жест плавно откатывается, скорость свайпа учитывается.
///
/// Позиция и сторона запоминаются до перезапуска приложения.
class CallPill {
  CallPill._();

  static OverlayEntry? _entry;
  static bool _mounted = false;

  /// Вызвать ОДИН раз при старте, сразу после CallCenter.instance.init.
  static void mount() {
    if (_mounted) return;
    _mounted = true;
    CallCenter.instance.addListener(_sync);
    ChannelVoiceController.instance.addListener(_sync);
    CallScreen.openNotifier.addListener(_sync);
    _sync();
  }

  static void _sync() {
    final voice = ChannelVoiceController.instance;
    final active = CallCenter.instance.activeDm != null || voice.isActive;
    final shouldShow = active && !CallScreen.isOpen;
    if (shouldShow && _entry == null) {
      final overlay = CallCenter.navigatorKey.currentState?.overlay;
      if (overlay == null) {
        // Навигатор ещё не готов — пробуем на следующем кадре.
        WidgetsBinding.instance.addPostFrameCallback((_) => _sync());
        return;
      }
      _entry = OverlayEntry(builder: (_) => const _CallPillWidget());
      overlay.insert(_entry!);
    } else if (!shouldShow && _entry != null) {
      _entry!.remove();
      _entry = null;
    }
  }
}

enum _PillDock { visible, hiddenLeft, hiddenRight }

class _CallPillWidget extends StatefulWidget {
  const _CallPillWidget();

  @override
  State<_CallPillWidget> createState() => _CallPillWidgetState();
}

class _CallPillWidgetState extends State<_CallPillWidget>
    with SingleTickerProviderStateMixin {
  /// Сколько таблетки торчит из-за края в свёрнутом виде.
  /// Заодно это и цель для пальца, поэтому не уже прежнего «язычка».
  static const double _handleWidth = 30;

  /// Отступ от края, к которому таблетка прижимается при возврате.
  static const double _edgeGap = 8;

  static const Duration _slideDuration = Duration(milliseconds: 260);
  static const Duration _flingDuration = Duration(milliseconds: 190);

  // Статические — чтобы позиция переживала скрытие/показ таблетки.
  static _PillDock _dock = _PillDock.visible;
  static double _left = 0;
  static double _top = 0;
  static double _pillWidth = 220; // уточняется после первого кадра
  static bool _placed = false;

  final GlobalKey _pillKey = GlobalKey();

  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: _slideDuration,
  );
  Animation<double>? _slide;

  Timer? _ticker;
  bool _dragging = false;

  @override
  void initState() {
    super.initState();
    _anim.addListener(() {
      final slide = _slide;
      if (slide != null) setState(() => _left = slide.value);
    });
    // Таймер для живого счётчика длительности.
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() {});
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    _anim.dispose();
    super.dispose();
  }

  // ---- геометрия ----

  double get _screenW => MediaQuery.of(context).size.width;
  double get _screenH => MediaQuery.of(context).size.height;
  double get _topInset => MediaQuery.of(context).padding.top + 4;

  double get _centerX => (_screenW - _pillWidth) / 2;
  double get _hiddenLeftX => -_pillWidth + _handleWidth;
  double get _hiddenRightX => _screenW - _handleWidth;

  double _dockedX(_PillDock dock) {
    if (dock == _PillDock.hiddenLeft) return _hiddenLeftX;
    if (dock == _PillDock.hiddenRight) return _hiddenRightX;
    return _left;
  }

  /// Держим таблетку в экране, когда она развёрнута.
  double _clampVisible(double x) {
    final maxX = _screenW - _pillWidth - _edgeGap;
    if (maxX <= _edgeGap) return _edgeGap;
    return x.clamp(_edgeGap, maxX).toDouble();
  }

  double _clampTop(double y) => y.clamp(_topInset, _screenH * 0.75).toDouble();

  /// Ширина таблетки плывёт вместе со счётчиком (`09:59` → `10:00`),
  /// поэтому меряем её каждый кадр и подправляем позицию язычка,
  /// иначе он потихоньку отползает от края.
  void _afterLayout() {
    if (!mounted) return;
    final box = _pillKey.currentContext?.findRenderObject() as RenderBox?;
    if (box == null) return;
    final width = box.size.width;
    if (_placed && (width - _pillWidth).abs() < 0.5) return;
    setState(() {
      _pillWidth = width;
      if (!_placed) {
        _placed = true;
        _left = _centerX;
        _top = _topInset + 2;
      } else if (_dragging || _anim.isAnimating) {
        // Пальцем/анимацией управляем — не мешаем.
      } else if (_dock == _PillDock.visible) {
        _left = _clampVisible(_left);
      } else {
        _left = _dockedX(_dock);
      }
    });
  }

  // ---- анимация ----

  void _animateTo(double target, {Duration? duration}) {
    _slide = Tween<double>(begin: _left, end: target).animate(
      CurvedAnimation(parent: _anim, curve: Curves.easeOutCubic),
    );
    _anim.duration = duration ?? _slideDuration;
    _anim.forward(from: 0);
  }

  void _dockTo(_PillDock dock, {Duration? duration}) {
    _dock = dock;
    _animateTo(_dockedX(dock), duration: duration);
  }

  void _undock({double? toX}) {
    _dock = _PillDock.visible;
    _animateTo(_clampVisible(toX ?? _left));
  }

  // ---- жесты ----

  void _onPanStart(DragStartDetails details) {
    // Можно перехватить таблетку прямо на лету, пока она уезжает.
    _anim.stop();
    _slide = null;
    _dragging = true;
  }

  void _onPanUpdate(DragUpdateDetails details) {
    setState(() {
      // Свободное слежение за пальцем — без резких обрезок.
      _left = (_left + details.delta.dx)
          .clamp(_hiddenLeftX, _hiddenRightX)
          .toDouble();
      _top = _clampTop(_top + details.delta.dy);
    });
  }

  void _onPanEnd(DragEndDetails details) {
    _dragging = false;
    final vx = details.velocity.pixelsPerSecond.dx;

    // Быстрый свайп — уважаем направление.
    if (vx < -700) {
      return _dockTo(_PillDock.hiddenLeft, duration: _flingDuration);
    }
    if (vx > 700) {
      return _dockTo(_PillDock.hiddenRight, duration: _flingDuration);
    }

    // Утащил больше трети за край — плавно доводим до конца.
    if (_left + _pillWidth < _pillWidth * 0.66) {
      return _dockTo(_PillDock.hiddenLeft);
    }
    if (_left > _screenW - _pillWidth * 0.66) {
      return _dockTo(_PillDock.hiddenRight);
    }

    // Иначе — остаёмся видимыми, мягко возвращаемся в границы.
    _undock(toX: _left);
  }

  void _onTap() {
    if (_dock != _PillDock.visible) {
      // Тап по язычку — плавно вытаскиваем к ближнему краю.
      _undock(
        toX: _dock == _PillDock.hiddenLeft
            ? _edgeGap
            : _screenW - _pillWidth - _edgeGap,
      );
      return;
    }
    _openCallScreen();
  }

  @override
  Widget build(BuildContext context) {
    final voice = ChannelVoiceController.instance;
    final center = CallCenter.instance;
    return AnimatedBuilder(
      animation: Listenable.merge([voice, center]),
      builder: (context, _) {
        final dm = center.activeDm;
        final voiceActive = voice.isActive;
        if (dm == null && !voiceActive) return const SizedBox.shrink();

        WidgetsBinding.instance.addPostFrameCallback((_) => _afterLayout());

        final String title;
        final DateTime? connectedAt;
        if (dm != null) {
          title =
              dm.phase == DmCallPhase.connected ? dm.displayName : 'Звонок...';
          connectedAt = dm.connectedAt;
        } else {
          title = voice.channelTitle.isEmpty ? 'Войс' : voice.channelTitle;
          connectedAt = voice.connectedAt;
        }
        final label = connectedAt == null
            ? title
            : '$title · ${_formatDuration(DateTime.now().difference(connectedAt))}';

        // До первого замера ширина ещё неизвестна — держим таблетку
        // прозрачной, чтобы она не мигнула мимо центра.
        final double opacity;
        if (!_placed) {
          opacity = 0;
        } else if (_dock == _PillDock.visible || _dragging) {
          opacity = 1;
        } else {
          opacity = 0.9;
        }

        return Positioned(
          left: _placed ? _left : _centerX,
          top: _clampTop(_top),
          child: _pill(label, opacity),
        );
      },
    );
  }

  Widget _pill(String label, double opacity) {
    final docked = _dock != _PillDock.visible;
    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: _onTap,
      onPanStart: _onPanStart,
      onPanUpdate: _onPanUpdate,
      onPanEnd: _onPanEnd,
      child: Material(
        color: Colors.transparent,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 200),
          opacity: opacity,
          child: Container(
            key: _pillKey,
            padding: const EdgeInsets.symmetric(
              horizontal: 14,
              vertical: 8,
            ),
            decoration: BoxDecoration(
              color:  context.palette.glassStrong,
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: context.palette.inkA(0.18),
              ),
              boxShadow: [
                BoxShadow(
                  color: context.palette.dropA(0.45),
                  blurRadius: 18,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                 Icon(
                  Icons.graphic_eq_rounded,
                  size: 15,
                  color: context.palette.accent,
                ),
                const SizedBox(width: 8),
                ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 210),
                  child: Text(
                    label,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style:  TextStyle(
                      color: context.palette.accent,
                      fontSize: 12.5,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 0.2,
                      decoration: TextDecoration.none,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Icon(
                  docked
                      ? Icons.drag_indicator_rounded
                      : Icons.open_in_full_rounded,
                  size: 13,
                  color: context.palette.inkA(0.6),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  void _openCallScreen() {
    final navigator = CallCenter.navigatorKey.currentState;
    if (navigator == null) return;
    final dm = CallCenter.instance.activeDm;
    if (dm != null) {
      unawaited(CallScreen.push(navigator, DmCallSession(dm)));
      return;
    }
    var selfId = '';
    var selfName = 'Вы';
    var selfAvatar = '';
    try {
      final user = AppSessionScope.of(context).user;
      selfId = asText(user?.id);
      selfName = asText(user?.username);
      selfAvatar = asText(user?.avatar);
    } catch (_) {
      // Оверлей может быть выше AppSessionScope — не критично,
      // сессия сферы откроется со значениями по умолчанию.
    }
    unawaited(CallScreen.push(
      navigator,
      ChannelCallSession(
        selfId: selfId,
        selfName: selfName,
        selfAvatar: selfAvatar,
      ),
    ));
  }

  String _formatDuration(Duration d) {
    final h = d.inHours;
    final m = (d.inMinutes % 60).toString().padLeft(2, '0');
    final s = (d.inSeconds % 60).toString().padLeft(2, '0');
    return h > 0 ? '$h:$m:$s' : '$m:$s';
  }
}
