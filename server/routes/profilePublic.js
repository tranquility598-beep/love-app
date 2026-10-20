/**
 * Публичные страницы профиля: me.loveapp.chat/u/sasha и me.loveapp.chat/sasha.
 *
 * ЭТО РОУТЕР-МИДДЛВАРА, А НЕ ОБЫЧНЫЙ РОУТЕР. Он подключается в корень
 * приложения, потому что пути здесь корневые (/u/..., /build, /:username).
 * Первым же делом он проверяет хост и, если запрос пришёл не на публичный
 * поддомен, немедленно выходит через next('router') — иначе `/:username`
 * перехватил бы половину адресов на api.loveapp.chat и сломал веб-клиент.
 *
 * ПОЧЕМУ ЗАМЫКАЮЩИЙ 404 ВНУТРИ РОУТЕРА. На публичном хосте ни один запрос не
 * должен доходить до express.static(client) и до SPA-фолбэка: клиент Love
 * хранит токен аккаунта в localStorage, а на этом хосте рендерится оформление,
 * которое придумали пользователи. Один origin для того и другого — способ
 * потерять аккаунты. middleware/profileHost делает то же самое белым списком;
 * здесь второй слой, и он надёжнее, потому что не требует пополнять список при
 * появлении новых роутов в проекте.
 *
 * РАЗРАБОТКА. На npm start никакого поддомена нет: сервер один, хост
 * localhost:5555. Поэтому вне production роутер работает в урезанном режиме —
 * отдаёт только /u/..., /build и /og/..., то есть пути, которые ни с чем в
 * клиенте не пересекаются. Короткая ссылка /:username в этом режиме
 * НЕ обслуживается специально: иначе на локальной машине она проглотила бы
 * маршруты веб-клиента. Хочется полного поведения локально — поставьте
 * PROFILE_PAGE_HOST=localhost.
 *
 * SSR ОБЯЗАТЕЛЕН. Telegram, VK, Discord и поисковики читают OpenGraph, не
 * исполняя JS. Собранная в браузере страница выглядела бы в превью пустой, а
 * превью здесь — основной способ распространения ссылки.
 */

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const User = require('../models/User');
const ProfilePage = require('../models/ProfilePage');
const { profilePageLimiter } = require('../middleware/rateLimiter');
const { featureFlags } = require('../config/featureFlags');
const { resolveTier, hasFeature } = require('../config/profileTiers');
const { isProfileHost, profileOrigin, longUrl, shortUrl } = require('../utils/profilePageUrls');
const { allowedHosts } = require('../utils/profileMedia');
const { buildView } = require('../utils/profilePageView');
const { renderPage, renderNotice } = require('../utils/profilePageHtml');
const { isOwnerVisit } = require('../utils/profileViews');

const router = express.Router();

const SITE_URL = (process.env.SITE_URL || 'https://loveapp.chat').replace(/\/+$/, '');
const PRODUCTION = process.env.NODE_ENV === 'production';

const ASSETS_DIR = path.join(__dirname, '..', 'assets');
const OG_DEFAULT_FILE = path.join(ASSETS_DIR, 'og-default.png');
const FAVICON_FILE = path.join(ASSETS_DIR, 'favicon.png');

// Статические модули редактора приезжают вместе с сервером, без отдельной сборки.
const BUILDER_DIR = path.join(__dirname, '..', '..', 'profile-page', 'build');
const BUILDER_INDEX = path.join(BUILDER_DIR, 'index.html');

// В режиме разработки роутер отзывается только на эти префиксы…
const DEV_PREFIXES = ['/u/', '/build', '/og/'];

// …и на короткую ссылку /ник, если у такого человека есть опубликованная
// страница (см. devShortLink ниже). Раньше локально /ник не обслуживался,
// и редактор показывал ссылку, которая открывала пустоту.
const DEV_SHORT_RE = /^\/([a-zA-Z0-9_а-яА-ЯёЁ]{2,32})\/?$/;
// Адреса самого сервера и приложения — ником их не перехватываем, даже если
// кто-то зарегистрировался с таким ником.
const DEV_SERVER_SEGMENTS = new Set([
  'admin', 'support', 'tos', 'privacy', 'invite', 'uploads', 'health',
  'api', 'auth', 'login', 'register', 'download', 'downloads', 'socket'
]);

