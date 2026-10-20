/**
 * Состояние редактора и автосохранение.
 *
 * Здесь живёт всё, что знает о данных: текущая страница, тариф, что заблокировано
 * тарифом, и очередь несохранённых правок. Секции только читают state и вызывают
 * update() — никто, кроме этого файла, не разговаривает с PUT /api/profile-page.
 *
 * Три вещи, из-за которых код выглядит сложнее, чем «дебаунс и fetch»:
 *
 *  1. Сервер при ошибке валидации не сохраняет НИЧЕГО и отвечает 400. Значит
 *     оптимистично изменённый state.page после отказа врёт, и его надо вернуть
 *     назад — для этого перед первой правкой каждого поля запоминается прежнее
 *     значение (baseline).
 *
 *  2. Два PUT одновременно — это гонка: какой из них ляжет в базу последним,
 *     неизвестно. Поэтому запрос всегда один, а всё, что накопилось за время
 *     полёта, уходит следующим.
 *
 *  3. Обрыв связи — не повод откатывать текст, который человек только что
 *     набрал. При сетевой ошибке правки остаются в очереди, и мы повторяем
 *     попытку сами.
 */

import { api, clearSession } from './api.js';
import { debounce } from './ui.js';

/** Единственный источник правды для всех секций. */
export const state = {
  page: null,
  account: null,
  caps: null,
  locked: [],
  urls: null,
  tier: 'free'
};

/**
 * features['music'] → { allowed, requires }. Незнакомую фичу считаем открытой.
 *
 * Живёт здесь, а не в секциях, потому что читает state и нужна двоим: секции
 * решают этим, рисовать поле или замок, а превью — предупреждать ли, что музыка
 * в рамке не играет. Врать про музыку, которую тариф всё равно не пустит на
 * страницу, было бы вдвойне глупо.
 */
export function feature(name) {
  const list = (state.caps && state.caps.features) || {};
  return list[name] || { allowed: true, requires: 'free' };
}

// ---------------------------------------------------------------------------
// Подписчики
// ---------------------------------------------------------------------------

const subscribers = new Set();

/**
 * fn(reason) вызывается при изменениях. Причины:
 *   'server'  — данные заменены ответом сервера, разметку надо перерисовать;
 *   'local'   — правка ещё не улетела, перерисовывать поля НЕЛЬЗЯ (человек в
 *               них печатает), но превью обновить нужно;
 *   'status'  — сменился индикатор сохранения;
 *   'expired' — сессия редактора закончилась.
 */
