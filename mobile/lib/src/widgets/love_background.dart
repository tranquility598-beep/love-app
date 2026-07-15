import 'package:flutter/material.dart';

import '../theme/love_tokens.dart';

/// The real mobile/Android background: flat `#0a0a0a`.
///
/// The web app runs in `perf-lite` mode inside the Android WebView, which
/// disables the animated starfield, radial gradient and all blur. Matching that
/// (a plain solid fill) is both visually correct and the cheapest possible
/// paint — key to keeping 60fps.
class LoveBackground extends StatelessWidget {
  const LoveBackground({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ColoredBox(
      color: LoveColors.bgAndroid,
      child: child,
    );
  }
}
