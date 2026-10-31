const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseStoredFile, collectUserFiles, removeOrphanFiles, createFileStore, purgeUserWithFiles } = require('../services/userFiles');

const OPTIONS = { cloudName: 'love', ownHosts: ['api.loveapp.chat'] };
const parse = url => parseStoredFile(url, OPTIONS);

test('распознаёт только наше хранилище', () => {
  assert.equal(parse('https://res.cloudinary.com/love/image/upload/v12/avatars/a.png').publicId, 'avatars/a');
  assert.equal(parse('https://res.cloudinary.com/love/video/upload/q_auto/v12/profile-pages/audio/t.mp3').publicId, 'profile-pages/audio/t');
  assert.equal(parse('https://res.cloudinary.com/love/raw/upload/v12/files/a.rar').publicId, 'files/a.rar');
  assert.equal(parse('/uploads/files/a.txt').relPath, 'files/a.txt');
  assert.equal(parse('/uploads/emoji.png').relPath, 'emoji.png');
  assert.equal(parse('https://api.loveapp.chat/uploads/images/b.png').relPath, 'images/b.png');

  for (const foreign of [
    'https://res.cloudinary.com/other/image/upload/v1/a.png', // чужой аккаунт Cloudinary
    'http://res.cloudinary.com/love/image/upload/v1/a.png',
    'https://res.cloudinary.com/love/image/upload/a.png',     // без версии: не наш формат
    'https://evil.example/uploads/files/a.txt',
    'https://lh3.googleusercontent.com/a/photo.jpg',
    '/uploads/../index.js',
    '/uploads/files/../../index.js',
    '/uploads/files/%2e%2e/index.js',
    '/uploads/a/b/c.txt',
    'javascript:alert(1)',
    '',
    null
  ]) assert.equal(parse(foreign), null, String(foreign));
});

test('без настроенного Cloudinary его адреса не считаются нашими', () => {
  assert.equal(parseStoredFile('https://res.cloudinary.com/love/image/upload/v1/a.png', { cloudName: '' }), null);
});

// Простая модель: find/findOne/findById отдают заранее заданное, exists смотрит в список.
function fakeModels(data = {}, referenced = []) {
  const chain = value => ({ select: () => chain(value), lean: async () => value });
  const model = name => ({
    find: () => chain(data[`${name}.find`] ?? []),
    findOne: () => chain(data[`${name}.findOne`] ?? null),
    findById: () => chain(data[`${name}.findById`] ?? null),
    exists: async query => referenced.some(entry => entry.model === name
      && JSON.stringify(query).split(String.fromCharCode(92)).join('').includes(entry.fragment))
  });
  return Object.fromEntries(['User', 'ProfilePage', 'Server', 'Channel', 'DirectMessage', 'Message', 'Case', 'ModerationAction']
    .map(name => [name, model(name)]));
}

test('собирает файлы профиля, страницы со старыми публикациями, сфер и сообщений', async () => {
  const urls = await collectUserFiles(fakeModels({
    'User.findById': { avatar: '/uploads/avatars/me.png', music: { url: '/uploads/audio/me.mp3' } },
    'ProfilePage.findOne': {
      gallery: ['/uploads/images/g.png'],
      published: { data: { banner: '/uploads/images/old.png' } },
      versions: [{ data: { background: { url: '/uploads/video/v.mp4' } } }]
    },
    'Server.find': [{ _id: 's1', icon: '/uploads/avatars/s.png', emojis: [{ url: '/uploads/e.png' }] }],
    'Message.find': [{ attachments: [{ url: '/uploads/files/a.txt' }] }]
  }), 'u1');
  for (const expected of ['/uploads/avatars/me.png', '/uploads/audio/me.mp3', '/uploads/images/g.png', '/uploads/images/old.png',
    '/uploads/video/v.mp4', '/uploads/avatars/s.png', '/uploads/e.png', '/uploads/files/a.txt']) {
    assert.ok(urls.includes(expected), expected);
  }
});

