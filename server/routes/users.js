/**
 * Роуты пользователей
 * Профиль, поиск, обновление данных
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const path = require('path');
const fs = require('fs');

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
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { username, bio, customStatus } = req.body;
    
    const updateData = {};
    
    if (username) {
      if (username.length < 2 || username.length > 32) {
        return res.status(400).json({ message: 'Имя пользователя должно быть от 2 до 32 символов' });
      }
      
      // Проверяем уникальность имени
      const existingUser = await User.findOne({ username, _id: { $ne: req.user._id } });
      if (existingUser) {
        return res.status(400).json({ message: 'Имя пользователя уже занято' });
      }
      
      updateData.username = username;
    }
    
    if (bio !== undefined) updateData.bio = bio;
    if (customStatus !== undefined) updateData.customStatus = customStatus;
    
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
    
    // Проверяем тип файла
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(avatarFile.mimetype)) {
      return res.status(400).json({ message: 'Допустимые форматы: JPEG, PNG, GIF, WebP' });
    }
    
    // Проверяем размер (5MB)
    if (avatarFile.size > 5 * 1024 * 1024) {
      return res.status(400).json({ message: 'Размер файла не должен превышать 5MB' });
    }
    
    // Сохраняем файл
    const ext = path.extname(avatarFile.name);
    const filename = `avatar_${req.user._id}_${Date.now()}${ext}`;
    const uploadPath = path.join(__dirname, '..', 'uploads', 'avatars', filename);
    
    await avatarFile.mv(uploadPath);
    
    // Удаляем старый аватар если есть
    const oldUser = await User.findById(req.user._id);
    if (oldUser.avatar && oldUser.avatar.includes('/uploads/avatars/')) {
      const oldPath = path.join(__dirname, '..', oldUser.avatar.replace('/uploads/', 'uploads/'));
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }
    
    // Обновляем URL аватара
    const avatarUrl = `/uploads/avatars/${filename}`;
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: avatarUrl },
      { new: true }
    ).select('-password');
    
    res.json({ user, message: 'Аватар обновлен' });
    
  } catch (error) {
    console.error('Update avatar error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
