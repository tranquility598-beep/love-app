/**
 * Файлы удаляемого аккаунта: аватар, баннеры, вложения, медиа страницы профиля,
 * значки и обложки его сфер. purgeUser чистит только базу, файлы в Cloudinary и в
 * uploads/ остались бы лежать и открывались бы по прямой ссылке.
 *
 * Адрес вложения присылает клиент (utils/messageAttachments.js), поэтому «файл из
 * сообщения удаляемого» не значит «файл удаляемого»: можно вписать чужой адрес и
 * стереть чужой файл, удалив свой аккаунт. Отсюда два правила:
 *  - удаляем только то, что распознано как наше хранилище (parseStoredFile);
 *  - удаляем только то, на что после очистки базы никто не ссылается, включая
 *    обращения и записи модерации, которые остаются (stillReferenced).
 *
 * Модели и хранилище передаются аргументами — проверяется в тестах без базы и
 * без настоящего Cloudinary.
 */

const path = require('path');
const { escapeRegex } = require('../utils/security');

const UPLOADS_ROOT = path.join(__dirname, '..', 'uploads');

const CLOUDINARY_PATH = /^\/([^/]+)\/(image|video|raw)\/upload\/(?:.*\/)?v\d+\/(.+)$/;
const LOCAL_PATH = /^\/uploads\/((?:[a-z]+\/)?[A-Za-z0-9][A-Za-z0-9._-]*)$/;

function isOwnLocalHost(hostname, ownHosts) {
  return ownHosts.includes(hostname) || hostname === 'localhost' || hostname === '127.0.0.1'
    || hostname.endsWith('.localhost');
}

/**
 * Что за файл лежит по адресу, или null, если это не наше хранилище.
 * options: cloudName — наш аккаунт Cloudinary; ownHosts — хосты нашего сервера.
 */
function parseStoredFile(url, { cloudName = '', ownHosts = ['api.loveapp.chat'] } = {}) {
  if (typeof url !== 'string' || !url || url.length > 2048) return null;
  // URL сам схлопывает «..» и %2e%2e, поэтому такие адреса отсекаем до разбора.
  if (/\.\.|%2e/i.test(url)) return null;
  let parsed;
  try {
    parsed = new URL(url, 'http://relative.invalid');
  } catch (_) {
    return null;
  }
  const relative = parsed.hostname === 'relative.invalid';

  if (parsed.hostname === 'res.cloudinary.com') {
    if (parsed.protocol !== 'https:' || !cloudName) return null;
    const match = CLOUDINARY_PATH.exec(parsed.pathname);
    if (!match || match[1] !== cloudName) return null;
    let publicId;
    try {
      publicId = decodeURIComponent(match[3]);
    } catch (_) {
      return null;
    }
    return {
      kind: 'cloudinary',
      resourceType: match[2],
      // У raw расширение — часть идентификатора, у картинок и видео это формат.
      publicId: match[2] === 'raw' ? publicId : publicId.replace(/\.[A-Za-z0-9]+$/, ''),
      key: `cloudinary:${match[2]}:${match[2] === 'raw' ? publicId : publicId.replace(/\.[A-Za-z0-9]+$/, '')}`,
      // По этому куску ищутся другие ссылки на тот же файл. Лишнее совпадение
      // только оставит файл на месте, поэтому начало адреса не сравнивается.
      fragment: match[3].replace(/\.[A-Za-z0-9]+$/, '')
    };
  }

  if (!relative && !isOwnLocalHost(parsed.hostname, ownHosts)) return null;
  const local = LOCAL_PATH.exec(parsed.pathname);
  if (!local) return null;
  return { kind: 'local', relPath: local[1], key: `local:${local[1]}`, fragment: `/uploads/${local[1]}` };
}

/** Все строки внутри документа, сколько бы ни было вложенности (published.data — Mixed). */
function collectStrings(value, out = [], depth = 0) {
  if (typeof value === 'string') out.push(value);
  else if (value && typeof value === 'object' && depth < 12 && !(value instanceof Date)) {
    // ObjectId и Buffer — объекты, но файлов в них нет.
    if (value._bsontype || Buffer.isBuffer(value)) return out;
    for (const item of Array.isArray(value) ? value : Object.values(value)) collectStrings(item, out, depth + 1);
  }
  return out;
}

