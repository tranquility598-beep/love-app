/**
 * Публичная страница профиля (me.loveapp.chat/username).
 *
 * Отдельная коллекция, а не поля в User — намеренно:
 *  - публичный рендер читает ОДИН документ и физически не может случайно
 *    отдать email, телефон, список серверов или флаги модерации аккаунта;
 *  - страница выключена по умолчанию (enabled: false), и её отсутствие —
 *    это отсутствие документа, а не набор null-полей в аккаунте;
 *  - счётчик просмотров пишется на каждый заход, и апдейты не задевают
 *    документ пользователя, который читается на каждый запрос API.
 *
 * Своего CSS/HTML у пользователя нет. Всё оформление — идентификаторы из
 * server/config/profileTiers.js плюс цвета в hex. Валидация значений живёт в
 * роуте, здесь только форма и жёсткие потолки, чтобы битые данные не попали
 * в базу даже при ошибке в роуте.
 */

const mongoose = require('mongoose');
const ProfileViewMark = require('./ProfileViewMark');

const linkSchema = new mongoose.Schema({
  label: { type: String, trim: true, maxlength: 40, default: '' },
  url: { type: String, trim: true, maxlength: 400, required: true },
  // Идентификатор иконки из набора редактора (telegram, tiktok, github…).
  // Свои картинки сюда не пускаем: это был бы способ грузить произвольные
  // файлы и трекать заходы через внешний домен.
  icon: { type: String, trim: true, maxlength: 24, default: 'link' },
  // Сколько раз ссылку нажимали посетители. Пишется атомарным $inc из
  // POST /api/profile-page/click, при сохранении списка переносится по адресу.
  clicks: { type: Number, default: 0, min: 0 }
}, { _id: false });

// Набор оформления: сохранённый стиль или стиль, взятый с чужой страницы.
// Содержимое проверяет роут (sanitizeStyleSnapshot) — здесь только потолок.
const stylePresetSchema = new mongoose.Schema({
  name: { type: String, trim: true, maxlength: 30, default: '' },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now }
}, { _id: false });

const profilePageSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },

  // Страница показывается публично только когда владелец сам её включил.
  // Молча публиковать ник, био и статус человека, который писал их для друзей
  // внутри мессенджера, нельзя.
  enabled: { type: Boolean, default: false },

  // Оформление
  theme: { type: String, default: 'midnight', maxlength: 32 },
  layout: { type: String, default: 'stack', maxlength: 32 },
  // Своя расстановка (Premium) поверх выбранной раскладки: клетки сетки из
  // utils/profileCustomLayout. on=false — страница как в раскладке.
  customLayout: {
    on: { type: Boolean, default: false },
    items: {
      type: [{
        _id: false,
        id: { type: String, maxlength: 24 },
        x: Number, y: Number, w: Number, h: Number
      }],
      default: []
    },
    rows: { type: Number, default: 0 },
    // Отдельная расстановка для телефона (пусто — столбиком в порядке ПК).
    phone: {
      type: [{
        _id: false,
        id: { type: String, maxlength: 24 },
        x: Number, y: Number, w: Number, h: Number
      }],
      default: []
    },
    phoneRows: { type: Number, default: 0 }
  },
  font: { type: String, default: 'system', maxlength: 32 },
  // Свой шрифт (Premium): файл на наших хостах и его название для редактора.
  customFont: {
    url: { type: String, default: null },
    name: { type: String, trim: true, maxlength: 60, default: '' }
  },
  accent: { type: String, default: null, maxlength: 9 },          // #rrggbb
  accentTo: { type: String, default: null, maxlength: 9 },        // второй цвет градиента
  avatarFrame: { type: String, default: 'none', maxlength: 32 },
  effect: { type: String, default: 'none', maxlength: 32 },
  // Несколько эффектов сразу. Пустой список — работает прежнее поле effect,
  // чтобы страницы, сохранённые до этого, выглядели как раньше.
  effects: { type: [{ type: String, maxlength: 32 }], default: [] },
  // Свои цвета частиц и свечения (1–2 цвета #rrggbb). Пусто — цвета акцента.
  effectColors: { type: [{ type: String, maxlength: 9 }], default: [] },

  // Конструктор темы (Premium): свои цвета вместо готовой темы. Читаемость
  // подстраивает utils/profileTheme при показе.
  customTheme: {
    enabled: { type: Boolean, default: false },
    bg: { type: String, maxlength: 9, default: null },
    bg2: { type: String, maxlength: 9, default: null },
    text: { type: String, maxlength: 9, default: null },
    muted: { type: String, maxlength: 9, default: null },
    accent: { type: String, maxlength: 9, default: null }
  },

  // Содержимое
  displayName: { type: String, trim: true, maxlength: 40, default: '' },
  headline: { type: String, trim: true, maxlength: 80, default: '' },
  bio: { type: String, trim: true, maxlength: 1200, default: '' },
  avatar: { type: String, default: null },   // отдельно от User.avatar: на странице можно другое
  banner: { type: String, default: null },
  links: { type: [linkSchema], default: [] },

  background: {
    kind: { type: String, enum: ['none', 'image', 'video'], default: 'none' },
    url: { type: String, default: null },
    blur: { type: Number, default: 0, min: 0, max: 20 },
    dim: { type: Number, default: 40, min: 0, max: 85 }
  },

  music: {
    url: { type: String, default: null },
    title: { type: String, trim: true, maxlength: 80, default: '' },
    artist: { type: String, trim: true, maxlength: 80, default: '' },
    volume: { type: Number, default: 60, min: 0, max: 100 }
  },

  // Браузеры блокируют автоплей без жеста пользователя, поэтому экран
  // «нажми, чтобы войти» — не украшение, а единственный способ включить
  // музыку. Заодно это красивый первый кадр.
  // Плейлист (Premium). Пустой — играет одиночный music, как раньше.
  playlist: {
    type: [{
      url: { type: String, required: true },
      title: { type: String, trim: true, maxlength: 80, default: '' },
      artist: { type: String, trim: true, maxlength: 80, default: '' },
      _id: false
    }],
    default: []
  },

  enterOverlay: {
    enabled: { type: Boolean, default: false },
    text: { type: String, trim: true, maxlength: 40, default: 'нажми, чтобы войти' }
  },

  // Свой градиент фона вместо фона темы. Под картинкой или видео не виден.
  bgGradient: {
    enabled: { type: Boolean, default: false },
    colors: { type: [{ type: String, maxlength: 9 }], default: [] },  // 2–3 цвета #rrggbb
    angle: { type: Number, default: 160, min: 0, max: 360 },
    animated: { type: Boolean, default: false }                      // переливается (Pro)
  },

  // Узор поверх фона (точки, сетка…) и живой фон (жидкий металл, дымка, шум).
  bgPattern: {
    kind: { type: String, default: 'none', maxlength: 16 },
    opacity: { type: Number, default: 35, min: 0, max: 100 }
  },
  liveBg: { type: String, default: 'none', maxlength: 16 },

  // Вторая тема: под светлую/тёмную систему гостя или по времени суток.
  altTheme: { type: String, default: null, maxlength: 32 },
  themeMode: { type: String, default: 'fixed', maxlength: 16 },

  // Свой курсор (картинка с наших хостов) и настройки шлейфа курсора.
  cursorImage: { type: String, default: null },
  trailStyle: {
    colors: { type: [{ type: String, maxlength: 9 }], default: [] },
    width: { type: Number, default: 100, min: 40, max: 300 },      // % от обычной толщины
    length: { type: Number, default: 560, min: 200, max: 1600 },   // сколько живёт след, мс
    glow: { type: Boolean, default: true }
  },

  // Детали оформления. Идентификаторы из STYLE_OPTIONS (config/profileTiers),
  // значения по умолчанию — STYLE_DEFAULTS: прежний вид страницы.
  style: {
    blockOrder: { type: [{ type: String, maxlength: 24 }], default: [] },
    hiddenBlocks: { type: [{ type: String, maxlength: 24 }], default: [] },
    linkShape: { type: String, default: 'rounded', maxlength: 16 },
    linkFill: { type: String, default: 'glass', maxlength: 16 },
    linkLayout: { type: String, default: 'auto', maxlength: 16 },
    cardShadow: { type: String, default: 'none', maxlength: 16 },
    cardAlpha: { type: Number, default: 64, min: 0, max: 100 },
    cardRadius: { type: Number, default: 13, min: 0, max: 32 },
    cardBorder: { type: Boolean, default: true },
    avatarShape: { type: String, default: 'circle', maxlength: 16 },
    avatarSize: { type: String, default: 'md', maxlength: 8 },
    nameAlign: { type: String, default: 'left', maxlength: 8 },
    nameSize: { type: String, default: 'md', maxlength: 8 },
    nameGradient: { type: Boolean, default: false },
    // Цвет имени отдельно от акцента: theme | solid | accent | gradient.
    nameFill: { type: String, default: 'theme', maxlength: 16 },
    nameColors: { type: [{ type: String, maxlength: 9 }], default: [] },
    nameAngle: { type: Number, default: 90, min: 0, max: 360 },
    linkMotion: { type: String, default: 'none', maxlength: 16 },
    cursorHotspot: { type: String, default: 'corner', maxlength: 16 },
    // Свой цвет готового курсора: один цвет или переход из двух. Пусто — акцент.
    cursorColors: { type: [{ type: String, maxlength: 9 }], default: [] },
    avatarTilt: { type: Boolean, default: false },
    sounds: { type: Boolean, default: false },
    nameEffect: { type: String, default: 'none', maxlength: 16 },
    cursor: { type: String, default: 'default', maxlength: 16 },
    entrance: { type: String, default: 'none', maxlength: 16 },
    allowCopy: { type: Boolean, default: true }
  },

  // Блоки содержимого (этап 2). Медиа — только адреса на наших хостах.
  gallery: { type: [{ type: String, maxlength: 600 }], default: [] },
  invite: {
    code: { type: String, maxlength: 32, default: null },
    server: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', default: null }
  },
  tags: { type: [{ type: String, maxlength: 24 }], default: [] },
  quote: {
    text: { type: String, trim: true, maxlength: 240, default: '' },
    author: { type: String, trim: true, maxlength: 60, default: '' }
  },
  countdown: {
    title: { type: String, trim: true, maxlength: 60, default: '' },
    at: { type: Date, default: null }
  },

  stylePresets: { type: [stylePresetSchema], default: [] },

  // Сердечко посетителей. Счётчик меняется только атомарным $inc из
  // POST /api/profile-page/heart, отметки «уже нажимал» — в ProfileHeartMark.
  hearts: {
    enabled: { type: Boolean, default: false },
    count: { type: Number, default: 0, min: 0 }
  },

  // Опубликованная версия. Редактор правит поля выше — это черновик; гости
  // видят published.data, пока владелец не нажмёт «Опубликовать». Пустой
  // published (страницы до этой возможности) — гости видят поля как есть.
  published: {
    at: { type: Date, default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: null }
  },
  // Прошлые публикации для «вернуть как было». Не читаются при показе
  // страницы — поэтому select:false.
  versions: {
    type: [{ at: { type: Date, required: true }, data: { type: mongoose.Schema.Types.Mixed }, _id: false }],
    default: [],
    select: false
  },

  // Аналитика (показывается с Pro, копится всем): источники переходов,
  // час недели по UTC (0..167), нажатия «Написать в Love».
  analytics: {
    sources: { type: mongoose.Schema.Types.Mixed, default: {} },
    week: { type: mongoose.Schema.Types.Mixed, default: {} },
    cta: { type: Number, default: 0 }
  },

  // Вехи, о которых уже сообщили в Love (null — ещё не считали: старые
  // страницы не получают пачку уведомлений в первый же показ).
  milestones: {
    views: { type: Number, default: null },
    hearts: { type: Number, default: null }
  },
  notifyMilestones: { type: Boolean, default: true },

  showStatus: { type: Boolean, default: false },
  showBadges: { type: Boolean, default: true },
  hideFooter: { type: Boolean, default: false },
  ogImage: { type: String, default: null },

  pair: {
    partner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    since: { type: Date, default: null },
    visible: { type: Boolean, default: false }
  },

  // Трое «Близких» из Premium. Держим ссылками, а не копиями ников:
  // если человек сменил ник, на странице должен быть новый.
  closeFriends: {
    type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    default: []
  },

  // Когда из «Близких» кого-то убирали.
  //
  // Быть у кого-то в Близких — это видимый бейдж и рамка у себя в профиле.
  // Если список можно переписывать когда вздумается, бейдж превращается в
  // издевательство: выдал, отобрал, выдал. Поэтому УБРАТЬ человека можно раз
  // в 14 дней. Добавлять — свободно: ограничивать добавление незачем, а опечатку
  // в нике иначе пришлось бы носить две недели.
  closeFriendsChangedAt: { type: Date, default: null },

  // Просмотры. Дневные ведра, а не отдельные документы на просмотр:
  // страница-визитка не аналитическая система, а 30 чисел читаются одним
  // документом без агрегаций.
  views: {
    total: { type: Number, default: 0 },
    daily: {
      type: [{
        day: { type: String, required: true },  // YYYY-MM-DD в UTC
        count: { type: Number, default: 0 },
        _id: false
      }],
      default: []
    }
  },

  // Модерация публичного контента. hidden — страница отдаёт 404 всем, кроме
  // владельца в редакторе, чтобы он видел причину и мог исправить.
  //
  // Жалобы хранятся здесь, а не в модели Report: там reporter обязателен, а
  // публичную страницу открывают без входа, и требовать регистрацию, чтобы
  // пожаловаться, — верный способ не получить ни одной жалобы. Дедуп по
  // ipHash, чтобы одна кнопка F5 не превращалась в двадцать сигналов.
  moderation: {
    status: { type: String, enum: ['ok', 'flagged', 'hidden'], default: 'ok' },
    reason: { type: String, maxlength: 400, default: '' },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reportCount: { type: Number, default: 0 },
    reports: {
      type: [{
        reason: { type: String, maxlength: 32, default: 'other' },
        note: { type: String, maxlength: 400, default: '' },
        ipHash: { type: String, maxlength: 64, default: '' },
        at: { type: Date, default: Date.now },
        _id: false
      }],
      default: [],
      select: false
    }
  },

  firstEnabledAt: { type: Date, default: null },

  // Одноразовый код для передачи сессии из приложения в браузерный редактор.
  //
  // Приложение (со своим полноценным JWT) просит код, открывает
  // me.loveapp.chat/build#code=…, редактор обменивает код на УЗКИЙ токен
  // (aud='profile-editor'), который умеет только читать и писать эту страницу.
  // Полноценный JWT на публичный хост не попадает никогда — там же рендерится
  // пользовательский контент, и любая инъекция унесла бы аккаунт целиком.
  //
  // Храним хеш, а не сам код: код живёт две минуты, но в базе ему в открытом
  // виде делать нечего. Одновременно активен только один код — редактор
  // открывают по одному, а перевыпуск обнуляет предыдущий.
  editorHandoff: {
    codeHash: { type: String, default: null, select: false },
    expiresAt: { type: Date, default: null, select: false }
  }
}, { timestamps: true });

