import '../config/app_config.dart';

/// Ссылки-приглашения на клиенте. Одна точка правды — зеркало
/// `server/utils/inviteLinks.js`.
///
/// Форм две, и путать их нельзя:
///  * веб-ссылка (`https://<хост API>/invite/КОД`) — то, что человек вставляет
///    в браузер или мессенджер. Хост API, а не сайта: страницу с превью
///    рендерит backend, на статике сайта такого маршрута нет.
///  * deep link (`love-app://invite/КОД`) — открывает уже установленное
///    приложение. В браузере он ничего не делает, поэтому наружу его давать
///    нельзя.
///
/// Хост берём из [AppConfig.apiBaseUrl]: в dev это может быть IP машины
/// разработчика, и ссылка обязана указывать туда же.
class InviteLinks {
  const InviteLinks._();

  /// Ссылка с превью — её копируют и отправляют друзьям.
  static String webUrl(String code) =>
      '${AppConfig.apiBaseUrl}/invite/${Uri.encodeComponent(code.trim())}';

  /// Открывает установленное приложение.
  static String deepLink(String code) =>
      'love-app://invite/${Uri.encodeComponent(code.trim())}';

  /// Что показать и скопировать после создания инвайта.
  ///
  /// Ответ сервера в приоритете: он знает канонический хост (`INVITE_BASE_URL`)
  /// и может отдать ссылку на домен сайта, когда тот начнёт проксировать API.
  /// Локальная сборка — только запасной вариант для старых сборок backend.
  static String fromResponse(String? inviteUrl, String code) {
    final fromServer = (inviteUrl ?? '').trim();
    if (fromServer.isNotEmpty) return fromServer;
    return code.trim().isEmpty ? '' : webUrl(code);
  }

  /// Код приглашения из произвольного текста (сообщение, вставка в поле).
  static String? codeOf(String text) =>
      _pattern.firstMatch(text)?.group(1);

  /// Текст без ссылки — чтобы над карточкой не висел голый URL.
  static String strip(String text) => text.replaceAll(_pattern, '').trim();

  /// Хост в шаблоне поля ввода: должен совпадать с тем, что реально выдаёт
  /// сервер, иначе подсказка учит неверному формату.
  static String get hintUrl => webUrl('ABC12345');

  static final RegExp _pattern = _buildPattern();

  /// Регексп намеренно узкий. Если разрешить «любой хост + /invite/», то
  /// `https://discord.com/invite/xyz` в сообщении превратится в карточку LOVE
  /// и провалится на превью. Поддомены разбираем как `(?:sub.)*loveapp.chat`,
  /// а не `[^/]*loveapp.chat`: второе поймало бы и `evil-loveapp.chat`.
  static RegExp _buildPattern() {
    final hosts = <String>[r'(?:[a-z0-9-]+\.)*loveapp\.chat'];
    final devHost = Uri.tryParse(AppConfig.apiBaseUrl)?.host ?? '';
    if (devHost.isNotEmpty && !devHost.endsWith('loveapp.chat')) {
      hosts.add(RegExp.escape(devHost));
    }
    return RegExp(
      r'(?:https?:\/\/(?:' +
          hosts.join('|') +
          r')(?::\d+)?\/invite\/|love-app:\/\/invite\/)([A-Za-z0-9-]{4,32})',
      caseSensitive: false,
    );
  }
}
