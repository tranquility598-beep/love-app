/**
 * Отметка «этот посетитель уже поставил сердечко» на публичной странице.
 *
 * Регистрации у посетителя нет, поэтому «кто» — это обезличенный хэш
 * (страница, IP, браузер). Сам IP не хранится: только ipHash, чтобы ограничить,
 * сколько сердечек может прийти с одного адреса (накрутка сменой браузера).
 *
 * Уникальный индекс делает отметку атомарной: из двух одновременных нажатий
 * одного посетителя вставку выиграет одно, и счётчик вырастет на единицу.
 * Отметка бессрочная — сердечко не «сгорает» через сутки, как просмотр.
 */

const mongoose = require('mongoose');

const profileHeartMarkSchema = new mongoose.Schema({
  page: { type: mongoose.Schema.Types.ObjectId, ref: 'ProfilePage', required: true },
  key: { type: String, required: true },
  ipHash: { type: String, required: true },
  // Место в квоте адреса: 0..HEARTS_PER_IP-1. Уникально вместе со страницей и
  // адресом — так потолок «не больше N с адреса» держит сама база, и два
  // одновременных нажатия не могут занять одно место (раньше счётчик
  // проверялся отдельно от вставки, и параллельные гости его обходили).
  slot: { type: Number, min: 0 },
  createdAt: { type: Date, default: Date.now }
}, { versionKey: false });

profileHeartMarkSchema.index({ page: 1, key: 1 }, { unique: true });
profileHeartMarkSchema.index(
  { page: 1, ipHash: 1, slot: 1 },
  { unique: true, partialFilterExpression: { slot: { $exists: true } } }
);

module.exports = mongoose.model('ProfileHeartMark', profileHeartMarkSchema);
