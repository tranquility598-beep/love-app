const crypto = require('crypto');
const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const StaffConversation = require('../models/StaffConversation');
const StaffMessage = require('../models/StaffMessage');
const StaffAttachment = require('../models/StaffAttachment');
const StaffEscalation = require('../models/StaffEscalation');
const { adminSessionAuth } = require('../middleware/adminSessionAuth');
const { isSupport } = require('../middleware/adminAuth');
const { ROLE_ORDER, ROLE_LABELS, canonicalRole, roleLevel, isStaffRole, canActOn } = require('../config/adminRoles');
const { validateFile, sanitizeFilename } = require('../utils/fileValidator');
const { logAudit } = require('../services/auditService');
const { publishAdminUpdate } = require('../services/adminRealtime');
const { voiceSnapshotForUser } = require('../socket/adminStaffSocket');
const {
  STAFF_PUBLIC_FIELDS,
  id,
  getOrCreateGeneralConversation,
  getOrCreateDirectConversation,
  canAccessConversation,
  publicStaff,
  publicMessage,
  populateMessage,
  loadPublicMessage,
  emitConversationEvent
} = require('../services/staffCommsService');

const router = express.Router();
const PRIVATE_UPLOAD_DIR = path.join(__dirname, '..', 'private-uploads', 'staff');
const MAX_STAFF_FILE_SIZE = 25 * 1024 * 1024;
const STAFF_FILE_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.txt', '.doc', '.docx',
  '.xls', '.xlsx', '.zip', '.rar', '.7z'
]);
const STAFF_FILE_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/plain',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip', 'application/x-rar-compressed', 'application/x-7z-compressed'
]);

router.use(adminSessionAuth, isSupport);

function staffIceServers() {
  const servers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ];
  const urls = String(process.env.STAFF_TURN_URLS || '')
    .split(',')
    .map(value => value.trim())
    .filter(value => /^(turns?|stun):/i.test(value));
  if (urls.length && process.env.STAFF_TURN_USERNAME && process.env.STAFF_TURN_CREDENTIAL) {
    servers.push({
      urls,
      username: process.env.STAFF_TURN_USERNAME,
      credential: process.env.STAFF_TURN_CREDENTIAL
    });
  }
  return servers;
}

router.get('/voice/rooms', (req, res) => {
  res.json({ rooms: voiceSnapshotForUser(req.user) });
});

router.get('/voice/ice-config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ iceServers: staffIceServers() });
});

function objectId(value) {
  return mongoose.Types.ObjectId.isValid(value) ? value : null;
}

async function loadConversation(value) {
  if (!objectId(value)) return null;
  return StaffConversation.findById(value);
}

function ensureConversationAccess(conversation, user) {
  if (!conversation) {
    const error = new Error('Служебный диалог не найден');
    error.status = 404;
    throw error;
  }
  if (!canAccessConversation(conversation, user)) {
    const error = new Error('У вас нет доступа к этому диалогу');
    error.status = 403;
    throw error;
  }
}

async function markConversationRead(conversation, userId, at = new Date()) {
  const readerId = new mongoose.Types.ObjectId(id(userId));
  const readAt = at instanceof Date ? at : new Date(at);
  await StaffConversation.updateOne({ _id: conversation._id }, [{
    $set: {
      readStates: {
        $concatArrays: [
          {
            $filter: {
              input: { $ifNull: ['$readStates', []] },
              as: 'state',
              cond: { $ne: ['$$state.user', readerId] }
            }
          },
          [{ user: readerId, readAt }]
        ]
      }
    }
  }]);
}

function publicEscalation(value) {
  const escalation = typeof value.toObject === 'function' ? value.toObject() : value;
  return {
    _id: id(escalation),
    number: escalation.number,
    createdBy: publicStaff(escalation.createdBy),
    requestedRole: escalation.requestedRole,
    requestedRoleLabel: ROLE_LABELS[escalation.requestedRole] || escalation.requestedRole,
    summary: escalation.summary,
    conversation: id(escalation.conversation),
    message: id(escalation.message),
    assignedTo: publicStaff(escalation.assignedTo),
    handoffConversation: id(escalation.handoffConversation),
    status: escalation.status,
    resolution: escalation.resolution,
    history: escalation.history || [],
    createdAt: escalation.createdAt,
    updatedAt: escalation.updatedAt
  };
}

