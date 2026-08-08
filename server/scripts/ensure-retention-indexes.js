const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/love-app';
const LOGIN_RETENTION_SECONDS = 180 * 24 * 60 * 60;

async function ensureTtlIndex(collectionName, key, name, expireAfterSeconds) {
  const db = mongoose.connection.db;
  const collection = db.collection(collectionName);
  const indexes = await collection.indexes();
  const existing = indexes.find(index => index.name === name);
  if (!existing) {
    await collection.createIndex(key, { name, expireAfterSeconds });
    return 'created';
  }
  if (existing.expireAfterSeconds === expireAfterSeconds) return 'ready';
  await db.command({ collMod: collectionName, index: { name, expireAfterSeconds } });
  return 'updated';
}

async function run() {
  await mongoose.connect(uri, { autoIndex: false });
  const loginLogs = await ensureTtlIndex('loginlogs', { timestamp: 1 }, 'timestamp_1', LOGIN_RETENTION_SECONDS);
  console.log(JSON.stringify({ loginlogs: loginLogs, retentionDays: 180 }));
}

run()
  .then(() => mongoose.disconnect())
  .catch(async error => {
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
