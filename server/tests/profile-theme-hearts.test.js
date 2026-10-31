const test = require('node:test');
const assert = require('node:assert/strict');
const { limitsFor } = require('../config/profileTiers');
const { buildView } = require('../utils/profilePageView');
const { buildStyles } = require('../utils/profilePageStyles');
const { renderPage, renderPreviewFragment } = require('../utils/profilePageHtml');
const { buildCustomTheme } = require('../utils/profileTheme');
const { contrast, hexRgb } = require('../utils/profileColor');
const { issueHeartToken, verifyHeartToken, compactCount } = require('../utils/profileHearts');
const { mountProfileEffects } = require('../utils/profileEffects');
const { applyPatch } = require('../routes/profilePages');

const user = { username: 'fixture' };
const options = { nonce: 'n', canonical: 'https://example.test/u/fixture', siteUrl: 'https://loveapp.chat' };
const blank = (extra = {}) => ({
  theme: 'midnight', layout: 'stack', font: 'system', effect: 'none', effects: [], effectColors: [], avatarFrame: 'none',
  links: [], background: { kind: 'none' }, bgGradient: {}, style: {}, gallery: [], tags: [], quote: {}, countdown: {},
  invite: {}, stylePresets: [], customTheme: {}, hearts: { enabled: false, count: 0 }, ...extra
});
const patch = (page, body, tier) => applyPatch(page, body, { tier, limits: limitsFor(tier), user: { friends: [] } });

test('своя тема: плохо читаемый текст подстраивается до контраста 4.5 к обоим фонам', () => {
  const built = buildCustomTheme({ enabled: true, bg: '#202020', bg2: '#303030', text: '#404040', muted: '#383838', accent: '#ff3366' });
  for (const bg of ['#202020', '#303030']) {
    assert.ok(contrast(hexRgb(built.tokens.text), hexRgb(bg)) >= 4.5);
    assert.ok(contrast(hexRgb(built.tokens.muted), hexRgb(bg)) >= 3);
  }
  assert.deepEqual(built.adjusted, ['text', 'muted']);
  // Хорошие цвета не трогаются.
  const fine = buildCustomTheme({ enabled: true, bg: '#0b0b0f', text: '#f5f5f5', accent: '#ff3366' });
  assert.equal(fine.tokens.text, '#f5f5f5');
  assert.deepEqual(fine.adjusted, []);
});

