/**
 * Живое превью страницы в рамке редактора.
 *
 * Рисуется НЕ клиентской копией страницы, а тем же самым рендером, что и
 * настоящий адрес: правки уходят в POST /api/profile-page/preview, сервер
 * прикладывает их к загруженному документу (ничего не сохраняя) и отдаёт готовые
 * css и html. Своя вторая реализация оформления разошлась бы с настоящей на
 * первой же правке темы — а расхождение именно здесь худший вид ошибки: человек
 * настраивает одно, гости видят другое.
 *
 * Почему не iframe. У `/build` в CSP стоит `frame-src 'none'`, и это правильно:
 * редактор не должен уметь вставлять в себя кадры. Поэтому страница живёт в
 * shadow DOM на том же документе — стили редактора туда не протекают, стили
 * страницы не протекают наружу.
 *
 * Эффекты подключаются из статического effects.js: тот же движок сервер
 * встраивает в публичную страницу. Плеер и экран входа управляются здесь,
 * без запуска встроенных скриптов из HTML-фрагмента.
 */

import { $, show, debounce } from './ui.js';
import { api } from './api.js';
import { state, feature, pendingPatch } from './store.js';
import './effects.js';
const { mountProfileEffects } = globalThis.LoveProfileEffects;

/**
 * Правки, после которых экран входа надо закрыть заново.
 *
 * Настоящую страницу гость открывает кликом по экрану входа, и в превью это
 * работает так же. Но если возвращать замок на каждую перерисовку, то человек,
 * который правит подпись под уже открытым превью, будет получать экран входа
 * после каждой буквы. Поэтому закрываем обратно только когда он трогает то, из
 * чего этот экран и состоит.
 */
const RELOCK_KEYS = ['enterOverlay', 'music'];

/**
 * Добавка к стилям страницы, нужная только внутри рамки.
 *
 * Контейнер ширины находится на неподвижном .preview-viewport, снаружи
 * прокручиваемого shadow host. Так медиазапросы зависят от логического размера
 * телефона или десктопа, а фиксированные фон и экран входа остаются в рамке.
 */

let shadow = null;     // теневой корень
let styleNode = null;  // <style> внутри него
let bodyNode = null;   // .pf-body — заменяет body страницы
let seq = 0;           // номер последнего отправленного запроса
let revealed = false;  // экран входа уже открыли кликом
let drawn = false;     // первый кадр нарисован
let effectNode = null;
let disposeEffect = null;
let effectKey = '';
let runtime = {};
let audio = null;
let audioUrl = '';
let viewport = null;

function sizeViewport() {
  const stage = $('preview-stage');
  if (!viewport || !stage?.clientWidth) return;
  const width = stage.dataset.size === 'wide' ? 960 : stage.clientWidth;
  const scale = stage.clientWidth / width;
  const height = stage.clientHeight / scale;
  viewport.style.width = width + 'px';
  viewport.style.height = height + 'px';
  viewport.style.setProperty('--pf-viewport-height', height + 'px');
  viewport.style.transform = `scale(${scale})`;
}

// ---------------------------------------------------------------------------
// Монтаж
// ---------------------------------------------------------------------------

function mount() {
  if (shadow) return true;
  const stage = $('preview-stage');
  if (!stage) return false;

  const host = document.createElement('div');
  host.className = 'preview-live';
  shadow = host.attachShadow({ mode: 'open' });

  styleNode = document.createElement('style');
  bodyNode = document.createElement('div');
  bodyNode.className = 'pf-body';
  effectNode = document.createElement('div');
  effectNode.className = 'pf-runtime';
  effectNode.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden';
  shadow.append(styleNode, bodyNode, effectNode);

  // Слушаем на теневом корне, а не на хосте: на хосте событие уже
  // перенаправлено на него самого, и понять, что нажали именно экран входа,
  // было бы нечем.
  shadow.addEventListener('click', onReveal);
  shadow.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') onReveal(event);
  });
  shadow.addEventListener('click', event => {
    if (event.target.closest('#pf-player-btn')) { event.preventDefault(); playPreviewAudio(); }
  });
  shadow.addEventListener('input', event => {
    if (event.target.id === 'pf-player-volume' && audio) audio.volume = Number(event.target.value) / 100;
  });
  let resumeAudio = false;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { resumeAudio = Boolean(audio && !audio.paused); audio?.pause(); }
    else if (resumeAudio && !bodyNode.classList.contains('pf-locked')) { audio?.play().catch(() => {}); resumeAudio = false; }
  });
  window.addEventListener('pagehide', () => {
    disposeEffect?.(); disposeEffect = null; effectKey = ''; audio?.pause();
  });
  window.addEventListener('pageshow', () => { if (drawn) updateEffects(); });

  viewport = document.createElement('div');
  viewport.className = 'preview-viewport';
  viewport.style.cssText = 'position:absolute;inset:0;transform-origin:top left;container:pf / inline-size';
  viewport.appendChild(host);
  stage.appendChild(viewport);
  sizeViewport();
  new ResizeObserver(sizeViewport).observe(stage);
  return true;
}

