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
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 8),
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

/// Перетаскиваемое PiP-окошко (демка или своя камера) в Stack экрана звонка.
/// Таскается куда угодно, при отпускании плавно прилипает к ближайшему углу.
/// Тап — onExpand (открыть FullscreenShareViewer).
class DraggablePipTile extends StatefulWidget {
  const DraggablePipTile({
    super.key,
    required this.child,
    this.onExpand,
    this.width = 132,
    this.height = 176,
    this.margin = 12,
  });

  final Widget child;
  final VoidCallback? onExpand;
  final double width;
  final double height;
  final double margin;

  @override
  State<DraggablePipTile> createState() => _DraggablePipTileState();
}

class _DraggablePipTileState extends State<DraggablePipTile>
    with SingleTickerProviderStateMixin {
  late final AnimationController _anim = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 260),
  );
  Animation<Offset>? _snapTween;

  Offset _pos = const Offset(-1, -1); // инициализируется в первом build

  @override
  void initState() {
    super.initState();
    _anim.addListener(() {
      if (_snapTween != null) setState(() => _pos = _snapTween!.value);
    });
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  void _snapToCorner(Size screen, EdgeInsets safe) {
    final leftX = widget.margin + safe.left;
    final rightX = screen.width - widget.width - widget.margin - safe.right;
    final topY = widget.margin + safe.top;
    final bottomY =
        screen.height - widget.height - widget.margin - safe.bottom - 88;

    final cx = _pos.dx + widget.width / 2;
    final cy = _pos.dy + widget.height / 2;
    final target = Offset(
      cx < screen.width / 2 ? leftX : rightX,
      cy < screen.height / 2 ? topY : bottomY,
    );

    _snapTween = Tween<Offset>(begin: _pos, end: target).animate(
      CurvedAnimation(parent: _anim, curve: Curves.easeOutCubic),
    );
    _anim.forward(from: 0);
  }

  @override
  Widget build(BuildContext context) {
    final screen = MediaQuery.of(context).size;
    final safe = MediaQuery.of(context).padding;

    if (_pos.dx < 0) {
      // Стартовая позиция: правый верхний угол.
      _pos = Offset(
        screen.width - widget.width - widget.margin - safe.right,
        widget.margin + safe.top,
      );
    }

    return Positioned(
      left: _pos.dx,
      top: _pos.dy,
      child: GestureDetector(
        onTap: widget.onExpand,
        onPanStart: (_) => _anim.stop(),
        onPanUpdate: (d) => setState(() => _pos += d.delta),
        onPanEnd: (_) => _snapToCorner(screen, safe),
        child: Container(
          width: widget.width,
          height: widget.height,
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
    );
  }
}
