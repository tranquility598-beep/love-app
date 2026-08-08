import { Activity, Cloud, Cpu, Database, HardDrive, LogOut, MemoryStick, Radio, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { Badge, ErrorState, Metric, PageHeader } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';
import PageLoader from '../components/PageLoader.jsx';

function bytes(value = 0) {
  if (!value) return '0 MB';
  return `${Math.round(value / 1024 / 1024)} MB`;
}

function uptime(seconds = 0) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days}д ${hours}ч ${minutes}м`;
}

export default function InfrastructurePage() {
  const [data, setData] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/infrastructure');
      setData(response.data);
      setUpdatedAt(new Date());
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const revokeOtherSessions = async () => {
    if (!window.confirm('Завершить все остальные административные сессии?')) return;
    setRevoking(true);
    setError('');
    try {
      const response = await api.post('/infrastructure/revoke-admin-sessions');
      window.alert(`${response.data.message}. Завершено: ${response.data.revoked}.`);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setRevoking(false);
    }
  };
  if (loading && !data) return <PageLoader />;

  return <div className="page-stack">
    <PageHeader title="Инфраструктура" description={updatedAt ? `Обновлено ${formatDate(updatedAt)}` : 'Состояние сервисов'} actions={<button className="button button-secondary" onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''} />Обновить</button>} />
    {error && <ErrorState message={error} retry={load} />}
    {data && <>
      <section className="metric-grid infrastructure-metrics">
        <Metric label="MongoDB" value={data.database.status === 'ok' ? 'Работает' : 'Ошибка'} detail={data.database.state} icon={Database} tone={data.database.status === 'ok' ? 'success' : 'danger'} />
        <Metric label="Cloudinary" value={data.cloudinary.status === 'ok' ? 'Настроен' : 'Ошибка'} icon={Cloud} tone={data.cloudinary.status === 'ok' ? 'success' : 'danger'} />
        <Metric label="Socket.io" value={data.sockets.status === 'ok' ? 'Работает' : 'Ошибка'} detail={`${data.sockets.activeConnections} соединений`} icon={Radio} tone={data.sockets.status === 'ok' ? 'success' : 'danger'} />
        <Metric label="Uptime" value={uptime(data.server.uptime)} icon={Activity} />
      </section>
      <section className="infra-grid">
        <article className="panel"><header className="panel-header"><div><h3>Процесс Node.js</h3><p>{data.server.nodeVersion} · {data.server.platform}</p></div><Cpu size={19} /></header><dl className="definition-list"><div><dt><MemoryStick size={14} /> RSS</dt><dd>{bytes(data.server.memoryUsage.rss)}</dd></div><div><dt>Heap used</dt><dd>{bytes(data.server.memoryUsage.heapUsed)}</dd></div><div><dt>Heap total</dt><dd>{bytes(data.server.memoryUsage.heapTotal)}</dd></div><div><dt>External</dt><dd>{bytes(data.server.memoryUsage.external)}</dd></div></dl></article>
        <article className="panel"><header className="panel-header"><div><h3>Подключения</h3><p>Текущая конфигурация сервисов</p></div><HardDrive size={19} /></header><div className="service-list"><div><span>MongoDB</span><Badge tone={data.database.status === 'ok' ? 'success' : 'danger'}>{data.database.status}</Badge></div><div><span>Cloudinary</span><Badge tone={data.cloudinary.status === 'ok' ? 'success' : 'danger'}>{data.cloudinary.status}</Badge></div><div><span>WebSocket</span><Badge tone={data.sockets.status === 'ok' ? 'success' : 'danger'}>{data.sockets.status}</Badge></div></div></article>
      </section>
      <section className="panel danger-zone safe-desktop-only"><header className="panel-header"><div><h3>Защищённые сессии</h3><p>Экстренно завершает все административные сессии, кроме текущей. Доступно только Разработчику.</p></div><LogOut size={19} /></header><button className="button button-danger" onClick={revokeOtherSessions} disabled={revoking}><LogOut size={16} />{revoking ? 'Завершаем...' : 'Завершить остальные сессии'}</button></section>
    </>}
  </div>;
}
