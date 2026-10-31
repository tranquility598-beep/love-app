/**
 * Медиа публичных страниц профиля: приём файлов и проверка «это точно наше».
 *
 * Главная мысль файла — вторая функция. На странице профиля любой URL
 * подставляется в <img>, <video> или <audio> и загружается браузером
 * ПОСЕТИТЕЛЯ. Если разрешить произвольные адреса, владелец страницы получает:
 *  - лог IP и User-Agent каждого, кто открыл страницу (свой сервер в <img>);
 *  - возможность подменить картинку на что угодно после модерации;
 *  - бесплатный способ раздавать вредный файл со ссылкой на loveapp.chat.
 * Поэтому все медиа-адреса обязаны лежать на наших хостах, а прийти туда
 * можно только через POST /api/profile-page/asset.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cloudinary = require('../config/cloudinary');
const { validateFile, generateSafeFilename } = require('./fileValidator');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const VIDEO_EXT = new Set(['.mp4', '.webm']);
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.ogg', '.wav']);
// Шрифты узнаём по расширению и сигнатуре файла: браузеры часто шлют их как
// application/octet-stream, и по MIME их не отличить от чего угодно.
const FONT_EXT = new Set(['.woff2', '.woff', '.ttf', '.otf']);
const FONT_MAGIC = [Buffer.from('wOF2'), Buffer.from('wOFF'), Buffer.from([0, 1, 0, 0]), Buffer.from('OTTO'), Buffer.from('true')];

const IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const VIDEO_MIME = new Set(['video/mp4', 'video/webm']);
const AUDIO_MIME = new Set(['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/webm']);

/**
 * Хосты, с которых мы согласны отдавать медиа на публичной странице.
 *
 * Настраивается через PROFILE_MEDIA_HOSTS (через запятую) — иначе при переезде
 * на другой домен или другой аккаунт Cloudinary пришлось бы править код.
 * localhost в списке нужен для разработки: там сервер отдаёт /uploads с
 * http://localhost:5555.
 */
function allowedHosts() {
  const configured = String(process.env.PROFILE_MEDIA_HOSTS || '')
    .split(',')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean);

  if (configured.length) return new Set(configured);

  return new Set([
    'api.loveapp.chat',
    'res.cloudinary.com',
    'localhost',
    '127.0.0.1'
  ]);
}

/**
 * Определяет, наш ли это адрес и какого рода медиа за ним лежит.
 * Возвращает null для всего, что не прошло — вызывающий код превращает это
 * в 400, не пытаясь «починить» ссылку.
 */
function classifyMediaUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || ''));
  } catch (error) {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:')) return null;
  if (!allowedHosts().has(host)) return null;

  // Cloudinary отдаёт вид ресурса прямо в пути: /<cloud>/image/upload/...
  // Аудио и видео у них обоих лежат под /video/upload/, поэтому разделяем по
  // расширению.
  const ext = path.extname(parsed.pathname).toLowerCase();
  if (host === 'res.cloudinary.com') {
    if (parsed.pathname.includes('/image/upload/')) {
      return IMAGE_EXT.has(ext) || !ext ? { kind: 'image', url: parsed.toString() } : null;
    }
    if (parsed.pathname.includes('/video/upload/')) {
      if (AUDIO_EXT.has(ext)) return { kind: 'audio', url: parsed.toString() };
      if (VIDEO_EXT.has(ext) || !ext) return { kind: 'video', url: parsed.toString() };
    }
    if (parsed.pathname.includes('/raw/upload/') && FONT_EXT.has(ext)) return { kind: 'font', url: parsed.toString() };
    return null;
  }

  // Свой хост: только каталоги загрузок, только известные расширения.
  if (!parsed.pathname.startsWith('/uploads/')) return null;
  if (IMAGE_EXT.has(ext)) return { kind: 'image', url: parsed.toString() };
  if (VIDEO_EXT.has(ext)) return { kind: 'video', url: parsed.toString() };
  if (AUDIO_EXT.has(ext)) return { kind: 'audio', url: parsed.toString() };
  if (FONT_EXT.has(ext) && parsed.pathname.startsWith('/uploads/fonts/')) return { kind: 'font', url: parsed.toString() };
  return null;
}

/**
 * Проверка «этот адрес можно ставить в поле такого рода».
 * kinds — список допустимых видов ('image', 'video', 'audio').
 */
function isAllowedMediaUrl(rawUrl, kinds) {
  const classified = classifyMediaUrl(rawUrl);
  if (!classified) return false;
  return kinds.includes(classified.kind);
}

function isAnimatedImageUrl(rawUrl) {
  const classified = classifyMediaUrl(rawUrl);
  if (!classified || classified.kind !== 'image') return false;
  // Анимацию внутри webp по расширению не определить, но это и не нужно:
  // ограничение на анимированный аватар существует, чтобы gif был платным,
  // а не чтобы ловить каждый кадр. Честная проверка кадров потребовала бы
  // декодировать файл на каждом сохранении.
  return path.extname(new URL(classified.url).pathname).toLowerCase() === '.gif';
}

