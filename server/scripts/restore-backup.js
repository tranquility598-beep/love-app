/**
 * Восстановление backup, созданного scripts/backup-admin-v1.js (формат mongodb-ejson-v1).
 *
 * Использование:
 *   node scripts/restore-backup.js <путь-к-каталогу-backup> [--apply]
 *
 * Без --apply выполняется dry-run: читается manifest и файлы, выводятся
 * коллекции и количество документов, база не изменяется.
 *
 * Целевая база:
 *   - по умолчанию MONGODB_URI из окружения/.env;
 *   - для restore drill задайте RESTORE_MONGODB_URI с ОТДЕЛЬНОЙ базой
 *     (например, love-app-restore-drill), чтобы не трогать production.
 *
 * ВНИМАНИЕ: --apply полностью перезаписывает перечисленные в manifest
 * коллекции целевой базы (deleteMany + insertMany).
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
require('dotenv').config();

const backupDir = process.argv[2] ? path.resolve(process.argv[2]) : null;
const apply = process.argv.includes('--apply');
const targetUri = process.env.RESTORE_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/love-app';

async function run() {
  if (!backupDir) {
    console.error('Usage: node scripts/restore-backup.js <backup-dir> [--apply]');
    process.exit(1);
  }

  const manifestPath = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`manifest.json не найден в ${backupDir}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.format !== 'mongodb-ejson-v1') {
    console.error(`Неподдерживаемый формат backup: ${manifest.format}`);
    process.exit(1);
  }

  // Читаем и валидируем все файлы до подключения к базе
  const plan = manifest.collections.map(({ name, filename, count }) => {
    const filePath = path.join(backupDir, filename);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Файл коллекции отсутствует: ${filePath}`);
    }
    const documents = EJSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (documents.length !== count) {
      throw new Error(`Несовпадение количества документов в ${filename}: manifest=${count}, file=${documents.length}`);
    }
    return { name, documents };
  });

  const total = plan.reduce((sum, item) => sum + item.documents.length, 0);
  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    backupCreatedAt: manifest.createdAt,
    sourceDatabase: manifest.database,
    collections: plan.map(({ name, documents }) => ({ name, count: documents.length })),
    totalDocuments: total
  }, null, 2));

  if (!apply) {
    console.log('Dry-run завершён. Для восстановления добавьте --apply.');
    return;
  }

  await mongoose.connect(targetUri, { autoIndex: false });
  const db = mongoose.connection.db;
  console.log(`Восстановление в базу: ${db.databaseName}`);

  for (const { name, documents } of plan) {
    await db.collection(name).deleteMany({});
    if (documents.length) {
      await db.collection(name).insertMany(documents, { ordered: true });
    }
    console.log(`  ${name}: ${documents.length} документов`);
  }

  console.log('Восстановление завершено.');
}

run()
  .then(() => mongoose.disconnect())
  .catch(async error => {
    console.error(error.message || error);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
