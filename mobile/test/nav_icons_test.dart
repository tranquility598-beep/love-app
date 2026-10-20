import 'dart:ui';

import 'package:flutter_test/flutter_test.dart';
import 'package:love_mobile/src/widgets/love_nav_icons.dart';

/// Границы самой линии (по точкам вдоль пути), а не getBounds(): тот
/// учитывает опорные точки кривых, которыми аппроксимированы дуги, и они
/// выходят за рисунок.
Rect inkBounds(Path path) {
  var left = double.infinity, top = double.infinity;
  var right = -double.infinity, bottom = -double.infinity;
  for (final metric in path.computeMetrics()) {
    for (var d = 0.0; d <= metric.length; d += 0.25) {
      final p = metric.getTangentForOffset(d)!.position;
      if (p.dx < left) left = p.dx;
      if (p.dy < top) top = p.dy;
      if (p.dx > right) right = p.dx;
      if (p.dy > bottom) bottom = p.dy;
    }
  }
  return Rect.fromLTRB(left, top, right, bottom);
}

void main() {
  test('новые иконки «Сферы» и Love Hub рисуются целиком внутри 24×24', () {
    const paths = [
      'M10.4 21.9a10 10 0 0 0 9.941-15.416',
      'M13.5 2.1a10 10 0 0 0-9.841 15.416',
      'M7.9 20A9 9 0 1 0 4 16.1L2 22Z',
      'M15.8 9.2a2.5 2.5 0 0 0-3.5 0l-.3.4-.35-.3a2.42 2.42 0 1 0-3.2 3.6l3.6 3.5 3.6-3.5c1.2-1.2 1.1-2.7.2-3.7',
    ];
    for (final data in paths) {
      final bounds = inkBounds(parseSvgPath(data));
      expect(bounds.isFinite, isTrue, reason: data);
      expect(bounds.left, greaterThanOrEqualTo(1.5), reason: data);
      expect(bounds.top, greaterThanOrEqualTo(1.5), reason: data);
      expect(bounds.right, lessThanOrEqualTo(22.5), reason: data);
      expect(bounds.bottom, lessThanOrEqualTo(22.5), reason: data);
    }
    // Сердце внутри облачка: центр примерно в (12, 11.6).
    final heart = inkBounds(parseSvgPath(paths[3]));
    expect(heart.center.dx, closeTo(12, 1.2));
    expect(heart.center.dy, closeTo(11.6, 1.2));
  });
}
