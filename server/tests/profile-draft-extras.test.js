const test = require('node:test');
const assert = require('node:assert/strict');
const ProfilePage = require('../models/ProfilePage');
const { limitsFor, THEME_BY_ID, seasonActive } = require('../config/profileTiers');
const { buildView } = require('../utils/profilePageView');
const { buildStyles, scopeForShadow } = require('../utils/profilePageStyles');
const { renderPage, renderPreviewFragment } = require('../utils/profilePageHtml');
const { snapshotOf, isDirty, ensurePublished, publish, applySnapshot, publicSource, publicLinks } = require('../utils/profileDraft');
const { reachedStep, words } = require('../utils/profileMilestones');
const { ensureContrast, contrast, hexRgb } = require('../utils/profileColor');
const { applyPatch } = require('../routes/profilePages');

const user = { username: 'fixture' };
const options = { nonce: 'n', canonical: 'https://example.test/u/fixture', siteUrl: 'https://loveapp.chat' };
const doc = extra => new ProfilePage({ user: '000000000000000000000001', ...extra });
const patch = (page, body, tier) => applyPatch(page, body, { tier, limits: limitsFor(tier), user: { friends: [] } });

test('черновик: снимок до правки, гости видят опубликованное до «Опубликовать»', async () => {
  const page = doc({ displayName: 'Было', links: [{ url: 'https://a.test', clicks: 7 }] });
  assert.equal(ensurePublished(page), true);
  assert.equal(ensurePublished(page), false, 'второй раз снимок не перезаписывается');
  assert.equal(isDirty(page), false);
  page.displayName = 'Стало';
  assert.equal(isDirty(page), true);
  const guests = await publicSource(page, { find: () => ({ select: () => ({ lean: async () => [] }) }) });
  assert.equal(guests.displayName, 'Было');
  assert.equal(snapshotOf(page).links[0].clicks, undefined, 'нажатия — не оформление');
  page.versions = [];
  publish(page);
  assert.equal(isDirty(page), false);
  assert.equal(page.versions.length, 1);
  assert.equal((await publicSource(page, { find: () => ({ select: () => ({ lean: async () => [] }) }) })).displayName, 'Стало');
});

test('черновик: откат возвращает поля, нажатия ссылок переносятся по адресу', () => {
  const page = doc({ displayName: 'A', links: [{ url: 'https://a.test', clicks: 3 }, { url: 'https://b.test', clicks: 1 }] });
  ensurePublished(page);
  page.displayName = 'B';
  page.links = [{ url: 'https://b.test', clicks: 5 }];
  applySnapshot(page, page.published.data);
  assert.equal(page.displayName, 'A');
  assert.deepEqual(page.links.map(link => [link.url, link.clicks]), [['https://a.test', 0], ['https://b.test', 5]]);
  // Нажатия считаются по ссылкам, которые видят гости.
  page.links = [{ url: 'https://c.test' }];
  assert.deepEqual(publicLinks(page).map(link => link.url), ['https://a.test', 'https://b.test']);
});

test('вехи: порог и текст уведомления', () => {
  assert.equal(reachedStep('views', 99), 0);
  assert.equal(reachedStep('views', 1234), 1000);
  assert.equal(reachedStep('hearts', 100), 100);
  assert.match(words('views', 1000), /открыли 1 000 раз\./);
  assert.match(words('hearts', 100), /100 сердечек/);
  assert.match(words('hearts', 10), /10 сердечек/);
});

test('читаемость: для фонов «чёрный + белый» находится серый, проходящий 4.5 на обоих', () => {
  const result = ensureContrast('#ffffff', ['#000000', '#ffffff'], 4.5);
  for (const bg of ['#000000', '#ffffff']) assert.ok(contrast(hexRgb(result.color), hexRgb(bg)) >= 4.5, bg);
  // Цветной текст сохраняет оттенок, сколько можно.
  const pink = hexRgb(ensureContrast('#ff3366', ['#000000', '#ffffff'], 4.5).color);
  assert.ok(pink[0] > pink[1] && pink[0] > pink[2]);
});

