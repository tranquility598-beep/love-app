/**
 * API редактора публичной страницы профиля.  Монтируется на /api/profile-page.
 *
 * ГЛАВНОЕ, ЧТО НАДО ПОНЯТЬ ПРО ЭТОТ ФАЙЛ — АВТОРИЗАЦИЯ.
 *
 * Редактор живёт на me.loveapp.chat/build, то есть на том же origin, где
 * рендерятся страницы, оформленные пользователями. Значит полноценный JWT
 * аккаунта там появиться не должен НИКОГДА: любая дырка в рендере чужой
 * страницы (или просто расширение в браузере) унесла бы весь аккаунт — чаты,
 * друзей, смену пароля.
 *
 * Поэтому вход двухступенчатый:
 *   1. Приложение (у него настоящий JWT) просит POST /editor-session и получает
 *      одноразовый код, живущий 2 минуты.
 *   2. Открывается me.loveapp.chat/build#code=…, редактор меняет код на УЗКИЙ
 *      токен (aud='profile-editor', 30 минут), который умеет только читать и
 *      писать одну страницу — свою.
 *
 * Код передаётся во фрагменте URL (#), а не в query: фрагмент не уходит на
 * сервер в заголовке Referer и не попадает в логи nginx.
 *
 * Идея не новая для этого кода — так же сделан socket-token (aud='socket').
 * Один приём на весь проект лучше двух разных: authMiddleware отвергает любой
 * токен с aud, поэтому узкий токен физически не пускают в остальной API.
 */

const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const ProfilePage = require('../models/ProfilePage');
const authMiddleware = require('../middleware/auth');
const { getJwtSecret } = require('../utils/jwtSecret');
const { authLimiter, uploadLimiter, publicPageLimiter, profilePageLimiter } = require('../middleware/rateLimiter');
const { getUsernameValidationError, normalizeContent } = require('../middleware/validation');
const {
  THEMES, LAYOUTS, FONTS, EFFECTS, AVATAR_FRAMES, LINK_ICON_SET,
  STYLE_OPTIONS, STYLE_DEFAULTS, STYLE_RANGES, CONTENT_LIMITS, BLOCK_IDS,
  BG_PATTERNS, LIVE_BACKGROUNDS, THEME_MODES, seasonActive,
  resolveTier, hasFeature, limitsFor, pickAllowed, capabilitiesFor, FEATURE_MIN_TIER,
  tierAtLeast, normalizeBlockOrder
} = require('../config/profileTiers');
const { isAllowedMediaUrl, isAnimatedImageUrl, storeProfileAsset } = require('../utils/profileMedia');
const { publicUrl, longUrl, shortUrl, builderUrl, mediaOrigin } = require('../utils/profilePageUrls');
const { buildView, publicLinkUrl } = require('../utils/profilePageView');
const { renderPreviewFragment } = require('../utils/profilePageHtml');
const { rememberOwner, isOwnerVisit } = require('../utils/profileViews');
const { resolveInvitePatch, loadInviteCard } = require('../utils/profileInvite');
const { CUSTOM_THEME_FIELDS, buildCustomTheme } = require('../utils/profileTheme');
const { sanitizeCustomLayout } = require('../utils/profileCustomLayout');
const {
  HEARTS_PER_IP, verifyHeartToken, ipHashOf, visitorKeyOf, heartRateOk
} = require('../utils/profileHearts');
const ProfileHeartMark = require('../models/ProfileHeartMark');
const { DRAFTS_ON, isDirty, ensurePublished, publish, applySnapshot, publicLinks } = require('../utils/profileDraft');
const { checkMilestones } = require('../utils/profileMilestones');

const router = express.Router();

// Роботы и скрипты не нажимают ссылок и не ставят сердечек.
const CLICK_BOT_UA = /bot|crawler|spider|crawl|preview|headless|curl|wget|python-requests|okhttp/i;
const JWT_SECRET = getJwtSecret();

// Тот же адрес сайта, что подставляет публичный роут: в превью видна та же
// кнопка «Написать в Love», что и на странице.
const SITE_URL = (process.env.SITE_URL || 'https://loveapp.chat').replace(/\/+$/, '');

const EDITOR_AUDIENCE = 'profile-editor';
const EDITOR_TTL_SECONDS = 30 * 60;
const HANDOFF_TTL_MS = 2 * 60 * 1000;

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function issueEditorToken(user) {
  return jwt.sign(
    { userId: user._id, aud: EDITOR_AUDIENCE },
    JWT_SECRET,
    { expiresIn: EDITOR_TTL_SECONDS }
  );
}

/**
 * Страница создаётся при первом обращении, а не при регистрации.
 * Заводить документ каждому из существующих пользователей ради выключенной
 * страницы — это миграция на всю базу ради пустых значений по умолчанию.
 */
async function getOrCreatePage(userId) {
  const existing = await ProfilePage.findOne({ user: userId });
  if (existing) return existing;
  return ProfilePage.create({ user: userId });
}

/** Заблокированным и деактивированным редактор не положен. */
function restrictionResponse(user) {
  if (user.deactivatedAt) {
    return { code: 'ACCOUNT_DEACTIVATED', message: 'Аккаунт деактивирован' };
  }
  if (user.isBanned) {
    return { code: 'ACCOUNT_BANNED', message: 'Ваш аккаунт заблокирован' };
  }
  return null;
}

/**
 * POST /api/profile-page/editor-session
 * Вызывается ИЗ ПРИЛОЖЕНИЯ с полноценным токеном. Отдаёт ссылку на редактор
 * с одноразовым кодом внутри.
 */
router.post('/editor-session', authMiddleware, async (req, res) => {
  try {
    const restriction = restrictionResponse(req.user);
    if (restriction) return res.status(403).json(restriction);

    await getOrCreatePage(req.user._id);

    // 32 байта — с запасом: код нельзя ни подобрать, ни угадать, поэтому
    // отдельная защита от перебора кода не нужна (лимитер всё равно стоит).
    const code = crypto.randomBytes(32).toString('base64url');

    // Пишем через updateOne, а не через сохранение документа: поля handoff
    // помечены select:false, и запись напрямую в невыбранный путь — источник
    // тихих сюрпризов в mongoose. Заодно предыдущий код автоматически гаснет:
    // одновременно живёт только один.
    await ProfilePage.updateOne(
      { user: req.user._id },
      { $set: { 'editorHandoff.codeHash': hashCode(code), 'editorHandoff.expiresAt': new Date(Date.now() + HANDOFF_TTL_MS) } }
    );

    console.log('[profile-page] editor handoff issued for userId=', req.user._id.toString());

    res.json({
      url: `${builderUrl(req)}#code=${code}`,
      expiresIn: Math.round(HANDOFF_TTL_MS / 1000)
    });
  } catch (error) {
    console.error('[profile-page] editor-session error:', error.message);
    res.status(500).json({ message: 'Не удалось открыть редактор' });
  }
});

/**
 * GET /api/profile-page/summary
 * Тоже из приложения и тоже с полноценным токеном — но в отличие от
 * /editor-session ничего не выдаёт и ничего не меняет.
 *
 * Нужен затем, что карточка в настройках иначе врала бы: без этого ответа она
 * не знает ни опубликована страница, ни какой адрес показать, и осталась бы
 * кнопкой без состояния. Второй смысл — сама доступность: маршрут висит за
 * requireFeature('profilePagesV1'), поэтому при выключенной фиче он отвечает
 * 404, и приложение просто не рисует раздел вместо кнопки, которая ломается
 * при нажатии.
 *
 * Документ намеренно НЕ создаётся: чтение настроек не повод писать в базу, а
 * пустая страница и так описывается значениями по умолчанию.
 */
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const tier = resolveTier(req.user);
    const page = await ProfilePage.findOne({ user: req.user._id }).select('enabled moderation');

    res.json({
      exists: Boolean(page),
      enabled: Boolean(page && page.enabled),
      // Скрытая модерацией страница остаётся «опубликованной» в настройках, но
      // по ссылке её нет. Промолчать об этом — значит оставить человека с
      // рабочей на вид кнопкой и мёртвым адресом.
      moderation: (page && page.moderation && page.moderation.status) || 'ok',
      tier,
      restricted: Boolean(restrictionResponse(req.user)),
      urls: urlsFor(req.user, tier, req)
    });
  } catch (error) {
    console.error('[profile-page] summary error:', error.message);
    res.status(500).json({ message: 'Не удалось получить состояние страницы' });
  }
});

/**
 * POST /api/profile-page/session
 * Обмен одноразового кода на узкий токен. Вызывает уже сам редактор в браузере.
 */
