/**
 * Роуты push-токенов (Android, FCM).
 *
 * Телефон получает токен у Google и присылает его сюда после входа в аккаунт;
 * при выходе — удаляет, чтобы чужие уведомления не приходили на устройство.
 * Сами уведомления отправляет services/push.js из socketHandler.
 */

const express = require('express');
const router = express.Router();
const PushToken = require('../models/PushToken');
const authMiddleware = require('../middleware/auth');
const push = require('../services/push');

/**
 * POST /api/push/token
 * Зарегистрировать токен устройства: { token, device?, platform? }
 * Повторная регистрация обновляет владельца и время: один телефон может
 * перейти к другому аккаунту, и старый владелец не должен получать push.
 */
router.post('/token', authMiddleware, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (!token || token.length > 4096) {
      return res.status(400).json({ message: 'Некорректный токен' });
    }

    const device = String(req.body?.device || '').slice(0, 120);
    const socketId = String(req.body?.socketId || '').slice(0, 120);
    await PushToken.findOneAndUpdate(
      { token },
      {
        user: req.user._id,
        token,
        platform: 'android',
        device,
        socketId,
        lastSeenAt: new Date()
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ message: 'ok' });
  } catch (error) {
    console.error('Register push token error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * DELETE /api/push/token
 * Забыть токен: { token } — выход из аккаунта или отзыв разрешения.
 * Не ошибка, если токена уже нет.
 */
router.delete('/token', authMiddleware, async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    if (token) {
      await PushToken.deleteOne({ token, user: req.user._id });
    }
    res.json({ message: 'ok' });
  } catch (error) {
    console.error('Remove push token error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

/**
 * GET /api/push/status
 * Пригодится в поддержке: включён ли push на сервере вообще и сколько
 * устройств привязано к аккаунту.
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const count = await PushToken.countDocuments({ user: req.user._id });
    res.json({ configured: push.isConfigured(), devices: count });
  } catch (error) {
    console.error('Push status error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
