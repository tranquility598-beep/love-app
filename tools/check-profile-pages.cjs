// Run: node node_modules/electron/cli.js tools/check-profile-pages.cjs
// Real public router/CSP with in-memory models, isolated preview API, no MongoDB.
process.env.NODE_ENV = 'test';
process.env.FEATURE_PROFILE_PAGES_V1 = '1';
process.env.PROFILE_PAGE_HOST = '127.0.0.1';
const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
// Resolve the same Mongoose instance used by server/models (root has another copy).
const mongoose = require(require.resolve('mongoose', { paths: [path.join(__dirname, '../server')] }));
mongoose.set('autoIndex', false);
mongoose.set('autoCreate', false);
const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, '.tmp-profile-pages');
fs.mkdirSync(OUTPUT, { recursive: true });
app.setPath('userData', path.join(OUTPUT, 'electron-data'));
app.commandLine.appendSwitch('mute-audio');
const User = require('../server/models/User');
const ProfilePage = require('../server/models/ProfilePage');
const realUserFindOne = User.findOne;
const realPageFindOne = ProfilePage.findOne;
const { buildView } = require('../server/utils/profilePageView');
const { renderPreviewFragment } = require('../server/utils/profilePageHtml');
const { capabilitiesFor } = require('../server/config/profileTiers');
let fixture, origin, writes = 0, reportStatus = 201, reportRequests = [], pendingReport = null, expectedReportError = false;
const findings = [], errors = [];
function reset(layout = 'stack', variant = 'normal') {
  const long = variant === 'long';
  const user = { _id: '000000000000000000000001', username: 'fixture', nickname: 'Vexel', plan: 'premium', createdAt: new Date('2026-04-01'),
    customStatus: long ? 'Оченьдлинныйстатус'.repeat(7) : 'В своём ритме', mood: 'smile', listening: 'Love Wave',
    hobbies: [{ text: 'Дизайн', icon: 'palette', _id: 'must-not-render' }] };
  const count = { empty: 0, single: 1, normal: 3, long: 20 }[variant];
  const page = new ProfilePage({ user: user._id, enabled: true, showStatus: true, theme: 'midnight', layout, effect: 'none', avatarFrame: 'orbit',
    displayName: long ? 'ОченьДлинноеИмяБезПробелов'.repeat(2) : 'Vexel',
    bio: long ? 'ДлинноеОписаниеБезПробелов'.repeat(25) : 'Музыка, дизайн и немного ночного города.',
    banner: variant === 'empty' ? null : `${origin}/build/test-banner.svg`,
    links: Array.from({ length: count }, (_, i) => ({ label: long ? 'ОченьДлиннаяПодписьСсылки'.repeat(3) : ['Telegram', 'YouTube', 'Плейлист'][i] || 'Ссылка', url: `https://example.test/${i}`, icon: 'link' }))
  }).toObject();
  page.closeFriends = [{ username: 'friend', nickname: long ? 'ОченьДлинноеИмяДруга'.repeat(4) : 'Друг', avatar: null }];
  page.pair = { visible: true, partner: { username: 'partner', nickname: 'Вместе', avatar: null }, since: new Date('2026-01-01') };
  page.recordView = () => { writes++; throw new Error('Unexpected view write'); };
  page.save = () => { writes++; throw new Error('Unexpected database write'); };
  fixture = { user, page };
}
// These stubs live only in this standalone Electron process. No connection opens.
User.findOne = filter => ({ collation() { return this; }, select() { return this; }, lean: async () => filter.username.toLowerCase() === 'fixture' ? fixture.user : null });
ProfilePage.findOne = () => ({ populate() { return this; }, then: (resolve, reject) => Promise.resolve(fixture.page).then(resolve, reject) });
const api = express();
api.use(express.json());
api.get('/build/test-banner.svg', (_req, res) => res.type('image/svg+xml').send('<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="420"><path fill="#303030" d="M0 0h1100v420H0z"/><circle cx="780" cy="110" r="55" fill="#aaa"/><path fill="#161616" d="m0 420 250-300 330 240 170-220 350 280z"/></svg>'));
api.get('/build/test-silence.wav', (_req, res) => {
  const wav = Buffer.alloc(16044); wav.write('RIFF'); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(16000, 40); res.type('audio/wav').send(wav);
});
api.use(require('../server/middleware/profileHost'));
api.post('/api/profile-page/session', (_req, res) => res.json({ token: 'fixture-session', expiresIn: 1800 }));
const data = () => ({ page: fixture.page, account: fixture.user, capabilities: capabilitiesFor('premium'), locked: [], urls: { long: origin + '/u/fixture' } });
api.get('/api/profile-page', (_req, res) => res.json(data()));
api.post('/api/profile-page/preview', (req, res) => res.json(renderPreviewFragment(buildView({ ...fixture.page, ...req.body }, fixture.user, 'premium'), { siteUrl: 'https://loveapp.chat' })));
api.post('/api/profile-page/report', (req, res) => {
  reportRequests.push(req.body);
  if (reportStatus === 'pending') pendingReport = res;
  else res.status(reportStatus).json({ ok: reportStatus < 400 });
});
api.get('/api/profile-page/stats', (_req, res) => res.json({ days: [], total: 0 }));
api.use(require('../server/routes/profilePublic'));
api.use((_req, res) => res.status(404).send('Fixture fallback'));
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function evaluate(win, code) { return win.webContents.executeJavaScript(code, true); }
async function shot(win, name, delay = 650) { await wait(delay); fs.writeFileSync(path.join(OUTPUT, name + '.png'), (await win.webContents.capturePage()).toPNG()); }
const geometry = root => {
  const find = selector => root.querySelector(selector);
  const main = find('.pf-main'), content = find('.pf-content'), identity = find('.pf-identity');
  const mr = main.getBoundingClientRect(), cr = content.getBoundingClientRect(), ir = identity.getBoundingClientRect();
  return { main: main.clientWidth, mainTop: main.offsetTop, shellHeight: find('.pf-shell').clientHeight, nameFont: getComputedStyle(find('.pf-name')).fontSize,
    columns: getComputedStyle(find('.pf-composition')).gridTemplateColumns.split(' ').length,
    links: find('.pf-links')?.children.length || 0, text: find('.pf-status')?.textContent || '',
    contentBelow: cr.top >= ir.bottom - 1, mainContains: cr.right <= mr.right + 1 && ir.right <= mr.right + 1 };
};
app.whenReady().then(async () => {
  const server = api.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  origin = 'http://127.0.0.1:' + server.address().port; reset();
  const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, nodeIntegration: false } });
  win.webContents.setUserAgent('LoveProfileCheck bot'); // router never writes views
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3 && !(expectedReportError && /^Failed to load resource:/.test(message))) errors.push(message);
  });
  let navigation = 0;
  const load = async url => { const next = new URL(url); next.searchParams.set('check', String(++navigation)); await win.loadURL(next.href); await evaluate(win, 'document.fonts.ready.then(() => true)'); await wait(65); };
  let cases = 0;
  for (const layout of ['stack', 'card', 'cinema']) {
    for (const variant of ['empty', 'single', 'normal', 'long']) {
      reset(layout, variant);
      for (const width of [320, 390, 768, 1280]) {
        win.setSize(width, 900); await load(origin + '/u/fixture');
        const metrics = await evaluate(win, `({ ...(${geometry.toString()})(document), width: innerWidth, scroll: document.documentElement.scrollWidth, overflow: [...document.querySelectorAll('.pf-main *')].filter(e => { const r=e.getBoundingClientRect(); return r.width && (r.right > innerWidth + 1 || r.left < -1); }).map(e=>e.className).slice(0,8) })`);
        assert.ok(metrics.scroll <= metrics.width, JSON.stringify({ layout, variant, width, metrics }));
        assert.deepEqual(metrics.overflow, [], JSON.stringify({ layout, variant, width, metrics }));
        assert.equal(metrics.mainContains, true);
        assert.doesNotMatch(metrics.text, /smile|ObjectId|must-not-render/);
        assert.equal(metrics.links, { empty: 0, single: 1, normal: 3, long: 20 }[variant]);
        if (variant === 'normal' && [390, 1280].includes(width)) await shot(win, `${layout}-${width}`);
        cases++;
      }
    }
  }
  findings.push(`${cases} public layout cases: 3 layouts × 4 data variants × 4 widths`);
  console.log(findings.at(-1));
  for (const layout of ['stack', 'card', 'cinema']) {
    reset(layout); win.setSize(1500, 1050); await load(origin + '/build#code=fixture'); await wait(300);
    for (const size of ['phone', 'wide']) {
      await evaluate(win, `document.getElementById('size-${size}').click()`); await wait(100);
      const preview = await evaluate(win, `(() => { const host=document.querySelector('.preview-live'); return {...(${geometry.toString()})(host.shadowRoot), layout:host.shadowRoot.querySelector('.pf-shell').className, width:host.clientWidth, height:host.clientHeight, overflow:host.scrollWidth > host.clientWidth, effectAccent:getComputedStyle(host.shadowRoot.querySelector('.pf-runtime')).getPropertyValue('--accent')}; })()`);
      assert.equal(preview.overflow, false);
      const other = new BrowserWindow({ show: false, width: preview.width, height: preview.height, webPreferences: { offscreen: true, backgroundThrottling: false } });
      other.webContents.setUserAgent('LoveProfileCheck bot');
      await other.loadURL(origin + '/u/fixture'); await evaluate(other, 'document.fonts.ready.then(() => true)');
      const actual = await evaluate(other, `({...(${geometry.toString()})(document), scrollbar:innerWidth-document.documentElement.clientWidth})`);
      // The preview hides its scrollbar; a Windows browser may reserve a native gutter.
      assert.ok(Math.abs(preview.main - actual.main) <= actual.scrollbar + 1, `${layout}/${size}: ${JSON.stringify({preview,actual})}`);
      assert.equal(preview.nameFont, actual.nameFont, `${layout}/${size} type size`);
      assert.equal(preview.columns, actual.columns, `${layout}/${size} columns`);
      assert.ok(Math.abs(preview.mainTop - actual.mainTop) <= 3, `${layout}/${size} vertical position: ${JSON.stringify({preview,actual})}`);
      other.destroy();
    }
  }
  findings.push('Public/preview parity: all 3 layouts, phone and scaled 960px desktop'); console.log(findings.at(-1));
  reset('stack'); fixture.page.effect = 'stars'; fixture.page.music = { url: origin + '/build/test-silence.wav', title: 'Love Wave', volume: 0 };
  win.setSize(1280, 900); await load(origin + '/u/fixture');
  assert.equal(await evaluate(win, 'document.querySelector(".pf-shell").inert'), true);
  await evaluate(win, 'document.getElementById("pf-enter").click()');
  assert.equal(await evaluate(win, 'document.querySelector(".pf-shell").inert'), false);
  assert.equal(await evaluate(win, 'document.querySelectorAll(".pf-fx").length'), 1);
  assert.equal(await evaluate(win, `(() => {const e=new KeyboardEvent('keydown',{key:' ',cancelable:true}); document.dispatchEvent(e); return e.defaultPrevented;})()`), false);
  assert.equal(await evaluate(win, 'document.getElementById("pf-player-volume").value'), '0');
  await load(origin + '/build#code=fixture'); await wait(200);
  await evaluate(win, `document.querySelector('.preview-live').shadowRoot.getElementById('pf-enter').click()`);
  assert.equal(await evaluate(win, `document.querySelector('.preview-live').shadowRoot.querySelectorAll('canvas').length`), 1);
  await evaluate(win, `dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})); dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));`);
  assert.equal(await evaluate(win, `document.querySelector('.preview-live').shadowRoot.querySelectorAll('canvas').length`), 1);
  findings.push('Entry keyboard, inert state, zero-volume music, preview back/forward restore'); console.log(findings.at(-1));
  // Repaint repeatedly through the actual preview module: effect surfaces never accumulate.
  await evaluate(win, `(async()=>{window.previewModule=await import('/build/preview.js'); window.previewStore=await import('/build/store.js');})()`);
  for (const effect of ['trail', 'stars', 'glow', 'rain', 'none', 'aurora', 'trail', 'none']) {
    fixture.page.effect = effect; fixture.page.music = { url: null }; fixture.page.enterOverlay = { enabled: false };
    await evaluate(win, `(async()=>{await window.previewStore.loadPage();window.previewModule.previewChanged('server');})()`); await wait(90);
    assert.equal(await evaluate(win, `document.querySelector('.preview-live').shadowRoot.querySelectorAll('.pf-fx,.pf-glow').length`), effect === 'none' ? 0 : 1, effect);
  }
  findings.push('Repeated preview effect changes: exactly one surface, none removes it'); console.log(findings.at(-1));
  reset(); fixture.page.effect = 'trail'; await load(origin + '/u/fixture');
  await evaluate(win, `for(let i=0;i<20;i++) dispatchEvent(new PointerEvent('pointermove',{clientX:200+i*8,clientY:200+Math.sin(i/4)*40,pointerType:'mouse'}));`); await wait(50);
  const pixels = await evaluate(win, `(() => {const c=document.querySelector('.pf-fx');const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data; return data.some((v,i)=>i%4===3&&v>0);})()`);
  assert.equal(pixels, true, 'trail must paint visible pixels'); await shot(win, 'trail-active', 0); await wait(700);
  assert.equal(await evaluate(win, `(() => {const c=document.querySelector('.pf-fx');return c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0);})()`), false, 'trail must clear completely');
  findings.push('Real canvas ribbon paints then clears after idle'); console.log(findings.at(-1));
  // Chromium produces a non-bubbling pointerleave on <html>. Exercise the
  // actual body path, not the editor host or an event dispatched on window.
  win.webContents.debugger.attach('1.3');
  const mouse = (x, y) => win.webContents.debugger.sendCommand('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  for (const effect of ['trail', 'glow']) {
    reset(); fixture.page.effect = effect; await load(origin + '/u/fixture');
    await evaluate(win, `(() => {
      window.rootPointerLeaves = 0; window.ribbonSegments = 0;
      document.documentElement.addEventListener('pointerleave', event => { if (event.isTrusted) window.rootPointerLeaves++; });
      const curve = CanvasRenderingContext2D.prototype.bezierCurveTo;
      CanvasRenderingContext2D.prototype.bezierCurveTo = function(...args) { window.ribbonSegments++; return curve.apply(this, args); };
    })()`);
    await mouse(200, 200); await mouse(220, 210); await wait(50);
    if (effect === 'trail') {
      assert.ok(await evaluate(win, 'window.ribbonSegments > 0'));
      await wait(700);
    } else assert.equal(await evaluate(win, `document.querySelector('.pf-glow').classList.contains('is-on')`), true);
    await mouse(-20, -20); await wait(30);
    assert.ok(await evaluate(win, 'window.rootPointerLeaves > 0'), 'Chromium must deliver native pointerleave on the document');
    if (effect === 'trail') {
      await evaluate(win, 'window.ribbonSegments = 0');
      await mouse(260, 240); await wait(40);
      assert.equal(await evaluate(win, 'window.ribbonSegments'), 0, 'nearby re-entry must not join the old trail');
      await mouse(270, 245); await wait(40);
      assert.ok(await evaluate(win, 'window.ribbonSegments > 0'), 'fresh trail must resume');
    } else {
      assert.equal(await evaluate(win, `document.querySelector('.pf-glow').classList.contains('is-on')`), false);
      await mouse(260, 240); await wait(40);
      assert.equal(await evaluate(win, `document.querySelector('.pf-glow').classList.contains('is-on')`), true);
    }
  }
  win.webContents.debugger.detach();
  findings.push('Native Chromium document pointerleave: nearby ribbon re-entry and glow leave/re-entry'); console.log(findings.at(-1));
  reset();
  fixture.page.links = [{ url: 'javascript:alert(1)' }, null, { label: 'Safe', url: 'https://example.test/safe' }];
  fixture.page.background = { kind: 'image', url: origin + '/build/test-banner.svg', dim: NaN };
  await load(origin + '/u/fixture');
  assert.equal(await evaluate(win, `getComputedStyle(document.querySelector('.pf-bg-dim')).opacity`), '0.4');
  assert.deepEqual(await evaluate(win, `[...document.querySelectorAll('.pf-link')].map(a=>a.href)`), ['https://example.test/safe']);
  findings.push('Public legacy data: finite default dim and safe HTTP(S) links'); console.log(findings.at(-1));
  reset(); await load(origin + '/u/fixture');
  await evaluate(win, `document.getElementById('pf-report-open').click();document.getElementById('pf-report-form').note.value='Fixture report';`);
  const reportState = `(() => {
    const form=document.getElementById('pf-report-form'), note=document.getElementById('pf-report-note');
    return {open:document.getElementById('pf-report').open, disabled:form.querySelector('[type=submit]').disabled,
      pending:form.getAttribute('aria-busy'), note:note.textContent, hidden:note.hidden, input:form.note.value};
  })()`;
  const sendReport = async () => {
    await evaluate(win, `document.getElementById('pf-report-form').requestSubmit()`);
    for (let attempt=0; attempt<100; attempt++) {
      const state = await evaluate(win, reportState);
      if (!state.pending) return state;
      await wait(15);
    }
    throw new Error('Report did not settle');
  };
  expectedReportError = true;
  for (const status of [400, 429, 500]) {
    reportStatus = status;
    const state = await sendReport();
    assert.equal(state.open, true); assert.equal(state.disabled, false); assert.equal(state.hidden, false);
    assert.equal(state.input, 'Fixture report'); assert.doesNotMatch(state.note, /Спасибо/);
    if (status === 429) assert.match(state.note, /много попыток/);
  }
  expectedReportError = false;
  reportRequests = []; reportStatus = 'pending';
  await evaluate(win, `document.getElementById('pf-report-form').requestSubmit();document.getElementById('pf-report-form').requestSubmit();`);
  for (let attempt=0; !pendingReport && attempt<100; attempt++) await wait(15);
  assert.ok(pendingReport, 'the report must reach the test endpoint');
  assert.equal(reportRequests.length, 1, 'double click must not create a second report');
  assert.equal((await evaluate(win, reportState)).disabled, true);
  pendingReport.status(201).json({ ok: true }); pendingReport = null;
  await wait(60);
  const sent = await evaluate(win, reportState);
  assert.match(sent.note, /Спасибо/); assert.equal(sent.disabled, true);
  assert.deepEqual(reportRequests[0], { username: 'fixture', reason: 'spam', note: 'Fixture report' });
  findings.push('Real report form: 400/429/500 retain input, pending blocks duplicates, 201 confirms success'); console.log(findings.at(-1));
  // Boundary and MIME checks use the real public router and its CSP.
  const request = endpoint => fetch(origin + endpoint, { headers: { 'User-Agent': 'LoveProfileCheck bot' } });
  const js = await request('/build/effects.js'); assert.match(js.headers.get('content-type'), /javascript/);
  const missing = await request('/build/missing.js'); assert.equal(missing.status, 404); assert.match(missing.headers.get('content-type'), /text\/plain/);
  const privateRoute = await request('/api/users/me'); assert.equal(privateRoute.status, 404);
  const pageResponse = await request('/u/fixture'); const csp = pageResponse.headers.get('content-security-policy');
  assert.match(csp, /script-src 'nonce-/); assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval/); assert.match(csp, /frame-ancestors 'none'/);
  fixture.page.enabled = false; assert.equal((await request('/u/fixture')).status, 404);
  fixture.page.enabled = true; fixture.page.moderation = { status: 'hidden' }; assert.equal((await request('/u/fixture')).status, 404);
  assert.equal(writes, 0);
  findings.push('Real router: JS MIME, missing asset 404, host guard, nonce CSP, disabled/hidden pages, zero DB writes');
  if (process.argv.includes('--live-read-only')) {
    // Explicit opt-in: read the configured account, never seed/edit it or count views.
    require('dotenv').config({ path: path.join(ROOT, '.env'), quiet: true });
    const uri = process.env.MONGODB_URI;
    assert.ok(uri, 'MONGODB_URI is required for the optional read-only check');
    User.findOne = realUserFindOne;
    ProfilePage.findOne = realPageFindOne;
    const forbidWrite = () => { throw new Error('Writes are forbidden in the read-only check'); };
    User.prototype.save = forbidWrite;
    ProfilePage.prototype.save = forbidWrite;
    ProfilePage.prototype.recordView = forbidWrite;
    try {
      await mongoose.connect(uri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
    } catch (_) { throw new Error('Read-only database connection failed (connection details omitted)'); }
    const actualUser = await User.findOne({ username: 'goodvexel' }).select('username nickname avatar createdAt customStatus mood listening hobbies plan planExpiresAt isBanned').lean();
    assert.ok(actualUser, 'The public account is not available');
    const actualPage = await ProfilePage.findOne({ user: actualUser._id }).populate({ path: 'pair.partner', select: 'username nickname avatar' }).populate({ path: 'closeFriends', select: 'username nickname avatar' });
    assert.ok(actualPage?.enabled, 'The actual public page is not enabled');
    fixture = { user: actualUser, page: actualPage.toObject() };
    for (const width of [390, 1280]) {
      win.setSize(width, 900); await load(origin + '/u/goodvexel');
      assert.equal(await evaluate(win, 'document.documentElement.scrollWidth <= innerWidth'), true);
      await shot(win, 'goodvexel-' + width);
      if (await evaluate(win, 'Boolean(document.getElementById("pf-enter"))')) await evaluate(win, 'document.getElementById("pf-enter").click()');
      assert.equal(await evaluate(win, 'document.querySelector(".pf-shell").inert'), false);
      await wait(150);
      await shot(win, 'goodvexel-open-' + width);
    }
    await mongoose.disconnect();
    findings.push('Actual goodvexel data through fresh public router: mobile/desktop, strict CSP, read-only DB, no index creation');
  }
  assert.deepEqual(errors, [], 'Renderer errors');
  fs.writeFileSync(path.join(OUTPUT, 'report.json'), JSON.stringify({ findings, cases, errors, databaseWrites: writes }, null, 2));
  console.log(JSON.stringify({ findings, errors, output: OUTPUT }, null, 2));
  win.destroy(); await new Promise(resolve => server.close(resolve)); app.quit();
}).catch(error => { console.error(error); console.error('Renderer errors', errors); app.exit(1); });
