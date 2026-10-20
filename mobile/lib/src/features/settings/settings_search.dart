import 'package:flutter/material.dart';

import '../../theme/love_tokens.dart';

/// Поиск по настройкам — как на ПК (client/js/new/settings-ui.js →
/// initSettingsSearch): находит не только разделы, но и сами строки внутри
/// них. Нажатие открывает раздел, прокручивает к строке и подсвечивает её
/// (SettingsSearchTarget + SearchHit ниже).
///
/// Индекс статический: строки разделов собраны из их исходников. Тест
/// test/settings_search_test.dart падает, если в разделе появилась строка,
/// которой нет здесь, — чтобы поиск не отставал от настроек.

/// Раздел — строковым id, чтобы этот файл не зависел от settings_screen.dart.
class SettingsSearchEntry {
  const SettingsSearchEntry(this.section, this.label,
      {this.subtitle = '', this.keywords = ''});

  /// Имя значения SettingsSection (profile, account, …).
  final String section;

  /// Текст строки ровно как в разделе — по нему же ищется строка для подсветки.
  final String label;
  final String subtitle;

  /// Как люди называют настройку своими словами («микрофон», а не
  /// «Устройство ввода»).
  final String keywords;
}

const settingsSearchIndex = <SettingsSearchEntry>[
  // Профиль
  SettingsSearchEntry('profile', 'Изменить аватар',
      keywords: 'аватар фото картинка'),
  SettingsSearchEntry('profile', 'Отображаемое имя',
      keywords: 'имя ник никнейм'),
  SettingsSearchEntry('profile', 'О себе', keywords: 'био описание bio'),
  SettingsSearchEntry('profile', 'Статус (настроение)',
      keywords: 'статус настроение'),
  SettingsSearchEntry('profile', 'Сейчас слушает',
      keywords: 'музыка трек песня'),
  SettingsSearchEntry('profile', 'Публичная карточка',
      keywords: 'карточка профиль'),
  SettingsSearchEntry('profile', 'Активность',
      keywords: 'увлечения хобби интересы'),
  SettingsSearchEntry('profile', 'Публичная страница',
      keywords: 'билдер редактор ссылка визитка страница'),
  // Аккаунт
  SettingsSearchEntry('account', 'Электронная почта',
      keywords: 'почта email емейл'),
  SettingsSearchEntry('account', 'Имя пользователя',
      keywords: 'username юзернейм ник логин'),
  SettingsSearchEntry('account', 'Пароль',
      keywords: 'сменить пароль безопасность'),
  SettingsSearchEntry('account', 'Дата создания', keywords: 'регистрация'),
  SettingsSearchEntry('account', 'Безопасность', keywords: 'защита'),
  SettingsSearchEntry('account', 'Двухфакторная аутентификация',
      keywords: '2fa двухфакторка код защита'),
  SettingsSearchEntry('account', 'Google OAuth', keywords: 'гугл google вход'),
  SettingsSearchEntry('account', 'Удалить аккаунт', keywords: 'удаление'),
  // Подписки
  SettingsSearchEntry('subscriptions', 'Ваш тариф',
      keywords: 'подписка тариф pro premium duo free оплата'),
  // Конфиденциальность
  SettingsSearchEntry('privacy', 'Видимость'),
  SettingsSearchEntry('privacy', 'Статус «в сети»',
      subtitle: 'Показывать, когда вы онлайн',
      keywords: 'онлайн в сети невидимка'),
  SettingsSearchEntry('privacy', 'Кто видит профиль',
      keywords: 'профиль приватность'),
  SettingsSearchEntry('privacy', 'Показывать активность',
      subtitle: 'Что вы слушаете и во что играете'),
  SettingsSearchEntry('privacy', 'Запросы'),
  SettingsSearchEntry('privacy', 'Запросы в друзья', keywords: 'друзья заявки'),
  SettingsSearchEntry('privacy', 'Личные сообщения',
      keywords: 'лс сообщения писать'),
  SettingsSearchEntry('privacy', 'Заблокированные',
      keywords: 'блокировка разблокировать чёрный список черный'),
  SettingsSearchEntry('privacy', 'Ссылки'),
  SettingsSearchEntry('privacy', 'Предупреждать о чужих сайтах',
      subtitle: 'Спрашивать перед переходом по ссылке за пределы LOVE',
      keywords: 'ссылки сайты переход'),
  // Внешний вид
  SettingsSearchEntry('appearance', 'Тема',
      keywords: 'тёмная темная светлая оформление цвет'),
  SettingsSearchEntry('appearance', 'Сезонная тема',
      keywords: 'хэллоуин хеллоуин halloween тыква праздник'),
  SettingsSearchEntry('appearance', 'Масштаб и режимы'),
  SettingsSearchEntry('appearance', 'Масштаб интерфейса',
      subtitle: 'Размер текста и элементов',
      keywords: 'размер шрифт крупнее мельче'),
  SettingsSearchEntry('appearance', 'Компактный режим',
      subtitle: 'Плотнее размещать сообщения'),
  SettingsSearchEntry('appearance', 'Анимации',
      subtitle: 'Плавные переходы интерфейса', keywords: 'движение'),
  SettingsSearchEntry('appearance', 'Эффекты прозрачности',
      subtitle: 'Размытие и стекло'),
  // Уведомления
  SettingsSearchEntry('notifications', 'Push на телефон',
      subtitle: 'Уведомления, когда приложение свёрнуто',
      keywords: 'пуш оповещения'),
  SettingsSearchEntry('notifications', 'Сообщения',
      keywords: 'уведомления о сообщениях'),
  SettingsSearchEntry('notifications', 'Упоминания', keywords: 'пинг'),
  SettingsSearchEntry('notifications', 'Обновления приложения'),
  SettingsSearchEntry('notifications', 'Love Hub',
      subtitle: 'Анонсы и ответы сообщества'),
  SettingsSearchEntry('notifications', 'Звуки в приложении',
      subtitle: 'Сообщения, войс и звонки', keywords: 'звук звонок'),
  // Голос и звук
  SettingsSearchEntry('voice', 'Микрофон'),
  SettingsSearchEntry('voice', 'Устройство ввода', keywords: 'микрофон микро'),
  SettingsSearchEntry('voice', 'Громкость ввода',
      keywords: 'микрофон чувствительность'),
  SettingsSearchEntry('voice', 'Проверить микрофон',
      subtitle: 'Запись 3 секунды и прослушивание', keywords: 'тест'),
  SettingsSearchEntry('voice', 'Динамики'),
  SettingsSearchEntry('voice', 'Устройство вывода',
      keywords: 'динамики наушники колонки звук'),
  SettingsSearchEntry('voice', 'Громкость вывода',
      keywords: 'звук громкость наушники'),
  SettingsSearchEntry('voice', 'Проверить звук',
      subtitle: 'Проиграть тестовый сигнал', keywords: 'тест'),
  SettingsSearchEntry('voice', 'Обработка'),
  SettingsSearchEntry('voice', 'Шумоподавление', keywords: 'шум фон'),
  SettingsSearchEntry('voice', 'Эхоподавление', keywords: 'эхо'),
  SettingsSearchEntry('voice', 'Активация по голосу',
      keywords: 'рация push to talk'),
  // Love Hub
  SettingsSearchEntry('hub', 'Анонсы', subtitle: 'Новости и важные объявления'),
  SettingsSearchEntry('hub', 'Dev Log',
      subtitle: 'Заметки разработки', keywords: 'девлог'),
  SettingsSearchEntry('hub', 'Идеи', subtitle: 'Предложения сообщества'),
  SettingsSearchEntry('hub', 'Обратная связь',
      subtitle: 'Ответы на ваши отзывы', keywords: 'отзыв'),
  // Обновления
  SettingsSearchEntry('updates', 'Текущая версия', keywords: 'версия'),
  SettingsSearchEntry('updates', 'Статус',
      keywords: 'обновить проверить обновления'),
  SettingsSearchEntry('updates', 'Бета-канал',
      subtitle: 'Получать предрелизные версии', keywords: 'бета тест'),
  // Расширенные
  SettingsSearchEntry('advanced', 'Режим отладки',
      subtitle: 'Подробные логи в консоли', keywords: 'дебаг логи'),
  SettingsSearchEntry('advanced', 'Аппаратное ускорение',
      subtitle: 'Использовать GPU для отрисовки', keywords: 'gpu видеокарта'),
  SettingsSearchEntry('advanced', 'Кэш приложения',
      subtitle: 'Временные файлы и изображения',
      keywords: 'кеш очистить память'),
  SettingsSearchEntry('advanced', 'Диагностика',
      subtitle: 'Сведения о среде выполнения'),
  // О приложении
  SettingsSearchEntry('about', 'Сайт', keywords: 'loveapp.chat'),
  SettingsSearchEntry('about', 'Что нового',
      subtitle: 'История обновлений', keywords: 'changelog'),
  SettingsSearchEntry('about', 'Поддержка', subtitle: 'Вопросы и нарушения'),
  SettingsSearchEntry('about', 'Написать нам',
      keywords: 'почта email связаться'),
  SettingsSearchEntry('about', 'Условия', subtitle: 'Правила использования'),
];