/**
 * Разметка страницы из строки в узлы.
 *
 * innerHTML здесь не используется намеренно: во всём редакторе нет ни одного
 * места, принимающего HTML-строку (см. ui.js), и заводить первое ради превью не
 * хочется. DOMParser разбирает в отдельном мёртвом документе, где ничего не
 * загружается и не исполняется, и только потом узлы переносятся к нам. Это не
 * замена экранированию на сервере, а способ не держать в коде привычку,
 * которую однажды применят к чужому тексту.
 */
function htmlToNodes(html) {
  const parsed = new DOMParser().parseFromString(String(html), 'text/html');
  const frag = document.createDocumentFragment();
  Array.from(parsed.body.childNodes).forEach((node) => {
    frag.appendChild(document.importNode(node, true));
  });
  return frag;
}

// ---------------------------------------------------------------------------
// Экран входа
// ---------------------------------------------------------------------------

function onReveal(event) {
  if (!bodyNode || !bodyNode.classList.contains('pf-locked')) return;
  if (!event?.target.closest?.('#pf-enter')) return;
  if (event && event.type === 'keydown') event.preventDefault();
  revealed = true;
  setLocked(false);
  updateEffects();
  if (runtime.music) playPreviewAudio(true);
}

function updateEffects() {
  effectNode.hidden = bodyNode.classList.contains('pf-locked');
  effectNode.style.zIndex = runtime.effect === 'trail' ? '5' : '0';
  if (effectNode.hidden) { disposeEffect?.(); disposeEffect = null; effectKey = ''; return; }
  const key = (runtime.effect || 'none') + styleNode.textContent;
  if (key === effectKey && disposeEffect) return;
  disposeEffect?.();
  effectKey = key;
  disposeEffect = mountProfileEffects(effectNode, runtime.effect);
}

function syncAudio() {
  const button = bodyNode.querySelector('#pf-player-btn');
  const icon = bodyNode.querySelector('#pf-player-ico');
  const playing = Boolean(audio && !audio.paused);
  bodyNode.querySelector('.pf-player')?.classList.toggle('is-playing', playing);
  button?.setAttribute('aria-label', playing ? 'Пауза' : 'Играть');
  if (icon) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', playing ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5.2v13.6L19 12z');
    icon.replaceChildren(path);
  }
  const progress = bodyNode.querySelector('.pf-player-progress');
  progress?.style.setProperty('--progress', (audio?.duration ? audio.currentTime / audio.duration * 100 : 0) + '%');
}

function playPreviewAudio(start = false) {
  if (!runtime.music?.url) return;
  if (!audio || audioUrl !== runtime.music.url) {
    audio?.pause();
    audio = new Audio(runtime.music.url);
    audioUrl = runtime.music.url;
    audio.loop = true;
    audio.volume = Math.max(0, Math.min(1, (runtime.music.volume ?? 60) / 100));
    ['play', 'pause', 'timeupdate'].forEach(event => audio.addEventListener(event, syncAudio));
    audio.addEventListener('error', () => {
      const button = bodyNode.querySelector('#pf-player-btn');
      button?.setAttribute('aria-label', 'Трек недоступен');
    });
  }
  if (start || audio.paused) audio.play().catch(() => {});
  else audio.pause();
  syncAudio();
}

/** То же, что делает скрипт настоящей страницы по клику. */
function setLocked(locked) {
  bodyNode.className = locked ? 'pf-body pf-locked' : 'pf-body pf-ready';
  const shell = bodyNode.querySelector('.pf-shell');
  if (shell) shell.inert = locked;
  if (locked) { audio?.pause(); return; }
  const enter = bodyNode.querySelector('#pf-enter');
  if (enter) enter.classList.add('is-gone');
}

// ---------------------------------------------------------------------------
// Отрисовка
// ---------------------------------------------------------------------------

