/**
 * Скрипт для выдачи роли Founder (Основатель) пользователю.
 * Запуск: node server/scripts/make-founder.js <username_или_email>
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const identifier = process.argv[2];

if (!identifier) {
  console.error('Ошибка: Укажите username или email пользователя.');
  console.log('Пример: node server/scripts/make-founder.js admin@love.app');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/love-app';

async function run() {
  try {
    console.log(`Подключение к MongoDB: ${MONGODB_URI}...`);
    await mongoose.connect(MONGODB_URI);
    console.log('Успешно подключено к базе данных.');

    // Ищем пользователя по email или username
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase().trim() },
        { username: identifier.trim() }
      ]
    });

    if (!user) {
      console.error(`Ошибка: Пользователь "${identifier}" не найден.`);
      process.exit(1);
    }

    console.log(`Найден пользователь: ${user.username} (${user.email}), текущая роль: ${user.role}`);
    
    // Меняем роль на founder
    user.role = 'founder';
    
    // Добавляем значок founder, если его нет
    if (!user.badges.includes('founder')) {
      user.badges.push('founder');
    }

    await user.save();
    console.log(`✅ Роль пользователя успешно изменена на: ${user.role}`);
    console.log('Скрипт успешно завершил работу.');
    
  } catch (error) {
    console.error('Произошла ошибка:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Подключение к MongoDB закрыто.');
  }
}

run();
