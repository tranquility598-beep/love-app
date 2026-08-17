/**
 * Нормализация вложений, пришедших от клиента вместе с сообщением.
 *
 * Файл клиент загружает отдельным запросом (POST /upload) и присылает уже
 * готовые ссылки. Раньше эта функция жила только в socketHandler.js, из-за чего
 * REST-путь (POST /messages/:channelId) вообще не умел принимать вложения:
 * мобильный клиент, потеряв сокет, не мог отправить голосовое и падал с
 * «Нет realtime-соединения для отправки файла».
 */
function normalizeMessageAttachments(raw) {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .map((a) => ({
      filename: a.filename || a.name || 'file',
      originalName: a.originalName || a.name || 'file',
      url: a.url,
      size: typeof a.size === 'number' ? a.size : 0,
      type: a.type || (a.mimetype && String(a.mimetype).startsWith('audio') ? 'audio' : 'file'),
      mimetype: a.mimetype || undefined,
      width: a.width,
      height: a.height
    }))
    .filter((a) => a && a.url);
}

module.exports = { normalizeMessageAttachments };
