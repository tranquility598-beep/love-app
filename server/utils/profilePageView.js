/**
 * Модель отображения публичной страницы.
 *
 * Между документом в базе и HTML стоит этот слой, и у него две задачи.
 *
 * 1. ДЕГРАДАЦИЯ ПО ТАРИФУ ВО ВРЕМЯ РЕНДЕРА. Сохранённые настройки не стираются
 *    при окончании подписки — человек вернётся, и всё должно быть на месте.
 *    Значит проверять возможности надо здесь, на каждом показе, а не только
 *    при сохранении. Иначе достаточно оформить страницу на Premium и не
 *    продлевать — эффекты остались бы навсегда.
 *
 * 2. НИ ОДНОГО ЛИШНЕГО ПОЛЯ. Сюда попадает ровно то, что уходит в HTML.
 *    Публичный рендер не должен иметь физической возможности напечатать email,
 *    список серверов или причину блокировки — поэтому он получает не документ,
 *    а этот объект.
 */

const {
  THEMES, LAYOUTS, FONTS, EFFECTS, AVATAR_FRAMES, THEME_BY_ID,
  STYLE_OPTIONS, STYLE_DEFAULTS, STYLE_RANGES, CONTENT_LIMITS, BLOCK_IDS,
  BG_PATTERNS, LIVE_BACKGROUNDS, THEME_MODES,
  hasFeature, limitsFor, pickAllowed, normalizeBlockOrder
} = require('../config/profileTiers');
const { buildCustomTheme } = require('./profileTheme');

const HEX = /^#[0-9a-f]{6}$/i;

const FALLBACK_THEME = THEME_BY_ID.midnight;
const FALLBACK_FONT = FONTS[0];

function publicAvatar(value) {
  if (typeof value !== 'string' || !value) return null;
  if (value.startsWith('/') && !value.startsWith('//')) return value;
  try {
    const url = new URL(value);
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    const { allowedHosts } = require('./profileMedia');
    return (url.protocol === 'https:' || (local && url.protocol === 'http:'))
      && allowedHosts().has(url.hostname.toLowerCase()) ? value : null;
  } catch (_) { return null; }
}

function pickOrDefault(catalog, id, tier, fallback) {
  return pickAllowed(catalog, id, tier) || fallback;
}

// Validate legacy/imported data again at the public rendering boundary.
function publicLinkUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 400) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch (_) { return null; }
}

