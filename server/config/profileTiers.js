/**
 * Публичные страницы профиля: тарифы, темы, лимиты.
 *
 * Это ЕДИНСТВЕННЫЙ источник правды о том, что доступно на каком тарифе.
 * Из него читает и серверная валидация (routes/profilePages.js), и редактор
 * (profile-page/build) — он забирает матрицу с GET /api/profile-page/capabilities
 * и по ней рисует замочки. Дублировать список в JS клиента нельзя: разъедется
 * при первом же изменении цен, и пользователь увидит «доступно», а сервер
 * ответит 403.
 *
 * Порядок тарифов важен: gate() сравнивает ранги, а не строки.
 */

const { iconSvg } = require('../utils/profileIcons');

// duo — это premium на двоих (см. лендинг подписок), поэтому по возможностям
// он равен premium. Отдельного набора фич у него нет и быть не должно:
// иначе пара, оплатившая Duo, увидит «у меня не как у Premium» и это будет
// выглядеть как обман, хотя платят они больше.
const PLAN_TO_TIER = Object.freeze({
  free: 'free',
  pro: 'pro',
  premium: 'premium',
  duo: 'premium'
});

const TIER_RANK = Object.freeze({ free: 0, pro: 1, premium: 2 });

const PLANS = Object.freeze(Object.keys(PLAN_TO_TIER));

/**
 * Тариф пользователя с учётом срока действия.
 * Просроченная подписка — это free: проверять дату надо здесь, а не в роутах,
 * иначе где-нибудь забудут и платные фичи останутся навсегда.
 */
function resolveTier(user) {
  if (!user) return 'free';
  const plan = String(user.plan || 'free').toLowerCase();
  const tier = PLAN_TO_TIER[plan] || 'free';
  if (tier === 'free') return 'free';

  const expiresAt = user.planExpiresAt ? new Date(user.planExpiresAt) : null;
  // null = бессрочно (выдано вручную через админку). Так удобнее для тестов
  // и для команды: не надо каждый месяц продлевать себе доступ.
  if (expiresAt && Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() <= Date.now()) {
    return 'free';
  }
  return tier;
}

function tierAtLeast(tier, required) {
  return (TIER_RANK[tier] ?? 0) >= (TIER_RANK[required] ?? 0);
}

/**
 * Возможности по тарифам.
 *
 * Значение — минимальный тариф, на котором фича включается.
 * Всё, чего здесь нет, доступно всем (например сама страница, аватар, ник,
 * кнопка «Написать в Love» — это воронка, её резать нельзя).
 */
