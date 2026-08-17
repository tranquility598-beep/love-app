/**
 * Превью сообщения для лент уведомлений и списка диалогов.
 *
 * Раньше в уведомление уходил только `content`, поэтому сообщение из одной
 * фотографии или голосового превращалось в пустую карточку: человек видел имя
 * отправителя и ничего больше. Здесь из текста и вложений собирается тройка
 * { preview, previewKind, previewImage }:
 *
 *   preview      — что показать текстом: сам текст, а если его нет — подпись
 *                  вида «Фото» / «Голосовое сообщение» / «Файл: смета.pdf»;
 *   previewKind  — чем это было (text | image | video | voice | audio | file |
 *                  mixed), чтобы клиент выбрал иконку;
 *   previewImage — ссылка на первую картинку, если она есть, чтобы показать
 *                  само фото, а не только слово «Фото».
 *
 * Один модуль на все точки создания уведомлений — иначе подписи разъезжаются
 * между сокетом, REST-роутом и мобильным клиентом.
 */

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'heic', 'heif', 'svg']);
const VIDEO_EXT = new Set(['mp4', 'mov', 'webm', 'mkv', 'avi', 'm4v', '3gp']);
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'oga', 'opus', 'm4a', 'aac', 'flac', 'weba']);

const MAX_PREVIEW = 300;
const MAX_NAME = 40;

/**
 * Голосовое или просто аудиофайл. Запись голоса на ПК уходит как
 * voice-message.webm, на мобиле — voice.m4a, поэтому смотрим на начало имени.
 * Расширение здесь не показатель: .webm бывает и у видео, и у аудиофайла.
 */
function isVoiceNote(name) {
  return /^voice[-_.]?/.test(name);
}

function shortName(name) {
  const clean = String(name || '').trim();
  if (!clean) return 'файл';
  if (clean.length <= MAX_NAME) return clean;
  // Расширение важнее середины имени — по нему понятно, что за файл.
  const dot = clean.lastIndexOf('.');
  const ext = dot > 0 && clean.length - dot <= 8 ? clean.slice(dot) : '';
  return clean.slice(0, MAX_NAME - ext.length - 1) + '…' + ext;
}

/**
 * Тип одного вложения. Порядок проверок — от явного к догадкам:
 * поле type ставит наш нормализатор, mimetype приходит от загрузчика,
 * расширение остаётся последней зацепкой (у старых записей бывает только оно).
 */
function attachmentKind(attachment) {
  const type = String(attachment.type || '').toLowerCase();
  const mime = String(attachment.mimetype || '').toLowerCase();
  const name = String(attachment.originalName || attachment.filename || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  const ext = dot > -1 ? name.slice(dot + 1) : '';

  if (type === 'image' || mime.startsWith('image/') || IMAGE_EXT.has(ext)) return 'image';

  if (type === 'audio' || mime.startsWith('audio/')) {
    return isVoiceNote(name) ? 'voice' : 'audio';
  }
  if (type === 'video' || mime.startsWith('video/')) return 'video';

  // Тип не указан — идём по расширению. Голосовое проверяем раньше видео,
  // потому что webm лежит в обоих списках.
  if (isVoiceNote(name) && (AUDIO_EXT.has(ext) || ext === 'webm')) return 'voice';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (AUDIO_EXT.has(ext)) return 'audio';

  return 'file';
}

function singleLabel(kind, attachment) {
  const name = shortName(attachment.originalName || attachment.filename);
  switch (kind) {
    case 'image': return 'Фото';
    case 'video': return 'Видео';
    case 'voice': return 'Голосовое сообщение';
    case 'audio': return `Аудио: ${name}`;
    default:      return `Файл: ${name}`;
  }
}

function multiLabel(kinds, count) {
  const unique = new Set(kinds);
  if (unique.size === 1) {
    switch (kinds[0]) {
      case 'image': return `Фото (${count})`;
      case 'video': return `Видео (${count})`;
      case 'voice': return `Голосовые сообщения (${count})`;
      case 'audio': return `Аудио (${count})`;
      default:      return `Файлы (${count})`;
    }
  }
  return `Вложения (${count})`;
}

/**
 * @param {string} content              - текст сообщения
 * @param {Array}  attachments          - вложения в форме utils/messageAttachments
 * @returns {{preview: string, previewKind: string, previewImage: string|null}}
 */
function buildMessagePreview(content, attachments) {
  const text = (content == null ? '' : String(content)).trim();
  const list = Array.isArray(attachments) ? attachments.filter(a => a && a.url) : [];

  if (list.length === 0) {
    return { preview: text.slice(0, MAX_PREVIEW), previewKind: 'text', previewImage: null };
  }

  const kinds = list.map(attachmentKind);
  const label = list.length === 1 ? singleLabel(kinds[0], list[0]) : multiLabel(kinds, list.length);

  const firstImageIndex = kinds.indexOf('image');
  const previewImage = firstImageIndex > -1 ? String(list[firstImageIndex].url || '') || null : null;

  // Текст (подпись к фото) важнее подписи-заглушки: если человек что-то
  // написал, в ленте должно стоять именно это. Чем было вложение, клиент
  // всё равно поймёт по previewKind и картинке.
  const preview = (text || label).slice(0, MAX_PREVIEW);
  const previewKind = list.length === 1 ? kinds[0] : (new Set(kinds).size === 1 ? kinds[0] : 'mixed');

  return { preview, previewKind, previewImage };
}

module.exports = { buildMessagePreview, attachmentKind };
