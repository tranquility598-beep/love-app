/**
 * Скрипт для сброса пароля пользователя.
 * Запуск: node server/scripts/reset-password.js <username_или_email> <новый_пароль>
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const identifier = process.argv[2];
const newPassword = process.argv[3];

if (!identifier || !newPassword) {
  console.error('Ошибка: Укажите username/email и новый пароль.');
  console.log('Пример: node server/scripts/reset-password.js admin@love.app myNewPassword123');
  process.exit(1);
}

if (newPassword.length < 8) {
  console.error('Ошибка: Пароль должен быть длиной не менее 8 символов.');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/love-app';

async function run() {
  try {
    console.log(`Подключение к MongoDB: ${MONGODB_URI}...`);
    await mongoose.connect(MONGODB_URI);
    console.log('Подключено.');

    // Ищем пользователя
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

    user.password = newPassword;
    // Сбрасываем блокировки входа, если они были
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.isVerified = true; // Убеждаемся, что аккаунт подтвержден

    await user.save();
    console.log(`✅ Пароль для пользователя @${user.username} (${user.email}) успешно обновлен и аккаунт верифицирован.`);

  } catch (error) {
    console.error('Ошибка при сбросе пароля:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Подключение к MongoDB закрыто.');
  }
}

run();