function detectKind(mimetype) {
  const mime = String(mimetype || '').toLowerCase();
  if (IMAGE_MIME.has(mime)) return 'image';
  if (VIDEO_MIME.has(mime)) return 'video';
  if (AUDIO_MIME.has(mime) || mime.startsWith('audio/')) return 'audio';
  return null;
}

/**
 * Сохраняет файл страницы профиля и возвращает наш URL.
 *
 * Логика хранения повторяет POST /api/upload: Cloudinary, если настроен,
 * иначе локальная папка. Отдельная функция, а не вызов того роута, по двум
 * причинам: редактор ходит с узким токеном, который в общий /api/upload не
 * пускают, и лимит размера здесь зависит от тарифа, а не от типа файла.
 */
/** Шрифт: расширение из списка и настоящая сигнатура в начале файла. */
function fontHead(file) {
  try {
    if (file.data && file.data.length >= 4) return file.data.subarray(0, 4);
    if (file.tempFilePath) {
      const fd = fs.openSync(file.tempFilePath, 'r');
      const head = Buffer.alloc(4);
      fs.readSync(fd, head, 0, 4, 0);
      fs.closeSync(fd);
      return head;
    }
  } catch (_) { /* не прочитали — значит не шрифт */ }
  return Buffer.alloc(0);
}

async function storeFont(file, maxBytes) {
  const ext = path.extname(String(file.name || '')).toLowerCase();
  if (!FONT_EXT.has(ext)) return { error: 'Нужен файл шрифта: .woff2, .woff, .ttf или .otf' };
  if (file.size > Math.min(maxBytes, 3 * 1024 * 1024)) return { error: 'Шрифт больше 3 МБ — возьмите .woff2, он в разы легче' };
  const head = fontHead(file);
  if (!FONT_MAGIC.some(magic => head.length >= 4 && head.subarray(0, 4).equals(magic))) {
    return { error: 'Файл не похож на шрифт' };
  }
  const cloudinaryConfigured = Boolean(process.env.CLOUDINARY_URL || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY));
  if (!cloudinaryConfigured) {
    const targetDir = path.join(__dirname, '..', 'uploads', 'fonts');
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const safeName = `${crypto.randomBytes(12).toString('hex')}${ext}`;
    await file.mv(path.join(targetDir, safeName));
    return { kind: 'font', path: `/uploads/fonts/${safeName}`, storage: 'local' };
  }
  const uploadResult = await cloudinary.uploader.upload(file.tempFilePath || file.data, {
    folder: 'profile-pages/fonts',
    resource_type: 'raw',
    use_filename: false,
    unique_filename: true,
    format: ext.slice(1)
  });
  return { kind: 'font', url: uploadResult.secure_url, storage: 'cloudinary' };
}

async function storeProfileAsset(file, { maxBytes, allowedKinds }) {
  if (allowedKinds.includes('font')) return storeFont(file, maxBytes);
  const kind = detectKind(file.mimetype);
  if (!kind || !allowedKinds.includes(kind)) {
    return { error: 'Такой тип файла здесь не поддерживается' };
  }

  if (file.size > maxBytes) {
    const limitMb = Math.round(maxBytes / (1024 * 1024));
    return { error: `Файл больше ${limitMb} МБ — на вашем тарифе это предел` };
  }

  const validation = await validateFile(file, kind === 'image', kind, { maxSize: maxBytes });
  if (!validation.valid) {
    return { error: (validation.errors && validation.errors[0]) || 'Файл не прошёл проверку' };
  }

  const cloudinaryConfigured = Boolean(
    process.env.CLOUDINARY_URL
    || (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY)
  );

  if (!cloudinaryConfigured) {
    const folder = kind === 'image' ? 'images' : (kind === 'audio' ? 'audio' : 'video');
    const targetDir = path.join(__dirname, '..', 'uploads', folder);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    const safeName = generateSafeFilename(file.name, file.mimetype);
    await file.mv(path.join(targetDir, safeName));
    return { kind, path: `/uploads/${folder}/${safeName}`, storage: 'local' };
  }

  const uploadResult = await cloudinary.uploader.upload(
    file.tempFilePath || file.data,
    {
      folder: kind === 'image' ? 'profile-pages/images' : `profile-pages/${kind}`,
      // У Cloudinary аудио тоже загружается как video — это их модель, не опечатка.
      resource_type: kind === 'image' ? 'image' : 'video',
      use_filename: true,
      unique_filename: true,
      ...(kind === 'image'
        ? { transformation: [{ quality: 'auto:good', fetch_format: 'auto', width: 2048, crop: 'limit' }] }
        : {})
    }
  );

  return { kind, url: uploadResult.secure_url, storage: 'cloudinary' };
}

module.exports = {
  // allowedHosts наружу нужен ровно для одного: из него собирается img-src и
  // media-src в CSP публичной страницы. Список хостов и политика браузера
  // обязаны совпадать — иначе либо картинка не покажется, либо CSP разрешит
  // больше, чем проверка URL.
  allowedHosts,
  classifyMediaUrl,
  isAllowedMediaUrl,
  isAnimatedImageUrl,
  storeProfileAsset
};
