import {
  Activity, BellRing, BookOpenText, ChevronLeft, ChevronRight,
  CircleUserRound, Gauge, Heart, LogOut, Megaphone, Menu, MessagesSquare,
  Library, Server, Settings, ShieldCheck, UsersRound, X
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth.js';
import { useLocale } from '../i18n/useLocale.js';
import { API_ORIGIN } from '../api/client.js';

const navigation = [
  { to: '/', labelKey: 'dashboard', icon: Gauge, end: true, mobile: true },
  { to: '/users', labelKey: 'users', icon: CircleUserRound },
  { to: '/moderation', labelKey: 'moderation', icon: ShieldCheck, permission: 'moderation.warn' },
  { to: '/cases', labelKey: 'cases', icon: MessagesSquare, mobile: true },
  { to: '/community', labelKey: 'community', icon: Heart },
  { to: '/team', labelKey: 'team', icon: UsersRound },
  { to: '/staff-comms', labelKey: 'staffComms', icon: MessagesSquare, mobile: true },
  { to: '/servers', labelKey: 'servers', icon: Server, permission: 'servers.manage' },
  { to: '/announcements', labelKey: 'announcements', icon: Megaphone, permission: 'announcements.manage' },
  { to: '/audit', labelKey: 'audit', icon: BookOpenText, permission: 'audit.read' },
  { to: '/infrastructure', labelKey: 'infrastructure', icon: Activity, permission: 'infrastructure.read' },
  { to: '/documentation', labelKey: 'documentation', icon: Library },
  { to: '/settings', labelKey: 'settings', icon: Settings }
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const { locale, setLocale, t } = useLocale();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const permissions = new Set(user?.permissions || []);
  const availableNavigation = navigation.filter(item => !item.permission || permissions.has('*') || permissions.has(item.permission));
  const activeNavigation = availableNavigation.find(item => item.end ? item.to === location.pathname : location.pathname.startsWith(item.to));
  const title = activeNavigation ? t(activeNavigation.labelKey) : 'Love Admin';

  useEffect(() => {
    const source = new EventSource(`${API_ORIGIN}/api/admin/events`, { withCredentials: true });
    source.addEventListener('ready', () => setRealtimeConnected(true));
    source.addEventListener('update', event => {
      setRealtimeConnected(true);
      try {
        window.dispatchEvent(new CustomEvent('love-admin-update', { detail: JSON.parse(event.data) }));
      } catch {
        // Ignore malformed events; the stream remains connected.
      }
    });
    source.onerror = () => setRealtimeConnected(false);
    return () => source.close();
  }, []);

  return (
    <div className={`admin-shell ${collapsed ? 'is-collapsed' : ''}`}>
      <aside className={`sidebar ${mobileOpen ? 'is-open' : ''}`}>
        <div className="brand-row">
          <span className="brand-mark"><Heart size={18} fill="currentColor" /></span>
          <span className="brand-copy"><strong>LOVE</strong><small>CONTROL</small></span>
          <button className="icon-button mobile-close" onClick={() => setMobileOpen(false)} title={t('closeMenu')}><X size={18} /></button>
        </div>

        <nav className="primary-nav" aria-label="Основные разделы">
          {availableNavigation.map(({ to, labelKey, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} onClick={() => setMobileOpen(false)} title={collapsed ? t(labelKey) : undefined}>
              <Icon size={18} />
              <span>{t(labelKey)}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="staff-identity">
            <span className="avatar avatar-small">{user?.username?.slice(0, 1).toUpperCase()}</span>
            <span><strong>{user?.username}</strong><small>{user?.roleLabel}</small></span>
          </div>
          <button className="icon-button" onClick={logout} title={t('logout')}><LogOut size={18} /></button>
        </div>
        <button className="collapse-button" onClick={() => setCollapsed(value => !value)} title={collapsed ? t('expandMenu') : t('collapseMenu')}>
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileOpen(true)} title={t('openMenu')}><Menu size={19} /></button>
          <div><span className="eyebrow">LOVE ADMIN</span><h1>{title}</h1></div>
          <div className="topbar-actions">
            <div className="locale-switch" aria-label="Language"><button className={locale === 'ru' ? 'active' : ''} onClick={() => setLocale('ru')} aria-label="Русский язык">RU</button><button className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')} aria-label="English language">EN</button></div>
            <button className="icon-button" title={t('notifications')}><BellRing size={18} /></button>
            <span className={`realtime-state ${realtimeConnected ? 'is-live' : ''}`} title={realtimeConnected ? 'Обновления поступают в реальном времени' : 'Восстанавливаем канал обновлений'}><i />{realtimeConnected ? 'LIVE' : 'SYNC'}</span>
            <span className="security-state"><ShieldCheck size={15} /> {t('secureSession')}</span>
          </div>
        </header>
        <div className="page-container"><Outlet /></div>
      </main>

      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {availableNavigation.filter(item => item.mobile).map(({ to, labelKey, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}><Icon size={19} /><span>{t(labelKey)}</span></NavLink>
        ))}
      </nav>
      {mobileOpen && <button className="sidebar-scrim" aria-label="Закрыть меню" onClick={() => setMobileOpen(false)} />}
    </div>
  );
}
