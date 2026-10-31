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
let overlayNode = null;
let disposeEffect = null;
let effectKey = '';
let runtime = {};
let audio = null;
let audioUrl = '';
let viewport = null;
let lastHtml = '';      // разметка последнего кадра — сравниваем с новой
let lastMotion = '';    // анимации появления и эффект имени на прошлом кадре

/**
 * Превью перерисовывается на каждое движение палитры. Если при этом заново
 * вставлять разметку, каждая правка цвета проигрывает появление страницы и
 * перезапускает эффект имени — страница дёргается. Поэтому после первого
 * кадра появление не проигрывается (pf-still), а печатная машинка сразу
 * показывает итог. Заново всё играет, только когда меняют саму анимацию.
 */
const COUNTDOWN_DIGITS = /(<b data-u="[dhms]">)\d+(<\/b>)/g;
const comparable = (html) => String(html || '').replace(COUNTDOWN_DIGITS, '$1$2');

const STILL_CSS = '.pf-body.pf-still .pf-shell,.pf-body.pf-still .pf-identity>*,.pf-body.pf-still .pf-content>*,'
  + '.pf-body.pf-still .pf-foot{animation:none!important}.pf-body.pf-still .pf-name{animation-delay:-60s!important}';

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
  // Шлейф, круги от касаний и кинескоп рисуются поверх содержимого, остальные
  // эффекты — под ним. Два слоя, потому что эффектов теперь может быть несколько.
  overlayNode = document.createElement('div');
  overlayNode.className = 'pf-runtime pf-runtime--over';
  overlayNode.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:5;overflow:hidden';
  shadow.append(styleNode, bodyNode, effectNode, overlayNode);

  // Слушаем на теневом корне, а не на хосте: на хосте событие уже
  // перенаправлено на него самого, и понять, что нажали именно экран входа,
  // было бы нечем.
  shadow.addEventListener('click', onReveal);
  shadow.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') onReveal(event);
  });
  shadow.addEventListener('click', event => {
    if (event.target.closest('#pf-player-btn')) { event.preventDefault(); playPreviewAudio(); }
    if (event.target.closest('#pf-player-prev')) { event.preventDefault(); switchTrack(-1); }
    if (event.target.closest('#pf-player-next')) { event.preventDefault(); switchTrack(1); }
  });
  // Наклон аватара и звуки — как делает скрипт настоящей страницы, иначе
  // эти переключатели в редакторе выглядели бы нерабочими.
  shadow.addEventListener('pointermove', (event) => {
    if (!runtime.tilt || event.pointerType === 'touch') return;
    const wrap = bodyNode.querySelector('.pf-avatar-wrap');
    if (!wrap) return;
    const box = wrap.getBoundingClientRect();
    const frame = host.getBoundingClientRect();
    const dx = (event.clientX - (box.left + box.width / 2)) / Math.max(1, frame.width);
    const dy = (event.clientY - (box.top + box.height / 2)) / Math.max(1, frame.height);
    const clamp = (v) => Math.max(-14, Math.min(14, v));
    wrap.style.setProperty('--tilt-x', `${clamp(-dy * 32).toFixed(2)}deg`);
    wrap.style.setProperty('--tilt-y', `${clamp(dx * 32).toFixed(2)}deg`);
  });
  host.addEventListener('pointerleave', () => {
    const wrap = bodyNode.querySelector('.pf-avatar-wrap');
    if (wrap) { wrap.style.setProperty('--tilt-x', '0deg'); wrap.style.setProperty('--tilt-y', '0deg'); }
  });
  let lastHover = 0;
  const sounds = {};
  const playSound = (name, volume) => {
    if (!runtime.sounds) return;
    const base = sounds[name] || (sounds[name] = new Audio(`/build/sounds/${name}.ogg`));
    const copy = base.cloneNode();
    copy.volume = volume;
    copy.play().catch(() => {});
  };
  shadow.addEventListener('pointerover', (event) => {
    if (event.pointerType === 'touch') return;
    const target = event.target.closest && event.target.closest('a,button');
    if (!target || (event.relatedTarget && target.contains(event.relatedTarget))) return;
    if (Date.now() - lastHover < 90) return;
    lastHover = Date.now();
    playSound('hover', .16);
  });
  shadow.addEventListener('click', (event) => {
    const target = event.target.closest && event.target.closest('a,button,[role="button"]');
    if (target) playSound(target.id === 'pf-heart' ? 'heart' : 'tap', .3);
  }, true);
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

const OVERLAY_EFFECTS = ['trail', 'ripple', 'scanlines'];

