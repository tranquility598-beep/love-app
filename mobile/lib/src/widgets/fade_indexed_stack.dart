import 'package:flutter/material.dart';

import '../core/prefs/love_prefs.dart';

/// An [IndexedStack] that softly cross-fades (fade + subtle upward slide)
/// whenever [index] changes, while keeping every tab's state alive.
///
/// Used by the main shell so switching bottom-nav tabs feels smooth instead
/// of an instant hard cut.
///
/// Respects the «Анимации» setting: when animations are disabled the tab
/// switch is instant.
class FadeIndexedStack extends StatefulWidget {
  const FadeIndexedStack({
    required this.index,
    required this.children,
    this.duration = const Duration(milliseconds: 260),
    this.curve = Curves.easeOutCubic,
    super.key,
  });

  final int index;
  final List<Widget> children;
  final Duration duration;
  final Curve curve;

  @override
  State<FadeIndexedStack> createState() => _FadeIndexedStackState();
}

class _FadeIndexedStackState extends State<FadeIndexedStack>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: widget.duration,
    value: 1, // start fully visible (no animation on first build)
  );

  @override
  void didUpdateWidget(FadeIndexedStack oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.index != widget.index) {
      if (LovePrefs.instance.reduceMotion.value) {
        // Анимации выключены — переключаем вкладку мгновенно.
        _controller.value = 1;
      } else {
        _controller.forward(from: 0);
      }
    }
    if (oldWidget.duration != widget.duration) {
      _controller.duration = widget.duration;
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final animation = CurvedAnimation(
      parent: _controller,
      curve: widget.curve,
    );
    return FadeTransition(
      opacity: animation,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0, 0.012), // ~8px on a typical screen
          end: Offset.zero,
        ).animate(animation),
        child: IndexedStack(
          index: widget.index,
          children: widget.children,
        ),
      ),
    );
  }
}