async function populatedEscalation(query) {
  return query
    .populate('createdBy', STAFF_PUBLIC_FIELDS)
    .populate('assignedTo', STAFF_PUBLIC_FIELDS);
}

function emitEscalation(io, escalation, event = 'staff:escalation:updated') {
  if (!io || !escalation) return;
  const requestedLevel = roleLevel(escalation.requestedRole);
  io.to(`admin:user:${id(escalation.createdBy)}`)
    .to(`admin:eligible:${requestedLevel}`)
    .emit(event, { escalationId: id(escalation), at: new Date().toISOString() });
}

router.get('/members', async (req, res) => {
  try {
    const members = await User.find({ role: { $in: ROLE_ORDER } })
      .select(STAFF_PUBLIC_FIELDS)
      .sort({ role: 1, username: 1 });
    res.json({ members: members.map(publicStaff) });
  } catch (error) {
    console.error('[staff-comms] members:', error);
    res.status(500).json({ message: 'Не удалось загрузить команду' });
  }
});

router.get('/conversations', async (req, res) => {
  try {
    const general = await getOrCreateGeneralConversation(req.user._id);
    const conversations = await StaffConversation.find({
      $or: [{ _id: general._id }, { type: 'direct', participants: req.user._id }]
    })
      .populate('participants', STAFF_PUBLIC_FIELDS)
      .sort({ type: 1, lastMessageAt: -1 });

    const items = await Promise.all(conversations.map(async conversation => {
      const readAt = conversation.readStates?.find(item => id(item.user) === id(req.user))?.readAt || new Date(0);
      const [lastMessage, unreadCount] = await Promise.all([
        conversation.lastMessage ? loadPublicMessage(conversation.lastMessage, req.user) : null,
        StaffMessage.countDocuments({
          conversation: conversation._id,
          author: { $ne: req.user._id },
          createdAt: { $gt: readAt }
        })
      ]);
      return {
        _id: id(conversation),
        type: conversation.type,
        title: conversation.title,
        participants: conversation.participants.map(publicStaff),
        lastMessage,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount
      };
    }));
    res.json({ conversations: items });
  } catch (error) {
    console.error('[staff-comms] conversations:', error);
    res.status(500).json({ message: 'Не удалось загрузить служебные диалоги' });
  }
});

router.post('/conversations/direct', async (req, res) => {
  try {
    const targetId = objectId(req.body.userId);
    if (!targetId || id(targetId) === id(req.user)) return res.status(400).json({ message: 'Выберите другого сотрудника' });
    const target = await User.findById(targetId).select(STAFF_PUBLIC_FIELDS);
    if (!target || !isStaffRole(target.role)) return res.status(404).json({ message: 'Сотрудник не найден' });
    const conversation = await getOrCreateDirectConversation(req.user._id, target._id);
    await conversation.populate('participants', STAFF_PUBLIC_FIELDS);
    res.status(201).json({
      conversation: {
        _id: id(conversation),
        type: conversation.type,
        participants: conversation.participants.map(publicStaff),
        lastMessage: null,
        lastMessageAt: conversation.lastMessageAt,
        unreadCount: 0
      }
    });
  } catch (error) {
    console.error('[staff-comms] direct conversation:', error);
    res.status(500).json({ message: 'Не удалось открыть личный диалог' });
  }
});

router.get('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const conversation = await loadConversation(req.params.conversationId);
    ensureConversationAccess(conversation, req.user);
    const limit = Math.min(100, Math.max(20, Number.parseInt(req.query.limit, 10) || 50));
    const filter = { conversation: conversation._id };
    if (req.query.before && !Number.isNaN(Date.parse(req.query.before))) filter.createdAt = { $lt: new Date(req.query.before) };
    const messages = await populateMessage(StaffMessage.find(filter).sort({ createdAt: -1 }).limit(limit));
    await markConversationRead(conversation, req.user._id);
    res.json({
      messages: messages.reverse().map(message => publicMessage(message, req.user)),
      hasMore: messages.length === limit
    });
  } catch (error) {
    console.error('[staff-comms] messages:', error);
    res.status(error.status || 500).json({ message: error.message || 'Не удалось загрузить сообщения' });
  }
});

router.post('/conversations/:conversationId/read', async (req, res) => {
  try {
    const conversation = await loadConversation(req.params.conversationId);
    ensureConversationAccess(conversation, req.user);
    await markConversationRead(conversation, req.user._id);
    res.json({ ok: true });
  } catch (error) {
    console.error('[staff-comms] mark read:', error);
    res.status(error.status || 500).json({ message: error.message || 'Не удалось отметить сообщения прочитанными' });
  }
});

