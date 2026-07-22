import 'package:flutter/material.dart';

import '../core/prefs/love_prefs.dart';

/// LOVE page transition: gentle fade + short horizontal drift.
///
/// Replaces the default Material zoom transition, which looks harsh on the
/// flat dark design. Cheap to render (opacity + transform only — no clips,
/// no shadows), so it stays smooth even on mid-range Androids.
///
/// Respects the «Анимации» setting: when the user disables animations,
/// pages switch instantly with no motion.
class LovePageTransitionsBuilder extends PageTransitionsBuilder {
  const LovePageTransitionsBuilder();

  @override
  Widget buildTransitions<T>(
    PageRoute<T> route,
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
    Widget child,
  ) {
    // Настройка «Анимации» выключена — мгновенный переход без движения.
    if (LovePrefs.instance.reduceMotion.value) {
      return child;
    }

    final curved = CurvedAnimation(
      parent: animation,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );

    // Outgoing page below fades back slightly — keeps depth without cost.
    final secondaryCurved = CurvedAnimation(
      parent: secondaryAnimation,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );

    return FadeTransition(
      opacity: curved,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: const Offset(0.06, 0),
          end: Offset.zero,
        ).animate(curved),
        child: FadeTransition(
          opacity: Tween<double>(begin: 1, end: 0.85).animate(secondaryCurved),
          child: child,
        ),
      ),
    );
  }
}
