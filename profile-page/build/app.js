/**
 * Редактор публичной страницы профиля.
 *
 * Порядок входа:
 *   1. Приложение открывает /build#code=... — код лежит во фрагменте URL, а он
 *      не уходит ни в логи nginx, ни в заголовок Referer.
 *   2. Код сразу вычищается из адресной строки и обменивается на узкий токен.
 *   3. Если кода нет, но в этой вкладке уже была сессия — продолжаем её.
 *   4. Иначе показываем вход по паролю.
 *
 * Данные и сохранение живут в store.js, разметка секций — в sections.js.
 * Здесь остались экраны, вход и сборка целого.
 */

import { $, el, fill, show, toast, tierName } from './ui.js';
import {
  exchangeCode, loginWithPassword,
  restoreSession, hasSession, clearSession, api
} from './api.js';
import { state, loadPage, onChange, saveStatus, flush, pendingPatch } from './store.js';
import {
  renderBasics, renderLook, renderBackground, renderLinks,
  renderMusic, renderEntry, renderBlocks, renderPeople, renderShare, renderStats
} from './sections.js';
import { renderStyle, renderOrder, renderPresets, renderThemeBuilder, renderTemplates } from './design.js';
import { renderGallery, renderInvite, renderMore } from './blocks.js';
import { initPreview, previewChanged, highlightPreview } from './preview.js';
import { fold, restoreFolds } from './fields.js';

const CARDS = [
  'sec-publish', 'sec-basics', 'sec-templates', 'sec-look', 'sec-background', 'sec-theme', 'sec-style', 'sec-presets', 'sec-look-more',
  'sec-links', 'sec-music', 'sec-entry', 'sec-blocks', 'sec-order', 'sec-gallery',
  'sec-invite', 'sec-more', 'sec-people', 'sec-share', 'sec-stats'
];

// Секции, которых пока нет, спрятаны: пустая карточка с заголовком выглядит
// как сломанная, а не как «ещё не готово».
const READY = new Set(CARDS);

let sectionNavReady = false;
let activeEditorSection = 'profile';

const EDITOR_SECTIONS = {
  profile: {
    title: 'Профиль',
    description: 'Расскажи о себе и выбери, как тебя увидят.'
  },
  appearance: {
    title: 'Внешний вид',
    description: 'Тема, цвет, фон и детали: форма ссылок, карточек, аватара и имени.'
  },
  links: {
    title: 'Ссылки',
    description: 'Добавь площадки, где тебя можно найти.'
  },
  music: {
    title: 'Музыка',
    description: 'Настрой трек и экран, который встречает гостей.'
  },
  blocks: {
    title: 'Блоки',
    description: 'Что показывать, в каком порядке, и новые блоки: галерея, приглашение, цитата, таймер.'
  },
  publish: {
    title: 'Публикация',
    description: 'Проверь ссылку, настройки доступа и статистику.'
  }
};

// ---------------------------------------------------------------------------
// Экраны
// ---------------------------------------------------------------------------

function screen(name) {
  show($('boot'), name === 'boot');
  show($('gate'), name === 'gate');
  show($('editor'), name === 'editor');
}

function bootText(text) {
  const node = $('boot-text');
  if (node) node.textContent = text;
}

function gateError(text) {
  const node = $('gate-error');
  if (!node) return;
  node.textContent = text || '';
  show(node, Boolean(text));
}

function openGate(message) {
  screen('gate');
  gateError(message || '');
  const first = $('login-name');
  if (first && !message) first.focus();
}

// ---------------------------------------------------------------------------
// Вход
// ---------------------------------------------------------------------------

/**
 * Забирает код из фрагмента и тут же стирает его из адресной строки.
 *
 * Стираем до сетевого запроса, а не после: иначе код остаётся в истории
 * браузера и в списке недавних вкладок, откуда его видно после закрытия
 * редактора. Сгоревший код безвреден, но незачем.
 */
