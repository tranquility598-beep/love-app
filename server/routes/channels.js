/**
 * Роуты каналов
 * Создание и управление каналами сервера
 */

const express = require('express');
const router = express.Router();
const Channel = require('../models/Channel');
const Server = require('../models/Server');
const authMiddleware = require('../middleware/auth');

/**
 * POST /api/channels
 * Создать новый канал
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { name, type, serverId, topic, category } = req.body;
    
    if (!name || !serverId) {
      return res.status(400).json({ message: 'Название и ID сервера обязательны' });
    }
    
    const server = await Server.findById(serverId);
    
    if (!server) {
      return res.status(404).json({ message: 'Сервер не найден' });
    }
    
    // Проверяем права (владелец или админ)
    const member = server.members.find(m => m.user.toString() === req.user._id.toString());
    if (!member || (!member.roles.includes('owner') && !member.roles.includes('admin'))) {
      return res.status(403).json({ message: 'Недостаточно прав для создания каналов' });
    }
    
    // Определяем позицию
    const channelCount = await Channel.countDocuments({ server: serverId });
    
    const channel = new Channel({
      name: name.toLowerCase().replace(/\s+/g, '-'),
      type: type || 'text',
      topic: topic || '',
      server: serverId,
      position: channelCount,
      category: category || null
    });
    
    await channel.save();
    
    // Добавляем канал на сервер
    server.channels.push(channel._id);
    
    // Добавляем в категорию если указана
    if (category) {
      const cat = server.categories.find(c => c.name === category);
      if (cat) {
        cat.channels.push(channel._id);
      }
    }
    
    await server.save();
    
    res.status(201).json({ channel, message: 'Канал создан' });
    
  } catch (error) {
    console.error('Create channel error:', error);
    res.status(500).json({ message: 'Ошибка при создании канала' });
  }
});

/**
 * GET /api/channels/:id
 * Получить данные канала
 */
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id)
      .populate('voiceMembers.user', 'username avatar status');
    
    if (!channel) {
      return res.status(404).json({ message: 'Канал не найден' });
    }
    
    // Проверяем доступ
    if (channel.server) {
      const server = await Server.findById(channel.server);
      const isMember = server.members.some(m => m.user.toString() === req.user._id.toString());
      if (!isMember) {
        return res.status(403).json({ message: 'Нет доступа к этому каналу' });
      }
    }
    
    res.json({ channel });
    
  } catch (error) {
    console.error('Get channel error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * PUT /api/channels/:id
 * Обновить канал
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { name, topic } = req.body;
    
    const channel = await Channel.findById(req.params.id);
    
    if (!channel) {
      return res.status(404).json({ message: 'Канал не найден' });
    }
    
    if (channel.server) {
      const server = await Server.findById(channel.server);
      const member = server.members.find(m => m.user.toString() === req.user._id.toString());
      if (!member || (!member.roles.includes('owner') && !member.roles.includes('admin'))) {
        return res.status(403).json({ message: 'Недостаточно прав' });
      }
    }
    
    if (name) channel.name = name.toLowerCase().replace(/\s+/g, '-');
    if (topic !== undefined) channel.topic = topic;
    
    await channel.save();
    
    res.json({ channel, message: 'Канал обновлен' });
    
  } catch (error) {
    console.error('Update channel error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/channels/:id
 * Удалить канал
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    
    if (!channel) {
      return res.status(404).json({ message: 'Канал не найден' });
    }
    
    if (channel.server) {
      const server = await Server.findById(channel.server);
      const member = server.members.find(m => m.user.toString() === req.user._id.toString());
      if (!member || (!member.roles.includes('owner') && !member.roles.includes('admin'))) {
        return res.status(403).json({ message: 'Недостаточно прав' });
      }
      
      // Удаляем канал из сервера
      server.channels = server.channels.filter(c => c.toString() !== channel._id.toString());
      server.categories.forEach(cat => {
        cat.channels = cat.channels.filter(c => c.toString() !== channel._id.toString());
      });
      await server.save();
    }
    
    await Channel.findByIdAndDelete(req.params.id);
    
    res.json({ message: 'Канал удален' });
    
  } catch (error) {
    console.error('Delete channel error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
