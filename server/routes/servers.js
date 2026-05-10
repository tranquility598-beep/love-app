/**
 * Роуты серверов
 * Создание, управление серверами и инвайтами
 */

const express = require('express');
const router = express.Router();
const Server = require('../models/Server');
const Channel = require('../models/Channel');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');
const { validateServerName, sanitizeBody } = require('../middleware/validation');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const emojiUploadRoot = path.join(__dirname, '..', 'uploads');

// Настройка multer для загрузки эмодзи
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      fs.mkdirSync(emojiUploadRoot, { recursive: true });
      cb(null, emojiUploadRoot);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'emoji-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Только изображения разрешены (jpeg, jpg, png, gif, webp)'));
    }
  }
});

/**
 * GET /api/servers
 * Получить все серверы пользователя
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    // Фильтруем null/undefined и оставляем только ObjectID перед поиском
    const validServerIds = (user.servers || []).filter(id => id != null);
    
    const servers = await Server.find({ _id: { $in: validServerIds } })
      .populate('channels', 'name type position category')
      .populate('members.user', 'username avatar status discriminator');
    
    res.json({ servers });
    
  } catch (error) {
    console.error('Get servers error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/servers
 * Создать новый сервер
 */
router.post('/', authMiddleware, sanitizeBody, validateServerName, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name || name.length < 2) {
      return res.status(400).json({ message: 'Название сервера должно содержать минимум 2 символа' });
    }
    
    // Создаем роли
    const mongoose = require('mongoose');
    const ownerRoleId = new mongoose.Types.ObjectId();
    const adminRoleId = new mongoose.Types.ObjectId();
    const memberRoleId = new mongoose.Types.ObjectId();
    
    // Создаем сервер
    const server = new Server({
      name,
      description: description || '',
      owner: req.user._id,
      members: [{
        user: req.user._id,
        roles: [ownerRoleId, adminRoleId, memberRoleId]
      }],
      roles: [
        { 
          _id: ownerRoleId,
          name: 'Владелец', 
          color: '#f1c40f', 
          permissions: {
            administrator: true,
            manageServer: true,
            manageRoles: true,
            manageChannels: true,
            kickMembers: true,
            banMembers: true,
            manageMessages: true,
            sendMessages: true,
            readMessages: true,
            mentionEveryone: true,
            manageNicknames: true,
            connect: true,
            speak: true,
            muteMembers: true,
            deafenMembers: true
          },
          position: 100,
          hoist: true
        },
        { 
          _id: adminRoleId,
          name: 'Администратор', 
          color: '#e74c3c', 
          permissions: {
            manageChannels: true,
            manageMessages: true,
            kickMembers: true,
            sendMessages: true,
            readMessages: true,
            connect: true,
            speak: true
          },
          position: 50,
          hoist: true
        },
        { 
          _id: memberRoleId,
          name: 'Участник', 
          color: '#99aab5', 
          permissions: {
            sendMessages: true,
            readMessages: true,
            connect: true,
            speak: true
          },
          position: 0
        }
      ]
    });
    
    // Создаем дефолтные каналы
    const generalChannel = new Channel({
      name: 'general',
      type: 'text',
      topic: 'Общий канал',
      server: server._id,
      position: 0
    });
    
    const voiceChannel = new Channel({
      name: 'Голосовой',
      type: 'voice',
      server: server._id,
      position: 1
    });
    
    await generalChannel.save();
    await voiceChannel.save();
    
    server.channels = [generalChannel._id, voiceChannel._id];
    server.categories = [
      {
        name: 'ТЕКСТОВЫЕ КАНАЛЫ',
        position: 0,
        channels: [generalChannel._id]
      },
      {
        name: 'ГОЛОСОВЫЕ КАНАЛЫ',
        position: 1,
        channels: [voiceChannel._id]
      }
    ];
    
    // Создаем инвайт-ссылку
    const inviteCode = uuidv4().substring(0, 8).toUpperCase();
    server.invites = [{
      code: inviteCode,
      createdBy: req.user._id
    }];
    
    await server.save();
    
    // Добавляем сервер пользователю
    await User.findByIdAndUpdate(req.user._id, {
      $push: { servers: server._id }
    });
    
    // Возвращаем сервер с заполненными данными
    const populatedServer = await Server.findById(server._id)
      .populate('channels', 'name type position topic category')
      .populate('members.user', 'username avatar status discriminator')
      .populate('owner', 'username avatar');
    
    res.status(201).json({ server: populatedServer, message: 'Сервер создан' });
    
  } catch (error) {
    console.error('Create server error:', error);
    res.status(500).json({ message: 'Ошибка при создании сервера' });
  }
});

