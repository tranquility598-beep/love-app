import { Activity, AlertTriangle, Ban, CircleUserRound, MessageSquareWarning, Radio, UsersRound, VolumeX } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import { Badge, ErrorState, Metric, PageHeader, Segmented } from '../components/ui.jsx';
import { formatDate, toneForStatus } from '../utils/format.js';
import PageLoader from '../components/PageLoader.jsx';
import { useAdminRealtime } from '../realtime/useAdminRealtime.js';

const ranges = [
  { value: '24h', label: '24 ч' },
  { value: '7d', label: '7 дней' },
  { value: '30d', label: '30 дней' },
  { value: '90d', label: '90 дней' },
  { value: '1y', label: 'Год' }
];

function OnlineChart({ data }) {
  const frameRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = frameRef.current;
    if (!element) return undefined;
    const measure = () => setSize({
      width: Math.max(0, Math.floor(element.clientWidth)),
      height: Math.max(0, Math.floor(element.clientHeight))
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div className="chart-frame"><div className="chart-canvas" ref={frameRef}>{size.width > 0 && size.height > 0 && (
    <AreaChart width={size.width} height={size.height} data={data} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
      <CartesianGrid stroke="#242424" vertical={false} />
      <XAxis dataKey="label" stroke="#737373" tickLine={false} axisLine={false} minTickGap={28} />
      <YAxis stroke="#737373" tickLine={false} axisLine={false} allowDecimals={false} />
      <Tooltip contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 6 }} />
      <Area type="monotone" dataKey="sessions" name="Сессии" stroke="#62b6cb" fill="#16353d" strokeWidth={2} />
      <Area type="monotone" dataKey="users" name="Пользователи" stroke="#72c787" fill="#17341f" strokeWidth={2} />
    </AreaChart>
  )}</div></div>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [dashboard, setDashboard] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [range, setRange] = useState('7d');
  const [error, setError] = useState('');
  const canAnalytics = user.permissions?.includes('*') || user.permissions?.includes('dashboard.analytics');

  const load = useCallback(async () => {
    setError('');
    try {
      const [basic, extended] = await Promise.all([
        api.get('/dashboard'),
        canAnalytics ? api.get('/analytics', { params: { range } }) : Promise.resolve({ data: null })
      ]);
      setDashboard(basic.data);
      setAnalytics(extended.data);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }, [range, canAnalytics]);

  useEffect(() => { load(); }, [load]);
  useAdminRealtime(['dashboard', 'cases', 'users', 'moderation'], load);

  const chartData = useMemo(() => (analytics?.online || []).map(point => ({
    ...point,
    label: new Intl.DateTimeFormat('ru-RU', range === '24h' ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short' }).format(new Date(point.at))
  })), [analytics, range]);

  if (error && !dashboard) return <ErrorState message={error} retry={load} />;
  if (!dashboard) return <PageLoader />;

  const kpis = { ...dashboard.kpis, ...analytics?.kpis };
  return (
    <div className="page-stack">
      <PageHeader title={`Добрый день, ${user.nickname || user.username}`} description="Сводка по безопасности и состоянию Love" actions={canAnalytics && <Segmented value={range} onChange={setRange} options={ranges} label="Период аналитики" />} />

      <section className="metric-grid">
        <Metric label="Сейчас онлайн" value={kpis.onlineUsers ?? 0} detail={`${kpis.onlineSessions ?? kpis.onlineUsers ?? 0} сессий`} icon={Radio} tone="success" />
        <Metric label="Пользователи" value={kpis.totalUsers ?? 0} detail={analytics ? `${kpis.verifiedUsers} подтверждено` : 'всего аккаунтов'} icon={UsersRound} />
        <Metric label="Новые обращения" value={kpis.newCases ?? 0} detail={`${kpis.criticalCases ?? 0} критических`} icon={MessageSquareWarning} tone={kpis.criticalCases ? 'danger' : 'info'} />
        <Metric label="Активные муты" value={kpis.mutedUsers ?? 0} icon={VolumeX} tone="warning" />
        <Metric label="Активные баны" value={kpis.bannedUsers ?? 0} icon={Ban} tone="danger" />
        {analytics && <Metric label="DAU / MAU" value={`${kpis.dau} / ${kpis.mau}`} detail={`WAU ${kpis.wau}`} icon={Activity} tone="info" />}
      </section>

      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <header className="panel-header"><div><h3>Онлайн</h3><p>Уникальные пользователи и активные сессии</p></div>{analytics && <Badge tone="success">Пик {kpis.peakOnline}</Badge>}</header>
          {canAnalytics ? chartData.length ? (
            <OnlineChart data={chartData} />
          ) : <div className="chart-empty">Первый снимок появится в течение пяти минут.</div> : (
            <div className="chart-empty"><CircleUserRound size={22} /> Расширенная аналитика доступна администраторам.</div>
          )}
        </article>

        <article className="panel urgent-panel">
          <header className="panel-header"><div><h3>Требуют внимания</h3><p>Открытые обращения по приоритету</p></div><AlertTriangle size={18} /></header>
          <div className="compact-list">
            {dashboard.recentCases.map(item => (
              <Link key={item._id} to={`/cases?case=${item._id}`} className="compact-row">
                <span className={`priority-dot priority-${item.priority}`} />
                <span className="row-main"><strong>{item.title}</strong><small>{item.number} · {formatDate(item.createdAt)}</small></span>
                <Badge tone={toneForStatus(item.status)}>{item.status}</Badge>
              </Link>
            ))}
            {!dashboard.recentCases.length && <div className="chart-empty">Открытых обращений нет.</div>}
          </div>
        </article>
      </section>
    </div>
  );
}