test('чужой файл не трогает, даже если адрес вписан в сообщение удаляемого', async () => {
  const removed = [];
  const store = { remove: async file => { removed.push(file.key); } };
  const models = fakeModels({}, [
    { model: 'Message', fragment: 'victim.png' },   // файл из сообщения другого человека
    { model: 'Case', fragment: 'evidence.png' },    // вложение обращения остаётся
    { model: 'ModerationAction', fragment: 'proof.png' },
    { model: 'ProfilePage', fragment: 'shared.png' }
  ]);
  const result = await removeOrphanFiles(models, [
    '/uploads/files/victim.png', '/uploads/files/evidence.png', '/uploads/files/proof.png', '/uploads/images/shared.png',
    '/uploads/files/mine.txt', 'https://api.loveapp.chat/uploads/files/mine.txt', // один файл двумя адресами
    'https://evil.example/uploads/files/x.txt', 'просто текст из страницы'
  ], store, OPTIONS);
  assert.deepEqual(removed, ['local:files/mine.txt']);
  assert.deepEqual(result, { removed: 1, kept: 4, failed: 0 });
});

test('сбой проверки или хранилища оставляет файл и не прерывает остальные', async () => {
  const removed = [];
  const models = fakeModels();
  models.Message.exists = async query => {
    if (JSON.stringify(query).includes('broken')) throw new Error('база недоступна');
    return false;
  };
  const store = { remove: async file => {
    if (file.key.includes('nostore')) throw new Error('хранилище недоступно');
    removed.push(file.key);
  } };
  const originalError = console.error;
  console.error = () => {};
  const result = await removeOrphanFiles(models, ['/uploads/files/broken.txt', '/uploads/files/nostore.txt', '/uploads/files/ok.txt'], store, OPTIONS);
  console.error = originalError;
  assert.deepEqual(removed, ['local:files/ok.txt']);
  assert.deepEqual(result, { removed: 1, kept: 0, failed: 2 });
});

test('Cloudinary: тип файла передаётся, для raw пробует идентификатор без расширения', async () => {
  const calls = [];
  const cloudinary = { uploader: { destroy: async (id, options) => {
    calls.push([id, options.resource_type, options.invalidate]);
    return { result: id.endsWith('.rar') ? 'not found' : 'ok' };
  } } };
  const store = createFileStore(cloudinary);
  await store.remove(parse('https://res.cloudinary.com/love/raw/upload/v1/files/a.rar'));
  await store.remove(parse('https://res.cloudinary.com/love/video/upload/v1/audio/t.mp3'));
  assert.deepEqual(calls, [['files/a.rar', 'raw', true], ['files/a', 'raw', true], ['audio/t', 'video', true]]);
  const failing = createFileStore({ uploader: { destroy: async () => ({ result: 'error' }) } });
  await assert.rejects(failing.remove(parse('https://res.cloudinary.com/love/image/upload/v1/a.png')));
});

test('локальное хранилище: отсутствующий файл не ошибка, выход из uploads запрещён', async () => {
  const unlinked = [];
  const fakeFs = { promises: { unlink: async target => {
    unlinked.push(target);
    throw Object.assign(new Error('нет'), { code: 'ENOENT' });
  } } };
  const store = createFileStore(null, fakeFs);
  await store.remove({ kind: 'local', relPath: 'files/a.txt' });
  assert.ok(unlinked[0].endsWith(path.join('uploads', 'files', 'a.txt')));
  await assert.rejects(store.remove({ kind: 'local', relPath: '../index.js' }));
  assert.equal(unlinked.length, 1);
});

test('сначала файлы собираются, потом чистится база, файлы удаляются после неё', async () => {
  const order = [];
  const models = fakeModels({ 'User.findById': { avatar: '/uploads/avatars/me.png' } });
  const { cleanup, counts } = await purgeUserWithFiles(models, 'u1', {
    purgeUser: async () => { order.push('база'); return { user: 1 }; },
    store: { remove: async () => { order.push('файл'); } },
    options: OPTIONS,
    onFiles: result => { order.push(`журнал:${result.removed}`); }
  });
  await cleanup;
  assert.deepEqual(counts, { user: 1 });
  assert.deepEqual(order, ['база', 'файл', 'журнал:1']);
});