router.post('/session', authLimiter, async (req, res) => {
  try {
    const code = String(req.body?.code || '').trim();
    if (!code) return res.status(400).json({ message: 'Код не передан' });

    const page = await ProfilePage
      .findOne({ 'editorHandoff.codeHash': hashCode(code) })
      .select('+editorHandoff.codeHash +editorHandoff.expiresAt');

    if (!page) {
      return res.status(401).json({ message: 'Ссылка недействительна. Откройте редактор из приложения заново.' });
    }

    const expiresAt = page.editorHandoff?.expiresAt;
    // Код гасим в любом случае — и когда он просрочен, и когда сработал.
    // Одноразовость важнее удобства: ссылка могла остаться в истории браузера.
    await ProfilePage.updateOne(
      { _id: page._id },
      { $set: { 'editorHandoff.codeHash': null, 'editorHandoff.expiresAt': null } }
    );

    if (!expiresAt || new Date(expiresAt).getTime() <= Date.now()) {
      return res.status(401).json({ message: 'Ссылка устарела. Откройте редактор из приложения заново.' });
    }

    const user = await User.findById(page.user).select('-password');
    if (!user) return res.status(401).json({ message: 'Пользователь не найден' });

    const restriction = restrictionResponse(user);
    if (restriction) return res.status(403).json(restriction);

    res.json({ token: issueEditorToken(user), expiresIn: EDITOR_TTL_SECONDS });
  } catch (error) {
    console.error('[profile-page] session error:', error.message);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/profile-page/login
 * Вход в редактор прямо из браузера — по логину и паролю.
 *
 * Нужен, потому что редактор открывают и с телефона, и просто вводя адрес
 * руками, а гонять человека за приложением ради своей же страницы — глупо.
 *
 * При включённой двухфакторке отказываем прямо и честно: тянуть сюда второй
 * шаг 2FA значит разложить весь механизм входа на публичном хосте, где
 * рендерится чужой контент. Там ему не место — пусть откроет из приложения.
 */
router.post('/login', authLimiter, async (req, res) => {
  try {
    const login = String(req.body?.login || '').trim();
    const password = String(req.body?.password || '');
    if (!login || !password) {
      return res.status(400).json({ message: 'Введите логин и пароль' });
    }

    const user = await User.findOne({
      $or: [{ email: login.toLowerCase() }, { username: login }]
    }).collation({ locale: 'en', strength: 2 });

    // Одинаковый ответ на «нет такого» и «пароль неверный» — иначе форма
    // превращается в проверялку существования аккаунтов.
    const invalid = { message: 'Неверный логин или пароль' };
    if (!user) return res.status(401).json(invalid);

    const passwordOk = await user.comparePassword(password);
    if (!passwordOk) return res.status(401).json(invalid);

    const restriction = restrictionResponse(user);
    if (restriction) return res.status(403).json(restriction);

    if (user.twoFactorEnabled) {
      return res.status(409).json({
        code: 'TWO_FACTOR_REQUIRED',
        message: 'У вас включена двухфакторная защита. Откройте редактор кнопкой в приложении — так безопаснее.'
      });
    }

    await getOrCreatePage(user._id);
    res.json({ token: issueEditorToken(user), expiresIn: EDITOR_TTL_SECONDS });
  } catch (error) {
    console.error('[profile-page] login error:', error.message);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * Проверка узкого токена редактора.
 *
 * Принимает ТОЛЬКО aud='profile-editor'. Обычный токен аккаунта здесь не
 * работает намеренно — симметрично тому, что authMiddleware не принимает
 * узкий. Так ни один токен не растекается за пределы своей задачи.
 */
async function profileAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Нужен токен редактора' });
    }

    const decoded = jwt.verify(header.substring(7), JWT_SECRET);
    if (decoded.aud !== EDITOR_AUDIENCE) {
      return res.status(401).json({ message: 'Этот токен не для редактора страницы' });
    }

    const user = await User.findById(decoded.userId).select('-password');
    if (!user) return res.status(401).json({ message: 'Пользователь не найден' });

    const restriction = restrictionResponse(user);
    if (restriction) return res.status(403).json(restriction);

    req.user = user;
    req.tier = resolveTier(user);
    req.limits = limitsFor(req.tier);
    req.page = await getOrCreatePage(user._id);
    // Этот браузер — владельца: его заходы на свою страницу не считаем.
    rememberOwner(req, res, req.page._id);
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 'EDITOR_SESSION_EXPIRED', message: 'Сессия редактора истекла' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Недействительный токен' });
    }
    console.error('[profile-page] profileAuth error:', error.message);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
}

/* ------------------------------------------------------------------ *
 *  ЧТЕНИЕ
 * ------------------------------------------------------------------ */

/** Короткая карточка человека — для «Близких» и пары. Ничего лишнего. */
function personDto(user) {
  if (!user || !user._id) return null;
  return {
    id: String(user._id),
    username: user.username,
    nickname: user.nickname || '',
    avatar: user.avatar || null
  };
}

/** Детали оформления со значениями по умолчанию — редактору не нужно их знать. */
function styleDto(raw) {
  const style = { ...STYLE_DEFAULTS };
  for (const key of Object.keys(STYLE_DEFAULTS)) {
    if (raw && raw[key] != null) style[key] = raw[key];
  }
  style.blockOrder = normalizeBlockOrder(raw?.blockOrder);
  style.hiddenBlocks = (raw?.hiddenBlocks || []).filter(id => BLOCK_IDS.includes(id));
  style.nameColors = (raw?.nameColors || []).slice(0, CONTENT_LIMITS.gradientColors);
  style.cursorColors = (raw?.cursorColors || []).slice(0, 2);
  return style;
}

function customThemeDto(raw) {
  const out = { enabled: Boolean(raw?.enabled) };
  for (const key of CUSTOM_THEME_FIELDS) out[key] = raw?.[key] || null;
  // Что сервер подправил ради читаемости — редактор покажет итоговые цвета.
  const built = buildCustomTheme({ ...out, enabled: true });
  out.applied = { text: built.tokens.text, muted: built.tokens.muted };
  out.adjusted = built.adjusted;
  return out;
}

function effectsDto(page) {
  if (Array.isArray(page.effects) && page.effects.length) return page.effects.slice(0, 4);
  return page.effect && page.effect !== 'none' ? [page.effect] : [];
}

function gradientDto(raw) {
  return {
    enabled: Boolean(raw?.enabled),
    colors: (raw?.colors || []).slice(0, CONTENT_LIMITS.gradientColors),
    angle: raw?.angle ?? 160,
    animated: Boolean(raw?.animated)
  };
}

/**
 * То, что переносится между страницами: только оформление. Ни текстов, ни
 * загруженных картинок, ни порядка блоков — это уже содержимое человека.
 */
function styleSnapshot(page) {
  const style = styleDto(page.style);
  delete style.allowCopy;
  delete style.blockOrder;
  delete style.hiddenBlocks;
  const custom = customThemeDto(page.customTheme);
  delete custom.applied;
  delete custom.adjusted;
  return {
    theme: page.theme,
    layout: page.layout,
    font: page.font,
    accent: page.accent || null,
    accentTo: page.accentTo || null,
    avatarFrame: page.avatarFrame,
    effect: page.effect,
    effects: effectsDto(page),
    effectColors: (page.effectColors || []).slice(0, CONTENT_LIMITS.effectColors),
    customTheme: custom,
    style,
    bgGradient: gradientDto(page.bgGradient),
    bgPattern: { kind: page.bgPattern?.kind || 'none', opacity: page.bgPattern?.opacity ?? 35 },
    liveBg: page.liveBg || 'none',
    altTheme: page.altTheme || null,
    themeMode: page.themeMode || 'fixed'
  };
}

/**
 * Снимок стиля из чужих рук (сохранённый набор или ответ «взять стиль»):
 * оставляем только известные поля с допустимыми значениями. Тариф здесь не
 * проверяется — его проверит applyPatch, когда набор применят.
 */
function sanitizeStyleSnapshot(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const known = (list, value) => (list.some(item => item.id === value) ? value : undefined);
  const out = {};
  const hexList = (list, max) => (Array.isArray(list) ? list : [])
    .filter(color => HEX_COLOR.test(String(color)))
    .slice(0, max)
    .map(color => String(color).toLowerCase());
  for (const [key, list] of [['theme', THEMES], ['layout', LAYOUTS], ['font', FONTS], ['avatarFrame', AVATAR_FRAMES], ['effect', EFFECTS]]) {
    const value = known(list, src[key]);
    if (value) out[key] = value;
  }
  // Свой шрифт — файл конкретного человека (и его лицензия), в наборы и
  // «взять стиль» он не переносится.
  if (out.font === 'custom') delete out.font;
  if (Array.isArray(src.effects)) {
    out.effects = [...new Set(src.effects.map(String))].filter(id => id !== 'none' && known(EFFECTS, id)).slice(0, 4);
  }
  if (Array.isArray(src.effectColors)) out.effectColors = hexList(src.effectColors, CONTENT_LIMITS.effectColors);
  if (src.customTheme && typeof src.customTheme === 'object') {
    const custom = { enabled: Boolean(src.customTheme.enabled) };
    for (const key of CUSTOM_THEME_FIELDS) {
      custom[key] = HEX_COLOR.test(String(src.customTheme[key] || '')) ? String(src.customTheme[key]).toLowerCase() : null;
    }
    out.customTheme = custom;
  }
  for (const key of ['accent', 'accentTo']) {
    if (src[key] === null) out[key] = null;
    else if (HEX_COLOR.test(String(src[key] || ''))) out[key] = String(src[key]).toLowerCase();
  }
  if (src.style && typeof src.style === 'object') {
    const style = {};
    for (const key of Object.keys(STYLE_DEFAULTS)) {
      if (key === 'allowCopy' || src.style[key] == null) continue;
      const value = src.style[key];
      if (STYLE_OPTIONS[key]) {
        if (known(STYLE_OPTIONS[key], value)) style[key] = value;
      } else if (STYLE_RANGES[key]) {
        const [min, max] = STYLE_RANGES[key];
        if (Number.isFinite(Number(value))) style[key] = Math.min(max, Math.max(min, Math.round(Number(value))));
      } else if (typeof value === 'boolean') {
        style[key] = value;
      }
    }
    if (Array.isArray(src.style.nameColors)) style.nameColors = hexList(src.style.nameColors, CONTENT_LIMITS.gradientColors);
    if (Array.isArray(src.style.cursorColors)) style.cursorColors = hexList(src.style.cursorColors, 2);
    out.style = style;
  }
  if (src.bgGradient && typeof src.bgGradient === 'object') {
    const colors = (Array.isArray(src.bgGradient.colors) ? src.bgGradient.colors : [])
      .filter(color => HEX_COLOR.test(String(color)))
      .slice(0, CONTENT_LIMITS.gradientColors)
      .map(color => String(color).toLowerCase());
    out.bgGradient = {
      enabled: Boolean(src.bgGradient.enabled) && colors.length >= 2,
      colors,
      angle: Math.min(360, Math.max(0, Math.round(Number(src.bgGradient.angle) || 0))),
      animated: Boolean(src.bgGradient.animated)
    };
  }
  if (src.bgPattern && known(BG_PATTERNS, src.bgPattern.kind)) {
    out.bgPattern = { kind: src.bgPattern.kind, opacity: Math.min(100, Math.max(0, Math.round(Number(src.bgPattern.opacity) || 0))) };
  }
  if (known(LIVE_BACKGROUNDS, src.liveBg)) out.liveBg = src.liveBg;
  if (src.altTheme === null || known(THEMES, src.altTheme)) out.altTheme = src.altTheme ?? null;
  if (known(THEME_MODES, src.themeMode)) out.themeMode = src.themeMode;
  return out;
}

/**
 * Страница для редактора.
 *
 * Собирается поле за полем, а не через toObject(): документ обрастает служебным
 * (editorHandoff, жалобы, внутренние заметки модерации), и «отдать всё, кроме
 * пары полей» — это гарантированная утечка при следующем добавленном поле.
 */
function customLayoutDto(raw) {
  const cells = list => (list || []).map(item => ({ id: item.id, x: item.x, y: item.y, w: item.w, h: item.h }));
  return {
    on: Boolean(raw?.on),
    items: cells(raw?.items),
    rows: raw?.rows || 0,
    phone: cells(raw?.phone),
    phoneRows: raw?.phoneRows || 0
  };
}

function pageDto(page) {
  return {
    enabled: page.enabled,
    theme: page.theme,
    layout: page.layout,
    customLayout: customLayoutDto(page.customLayout),
    font: page.font,
    accent: page.accent,
    accentTo: page.accentTo,
    avatarFrame: page.avatarFrame,
    effect: page.effect,
    effects: effectsDto(page),
    effectColors: (page.effectColors || []).slice(0, CONTENT_LIMITS.effectColors),
    customTheme: customThemeDto(page.customTheme),
    hearts: { enabled: Boolean(page.hearts?.enabled), count: page.hearts?.count || 0 },
    bgPattern: { kind: page.bgPattern?.kind || 'none', opacity: page.bgPattern?.opacity ?? 35 },
    liveBg: page.liveBg || 'none',
    altTheme: page.altTheme || null,
    themeMode: page.themeMode || 'fixed',
    cursorImage: page.cursorImage || null,
    customFont: { url: page.customFont?.url || null, name: page.customFont?.name || '' },
    trailStyle: {
      colors: (page.trailStyle?.colors || []).slice(0, 2),
      width: page.trailStyle?.width ?? 100,
      length: page.trailStyle?.length ?? 560,
      glow: page.trailStyle?.glow !== false
    },
    playlist: (page.playlist || []).map(track => ({ url: track.url, title: track.title || '', artist: track.artist || '' })),
    notifyMilestones: page.notifyMilestones !== false,
    // Черновик: есть ли правки, которых гости ещё не видят.
    draft: {
      dirty: isDirty(page),
      publishedAt: page.published?.at || null
    },
    displayName: page.displayName || '',
    headline: page.headline || '',
    bio: page.bio || '',
    avatar: page.avatar || null,
    banner: page.banner || null,
    links: (page.links || []).map(link => ({ label: link.label || '', url: link.url, icon: link.icon || 'link' })),
    style: styleDto(page.style),
    bgGradient: gradientDto(page.bgGradient),
    gallery: (page.gallery || []).slice(0, CONTENT_LIMITS.gallery),
    invite: {
      code: page.invite?.code || null,
      // Название сферы — только чтобы редактор показал, что именно стоит на
      // странице. Сам код живёт в ссылке, её человек и так вставлял сам.
      name: page.invite?.server?.name || null
    },
    tags: (page.tags || []).slice(0, CONTENT_LIMITS.tags),
    quote: { text: page.quote?.text || '', author: page.quote?.author || '' },
    countdown: { title: page.countdown?.title || '', at: page.countdown?.at || null },
    stylePresets: (page.stylePresets || []).map(preset => ({
      name: preset.name || '',
      data: sanitizeStyleSnapshot(preset.data),
      createdAt: preset.createdAt || null
    })),
    background: {
      kind: page.background?.kind || 'none',
      url: page.background?.url || null,
      blur: page.background?.blur ?? 0,
      dim: page.background?.dim ?? 40
    },
    music: {
      url: page.music?.url || null,
      title: page.music?.title || '',
      artist: page.music?.artist || '',
      volume: page.music?.volume ?? 60
    },
    enterOverlay: {
      enabled: Boolean(page.enterOverlay?.enabled),
      text: page.enterOverlay?.text || 'нажми, чтобы войти'
    },
    showStatus: Boolean(page.showStatus),
    showBadges: Boolean(page.showBadges),
    hideFooter: Boolean(page.hideFooter),
    ogImage: page.ogImage || null,
    pair: {
      partner: personDto(page.pair?.partner),
      since: page.pair?.since || null,
      visible: Boolean(page.pair?.visible)
    },
    closeFriends: (page.closeFriends || []).map(personDto).filter(Boolean),
    closeFriendsChangedAt: page.closeFriendsChangedAt || null,
    views: { total: page.views?.total || 0 },
    moderation: {
      status: page.moderation?.status || 'ok',
      reason: page.moderation?.reason || ''
    },
    updatedAt: page.updatedAt
  };
}

/**
 * Что из сохранённого перестало работать на текущем тарифе.
 *
 * Нужно потому, что настройки при окончании подписки НЕ стираются. Стирать —
 * значит наказывать человека за то, что он перестал платить: вернётся, а
 * страница пустая. Вместо этого храним всё как было, публичный рендер
 * показывает по тарифу, а редактор честно говорит «музыка выключена, потому
 * что Premium закончился».
 */
function lockedInUse(page, tier) {
  const locked = [];
  const check = (feature, inUse) => {
    if (inUse && !hasFeature(tier, feature)) {
      locked.push({ feature, requires: FEATURE_MIN_TIER[feature] });
    }
  };

  // Справочники: тариф берём из самого варианта — у тем и рамок он разный.
  const catalogLock = (feature, list, value) => {
    const item = list.find(entry => entry.id === value);
    if (item && !tierAtLeast(tier, item.tier) && !locked.some(entry => entry.feature === feature && entry.requires === item.tier)) {
      locked.push({ feature, requires: item.tier });
    }
  };

  check('customAccent', Boolean(page.accent));
  check('accentGradient', Boolean(page.accentTo));
  check('backgroundImage', page.background?.kind === 'image');
  check('animatedBackground', page.background?.kind === 'image' && isAnimatedImageUrl(page.background?.url));
  check('videoBackground', page.background?.kind === 'video');
  check('music', Boolean(page.music?.url));
  check('enterOverlay', Boolean(page.enterOverlay?.enabled));
  check('hideFooter', Boolean(page.hideFooter));
  check('gallery', (page.gallery || []).length > 0);
  check('nameGradient', Boolean(page.style?.nameGradient) || ['accent', 'gradient'].includes(page.style?.nameFill));
  check('customTheme', Boolean(page.customTheme?.enabled));
  check('animatedGradient', Boolean(page.bgGradient?.enabled && page.bgGradient?.animated));
  check('avatarTilt', Boolean(page.style?.avatarTilt));
  check('customCursor', Boolean(page.cursorImage) && page.style?.cursor === 'custom');
  check('trailStyle', (page.trailStyle?.colors || []).length > 0 || (page.trailStyle?.width ?? 100) !== 100 || (page.trailStyle?.length ?? 560) !== 560);
  check('playlist', (page.playlist || []).length > 1);
  check('customFont', page.font === 'custom' && Boolean(page.customFont?.url));
  catalogLock('liveBackground', LIVE_BACKGROUNDS, page.liveBg);
  catalogLock('linkMotion', STYLE_OPTIONS.linkMotion, page.style?.linkMotion);
  catalogLock('themeByTime', THEME_MODES, page.themeMode);
  // Сезон темы кончился — честно говорим, почему на странице сейчас Monochrome.
  const seasonal = THEMES.find(theme => theme.id === page.theme);
  if (seasonal && seasonal.season && !seasonActive(seasonal)) locked.push({ feature: 'theme', requires: 'season' });
  check('effectColors', (page.effectColors || []).length > 0);
  for (const id of effectsDto(page)) catalogLock('effects', EFFECTS, id);
  check('statusBlock', Boolean(page.showStatus));
  check('customOgImage', Boolean(page.ogImage));
  check('pairBlock', Boolean(page.pair?.partner && page.pair?.visible));
  check('closeFriends', (page.closeFriends || []).length > 0);
  check('customLayout', Boolean(page.customLayout?.on));

  catalogLock('theme', THEMES, page.theme);
  catalogLock('layout', LAYOUTS, page.layout);
  catalogLock('fontChoice', FONTS, page.font);
  catalogLock('effects', EFFECTS, page.effect);
  catalogLock('avatarFrame', AVATAR_FRAMES, page.avatarFrame);
  catalogLock('nameEffects', STYLE_OPTIONS.nameEffect, page.style?.nameEffect);
  catalogLock('customCursor', STYLE_OPTIONS.cursor, page.style?.cursor);

  const linkLimit = limitsFor(tier).links;
  if ((page.links || []).length > linkLimit) {
    locked.push({ feature: 'links', requires: 'pro', shown: linkLimit });
  }

  return locked;
}

async function loadPopulated(page) {
  return page.populate([
    { path: 'pair.partner', select: 'username nickname avatar' },
    { path: 'closeFriends', select: 'username nickname avatar' },
    { path: 'invite.server', select: 'name' }
  ]);
}

function urlsFor(user, tier, req) {
  return {
    public: publicUrl(user.username, tier, req),
    long: longUrl(user.username, req),
    // Короткую ссылку показываем всегда: на free это и есть та самая витрина
    // «вот как будет с Pro». Работать она начнёт после апгрейда.
    short: shortUrl(user.username, req),
    shortAvailable: hasFeature(tier, 'shortLink')
  };
}

/** GET /api/profile-page/capabilities — матрица тарифа для отрисовки замочков. */
router.get('/capabilities', profileAuth, (req, res) => {
  res.json({
    ...capabilitiesFor(req.tier),
    plan: req.user.plan || 'free',
    planExpiresAt: req.user.planExpiresAt || null,
    urls: urlsFor(req.user, req.tier, req)
  });
});

/** GET /api/profile-page — всё, что нужно редактору при открытии. */
router.get('/', profileAuth, async (req, res) => {
  try {
    await loadPopulated(req.page);

    res.json({
      page: pageDto(req.page),
      // Профиль из мессенджера: редактор показывает его как источник значений
      // по умолчанию («взять аватар из профиля») и для блока статуса.
      account: {
        username: req.user.username,
        nickname: req.user.nickname || '',
        avatar: req.user.avatar || null,
        banner: req.user.banner || null,
        createdAt: req.user.createdAt,
        isVerified: Boolean(req.user.isVerified),
        mood: req.user.mood || '',
        customStatus: req.user.customStatus || '',
        listening: req.user.listening || '',
        hobbies: req.user.hobbies || []
      },
      capabilities: capabilitiesFor(req.tier),
      locked: lockedInUse(req.page, req.tier),
      urls: urlsFor(req.user, req.tier, req)
    });
  } catch (error) {
    console.error('[profile-page] read error:', error.message);
    res.status(500).json({ message: 'Не удалось загрузить страницу' });
  }
});

/* ------------------------------------------------------------------ *
 *  СОХРАНЕНИЕ
 * ------------------------------------------------------------------ */

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const CLOSE_FRIENDS_MAX = 3;
const CLOSE_FRIENDS_COOLDOWN_DAYS = 14;

/**
 * Адрес, по которому посетитель ЩЁЛКАЕТ.
 *
 * Здесь чужие домены разрешены — в этом весь смысл страницы-визитки. Проверка
 * не про домен, а про схему: javascript: и data: в href — это исполнение кода
 * на нашей странице, то есть XSS через настройку профиля.
 */
function isSafeLinkUrl(raw) {
  const value = String(raw || '').trim();
  if (!value || value.length > 400) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function sameIdSet(a, b) {
  const left = new Set(a.map(String));
  const right = new Set(b.map(String));
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

/**
 * Применяет частичное обновление.
 *
 * Ошибку тарифа отдаём как ошибку, а не молча игнорируем поле. Редактор и так
 * знает матрицу возможностей и локи рисует сам, поэтому запрос с закрытой
 * фичей — это либо баг, либо попытка обойти проверку; в обоих случаях врать
 * «сохранено» нельзя.
 */
function applyPatch(page, body, { tier, limits, user, invite }) {
  const errors = [];
  const has = key => Object.prototype.hasOwnProperty.call(body, key);
  const fail = (field, message) => errors.push({ field, message });

  const gate = (field, feature) => {
    if (hasFeature(tier, feature)) return true;
    const requires = FEATURE_MIN_TIER[feature];
    fail(field, requires === 'premium'
      ? 'Это возможность Love Premium'
      : 'Это возможность Love Pro');
    return false;
  };

  const catalog = (field, catalogList, value, featureForMessage) => {
    const item = pickAllowed(catalogList, value, tier);
    if (item) return item;
    // Тариф называем по самому варианту: у шрифтов и тем он разный, и общая
    // фраза «это в Premium» врала бы про то, что открывается уже в Pro.
    const known = catalogList.find(entry => entry.id === value);
    fail(field, known && known.season && !seasonActive(known)
      ? `«${known.name}» можно выбрать только в свой сезон`
      : known
        ? `«${known.name}» — в Love ${known.tier === 'premium' ? 'Premium' : 'Pro'}`
        : featureForMessage || 'Этот вариант недоступен на вашем тарифе');
    return null;
  };

  // --- оформление ---
  if (has('theme') && catalog('theme', THEMES, body.theme, 'Эта тема недоступна на вашем тарифе')) {
    page.theme = body.theme;
  }
  if (has('layout') && catalog('layout', LAYOUTS, body.layout, 'Эта раскладка недоступна на вашем тарифе')) {
    page.layout = body.layout;
  }
  // Выключить свою расстановку можно всегда (после конца подписки тоже),
  // включить или поменять — только на Premium.
  if (has('customLayout')) {
    const next = sanitizeCustomLayout(body.customLayout);
    if (!next.on) {
      // Выключили — клетки оставляем: включат снова, и всё на месте.
      const kept = customLayoutDto(page.customLayout);
      page.customLayout = { ...kept, on: false };
    }
    else if (gate('customLayout', 'customLayout')) page.customLayout = next;
  }
  if (has('font') && catalog('font', FONTS, body.font, 'Этот шрифт — в Love Premium')) {
    page.font = body.font;
  }
  if (has('effect') && catalog('effect', EFFECTS, body.effect, 'Эффекты — в Love Premium')) {
    page.effect = body.effect;
  }

  // Несколько эффектов сразу. Уже стоящие не перепроверяем тарифом — после
  // окончания подписки человек должен суметь убрать лишний, не упираясь в 403.
  if (has('effects')) {
    const raw = Array.isArray(body.effects) ? [...new Set(body.effects.map(String))].filter(id => id !== 'none') : null;
    const current = effectsDto(page);
    if (!raw) {
      fail('effects', 'Эффекты передаются списком');
    } else if (raw.length > Math.max(limits.effectsAtOnce || 1, current.length) || raw.length > 4) {
      fail('effects', `На вашем тарифе до ${limits.effectsAtOnce || 1} эффектов сразу`);
    } else {
      let ok = true;
      for (const id of raw) {
        const item = EFFECTS.find(entry => entry.id === id);
        if (!item) { fail('effects', 'Такого эффекта нет'); ok = false; break; }
        if (!current.includes(id) && !tierAtLeast(tier, item.tier)) {
          fail('effects', `«${item.name}» — в Love ${item.tier === 'premium' ? 'Premium' : 'Pro'}`);
          ok = false;
          break;
        }
      }
      if (ok) {
        page.effects = raw;
        page.effect = raw[0] || 'none';     // старые клиенты читают одно поле
      }
    }
  }

  if (has('effectColors')) {
    const raw = Array.isArray(body.effectColors) ? body.effectColors.map(String) : null;
    const current = (page.effectColors || []).map(String);
    if (!raw || raw.length > CONTENT_LIMITS.effectColors || raw.some(color => !HEX_COLOR.test(color))) {
      fail('effectColors', `Цвета эффектов — до ${CONTENT_LIMITS.effectColors} цветов вида #rrggbb`);
    } else if (!raw.length || raw.join() === current.join() || gate('effectColors', 'effectColors')) {
      page.effectColors = raw.map(color => color.toLowerCase());
    }
  }

  // Конструктор темы: включить или поменять цвета — Premium, выключить — всем.
  if (has('customTheme')) {
    const raw = body.customTheme && typeof body.customTheme === 'object' ? body.customTheme : null;
    if (!raw) {
      fail('customTheme', 'Тема передаётся объектом');
    } else {
      const next = {};
      let bad = false;
      for (const key of CUSTOM_THEME_FIELDS) {
        const value = raw[key];
        if (value == null || value === '') next[key] = null;
        else if (HEX_COLOR.test(String(value))) next[key] = String(value).toLowerCase();
        else { fail(`customTheme.${key}`, 'Цвет указывается в виде #rrggbb'); bad = true; }
      }
      const current = page.customTheme || {};
      const changed = CUSTOM_THEME_FIELDS.some(key => (current[key] || null) !== next[key]);
      const enabling = Boolean(raw.enabled) && !current.enabled;
      if (!bad && (raw.enabled === false || (!changed && !enabling) || gate('customTheme', 'customTheme'))) {
        page.customTheme.enabled = Boolean(raw.enabled);
        for (const key of CUSTOM_THEME_FIELDS) page.customTheme[key] = next[key];
      }
    }
  }
  if (has('avatarFrame') && catalog('avatarFrame', AVATAR_FRAMES, body.avatarFrame, 'Эта рамка недоступна на вашем тарифе')) {
    page.avatarFrame = body.avatarFrame;
  }

  for (const field of ['accent', 'accentTo']) {
    if (!has(field)) continue;
    const value = body[field];
    if (value === null || value === '') {
      page[field] = null;                 // сброс к цвету темы разрешён всем
      continue;
    }
    // Тот же цвет, что уже лежит, — не новая правка: набор стиля и откат
    // присылают его заново и не должны упираться в тариф.
    if (String(value).toLowerCase() === page[field]) continue;
    if (!gate(field, field === 'accentTo' ? 'accentGradient' : 'customAccent')) continue;
    if (!HEX_COLOR.test(String(value))) {
      fail(field, 'Цвет указывается в виде #rrggbb');
      continue;
    }
    page[field] = String(value).toLowerCase();
  }

  // --- текст ---
  if (has('displayName')) page.displayName = normalizeContent(body.displayName, 40);
  if (has('headline')) page.headline = normalizeContent(body.headline, 80);
  if (has('bio')) {
    const bio = normalizeContent(body.bio, limits.bioMaxLength + 1);
    if (bio.length > limits.bioMaxLength) {
      fail('bio', `На вашем тарифе описание до ${limits.bioMaxLength} символов`);
    } else {
      page.bio = bio;
    }
  }

  // --- аватар и баннер ---
  for (const [field, feature] of [['avatar', 'animatedAvatar'], ['banner', 'animatedBanner']]) {
    if (!has(field)) continue;
    const value = body[field];
    if (value === null || value === '') {
      page[field] = null;
      continue;
    }
    if (!isAllowedMediaUrl(value, ['image'])) {
      fail(field, 'Картинку нужно загрузить через редактор');
      continue;
    }
    if (isAnimatedImageUrl(value) && !gate(field, feature)) continue;
    page[field] = String(value);
  }

  // --- ссылки ---
  if (has('links')) {
    const raw = Array.isArray(body.links) ? body.links : null;
    if (!raw) {
      fail('links', 'Ссылки передаются списком');
    } else if (raw.length > limits.links) {
      fail('links', `На вашем тарифе до ${limits.links} ссылок`);
    } else {
      const cleaned = [];
      const clicksByUrl = new Map((page.links || []).map(link => [link.url, link.clicks || 0]));
      let broken = false;
      raw.forEach((entry, index) => {
        const url = String(entry?.url || '').trim();
        if (!isSafeLinkUrl(url)) {
          fail(`links.${index}`, 'Ссылка должна начинаться с http:// или https://');
          broken = true;
          return;
        }
        const icon = String(entry?.icon || 'link');
        cleaned.push({
          label: normalizeContent(entry?.label, 40),
          url,
          icon: LINK_ICON_SET.has(icon) ? icon : 'link',
          clicks: clicksByUrl.get(url) || 0
        });
      });
      if (!broken) page.links = cleaned;
    }
  }

  // --- фон ---
  if (has('background')) {
    const bg = body.background || {};
    const kind = ['none', 'image', 'video'].includes(bg.kind) ? bg.kind : null;
    if (!kind) {
      fail('background.kind', 'Неизвестный тип фона');
    } else if (kind === 'none') {
      page.background.kind = 'none';
      page.background.url = null;
    } else {
      const feature = kind === 'video'
        ? 'videoBackground'
        : isAnimatedImageUrl(bg.url) ? 'animatedBackground' : 'backgroundImage';
      // Тот же файл, что уже стоит, пропускаем без проверки тарифа: ползунки
      // размытия присылают фон целиком.
      const same = kind === page.background.kind && String(bg.url || '') === String(page.background.url || '');
      if (same || gate('background', feature)) {
        if (!isAllowedMediaUrl(bg.url, [kind])) {
          fail('background.url', 'Файл фона нужно загрузить через редактор');
        } else {
          page.background.kind = kind;
          page.background.url = String(bg.url);
        }
      }
    }
    if (bg.blur != null) page.background.blur = Math.min(20, Math.max(0, Number(bg.blur) || 0));
    if (bg.dim != null) page.background.dim = Math.min(85, Math.max(0, Number(bg.dim) || 0));
  }

  // --- музыка ---
  if (has('music')) {
    const music = body.music || {};
    if (music.url === null || music.url === '') {
      page.music.url = null;
      page.music.title = '';
      page.music.artist = '';
    } else if (gate('music', 'music')) {
      if (!isAllowedMediaUrl(music.url, ['audio'])) {
        fail('music.url', 'Трек нужно загрузить через редактор');
      } else {
        page.music.url = String(music.url);
        page.music.title = normalizeContent(music.title, 80);
        page.music.artist = normalizeContent(music.artist, 80);
      }
    }
    if (music.volume != null) {
      page.music.volume = Math.min(100, Math.max(0, Number(music.volume) || 0));
    }
  }

  // --- экран входа ---
  if (has('enterOverlay')) {
    const overlay = body.enterOverlay || {};
    if (overlay.enabled === false) {
      page.enterOverlay.enabled = false;
    } else if (overlay.enabled === true && gate('enterOverlay', 'enterOverlay')) {
      page.enterOverlay.enabled = true;
    }
    if (overlay.text != null) {
      page.enterOverlay.text = normalizeContent(overlay.text, 40) || 'нажми, чтобы войти';
    }
  }

  // --- свой градиент фона ---
  if (has('bgGradient')) {
    const raw = body.bgGradient || {};
    const colors = Array.isArray(raw.colors) ? raw.colors.map(String) : [];
    if (colors.length > CONTENT_LIMITS.gradientColors || colors.some(color => !HEX_COLOR.test(color))) {
      fail('bgGradient', `Градиент — от двух до ${CONTENT_LIMITS.gradientColors} цветов вида #rrggbb`);
    } else if (raw.enabled && colors.length < 2) {
      fail('bgGradient', 'Для градиента нужно минимум два цвета');
    } else {
      page.bgGradient.enabled = Boolean(raw.enabled);
      page.bgGradient.colors = colors.map(color => color.toLowerCase());
      if (raw.angle != null) page.bgGradient.angle = Math.min(360, Math.max(0, Math.round(Number(raw.angle) || 0)));
      if (raw.animated != null) {
        if (!raw.animated || page.bgGradient.animated) page.bgGradient.animated = Boolean(raw.animated);
        else if (gate('bgGradient.animated', 'animatedGradient')) page.bgGradient.animated = true;
      }
    }
  }

  // --- детали оформления ---
  //
  // Редактор присылает объект целиком, поэтому неизменённые значения не
  // проверяются тарифом: курсор, оставшийся от закончившейся подписки, не
  // должен блокировать смену формы ссылок.
  if (has('style')) {
    const raw = body.style && typeof body.style === 'object' ? body.style : null;
    if (!raw) {
      fail('style', 'Оформление передаётся объектом');
    } else {
      const current = page.style || {};
      const next = {};
      for (const key of Object.keys(STYLE_DEFAULTS)) {
        if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
        const value = raw[key];
        if (value === (current[key] ?? STYLE_DEFAULTS[key])) continue;
        if (STYLE_OPTIONS[key]) {
          const item = STYLE_OPTIONS[key].find(option => option.id === value);
          if (!item) {
            fail(`style.${key}`, 'Такого варианта нет');
          } else if (!tierAtLeast(tier, item.tier)) {
            fail(`style.${key}`, item.tier === 'premium' ? 'Это возможность Love Premium' : 'Это возможность Love Pro');
          } else {
            next[key] = value;
          }
        } else if (STYLE_RANGES[key]) {
          const [min, max] = STYLE_RANGES[key];
          const number = Number(value);
          if (!Number.isFinite(number)) fail(`style.${key}`, 'Нужно число');
          else next[key] = Math.min(max, Math.max(min, Math.round(number)));
        } else if (typeof value !== 'boolean') {
          fail(`style.${key}`, 'Нужно да или нет');
        } else if (key === 'nameGradient' && value && !gate('style.nameGradient', 'nameGradient')) {
          // gate уже записал ошибку
        } else if (key === 'avatarTilt' && value && !gate('style.avatarTilt', 'avatarTilt')) {
          // gate уже записал ошибку
        } else if (key === 'sounds' && value && !gate('style.sounds', 'pageSounds')) {
          // gate уже записал ошибку
        } else {
          next[key] = value;
        }
      }
      if (Object.prototype.hasOwnProperty.call(raw, 'nameColors')) {
        const colors = Array.isArray(raw.nameColors) ? raw.nameColors.map(String) : null;
        if (!colors || colors.length > CONTENT_LIMITS.gradientColors || colors.some(color => !HEX_COLOR.test(color))) {
          fail('style.nameColors', `Цвета имени — до ${CONTENT_LIMITS.gradientColors} цветов вида #rrggbb`);
        } else {
          next.nameColors = colors.map(color => color.toLowerCase());
        }
      }
      if (Object.prototype.hasOwnProperty.call(raw, 'cursorColors')) {
        const colors = Array.isArray(raw.cursorColors) ? raw.cursorColors.map(String) : null;
        const current = (page.style?.cursorColors || []).map(String);
        if (!colors || colors.length > 2 || colors.some(color => !HEX_COLOR.test(color))) {
          fail('style.cursorColors', 'Цвет курсора — один или два цвета вида #rrggbb');
        } else if (!colors.length || colors.join().toLowerCase() === current.join() || gate('style.cursorColors', 'customCursor')) {
          next.cursorColors = colors.map(color => color.toLowerCase());
        }
      }
      if (Object.prototype.hasOwnProperty.call(raw, 'blockOrder')) next.blockOrder = normalizeBlockOrder(raw.blockOrder);
      if (Object.prototype.hasOwnProperty.call(raw, 'hiddenBlocks')) {
        next.hiddenBlocks = [...new Set((Array.isArray(raw.hiddenBlocks) ? raw.hiddenBlocks : []).map(String))]
          .filter(id => BLOCK_IDS.includes(id));
      }
      for (const [key, value] of Object.entries(next)) page.style[key] = value;
    }
  }

  // --- галерея ---
  if (has('gallery')) {
    const raw = Array.isArray(body.gallery) ? body.gallery.map(String) : null;
    const current = (page.gallery || []).map(String);
    // Убрать картинку можно на любом тарифе — добавить только с Pro.
    const onlyRemoving = raw && raw.every(url => current.includes(url));
    if (!raw) {
      fail('gallery', 'Галерея передаётся списком');
    } else if (raw.length > CONTENT_LIMITS.gallery) {
      fail('gallery', `В галерее до ${CONTENT_LIMITS.gallery} картинок`);
    } else if (onlyRemoving || gate('gallery', 'gallery')) {
      const bad = raw.find(url => !isAllowedMediaUrl(url, ['image']));
      if (bad) fail('gallery', 'Картинки нужно загрузить через редактор');
      else page.gallery = [...new Set(raw)];
    }
  }

  // --- приглашение в сферу (проверено заранее, нужен запрос в базу) ---
  if (has('invite')) {
    if (!invite || invite.clear) {
      page.invite.code = null;
      page.invite.server = null;
    } else if (invite.error) {
      fail('invite', invite.error);
    } else {
      page.invite.code = invite.code;
      page.invite.server = invite.server;
    }
  }

  // --- интересы ---
  if (has('tags')) {
    const raw = Array.isArray(body.tags) ? body.tags : null;
    if (!raw) {
      fail('tags', 'Интересы передаются списком');
    } else {
      const seen = new Set();
      const tags = [];
      for (const entry of raw) {
        const tag = normalizeContent(entry, CONTENT_LIMITS.tagLength);
        const key = tag.toLocaleLowerCase('ru');
        if (tag && !seen.has(key)) { seen.add(key); tags.push(tag); }
      }
      if (tags.length > CONTENT_LIMITS.tags) fail('tags', `Интересов может быть до ${CONTENT_LIMITS.tags}`);
      else page.tags = tags;
    }
  }

  // --- цитата ---
  if (has('quote')) {
    const quote = body.quote || {};
    page.quote.text = normalizeContent(quote.text, CONTENT_LIMITS.quote);
    page.quote.author = normalizeContent(quote.author, CONTENT_LIMITS.quoteAuthor);
  }

  // --- таймер ---
  if (has('countdown')) {
    const countdown = body.countdown || {};
    page.countdown.title = normalizeContent(countdown.title, CONTENT_LIMITS.countdownTitle);
    if (countdown.at === null || countdown.at === '') {
      page.countdown.at = null;
    } else if (countdown.at != null) {
      const at = new Date(countdown.at);
      const year = 365 * 24 * 60 * 60 * 1000;
      if (!Number.isFinite(at.getTime()) || at.getTime() > Date.now() + 10 * year || at.getTime() < Date.now() - year) {
        fail('countdown.at', 'Дата таймера — не дальше десяти лет вперёд и года назад');
      } else {
        page.countdown.at = at;
      }
    }
  }

  // --- свои наборы оформления ---
  if (has('stylePresets')) {
    const raw = Array.isArray(body.stylePresets) ? body.stylePresets : null;
    if (!raw) {
      fail('stylePresets', 'Наборы передаются списком');
    } else if (raw.length > CONTENT_LIMITS.stylePresets) {
      fail('stylePresets', `Сохранить можно до ${CONTENT_LIMITS.stylePresets} наборов`);
    } else if (raw.length <= (page.stylePresets || []).length || gate('stylePresets', 'stylePresets')) {
      page.stylePresets = raw.map(preset => ({
        name: normalizeContent(preset?.name, CONTENT_LIMITS.presetName) || 'Мой стиль',
        data: sanitizeStyleSnapshot(preset?.data),
        createdAt: preset?.createdAt && Number.isFinite(new Date(preset.createdAt).getTime()) ? new Date(preset.createdAt) : new Date()
      }));
    }
  }

  // --- узор фона, живой фон, вторая тема ---
  if (has('bgPattern')) {
    const raw = body.bgPattern || {};
    if (!BG_PATTERNS.some(item => item.id === raw.kind)) {
      fail('bgPattern', 'Такого узора нет');
    } else {
      page.bgPattern.kind = raw.kind;
      if (raw.opacity != null) page.bgPattern.opacity = Math.min(100, Math.max(0, Math.round(Number(raw.opacity) || 0)));
    }
  }
  if (has('liveBg') && (body.liveBg === page.liveBg || catalog('liveBg', LIVE_BACKGROUNDS, body.liveBg))) {
    page.liveBg = body.liveBg;
  }
  if (has('altTheme')) {
    if (body.altTheme === null || body.altTheme === '') page.altTheme = null;
    else if (catalog('altTheme', THEMES, body.altTheme)) page.altTheme = body.altTheme;
  }
  if (has('themeMode') && (body.themeMode === page.themeMode || catalog('themeMode', THEME_MODES, body.themeMode))) {
    page.themeMode = body.themeMode;
  }

  // --- свой курсор и шлейф ---
  if (has('cursorImage')) {
    if (body.cursorImage === null || body.cursorImage === '') page.cursorImage = null;
    else if (!isAllowedMediaUrl(body.cursorImage, ['image']) || /["'()\\\s]/.test(String(body.cursorImage))) fail('cursorImage', 'Курсор нужно загрузить через редактор');
    else if (String(body.cursorImage) === page.cursorImage || gate('cursorImage', 'customCursor')) page.cursorImage = String(body.cursorImage);
  }
  if (has('trailStyle')) {
    const raw = body.trailStyle || {};
    const colors = Array.isArray(raw.colors) ? raw.colors.map(String) : [];
    const current = page.trailStyle || {};
    const next = {
      colors: colors.map(color => color.toLowerCase()),
      width: Math.min(300, Math.max(40, Math.round(Number(raw.width ?? current.width ?? 100)) || 100)),
      length: Math.min(1600, Math.max(200, Math.round(Number(raw.length ?? current.length ?? 560)) || 560)),
      glow: raw.glow !== false
    };
    const changed = next.colors.join() !== (current.colors || []).join() || next.width !== (current.width ?? 100)
      || next.length !== (current.length ?? 560) || next.glow !== (current.glow !== false);
    const reset = !next.colors.length && next.width === 100 && next.length === 560 && next.glow;
    if (colors.length > 2 || colors.some(color => !HEX_COLOR.test(color))) {
      fail('trailStyle', 'Цвета шлейфа — до двух цветов вида #rrggbb');
    } else if (!changed || reset || gate('trailStyle', 'trailStyle')) {
      page.trailStyle = next;
    }
  }

  // --- плейлист ---
  if (has('playlist')) {
    const raw = Array.isArray(body.playlist) ? body.playlist : null;
    const current = (page.playlist || []).map(track => track.url);
    if (!raw) {
      fail('playlist', 'Плейлист передаётся списком');
    } else if (raw.length > CONTENT_LIMITS.playlist) {
      fail('playlist', `В плейлисте до ${CONTENT_LIMITS.playlist} треков`);
    } else if (raw.some(track => !isAllowedMediaUrl(track?.url, ['audio']))) {
      fail('playlist', 'Треки нужно загрузить через редактор');
    } else if (raw.length <= 1 || raw.every(track => current.includes(String(track.url))) || gate('playlist', 'playlist')) {
      page.playlist = raw.map(track => ({
        url: String(track.url),
        title: normalizeContent(track.title, 80),
        artist: normalizeContent(track.artist, 80)
      }));
    }
  }

  if (has('notifyMilestones')) page.notifyMilestones = body.notifyMilestones !== false;

  // --- свой шрифт ---
  if (has('customFont')) {
    const raw = body.customFont || {};
    if (raw.url === null || raw.url === '') {
      page.customFont.url = null;
      page.customFont.name = '';
      if (page.font === 'custom') page.font = 'system';
    } else if (!isAllowedMediaUrl(raw.url, ['font']) || /["'()\\\s]/.test(String(raw.url))) {
      fail('customFont', 'Шрифт нужно загрузить через редактор');
    } else if (String(raw.url) === page.customFont?.url || gate('customFont', 'customFont')) {
      page.customFont.url = String(raw.url);
      page.customFont.name = normalizeContent(raw.name, 60);
    }
  }

  // --- сердечко: владелец только включает и выключает, счётчик не пишется ---
  if (has('hearts')) {
    const hearts = body.hearts || {};
    if (typeof hearts.enabled !== 'boolean') fail('hearts', 'Нужно да или нет');
    else if (!hearts.enabled || gate('hearts', 'hearts')) page.hearts.enabled = hearts.enabled;
  }

  // --- переключатели ---
  if (has('showStatus')) {
    if (body.showStatus === false) page.showStatus = false;
    else if (gate('showStatus', 'statusBlock')) page.showStatus = true;
  }
  if (has('showBadges')) {
    if (body.showBadges === false) page.showBadges = false;
    else if (gate('showBadges', 'badges')) page.showBadges = true;
  }
  if (has('hideFooter')) {
    if (body.hideFooter === false) page.hideFooter = false;
    else if (gate('hideFooter', 'hideFooter')) page.hideFooter = true;
  }

  // --- картинка превью ссылки ---
  if (has('ogImage')) {
    if (body.ogImage === null || body.ogImage === '') {
      page.ogImage = null;
    } else if (gate('ogImage', 'customOgImage')) {
      if (!isAllowedMediaUrl(body.ogImage, ['image'])) {
        fail('ogImage', 'Картинку превью нужно загрузить через редактор');
      } else {
        page.ogImage = String(body.ogImage);
      }
    }
  }

  // --- пара ---
  //
  // Партнёра можно указать только из своих друзей. Иначе страница становится
  // способом публично приписать себе кого угодно — это травля, а не украшение.
  if (has('pair')) {
    const pair = body.pair || {};
    const friendIds = new Set((user.friends || []).map(String));

    if (pair.partnerId === null || pair.partnerId === '') {
      page.pair.partner = null;
      page.pair.visible = false;
      page.pair.since = null;
    } else if (pair.partnerId != null && gate('pair', 'pairBlock')) {
      if (!friendIds.has(String(pair.partnerId))) {
        fail('pair.partnerId', 'Указать можно только человека из списка друзей');
      } else {
        page.pair.partner = pair.partnerId;
      }
    }

    if (pair.since != null) {
      const since = new Date(pair.since);
      if (!Number.isFinite(since.getTime()) || since.getTime() > Date.now()) {
        fail('pair.since', 'Дата не может быть в будущем');
      } else {
        page.pair.since = since;
      }
    }
    if (pair.visible != null) {
      if (pair.visible === false) page.pair.visible = false;
      else if (gate('pair', 'pairBlock')) page.pair.visible = Boolean(page.pair.partner);
    }
  }

  // --- близкие ---
  if (has('closeFriends')) {
    const raw = Array.isArray(body.closeFriends) ? body.closeFriends.map(String) : null;
    if (!raw) {
      fail('closeFriends', 'Близкие передаются списком');
    } else if (raw.length > CLOSE_FRIENDS_MAX) {
      fail('closeFriends', `Близких может быть не больше ${CLOSE_FRIENDS_MAX}`);
    } else if (raw.length && !hasFeature(tier, 'closeFriends')) {
      fail('closeFriends', 'Это возможность Love Premium');
    } else {
      const friendIds = new Set((user.friends || []).map(String));
      const outsider = raw.find(id => !friendIds.has(id));
      const unique = new Set(raw);

      if (outsider) {
        fail('closeFriends', 'Близкими можно отметить только друзей');
      } else if (unique.size !== raw.length) {
        fail('closeFriends', 'Один человек не может занимать два места');
      } else {
        const current = (page.closeFriends || []).map(String);
        const removing = current.filter(id => !unique.has(id));
        const changedAt = page.closeFriendsChangedAt ? new Date(page.closeFriendsChangedAt).getTime() : 0;
        const cooldownMs = CLOSE_FRIENDS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
        const waitMs = changedAt + cooldownMs - Date.now();

        // Добавлять свободно, убирать — раз в 14 дней. Смысл в том, что бейдж
        // «у кого-то в близких» видят у себя и сами близкие: выдать и отобрать
        // его пять раз за вечер — это не настройка, это издевательство.
        //
        // Полная очистка списка под кулдаун попадает наравне с точечным
        // удалением, и это не оплошность. Освободи её — и обход становится
        // однострочным: очистил всех, добавил кого хотел, кулдаун не тронут.
        // Тогда механизма нет вообще, а страдает ровно тот, кого он защищает.
        if (removing.length && waitMs > 0) {
          const days = Math.ceil(waitMs / (24 * 60 * 60 * 1000));
          fail('closeFriends', `Убрать кого-то из близких можно будет через ${days} дн.`);
        } else {
          if (removing.length) page.closeFriendsChangedAt = new Date();
          if (!sameIdSet(current, raw)) page.closeFriends = raw;
        }
      }
    }
  }

  return errors;
}

/** PUT /api/profile-page — частичное сохранение. */
router.put('/', profileAuth, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    // Первая правка после появления черновиков: сначала запоминаем, что
    // сейчас видят гости, и только потом меняем поля.
    ensurePublished(req.page);
    const errors = applyPatch(req.page, body, {
      tier: req.tier,
      limits: req.limits,
      user: req.user,
      invite: Object.prototype.hasOwnProperty.call(body, 'invite') ? await resolveInvitePatch(body.invite, req.user) : null
    });

    if (errors.length) {
      return res.status(400).json({ message: errors[0].message, errors });
    }

    await req.page.save();
    await loadPopulated(req.page);

    res.json({ page: pageDto(req.page), locked: lockedInUse(req.page, req.tier) });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({ message: 'Не получилось сохранить: проверьте поля' });
    }
    console.error('[profile-page] save error:', error.message);
    res.status(500).json({ message: 'Не удалось сохранить' });
  }
});

/**
 * POST /api/profile-page/preview — как страница выглядит с этими правками.
 *
 * Ничего не сохраняет. Правки применяются к загруженному документу и уходят в
 * тот же рендер, что и настоящая страница, а документ после ответа выбрасывается
 * вместе с запросом — `save()` здесь нет и быть не должно.
 *
 * Зачем отдельный запрос вместо сборки превью в браузере: страница собирается на
 * сервере, и клиентская копия рендера начала бы расходиться с настоящей на
 * первой же правке темы. Расхождение в превью — худший вид ошибки: человек
 * настраивает одно, гости видят другое.
 *
 * Правки проверяются теми же правилами, что при сохранении. Отказ отдаём тем же
 * форматом — редактор покажет его на поле, не дожидаясь, пока автосохранение
 * получит тот же 400.
 */
router.post('/preview', profileAuth, async (req, res) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const errors = applyPatch(req.page, body, {
      tier: req.tier,
      limits: req.limits,
      user: req.user,
      invite: Object.prototype.hasOwnProperty.call(body, 'invite') ? await resolveInvitePatch(body.invite, req.user) : null
    });

    if (errors.length) {
      return res.status(400).json({ message: errors[0].message, errors });
    }

    await loadPopulated(req.page);

    const view = buildView(req.page, req.user, req.tier);
    view.invite = await loadInviteCard({ user: req.user._id, invite: { code: req.page.invite?.code, server: req.page.invite?.server?._id || req.page.invite?.server } }, req);
    const fragment = renderPreviewFragment(view, { siteUrl: SITE_URL });

    res.json(fragment);
  } catch (error) {
    console.error('[profile-page] preview error:', error.message);
    res.status(500).json({ message: 'Не удалось собрать превью' });
  }
});

/* ------------------------------------------------------------------ *
 *  ПУБЛИКАЦИЯ
 * ------------------------------------------------------------------ */

/**
 * POST /api/profile-page/enable
 *
 * Отдельной кнопкой, а не полем в общем сохранении: публикация — это
 * осознанное действие, у него свои условия, и человек должен нажать её сам.
 */
router.post('/enable', profileAuth, async (req, res) => {
  try {
    // Непроверенная почта + публичная страница = готовый инструмент для
    // одноразовых аккаунтов под спам. Внутри мессенджера это терпимо, наружу —
    // нет.
    if (!req.user.isVerified) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Сначала подтвердите почту — публичную страницу можно включить только после этого'
      });
    }

    // Ник стал адресом. Список зарезервированных имён вырос уже после того,
    // как люди зарегистрировались, поэтому у кого-то ник может оказаться
    // непригодным для публичной ссылки. Отбирать ник задним числом нельзя,
    // а публиковать me.loveapp.chat/support — тоже: страницу не отличить от
    // нашей собственной.
    const usernameError = getUsernameValidationError(req.user.username);
    if (usernameError) {
      return res.status(409).json({
        code: 'USERNAME_NOT_PUBLISHABLE',
        message: `Ник «${req.user.username}» нельзя использовать в публичном адресе: ${usernameError.toLowerCase()}. Смените ник в профиле, и страница включится.`
      });
    }

    if (req.page.moderation?.status === 'hidden') {
      return res.status(403).json({
        code: 'PAGE_HIDDEN',
        message: req.page.moderation.reason
          ? `Страница скрыта модерацией: ${req.page.moderation.reason}`
          : 'Страница скрыта модерацией'
      });
    }

    req.page.enabled = true;
    const firstTime = !req.page.firstEnabledAt;
    if (firstTime) req.page.firstEnabledAt = new Date();
    if (DRAFTS_ON && (firstTime || !req.page.published?.data)) {
      // Первая публикация: гости должны увидеть то, что человек собрал, а не
      // пустую страницу из снимка до первой правки.
      const withVersions = await ProfilePage.findById(req.page._id).select('+versions');
      req.page.versions = withVersions.versions || [];
      publish(req.page);
    }
    await req.page.save();

    res.json({ enabled: true, urls: urlsFor(req.user, req.tier, req) });
  } catch (error) {
    console.error('[profile-page] enable error:', error.message);
    res.status(500).json({ message: 'Не удалось включить страницу' });
  }
});

