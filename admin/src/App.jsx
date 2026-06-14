import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend
} from 'recharts';

// Auto-detect backend URL
const BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5555'
  : 'https://love-app-2ou3.onrender.com';

// Axios Instance with request interceptor for JWT
const API = axios.create({
  baseURL: `${BASE_URL}/api`
});

API.interceptors.request.use(config => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('adminToken'));
  const [currentView, setCurrentView] = useState('dashboard');
  const [notification, setNotification] = useState(null);

  // Authentication States
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [require2FA, setRequire2FA] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Modal / Operations States
  const [modals, setModals] = useState({
    ban: false,
    mute: false,
    role: false,
    deleteServer: false,
    resolveReport: false
  });
  const [selectedItem, setSelectedItem] = useState(null); // active user, server, or report
  const [actionForm, setActionForm] = useState({
    reason: '',
    duration: '3600000', // 1 hour in ms
    role: 'user',
    moderatorAction: ''
  });

  // Global notify helper
  const showNotify = (type, text) => {
    setNotification({ type, text });
    setTimeout(() => setNotification(null), 5000);
  };

  // Logout handler
  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setToken(null);
    setUser(null);
    setCurrentView('dashboard');
    showNotify('info', 'Сессия завершена');
  };

  // Global Auth Interceptor to handle session expiration (401/403)
  useEffect(() => {
    const interceptor = API.interceptors.response.use(
      response => response,
      error => {
        if (error.response && (error.response.status === 401 || error.response.status === 403)) {
          const errMsg = error.response.data?.message || '';
          // Only force logout if already logged in and it's not a login check
          if (token && !errMsg.includes('роли') && !errMsg.includes('заблокирован')) {
            handleLogout();
          }
        }
        return Promise.reject(error);
      }
    );
    return () => {
      API.interceptors.response.handlers = API.interceptors.response.handlers.filter(h => h !== interceptor);
    };
  }, [token]);

  // Check existing token validity on startup
  useEffect(() => {
    if (token) {
      setAuthLoading(true);
      API.get('/auth/me')
        .then(res => {
          const me = res.data?.user;
          const allowed = ['founder', 'admin', 'moderator', 'support'];
          if (me && allowed.includes(me.role)) {
            setUser(me);
          } else {
            showNotify('error', 'Ошибка доступа: Недостаточно прав для входа в админку');
            handleLogout();
          }
        })
        .catch(() => {
          handleLogout();
        })
        .finally(() => {
          setAuthLoading(false);
        });
    }
  }, [token]);

  // Login handler
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    setAuthLoading(true);

    try {
      if (require2FA) {
        // Step 2: 2FA Verification
        const response = await API.post('/auth/verify-2fa', {
          code: otpCode,
          mfaToken
        });
        const { token: receivedToken, user: loggedUser } = response.data;
        const allowed = ['founder', 'admin', 'moderator', 'support'];
        if (loggedUser && allowed.includes(loggedUser.role)) {
          localStorage.setItem('adminToken', receivedToken);
          setToken(receivedToken);
          setUser(loggedUser);
          showNotify('success', `Добро пожаловать, ${loggedUser.username}`);
        } else {
          showNotify('error', 'Доступ запрещен: недостаточно прав');
        }
        setRequire2FA(false);
        setOtpCode('');
        setMfaToken('');
      } else {
        // Step 1: Normal Credentials
        const response = await API.post('/auth/login', { email, password });
        if (response.data.require2FA) {
          setRequire2FA(true);
          setMfaToken(response.data.mfaToken);
          showNotify('info', 'Введите код двухфакторной аутентификации');
        } else {
          const { token: receivedToken, user: loggedUser } = response.data;
          const allowed = ['founder', 'admin', 'moderator', 'support'];
          if (loggedUser && allowed.includes(loggedUser.role)) {
            localStorage.setItem('adminToken', receivedToken);
            setToken(receivedToken);
            setUser(loggedUser);
            showNotify('success', `Добро пожаловать, ${loggedUser.username}`);
          } else {
            showNotify('error', 'Доступ запрещен: недостаточно прав');
          }
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      showNotify('error', err.response?.data?.message || 'Ошибка аутентификации');
    } finally {
      setAuthLoading(false);
    }
  };

  // Open modals helper
  const openModal = (type, item) => {
    setSelectedItem(item);
    setActionForm({
      reason: '',
      duration: '3600000',
      role: item?.role || 'user',
      moderatorAction: ''
    });
    setModals(prev => ({ ...prev, [type]: true }));
  };

  // Close modals helper
  const closeModal = (type) => {
    setModals(prev => ({ ...prev, [type]: false }));
    setSelectedItem(null);
  };

  if (!token || !user) {
    return (
      <div className="login-container">
        <div className="glass-panel login-card">
          <div className="logo-header">
            <div className="logo-icon">💖</div>
            <h2 className="logo-title">LOVE <span>ADMIN</span></h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '5px' }}>
              Панель управления и безопасности платформы
            </p>
          </div>

          <form onSubmit={handleLoginSubmit}>
            {!require2FA ? (
              <>
                <div className="form-group">
                  <label className="form-label">Email адрес</label>
                  <input
                    type="email"
                    className="glass-input"
                    placeholder="moderator@love.app"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={authLoading}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Пароль</label>
                  <input
                    type="password"
                    className="glass-input"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={authLoading}
                  />
                </div>
              </>
            ) : (
              <div className="form-group">
                <label className="form-label">Код из Google Authenticator</label>
                <input
                  type="text"
                  className="glass-input"
                  placeholder="000 000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value)}
                  maxLength={6}
                  required
                  disabled={authLoading}
                  autoFocus
                />
              </div>
            )}

            <button
              type="submit"
              className="glass-button primary"
              style={{ width: '100%', justifyContent: 'center', marginTop: '10px' }}
              disabled={authLoading}
            >
              {authLoading ? 'Загрузка...' : require2FA ? 'Подтвердить код' : 'Войти в панель'}
            </button>
          </form>
        </div>

        {notification && (
          <div className={`status-pill ${notification.type}`} style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999 }}>
            {notification.text}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* SIDEBAR NAVIGATION */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          LOVE <span>CONTROL</span>
        </div>

        <nav className="sidebar-menu">
          <div
            className={`sidebar-item ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
          >
            📊 Дашборд
          </div>
          <div
            className={`sidebar-item ${currentView === 'users' ? 'active' : ''}`}
            onClick={() => setCurrentView('users')}
          >
            👥 Пользователи
          </div>
          <div
            className={`sidebar-item ${currentView === 'servers' ? 'active' : ''}`}
            onClick={() => setCurrentView('servers')}
          >
            🛡️ Серверы
          </div>
          <div
            className={`sidebar-item ${currentView === 'reports' ? 'active' : ''}`}
            onClick={() => setCurrentView('reports')}
          >
            ⚠️ Жалобы
          </div>
          {['founder', 'admin'].includes(user.role) && (
            <div
              className={`sidebar-item ${currentView === 'announcements' ? 'active' : ''}`}
              onClick={() => setCurrentView('announcements')}
            >
              📣 Анонсы
            </div>
          )}
          {['founder'].includes(user.role) && (
            <>
              <div
                className={`sidebar-item ${currentView === 'logs' ? 'active' : ''}`}
                onClick={() => setCurrentView('logs')}
              >
                📜 Аудит логи
              </div>
              <div
                className={`sidebar-item ${currentView === 'infra' ? 'active' : ''}`}
                onClick={() => setCurrentView('infra')}
              >
                ⚙️ Инфраструктура
              </div>
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="admin-badge">
            <div className="admin-avatar">
              {user.username ? user.username.substring(0, 2).toUpperCase() : 'AD'}
            </div>
            <div className="admin-meta">
              <span className="admin-name">{user.nickname || user.username}</span>
              <span className="admin-role">{user.role}</span>
            </div>
          </div>
          <button className="glass-button danger" onClick={handleLogout} style={{ width: '100%', justifyContent: 'center' }}>
            🚪 Выйти
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="main-content">
        {currentView === 'dashboard' && <DashboardView user={user} showNotify={showNotify} openModal={openModal} />}
        {currentView === 'users' && <UsersView user={user} showNotify={showNotify} openModal={openModal} />}
        {currentView === 'servers' && <ServersView user={user} showNotify={showNotify} openModal={openModal} />}
        {currentView === 'reports' && <ReportsView user={user} showNotify={showNotify} openModal={openModal} />}
        {currentView === 'announcements' && <AnnouncementsView user={user} showNotify={showNotify} />}
        {currentView === 'logs' && <AuditLogsView user={user} showNotify={showNotify} />}
        {currentView === 'infra' && <InfrastructureView user={user} showNotify={showNotify} />}
      </main>

      {/* MODAL WINDOWS */}
      {modals.ban && selectedItem && (
        <div className="modal-overlay" onClick={() => closeModal('ban')}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Заблокировать пользователя</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Вы собираетесь выдать бан пользователю <strong>@{selectedItem.username}</strong>. Все активные сессии будут мгновенно аннулированы.
            </p>
            <div className="form-group">
              <label className="form-label">Причина блокировки</label>
              <input
                type="text"
                className="glass-input"
                placeholder="Нарушение правил сообщества, спам, токсичное поведение..."
                value={actionForm.reason}
                onChange={(e) => setActionForm(prev => ({ ...prev, reason: e.target.value }))}
                autoFocus
              />
            </div>
            <div className="action-group" style={{ justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="glass-button" onClick={() => closeModal('ban')}>Отмена</button>
              <button
                className="glass-button danger"
                onClick={async () => {
                  try {
                    await API.post(`/admin/users/${selectedItem._id}/ban`, { reason: actionForm.reason });
                    showNotify('success', `Пользователь @${selectedItem.username} успешно заблокирован`);
                    closeModal('ban');
                  } catch (err) {
                    showNotify('error', err.response?.data?.message || 'Не удалось заблокировать пользователя');
                  }
                }}
              >
                🚨 Подтвердить бан
              </button>
            </div>
          </div>
        </div>
      )}

      {modals.mute && selectedItem && (
        <div className="modal-overlay" onClick={() => closeModal('mute')}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Выдать мут пользователю</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Ограничение на отправку текстовых сообщений и участие в голосовом общении для <strong>@{selectedItem.username}</strong>.
            </p>
            <div className="form-group">
              <label className="form-label">Длительность мута</label>
              <select
                className="glass-select"
                style={{ width: '100%' }}
                value={actionForm.duration}
                onChange={(e) => setActionForm(prev => ({ ...prev, duration: e.target.value }))}
              >
                <option value="600000">10 минут</option>
                <option value="3600000">1 час</option>
                <option value="86400000">24 часа</option>
                <option value="604800000">7 дней</option>
                <option value="null">Бессрочно</option>
              </select>
            </div>
            <div className="action-group" style={{ justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="glass-button" onClick={() => closeModal('mute')}>Отмена</button>
              <button
                className="glass-button warning"
                onClick={async () => {
                  try {
                    const dur = actionForm.duration === 'null' ? null : parseInt(actionForm.duration);
                    await API.post(`/admin/users/${selectedItem._id}/mute`, { duration: dur });
                    showNotify('success', `Пользователь @${selectedItem.username} замучен`);
                    closeModal('mute');
                  } catch (err) {
                    showNotify('error', err.response?.data?.message || 'Не удалось выдать мут');
                  }
                }}
              >
                🎙️ Выдать мут
              </button>
            </div>
          </div>
        </div>
      )}

      {modals.role && selectedItem && (
        <div className="modal-overlay" onClick={() => closeModal('role')}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Изменить роль пользователя</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Смена прав для пользователя <strong>@{selectedItem.username}</strong>.
            </p>
            <div className="form-group">
              <label className="form-label">Выберите роль</label>
              <select
                className="glass-select"
                style={{ width: '100%' }}
                value={actionForm.role}
                onChange={(e) => setActionForm(prev => ({ ...prev, role: e.target.value }))}
              >
                <option value="user">Обычный пользователь (User)</option>
                <option value="support">Служба поддержки (Support)</option>
                <option value="moderator">Модератор (Moderator)</option>
                <option value="admin">Администратор (Admin)</option>
                <option value="founder">Создатель (Founder)</option>
              </select>
            </div>
            <div className="action-group" style={{ justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="glass-button" onClick={() => closeModal('role')}>Отмена</button>
              <button
                className="glass-button primary"
                onClick={async () => {
                  try {
                    await API.put(`/admin/users/${selectedItem._id}/role`, { role: actionForm.role });
                    showNotify('success', `Роль @${selectedItem.username} успешно обновлена до ${actionForm.role}`);
                    closeModal('role');
                  } catch (err) {
                    showNotify('error', err.response?.data?.message || 'Не удалось обновить роль');
                  }
                }}
              >
                💾 Сохранить изменения
              </button>
            </div>
          </div>
        </div>
      )}

      {modals.deleteServer && selectedItem && (
        <div className="modal-overlay" onClick={() => closeModal('deleteServer')}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Удалить сервер?</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Вы собираетесь полностью удалить сервер <strong>{selectedItem.name}</strong>. Все текстовые каналы, голосовые сессии и истории сообщений будут БЕЗВОЗВРАТНО уничтожены.
            </p>
            <div className="action-group" style={{ justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="glass-button" onClick={() => closeModal('deleteServer')}>Отмена</button>
              <button
                className="glass-button danger"
                onClick={async () => {
                  try {
                    await API.delete(`/admin/servers/${selectedItem._id}`);
                    showNotify('success', `Сервер "${selectedItem.name}" удален`);
                    closeModal('deleteServer');
                  } catch (err) {
                    showNotify('error', err.response?.data?.message || 'Не удалось удалить сервер');
                  }
                }}
              >
                🗑️ Уничтожить сервер
              </button>
            </div>
          </div>
        </div>
      )}

      {modals.resolveReport && selectedItem && (
        <div className="modal-overlay" onClick={() => closeModal('resolveReport')}>
          <div className="glass-panel modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Разрешить жалобу</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Пометить тикет #{selectedItem._id.substring(18)} как решенный.
            </p>
            <div className="form-group">
              <label className="form-label">Принятые меры / Описание вердикта</label>
              <textarea
                className="glass-input"
                style={{ minHeight: '100px', resize: 'vertical' }}
                placeholder="Пользователь был предупрежден / сообщения удалены / выдан мут на 24 часа..."
                value={actionForm.moderatorAction}
                onChange={(e) => setActionForm(prev => ({ ...prev, moderatorAction: e.target.value }))}
                required
              />
            </div>
            <div className="action-group" style={{ justifyContent: 'flex-end', marginTop: '20px' }}>
              <button className="glass-button" onClick={() => closeModal('resolveReport')}>Отмена</button>
              <button
                className="glass-button primary"
                onClick={async () => {
                  try {
                    await API.put(`/admin/reports/${selectedItem._id}/status`, {
                      status: 'resolved',
                      moderatorAction: actionForm.moderatorAction
                    });
                    showNotify('success', `Жалоба решена`);
                    closeModal('resolveReport');
                  } catch (err) {
                    showNotify('error', err.response?.data?.message || 'Не удалось обновить статус');
                  }
                }}
              >
                ✅ Решено
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic notifications */}
      {notification && (
        <div className={`status-pill ${notification.type}`} style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 9999 }}>
          {notification.text}
        </div>
      )}
    </div>
  );
}

// ==================== VIEW COMPONENTS ====================

// 1. DASHBOARD VIEW
function DashboardView({ user, showNotify }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/admin/analytics')
      .then(res => setData(res.data))
      .catch(err => showNotify('error', 'Ошибка при загрузке аналитики'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div>Загрузка аналитики...</div>;
  if (!data) return <div>Нет данных аналитики. Убедитесь, что ваша роль имеет доступ Admin.</div>;

  const { kpis, chartsData } = data;

  return (
    <div>
      <h1>Панель управления</h1>
      <p className="subtitle">Основные KPI показатели и динамика активности за последние 7 дней</p>

      <div className="kpi-grid">
        <div className="glass-panel kpi-card">
          <div className="kpi-header">
            <span>Всего пользователей</span>
            <span className="kpi-icon">👥</span>
          </div>
          <div className="kpi-value">{kpis.totalUsers}</div>
          <span className="kpi-trend up">Зарегистрировано в базе</span>
        </div>
        <div className="glass-panel kpi-card">
          <div className="kpi-header">
            <span>Активных сегодня (DAU)</span>
            <span className="kpi-icon">⚡</span>
          </div>
          <div className="kpi-value">{kpis.dau}</div>
          <span className="kpi-trend up">за последние 24 часа</span>
        </div>
        <div className="glass-panel kpi-card">
          <div className="kpi-header">
            <span>Активных в месяц (MAU)</span>
            <span className="kpi-icon">🌙</span>
          </div>
          <div className="kpi-value">{kpis.mau}</div>
          <span className="kpi-trend up">за последние 30 дней</span>
        </div>
        <div className="glass-panel kpi-card">
          <div className="kpi-header">
            <span>Всего серверов</span>
            <span className="kpi-icon">🛡️</span>
          </div>
          <div className="kpi-value">{kpis.totalServers}</div>
          <span className="kpi-trend">Виртуальные сообщества</span>
        </div>
      </div>

      <div className="glass-panel">
        <h3>Динамика роста и общения</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
          Сопоставление новых регистраций и объема сообщений за неделю
        </p>

        <div className="chart-container">
          <ResponsiveContainer width="99%" height="100%" minWidth={0}>
            <AreaChart data={chartsData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7c5dfa" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#7c5dfa" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorMsg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00f0ff" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#00f0ff" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" stroke="var(--text-secondary)" tickLine={false} />
              <YAxis stroke="var(--text-secondary)" tickLine={false} />
              <Tooltip
                contentStyle={{
                  background: 'rgba(13,14,26,0.9)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '10px'
                }}
              />
              <Legend verticalAlign="top" height={36}/>
              <Area
                type="monotone"
                dataKey="registrations"
                name="Новые регистрации"
                stroke="#7c5dfa"
                fillOpacity={1}
                fill="url(#colorReg)"
              />
              <Area
                type="monotone"
                dataKey="messages"
                name="Сообщения"
                stroke="#00f0ff"
                fillOpacity={1}
                fill="url(#colorMsg)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// 2. USERS VIEW
function UsersView({ user, showNotify, openModal }) {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchUsers = useCallback(() => {
    setLoading(true);
    API.get(`/admin/users?query=${encodeURIComponent(search)}`)
      .then(res => setUsers(res.data))
      .catch(() => showNotify('error', 'Не удалось загрузить пользователей'))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleKick = async (targetUser) => {
    if (!window.confirm(`Принудительно разорвать сокет-соединение для @${targetUser.username}?`)) return;
    try {
      await API.post(`/admin/users/${targetUser._id}/kick`);
      showNotify('success', `Пользователь @${targetUser.username} успешно отключен (кик)`);
      fetchUsers();
    } catch (err) {
      showNotify('error', err.response?.data?.message || 'Не удалось кикнуть пользователя');
    }
  };

  const handleUnban = async (targetUser) => {
    try {
      await API.post(`/admin/users/${targetUser._id}/unban`);
      showNotify('success', `Блокировка с @${targetUser.username} снята`);
      fetchUsers();
    } catch (err) {
      showNotify('error', 'Ошибка разбана');
    }
  };

  const handleUnmute = async (targetUser) => {
    try {
      await API.post(`/admin/users/${targetUser._id}/unmute`);
      showNotify('success', `Мут с @${targetUser.username} снят`);
      fetchUsers();
    } catch (err) {
      showNotify('error', 'Ошибка снятия мута');
    }
  };

  // Roles order hierarchy
  const roleHierarchy = { support: 1, moderator: 2, admin: 3, founder: 4 };

  const canModerate = (targetUser) => {
    if (user.role === 'founder') return true;
    const adminLvl = roleHierarchy[user.role] || 0;
    const targetLvl = roleHierarchy[targetUser.role] || 0;
    return adminLvl > targetLvl;
  };

  return (
    <div>
      <h1>Управление пользователями</h1>
      <p className="subtitle">Поиск, изменение ролей, блокировка и заглушение участников</p>

      <div className="filters-bar">
        <input
          type="text"
          className="glass-input"
          placeholder="Поиск по имени, никнейму, email или ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: '400px' }}
        />
        <button className="glass-button primary" onClick={fetchUsers}>Найти</button>
      </div>

      <div className="glass-panel table-container">
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Загрузка пользователей...</div>
        ) : users.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Пользователи не найдены</div>
        ) : (
          <table className="glass-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Роль</th>
                <th>Статус</th>
                <th>Причина бана / мута</th>
                <th style={{ textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u._id}>
                  <td>
                    <div className="table-avatar-item">
                      <div className="admin-avatar" style={{ background: u.isBanned ? 'var(--color-danger)' : 'var(--color-primary)' }}>
                        {u.username.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600 }}>{u.nickname || u.username}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>@{u.username} • {u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`role-tag ${u.role}`}>{u.role}</span>
                  </td>
                  <td>
                    {u.isBanned ? (
                      <span className="status-pill banned">BAN</span>
                    ) : u.isMuted ? (
                      <span className="status-pill muted">MUTE</span>
                    ) : (
                      <span className="status-pill active">ACTIVE</span>
                    )}
                  </td>
                  <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.isBanned ? u.banReason || 'Без указания причины' : u.isMuted ? (u.muteUntil ? `До ${new Date(u.muteUntil).toLocaleString()}` : 'Бессрочно') : '—'}
                  </td>
                  <td>
                    <div className="action-group" style={{ justifyContent: 'flex-end' }}>
                      {canModerate(u) && user.role !== 'support' ? (
                        <>
                          {user.role === 'founder' && (
                            <button className="glass-button" title="Изменить роль" onClick={() => openModal('role', u)}>🔑</button>
                          )}
                          <button className="glass-button" title="Кикнуть с сокета" onClick={() => handleKick(u)}>🔌</button>
                          {u.isMuted ? (
                            <button className="glass-button warning" onClick={() => handleUnmute(u)}>Размутить</button>
                          ) : (
                            <button className="glass-button warning" onClick={() => openModal('mute', u)}>Мут</button>
                          )}
                          {u.isBanned ? (
                            <button className="glass-button danger" onClick={() => handleUnban(u)}>Разбанить</button>
                          ) : (
                            <button className="glass-button danger" onClick={() => openModal('ban', u)}>Бан</button>
                          )}
                        </>
                      ) : (
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Нет прав</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// 3. SERVERS VIEW
function ServersView({ user, showNotify, openModal }) {
  const [servers, setServers] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchServers = useCallback(() => {
    setLoading(true);
    API.get(`/admin/servers?query=${encodeURIComponent(search)}`)
      .then(res => setServers(res.data))
      .catch(() => showNotify('error', 'Не удалось загрузить серверы'))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  return (
    <div>
      <h1>Управление серверами</h1>
      <p className="subtitle">Список виртуальных серверов сообщества и удаление вредоносных комнат</p>

      <div className="filters-bar">
        <input
          type="text"
          className="glass-input"
          placeholder="Поиск по названию или ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ maxWidth: '400px' }}
        />
        <button className="glass-button primary" onClick={fetchServers}>Найти</button>
      </div>

      <div className="glass-panel table-container">
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Загрузка серверов...</div>
        ) : servers.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center' }}>Серверы не найдены</div>
        ) : (
          <table className="glass-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Создатель (Владелец)</th>
                <th>Количество участников</th>
                <th>Дата создания</th>
                <th style={{ textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {servers.map(s => (
                <tr key={s._id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{s.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: {s._id}</div>
                  </td>
                  <td>
                    {s.owner ? (
                      <div>
                        <div>{s.owner.username}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{s.owner.email}</div>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Неизвестен</span>
                    )}
                  </td>
                  <td>
                    {s.members?.length || 0}
                  </td>
                  <td>
                    {s.createdAt ? new Date(s.createdAt).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <div className="action-group" style={{ justifyContent: 'flex-end' }}>
                      {['founder', 'admin'].includes(user.role) ? (
                        <button className="glass-button danger" onClick={() => openModal('deleteServer', s)}>
                          🗑️ Удалить
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Нет прав</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// 4. REPORTS VIEW
function ReportsView({ user, showNotify, openModal }) {
  const [reports, setReports] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchReports = useCallback(() => {
    setLoading(true);
    API.get(`/admin/reports?status=${statusFilter}`)
      .then(res => setReports(res.data))
      .catch(() => showNotify('error', 'Не удалось загрузить жалобы'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const handleDismiss = async (report) => {
    try {
      await API.put(`/admin/reports/${report._id}/status`, { status: 'dismissed', moderatorAction: 'Жалоба отклонена модератором' });
      showNotify('success', 'Жалоба отклонена');
      fetchReports();
    } catch (err) {
      showNotify('error', 'Ошибка при обновлении статуса');
    }
  };

  return (
    <div>
      <h1>Очередь жалоб</h1>
      <p className="subtitle">Модерация контента: жалобы пользователей на нарушения и спам</p>

      <div className="filters-bar">
        <select
          className="glass-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">Все статусы</option>
          <option value="pending">Ожидающие (Pending)</option>
          <option value="reviewed">Рассмотренные (Reviewed)</option>
          <option value="resolved">Решенные (Resolved)</option>
          <option value="dismissed">Отклоненные (Dismissed)</option>
        </select>
        <button className="glass-button primary" onClick={fetchReports}>Обновить список</button>
      </div>

      {loading ? (
        <div>Загрузка жалоб...</div>
      ) : reports.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '40px' }}>
          Очередь жалоб пуста. Отличная работа! 🎉
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {reports.map(r => (
            <div key={r._id} className={`glass-panel report-card ${r.status}`}>
              <div className="report-meta">
                <span>Жалоба #{r._id.substring(18)}</span>
                <span>Отправитель: <strong>{r.reporter?.username || 'Система'}</strong></span>
                {r.reportedUser && (
                  <span>Нарушитель: <strong>@{r.reportedUser.username}</strong></span>
                )}
                <span>Создана: {new Date(r.createdAt).toLocaleString()}</span>
                <span>Статус: <strong className="status-pill" style={{ fontSize: '0.65rem', padding: '2px 6px' }}>{r.status}</strong></span>
              </div>

              <div className="report-reason">{r.reason}</div>
              <div className="report-description">
                {r.description || 'Дополнительное описание отсутствует'}
              </div>

              {r.reportedMessage && (
                <div style={{ marginBottom: '16px', borderLeft: '2px solid rgba(255,255,255,0.2)', paddingLeft: '10px' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>Жалоба на сообщение:</div>
                  <div style={{ background: 'rgba(0,0,0,0.1)', padding: '8px', borderRadius: '4px', fontSize: '0.85rem' }}>
                    {r.reportedMessage.content}
                  </div>
                </div>
              )}

              {r.moderatorAction && (
                <div style={{ color: 'var(--color-success)', fontSize: '0.9rem', marginBottom: '16px' }}>
                  <strong>Вердикт:</strong> {r.moderatorAction}
                </div>
              )}

              {r.status === 'pending' && user.role !== 'support' && (
                <div className="report-actions">
                  <button className="glass-button" onClick={() => handleDismiss(r)}>Отклонить (Dismiss)</button>
                  <button className="glass-button primary" onClick={() => openModal('resolveReport', r)}>Разрешить (Resolve)</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 5. ANNOUNCEMENTS VIEW
function AnnouncementsView({ showNotify }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [type, setType] = useState('toast');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !body) return;
    setLoading(true);

    try {
      const backendType = type === 'toast' ? 'normal' : 'global';
      await API.post('/admin/announcements', { 
        title, 
        content: body, 
        type: backendType 
      });
      showNotify('success', 'Системный анонс успешно отправлен на клиенты!');
      setTitle('');
      setBody('');
    } catch (err) {
      showNotify('error', err.response?.data?.message || 'Не удалось отправить анонс');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1>Системные анонсы</h1>
      <p className="subtitle">Отправка мгновенных всплывающих уведомлений для всех пользователей платформы (Love Hub)</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
        <div className="glass-panel">
          <h3>Создать анонс</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Заголовок анонса</label>
              <input
                type="text"
                className="glass-input"
                placeholder="Технические работы, Обновление v5.3.0..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Содержимое (body)</label>
              <textarea
                className="glass-input"
                style={{ minHeight: '120px', resize: 'vertical' }}
                placeholder="Мы добавляем новые анимации и Native notifications в этом патче..."
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Метод отображения</label>
              <select
                className="glass-select"
                style={{ width: '100%' }}
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="toast">Всплывающий тост (Toast notification)</option>
                <option value="modal">Полноэкранное модальное окно (Modal Dialog)</option>
              </select>
            </div>

            <button type="submit" className="glass-button primary" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
              {loading ? 'Публикация...' : '📢 Разослать всем пользователям'}
            </button>
          </form>
        </div>

        <div className="glass-panel">
          <h3>Визуальный превью (для клиента)</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
            Так анонс будет выглядеть на экранах пользователей платформы
          </p>

          <div className="announcement-preview-box">
            <div className="announcement-preview-header">Предпросмотр: {type === 'toast' ? 'Toast' : 'Modal'}</div>
            
            {type === 'toast' ? (
              <div className="toast-preview">
                <div className="toast-preview-title">{title || 'Заголовок уведомления'}</div>
                <div className="toast-preview-body">{body || 'Здесь будет отображаться текст вашего анонса...'}</div>
              </div>
            ) : (
              <div className="modal-preview">
                <div className="modal-preview-title">📢 {title || 'Системное объявление'}</div>
                <div className="modal-preview-body">{body || 'Подробное описание изменений платформы или важных новостей.'}</div>
                <button className="glass-button primary" disabled style={{ fontSize: '0.8rem', padding: '6px 14px' }}>Понятно</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// 6. AUDIT LOGS VIEW
function AuditLogsView({ showNotify }) {
  const [logs, setLogs] = useState([]);
  const [actionFilter, setActionFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchLogs = useCallback(() => {
    setLoading(true);
    API.get(`/admin/logs?action=${actionFilter}`)
      .then(res => setLogs(res.data))
      .catch(() => showNotify('error', 'Не удалось загрузить аудит логи'))
      .finally(() => setLoading(false));
  }, [actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div>
      <h1>Лог аудита действий</h1>
      <p className="subtitle">Журнал всех модерационных и административных действий на платформе</p>

      <div className="filters-bar">
        <select
          className="glass-select"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        >
          <option value="">Все действия</option>
          <option value="BAN_USER">Блокировки (BAN_USER)</option>
          <option value="UNBAN_USER">Разблокировки (UNBAN_USER)</option>
          <option value="MUTE_USER">Муты (MUTE_USER)</option>
          <option value="UNMUTE_USER">Снятие мута (UNMUTE_USER)</option>
          <option value="UPDATE_ROLE">Смена ролей (UPDATE_ROLE)</option>
          <option value="DELETE_SERVER">Удаление серверов (DELETE_SERVER)</option>
        </select>
        <button className="glass-button primary" onClick={fetchLogs}>Обновить</button>
      </div>

      <div className="glass-panel">
        {loading ? (
          <div>Загрузка логов...</div>
        ) : logs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>Записи лога отсутствуют</div>
        ) : (
          <div className="audit-list">
            {logs.map(log => (
              <div key={log._id} className="audit-item">
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span className="audit-actor">@{log.actor?.username || 'Система'}</span>
                  <span className="audit-action">{log.action}</span>
                  <span className="audit-details">
                    цель: {log.targetType} (ID: {log.targetId})
                    {log.details && Object.keys(log.details).length > 0 && (
                      <span style={{ marginLeft: '10px', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        [{JSON.stringify(log.details)}]
                      </span>
                    )}
                  </span>
                </div>
                <span className="audit-time">
                  {new Date(log.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 7. INFRASTRUCTURE VIEW
function InfrastructureView({ showNotify }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshInterval = useRef(null);

  const fetchInfra = useCallback(() => {
    API.get('/admin/infrastructure')
      .then(res => setData(res.data))
      .catch(() => showNotify('error', 'Не удалось загрузить состояние инфраструктуры'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchInfra();
    refreshInterval.current = setInterval(fetchInfra, 5000);
    return () => {
      if (refreshInterval.current) clearInterval(refreshInterval.current);
    };
  }, [fetchInfra]);

  if (loading) return <div>Загрузка показателей инфраструктуры...</div>;
  if (!data) return <div>Нет данных инфраструктуры</div>;

  const { database, cloudinary, server, sockets } = data;

  const formatUptime = (sec) => {
    const d = Math.floor(sec / (3600*24));
    const h = Math.floor((sec % (3600*24)) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${d}д ${h}ч ${m}м`;
  };

  const formatMemory = (bytes) => {
    return `${Math.round(bytes / 1024 / 1024)} MB`;
  };

  return (
    <div>
      <h1>Состояние инфраструктуры</h1>
      <p className="subtitle">Режимы баз данных, Cloudinary хранилища и активных WebSockets. Данные обновляются каждые 5 сек.</p>

      <div className="infra-grid" style={{ marginBottom: '30px' }}>
        <div className="glass-panel infra-card">
          <div className={`infra-status-light ${database.status === 'ok' ? 'healthy' : 'unhealthy'}`}>
            {database.status === 'ok' ? '🟢' : '🔴'}
          </div>
          <div className="infra-details">
            <div className="infra-name">MongoDB Database</div>
            <div className="infra-status-text">Статус: {database.state}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Хост: {database.host}</div>
          </div>
        </div>

        <div className="glass-panel infra-card">
          <div className={`infra-status-light ${sockets.status === 'ok' ? 'healthy' : 'unhealthy'}`}>
            {sockets.status === 'ok' ? '🟢' : '🔴'}
          </div>
          <div className="infra-details">
            <div className="infra-name">Socket.IO Server</div>
            <div className="infra-status-text">Активных соединений: {sockets.activeConnections}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Онлайн-клиенты</div>
          </div>
        </div>

        <div className="glass-panel infra-card">
          <div className={`infra-status-light ${cloudinary.status === 'ok' ? 'healthy' : 'unhealthy'}`}>
            {cloudinary.status === 'ok' ? '🟢' : '🔴'}
          </div>
          <div className="infra-details">
            <div className="infra-name">Cloudinary Storage</div>
            <div className="infra-status-text">Статус соединения: {cloudinary.status === 'ok' ? 'Установлено' : 'Недоступно'}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>Аватары и медиафайлы</div>
          </div>
        </div>
      </div>

      <div className="glass-panel">
        <h3>Системная информация бэкенда</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px' }}>
          Параметры и ресурсы NodeJS сервера
        </p>

        <div className="glass-panel table-container">
          <table className="glass-table">
            <tbody>
              <tr>
                <td style={{ fontWeight: 600, width: '250px' }}>Аптайм сервера (Uptime)</td>
                <td>{formatUptime(server.uptime)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Версия NodeJS</td>
                <td>{server.nodeVersion}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Платформа (OS)</td>
                <td>{server.platform}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Память (RSS)</td>
                <td>{formatMemory(server.memoryUsage?.rss || 0)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Выделенная куча (Heap Total)</td>
                <td>{formatMemory(server.memoryUsage?.heapTotal || 0)}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 600 }}>Использованная куча (Heap Used)</td>
                <td>{formatMemory(server.memoryUsage?.heapUsed || 0)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default App;
