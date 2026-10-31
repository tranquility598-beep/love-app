/**
 * Своя расстановка страницы (Premium): человек берёт любую раскладку и в
 * полноэкранном редакторе двигает и растягивает блоки.
 *
 * Хранится не в пикселях, а в клетках невидимой сетки: COLS колонок на ширину
 * холста и строки по ROW px. Колонки резиновые (на узком ноутбуке страница
 * сжимается пропорционально), строки — минимальная высота: если текст в блоке
 * не влез, строка растёт и сдвигает всё, что ниже, вместо того чтобы налезть.
 *
 * Блоки не пересекаются — это правило проверяется и здесь, а не только в
 * редакторе: CSS-сетка честно нарисует два блока в одной клетке друг на друге,
 * и пришедшую в обход редактора кашу надо разложить.
 *
 * У телефона своя расстановка (phone) в той же сетке на ширину экрана
 * телефона. Если её нет (страницу расставили до того, как она появилась),
 * на телефоне блоки идут столбиком в порядке компьютера. Редактор — только
 * на компьютере, телефон в нём настраивается в окошке справа.
 *
 * rows / phoneRows — высота холста в строках: человек может опустить низ
 * страницы ниже последнего блока, чтобы оставить воздух.
 */

const COLS = 96;
const ROW = 8;
const CANVAS = 1120;                 // ширина холста на большом экране, px
const MAX_ROWS = 1200;               // ~9600 px — длиннее страницу никто не тянет

// Что можно двигать: части шапки и блоки содержимого. Порядок — тот, в
// котором они встают при автоматической раскладке.
const CELLS = Object.freeze([
  { id: 'avatar', name: 'Аватар', minW: 4, minH: 6 },
  { id: 'name', name: 'Имя', minW: 12, minH: 5 },
  { id: 'intro', name: 'Описание', minW: 12, minH: 3 },
  { id: 'status', name: 'Статус', minW: 12, minH: 3 },
  { id: 'actions', name: 'Кнопка «Написать»', minW: 12, minH: 5 },
  { id: 'links', name: 'Ссылки', minW: 16, minH: 6 },
  { id: 'player', name: 'Музыка', minW: 20, minH: 6 },
  { id: 'gallery', name: 'Галерея', minW: 16, minH: 8 },
  { id: 'invite', name: 'Приглашение', minW: 16, minH: 6 },
  { id: 'interests', name: 'Интересы', minW: 12, minH: 3 },
  { id: 'quote', name: 'Цитата', minW: 16, minH: 4 },
  { id: 'countdown', name: 'Отсчёт', minW: 16, minH: 6 },
  { id: 'pair', name: 'Пара', minW: 16, minH: 6 },
  { id: 'friends', name: 'Близкие', minW: 16, minH: 6 }
]);
const CELL_BY_ID = Object.freeze(Object.fromEntries(CELLS.map(cell => [cell.id, cell])));

const int = (value, fallback) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? number : fallback;
};

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Разложить без наложений: идём сверху вниз, и блок, который задевает уже
 * поставленный, опускаем под него. Порядок стабильный — тот же вход даёт тот
 * же результат, и редактор с сервером сходятся.
 */
function resolveOverlaps(items) {
  const placed = [];
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  for (const item of sorted) {
    const next = { ...item };
    let hit = placed.find(other => overlaps(next, other));
    while (hit) {
      next.y = hit.y + hit.h;
      hit = placed.find(other => overlaps(next, other));
    }
    placed.push(next);
  }
  return placed;
}

/** Одна клетка из чужих рук: известный id, целые числа, в пределах холста. */
function cleanItem(raw) {
  const cell = CELL_BY_ID[raw && raw.id];
  if (!cell) return null;
  const w = Math.min(COLS, Math.max(cell.minW, int(raw.w, cell.minW)));
  const h = Math.min(MAX_ROWS, Math.max(cell.minH, int(raw.h, cell.minH)));
  const x = Math.min(COLS - w, Math.max(0, int(raw.x, 0)));
  const y = Math.min(MAX_ROWS - h, Math.max(0, int(raw.y, 0)));
  return { id: cell.id, x, y, w, h };
}

const bottomOf = items => items.reduce((max, item) => Math.max(max, item.y + item.h), 0);

function cleanItems(list) {
  const seen = new Set();
  const items = [];
  for (const entry of Array.isArray(list) ? list.slice(0, CELLS.length * 2) : []) {
    const item = cleanItem(entry);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }
  return resolveOverlaps(items);
}

/** Высота холста: не ниже последнего блока и не длиннее MAX_ROWS. */
const cleanRows = (value, items) => Math.min(MAX_ROWS, Math.max(bottomOf(items), int(value, 0)));

const OFF = Object.freeze({ on: false, items: [], rows: 0, phone: [], phoneRows: 0 });

/**
 * Расстановка для сохранения. on=false — «своей расстановки нет», тогда
 * страница рисуется выбранной раскладкой как обычно.
 */
function sanitizeCustomLayout(raw) {
  if (!raw || typeof raw !== 'object' || !raw.on) return { ...OFF };
  const items = cleanItems(raw.items);
  if (!items.length) return { ...OFF };
  const phone = cleanItems(raw.phone);
  return { on: true, items, rows: cleanRows(raw.rows, items), phone, phoneRows: phone.length ? cleanRows(raw.phoneRows, phone) : 0 };
}

/**
 * Клетки для показа: только те блоки, которым есть что показать (present),
 * и для каждого — место. Блок, у которого места ещё нет (человек добавил
 * галерею после того, как расставил страницу), встаёт во всю ширину под
 * остальными, чтобы не пропасть.
 */
function placeCells(stored, present) {
  const byId = new Map((stored || []).map(item => [item.id, item]));
  const known = [];
  const missing = [];
  for (const id of present) {
    if (!CELL_BY_ID[id]) continue;
    const item = byId.get(id);
    if (item) known.push(item);
    else missing.push(id);
  }
  let bottom = known.reduce((max, item) => Math.max(max, item.y + item.h), 0);
  for (const id of missing) {
    const cell = CELL_BY_ID[id];
    const h = Math.max(cell.minH, 8);
    known.push({ id, x: 0, y: bottom + 2, w: COLS, h });
    bottom += 2 + h;
  }
  return resolveOverlaps(known);
}

module.exports = { COLS, ROW, CANVAS, MAX_ROWS, CELLS, CELL_BY_ID, overlaps, resolveOverlaps, bottomOf, sanitizeCustomLayout, placeCells };