/**
 * POST /api/profile-page/publish — показать гостям черновик.
 * Прошлая опубликованная версия уходит в историю (до 20 штук).
 */
router.post('/publish', profileAuth, async (req, res) => {
  try {
    const page = await ProfilePage.findById(req.page._id).select('+versions');
    if (page.moderation?.status === 'hidden') {
      return res.status(403).json({ code: 'PAGE_HIDDEN', message: 'Страница скрыта модерацией' });
    }
    publish(page);
    await page.save();
    await loadPopulated(page);
    res.json({ page: pageDto(page), locked: lockedInUse(page, req.tier) });
  } catch (error) {
    console.error('[profile-page] publish error:', error.message);
    res.status(500).json({ message: 'Не удалось опубликовать' });
  }
});

/** POST /api/profile-page/draft/discard — вернуть черновик к опубликованному. */
router.post('/draft/discard', profileAuth, async (req, res) => {
  try {
    if (req.page.published?.data) applySnapshot(req.page, req.page.published.data);
    await req.page.save();
    await loadPopulated(req.page);
    res.json({ page: pageDto(req.page), locked: lockedInUse(req.page, req.tier) });
  } catch (error) {
    console.error('[profile-page] discard error:', error.message);
    res.status(500).json({ message: 'Не удалось отменить изменения' });
  }
});

