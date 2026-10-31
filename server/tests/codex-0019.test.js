/**
 * CODEX-0019: два исправления, которые до сих пор держались без тестов.
 *
 * P1 — ответ на звонок без своего исходящего звонка не должен ничего запускать.
 * P2 — локальные уведомления (тосты с именами и текстами) принадлежат аккаунту:
 *      после смены аккаунта на этом же ПК второй человек их не видит.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CLIENT_JS = path.join(__dirname, '..', '..', 'client', 'js');
const VOICE_JS = path.join(CLIENT_JS, 'voice.js');
const SCRIPT_JS = path.join(CLIENT_JS, 'new', 'script.js');

function createContext() {
  const context = {
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    JSON,
    Math,
    Date,
    Promise,
    Map,
    Set,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Error,
    RegExp,
    Intl,
  };
  context.window = context;
  context.globalThis = context;
  context.self = context;
  context.addEventListener = () => {};
  context.removeEventListener = () => {};
  context.dispatchEvent = () => {};
  vm.createContext(context);
  return context;
}

function stubElement() {
  const element = {
    style: {},
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    children: [],
    appendChild() {},
    removeChild() {},
    remove() {},
    insertBefore() {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    getAttribute() { return null; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    focus() {},
    click() {},
    closest() { return null; },
    contains() { return false; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }; },
    cloneNode() { return stubElement(); },
    play() { return Promise.resolve(); },
    pause() {},
    load() {},
    insertAdjacentHTML() {},
    scrollIntoView() {},
    getContext() { return null; },
  };
  element.innerHTML = '';
  element.textContent = '';
  element.value = '';
  element.checked = false;
  return element;
}

function createStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); },
    removeItem(key) { delete data[key]; },
  };
}

/* ---------- P1: ответ на звонок без своего исходящего звонка ---------- */

function loadVoiceJs() {
  const context = createContext();
  context.document = {
    getElementById: () => null,
    querySelector: () => null,
    addEventListener() {},
    removeEventListener() {},
    body: stubElement(),
  };
  context.navigator = { mediaDevices: {}, userAgent: 'node' };
  context.localStorage = createStorage();
  context.window.socket = null;
  context.window.voiceManager = null;
  context.window.currentVoiceChannel = null;
  vm.runInContext(fs.readFileSync(VOICE_JS, 'utf8'), context);
  return context;
}

test('CODEX-0019 P1: принятый ответ без своего исходящего звонка игнорируется', () => {
  const context = loadVoiceJs();

  const calls = [];
  context.window.onDirectCallAccepted = () => calls.push('accepted');
  context.window.onDirectCallEnded = () => calls.push('ended');
  context.window.SoundManager = { play() {}, stop() {} };
  context.window.outgoingDMCall = null;

  return context.handleDMCallResponse(true, 'user-2', {}).then(() => {
    assert.deepEqual(calls, []);
    assert.equal(context.window.voiceManager, null);
  });
});

test('CODEX-0019 P1: ответ чужому звонку не закрывает наш исходящий', () => {
  const context = loadVoiceJs();

  const calls = [];
  context.window.onDirectCallAccepted = () => calls.push('accepted');
  context.window.onDirectCallEnded = () => calls.push('ended');
  context.window.SoundManager = { play() {}, stop() {} };
  const outgoing = { targetId: 'user-3', startedAt: 1 };
  context.window.outgoingDMCall = outgoing;

  return context.handleDMCallResponse(true, 'user-2', {}).then(() => {
    assert.deepEqual(calls, []);
    assert.equal(context.window.outgoingDMCall, outgoing);
  });
});

/* ---------- P2: локальные уведомления принадлежат аккаунту ---------- */