test('сезонные темы: выбрать и увидеть можно только в свой сезон', () => {
  const halloween = THEME_BY_ID.halloween;
  assert.equal(seasonActive(halloween, new Date('2026-10-31T12:00:00Z')), true);
  assert.equal(seasonActive(halloween, new Date('2026-12-01T12:00:00Z')), false);
  assert.equal(seasonActive(THEME_BY_ID.newyear, new Date('2027-01-03T12:00:00Z')), true, 'окно через Новый год');
});

test('вторая тема: по системе гостя — медиазапрос, по времени — класс и ранний скрипт', () => {
  const system = buildView(doc({ theme: 'midnight', altTheme: 'porcelain', themeMode: 'system' }).toObject(), user, 'free');
  assert.match(buildStyles(system), /@media \(prefers-color-scheme:light\)\{:root\{--bg:#f7f6f3;/);
  const time = buildView(doc({ theme: 'midnight', altTheme: 'porcelain', themeMode: 'time' }).toObject(), user, 'pro');
  const html = renderPage(time, options);
  assert.match(html, /classList\.add\('pf-night'\)/);
  assert.match(html, /"nightStars":true/);
  assert.match(scopeForShadow(buildStyles(time)), /:host\(\.pf-alt\)\{/);
  // На Free режим «по времени» закрыт — страница остаётся на основной теме.
  assert.equal(buildView(doc({ theme: 'midnight', altTheme: 'porcelain', themeMode: 'time' }).toObject(), user, 'free').themeMode, 'fixed');
});

test('фоны: узор — всем, переливание — Pro, живой фон — Premium и уходит в движок', () => {
  const page = doc({ bgPattern: { kind: 'dots', opacity: 40 }, bgGradient: { enabled: true, colors: ['#111111', '#333333'], animated: true }, liveBg: 'metal' }).toObject();
  const free = buildView(page, user, 'free');
  assert.equal(free.bgPattern.kind, 'dots');
  assert.equal(free.bgGradient.animated, false);
  assert.equal(free.liveBg, null);
  const premium = buildView(page, user, 'premium');
  assert.match(buildStyles(premium), /pf-grad-flow/);
  assert.match(renderPage(premium, options), /"effect":\["none","metal"\]/);
  assert.deepEqual(renderPreviewFragment(premium, options).runtime.effects, ['metal']);
  assert.match(renderPreviewFragment(free, options).html, /pf-bg-pattern/);
});

test('плейлист: несколько треков — Premium, первый трек становится основным', () => {
  const tracks = [{ url: 'http://localhost:5556/uploads/a.mp3', title: 'A' }, { url: 'http://localhost:5556/uploads/b.mp3', title: 'B' }];
  const view = buildView(doc({ playlist: tracks }).toObject(), user, 'premium');
  assert.equal(view.music.url, tracks[0].url);
  assert.equal(view.music.tracks.length, 2);
  assert.match(renderPreviewFragment(view, options).html, /pf-player-next/);
  assert.deepEqual(patch(doc({}), { playlist: tracks }, 'pro').map(e => e.field), ['playlist']);
});

test('applyPatch: шлейф, курсор и живой фон проверяются тарифом и форматом', () => {
  assert.deepEqual(patch(doc({}), { liveBg: 'metal' }, 'pro').map(e => e.field), ['liveBg']);
  assert.deepEqual(patch(doc({}), { trailStyle: { colors: ['#ff0000'], width: 150 } }, 'pro').map(e => e.field), ['trailStyle']);
  assert.deepEqual(patch(doc({}), { cursorImage: 'https://evil.test/c.png' }, 'premium').map(e => e.field), ['cursorImage']);
  assert.deepEqual(patch(doc({}), { themeMode: 'time' }, 'free').map(e => e.field), ['themeMode']);
  const page = doc({});
  assert.deepEqual(patch(page, { trailStyle: { colors: ['#FF0000'], width: 999, length: 50 } }, 'premium'), []);
  assert.deepEqual([page.trailStyle.colors[0], page.trailStyle.width, page.trailStyle.length], ['#ff0000', 300, 200]);
});
