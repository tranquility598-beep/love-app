import 'package:flutter/material.dart';

import '../theme/love_tokens.dart';

/// A content card surface. Web `.lvs-card`: a very faint translucent white fill
/// over the dark background, hairline border, 16px radius, flat (no shadow
/// unless it's a floating element).
class LoveSurface extends StatelessWidget {
  const LoveSurface({
    required this.child,
    this.padding = const EdgeInsets.all(LoveSpacing.md),
    this.margin,
    this.radius = 16,
    this.color,
    this.borderColor,
    this.shadow = false,
    super.key,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final EdgeInsetsGeometry? margin;
  final double radius;
  final Color? color;
  final Color? borderColor;
  final bool shadow;

  /// Faint card fill matching web `.lvs-card` — rgba(255,255,255,0.018).
  static Color cardFill(BuildContext context) => context.palette.inkA(0.02);

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: margin,
      decoration: BoxDecoration(
        color: color ?? cardFill(context),
        border: Border.all(color: borderColor ??  context.palette.inkA(0.05)),
        borderRadius: BorderRadius.circular(radius),
        boxShadow: [
          if (shadow)
            BoxShadow(
              color: context.palette.dropA(0.25),
              blurRadius: 24,
              offset: const Offset(0, 8),
            ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: Padding(
          padding: padding,
          child: child,
        ),
      ),
    );
  }
}