/**
 * Односегментные пути, которые ником быть не могут. Список нужен, чтобы
 * /build и /robots.txt не искались в базе как ники: совпадения не будет, но
 * лишний запрос к базе на каждый такой адрес — плохая привычка, а главное —
 * при добавлении нового служебного пути легко забыть, что он конкурирует с
 * короткими ссылками. Те же слова зарезервированы в middleware/validation,
 * поэтому занять их ником нельзя.
 */
const RESERVED_SEGMENTS = new Set([
  'u', 'build', 'og', 'api', 'health', 'assets', 'static',
  'favicon.ico', 'favicon.png', 'robots.txt', 'sitemap.xml', 'manifest.json'
]);

// ---------------------------------------------------------------------------
// Хост и режим
// ---------------------------------------------------------------------------

async function devShortLink(req) {
  if (PRODUCTION || (req.method !== 'GET' && req.method !== 'HEAD')) return false;
  const match = DEV_SHORT_RE.exec(req.path);
  if (!match) return false;
  const segment = match[1].toLowerCase();
  if (RESERVED_SEGMENTS.has(segment) || DEV_SERVER_SEGMENTS.has(segment)) return false;
  const user = await User.findOne({ username: match[1] })
    .collation({ locale: 'en', strength: 2 })
    .select('_id')
    .lean();
  if (!user) return false;
  return Boolean(await ProfilePage.exists({ user: user._id, enabled: true }));
}

router.use((req, res, next) => {
  if (isProfileHost(req)) {
    req.pfMode = 'host';
    return next();
  }
  if (!PRODUCTION && DEV_PREFIXES.some(prefix => req.path.startsWith(prefix))) {
    req.pfMode = 'dev';
    return next();
  }
  devShortLink(req).then((ours) => {
    if (ours) {
      req.pfMode = 'dev';
      return next();
    }
    // Не наш хост — выходим из роутера целиком, а не из текущего обработчика.
    return next('router');
  }, next);
});

// API редактора и жалоб подключается отдельно, в общей секции /api: там свои
// лимитеры и своя авторизация. Пропускаем такие запросы дальше, иначе их
// перехватил бы замыкающий 404 в конце этого файла.
router.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next('router');
  return next();
});

// ---------------------------------------------------------------------------
// Заголовки безопасности
// ---------------------------------------------------------------------------

/**
 * Источники медиа для CSP. Собираются из того же списка, что проверяет URL при
 * сохранении (utils/profileMedia.allowedHosts) — политика браузера и проверка
 * обязаны совпадать. Разъедутся — либо картинка не покажется, либо CSP
 * разрешит больше, чем прошло проверку.
 */
function mediaSources() {
  const sources = ["'self'"];
  for (const host of allowedHosts()) {
    if (host === 'localhost' || host === '127.0.0.1') {
      sources.push(`http://${host}:*`, `https://${host}:*`);
    } else {
      sources.push(`https://${host}`);
    }
  }
  return sources.join(' ');
}

/**
 * CSP публичной страницы.
 *
 * Глобальный helmet в index.js разрешает 'unsafe-inline' для скриптов и два
 * внешних CDN — это разумно для веб-клиента, который писали мы, и совершенно
 * не годится для страницы, оформление которой задаёт пользователь. Поэтому
 * заголовок здесь перезаписывается целиком и жёстко: default-src 'none',
 * скрипты и стили только по nonce, ни одного внешнего домена кроме наших
 * медиа-хостов.
 */
