const MESSAGE_REPORT_TAXONOMY = Object.freeze([
  {
    id: 'spam',
    label: 'Спам и обман',
    description: 'Навязчивые сообщения, реклама, мошенничество или вредные ссылки',
    children: [
      { id: 'repeated_messages', label: 'Повторяющиеся сообщения' },
      { id: 'unsolicited_ads', label: 'Нежелательная реклама' },
      { id: 'scam', label: 'Мошенничество', children: [
        { id: 'money', label: 'Просит деньги или данные оплаты', descriptionRequired: true },
        { id: 'account', label: 'Пытается украсть аккаунт' },
        { id: 'links', label: 'Подозрительная ссылка' }
      ] },
      { id: 'bot_activity', label: 'Подозрительная автоматическая рассылка' }
    ]
  },
  {
    id: 'abuse',
    label: 'Оскорбления и травля',
    description: 'Унижение, преследование, угрозы или дискриминация',
    children: [
      { id: 'harassment', label: 'Травля и преследование', children: [
        { id: 'insults', label: 'Оскорбления' },
        { id: 'stalking', label: 'Навязчивое преследование', descriptionRequired: true },
        { id: 'threats', label: 'Угрозы', descriptionRequired: true, severity: 'critical' }
      ] },
      { id: 'hate', label: 'Язык ненависти', children: [
        { id: 'identity', label: 'Атака по признаку личности', descriptionRequired: true },
        { id: 'dehumanization', label: 'Дегуманизация или призыв к насилию', severity: 'critical' }
      ] },
      { id: 'bullying', label: 'Публичное унижение или насмешки' }
    ]
  },
  {
    id: 'sexual',
    label: 'Материалы 18+',
    description: 'Сексуальный контент, домогательства или материалы с несовершеннолетними',
    children: [
      { id: 'explicit_content', label: 'Откровенный контент', children: [
        { id: 'image_video', label: 'Изображение или видео' },
        { id: 'text_link', label: 'Текст или ссылка' }
      ] },
      { id: 'sexual_harassment', label: 'Сексуальные домогательства', descriptionRequired: true },
      { id: 'minors', label: 'Контент с несовершеннолетними', descriptionRequired: true, severity: 'critical' }
    ]
  },
  {
    id: 'violence',
    label: 'Насилие и опасность',
    description: 'Угрозы жизни, жестокий контент или риск причинения вреда',
    children: [
      { id: 'credible_threat', label: 'Реальная угроза человеку', descriptionRequired: true, severity: 'critical' },
      { id: 'graphic_content', label: 'Шокирующий или жестокий контент' },
      { id: 'self_harm', label: 'Самоповреждение или суицид', descriptionRequired: true, severity: 'critical' }
    ]
  },
  {
    id: 'privacy',
    label: 'Личные данные',
    description: 'Раскрытие данных, выдача себя за другого или нарушение приватности',
    children: [
      { id: 'doxxing', label: 'Публикация личных данных', descriptionRequired: true, severity: 'critical' },
      { id: 'private_media', label: 'Публикация приватных фото или файлов', descriptionRequired: true },
      { id: 'impersonation', label: 'Выдаёт себя за другого человека', descriptionRequired: true }
    ]
  },
  {
    id: 'illegal',
    label: 'Запрещённые действия',
    description: 'Незаконные товары, экстремизм или организация преступления',
    children: [
      { id: 'fraud', label: 'Финансовое мошенничество', descriptionRequired: true },
      { id: 'drugs_weapons', label: 'Наркотики или оружие', descriptionRequired: true },
      { id: 'extremism', label: 'Экстремизм или терроризм', descriptionRequired: true, severity: 'critical' }
    ]
  },
  {
    id: 'other',
    label: 'Другая проблема',
    description: 'Причина не подходит ни к одной категории',
    descriptionRequired: true
  }
]);

function resolveReportPath(path) {
  if (!Array.isArray(path) || path.length < 1 || path.length > 3) return null;
  let choices = MESSAGE_REPORT_TAXONOMY;
  const nodes = [];
  for (const rawId of path) {
    const id = String(rawId || '').trim();
    const node = choices.find(item => item.id === id);
    if (!node) return null;
    nodes.push(node);
    choices = node.children || [];
  }
  const leaf = nodes[nodes.length - 1];
  if (leaf.children?.length) return null;
  return {
    nodes,
    ids: nodes.map(node => node.id),
    labels: nodes.map(node => node.label),
    descriptionRequired: Boolean(leaf.descriptionRequired),
    severity: nodes.some(node => node.severity === 'critical') ? 'critical' : 'high'
  };
}

module.exports = { MESSAGE_REPORT_TAXONOMY, resolveReportPath };