function loadScriptJs(storageData = {}) {
  const context = createContext();
  const document = {
    getElementById: () => stubElement(),
    querySelector: () => stubElement(),
    querySelectorAll: () => [],
    createElement: () => stubElement(),
    createDocumentFragment: () => stubElement(),
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    body: stubElement(),
    head: stubElement(),
    documentElement: stubElement(),
    readyState: 'complete',
    cookie: '',
    title: '',
  };
  context.document = document;
  context.navigator = { mediaDevices: {}, userAgent: 'node', language: 'ru', clipboard: { writeText: () => Promise.resolve() } };
  context.localStorage = createStorage(storageData);
  context.sessionStorage = createStorage();
  context.location = { origin: 'https://example.test', href: 'https://example.test/', search: '', hash: '', pathname: '/' };
  context.fetch = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '' });
  context.alert = () => {};
  context.confirm = () => false;
  context.prompt = () => null;
  context.requestAnimationFrame = () => 0;
  context.cancelAnimationFrame = () => {};
  context.getComputedStyle = () => stubElement().style;
  context.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  context.performance = { now: () => 0 };
  context.structuredClone = value => value;
  context.MutationObserver = class { observe() {} disconnect() {} };
  context.IntersectionObserver = class { observe() {} disconnect() {} };
  context.ResizeObserver = class { observe() {} disconnect() {} };
  context.CustomEvent = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
  context.Event = class { constructor(type, init) { this.type = type; Object.assign(this, init); } };
  context.Image = class {};
  context.Audio = class { constructor() { this.play = () => Promise.resolve(); } };
  context.FileReader = class { readAsDataURL() {} };
  context.FormData = class {};
  context.currentUser = null;
  context.open = () => null;
  context.close = () => {};
  context.parent = context;

  vm.runInContext(fs.readFileSync(SCRIPT_JS, 'utf8'), context);
  return context;
}

function storedNotices(storage, userId) {
  return JSON.parse(storage.data[`love-local-notices:${userId}`] || '[]');
}

test('CODEX-0019 P2: локальная запись пишется в ключ своего аккаунта', () => {
  const context = loadScriptJs();

  context.window.currentUser = { _id: 'user-1', username: 'anna' };
  context.window.saveSystemNotice('Соединение', 'Не удалось отправить сообщение');

  const mine = storedNotices(context.localStorage, 'user-1');
  assert.equal(mine.length, 1);
  assert.equal(mine[0].text, 'Не удалось отправить сообщение');
});

test('CODEX-0019 P2: после смены аккаунта чужие записи не переезжают', () => {
  const context = loadScriptJs();

  context.window.currentUser = { _id: 'user-1', username: 'anna' };
  context.window.saveSystemNotice('Соединение', 'Секрет первого аккаунта');

  // Выход: лента уходит из памяти.
  context.window.resetNotificationsForLogout();
  assert.equal(storedNotices(context.localStorage, 'user-1').length, 1);

  // Вход под вторым аккаунтом и загрузка серверных уведомлений.
  context.window.currentUser = { _id: 'user-2', username: 'boris' };
  context.window._applyServerNotifications([]);

  assert.deepEqual(storedNotices(context.localStorage, 'user-2'), []);
  assert.deepEqual(context.readLocalNotices(), []);
  // Записи первого аккаунта при этом целы.
  assert.equal(storedNotices(context.localStorage, 'user-1')[0].text, 'Секрет первого аккаунта');
});

test('CODEX-0019 P2: вернувшись в свой аккаунт, записи снова видны', () => {
  const context = loadScriptJs();

  context.window.currentUser = { _id: 'user-1', username: 'anna' };
  context.window.saveSystemNotice('Соединение', 'Вернуться');
  context.window.resetNotificationsForLogout();

  context.window.currentUser = { _id: 'user-2', username: 'boris' };
  context.window._applyServerNotifications([]);
  context.window.resetNotificationsForLogout();

  context.window.currentUser = { _id: 'user-1', username: 'anna' };
  context.window._applyServerNotifications([]);

  const back = context.readLocalNotices();
  assert.equal(back.length, 1);
  assert.equal(back[0].text, 'Вернуться');
});

test('CODEX-0019 P2: локальные записи не подмешиваются к чужой серверной ленте', () => {
  const context = loadScriptJs();

  context.window.currentUser = { _id: 'user-2', username: 'boris' };
  context.window._applyServerNotifications([
    { id: 1, type: 'system_joined', category: 'system', name: 'Love', avatar: '!', text: 'Только серверное', time: '10:00', unread: true },
  ]);

  assert.deepEqual(context.readLocalNotices(), []);
});

test('CODEX-0019 P2: общий ключ прошлых версий удаляется', () => {
  const context = loadScriptJs({ 'love-local-notices': JSON.stringify([{ title: 'Старое', text: 'без владельца' }]) });

  assert.equal(context.localStorage.getItem('love-local-notices'), null);
});