//
// Бесплатная страница должна выглядеть законченной, а не урезанной: её
// разносят по чужим профилям, и по ней судят о Love. Поэтому статичное
// оформление (темы, свой цвет, картинка фоном, порядок и вид блоков) открыто
// всем, а платным остаётся то, что двигается, звучит или бросается в глаза
// сильнее обычного: градиенты, анимация, музыка, видео, эффекты.
const FEATURE_MIN_TIER = Object.freeze({
  customAccent: 'free',      // свой цвет акцента (один)
  backgroundImage: 'free',   // своя картинка фоном
  badges: 'free',            // стаж; значок подписки появляется только у платных
  statusBlock: 'free',       // mood / customStatus / listening / hobbies на странице
  viewCount: 'free',         // сколько всего открывали страницу
  layoutCard: 'free',
  hearts: 'free',            // сердечко со счётчиком для посетителей
  bgPattern: 'free',         // узор поверх фона: точки, сетка, клетка, волны
  themeAuto: 'free',         // вторая тема под светлую/тёмную систему гостя

  shortLink: 'pro',          // me.loveapp.chat/sasha вместо /u/sasha
  accentGradient: 'pro',     // второй цвет акцента — градиент кнопок и рамок
  animatedAvatar: 'pro',     // gif/webp аватар живым, а не первым кадром
  animatedBanner: 'pro',
  animatedBackground: 'pro', // гифка фоном
  hideFooter: 'pro',         // убрать «Сделано в Love»
  viewStats: 'pro',          // график просмотров по дням
  linkStats: 'pro',          // сколько раз нажимали каждую ссылку
  enterOverlay: 'pro',       // экран «нажми, чтобы войти» как первый кадр
  fontChoice: 'pro',
  nameGradient: 'pro',       // имя, залитое градиентом акцента
  gallery: 'pro',            // до шести картинок на странице
  customCursor: 'pro',
  effectColors: 'pro',       // свои цвета частиц и свечения эффектов
  animatedGradient: 'pro',   // переливающийся градиент фона
  themeByTime: 'pro',        // днём одна тема, ночью другая и звёзды
  avatarTilt: 'pro',         // аватар наклоняется за курсором и телефоном
  pageSounds: 'pro',         // тихий отклик при наведении и нажатии
  analytics: 'pro',          // откуда пришли, когда заходят, нажали ли «Написать»

  music: 'premium',          // трек на странице (играет после жеста на экране входа)
  effects: 'premium',        // атмосферные эффекты страницы
  videoBackground: 'premium',
  avatarFrame: 'premium',
  nameEffects: 'premium',    // печатная машинка, свечение, блик на имени
  customTheme: 'premium',    // свой набор цветов вместо готовой темы
  liveBackground: 'premium', // живой фон: жидкий металл, дымка, шум
  linkMotion: 'premium',     // бегущая или дышащая обводка ссылок
  trailStyle: 'premium',     // свой цвет, толщина и длина шлейфа курсора
  playlist: 'premium',       // несколько треков вместо одного
  customFont: 'premium',     // загрузить свой файл шрифта
  stylePresets: 'premium',   // свои наборы оформления и «взять стиль» у другой страницы
  pairBlock: 'premium',      // «вместе с @dasha — 128 дней»
  closeFriends: 'premium',   // трое «Близких» с рамками
  customOgImage: 'premium',  // своя картинка превью ссылки
  layoutCinema: 'premium',
  customLayout: 'premium'    // своя расстановка блоков поверх любой раскладки
});

/**
 * Числовые лимиты. Наследование сверху вниз не делаю намеренно:
 * явная таблица читается за секунду, а «pro наследует free кроме…» — нет.
 */
const LIMITS = Object.freeze({
  free: Object.freeze({
    bioMaxLength: 300,
    links: 6,
    effectsAtOnce: 2,
    viewStatsDays: 0,
    assetBytes: 2 * 1024 * 1024
  }),
  pro: Object.freeze({
    bioMaxLength: 600,
    links: 12,
    effectsAtOnce: 2,
    viewStatsDays: 7,
    assetBytes: 5 * 1024 * 1024
  }),
  premium: Object.freeze({
    bioMaxLength: 1200,
    links: 20,
    effectsAtOnce: 3,
    viewStatsDays: 30,
    assetBytes: 10 * 1024 * 1024
  })
});

/**
 * Темы. tokens — то, что уезжает в CSS-переменные страницы.
 *
 * Своего CSS у пользователя нет и не будет: только выбор темы, свой акцент и
 * закрытый набор деталей (STYLE_OPTIONS ниже). Это осознанное ограничение — именно из-за полной свободы
 * девять страниц из десяти на guns.lol выглядят как помойка. Ограничив набор,
 * мы гарантируем, что любая страница Love выглядит нормально, а это и есть
 * причина, по которой ссылку захотят поставить в био.
 */
