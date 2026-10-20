const test = require('node:test');
const assert = require('node:assert/strict');
const { mountProfileEffects } = require('../utils/profileEffects');
const { buildView } = require('../utils/profilePageView');
const { renderPage, renderPreviewFragment } = require('../utils/profilePageHtml');
const ProfilePage = require('../models/ProfilePage');
const { scopeForShadow } = require('../utils/profilePageStyles');

function fixture({ reducedMotion = false, publicPage = false } = {}) {
  const frames = new Map();
  const listeners = new Set();
  const nodes = [];
  const observerStates = [];
  const strokes = [];
  let nextFrame = 0, now = 0;
  function target() {
    return {
      handlers: {},
      addEventListener(event, handler) { this.handlers[event] = handler; listeners.add(handler); },
      removeEventListener(event, handler) { delete this.handlers[event]; listeners.delete(handler); }
    };
  }
  const doc = { ...target(), hidden: false };
  doc.documentElement = target();
  const host = target();
  const motion = target();
  motion.matches = reducedMotion;
  const win = {
    ...target(), navigator: {}, devicePixelRatio: 1,
    matchMedia: () => motion,
    performance: { now: () => now },
    getComputedStyle: () => ({ getPropertyValue: () => '#fff' }),
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame: id => frames.delete(id),
    ResizeObserver: class { constructor() { observerStates.push(this); } observe() {} disconnect() { this.disconnected = true; } }
  };
  doc.defaultView = win;
  doc.createElement = tag => ({
    tag, clientWidth: 320, clientHeight: 600,
    style: { values: {}, setProperty(key, value) { this.values[key] = value; } },
    classList: { values: new Set(), add(value) { this.values.add(value); }, remove(value) { this.values.delete(value); }, contains(value) { return this.values.has(value); } },
    setAttribute() {},
    getBoundingClientRect: () => ({ left: 100, top: 50, width: 160, height: 300 }),
    getContext: () => new Proxy({
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
      createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
      createPattern: () => ({}),
      moveTo(x, y) { strokes.push(['move', x, y]); },
      bezierCurveTo(...args) { strokes.push(['curve', ...args]); }
    }, { get: (object, key) => key in object ? object[key] : () => {} }),
    remove() { this.removed = true; }
  });
  const container = { ownerDocument: doc, appendChild: node => nodes.push(node), getRootNode: () => ({ host }) };
  if (publicPage) doc.body = container;
  function step(time) {
    now = time;
    const pending = [...frames.entries()];
    for (const [id, callback] of pending) { frames.delete(id); callback(time); }
  }
  return { container, host, doc, win, motion, nodes, frames, listeners, observerStates, strokes, step };
}

test('none and reduced motion never create default particles', () => {
  for (const [kind, reducedMotion] of [['none', false], ['stars', true]]) {
    const f = fixture({ reducedMotion });
    mountProfileEffects(f.container, kind)();
    assert.equal(f.nodes.length, 0);
    assert.equal(f.frames.size, 0);
  }
});

test('disposing preview effects releases frames, observers, DOM nodes and listeners', () => {
  const f = fixture();
  const dispose = mountProfileEffects(f.container, 'stars');
  assert.equal(f.nodes.length, 1);
  assert.equal(f.frames.size, 1);
  dispose();
  assert.equal(f.frames.size, 0);
  assert.equal(f.listeners.size, 0);
  assert.ok(f.nodes.every(node => node.removed));
  assert.ok(f.observerStates.every(observer => observer.disconnected));
});

test('cursor coordinates are local to a scaled desktop preview', () => {
  const f = fixture();
  const dispose = mountProfileEffects(f.container, 'glow');
  f.host.handlers.pointermove({ clientX: 140, clientY: 90 });
  [...f.frames.values()][0](0);
  assert.equal(f.nodes[0].style.values['--gx'], '80px');
  assert.equal(f.nodes[0].style.values['--gy'], '80px');
  dispose();
});

