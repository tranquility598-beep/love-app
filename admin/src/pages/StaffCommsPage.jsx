import {
  ArrowRight, ArrowUpRight, Check, Download, Edit3, FileText, Headphones,
  LoaderCircle, LockKeyhole, MessageCircle, MessageSquarePlus, Mic, MicOff,
  Paperclip, PhoneOff, RefreshCw, Reply, Search, Send, ShieldAlert, Trash2, UserPlus, UserX,
  UsersRound, Volume2, VolumeX, X
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { API_ORIGIN, api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import { Avatar, Badge, EmptyState, ErrorState, Modal, Notice, PageHeader } from '../components/ui.jsx';
import { useLocale } from '../i18n/useLocale.js';
import { useAdminSocket } from '../realtime/useAdminSocket.js';
import { useStaffVoice } from '../realtime/useStaffVoice.js';

const ROLE_ORDER = ['support', 'junior_moderator', 'senior_moderator', 'junior_admin', 'senior_admin', 'deputy_developer', 'developer'];
const ROLE_LABELS = {
  support: 'Support', junior_moderator: 'Младший модератор', senior_moderator: 'Старший модератор',
  junior_admin: 'Младший администратор', senior_admin: 'Старший администратор',
  deputy_developer: 'Зам. разработчика', developer: 'Разработчик'
};

const copy = {
  ru: {
    title: 'Связь', description: 'Рабочие чаты, передача сложных ситуаций и голосовые комнаты команды',
    general: 'Общий чат', direct: 'Личные сообщения', newChat: 'Новый диалог', searchStaff: 'Найти сотрудника',
    noDialogs: 'Личных диалогов пока нет', chooseDialog: 'Выберите диалог', chooseDialogText: 'Откройте общий чат или начните личный диалог с сотрудником.',
    composer: 'Написать команде', send: 'Отправить', attach: 'Прикрепить файл', reply: 'Ответить', edit: 'Изменить', remove: 'Удалить',
    edited: 'изменено', deleted: 'Сообщение удалено', deletedVisible: 'Удалено. Исходник доступен по вашему рангу.',
    cancel: 'Отмена', save: 'Сохранить', files: 'Вложения', typing: 'печатает', realtime: 'В реальном времени', reconnecting: 'Восстанавливаем связь',
    escalations: 'Передачи выше', escalate: 'Передать выше', escalationText: 'Опишите проверенные факты и вопрос, который выходит за ваши полномочия.',
    requestedRole: 'Минимальный ранг', summary: 'Описание ситуации', createEscalation: 'Создать передачу', accept: 'Принять', resolve: 'Завершить',
    resolution: 'Как решена ситуация', noEscalations: 'Нет активных передач', openChat: 'Открыть диалог',
    voice: 'Войс команды', join: 'Войти', leave: 'Выйти', locked: 'Недоступно для ранга', invite: 'Пригласить', move: 'Переместить',
    voiceInvite: 'Вас пригласили в голосовую комнату', acceptInvite: 'Войти в комнату', microphoneError: 'Не удалось подключить микрофон',
    voiceConnectionFailed: 'Не удалось установить голосовое соединение', enableAudio: 'Включить звук', reconnectVoice: 'Переподключить голос',
    voiceConnected: 'Голос подключён', voiceConnecting: 'Соединяем участников', voiceAlone: 'Вы один в комнате', mute: 'Выключить микрофон', unmute: 'Включить микрофон', deafen: 'Выключить звук', undeafen: 'Включить звук',
    invitedToVoice: 'Приглашение в голосовую комнату отправлено', movedToVoice: 'Сотрудник перемещён', kickedFromVoice: 'Сотрудник отключён от войса',
    moveToRoom: 'Переместить в комнату', kickFromVoice: 'Выгнать из войса', voiceUnstable: 'Нестабильное голосовое соединение', voiceKicked: 'Вас отключил старший сотрудник',
    deleteTitle: 'Удалить сообщение?', deleteText: 'Остальные сотрудники увидят заглушку. Старший администратор и выше сохранят доступ к исходнику для проверки злоупотреблений.',
    attachmentHint: 'До 25 МБ: изображения, PDF, документы и архивы.', uploadFailed: 'Не удалось загрузить вложение',
    selectStaff: 'Выберите сотрудника', online: 'в сети', offline: 'не в сети', retry: 'Повторить подключение'
  },
  en: {
    title: 'Communications', description: 'Staff chats, escalation and role-gated voice rooms',
    general: 'General chat', direct: 'Direct messages', newChat: 'New conversation', searchStaff: 'Find staff',
    noDialogs: 'No direct conversations yet', chooseDialog: 'Choose a conversation', chooseDialogText: 'Open general chat or start a direct conversation with a staff member.',
    composer: 'Message the team', send: 'Send', attach: 'Attach file', reply: 'Reply', edit: 'Edit', remove: 'Delete',
    edited: 'edited', deleted: 'Message deleted', deletedVisible: 'Deleted. Original is visible for your rank.',
    cancel: 'Cancel', save: 'Save', files: 'Attachments', typing: 'is typing', realtime: 'Live', reconnecting: 'Reconnecting',
    escalations: 'Escalations', escalate: 'Escalate', escalationText: 'Record verified facts and the question outside your authority.',
    requestedRole: 'Minimum rank', summary: 'Situation summary', createEscalation: 'Create escalation', accept: 'Accept', resolve: 'Resolve',
    resolution: 'Resolution', noEscalations: 'No active escalations', openChat: 'Open conversation',
    voice: 'Staff voice', join: 'Join', leave: 'Leave', locked: 'Unavailable for your rank', invite: 'Invite', move: 'Move',
    voiceInvite: 'You were invited to a voice room', acceptInvite: 'Join room', microphoneError: 'Could not access the microphone',
    voiceConnectionFailed: 'Could not establish the voice connection', enableAudio: 'Enable audio', reconnectVoice: 'Reconnect voice',
    voiceConnected: 'Voice connected', voiceConnecting: 'Connecting participants', voiceAlone: 'You are alone in the room', mute: 'Mute microphone', unmute: 'Unmute microphone', deafen: 'Disable audio', undeafen: 'Enable audio',
    invitedToVoice: 'Voice room invitation sent', movedToVoice: 'Staff member moved', kickedFromVoice: 'Staff member removed from voice',
    moveToRoom: 'Move to room', kickFromVoice: 'Remove from voice', voiceUnstable: 'Unstable voice connection', voiceKicked: 'A senior staff member removed you from voice',
    deleteTitle: 'Delete message?', deleteText: 'Other staff will see a tombstone. Senior administrators and above retain the original for abuse review.',
    attachmentHint: 'Up to 25 MB: images, PDF, documents and archives.', uploadFailed: 'Attachment upload failed',
    selectStaff: 'Select a staff member', online: 'online', offline: 'offline', retry: 'Retry connection'
  }
};

function roleLevel(role) { return ROLE_ORDER.indexOf(role); }
function roleLabel(role, locale) { return locale === 'en' ? role.replaceAll('_', ' ') : ROLE_LABELS[role] || role; }
function formatTime(value, locale) {
  if (!value) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function formatBytes(value) {
  if (!Number.isFinite(value)) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function conversationName(conversation, currentUser, labels) {
  if (conversation?.type === 'general') return labels.general;
  const other = conversation?.participants?.find(member => member._id !== currentUser?._id);
  return other?.nickname || other?.username || labels.direct;
}

function ConversationItem({ conversation, currentUser, selected, onSelect, labels }) {
  const other = conversation.type === 'direct' ? conversation.participants.find(member => member._id !== currentUser?._id) : null;
  const preview = conversation.lastMessage?.deletedAt
    ? labels.deleted
    : conversation.lastMessage?.content || conversation.lastMessage?.attachments?.[0]?.originalName || '';
  return (
    <button className={`staff-conversation-row ${selected ? 'is-active' : ''}`} onClick={onSelect} type="button">
      {conversation.type === 'general'
        ? <span className="staff-channel-icon"><UsersRound size={17} /></span>
        : <Avatar user={other} size="avatar-small" />}
      <span className="staff-conversation-copy">
        <strong>{conversationName(conversation, currentUser, labels)}</strong>
        <small>{preview || (other ? `@${other.username}` : '')}</small>
      </span>
      <span className="staff-conversation-meta">
        <time>{conversation.lastMessageAt ? formatTime(conversation.lastMessageAt, 'ru').split(',')[1] : ''}</time>
        {conversation.unreadCount > 0 && <i>{Math.min(99, conversation.unreadCount)}</i>}
      </span>
    </button>
  );
}

function StaffMessage({ message, currentUser, locale, labels, onReply, onEdit, onDelete }) {
  const own = message.author?._id === currentUser?._id;
  const canModerate = roleLevel(currentUser?.role) >= roleLevel('senior_admin');
  const hiddenDeletion = message.deletedAt && !message.deletedContentVisible;
  return (
    <article className={`staff-message ${own ? 'is-own' : ''} ${message.deletedAt ? 'is-deleted' : ''}`}>
      <Avatar user={message.author} size="avatar-small" />
      <div className="staff-message-body">
        <header>
          <strong>{message.author?.nickname || message.author?.username || 'Staff'}</strong>
          <Badge tone={message.author?.role === 'developer' ? 'danger' : 'neutral'}>{roleLabel(message.author?.role || 'support', locale)}</Badge>
          <time>{formatTime(message.createdAt, locale)}</time>
          {message.editedAt && !message.deletedAt && <small>{labels.edited}</small>}
        </header>
        {message.replyTo && <button className="staff-reply-preview" type="button"><Reply size={13} /><span><strong>{message.replyTo.author?.nickname || message.replyTo.author?.username}</strong>{message.replyTo.deletedAt ? labels.deleted : message.replyTo.content || labels.files}</span></button>}
        {hiddenDeletion ? <p className="staff-message-tombstone"><Trash2 size={14} />{labels.deleted}</p> : <>
          {message.deletedAt && <div className="staff-deleted-audit"><ShieldAlert size={14} />{labels.deletedVisible}</div>}
          {message.content && <p>{message.content}</p>}
          {!!message.attachments?.length && <div className="staff-attachments">{message.attachments.map(file => <a key={file._id} href={`${API_ORIGIN}${file.downloadUrl}`} target="_blank" rel="noreferrer" title={`${labels.files}: ${file.originalName}`}><FileText size={16} /><span><strong>{file.originalName}</strong><small>{formatBytes(file.size)}</small></span><Download size={14} /></a>)}</div>}
        </>}
      </div>
      {!message.deletedAt && <div className="staff-message-actions">
        <button className="icon-button" type="button" onClick={() => onReply(message)} title={labels.reply}><Reply size={15} /></button>
        {own && <button className="icon-button" type="button" onClick={() => onEdit(message)} title={labels.edit}><Edit3 size={15} /></button>}
        {(own || canModerate) && <button className="icon-button danger-icon" type="button" onClick={() => onDelete(message)} title={labels.remove}><Trash2 size={15} /></button>}
      </div>}
    </article>
  );
}

function VoiceMemberActions({ voice, user, member, sourceRoom, labels, locale, onAction }) {
  const canManage = voice.currentRoom && member.user._id !== user._id && roleLevel(user.role) > roleLevel(member.user.role);
  if (!canManage) return null;
  const currentRoom = voice.rooms.find(room => room.id === voice.currentRoom);
  const destinations = voice.rooms.filter(room => room.canJoin && room.id !== sourceRoom.id);
  const currentLabel = currentRoom ? (locale === 'en' ? currentRoom.labelEn : currentRoom.label) : '';
  return <span className="voice-member-actions">
    {sourceRoom.id !== voice.currentRoom && <button className="icon-button" type="button" onClick={() => onAction(member, 'invite', voice.currentRoom)} title={`${labels.invite}: ${currentLabel}`} aria-label={`${labels.invite}: ${currentLabel}`}><UserPlus size={14} /></button>}
    {!!destinations.length && <details className="voice-transfer-menu">
      <summary className="icon-button" title={labels.moveToRoom} aria-label={labels.moveToRoom}><ArrowRight size={14} /></summary>
      <div>{destinations.map(room => <button type="button" key={room.id} onClick={event => { event.currentTarget.closest('details')?.removeAttribute('open'); onAction(member, 'move', room.id); }}><Volume2 size={13} /><span>{locale === 'en' ? room.labelEn : room.label}</span></button>)}</div>
    </details>}
    <button className="icon-button danger-icon" type="button" onClick={() => onAction(member, 'kick')} title={labels.kickFromVoice} aria-label={labels.kickFromVoice}><UserX size={14} /></button>
  </span>;
}

function VoicePanel({ voice, user, labels, locale, members, onNotice }) {
  const current = voice.rooms.find(room => room.id === voice.currentRoom);
  const otherMembers = current?.members.filter(member => member.user._id !== user._id).length || 0;
  const connectionLabel = !otherMembers ? labels.voiceAlone : voice.connectedPeers > 0 ? labels.voiceConnected : labels.voiceConnecting;
  const voiceError = voice.error === 'VOICE_CONNECTION_FAILED' ? labels.voiceConnectionFailed
    : voice.error === 'VOICE_CONNECTION_UNSTABLE' ? labels.voiceUnstable
      : voice.error === 'VOICE_KICKED' ? labels.voiceKicked : voice.error;
  async function manageMember(member, mode, roomId = '') {
    const response = await voice.invite(member.user._id, mode, roomId || voice.currentRoom, member.socketId);
    const success = mode === 'move' ? labels.movedToVoice : mode === 'kick' ? labels.kickedFromVoice : labels.invitedToVoice;
    onNotice(response.status === 'ok' ? success : response.message || labels.microphoneError, response.status !== 'ok');
  }
  return (
    <section className="staff-side-section staff-voice-panel">
      <header><div><Headphones size={17} /><strong>{labels.voice}</strong></div>{voice.currentRoom && <button className="icon-button danger-icon" onClick={voice.leaveRoom} title={labels.leave}><PhoneOff size={16} /></button>}</header>
      {voice.invitation && <div className="voice-invitation"><strong>{labels.voiceInvite}</strong><span>{voice.invitation.invitedBy?.nickname || voice.invitation.invitedBy?.username} · {locale === 'en' ? voice.invitation.room.labelEn : voice.invitation.room.label}</span><div><button className="button button-primary" onClick={() => voice.joinRoom(voice.invitation.room.id)}>{labels.acceptInvite}</button><button className="icon-button" onClick={voice.dismissInvitation} title={labels.cancel}><X size={15} /></button></div></div>}
      {voiceError && <div className="staff-inline-error voice-error"><span>{voiceError}</span>{current && <button className="icon-button" type="button" onClick={voice.reconnectRoom} title={labels.reconnectVoice}><RefreshCw size={14} /></button>}</div>}
      {voice.playbackBlocked && <button className="voice-enable-audio" type="button" onClick={voice.resumeAudio} title={labels.enableAudio}><Volume2 size={15} /><span>{labels.enableAudio}</span></button>}
      <div className="voice-room-list">{voice.rooms.map(room => <article className={room.id === voice.currentRoom ? 'is-current' : ''} key={room.id}>
        <button type="button" disabled={!room.canJoin || !voice.connected} onClick={() => voice.joinRoom(room.id)} title={!room.canJoin ? labels.locked : voice.connected ? labels.join : labels.reconnecting}>
          <span>{room.canJoin ? <Volume2 size={16} /> : <LockKeyhole size={15} />}</span>
          <strong>{locale === 'en' ? room.labelEn : room.label}</strong>
          <small>{room.members.length}</small>
        </button>
        {!!room.members.length && <div className="voice-member-list">{room.members.map(member => <div className={member.speaking ? 'is-speaking' : ''} key={member.socketId}>
          <Avatar user={member.user} size="avatar-tiny" /><span><strong>{member.user.nickname || member.user.username}</strong><small>{roleLabel(member.user.role, locale)}</small></span>
          {member.muted && <MicOff size={12} />}
          <VoiceMemberActions voice={voice} user={user} member={member} sourceRoom={room} labels={labels} locale={locale} onAction={manageMember} />
        </div>)}</div>}
      </article>)}</div>
      {current && <div className="voice-controls"><button className={`icon-button ${voice.muted ? 'is-active' : ''}`} onClick={voice.toggleMute} title={voice.muted ? labels.unmute : labels.mute}>{voice.muted ? <MicOff size={17} /> : <Mic size={17} />}</button><button className={`icon-button ${voice.deafened ? 'is-active' : ''}`} onClick={voice.toggleDeafen} title={voice.deafened ? labels.undeafen : labels.deafen}>{voice.deafened ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><button className="icon-button" type="button" onClick={voice.reconnectRoom} title={labels.reconnectVoice}><RefreshCw size={15} /></button><span className={voice.connectedPeers > 0 ? 'is-connected' : ''}>{connectionLabel}</span></div>}
      {!voice.rooms.length && <div className="voice-reconnect-state"><span className="muted-text">{voice.roomsError || (members.length ? labels.reconnecting : labels.selectStaff)}</span><button className="icon-button" type="button" onClick={voice.refreshRooms} title={labels.retry}><RefreshCw size={15} /></button></div>}
    </section>
  );
}

export default function StaffCommsPage() {
  const { user } = useAuth();
  const { locale } = useLocale();
  const labels = copy[locale];
  const { socket, connected } = useAdminSocket();
  const voice = useStaffVoice(socket);
  const [conversations, setConversations] = useState([]);
  const [members, setMembers] = useState([]);
  const [escalations, setEscalations] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [editing, setEditing] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeError, setNoticeError] = useState(false);
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [staffSearch, setStaffSearch] = useState('');
  const [escalationOpen, setEscalationOpen] = useState(false);
  const [escalationRole, setEscalationRole] = useState('');
  const [escalationSummary, setEscalationSummary] = useState('');
  const [resolveTarget, setResolveTarget] = useState(null);
  const [resolution, setResolution] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [typingUsers, setTypingUsers] = useState(new Map());
  const fileInputRef = useRef(null);
  const bottomRef = useRef(null);
  const typingTimerRef = useRef(null);
  const readTimerRef = useRef(null);
  const conversationsRef = useRef([]);

  const selected = conversations.find(item => item._id === selectedId) || null;
  const availableEscalationRoles = ROLE_ORDER.slice(roleLevel(user.role) + 1);
  const filteredMembers = useMemo(() => members.filter(member => member._id !== user._id && `${member.nickname} ${member.username} ${member.role}`.toLowerCase().includes(staffSearch.trim().toLowerCase())), [members, staffSearch, user._id]);

  const showNotice = useCallback((message, isError = false) => {
    setNotice(message);
    setNoticeError(isError);
  }, []);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const updateConversationPreview = useCallback((incoming, { incrementUnread = false } = {}) => {
    const conversationId = String(incoming?.conversation || '');
    if (!conversationId) return false;
    const exists = conversationsRef.current.some(item => String(item._id) === conversationId);
    if (!exists) return false;
    setConversations(current => current.map(item => {
      if (String(item._id) !== conversationId) return item;
      const isSelected = conversationId === String(selectedId);
      const isOwn = String(incoming.author?._id || '') === String(user._id);
      return {
        ...item,
        lastMessage: incoming,
        lastMessageAt: incoming.createdAt || incoming.editedAt || item.lastMessageAt,
        unreadCount: isSelected || isOwn
          ? 0
          : (incrementUnread ? (item.unreadCount || 0) + 1 : item.unreadCount || 0)
      };
    }));
    return true;
  }, [selectedId, user._id]);

  const loadConversations = useCallback(async () => {
    const { data } = await api.get('/staff/conversations');
    setConversations(data.conversations || []);
    setSelectedId(current => current || data.conversations?.find(item => item.type === 'general')?._id || data.conversations?.[0]?._id || '');
  }, []);

  const loadEscalations = useCallback(async () => {
    const { data } = await api.get('/staff/escalations');
    setEscalations(data.escalations || []);
  }, []);

  const loadInitial = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: conversationsData }, { data: membersData }, { data: escalationData }] = await Promise.all([
        api.get('/staff/conversations'), api.get('/staff/members'), api.get('/staff/escalations')
      ]);
      setConversations(conversationsData.conversations || []);
      setMembers(membersData.members || []);
      setEscalations(escalationData.escalations || []);
      setSelectedId(current => current || conversationsData.conversations?.find(item => item.type === 'general')?._id || conversationsData.conversations?.[0]?._id || '');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadInitial(); }, [loadInitial]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    let cancelled = false;
    setMessagesLoading(true);
    api.get(`/staff/conversations/${selectedId}/messages`).then(({ data }) => {
      if (!cancelled) setMessages(data.messages || []);
    }).catch(requestError => !cancelled && setError(errorMessage(requestError))).finally(() => !cancelled && setMessagesLoading(false));
    setReplyTo(null);
    setEditing(null);
    setDraft('');
    setAttachments([]);
    socket?.emit('staff:conversation:join', { conversationId: selectedId });
    return () => {
      cancelled = true;
      socket?.emit('staff:conversation:leave', { conversationId: selectedId });
    };
  }, [selectedId, socket]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  const markReadSoon = useCallback(conversationId => {
    window.clearTimeout(readTimerRef.current);
    readTimerRef.current = window.setTimeout(() => {
      api.post(`/staff/conversations/${conversationId}/read`).catch(() => {});
    }, 180);
  }, []);

  useEffect(() => () => window.clearTimeout(readTimerRef.current), []);

  useEffect(() => {
    if (!socket) return undefined;
    const upsert = incoming => setMessages(current => current.some(item => item._id === incoming._id) ? current.map(item => item._id === incoming._id ? incoming : item) : [...current, incoming]);
    const onNew = incoming => {
      if (incoming.conversation === selectedId) {
        upsert(incoming);
        if (String(incoming.author?._id || '') !== String(user._id)) markReadSoon(selectedId);
      }
      if (!updateConversationPreview(incoming, { incrementUnread: true })) loadConversations().catch(() => {});
    };
    const onUpdated = incoming => {
      if (incoming.conversation === selectedId) upsert(incoming);
      if (!updateConversationPreview(incoming)) loadConversations().catch(() => {});
    };
    const onDeleted = payload => {
      if (payload.conversationId === selectedId) setMessages(current => current.map(message => message._id === payload.messageId ? { ...message, deletedAt: payload.deletedAt, deletedBy: payload.deletedBy, ...(roleLevel(user.role) < roleLevel('senior_admin') ? { content: '', attachments: [], deletedContentVisible: false } : { deletedContentVisible: true }), canEdit: false, canDelete: false } : message));
      const conversation = conversationsRef.current.find(item => String(item._id) === String(payload.conversationId));
      if (conversation?.lastMessage?._id === payload.messageId) {
        updateConversationPreview({ ...conversation.lastMessage, deletedAt: payload.deletedAt, deletedBy: payload.deletedBy, conversation: payload.conversationId });
      }
    };
    const onEscalation = () => loadEscalations().catch(() => {});
    const onTyping = payload => {
      if (payload.conversationId !== selectedId || payload.user?._id === user._id) return;
      setTypingUsers(current => {
        const next = new Map(current);
        if (payload.active) next.set(payload.user._id, payload.user);
        else next.delete(payload.user._id);
        return next;
      });
    };
    const onPresence = payload => setMembers(current => current.map(member => member._id === payload.userId ? { ...member, status: payload.online ? 'online' : 'offline' } : member));
    socket.on('staff:message:new', onNew);
    socket.on('staff:message:updated', onUpdated);
    socket.on('staff:message:deleted', onDeleted);
    socket.on('staff:escalation:new', onEscalation);
    socket.on('staff:escalation:updated', onEscalation);
    socket.on('staff:typing', onTyping);
    socket.on('staff:presence', onPresence);
    return () => {
      socket.off('staff:message:new', onNew);
      socket.off('staff:message:updated', onUpdated);
      socket.off('staff:message:deleted', onDeleted);
      socket.off('staff:escalation:new', onEscalation);
      socket.off('staff:escalation:updated', onEscalation);
      socket.off('staff:typing', onTyping);
      socket.off('staff:presence', onPresence);
    };
  }, [loadConversations, loadEscalations, markReadSoon, selectedId, socket, updateConversationPreview, user._id, user.role]);

  function updateDraft(value) {
    setDraft(value);
    if (!socket?.connected || !selectedId || editing) return;
    socket.emit('staff:typing', { conversationId: selectedId, active: Boolean(value.trim()) });
    window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => socket.emit('staff:typing', { conversationId: selectedId, active: false }), 1500);
  }

  async function uploadFiles(fileList) {
    const files = [...fileList].slice(0, Math.max(0, 10 - attachments.length));
    if (!files.length || !selectedId) return;
    setUploading(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        const { data } = await api.post(`/staff/conversations/${selectedId}/attachments`, form);
        setAttachments(current => [...current, data.attachment]);
      }
    } catch (requestError) {
      showNotice(errorMessage(requestError, labels.uploadFailed), true);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function submitMessage(event) {
    event?.preventDefault();
    if (sending || uploading || (!draft.trim() && !attachments.length)) return;
    setSending(true);
    try {
      if (editing) {
        const { data } = await api.patch(`/staff/messages/${editing._id}`, { content: draft });
        setMessages(current => current.map(item => item._id === data.message._id ? data.message : item));
        updateConversationPreview(data.message);
      } else {
        const { data } = await api.post(`/staff/conversations/${selectedId}/messages`, {
          content: draft,
          replyTo: replyTo?._id || null,
          attachmentIds: attachments.map(item => item._id)
        });
        setMessages(current => current.some(item => item._id === data.message._id) ? current : [...current, data.message]);
        updateConversationPreview(data.message);
      }
      socket?.emit('staff:typing', { conversationId: selectedId, active: false });
      setDraft('');
      setReplyTo(null);
      setEditing(null);
      setAttachments([]);
    } catch (requestError) {
      showNotice(errorMessage(requestError), true);
    } finally {
      setSending(false);
    }
  }

  function startEdit(message) {
    setEditing(message);
    setReplyTo(null);
    setDraft(message.content || '');
  }

  async function deleteMessage() {
    if (!deleteTarget) return;
    setSending(true);
    try {
      const { data } = await api.delete(`/staff/messages/${deleteTarget._id}`);
      setMessages(current => current.map(item => item._id === data.message._id ? data.message : item));
      updateConversationPreview(data.message);
      setDeleteTarget(null);
    } catch (requestError) {
      showNotice(errorMessage(requestError), true);
    } finally {
      setSending(false);
    }
  }

  async function openDirect(member) {
    try {
      const { data } = await api.post('/staff/conversations/direct', { userId: member._id });
      await loadConversations();
      setSelectedId(data.conversation._id);
      setNewChatOpen(false);
      setStaffSearch('');
    } catch (requestError) {
      showNotice(errorMessage(requestError), true);
    }
  }

  async function createEscalation(event) {
    event.preventDefault();
    setSending(true);
    try {
      await api.post('/staff/escalations', { requestedRole: escalationRole, summary: escalationSummary, conversationId: selectedId || null, messageId: replyTo?._id || null });
      setEscalationOpen(false);
      setEscalationSummary('');
      await loadEscalations();
    } catch (requestError) {
      showNotice(errorMessage(requestError), true);
    } finally { setSending(false); }
  }

  async function acceptEscalation(escalation) {
    try {
      const { data } = await api.post(`/staff/escalations/${escalation._id}/accept`);
      await Promise.all([loadEscalations(), loadConversations()]);
      if (data.escalation.handoffConversation) setSelectedId(data.escalation.handoffConversation);
    } catch (requestError) { showNotice(errorMessage(requestError), true); }
  }

  async function resolveEscalation(event) {
    event.preventDefault();
    try {
      await api.post(`/staff/escalations/${resolveTarget._id}/resolve`, { resolution });
      setResolveTarget(null);
      setResolution('');
      await loadEscalations();
    } catch (requestError) { showNotice(errorMessage(requestError), true); }
  }

  function beginEscalation() {
    if (!availableEscalationRoles.length) return;
    setEscalationRole(availableEscalationRoles[0]);
    setEscalationOpen(true);
  }

  if (loading) return <div className="page-stack"><PageHeader title={labels.title} description={labels.description} /><div className="panel chat-page-loader"><LoaderCircle className="spin" size={22} /></div></div>;

  return (
    <div className="page-stack staff-comms-page">
      <PageHeader title={labels.title} description={labels.description} actions={<span className={`staff-live-state ${connected ? 'is-live' : ''}`}><i />{connected ? labels.realtime : labels.reconnecting}</span>} />
      {notice && <Notice tone={noticeError ? 'error' : 'success'} onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <ErrorState message={error} retry={loadInitial} />}

      <div className="staff-comms-layout">
        <aside className="panel staff-conversations">
          <header><strong>{labels.general}</strong><button className="icon-button" onClick={() => setNewChatOpen(true)} title={labels.newChat}><MessageSquarePlus size={17} /></button></header>
          <div className="staff-conversation-list">
            {conversations.filter(item => item.type === 'general').map(item => <ConversationItem key={item._id} conversation={item} currentUser={user} selected={item._id === selectedId} onSelect={() => setSelectedId(item._id)} labels={labels} />)}
            <div className="staff-list-label"><span>{labels.direct}</span><i>{conversations.filter(item => item.type === 'direct').length}</i></div>
            {conversations.filter(item => item.type === 'direct').map(item => <ConversationItem key={item._id} conversation={item} currentUser={user} selected={item._id === selectedId} onSelect={() => setSelectedId(item._id)} labels={labels} />)}
            {!conversations.some(item => item.type === 'direct') && <p className="staff-list-empty">{labels.noDialogs}</p>}
          </div>
        </aside>

        <main className="panel staff-chat-panel">
          {!selected ? <EmptyState title={labels.chooseDialog} description={labels.chooseDialogText} icon={MessageCircle} /> : <>
            <header className="staff-chat-header"><div><strong>{conversationName(selected, user, labels)}</strong><span>{selected.type === 'general' ? labels.description : `@${selected.participants.find(member => member._id !== user._id)?.username || ''}`}</span></div>{availableEscalationRoles.length > 0 && <button className="button button-secondary" onClick={beginEscalation} title={labels.escalationText}><ArrowUpRight size={15} />{labels.escalate}</button>}</header>
            <div className="staff-message-list">
              {messagesLoading ? <div className="chat-page-loader"><LoaderCircle className="spin" size={20} /></div> : messages.length ? messages.map(message => <StaffMessage key={message._id} message={message} currentUser={user} locale={locale} labels={labels} onReply={value => { setReplyTo(value); setEditing(null); }} onEdit={startEdit} onDelete={setDeleteTarget} />) : <EmptyState title={labels.composer} description={selected.type === 'general' ? labels.description : labels.chooseDialogText} icon={MessageCircle} />}
              <div ref={bottomRef} />
            </div>
            <div className="staff-typing-line">{[...typingUsers.values()].map(value => value.nickname || value.username).join(', ')}{typingUsers.size ? ` ${labels.typing}...` : ''}</div>
            <form className="staff-composer" onSubmit={submitMessage}>
              {(replyTo || editing) && <div className="staff-compose-context"><span>{editing ? <Edit3 size={14} /> : <Reply size={14} />}<strong>{editing ? labels.edit : `${labels.reply}: ${replyTo.author?.nickname || replyTo.author?.username}`}</strong><small>{editing ? editing.content : replyTo.content || labels.files}</small></span><button className="icon-button" type="button" onClick={() => { setReplyTo(null); setEditing(null); setDraft(''); }} title={labels.cancel}><X size={15} /></button></div>}
              {!!attachments.length && <div className="staff-pending-files">{attachments.map(file => <span key={file._id}><FileText size={14} /><strong>{file.originalName}</strong><small>{formatBytes(file.size)}</small><button type="button" onClick={() => setAttachments(current => current.filter(item => item._id !== file._id))} title={labels.remove}><X size={13} /></button></span>)}</div>}
              <div className="staff-compose-row">
                <button className="icon-button" type="button" disabled={uploading || editing} onClick={() => fileInputRef.current?.click()} title={`${labels.attach}. ${labels.attachmentHint}`}>{uploading ? <LoaderCircle className="spin" size={17} /> : <Paperclip size={18} />}</button>
                <input ref={fileInputRef} name="staff-chat-files" type="file" multiple hidden onChange={event => uploadFiles(event.target.files)} accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.doc,.docx,.xls,.xlsx,.zip,.rar,.7z" />
                <textarea name="staff-chat-message" value={draft} onChange={event => updateDraft(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submitMessage(); } }} placeholder={labels.composer} rows="1" maxLength="8000" />
                <button className="button button-primary staff-send-button" type="submit" disabled={sending || uploading || (!draft.trim() && !attachments.length)} title={editing ? labels.save : labels.send}>{sending ? <LoaderCircle className="spin" size={17} /> : editing ? <Check size={17} /> : <Send size={17} />}</button>
              </div>
              <small className="staff-compose-hint">{labels.attachmentHint}</small>
            </form>
          </>}
        </main>

        <aside className="panel staff-comms-side">
          <section className="staff-side-section staff-escalation-panel"><header><div><ArrowUpRight size={17} /><strong>{labels.escalations}</strong></div><Badge tone="warning">{escalations.filter(item => ['open', 'accepted'].includes(item.status)).length}</Badge></header><div className="staff-escalation-list">{escalations.filter(item => ['open', 'accepted'].includes(item.status)).slice(0, 8).map(item => <article key={item._id}><div><Badge tone={item.status === 'open' ? 'warning' : 'info'}>{item.status}</Badge><small>{item.number}</small></div><strong>{item.summary}</strong><span>{roleLabel(item.requestedRole, locale)} · {item.createdBy?.nickname || item.createdBy?.username}</span><footer>{item.status === 'open' && roleLevel(user.role) >= roleLevel(item.requestedRole) && item.createdBy?._id !== user._id && <button className="button button-secondary" onClick={() => acceptEscalation(item)}>{labels.accept}</button>}{item.handoffConversation && <button className="icon-button" onClick={() => setSelectedId(item.handoffConversation)} title={labels.openChat}><MessageCircle size={15} /></button>}{item.status === 'accepted' && (item.assignedTo?._id === user._id || roleLevel(user.role) >= roleLevel('senior_admin')) && <button className="icon-button" onClick={() => setResolveTarget(item)} title={labels.resolve}><Check size={15} /></button>}</footer></article>)}{!escalations.some(item => ['open', 'accepted'].includes(item.status)) && <p className="staff-list-empty">{labels.noEscalations}</p>}</div></section>
          <VoicePanel voice={voice} user={user} labels={labels} locale={locale} members={members} onNotice={showNotice} />
        </aside>
      </div>

      {newChatOpen && <Modal title={labels.newChat} onClose={() => setNewChatOpen(false)} wide><label className="search-field staff-member-search"><Search size={17} /><input name="staff-member-search" value={staffSearch} onChange={event => setStaffSearch(event.target.value)} placeholder={labels.searchStaff} autoFocus />{staffSearch && <button type="button" onClick={() => setStaffSearch('')} title={labels.cancel}><X size={14} /></button>}</label><div className="staff-picker-list">{filteredMembers.map(member => <button type="button" key={member._id} onClick={() => openDirect(member)}><Avatar user={member} size="avatar-small" /><span><strong>{member.nickname || member.username}</strong><small>@{member.username} · {roleLabel(member.role, locale)}</small></span><i className={member.status === 'online' ? 'is-online' : ''} title={member.status === 'online' ? labels.online : labels.offline} /><ArrowRight size={15} /></button>)}</div></Modal>}

      {escalationOpen && <Modal title={labels.escalate} onClose={() => setEscalationOpen(false)} footer={<><button className="button button-secondary" onClick={() => setEscalationOpen(false)}>{labels.cancel}</button><button className="button button-primary" form="staff-escalation-form" disabled={sending || escalationSummary.trim().length < 10}><ArrowUpRight size={16} />{labels.createEscalation}</button></>}><form id="staff-escalation-form" className="form-stack" onSubmit={createEscalation}><p>{labels.escalationText}</p><label className="field"><span>{labels.requestedRole}</span><select name="staff-escalation-role" value={escalationRole} onChange={event => setEscalationRole(event.target.value)}>{availableEscalationRoles.map(role => <option key={role} value={role}>{roleLabel(role, locale)}</option>)}</select></label><label className="field"><span>{labels.summary}</span><textarea name="staff-escalation-summary" value={escalationSummary} onChange={event => setEscalationSummary(event.target.value)} maxLength="3000" required autoFocus /></label></form></Modal>}

      {resolveTarget && <Modal title={labels.resolve} onClose={() => setResolveTarget(null)} footer={<><button className="button button-secondary" onClick={() => setResolveTarget(null)}>{labels.cancel}</button><button className="button button-primary" form="staff-resolution-form" disabled={resolution.trim().length < 5}><Check size={16} />{labels.resolve}</button></>}><form id="staff-resolution-form" className="form-stack" onSubmit={resolveEscalation}><p>{resolveTarget.summary}</p><label className="field"><span>{labels.resolution}</span><textarea name="staff-escalation-resolution" value={resolution} onChange={event => setResolution(event.target.value)} maxLength="3000" required autoFocus /></label></form></Modal>}

      {deleteTarget && <Modal title={labels.deleteTitle} onClose={() => setDeleteTarget(null)} footer={<><button className="button button-secondary" onClick={() => setDeleteTarget(null)}>{labels.cancel}</button><button className="button button-danger" onClick={deleteMessage} disabled={sending}><Trash2 size={16} />{labels.remove}</button></>}><p>{labels.deleteText}</p></Modal>}
    </div>
  );
}
