/**
 * Роуты уведомлений
 * Лента уведомлений пользователя: список, отметка прочитанным, удаление.
 */

const express = require('express');
const router = express.Router();
const Notification = require('../models/Notification');
const authMiddleware = require('../middleware/auth');

/**
 * GET /api/notifications
 * Список уведомлений текущего пользователя (новые сверху, максимум 50)
 */
router.get('/', authMiddleware, async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const unread = notifications.filter(n => !n.read).length;
    res.json({ notifications, unread });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * POST /api/notifications/read
 * Отметить прочитанным: { id } — одно, без id — все.
 */
router.post('/read', authMiddleware, async (req, res) => {
  try {
    const { id } = req.body || {};
    if (id) {
      await Notification.updateOne({ _id: id, user: req.user._id }, { read: true });
    } else {
      await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    }
    res.json({ message: 'ok' });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/notifications/:id
 * Удалить одно уведомление
 */
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    await Notification.deleteOne({ _id: req.params.id, user: req.user._id });
    res.json({ message: 'ok' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/notifications
 * Очистить все уведомления пользователя
 */
router.delete('/', authMiddleware, async (req, res) => {
  try {
    await Notification.deleteMany({ user: req.user._id });
    res.json({ message: 'ok' });
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