// Единственная точка записи просмотра: и отметка посетителя, и счётчик идут
// отсюда. Проверочные стенды подменяют этот метод, чтобы гарантировать, что
// показ страницы ничего не пишет в базу.
//
// Возвращает true, если просмотр засчитан. Отметка в ProfileViewMark
// атомарна (уникальный индекс), счётчик — атомарный $inc без save() целого
// документа, поэтому параллельные показы и правки в редакторе не затирают
// друг друга. Храним максимум 30 дневных ведёр: у Premium статистика за
// 30 дней, больше никому не показывается.
profilePageSchema.methods.recordView = async function recordView(day, viewerKey) {
  if (viewerKey) {
    try {
      const mark = await ProfileViewMark.updateOne(
        { page: this._id, day, key: viewerKey },
        { $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
      if (!mark.upsertedCount) return false;
    } catch (error) {
      if (error.code === 11000) return false; // тот же посетитель параллельным запросом
      throw error;
    }
  }

  const Page = this.constructor;
  const bumpBucket = () => Page.updateOne(
    { _id: this._id, 'views.daily.day': day },
    { $inc: { 'views.total': 1, 'views.daily.$.count': 1 } }
  );
  if ((await bumpBucket()).matchedCount) return true;

  const added = await Page.updateOne(
    { _id: this._id, 'views.daily.day': { $ne: day } },
    {
      $inc: { 'views.total': 1 },
      $push: { 'views.daily': { $each: [{ day, count: 1 }], $sort: { day: 1 }, $slice: -30 } }
    }
  );
  // Ведро за этот день успел создать параллельный показ — тогда оно уже есть.
  if (!added.matchedCount) await bumpBucket();
  return true;
};

module.exports = mongoose.model('ProfilePage', profilePageSchema);