/** Короткое описание версии для списка: что в ней было главным. */
function versionSummary(data) {
  const theme = THEMES.find(item => item.id === data?.theme);
  return {
    theme: data?.customTheme?.enabled ? 'Своя тема' : (theme ? theme.name : ''),
    links: Array.isArray(data?.links) ? data.links.length : 0,
    title: data?.displayName || ''
  };
}

/** GET /api/profile-page/versions — история публикаций, новые сверху. */
router.get('/versions', profileAuth, async (req, res) => {
  try {
    const page = await ProfilePage.findById(req.page._id).select('+versions').lean();
    const list = (page.versions || []).slice().reverse().map(version => ({
      at: version.at,
      ...versionSummary(version.data)
    }));
    res.json({ versions: list, publishedAt: page.published?.at || null });
  } catch (error) {
    console.error('[profile-page] versions error:', error.message);
    res.status(500).json({ message: 'Не удалось загрузить историю' });
  }
});

/**
 * POST /api/profile-page/versions/restore { at } — положить версию в черновик.
 * Гости её увидят только после «Опубликовать»: откат тоже можно сначала
 * посмотреть в превью.
 */
router.post('/versions/restore', profileAuth, async (req, res) => {
  try {
    const page = await ProfilePage.findById(req.page._id).select('+versions');
    const at = new Date(req.body?.at);
    const version = (page.versions || []).find(item => new Date(item.at).getTime() === at.getTime());
    if (!version) return res.status(404).json({ message: 'Такой версии нет' });
    applySnapshot(page, version.data);
    await page.save();
    await loadPopulated(page);
    res.json({ page: pageDto(page), locked: lockedInUse(page, req.tier) });
  } catch (error) {
    console.error('[profile-page] restore error:', error.message);
    res.status(500).json({ message: 'Не удалось вернуть версию' });
  }
});

