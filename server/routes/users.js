/**
 * Роуты пользователей
 * Профиль, поиск, обновление данных
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { findUserByUsername, getDuplicateField } = require('../utils/username');
const authMiddleware = require('../middleware/auth');
const { validateBio, validateCustomStatus, validateUsername, validateEmail, sanitizeBody, sanitizeString } = require('../middleware/validation');
const path = require('path');
const fs = require('fs');
const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

const USERNAME_CHANGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function buildPublicUser(user) {
  return {
    ...user.toPublicJSON(),
    hasPassword: Boolean(user.password),
    hasGoogle: Boolean(user.googleId)
  };
}

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
    
    res.json({ user: user.toPublicJSON() });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * PUT /api/users/profile
 * Обновить профиль пользователя (публичная часть, без пароля)
 */
router.put('/profile', authMiddleware, sanitizeBody, async (req, res) => {
  try {
    const { nickname, bio, customStatus, mood, hobbies, listening, music } = req.body;

    const updateData = {};

    if (nickname !== undefined) {
      const nextNickname = String(nickname).trim();
      if (nextNickname.length > 32) {
        return res.status(400).json({ message: 'Отображаемое имя должно быть не более 32 символов' });
      }
      updateData.nickname = nextNickname;
    }

    if (bio !== undefined) updateData.bio = bio;
    if (customStatus !== undefined) updateData.customStatus = customStatus;

    // Настроение (mood) — короткая строка-идентификатор иконки настроения
    if (mood !== undefined) {
      updateData.mood = sanitizeString(String(mood)).slice(0, 32);
    }

    // Сейчас слушает (listening) — строка "Исполнитель - Трек"
    if (listening !== undefined) {
      updateData.listening = sanitizeString(String(listening)).slice(0, 120);
    }

    // Музыка профиля: { url (Cloudinary), title }. Пустой объект сбрасывает.
    if (music !== undefined) {
      if (music === null || music === '') {
        updateData.music = { url: '', title: '' };
      } else if (typeof music === 'object') {
        const url = sanitizeString(String(music.url || '')).slice(0, 500);
        // Принимаем только https-ссылки (Cloudinary) — без javascript:/data: и пр.
        const safeUrl = /^https:\/\//i.test(url) ? url : '';
        updateData.music = {
          url: safeUrl,
          title: sanitizeString(String(music.title || '')).slice(0, 120)
        };
      }
    }

    // Увлечения (hobbies) — максимум 5, каждое { text (≤20), icon }
    if (hobbies !== undefined) {
      if (!Array.isArray(hobbies)) {
        return res.status(400).json({ message: 'Некорректный формат увлечений' });
      }
      updateData.hobbies = hobbies
        .slice(0, 5)
        .map(h => ({
          text: sanitizeString(String(h?.text ?? '')).trim().slice(0, 20),
          icon: sanitizeString(String(h?.icon ?? '')).slice(0, 32)
        }))
        .filter(h => h.text.length > 0);
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true }
    ).select('+password');
    
    res.json({ user: buildPublicUser(user), message: 'Профиль обновлен' });
    
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * PUT /api/users/account
 * Обновить данные аккаунта (системная часть, требует пароль)
 */
router.put('/account', authMiddleware, sanitizeBody, validateUsername, validateEmail, async (req, res) => {
  try {
    const { username, email, currentPassword } = req.body;
    
    const updateData = {};
    let isUsernameChanged = false;
    let isEmailChanged = false;

    // Проверяем пароль перед любыми изменениями аккаунта
    const currentUser = await User.findById(req.user._id).select('+password');
    if (!currentUser) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (currentUser.password) {
      if (!currentPassword) {
        return res.status(400).json({ message: 'Для изменения настроек аккаунта введите текущий пароль' });
      }
      const isPasswordValid = await currentUser.comparePassword(currentPassword);
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'Неверный текущий пароль' });
      }
    }

    // Обработка смены username
    if (username && username !== req.user.username) {
      const nextUsername = String(username).trim();
      if (nextUsername.length < 2 || nextUsername.length > 32) {
        return res.status(400).json({ message: 'Имя пользователя должно быть от 2 до 32 символов' });
      }

      // Защита от частой смены имени (7 дней cooldown)
      if (req.user.usernameChangedAt && Date.now() - new Date(req.user.usernameChangedAt).getTime() < USERNAME_CHANGE_COOLDOWN_MS) {
        const availableAt = new Date(new Date(req.user.usernameChangedAt).getTime() + USERNAME_CHANGE_COOLDOWN_MS);
        return res.status(429).json({
          message: `Имя пользователя можно менять раз в 7 дней. Следующая смена доступна ${availableAt.toLocaleString('ru-RU')}`,
          availableAt
        });
      }

      // Проверяем уникальность имени
      const existingUser = await findUserByUsername(User, nextUsername, req.user._id);
      if (existingUser) {
        return res.status(400).json({ message: 'Имя пользователя уже занято' });
      }

      updateData.username = nextUsername;
      updateData.usernameChangedAt = new Date();
      isUsernameChanged = true;
    }

    // Обработка смены email
    if (email && email.toLowerCase() !== req.user.email.toLowerCase()) {
      const nextEmail = String(email).trim().toLowerCase();
      
      // Проверяем уникальность email
      const existingUser = await User.findOne({ email: nextEmail, _id: { $ne: req.user._id } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email уже зарегистрирован на другого пользователя' });
      }

      updateData.email = nextEmail;
      isEmailChanged = true;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Нет изменений для сохранения' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user._id,
      updateData,
      { new: true, runValidators: true }
    ).select('+password');

    let msg = 'Настройки аккаунта обновлены';
    if (isUsernameChanged && isEmailChanged) {
      msg = 'Имя пользователя и email успешно изменены';
    } else if (isUsernameChanged) {
      msg = 'Имя пользователя изменено';
    } else if (isEmailChanged) {
      msg = 'Email успешно изменен';
    }

    res.json({ user: buildPublicUser(updatedUser), message: msg });
  } catch (error) {
    console.error('Update account error:', error);
    if (getDuplicateField(error) === 'username') {
      return res.status(400).json({ message: 'Имя пользователя уже занято' });
    }
    res.status(500).json({ message: 'Ошибка сервера при обновлении настроек аккаунта' });
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

/**
 * POST /api/users/report
 * Создать новую жалобу (Report)
 */
router.post('/report', authMiddleware, async (req, res) => {
  try {
    const { reportedUser, targetUsername, reason, description } = req.body;
    
    if (!reason || !description) {
      return res.status(400).json({ message: 'Причина и описание обязательны' });
    }
    
    const validReasons = ['spam', 'harassment', 'inappropriate_content', 'violence', 'other'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ message: 'Некорректная причина жалобы' });
    }
    
    let offenderId = reportedUser || null;
    
    if (targetUsername && !offenderId) {
      const cleanUsername = targetUsername.startsWith('@') ? targetUsername.substring(1) : targetUsername;
      // Экранируем символы регулярных выражений для безопасности
      const escapedUsername = cleanUsername.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const targetUser = await User.findOne({ username: { $regex: new RegExp("^" + escapedUsername + "$", "i") } });
      if (targetUser) {
        offenderId = targetUser._id;
      }
    }
    
    const Report = require('../models/Report');
    const newReport = new Report({
      reporter: req.user._id,
      reportedUser: offenderId,
      reason,
      description: targetUsername ? `[Жалоба на ${targetUsername}]: ${description}` : description
    });
    
    await newReport.save();

    const Case = require('../models/Case');
    await Case.findOneAndUpdate(
      { sourceReport: newReport._id },
      {
        $setOnInsert: {
          kind: 'report',
          reporter: req.user._id,
          subjectUser: offenderId || undefined,
          title: `Жалоба: ${reason}`,
          description: newReport.description,
          priority: 'high',
          sourceReport: newReport._id,
          tags: [reason, 'legacy-api'],
          activity: [{ actor: req.user._id, action: 'created_via_legacy_api' }]
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    
    const io = req.app.get('io');
    if (io) {
      io.emit('admin:new_report', {
        _id: newReport._id,
        reporter: { _id: req.user._id, username: req.user.username, avatar: req.user.avatar },
        reason,
        createdAt: newReport.createdAt
      });
    }
    
    res.status(201).json({ message: 'Жалоба успешно отправлена и будет рассмотрена модераторами' });
  } catch (error) {
    console.error('Create report error:', error);
    res.status(500).json({ message: 'Ошибка сервера при отправке жалобы' });
  }
});

module.exports = router;
