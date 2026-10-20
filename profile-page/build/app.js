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
import { initPreview, previewChanged } from './preview.js';

const CARDS = [
  'sec-publish', 'sec-basics', 'sec-look', 'sec-background', 'sec-links',
  'sec-music', 'sec-entry', 'sec-blocks', 'sec-people', 'sec-share', 'sec-stats'
];

// Секции, которых пока нет, спрятаны: пустая карточка с заголовком выглядит
// как сломанная, а не как «ещё не готово».
const READY = new Set([
  'sec-publish', 'sec-basics', 'sec-look', 'sec-background', 'sec-links',
  'sec-music', 'sec-entry', 'sec-blocks', 'sec-people', 'sec-share', 'sec-stats'
]);

let sectionNavReady = false;
let activeEditorSection = 'profile';

const EDITOR_SECTIONS = {
  profile: {
    title: 'Профиль',
    description: 'Расскажи о себе и выбери, как тебя увидят.'
  },
  appearance: {
    title: 'Внешний вид',
    description: 'Собери спокойный стиль страницы: тема, шрифт и фон.'
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
    description: 'Выбери, какие детали профиля показывать на странице.'
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
  renderBackground();
  renderLinks();
  renderMusic();
  renderEntry();
  renderBlocks();
  renderPeople();
  renderShare();
  // Статистика идёт отдельным запросом и дорисуется сама, когда придёт ответ.
  renderStats();

  initSectionNav();
  showEditorSection(activeEditorSection);
  show($('btn-disable'), Boolean(state.page.enabled));
  renderSaveStatus();
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

async function onPublish() {
  const button = $('btn-publish');
  button.disabled = true;
  try {
    await api.enable();
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

  fill(body, [
    el('div', { class: 'links-list' }, rows),
    enabled
      ? el('p', { class: 'hint', text: 'Страница открыта: по ссылке её видит любой.' })
      : el('div', { class: 'notice' }, [
        el('p', { class: 'notice-text', text: 'Страница пока никому не видна. Пока вы её не опубликуете, ссылка отвечает так же, как если бы аккаунта не существовало.' })
      ]),
    renderModeration()
  ]);

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
  // Превью обновляется и на 'local': поля пересобирать во время набора нельзя,
  // а картинку — нужно, в ней весь смысл редактора.
  previewChanged(reason);
});

async function start() {
  $('login-form').addEventListener('submit', onLoginSubmit);
  $('btn-publish').addEventListener('click', onPublish);
  $('btn-disable').addEventListener('click', onDisable);
  $('btn-retry-save').addEventListener('click', () => flush());
  window.addEventListener('beforeunload', event => {
    if (Object.keys(pendingPatch()).length) { event.preventDefault(); event.returnValue = ''; }
  });
  initPreview();

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
