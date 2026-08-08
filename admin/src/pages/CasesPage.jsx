import { Archive, ArchiveRestore, ArrowUpRight, Bug, CheckCircle2, ChevronRight, CircleHelp, Clock3, Heart, Inbox, MessageSquareWarning, MonitorCog, Send, Tag, Trash2, UserCheck, UsersRound, X, XCircle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import { Avatar, Badge, EmptyState, ErrorState, Notice, PageHeader, Pagination, SearchField, Segmented } from '../components/ui.jsx';
import { formatDate, toneForStatus } from '../utils/format.js';
import PageLoader from '../components/PageLoader.jsx';
import { useLocale } from '../i18n/useLocale.js';
import { useAdminRealtime } from '../realtime/useAdminRealtime.js';

const kinds = [
  { value: 'all', label: 'Все' }, { value: 'report', label: 'Жалобы' },
  { value: 'appeal', label: 'Апелляции' }, { value: 'support', label: 'Поддержка' },
  { value: 'bug', label: 'Баги' }, { value: 'idea', label: 'Идеи' }
];
const statuses = ['new', 'triaged', 'in_progress', 'waiting_user', 'resolved', 'rejected', 'archived'];
const priorities = ['low', 'normal', 'high', 'critical'];
const kindLabels = { report: 'Жалоба', appeal: 'Апелляция', support: 'Поддержка', bug: 'Баг', idea: 'Идея' };
const kindIcons = { report: MessageSquareWarning, appeal: CircleHelp, support: Inbox, bug: Bug, idea: Heart };
const roleOrder = ['support', 'junior_moderator', 'senior_moderator', 'junior_admin', 'senior_admin', 'deputy_developer', 'developer'];
const minimumRole = { support: 'support', bug: 'support', idea: 'support', report: 'junior_moderator', appeal: 'senior_moderator' };
const roleLabels = {
  support: 'Support', junior_moderator: 'Младший модератор', senior_moderator: 'Старший модератор',
  junior_admin: 'Младший администратор', senior_admin: 'Старший администратор',
  deputy_developer: 'Зам. разработчика', developer: 'Разработчик'
};
const queueGuidance = {
  support: ['Первичная поддержка, идеи и баги', 'Соберите контекст и передайте жалобы модератору'],
  junior_moderator: ['Жалобы и простые нарушения', 'Наказания только в пределах роли'],
  senior_moderator: ['Апелляции, сложные жалобы и контроль модерации', 'Не рассматривайте собственные наказания'],
  junior_admin: ['Длительные ограничения, серверы и публикации', 'Критические риски передавайте старшему администратору'],
  senior_admin: ['Распределение очереди, деактивации и постоянные ограничения', 'Назначайте дела только компетентным сотрудникам'],
  deputy_developer: ['Аудит, инфраструктура и контроль старшего состава', 'Не подменяйте обычную работу очереди'],
  developer: ['Критические исключения и окончательные решения', 'Любое исключение подробно фиксируется в аудите']
};

function roleLevel(role) { return roleOrder.indexOf(role); }
function canWorkKind(role, kind) { return roleLevel(role) >= roleLevel(minimumRole[kind] || 'support'); }

export default function CasesPage() {
  const { user } = useAuth();
  const { locale, valueLabel } = useLocale();
  const text = (ru, en) => locale === 'en' ? en : ru;
  const [searchParams, setSearchParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [kind, setKind] = useState('all');
  const [status, setStatus] = useState('all');
  const [priority, setPriority] = useState('all');
  const [assigned, setAssigned] = useState('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [internal, setInternal] = useState(true);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [staff, setStaff] = useState([]);
  const closingDetailRef = useRef(false);
  const detailRequestRef = useRef(0);
  const notesBottomRef = useRef(null);
  const canDeleteCases = user.role === 'developer' || user.permissions?.includes('*');
  const canAssignOthers = roleLevel(user.role) >= roleLevel('senior_admin');

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/cases', { params: { kind, status, priority, assigned, query: debouncedQuery, page, limit: 25 } });
      setItems(data.cases);
      setPagination(data.pagination);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [kind, status, priority, assigned, debouncedQuery, page]);

  useEffect(() => { loadCases(); }, [loadCases]);

  useEffect(() => {
    if (!canAssignOthers) return;
    api.get('/users', { params: { role: 'staff', limit: 100 } })
      .then(({ data }) => setStaff(data.users || []))
      .catch(requestError => setError(errorMessage(requestError)));
  }, [canAssignOthers]);

  const openCase = useCallback(async itemOrId => {
    const id = typeof itemOrId === 'string' ? itemOrId : itemOrId._id;
    const requestId = ++detailRequestRef.current;
    if (typeof itemOrId !== 'string') setSelected(itemOrId);
    setDetailLoading(true);
    setError('');
    try {
      const { data } = await api.get(`/cases/${id}`);
      if (requestId !== detailRequestRef.current) return;
      setSelected(data.case);
      setDetail(data.case);
      setSearchParams(current => { const next = new URLSearchParams(current); next.set('case', id); return next; }, { replace: true });
    } catch (requestError) {
      if (requestId !== detailRequestRef.current) return;
      if (requestError.response?.status === 404) {
        setSelected(null);
        setDetail(null);
        setSearchParams(current => { const next = new URLSearchParams(current); next.delete('case'); return next; }, { replace: true });
        setNotice(locale === 'en' ? 'The case was deleted or is no longer available.' : 'Обращение уже удалено или больше недоступно.');
        await loadCases();
        return;
      }
      setError(errorMessage(requestError));
    } finally {
      if (requestId === detailRequestRef.current) setDetailLoading(false);
    }
  }, [loadCases, locale, setSearchParams]);

  useEffect(() => {
    const id = searchParams.get('case');
    if (!id) {
      closingDetailRef.current = false;
      return;
    }
    if (!selected && !closingDetailRef.current) openCase(id);
  }, [searchParams, selected, openCase]);

  useAdminRealtime('cases', update => {
    if (['user_reply', 'staff_reply', 'internal_note'].includes(update.kind) && update.caseId && update.note) {
      const mergeCase = item => String(item?._id) === String(update.caseId)
        ? { ...item, status: update.status || item.status, updatedAt: update.updatedAt || update.note.createdAt || item.updatedAt }
        : item;
      const mergeNote = item => {
        if (String(item?._id) !== String(update.caseId)) return item;
        const notes = item.notes || [];
        return {
          ...mergeCase(item),
          notes: notes.some(noteItem => String(noteItem._id) === String(update.note._id)) ? notes : [...notes, update.note]
        };
      };
      setItems(current => current.map(mergeCase));
      setSelected(current => mergeCase(current));
      setDetail(current => mergeNote(current));
      return;
    }
    loadCases();
    if (detail?._id) openCase(detail._id);
  }, { debounceMs: 0 });

  useEffect(() => {
    notesBottomRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [detail?.notes?.length]);

  function closeDetail() {
    closingDetailRef.current = true;
    detailRequestRef.current += 1;
    setSearchParams(current => { const next = new URLSearchParams(current); next.delete('case'); return next; }, { replace: true });
    setSelected(null);
    setDetail(null);
  }

  async function updateCase(changes, successText = 'Обращение обновлено.') {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.patch(`/cases/${detail._id}`, changes);
      setDetail(current => ({ ...current, ...data.case }));
      setNotice(successText);
      await loadCases();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function sendNote(event) {
    event.preventDefault();
    if (!note.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/cases/${detail._id}/notes`, { body: note, internal });
      setDetail(current => {
        if (!current || String(current._id) !== String(detail._id)) return current;
        const notes = current.notes || [];
        return notes.some(item => String(item._id) === String(data.note._id))
          ? current
          : { ...current, notes: [...notes, data.note], updatedAt: data.note.createdAt || current.updatedAt };
      });
      setItems(current => current.map(item => String(item._id) === String(detail._id) ? { ...item, updatedAt: data.note.createdAt || item.updatedAt } : item));
      setNote('');
      setNotice(internal ? 'Внутренняя заметка добавлена.' : 'Ответ отправлен пользователю.');
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteNote(noteId) {
    if (!window.confirm('Удалить эту заметку? Действие попадёт в журнал аудита.')) return;
    setBusy(true);
    try {
      await api.delete(`/cases/${detail._id}/notes/${noteId}`);
      setNotice('Заметка удалена.');
      await openCase(detail._id);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteCase() {
    if (!window.confirm(`Навсегда удалить обращение ${detail.number}? Запись об удалении останется в аудите.`)) return;
    setBusy(true);
    try {
      await api.delete(`/cases/${detail._id}`);
      closeDetail();
      setNotice('Обращение удалено.');
      await loadCases();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function changeArchiveState(restore = false) {
    const message = restore
      ? text(`Восстановить обращение ${detail.number} в активную очередь?`, `Restore case ${detail.number} to the active queue?`)
      : text(`Переместить обращение ${detail.number} в архив? Его можно будет восстановить.`, `Move case ${detail.number} to the archive? It can be restored later.`);
    if (!window.confirm(message)) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/cases/${detail._id}`, { status: restore ? 'triaged' : 'archived' });
      closeDetail();
      setNotice(restore ? text('Обращение восстановлено.', 'Case restored.') : text('Обращение перемещено в архив.', 'Case moved to archive.'));
      await loadCases();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function decideAppeal(decision) {
    const ownPunishment = String(detail.moderationAction?.issuedBy?._id || '') === String(user._id);
    const developerOverride = ownPunishment && canDeleteCases;
    if (developerOverride && !window.confirm('Это наказание выдали вы. Подтвердить исключение Разработчика? Решение будет отдельно отмечено в аудите.')) return;
    const fallbackReason = decision === 'accepted'
      ? 'Апелляция рассмотрена и удовлетворена.'
      : 'После проверки оснований апелляция отклонена.';
    setBusy(true);
    try {
      const { data } = await api.post(`/cases/${detail._id}/appeal-decision`, {
        decision,
        reason: decisionReason.trim() || fallbackReason,
        overrideOwn: developerOverride,
        overrideReason: developerOverride ? 'Экстренное решение единственного Разработчика Love' : ''
      });
      setDecisionReason('');
      setNotice(data.message);
      await openCase(detail._id);
      await loadCases();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  const summary = useMemo(() => ({
    critical: items.filter(item => item.priority === 'critical').length,
    unassigned: items.filter(item => !item.assignedTo).length
  }), [items]);

  const eligibleStaff = useMemo(() => staff.filter(member =>
    detail && canWorkKind(member.role, detail.kind) && roleLevel(member.role) <= roleLevel(user.role)
  ), [detail, staff, user.role]);
  const roleQueue = queueGuidance[user.role] || queueGuidance.support;
  const canManageSelected = Boolean(detail && canWorkKind(user.role, detail.kind));
  const canChangeSelectedPriority = canManageSelected && roleLevel(user.role) >= roleLevel('senior_moderator');
  const canArchiveSelected = canManageSelected && Boolean(detail && (
    detail.status === 'archived'
    || ['resolved', 'rejected'].includes(detail.status)
    || roleLevel(user.role) >= roleLevel('senior_admin')
  ));

  return (
    <div className="page-stack cases-page">
      <PageHeader title={text('Центр обращений', 'Case center')} description={text(`${pagination.total} обращений · ${summary.critical} критических · ${summary.unassigned} без исполнителя`, `${pagination.total} cases · ${summary.critical} critical · ${summary.unassigned} unassigned`)} />
      <section className="case-role-guide"><UserCheck size={17} /><div><strong>{text(`Очередь: ${roleLabels[user.role] || user.role}`, `Queue: ${user.role}`)}</strong><span>{text(`${roleQueue[0]}. ${roleQueue[1]}.`, 'Work only within your role, record verified facts and escalate when needed.')}</span></div></section>
      {notice && <Notice onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <ErrorState message={error} retry={loadCases} />}

      <section className="panel case-toolbar">
        <Segmented value={kind} onChange={value => { setKind(value); setPage(1); }} options={kinds} label="Тип обращения" />
        <div className="filterbar">
          <SearchField value={query} onChange={setQuery} placeholder="Номер, заголовок, текст" />
          <select name="case-status-filter" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option value="all">{text('Активные', 'Active')}</option>{statuses.map(value => <option key={value} value={value}>{valueLabel(value)}</option>)}</select>
          <select name="case-priority-filter" value={priority} onChange={event => { setPriority(event.target.value); setPage(1); }}><option value="all">{text('Все приоритеты', 'All priorities')}</option>{priorities.map(value => <option key={value} value={value}>{valueLabel(value)}</option>)}</select>
          <label className="check-field"><input name="case-assigned-to-me" type="checkbox" checked={assigned === 'me'} onChange={event => setAssigned(event.target.checked ? 'me' : 'all')} /><span>{text('Назначенные мне', 'Assigned to me')}</span></label>
        </div>
      </section>

      <section className={`case-workspace ${selected ? 'has-detail' : ''}`}>
        <div className="panel case-list-panel">
          {loading ? <PageLoader /> : items.length ? <div className="case-list">{items.map(item => {
            const Icon = kindIcons[item.kind] || Inbox;
            return (
              <button key={item._id} className={`case-row ${selected?._id === item._id ? 'active' : ''}`} onClick={() => openCase(item)}>
                <span className={`case-kind kind-${item.kind}`}><Icon size={17} /></span>
                <span className="case-row-copy"><span><strong>{item.title}</strong><Badge tone={toneForStatus(item.priority)}>{item.priority}</Badge></span><small>{item.number} · {kindLabels[item.kind]} · {formatDate(item.createdAt)}</small></span>
                <span className="case-assignee">{item.assignedTo ? <Avatar user={item.assignedTo} size="avatar-tiny" /> : <span className="unassigned-dot" title="Без исполнителя" />}</span>
                <ChevronRight size={17} />
              </button>
            );
          })}</div> : <EmptyState title="Обращений нет" description="В этой выборке пока пусто." />}
          <Pagination page={pagination.page} pages={pagination.pages} onChange={setPage} />
        </div>

        {selected && <aside className="panel case-detail">
          {detailLoading || !detail ? <PageLoader /> : <>
            <header className="case-detail-header">
              <button type="button" className="button button-ghost case-back" onClick={closeDetail}>Назад</button>
              <div><span className="eyebrow">{detail.number}</span><h2>{detail.title}</h2></div>
              <div className="row-actions">
                {canArchiveSelected && (detail.status === 'archived'
                  ? <button className="icon-button" onClick={() => changeArchiveState(true)} disabled={busy} title={text('Вернуть обращение в активную очередь', 'Restore case to active queue')}><ArchiveRestore size={17} /></button>
                  : <button className="icon-button" onClick={() => changeArchiveState(false)} disabled={busy} title={text('Переместить в архив', 'Move to archive')}><Archive size={17} /></button>)}
                {canDeleteCases && <button className="icon-button danger-icon" onClick={deleteCase} disabled={busy} title={text('Удалить навсегда', 'Delete permanently')}><Trash2 size={17} /></button>}
                <button type="button" className="icon-button detail-close" onClick={closeDetail} title="Закрыть" aria-label="Закрыть обращение"><X size={18} /></button>
              </div>
            </header>

            <div className="case-meta-row">
              <Badge tone={toneForStatus(detail.priority)}>{valueLabel(detail.priority)}</Badge>
              {detail.prioritySource === 'reporter' && <Badge tone="warning">{text('выбран пользователем', 'chosen by user')}</Badge>}
              <Badge tone={toneForStatus(detail.status)}>{valueLabel(detail.status)}</Badge>
              <span>{kindLabels[detail.kind]}</span><span>{formatDate(detail.createdAt)}</span>
            </div>

            <div className="case-person"><Avatar user={detail.reporter} size="avatar-small" /><span><strong>{detail.reporter?.nickname || detail.reporter?.username}</strong><small>Автор обращения</small></span></div>
            <p className="case-description">{detail.description}</p>

            {detail.evidenceSnapshot && <section className="case-evidence">
              <header><MessageSquareWarning size={16} /><strong>{text('Зафиксированное доказательство', 'Captured evidence')}</strong><Badge tone="warning">{text('неизменяемый снимок', 'immutable snapshot')}</Badge></header>
              <div className="case-evidence-message">
                <div className="case-evidence-author">
                  <Avatar user={detail.subjectUser || detail.evidenceSnapshot.author} size="avatar-tiny" />
                  <span><strong>{detail.evidenceSnapshot.author?.nickname || detail.subjectUser?.nickname || detail.evidenceSnapshot.author?.username || detail.subjectUser?.username || text('Неизвестный пользователь', 'Unknown user')}</strong><small>{detail.evidenceSnapshot.author?.username || detail.subjectUser?.username ? `@${detail.evidenceSnapshot.author?.username || detail.subjectUser?.username} · ` : ''}{text('автор сообщения', 'message author')}</small></span>
                  <time>{formatDate(detail.evidenceSnapshot.createdAt)}</time>
                </div>
                <blockquote>{detail.evidenceSnapshot.content || text('Сообщение без текста', 'Message without text')}</blockquote>
                {!!detail.evidenceSnapshot.attachments?.length && <div className="attachment-list">{detail.evidenceSnapshot.attachments.map((file, index) => <a key={`${file.url}-${index}`} href={file.url} target="_blank" rel="noreferrer"><ArrowUpRight size={15} />{file.filename}</a>)}</div>}
              </div>
              <footer><span>{text('Сохранено при отправке жалобы', 'Captured when the report was submitted')} · {formatDate(detail.evidenceSnapshot.capturedAt)}</span><code title={text('Идентификатор исходного сообщения', 'Original message identifier')}>ID {detail.evidenceSnapshot.messageId}</code></footer>
            </section>}

            {detail.kind === 'bug' && detail.diagnostics && <section className="case-diagnostics">
              <header><MonitorCog size={16} /><strong>{text('Технические сведения', 'Technical details')}</strong><Badge tone="info">{text('с согласия пользователя', 'user consent')}</Badge></header>
              <dl>
                <div><dt>{text('Версия Love', 'Love version')}</dt><dd>{detail.diagnostics.appVersion || text('Не указана', 'Not provided')}</dd></div>
                <div><dt>{text('Платформа', 'Platform')}</dt><dd>{detail.diagnostics.platform || text('Не указана', 'Not provided')}</dd></div>
                <div><dt>{text('ОС и окружение', 'OS and environment')}</dt><dd>{detail.diagnostics.osVersion || text('Не указано', 'Not provided')}</dd></div>
              </dl>
              {detail.diagnostics.safeLog && <pre>{detail.diagnostics.safeLog}</pre>}
              <footer>{text('Переписки, пароли и токены не собираются. Секреты дополнительно очищаются сервером.', 'Chats, passwords and tokens are not collected. Secrets are additionally scrubbed by the server.')}</footer>
            </section>}

            {!!detail.tags?.length && <div className="tag-list"><Tag size={14} />{detail.tags.map(tag => <Badge key={tag}>{tag}</Badge>)}</div>}
            {!!detail.attachments?.length && <div className="attachment-list">{detail.attachments.map(file => <a key={file._id} href={file.url} target="_blank" rel="noreferrer"><ArrowUpRight size={15} />{file.name}</a>)}</div>}

            <div className="case-controls">
              <label className="field compact" title={!canManageSelected ? text('Этот тип обращения не относится к вашей очереди', 'This case type is outside your queue') : undefined}><span>{text('Статус', 'Status')}</span><select name="case-status" value={detail.status} disabled={busy || detail.status === 'archived' || !canManageSelected} onChange={event => updateCase({ status: event.target.value })}>{[...new Set(statuses.filter(value => value !== 'archived' && (detail.kind !== 'appeal' || !['resolved', 'rejected'].includes(value))).concat(['resolved', 'rejected', 'archived'].includes(detail.status) ? [detail.status] : []))].map(value => <option key={value} value={value}>{valueLabel(value)}</option>)}</select></label>
              <label className="field compact" title={!canChangeSelectedPriority ? text('Приоритет меняет старший модератор или более высокая роль', 'Priority requires Senior Moderator or above') : text('Изменить приоритет после проверки обращения', 'Change priority after reviewing the case')}><span>{text('Приоритет', 'Priority')}</span><select name="case-priority" value={detail.priority} disabled={busy || !canChangeSelectedPriority} onChange={event => updateCase({ priority: event.target.value })}>{priorities.map(value => <option key={value} value={value}>{valueLabel(value)}</option>)}</select></label>
              {canAssignOthers ? <label className="field compact case-assignee-select" title={text('Назначить обращение компетентному сотруднику вашего ранга или ниже', 'Assign this case to an eligible staff member at or below your rank')}>
                <span><UsersRound size={13} />{text('Исполнитель', 'Assignee')}</span>
                <select name="case-assignee" value={detail.assignedTo?._id || ''} disabled={busy} onChange={event => updateCase({ assignedTo: event.target.value || null }, event.target.value ? text('Исполнитель назначен.', 'Assignee updated.') : text('Назначение снято.', 'Assignment cleared.'))}>
                  <option value="">{text('Без исполнителя', 'Unassigned')}</option>
                  {eligibleStaff.map(member => <option key={member._id} value={member._id}>{member.nickname || member.username} · {roleLabels[member.role] || member.role}</option>)}
                </select>
              </label> : <button className="button button-secondary assign-button" title={text(`Минимальная роль для этого типа: ${roleLabels[minimumRole[detail.kind]]}`, `Minimum role for this type: ${minimumRole[detail.kind]}`)} disabled={busy || detail.assignedTo?._id === user._id || !canWorkKind(user.role, detail.kind)} onClick={() => updateCase({ assignedTo: user._id }, text('Обращение назначено вам.', 'Case assigned to you.'))}><UserCheck size={16} />{detail.assignedTo?._id === user._id ? text('Назначено вам', 'Assigned to you') : text('Назначить себе', 'Assign to me')}</button>}
            </div>

            <section className="conversation-section">
              <h3>История и заметки</h3>
              <div className="case-notes">
                {detail.notes?.map(item => <article key={item._id} className={item.internal ? 'internal-note' : ''}><div><Avatar user={item.author} size="avatar-tiny" /><strong>{item.author?.username || 'Love Support'}</strong><Badge tone={item.internal ? 'warning' : 'info'}>{item.internal ? 'внутренняя' : 'ответ'}</Badge><time>{formatDate(item.createdAt)}</time>{(canDeleteCases || String(item.author?._id) === String(user._id)) && <button className="icon-button note-delete" onClick={() => deleteNote(item._id)} disabled={busy} title="Удалить заметку"><Trash2 size={14} /></button>}</div><p>{item.body}</p></article>)}
                {!detail.notes?.length && <div className="notes-empty"><Clock3 size={16} /> Ответов пока нет.</div>}
                <div ref={notesBottomRef} aria-hidden="true" />
              </div>
              {canManageSelected && detail.kind === 'appeal' && !['resolved', 'rejected'].includes(detail.status) && <div className="appeal-decision">
                <label className="field"><span>Решение по апелляции</span><textarea name="appeal-decision-reason" value={decisionReason} onChange={event => setDecisionReason(event.target.value)} placeholder="Основание решения для пользователя и аудита" rows="3" maxLength="1000" /></label>
                <div><button className="button button-secondary" onClick={() => decideAppeal('rejected')} disabled={busy}><XCircle size={16} />{text('Отклонить', 'Reject')}</button><button className="button button-primary" onClick={() => decideAppeal('accepted')} disabled={busy}><CheckCircle2 size={16} />{text('Принять и снять наказание', 'Accept and revoke penalty')}</button></div>
              </div>}
              {canManageSelected && <form className="case-reply" onSubmit={sendNote}>
                <textarea name="case-reply" value={note} onChange={event => setNote(event.target.value)} placeholder={internal ? 'Внутренняя заметка' : 'Ответ пользователю'} rows="3" maxLength="4000" />
                <div><label className="check-field"><input name="case-reply-internal" type="checkbox" checked={internal} onChange={event => setInternal(event.target.checked)} /><span>Только для команды</span></label><button className="button button-primary" disabled={busy || !note.trim()}><Send size={16} />Отправить</button></div>
              </form>}
            </section>
          </>}
        </aside>}
      </section>
    </div>
  );
}
