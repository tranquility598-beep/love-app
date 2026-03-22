/**
 * Роуты личных сообщений (DM)
 * Создание диалогов и получение истории
 */

const express = require('express');
const router = express.Router();
const DirectMessage = require('../models/DirectMessage');
const Channel = require('../models/Channel');
const Message = require('../models/Message');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

/**
 * GET /api/dm
 * Получить все личные диалоги пользователя
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const conversations = await DirectMessage.find({
      participants: req.user._id
    })
    .populate('participants', 'username avatar status discriminator customStatus')
    .populate('lastMessage', 'content createdAt author')
    .sort({ updatedAt: -1 });
    
    res.json({ conversations });
    
  } catch (error) {
    console.error('Get DMs error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/dm/:userId
 * Открыть или создать диалог с пользователем
 */
router.post('/:userId', authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    
    if (targetUserId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Нельзя создать диалог с самим собой' });
    }
    
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    
    // Ищем существующий диалог
    let conversation = await DirectMessage.findOne({
      participants: { $all: [req.user._id, targetUserId] }
    }).populate('participants', 'username avatar status discriminator');
    
    if (!conversation) {
      // Создаем новый канал для диалога
      const channel = new Channel({
        name: `dm-${req.user._id}-${targetUserId}`,
        type: 'dm',
        participants: [req.user._id, targetUserId]
      });
      
      await channel.save();
      
      // Создаем диалог
      conversation = new DirectMessage({
        participants: [req.user._id, targetUserId],
        channel: channel._id,
        unreadCount: [
          { user: req.user._id, count: 0 },
          { user: targetUserId, count: 0 }
        ]
      });
      
      await conversation.save();
      
      await conversation.populate('participants', 'username avatar status discriminator');
    }
    
    res.json({ conversation });
    
  } catch (error) {
    console.error('Create DM error:', error);
    res.status(500).json({ message: 'Ошибка при создании диалога' });
  }
});

/**
 * GET /api/dm/:conversationId/messages
 * Получить сообщения диалога
 */
router.get('/:conversationId/messages', authMiddleware, async (req, res) => {
  try {
    const conversation = await DirectMessage.findById(req.params.conversationId);
    
    if (!conversation) {
      return res.status(404).json({ message: 'Диалог не найден' });
    }
    
    // Проверяем что пользователь является участником
    if (!conversation.participants.includes(req.user._id.toString())) {
      return res.status(403).json({ message: 'Нет доступа к этому диалогу' });
    }
    
    const { before, limit = 50 } = req.query;
    
    const query = {
      channel: conversation.channel,
      deleted: false
    };
    
    if (before) {
      query._id = { $lt: before };
    }
    
    const messages = await Message.find(query)
      .populate('author', 'username avatar discriminator')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    messages.reverse();
    
    // Сбрасываем счетчик непрочитанных
    await DirectMessage.findByIdAndUpdate(req.params.conversationId, {
      $set: { 'unreadCount.$[elem].count': 0 }
    }, {
      arrayFilters: [{ 'elem.user': req.user._id }]
    });
    
    res.json({ messages, channelId: conversation.channel });
    
  } catch (error) {
    console.error('Get DM messages error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
