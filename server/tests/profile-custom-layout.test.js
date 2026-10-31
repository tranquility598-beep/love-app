const test = require('node:test');
const assert = require('node:assert/strict');
const { sanitizeCustomLayout, placeCells, overlaps, COLS } = require('../utils/profileCustomLayout');
const { buildView } = require('../utils/profilePageView');
const { renderPage } = require('../utils/profilePageHtml');

const options = { nonce: 'profile-test', canonical: 'https://example.test/u/fixture', siteUrl: 'https://loveapp.chat' };
const noOverlaps = items => items.every((a, i) => items.every((b, j) => i === j || !overlaps(a, b)));

test('custom layout keeps known cells once, inside the canvas and without overlaps', () => {
  const result = sanitizeCustomLayout({
    on: true,
    items: [
      { id: 'avatar', x: -5, y: 0, w: 10, h: 10 },
      { id: 'name', x: 4, y: 2, w: 40, h: 8 },          // задевает аватар — уедет ниже
      { id: 'name', x: 60, y: 60, w: 10, h: 10 },       // дубль
      { id: 'links', x: 90, y: 30, w: 50, h: 1 },       // шире холста и ниже минимума
      { id: 'evil', x: 0, y: 0, w: 5, h: 5 }
    ]
  });
  assert.equal(result.on, true);
  assert.deepEqual(result.items.map(item => item.id).sort(), ['avatar', 'links', 'name']);
  const avatar = result.items.find(item => item.id === 'avatar');
  const links = result.items.find(item => item.id === 'links');
  assert.equal(avatar.x, 0);
  assert.ok(links.x + links.w <= COLS);
  assert.ok(links.h >= 6);
  assert.ok(noOverlaps(result.items));
});

test('custom layout without items or switched off is off', () => {
  const off = { on: false, items: [], rows: 0, phone: [], phoneRows: 0 };
  assert.deepEqual(sanitizeCustomLayout({ on: true, items: [] }), off);
  assert.deepEqual(sanitizeCustomLayout({ on: false, items: [{ id: 'name', x: 0, y: 0, w: 20, h: 6 }] }), off);
  assert.deepEqual(sanitizeCustomLayout(null), off);
});

test('page height never cuts the last block, phone layout is cleaned the same way', () => {
  const result = sanitizeCustomLayout({
    on: true,
    items: [{ id: 'name', x: 0, y: 10, w: 40, h: 8 }],
    rows: 3,
    phone: [{ id: 'name', x: 0, y: 0, w: 96, h: 8 }, { id: 'links', x: 0, y: 4, w: 96, h: 20 }],
    phoneRows: 9000
  });
  assert.equal(result.rows, 18);
  assert.ok(noOverlaps(result.phone));
  assert.ok(result.phoneRows <= 1200);
});

test('a block added after arranging gets a place below the rest', () => {
  const placed = placeCells([{ id: 'name', x: 0, y: 0, w: 40, h: 8 }], ['name', 'gallery']);
  const gallery = placed.find(item => item.id === 'gallery');
  assert.ok(gallery && gallery.y >= 8);
  assert.equal(gallery.w, COLS);
});

test('custom layout renders a grid only while the tier allows it', () => {
  const page = {
    displayName: 'Fixture', bio: 'Привет', layout: 'stack',
    links: [{ label: 'Site', url: 'https://example.com' }],
    customLayout: {
      on: true,
      items: [
        { id: 'links', x: 0, y: 30, w: 96, h: 20 },
        { id: 'name', x: 0, y: 0, w: 60, h: 10 },
        { id: 'avatar', x: 80, y: 0, w: 12, h: 14 }
      ]
    }
  };
  const premium = renderPage(buildView(page, { username: 'fixture' }, 'premium'), options);
  assert.match(premium, /pf-layout-stack pf-layout-custom/);
  assert.match(premium, /\.pf-cell-avatar\{grid-column:81\/span 12;grid-row:1\/span 14\}/);
  // В разметке — сверху вниз, слева направо: так клетки встают на телефоне.
  const order = [...premium.matchAll(/data-cell="([a-z]+)"/g)].map(match => match[1]);
  // Описание и кнопка без своего места встают под остальными.
  assert.deepEqual(order.slice(0, 3), ['name', 'avatar', 'links']);
  assert.deepEqual(order.slice(3).sort(), ['actions', 'intro']);

  // Без своей расстановки для телефона — столбиком; с ней — своя сетка на узком экране.
  assert.match(premium, /@media\(max-width:760px\)\{\.pf-canvas\{display:flex/);
  const withPhone = renderPage(buildView({ ...page, customLayout: { ...page.customLayout, phone: [{ id: 'links', x: 0, y: 0, w: 96, h: 20 }, { id: 'name', x: 0, y: 22, w: 96, h: 10 }], phoneRows: 40 } }, { username: 'fixture' }, 'premium'), options);
  assert.match(withPhone, /@media\(max-width:760px\)\{\.pf-canvas\{grid-template-rows:repeat\(\d+,minmax\(8px,auto\)\)\}\.pf-cell-links\{grid-column:1\/span 96;grid-row:1\/span 20\}/);

  const free = renderPage(buildView(page, { username: 'fixture' }, 'free'), options);
  assert.doesNotMatch(free, /pf-canvas|pf-layout-custom/);
});