String normalizeSettingsQuery(String text) => text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replaceAll(RegExp(r'\s+'), ' ')
    .trim();

/// Все слова запроса есть в подписи, пояснении или синонимах строки.
bool settingsEntryMatches(
    SettingsSearchEntry entry, String sectionTitle, String query) {
  final q = normalizeSettingsQuery(query);
  if (q.length < 2) return false;
  final haystack = normalizeSettingsQuery(
      '${entry.label} ${entry.subtitle} ${entry.keywords} $sectionTitle');
  return q.split(' ').every(haystack.contains);
}

/// Подпись строки, к которой привёл поиск. Ставится страницей раздела.
class SettingsSearchTarget extends InheritedWidget {
  const SettingsSearchTarget(
      {required this.label, required super.child, super.key});

  final String? label;

  static String? of(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<SettingsSearchTarget>()?.label;

  @override
  bool updateShouldNotify(SettingsSearchTarget oldWidget) =>
      oldWidget.label != label;
}

/// Обёртка строки настроек: если поиск привёл именно сюда — прокрутить к ней
/// и коротко подсветить. Иначе ничего не делает и макет не меняет.
class SearchHit extends StatefulWidget {
  const SearchHit({required this.title, required this.child, super.key});

  final String title;
  final Widget child;

  @override
  State<SearchHit> createState() => _SearchHitState();
}

class _SearchHitState extends State<SearchHit>
    with SingleTickerProviderStateMixin {
  AnimationController? _glow;
  bool _done = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_done) return;
    final target = SettingsSearchTarget.of(context);
    if (target == null || target != widget.title) return;
    _done = true;
    _glow = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 1800));
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      await Scrollable.ensureVisible(
        context,
        alignment: 0.35,
        duration: const Duration(milliseconds: 350),
        curve: Curves.easeOutCubic,
      );
      if (mounted) _glow?.forward(from: 0);
    });
  }

  @override
  void dispose() {
    _glow?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final glow = _glow;
    if (glow == null) return widget.child;
    return AnimatedBuilder(
      animation: glow,
      child: widget.child,
      builder: (context, child) {
        final strength = glow.isAnimating || glow.value < 1
            ? (1 - Curves.easeIn.transform(glow.value))
            : 0.0;
        return DecoratedBox(
          decoration: BoxDecoration(
            color: context.palette.inkA(0.10 * strength),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: context.palette.inkA(0.45 * strength)),
          ),
          child: child,
        );
      },
    );
  }
}
