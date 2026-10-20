/**
 * Что именно не так в профиле — первый шаг жалобы на профиль
 * (POST /api/cases/profile-reports). Причина выбирается дальше из того же
 * дерева, что и у жалоб на сообщения (config/messageReportTaxonomy.js).
 *
 * field — откуда брать значение для снимка доказательств: модератор должен
 * видеть профиль таким, каким его видел пожаловавшийся, даже если автор
 * успел всё поменять.
 */
const PROFILE_REPORT_PARTS = Object.freeze([
  { id: 'avatar', label: 'Аватар', field: 'avatar' },
  { id: 'name', label: 'Имя или ник', field: 'nickname' },
  { id: 'bio', label: 'Описание «О себе»', field: 'bio' },
  { id: 'status', label: 'Статус или настроение', field: 'customStatus' },
  { id: 'listening', label: '«Сейчас слушает»', field: 'listening' },
  { id: 'hobbies', label: 'Увлечения', field: 'hobbies' },
  { id: 'whole', label: 'Профиль целиком', field: null }
]);

function findProfileReportPart(id) {
  return PROFILE_REPORT_PARTS.find(part => part.id === id) || null;
}

module.exports = { PROFILE_REPORT_PARTS, findProfileReportPart };