/**
 * ============================================================
 * ROOMS (комнаты) — упрощённый профиль Server (settings.kind='room').
 *
 * ВАЖНО ПО ПОРЯДКУ РОУТОВ:
 * Эти статические роуты ОБЯЗАТЕЛЬНО объявлены ВЫШЕ динамических
 * '/:id', '/:id/...' иначе Express воспримет 'rooms' как :id.
 *
 * Старые server endpoints НЕ изменены и продолжают работать.
 * Комната — это тот же документ Server, просто с settings.kind='room'
 * и ровно двумя каналами: 1 text (для вкладки Чат) + 1 voice
 * (для вкладки Войс). Вкладка Медиа — виртуальная (на фронте).
 * ============================================================
 */

/**
 * GET /api/servers/rooms
 * Список только комнат текущего пользователя.
 * Старый GET /api/servers продолжает возвращать ВСЁ (и серверы, и комнаты),
 * чтобы не ломать legacy UI.
 */
router.get('/rooms', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const validIds = (user.servers || []).filter(id => id != null);

    const rooms = await Server.find({
      _id: { $in: validIds },
      'settings.kind': 'room'
    })
      .populate('channels', 'name type position category')
      .populate('members.user', 'username avatar status discriminator');

    res.json({ rooms });
  } catch (error) {
    console.error('Get rooms error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/servers/rooms
 * Создать комнату: 1 text channel + 1 voice channel, без категорий.
 */
router.post('/rooms', authMiddleware, sanitizeBody, validateServerName, async (req, res) => {
  // Создаваемые каналы трекаем во внешней области, чтобы при любом
  // последующем сбое (room.save / User.findByIdAndUpdate / populate)
  // удалить их и не оставить orphan-документы.
  // Полноценная MongoDB-транзакция требует replica set, которого нет
  // в типичной dev/standalone установке, поэтому используем cleanup-rollback.
  let textChannel = null;
  let voiceChannel = null;
  let savedRoomId = null;

  try {
    const { name, description } = req.body;

    if (!name || name.length < 2) {
      return res.status(400).json({ message: 'Название комнаты должно содержать минимум 2 символа' });
    }

    const mongoose = require('mongoose');
    const ownerRoleId = new mongoose.Types.ObjectId();
    const memberRoleId = new mongoose.Types.ObjectId();

    const room = new Server({
      name,
      description: description || '',
      owner: req.user._id,
      members: [{
        user: req.user._id,
        roles: [ownerRoleId, memberRoleId]
      }],
      roles: [
        {
          _id: ownerRoleId,
          name: 'Владелец',
          color: '#f1c40f',
          permissions: {
            administrator: true, manageServer: true, manageRoles: true, manageChannels: true,
            kickMembers: true, banMembers: true, manageMessages: true, sendMessages: true,
            readMessages: true, mentionEveryone: true, manageNicknames: true,
            connect: true, speak: true, muteMembers: true, deafenMembers: true
          },
          position: 100,
          hoist: true
        },
        {
          _id: memberRoleId,
          name: 'Участник',
          color: '#99aab5',
          permissions: {
            sendMessages: true, readMessages: true, connect: true, speak: true
          },
          position: 0
        }
      ],
      settings: { kind: 'room' }
    });

    // 1 text-канал для вкладки Чат
    textChannel = new Channel({
      name: 'chat',
      type: 'text',
      topic: 'Чат комнаты',
      server: room._id,
      position: 0
    });

    // 1 voice-канал для вкладки Войс
    voiceChannel = new Channel({
      name: 'voice',
      type: 'voice',
      server: room._id,
      position: 1
    });

    await textChannel.save();
    await voiceChannel.save();

    room.channels = [textChannel._id, voiceChannel._id];

    // Инвайт-код переиспользует существующий механизм (POST /join/:code)
    const inviteCode = uuidv4().substring(0, 8).toUpperCase();
    room.invites = [{ code: inviteCode, createdBy: req.user._id }];

    await room.save();
    savedRoomId = room._id;

    await User.findByIdAndUpdate(req.user._id, {
      $push: { servers: room._id }
    });

    const populatedRoom = await Server.findById(room._id)
      .populate('channels', 'name type position topic category')
      .populate('members.user', 'username avatar status discriminator')
      .populate('owner', 'username avatar');

    res.status(201).json({
      room: populatedRoom,
      textChannelId: textChannel._id,
      voiceChannelId: voiceChannel._id,
      message: 'Комната создана'
    });
  } catch (error) {
    console.error('Create room error:', error);

    // Cleanup-rollback: удаляем уже созданные документы, чтобы не оставлять orphan.
    // Ошибки cleanup'а логируем, но клиенту отдаём исходную ошибку.
    try {
      if (textChannel && textChannel._id) {
        await Channel.deleteOne({ _id: textChannel._id });
      }
      if (voiceChannel && voiceChannel._id) {
        await Channel.deleteOne({ _id: voiceChannel._id });
      }
      if (savedRoomId) {
        await Server.deleteOne({ _id: savedRoomId });
        // Если успели запушить в User.servers — откатываем и это
        await User.findByIdAndUpdate(req.user._id, {
          $pull: { servers: savedRoomId }
        });
      }
    } catch (cleanupErr) {
      console.error('Create room cleanup failed:', cleanupErr);
    }

    res.status(500).json({ message: 'Ошибка при создании комнаты' });
  }
});

/**
 * GET /api/servers/:id
 * Получить данные сервера
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id)
      .populate('channels', 'name type position topic settings category')
      .populate('members.user', 'username avatar status discriminator customStatus')
      .populate('owner', 'username avatar');
    
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    // Проверяем что пользователь является участником
    const isMember = server.members.some(m => m.user._id.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ message: 'Вы не являетесь участником этого сервера' });
    }
    
    res.json({ server });
    
  } catch (error) {
    console.error('Get server error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * PUT /api/servers/:id
 * Обновить данные сервера
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, description, vibeStatus, color } = req.body;
    
    const server = await Server.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    // Проверяем права (только владелец или админ)
    if (server.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Недостаточно прав' });
    }
    
    if (name) {
      const trimmed = String(name).trim();
      if (trimmed.length < 2 || trimmed.length > 100) {
        return res.status(400).json({ message: 'Название должно быть от 2 до 100 символов' });
      }
      server.name = trimmed;
    }
    if (description !== undefined) {
      const desc = String(description);
      if (desc.length > 500) {
        return res.status(400).json({ message: 'Описание слишком длинное' });
      }
      server.description = desc;
    }

    // Поля комнаты — применяем только если это действительно комната.
    // Guild-серверы продолжают игнорировать эти поля и работают как раньше.
    if (server.settings && server.settings.kind === 'room') {
      if (vibeStatus !== undefined) {
        const v = String(vibeStatus).trim();
        if (v.length > 60) {
          return res.status(400).json({ message: 'Вайб статус слишком длинный' });
        }
        server.settings.vibeStatus = v;
      }
      if (color !== undefined) {
        const c = String(color).trim();
        // Принимаем только пустую строку или hex #rgb / #rrggbb
        if (c !== '' && !/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) {
          return res.status(400).json({ message: 'Некорректный цвет' });
        }
        server.settings.color = c;
      }
    }

    await server.save();
    
    res.json({ server, message: 'Сервер обновлен' });
    
  } catch (error) {
    console.error('Update server error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/servers/:id
 * Удалить сервер
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    if (server.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Только владелец может удалить сервер' });
    }
    
    // Удаляем каналы сервера
    await Channel.deleteMany({ server: server._id });
    
    // Удаляем сервер из списков пользователей
    await User.updateMany(
      { servers: server._id },
      { $pull: { servers: server._id } }
    );
    
    await Server.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Сервер удален' });
    
  } catch (error) {
    console.error('Delete server error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/servers/:id/invite
 * Создать инвайт-ссылку
 */
router.post('/:id/invite', authMiddleware, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    const isMember = server.members.some(m => m.user.toString() === req.user._id.toString());
    if (!isMember) {
      return res.status(403).json({ message: 'Вы не являетесь участником этого сервера' });
    }
    
    const inviteCode = uuidv4().substring(0, 8).toUpperCase();
    
    server.invites.push({
      code: inviteCode,
      createdBy: req.user._id
    });
    
    await server.save();
    
    res.json({ 
      inviteCode,
      inviteUrl: `love-app://invite/${inviteCode}`,
      message: 'Инвайт создан'
    });
    
  } catch (error) {
    console.error('Create invite error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/servers/join/:code
 * Присоединиться к серверу по инвайт-коду
 */
router.post('/join/:code', authMiddleware, async (req, res) => {
  try {
    const { code } = req.params;
    
    // Ищем сервер с таким инвайтом
    const server = await Server.findOne({ 'invites.code': code });
    
    if (!server) {
      return res.status(404).json({ message: 'Инвайт не найден или истек' });
    }
    
    // Проверяем что пользователь уже не является участником
    const isMember = server.members.some(m => m.user.toString() === req.user._id.toString());
    if (isMember) {
      return res.status(400).json({ message: 'Вы уже являетесь участником этого сервера', server });
    }
    
    // Находим инвайт
    const invite = server.invites.find(inv => inv.code === code);
    
    // Проверяем срок действия
    if (invite.expiresAt && new Date() > invite.expiresAt) {
      return res.status(400).json({ message: 'Инвайт истек' });
    }
    
    // Проверяем лимит использований
    if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
      return res.status(400).json({ message: 'Инвайт достиг лимита использований' });
    }
    
    // Находим роль 'Участник'
    const memberRole = server.roles.find(r => r.name === 'Участник');
    const defaultRoles = memberRole ? [memberRole._id] : [];

    // Добавляем пользователя на сервер
    server.members.push({
      user: req.user._id,
      roles: defaultRoles
    });
    
    // Увеличиваем счетчик использований
    invite.uses += 1;
    
    await server.save();
    
    // Добавляем сервер пользователю
    await User.findByIdAndUpdate(req.user._id, {
      $addToSet: { servers: server._id }
    });
    
    const populatedServer = await Server.findById(server._id)
      .populate('channels', 'name type position topic category')
      .populate('members.user', 'username avatar status discriminator')
      .populate('owner', 'username avatar');
    
    res.json({ server: populatedServer, message: `Вы присоединились к серверу ${server.name}` });
    
  } catch (error) {
    console.error('Join server error:', error);
    res.status(500).json({ message: 'Ошибка при присоединении к серверу' });
  }
});

/**
 * DELETE /api/servers/:id/leave
 * Покинуть сервер
 */
router.delete('/:id/leave', authMiddleware, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    if (server.owner.toString() === req.user._id.toString()) {
      return res.status(400).json({ message: 'Владелец не может покинуть сервер. Удалите сервер или передайте права.' });
    }
    
    server.members = server.members.filter(m => m.user.toString() !== req.user._id.toString());
    await server.save();
    
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { servers: server._id }
    });
    
    res.json({ message: 'Вы покинули сервер' });
    
  } catch (error) {
    console.error('Leave server error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * Безопасная проверка загруженного изображения.
 * Принимает только растровые форматы (png/jpg/jpeg/webp/gif).
 * SVG ЯВНО запрещён — он может содержать исполняемый JS.
 */
const ALLOWED_IMAGE_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const ALLOWED_IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
function validateImageFile(file, maxBytes) {
  if (!file) return 'Файл не предоставлен';
  if (file.size > maxBytes) return 'Файл слишком большой';
  const mime = String(file.mimetype || '').toLowerCase();
  if (!ALLOWED_IMAGE_MIME.includes(mime)) return 'Допустимы только PNG, JPG, WEBP, GIF';
  const ext = path.extname(String(file.name || '')).toLowerCase();
  if (!ALLOWED_IMAGE_EXT.includes(ext)) return 'Недопустимое расширение файла';
  return null;
}

/**
 * PUT /api/servers/:id/icon
 * Обновить иконку сервера
 */
router.put('/:id/icon', authMiddleware, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    if (server.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Недостаточно прав' });
    }
    
    if (!req.files || !req.files.icon) {
      return res.status(400).json({ message: 'Файл иконки не предоставлен' });
    }
    
    const iconFile = req.files.icon;
    // Проверяем mime/расширение/размер. 8 МБ для иконки — с запасом.
    const err = validateImageFile(iconFile, 8 * 1024 * 1024);
    if (err) return res.status(400).json({ message: err });

    const ext = path.extname(iconFile.name).toLowerCase();
    const filename = `server_${server._id}_${Date.now()}${ext}`;
    const uploadPath = path.join(__dirname, '..', 'uploads', 'avatars', filename);
    
    await iconFile.mv(uploadPath);
    
    server.icon = `/uploads/avatars/${filename}`;
    await server.save();
    
    res.json({ server, message: 'Иконка обновлена' });
    
  } catch (error) {
    console.error('Update server icon error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * PUT /api/servers/:id/banner
 * Загрузка баннера. Доступно ТОЛЬКО для комнат (settings.kind === 'room')
 * и только владельцу. Старые guild-серверы через этот endpoint не получают
 * баннер — они продолжают работать как раньше.
 */
router.put('/:id/banner', authMiddleware, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Сервер не найден' });
    if (server.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Недостаточно прав' });
    }
    // Жёстко ограничиваем баннер только комнатами — чтобы не менять поведение guild.
    if (!server.settings || server.settings.kind !== 'room') {
      return res.status(400).json({ message: 'Баннер доступен только для комнат' });
    }

    if (!req.files || !req.files.banner) {
      return res.status(400).json({ message: 'Файл баннера не предоставлен' });
    }

    const bannerFile = req.files.banner;
    // 12 МБ — баннер обычно крупнее иконки, но всё равно ограничено.
    const err = validateImageFile(bannerFile, 12 * 1024 * 1024);
    if (err) return res.status(400).json({ message: err });

    const ext = path.extname(bannerFile.name).toLowerCase();
    const filename = `room_banner_${server._id}_${Date.now()}${ext}`;
    const uploadPath = path.join(__dirname, '..', 'uploads', 'images', filename);
    await bannerFile.mv(uploadPath);

    server.banner = `/uploads/images/${filename}`;
    await server.save();

    res.json({ server, message: 'Баннер обновлён' });
  } catch (error) {
    console.error('Update server banner error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/servers/:id/icon
 * Удалить иконку сервера/комнаты. Только владелец. Удаляет файл с
 * диска (если лежит в /uploads/icons/) и обнуляет server.icon.
 * Работает для guild и room — в обоих случаях иконка опциональна.
 */
router.delete('/:id/icon', authMiddleware, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Сервер не найден' });
    if (server.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Недостаточно прав' });
    }

    // Файлы иконок сохраняются в /uploads/avatars/ (см. PUT /:id/icon).
    if (typeof server.icon === 'string' && server.icon.startsWith('/uploads/avatars/')) {
      const rel = server.icon.replace(/^\/+/, '');
      const filePath = path.join(__dirname, '..', rel);
      const uploadsRoot = path.join(__dirname, '..', 'uploads', 'avatars');
      if (filePath.startsWith(uploadsRoot)) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          console.warn('[icon-delete] unlink failed:', e.message);
        }
      }
    }

    server.icon = '';
    await server.save();
    res.json({ server, message: 'Иконка удалена' });
  } catch (error) {
    console.error('Delete server icon error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/servers/:id/banner
 * Удалить баннер комнаты. Доступно ТОЛЬКО владельцу комнаты
 * (settings.kind === 'room'). Удаляет файл с диска и обнуляет
 * server.banner. Для guild-серверов возвращает 400 — у них баннера и не
 * было.
 */
router.delete('/:id/banner', authMiddleware, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Сервер не найден' });
    if (server.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Недостаточно прав' });
    }
    if (!server.settings || server.settings.kind !== 'room') {
      return res.status(400).json({ message: 'Баннер доступен только для комнат' });
    }

    // Удаляем файл с диска, если он лежит в наших uploads.
    // НЕ ходим по абсолютным путям — только если banner совпадает с
    // нашим шаблоном /uploads/images/...
    if (typeof server.banner === 'string' && server.banner.startsWith('/uploads/images/')) {
      const rel = server.banner.replace(/^\/+/, '');
      const filePath = path.join(__dirname, '..', rel);
      // path.join + проверка префикса предотвращают ../-traversal:
      // server.banner всегда формируется нашим backend, но на всякий
      // случай явно убеждаемся, что итоговый путь внутри uploads.
      const uploadsRoot = path.join(__dirname, '..', 'uploads', 'images');
      if (filePath.startsWith(uploadsRoot)) {
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        } catch (e) {
          // Не критично — даже если файл не удалился, обнулим поле в БД.
          console.warn('[banner-delete] unlink failed:', e.message);
        }
      }
    }

    server.banner = '';
    await server.save();
    res.json({ server, message: 'Баннер удалён' });
  } catch (error) {
    console.error('Delete server banner error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/servers/:id/categories
 * Добавить категорию на сервер
 */
router.post('/:id/categories', authMiddleware, async (req, res) => {
  console.log(`[Category] Adding to server: ${req.params.id}, Name: ${req.body.name}`);
  try {
    const { name } = req.body;
    if (!name || name.length < 1) {
      return res.status(400).json({ message: 'Название категории не может быть пустым' });
    }

    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Сервер не найден' });
    if (server.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Недостаточно прав' });
    }

    server.categories.push({ name, channels: [] });
    await server.save();

    res.status(201).json({ categories: server.categories, message: 'Категория добавлена' });
  } catch (error) {
    console.error('Add category error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/servers/:id/categories/:categoryId
 * Удалить категорию с сервера
 */
router.delete('/:id/categories/:categoryId', authMiddleware, async (req, res) => {
  try {
    const server = await Server.findById(req.params.id);
    if (!server) return res.status(404).json({ message: 'Сервер не найден' });
    if (server.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Недостаточно прав' });
    }

    server.categories = server.categories.filter(c => c._id.toString() !== req.params.categoryId);
    await server.save();

    res.json({ categories: server.categories, message: 'Категория удалена' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/servers/:id/emojis
 * Загрузить кастомный эмодзи на сервер
 */
router.post('/:id/emojis', authMiddleware, (req, res, next) => {
  upload.single('emoji')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ message: err.message || 'Ошибка загрузки файла' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { name } = req.body;
    const serverId = req.params.id;
    
    if (!name || name.length < 2) {
      return res.status(400).json({ message: 'Название эмодзи должно содержать минимум 2 символа' });
    }
    
    if (!req.file) {
      return res.status(400).json({ message: 'Файл не загружен' });
    }
    
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    // Проверяем права (владелец или админ с правом управления сервером)
    const isOwner = server.owner.toString() === req.user._id.toString();
    const member = server.members.find(m => m.user.toString() === req.user._id.toString());
    const hasPermission = member && member.roles && member.roles.some((roleId) => {
      try {
        const role = server.roles.id(roleId);
        const p = role && role.permissions;
        return !!(p && (p.administrator || p.manageServer));
      } catch {
        return false;
      }
    });

    if (!isOwner && !hasPermission) {
      return res.status(403).json({ message: 'Недостаточно прав' });
    }

    // Проверяем, не существует ли уже эмодзи с таким именем
    if (server.emojis.some(e => e.name === name)) {
      return res.status(400).json({ message: 'Эмодзи с таким именем уже существует' });
    }
    
    // Добавляем эмодзи
    const emoji = {
      name,
      url: `/uploads/${req.file.filename}`,
      uploadedBy: req.user._id
    };
    
    server.emojis.push(emoji);
    await server.save();
    
    res.json({ 
      emoji: server.emojis[server.emojis.length - 1],
      message: 'Эмодзи добавлен' 
    });
    
  } catch (error) {
    console.error('Upload emoji error:', error);
    res.status(500).json({ message: 'Ошибка при загрузке эмодзи' });
  }
});

/**
 * DELETE /api/servers/:id/emojis/:emojiId
 * Удалить кастомный эмодзи
 */
router.delete('/:id/emojis/:emojiId', authMiddleware, async (req, res) => {
  try {
    const { id: serverId, emojiId } = req.params;
    
    const server = await Server.findById(serverId);
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    // Проверяем права
    const isOwner = server.owner.toString() === req.user._id.toString();
    const member = server.members.find(m => m.user.toString() === req.user._id.toString());
    const hasPermission = member && member.roles && member.roles.some((roleId) => {
      try {
        const role = server.roles.id(roleId);
        const p = role && role.permissions;
        return !!(p && (p.administrator || p.manageServer));
      } catch {
        return false;
      }
    });

    if (!isOwner && !hasPermission) {
      return res.status(403).json({ message: 'Недостаточно прав' });
    }

    // Удаляем эмодзи
    server.emojis.pull(emojiId);
    await server.save();
    
    res.json({ message: 'Эмодзи удален' });
    
  } catch (error) {
    console.error('Delete emoji error:', error);
    res.status(500).json({ message: 'Ошибка при удалении эмодзи' });
  }
});

module.exports = router;