const THEMES = Object.freeze([
  {
    id: 'midnight', name: 'Monochrome', tier: 'free',
    tokens: { bg: '#090909', bg2: '#141414', surface: 'rgba(255,255,255,0.045)', text: '#f2f2f2', muted: '#a0a0a0', accent: '#e7e7e7', accentText: '#111111', border: 'rgba(255,255,255,0.11)' }
  },
  {
    id: 'porcelain', name: 'Porcelain', tier: 'free',
    tokens: { bg: '#f7f6f3', bg2: '#ffffff', surface: 'rgba(0,0,0,0.035)', text: '#16161a', muted: '#6d6d78', accent: '#1f6feb', accentText: '#ffffff', border: 'rgba(0,0,0,0.09)' }
  },
  {
    id: 'rose', name: 'Rose', tier: 'free',
    tokens: { bg: '#1a0f14', bg2: '#2a1620', surface: 'rgba(255,255,255,0.055)', text: '#fdf2f6', muted: '#c9a3b2', accent: '#ff5c8a', accentText: '#ffffff', border: 'rgba(255,255,255,0.1)' }
  },
  {
    id: 'carbon', name: 'Carbon', tier: 'free',
    tokens: { bg: '#08090a', bg2: '#111315', surface: 'rgba(255,255,255,0.045)', text: '#eceff1', muted: '#8b9298', accent: '#d9dee3', accentText: '#0b0c0d', border: 'rgba(255,255,255,0.08)' }
  },
  {
    id: 'sunset', name: 'Sunset', tier: 'free',
    tokens: { bg: '#1b1014', bg2: '#3a1d1c', surface: 'rgba(255,255,255,0.06)', text: '#fff4ec', muted: '#d0a493', accent: '#ff8a3d', accentText: '#1b1014', border: 'rgba(255,255,255,0.1)' }
  },
  {
    id: 'mint', name: 'Mint', tier: 'free',
    tokens: { bg: '#08150f', bg2: '#0f2419', surface: 'rgba(255,255,255,0.05)', text: '#eafff3', muted: '#8fbfa6', accent: '#2fd98a', accentText: '#062012', border: 'rgba(255,255,255,0.09)' }
  },
  {
    id: 'ultraviolet', name: 'Ultraviolet', tier: 'free',
    tokens: { bg: '#0d0820', bg2: '#1c1040', surface: 'rgba(255,255,255,0.06)', text: '#f1ecff', muted: '#a396c9', accent: '#a855f7', accentText: '#ffffff', border: 'rgba(255,255,255,0.11)' }
  },
  {
    id: 'paper', name: 'Paper', tier: 'free',
    tokens: { bg: '#efe9dd', bg2: '#fbf7f0', surface: 'rgba(0,0,0,0.04)', text: '#221d16', muted: '#6b6154', accent: '#8a5a2b', accentText: '#ffffff', border: 'rgba(0,0,0,0.1)' }
  },
  {
    id: 'liquid', name: 'Liquid', tier: 'premium', animated: true,
    tokens: { bg: '#0a0a14', bg2: '#1a1236', surface: 'rgba(255,255,255,0.07)', text: '#f5f3ff', muted: '#a8a2c8', accent: '#6ee7ff', accentText: '#06121a', border: 'rgba(255,255,255,0.12)' }
  },
  {
    id: 'starfield', name: 'Starfield', tier: 'premium', animated: true,
    tokens: { bg: '#04050c', bg2: '#0a0f22', surface: 'rgba(255,255,255,0.05)', text: '#eef2ff', muted: '#8f9bc4', accent: '#c7d2fe', accentText: '#0a0f22', border: 'rgba(255,255,255,0.09)' }
  },
  {
    id: 'velvet', name: 'Velvet', tier: 'premium', animated: true,
    tokens: { bg: '#12060f', bg2: '#2d0a24', surface: 'rgba(255,255,255,0.065)', text: '#ffeef9', muted: '#c295b4', accent: '#ff3fa4', accentText: '#ffffff', border: 'rgba(255,255,255,0.11)' }
  },
  {
    id: 'aurora', name: 'Aurora', tier: 'premium', animated: true,
    tokens: { bg: '#03100f', bg2: '#08282c', surface: 'rgba(255,255,255,0.06)', text: '#eafffb', muted: '#8dc0bd', accent: '#3ff0c8', accentText: '#03211d', border: 'rgba(255,255,255,0.1)' }
  },
  // Сезонные. Выбрать можно только в своё окно, и на странице они видны тоже
  // только в нём: после сезона страница показывает Monochrome, а выбор
  // сохраняется до следующего года.
  {
    id: 'halloween', name: 'Хэллоуин', tier: 'free', animated: true, season: { from: '10-15', to: '11-07' },
    tokens: { bg: '#0c0710', bg2: '#2a1236', surface: 'rgba(255,255,255,0.055)', text: '#fbeee2', muted: '#bf9e8c', accent: '#ff7a1a', accentText: '#1a0b02', border: 'rgba(255,255,255,0.1)' }
  },
  {
    id: 'newyear', name: 'Новый год', tier: 'free', animated: true, season: { from: '12-10', to: '01-14' },
    tokens: { bg: '#050a18', bg2: '#0f2148', surface: 'rgba(255,255,255,0.055)', text: '#f3f6ff', muted: '#97a6c8', accent: '#f2c75c', accentText: '#1b1405', border: 'rgba(255,255,255,0.1)' }
  },
  {
    id: 'valentine', name: '14 февраля', tier: 'free', animated: true, season: { from: '02-01', to: '02-21' },
    tokens: { bg: '#16070d', bg2: '#3a0e22', surface: 'rgba(255,255,255,0.06)', text: '#fff0f5', muted: '#d39bb1', accent: '#ff4d88', accentText: '#ffffff', border: 'rgba(255,255,255,0.11)' }
  }
]);

