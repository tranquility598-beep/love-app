/**
 * Роуты загрузки файлов
 * Загрузка изображений и файлов в чат
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const { validateFile, generateSafeFilename } = require('../utils/fileValidator');

/**
 * POST /api/upload
 * Универсальный роут для загрузки файлов (алиас для /file)
 */
router.post('/', authMiddleware, uploadLimiter, async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ message: 'Файл не предоставлен' });
    }
    
    const file = req.files.file;
    
    // Определяем тип
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const audioTypes = ['audio/webm', 'audio/ogg', 'audio/mp3', 'audio/wav'];
    const isImage = imageTypes.includes(file.mimetype);
    const isAudio = audioTypes.includes(file.mimetype);
    
    // ВАЛИДАЦИЯ
    const validation = await validateFile(file, isImage);
    if (!validation.valid) {
      return res.status(400).json({ 
        message: 'Ошибка валидации файла', 
        errors: validation.errors 
      });
    }
    
    // Используем безопасное имя
    let folder = 'files';
    if (isImage) folder = 'images';
    if (isAudio) folder = 'audio';
    
    const filename = generateSafeFilename(validation.sanitizedName);
    const uploadPath = path.join(__dirname, '..', 'uploads', folder, filename);
    
    // Проверяем что папка существует
    const folderPath = path.join(__dirname, '..', 'uploads', folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    
    await file.mv(uploadPath);
    
    const fileUrl = `/uploads/${folder}/${filename}`;
    
    res.json({
      url: fileUrl,
      filename: filename,
      originalName: validation.sanitizedName,
      size: file.size,
      type: isAudio ? 'audio' : (isImage ? 'image' : 'file'),
      mimetype: file.mimetype
    });
    
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ message: 'Ошибка при загрузке файла' });
  }
});

/**
 * POST /api/upload/file
 * Загрузить файл или изображение
 */
router.post('/file', authMiddleware, uploadLimiter, async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ message: 'Файл не предоставлен' });
    }
    
    const file = req.files.file;
    
    // Определяем тип
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const isImage = imageTypes.includes(file.mimetype);
    
    // ВАЛИДАЦИЯ
    const validation = await validateFile(file, isImage);
    if (!validation.valid) {
      return res.status(400).json({ 
        message: 'Ошибка валидации файла', 
        errors: validation.errors 
      });
    }
    
    // Используем безопасное имя
    const folder = isImage ? 'images' : 'files';
    const filename = generateSafeFilename(validation.sanitizedName);
    const uploadPath = path.join(__dirname, '..', 'uploads', folder, filename);
    
    // Проверяем что папка существует
    const folderPath = path.join(__dirname, '..', 'uploads', folder);
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    
    await file.mv(uploadPath);
    
    const fileUrl = `/uploads/${folder}/${filename}`;
    
    res.json({
      url: fileUrl,
      filename: filename,
      originalName: validation.sanitizedName,
      size: file.size,
      type: isImage ? 'image' : 'file',
      mimetype: file.mimetype
    });
    
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ message: 'Ошибка при загрузке файла' });
  }
});

/**
 * POST /api/upload/avatar
 * Загрузить аватар
 */
router.post('/avatar', authMiddleware, uploadLimiter, async (req, res) => {
  try {
    if (!req.files || !req.files.avatar) {
      return res.status(400).json({ message: 'Файл аватара не предоставлен' });
    }
    
    const avatarFile = req.files.avatar;
    
    // ВАЛИДАЦИЯ
    const validation = await validateFile(avatarFile, true);
    if (!validation.valid) {
      return res.status(400).json({ 
        message: 'Ошибка валидации аватара', 
        errors: validation.errors 
      });
    }
    
    const ext = path.extname(validation.sanitizedName);
    const filename = `avatar_${req.user._id}_${Date.now()}${ext}`;
    const uploadPath = path.join(__dirname, '..', 'uploads', 'avatars', filename);
    
    // Проверяем что папка существует
    const folderPath = path.join(__dirname, '..', 'uploads', 'avatars');
    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }
    
    await avatarFile.mv(uploadPath);
    
    res.json({
      url: `/uploads/avatars/${filename}`,
      filename
    });
    
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ message: 'Ошибка при загрузке аватара' });
  }
});

module.exports = router;
