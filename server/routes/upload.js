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
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

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
    
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const audioTypes = ['audio/webm', 'audio/ogg', 'audio/mp3', 'audio/wav'];
    const isImage = imageTypes.includes(file.mimetype);
    const isAudio = audioTypes.includes(file.mimetype);
    
    const validation = await validateFile(file, isImage);
    if (!validation.valid) {
      return res.status(400).json({ 
        message: 'Ошибка валидации файла', 
        errors: validation.errors 
      });
    }
    
    let folder = 'files';
    if (isImage) folder = 'images';
    if (isAudio) folder = 'audio';
    
    let filePath;
    if (file.tempFilePath) {
      filePath = file.tempFilePath;
    } else {
      filePath = file.data;
    }
    
    const resourceType = isAudio ? 'video' : 'image';
    const uploadResult = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true
    });
    
    res.json({
      url: uploadResult.secure_url,
      filename: path.basename(uploadResult.public_id),
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
    
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const isImage = imageTypes.includes(file.mimetype);
    
    const validation = await validateFile(file, isImage);
    if (!validation.valid) {
      return res.status(400).json({ 
        message: 'Ошибка валидации файла', 
        errors: validation.errors 
      });
    }
    
    const folder = isImage ? 'images' : 'files';
    
    let filePath;
    if (file.tempFilePath) {
      filePath = file.tempFilePath;
    } else {
      filePath = file.data;
    }
    
    const uploadResult = await cloudinary.uploader.upload(filePath, {
      folder: folder,
      resource_type: 'image',
      use_filename: true,
      unique_filename: true
    });
    
    res.json({
      url: uploadResult.secure_url,
      filename: path.basename(uploadResult.public_id),
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
    
    const validation = await validateFile(avatarFile, true);
    if (!validation.valid) {
      return res.status(400).json({ 
        message: 'Ошибка валидации аватара', 
        errors: validation.errors 
      });
    }
    
    const ext = path.extname(validation.sanitizedName);
    const publicId = `avatars/avatar_${req.user._id}_${Date.now()}`;
    
    let filePath;
    if (avatarFile.tempFilePath) {
      filePath = avatarFile.tempFilePath;
    } else {
      filePath = avatarFile.data;
    }
    
    const uploadResult = await cloudinary.uploader.upload(filePath, {
      folder: 'avatars',
      public_id: publicId,
      resource_type: 'image',
      transformation: [{ width: 200, height: 200, crop: 'fill', radius: 'max' }]
    });
    
    res.json({
      url: uploadResult.secure_url,
      filename: path.basename(uploadResult.public_id)
    });
    
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ message: 'Ошибка при загрузке аватара' });
  }
});

module.exports = router;