export function onChange(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function emit(reason) {
  subscribers.forEach((fn) => {
    try {
      fn(reason);
    } catch (error) {
      console.error('подписчик store упал:', error);
    }
  });
}

// ---------------------------------------------------------------------------
// Загрузка
// ---------------------------------------------------------------------------

function absorb(data) {
  state.page = data.page;
  state.account = data.account || state.account;
  state.caps = data.capabilities || state.caps;
  state.locked = data.locked || [];
  if (data.urls) state.urls = data.urls;
  state.tier = (state.caps && state.caps.tier) || 'free';
}

/** Первая загрузка и любое полное обновление. Бросает ошибку наружу. */
export async function loadPage() {
  const data = await api.page();
  absorb(data);
  baseline = {};
  errors = [];
  emit('server');
}

// ---------------------------------------------------------------------------
// Очередь правок
// ---------------------------------------------------------------------------

let queue = {};       // что ещё не отправлено
let sending = null;   // что уехало и пока в полёте
let baseline = {};    // прежние значения изменённых полей — на случай отказа
let errors = [];      // [{ field, message }] от последнего отказа
let inflight = false;
let status = 'idle';  // idle | saving | saved | failed
let retryTimer = null;
let retries = 0;

const clone = (value) => (value === undefined ? undefined
  : typeof structuredClone === 'function' ? structuredClone(value)
    : JSON.parse(JSON.stringify(value)));

const flushSoon = debounce(() => { flush(); }, 700);

export const saveStatus = () => status;
export const isDirty = () => Object.keys(queue).length > 0 || inflight || flushSoon.pending();

/** Сообщение сервера про конкретное поле — секции подписывают им свои поля. */
export function fieldError(name) {
  const hit = errors.find((item) => item.field === name);
  return hit ? hit.message : null;
}

/**
 * Всё, чего сервер про страницу пока не знает: и очередь, и запрос в полёте.
 *
 * Нужно превью. Оно просит сервер собрать страницу «как будет вот с этим», а
 * сервер читает из базы сохранённое — значит правки надо приложить самому.
 * Полёт учитываем наравне с очередью: пока ответ идёт, сохранённого ещё нет, и
 * без этого превью откатилось бы на одну правку назад и дёрнулось обратно.
 */
export function pendingPatch() {
  return { ...(sending || {}), ...queue };
}

function setStatus(next) {
  if (status === next) return;
  status = next;
  emit('status');
}

/**
 * Правка. patch — кусок страницы в том же виде, в каком его ждёт PUT.
 *
 * Вложенные объекты (background, music, enterOverlay, pair) передаются целиком:
 * сервер разбирает их как единое целое, и присланный без url объект music он
 * поймёт как «поставить трек из ниоткуда», а не как «поменять только громкость».
 *
 * now = true для правок, которые человек воспринимает как действие, а не как
 * набор текста: переключатель, выбор темы, загрузка файла.
 */
export function update(patch, { now = false } = {}) {
  if (!state.page) return;
  for (const key of Object.keys(patch)) {
    if (!(key in baseline)) baseline[key] = clone(state.page[key]);
  }
  Object.assign(state.page, clone(patch));
  Object.assign(queue, clone(patch));
  if (errors.length) errors = [];
  emit('local');

  if (now) {
    flushSoon.cancel();
    flush();
  } else {
    flushSoon();
  }
}

/** Отправляет всё, что накопилось. Ждать её можно, но обычно не нужно. */
export async function flush() {
  flushSoon.cancel();
  clearTimeout(retryTimer);
  if (inflight) return;                       // добьём в finally
  const patch = queue;
  if (!Object.keys(patch).length) return;
  queue = {};
  sending = patch;
  inflight = true;
  setStatus('saving');

  try {
    const data = await api.save(patch);
    absorb(data);
    baseline = {};
    errors = [];
    retries = 0;
    setStatus(Object.keys(queue).length ? 'saving' : 'saved');
    // Сервер мог поправить значения (обрезать текст, заменить неизвестную
    // иконку). Молча обновляем модель, но поля не пересобираем: человек может
    // печатать в соседнем.
    emit('local');
  } catch (error) {
    handleSaveError(error, patch);
  } finally {
    inflight = false;
    sending = null;
    if (Object.keys(queue).length && status !== 'failed') flush();
  }
}

function handleSaveError(error, patch) {
  // Сессия кончилась — дальше некуда, дорисовывать нечего.
  if (error.status === 401) {
    queue = {};
    clearSession();
    setStatus('failed');
    emit('expired');
    return;
  }

  // Отказ по существу: сервер не сохранил ничего. Возвращаем поля к тому, что
  // на самом деле лежит в базе, и показываем, что именно ему не понравилось.
  if (error.status === 400 || error.status === 403 || error.status === 409) {
    errors = Array.isArray(error.errors) && error.errors.length
      ? error.errors
      : [{ field: Object.keys(patch)[0] || '', message: error.message }];
    rollback();
    setStatus('failed');
    emit('server');
    // Частая причина отказа — тариф кончился, пока вкладка была открыта. Тогда
    // локальная матрица возможностей врёт, и без обновления человек будет
    // жать ту же кнопку и получать тот же отказ.
    refreshAfterRejection();
    return;
  }

  // Связь, лимит запросов, пятисотка. Правки не теряем и пробуем ещё.
  Object.assign(queue, patch, queue);   // queue поверх: свежее важнее
  setStatus('failed');
  if (retries < 4) {
    retries += 1;
    retryTimer = setTimeout(() => { flush(); }, 2000 * retries);
  }
  emit('status');
}

function rollback() {
  for (const [key, value] of Object.entries(baseline)) {
    if (value === undefined) delete state.page[key];
    else state.page[key] = value;
  }
  baseline = {};
  queue = {};
}

/** Перечитывает страницу после отказа, сохраняя текст ошибки на поле. */
async function refreshAfterRejection() {
  const keep = errors;
  try {
    const data = await api.page();
    absorb(data);
    baseline = {};
    errors = keep;
    emit('server');
  } catch (_) {
    // Причину отказа уже показали, а вторая ошибка подряд ничего не добавит.
  }
}

// ---------------------------------------------------------------------------
// Уход со страницы
// ---------------------------------------------------------------------------

window.addEventListener('beforeunload', (event) => {
  if (!isDirty()) return;
  flush();                  // не дождёмся, но браузер обычно успевает отправить
  event.preventDefault();
  event.returnValue = '';   // старые браузеры хотят именно это
});

// Переключение вкладки — хороший момент дописать хвост: телефон может усыпить
// страницу и таймер дебаунса не сработает.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && isDirty()) flush();
});
