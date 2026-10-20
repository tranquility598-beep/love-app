const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { buildView } = require('../utils/profilePageView');
const { buildStyles } = require('../utils/profilePageStyles');
const { renderPage, renderPreviewFragment } = require('../utils/profilePageHtml');

const options = { nonce: 'profile-test', canonical: 'https://example.test/u/fixture', siteUrl: 'https://loveapp.chat' };
const viewOf = page => buildView(page, { username: 'fixture' }, 'premium');

test('background dim defaults safely, clamps limits, and preserves zero', () => {
  for (const [value, expected] of [[undefined, .4], [null, .4], [NaN, .4], [Infinity, .4], ['broken', .4], [0, 0], ['0', 0], [70, .7], [-5, 0], [95, .85]]) {
    const view = viewOf({});
    view.background = { kind: 'image', url: 'https://example.test/bg.png', dim: value };
    const css = buildStyles(view);
    assert.ok(css.includes(`.pf-bg-dim{opacity:${expected.toFixed(3)}}`), `dim=${String(value)}`);
    assert.doesNotMatch(css, /NaN|Infinity/);
  }
});

test('rendering legacy links keeps only absolute HTTP(S) destinations before applying the plan limit', () => {
  const page = { links: [
    null, {}, { url: 5 }, { url: 'javascript:alert(1)' }, { url: 'JaVa\nScRiPt:alert(2)' },
    { url: 'data:text/html,<script>oops</script>' }, { url: '//evil.test' }, { url: '/relative' },
    { url: 'file:///private' }, { url: 'mailto:person@example.test' },
    { label: '<Safe>', url: '  https://example.test/?a=1&b=2  ' },
    { label: 'Local', url: 'http://127.0.0.1:5555/test' }
  ] };
  const view = buildView(page, { username: 'fixture' }, 'free');
  assert.equal(view.links.length, 2);
  assert.equal(view.links[0].url, 'https://example.test/?a=1&b=2');
  for (const link of view.links) assert.ok(['http:', 'https:'].includes(new URL(link.url).protocol));
  const fragment = renderPreviewFragment(view, options);
  assert.match(fragment.html, /&lt;Safe&gt;/);
  assert.match(fragment.html, /href="https:\/\/example\.test\/\?a=1&amp;b=2"/);
  assert.doesNotMatch(fragment.html, /href="(?:javascript:|data:|file:|mailto:|\/\/evil)/i);
  assert.doesNotThrow(() => viewOf({ links: 'legacy-invalid-list' }));
});

function reportFixture(fetch) {
  function node() {
    const classes = new Set();
    return {
      handlers: {}, attrs: {}, hidden: false, disabled: false, textContent: '',
      classList: { add: value => classes.add(value), remove: value => classes.delete(value), toggle(value, on) { if (on) classes.add(value); else classes.delete(value); } },
      addEventListener(type, callback) { this.handlers[type] = callback; }, removeEventListener() {},
      setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; }
    };
  }
  const submit = { ...node(), textContent: 'Отправить' };
  const form = { ...node(), reason: { value: 'spam' }, note: { value: 'Please review' }, querySelector: () => submit };
  const note = { ...node(), hidden: true };
  const dialog = { ...node(), open: true, close() { this.open = false; }, showModal() { this.open = true; } };
  const open = node(), cancel = node();
  const nodes = { 'pf-report-form': form, 'pf-report-note': note, 'pf-report': dialog, 'pf-report-open': open, 'pf-report-cancel': cancel,
    'pf-data': { textContent: JSON.stringify({ username: 'fixture', effect: 'none' }) } };
  const document = { ...node(), documentElement: node(), getElementById: id => nodes[id] || null, querySelector: () => null };
  const window = { matchMedia: () => ({ matches: false }) };
  document.body = { ...node(), ownerDocument: document }; document.defaultView = window;
  const timers = new Map(); let timerId = 0;
  const html = renderPage(viewOf({}), options);
  const source = html.match(/<script nonce="profile-test">([\s\S]*?)<\/script>/);
  assert.ok(source, 'execute the same nonce script the real page receives');
  vm.runInNewContext(source[1], { document, window, fetch, setTimeout(callback) { timers.set(++timerId, callback); return timerId; }, clearTimeout(id) { timers.delete(id); } });
  return { form, note, submit, dialog, open, timers, send: () => form.handlers.submit({ preventDefault() {} }) };
}

test('report errors keep the dialog open and allow retry without a false success', async () => {
  for (const status of [400, 429, 500, 'network']) {
    const f = reportFixture(async () => { if (status === 'network') throw new TypeError('Failed to fetch'); return { ok: false, status }; });
    await f.send();
    assert.equal(f.dialog.open, true, String(status));
    assert.equal(f.submit.disabled, false, String(status));
    assert.equal(f.note.hidden, false, String(status));
    assert.doesNotMatch(f.note.textContent, /Спасибо|посмотрим/);
    assert.equal(f.timers.size, 0, 'errors must not auto-close the dialog');
    assert.equal(f.form.attrs['aria-busy'], undefined);
  }
});

test('report waits for acceptance, blocks duplicate submits, and retries after failure', async () => {
  let finishRequest, calls = 0, payload;
  const f = reportFixture((_url, options) => { calls++; payload = JSON.parse(options.body); return new Promise(resolve => { finishRequest = resolve; }); });
  const first = f.send();
  assert.equal(f.submit.disabled, true);
  await f.send();
  assert.equal(calls, 1);
  assert.equal(f.note.hidden, true);
  finishRequest({ ok: false, status: 500 }); await first;
  assert.equal(f.submit.disabled, false);
  const second = f.send();
  assert.equal(calls, 2);
  finishRequest({ ok: true, status: 201 }); await second;
  assert.deepEqual(payload, { username: 'fixture', reason: 'spam', note: 'Please review' });
  assert.equal(f.note.hidden, false);
  assert.match(f.note.textContent, /Спасибо/);
  assert.equal(f.submit.disabled, true);
  assert.equal(f.timers.size, 1);
  f.open.handlers.click();
  assert.equal(f.timers.size, 0, 'reopening cancels the previous close timer');
  assert.equal(f.submit.disabled, false);
});
