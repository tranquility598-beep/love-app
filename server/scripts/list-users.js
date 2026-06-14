/**
 * Скрипт для вывода списка всех пользователей в базе данных.
 * Запуск: node server/scripts/list-users.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/love-app';

async function run() {
  try {
    console.log(`Подключение к MongoDB: ${MONGODB_URI}...`);
    await mongoose.connect(MONGODB_URI);
    console.log('Подключено к базе.');

    const users = await User.find({}).select('username email role isVerified isBanned');
    
    if (users.length === 0) {
      console.log('Пользователи отсутствуют в базе данных. Пожалуйста, сначала зарегистрируйте аккаунт.');
    } else {
      console.log('\n--- Список зарегистрированных пользователей ---');
      users.forEach((user, idx) => {
        console.log(`${idx + 1}. Username: ${user.username} | Email: ${user.email} | Role: ${user.role} | Verified: ${user.isVerified} | Banned: ${user.isBanned}`);
      });
      console.log('-----------------------------------------------\n');
    }
    
  } catch (error) {
    console.error('Ошибка:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Подключение к MongoDB закрыто.');
  }
}

run();
