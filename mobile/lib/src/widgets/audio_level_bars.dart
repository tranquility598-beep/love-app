import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import '../theme/love_tokens.dart';

/// Пол шкалы уровня в дБFS: тише этого считаем тишиной.
///
/// −45 дБ подобрано на слух: тихая комната на телефоне даёт примерно −50…−60,
/// обычная речь у лица — −25…−10. С более низким полом (например, −60) полоски
/// заметно подрагивали бы от фонового шума, и волна снова ничего не значила бы.
const double _levelFloorDb = -45;

/// Уровень 0..1 из дБFS.
///
/// Пакет `record` на Android отдаёт именно дБFS (и −160 в тишине), поэтому
/// это основная точка входа шкалы.
double audioLevelFromDbfs(double dbfs) {
  if (!dbfs.isFinite) return 0;
  return ((dbfs - _levelFloorDb) / -_levelFloorDb).clamp(0.0, 1.0);
}

/// Уровень 0..1 из «сырого» пика 0..32767.
///
/// Нативный MediaRecorder (запись голосового) отдаёт пик, а не дБ. Переводим
/// его в дБFS, чтобы тест микрофона и волна записи жили на одной шкале и
/// выглядели одинаково — иначе в одном месте голос поднимал бы полоски до
/// потолка, а в другом еле-еле.
double audioLevelFromPeak(int peak) {
  if (peak <= 0) return 0;
  return audioLevelFromDbfs(20 * math.log(peak / 32768.0) / math.ln10);
}

/// Живая полоска уровня микрофона: история громкости, новые значения справа.
///
/// Виджет сам владеет таймером и получает громкость через [sample], а не через
/// проп `level`. Это сделано намеренно: с пропом любая посторонняя перестройка
/// родителя (например, ввод текста в композере) сдвигала бы историю и волна
/// «ехала» бы без звука.
class AudioLevelBars extends StatefulWidget {
  const AudioLevelBars({
    super.key,
    required this.sample,
    this.interval = const Duration(milliseconds: 90),
    this.barCount = 28,
    this.height = 24,
    this.barWidth = 3,
    this.spacing = 2,
    this.color,
  });

  /// Возвращает текущую громкость 0..1. Исключения трактуются как тишина.
  final Future<double> Function() sample;
  final Duration interval;
  final int barCount;
  final double height;
  final double barWidth;
  final double spacing;
  final Color? color;

  @override
  State<AudioLevelBars> createState() => _AudioLevelBarsState();
}

class _AudioLevelBarsState extends State<AudioLevelBars> {
  static const double _minBarHeight = 2;

  late List<double> _levels;
  Timer? _timer;
  bool _sampling = false;

  @override
  void initState() {
    super.initState();
    _levels = List<double>.filled(widget.barCount, 0, growable: true);
    _timer = Timer.periodic(widget.interval, (_) => _tick());
  }

  Future<void> _tick() async {
    // Опрос идёт через канал в нативный код: он может занять больше шага
    // таймера. Без этого замка тики наложились бы друг на друга и история
    // сдвигалась бы рывками.
    if (_sampling) return;
    _sampling = true;
    double level = 0;
    try {
      level = await widget.sample();
    } catch (_) {
      // Запись могла уже остановиться — для волны это просто тишина.
      level = 0;
    }
    _sampling = false;
    if (!mounted) return;
    setState(() {
      _levels
        ..add(level.isFinite ? level.clamp(0.0, 1.0) : 0.0)
        ..removeAt(0);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final color = widget.color ?? context.palette.textSecondary;
    return SizedBox(
      height: widget.height,
      // Ширина полоски зависит от места: в строке композера рядом с кнопками
      // его немного и меньше на узких экранах. Считаем, сколько полосок
      // влезает, и показываем последние — так волна не вылезает за край и не
      // ломает раскладку.
      child: LayoutBuilder(
        builder: (context, constraints) {
          var levels = _levels;
          if (constraints.maxWidth.isFinite) {
            final fit = ((constraints.maxWidth + widget.spacing) /
                    (widget.barWidth + widget.spacing))
                .floor();
            if (fit <= 0) return const SizedBox.shrink();
            if (fit < levels.length) {
              levels = levels.sublist(levels.length - fit);
            }
          }
          return Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              for (var i = 0; i < levels.length; i++) ...[
                if (i > 0) SizedBox(width: widget.spacing),
                AnimatedContainer(
                  // Переход чуть длиннее шага опроса — полоски двигаются
                  // слитно, а не мигают на каждом тике.
                  duration: widget.interval + const Duration(milliseconds: 30),
                  curve: Curves.easeOut,
                  width: widget.barWidth,
                  height: _minBarHeight +
                      levels[i] * (widget.height - _minBarHeight),
                  decoration: BoxDecoration(
                    color: color,
                    borderRadius: BorderRadius.circular(widget.barWidth),
                  ),
                ),
              ],
            ],
          );
        },
      ),
    );
  }
}