function updateEffects() {
  effectNode.hidden = bodyNode.classList.contains('pf-locked');
  overlayNode.hidden = effectNode.hidden;
  if (effectNode.hidden) { disposeEffect?.(); disposeEffect = null; effectKey = ''; return; }
  const list = runtime.effects || (runtime.effect && runtime.effect !== 'none' ? [runtime.effect] : []);
  const vars = getComputedStyle(effectNode);
  // Настройки шлейфа тоже в ключе: иначе ползунки толщины и длины не меняли
  // превью до перезагрузки.
  const colors = ['--fx-1', '--fx-2', '--accent', '--accent-to', '--text', '--trail-1', '--trail-2', '--trail-width', '--trail-life', '--trail-glow']
    .map((name) => vars.getPropertyValue(name).trim());
  const key = `${list.join(',')}|${colors.join(',')}`;
  if (key === effectKey && disposeEffect) return;
  disposeEffect?.();
  effectKey = key;
  const under = mountProfileEffects(effectNode, list.filter((id) => !OVERLAY_EFFECTS.includes(id)));
  const over = mountProfileEffects(overlayNode, list.filter((id) => OVERLAY_EFFECTS.includes(id)));
  disposeEffect = () => { under(); over(); };
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

let trackIndex = 0;
const previewTracks = () => (runtime.music && runtime.music.tracks && runtime.music.tracks.length > 1 ? runtime.music.tracks : null);
const currentUrl = () => { const list = previewTracks(); return list ? list[trackIndex % list.length].url : runtime.music?.url; };

/** Подпись плеера под текущий трек плейлиста — как на настоящей странице. */
function showTrack() {
  const list = previewTracks();
  if (!list) return;
  if (trackIndex >= list.length) trackIndex = 0;
  const track = list[trackIndex];
  const title = bodyNode.querySelector('#pf-player-title');
  const artist = bodyNode.querySelector('#pf-player-artist');
  const count = bodyNode.querySelector('#pf-player-count');
  if (title) title.textContent = track.title || 'Музыка профиля';
  if (artist) { artist.textContent = track.artist || ''; artist.hidden = !track.artist; }
  if (count) count.textContent = `${trackIndex + 1} / ${list.length}`;
}

function switchTrack(shift) {
  const list = previewTracks();
  if (!list) return;
  trackIndex = (trackIndex + shift + list.length) % list.length;
  showTrack();
  playPreviewAudio(true);
}

function playPreviewAudio(start = false) {
  if (!currentUrl()) return;
  if (!audio || audioUrl !== currentUrl()) {
    audio?.pause();
    audio = new Audio(currentUrl());
    audioUrl = currentUrl();
    // Один трек — по кругу, плейлист — по порядку.
    audio.loop = !previewTracks();
    audio.addEventListener('ended', () => { if (previewTracks()) switchTrack(1); });
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

  const style = state.page.style || {};
  const motion = `${style.entrance || ''}|${style.nameEffect || ''}`;
  const replay = drawn && motion !== lastMotion;
  lastMotion = motion;

  styleNode.textContent = fragment.css + STILL_CSS;
  // Поменялись только стили (цвет, градиент, форма) — разметку не трогаем:
  // анимации на месте продолжают идти, ничего не мигает и не прыгает.
  // Цифры таймера сервер считает на каждый кадр, поэтому сравниваем без них и
  // при совпадении просто переписываем цифры на месте.
  if (comparable(fragment.html) !== comparable(lastHtml) || replay) {
    bodyNode.replaceChildren(htmlToNodes(fragment.html));
  } else if (fragment.html !== lastHtml) {
    const fresh = [...htmlToNodes(fragment.html).querySelectorAll('[data-u]')];
    bodyNode.querySelectorAll('[data-u]').forEach((cell, index) => {
      if (fresh[index]) cell.textContent = fresh[index].textContent;
    });
  }
  lastHtml = fragment.html;
  applyHighlight();
  runtime = fragment.runtime || {};
  showTrack();
  if (audio && audioUrl !== currentUrl()) { audio.pause(); audio = null; audioUrl = ''; }
  if (audio && runtime.music) audio.volume = Math.max(0, Math.min(1, (runtime.music.volume ?? 60) / 100));

  const wantsLock = fragment.bodyClass === 'pf-locked';
  if (!wantsLock) revealed = true;
  else if (RELOCK_KEYS.some((key) => key in patch)) revealed = false;
  setLocked(wantsLock && !revealed);
  bodyNode.classList.toggle('pf-still', drawn && !replay);
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
  const effect = (page.effects || []).length > 0 || Boolean(page.effect && page.effect !== 'none');

  let text = '';
  if (music) text = 'Нажмите на плеер в превью, чтобы послушать трек.';
  else if (effect) text = 'Эффекты показаны в реальном времени. На странице они выглядят так же.';

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
/**
 * Показать в превью вторую тему (под систему гостя или ночную). На странице
 * её включает браузер гостя или часы — в редакторе нужна кнопка.
 */
let highlight = null;
function applyHighlight() {
  if (!shadow) return;
  if (!shadow.getElementById('pf-hl-style')) {
    const node = document.createElement('style');
    node.id = 'pf-hl-style';
    node.textContent = '.pf-hl{outline:2px solid rgba(185,171,255,.95)!important;outline-offset:4px;transition:outline-color .2s}';
    shadow.appendChild(node);
  }
  shadow.querySelectorAll('.pf-hl').forEach((node) => node.classList.remove('pf-hl'));
  if (!highlight) return;
  try { shadow.querySelectorAll(highlight).forEach((node) => node.classList.add('pf-hl')); } catch (_) { /* неверный селектор — просто без подсветки */ }
}

/** Подсветить в превью то, что меняет группа настроек под курсором (null — убрать). */
export function highlightPreview(selector) {
  if (highlight === (selector || null)) return;
  highlight = selector || null;
  applyHighlight();
}

export function setPreviewAlt(on) {
  const host = shadow && shadow.host;
  if (host) host.classList.toggle('pf-alt', Boolean(on));
}

export function previewChanged(reason) {
  if (reason === 'server') {
    renderUrl();
    draw.cancel();
    paint();
  } else if (reason === 'local') {
    draw();
  }
}