/** POST /api/profile-page/disable — снять с публикации. Настройки остаются. */
router.post('/disable', profileAuth, async (req, res) => {
  try {
    req.page.enabled = false;
    await req.page.save();
    res.json({ enabled: false });
  } catch (error) {
    console.error('[profile-page] disable error:', error.message);
    res.status(500).json({ message: 'Не удалось выключить страницу' });
  }
});

/* ------------------------------------------------------------------ *
 *  ФАЙЛЫ
 * ------------------------------------------------------------------ */

// Что можно грузить в каждый слот и какая возможность за это отвечает.
// Тип файла определяется по содержимому в storeProfileAsset, здесь — только
// правило «в этот слот такое кладут».
const ASSET_SLOTS = Object.freeze({
  avatar: { kinds: { image: null } },
  banner: { kinds: { image: null } },
  background: { kinds: { image: 'backgroundImage', video: 'videoBackground' } },
  music: { kinds: { audio: 'music' } },
  og: { kinds: { image: 'customOgImage' } },
  gallery: { kinds: { image: 'gallery' } },
  cursor: { kinds: { image: 'customCursor' } },
  font: { kinds: { font: 'customFont' } }
});

/**
 * POST /api/profile-page/asset?slot=avatar
 *
 * Единственный путь, которым медиа попадает на страницу. Поля avatar/banner/
 * background/music/og в PUT принимают только адреса на наших хостах, так что
 * вставить чужую ссылку руками нельзя — см. utils/profileMedia.
 */