function monthYear(date) {
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return '';
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

function daysSince(date) {
  const d = new Date(date);
  if (!Number.isFinite(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  if (diff < 0) return null;
  return Math.floor(diff / (24 * 60 * 60 * 1000));
}

function pluralDays(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} дней`;
  if (mod10 === 1) return `${count} день`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} дня`;
  return `${count} дней`;
}

/**
 * Бейджи. Считаются, а не хранятся: «в Love с марта» и «Premium» — это
 * производные от аккаунта, и хранить их значило бы держать копию, которая
 * разъедется с реальностью в день окончания подписки.
 */
function buildBadges(user, tier) {
  const badges = [];
  if (tier === 'premium') badges.push({ id: 'premium', label: 'Premium' });
  else if (tier === 'pro') badges.push({ id: 'pro', label: 'Pro' });
  if (user.createdAt) badges.push({ id: 'since', label: `в Love с ${monthYear(user.createdAt)}` });
  return badges;
}

/**
 * Блок статуса собирается из настоящего профиля в мессенджере, а не из копии
 * на странице. Смысл именно в этом: человек меняет настроение в приложении, и
 * страница меняется сама — иначе она мёртвая и её перестают обновлять.
 */
function buildStatus(user) {
  const items = [];
  const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
  const status = text(user.customStatus, 128);
  if (status) items.push({ kind: 'status', text: status, icon: 'message' });
  const moods = {
    tea: 'Спокойствие', smile: 'Хорошее настроение', frown: 'Немного грустно',
    heart: 'Влюблённость', star: 'Вдохновение', moon: 'Ночной режим',
    sun: 'Солнечное настроение', cloud: 'В своих мыслях',
    music: 'На музыкальной волне', book: 'За чтением'
  };
  if (Object.hasOwn(moods, user.mood)) items.push({ kind: 'mood', text: moods[user.mood], icon: user.mood });
  const listening = text(user.listening, 160);
  if (listening) items.push({ kind: 'listening', text: listening, icon: 'music' });
  const hobbies = (Array.isArray(user.hobbies) ? user.hobbies : [])
    .map(hobby => ({
      text: text(typeof hobby === 'string' ? hobby : hobby?.text, 60),
      icon: typeof hobby?.icon === 'string' ? hobby.icon : 'star'
    }))
    .filter(hobby => hobby.text)
    .slice(0, 6);
  return { items, hobbies };
}

/**
 * Детали оформления с учётом тарифа. Закрытый вариант (подписка кончилась)
 * показывается как значение по умолчанию, а сохранённое не трогаем — так же,
 * как с темами и шрифтами.
 */
function resolveStyle(raw, tier) {
  const src = raw || {};
  const style = {};
  for (const [key, fallback] of Object.entries(STYLE_DEFAULTS)) {
    const value = src[key];
    if (STYLE_OPTIONS[key]) {
      style[key] = pickAllowed(STYLE_OPTIONS[key], value, tier) ? value : fallback;
    } else if (STYLE_RANGES[key]) {
      const [min, max] = STYLE_RANGES[key];
      const number = Number(value);
      style[key] = value == null || !Number.isFinite(number) ? fallback : Math.min(max, Math.max(min, Math.round(number)));
    } else {
      style[key] = typeof value === 'boolean' ? value : fallback;
    }
  }
  if (!hasFeature(tier, 'nameGradient')) style.nameGradient = false;
  if (!hasFeature(tier, 'avatarTilt')) style.avatarTilt = false;
  // Звуки страницы убраны по решению владельца (2026-10-28): тихий отклик
  // почти никто не замечал, а настройка занимала место. Старое значение
  // в базе игнорируем, страница молчит у всех.
  style.sounds = false;

  // Цвет имени. Прежний переключатель «имя градиентом» — это градиент акцента.
  style.nameColors = (Array.isArray(src.nameColors) ? src.nameColors : [])
    .filter(color => HEX.test(String(color)))
    .slice(0, CONTENT_LIMITS.gradientColors)
    .map(color => String(color).toLowerCase());
  if (style.nameFill === 'theme' && style.nameGradient) style.nameFill = 'accent';
  if (style.nameFill === 'gradient' && style.nameColors.length < 2) style.nameFill = style.nameColors.length ? 'solid' : 'theme';
  if (style.nameFill === 'solid' && !style.nameColors.length) style.nameFill = 'theme';
  style.cursorColors = hasFeature(tier, 'customCursor')
    ? (Array.isArray(src.cursorColors) ? src.cursorColors : []).filter(color => HEX.test(String(color))).slice(0, 2).map(color => String(color).toLowerCase())
    : [];
  return style;
}

/**
 * Эффекты страницы: список (новое) или одно поле effect (как сохраняли раньше).
 * Закрытые тарифом выпадают, лишние сверх лимита тарифа — тоже.
 */
function resolveEffects(page, tier, limit) {
  const raw = Array.isArray(page.effects) && page.effects.length
    ? page.effects
    : (page.effect && page.effect !== 'none' ? [page.effect] : []);
  const out = [];
  for (const id of raw) {
    const key = String(id);
    if (key === 'none' || out.includes(key)) continue;
    if (pickAllowed(EFFECTS, key, tier)) out.push(key);
  }
  return out.slice(0, Math.max(1, limit || 1));
}

function resolveGradient(raw, tier) {
  if (!raw?.enabled) return null;
  const colors = (Array.isArray(raw.colors) ? raw.colors : [])
    .filter(color => HEX.test(String(color)))
    .slice(0, CONTENT_LIMITS.gradientColors)
    .map(color => String(color).toLowerCase());
  if (colors.length < 2) return null;
  const angle = Number(raw.angle);
  return {
    colors,
    angle: Number.isFinite(angle) ? Math.min(360, Math.max(0, Math.round(angle))) : 160,
    animated: Boolean(raw.animated) && hasFeature(tier, 'animatedGradient')
  };
}

const hexList = (list, max) => (Array.isArray(list) ? list : [])
  .filter(color => HEX.test(String(color)))
  .slice(0, max)
  .map(color => String(color).toLowerCase());

function cleanText(value, limit) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

/**
 * @param {object} page   документ ProfilePage
 * @param {object} user   владелец (username, nickname, avatar, createdAt, mood…)
 * @param {string} tier   тариф владельца НА МОМЕНТ ПОКАЗА
 */
function buildView(page, user, tier) {
  const custom = hasFeature(tier, 'customTheme') ? buildCustomTheme(page.customTheme) : null;
  const theme = custom
    ? { id: 'custom', tokens: custom.tokens, animated: false }
    : pickOrDefault(THEMES, page.theme, tier, FALLBACK_THEME);
  const layout = pickOrDefault(LAYOUTS, page.layout, tier, LAYOUTS[0]);
  // Своя расстановка — только пока тариф её позволяет; иначе страница просто
  // возвращается к выбранной раскладке, клетки остаются в базе.
  const customOn = page.customLayout?.on && hasFeature(tier, 'customLayout') && (page.customLayout.items || []).length > 0;
  const cellsOf = list => (list || []).map(item => ({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h }));
  const customCells = customOn ? cellsOf(page.customLayout.items) : null;
  const customPhone = customOn && (page.customLayout.phone || []).length ? cellsOf(page.customLayout.phone) : null;
  const customFontUrl = page.font === 'custom' && hasFeature(tier, 'customFont') && page.customFont?.url
    ? require('./profileMedia').classifyMediaUrl(page.customFont.url)
    : null;
  const font = page.font === 'custom' && !(customFontUrl && customFontUrl.kind === 'font')
    ? FALLBACK_FONT
    : pickOrDefault(FONTS, page.font, tier, FALLBACK_FONT);
  const frame = pickOrDefault(AVATAR_FRAMES, page.avatarFrame, tier, AVATAR_FRAMES[0]);
  const limits = limitsFor(tier);
  const effects = resolveEffects(page, tier, limits.effectsAtOnce);
  const effectColors = hasFeature(tier, 'effectColors')
    ? (Array.isArray(page.effectColors) ? page.effectColors : [])
      .filter(color => HEX.test(String(color)))
      .slice(0, CONTENT_LIMITS.effectColors)
      .map(color => String(color).toLowerCase())
    : [];

  const accent = hasFeature(tier, 'customAccent') && page.accent ? page.accent : theme.tokens.accent;
  const accentTo = hasFeature(tier, 'accentGradient') && page.accentTo ? page.accentTo : null;

  const backgroundKind = page.background?.kind || 'none';
  const backgroundFeature = backgroundKind === 'video'
    ? 'videoBackground'
    // profileMedia подтягивает настройку Cloudinary — грузим его лениво, как в publicAvatar.
    : backgroundKind === 'image' && require('./profileMedia').isAnimatedImageUrl(page.background?.url)
      ? 'animatedBackground'
      : 'backgroundImage';
  const backgroundOn = backgroundKind !== 'none'
    && Boolean(page.background?.url)
    && hasFeature(tier, backgroundFeature);

  const style = resolveStyle(page.style, tier);
  if (style.cursor === 'custom' && !page.cursorImage) style.cursor = 'default';

  // Вторая тема: под систему гостя (всем) или по времени суток (Pro).
  // Со своей темой не сочетается — у неё нет пары.
  const modeItem = pickAllowed(THEME_MODES, page.themeMode, tier);
  const themeMode = modeItem ? modeItem.id : 'fixed';
  const altItem = !custom && themeMode !== 'fixed' && page.altTheme && page.altTheme !== theme.id
    ? pickAllowed(THEMES, page.altTheme, tier)
    : null;
  const altTheme = altItem ? { id: altItem.id, tokens: altItem.tokens } : null;
  const hidden = new Set((page.style?.hiddenBlocks || []).map(String).filter(id => BLOCK_IDS.includes(id)));
  const blocks = normalizeBlockOrder(page.style?.blockOrder).filter(id => !hidden.has(id));

  // Плейлист: первый трек — он же music, остальные идут следом.
  const tracks = hasFeature(tier, 'music') && hasFeature(tier, 'playlist') && Array.isArray(page.playlist) && page.playlist.length
    ? page.playlist.filter(track => track && track.url).slice(0, CONTENT_LIMITS.playlist)
      .map(track => ({ url: track.url, title: cleanText(track.title, 80), artist: cleanText(track.artist, 80) }))
    : [];
  const musicOn = (Boolean(page.music?.url) || tracks.length > 0) && hasFeature(tier, 'music');
  // Экран входа нужен музыке: без жеста пользователя браузер её не запустит.
  // Поэтому при включённой музыке он показывается всегда, даже если галочку
  // сняли — иначе трек просто молча не заиграет, и это выглядело бы как баг.
  const overlayOn = musicOn || (Boolean(page.enterOverlay?.enabled) && hasFeature(tier, 'enterOverlay'));

  const bio = String(page.bio || '').slice(0, limits.bioMaxLength);
  const links = (Array.isArray(page.links) ? page.links : [])
    .map((link, index) => ({
      label: link?.label || '',
      url: publicLinkUrl(link?.url),
      icon: link?.icon || 'link',
      // Номер в сохранённом списке, а не в показанном: по нему считается
      // нажатие (битые ссылки выше по списку на странице не видны).
      index
    }))
    .filter(link => link.url)
    .slice(0, limits.links);

  const gallery = hasFeature(tier, 'gallery')
    ? (Array.isArray(page.gallery) ? page.gallery : []).map(publicAvatar).filter(Boolean).slice(0, CONTENT_LIMITS.gallery)
    : [];
  const tags = (Array.isArray(page.tags) ? page.tags : [])
    .map(tag => cleanText(tag, CONTENT_LIMITS.tagLength))
    .filter(Boolean)
    .slice(0, CONTENT_LIMITS.tags);
  const quoteText = cleanText(page.quote?.text, CONTENT_LIMITS.quote);
  const countdownAt = page.countdown?.at ? new Date(page.countdown.at) : null;

  const partner = page.pair?.partner;
  const pairOn = Boolean(partner) && Boolean(page.pair?.visible) && hasFeature(tier, 'pairBlock');
  const pairDays = pairOn && page.pair?.since ? daysSince(page.pair.since) : null;

  return {
    username: user.username,
    title: page.displayName || user.nickname || user.username,
    headline: page.headline || '',
    bio,
    avatar: publicAvatar(page.avatar || user.avatar),
    banner: page.banner || null,
    links,

    theme: { id: theme.id, tokens: theme.tokens, animated: Boolean(theme.animated) },
    layout: layout.id,
    customCells,
    customRows: customOn ? Number(page.customLayout.rows) || 0 : 0,
    customPhone,
    customPhoneRows: customPhone ? Number(page.customLayout.phoneRows) || 0 : 0,
    fontStack: font.stack,
    customFont: font.id === 'custom' && customFontUrl ? customFontUrl.url : null,
    // effect — первый из списка: на него смотрят старые места (превью и
    // тесты, где эффект один), effects — всё, что реально включено.
    effect: effects[0] || 'none',
    effects,
    effectColors,
    avatarFrame: frame.id,
    accent,
    accentTo,
    style,
    blocks,
    bgGradient: resolveGradient(page.bgGradient, tier),
    bgPattern: page.bgPattern?.kind && page.bgPattern.kind !== 'none' && pickAllowed(BG_PATTERNS, page.bgPattern.kind, tier)
      ? { kind: page.bgPattern.kind, opacity: Math.min(100, Math.max(0, Number(page.bgPattern.opacity ?? 35) || 0)) }
      : null,
    liveBg: pickAllowed(LIVE_BACKGROUNDS, page.liveBg, tier) && page.liveBg !== 'none' ? page.liveBg : null,
    altTheme,
    themeMode: altTheme ? themeMode : 'fixed',
    cursorImage: style.cursor === 'custom' && hasFeature(tier, 'customCursor') ? publicAvatar(page.cursorImage) : null,
    trail: effects.includes('trail') && hasFeature(tier, 'trailStyle')
      ? {
        colors: hexList(page.trailStyle?.colors, 2),
        width: Math.min(300, Math.max(40, Number(page.trailStyle?.width ?? 100) || 100)),
        length: Math.min(1600, Math.max(200, Number(page.trailStyle?.length ?? 560) || 560)),
        glow: page.trailStyle?.glow !== false
      }
      : null,

    background: backgroundOn
      ? {
        kind: backgroundKind,
        url: page.background.url,
        blur: page.background.blur ?? 0,
        dim: page.background.dim ?? 40
      }
      : null,

    music: musicOn
      ? {
        url: tracks[0]?.url || page.music.url,
        title: (tracks[0] ? tracks[0].title : page.music.title) || '',
        artist: (tracks[0] ? tracks[0].artist : page.music.artist) || '',
        volume: page.music?.volume ?? 60,
        tracks: tracks.length > 1 ? tracks : []
      }
      : null,

    enterOverlay: overlayOn
      ? { text: page.enterOverlay?.text || 'нажми, чтобы войти' }
      : null,

    status: (page.showStatus && hasFeature(tier, 'statusBlock')) ? buildStatus(user) : null,
    badges: (page.showBadges && hasFeature(tier, 'badges')) ? buildBadges(user, tier) : [],

    pair: pairOn
      ? {
        username: partner.username,
        nickname: partner.nickname || '',
        avatar: publicAvatar(partner.avatar),
        // «вместе 128 дней» — если дату не указали, просто «вместе».
        label: pairDays == null ? 'вместе' : `вместе ${pluralDays(pairDays)}`
      }
      : null,

    closeFriends: hasFeature(tier, 'closeFriends')
      ? (page.closeFriends || []).slice(0, 3).map(friend => ({
        username: friend.username,
        nickname: friend.nickname || '',
        avatar: publicAvatar(friend.avatar)
      }))
      : [],

    // Подпись убирают только на Pro и выше. Это не про деньги, а про то, что
    // бесплатная страница — витрина: с неё приходят новые люди.
    showFooter: !(page.hideFooter && hasFeature(tier, 'hideFooter')),

    gallery,
    tags,
    quote: quoteText ? { text: quoteText, author: cleanText(page.quote?.author, CONTENT_LIMITS.quoteAuthor) } : null,
    countdown: countdownAt && Number.isFinite(countdownAt.getTime())
      ? { title: cleanText(page.countdown?.title, CONTENT_LIMITS.countdownTitle), at: countdownAt.toISOString() }
      : null,
    // Карточку приглашения дописывает роут (utils/profileInvite): ей нужен
    // запрос в базу за названием сферы, а этот слой в базу не ходит.
    invite: null,

    views: page.views?.total || 0,
    showViews: hasFeature(tier, 'viewCount'),
    hearts: page.hearts?.enabled && hasFeature(tier, 'hearts') ? { count: Math.max(0, page.hearts.count || 0) } : null,

    ogImage: (page.ogImage && hasFeature(tier, 'customOgImage')) ? page.ogImage : null,
    tier
  };
}

module.exports = { buildView, resolveStyle, publicAvatar, publicLinkUrl, pluralDays, monthYear, daysSince };
