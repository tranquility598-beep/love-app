/**
 * Роуты сообщений
 * Получение, отправка, редактирование, удаление сообщений
 */

const express = require('express');
const router = express.Router();
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const Server = require('../models/Server');
const authMiddleware = require('../middleware/auth');

/**
 * GET /api/messages/:channelId
 * Получить сообщения канала
 */
router.get('/:channelId', authMiddleware, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { before, limit = 50 } = req.query;
    
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Канал не найден' });
    }
    
    // Строим запрос
    const query = { 
      channel: channelId,
      deleted: false
    };
    
    if (before) {
      query._id = { $lt: before };
    }
    
    const messages = await Message.find(query)
      .populate('author', 'username avatar discriminator')
      .populate('replyTo', 'content author')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    // Возвращаем в хронологическом порядке
    messages.reverse();
    
    res.json({ messages });
    
  } catch (error) {
    console.error('Get messages error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/messages/:channelId
 * Отправить сообщение
 */
router.post('/:channelId', authMiddleware, async (req, res) => {
  try {
    const { channelId } = req.params;
    const { content, replyTo } = req.body;
    
    if (!content && (!req.files || Object.keys(req.files).length === 0)) {
      return res.status(400).json({ message: 'Сообщение не может быть пустым' });
    }
    
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({ message: 'Канал не найден' });
    }
    
    const message = new Message({
      content: content || '',
      author: req.user._id,
      channel: channelId,
      server: channel.server,
      replyTo: replyTo || null
    });
    
    await message.save();
    
    // Обновляем последнее сообщение в канале
    await Channel.findByIdAndUpdate(channelId, { lastMessage: message._id });
    
    // Заполняем данные автора
    await message.populate('author', 'username avatar discriminator');
    if (replyTo) {
      await message.populate('replyTo', 'content author');
    }
    
    res.status(201).json({ message });
    
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Ошибка при отправке сообщения' });
  }
});

/**
 * PUT /api/messages/:id
 * Редактировать сообщение
 */
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    
    if (!content || content.trim().length === 0) {
      return res.status(400).json({ message: 'Содержимое сообщения не может быть пустым' });
    }
    
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({ message: 'Сообщение не найдено' });
    }
    
    // Только автор может редактировать
    if (message.author.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Вы можете редактировать только свои сообщения' });
    }
    
    message.content = content;
    message.edited = true;
    message.editedAt = new Date();
    
    await message.save();
    await message.populate('author', 'username avatar discriminator');
    
    res.json({ message });
    
  } catch (error) {
    console.error('Edit message error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/messages/:id
 * Удалить сообщение
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({ message: 'Сообщение не найдено' });
    }
    
    // Автор или администратор сервера может удалять
    const isAuthor = message.author.toString() === req.user._id.toString();
    
    if (!isAuthor && message.server) {
      const server = await Server.findById(message.server);
      const member = server.members.find(m => m.user.toString() === req.user._id.toString());
      const isAdmin = member && (member.roles.includes('owner') || member.roles.includes('admin'));
      
      if (!isAdmin) {
        return res.status(403).json({ message: 'Недостаточно прав для удаления этого сообщения' });
      }
    }
    
    // Мягкое удаление
    message.deleted = true;
    message.content = 'Сообщение удалено';
    await message.save();
    
    res.json({ message: 'Сообщение удалено', messageId: req.params.id });
    
  } catch (error) {
    console.error('Delete message error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/messages/:id/react
 * Добавить/убрать реакцию на сообщение
 */
router.post('/:id/react', authMiddleware, async (req, res) => {
  try {
    const { emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({ message: 'Эмодзи обязателен' });
    }
    
    const message = await Message.findById(req.params.id);
    
    if (!message) {
      return res.status(404).json({ message: 'Сообщение не найдено' });
    }
    
    // Ищем существующую реакцию
    const existingReaction = message.reactions.find(r => r.emoji === emoji);
    
    if (existingReaction) {
      const userIndex = existingReaction.users.indexOf(req.user._id.toString());
      
      if (userIndex > -1) {
        // Убираем реакцию
        existingReaction.users.splice(userIndex, 1);
        existingReaction.count -= 1;
        
        if (existingReaction.count === 0) {
          message.reactions = message.reactions.filter(r => r.emoji !== emoji);
        }
      } else {
        // Добавляем реакцию
        existingReaction.users.push(req.user._id);
        existingReaction.count += 1;
      }
    } else {
      // Создаем новую реакцию
      message.reactions.push({
        emoji,
        users: [req.user._id],
        count: 1
      });
    }
    
    await message.save();
    await message.populate('author', 'username avatar discriminator');
    
    res.json({ message });
    
  } catch (error) {
    console.error('React to message error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