router.post('/conversations/:conversationId/attachments', async (req, res) => {
  let storedPath = '';
  try {
    const conversation = await loadConversation(req.params.conversationId);
    ensureConversationAccess(conversation, req.user);
    const file = req.files?.file;
    if (!file) return res.status(400).json({ message: 'Выберите файл' });
    try { file.name = Buffer.from(file.name, 'latin1').toString('utf8'); } catch {}
    const safeName = sanitizeFilename(file.name);
    const extension = path.extname(safeName).toLowerCase();
    if (!STAFF_FILE_EXTENSIONS.has(extension) || !STAFF_FILE_MIMES.has(file.mimetype)) {
      return res.status(400).json({ message: 'Этот тип файла запрещён для служебного чата' });
    }
    const validation = await validateFile(file, file.mimetype.startsWith('image/'), file.mimetype.startsWith('image/') ? 'image' : 'document', { maxSize: MAX_STAFF_FILE_SIZE });
    if (!validation.valid) return res.status(400).json({ message: validation.errors[0], errors: validation.errors });

    await fs.promises.mkdir(PRIVATE_UPLOAD_DIR, { recursive: true });
    const storageName = `${crypto.randomBytes(24).toString('hex')}${extension}`;
    storedPath = path.join(PRIVATE_UPLOAD_DIR, storageName);
    await file.mv(storedPath);
    const attachment = await StaffAttachment.create({
      conversation: conversation._id,
      uploadedBy: req.user._id,
      originalName: validation.sanitizedName,
      storageName,
      size: file.size,
      mimetype: file.mimetype,
      kind: file.mimetype.startsWith('image/') ? 'image' : ['.zip', '.rar', '.7z'].includes(extension) ? 'archive' : 'document'
    });
    res.status(201).json({
      attachment: {
        _id: id(attachment),
        originalName: attachment.originalName,
        size: attachment.size,
        mimetype: attachment.mimetype,
        kind: attachment.kind,
        downloadUrl: `/api/admin/staff/attachments/${id(attachment)}/download`
      }
    });
  } catch (error) {
    if (storedPath) fs.promises.unlink(storedPath).catch(() => {});
    console.error('[staff-comms] attachment upload:', error);
    res.status(error.status || 500).json({ message: error.message || 'Не удалось загрузить файл' });
  }
});

router.get('/attachments/:attachmentId/download', async (req, res) => {
  try {
    if (!objectId(req.params.attachmentId)) return res.status(404).json({ message: 'Файл не найден' });
    const attachment = await StaffAttachment.findById(req.params.attachmentId).populate('message');
    if (!attachment) return res.status(404).json({ message: 'Файл не найден' });
    const conversation = await loadConversation(attachment.conversation);
    ensureConversationAccess(conversation, req.user);
    if (!attachment.message && id(attachment.uploadedBy) !== id(req.user)) return res.status(403).json({ message: 'Файл ещё не прикреплён к сообщению' });
    if (attachment.message?.deletedAt && roleLevel(req.user.role) < roleLevel('senior_admin')) return res.status(404).json({ message: 'Файл удалён' });
    const filePath = path.join(PRIVATE_UPLOAD_DIR, attachment.storageName);
    try { await fs.promises.access(filePath, fs.constants.R_OK); } catch { return res.status(404).json({ message: 'Файл отсутствует в хранилище' }); }
    res.set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "sandbox; default-src 'none'"
    });
    if (req.query.inline === '1' && attachment.kind === 'image') {
      res.type(attachment.mimetype);
      res.set('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`);
      return res.sendFile(filePath);
    }
    return res.download(filePath, attachment.originalName);
  } catch (error) {
    console.error('[staff-comms] attachment download:', error);
    res.status(error.status || 500).json({ message: error.message || 'Не удалось скачать файл' });
  }
});