router.post('/asset', profileAuth, uploadLimiter, async (req, res) => {
  try {
    const slotName = String(req.query.slot || req.body?.slot || '');
    const slot = ASSET_SLOTS[slotName];
    if (!slot) return res.status(400).json({ message: 'Неизвестный слот для файла' });

    const allowedKinds = Object.entries(slot.kinds)
      .filter(([, feature]) => !feature || hasFeature(req.tier, feature))
      .map(([kind]) => kind);

    if (!allowedKinds.length) {
      const requires = Object.values(slot.kinds)[0];
      return res.status(403).json({
        code: 'TIER_REQUIRED',
        requires: FEATURE_MIN_TIER[requires],
        message: FEATURE_MIN_TIER[requires] === 'premium'
          ? 'Это возможность Love Premium'
          : 'Это возможность Love Pro'
      });
    }

    const file = req.files && (req.files.file || req.files.asset);
    if (!file) return res.status(400).json({ message: 'Файл не передан' });

    const result = await storeProfileAsset(file, {
      maxBytes: req.limits.assetBytes,
      allowedKinds
    });
    if (result.error) return res.status(400).json({ message: result.error });

    // Локальное хранилище отдаёт путь, странице нужен абсолютный адрес —
    // и обязательно на медиа-хосте, а не на хосте редактора.
    const url = result.url || `${mediaOrigin(req)}${result.path}`;

    // Самопроверка: адрес, который мы только что собрали, должен проходить
    // ту же проверку, что и PUT. Если не проходит — неправильно настроены
    // PROFILE_MEDIA_HOSTS или API_ORIGIN, и молча вернуть ссылку нельзя:
    // человек нажмёт «сохранить» и получит непонятную ошибку.
    if (!isAllowedMediaUrl(url, [result.kind])) {
      console.error('[profile-page] stored asset URL rejected by own allowlist:', url);
      return res.status(500).json({ message: 'Файл загружен, но сервер настроен неверно — сообщите нам' });
    }

    res.json({ url, kind: result.kind, slot: slotName });
  } catch (error) {
    console.error('[profile-page] asset error:', error.message);
    res.status(500).json({ message: 'Не удалось загрузить файл' });
  }
});

