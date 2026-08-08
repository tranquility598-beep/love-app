const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { EJSON } = require('bson');
require('dotenv').config();

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/love-app';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputRoot = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.resolve(__dirname, '..', '..', '..', `Love-backups/admin-v1-${stamp}`);

async function run() {
  await mongoose.connect(uri, { autoIndex: false });
  fs.mkdirSync(outputRoot, { recursive: true });

  const collections = await mongoose.connection.db.listCollections({}, { nameOnly: true }).toArray();
  const manifest = {
    format: 'mongodb-ejson-v1',
    createdAt: new Date().toISOString(),
    database: mongoose.connection.name,
    collections: []
  };

  for (const { name } of collections.sort((a, b) => a.name.localeCompare(b.name))) {
    const documents = await mongoose.connection.db.collection(name).find({}).toArray();
    const filename = `${name}.ejson`;
    fs.writeFileSync(path.join(outputRoot, filename), EJSON.stringify(documents, null, 2), 'utf8');
    manifest.collections.push({ name, filename, count: documents.length });
  }

  fs.writeFileSync(path.join(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  console.log(JSON.stringify({ outputRoot, collections: manifest.collections }, null, 2));
}

run()
  .then(() => mongoose.disconnect())
  .catch(async error => {
    console.error(error);
    await mongoose.disconnect().catch(() => {});
    process.exitCode = 1;
  });
