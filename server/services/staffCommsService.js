const StaffConversation = require('../models/StaffConversation');
const StaffMessage = require('../models/StaffMessage');
const { roleLevel } = require('../config/adminRoles');

const STAFF_PUBLIC_FIELDS = 'username nickname avatar role status lastSeen';

function id(value) {
  return String(value?._id || value || '');
}

function directKey(first, second) {
  return `direct:${[id(first), id(second)].sort().join(':')}`;
}

async function getOrCreateGeneralConversation(createdBy) {
  let conversation = await StaffConversation.findOne({ key: 'general' });
  if (conversation) return conversation;
  try {
    conversation = await StaffConversation.create({
      type: 'general',
      key: 'general',
      title: 'Общий чат',
      participants: [],
      createdBy
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    conversation = await StaffConversation.findOne({ key: 'general' });
  }
  return conversation;
}

async function getOrCreateDirectConversation(firstUser, secondUser) {
  const key = directKey(firstUser, secondUser);
  let conversation = await StaffConversation.findOne({ key });
  if (conversation) return conversation;
  try {
    conversation = await StaffConversation.create({
      type: 'direct',
      key,
      participants: [id(firstUser), id(secondUser)],
      createdBy: id(firstUser)
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    conversation = await StaffConversation.findOne({ key });
  }
  return conversation;
}

function canAccessConversation(conversation, user) {
  if (!conversation || !user) return false;
  if (conversation.type === 'general') return roleLevel(user.role) >= 0;
  return (conversation.participants || []).some(participant => id(participant) === id(user));
}

function canSeeDeletedContent(user) {
  return roleLevel(user?.role) >= roleLevel('senior_admin');
}

function publicStaff(user) {
  if (!user) return null;
  const value = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  return {
    _id: id(value),
    username: value.username || '',
    nickname: value.nickname || '',
    avatar: value.avatar || '',
    role: value.role || 'user',
    status: value.status || 'offline',
    lastSeen: value.lastSeen || null
  };
}

function publicAttachment(attachment) {
  if (!attachment) return null;
  const value = typeof attachment.toObject === 'function' ? attachment.toObject() : attachment;
  return {
    _id: id(value),
    originalName: value.originalName,
    size: value.size,
    mimetype: value.mimetype,
    kind: value.kind,
    downloadUrl: `/api/admin/staff/attachments/${id(value)}/download`
  };
}

function publicMessage(message, viewer, nested = false) {
  if (!message) return null;
  const value = typeof message.toObject === 'function' ? message.toObject() : message;
  const deleted = Boolean(value.deletedAt);
  const revealDeleted = deleted && canSeeDeletedContent(viewer);
  const own = id(value.author) === id(viewer);
  const canModerate = roleLevel(viewer?.role) >= roleLevel('senior_admin');
  return {
    _id: id(value),
    conversation: id(value.conversation),
    author: publicStaff(value.author),
    content: deleted && !revealDeleted ? '' : value.content,
    attachments: deleted && !revealDeleted ? [] : (value.attachments || []).map(publicAttachment).filter(Boolean),
    replyTo: nested ? null : publicMessage(value.replyTo, viewer, true),
    editedAt: value.editedAt || null,
    deletedAt: value.deletedAt || null,
    deletedBy: value.deletedBy ? id(value.deletedBy) : null,
    deletedContentVisible: revealDeleted,
    canEdit: own && !deleted,
    canDelete: !deleted && (own || canModerate),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  };
}

function populateMessage(query) {
  return query
    .populate('author', STAFF_PUBLIC_FIELDS)
    .populate('attachments')
    .populate({
      path: 'replyTo',
      populate: [
        { path: 'author', select: STAFF_PUBLIC_FIELDS },
        { path: 'attachments' }
      ]
    });
}

async function loadPublicMessage(messageId, viewer) {
  const message = await populateMessage(StaffMessage.findById(messageId));
  return publicMessage(message, viewer);
}

function conversationEmitter(io, conversation) {
  let emitter = io.to(`admin:conversation:${id(conversation)}`);
  if (conversation.type === 'general') return emitter.to('admin:staff');
  for (const participant of conversation.participants || []) {
    emitter = emitter.to(`admin:user:${id(participant)}`);
  }
  return emitter;
}

function emitConversationEvent(io, conversation, event, payload) {
  if (!io || !conversation) return;
  conversationEmitter(io, conversation).emit(event, payload);
}

module.exports = {
  STAFF_PUBLIC_FIELDS,
  id,
  directKey,
  getOrCreateGeneralConversation,
  getOrCreateDirectConversation,
  canAccessConversation,
  canSeeDeletedContent,
  publicStaff,
  publicAttachment,
  publicMessage,
  populateMessage,
  loadPublicMessage,
  emitConversationEvent
};
