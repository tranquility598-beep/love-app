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
const FEATURE_MIN_TIER = Object.freeze({
  shortLink: 'pro',          // me.loveapp.chat/sasha вместо /u/sasha
  customAccent: 'pro',       // свой акцент и градиент
  animatedAvatar: 'pro',     // gif/webp аватар живым, а не первым кадром
  animatedBanner: 'pro',
  backgroundImage: 'pro',    // своя картинка фоном
  hideFooter: 'pro',         // убрать «Сделано в Love»
  badges: 'pro',             // стаж, подписка
  viewStats: 'pro',          // счётчик и статистика
  statusBlock: 'pro',        // mood / customStatus / listening / hobbies на странице
  layoutCard: 'pro',

  enterOverlay: 'pro',       // экран «нажми, чтобы войти» как первый кадр
  music: 'premium',          // трек на странице (играет после жеста на экране входа)
  effects: 'premium',        // атмосферные эффекты страницы
  videoBackground: 'premium',
  fontChoice: 'premium',
  avatarFrame: 'premium',
  pairBlock: 'premium',      // «вместе с @dasha — 128 дней»
  closeFriends: 'premium',   // трое «Близких» с рамками
  customOgImage: 'premium',  // своя картинка превью ссылки
  layoutCinema: 'premium'
});

/**
 * Числовые лимиты. Наследование сверху вниз не делаю намеренно:
 * явная таблица читается за секунду, а «pro наследует free кроме…» — нет.
 */
const LIMITS = Object.freeze({
  free: Object.freeze({
    bioMaxLength: 140,
    links: 3,
    viewStatsDays: 0,
    assetBytes: 2 * 1024 * 1024
  }),
  pro: Object.freeze({
    bioMaxLength: 600,
    links: 12,
    viewStatsDays: 7,
    assetBytes: 5 * 1024 * 1024
  }),
  premium: Object.freeze({
    bioMaxLength: 1200,
    links: 20,
    viewStatsDays: 30,
    assetBytes: 10 * 1024 * 1024
  })
});

/**
 * Темы. tokens — то, что уезжает в CSS-переменные страницы.
 *
 * Своего CSS у пользователя нет и не будет: только выбор темы и, на pro+,
 * подмена акцента. Это осознанное ограничение — именно из-за полной свободы
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
    id: 'carbon', name: 'Carbon', tier: 'pro',
    tokens: { bg: '#08090a', bg2: '#111315', surface: 'rgba(255,255,255,0.045)', text: '#eceff1', muted: '#8b9298', accent: '#d9dee3', accentText: '#0b0c0d', border: 'rgba(255,255,255,0.08)' }
  },
  {
    id: 'sunset', name: 'Sunset', tier: 'pro',
    tokens: { bg: '#1b1014', bg2: '#3a1d1c', surface: 'rgba(255,255,255,0.06)', text: '#fff4ec', muted: '#d0a493', accent: '#ff8a3d', accentText: '#1b1014', border: 'rgba(255,255,255,0.1)' }
  },
  {
    id: 'mint', name: 'Mint', tier: 'pro',
    tokens: { bg: '#08150f', bg2: '#0f2419', surface: 'rgba(255,255,255,0.05)', text: '#eafff3', muted: '#8fbfa6', accent: '#2fd98a', accentText: '#062012', border: 'rgba(255,255,255,0.09)' }
  },
  {
    id: 'ultraviolet', name: 'Ultraviolet', tier: 'pro',
    tokens: { bg: '#0d0820', bg2: '#1c1040', surface: 'rgba(255,255,255,0.06)', text: '#f1ecff', muted: '#a396c9', accent: '#a855f7', accentText: '#ffffff', border: 'rgba(255,255,255,0.11)' }
  },
  {
    id: 'paper', name: 'Paper', tier: 'pro',
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
  }
]);

const THEME_BY_ID = Object.freeze(
  THEMES.reduce((map, theme) => Object.assign(map, { [theme.id]: theme }), {})
);

const LAYOUTS = Object.freeze([
  { id: 'stack', name: 'Focus', tier: 'free' },
  { id: 'card', name: 'Studio', tier: 'pro' },
  { id: 'cinema', name: 'Cover', tier: 'premium' }
]);

const FONTS = Object.freeze([
  { id: 'system', name: 'Grotesk', tier: 'free', stack: 'Outfit, "Segoe UI", sans-serif' },
  { id: 'serif', name: 'Editorial', tier: 'premium', stack: 'Lora, Georgia, serif' },
  { id: 'mono', name: 'Mono', tier: 'premium', stack: '"Fira Mono", Consolas, monospace' },
  { id: 'rounded', name: 'Soft', tier: 'premium', stack: '"Trebuchet MS", "Segoe UI", sans-serif' },
  { id: 'display', name: 'Portrait', tier: 'premium', stack: '"Cormorant Garamond", Georgia, serif' }
]);

const EFFECTS = Object.freeze([
  { id: 'none', name: 'Без эффектов', tier: 'free' },
  { id: 'particles', name: 'Пылинки', tier: 'premium' },
  { id: 'trail', name: 'Шлейф курсора', tier: 'premium' },
  { id: 'rain', name: 'Дождь', tier: 'premium' },
  { id: 'glow', name: 'Свет за курсором', tier: 'premium' },
  { id: 'snow', name: 'Снег', tier: 'premium' },
  { id: 'stars', name: 'Звёздная пыль', tier: 'premium' },
  { id: 'comets', name: 'Падающие звёзды', tier: 'premium' },
  { id: 'bokeh', name: 'Мягкие сферы', tier: 'premium' },
  { id: 'aurora', name: 'Северное сияние', tier: 'premium' },
  { id: 'constellation', name: 'Созвездия', tier: 'premium' },
  { id: 'grain', name: 'Плёнка', tier: 'premium' }
]);

const AVATAR_FRAMES = Object.freeze([
  { id: 'none', name: 'Без рамки', tier: 'free' },
  { id: 'ring', name: 'Contour', tier: 'pro' },
  { id: 'pulse', name: 'Halo', tier: 'premium' },
  { id: 'orbit', name: 'Orbit', tier: 'premium' },
  { id: 'liquid', name: 'Prism', tier: 'premium' },
  { id: 'corners', name: 'Edge', tier: 'premium' }
]);

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

  return {
    tier,
    features,
    limits: limitsFor(tier),
    themes: withAccess(THEMES),
    layouts: withAccess(LAYOUTS),
    fonts: withAccess(FONTS),
    effects: withAccess(EFFECTS),
    avatarFrames: withAccess(AVATAR_FRAMES),
    linkIcons: LINK_ICON_LIST
  };
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
