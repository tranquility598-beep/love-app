/**
 * Своя расстановка — полноэкранный редактор (Premium, только компьютер).
 *
 * Два поля: слева страница на компьютере (1280 px), справа — на телефоне
 * (390 px). У каждого своя расстановка: тянешь блок за рамку — он плавно
 * едет за курсором, а подсвеченное место показывает, куда он встанет; за
 * край — растёт. Пунктирная рамка поля — границы страницы: верх неподвижен,
 * низ можно опустить, чтобы добавить места.
 *
 * Страницу рисует сервер тем же рендером, что и гостям (POST /preview), а
 * здесь только клетки сетки. После отпускания сервер перерисовывает страницу
 * целиком — и оба поля обновляются.
 *
 * Блоки не налезают друг на друга: место, где блок задел бы соседа, не
 * принимается, и блок встаёт на последнее свободное.
 */

import { el, toast } from './ui.js';
import { api } from './api.js';
import { state, update, pendingPatch } from './store.js';

const VIEW_HEIGHT = 860;
const AIR_ROWS = 6;   // запас под последним блоком в новой расстановке

// Анимации появления и «дыхания» в редакторе только мешают мерить блоки.
const FROZEN_CSS = '.pf-body *,.pf-body *::before,.pf-body *::after{animation-delay:-60s!important;animation-iteration-count:1!important;transition:none!important}'
  + '.pf-enter{display:none!important}.pf-body{user-select:none;-webkit-user-select:none}';

const grid = () => (state.caps && state.caps.customLayout) || { cols: 96, row: 8, canvas: 1120, maxRows: 1200, cells: [] };
const cellInfo = (id) => grid().cells.find((cell) => cell.id === id) || { id, name: id, minW: 4, minH: 3 };
const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const bottomOf = (items) => items.reduce((max, item) => Math.max(max, item.y + item.h), 0);
const clone = (value) => JSON.parse(JSON.stringify(value));
const same = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const EASE = 'cubic-bezier(.2,.8,.2,1)';

/** Та же раскладка без наложений, что и на сервере (utils/profileCustomLayout). */
function resolveOverlaps(items) {
  const placed = [];
  [...items].sort((a, b) => a.y - b.y || a.x - b.x).forEach((item) => {
    const next = { ...item };
    let hit = placed.find((other) => overlaps(next, other));
    while (hit) {
      next.y = hit.y + hit.h;
      hit = placed.find((other) => overlaps(next, other));
    }
    placed.push(next);
  });
  return placed;
}

function htmlToNodes(html) {
  const parsed = new DOMParser().parseFromString(String(html), 'text/html');
  const frag = document.createDocumentFragment();
  Array.from(parsed.body.childNodes).forEach((node) => frag.appendChild(document.importNode(node, true)));
  return frag;
}

/** Где клетка стоит по мнению сервера — из вычисленных стилей сетки. */
function readCell(node) {
  const cs = getComputedStyle(node);
  const start = (value) => parseInt(value, 10);
  const span = (value) => parseInt(String(value).replace('span', ''), 10);
  return { id: node.dataset.cell, x: start(cs.gridColumnStart) - 1, y: start(cs.gridRowStart) - 1, w: span(cs.gridColumnEnd), h: span(cs.gridRowEnd) };
}

const MEASURE = {
  avatar: '.pf-avatar-wrap',
  name: '.pf-title-group',
  intro: '.pf-intro',
  status: '.pf-status',
  actions: '.pf-actions'
};

/**
 * Одно поле расстановки: страница в теневом дереве с логической шириной
 * width (медиазапросы страницы — по ней) и рамки блоков поверх.
 */