router.post('/conversations/:conversationId/messages', async (req, res) => {
  try {
    const conversation = await loadConversation(req.params.conversationId);
    ensureConversationAccess(conversation, req.user);
    const content = String(req.body.content || '').trim().slice(0, 8000);
    const attachmentIds = [...new Set(Array.isArray(req.body.attachmentIds) ? req.body.attachmentIds : [])]
      .filter(objectId)
      .slice(0, 10);
    if (!content && !attachmentIds.length) return res.status(400).json({ message: 'Напишите сообщение или прикрепите файл' });

    const attachments = attachmentIds.length ? await StaffAttachment.find({
      _id: { $in: attachmentIds },
      conversation: conversation._id,
      uploadedBy: req.user._id,
      message: null,
      expiresAt: { $gt: new Date() }
    }) : [];
    if (attachments.length !== attachmentIds.length) return res.status(400).json({ message: 'Одно из вложений недоступно или уже использовано' });

    let replyTo = null;
    if (req.body.replyTo) {
      replyTo = await StaffMessage.findOne({ _id: req.body.replyTo, conversation: conversation._id });
      if (!replyTo) return res.status(400).json({ message: 'Сообщение для ответа не найдено' });
    }

    const message = await StaffMessage.create({
      conversation: conversation._id,
      author: req.user._id,
      content,
      attachments: attachments.map(item => item._id),
      replyTo: replyTo?._id || null
    });
    if (attachments.length) {
      await StaffAttachment.updateMany(
        { _id: { $in: attachments.map(item => item._id) } },
        { $set: { message: message._id, expiresAt: null } }
      );
    }
    conversation.lastMessage = message._id;
    conversation.lastMessageAt = message.createdAt;
    await markConversationRead(conversation, req.user._id, message.createdAt);
    await logAudit({ req, actor: req.user, action: 'STAFF_MESSAGE_CREATE', targetType: 'staff_message', targetId: message._id, details: { conversation: id(conversation), attachmentCount: attachments.length } });
    const payload = await loadPublicMessage(message._id, req.user);
    emitConversationEvent(req.app.get('io'), conversation, 'staff:message:new', payload);
    publishAdminUpdate('staff_comms', { conversationId: id(conversation) });
    res.status(201).json({ message: payload });
  } catch (error) {
    console.error('[staff-comms] create message:', error);
    res.status(error.status || 500).json({ message: error.message || 'Не удалось отправить сообщение' });
  }
});

router.patch('/messages/:messageId', async (req, res) => {
  try {
    const message = objectId(req.params.messageId) ? await StaffMessage.findById(req.params.messageId).select('+revisions') : null;
    if (!message) return res.status(404).json({ message: 'Сообщение не найдено' });
    const conversation = await loadConversation(message.conversation);
    ensureConversationAccess(conversation, req.user);
    if (id(message.author) !== id(req.user)) return res.status(403).json({ message: 'Можно редактировать только свои сообщения' });
    if (message.deletedAt) return res.status(409).json({ message: 'Удалённое сообщение нельзя изменить' });
    const content = String(req.body.content || '').trim().slice(0, 8000);
    if (!content && !message.attachments.length) return res.status(400).json({ message: 'Сообщение не может быть пустым' });
    if (content === message.content) return res.json({ message: await loadPublicMessage(message._id, req.user) });
    message.revisions = [...(message.revisions || []).slice(-49), { content: message.content, editedAt: new Date(), editedBy: req.user._id }];
    message.content = content;
    message.editedAt = new Date();
    await message.save();
    await logAudit({ req, actor: req.user, action: 'STAFF_MESSAGE_EDIT', targetType: 'staff_message', targetId: message._id, details: { conversation: id(conversation) } });
    const payload = await loadPublicMessage(message._id, req.user);
    emitConversationEvent(req.app.get('io'), conversation, 'staff:message:updated', payload);
    publishAdminUpdate('staff_comms', { conversationId: id(conversation) });
    res.json({ message: payload });
  } catch (error) {
    console.error('[staff-comms] edit message:', error);
    res.status(error.status || 500).json({ message: error.message || 'Не удалось изменить сообщение' });
  }
});

