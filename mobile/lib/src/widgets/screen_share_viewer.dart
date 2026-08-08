import 'package:flutter/material.dart';

/// Полноэкранный просмотр демки/камеры с зумом и перемещением.
///
/// Жесты: щипок — зум 1x..5x; когда приближено — двигается пальцем;
/// двойной тап — сброс зума.
///
/// Открытие:
///   Navigator.push(context, MaterialPageRoute(
///     builder: (_) => FullscreenShareViewer(
///       video: RTCVideoView(remoteShareRenderer),
///       title: 'Демонстрация',
///     ),
///   ));
class FullscreenShareViewer extends StatefulWidget {
  const FullscreenShareViewer({
    super.key,
    required this.video,
    this.title = 'Демонстрация экрана',
  });

  final Widget video;
  final String title;

  @override
  State<FullscreenShareViewer> createState() => _FullscreenShareViewerState();
}

class _FullscreenShareViewerState extends State<FullscreenShareViewer>
    with SingleTickerProviderStateMixin {
  final TransformationController _transform = TransformationController();
  late final AnimationController _resetAnim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  );
  Animation<Matrix4>? _resetTween;
  bool _hudVisible = true;

  @override
  void initState() {
    super.initState();
    _resetAnim.addListener(() {
      if (_resetTween != null) _transform.value = _resetTween!.value;
    });
  }

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
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              onTap: () => setState(() => _hudVisible = !_hudVisible),
              onDoubleTap: _resetZoom,
              child: InteractiveViewer(
                transformationController: _transform,
                minScale: 1.0,
                maxScale: 5.0,
                panEnabled: true,
                scaleEnabled: true,
                clipBehavior: Clip.none,
                child: Center(child: widget.video),
              ),
            ),
          ),
          // HUD: заголовок + закрыть. Без рамок и обводок вокруг видео.
          AnimatedOpacity(
            duration: const Duration(milliseconds: 200),
            opacity: _hudVisible ? 1 : 0,
            child: IgnorePointer(
              ignoring: !_hudVisible,
              child: SafeArea(
                child: Padding(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          widget.title,
                          style: const TextStyle(
                            color: Colors.white,
                            fontSize: 15,
                            fontWeight: FontWeight.w600,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      _HudButton(
                        icon: Icons.zoom_out_map,
                        onTap: _resetZoom,
                      ),
                      const SizedBox(width: 8),
                      _HudButton(
                        icon: Icons.close,
                        onTap: () => Navigator.of(context).maybePop(),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _HudButton extends StatelessWidget {
  const _HudButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white.withValues(alpha: 0.10),
      shape: const CircleBorder(),
      child: InkWell(
        customBorder: const CircleBorder(),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(10),
          child: Icon(icon, color: Colors.white, size: 20),
        ),
      ),
    );
  }
}

/// Плавающее окошко демки или камеры поверх экрана звонка.
///
/// Жесты намеренно те же, что у войс-таблетки, чтобы не переучиваться:
/// - тащить — окно едет за пальцем, при отпускании липнет к ближнему углу;
/// - щипок — размер 0.6x..2.2x от базового;
/// - двойной тап — свернуть в маленький прямоугольник и обратно;
/// - тап — onExpand (открыть на весь экран);
/// - утащить или смахнуть за боковой край — окно уезжает туда само, у края
///   остаётся торчать язычок; тап по нему или вытягивание возвращают окно.
class DraggablePipTile extends StatefulWidget {
  const DraggablePipTile({
    super.key,
    required this.child,
    required this.bounds,
    this.onExpand,
    this.width = 132,
    this.height = 176,
    this.margin = 12,
    this.bottomInset = 0,
  });

  final Widget child;

  /// Размер родительского Stack. Именно по нему считаются края и углы —
  /// MediaQuery тут не годится, окно живёт не на весь экран.
  final Size bounds;

  final VoidCallback? onExpand;
  final double width;
  final double height;
  final double margin;

  /// Сколько снизу занято чужими элементами — туда окно не опускаем.
  final double bottomInset;

  @override
  State<DraggablePipTile> createState() => _DraggablePipTileState();
}

enum _PipDock { free, left, right }

class _DraggablePipTileState extends State<DraggablePipTile>
    with SingleTickerProviderStateMixin {
  /// Сколько окна торчит из-за края в свёрнутом виде.
  static const double _handle = 30;
  static const double _minScale = 0.6;
  static const double _maxScale = 2.2;
  static const double _collapsedScale = 0.55;

  // Статика — окно помнит, куда его поставили и какого оно размера, между
  // показами (камеру можно выключить и включить, окно останется на месте).
  // Инстанс на экране всегда один, так что делить состояние не с кем.
  static Offset _pos = const Offset(-1, -1);
  static double _scale = 1;
  static double _scaleBeforeCollapse = 1;
  static bool _collapsed = false;
  static _PipDock _dock = _PipDock.free;

  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 260),
  );
  Animation<Offset>? _glide;

  bool _dragging = false;
  double _scaleAtGestureStart = 1;

  @override
  void initState() {
    super.initState();
    _anim.addListener(() {
      if (_glide != null) setState(() => _pos = _glide!.value);
    });
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  // ---- геометрия ----

  double get _w => widget.width * _scale;
  double get _h => widget.height * _scale;

  Size get _bounds => widget.bounds;

  double get _hiddenLeftX => -_w + _handle;
  double get _hiddenRightX => _bounds.width - _handle;

  double get _dockedX => _dock == _PipDock.left ? _hiddenLeftX : _hiddenRightX;

  double get _minTop => widget.margin;
  double get _maxTop =>
      _bounds.height - _h - widget.margin - widget.bottomInset;

  double _clampTop(double y) {
    if (_maxTop <= _minTop) return _minTop;
    return y.clamp(_minTop, _maxTop).toDouble();
  }

  void _glideTo(Offset target) {
    _glide = Tween<Offset>(begin: _pos, end: target).animate(
      CurvedAnimation(parent: _anim, curve: Curves.easeOutCubic),
    );
    _anim.forward(from: 0);
  }

  void _dockTo(_PipDock side) {
    _dock = side;
    _glideTo(Offset(_dockedX, _clampTop(_pos.dy)));
  }

  void _undock() {
    final toLeft = _dock == _PipDock.left;
    _dock = _PipDock.free;
    _glideTo(Offset(
      toLeft ? widget.margin : _bounds.width - _w - widget.margin,
      _clampTop(_pos.dy),
    ));
  }

  /// Свободное окно липнет к ближайшему углу — так оно не загораживает
  /// середину и всегда оказывается в предсказуемом месте.
  void _snapToCorner() {
    final cx = _pos.dx + _w / 2;
    final cy = _pos.dy + _h / 2;
    _glideTo(Offset(
      cx < _bounds.width / 2
          ? widget.margin
          : _bounds.width - _w - widget.margin,
      cy < _bounds.height / 2 ? _minTop : _clampTop(_maxTop),
    ));
  }

  // ---- жесты ----

  void _onScaleStart(ScaleStartDetails details) {
    _anim.stop();
    _glide = null;
    _dragging = true;
    _scaleAtGestureStart = _scale;
  }

  void _onScaleUpdate(ScaleUpdateDetails details) {
    setState(() {
      if (details.pointerCount >= 2) {
        _scale = (_scaleAtGestureStart * details.scale)
            .clamp(_minScale, _maxScale)
            .toDouble();
        _collapsed = false;
        // Размер поменялся — если окно у края, переанкериваем язычок.
        if (_dock != _PipDock.free) {
          _pos = Offset(_dockedX, _pos.dy);
        }
      }
      // По горизонтали пускаем и за край — иначе окно не спрятать.
      _pos = Offset(
        (_pos.dx + details.focalPointDelta.dx)
            .clamp(_hiddenLeftX, _hiddenRightX)
            .toDouble(),
        _pos.dy + details.focalPointDelta.dy,
      );
    });
  }

  void _onScaleEnd(ScaleEndDetails details) {
    _dragging = false;
    setState(() => _pos = Offset(_pos.dx, _clampTop(_pos.dy)));

    final vx = details.velocity.pixelsPerSecond.dx;
    if (vx < -700) return _dockTo(_PipDock.left);
    if (vx > 700) return _dockTo(_PipDock.right);
    if (_pos.dx + _w < _w * 0.66) return _dockTo(_PipDock.left);
    if (_pos.dx > _bounds.width - _w * 0.66) return _dockTo(_PipDock.right);

    _dock = _PipDock.free;
    _snapToCorner();
  }

  void _onTap() {
    if (_dock != _PipDock.free) {
      _undock();
      return;
    }
    widget.onExpand?.call();
  }

  void _onDoubleTap() {
    setState(() {
      if (_collapsed) {
        _collapsed = false;
        _scale = _scaleBeforeCollapse;
      } else {
        _collapsed = true;
        _scaleBeforeCollapse = _scale;
        _scale = _collapsedScale;
      }
    });
    if (_dock != _PipDock.free) {
      _glideTo(Offset(_dockedX, _clampTop(_pos.dy)));
    } else {
      _snapToCorner();
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_pos.dx < 0) {
      // Стартовая позиция: правый верхний угол.
      _pos = Offset(_bounds.width - _w - widget.margin, widget.margin);
    } else if (!_dragging && !_anim.isAnimating) {
      // Границы могли поменяться (поворот, смена раскладки) — не даём окну
      // остаться за пределами родителя.
      _pos = Offset(
        _pos.dx.clamp(_hiddenLeftX, _hiddenRightX).toDouble(),
        _clampTop(_pos.dy),
      );
      if (_dock != _PipDock.free) _pos = Offset(_dockedX, _pos.dy);
    }

    final docked = _dock != _PipDock.free;

    return Positioned(
      left: _pos.dx,
      top: _pos.dy,
      child: GestureDetector(
        onTap: _onTap,
        onDoubleTap: _onDoubleTap,
        onScaleStart: _onScaleStart,
        onScaleUpdate: _onScaleUpdate,
        onScaleEnd: _onScaleEnd,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 200),
          opacity: docked && !_dragging ? 0.9 : 1,
          child: AnimatedContainer(
            // Во время щипка тянемся за пальцем без сглаживания, иначе оно
            // отстаёт от жеста; после — плавно доводим размер.
            duration:
                _dragging ? Duration.zero : const Duration(milliseconds: 200),
            curve: Curves.easeOutCubic,
            width: _w,
            height: _h,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: const Color(0xFF111111),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: Colors.white24, width: 1),
              boxShadow: const [
                BoxShadow(
                  color: Colors.black54,
                  blurRadius: 14,
                  offset: Offset(0, 6),
                ),
              ],
            ),
            child: widget.child,
          ),
        ),
      ),
    );
  }
}