function createBoard({ width, maxScale, onCommit, onSelect }) {
  const g = grid();
  const board = { items: [], rows: 0, present: [], scale: 1, width };

  const viewport = el('div', { class: 'lx-viewport' });
  viewport.style.cssText = `width:${width}px;container:pf / inline-size;--pf-viewport-height:${VIEW_HEIGHT}px`;
  const host = el('div', { class: 'lx-host' });
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  const body = document.createElement('div');
  body.className = 'pf-body pf-ready';
  shadow.append(style, body);

  const ghost = el('div', { class: 'lx-ghost', hidden: true });
  const bottom = el('div', { class: 'lx-bottom', title: 'Потяните вниз, чтобы добавить места внизу страницы' }, [
    el('span', { text: 'Низ страницы · потяните, чтобы добавить места' })
  ]);
  const frame = el('div', { class: 'lx-frame' }, [el('span', { class: 'lx-top', text: 'Верх страницы' }), bottom]);
  const layer = el('div', { class: 'lx-layer' }, [frame, ghost]);
  viewport.append(host, layer);
  const spacer = el('div', { class: 'lx-spacer' }, [viewport]);
  board.stage = el('div', { class: 'lx-stage' }, [spacer]);
  board.host = host;
  board.body = body;

  board.paint = (fragment) => {
    style.textContent = fragment.css + FROZEN_CSS;
    body.replaceChildren(htmlToNodes(fragment.html));
    const shell = body.querySelector('.pf-shell');
    if (shell) shell.inert = false;
  };

  const cellNode = (id) => body.querySelector(`.pf-cell[data-cell="${id}"]`);
  const toLocal = (rect) => {
    const origin = viewport.getBoundingClientRect();
    const s = board.scale || 1;
    return { left: (rect.left - origin.left) / s, top: (rect.top - origin.top) / s, width: rect.width / s, height: rect.height / s };
  };

  function canvas() {
    const node = body.querySelector('.pf-canvas');
    if (!node) return { left: 0, top: 0, width: g.canvas, height: 0, colW: g.canvas / g.cols };
    const r = toLocal(node.getBoundingClientRect());
    return { ...r, colW: r.width / g.cols };
  }

  board.fit = () => {
    const scale = Math.min(maxScale, board.stage.clientWidth / width);
    const height = Math.max(VIEW_HEIGHT, host.scrollHeight);
    viewport.style.height = height + 'px';
    viewport.style.transform = `scale(${scale})`;
    viewport.style.setProperty('--lx-scale', String(scale));
    spacer.style.width = width * scale + 'px';
    spacer.style.height = height * scale + 'px';
    board.scale = scale;
    sync();
  };

  // --- рамки ---------------------------------------------------------------
  const boxes = new Map();
  let drag = null;

  board.buildBoxes = () => {
    boxes.forEach((box) => box.remove());
    boxes.clear();
    board.present.forEach((id) => {
      const info = cellInfo(id);
      const box = el('div', { class: 'lx-box', tabindex: '0', dataset: { cell: id }, 'aria-label': info.name }, [
        el('span', { class: 'lx-label', text: info.name }),
        el('i', { class: 'lx-handle lx-handle--e', dataset: { edge: 'e' } }),
        el('i', { class: 'lx-handle lx-handle--s', dataset: { edge: 's' } }),
        el('i', { class: 'lx-handle lx-handle--se', dataset: { edge: 'se' } })
      ]);
      box.addEventListener('pointerdown', (event) => beginDrag(event, id));
      box.addEventListener('focus', () => onSelect(board, id));
      layer.appendChild(box);
      boxes.set(id, box);
    });
  };

  board.markSelected = (id) => boxes.forEach((box, key) => box.classList.toggle('is-selected', key === id));

  /** Рамки и границы поля — по настоящим прямоугольникам клеток. */
  let landingUntil = 0;
  function sync() {
    if (performance.now() < landingUntil) return;
    const c = canvas();
    frame.style.left = c.left + 'px';
    frame.style.top = c.top + 'px';
    frame.style.width = c.width + 'px';
    frame.style.height = Math.max(c.height, board.rows * g.row) + 'px';
    boxes.forEach((box, id) => {
      if (drag && drag.id === id) return;
      const node = cellNode(id);
      if (!node) return;
      const r = toLocal(node.getBoundingClientRect());
      Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    });
  }
  board.sync = sync;

  // --- клетки ----------------------------------------------------------------
  const itemOf = (id) => board.items.find((item) => item.id === id);
  board.fits = (candidate) => candidate.x >= 0 && candidate.y >= 0 && candidate.x + candidate.w <= g.cols
    && candidate.y + candidate.h <= board.rows
    && !board.items.some((other) => other.id !== candidate.id && board.present.includes(other.id) && overlaps(candidate, other));

  function place(item) {
    const node = cellNode(item.id);
    if (!node) return;
    node.style.gridColumn = `${item.x + 1} / span ${item.w}`;
    node.style.gridRow = `${item.y + 1} / span ${item.h}`;
  }

  function setRows(rows) {
    const node = body.querySelector('.pf-canvas');
    if (node) node.style.gridTemplateRows = `repeat(${rows}, minmax(${g.row}px, auto))`;
  }

  /**
   * Сколько строк нужно содержимому клетки. Если текст не влез в рамку,
   * строки страницы вытягиваются и всё ниже съезжает, поэтому высоту клетки
   * держим не меньше содержимого.
   */
  function neededRows(id) {
    const node = cellNode(id);
    if (!node) return 0;
    const top = node.getBoundingClientRect().top;
    let low = top;
    for (const child of node.children) low = Math.max(low, child.getBoundingClientRect().bottom);
    return Math.max(cellInfo(id).minH, Math.ceil((low - top) / (board.scale || 1) / g.row - 0.02));
  }

  /** Перечитать клетки из того, что нарисовал сервер. */
  board.absorb = () => {
    const nodes = [...body.querySelectorAll('.pf-cell[data-cell]')];
    board.present = nodes.map((node) => node.dataset.cell);
    const fromPage = nodes.map(readCell).filter((item) => Number.isFinite(item.x) && Number.isFinite(item.w));
    board.items = [...fromPage, ...board.items.filter((item) => !board.present.includes(item.id))];
    // Подтянуть высоты под содержимое и раздвинуть то, что стало налезать.
    let grown = false;
    const shown = board.items.filter((item) => board.present.includes(item.id)).map((item) => {
      const need = neededRows(item.id);
      if (need > item.h) { grown = true; return { ...item, h: need }; }
      return item;
    });
    if (grown) {
      const placed = resolveOverlaps(shown);
      board.items = [...placed, ...board.items.filter((item) => !board.present.includes(item.id))];
      placed.forEach(place);
    }
    board.rows = Math.max(board.rows, bottomOf(shown.length ? board.items.filter((item) => board.present.includes(item.id)) : []));
    setRows(board.rows);
    board.buildBoxes();
  };

  /** Расстановка «как в раскладке»: замер блоков на странице без своей расстановки. */
  board.measureBase = () => {
    const shell = body.querySelector('.pf-shell');
    if (!shell) return false;
    const cs = getComputedStyle(shell);
    const shellRect = toLocal(shell.getBoundingClientRect());
    const padL = parseFloat(cs.paddingLeft) || 0;
    const padR = parseFloat(cs.paddingRight) || 0;
    const available = shellRect.width - padL - padR;
    const canvasW = Math.min(g.canvas, available);
    const canvasLeft = shellRect.left + padL + (available - canvasW) / 2;
    const colW = canvasW / g.cols;
    const found = [];
    const add = (id, node) => {
      if (!node || found.some((item) => item.id === id)) return;
      const r = toLocal(node.getBoundingClientRect());
      if (r.width < 2 || r.height < 2) return;
      found.push({ id, ...r });
    };
    Object.entries(MEASURE).forEach(([id, selector]) => add(id, body.querySelector(selector)));
    body.querySelectorAll('[data-block]').forEach((node) => add(node.dataset.block, node));
    if (!found.length) return false;
    const firstTop = Math.min(...found.map((item) => item.top));
    const next = found.map((item) => {
      const info = cellInfo(item.id);
      // Вверх, а не до ближайшего: в клетку на волос уже текст переносился бы.
      let w = Math.max(info.minW, Math.ceil(item.width / colW - 0.05));
      let h = Math.max(info.minH, Math.ceil(item.height / g.row));
      if (item.id === 'avatar') {
        const size = Math.max(item.width, item.height);
        w = Math.max(info.minW, Math.round(size / colW));
        h = Math.max(info.minH, Math.round(size / g.row));
      }
      w = Math.min(g.cols, w);
      const x = Math.min(g.cols - w, Math.max(0, Math.round((item.left - canvasLeft) / colW)));
      const y = Math.max(0, Math.round((item.top - firstTop) / g.row));
      return { id: item.id, x, y, w, h };
    });
    board.items = resolveOverlaps(next);
    board.rows = bottomOf(board.items) + AIR_ROWS;
    return true;
  };

  /**
   * Автопрокрутка поля: блок или низ страницы подвели к краю — поле едет само.
   * Без неё блок снизу длинной страницы было не дотащить до верха.
   * onTick(v, scrolled) зовётся на каждом кадре у края.
   */
  function autoScroll(getY, onTick) {
    let raf = 0;
    const zone = 70;
    const tick = () => {
      const y = getY();
      const r = board.stage.getBoundingClientRect();
      let v = 0;
      if (y < r.top + zone) v = -Math.min(22, Math.ceil((r.top + zone - y) / 4));
      else if (y > r.bottom - zone) v = Math.min(22, Math.ceil((y - r.bottom + zone) / 4));
      if (v) {
        const before = board.stage.scrollTop;
        board.stage.scrollTop += v;
        onTick(v, board.stage.scrollTop !== before);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }

  // --- перетаскивание ----------------------------------------------------------
  function beginDrag(event, id) {
    if (event.button !== 0) return;
    const item = itemOf(id);
    const box = boxes.get(id);
    const node = cellNode(id);
    if (!item || !box || !node) return;
    event.preventDefault();
    onSelect(board, id);
    box.focus({ preventScroll: true });
    box.setPointerCapture(event.pointerId);
    const edge = event.target.dataset.edge || null;
    const c = canvas();
    drag = {
      id, edge, box, node,
      startX: event.clientX, startY: event.clientY,
      from: { ...item }, valid: { ...item },
      rect: { left: parseFloat(box.style.left), top: parseFloat(box.style.top), width: parseFloat(box.style.width), height: parseFloat(box.style.height) },
      c,
      scroll0: board.stage.scrollTop,
      last: event
    };
    drag.stopScroll = autoScroll(() => drag.last.clientY, (v, scrolled) => { if (scrolled) onDrag(drag.last); });
    box.classList.add('is-dragging');
    if (!edge) {
      // Блок едет за курсором целиком, а клетка остаётся на месте до отпускания.
      node.style.position = 'relative';
      node.style.zIndex = '5';
      node.style.willChange = 'transform';
      showGhost(item);
    }
    document.body.classList.add(edge ? 'lx-resizing' : 'lx-moving');
    box.addEventListener('pointermove', onDrag);
    box.addEventListener('pointerup', endDrag);
    box.addEventListener('pointercancel', endDrag);
  }

  function showGhost(item) {
    const { c } = drag;
    ghost.hidden = false;
    Object.assign(ghost.style, {
      left: c.left + item.x * c.colW + 'px',
      top: c.top + item.y * g.row + 'px',
      width: item.w * c.colW + 'px',
      height: item.h * g.row + 'px'
    });
  }

  function onDrag(event) {
    if (!drag) return;
    const s = board.scale || 1;
    const dx = (event.clientX - drag.startX) / s;
    drag.last = event;
    const dy = (event.clientY - drag.startY + board.stage.scrollTop - drag.scroll0) / s;
    const { colW } = drag.c;
    const info = cellInfo(drag.id);
    const from = drag.from;
    const next = { ...from };
    const box = drag.box;
    if (!drag.edge) {
      next.x = Math.min(g.cols - from.w, Math.max(0, Math.round(from.x + dx / colW)));
      next.y = Math.min(board.rows - from.h, Math.max(0, Math.round(from.y + dy / g.row)));
      const move = `translate(${dx}px, ${dy}px)`;
      drag.node.style.transform = move;
      box.style.transform = move;
      const ok = board.fits(next);
      box.classList.toggle('is-bad', !ok);
      if (ok) drag.valid = next;
      showGhost(drag.valid);
      ghost.classList.toggle('is-bad', !ok);
      return;
    }
    let ex = drag.edge.includes('e') ? dx : 0;
    let ey = drag.edge.includes('s') ? dy : 0;
    if (drag.id === 'avatar' && drag.edge === 'se') {
      // Аватар — круг: растёт одинаково в обе стороны.
      const d = Math.abs(ex) > Math.abs(ey) ? ex : ey;
      ex = d; ey = d;
    }
    const w = Math.max(info.minW * colW, drag.rect.width + ex);
    const h = Math.max(info.minH * g.row, drag.rect.height + ey);
    next.w = Math.min(g.cols - from.x, Math.max(info.minW, Math.round(w / colW)));
    next.h = Math.max(info.minH, Math.round(h / g.row));
    if (drag.id === 'avatar' && drag.edge === 'se') next.h = Math.max(info.minH, Math.round(next.w * colW / g.row));
    box.style.width = w + 'px';
    box.style.height = h + 'px';
    let ok = board.fits(next);
    if (ok) {
      // Уже клетка — текст переносится и становится выше: рамка растёт вниз
      // сама, а если ниже места нет, такой размер не принимается.
      place(next);
      const need = neededRows(drag.id);
      if (need > next.h) { next.h = need; ok = board.fits(next); }
    }
    box.classList.toggle('is-bad', !ok);
    if (!ok) { place(drag.valid); return; }
    if (!same(next, drag.valid)) {
      drag.valid = next;
      place(next);
      requestAnimationFrame(sync);
    }
  }

  function endDrag() {
    if (!drag) return;
    const { id, box, node, valid, from, edge } = drag;
    box.classList.remove('is-dragging', 'is-bad');
    box.removeEventListener('pointermove', onDrag);
    box.removeEventListener('pointerup', endDrag);
    box.removeEventListener('pointercancel', endDrag);
    document.body.classList.remove('lx-moving', 'lx-resizing');
    ghost.hidden = true;
    ghost.classList.remove('is-bad');
    drag.stopScroll();
    drag = null;
    board.items = board.items.map((item) => (item.id === id ? { ...valid } : item));
    if (!edge) {
      // Плавная посадка: с того места, где блок отпустили, на его клетку.
      // Рамки сверяем после посадки — посреди анимации прямоугольник блока
      // ещё смещён, и рамка запомнила бы точку, где его отпустили.
      const before = node.getBoundingClientRect();
      node.style.transform = '';
      box.style.transform = '';
      place(valid);
      const after = node.getBoundingClientRect();
      const s = board.scale || 1;
      const offset = `translate(${(before.left - after.left) / s}px, ${(before.top - after.top) / s}px)`;
      sync();
      const landing = { duration: 220, easing: EASE };
      landingUntil = performance.now() + 240;
      box.animate([{ transform: offset }, { transform: 'translate(0, 0)' }], landing);
      node.animate([{ transform: offset }, { transform: 'translate(0, 0)' }], landing).finished
        .catch(() => {}).then(() => { node.style.position = ''; node.style.zIndex = ''; node.style.willChange = ''; landingUntil = 0; sync(); });
    } else {
      place(valid);
      sync();
    }
    if (!same(valid, from)) onCommit();
  }

  function commit(id, next, from) {
    board.items = board.items.map((item) => (item.id === id ? { ...next } : item));
    place(next);
    sync();
    if (!same(next, from)) onCommit();
  }

  board.dragging = () => Boolean(drag);

  board.nudge = (id, key, step) => {
    const item = itemOf(id);
    if (!item) return;
    const next = { ...item };
    if (key === 'ArrowLeft') next.x -= step;
    if (key === 'ArrowRight') next.x += step;
    if (key === 'ArrowUp') next.y -= step;
    if (key === 'ArrowDown') next.y += step;
    if (board.fits(next)) commit(id, next, item);
  };

  // --- низ страницы --------------------------------------------------------------
  bottom.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    bottom.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const scroll0 = board.stage.scrollTop;
    const startRows = board.rows;
    const minRows = Math.max(4, bottomOf(board.items.filter((item) => board.present.includes(item.id))));
    let rows = startRows;
    let lastY = startY;
    let extra = 0;   // у нижнего края, когда прокручивать уже некуда, низ растёт сам
    document.body.classList.add('lx-resizing');
    const apply = () => {
      const px = lastY - startY + board.stage.scrollTop - scroll0 + extra;
      rows = Math.min(g.maxRows, Math.max(minRows, Math.round(startRows + px / (board.scale || 1) / g.row)));
      if (rows === board.rows) return;
      board.rows = rows;
      setRows(rows);
      board.fit();
    };
    const move = (e) => { lastY = e.clientY; apply(); };
    const stopScroll = autoScroll(() => lastY, (v, scrolled) => {
      if (!scrolled && v > 0) extra += v;
      apply();
    });
    const up = () => {
      stopScroll();
      bottom.removeEventListener('pointermove', move);
      bottom.removeEventListener('pointerup', up);
      bottom.removeEventListener('pointercancel', up);
      document.body.classList.remove('lx-resizing');
      if (rows !== startRows) onCommit();
    };
    bottom.addEventListener('pointermove', move);
    bottom.addEventListener('pointerup', up);
    bottom.addEventListener('pointercancel', up);
  });

  return board;
}

