import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:love_mobile/src/core/prefs/love_prefs.dart';
import 'package:love_mobile/src/features/settings/settings_screen.dart';
import 'package:love_mobile/src/features/settings/settings_search.dart';
import 'package:love_mobile/src/features/settings/settings_widgets.dart';
import 'package:love_mobile/src/session/app_session.dart';
import 'package:love_mobile/src/theme/love_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await LovePrefs.instance.init();
  });

  test('каждая строка разделов настроек есть в поиске', () {
    // Заголовки разделов и диалогов — не строки, их искать не нужно.
    const notRows = {
      'Настройки', 'Конфиденциальность', 'Внешний вид', 'Уведомления', 'Голос и звук',
      'Love Hub', 'Обновления', 'Расширенные',
    };
    final source = File('lib/src/features/settings/settings_screen.dart').readAsStringSync();
    final titles = RegExp(r"(?<!sub)title: '([^']*)'").allMatches(source).map((m) => m.group(1)!).toSet()
      ..removeAll(notRows);
    final indexed = settingsSearchIndex.map((entry) => entry.label).toSet();
    final missing = titles.difference(indexed);
    expect(missing, isEmpty, reason: 'Добавьте в settingsSearchIndex: $missing');
  });

  test('поиск понимает синонимы и букву ё', () {
    const entry = SettingsSearchEntry('voice', 'Устройство ввода', keywords: 'микрофон');
    expect(settingsEntryMatches(entry, 'Голос и звук', 'микрофон'), isTrue);
    expect(settingsEntryMatches(entry, 'Голос и звук', 'ввод голос'), isTrue);
    expect(settingsEntryMatches(entry, 'Голос и звук', 'камера'), isFalse);
    const dark = SettingsSearchEntry('appearance', 'Тема', keywords: 'тёмная');
    expect(settingsEntryMatches(dark, 'Внешний вид', 'темная'), isTrue);
  });

  testWidgets('строки внутри разделов видны в результатах поиска', (tester) async {
    await tester.pumpWidget(AppSessionScope(
      session: AppSession(),
      child: MaterialApp(theme: LoveTheme.dark(), home: const SettingsScreen()),
    ));
    await tester.enterText(find.byType(TextField).first, 'микрофон');
    await tester.pump();
    expect(find.text('Устройство ввода'), findsOneWidget);
    expect(find.text('Громкость ввода'), findsOneWidget);
    expect(find.text('Проверить микрофон'), findsOneWidget);
  });

  testWidgets('найденная строка подсвечивается', (tester) async {
    Widget page(String? target) => MaterialApp(
          theme: LoveTheme.dark(),
          home: Scaffold(
            body: SettingsSearchTarget(
              label: target,
              child: ListView(children: [
                SettingsCard(children: [
                  SettingsToggleRow(title: 'Шумоподавление', value: true, onChanged: (_) {}),
                  SettingsToggleRow(title: 'Эхоподавление', value: true, onChanged: (_) {}),
                ]),
              ]),
            ),
          ),
        );
    await tester.pumpWidget(page('Эхоподавление'));
    await tester.pump(const Duration(milliseconds: 100));
    final hit = find.ancestor(of: find.text('Эхоподавление'), matching: find.byType(DecoratedBox));
    expect(hit, findsWidgets);
    final other = find.ancestor(
      of: find.text('Шумоподавление'),
      matching: find.descendant(of: find.byType(SearchHit), matching: find.byType(AnimatedBuilder)),
    );
    expect(other, findsNothing);
    await tester.pumpAndSettle();
  });
}
