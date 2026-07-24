import 'package:flutter/material.dart';

/// Таблетка «Вы в войсе» с полной физикой:
///  - таскается по вертикали и горизонтали (влево И вправо)
///  - плавное скрытие за любой боковой край (остаётся «ушко»)
///  - дотащил до упора — скрывается сама, плавно
///  - вернуть: тап по ушку ИЛИ зажать-и-вытянуть — оба способа
///  - недоведённый жест плавно откатывается, учитывается скорость свайпа
///
/// Использование (в Stack поверх основного UI):
///   VoicePill(
///     onTap: () => openVoiceScreen(),
///     child: Row(children: [...текущий контент таблетки...]),
///   )
class VoicePill extends StatefulWidget {
  const VoicePill({
    super.key,
    required this.child,
    this.onTap,
    this.height = 44.0,
    this.handleWidth = 18.0,
    this.initialTop = 64.0,
  });

  final Widget child;

  /// Тап по ВИДИМОЙ таблетке (открыть войс). Тап по ушку всегда вытаскивает.
  final VoidCallback? onTap;
  final double height;
  final double handleWidth;
  final double initialTop;

  @override
  State<VoicePill> createState() => _VoicePillState();
}

enum _PillState { visible, hiddenLeft, hiddenRight }

class _VoicePillState extends State<VoicePill>
    with SingleTickerProviderStateMixin {
  final GlobalKey _pillKey = GlobalKey();

  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 280),
  );

  _PillState _state = _PillState.visible;
  bool _dragging = false;

  double _left = 0; // текущая X-позиция
  double _top = 0;
  double _pillWidth = 220; // уточняется после первого кадра
  bool _initialized = false;

  Animation<double>? _leftAnim;

  @override
  void initState() {
    super.initState();
    _top = widget.initialTop;
    _anim.addListener(() {
      if (_leftAnim != null) setState(() => _left = _leftAnim!.value);
    });
    WidgetsBinding.instance.addPostFrameCallback((_) => _measure());
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  void _measure() {
    final box = _pillKey.currentContext?.findRenderObject() as RenderBox?;
    if (box != null && mounted) {
      setState(() {
        _pillWidth = box.size.width;
        if (!_initialized) {
          _initialized = true;
          _left = _centerX();
        }
      });
    }
  }

  double _screenW() => MediaQuery.of(context).size.width;
  double _screenH() => MediaQuery.of(context).size.height;

  double _centerX() => (_screenW() - _pillWidth) / 2;
  double _hiddenLeftX() => -_pillWidth + widget.handleWidth;
  double _hiddenRightX() => _screenW() - widget.handleWidth;

  void _animateTo(double target, {Curve curve = Curves.easeOutCubic}) {
    _leftAnim = Tween<double>(begin: _left, end: target)
        .animate(CurvedAnimation(parent: _anim, curve: curve));
    _anim.forward(from: 0);
  }

  void _hide(_PillState side) {
    _state = side;
    _animateTo(
      side == _PillState.hiddenLeft ? _hiddenLeftX() : _hiddenRightX(),
    );
  }

  void _show({double? toX}) {
    _state = _PillState.visible;
    final target = (toX ?? _left).clamp(8.0, _screenW() - _pillWidth - 8.0);
    _animateTo(target.toDouble());
  }

  // ---- жесты ----

  void _onPanStart(DragStartDetails d) {
    _anim.stop();
    _dragging = true;
  }

  void _onPanUpdate(DragUpdateDetails d) {
    setState(() {
      // Свободное слежение за пальцем — без резких обрезок.
      _left = (_left + d.delta.dx)
          .clamp(_hiddenLeftX(), _hiddenRightX());
      _top = (_top + d.delta.dy)
          .clamp(MediaQuery.of(context).padding.top + 4,
              _screenH() * 0.75);
    });
  }

  void _onPanEnd(DragEndDetails d) {
    _dragging = false;
    final vx = d.velocity.pixelsPerSecond.dx;
    final visibleLeftPart = _left + _pillWidth; // сколько видно слева
    final screenW = _screenW();

    // Быстрый свайп — уважаем направление.
    if (vx < -700) return _hide(_PillState.hiddenLeft);
    if (vx > 700) return _hide(_PillState.hiddenRight);

    // Дотащил больше трети за край — плавно доводим до скрытия.
    if (visibleLeftPart < _pillWidth * 0.66) {
      return _hide(_PillState.hiddenLeft);
    }
    if (_left > screenW - _pillWidth * 0.66) {
      return _hide(_PillState.hiddenRight);
    }

    // Иначе — остаёмся видимыми, мягко возвращаемся в границы.
    _show(toX: _left);
  }

  void _onTap() {
    if (_state != _PillState.visible) {
      // Тап по ушку — плавно вытаскиваем к ближнему краю.
      final target = _state == _PillState.hiddenLeft
          ? 8.0
          : _screenW() - _pillWidth - 8.0;
      _show(toX: target);
    } else {
      widget.onTap?.call();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Positioned(
      left: _left,
      top: _top,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: _onTap,
        onPanStart: _onPanStart,
        onPanUpdate: _onPanUpdate,
        onPanEnd: _onPanEnd,
        child: AnimatedOpacity(
          duration: const Duration(milliseconds: 200),
          opacity: _state == _PillState.visible || _dragging ? 1.0 : 0.85,
          child: Container(
            key: _pillKey,
            height: widget.height,
            padding: const EdgeInsets.symmetric(horizontal: 16),
            decoration: BoxDecoration(
              color: const Color(0xFF161616),
              borderRadius: BorderRadius.circular(widget.height / 2),
              border: Border.all(color: Colors.white24, width: 1),
              boxShadow: const [
                BoxShadow(
                  color: Colors.black54,
                  blurRadius: 12,
                  offset: Offset(0, 4),
                ),
              ],
            ),
            child: Center(child: widget.child),
          ),
        ),
      ),
    );
  }
}
