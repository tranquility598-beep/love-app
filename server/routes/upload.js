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
    if (file && file.name) {
      try {
        file.name = Buffer.from(file.name, 'latin1').toString('utf8');
      } catch (e) {}
    }
    
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const audioTypes = ['audio/webm', 'audio/ogg', 'audio/mp3', 'audio/wav'];
    const isImage = imageTypes.includes(file.mimetype);
    const isAudio = audioTypes.includes(file.mimetype);
    const isVideo = file.mimetype.startsWith('video/');
    
    let fileCategory = 'document';
    if (isImage) fileCategory = 'image';
    else if (isAudio) fileCategory = 'audio';
    else if (isVideo) fileCategory = 'video';
    
    const validation = await validateFile(file, isImage, fileCategory);
    if (!validation.valid) {
      return res.status(400).json({ 
        message: 'Ошибка валидации файла', 
        errors: validation.errors 
      });
    }
    
    const isLargeFile = file.size > 5 * 1024 * 1024;

    if (isVideo || isLargeFile) {
      // Локальное сохранение на сервере Hetzner
      const localFolder = isVideo ? 'video' : (isImage ? 'images' : 'files');
      const targetDir = path.join(__dirname, '..', 'uploads', localFolder);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const safeName = generateSafeFilename(file.name, file.mimetype);
      const targetPath = path.join(targetDir, safeName);

      await file.mv(targetPath);

      const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${localFolder}/${safeName}`;

      return res.json({
        url: fileUrl,
        filename: safeName,
        originalName: validation.sanitizedName,
        size: file.size,
        type: isVideo ? 'video' : (isAudio ? 'audio' : (isImage ? 'image' : 'file')),
        mimetype: file.mimetype,
        storage: 'local'
      });
    }

    // Загрузка в Cloudinary (изображения, аудио и файлы до 5 МБ)
    let folder = 'files';
    if (isImage) folder = 'images';
    if (isAudio) folder = 'audio';
    
    let filePath;
    if (file.tempFilePath) {
      filePath = file.tempFilePath;
    } else {
      filePath = file.data;
    }
    
    let resourceType = 'raw';
    if (file.mimetype.startsWith('image/')) {
      resourceType = 'image';
    } else if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
      resourceType = 'video';
    }
        
    let transformation = [];
    if (resourceType === 'image') {
      transformation.push({ quality: 'auto:good', fetch_format: 'auto', width: 2048, crop: 'limit' });
    }
    
    const uploadOptions = {
      folder: folder,
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true
    };
    if (transformation.length > 0) {
      uploadOptions.transformation = transformation;
    }
    
    const uploadResult = await cloudinary.uploader.upload(filePath, uploadOptions);
    
    let fileUrl = uploadResult.secure_url;
    if (resourceType === 'raw') {
      const ext = path.extname(file.name).toLowerCase();
      if (ext && !fileUrl.endsWith(ext)) {
        fileUrl = fileUrl + ext;
      }
    }
    
    res.json({
      url: fileUrl,
      filename: path.basename(uploadResult.public_id),
      originalName: validation.sanitizedName,
      size: file.size,
      type: isAudio ? 'audio' : (isImage ? 'image' : 'file'),
      mimetype: file.mimetype,
      storage: 'cloudinary'
    });
    
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ message: `Ошибка при загрузке файла: ${error.message || error}` });
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
    if (file && file.name) {
      try {
        file.name = Buffer.from(file.name, 'latin1').toString('utf8');
      } catch (e) {}
    }
    
    const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const isImage = imageTypes.includes(file.mimetype);
    const isAudio = file.mimetype.startsWith('audio/');
    const isVideo = file.mimetype.startsWith('video/');
    
    let fileCategory = 'document';
    if (isImage) fileCategory = 'image';
    else if (isAudio) fileCategory = 'audio';
    else if (isVideo) fileCategory = 'video';
    
    const validation = await validateFile(file, isImage, fileCategory);
    if (!validation.valid) {
      return res.status(400).json({ 
        message: 'Ошибка валидации файла', 
        errors: validation.errors 
      });
    }
    
    const isLargeFile = file.size > 5 * 1024 * 1024;

    if (isVideo || isLargeFile) {
      // Локальное сохранение на сервере Hetzner
      const localFolder = isVideo ? 'video' : (isImage ? 'images' : 'files');
      const targetDir = path.join(__dirname, '..', 'uploads', localFolder);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      const safeName = generateSafeFilename(file.name, file.mimetype);
      const targetPath = path.join(targetDir, safeName);

      await file.mv(targetPath);

      const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${localFolder}/${safeName}`;

      return res.json({
        url: fileUrl,
        filename: safeName,
        originalName: validation.sanitizedName,
        size: file.size,
        type: isVideo ? 'video' : (isImage ? 'image' : 'file'),
        mimetype: file.mimetype,
        storage: 'local'
      });
    }

    // Загрузка в Cloudinary (файлы до 5 МБ)
    const folder = isImage ? 'images' : 'files';
    
    let filePath;
    if (file.tempFilePath) {
      filePath = file.tempFilePath;
    } else {
      filePath = file.data;
    }
    
    let resourceType = 'raw';
    if (file.mimetype.startsWith('image/')) {
      resourceType = 'image';
    } else if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('audio/')) {
      resourceType = 'video';
    }
        
    let transformation = [];
    if (resourceType === 'image') {
      transformation.push({ quality: 'auto:good', fetch_format: 'auto', width: 2048, crop: 'limit' });
    }
    
    const uploadOptions = {
      folder: folder,
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true
    };
    if (transformation.length > 0) {
      uploadOptions.transformation = transformation;
    }
    
    const uploadResult = await cloudinary.uploader.upload(filePath, uploadOptions);
    
    let fileUrl = uploadResult.secure_url;
    if (resourceType === 'raw') {
      const ext = path.extname(file.name).toLowerCase();
      if (ext && !fileUrl.endsWith(ext)) {
        fileUrl = fileUrl + ext;
      }
    }
    
    res.json({
      url: fileUrl,
      filename: path.basename(uploadResult.public_id),
      originalName: validation.sanitizedName,
      size: file.size,
      type: isImage ? 'image' : 'file',
      mimetype: file.mimetype,
      storage: 'cloudinary'
    });
    
  } catch (error) {
    console.error('Upload file error:', error);
    res.status(500).json({ message: `Ошибка при загрузке файла: ${error.message || error}` });
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
    if (avatarFile && avatarFile.name) {
      try {
        avatarFile.name = Buffer.from(avatarFile.name, 'latin1').toString('utf8');
      } catch (e) {}
    }
    
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
