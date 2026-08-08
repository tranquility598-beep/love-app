import { Search, Server, Trash2, UsersRound } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import { Avatar, EmptyState, ErrorState, Modal, Notice, PageHeader, SearchField } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';
import PageLoader from '../components/PageLoader.jsx';
import { useAdminRealtime } from '../realtime/useAdminRealtime.js';

export default function ServersPage() {
  const { user } = useAuth();
  const [servers, setServers] = useState([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [confirmName, setConfirmName] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canManage = user.permissions?.includes('*') || user.permissions?.includes('servers.manage');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/servers', { params: { query: debouncedQuery } });
      setServers(data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => { load(); }, [load]);
  useAdminRealtime('servers', load);

  async function removeServer(event) {
    event.preventDefault();
    if (confirmName !== selected.name) return;
    setBusy(true);
    try {
      await api.delete(`/servers/${selected._id}`);
      setSelected(null);
      setConfirmName('');
      setNotice('Сервер и связанные данные удалены.');
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-stack">
    <PageHeader title="Серверы" description={`${servers.length} серверов в текущей выборке`} />
    {notice && <Notice onClose={() => setNotice('')}>{notice}</Notice>}
    {error && <ErrorState message={error} retry={load} />}
    <section className="panel table-panel">
      <div className="filterbar"><SearchField value={query} onChange={setQuery} placeholder="Название, ID или владелец" /></div>
      {loading ? <PageLoader /> : servers.length ? <div className="data-table-wrap"><table className="data-table">
        <thead><tr><th>Сервер</th><th>Владелец</th><th>Участники</th><th>Каналы</th><th>Создан</th><th /></tr></thead>
        <tbody>{servers.map(item => <tr key={item._id}>
          <td><div className="user-cell"><span className="avatar avatar-small server-avatar">{item.icon ? <img src={item.icon} alt="" /> : <Server size={16} />}</span><span><strong>{item.name}</strong><small>{item._id}</small></span></div></td>
          <td><div className="user-cell"><Avatar user={item.owner} size="avatar-tiny" /><span><strong>@{item.owner?.username || 'unknown'}</strong><small>{item.owner?.email}</small></span></div></td>
          <td><span className="icon-value"><UsersRound size={15} />{item.members?.length || 0}</span></td>
          <td>{item.channels?.length || 0}</td><td>{formatDate(item.createdAt, false)}</td>
          <td>{canManage && <button className="icon-button safe-desktop-only danger-icon" onClick={() => setSelected(item)} title="Удалить сервер"><Trash2 size={16} /></button>}</td>
        </tr>)}</tbody>
      </table></div> : <EmptyState title="Серверы не найдены" icon={Search} />}
    </section>
    {selected && <Modal title="Удаление сервера" onClose={() => setSelected(null)} footer={<><button className="button button-secondary" onClick={() => setSelected(null)}>Отмена</button><button className="button button-danger" form="delete-server" disabled={busy || confirmName !== selected.name}><Trash2 size={16} />Удалить</button></>}>
      <form id="delete-server" className="form-stack" onSubmit={removeServer}>
        <p>Будут удалены сервер <strong>{selected.name}</strong>, его каналы и сообщения.</p>
        <label className="field"><span>Введите название сервера</span><input name="server-confirm-name" value={confirmName} onChange={event => setConfirmName(event.target.value)} autoFocus /></label>
      </form>
    </Modal>}
  </div>;
}
