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
const { v4: uuidv4 } = require('uuid');
const path = require('path');

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
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    if (!name || name.length < 2) {
      return res.status(400).json({ message: 'Название сервера должно содержать минимум 2 символа' });
    }
    
    // Создаем сервер
    const server = new Server({
      name,
      description: description || '',
      owner: req.user._id,
      members: [{
        user: req.user._id,
        roles: ['owner', 'admin', 'member']
      }],
      roles: [
        { name: 'owner', color: '#f1c40f', permissions: ['all'], position: 100 },
        { name: 'admin', color: '#e74c3c', permissions: ['manage_channels', 'manage_messages'], position: 50 },
        { name: 'member', color: '#99aab5', permissions: ['send_messages', 'read_messages'], position: 0 }
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
    const { name, description } = req.body;
    
    const server = await Server.findById(req.params.id);
    
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    // Проверяем права (только владелец или админ)
    if (server.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Недостаточно прав' });
    }
    
    if (name) server.name = name;
    if (description !== undefined) server.description = description;
    
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
      inviteUrl: `discord-clone://invite/${inviteCode}`,
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
    
    // Добавляем пользователя на сервер
    server.members.push({
      user: req.user._id,
      roles: ['member']
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
    const ext = path.extname(iconFile.name);
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

module.exports = router;