/* ------------------------------------------------------------------ *
 *  СТАТИСТИКА, ДРУЗЬЯ, ЖАЛОБЫ
 * ------------------------------------------------------------------ */

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

/** GET /api/profile-page/stats — счётчик просмотров по дням. */
router.get('/stats', profileAuth, (req, res) => {
  const hearts = req.page.hearts?.count || 0;
  // Аналитика копится всем, отдаётся с Pro. Неделя — 168 часов по UTC:
  // редактор сам сдвигает её в часовой пояс владельца.
  const analytics = hasFeature(req.tier, 'analytics')
    ? {
      sources: req.page.analytics?.sources || {},
      week: Array.from({ length: 168 }, (_, hour) => Number(req.page.analytics?.week?.[hour]) || 0),
      cta: req.page.analytics?.cta || 0
    }
    : null;
  const links = hasFeature(req.tier, 'linkStats')
    ? (req.page.links || []).map(link => ({ label: link.label || '', url: link.url, clicks: link.clicks || 0 }))
    : null;

  if (!hasFeature(req.tier, 'viewStats')) {
    return res.json({
      available: false,
      requires: FEATURE_MIN_TIER.viewStats,
      total: hasFeature(req.tier, 'viewCount') ? (req.page.views?.total || 0) : null,
      links,
      linksRequire: FEATURE_MIN_TIER.linkStats,
      hearts,
      analytics,
      analyticsRequire: FEATURE_MIN_TIER.analytics
    });
  }

  const days = req.limits.viewStatsDays;
  const stored = new Map((req.page.views?.daily || []).map(entry => [entry.day, entry.count]));

  // Дни без просмотров заполняем нулями: иначе на графике образуются дыры и
  // «вчера» рисуется на месте позапрошлой недели.
  const series = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = dayKey(new Date(Date.now() - offset * 24 * 60 * 60 * 1000));
    series.push({ day, count: stored.get(day) || 0 });
  }

  res.json({
    available: true,
    days,
    total: req.page.views?.total || 0,
    series,
    links,
    linksRequire: FEATURE_MIN_TIER.linkStats,
    hearts,
    analytics,
    analyticsRequire: FEATURE_MIN_TIER.analytics
  });
});

/* ------------------------------------------------------------------ *
 *  СЕРДЕЧКО
 * ------------------------------------------------------------------ */

/**
 * POST /api/profile-page/heart — посетитель поставил или снял сердечко.
 * { username, token, action: 'like' | 'unlike' } → { count, liked }.
 *
 * Слои защиты от накрутки описаны в utils/profileHearts. Здесь важен порядок:
 * сначала дешёвые проверки в памяти, потом одна выборка страницы, и только
 * потом запись — так поток мусора до базы почти не доходит.
 */
