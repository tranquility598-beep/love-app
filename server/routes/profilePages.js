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
const { authLimiter, uploadLimiter, publicPageLimiter } = require('../middleware/rateLimiter');
const { getUsernameValidationError, normalizeContent } = require('../middleware/validation');
const {
  THEMES, LAYOUTS, FONTS, EFFECTS, AVATAR_FRAMES, LINK_ICON_SET,
  resolveTier, hasFeature, limitsFor, pickAllowed, capabilitiesFor, FEATURE_MIN_TIER
} = require('../config/profileTiers');
const { isAllowedMediaUrl, isAnimatedImageUrl, storeProfileAsset } = require('../utils/profileMedia');
const { publicUrl, longUrl, shortUrl, builderUrl, mediaOrigin } = require('../utils/profilePageUrls');
const { buildView } = require('../utils/profilePageView');
const { renderPreviewFragment } = require('../utils/profilePageHtml');
const { rememberOwner } = require('../utils/profileViews');

const router = express.Router();
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

/**
 * Страница для редактора.
 *
 * Собирается поле за полем, а не через toObject(): документ обрастает служебным
 * (editorHandoff, жалобы, внутренние заметки модерации), и «отдать всё, кроме
 * пары полей» — это гарантированная утечка при следующем добавленном поле.
 */
function pageDto(page) {
  return {
    enabled: page.enabled,
    theme: page.theme,
    layout: page.layout,
    font: page.font,
    accent: page.accent,
    accentTo: page.accentTo,
    avatarFrame: page.avatarFrame,
    effect: page.effect,
    displayName: page.displayName || '',
    headline: page.headline || '',
    bio: page.bio || '',
    avatar: page.avatar || null,
    banner: page.banner || null,
    links: (page.links || []).map(link => ({ label: link.label || '', url: link.url, icon: link.icon || 'link' })),
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

  check('customAccent', Boolean(page.accent || page.accentTo));
  check('backgroundImage', page.background?.kind === 'image');
  check('videoBackground', page.background?.kind === 'video');
  check('music', Boolean(page.music?.url));
  check('enterOverlay', Boolean(page.enterOverlay?.enabled));
  check('effects', page.effect && page.effect !== 'none');
  check('avatarFrame', page.avatarFrame && page.avatarFrame !== 'none');
  check('hideFooter', Boolean(page.hideFooter));
  check('statusBlock', Boolean(page.showStatus));
  check('customOgImage', Boolean(page.ogImage));
  check('pairBlock', Boolean(page.pair?.partner && page.pair?.visible));
  check('closeFriends', (page.closeFriends || []).length > 0);

  if (!pickAllowed(THEMES, page.theme, tier)) locked.push({ feature: 'theme', requires: 'pro' });
  if (!pickAllowed(LAYOUTS, page.layout, tier)) locked.push({ feature: 'layout', requires: 'pro' });
  if (!pickAllowed(FONTS, page.font, tier)) locked.push({ feature: 'fontChoice', requires: 'premium' });

  const linkLimit = limitsFor(tier).links;
  if ((page.links || []).length > linkLimit) {
    locked.push({ feature: 'links', requires: 'pro', shown: linkLimit });
  }

  return locked;
}

async function loadPopulated(page) {
  return page.populate([
    { path: 'pair.partner', select: 'username nickname avatar' },
    { path: 'closeFriends', select: 'username nickname avatar' }
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
function applyPatch(page, body, { tier, limits, user }) {
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
    fail(field, featureForMessage || 'Этот вариант недоступен на вашем тарифе');
    return null;
  };

  // --- оформление ---
  if (has('theme') && catalog('theme', THEMES, body.theme, 'Эта тема недоступна на вашем тарифе')) {
    page.theme = body.theme;
  }
  if (has('layout') && catalog('layout', LAYOUTS, body.layout, 'Эта раскладка недоступна на вашем тарифе')) {
    page.layout = body.layout;
  }
  if (has('font') && catalog('font', FONTS, body.font, 'Этот шрифт — в Love Premium')) {
    page.font = body.font;
  }
  if (has('effect') && catalog('effect', EFFECTS, body.effect, 'Эффекты — в Love Premium')) {
    page.effect = body.effect;
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
    if (!gate(field, 'customAccent')) continue;
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
          icon: LINK_ICON_SET.has(icon) ? icon : 'link'
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
      const feature = kind === 'image' ? 'backgroundImage' : 'videoBackground';
      if (gate('background', feature)) {
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
    const errors = applyPatch(req.page, body, {
      tier: req.tier,
      limits: req.limits,
      user: req.user
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
      user: req.user
    });

    if (errors.length) {
      return res.status(400).json({ message: errors[0].message, errors });
    }

    await loadPopulated(req.page);

    const view = buildView(req.page, req.user, req.tier);
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
    if (!req.page.firstEnabledAt) req.page.firstEnabledAt = new Date();
    await req.page.save();

    res.json({ enabled: true, urls: urlsFor(req.user, req.tier, req) });
  } catch (error) {
    console.error('[profile-page] enable error:', error.message);
    res.status(500).json({ message: 'Не удалось включить страницу' });
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
  og: { kinds: { image: 'customOgImage' } }
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
  if (!hasFeature(req.tier, 'viewStats')) {
    return res.json({
      available: false,
      requires: FEATURE_MIN_TIER.viewStats,
      total: null
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
    series
  });
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
module.exports.EDITOR_AUDIENCE = EDITOR_AUDIENCE;
