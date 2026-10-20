/**
 * Адреса публичных страниц профиля.
 *
 * Вынесено отдельно, потому что хост фигурирует минимум в пяти местах: API
 * (отдаёт ссылку клиенту), публичный рендер (canonical и OG-теги), редактор,
 * allowlist хоста и письма. Прописанный руками 'me.loveapp.chat' в каждом из
 * них — гарантированная рассинхронизация при первом же переезде домена.
 *
 * В разработке (npm start) отдельного хоста нет и не нужно: сервер один,
 * поэтому origin берётся из самого запроса, и страница открывается по
 * localhost:5555/u/sasha. Именно поэтому функции принимают req.
 */

const DEFAULT_HOST = 'me.loveapp.chat';

/** Хост, на котором живут публичные страницы. Сравнивается с req.hostname. */
function profileHost() {
  return String(process.env.PROFILE_PAGE_HOST || DEFAULT_HOST).trim().toLowerCase();
}

/**
 * Origin для ссылок.
 *
 * В production он фиксированный: ссылку кладут в био на других сайтах, и она
 * обязана быть одинаковой независимо от того, какой запрос её сгенерировал.
 * В разработке — origin текущего запроса, иначе кнопка «открыть страницу»
 * вела бы на живой домен вместо локального сервера.
 */
function profileOrigin(req) {
  const configured = String(process.env.PROFILE_PAGE_ORIGIN || '').trim().replace(/\/+$/, '');
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') return `https://${profileHost()}`;

  if (req) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers.host;
    if (host) return `${String(proto).split(',')[0].trim()}://${host}`;
  }
  return `https://${profileHost()}`;
}

/** Запрос пришёл на публичный хост страниц профиля? */
function isProfileHost(req) {
  return String(req.hostname || '').toLowerCase() === profileHost();
}

/**
 * Длинный адрес — работает на любом тарифе.
 * /u/ вместо корня специально: корневые односегментные пути — дефицитный
 * ресурс (они же конфликтуют с /build, /og и всем будущим), поэтому короткая
 * форма продаётся, а бесплатная всегда есть и всегда работает.
 */
function longUrl(username, req) {
  return `${profileOrigin(req)}/u/${encodeURIComponent(username)}`;
}

/**
 * Короткий адрес — Pro и выше. Локально (npm start) он тоже работает:
 * routes/profilePublic.js в режиме разработки узнаёт /ник по существующей
 * опубликованной странице и пропускает всё остальное к приложению.
 */
function shortUrl(username, req) {
  return `${profileOrigin(req)}/${encodeURIComponent(username)}`;
}

/** Адрес, который показываем владельцу как «его ссылку». */
function publicUrl(username, tier, req) {
  return tier === 'free' ? longUrl(username, req) : shortUrl(username, req);
}

function builderUrl(req) {
  return `${profileOrigin(req)}/build`;
}

/**
 * Origin, на котором лежат наши загруженные файлы.
 *
 * Отдельно от profileOrigin намеренно. Файл, загруженный из редактора на
 * me.loveapp.chat, обязан получить адрес api.loveapp.chat: публичный хост
 * отдаёт только страницы (см. middleware/profileHost) и /uploads с него не
 * раздаются, а список разрешённых медиа-хостов в profileMedia знает про
 * api.loveapp.chat. Собери мы адрес из хоста запроса — сохранённая ссылка
 * указывала бы в никуда и не прошла бы собственную же проверку.
 */
function mediaOrigin(req) {
  const configured = String(process.env.API_ORIGIN || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  if (process.env.NODE_ENV === 'production') return 'https://api.loveapp.chat';

  if (req) {
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers.host;
    if (host) return `${String(proto).split(',')[0].trim()}://${host}`;
  }
  return 'https://api.loveapp.chat';
}

module.exports = {
  profileHost,
  profileOrigin,
  isProfileHost,
  longUrl,
  shortUrl,
  publicUrl,
  builderUrl,
  mediaOrigin
};
