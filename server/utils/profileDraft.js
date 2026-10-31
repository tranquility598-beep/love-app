/**
 * Черновик и публикация страницы профиля.
 *
 * Поля документа ProfilePage — это то, что правит редактор (черновик).
 * Гости видят published.data — снимок этих полей на момент последнего
 * «Опубликовать». Перекраивать страницу на глазах у всех больше не нужно.
 *
 * Страницы, созданные до этой возможности, снимка не имеют — гости видят поля
 * как есть. Снимок появляется при первой правке: ДО применения правки, то есть
 * он фиксирует ровно то, что гости видели в этот момент.
 *
 * Что в снимке: всё, что меняет вид страницы. Что живёт вне его: включена ли
 * страница, просмотры, счётчик сердечек, нажатия ссылок, модерация — это не
 * оформление, а жизнь страницы, и черновик её не задерживает.
 */

const PUBLISHED_FIELDS = Object.freeze([
  'theme', 'layout', 'customLayout', 'font', 'accent', 'accentTo', 'avatarFrame', 'effect', 'effects', 'effectColors',
  'customTheme', 'altTheme', 'themeMode', 'displayName', 'headline', 'bio', 'avatar', 'banner', 'links',
  'background', 'bgGradient', 'bgPattern', 'liveBg', 'music', 'playlist', 'enterOverlay', 'showStatus',
  'showBadges', 'hideFooter', 'ogImage', 'pair', 'closeFriends', 'style', 'gallery', 'invite', 'tags',
  'quote', 'countdown', 'cursorImage', 'trailStyle', 'hearts'
]);

const VERSIONS_KEPT = 20;

// Выключатель на случай, если черновики придётся быстро отключить: при false
// гости снова видят правки сразу, а снимок и история просто не используются.
const DRAFTS_ON = true;
const clone = value => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

function plain(page) {
  return typeof page.toObject === 'function' ? page.toObject({ depopulate: true }) : page;
}

/** Снимок оформления. Порядок ключей фиксирован — по нему сравниваем. */
function snapshotOf(page) {
  const src = plain(page);
  const out = {};
  for (const key of PUBLISHED_FIELDS) {
    if (src[key] === undefined) continue;
    out[key] = clone(src[key]);
  }
  // Нажатия и счётчик — жизнь страницы, не оформление.
  if (Array.isArray(out.links)) out.links = out.links.map(({ clicks, ...link }) => link);
  if (out.hearts) out.hearts = { enabled: Boolean(out.hearts.enabled) };
  if (out.pair && out.pair.partner && typeof out.pair.partner === 'object') out.pair.partner = String(out.pair.partner._id || out.pair.partner);
  if (Array.isArray(out.closeFriends)) out.closeFriends = out.closeFriends.map(id => String(id && id._id ? id._id : id));
  if (out.invite && out.invite.server && typeof out.invite.server === 'object') out.invite.server = String(out.invite.server._id || out.invite.server);
  return out;
}

// Сравнение без учёта порядка ключей: база возвращает вложенные объекты в
// своём порядке, и одинаковое оформление иначе считалось бы изменённым.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((out, key) => {
      if (value[key] !== undefined) out[key] = canonical(value[key]);
      return out;
    }, {});
  }
  return value === undefined ? null : value;
}
const stable = value => JSON.stringify(canonical(value === undefined ? null : JSON.parse(JSON.stringify(value))));

/** Есть ли правки, которых гости ещё не видят. */
function isDirty(page) {
  if (!DRAFTS_ON) return false;
  const published = page.published && page.published.data;
  if (!published) return false;
  const now = snapshotOf(page);
  return PUBLISHED_FIELDS.some(key => stable(now[key]) !== stable(published[key]));
}

/** Снимок «как сейчас у гостей», если его ещё нет. Вызывать ДО правки. */
function ensurePublished(page) {
  if (!DRAFTS_ON) return false;
  if (page.published && page.published.data) return false;
  page.published = { at: new Date(), data: snapshotOf(page) };
  return true;
}

/** Опубликовать черновик. versions должны быть выбраны (+versions). */
function publish(page) {
  const data = snapshotOf(page);
  const at = new Date();
  page.published = { at, data };
  const list = Array.isArray(page.versions) ? page.versions.slice() : [];
  list.push({ at, data: clone(data) });
  page.versions = list.slice(-VERSIONS_KEPT);
  return at;
}

/**
 * Записать снимок в поля черновика (откат к опубликованному или к версии из
 * истории). Нажатия ссылок переносим по адресу, счётчик сердечек не трогаем.
 */
function applySnapshot(page, data) {
  if (!data) return;
  const clicks = new Map((page.links || []).map(link => [link.url, link.clicks || 0]));
  for (const key of PUBLISHED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
    const value = clone(data[key]);
    if (key === 'links') {
      page.links = (value || []).map(link => ({ ...link, clicks: clicks.get(link.url) || 0 }));
    } else if (key === 'hearts') {
      page.hearts.enabled = Boolean(value && value.enabled);
    } else {
      page.set(key, value);
    }
  }
}

/**
 * То, что видят гости: документ с полями из опубликованного снимка. Пару и
 * близких подгружаем по id из снимка — в черновике могли уже поменять.
 */
async function publicSource(page, User) {
  if (!DRAFTS_ON) return page;
  const data = page.published && page.published.data;
  if (!data) return page;
  const base = plain(page);
  const src = { ...base, ...clone(data) };
  src.hearts = { enabled: Boolean(data.hearts && data.hearts.enabled), count: (base.hearts && base.hearts.count) || 0 };
  const ids = [src.pair && src.pair.partner, ...(src.closeFriends || [])].filter(Boolean).map(String);
  const people = ids.length ? await User.find({ _id: { $in: ids } }).select('username nickname avatar').lean() : [];
  const byId = new Map(people.map(person => [String(person._id), person]));
  src.pair = { ...(src.pair || {}), partner: src.pair && src.pair.partner ? byId.get(String(src.pair.partner)) || null : null };
  src.closeFriends = (src.closeFriends || []).map(id => byId.get(String(id))).filter(Boolean);
  return src;
}

/** Ссылки, которые сейчас видят гости, — для подсчёта нажатий. */
function publicLinks(page) {
  if (!DRAFTS_ON) return page.links || [];
  const data = page.published && page.published.data;
  return data && Array.isArray(data.links) ? data.links : (page.links || []);
}

module.exports = {
  DRAFTS_ON,
  PUBLISHED_FIELDS, VERSIONS_KEPT, snapshotOf, isDirty, ensurePublished, publish, applySnapshot, publicSource, publicLinks
};