test('renderer shares effect configuration and keeps user text escaped', () => {
  const page = new ProfilePage({ user: '000000000000000000000001', displayName: '<script>unsafe</script>', theme: 'midnight', effect: 'stars' }).toObject();
  const view = buildView(page, { username: 'testfriend', badges: [] }, 'premium');
  const options = { nonce: 'test-nonce', siteUrl: 'https://example.test', canonical: 'https://example.test/u/testfriend' };
  const preview = renderPreviewFragment(view, options);
  assert.equal(preview.runtime.effect, 'stars');
  assert.match(preview.html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(preview.html, /<script>unsafe/);
  assert.match(renderPage(view, options), /mountProfileEffects/);
});

test('a pair without music is rendered without player controls or missing-music errors', () => {
  const page = new ProfilePage({ user: '000000000000000000000001', pair: { visible: true, partner: { _id: '000000000000000000000002' } } }).toObject();
  const view = buildView(page, { username: 'testfriend', badges: [] }, 'premium');
  view.pair = { username: 'partner', nickname: 'Partner', avatar: null, label: 'Together' };
  const preview = renderPreviewFragment(view, { siteUrl: 'https://example.test' });
  assert.match(preview.html, /Partner/);
  assert.doesNotMatch(preview.html, /pf-player-volume/);
});

test('every animated effect releases resources, including repeated disposal', () => {
  for (const kind of ['particles', 'stars', 'rain', 'snow', 'comets', 'trail', 'bokeh', 'glow', 'aurora', 'constellation', 'grain']) {
    const f = fixture();
    const dispose = mountProfileEffects(f.container, kind);
    f.step(16);
    dispose(); dispose();
    assert.equal(f.frames.size, 0, kind);
    assert.equal(f.listeners.size, 0, kind);
    assert.ok(f.observerStates.every(observer => observer.disconnected), kind);
  }
});

test('hidden documents do not start animation and resume only once', () => {
  const f = fixture(); f.doc.hidden = true;
  const dispose = mountProfileEffects(f.container, 'stars');
  assert.equal(f.frames.size, 0);
  f.doc.hidden = false; f.doc.handlers.visibilitychange();
  f.doc.handlers.visibilitychange();
  assert.equal(f.frames.size, 1);
  f.doc.hidden = true; f.doc.handlers.visibilitychange();
  assert.equal(f.frames.size, 0);
  dispose();
});

test('changing reduced motion stops the effect and removes its resources', () => {
  const f = fixture();
  mountProfileEffects(f.container, 'stars');
  f.motion.matches = true;
  assert.equal(typeof f.motion.handlers.change, 'function');
  f.motion.handlers.change({ matches: true });
  assert.equal(f.frames.size, 0);
  assert.equal(f.listeners.size, 0);
  assert.ok(f.nodes.every(node => node.removed));
});

test('ribbon uses scaled coordinates, ignores touch, fades to idle and breaks on re-entry', () => {
  const f = fixture(); const dispose = mountProfileEffects(f.container, 'trail');
  f.host.handlers.pointermove({ clientX: 140, clientY: 90, timeStamp: 1, pointerType: 'touch' });
  assert.equal(f.frames.size, 0);
  f.host.handlers.pointermove({ clientX: 140, clientY: 90, timeStamp: 10, pointerType: 'mouse' });
  f.host.handlers.pointermove({ clientX: 150, clientY: 100, timeStamp: 20, pointerType: 'mouse' });
  f.step(30);
  assert.ok(f.strokes.some(([kind, x, y]) => kind === 'move' && x === 80 && y === 80));
  assert.ok(f.strokes.some(([kind, ...args]) => kind === 'curve' && args[4] === 100 && args[5] === 100));
  f.step(700);
  assert.equal(f.frames.size, 0);
  f.host.handlers.pointerleave();
  f.strokes.length = 0;
  f.host.handlers.pointermove({ clientX: 220, clientY: 200, timeStamp: 710, pointerType: 'mouse' });
  f.step(720);
  assert.equal(f.strokes.length, 0);
  f.win.handlers.blur();
  assert.equal(f.frames.size, 0);
  dispose();
});

test('public ribbon breaks on document pointerleave before a nearby window re-entry', () => {
  const f = fixture({ publicPage: true });
  const dispose = mountProfileEffects(f.container, 'trail');
  const move = (x, y, timeStamp) => f.win.handlers.pointermove({ clientX: x, clientY: y, timeStamp, pointerType: 'mouse' });
  move(140, 90, 10); move(150, 100, 20); f.step(30); f.step(700);
  // Native pointerleave on <html> does not bubble to window.
  f.doc.documentElement.handlers.pointerleave?.();
  f.strokes.length = 0;
  move(190, 120, 810); f.step(820);
  assert.equal(f.strokes.length, 0, 'first re-entry point must not connect to the old stroke');
  move(200, 130, 830); f.step(840);
  assert.ok(f.strokes.length > 0, 'fresh movement must still draw after re-entry');
  dispose();
  assert.equal(f.listeners.size, 0);
});

test('public glow hides on document pointerleave and releases a queued frame', () => {
  const f = fixture({ publicPage: true });
  const dispose = mountProfileEffects(f.container, 'glow');
  f.win.handlers.pointermove({ clientX: 140, clientY: 90, pointerType: 'mouse' });
  f.step(16);
  assert.equal(f.nodes[0].classList.contains('is-on'), true);
  f.win.handlers.pointermove({ clientX: 150, clientY: 100, pointerType: 'mouse' });
  f.doc.documentElement.handlers.pointerleave?.();
  assert.equal(f.nodes[0].classList.contains('is-on'), false);
  assert.equal(f.frames.size, 0);
  f.win.handlers.pointermove({ clientX: 160, clientY: 110, pointerType: 'mouse' });
  f.step(32);
  assert.equal(f.nodes[0].classList.contains('is-on'), true);
  dispose();
  assert.equal(f.listeners.size, 0);
});

test('preview uses an explicit logical viewport height and container widths', () => {
  const css = scopeForShadow('body{min-height:100dvh;padding:6vh 5vw}@media(max-width:600px){body{min-height:100vh}}');
  assert.match(css, /min-height:var\(--pf-viewport-height, 100%\)/);
  assert.match(css, /calc\(var\(--pf-viewport-height, 100vh\) \* 0\.06\)/);
  assert.match(css, /5cqw/);
  assert.match(css, /@container pf \(max-width:600px\)/);
});

test('friends with fallback avatars do not need inline styles under nonce CSP', () => {
  const page = new ProfilePage({ user: '000000000000000000000001' }).toObject();
  const view = buildView(page, { username: 'fixture' }, 'premium');
  view.closeFriends = [{ username: 'friend', nickname: 'Друг', avatar: null }];
  const fragment = renderPreviewFragment(view, { siteUrl: 'https://loveapp.chat' });
  assert.match(fragment.html, /pf-person-av pf-avatar-fallback/);
  assert.doesNotMatch(fragment.html, /style="/);
});
