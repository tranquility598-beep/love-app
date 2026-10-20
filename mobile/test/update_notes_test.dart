import 'package:flutter_test/flutter_test.dart';
import 'package:love_mobile/src/core/updates/app_updater.dart';

void main() {
  test('заметки релиза показываются простым текстом', () {
    const md = '# LOVE v2.1.1\n\n'
        'Маленький выпуск про одну\nнадоевшую надпись.\n\n'
        '## Что починили\n'
        '**Версия 2.0.0.** Висел номер\nстарой сборки.\n\n'
        '- первый пункт\n- второй [ссылка](https://loveapp.chat)';
    expect(
      AppUpdater.plainReleaseNotes(md),
      'Маленький выпуск про одну надоевшую надпись.\n\n'
      'Что починили\n'
      'Версия 2.0.0. Висел номер старой сборки.\n\n'
      '• первый пункт\n• второй ссылка',
    );
  });
}