test('своя тема видна только на Premium; на Free страница возвращается к готовой теме', () => {
  const page = blank({ customTheme: { enabled: true, bg: '#112233', text: '#ffffff', accent: '#ff3366' } });
  const premium = buildView(page, user, 'premium');
  assert.equal(premium.theme.id, 'custom');
  assert.match(buildStyles(premium), /--bg:#112233;/);
  assert.equal(buildView(page, user, 'free').theme.id, 'midnight');
});

test('applyPatch: включить свою тему — Premium, выключить — любой тариф', () => {
  assert.deepEqual(patch(blank(), { customTheme: { enabled: true, bg: '#112233' } }, 'free').map(e => e.field), ['customTheme']);
  const page = blank({ customTheme: { enabled: true, bg: '#112233' } });
  assert.deepEqual(patch(page, { customTheme: { enabled: false, bg: '#112233' } }, 'free'), []);
  assert.equal(page.customTheme.enabled, false);
  assert.deepEqual(patch(blank(), { customTheme: { enabled: true, bg: 'red' } }, 'premium').map(e => e.field), ['customTheme.bg']);
});

test('несколько эффектов: лимит тарифа, закрытые выпадают, старое одно поле работает', () => {
  assert.deepEqual(buildView(blank({ effects: ['snow', 'grain', 'hearts', 'stars'] }), user, 'premium').effects, ['snow', 'grain', 'hearts']);
  assert.deepEqual(buildView(blank({ effects: ['snow', 'grain', 'particles', 'ripple'] }), user, 'free').effects, ['grain', 'particles']);
  assert.deepEqual(buildView(blank({ effect: 'stars' }), user, 'premium').effects, ['stars']);
  const html = renderPage(buildView(blank({ effects: ['grain', 'scanlines'] }), user, 'premium'), options);
  assert.match(html, /"effect":\["grain","scanlines"\]/);
  assert.match(buildStyles(buildView(blank({ effects: ['scanlines'] }), user, 'premium')), /\.pf-scan\{/);
});

test('applyPatch: эффекты сверх лимита и закрытые — отказ, уже стоящие можно оставить', () => {
  assert.deepEqual(patch(blank(), { effects: ['snow'] }, 'free').map(e => e.field), ['effects']);
  assert.deepEqual(patch(blank(), { effects: ['grain', 'particles', 'ripple'] }, 'free').map(e => e.field), ['effects']);
  const page = blank({ effects: ['snow', 'grain'] });
  assert.deepEqual(patch(page, { effects: ['snow'] }, 'free'), []);
  assert.deepEqual(page.effects, ['snow']);
  assert.equal(page.effect, 'snow');
  assert.deepEqual(patch(blank(), { effectColors: ['#ff0000'] }, 'free').map(e => e.field), ['effectColors']);
  const pro = blank();
  assert.deepEqual(patch(pro, { effectColors: ['#FF0000', '#00ff00'] }, 'pro'), []);
  assert.match(buildStyles(buildView(pro, user, 'pro')), /--fx-1:#ff0000;\s*--fx-2:#00ff00;/);
});

test('цвет имени: свой цвет — всем, градиент — с Pro, в CSS только проверенные цвета', () => {
  const free = blank();
  assert.deepEqual(patch(free, { style: { nameFill: 'solid', nameColors: ['#FF8FB0'] } }, 'free'), []);
  assert.match(buildStyles(buildView(free, user, 'free')), /\.pf-shell \.pf-name\{color:#ff8fb0\}/);
  assert.deepEqual(patch(blank(), { style: { nameFill: 'gradient', nameColors: ['#ff0000', '#0000ff'] } }, 'free').map(e => e.field), ['style.nameFill']);
  assert.deepEqual(patch(blank(), { style: { nameColors: ['red'] } }, 'free').map(e => e.field), ['style.nameColors']);
  const pro = blank({ style: { nameFill: 'gradient', nameColors: ['#ff0000', '#00ff00', '#0000ff'], nameAngle: 45 } });
  assert.match(buildStyles(buildView(pro, user, 'pro')), /linear-gradient\(45deg,#ff0000,#00ff00,#0000ff\)/);
  // Прежний переключатель «имя градиентом» остаётся градиентом акцента.
  assert.equal(buildView(blank({ style: { nameGradient: true } }), user, 'pro').style.nameFill, 'accent');
});

test('подпись сердечка: своя страница, живёт 12 часов, подделка не проходит', () => {
  const now = Date.now();
  const token = issueHeartToken('page-a', now);
  assert.equal(verifyHeartToken(token, 'page-a', now + 1000), true);
  assert.equal(verifyHeartToken(token, 'page-b', now + 1000), false);
  assert.equal(verifyHeartToken(token, 'page-a', now + 13 * 3600e3), false);
  const forged = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
  assert.equal(verifyHeartToken(forged, 'page-a', now), false);
  assert.equal(verifyHeartToken('', 'page-a', now), false);
  assert.equal(compactCount(999), '999');
  assert.equal(compactCount(1234), '1,2 тыс.');
  assert.equal(compactCount(25000), '25 тыс.');
});

test('кнопка-сердечко появляется только включённой, без inline-стилей, в превью без подписи', () => {
  const off = renderPreviewFragment(buildView(blank(), user, 'free'), options).html;
  assert.doesNotMatch(off, /pf-heart|pf-actions/);
  const view = buildView(blank({ hearts: { enabled: true, count: 1234 } }), user, 'free');
  const preview = renderPreviewFragment(view, options).html;
  assert.match(preview, /class="pf-heart"/);
  assert.doesNotMatch(preview, /data-token/);
  assert.match(preview, /1,2 тыс\./);
  const page = renderPage(view, { ...options, heartToken: 'abc.def' });
  assert.match(page, /data-token="abc\.def"/);
  assert.doesNotMatch(page.split('<body')[1].split('<script')[0], /\sstyle="/);
  assert.match(buildStyles(view), /\.pf-heart\{/);
});

test('владелец не может сам накрутить счётчик через сохранение', () => {
  const page = blank({ hearts: { enabled: false, count: 3 } });
  assert.deepEqual(patch(page, { hearts: { enabled: true, count: 99999 } }, 'free'), []);
  assert.equal(page.hearts.enabled, true);
  assert.equal(page.hearts.count, 3);
});

test('несколько эффектов в одном контейнере освобождаются одним вызовом', () => {
  const nodes = [];
  const frames = new Map();
  let nextId = 0;
  const target = () => ({ addEventListener() {}, removeEventListener() {} });
  const win = {
    ...target(), navigator: {}, devicePixelRatio: 1, matchMedia: () => ({ matches: false, ...target() }),
    performance: { now: () => 0 }, getComputedStyle: () => ({ getPropertyValue: () => '#fff' }),
    requestAnimationFrame(cb) { nextId += 1; frames.set(nextId, cb); return nextId; },
    cancelAnimationFrame: id => frames.delete(id)
  };
  const doc = { ...target(), hidden: false, defaultView: win, documentElement: target() };
  doc.createElement = () => ({
    clientWidth: 300, clientHeight: 500, style: { setProperty() {} }, classList: { add() {}, remove() {} },
    setAttribute() {}, getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 500 }),
    getContext: () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => ({ addColorStop() {} })) }),
    remove() { this.removed = true; }
  });
  const container = { ownerDocument: doc, appendChild: n => nodes.push(n), getRootNode: () => ({ host: target() }) };
  const dispose = mountProfileEffects(container, ['hearts', 'scanlines', 'hearts', 'ripple']);
  assert.equal(nodes.length, 3);
  dispose(); dispose();
  assert.ok(nodes.every(n => n.removed));
  assert.equal(frames.size, 0);
});
