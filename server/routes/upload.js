/**
 * Роуты загрузки файлов
 * Загрузка изображений и файлов в чат
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const authMiddleware = require('../middleware/auth');

/**
 * POST /api/upload/file
 * Загрузить файл или изображение
 */
router.post('/file', authMiddleware, async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ message: 'Файл не предоставлен' });
    }
    
    const file = req.files.file;
    
    // Проверяем размер (50MB)
    if (file.size > 50 * 1024 * 1024) {
      return res.status(400).json({ message: 'Размер файла не должен превышать 50MB' });
    }
    
    // Определяем тип файла
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
    const isImage = imageTypes.includes(file.mimetype);
    
    // Определяем папку для сохранения
    const folder = isImage ? 'images' : 'files';
    
    // Генерируем уникальное имя файла
    const ext = path.extname(file.name);
    const filename = `${Date.now()}_${Math.random().toString(36).substring(7)}${ext}`;
    const uploadPath = path.join(__dirname, '..', 'uploads', folder, filename);
    
    await file.mv(uploadPath);
    
    const fileUrl = `/uploads/${folder}/${filename}`;
    
    res.json({
      url: fileUrl,
      filename: filename,
      originalName: file.name,
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
router.post('/avatar', authMiddleware, async (req, res) => {
  try {
    if (!req.files || !req.files.avatar) {
      return res.status(400).json({ message: 'Файл аватара не предоставлен' });
    }
    
    const avatarFile = req.files.avatar;
    
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(avatarFile.mimetype)) {
      return res.status(400).json({ message: 'Допустимые форматы: JPEG, PNG, GIF, WebP' });
    }
    
    if (avatarFile.size > 5 * 1024 * 1024) {
      return res.status(400).json({ message: 'Размер файла не должен превышать 5MB' });
    }
    
    const ext = path.extname(avatarFile.name);
    const filename = `avatar_${req.user._id}_${Date.now()}${ext}`;
    const uploadPath = path.join(__dirname, '..', 'uploads', 'avatars', filename);
    
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
