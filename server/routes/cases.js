const express = require('express');
const Case = require('../models/Case');
const ModerationAction = require('../models/ModerationAction');
const Message = require('../models/Message');
const Channel = require('../models/Channel');
const Server = require('../models/Server');
const authMiddleware = require('../middleware/auth');
const { communicationRestriction } = require('../services/moderationService');
const { createNotification } = require('../utils/notify');
const { publishAdminUpdate } = require('../services/adminRealtime');
const { MESSAGE_REPORT_TAXONOMY, resolveReportPath } = require('../config/messageReportTaxonomy');

const router = express.Router();

router.use((req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 300 && !res.locals.caseRealtimeHandled) {
      publishAdminUpdate('cases', { method: req.method });
      const io = req.app.get('io');
      if (io && req.user?._id) io.to(`user:${req.user._id}`).emit('support:updated', { at: new Date().toISOString() });
    }
  });
  next();
});

function realtimeCaseNote(note, author) {
  return {
    _id: String(note._id),
    body: note.body,
    internal: Boolean(note.internal),
    createdAt: note.createdAt,
    author: {
      _id: String(author._id),
      username: author.username,
      nickname: author.nickname,
      avatar: author.avatar,
      role: author.role
    }
  };
}

function cleanAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 10).map(file => ({
    name: String(file.name || 'file').slice(0, 255),
    url: safeAttachmentUrl(file.url),
    mimeType: String(file.mimeType || '').slice(0, 120),
    size: Math.max(0, Number(file.size) || 0),
    private: true
  })).filter(file => file.url);
}

function safeAttachmentUrl(value) {
  const url = String(value || '').trim();
  if (url.startsWith('/uploads/')) return url;
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch {
    return '';
  }
}

function scrubDiagnosticLog(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+\/-]+=*/gi, 'Bearer [REDACTED]')
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, '[REDACTED_JWT]')
    .replace(/(token|password|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .slice(0, 20000);
}

const IDEA_CATEGORIES = new Set([
  'messaging', 'voice', 'servers', 'profile', 'mobile', 'safety', 'accessibility', 'other'
]);

async function canReadMessage(userId, message) {
  const channel = await Channel.findById(message.channel).select('type participants server').lean();
  if (!channel) return false;
  if (channel.type === 'dm') {
    return channel.participants.some(participant => String(participant) === String(userId));
  }
  const serverId = message.server || channel.server;
  if (!serverId) return false;
  return Boolean(await Server.exists({
    _id: serverId,
    $or: [{ owner: userId }, { 'members.user': userId }]
  }));
}

router.get('/message-report-taxonomy', authMiddleware, (req, res) => {
  res.json({ categories: MESSAGE_REPORT_TAXONOMY });
});

router.post('/message-reports', authMiddleware, async (req, res) => {
  try {
    const messageId = String(req.body.messageId || '');
    const resolved = resolveReportPath(req.body.path);
    const description = String(req.body.description || '').trim();
    if (!resolved) return res.status(400).json({ message: 'Выберите точную причину жалобы' });
    if (resolved.descriptionRequired && description.length < 10) {
      return res.status(400).json({ message: 'Для этой причины добавьте описание не короче 10 символов' });
    }

    const message = await Message.findById(messageId)
      .populate('author', 'username nickname avatar')
      .lean();
    if (!message || message.deleted) return res.status(404).json({ message: 'Сообщение не найдено или уже удалено' });
    const messageAuthorId = message.author?._id || message.author;
    if (String(messageAuthorId) === String(req.user._id)) {
      return res.status(400).json({ message: 'Нельзя пожаловаться на собственное сообщение' });
    }
    if (!await canReadMessage(req.user._id, message)) {
      return res.status(403).json({ message: 'У вас нет доступа к этому сообщению' });
    }

    const item = await Case.create({
      kind: 'report',
      reporter: req.user._id,
      subjectUser: messageAuthorId,
      subjectServer: message.server || null,
      subjectMessage: message._id,
      title: resolved.labels.join(' · ').slice(0, 160),
      description: (description || resolved.labels.join(' → ')).slice(0, 10000),
      priority: resolved.severity,
      prioritySource: 'system',
      tags: ['message-report', ...resolved.ids.map(id => `reason:${id}`)],
      sourceKey: `message-report:${req.user._id}:${message._id}`,
      evidenceSnapshot: {
        messageId: message._id,
        author: {
          userId: messageAuthorId,
          username: message.author?.username || '',
          nickname: message.author?.nickname || '',
          avatar: message.author?.avatar || null
        },
        channel: message.channel,
        server: message.server || null,
        type: message.type || 'default',
        content: String(message.content || '').slice(0, 4000),
        attachments: (message.attachments || []).slice(0, 10).map(file => ({
          filename: file.originalName || file.filename || 'file',
          url: file.url,
          type: file.type,
          mimetype: file.mimetype,
          size: file.size
        })),
        createdAt: message.createdAt,
        edited: Boolean(message.edited),
        editedAt: message.editedAt || null,
        capturedAt: new Date()
      },
      activity: [{ actor: req.user._id, action: 'message_report_created', details: { path: resolved.ids } }]
    });
    res.status(201).json({ case: item, message: 'Жалоба отправлена команде модерации' });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'Вы уже пожаловались на это сообщение' });
    }
    console.error('[cases] message report:', error);
    res.status(400).json({ message: error.message || 'Не удалось отправить жалобу' });
  }
});

