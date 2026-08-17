/**
 * Обращения с сайта.
 *
 * Форма на support.html жила без адресата: она постила на старый адрес Render,
 * которого в маршрутах нет, ошибку глотала и всё равно писала «обращение
 * отправлено». Здесь появляется получатель — обращение ложится в те же кейсы,
 * где команда уже разбирает жалобы из приложения.
 *
 * Автор не залогинен, поэтому `reporter` пустой, а связь с человеком держится
 * в `contact`. Отвечать по такому обращению можно на указанную почту.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const Case = require('../models/Case');
const { publishAdminUpdate } = require('../services/adminRealtime');

const router = express.Router();

// Категория из формы → тип кейса. Баг и предложение попадают в свои очереди,
// остальное — в общую поддержку.
const KIND_BY_CATEGORY = {
  bug: 'bug',
  feature: 'idea',
  account: 'support',
  other: 'support'
};

const CATEGORY_LABEL = {
  bug: 'Ошибка',
  feature: 'Предложение',
  account: 'Аккаунт',
  other: 'Другое'
};

// Публичный POST без авторизации: считаем по IP отдельно от общего лимита.
// Живому человеку пяти обращений в час хватает с большим запасом.
const supportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`⚠️  Support form rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      message: 'Слишком много обращений за час. Попробуйте позже.'
    });
  }
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function text(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

router.post('/', supportLimiter, async (req, res) => {
  try {
    const name = text(req.body.name, 120);
    const email = text(req.body.email, 254).toLowerCase();
    const subject = text(req.body.subject, 160);
    const description = text(req.body.description, 10000);
    const rawCategory = text(req.body.category, 40).toLowerCase();
    const category = KIND_BY_CATEGORY[rawCategory] ? rawCategory : 'other';

    if (!name || !email || !subject || !description) {
      return res.status(400).json({ message: 'Заполните все поля' });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Укажите корректный email' });
    }

    const item = await Case.create({
      kind: KIND_BY_CATEGORY[category],
      title: subject,
      // Подпись автора — в описании: в кейсе нет колонки «кто написал» для
      // незалогиненных, а разбирающему нужно видеть это сразу.
      description: `${description}\n\n— ${name} <${email}> (форма на сайте, ${CATEGORY_LABEL[category]})`,
      contact: { name, email, source: 'site' },
      status: 'new',
      tags: ['site', category]
    });

    publishAdminUpdate('cases', { method: 'POST', source: 'site' });

    // Номер отдаём: по нему человек может сослаться на обращение в переписке.
    res.status(201).json({ ok: true, number: item.number });
  } catch (error) {
    console.error('[Support] Не удалось создать обращение:', error);
    res.status(500).json({ message: 'Не удалось отправить обращение. Попробуйте позже.' });
  }
});

module.exports = router;
