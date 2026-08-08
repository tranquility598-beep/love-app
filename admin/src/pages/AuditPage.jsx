import { BookOpenText, Filter } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { Avatar, Badge, EmptyState, ErrorState, PageHeader, SearchField } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';
import PageLoader from '../components/PageLoader.jsx';
import { useAdminRealtime } from '../realtime/useAdminRealtime.js';

export default function AuditPage() {
  const [logs, setLogs] = useState([]);
  const [action, setAction] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/logs', { params: { action: action || undefined, limit: 200 } });
      setLogs(data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, [action]);

  useEffect(() => { load(); }, [load]);
  useAdminRealtime('*', load);
  const visible = logs.filter(log => !query || `${log.action} ${log.actor?.username} ${log.targetType} ${log.targetId}`.toLowerCase().includes(query.toLowerCase()));

  return <div className="page-stack">
    <PageHeader title="Аудит" description="Постоянный журнал административных действий" />
    {error && <ErrorState message={error} retry={load} />}
    <section className="panel table-panel">
      <div className="filterbar"><SearchField name="audit-search" value={query} onChange={setQuery} placeholder="Сотрудник, действие или объект" /><label className="field-inline"><Filter size={16} /><input name="audit-action" value={action} onChange={event => setAction(event.target.value)} placeholder="Точное действие" /></label></div>
      {loading ? <PageLoader /> : visible.length ? <div className="audit-list">{visible.map(log => <article key={log._id} className="audit-row">
        <Avatar user={log.actor} size="avatar-small" />
        <div><span><strong>@{log.actor?.username || 'system'}</strong><Badge>{log.action}</Badge><time>{formatDate(log.createdAt)}</time></span><p>{log.targetType} · {log.targetId}</p>{log.details && <code>{JSON.stringify(log.details)}</code>}</div>
      </article>)}</div> : <EmptyState title="Записей нет" description="Проверьте фильтры журнала." icon={BookOpenText} />}
    </section>
  </div>;
}
