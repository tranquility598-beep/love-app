import { Ban, RotateCcw, ShieldAlert, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { Avatar, Badge, EmptyState, ErrorState, Modal, Notice, PageHeader, Pagination, Segmented } from '../components/ui.jsx';
import { formatDate, toneForStatus } from '../utils/format.js';
import PageLoader from '../components/PageLoader.jsx';
import { useAdminRealtime } from '../realtime/useAdminRealtime.js';

const filters = [
  { value: 'all', label: 'Все' }, { value: 'warning', label: 'Предупреждения' },
  { value: 'mute', label: 'Муты' }, { value: 'ban', label: 'Баны' },
  { value: 'deactivate', label: 'Деактивации' }, { value: 'revoke', label: 'Отмены' }
];

export default function ModerationPage() {
  const [actions, setActions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [type, setType] = useState('all');
  const [active, setActive] = useState(false);
  const [page, setPage] = useState(1);
  const [revoke, setRevoke] = useState(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/moderation-actions', { params: { type, active, page, limit: 25 } });
      setActions(data.actions);
      setPagination(data.pagination);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [type, active, page]);

  useEffect(() => { load(); }, [load]);
  useAdminRealtime('moderation', load);

  async function submitRevoke(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post(`/moderation-actions/${revoke._id}/revoke`, { reason });
      setRevoke(null);
      setReason('');
      setNotice('Наказание снято. Отмена добавлена в неизменяемый журнал.');
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader title="Модерация" description={`${pagination.total} действий в журнале`} />
      {notice && <Notice onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <ErrorState message={error} retry={load} />}
      <section className="panel table-panel">
        <div className="filterbar split-filterbar">
          <Segmented value={type} onChange={value => { setType(value); setPage(1); }} options={filters} label="Тип наказания" />
          <label className="check-field"><input name="moderation-active-only" type="checkbox" checked={active} onChange={event => { setActive(event.target.checked); setPage(1); }} /><span>Только активные</span></label>
        </div>
        {loading ? <PageLoader /> : actions.length ? <div className="data-table-wrap"><table className="data-table">
          <thead><tr><th>Действие</th><th>Пользователь</th><th>Причина</th><th>Сотрудник</th><th>Срок</th><th /></tr></thead>
          <tbody>{actions.map(action => {
            const canRevoke = ['warning', 'mute', 'ban', 'deactivate'].includes(action.type);
            return <tr key={action._id}>
              <td><Badge tone={toneForStatus(action.type === 'ban' ? 'banned' : action.type === 'mute' ? 'muted' : action.type)}>{action.type}</Badge></td>
              <td><div className="user-cell"><Avatar user={action.targetUser} size="avatar-tiny" /><span><strong>{action.targetUser?.nickname || action.targetUser?.username || 'Удалён'}</strong><small>@{action.targetUser?.username || 'unknown'}</small></span></div></td>
              <td className="reason-cell">{action.reason}</td>
              <td>@{action.issuedBy?.username || 'system'}</td>
              <td>{action.permanent ? 'Бессрочно' : action.expiresAt ? formatDate(action.expiresAt) : '—'}</td>
              <td>{canRevoke && <button className="icon-button safe-desktop-only" onClick={() => setRevoke(action)} title="Снять наказание"><RotateCcw size={16} /></button>}</td>
            </tr>;
          })}</tbody>
        </table></div> : <EmptyState title="Журнал пуст" description="Действий с такими фильтрами нет." icon={ShieldAlert} />}
        <Pagination page={pagination.page} pages={pagination.pages} onChange={setPage} />
      </section>

      {revoke && <Modal title="Снять наказание" onClose={() => setRevoke(null)} footer={<><button className="button button-secondary" onClick={() => setRevoke(null)}>Отмена</button><button className="button button-primary" form="revoke-form" disabled={busy}><RotateCcw size={16} />Снять</button></>}>
        <form id="revoke-form" className="form-stack" onSubmit={submitRevoke}>
          <div className="target-strip">{revoke.type === 'ban' ? <Ban size={17} /> : <VolumeX size={17} />}<span><strong>{revoke.targetUser?.username}</strong><small>{revoke.reason}</small></span></div>
          <label className="field"><span>Причина отмены</span><textarea name="moderation-revoke-reason" value={reason} onChange={event => setReason(event.target.value)} rows="4" required /></label>
        </form>
      </Modal>}
    </div>
  );
}
