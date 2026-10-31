const test = require('node:test');
const assert = require('node:assert/strict');
const { capabilitiesFor, limitsFor, normalizeBlockOrder, BLOCK_IDS } = require('../config/profileTiers');
const { buildView } = require('../utils/profilePageView');
const { buildStyles } = require('../utils/profilePageStyles');
const { renderPreviewFragment } = require('../utils/profilePageHtml');
const { extractInviteCode } = require('../utils/profileInvite');
const { applyPatch, sanitizeStyleSnapshot } = require('../routes/profilePages');

const options = { nonce: 'custom-test', canonical: 'https://example.test/u/fixture', siteUrl: 'https://loveapp.chat' };
const user = { username: 'fixture' };

function blankPage(extra = {}) {
  return {
    theme: 'midnight', layout: 'stack', font: 'system', effect: 'none', avatarFrame: 'none',
    accent: null, accentTo: null, links: [],
    background: { kind: 'none', url: null, blur: 0, dim: 40 },
    bgGradient: { enabled: false, colors: [], angle: 160 },
    style: {}, gallery: [], tags: [], quote: {}, countdown: {}, invite: {}, stylePresets: [],
    ...extra
  };
}
const patch = (page, body, tier) => applyPatch(page, body, { tier, limits: limitsFor(tier), user: { friends: [] } });

test('Free: статичные темы, Studio, два шрифта, Contour и простые эффекты открыты, лимиты выросли', () => {
  const caps = capabilitiesFor('free');
  const allowed = list => list.filter(item => item.allowed).map(item => item.id);
  // Сезонные темы видны только в свой сезон — из сравнения их убираем.
  assert.deepEqual(allowed(caps.themes.filter(theme => !theme.season)), ['midnight', 'porcelain', 'rose', 'carbon', 'sunset', 'mint', 'ultraviolet', 'paper']);
  assert.deepEqual(allowed(caps.layouts), ['stack', 'card', 'center']);
  assert.deepEqual(allowed(caps.fonts), ['system', 'serif']);
  assert.deepEqual(allowed(caps.avatarFrames), ['none', 'ring']);
  assert.deepEqual(allowed(caps.effects), ['none', 'particles', 'grain', 'ripple']);
  assert.equal(caps.limits.bioMaxLength, 300);
  assert.equal(caps.limits.links, 6);
  for (const feature of ['customAccent', 'backgroundImage', 'statusBlock', 'badges', 'viewCount']) {
    assert.equal(caps.features[feature].allowed, true, feature);
  }
  for (const feature of ['accentGradient', 'gallery', 'customCursor', 'nameGradient', 'viewStats', 'linkStats']) {
    assert.equal(caps.features[feature].requires, 'pro', feature);
  }
  assert.equal(caps.features.nameEffects.requires, 'premium');
  assert.equal(caps.features.stylePresets.requires, 'premium');
});

test('страница без новых настроек получает прежний CSS — ни одного правила деталей', () => {
  const css = buildStyles(buildView(blankPage(), user, 'premium'));
  assert.doesNotMatch(css, /\.pf-shell \.pf-/);
  assert.doesNotMatch(css, /pf-blk|pf-type|svg\+xml|zoom:/);
});

test('закрытые тарифом детали показываются значением по умолчанию, сохранённое не трогается', () => {
  const page = blankPage({ style: { cursor: 'heart', nameEffect: 'glow', nameGradient: true, linkShape: 'pill' }, accentTo: '#00ff00', accent: '#ff0000' });
  const view = buildView(page, user, 'free');
  assert.equal(view.style.cursor, 'default');
  assert.equal(view.style.nameEffect, 'none');
  assert.equal(view.style.nameGradient, false);
  assert.equal(view.style.linkShape, 'pill');
  assert.equal(view.accent, '#ff0000');
  assert.equal(view.accentTo, null);
  assert.equal(page.style.cursor, 'heart');
});

test('порядок блоков: сохранённый, без мусора и повторов, скрытые не рендерятся', () => {
  assert.deepEqual(normalizeBlockOrder(['quote', 'evil', 'links', 'quote']).slice(0, 3), ['quote', 'links', 'player']);
  assert.equal(normalizeBlockOrder(null).length, BLOCK_IDS.length);
  const page = blankPage({
    links: [{ url: 'https://a.test', label: 'A' }],
    quote: { text: 'Цитата <script>', author: 'Я' },
    tags: ['кофе'],
    style: { blockOrder: ['quote', 'links'], hiddenBlocks: ['interests'] }
  });
  const out = renderPreviewFragment(buildView(page, user, 'free'), options).html;
  assert.ok(out.indexOf('pf-quote') < out.indexOf('pf-link-section'));
  assert.doesNotMatch(out, /pf-interests/);
  assert.match(out, /Цитата &lt;script&gt;/);
});