function pageCsp(nonce) {
  const media = mediaSources();
  return [
    "default-src 'none'",
    `script-src 'nonce-${nonce}'`,
    `style-src 'nonce-${nonce}'`,
    `img-src ${media} data:`,
    `media-src ${media}`,
    "font-src 'self'",
    // connect-src нужен только для отправки жалобы на страницу.
    "connect-src 'self'",
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
    "manifest-src 'none'",
    "frame-ancestors 'none'"
  ].join('; ');
}

router.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.pfNonce = nonce;

  res.setHeader('Content-Security-Policy', pageCsp(nonce));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // X-Frame-Options дублирует frame-ancestors для старых браузеров: страницу
  // не должны показывать в чужом iframe с подменённым окружением.
  res.setHeader('X-Frame-Options', 'DENY');
  // Оформление пользователя не должно даже просить камеру или геолокацию.
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), midi=()');
  next();
});

// ---------------------------------------------------------------------------
// Служебные ответы
// ---------------------------------------------------------------------------

function notice(req, res, { status, title, heading, text }) {
  res.status(status)
    .type('text/html; charset=utf-8')
    .setHeader('Cache-Control', 'no-store');
  return res.send(renderNotice({
    nonce: res.locals.pfNonce,
    title,
    heading,
    text,
    siteUrl: SITE_URL
  }));
}

/**
 * Фича-флаг проверяется ЗДЕСЬ, а не в app.use при подключении роутера.
 *
 * Это не стилистика. Роутер подключён в корень без пути, поэтому
 * app.use(requireFeature('profilePagesV1'), router) с выключенным флагом отдал
 * бы 404 на КАЖДЫЙ запрос ко всему серверу. Проверка обязана стоять после
 * определения хоста — тогда выключенная фича гасит только публичный поддомен.
 *
 * И обязательно ПОСЛЕ выдачи nonce: заглушка тоже отдаёт inline-стиль, без
 * nonce его заблокирует CSP, и человек увидит текст без оформления.
 *
 * Ответ — обычная страница, а не JSON: сюда приходят люди по ссылке, а не
 * клиент по API.
 */
router.use((req, res, next) => {
  if (featureFlags.profilePagesV1) return next();
  return notice(req, res, {
    status: 404,
    title: 'Страница не найдена — Love',
    heading: 'Здесь пока ничего нет',
    text: 'Личные страницы Love ещё не открыты.'
  });
});

/**
 * Один и тот же ответ на «страницы нет», «страница выключена» и «скрыта
 * модерацией». Разные тексты превратили бы публичный хост в инструмент
 * проверки ников: перебрал список — узнал, кто зарегистрирован в Love.
 */
function pageMissing(req, res) {
  return notice(req, res, {
    status: 404,
    title: 'Страница не найдена — Love',
    heading: 'Здесь пока ничего нет',
    text: 'Такой страницы нет или её выключил владелец.'
  });
}

// ---------------------------------------------------------------------------
// robots.txt, иконка, картинка превью
// ---------------------------------------------------------------------------

router.get('/robots.txt', (req, res) => {
  // Страницы индексировать можно и нужно — их включают, чтобы их находили.
  // Редактор и API в индексе не нужны никому.
  res.type('text/plain; charset=utf-8').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /build',
    'Disallow: /api/',
    ''
  ].join('\n'));
});

router.get('/favicon.ico', (req, res) => {
  // PNG под именем .ico — браузеры это принимают, а отдельный .ico ради
  // 32×32 сердца собирать незачем.
  if (!fs.existsSync(FAVICON_FILE)) return res.status(204).end();
  res.type('image/png').setHeader('Cache-Control', 'public, max-age=604800');
  return res.sendFile(FAVICON_FILE);
});

/**
 * Фирменная карточка превью для страниц без своей картинки.
 *
 * Это статичный файл, а не рисование на запрос. Причина прозаичная: canvas
 * стоит в корневом package.json (зависимость Electron-клиента), сервер
 * разворачивается из server/package.json командой npm ci --ignore-scripts, и
 * нативный модуль там не собрать. Персональные карточки будет рисовать
 * редактор в браузере и загружать как обычную картинку страницы.
 * См. server/assets/og-default.build.js.
 */
