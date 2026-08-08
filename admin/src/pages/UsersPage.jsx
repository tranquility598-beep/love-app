import { Ban, ChevronRight, Clock3, Search, ShieldAlert, ShieldCheck, UserRoundX, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import {
  Avatar, Badge, EmptyState, ErrorState, Modal, Notice, PageHeader, Pagination,
  SearchField
} from '../components/ui.jsx';
import { formatDate, toneForStatus } from '../utils/format.js';
import PageLoader from '../components/PageLoader.jsx';
import { useAdminRealtime } from '../realtime/useAdminRealtime.js';

const statusOptions = [
  ['all', 'Все статусы'], ['verified', 'Подтверждённые'], ['pending', 'Без подтверждения'],
  ['muted', 'С мутом'], ['banned', 'Забаненные'], ['deactivated', 'Деактивированные']
];

const durationOptions = [
  [3600000, '1 час'], [86400000, '24 часа'], [604800000, '7 дней'],
  [2592000000, '30 дней']
];

function userStatus(user) {
  if (user.deactivatedAt) return ['Деактивирован', 'danger'];
  if (user.isBanned) return ['Бан', 'danger'];
  if (user.isMuted) return ['Мут', 'warning'];
  if (user.isVerified) return ['Активен', 'success'];
  return ['Не подтверждён', 'neutral'];
}

export default function UsersPage() {
  const { user: actor } = useAuth();
  const [users, setUsers] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);
  const [actionType, setActionType] = useState('warning');
  const [actionOpen, setActionOpen] = useState(false);
  const [actionForm, setActionForm] = useState({ reason: '', duration: 86400000, permanent: false });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedQuery(query); setPage(1); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/users', { params: { query: debouncedQuery, status, page, limit: 25 } });
      setUsers(data.users);
      setPagination(data.pagination);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, status, page]);

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useAdminRealtime(['users', 'moderation', 'team'], loadUsers);

  async function openUser(user) {
    setSelected(user);
    setDetails(null);
    try {
      const [profile, moderation] = await Promise.all([
        api.get(`/users/${user._id}`),
        (actor.permissions?.includes('*') || actor.permissions?.includes('moderation.warn'))
          ? api.get(`/users/${user._id}/moderation`).catch(() => ({ data: { actions: [], activeWarnings: 0 } }))
          : Promise.resolve({ data: { actions: [], activeWarnings: 0 } })
      ]);
      setDetails({ ...profile.data, moderation: moderation.data });
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  const availableActions = useMemo(() => {
    const permissions = new Set(actor.permissions || []);
    const all = permissions.has('*');
    return [
      { value: 'warning', label: 'Предупреждение', icon: ShieldAlert, allowed: all || permissions.has('moderation.warn') },
      { value: 'mute', label: 'Мут', icon: VolumeX, allowed: all || [...permissions].some(value => value.startsWith('moderation.mute')) },
      { value: 'ban', label: 'Бан', icon: Ban, allowed: all || [...permissions].some(value => value.startsWith('moderation.ban')) },
      { value: 'deactivate', label: 'Деактивация', icon: UserRoundX, allowed: all || permissions.has('users.deactivate') }
    ].filter(item => item.allowed);
  }, [actor.permissions]);

  function beginAction(type) {
    setActionType(type);
    setActionForm({ reason: '', duration: type === 'ban' ? 604800000 : 86400000, permanent: false });
    setActionOpen(true);
  }

  async function submitAction(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post(`/users/${selected._id}/actions`, {
        type: actionType,
        reason: actionForm.reason,
        duration: ['warning', 'deactivate', 'restore'].includes(actionType) ? null : Number(actionForm.duration),
        permanent: ['warning', 'deactivate', 'restore'].includes(actionType) ? false : actionForm.permanent
      });
      setActionOpen(false);
      setNotice('Действие применено и записано в журнал аудита.');
      await loadUsers();
      await openUser(selected);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader title="Пользователи" description={`${pagination.total} аккаунтов в выборке`} />
      {notice && <Notice onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <ErrorState message={error} retry={loadUsers} />}

      <section className="panel table-panel">
        <div className="filterbar">
          <SearchField value={query} onChange={setQuery} placeholder="Имя, email или ID" />
          <label className="select-field"><span className="sr-only">Статус</span><select name="users-status-filter" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}>{statusOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        </div>
        {loading ? <PageLoader /> : users.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead><tr><th>Пользователь</th><th>Статус</th><th>Ранг</th><th>Регистрация</th><th aria-label="Открыть" /></tr></thead>
              <tbody>{users.map(user => {
                const [label, tone] = userStatus(user);
                return (
                  <tr key={user._id} onClick={() => openUser(user)}>
                    <td><div className="user-cell"><Avatar user={user} size="avatar-small" /><span><strong>{user.nickname || user.username}</strong><small>@{user.username} · {user.email}</small></span></div></td>
                    <td><Badge tone={tone}>{label}</Badge></td>
                    <td>{user.roleLabel || user.role}</td>
                    <td>{formatDate(user.createdAt, false)}</td>
                    <td><ChevronRight size={17} /></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : <EmptyState title="Ничего не найдено" description="Измените запрос или фильтр статуса." icon={Search} />}
        <Pagination page={pagination.page} pages={pagination.pages} onChange={setPage} />
      </section>

      {selected && (
        <Modal title={`@${selected.username}`} onClose={() => { setSelected(null); setDetails(null); }} wide>
          {!details ? <PageLoader /> : (
            <div className="user-detail-grid">
              <section className="detail-summary">
                <div className="profile-heading"><Avatar user={details.user} /><div><h3>{details.user.nickname || details.user.username}</h3><p>{details.user.email}</p></div></div>
                <dl className="definition-list">
                  <div><dt>ID</dt><dd>{details.user._id}</dd></div>
                  <div><dt>Ранг</dt><dd>{details.user.roleLabel || details.user.role}</dd></div>
                  <div><dt>Предупреждения</dt><dd>{details.warningCount}</dd></div>
                  <div><dt>Серверы владельца</dt><dd>{details.ownedServersCount}</dd></div>
                  <div><dt>Последний онлайн</dt><dd>{formatDate(details.user.lastSeen)}</dd></div>
                </dl>
                {!!availableActions.length && <div className="moderation-actions safe-desktop-only">{availableActions.map(({ value, label, icon: Icon }) => <button className={`button ${value === 'ban' || value === 'deactivate' ? 'button-danger' : 'button-secondary'}`} key={value} onClick={() => beginAction(value)}><Icon size={16} />{label}</button>)}</div>}
              </section>
              <section className="detail-history">
                <h3>История модерации</h3>
                {details.moderation.actions.length ? details.moderation.actions.map(action => (
                  <article className="history-item" key={action._id}>
                    <span className="history-line" />
                    <div><span><Badge tone={toneForStatus(action.type === 'ban' ? 'banned' : action.type === 'mute' ? 'muted' : action.type)}>{action.type}</Badge><small>{formatDate(action.createdAt)}</small></span><strong>{action.reason}</strong><p>{action.issuedBy?.username ? `Выдал: @${action.issuedBy.username}` : 'Системное действие'}{action.expiresAt ? ` · до ${formatDate(action.expiresAt)}` : ''}</p></div>
                  </article>
                )) : <EmptyState title="История чистая" description="На аккаунте нет наказаний." icon={ShieldCheck} />}
              </section>
            </div>
          )}
        </Modal>
      )}

      {actionOpen && (
        <Modal title={availableActions.find(item => item.value === actionType)?.label || 'Действие'} onClose={() => setActionOpen(false)} footer={<><button className="button button-secondary" onClick={() => setActionOpen(false)}>Отмена</button><button className="button button-danger" form="moderation-form" disabled={busy}>Применить</button></>}>
          <form id="moderation-form" className="form-stack" onSubmit={submitAction}>
            <div className="target-strip"><Avatar user={selected} size="avatar-small" /><span><strong>{selected.nickname || selected.username}</strong><small>@{selected.username}</small></span></div>
            <label className="field"><span>Причина</span><textarea name="moderation-action-reason" value={actionForm.reason} onChange={event => setActionForm(form => ({ ...form, reason: event.target.value }))} rows="4" maxLength="1000" required /></label>
            {!['warning', 'deactivate', 'restore'].includes(actionType) && <>
              <label className="field"><span>Срок</span><select name="moderation-action-duration" value={actionForm.duration} disabled={actionForm.permanent} onChange={event => setActionForm(form => ({ ...form, duration: event.target.value }))}>{durationOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="check-field"><input name="moderation-action-permanent" type="checkbox" checked={actionForm.permanent} onChange={event => setActionForm(form => ({ ...form, permanent: event.target.checked }))} /><span>Бессрочно</span></label>
            </>}
            <p className="form-hint"><Clock3 size={14} /> Сервер проверит срок и полномочия вашего ранга.</p>
          </form>
        </Modal>
      )}
    </div>
  );
}