test('таймер считается на сервере, прошедшая дата — «Уже началось»', () => {
  const soon = buildView(blankPage({ countdown: { title: 'Релиз', at: new Date(Date.now() + 26 * 3600e3) } }), user, 'free');
  const fragment = renderPreviewFragment(soon, options).html;
  assert.match(fragment, /<b data-u="d">1<\/b>/);
  assert.match(fragment, /pf-countdown-done" hidden/);
  const past = renderPreviewFragment(buildView(blankPage({ countdown: { at: new Date(Date.now() - 1000) } }), user, 'free'), options).html;
  assert.match(past, /pf-countdown-units" hidden/);
});

test('галерея — только Pro и только картинки с наших хостов', () => {
  const page = blankPage({ gallery: ['http://localhost:5556/uploads/a.png', 'https://evil.test/x.png'] });
  assert.equal(buildView(page, user, 'free').gallery.length, 0);
  assert.deepEqual(buildView(page, user, 'pro').gallery, ['http://localhost:5556/uploads/a.png']);
});

test('applyPatch: Free меняет открытое, получает отказ на платное', () => {
  const page = blankPage();
  assert.deepEqual(patch(page, { theme: 'carbon', accent: '#FF5C8A', style: { linkShape: 'pill', cardAlpha: 250, nameAlign: 'center' } }, 'free'), []);
  assert.equal(page.theme, 'carbon');
  assert.equal(page.accent, '#ff5c8a');
  assert.equal(page.style.cardAlpha, 100);
  const fields = body => patch(blankPage(), body, 'free').map(error => error.field);
  assert.deepEqual(fields({ accentTo: '#00ff00' }), ['accentTo']);
  assert.deepEqual(fields({ style: { cursor: 'heart' } }), ['style.cursor']);
  assert.deepEqual(fields({ style: { nameGradient: true } }), ['style.nameGradient']);
  assert.deepEqual(fields({ font: 'mono' }), ['font']);
  assert.match(patch(blankPage(), { font: 'mono' }, 'free')[0].message, /Love Pro/);
  assert.deepEqual(fields({ stylePresets: [{ name: 'x', data: {} }] }), ['stylePresets']);
});

test('applyPatch: оставшийся от подписки курсор не мешает менять другие детали', () => {
  const page = blankPage({ style: { cursor: 'heart', linkShape: 'rounded' } });
  assert.deepEqual(patch(page, { style: { cursor: 'heart', linkShape: 'square' } }, 'free'), []);
  assert.equal(page.style.linkShape, 'square');
  assert.equal(page.style.cursor, 'heart');
});

test('applyPatch: нажатия ссылок переезжают вместе с адресом при перестановке', () => {
  const page = blankPage({ links: [{ url: 'https://a.test', clicks: 5 }, { url: 'https://b.test', clicks: 2 }] });
  assert.deepEqual(patch(page, { links: [{ url: 'https://b.test' }, { url: 'https://a.test' }, { url: 'https://c.test' }] }, 'free'), []);
  assert.deepEqual(page.links.map(link => link.clicks), [2, 5, 0]);
});

test('applyPatch: теги без пустых и повторов, градиент фона проверяется', () => {
  const page = blankPage();
  assert.deepEqual(patch(page, { tags: ['Кофе', 'кофе', '  ', 'игры'] }, 'free'), []);
  assert.deepEqual(page.tags, ['Кофе', 'игры']);
  assert.deepEqual(patch(blankPage(), { bgGradient: { enabled: true, colors: ['#111111'] } }, 'free').map(e => e.field), ['bgGradient']);
  assert.deepEqual(patch(blankPage(), { bgGradient: { enabled: true, colors: ['#111111', 'red'] } }, 'free').map(e => e.field), ['bgGradient']);
  const css = buildStyles(buildView(blankPage({ bgGradient: { enabled: true, colors: ['#111111', '#222222', '#333333'], angle: 90 } }), user, 'free'));
  assert.match(css, /\.pf-bg-grad\{background:linear-gradient\(90deg,#111111,#222222,#333333\)\}/);
});

test('снимок стиля: только известные поля и допустимые значения', () => {
  const clean = sanitizeStyleSnapshot({
    theme: 'mint', font: '"; } body { x', accent: '#ABCDEF', accentTo: 'javascript:1',
    style: { cursor: 'heart', linkShape: 'url(evil)', cardRadius: 99, allowCopy: false, extra: 1 },
    bgGradient: { enabled: true, colors: ['#000000', 'nope'] },
    bio: 'не стиль', links: [{ url: 'https://x.test' }]
  });
  assert.equal(clean.theme, 'mint');
  assert.equal(clean.font, undefined);
  assert.equal(clean.accent, '#abcdef');
  assert.equal(clean.accentTo, undefined);
  assert.deepEqual(clean.style, { cursor: 'heart', cardRadius: 32 });
  assert.equal(clean.bgGradient.enabled, false);
  assert.equal(clean.bio, undefined);
  assert.equal(clean.links, undefined);
});

test('код приглашения достаётся из ссылки любого вида', () => {
  assert.equal(extractInviteCode('https://api.loveapp.chat/invite/0A3EF6FF'), '0A3EF6FF');
  assert.equal(extractInviteCode('love-app://invite/0A3EF6FF/'), '0A3EF6FF');
  assert.equal(extractInviteCode('0A3EF6FF'), '0A3EF6FF');
  assert.equal(extractInviteCode('https://evil.test/<script>'), null);
  assert.equal(extractInviteCode(''), null);
});

test('курсор и эффекты имени собираются только из своих значений', () => {
  const view = buildView(blankPage({ accent: '#ff0000', style: { cursor: 'heart', nameEffect: 'typewriter' } }), { username: 'fixture', nickname: 'Мира' }, 'premium');
  const css = buildStyles(view);
  assert.match(css, /cursor:url\("data:image\/svg\+xml,[^"]*%23ff0000/);
  assert.match(css, /steps\(4,end\)/);
  // Разметка SVG закодирована целиком: ни кавычки, ни угловой скобки, ни ;
  // внутри url() — значит закрыть правило и дописать своё через неё нельзя.
  const data = /url\("data:image\/svg\+xml,([^"]*)"\)/.exec(css)[1];
  assert.doesNotMatch(data, /[<>"';{}]/);
});