async function paint() {
  if (!state.page) return;

  const patch = pendingPatch();
  const ticket = ++seq;

  let fragment;
  try {
    fragment = await api.preview(patch);
  } catch (_) {
    // Отказ по существу, истёкшая сессия, обрыв связи — оставляем последний
    // удачный кадр и молчим. Ошибку человек и так увидит: её показывает поле,
    // а store после отказа откатит правку, перерисует секции и позовёт нас
    // снова — уже с тем, что действительно лежит в базе.
    return;
  }

  // Пока ждали ответ, человек успел напечатать ещё — этот кадр уже устарел.
  if (ticket !== seq || !mount()) return;

  styleNode.textContent = fragment.css;
  bodyNode.replaceChildren(htmlToNodes(fragment.html));
  runtime = fragment.runtime || {};
  if (audio && audioUrl !== runtime.music?.url) { audio.pause(); audio = null; audioUrl = ''; }
  if (audio && runtime.music) audio.volume = Math.max(0, Math.min(1, (runtime.music.volume ?? 60) / 100));

  const wantsLock = fragment.bodyClass === 'pf-locked';
  if (!wantsLock) revealed = true;
  else if (RELOCK_KEYS.some((key) => key in patch)) revealed = false;
  setLocked(wantsLock && !revealed);
  updateEffects();
  syncAudio();

  if (!drawn) {
    drawn = true;
    const empty = document.querySelector('.preview-empty');
    if (empty) empty.hidden = true;
  }
  renderNote();
}

const draw = debounce(() => { paint(); }, 450);

/**
 * Подпись под рамкой про то, чего превью не умеет.
 *
 * Показывается только когда музыка или эффект действительно включены и
 * действительно доступны на тарифе: предупреждать про молчащую музыку, которую
 * страница всё равно не пустит, — это шум, а не честность.
 */
function renderNote() {
  const note = $('preview-note');
  if (!note) return;

  const page = state.page || {};
  const music = Boolean(page.music && page.music.url) && feature('music').allowed;
  const effect = Boolean(page.effect && page.effect !== 'none') && feature('effects').allowed;

  let text = '';
  if (music) text = 'Нажмите на плеер в превью, чтобы послушать трек.';
  else if (effect) text = 'Эффект показан в реальном времени. На странице он выглядит так же.';

  note.textContent = text;
  show(note, Boolean(text));
}

// ---------------------------------------------------------------------------
// Рамка: размер, адрес, кнопка на телефоне
// ---------------------------------------------------------------------------

const SIZES = ['phone', 'wide'];

function setSize(size) {
  const stage = $('preview-stage');
  if (!stage) return;
  stage.dataset.size = size;
    sizeViewport();
  SIZES.forEach((name) => {
    const chip = $('size-' + name);
    if (chip) chip.classList.toggle('is-on', name === size);
  });
}

function renderUrl() {
  const node = $('preview-url');
  if (!node) return;
  const urls = state.urls || {};
  const url = (urls.shortAvailable && urls.short) || urls.long || '';
  node.textContent = url.replace(/^https?:\/\//, '') || 'me.loveapp.chat';
}

/**
 * На узком экране превью уезжает под настройки, и кнопка в шапке возвращает к
 * нему, чтобы не листать всю простыню полей руками. На широком она не нужна:
 * превью и так стоит рядом и липнет к верху.
 */
function wireMobileButton() {
  const button = $('btn-preview-mobile');
  if (!button) return;
  const narrow = window.matchMedia('(max-width: 1000px)');
  const sync = () => show(button, narrow.matches);
  sync();
  narrow.addEventListener('change', sync);
  button.addEventListener('click', () => {
    const box = $('ed-preview');
    if (box) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

// ---------------------------------------------------------------------------
// Наружу
// ---------------------------------------------------------------------------

export function initPreview() {
  SIZES.forEach((name) => {
    const chip = $('size-' + name);
    if (chip) chip.addEventListener('click', () => setSize(name));
  });
  wireMobileButton();
  renderUrl();
}

/**
 * Вызывается из подписки на store.
 *
 * 'server' — данные пришли с сервера, в полях никто не печатает: рисуем сразу,
 * чтобы первый кадр не ждал таймер. 'local' — человек правит прямо сейчас,
 * и тут дебаунс обязателен: иначе на каждую букву уходил бы запрос.
 */
export function previewChanged(reason) {
  if (reason === 'server') {
    renderUrl();
    draw.cancel();
    paint();
  } else if (reason === 'local') {
    draw();
  }
}
