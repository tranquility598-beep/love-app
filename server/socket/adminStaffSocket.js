const AdminSession = require('../models/AdminSession');
const User = require('../models/User');
const StaffConversation = require('../models/StaffConversation');
const { ROLE_ORDER, ROLE_LABELS, canonicalRole, roleLevel, isStaffRole } = require('../config/adminRoles');
const { canAccessConversation, id, publicStaff } = require('../services/staffCommsService');
const { logAudit } = require('../services/auditService');

const SESSION_IDLE_MS = 30 * 60 * 1000;
const VOICE_ROOMS = Object.freeze([
  { id: 'support', label: 'Support', labelEn: 'Support', minRole: 'support' },
  { id: 'moderators', label: 'Модераторы', labelEn: 'Moderators', minRole: 'junior_moderator' },
  { id: 'admins', label: 'Администраторы', labelEn: 'Administrators', minRole: 'junior_admin' },
  { id: 'leadership', label: 'Руководство', labelEn: 'Leadership', minRole: 'senior_admin' }
]);

const voiceMembers = new Map(VOICE_ROOMS.map(room => [room.id, new Map()]));
const temporaryVoiceGrants = new Map();

function grantKey(userId, roomId) {
  return `${id(userId)}:${roomId}`;
}

function roomConfig(roomId) {
  return VOICE_ROOMS.find(room => room.id === roomId) || null;
}

function hasGrant(userId, roomId) {
  const grant = temporaryVoiceGrants.get(grantKey(userId, roomId));
  if (!grant) return false;
  if (grant.expiresAt <= Date.now()) {
    temporaryVoiceGrants.delete(grantKey(userId, roomId));
    return false;
  }
  return true;
}

function mayJoinVoice(user, roomId) {
  const room = roomConfig(roomId);
  return Boolean(room) && (roleLevel(user.role) >= roleLevel(room.minRole) || hasGrant(user._id, roomId));
}

function publicVoiceMember(member) {
  return {
    socketId: member.socketId,
    user: member.user,
    muted: member.muted,
    deafened: member.deafened,
    speaking: member.speaking
  };
}

function voiceSnapshot(viewer) {
  return VOICE_ROOMS.map(room => ({
    ...room,
    canJoin: mayJoinVoice(viewer, room.id),
    members: [...voiceMembers.get(room.id).values()].map(publicVoiceMember)
  }));
}

function broadcastVoiceSnapshot(io) {
  for (const room of VOICE_ROOMS) {
    io.to(`admin:voice:${room.id}`).emit('staff:voice:members', {
      roomId: room.id,
      members: [...voiceMembers.get(room.id).values()].map(publicVoiceMember)
    });
  }
  io.to('admin:staff').emit('staff:voice:changed', { at: new Date().toISOString() });
}

function leaveVoice(io, socket, notify = true) {
  let leftRoom = null;
  for (const room of VOICE_ROOMS) {
    const members = voiceMembers.get(room.id);
    if (!members.delete(socket.id)) continue;
    leftRoom = room.id;
    socket.leave(`admin:voice:${room.id}`);
    io.to(`admin:voice:${room.id}`).emit('staff:voice:user-left', { roomId: room.id, socketId: socket.id, userId: id(socket.user) });
  }
  if (leftRoom && notify) broadcastVoiceSnapshot(io);
  return leftRoom;
}

function sameVoiceRoom(firstSocketId, secondSocketId, roomId) {
  const members = voiceMembers.get(roomId);
  return Boolean(members?.has(firstSocketId) && members.has(secondSocketId));
}

function voiceMembership(socketId) {
  for (const room of VOICE_ROOMS) {
    const member = voiceMembers.get(room.id)?.get(socketId);
    if (member) return { roomId: room.id, member };
  }
  return null;
}

async function validateSession(socket, touch = false) {
  const session = await AdminSession.findOne({ _id: socket.adminSessionId, revokedAt: null }).populate('user');
  const now = Date.now();
  if (!session || !session.user || session.expiresAt.getTime() <= now) return null;
  if (now - session.lastSeenAt.getTime() > SESSION_IDLE_MS) return null;
  if (!isStaffRole(session.user.role) || !session.user.adminTotpEnabled || session.user.isBanned || session.user.deactivatedAt) return null;
  if (session.user.adminPolicyRequiredVersion
    && session.user.adminPolicyAcceptedVersion !== session.user.adminPolicyRequiredVersion) return null;
  if (canonicalRole(session.user.role) !== canonicalRole(socket.user.role)) return null;
  if (touch && now - session.lastSeenAt.getTime() > 60 * 1000) {
    session.lastSeenAt = new Date();
    await session.save();
  }
  return session;
}

async function loadTargetStaff(userId) {
  if (!userId) return null;
  const user = await User.findById(userId).select('username nickname avatar role status lastSeen adminTotpEnabled');
  return user && isStaffRole(user.role) ? user : null;
}

function acknowledgement(callback, payload) {
  if (typeof callback === 'function') callback(payload);
}

