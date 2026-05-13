/**
 * Разблокировка аккаунта (сбрасывает lockUntil + loginAttempts).
 *
 * Использование:
 *   # из корня репо
 *   MONGODB_URI="mongodb+srv://..." node server/scripts/unlock-user.js you@example.com
 *
 *   # или передать строку подключения вторым аргументом
 *   node server/scripts/unlock-user.js you@example.com "mongodb+srv://..."
 *
 * Если MONGODB_URI не задан — используется локальная база mongodb://localhost:27017/love-app.
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const User = require('../models/User');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  const uri = process.argv[3] || process.env.MONGODB_URI || 'mongodb://localhost:27017/love-app';

  if (!email) {
    console.error('Usage: node server/scripts/unlock-user.js <email> [mongodb-uri]');
    process.exit(1);
  }

  console.log(`→ Connecting to MongoDB...`);
  await mongoose.connect(uri);
  console.log(`✓ Connected`);

  const user = await User.findOne({ email });
  if (!user) {
    console.error(`✗ User with email "${email}" not found`);
    await mongoose.disconnect();
    process.exit(2);
  }

  const wasLocked = user.lockUntil && user.lockUntil > Date.now();
  user.lockUntil = null;
  user.loginAttempts = 0;
  await user.save();

  console.log(`✓ User ${user.username} (${email}) unlocked.`);
  console.log(`  loginAttempts → 0`);
  console.log(`  lockUntil → null${wasLocked ? ' (was active)' : ' (was already inactive)'}`);

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('✗ Error:', err.message);
  try { await mongoose.disconnect(); } catch (_) {}
  process.exit(1);
});