export function openLayoutEditor(onSaved) {
  if (window.innerWidth < 1000) {
    toast('Расстановку можно менять только с компьютера', 'err');
    return;
  }
  if (document.querySelector('.lx')) return;

  const layoutName = ((state.caps && state.caps.layouts) || []).find((item) => item.id === state.page.layout)?.name || 'Focus';
  const saved = state.page.customLayout && state.page.customLayout.on ? clone(state.page.customLayout) : null;

  let changed = false;
  let selected = null;   // { board, id }
  let ticket = 0;

  const select = (board, id) => {
    selected = { board, id };
    [pc, phone].forEach((b) => b.markSelected(b === board ? id : null));
  };
  const onCommit = () => { changed = true; refresh(); };

  const pc = createBoard({ width: 1280, maxScale: 1.1, onCommit, onSelect: select });
  const phone = createBoard({ width: 390, maxScale: 1, onCommit, onSelect: select });
  pc.stage.classList.add('lx-stage--pc');
  phone.stage.classList.add('lx-stage--phone');
  if (saved) {
    pc.items = saved.items || [];
    pc.rows = saved.rows || 0;
    phone.items = saved.phone || [];
    phone.rows = saved.phoneRows || 0;
  }

  const status = el('span', { class: 'lx-status', text: '' });
  const root = el('div', { class: 'lx', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Своя расстановка' }, [
    el('header', { class: 'lx-bar' }, [
      el('div', { class: 'lx-title' }, [
        el('strong', {}, ['Своя расстановка ', el('span', { class: 'beta', text: 'Бета' })]),
        el('span', { class: 'lx-sub', text: `поверх раскладки «${layoutName}» · тяните блок за рамку, размер — за края, стрелки двигают выбранный блок` })
      ]),
      el('div', { class: 'lx-tools' }, [
        status,
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Начать заново', title: 'Расставить как в раскладке — и на компьютере, и на телефоне', onClick: () => restart() }),
        el('button', { class: 'btn btn--ghost btn--sm', type: 'button', text: 'Отмена', onClick: () => close(false) }),
        el('button', { class: 'btn btn--primary btn--sm', type: 'button', text: 'Готово', onClick: () => close(true) })
      ])
    ]),
    el('div', { class: 'lx-body' }, [
      el('section', { class: 'lx-main' }, [el('p', { class: 'lx-side-title', text: 'Компьютер' }), pc.stage]),
      el('aside', { class: 'lx-side' }, [
        el('p', { class: 'lx-side-title', text: 'Телефон — расставляется отдельно' }),
        phone.stage
      ])
    ])
  ]);
  document.body.appendChild(root);
  document.body.classList.add('lx-open');

  const fitAll = () => { pc.fit(); phone.fit(); };
  const resize = new ResizeObserver(fitAll);
  [pc.stage, pc.host, phone.stage, phone.host].forEach((node) => resize.observe(node));

  async function render(patch) {
    const mine = ++ticket;
    status.textContent = 'Обновляем…';
    let fragment;
    try {
      fragment = await api.preview({ ...pendingPatch(), ...patch });
    } catch (error) {
      if (mine === ticket) status.textContent = '';
      toast(error.message || 'Не удалось собрать страницу', 'err');
      return false;
    }
    if (mine !== ticket) return false;
    pc.paint(fragment);
    phone.paint(fragment);
    fitAll();
    status.textContent = '';
    return true;
  }

  const customPatch = () => ({
    customLayout: { on: true, items: pc.items, rows: pc.rows, phone: phone.items, phoneRows: phone.rows }
  });

  function absorbAll() {
    pc.absorb();
    phone.absorb();
    fitAll();
    if (selected) select(selected.board, selected.id);
  }

  async function start() {
    if (!pc.items.length || !phone.items.length) {
      if (!(await render({ customLayout: { on: false } }))) { close(false, true); return; }
      if (!pc.items.length && !pc.measureBase()) { close(false, true); return; }
      if (!phone.items.length) phone.measureBase();
    }
    if (await render(customPatch())) absorbAll();
  }

  async function restart() {
    if (changed && !window.confirm('Убрать все перестановки и начать с раскладки?')) return;
    pc.items = []; phone.items = [];
    pc.rows = 0; phone.rows = 0;
    if (!(await render({ customLayout: { on: false } }))) return;
    pc.measureBase();
    phone.measureBase();
    changed = true;
    if (await render(customPatch())) absorbAll();
  }

  let refreshTimer = 0;
  function refresh() {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      // Пока блок в руке, страницу не перерисовываем: иначе рамка, за которую
      // тянут, пропадает вместе со старой разметкой и застревает не на месте.
      if (pc.dragging() || phone.dragging()) { refresh(); return; }
      if (!(await render(customPatch()))) return;
      if (pc.dragging() || phone.dragging()) { refresh(); return; }
      absorbAll();
    }, 250);
  }

  // Стрелки: сдвиг выбранного блока на клетку (с Shift — на четыре).
  function onKey(event) {
    if (event.key === 'Escape') { event.preventDefault(); close(false); return; }
    if (!selected || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    selected.board.nudge(selected.id, event.key, event.shiftKey ? 4 : 1);
  }
  document.addEventListener('keydown', onKey);

  function close(save, quiet) {
    if (!save && !quiet && changed && !window.confirm('Выйти без сохранения? Перестановки пропадут.')) return;
    clearTimeout(refreshTimer);
    ticket++;
    resize.disconnect();
    document.removeEventListener('keydown', onKey);
    root.remove();
    document.body.classList.remove('lx-open', 'lx-moving', 'lx-resizing');
    if (save && pc.items.length) {
      update(customPatch(), { now: true });
      if (onSaved) onSaved();
      toast('Своя расстановка сохранена в черновик. Опубликуйте, когда понравится.');
    }
  }

  start();
}
