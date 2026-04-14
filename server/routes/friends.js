/**
 * Роуты системы друзей
 * Запросы в друзья, принятие/отклонение, список друзей
 */

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

/**
 * GET /api/friends
 * Получить список друзей
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .populate('friends', 'username avatar status discriminator customStatus lastSeen')
      .populate('friendRequestsReceived.from', 'username avatar discriminator')
      .populate('friendRequestsSent.to', 'username avatar discriminator');
    
    res.json({
      friends: user.friends,
      requestsReceived: user.friendRequestsReceived,
      requestsSent: user.friendRequestsSent
    });
    
  } catch (error) {
    console.error('Get friends error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/friends/request/:userId
 * Отправить запрос в друзья
 */
router.post('/request/:userId', authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    
    if (targetUserId === req.user._id.toString()) {
      return res.status(400).json({ message: 'Нельзя добавить себя в друзья' });
    }
    
    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }
    
    const currentUser = await User.findById(req.user._id);
    
    // Проверяем что уже не друзья
    if (currentUser.friends.includes(targetUserId)) {
      return res.status(400).json({ message: 'Этот пользователь уже в вашем списке друзей' });
    }
    
    // Проверяем что запрос уже не отправлен
    const alreadySent = currentUser.friendRequestsSent.some(r => r.to.toString() === targetUserId);
    if (alreadySent) {
      return res.status(400).json({ message: 'Запрос уже отправлен' });
    }
    
    // Проверяем что нет входящего запроса от этого пользователя
    const incomingRequest = currentUser.friendRequestsReceived.some(r => r.from.toString() === targetUserId);
    if (incomingRequest) {
      // Автоматически принимаем входящий запрос
      await User.findByIdAndUpdate(req.user._id, {
        $push: { friends: targetUserId },
        $pull: { friendRequestsReceived: { from: targetUserId } }
      });
      
      await User.findByIdAndUpdate(targetUserId, {
        $push: { friends: req.user._id },
        $pull: { friendRequestsSent: { to: req.user._id } }
      });
      
      const friend = await User.findById(targetUserId).select('username avatar status discriminator');
      
      return res.json({ 
        message: `Входящий запрос от ${targetUser.username} автоматически принят! Вы теперь друзья.`,
        friend,
        autoAccepted: true
      });
    }
    
    // Добавляем запрос
    await User.findByIdAndUpdate(req.user._id, {
      $push: { friendRequestsSent: { to: targetUserId } }
    });
    
    await User.findByIdAndUpdate(targetUserId, {
      $push: { friendRequestsReceived: { from: req.user._id } }
    });
    
    res.json({ message: `Запрос в друзья отправлен пользователю ${targetUser.username}` });
    
  } catch (error) {
    console.error('Send friend request error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/friends/accept/:userId
 * Принять запрос в друзья
 */
router.post('/accept/:userId', authMiddleware, async (req, res) => {
  try {
    const fromUserId = req.params.userId;
    
    const currentUser = await User.findById(req.user._id);
    
    // Проверяем что есть входящий запрос
    const hasRequest = currentUser.friendRequestsReceived.some(r => r.from.toString() === fromUserId);
    if (!hasRequest) {
      return res.status(400).json({ message: 'Запрос в друзья не найден' });
    }
    
    // Добавляем в друзья обоим
    await User.findByIdAndUpdate(req.user._id, {
      $push: { friends: fromUserId },
      $pull: { friendRequestsReceived: { from: fromUserId } }
    });
    
    await User.findByIdAndUpdate(fromUserId, {
      $push: { friends: req.user._id },
      $pull: { friendRequestsSent: { to: req.user._id } }
    });
    
    const friend = await User.findById(fromUserId).select('username avatar status discriminator');
    
    res.json({ message: 'Запрос принят', friend });
    
  } catch (error) {
    console.error('Accept friend request error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/friends/decline/:userId
 * Отклонить запрос в друзья
 */
router.post('/decline/:userId', authMiddleware, async (req, res) => {
  try {
    const fromUserId = req.params.userId;
    
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { friendRequestsReceived: { from: fromUserId } }
    });
    
    await User.findByIdAndUpdate(fromUserId, {
      $pull: { friendRequestsSent: { to: req.user._id } }
    });
    
    res.json({ message: 'Запрос отклонен' });
    
  } catch (error) {
    console.error('Decline friend request error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/friends/request/:userId
 * Отменить исходящий запрос в друзья
 */
router.delete('/request/:userId', authMiddleware, async (req, res) => {
  try {
    const toUserId = req.params.userId;
    
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { friendRequestsSent: { to: toUserId } }
    });
    
    await User.findByIdAndUpdate(toUserId, {
      $pull: { friendRequestsReceived: { from: req.user._id } }
    });
    
    res.json({ message: 'Запрос отменен' });
    
  } catch (error) {
    console.error('Cancel friend request error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/friends/:userId
 * Удалить из друзей
 */
router.delete('/:userId', authMiddleware, async (req, res) => {
  try {
    const friendId = req.params.userId;
    
    await User.findByIdAndUpdate(req.user._id, {
      $pull: { friends: friendId }
    });
    
    await User.findByIdAndUpdate(friendId, {
      $pull: { friends: req.user._id }
    });
    
    res.json({ message: 'Пользователь удален из друзей' });
    
  } catch (error) {
    console.error('Remove friend error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