router.get('/mine', authMiddleware, async (req, res) => {
  try {
    const cases = await Case.find({ reporter: req.user._id })
      .select('-diagnostics -notes')
      .sort({ createdAt: -1 })
      .limit(100);
    res.json({ cases });
  } catch (error) {
    console.error('[cases] mine:', error);
    res.status(500).json({ message: 'Не удалось загрузить обращения' });
  }
});

router.get('/status', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const [actions, appeals] = await Promise.all([
      ModerationAction.find({
        targetUser: req.user._id,
        type: { $in: ['warning', 'mute', 'ban', 'deactivate', 'revoke'] }
      })
        .populate('issuedBy', 'username nickname role')
        .sort({ createdAt: -1 })
        .limit(200)
        .lean(),
      Case.find({ reporter: req.user._id, kind: 'appeal' })
        .select('moderationAction number status')
        .lean()
    ]);

    const reversed = new Set(
      actions
        .filter(action => action.type === 'revoke' && action.reverses)
        .map(action => String(action.reverses))
    );
    const visibleActions = actions.filter(action => action.type !== 'revoke').map(action => {
      const revoked = reversed.has(String(action._id));
      const active = !revoked && (action.permanent || !action.expiresAt || new Date(action.expiresAt) > now);
      const appeal = appeals.find(item => String(item.moderationAction) === String(action._id));
      return {
        _id: action._id,
        type: action.type,
        reason: action.reason,
        startsAt: action.startsAt,
        expiresAt: action.expiresAt,
        permanent: action.permanent,
        automatic: action.automatic,
        active,
        revoked,
        issuedBy: action.issuedBy ? {
          username: action.issuedBy.username,
          nickname: action.issuedBy.nickname,
          role: action.issuedBy.role
        } : null,
        appeal: appeal ? { _id: appeal._id, number: appeal.number, status: appeal.status } : null,
        canAppeal: active && !appeal && ['warning', 'mute', 'ban', 'deactivate'].includes(action.type)
      };
    });
    const warningCount = visibleActions.filter(action => action.type === 'warning' && action.active).length;
    const activeRestriction = visibleActions.find(
      action => ['deactivate', 'ban', 'mute'].includes(action.type) && action.active
    ) || null;
    const trustScore = Math.max(
      0,
      100
        - warningCount * 14
        - (activeRestriction?.type === 'mute' ? 15 : 0)
        - (['ban', 'deactivate'].includes(activeRestriction?.type) ? 35 : 0)
    );
    const reputation = warningCount === 0
      ? { label: 'Надёжный пользователь', tone: 'good' }
      : warningCount < 3
        ? { label: 'Есть предупреждения', tone: 'attention' }
        : { label: 'Нарушитель', tone: 'danger' };

    res.json({
      warningCount,
      thresholds: [
        { count: 3, consequence: 'Мут на 24 часа' },
        { count: 5, consequence: 'Бан на 7 дней' },
        { count: 7, consequence: 'Рассмотрение бессрочного бана' }
      ],
      trustScore,
      reputation,
      activeRestriction,
      actions: visibleActions
    });
  } catch (error) {
    console.error('[cases] moderation status:', error);
    res.status(500).json({ message: 'Не удалось загрузить сведения о нарушениях' });
  }
});

router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const item = await Case.findOne({ _id: req.params.id, reporter: req.user._id })
      .select('-diagnostics')
      .populate('notes.author', 'username nickname avatar staffRank');
    if (!item) return res.status(404).json({ message: 'Обращение не найдено' });
    item.notes = item.notes.filter(note => !note.internal);
    item.attachments = item.attachments.filter(file => !file.private || String(item.reporter) === String(req.user._id));
    res.json({ case: item });
  } catch (error) {
    console.error('[cases] details:', error);
    res.status(500).json({ message: 'Не удалось загрузить обращение' });
  }
});

