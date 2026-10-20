/**
 * Отметка «этот посетитель уже засчитан сегодня» для публичной страницы.
 *
 * Раньше дедупликация жила только в памяти процесса: каждый перезапуск
 * сервера (деплой, рестарт PM2, локальный npm start) и каждый второй процесс
 * PM2 считали того же человека заново — владелец видел десяток «просмотров»
 * от самого себя за один день. Отметка в базе переживает и то и другое.
 *
 * key — обезличенный хэш (IP, браузер, ник, день), сам IP здесь не хранится.
 * Документ живёт двое суток: дольше одного дня он не нужен, запас — на
 * часовые пояса и на TTL-монитор MongoDB, который чистит раз в минуту.
 */

const mongoose = require('mongoose');

const profileViewMarkSchema = new mongoose.Schema({
  page: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfilePage', required: true },
  day: { type: String, required: true },
  key: { type: String, required: true },
  createdAt: { type: Date, default: Date.now, expires: 2 * 24 * 60 * 60 }
}, { versionKey: false });

// Уникальность — то, что делает отметку атомарной: из двух одновременных
// запросов одного посетителя вставку выиграет только один.
profileViewMarkSchema.index({ page: 1, day: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('ProfileViewMark', profileViewMarkSchema);
