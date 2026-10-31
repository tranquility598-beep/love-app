const test = require('node:test');
const assert = require('node:assert/strict');
const { buildView } = require('../utils/profilePageView');
const { buildStyles } = require('../utils/profilePageStyles');
const { renderPage } = require('../utils/profilePageHtml');

const options = { nonce: 'contrast-test', canonical: 'https://example.test/u/fixture', siteUrl: 'https://loveapp.chat' };
const accentText = css => (/--accent-text:([^;]+);/.exec(css) || [])[1];

test('цвет текста кнопок подбирается под пользовательский градиент', () => {
  // белый → фиолетовый: белый текст пропал бы на белой половине
  const light = buildView({ theme: 'midnight', accent: '#ffffff', accentTo: '#aa00ff' }, { username: 'fixture' }, 'premium');
  assert.equal(accentText(buildStyles(light)), '#0b0b0b');
  // тёмный градиент — белый текст
  const dark = buildView({ theme: 'midnight', accent: '#1e1b4b', accentTo: '#4c1d95' }, { username: 'fixture' }, 'premium');
  assert.equal(accentText(buildStyles(dark)), '#ffffff');
});

test('без своего акцента остаётся цвет текста, подобранный темой', () => {
  const view = buildView({ theme: 'mint' }, { username: 'fixture' }, 'premium');
  assert.equal(accentText(buildStyles(view)), view.theme.tokens.accentText);
});

test('окно жалобы: схема страницы для списка и приоритет текста «Отправить»', () => {
  const view = buildView({ theme: 'midnight' }, { username: 'fixture' }, 'premium');
  const out = renderPage(view, options);
  const html = typeof out === 'string' ? out : out.html;
  assert.match(buildStyles(view), /--scheme:dark;/);
  assert.match(html, /\.pf-dialog\{[^}]*color-scheme:var\(--scheme,dark\)/);
  assert.match(html, /\.pf-dialog option\{background-color:var\(--bg2\);color:var\(--text\)\}/);
  assert.match(html, /\.pf-dialog-row \.pf-dialog-primary\{[^}]*color:var\(--accent-text\)/);
  const light = buildView({ theme: 'porcelain' }, { username: 'fixture' }, 'premium');
  assert.match(buildStyles(light), /--scheme:light;/);
});
