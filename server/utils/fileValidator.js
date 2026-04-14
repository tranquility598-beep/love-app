/**
 * File Validator Utility
 * Проверка безопасности загружаемых файлов
 */

const path = require('path');

// Magic bytes для проверки типов файлов
const MAGIC_BYTES = {
  'image/jpeg': [[0xFF, 0xD8, 0xFF]],
  'image/png': [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38, 0x37, 0x61], [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]], // GIF87a, GIF89a
  'image/webp': [[0x52, 0x49, 0x46, 0x46]], // RIFF
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]]
};

// Whitelist расширений
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_FILE_EXTENSIONS = [
  '.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', 
  '.zip', '.rar', '.7z',
  '.mp3', '.wav', '.ogg',
  '.mp4', '.mov', '.avi', '.webm'
];

// Максимальные размеры
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Проверка magic bytes файла
 */
function checkMagicBytes(buffer, mimetype) {
  const signatures = MAGIC_BYTES[mimetype];
  if (!signatures) return true; // Если нет в списке - пропускаем проверку
  
  for (const signature of signatures) {
    let match = true;
    for (let i = 0; i < signature.length; i++) {
      if (buffer[i] !== signature[i]) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  
  return false;
}

/**
 * Валидация имени файла (защита от path traversal)
 */
function sanitizeFilename(filename) {
  if (!filename) return 'file';
  
  // Убираем путь, оставляем только имя файла
  let basename = path.basename(filename);
  
  // Убираем опасные символы и path traversal попытки
  basename = basename.replace(/\.\./g, '');
  basename = basename.replace(/[<>:"|?*\x00-\x1f]/g, '_');
  basename = basename.replace(/^\.+/, ''); // Убираем точки в начале
  
  // Ограничиваем длину
  if (basename.length > 255) {
    const ext = path.extname(basename);
    const name = basename.substring(0, 255 - ext.length);
    basename = name + ext;
  }
  
  return basename || 'file';
}

/**
 * Проверка расширения файла
 */
function isAllowedExtension(filename, isImage) {
  const ext = path.extname(filename).toLowerCase();
  
  if (!ext) return false;
  
  const allowedList = isImage 
    ? ALLOWED_IMAGE_EXTENSIONS 
    : [...ALLOWED_IMAGE_EXTENSIONS, ...ALLOWED_FILE_EXTENSIONS];
  
  return allowedList.includes(ext);
}

/**
 * Проверка MIME type
 */
function isAllowedMimeType(mimetype, isImage) {
  const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const allowedFileTypes = [
    ...allowedImageTypes,
    'application/pdf',
    'text/plain',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
    'video/mp4',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm'
  ];
  
  const allowedList = isImage ? allowedImageTypes : allowedFileTypes;
  return allowedList.includes(mimetype);
}

/**
 * Полная валидация файла
 */
async function validateFile(file, isImage = false) {
  const errors = [];
  
  if (!file || !file.data) {
    errors.push('Файл не предоставлен');
    return { valid: false, errors, sanitizedName: '' };
  }
  
  // Проверка расширения
  if (!isAllowedExtension(file.name, isImage)) {
    errors.push('Недопустимый тип файла');
  }
  
  // Проверка MIME type
  if (!isAllowedMimeType(file.mimetype, isImage)) {
    errors.push('Недопустимый MIME тип файла');
  }
  
  // Проверка magic bytes
  const buffer = file.data;
  if (buffer && buffer.length > 0) {
    if (!checkMagicBytes(buffer, file.mimetype)) {
      errors.push('Содержимое файла не соответствует заявленному типу');
    }
  }
  
  // Проверка размера
  const maxSize = isImage ? MAX_IMAGE_SIZE : MAX_FILE_SIZE;
  if (file.size > maxSize) {
    const maxSizeMB = maxSize / (1024 * 1024);
    errors.push(`Размер файла превышает ${maxSizeMB}MB`);
  }
  
  // Проверка минимального размера (защита от пустых файлов)
  if (file.size < 1) {
    errors.push('Файл пустой');
  }
  
  // Санитизация имени
  const sanitizedName = sanitizeFilename(file.name);
  
  return {
    valid: errors.length === 0,
    errors,
    sanitizedName
  };
}

/**
 * Генерация безопасного имени файла
 */
function generateSafeFilename(originalName) {
  const sanitized = sanitizeFilename(originalName);
  const ext = path.extname(sanitized);
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 10);
  
  return `${timestamp}_${random}${ext}`;
}

module.exports = {
  validateFile,
  sanitizeFilename,
  isAllowedExtension,
  isAllowedMimeType,
  checkMagicBytes,
  generateSafeFilename,
  MAX_IMAGE_SIZE,
  MAX_FILE_SIZE
};