router.delete('/messages/:messageId', async (req, res) => {
  try {
    const message = objectId(req.params.messageId) ? await StaffMessage.findById(req.params.messageId) : null;
    if (!message) return res.status(404).json({ message: 'Сообщение не найдено' });
    const conversation = await loadConversation(message.conversation);
    ensureConversationAccess(conversation, req.user);
    const own = id(message.author) === id(req.user);
    if (!own) {
      if (roleLevel(req.user.role) < roleLevel('senior_admin')) {
        return res.status(403).json({ message: 'Недостаточно прав для удаления чужого сообщения' });
      }
      const author = await User.findById(message.author).select('role username');
      if (!author || !canActOn(req.user, author)) {
        return res.status(403).json({ message: 'Нельзя удалить сообщение равного или более высокого сотрудника' });
      }
    }
    if (!message.deletedAt) {
      message.deletedAt = new Date();
      message.deletedBy = req.user._id;
      await message.save();
      await logAudit({ req, actor: req.user, action: own ? 'STAFF_MESSAGE_DELETE_OWN' : 'STAFF_MESSAGE_DELETE_MODERATION', targetType: 'staff_message', targetId: message._id, details: { conversation: id(conversation), author: id(message.author) } });
      emitConversationEvent(req.app.get('io'), conversation, 'staff:message:deleted', {
        messageId: id(message),
        conversationId: id(conversation),
        deletedAt: message.deletedAt,
        deletedBy: id(req.user)
      });
      publishAdminUpdate('staff_comms', { conversationId: id(conversation) });
    }
    res.json({ message: await loadPublicMessage(message._id, req.user) });
  } catch (error) {
    console.error('[staff-comms] delete message:', error);
    res.status(error.status || 500).json({ message: error.message || 'Не удалось удалить сообщение' });
  }
});

router.get('/escalations', async (req, res) => {
  try {
    const level = roleLevel(req.user.role);
    const eligibleRoles = ROLE_ORDER.slice(0, level + 1);
    const access = [
      { createdBy: req.user._id },
      { assignedTo: req.user._id },
      { status: 'open', requestedRole: { $in: eligibleRoles } }
    ];
    if (level >= roleLevel('senior_admin')) access.push({ _id: { $exists: true } });
    const escalations = await populatedEscalation(StaffEscalation.find({ $or: access }).sort({ status: 1, createdAt: -1 }).limit(200));
    res.json({ escalations: escalations.map(publicEscalation) });
  } catch (error) {
    console.error('[staff-comms] escalations:', error);
    res.status(500).json({ message: 'Не удалось загрузить передачи' });
  }
});