/** Идёт ли сезон темы сейчас. Окно может переходить через Новый год. */
function seasonActive(theme, now = new Date()) {
  if (!theme || !theme.season) return true;
  const key = `${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
  const { from, to } = theme.season;
  return from <= to ? key >= from && key <= to : key >= from || key <= to;
}

const THEME_BY_ID = Object.freeze(
  THEMES.reduce((map, theme) => Object.assign(map, { [theme.id]: theme }), {})
);

const LAYOUTS = Object.freeze([
  { id: 'stack', name: 'Focus', tier: 'free' },
  { id: 'card', name: 'Studio', tier: 'free' },
  // Всё по центру, ссылки одной колонкой — привычная «страница ссылок».
  { id: 'center', name: 'Center', tier: 'free' },
  // Карточка профиля слева закреплена, справа плитки; первая ссылка широкая.
  { id: 'bento', name: 'Bento', tier: 'pro' },
  { id: 'cinema', name: 'Cover', tier: 'premium' },
  // Имя огромным заголовком, ссылки — нумерованным списком с линейками.
  { id: 'magazine', name: 'Magazine', tier: 'premium' }
]);

const FONTS = Object.freeze([
  { id: 'system', name: 'Grotesk', tier: 'free', stack: 'Outfit, "Segoe UI", sans-serif' },
  { id: 'serif', name: 'Editorial', tier: 'free', stack: 'Lora, Georgia, serif' },
  { id: 'mono', name: 'Mono', tier: 'pro', stack: '"Fira Mono", Consolas, monospace' },
  { id: 'rounded', name: 'Soft', tier: 'pro', stack: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { id: 'display', name: 'Portrait', tier: 'pro', stack: '"Cormorant Garamond", Georgia, serif' },
  { id: 'pixel', name: 'Pixel', tier: 'pro', stack: '"Pixelify Sans", "Fira Mono", monospace' },
  { id: 'hand', name: 'Рукопись', tier: 'pro', stack: 'Caveat, "Segoe Print", cursive' },
  { id: 'wide', name: 'Wide', tier: 'pro', stack: 'Unbounded, Outfit, sans-serif' },
  { id: 'arcade', name: 'Arcade', tier: 'pro', stack: '"Russo One", Outfit, sans-serif' },
  // Свой шрифт: файл человека, подключается как "LoveCustom" (см. buildStyles).
  { id: 'custom', name: 'Свой шрифт', tier: 'premium', stack: '"LoveCustom", Outfit, sans-serif' }
]);

const EFFECTS = Object.freeze([
  { id: 'none', name: 'Без эффектов', tier: 'free' },
  { id: 'particles', name: 'Пылинки', tier: 'free' },
  { id: 'trail', name: 'Шлейф курсора', tier: 'premium' },
  { id: 'rain', name: 'Дождь', tier: 'premium' },
  { id: 'glow', name: 'Свет за курсором', tier: 'premium' },
  { id: 'snow', name: 'Снег', tier: 'premium' },
  { id: 'stars', name: 'Звёздная пыль', tier: 'premium' },
  { id: 'comets', name: 'Падающие звёзды', tier: 'premium' },
  { id: 'bokeh', name: 'Мягкие сферы', tier: 'premium' },
  { id: 'aurora', name: 'Северное сияние', tier: 'premium' },
  { id: 'constellation', name: 'Созвездия', tier: 'premium' },
  { id: 'grain', name: 'Плёнка', tier: 'free' },
  { id: 'ripple', name: 'Круги от касаний', tier: 'free' },
  { id: 'hearts', name: 'Сердечки', tier: 'premium' },
  { id: 'sparkles', name: 'Искры', tier: 'premium' },
  { id: 'fireflies', name: 'Светлячки', tier: 'premium' },
  { id: 'petals', name: 'Лепестки', tier: 'premium' },
  { id: 'waves', name: 'Шёлковые волны', tier: 'premium' },
  { id: 'scanlines', name: 'Кинескоп', tier: 'premium' }
]);

const AVATAR_FRAMES = Object.freeze([
  { id: 'none', name: 'Без рамки', tier: 'free' },
  { id: 'ring', name: 'Contour', tier: 'free' },
  { id: 'pulse', name: 'Halo', tier: 'premium' },
  { id: 'orbit', name: 'Orbit', tier: 'premium' },
  { id: 'liquid', name: 'Prism', tier: 'premium' },
  { id: 'corners', name: 'Edge', tier: 'premium' }
]);

/**
 * Блоки содержимого страницы — в порядке по умолчанию.
 *
 * Порядок и видимость выбирает владелец, но только среди этих id: шапка
 * (аватар, имя, кнопка «Написать в Love») стоит на месте всегда, потому что
 * это то, ради чего страницу открывают.
 */
const BLOCKS = Object.freeze([
  { id: 'links', name: 'Ссылки' },
  { id: 'player', name: 'Музыка' },
  { id: 'gallery', name: 'Галерея' },
  { id: 'invite', name: 'Приглашение' },
  { id: 'interests', name: 'Интересы' },
  { id: 'quote', name: 'Цитата' },
  { id: 'countdown', name: 'Таймер' },
  { id: 'pair', name: 'Пара' },
  { id: 'friends', name: 'Близкие' }
]);

const BLOCK_IDS = Object.freeze(BLOCKS.map(block => block.id));

/**
 * Детали оформления: форма ссылок, карточек, аватара, имени.
 *
 * Тот же принцип, что у тем: закрытый набор вариантов вместо своего CSS.
 * Вариант без tier доступен всем.
 */
const freeByDefault = list => Object.freeze(list.map(item => Object.freeze({ tier: 'free', ...item })));

const STYLE_OPTIONS = Object.freeze({
  linkShape: freeByDefault([
    { id: 'rounded', name: 'Скруглённые' },
    { id: 'pill', name: 'Капсулы' },
    { id: 'square', name: 'Строгие' }
  ]),
  linkFill: freeByDefault([
    { id: 'glass', name: 'Стекло' },
    { id: 'solid', name: 'Плотные' },
    { id: 'outline', name: 'Контур' },
    { id: 'accent', name: 'Акцент' }
  ]),
  linkLayout: freeByDefault([
    { id: 'auto', name: 'Как в раскладке' },
    { id: 'grid', name: 'Плиткой' },
    { id: 'list', name: 'Списком' }
  ]),
  cardShadow: freeByDefault([
    { id: 'none', name: 'Без тени' },
    { id: 'soft', name: 'Мягкая' },
    { id: 'deep', name: 'Глубокая' }
  ]),
  avatarShape: freeByDefault([
    { id: 'circle', name: 'Круг' },
    { id: 'squircle', name: 'Мягкий квадрат' },
    { id: 'square', name: 'Квадрат' }
  ]),
  avatarSize: freeByDefault([
    { id: 'sm', name: 'Меньше' },
    { id: 'md', name: 'Обычный' },
    { id: 'lg', name: 'Крупнее' }
  ]),
  nameAlign: freeByDefault([
    { id: 'left', name: 'Слева' },
    { id: 'center', name: 'По центру' }
  ]),
  nameSize: freeByDefault([
    { id: 'sm', name: 'Скромнее' },
    { id: 'md', name: 'Обычное' },
    { id: 'lg', name: 'Крупнее' }
  ]),
  // Цвет имени отдельно от акцента: свой цвет — всем, градиенты — с Pro.
  nameFill: freeByDefault([
    { id: 'theme', name: 'Как у темы' },
    { id: 'solid', name: 'Свой цвет' },
    { id: 'accent', name: 'Градиент акцента', tier: 'pro' },
    { id: 'gradient', name: 'Свой градиент', tier: 'pro' }
  ]),
  nameEffect: freeByDefault([
    { id: 'none', name: 'Без эффекта' },
    { id: 'typewriter', name: 'Печатная машинка', tier: 'premium' },
    { id: 'glow', name: 'Свечение', tier: 'premium' },
    { id: 'shimmer', name: 'Блик', tier: 'premium' }
  ]),
  cursor: freeByDefault([
    { id: 'default', name: 'Обычный' },
    { id: 'dot', name: 'Точка', tier: 'pro' },
    { id: 'ring', name: 'Кольцо', tier: 'pro' },
    { id: 'heart', name: 'Сердце', tier: 'pro' },
    { id: 'spark', name: 'Искра', tier: 'pro' },
    { id: 'cross', name: 'Прицел', tier: 'pro' },
    { id: 'custom', name: 'Своя картинка', tier: 'pro' }
  ]),
  cursorHotspot: freeByDefault([
    { id: 'corner', name: 'Остриё в углу' },
    { id: 'center', name: 'По центру' }
  ]),
  linkMotion: freeByDefault([
    { id: 'none', name: 'Спокойно' },
    { id: 'sweep', name: 'Бегущий блик', tier: 'premium' },
    { id: 'pulse', name: 'Дыхание', tier: 'premium' }
  ]),
  entrance: freeByDefault([
    { id: 'none', name: 'Сразу' },
    { id: 'fade', name: 'Проявление' },
    { id: 'rise', name: 'Подъём' },
    { id: 'stagger', name: 'По очереди' }
  ])
});

/**
 * Значения по умолчанию — ровно тот вид, который страницы имели до появления
 * этих настроек. Рендер дописывает CSS только для отличий, поэтому уже
 * опубликованные страницы не меняются ни на пиксель.
 */
const STYLE_DEFAULTS = Object.freeze({
  linkShape: 'rounded',
  linkFill: 'glass',
  linkLayout: 'auto',
  cardShadow: 'none',
  avatarShape: 'circle',
  avatarSize: 'md',
  nameAlign: 'left',
  nameSize: 'md',
  nameEffect: 'none',
  cursor: 'default',
  entrance: 'none',
  cardAlpha: 64,       // насколько плотные подложки ссылок и блоков, %
  cardRadius: 13,      // скругление подложек, px
  cardBorder: true,
  nameGradient: false, // прежний переключатель «имя градиентом акцента»
  nameFill: 'theme',
  nameAngle: 90,
  linkMotion: 'none',
  cursorHotspot: 'corner',
  avatarTilt: false,
  sounds: false,
  allowCopy: true      // можно ли другим взять оформление этой страницы
});

// Узоры фона и живые фоны — закрытые списки, как темы.
const BG_PATTERNS = freeByDefault([
  { id: 'none', name: 'Без узора' },
  { id: 'dots', name: 'Точки' },
  { id: 'grid', name: 'Сетка' },
  { id: 'checks', name: 'Клетка' },
  { id: 'diagonal', name: 'Штрих' },
  { id: 'waves', name: 'Волны' }
]);

const LIVE_BACKGROUNDS = freeByDefault([
  { id: 'none', name: 'Без живого фона' },
  { id: 'metal', name: 'Жидкий металл', tier: 'premium' },
  { id: 'haze', name: 'Дымка', tier: 'premium' },
  { id: 'noise', name: 'Шум', tier: 'premium' }
]);

// Как страница выбирает между основной и второй темой.
const THEME_MODES = freeByDefault([
  { id: 'fixed', name: 'Всегда основная' },
  { id: 'system', name: 'Как у гостя' },
  { id: 'time', name: 'По времени суток', tier: 'pro' }
]);

const STYLE_RANGES = Object.freeze({
  cardAlpha: Object.freeze([0, 100]),
  cardRadius: Object.freeze([0, 32]),
  nameAngle: Object.freeze([0, 360])
});

// Потолки содержимого блоков. От тарифа не зависят: сама галерея платная,
// а сколько в ней картинок — одинаково для всех, кому она доступна.
const CONTENT_LIMITS = Object.freeze({
  gallery: 6,
  tags: 12,
  tagLength: 24,
  quote: 240,
  quoteAuthor: 60,
  countdownTitle: 60,
  stylePresets: 6,
  presetName: 30,
  gradientColors: 3,
  effectColors: 2,
  playlist: 8,
  versions: 20
});

/**
 * Иконки ссылок. Тарифом не ограничены — набор один для всех, платным делаем
 * количество ссылок, а не выбор картинки.
 *
 * Это закрытый список идентификаторов, а не адреса картинок: сама иконка
 * рисуется на странице нашим SVG. Пустить сюда произвольный URL значило бы
 * разрешить владельцу страницы грузить в браузер посетителя файл с чужого
 * сервера — то есть собирать IP всех, кто открыл страницу.
 */
const LINK_ICONS = Object.freeze([
  'link', 'love', 'telegram', 'discord', 'tiktok', 'instagram', 'youtube',
  'twitch', 'x', 'vk', 'spotify', 'soundcloud', 'github', 'steam', 'reddit',
  'pinterest', 'behance', 'dribbble', 'twitter', 'mail', 'phone', 'globe',
  'shop', 'donate', 'boosty', 'patreon'
]);

const LINK_ICON_SET = new Set(LINK_ICONS);

/**
 * Как иконка называется в редакторе.
 *
 * Бренды пишем как они пишутся сами — «TikTok», а не «Тикток»: человек ищет
 * глазами знакомое написание. Переводим только то, что не бренд, а смысл.
 */
const LINK_ICON_NAMES = Object.freeze({
  link: 'Ссылка',
  love: 'Love',
  telegram: 'Telegram',
  discord: 'Discord',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
  twitch: 'Twitch',
  x: 'X',
  vk: 'ВКонтакте',
  spotify: 'Spotify',
  soundcloud: 'SoundCloud',
  github: 'GitHub',
  steam: 'Steam',
  reddit: 'Reddit',
  pinterest: 'Pinterest',
  behance: 'Behance',
  dribbble: 'Dribbble',
  twitter: 'Twitter',
  mail: 'Почта',
  phone: 'Телефон',
  globe: 'Сайт',
  shop: 'Магазин',
  donate: 'Поддержать',
  boosty: 'Boosty',
  patreon: 'Patreon'
});

/**
 * Готовый набор для редактора — вместе с разметкой иконки.
 *
 * Разметку берём из того же модуля, что рисует публичную страницу: рисовать в
 * редакторе свои картинки означало бы, что человек выбирает одно, а посетитель
 * видит другое. Считаем один раз при старте: набор не меняется.
 */
const LINK_ICON_LIST = Object.freeze(LINK_ICONS.map(id => Object.freeze({
  id,
  name: LINK_ICON_NAMES[id] || id,
  svg: iconSvg(id, { size: 20, className: 'ico' })
})));

/**
 * Разрешено ли значение из справочника на этом тарифе.
 * Возвращает сам элемент справочника или null — так вызывающий код сразу
 * получает токены темы и не ищет их второй раз.
 */
function pickAllowed(catalog, id, tier) {
  const item = catalog.find(entry => entry.id === id);
  if (!item) return null;
  if (!seasonActive(item)) return null;
  return tierAtLeast(tier, item.tier) ? item : null;
}

function hasFeature(tier, feature) {
  const required = FEATURE_MIN_TIER[feature];
  if (!required) return true; // фича без ограничений
  return tierAtLeast(tier, required);
}

function limitsFor(tier) {
  return LIMITS[tier] || LIMITS.free;
}

/**
 * Матрица для редактора. Отдаём именно вычисленное «можно/нельзя» для его
 * тарифа плюс минимальный тариф для замочка («это в Premium»), чтобы клиенту
 * не приходилось знать про ранги.
 */
function capabilitiesFor(tier) {
  const features = {};
  for (const [feature, required] of Object.entries(FEATURE_MIN_TIER)) {
    features[feature] = { allowed: tierAtLeast(tier, required), requires: required };
  }
  const withAccess = catalog => catalog.map(item => ({
    ...item,
    allowed: tierAtLeast(tier, item.tier)
  }));

  const styleOptions = {};
  for (const [key, list] of Object.entries(STYLE_OPTIONS)) styleOptions[key] = withAccess(list);

  return {
    tier,
    features,
    limits: { ...limitsFor(tier), ...CONTENT_LIMITS },
    themes: withAccess(THEMES.filter(theme => seasonActive(theme))).map(theme => (
      theme.season ? { ...theme, seasonEnds: theme.season.to } : theme
    )),
    bgPatterns: withAccess(BG_PATTERNS),
    liveBackgrounds: withAccess(LIVE_BACKGROUNDS),
    themeModes: withAccess(THEME_MODES),
    layouts: withAccess(LAYOUTS),
    fonts: withAccess(FONTS),
    effects: withAccess(EFFECTS),
    avatarFrames: withAccess(AVATAR_FRAMES),
    blocks: BLOCKS,
    styleOptions,
    styleDefaults: STYLE_DEFAULTS,
    // Шаблоны — с пометкой, доступны ли целиком на этом тарифе.
    templates: require('./profileTemplates').TEMPLATES.map(template => ({ ...template, allowed: tierAtLeast(tier, template.tier) })),
    styleRanges: STYLE_RANGES,
    linkIcons: LINK_ICON_LIST,
    // Сетка своей расстановки — редактор двигает блоки в тех же клетках.
    customLayout: (() => {
      const grid = require('../utils/profileCustomLayout');
      return { cols: grid.COLS, row: grid.ROW, canvas: grid.CANVAS, maxRows: grid.MAX_ROWS, cells: grid.CELLS };
    })()
  };
}

/**
 * Порядок блоков: сохранённый, очищенный от мусора и дополненный теми, кого в
 * нём нет. Новый блок, добавленный в BLOCKS после сохранения порядка, встаёт
 * на своё место по умолчанию, а не пропадает.
 */
function normalizeBlockOrder(order) {
  const seen = new Set();
  const result = [];
  for (const id of Array.isArray(order) ? order : []) {
    const key = String(id);
    if (BLOCK_IDS.includes(key) && !seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  }
  for (const id of BLOCK_IDS) if (!seen.has(id)) result.push(id);
  return result;
}

module.exports = {
  PLANS,
  PLAN_TO_TIER,
  TIER_RANK,
  THEMES,
  THEME_BY_ID,
  LAYOUTS,
  FONTS,
  EFFECTS,
  AVATAR_FRAMES,
  BLOCKS,
  BLOCK_IDS,
  BG_PATTERNS,
  LIVE_BACKGROUNDS,
  THEME_MODES,
  seasonActive,
  STYLE_OPTIONS,
  STYLE_DEFAULTS,
  STYLE_RANGES,
  CONTENT_LIMITS,
  normalizeBlockOrder,
  LINK_ICONS,
  LINK_ICON_SET,
  LINK_ICON_NAMES,
  FEATURE_MIN_TIER,
  LIMITS,
  resolveTier,
  tierAtLeast,
  hasFeature,
  limitsFor,
  pickAllowed,
  capabilitiesFor
};