router.get('/og/default.png', (req, res) => {
  if (!fs.existsSync(OG_DEFAULT_FILE)) return res.status(404).type('text/plain; charset=utf-8').send('Нет картинки');
  res.type('image/png').setHeader('Cache-Control', 'public, max-age=604800');
  return res.sendFile(OG_DEFAULT_FILE);
});

router.get('/og/:file', (req, res) => {
  return res.status(404).type('text/plain; charset=utf-8').send('Нет картинки');
});

// ---------------------------------------------------------------------------
// Редактор
// ---------------------------------------------------------------------------

/**
 * У редактора своя CSP: это наше приложение, ему нужны свои скрипты, стили и
 * запросы к API. Она всё равно строже глобальной — никаких внешних доменов и
 * никакого 'unsafe-eval'.
 */
function builderCsp() {
  const media = mediaSources();
  return [
    "default-src 'self'",
    "script-src 'self'",
    // Редактор показывает живое превью и меняет цвета через style-атрибуты.
    "style-src 'self' 'unsafe-inline'",
    `img-src ${media} data: blob:`,
    `media-src ${media} blob:`,
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
}

router.use('/build', (req, res, next) => {
  res.setHeader('Content-Security-Policy', builderCsp());
  next();
});

// redirect: false обязателен. По умолчанию express.static на запрос каталога
// отвечает 301 на адрес со слэшем — и как только каталог появился, ссылка
// /build (именно её выдаёт приложение) стала отвечать редиректом, который
// браузер запоминает навсегда. Пусть оба адреса отдаёт наш обработчик ниже.
router.use('/build', express.static(BUILDER_DIR, { index: false, dotfiles: 'deny', redirect: false }));

router.get(/^\/build(?:\/.*)?$/, (req, res) => {
  // Отсутствующий модуль не должен превращаться в HTML экрана входа.
  if (path.extname(req.path)) {
    return res.status(404).type('text/plain').send('Editor asset not found');
  }
  if (fs.existsSync(BUILDER_INDEX)) {
    res.setHeader('Cache-Control', 'no-store');
    return res.sendFile(BUILDER_INDEX);
  }
  return notice(req, res, {
    status: 503,
    title: 'Редактор страницы — Love',
    heading: 'Редактор ещё не собран',
    text: 'Панель настройки страницы появится здесь. Пока настройки меняются через приложение.'
  });
});

// ---------------------------------------------------------------------------
// Учёт просмотров
// ---------------------------------------------------------------------------

const BOT_UA = /bot|crawler|spider|crawl|slurp|facebookexternalhit|telegram|vkshare|vkontakte|discord|twitter|slack|whatsapp|viber|skype|linkedin|embedly|quora|pinterest|redditbot|preview|monitor|pingdom|uptime|lighthouse|headless|curl|wget|python-requests|okhttp|go-http-client/i;

/**
 * Дедупликация просмотров: один человек за сутки считается один раз.
 *
 * Решающая отметка лежит в базе (models/ProfileViewMark, уникальный индекс и
 * TTL): её не сбрасывают ни перезапуск, ни второй процесс PM2. Раньше память
 * процесса была единственной защитой, и владелец видел у себя десяток
 * просмотров за день от самого себя — по одному на каждый рестарт.
 * Память ниже осталась дешёвым первым фильтром: обновления страницы подряд
 * не ходят в базу вовсе.
 */
const VIEW_MEMO = new Map();
const VIEW_MEMO_TTL_MS = 20 * 60 * 60 * 1000;
const VIEW_MEMO_MAX = 20000;

function viewerKey(req, username, day) {
  const salt = process.env.IP_HASH_SALT || 'love-profile-views';
  const ip = req.ip || req.connection?.remoteAddress || '';
  const ua = String(req.headers['user-agent'] || '').slice(0, 200);
  return crypto.createHash('sha256').update(`${salt}|${ip}|${ua}|${username}|${day}`).digest('hex').slice(0, 32);
}

function alreadyCounted(key) {
  const now = Date.now();
  const seen = VIEW_MEMO.get(key);
  if (seen && now - seen < VIEW_MEMO_TTL_MS) return true;

  if (VIEW_MEMO.size >= VIEW_MEMO_MAX) {
    // Чистим просроченное, а если и это не помогло — выкидываем самые старые.
    for (const [entryKey, at] of VIEW_MEMO) {
      if (now - at >= VIEW_MEMO_TTL_MS) VIEW_MEMO.delete(entryKey);
    }
    let toDrop = VIEW_MEMO.size - Math.floor(VIEW_MEMO_MAX * 0.8);
    if (toDrop > 0) {
      for (const entryKey of VIEW_MEMO.keys()) {
        VIEW_MEMO.delete(entryKey);
        if (--toDrop <= 0) break;
      }
    }
  }

  VIEW_MEMO.set(key, now);
  return false;
}

/**
 * Просмотр считается в фоне и намеренно не влияет на ответ: страница уже
 * отрисована, и упавшая запись счётчика не повод показать человеку ошибку.
 */
function countView(req, page, username) {
  const ua = String(req.headers['user-agent'] || '');
  // Краулеры соцсетей ходят за превью по нескольку раз на одну отправленную
  // ссылку. Считать их — значит показать владельцу выдуманные цифры.
  if (!ua || BOT_UA.test(ua)) return;

  // Владелец, открывавший редактор в этом браузере, сам себе не просмотр.
  if (isOwnerVisit(req, page._id)) return;

  const day = new Date().toISOString().slice(0, 10);
  const key = viewerKey(req, username, day);
  if (alreadyCounted(key)) return;

  Promise.resolve()
    .then(() => page.recordView(day, key))
    .catch(error => {
      console.error('[profile-page] не смог записать просмотр:', error.message);
    });
}

// ---------------------------------------------------------------------------
// Сама страница
// ---------------------------------------------------------------------------

/**
 * Картинка превью. Порядок: своя (Premium) → аватар владельца → фирменная
 * карточка. Форма важна: аватар квадратный, и объявлять его как 1200×630
 * нельзя — соцсети обрежут его по бокам.
 */
function ogFor(view, req) {
  if (view.ogImage) return { url: view.ogImage, wide: true };
  if (view.avatar) return { url: view.avatar, wide: false };
  return { url: `${profileOrigin(req)}/og/default.png`, wide: true };
}

async function servePage(req, res, { short }) {
  const username = String(req.params.username || '').trim();
  if (!username || username.length > 32) return pageMissing(req, res);

  // Ник ищем без учёта регистра — тем же способом, каким он проверяется на
  // уникальность (индекс username_unique_ci в models/User).
  const user = await User.findOne({ username })
    .collation({ locale: 'en', strength: 2 })
    .select('username nickname avatar createdAt customStatus mood listening hobbies plan planExpiresAt isBanned')
    .lean();

  if (!user || user.isBanned) return pageMissing(req, res);

  const page = await ProfilePage.findOne({ user: user._id })
    .populate({ path: 'pair.partner', select: 'username nickname avatar' })
    .populate({ path: 'closeFriends', select: 'username nickname avatar' });

  if (!page || !page.enabled) return pageMissing(req, res);
  if (page.moderation?.status === 'hidden') return pageMissing(req, res);

  // Тариф считается ЗДЕСЬ, на каждом показе. Настройки при окончании подписки
  // не стираются, поэтому единственное место, где решается, что реально
  // показать, — момент рендера.
  const tier = resolveTier(user);

  // Короткая ссылка — возможность Pro и выше. Если подписка кончилась, ссылку
  // не убиваем, а переводим на длинную: она уже разошлась по чужим профилям и
  // мессенджерам, и мёртвая ссылка ударила бы по посетителям, а не по
  // владельцу.
  if (short && !hasFeature(tier, 'shortLink')) {
    return res.redirect(302, longUrl(user.username, req));
  }

  const view = buildView(page, user, tier);
  const og = ogFor(view, req);

  // Короткая ссылка теперь работает и локально (devShortLink), поэтому
  // canonical короткий везде, где тариф её даёт.
  const canonical = hasFeature(tier, 'shortLink')
    ? shortUrl(user.username, req)
    : longUrl(user.username, req);

  const html = renderPage(view, {
    nonce: res.locals.pfNonce,
    canonical,
    ogImageUrl: og.url,
    ogImageWide: og.wide,
    siteUrl: SITE_URL,
    // Страницу под вопросом у модерации из индекса убираем, но людям по
    // прямой ссылке показываем: жалоба ещё не приговор.
    noindex: page.moderation?.status === 'flagged'
  });

  countView(req, page, user.username);

  res.type('text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  return res.send(html);
}

// Длинная ссылка — работает на любом тарифе. Лимит стоит только здесь и на
// короткой ссылке: это единственные два роута, которые ходят в базу.
router.get('/u/:username', profilePageLimiter, (req, res, next) => {
  servePage(req, res, { short: false }).catch(next);
});

// Корень публичного хоста: короткое объяснение, что это за адрес.
router.get('/', (req, res) => {
  return notice(req, res, {
    status: 200,
    title: 'Страницы Love',
    heading: 'Это страницы профилей Love',
    text: 'Здесь живут личные страницы: ссылки, оформление и музыка на одном адресе. Своя появляется в приложении Love.'
  });
});

/**
 * Короткая ссылка. Идёт последней среди GET намеренно: любой односегментный
 * путь подходит под её шаблон, поэтому все служебные адреса обязаны быть
 * объявлены выше.
 */
router.get('/:username', profilePageLimiter, (req, res, next) => {
  const segment = String(req.params.username || '').toLowerCase();
  if (RESERVED_SEGMENTS.has(segment)) return next();
  servePage(req, res, { short: true }).catch(next);
});

// ---------------------------------------------------------------------------
// Замыкающий 404 и ошибки
// ---------------------------------------------------------------------------

/**
 * Дальше этого файла на публичном хосте не проходит ничего. Именно поэтому
 * express.static(client) и SPA-фолбэк из index.js здесь недосягаемы — и
 * веб-клиент Love физически нельзя открыть на me.loveapp.chat.
 *
 * В режиме разработки замыкать нельзя: там роутер живёт на общем хосте с
 * клиентом, и 404 на всё подряд сломал бы приложение.
 */
router.use((req, res, next) => {
  if (req.pfMode !== 'host') return next();
  return pageMissing(req, res);
});

/**
 * Свой обработчик ошибок — не дублирование общего, а необходимость.
 *
 * Обработчик по умолчанию в Express вне production вкладывает в ответ
 * стектрейс, а публичная страница открывается кем угодно: путь к файлам
 * сервера и имена модулей чужим глазам не нужны. Плюс тут отдаётся нормальная
 * страница вместо голого текста — человек пришёл по ссылке из чата и не должен
 * видеть внутренности.
 *
 * Отдельный случай — недоступная база (типичный симптом: MongooseError
 * buffering timed out). 503 честнее 404: страница есть, просто сейчас её
 * нечем собрать, и поисковик не должен выкинуть её из индекса.
 */
router.use((error, req, res, next) => {
  console.error('[profile-page] ошибка при отдаче страницы:', error && error.message);
  if (res.headersSent) return next(error);

  const dbDown = /buffering timed out|ECONNREFUSED|topology|MongoNetworkError|not connected/i
    .test(String(error && error.message));

  return notice(req, res, {
    status: dbDown ? 503 : 500,
    title: 'Страница недоступна — Love',
    heading: dbDown ? 'Страница сейчас не открывается' : 'Что-то пошло не так',
    text: dbDown
      ? 'Мы не смогли получить данные страницы. Попробуйте обновить через минуту.'
      : 'Мы уже знаем о сбое. Попробуйте обновить страницу.'
  });
});

module.exports = router;