router.post('/heart', profilePageLimiter, async (req, res) => {
  const refuse = (status, message) => res.status(status).json({ message });
  try {
    const ua = String(req.headers['user-agent'] || '');
    const username = String(req.body?.username || '').trim().replace(/^@/, '').slice(0, 32);
    const action = req.body?.action === 'unlike' ? 'unlike' : req.body?.action === 'like' ? 'like' : null;
    if (!ua || CLICK_BOT_UA.test(ua) || !username || !action) return refuse(400, 'Не получилось');

    const ipHash = ipHashOf(req);
    if (!heartRateOk(ipHash)) return refuse(429, 'Слишком часто. Попробуйте чуть позже');

    const owner = await User.findOne({ username }).collation({ locale: 'en', strength: 2 }).select('_id isBanned plan planExpiresAt').lean();
    if (!owner || owner.isBanned) return refuse(404, 'Страница не найдена');
    const page = await ProfilePage.findOne({ user: owner._id }).select('_id enabled hearts published moderation.status');
    if (!page || !page.enabled || page.moderation?.status === 'hidden') return refuse(404, 'Страница не найдена');
    // Включено ли сердечко — смотрим опубликованное: в черновике его могли
    // уже включить, но гости кнопки ещё не видят.
    const heartsOn = DRAFTS_ON && page.published?.data ? Boolean(page.published.data.hearts?.enabled) : Boolean(page.hearts?.enabled);
    if (!heartsOn || !hasFeature(resolveTier(owner), 'hearts')) return refuse(404, 'Сердечки здесь выключены');
    if (!verifyHeartToken(req.body?.token, page._id)) return refuse(403, 'Обновите страницу и попробуйте ещё раз');
    if (isOwnerVisit(req, page._id)) return refuse(403, 'Своей странице сердечко не ставят');

    const key = visitorKeyOf(req, page._id);
    let liked;
    if (action === 'like') {
      const already = await ProfileHeartMark.exists({ page: page._id, key });
      if (already) {
        liked = true;
      } else {
        // Занимаем свободное место в квоте адреса. Уникальный индекс
        // (страница, адрес, место) не даёт двум параллельным гостям занять
        // одно и то же: проигравший пробует следующее, а когда мест нет — отказ.
        let placed = false, duplicate = false;
        for (let slot = 0; slot < HEARTS_PER_IP && !placed && !duplicate; slot += 1) {
          try {
            await ProfileHeartMark.create({ page: page._id, key, ipHash, slot });
            placed = true;
          } catch (error) {
            if (error.code !== 11000) throw error;
            // Конфликт по ключу посетителя — это его же параллельный клик.
            if (!error.keyPattern || !('slot' in error.keyPattern)) duplicate = true;
          }
        }
        if (!placed && !duplicate) return refuse(429, 'С этого адреса сердечек уже достаточно');
        if (placed) {
          await ProfilePage.updateOne({ _id: page._id }, { $inc: { 'hearts.count': 1 } });
          checkMilestones(req.app.get('io'), page._id);
        }
        liked = true;
      }
    } else {
      const removed = await ProfileHeartMark.deleteOne({ page: page._id, key });
      if (removed.deletedCount) {
        await ProfilePage.updateOne({ _id: page._id, 'hearts.count': { $gt: 0 } }, { $inc: { 'hearts.count': -1 } });
      }
      liked = false;
    }

    const fresh = await ProfilePage.findById(page._id).select('hearts.count').lean();
    res.json({ count: Math.max(0, fresh?.hearts?.count || 0), liked });
  } catch (error) {
    console.error('[profile-page] heart error:', error.message);
    refuse(500, 'Не получилось');
  }
});

/* ------------------------------------------------------------------ *
 *  НАЖАТИЯ ССЫЛОК
 * ------------------------------------------------------------------ */

// Одно нажатие одного посетителя по одной ссылке за день — одно, а не десять.
// Память процесса, как у просмотров (routes/profilePublic): после рестарта
// посетитель может засчитаться ещё раз, и это допустимая цена за отсутствие
// таблицы отметок.
const CLICK_MEMO = new Map();
const CLICK_MEMO_MAX = 20000;
const CLICK_MEMO_TTL_MS = 24 * 60 * 60 * 1000;

function clickSeen(key) {
  const now = Date.now();
  const seen = CLICK_MEMO.get(key);
  if (seen && now - seen < CLICK_MEMO_TTL_MS) return true;
  if (CLICK_MEMO.size >= CLICK_MEMO_MAX) {
    for (const [entry, at] of CLICK_MEMO) if (now - at >= CLICK_MEMO_TTL_MS) CLICK_MEMO.delete(entry);
    let drop = CLICK_MEMO.size - Math.floor(CLICK_MEMO_MAX * 0.8);
    for (const entry of CLICK_MEMO.keys()) { if (drop-- <= 0) break; CLICK_MEMO.delete(entry); }
  }
  CLICK_MEMO.set(key, now);
  return false;
}

/**
 * POST /api/profile-page/click — посетитель нажал ссылку на странице.
 *
 * Без авторизации, как жалоба. Отвечаем всегда одинаково (204): по ответу
 * нельзя узнать ни существование страницы, ни засчитался ли клик.
 */
router.post('/click', profilePageLimiter, async (req, res) => {
  res.status(204).end();
  try {
    const ua = String(req.headers['user-agent'] || '');
    const username = String(req.body?.username || '').trim().replace(/^@/, '').slice(0, 32);
    const index = Number(req.body?.index);
    const url = String(req.body?.url || '').slice(0, 400);
    const cta = req.body?.kind === 'cta';
    if (!ua || CLICK_BOT_UA.test(ua) || !username) return;
    if (!cta && (!Number.isInteger(index) || index < 0 || index > 40)) return;

    const owner = await User.findOne({ username }).collation({ locale: 'en', strength: 2 }).select('_id isBanned').lean();
    if (!owner || owner.isBanned) return;
    const page = await ProfilePage.findOne({ user: owner._id }).select('_id enabled links published');
    if (!page || !page.enabled) return;
    if (isOwnerVisit(req, page._id)) return;

    const day = new Date().toISOString().slice(0, 10);
    if (cta) {
      // «Написать в Love» — главная цифра аналитики: сколько гостей решились.
      const key = crypto.createHash('sha256').update(`${req.ip}|${ua}|${page._id}|cta|${day}`).digest('hex');
      if (!clickSeen(key)) await ProfilePage.updateOne({ _id: page._id }, { $inc: { 'analytics.cta': 1 } });
      return;
    }

    // Номер — в опубликованном списке (его видит гость), адрес сверяем с ним
    // же. Счётчик прибавляем ссылке черновика с тем же адресом: черновик
    // могли переставить, а нажатие должно уйти той же ссылке.
    const stored = publicLinks(page)[index];
    if (!stored || publicLinkUrl(stored.url) !== url) return;

    const key = crypto.createHash('sha256').update(`${req.ip}|${ua}|${page._id}|${index}|${day}`).digest('hex');
    if (clickSeen(key)) return;

    await ProfilePage.updateOne(
      { _id: page._id, 'links.url': stored.url },
      { $inc: { 'links.$.clicks': 1 } }
    );
  } catch (error) {
    console.error('[profile-page] click error:', error.message);
  }
});

/* ------------------------------------------------------------------ *
 *  СТИЛЬ ДРУГОЙ СТРАНИЦЫ
 * ------------------------------------------------------------------ */

/**
 * GET /api/profile-page/style-of/:username — оформление чужой страницы.
 *
 * Только опубликованной, не скрытой модерацией, и только если владелец не
 * запретил копирование. Отдаём ровно снимок оформления: тексты, картинки и
 * музыка — это уже не стиль, а чужое содержимое.
 */
router.get('/style-of/:username', profileAuth, async (req, res) => {
  try {
    if (!hasFeature(req.tier, 'stylePresets')) {
      return res.status(403).json({ code: 'TIER_REQUIRED', requires: FEATURE_MIN_TIER.stylePresets, message: 'Это возможность Love Premium' });
    }
    const username = String(req.params.username || '').trim().replace(/^@/, '').slice(0, 32);
    const missing = () => res.status(404).json({ message: 'Такой открытой страницы нет или её владелец не разрешил брать оформление' });
    if (!username) return missing();

    const owner = await User.findOne({ username }).collation({ locale: 'en', strength: 2 }).select('_id username isBanned').lean();
    if (!owner || owner.isBanned) return missing();
    const page = await ProfilePage.findOne({ user: owner._id });
    if (!page || !page.enabled || page.moderation?.status === 'hidden' || page.style?.allowCopy === false) return missing();

    res.json({ username: owner.username, snapshot: sanitizeStyleSnapshot(styleSnapshot(page)) });
  } catch (error) {
    console.error('[profile-page] style-of error:', error.message);
    res.status(500).json({ message: 'Не удалось получить оформление' });
  }
});

/**
 * POST /api/profile-page/resolve-friend
 * Ник → карточка человека, для выбора пары и близких.
 *
 * Только среди своих друзей. Иначе это ещё и способ проверять существование
 * ников чужих людей перебором.
 */
router.post('/resolve-friend', profileAuth, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().replace(/^@/, '');
    if (!username) return res.status(400).json({ message: 'Укажите ник' });

    const candidate = await User
      .findOne({ username })
      .collation({ locale: 'en', strength: 2 })
      .select('username nickname avatar');

    const friendIds = new Set((req.user.friends || []).map(String));
    if (!candidate || !friendIds.has(String(candidate._id))) {
      return res.status(404).json({ message: 'Среди ваших друзей такого ника нет' });
    }

    res.json({ person: personDto(candidate) });
  } catch (error) {
    console.error('[profile-page] resolve-friend error:', error.message);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

const REPORT_REASONS = new Set(['spam', 'nsfw', 'impersonation', 'malware', 'hate', 'other']);
const REPORTS_KEPT = 50;
const REPORTS_TO_FLAG = 3;

function ipHashFor(req) {
  const salt = process.env.IP_HASH_SALT || JWT_SECRET;
  return crypto.createHash('sha256').update(`${salt}:${req.ip || ''}`).digest('hex').slice(0, 32);
}

/**
 * POST /api/profile-page/report — жалоба на публичную страницу.
 *
 * Без авторизации намеренно: страницу открывают люди без аккаунта, а требовать
 * регистрацию, чтобы пожаловаться, — верный способ не получить ни одной жалобы
 * и узнавать о проблемах из твиттера. IP не храним, только его хеш — этого
 * хватает, чтобы одна кнопка F5 не превратилась в двадцать сигналов.
 */
router.post('/report', publicPageLimiter, async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().replace(/^@/, '');
    const reason = REPORT_REASONS.has(req.body?.reason) ? req.body.reason : 'other';
    const note = normalizeContent(req.body?.note, 400);
    if (!username) return res.status(400).json({ message: 'Не указана страница' });

    const owner = await User
      .findOne({ username })
      .collation({ locale: 'en', strength: 2 })
      .select('_id');
    if (!owner) return res.status(404).json({ message: 'Страница не найдена' });

    const page = await ProfilePage.findOne({ user: owner._id }).select('+moderation.reports');
    if (!page) return res.status(404).json({ message: 'Страница не найдена' });

    const ipHash = ipHashFor(req);
    const already = (page.moderation.reports || []).some(entry => entry.ipHash === ipHash);
    if (already) {
      // Отвечаем как на успех: сообщать «ты уже жаловался» бессмысленно, а
      // разные ответы позволяли бы прощупывать состояние по чужим страницам.
      return res.json({ ok: true });
    }

    page.moderation.reports.push({ reason, note, ipHash, at: new Date() });
    if (page.moderation.reports.length > REPORTS_KEPT) {
      page.moderation.reports = page.moderation.reports.slice(-REPORTS_KEPT);
    }
    page.moderation.reportCount = (page.moderation.reportCount || 0) + 1;

    // Три независимые жалобы — это ещё не приговор, но уже повод посмотреть.
    // Автоматически ничего не скрываем: скрывать по счётчику значит выдать
    // любому чату из трёх человек кнопку «снести чужую страницу».
    if (page.moderation.reportCount >= REPORTS_TO_FLAG && page.moderation.status === 'ok') {
      page.moderation.status = 'flagged';
    }

    await page.save();
    res.json({ ok: true });
  } catch (error) {
    console.error('[profile-page] report error:', error.message);
    res.status(500).json({ message: 'Не удалось отправить жалобу' });
  }
});

module.exports = router;
module.exports.profileAuth = profileAuth;
module.exports.applyPatch = applyPatch;
module.exports.sanitizeStyleSnapshot = sanitizeStyleSnapshot;
module.exports.EDITOR_AUDIENCE = EDITOR_AUDIENCE;
