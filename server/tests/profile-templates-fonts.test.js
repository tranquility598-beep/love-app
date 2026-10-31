const test = require('node:test');
const assert = require('node:assert/strict');
const ProfilePage = require('../models/ProfilePage');
const { limitsFor, capabilitiesFor } = require('../config/profileTiers');
const { TEMPLATES } = require('../config/profileTemplates');
const { buildView } = require('../utils/profilePageView');
const { buildStyles } = require('../utils/profilePageStyles');
const { storeProfileAsset } = require('../utils/profileMedia');
const { applyPatch } = require('../routes/profilePages');

const user = { username: 'fixture' };
const doc = extra => new ProfilePage({ user: '000000000000000000000001', ...extra });
const patch = (page, body, tier) => applyPatch(page, body, { tier, limits: limitsFor(tier), user: { friends: [] } });
const BELOW = { pro: 'free', premium: 'pro' };

test('шаблоны: каждый применяется на своём тарифе и отказывает ниже', () => {
  assert.ok(TEMPLATES.length >= 10);
  for (const template of TEMPLATES) {
    // Так шаблон отправляет редактор: снимок оформления и выключенная своя тема.
    const body = { ...template.data, customTheme: { enabled: false } };
    const page = doc();
    assert.deepEqual(patch(page, body, template.tier), [], template.id);
    assert.equal(page.theme, template.data.theme, template.id);
    assert.equal(page.font, template.data.font, template.id);
    assert.deepEqual([...page.effects], template.data.effects, template.id);
    if (BELOW[template.tier]) {
      assert.ok(patch(doc(), body, BELOW[template.tier]).length > 0, `${template.id} ниже ${template.tier}`);
    }
  }
  const free = capabilitiesFor('free').templates;
  assert.equal(free.find(item => item.id === 'midnight').allowed, true);
  assert.equal(free.find(item => item.id === 'neon').allowed, false);
});

test('цвет курсора: свой цвет и градиент — Pro, сброс к акценту — всем', () => {
  assert.deepEqual(patch(doc(), { style: { cursorColors: ['#ff0000'] } }, 'free').map(e => e.field), ['style.cursorColors']);
  assert.deepEqual(patch(doc(), { style: { cursorColors: ['red'] } }, 'pro').map(e => e.field), ['style.cursorColors']);
  assert.deepEqual(patch(doc(), { style: { cursorColors: ['#111111', '#222222', '#333333'] } }, 'pro').map(e => e.field), ['style.cursorColors']);
  assert.deepEqual(patch(doc(), { style: { cursorColors: [] } }, 'free'), []);

  const page = doc();
  assert.deepEqual(patch(page, { style: { cursor: 'heart', cursorColors: ['#FF0000', '#0000FF'] } }, 'pro'), []);
  assert.deepEqual([...page.style.cursorColors], ['#ff0000', '#0000ff']);
  const css = buildStyles(buildView(page.toObject(), user, 'pro'));
  assert.match(css, /linearGradient/);
  assert.match(css, /ff0000/i);
  // На Free цвета не показываются, курсор красится акцентом.
  assert.doesNotMatch(buildStyles(buildView(page.toObject(), user, 'free')), /linearGradient/);
});

test('свой шрифт: только наш адрес загрузки, Premium, сброс возвращает системный', () => {
  const url = 'http://localhost:5555/uploads/fonts/0123abcd.woff2';
  assert.deepEqual(patch(doc(), { customFont: { url: 'https://evil.test/font.woff2' } }, 'premium').map(e => e.field), ['customFont']);
  assert.deepEqual(patch(doc(), { customFont: { url: 'http://localhost:5555/uploads/images/a.woff2' } }, 'premium').map(e => e.field), ['customFont']);
  assert.deepEqual(patch(doc(), { customFont: { url } }, 'pro').map(e => e.field), ['customFont']);

  const page = doc();
  assert.deepEqual(patch(page, { customFont: { url, name: 'Мой шрифт' }, font: 'custom' }, 'premium'), []);
  assert.equal(page.customFont.url, url);
  const css = buildStyles(buildView(page.toObject(), user, 'premium'));
  assert.match(css, /@font-face\{font-family:"LoveCustom";src:url\("http:\/\/localhost:5555\/uploads\/fonts\/0123abcd\.woff2"\) format\("woff2"\)/);
  // Тариф кончился — страница на обычном шрифте, без чужого @font-face.
  assert.doesNotMatch(buildStyles(buildView(page.toObject(), user, 'pro')), /LoveCustom/);

  assert.deepEqual(patch(page, { customFont: { url: null } }, 'premium'), []);
  assert.equal(page.customFont.url, null);
  assert.equal(page.font, 'system');
});

test('загрузка шрифта: расширение, размер и сигнатура проверяются до сохранения', async () => {
  const file = (name, data) => ({ name, data, size: data.length, mimetype: 'application/octet-stream' });
  const store = item => storeProfileAsset(item, { maxBytes: 10 * 1024 * 1024, allowedKinds: ['font'] });
  assert.match((await store(file('font.exe', Buffer.from('wOF2....')))).error, /\.woff2/);
  assert.match((await store(file('font.woff2', Buffer.from('<svg onload=1>')))).error, /не похож на шрифт/);
  const huge = { name: 'font.woff2', data: Buffer.from('wOF2'), size: 4 * 1024 * 1024, mimetype: 'font/woff2' };
  assert.match((await store(huge)).error, /3 МБ/);
});