/** Вызывать ДО purgeUser: после него искать будет негде. */
async function collectUserFiles(models, userId) {
  const { User, ProfilePage, Server, Channel, DirectMessage, Message } = models;
  const urls = new Set();
  const addAll = doc => collectStrings(doc).forEach(value => urls.add(value));

  const user = await User.findById(userId).select('avatar banner music').lean();
  if (user) addAll([user.avatar, user.banner, user.music?.url]);

  const page = await ProfilePage.findOne({ user: userId }).select('+versions').lean();
  if (page) addAll(page);

  const servers = await Server.find({ owner: userId }).select('icon banner emojis').lean();
  addAll(servers.map(server => [server.icon, server.banner, (server.emojis || []).map(emoji => emoji.url)]));

  // Вложения всех сообщений, которые удалит purgeUser: свои и чаты/сферы целиком.
  const serverChannels = servers.length
    ? await Channel.find({ server: { $in: servers.map(server => server._id) } }).select('_id').lean()
    : [];
  const dms = await DirectMessage.find({ participants: userId }).select('channel').lean();
  const channelIds = serverChannels.map(channel => channel._id)
    .concat(dms.map(dm => dm.channel?._id || dm.channel).filter(Boolean));
  const messages = await Message.find({
    'attachments.0': { $exists: true },
    $or: [{ author: userId }, { channel: { $in: channelIds } }]
  }).select('attachments.url').lean();
  messages.forEach(message => (message.attachments || []).forEach(attachment => urls.add(attachment.url)));

  return [...urls];
}

const PAGE_FILE_FIELDS = [
  'avatar', 'banner', 'ogImage', 'cursorImage', 'gallery', 'background.url', 'music.url',
  'playlist.url', 'customFont.url'
];

/** Ссылается ли кто-то на файл после очистки базы. Сбой запроса считается за «да». */
async function stillReferenced(models, file) {
  const { User, Message, Server, ProfilePage, Case, ModerationAction } = models;
  const match = { $regex: escapeRegex(file.fragment) };
  const anyOf = fields => ({ $or: fields.map(field => ({ [field]: match })) });
  const pageFields = PAGE_FILE_FIELDS.flatMap(field => [field, `published.data.${field}`, `versions.data.${field}`]);
  const checks = [
    [Message, { 'attachments.url': match }],
    [User, anyOf(['avatar', 'banner', 'music.url'])],
    [Server, anyOf(['icon', 'banner', 'emojis.url'])],
    [ProfilePage, anyOf(pageFields)],
    [Case, { 'attachments.url': match }],
    [ModerationAction, { 'evidence.url': match }]
  ];
  for (const [model, query] of checks) {
    if (await model.exists(query)) return true;
  }
  return false;
}

/**
 * Удаляет файлы, на которые больше никто не ссылается. Запускается после purgeUser
 * и не должен его ронять: аккаунт уже удалён. Возвращает счётчики для журнала.
 */
async function removeOrphanFiles(models, urls, store, options = {}) {
  const seen = new Set();
  const result = { removed: 0, kept: 0, failed: 0 };
  for (const url of urls) {
    const file = parseStoredFile(url, options);
    if (!file || seen.has(file.key)) continue;
    seen.add(file.key);
    try {
      if (await stillReferenced(models, file)) {
        result.kept += 1;
        continue;
      }
      await store.remove(file);
      result.removed += 1;
    } catch (error) {
      result.failed += 1;
      console.error('[userFiles] Не удалось удалить файл:', file.key, error.message);
    }
  }
  return result;
}

/** Настоящее хранилище: Cloudinary и папка uploads. */
function createFileStore(cloudinary, fs = require('fs')) {
  return {
    async remove(file) {
      if (file.kind === 'local') {
        const target = path.resolve(UPLOADS_ROOT, file.relPath);
        if (!target.startsWith(UPLOADS_ROOT + path.sep)) throw new Error('путь вне uploads');
        await fs.promises.unlink(target).catch(error => {
          if (error.code !== 'ENOENT') throw error;
        });
        return;
      }
      const destroy = publicId => cloudinary.uploader.destroy(publicId, {
        resource_type: file.resourceType,
        invalidate: true
      });
      let response = await destroy(file.publicId);
      // routes/upload.js дописывает расширение к адресу raw, которого нет в идентификаторе.
      if (response?.result === 'not found' && file.resourceType === 'raw' && /\.[A-Za-z0-9]+$/.test(file.publicId)) {
        response = await destroy(file.publicId.replace(/\.[A-Za-z0-9]+$/, ''));
      }
      if (response?.result !== 'ok' && response?.result !== 'not found') {
        throw new Error(`Cloudinary ответил: ${response?.result}`);
      }
    }
  };
}

/**
 * Полное удаление: база сразу, файлы следом в фоне — их может быть много, а отвечать
 * человеку надо быстро. onFiles получает счётчики, чтобы записать их в журнал.
 */
async function purgeUserWithFiles(models, userId, { purgeUser, store, options, onFiles }) {
  const urls = await collectUserFiles(models, userId);
  const counts = await purgeUser(models, userId);
  const cleanup = removeOrphanFiles(models, urls, store, options)
    .then(result => onFiles?.(result))
    .catch(error => console.error('[userFiles] Очистка файлов прервалась:', error.message));
  return { counts, cleanup };
}

module.exports = {
  parseStoredFile, collectUserFiles, stillReferenced, removeOrphanFiles, createFileStore, purgeUserWithFiles
};