router.post('/escalations', async (req, res) => {
  try {
    const requestedRole = canonicalRole(req.body.requestedRole);
    const actorLevel = roleLevel(req.user.role);
    const requestedLevel = roleLevel(requestedRole);
    if (requestedLevel <= actorLevel || requestedLevel < 0) return res.status(400).json({ message: 'Передать ситуацию можно только сотруднику выше вашего ранга' });
    const summary = String(req.body.summary || '').trim().slice(0, 3000);
    if (summary.length < 10) return res.status(400).json({ message: 'Опишите ситуацию хотя бы в 10 символах' });
    let conversation = null;
    let linkedMessage = null;
    if (req.body.conversationId) {
      conversation = await loadConversation(req.body.conversationId);
      ensureConversationAccess(conversation, req.user);
      if (req.body.messageId) {
        linkedMessage = await StaffMessage.findOne({ _id: req.body.messageId, conversation: conversation._id });
        if (!linkedMessage) return res.status(400).json({ message: 'Связанное сообщение не найдено' });
      }
    }
    const number = `ESC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    let escalation = await StaffEscalation.create({
      number,
      createdBy: req.user._id,
      requestedRole,
      summary,
      conversation: conversation?._id || null,
      message: linkedMessage?._id || null,
      history: [{ action: 'created', actor: req.user._id, note: summary }]
    });
    await logAudit({ req, actor: req.user, action: 'STAFF_ESCALATION_CREATE', targetType: 'staff_escalation', targetId: escalation._id, details: { requestedRole, conversation: id(conversation) || null } });
    escalation = await populatedEscalation(StaffEscalation.findById(escalation._id));
    emitEscalation(req.app.get('io'), escalation, 'staff:escalation:new');
    publishAdminUpdate('staff_comms', { escalationId: id(escalation) });
    res.status(201).json({ escalation: publicEscalation(escalation) });
  } catch (error) {
    console.error('[staff-comms] create escalation:', error);
    res.status(error.status || 500).json({ message: error.message || 'Не удалось передать ситуацию' });
  }
});

router.post('/escalations/:escalationId/accept', async (req, res) => {
  try {
    const current = objectId(req.params.escalationId) ? await StaffEscalation.findById(req.params.escalationId) : null;
    if (!current) return res.status(404).json({ message: 'Передача не найдена' });
    if (current.status !== 'open') return res.status(409).json({ message: 'Эту передачу уже принял другой сотрудник' });
    if (roleLevel(req.user.role) < roleLevel(current.requestedRole)) return res.status(403).json({ message: 'Передача предназначена для более высокого ранга' });
    const handoff = await getOrCreateDirectConversation(current.createdBy, req.user._id);
    let escalation = await StaffEscalation.findOneAndUpdate(
      { _id: current._id, status: 'open' },
      {
        $set: { status: 'accepted', assignedTo: req.user._id, handoffConversation: handoff._id },
        $push: { history: { action: 'accepted', actor: req.user._id, note: String(req.body.note || '').slice(0, 2000) } }
      },
      { new: true }
    );
    if (!escalation) return res.status(409).json({ message: 'Эту передачу уже принял другой сотрудник' });
    await logAudit({ req, actor: req.user, action: 'STAFF_ESCALATION_ACCEPT', targetType: 'staff_escalation', targetId: escalation._id, details: { handoffConversation: id(handoff) } });
    escalation = await populatedEscalation(StaffEscalation.findById(escalation._id));
    emitEscalation(req.app.get('io'), escalation);
    publishAdminUpdate('staff_comms', { escalationId: id(escalation) });
    res.json({ escalation: publicEscalation(escalation) });
  } catch (error) {
    console.error('[staff-comms] accept escalation:', error);
    res.status(error.status || 500).json({ message: error.message || 'Не удалось принять передачу' });
  }
});

router.post('/escalations/:escalationId/resolve', async (req, res) => {
  try {
    let escalation = objectId(req.params.escalationId) ? await StaffEscalation.findById(req.params.escalationId) : null;
    if (!escalation) return res.status(404).json({ message: 'Передача не найдена' });
    const assignedToSelf = id(escalation.assignedTo) === id(req.user);
    const seniorCanResolve = roleLevel(req.user.role) >= roleLevel('senior_admin')
      && roleLevel(req.user.role) >= roleLevel(escalation.requestedRole)
      && (!escalation.assignedTo || canActOn(req.user, await User.findById(escalation.assignedTo).select('role')));
    const canResolve = assignedToSelf || seniorCanResolve;
    if (!canResolve) return res.status(403).json({ message: 'Завершить передачу может исполнитель или старший администратор' });
    if (!['accepted', 'open'].includes(escalation.status)) return res.status(409).json({ message: 'Передача уже закрыта' });
    const resolution = String(req.body.resolution || '').trim().slice(0, 3000);
    if (resolution.length < 5) return res.status(400).json({ message: 'Кратко опишите результат' });
    escalation.status = 'resolved';
    escalation.resolution = resolution;
    escalation.history.push({ action: 'resolved', actor: req.user._id, note: resolution });
    await escalation.save();
    await logAudit({ req, actor: req.user, action: 'STAFF_ESCALATION_RESOLVE', targetType: 'staff_escalation', targetId: escalation._id });
    escalation = await populatedEscalation(StaffEscalation.findById(escalation._id));
    emitEscalation(req.app.get('io'), escalation);
    publishAdminUpdate('staff_comms', { escalationId: id(escalation) });
    res.json({ escalation: publicEscalation(escalation) });
  } catch (error) {
    console.error('[staff-comms] resolve escalation:', error);
    res.status(error.status || 500).json({ message: error.message || 'Не удалось завершить передачу' });
  }
});

router.post('/escalations/:escalationId/cancel', async (req, res) => {
  try {
    let escalation = objectId(req.params.escalationId) ? await StaffEscalation.findById(req.params.escalationId) : null;
    if (!escalation) return res.status(404).json({ message: 'Передача не найдена' });
    if (id(escalation.createdBy) !== id(req.user) || escalation.status !== 'open') return res.status(403).json({ message: 'Отменить можно только свою непринятую передачу' });
    escalation.status = 'cancelled';
    escalation.history.push({ action: 'cancelled', actor: req.user._id, note: String(req.body.note || '').slice(0, 2000) });
    await escalation.save();
    await logAudit({ req, actor: req.user, action: 'STAFF_ESCALATION_CANCEL', targetType: 'staff_escalation', targetId: escalation._id });
    escalation = await populatedEscalation(StaffEscalation.findById(escalation._id));
    emitEscalation(req.app.get('io'), escalation);
    publishAdminUpdate('staff_comms', { escalationId: id(escalation) });
    res.json({ escalation: publicEscalation(escalation) });
  } catch (error) {
    console.error('[staff-comms] cancel escalation:', error);
    res.status(error.status || 500).json({ message: error.message || 'Не удалось отменить передачу' });
  }
});

module.exports = router;
