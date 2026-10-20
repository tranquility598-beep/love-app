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
  icon: { type: String, trim: true, maxlength: 24, default: 'link' }
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
  font: { type: String, default: 'system', maxlength: 32 },
  accent: { type: String, default: null, maxlength: 9 },          // #rrggbb
  accentTo: { type: String, default: null, maxlength: 9 },        // второй цвет градиента
  avatarFrame: { type: String, default: 'none', maxlength: 32 },
  effect: { type: String, default: 'none', maxlength: 32 },

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
  enterOverlay: {
    enabled: { type: Boolean, default: false },
    text: { type: String, trim: true, maxlength: 40, default: 'нажми, чтобы войти' }
  },

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
