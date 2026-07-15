import 'package:flutter/material.dart';

/// Bottom-nav glyphs drawn from the web app's exact SVG paths (24×24 viewBox,
/// feather/lucide style, stroke-width 1.8, round caps). Rendered via
/// [CustomPaint] so they stay crisp and cheap and can animate their colour /
/// glow without rasterising an asset per frame.
enum LoveNavGlyph { heart, bubble, layers, users, bell, menu }

class LoveNavIcon extends StatelessWidget {
  const LoveNavIcon({
    required this.glyph,
    required this.color,
    this.size = 24,
    this.filled = false,
    this.glow = false,
    super.key,
  });

  final LoveNavGlyph glyph;
  final Color color;
  final double size;
  final bool filled;
  final bool glow;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: CustomPaint(
        painter: _NavIconPainter(
          glyph: glyph,
          color: color,
          filled: filled,
          glow: glow,
        ),
      ),
    );
  }
}

class _NavIconPainter extends CustomPainter {
  _NavIconPainter({
    required this.glyph,
    required this.color,
    required this.filled,
    required this.glow,
  });

  final LoveNavGlyph glyph;
  final Color color;
  final bool filled;
  final bool glow;

  @override
  void paint(Canvas canvas, Size size) {
    final scale = size.width / 24.0;
    canvas.save();
    canvas.scale(scale);

    final stroke = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.8
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round
      ..color = color;

    final fill = Paint()
      ..style = PaintingStyle.fill
      ..color = color;

    if (glow) {
      stroke.maskFilter = const MaskFilter.blur(BlurStyle.normal, 2.5);
      final glowPass = Paint.from(stroke)
        ..color = color.withValues(alpha: 0.5)
        ..strokeWidth = 2.4;
      _drawGlyph(canvas, glowPass, glowPass, filledGlow: filled);
      stroke.maskFilter = null;
    }

    _drawGlyph(canvas, stroke, fill, filledGlow: filled);
    canvas.restore();
  }

  void _drawGlyph(Canvas canvas, Paint stroke, Paint fill,
      {required bool filledGlow}) {
    switch (glyph) {
      case LoveNavGlyph.heart:
        final p = _path(
          'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3'
          'c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5'
          'c0 3.78-3.4 6.86-8.55 11.54L12 21.35z',
        );
        canvas.drawPath(p, filledGlow ? fill : stroke);
        break;
      case LoveNavGlyph.bubble:
        canvas.drawPath(
          _path('M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'),
          stroke,
        );
        break;
      case LoveNavGlyph.layers:
        canvas.drawPath(
          _path('M12 2 2 7l10 5 10-5-10-5z'),
          stroke,
        );
        canvas.drawPath(_path('M2 17l10 5 10-5'), stroke);
        canvas.drawPath(_path('M2 12l10 5 10-5'), stroke);
        break;
      case LoveNavGlyph.users:
        canvas.drawPath(
          _path('M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2'),
          stroke,
        );
        canvas.drawCircle(const Offset(9, 7), 4, stroke);
        canvas.drawPath(_path('M23 21v-2a4 4 0 0 0-3-3.87'), stroke);
        canvas.drawPath(_path('M16 3.13a4 4 0 0 1 0 7.75'), stroke);
        break;
      case LoveNavGlyph.bell:
        canvas.drawPath(
          _path('M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9'),
          stroke,
        );
        canvas.drawPath(_path('M13.73 21a2 2 0 0 1-3.46 0'), stroke);
        break;
      case LoveNavGlyph.menu:
        for (final y in const [6.0, 12.0, 18.0]) {
          canvas.drawLine(Offset(3, y), Offset(21, y), stroke);
        }
        break;
    }
  }

  Path _path(String svg) => parseSvgPath(svg);

  @override
  bool shouldRepaint(_NavIconPainter old) =>
      old.color != color ||
      old.filled != filled ||
      old.glow != glow ||
      old.glyph != glyph;
}

/// Minimal SVG path-data parser supporting the M/L/H/V/C/A/Z commands used by
/// the nav glyphs above (absolute + relative). Good enough for these icons; not
/// a general-purpose parser.
Path parseSvgPath(String data) {
  final path = Path();
  final tokens = _tokenize(data);
  var i = 0;
  double cx = 0, cy = 0; // current point
  double sx = 0, sy = 0; // subpath start
  String cmd = '';

  double num() => tokens[i++] as double;
  bool hasNum() => i < tokens.length && tokens[i] is double;

  while (i < tokens.length) {
    if (tokens[i] is String) {
      cmd = tokens[i++] as String;
    }
    switch (cmd) {
      case 'M':
        cx = num();
        cy = num();
        path.moveTo(cx, cy);
        sx = cx;
        sy = cy;
        cmd = 'L';
        break;
      case 'm':
        cx += num();
        cy += num();
        path.moveTo(cx, cy);
        sx = cx;
        sy = cy;
        cmd = 'l';
        break;
      case 'L':
        cx = num();
        cy = num();
        path.lineTo(cx, cy);
        break;
      case 'l':
        cx += num();
        cy += num();
        path.lineTo(cx, cy);
        break;
      case 'H':
        cx = num();
        path.lineTo(cx, cy);
        break;
      case 'h':
        cx += num();
        path.lineTo(cx, cy);
        break;
      case 'V':
        cy = num();
        path.lineTo(cx, cy);
        break;
      case 'v':
        cy += num();
        path.lineTo(cx, cy);
        break;
      case 'C':
        final x1 = num(), y1 = num(), x2 = num(), y2 = num();
        cx = num();
        cy = num();
        path.cubicTo(x1, y1, x2, y2, cx, cy);
        break;
      case 'c':
        final x1 = cx + num(), y1 = cy + num();
        final x2 = cx + num(), y2 = cy + num();
        cx += num();
        cy += num();
        path.cubicTo(x1, y1, x2, y2, cx, cy);
        break;
      case 'A':
        final rx = num(), ry = num();
        num(); // x-axis-rotation (0 for our glyphs)
        final large = num() != 0;
        final sweep = num() != 0;
        cx = num();
        cy = num();
        path.arcToPoint(
          Offset(cx, cy),
          radius: Radius.elliptical(rx, ry),
          largeArc: large,
          clockwise: sweep,
        );
        break;
      case 'a':
        final rx = num(), ry = num();
        num();
        final large = num() != 0;
        final sweep = num() != 0;
        cx += num();
        cy += num();
        path.arcToPoint(
          Offset(cx, cy),
          radius: Radius.elliptical(rx, ry),
          largeArc: large,
          clockwise: sweep,
        );
        break;
      case 'Z':
      case 'z':
        path.close();
        cx = sx;
        cy = sy;
        break;
      default:
        i++; // skip unknown
    }
    if (!hasNum() && i < tokens.length && tokens[i] is! String) i++;
  }
  return path;
}

List<Object> _tokenize(String data) {
  final out = <Object>[];
  final re = RegExp(r'[MmLlHhVvCcAaZz]|-?\d*\.?\d+(?:e-?\d+)?');
  for (final m in re.allMatches(data)) {
    final s = m.group(0)!;
    final d = double.tryParse(s);
    out.add(d ?? s);
  }
  return out;
}