function takeCodeFromHash() {
  const hash = location.hash || '';
  const match = /(?:^|[#&])code=([^&]+)/.exec(hash);
  if (!match) return null;
  history.replaceState(null, '', location.pathname + location.search);
  try {
    return decodeURIComponent(match[1]);
  } catch (_) {
    return match[1];
  }
}

async function onLoginSubmit(event) {
  event.preventDefault();
  const button = $('login-submit');
  const login = $('login-name').value.trim();
  const password = $('login-pass').value;
  if (!login || !password) {
    gateError('Заполните оба поля.');
    return;
  }
  button.disabled = true;
  gateError('');
  try {
    await loginWithPassword(login, password);
    $('login-pass').value = '';
    await enter();
  } catch (error) {
    // Двухфакторную защиту здесь намеренно не проходим: вводить одноразовый
    // код на публичном домене — плохая привычка, которой лучше не учить.
    gateError(error.code === 'TWO_FACTOR_REQUIRED'
      ? 'У вас включена двухфакторная защита. Откройте редактор кнопкой в приложении — так безопаснее.'
      : error.message);
  } finally {
    button.disabled = false;
  }
}

// ---------------------------------------------------------------------------
// Загрузка
// ---------------------------------------------------------------------------

async function enter() {
  screen('boot');
  bootText('Загружаем страницу…');
  try {
    await loadPage();
    screen('editor');
  } catch (error) {
    if (error.status === 401) {
      clearSession();
      openGate('Сессия редактора закончилась. Войдите заново.');
      return;
    }
    screen('gate');
    gateError(error.message);
  }
}

// ---------------------------------------------------------------------------
// Отрисовка
// ---------------------------------------------------------------------------

function renderAll() {
  renderHeader();
  renderPublish();
  renderBasics();
  renderLook();
  renderTemplates();
  renderBackground();
  renderThemeBuilder();
  renderStyle();
  renderPresets();
  renderLinks();
  renderMusic();
  renderEntry();
  renderBlocks();
  renderOrder();
  renderGallery();
  renderInvite();
  renderMore();
  renderPeople();
  renderShare();
  // Статистика идёт отдельным запросом и дорисуется сама, когда придёт ответ.
  renderStats();

  initSectionNav();
  showEditorSection(activeEditorSection);
  show($('btn-disable'), Boolean(state.page.enabled));
  renderSaveStatus();
  renderDraftBar();
}

// ---------------------------------------------------------------------------
// «Просто / Подробно» во «Внешнем виде»: в простом режиме видно главное
// (шаблоны, тема, раскладка, шрифт, рамка, эффекты, картинка фона), всё
// остальное — с пометкой data-adv / .adv-only — прячется стилями. Выбор
// запоминается в браузере.
// ---------------------------------------------------------------------------
const LOOK_MODE_KEY = 'love-editor-look-mode';

function setLookMode(mode, { scroll = false } = {}) {
  const next = mode === 'detailed' ? 'detailed' : 'simple';
  $('editor').dataset.lookMode = next;
  document.querySelectorAll('#look-mode button[data-look-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.lookMode === next));
  });
  try { localStorage.setItem(LOOK_MODE_KEY, next); } catch (_) { /* приватный режим */ }
  if (scroll && next === 'detailed') $('sec-theme').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Поиск по настройкам «Внешнего вида»: показываем только группы, где есть
// слово (в заголовке, подписи или названиях вариантов), раскрываем их и на
// время поиска не прячем «подробные» — иначе нужное могло быть скрыто.
function applyLookSearch() {
  const input = $('look-search');
  const q = input ? input.value.trim().toLowerCase() : '';
  const editor = $('editor');
  const wasSearching = editor.classList.contains('is-searching');
  editor.classList.toggle('is-searching', Boolean(q));
  let hits = 0;
  document.querySelectorAll('.card[data-editor-group="appearance"]').forEach((card) => {
    card.classList.remove('search-miss');
    card.querySelectorAll('.fold').forEach((node) => node.classList.remove('search-miss'));
    if (!q) return;
    if (card.id === 'sec-look-more') { card.classList.add('search-miss'); return; }
    const title = (card.querySelector('.card-title') || {}).textContent || '';
    const groups = [...card.querySelectorAll('.fold')];
    if (!groups.length) {
      // Шаблоны ищем только по заголовку: в их описаниях встречаются слова
      // вроде «курсор», и огромная карточка вылезала в любые результаты.
      const haystack = card.id === 'sec-templates' ? title : card.textContent;
      const ok = haystack.toLowerCase().includes(q);
      card.classList.toggle('search-miss', !ok);
      if (ok) hits += 1;
      return;
    }
    if (title.toLowerCase().includes(q)) { hits += 1; return; }
    let any = false;
    groups.forEach((node) => {
      const ok = node.textContent.toLowerCase().includes(q);
      node.classList.toggle('search-miss', !ok);
      if (ok) { node.open = true; any = true; hits += 1; }
    });
    card.classList.toggle('search-miss', !any);
  });
  show($('look-search-empty'), Boolean(q) && hits === 0);
  if (!q && wasSearching) restoreFolds();
}

function initLookSearch() {
  const input = $('look-search');
  if (!input) return;
  input.addEventListener('input', applyLookSearch);
  input.addEventListener('keydown', (event) => { if (event.key === 'Escape') { input.value = ''; applyLookSearch(); } });
  // Карточки пересобираются после правок — поиск накладываем заново.
  let queued = false;
  new MutationObserver(() => {
    if (!$('editor').classList.contains('is-searching') || queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; applyLookSearch(); });
  }).observe(document.querySelector('.ed-panel'), { childList: true, subtree: true });
}

// Курсор над группой — в превью подсвечено то, что она меняет.
function initPreviewHighlight() {
  const panel = document.querySelector('.ed-panel');
  if (!panel) return;
  panel.addEventListener('pointerover', (event) => {
    const group = event.target.closest('.fold[data-target]');
    highlightPreview(group ? group.dataset.target : null);
  });
  panel.addEventListener('pointerleave', () => highlightPreview(null));
}

function initLookMode() {
  let saved = 'simple';
  try { saved = localStorage.getItem(LOOK_MODE_KEY) || 'simple'; } catch (_) { /* приватный режим */ }
  setLookMode(saved);
  document.addEventListener('click', (event) => {
    // Только кнопки: сам #editor тоже несёт data-look-mode (по нему работают
    // стили), и без «button» любой клик в редакторе прокручивал страницу.
    const button = event.target.closest('button[data-look-mode]');
    if (!button) return;
    setLookMode(button.dataset.lookMode, { scroll: !button.closest('#look-mode') });
  });
}

function initSectionNav() {
  if (sectionNavReady) return;
  const nav = document.querySelector('.ed-nav');
  if (!nav) return;
  sectionNavReady = true;

  nav.addEventListener('click', (event) => {
    const button = event.target.closest('.ed-nav-link[data-section]');
    if (button) showEditorSection(button.dataset.section);
  });
}

function showEditorSection(name) {
  if (!EDITOR_SECTIONS[name]) return;
  activeEditorSection = name;

  document.querySelectorAll('.ed-nav-link[data-section]').forEach((button) => {
    const active = button.dataset.section === name;
    button.classList.toggle('is-active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });

  CARDS.forEach((id) => {
    const card = $(id);
    show(card, READY.has(id) && card.dataset.editorGroup === name);
  });
  show(document.querySelector('.ed-foot'), name === 'publish');
  show($('look-tools'), name === 'appearance');
  if (name !== 'appearance' && $('look-search') && $('look-search').value) { $('look-search').value = ''; applyLookSearch(); }

  const section = EDITOR_SECTIONS[name];
  $('ed-section-title').textContent = section.title;
  $('ed-section-description').textContent = section.description;
}

function renderHeader() {
  $('ed-nick').textContent = '@' + state.account.username;
  const plan = $('ed-plan');
  plan.textContent = tierName(state.tier);
  plan.className = `badge badge--${state.tier}`;
}

const SAVE_TEXT = {
  idle: 'Автосохранение',
  saving: 'Сохраняем…',
  saved: 'Сохранено',
  failed: 'Нет сохранения'
};

function renderSaveStatus() {
  const node = $('ed-saved');
  const status = saveStatus();
  node.textContent = SAVE_TEXT[status] || '';
  node.className = `ed-saved ed-saved--${status}`;
  show($('btn-retry-save'), status === 'failed');
}

// ---------------------------------------------------------------------------
// Секция «Ваша ссылка»
// ---------------------------------------------------------------------------

function copyLink(url) {
  const done = () => toast('Ссылка скопирована');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, () => toast('Не удалось скопировать', 'err'));
  } else {
    toast('Скопируйте ссылку вручную', 'err');
  }
}

function linkRow({ url, note, muted, actions = true }) {
  const shown = url.replace(/^https?:\/\//, '');
  return el('div', { class: `linkrow${muted ? ' is-muted' : ''}` }, [
    el('div', { class: 'linkrow-main' }, [
      muted
        ? el('span', { class: 'linkrow-url', text: shown })
        : el('a', { class: 'linkrow-url', href: url, target: '_blank', rel: 'noopener noreferrer', text: shown }),
      note ? el('span', { class: 'linkrow-note', text: note }) : null
    ]),
    actions && !muted
      ? el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Копировать', onClick: () => copyLink(url) })
      : null
  ]);
}

// ---------------------------------------------------------------------------
// Черновик: правки сохраняются сразу, но гости видят их только после
// «Опубликовать изменения». Перекраивать страницу на глазах у всех не нужно.
// ---------------------------------------------------------------------------

/**
 * Дождаться, пока все правки уедут на сервер, — иначе опубликуется не всё.
 *
 * Не дождались — бросаем ошибку, и публикация, сброс или возврат версии не
 * идут дальше: иначе на медленной связи гости получили бы страницу без
 * последних правок, а редактор сказал бы «опубликовано». Отказ сервера по
 * полю не мешает: правка уже откачена, на экране ровно то, что в базе.
 */
async function settle() {
  await flush();
  for (let i = 0; i < 150; i += 1) {
    if (!Object.keys(pendingPatch()).length) return;
    // Связь пропала: правки ждут повтора в очереди, ждать дальше бессмысленно.
    if (saveStatus() === 'failed') break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Не все правки успели сохраниться — проверьте связь и нажмите ещё раз');
}

function draftDirty() {
  return Boolean(state.page && ((state.page.draft && state.page.draft.dirty) || Object.keys(pendingPatch()).length));
}

function renderDraftBar() {
  if (!state.page) return;
  const live = Boolean(state.page.enabled);
  const dirty = live && draftDirty();
  show($('draft-chip'), dirty);
  show($('btn-publish-draft'), dirty);
  show($('btn-discard-draft'), dirty);
}

async function onPublishDraft() {
  const button = $('btn-publish-draft');
  button.disabled = true;
  try {
    await settle();
    await api.publish();
    await loadPage();
    toast('Изменения опубликованы — гости видят новую версию');
  } catch (error) {
    toast(error.message, 'err');
  } finally {
    button.disabled = false;
  }
}

async function onDiscardDraft() {
  if (!window.confirm('Вернуть всё как сейчас видят гости? Неопубликованные правки пропадут.')) return;
  const button = $('btn-discard-draft');
  button.disabled = true;
  try {
    await settle();
    await api.discardDraft();
    await loadPage();
    toast('Черновик сброшен к опубликованной версии');
  } catch (error) {
    toast(error.message, 'err');
  } finally {
    button.disabled = false;
  }
}

const VERSION_DAY = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const VERSION_TIME = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
const VERSIONS_VISIBLE = 5;
let versionsExpanded = false;

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/**
 * История публикаций: «вернуть как было вчера» — в черновик, потом
 * опубликовать. Раньше это были двадцать одинаковых плашек подряд; теперь —
 * свёрнутая группа, внутри компактные строки по дням и пять последних версий,
 * остальное по кнопке.
 */
async function renderVersions(box) {
  fill(box, [el('p', { class: 'hint', text: 'Загружаем историю…' })]);
  let data;
  try {
    data = await api.versions();
  } catch (error) {
    fill(box, [el('p', { class: 'hint', text: 'Историю загрузить не получилось.' })]);
    return;
  }
  const list = data.versions || [];

  const restore = async (version, button) => {
    button.disabled = true;
    try {
      await settle();
      await api.restoreVersion(version.at);
      await loadPage();
      toast('Версия в черновике. Посмотрите превью и нажмите «Опубликовать изменения».');
    } catch (error) {
      button.disabled = false;
      toast(error.message, 'err');
    }
  };

  const rows = () => {
    const shown = versionsExpanded ? list : list.slice(0, VERSIONS_VISIBLE);
    const out = [];
    let lastDay = '';
    shown.forEach((version, index) => {
      const at = new Date(version.at);
      const day = VERSION_DAY.format(at);
      if (day !== lastDay) { out.push(el('p', { class: 'ver-day', text: day })); lastDay = day; }
      const links = Number(version.links) || 0;
      out.push(el('div', { class: `ver-row${index === 0 ? ' is-live' : ''}` }, [
        el('span', { class: 'ver-time', text: VERSION_TIME.format(at) }),
        el('span', { class: 'ver-meta', text: [version.theme, `${links} ${plural(links, 'ссылка', 'ссылки', 'ссылок')}`].filter(Boolean).join(' · ') }),
        index === 0
          ? el('span', { class: 'ver-live', text: 'сейчас у гостей' })
          : el('button', { class: 'ver-restore', type: 'button', text: 'Вернуть', onClick: (event) => restore(version, event.currentTarget) })
      ]));
    });
    return out;
  };

  const listNode = el('div', { class: 'ver-list' });
  fill(listNode, rows());
  const more = list.length > VERSIONS_VISIBLE
    ? el('button', {
      class: 'btn btn--ghost btn--sm ver-more', type: 'button',
      text: versionsExpanded ? 'Свернуть' : `Показать все (${list.length})`,
      onClick: (event) => {
        versionsExpanded = !versionsExpanded;
        fill(listNode, rows());
        event.currentTarget.textContent = versionsExpanded ? 'Свернуть' : `Показать все (${list.length})`;
      }
    })
    : null;

  const latest = list[0] ? new Date(list[0].at) : null;
  fill(box, [
    fold({
      id: 'publish-history',
      title: 'История публикаций',
      summary: list.length
        ? `${list.length} ${plural(list.length, 'версия', 'версии', 'версий')} · последняя ${VERSION_DAY.format(latest)}`
        : 'Пока пусто',
      children: list.length
        ? [
          listNode,
          more,
          el('p', { class: 'hint', text: 'Хранятся последние 20 публикаций. «Вернуть» кладёт версию в черновик — гости увидят её после «Опубликовать изменения».' })
        ]
        : [el('p', { class: 'hint', text: 'Версий пока нет — они появятся после первой публикации.' })]
    })
  ]);
}

async function onPublish() {
  const button = $('btn-publish');
  button.disabled = true;
  try {
    await settle();
    await api.enable();
    // Страницу включали и раньше — тогда черновик публикуем отдельно, иначе
    // гости увидят версию, которая была до выключения.
    if (draftDirty()) await api.publish();
    await loadPage();
    toast('Страница опубликована');
  } catch (error) {
    // Причины отказа конкретные и требуют разных действий, поэтому текст
    // сервера показываем как есть, а не заменяем общим «не получилось».
    toast(error.message, 'err');
  } finally {
    button.disabled = false;
  }
}

async function onDisable() {
  const button = $('btn-disable');
  button.disabled = true;
  try {
    await api.disable();
    await loadPage();
    toast('Страница скрыта. Настройки остались на месте.');
  } catch (error) {
    toast(error.message, 'err');
  } finally {
    button.disabled = false;
  }
}

function renderPublish() {
  const body = $('publish-body');
  const urls = state.urls || {};
  const enabled = Boolean(state.page.enabled);

  const rows = [];
  if (urls.short && urls.shortAvailable) {
    rows.push(linkRow({ url: urls.short, note: 'короткая' }));
    rows.push(linkRow({ url: urls.long }));
  } else {
    rows.push(linkRow({ url: urls.long }));
    if (urls.short) {
      rows.push(linkRow({
        url: urls.short,
        note: 'короткая ссылка — в Love Pro',
        muted: true
      }));
    }
  }

  const versionsBox = el('div', { class: 'versions-box' });
  fill(body, [
    el('div', { class: 'links-list' }, rows),
    enabled
      ? el('p', { class: 'hint', text: 'Страница открыта: по ссылке её видит любой.' })
      : el('div', { class: 'notice' }, [
        el('p', { class: 'notice-text', text: 'Страница пока никому не видна. Пока вы её не опубликуете, ссылка отвечает так же, как если бы аккаунта не существовало.' })
      ]),
    renderModeration(),
    versionsBox
  ]);
  renderVersions(versionsBox);

  const publish = $('btn-publish');
  show(publish, !enabled);
}

function renderModeration() {
  const mod = state.page.moderation;
  if (!mod || mod.status === 'ok') return null;
  const texts = {
    flagged: 'На страницу пожаловались, её смотрит модерация. Она открыта, но скрыта от поисковиков.',
    hidden: 'Страницу скрыла модерация.'
  };
  return el('div', { class: 'alert alert--warn' }, [
    el('p', { text: texts[mod.status] || 'Страницу проверяет модерация.' }),
    mod.reason ? el('p', { class: 'alert-why', text: `Причина: ${mod.reason}` }) : null
  ]);
}

// ---------------------------------------------------------------------------
// Старт
// ---------------------------------------------------------------------------

onChange((reason) => {
  if (reason === 'server') renderAll();
  else if (reason === 'status') renderSaveStatus();
  else if (reason === 'expired') {
    openGate('Сессия редактора закончилась. Войдите заново — несохранённые правки придётся повторить.');
  }
  // Плашка «Опубликовать изменения» зависит и от правок в очереди, поэтому
  // обновляется на любое событие, а не только на ответ сервера.
  if (reason !== 'expired') renderDraftBar();
  // Превью обновляется и на 'local': поля пересобирать во время набора нельзя,
  // а картинку — нужно, в ней весь смысл редактора.
  previewChanged(reason);
});

async function start() {
  $('login-form').addEventListener('submit', onLoginSubmit);
  $('btn-publish').addEventListener('click', onPublish);
  $('btn-publish-draft').addEventListener('click', onPublishDraft);
  $('btn-discard-draft').addEventListener('click', onDiscardDraft);
  $('btn-disable').addEventListener('click', onDisable);
  $('btn-retry-save').addEventListener('click', () => flush());
  window.addEventListener('beforeunload', event => {
    if (Object.keys(pendingPatch()).length) { event.preventDefault(); event.returnValue = ''; }
  });
  initPreview();
  initLookMode();
  initLookSearch();
  initPreviewHighlight();

  const code = takeCodeFromHash();
  if (code) {
    bootText('Открываем редактор…');
    try {
      await exchangeCode(code);
      await enter();
      return;
    } catch (error) {
      openGate(error.status === 401
        ? 'Ссылка больше не действует. Откройте редактор из приложения ещё раз или войдите по паролю.'
        : error.message);
      return;
    }
  }

  if (restoreSession() && hasSession()) {
    await enter();
    return;
  }
  openGate('');
}

start();