module.exports = function registerAdminStaffSocket(io, socket) {
  const userId = id(socket.user);
  const level = roleLevel(socket.user.role);
  socket.join('admin:staff');
  socket.join(`admin:user:${userId}`);
  for (let index = 0; index <= level; index += 1) socket.join(`admin:eligible:${index}`);
  socket.emit('staff:ready', { user: publicStaff(socket.user), rooms: voiceSnapshot(socket.user) });
  socket.to('admin:staff').emit('staff:presence', { userId, online: true, at: new Date().toISOString() });

  let lastAuthCheck = 0;
  socket.use(async ([event, ...args], next) => {
    if (!String(event).startsWith('staff:')) return next();
    try {
      const now = Date.now();
      if (now - lastAuthCheck < 30_000) return next();
      const session = await validateSession(socket, true);
      if (!session) {
        acknowledgement(args.find(value => typeof value === 'function'), { status: 'error', code: 'ADMIN_SESSION_EXPIRED' });
        socket.emit('staff:session-expired');
        return socket.disconnect(true);
      }
      lastAuthCheck = now;
      next();
    } catch (error) {
      next(error);
    }
  });

  const sessionTimer = setInterval(async () => {
    try {
      if (!await validateSession(socket, false)) {
        socket.emit('staff:session-expired');
        socket.disconnect(true);
      }
    } catch {
      socket.disconnect(true);
    }
  }, 60_000);

  socket.on('staff:conversation:join', async ({ conversationId } = {}, callback) => {
    try {
      const conversation = await StaffConversation.findById(conversationId);
      if (!canAccessConversation(conversation, socket.user)) return acknowledgement(callback, { status: 'error', message: 'Нет доступа к диалогу' });
      socket.join(`admin:conversation:${id(conversation)}`);
      acknowledgement(callback, { status: 'ok' });
    } catch (error) {
      acknowledgement(callback, { status: 'error', message: error.message });
    }
  });

  socket.on('staff:conversation:leave', ({ conversationId } = {}) => {
    if (conversationId) socket.leave(`admin:conversation:${conversationId}`);
  });

  socket.on('staff:typing', async ({ conversationId, active } = {}) => {
    try {
      const conversation = await StaffConversation.findById(conversationId);
      if (!canAccessConversation(conversation, socket.user)) return;
      socket.to(`admin:conversation:${id(conversation)}`).emit('staff:typing', {
        conversationId: id(conversation),
        user: publicStaff(socket.user),
        active: Boolean(active)
      });
    } catch {}
  });

  socket.on('staff:voice:list', (payload, callback) => {
    const acknowledge = typeof payload === 'function' ? payload : callback;
    acknowledgement(acknowledge, { status: 'ok', rooms: voiceSnapshot(socket.user) });
  });

  socket.on('staff:voice:join', ({ roomId } = {}, callback) => {
    const room = roomConfig(roomId);
    if (!room) return acknowledgement(callback, { status: 'error', message: 'Комната не найдена' });
    if (!mayJoinVoice(socket.user, roomId)) return acknowledgement(callback, { status: 'error', message: 'Эта комната недоступна для вашего ранга' });
    leaveVoice(io, socket, false);
    const members = voiceMembers.get(roomId);
    const existingMembers = [...members.values()].map(publicVoiceMember);
    const member = { socketId: socket.id, user: publicStaff(socket.user), muted: false, deafened: false, speaking: false };
    members.set(socket.id, member);
    socket.join(`admin:voice:${roomId}`);
    socket.to(`admin:voice:${roomId}`).emit('staff:voice:user-joined', { roomId, member: publicVoiceMember(member) });
    acknowledgement(callback, { status: 'ok', roomId, existingMembers, rooms: voiceSnapshot(socket.user) });
    broadcastVoiceSnapshot(io);
  });

  socket.on('staff:voice:leave', (_payload, callback) => {
    const roomId = leaveVoice(io, socket);
    acknowledgement(callback, { status: 'ok', roomId });
  });

  socket.on('staff:voice:mute', ({ roomId, muted } = {}) => {
    const member = voiceMembers.get(roomId)?.get(socket.id);
    if (!member) return;
    member.muted = Boolean(muted);
    io.to(`admin:voice:${roomId}`).emit('staff:voice:member-state', { roomId, socketId: socket.id, muted: member.muted, deafened: member.deafened });
  });

  socket.on('staff:voice:deafen', ({ roomId, deafened } = {}) => {
    const member = voiceMembers.get(roomId)?.get(socket.id);
    if (!member) return;
    member.deafened = Boolean(deafened);
    io.to(`admin:voice:${roomId}`).emit('staff:voice:member-state', { roomId, socketId: socket.id, muted: member.muted, deafened: member.deafened });
  });

  socket.on('staff:voice:speaking', ({ roomId, speaking } = {}) => {
    const member = voiceMembers.get(roomId)?.get(socket.id);
    if (!member) return;
    member.speaking = Boolean(speaking);
    socket.to(`admin:voice:${roomId}`).emit('staff:voice:speaking', { roomId, socketId: socket.id, speaking: member.speaking });
  });

  for (const signal of ['offer', 'answer', 'ice']) {
    socket.on(`staff:voice:${signal}`, ({ roomId, targetSocketId, data } = {}) => {
      if (!roomId || !targetSocketId || !data || !sameVoiceRoom(socket.id, targetSocketId, roomId)) return;
      io.to(targetSocketId).emit(`staff:voice:${signal}`, { roomId, fromSocketId: socket.id, data });
    });
  }

  async function grantVoiceAccess(payload, callback, mode) {
    try {
      const { roomId, targetUserId, targetSocketId } = payload || {};
      const room = roomConfig(roomId);
      const actorMembership = voiceMembership(socket.id);
      const target = await loadTargetStaff(targetUserId);
      if (!room || !actorMembership || !target) return acknowledgement(callback, { status: 'error', message: 'Сначала войдите в голосовую комнату и выберите сотрудника' });
      if (!mayJoinVoice(socket.user, roomId)) return acknowledgement(callback, { status: 'error', message: 'Вы не можете управлять этой голосовой комнатой' });
      if (roleLevel(socket.user.role) <= roleLevel(target.role)) return acknowledgement(callback, { status: 'error', message: 'Приглашать или перемещать можно только нижестоящего сотрудника' });
      const targetSocket = targetSocketId ? io.sockets.sockets.get(targetSocketId) : null;
      const targetMembership = targetSocketId ? voiceMembership(targetSocketId) : null;
      if (mode === 'move' && (!targetSocket || !targetMembership || id(targetSocket.user) !== id(target))) {
        return acknowledgement(callback, { status: 'error', message: 'Участник уже вышел из голосовой комнаты' });
      }
      if (mode === 'move' && targetMembership.roomId === roomId) return acknowledgement(callback, { status: 'ok', roomId });
      const expiresAt = Date.now() + 2 * 60 * 60 * 1000;
      temporaryVoiceGrants.set(grantKey(target._id, roomId), { invitedBy: userId, expiresAt });
      const event = mode === 'move' ? 'staff:voice:moved' : 'staff:voice:invited';
      const destination = mode === 'move' ? targetSocketId : `admin:user:${id(target)}`;
      io.to(destination).emit(event, {
        room: { ...room, canJoin: true },
        invitedBy: publicStaff(socket.user),
        expiresAt: new Date(expiresAt).toISOString()
      });
      if (mode === 'move') leaveVoice(io, targetSocket);
      await logAudit({ actor: socket.user, action: mode === 'move' ? 'STAFF_VOICE_MOVE' : 'STAFF_VOICE_INVITE', targetType: 'staff_voice', targetId: target._id, details: { roomId, fromRoomId: targetMembership?.roomId || null } });
      acknowledgement(callback, { status: 'ok', roomId });
    } catch (error) {
      acknowledgement(callback, { status: 'error', message: error.message });
    }
  }

  socket.on('staff:voice:invite', (payload, callback) => grantVoiceAccess(payload, callback, 'invite'));
  socket.on('staff:voice:move', (payload, callback) => grantVoiceAccess(payload, callback, 'move'));

  socket.on('staff:voice:kick', async ({ targetUserId, targetSocketId } = {}, callback) => {
    try {
      const actorMembership = voiceMembership(socket.id);
      const targetSocket = targetSocketId ? io.sockets.sockets.get(targetSocketId) : null;
      const targetMembership = targetSocketId ? voiceMembership(targetSocketId) : null;
      const target = await loadTargetStaff(targetUserId);
      if (!actorMembership) return acknowledgement(callback, { status: 'error', message: 'Сначала войдите в голосовую комнату' });
      if (!targetSocket || !targetMembership || !target || id(targetSocket.user) !== id(target)) {
        return acknowledgement(callback, { status: 'error', message: 'Участник уже вышел из голосовой комнаты' });
      }
      if (roleLevel(socket.user.role) <= roleLevel(target.role)) {
        return acknowledgement(callback, { status: 'error', message: 'Выгнать можно только нижестоящего сотрудника' });
      }
      io.to(targetSocketId).emit('staff:voice:kicked', { by: publicStaff(socket.user) });
      leaveVoice(io, targetSocket);
      await logAudit({ actor: socket.user, action: 'STAFF_VOICE_KICK', targetType: 'staff_voice', targetId: target._id, details: { roomId: targetMembership.roomId } });
      acknowledgement(callback, { status: 'ok' });
    } catch (error) {
      acknowledgement(callback, { status: 'error', message: error.message });
    }
  });

  socket.on('disconnect', () => {
    clearInterval(sessionTimer);
    leaveVoice(io, socket);
    socket.to('admin:staff').emit('staff:presence', { userId, online: false, at: new Date().toISOString() });
  });
};

module.exports.VOICE_ROOMS = VOICE_ROOMS;
module.exports.voiceSnapshotForUser = voiceSnapshot;
