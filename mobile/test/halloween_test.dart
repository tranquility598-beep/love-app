import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:love_mobile/src/core/prefs/love_prefs.dart';
import 'package:love_mobile/src/theme/love_theme.dart';
import 'package:love_mobile/src/theme/love_tokens.dart';
import 'package:love_mobile/src/theme/season.dart';
import 'package:love_mobile/src/widgets/empty_state.dart';
import 'package:love_mobile/src/widgets/love_background.dart';
import 'package:shared_preferences/shared_preferences.dart';

Widget _screen(LovePalette palette) => LovePaletteScope(
      palette: palette,
      child: MaterialApp(
        debugShowCheckedModeBanner: false,
        theme: LoveTheme.build(palette),
        home: const Scaffold(
          body: LoveBackground(
            child: EmptyState(
              icon: Icons.chat_bubble_outline_rounded,
              title: 'Пока нет личных чатов',
              message: 'Добавьте друга, чтобы начать переписку.',
            ),
          ),
        ),
      ),
    );

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({'app-season': 'halloween', 'love_animations': false});
    await LovePrefs.instance.init();
  });

  testWidgets('выбор сезона сохраняется и переключает декор', (tester) async {
    await LovePrefs.instance.setString(K.season, 'halloween');
    await tester.pumpWidget(_screen(lovePaletteDark));
    await tester.pump(const Duration(milliseconds: 50));
    expect(find.byType(HalloweenBackdrop), findsOneWidget);
    expect(find.byType(HalloweenEmptyMark), findsOneWidget);

    await LovePrefs.instance.setString(K.season, 'none');
    await tester.pump();
    expect(find.byType(HalloweenBackdrop), findsNothing);
    expect(find.byType(HalloweenEmptyMark), findsNothing);
    expect(LovePrefs.instance.getString(K.season, ''), 'none');
  });

  for (final entry in {'dark': lovePaletteDark, 'light': lovePaletteLight}.entries) {
    testWidgets('снимок Halloween — ${entry.key}', (tester) async {
      await LovePrefs.instance.setString(K.season, 'halloween');
      await tester.binding.setSurfaceSize(const Size(390, 640));
      await tester.pumpWidget(_screen(entry.value));
      await tester.pump(const Duration(milliseconds: 50));
      await expectLater(find.byType(MaterialApp), matchesGoldenFile('goldens/halloween_${entry.key}.png'));
      await tester.binding.setSurfaceSize(null);
    });
  }
}
