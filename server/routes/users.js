/**
 * Роуты пользователей
 * Профиль, поиск, обновление данных
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { validateBio, validateCustomStatus, validateUsername, sanitizeBody } = require('../middleware/validation');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

const USERNAME_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * GET /api/users/search
 * Поиск пользователей по имени
 */
router.get('/search', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ message: 'Запрос должен содержать минимум 2 символа' });
    }
    
    const users = await User.find({
      username: { $regex: q, $options: 'i' },
      _id: { $ne: req.user._id } // Исключаем себя
    })
    .select('username avatar status discriminator')
    .limit(20);
    
    res.json({ users });
    
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * GET /api/users/:id
 * Получить профиль пользователя
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.params.id)
      .select('-password -email -friendRequestsReceived -friendRequestsSent -blockedUsers -settings');
    
    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    
    res.json({ user });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * PUT /api/users/profile
 * Обновить профиль пользователя
 */
router.put('/profile', authMiddleware, sanitizeBody, validateUsername, async (req, res) => {
  try {
    const { username, bio, customStatus, profileColor } = req.body;
    
    const updateData = {};
    
    if (username && username !== req.user.username) {
      const nextUsername = String(username).trim();
      if (nextUsername.length < 2 || nextUsername.length > 32) {
        return res.status(400).json({ message: 'Имя пользователя должно быть от 2 до 32 символов' });
      }

      if (req.user.usernameChangedAt && Date.now() - new Date(req.user.usernameChangedAt).getTime() < USERNAME_CHANGE_COOLDOWN_MS) {
        const availableAt = new Date(new Date(req.user.usernameChangedAt).getTime() + USERNAME_CHANGE_COOLDOWN_MS);
        return res.status(429).json({
          message: `Имя пользователя можно менять раз в 7 дней. Следующая смена доступна ${availableAt.toLocaleString('ru-RU')}`,
          availableAt
        });
      }
      
      // Проверяем уникальность имени
      const existingUser = await User.findOne({ username: nextUsername, _id: { $ne: req.user._id } });
      if (existingUser) {
        return res.status(400).json({ message: 'Имя пользователя уже занято' });
      }
      
      updateData.username = nextUsername;
      updateData.usernameChangedAt = new Date();
    }
    
    if (bio !== undefined) updateData.bio = bio;
    if (customStatus !== undefined) updateData.customStatus = customStatus;

    // Цвет баннера/профиля — принимаем ТОЛЬКО hex #RRGGBB или #RGB.
    // Никаких url(), gradient, expression, var() и т.п. — защита от
    // CSS-инъекций, т.к. это значение потом подставляется в стили на UI.
    if (profileColor !== undefined) {
      const c = String(profileColor).trim();
      if (c === '') {
        updateData.profileColor = '#5865F2'; // дефолт
      } else if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) {
        updateData.profileColor = c;
      } else {
        return res.status(400).json({ message: 'Некорректный цвет профиля' });
      }
    }
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    ).select('-password');
    
    res.json({ user, message: 'Профиль обновлен' });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * PUT /api/users/avatar
 * Обновить аватар пользователя
 */
router.put('/avatar', authMiddleware, async (req, res) => {
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
    
    const oldUser = await User.findById(req.user._id);
    if (oldUser.avatar && oldUser.avatar.includes('cloudinary.com')) {
      const publicIdMatch = oldUser.avatar.match(/\/v\d+\/(.+)\./);
      if (publicIdMatch) {
        try {
          await cloudinary.uploader.destroy(publicIdMatch[1]);
        } catch (e) {}
      }
    }
    
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: uploadResult.secure_url },
      { new: true }
    ).select('-password');
    
    res.json({ user, message: 'Аватар обновлен' });
    
  } catch (error) {
    console.error('Update avatar error:', error);
    console.error('Update avatar error details:', error.stack);
    res.status(500).json({ message: 'Ошибка при загрузке аватара' });
  }
});

module.exports = router;