router.post('/', authMiddleware, async (req, res) => {
  try {
    const kind = String(req.body.kind || 'support');
    if (!['report', 'bug', 'idea', 'support'].includes(kind)) {
      return res.status(400).json({ message: 'Неизвестный тип обращения' });
    }
    if (kind !== 'support') {
      const restriction = await communicationRestriction(req.user);
      if (restriction.blocked) return res.status(403).json({ code: 'COMMUNICATION_RESTRICTED', ...restriction });
    }
    const title = String(req.body.title || '').trim();
    const description = String(req.body.description || '').trim();
    if (title.length < 3 || description.length < 10) {
      return res.status(400).json({ message: 'Добавьте понятный заголовок и подробное описание' });
    }

    const diagnosticsConsent = Boolean(req.body.diagnosticsConsent);
    const allowedPriorities = ['low', 'normal', 'high', 'critical'];
    const reporterPriority = allowedPriorities.includes(req.body.priority) ? req.body.priority : 'normal';
    const ideaCategory = IDEA_CATEGORIES.has(req.body.category) ? req.body.category : 'other';
    const acceptsReporterPriority = kind === 'support' || kind === 'bug';
    const item = await Case.create({
      kind,
      reporter: req.user._id,
      subjectUser: req.body.subjectUser || null,
      subjectServer: req.body.subjectServer || null,
      subjectMessage: req.body.subjectMessage || null,
      title: title.slice(0, 160),
      description: description.slice(0, 10000),
      priority: kind === 'report' ? 'high' : (acceptsReporterPriority ? reporterPriority : 'normal'),
      prioritySource: acceptsReporterPriority ? 'reporter' : 'system',
      tags: Array.isArray(req.body.tags) ? req.body.tags.map(String).slice(0, 10) : [],
      attachments: cleanAttachments(req.body.attachments),
      diagnostics: diagnosticsConsent && kind === 'bug' ? {
        appVersion: String(req.body.diagnostics?.appVersion || '').slice(0, 50),
        platform: String(req.body.diagnostics?.platform || '').slice(0, 120),
        osVersion: String(req.body.diagnostics?.osVersion || '').slice(0, 120),
        safeLog: scrubDiagnosticLog(req.body.diagnostics?.safeLog)
      } : null,
      public: kind === 'idea' ? {
        published: false,
        status: 'under_review',
        summary: description.slice(0, 1000),
        category: ideaCategory
      } : undefined,
      activity: [{ actor: req.user._id, action: 'created' }]
    });
    res.status(201).json({ case: item });
  } catch (error) {
    console.error('[cases] create:', error);
    res.status(400).json({ message: error.message || 'Не удалось создать обращение' });
  }
});

router.post('/appeals', authMiddleware, async (req, res) => {
  try {
    const action = await ModerationAction.findOne({ _id: req.body.moderationAction, targetUser: req.user._id });
    if (!action || !['warning', 'mute', 'ban', 'deactivate'].includes(action.type)) {
      return res.status(404).json({ message: 'Наказание не найдено' });
    }
    const revoked = await ModerationAction.exists({ type: 'revoke', reverses: action._id });
    const active = !revoked && (action.permanent || !action.expiresAt || action.expiresAt > new Date());
    if (!active) {
      return res.status(409).json({ message: revoked ? 'Наказание уже снято, апелляция не требуется' : 'Срок наказания уже завершён' });
    }
    const existing = await Case.findOne({ kind: 'appeal', moderationAction: action._id });
    if (existing) return res.status(409).json({ message: 'Апелляция на это наказание уже создана', case: existing });
    const description = String(req.body.description || '').trim();
    if (description.length < 20) return res.status(400).json({ message: 'Опишите причину пересмотра подробнее' });

    const item = await Case.create({
      kind: 'appeal',
      reporter: req.user._id,
      subjectUser: req.user._id,
      moderationAction: action._id,
      title: `Апелляция на ${action.type}`,
      description: description.slice(0, 10000),
      priority: action.type === 'ban' || action.type === 'deactivate' ? 'high' : 'normal',
      activity: [{ actor: req.user._id, action: 'appeal_created' }]
    });
    res.status(201).json({ case: item });
  } catch (error) {
    console.error('[cases] appeal:', error);
    res.status(400).json({ message: error.message || 'Не удалось создать апелляцию' });
  }
});

router.post('/:id/replies', authMiddleware, async (req, res) => {
  try {
    const body = String(req.body.body || '').trim();
    if (!body) return res.status(400).json({ message: 'Ответ не может быть пустым' });
    const item = await Case.findOne({ _id: req.params.id, reporter: req.user._id });
    if (!item) return res.status(404).json({ message: 'Обращение не найдено' });
    if (['resolved', 'rejected', 'archived'].includes(item.status)) {
      return res.status(409).json({ message: 'Это обращение уже закрыто' });
    }
    if (!['support', 'appeal'].includes(item.kind)) {
      const restriction = await communicationRestriction(req.user);
      if (restriction.blocked) return res.status(403).json({ code: 'COMMUNICATION_RESTRICTED', ...restriction });
    }
    item.notes.push({ author: req.user._id, body, internal: false });
    item.status = 'triaged';
    item.activity.push({ actor: req.user._id, action: 'user_reply' });
    await item.save();
    const note = realtimeCaseNote(item.notes[item.notes.length - 1], req.user);
    res.locals.caseRealtimeHandled = true;
    publishAdminUpdate('cases', {
      kind: 'user_reply',
      caseId: String(item._id),
      note,
      status: item.status,
      updatedAt: item.updatedAt
    });
    if (item.assignedTo) {
      await createNotification(req.app.get('io'), {
        user: item.assignedTo,
        type: 'system',
        actor: req.user._id,
        actorName: req.user.username,
        preview: `Новый ответ в обращении ${item.number}`
      });
    }
    res.status(201).json({ note });
  } catch (error) {
    console.error('[cases] reply:', error);
    res.status(500).json({ message: 'Не удалось отправить ответ' });
  }
});

module.exports = router;
