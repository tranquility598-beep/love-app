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
  hasFeature, limitsFor, pickAllowed
} = require('../config/profileTiers');

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
 * @param {object} page   документ ProfilePage
 * @param {object} user   владелец (username, nickname, avatar, createdAt, mood…)
 * @param {string} tier   тариф владельца НА МОМЕНТ ПОКАЗА
 */
function buildView(page, user, tier) {
  const theme = pickOrDefault(THEMES, page.theme, tier, FALLBACK_THEME);
  const layout = pickOrDefault(LAYOUTS, page.layout, tier, LAYOUTS[0]);
  const font = pickOrDefault(FONTS, page.font, tier, FALLBACK_FONT);
  const effect = pickOrDefault(EFFECTS, page.effect, tier, EFFECTS[0]);
  const frame = pickOrDefault(AVATAR_FRAMES, page.avatarFrame, tier, AVATAR_FRAMES[0]);
  const limits = limitsFor(tier);

  const accentAllowed = hasFeature(tier, 'customAccent');
  const accent = accentAllowed && page.accent ? page.accent : theme.tokens.accent;
  const accentTo = accentAllowed && page.accentTo ? page.accentTo : null;

  const backgroundKind = page.background?.kind || 'none';
  const backgroundFeature = backgroundKind === 'video' ? 'videoBackground' : 'backgroundImage';
  const backgroundOn = backgroundKind !== 'none'
    && Boolean(page.background?.url)
    && hasFeature(tier, backgroundFeature);

  const musicOn = Boolean(page.music?.url) && hasFeature(tier, 'music');
  // Экран входа нужен музыке: без жеста пользователя браузер её не запустит.
  // Поэтому при включённой музыке он показывается всегда, даже если галочку
  // сняли — иначе трек просто молча не заиграет, и это выглядело бы как баг.
  const overlayOn = musicOn || (Boolean(page.enterOverlay?.enabled) && hasFeature(tier, 'enterOverlay'));

  const bio = String(page.bio || '').slice(0, limits.bioMaxLength);
  const links = (Array.isArray(page.links) ? page.links : [])
    .map(link => ({
      label: link?.label || '',
      url: publicLinkUrl(link?.url),
      icon: link?.icon || 'link'
    }))
    .filter(link => link.url)
    .slice(0, limits.links);

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
    fontStack: font.stack,
    effect: effect.id,
    avatarFrame: frame.id,
    accent,
    accentTo,

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
        url: page.music.url,
        title: page.music.title || '',
        artist: page.music.artist || '',
        volume: page.music.volume ?? 60
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

    views: page.views?.total || 0,
    showViews: hasFeature(tier, 'viewStats'),

    ogImage: (page.ogImage && hasFeature(tier, 'customOgImage')) ? page.ogImage : null,
    tier
  };
}

module.exports = { buildView, pluralDays, monthYear, daysSince };
