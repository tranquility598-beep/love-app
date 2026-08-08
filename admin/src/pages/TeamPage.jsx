import { Check, Clipboard, KeyRound, LockKeyhole, Search, ShieldCheck, UserCog, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import { Avatar, Badge, EmptyState, ErrorState, Modal, Notice, PageHeader } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';
import PageLoader from '../components/PageLoader.jsx';
import { useAdminRealtime } from '../realtime/useAdminRealtime.js';

export default function TeamPage() {
  const { user, refreshSession } = useAuth();
  const [staff, setStaff] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [securityOpen, setSecurityOpen] = useState(false);
  const [totp, setTotp] = useState(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [candidateRole, setCandidateRole] = useState('support');
  const [roleChange, setRoleChange] = useState(null);
  const [roleCode, setRoleCode] = useState('');
  const canAssign = user.permissions?.includes('*') || user.permissions?.includes('staff.assign_senior_moderator') || user.permissions?.includes('staff.assign_senior_admin');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [{ data: usersData }, { data: rolesData }] = await Promise.all([
        api.get('/users', { params: { role: 'staff', limit: 100 } }),
        api.get('/roles')
      ]);
      setStaff(usersData.users);
      setRoles(rolesData.roles);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAdminRealtime('team', load);

  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2) { setCandidates([]); return undefined; }
    const timer = window.setTimeout(async () => {
      try {
        const { data } = await api.get('/users', { params: { query: searchQuery.trim(), role: 'all', limit: 20 } });
        setCandidates((data.users || []).filter(member => member._id !== user._id));
      } catch (requestError) {
        setError(errorMessage(requestError));
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchOpen, searchQuery, user._id]);

  async function applyRole(member, role, totpCode = '') {
    setBusy(true);
    setError('');
    try {
      await api.put(`/users/${member._id}/role`, { role, totpCode });
      setNotice(`Ранг @${member.username} обновлён. Его активные сессии завершены.`);
      setRoleChange(null);
      setRoleCode('');
      setSearchOpen(false);
      await load();
    } catch (requestError) {
      if (requestError?.response?.data?.code === 'ROLE_TOTP_REQUIRED') {
        setRoleChange({ member, role });
        setRoleCode('');
        return;
      }
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function changeRole(member, role) {
    if (role === member.role) return;
    applyRole(member, role);
  }

  async function setupTotp() {
    setSecurityOpen(true);
    setTotp(null);
    setRecoveryCodes([]);
    setBusy(true);
    try {
      const { data } = await api.post('/auth/totp/setup');
      setTotp(data);
    } catch (requestError) {
      setError(errorMessage(requestError));
      setSecurityOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function confirmTotp(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post('/auth/totp/confirm', { code });
      setRecoveryCodes(data.recoveryCodes);
      setCode('');
      await refreshSession();
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader title="Команда" description="Ранги, полномочия и защита административных аккаунтов" actions={<div className="header-actions">{canAssign && <button className="button button-primary" onClick={() => setSearchOpen(true)}><UserPlus size={16} />Добавить сотрудника</button>}<button className="button button-secondary" onClick={setupTotp}><KeyRound size={16} />{user.adminTotpEnabled ? 'Обновить Authenticator' : 'Подключить Authenticator'}</button></div>} />
      {notice && <Notice onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <ErrorState message={error} retry={load} />}

      <section className="panel table-panel">
        {loading ? <PageLoader /> : staff.length ? <div className="data-table-wrap"><table className="data-table">
          <thead><tr><th>Сотрудник</th><th>Ранг</th><th>2FA</th><th>Правила</th><th>Последний онлайн</th><th>Назначение</th></tr></thead>
          <tbody>{staff.map(member => <tr key={member._id}>
            <td><div className="user-cell"><Avatar user={member} size="avatar-small" /><span><strong>{member.nickname || member.username}</strong><small>@{member.username}</small></span></div></td>
            <td><Badge tone={member.role === 'developer' ? 'danger' : 'info'}>{member.roleLabel || member.role}</Badge></td>
            <td><Badge tone={member.adminTotpEnabled || member.twoFactorEnabled ? 'success' : 'warning'}>{member.adminTotpEnabled ? 'Authenticator' : member.twoFactorEnabled ? 'Email' : 'не настроена'}</Badge></td>
            <td><Badge tone={!member.adminPolicyRequiredVersion || member.adminPolicyAcceptedVersion === member.adminPolicyRequiredVersion ? 'success' : 'warning'}>{!member.adminPolicyRequiredVersion ? 'Не требовалось' : member.adminPolicyAcceptedVersion === member.adminPolicyRequiredVersion ? 'Приняты' : 'Ожидает'}</Badge></td>
            <td>{formatDate(member.lastSeen)}</td>
            <td>{canAssign && member._id !== user._id && member.role !== 'developer' ? <select name={`team-role-${member._id}`} disabled={busy} value={member.role} onChange={event => changeRole(member, event.target.value)}>{roles.map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select> : <span className="muted-text">Защищено</span>}</td>
          </tr>)}</tbody>
        </table></div> : <EmptyState title="Команда не сформирована" icon={UserCog} />}
      </section>

      <section className="rank-matrix">
        {roles.filter(role => role.value !== 'user').map(role => <article className="rank-row" key={role.value}><span>{role.level + 1}</span><strong>{role.label}</strong><small>{role.value}</small></article>)}
      </section>

      {searchOpen && <Modal title="Добавить сотрудника" onClose={() => setSearchOpen(false)} wide>
        <div className="team-invite-controls"><label className="field"><span>Пользователь</span><div><Search size={16} /><input name="team-user-search" value={searchQuery} onChange={event => setSearchQuery(event.target.value)} placeholder="Username, имя или email" autoFocus /></div></label><label className="field"><span>Начальный ранг</span><select name="team-invite-role" value={candidateRole} onChange={event => setCandidateRole(event.target.value)}>{roles.filter(role => role.value !== 'user' && role.value !== 'developer').map(role => <option key={role.value} value={role.value}>{role.label}</option>)}</select></label></div>
        <p className="team-invite-note">После назначения сотрудник подключит Authenticator и примет правила своей должности до доступа к рабочим разделам.</p>
        <div className="team-candidate-list">{searchQuery.trim().length < 2 ? <span className="muted-text">Введите минимум два символа.</span> : candidates.length ? candidates.map(member => <article key={member._id}><Avatar user={member} size="avatar-small" /><div><strong>{member.nickname || member.username}</strong><span>@{member.username} · {member.email}</span></div><Badge tone={member.role === 'user' ? 'neutral' : 'info'}>{member.roleLabel || member.role}</Badge><button className="button button-secondary" disabled={busy || member.role === 'developer'} onClick={() => changeRole(member, candidateRole)}>Назначить</button></article>) : <span className="muted-text">Совпадений пока нет.</span>}</div>
      </Modal>}

      {roleChange && <Modal title="Подтвердите изменение роли" onClose={() => setRoleChange(null)} footer={<><button className="button button-secondary" onClick={() => setRoleChange(null)}>Отмена</button><button className="button button-primary" form="role-confirm-form" disabled={busy || roleCode.length !== 6}><ShieldCheck size={16} />Подтвердить</button></>}>
        <form id="role-confirm-form" className="form-stack" onSubmit={event => { event.preventDefault(); applyRole(roleChange.member, roleChange.role, roleCode); }}><p>Production требует свежий код Authenticator для назначения или снятия роли у <strong>@{roleChange.member.username}</strong>.</p><label className="field"><span>Код Authenticator</span><div><LockKeyhole size={16} /><input name="role-totp-code" value={roleCode} onChange={event => setRoleCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength="6" autoFocus required /></div></label></form>
      </Modal>}

      {securityOpen && <Modal title="Authenticator" onClose={() => setSecurityOpen(false)} footer={recoveryCodes.length ? <button className="button button-primary" onClick={() => setSecurityOpen(false)}><Check size={16} />Готово</button> : null}>
        {busy && !totp ? <PageLoader /> : recoveryCodes.length ? <div className="recovery-view">
          <span className="auth-icon"><ShieldCheck size={22} /></span><h3>Authenticator подключён</h3><p>Резервные коды показываются один раз.</p>
          <div className="recovery-codes">{recoveryCodes.map(value => <code key={value}>{value}</code>)}</div>
          <button className="button button-secondary" onClick={() => navigator.clipboard.writeText(recoveryCodes.join('\n'))}><Clipboard size={16} />Копировать коды</button>
        </div> : totp && <form className="totp-setup" onSubmit={confirmTotp}>
          <img src={totp.qrCode} alt="QR-код Authenticator" />
          <p>Добавьте Love Admin в приложение Authenticator.</p>
          <code>{totp.manualKey}</code>
          <label className="field"><span>Код из приложения</span><div><LockKeyhole size={16} /><input name="team-totp-code" value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" maxLength="6" required /></div></label>
          <button className="button button-primary button-full" disabled={busy}>Подтвердить</button>
        </form>}
      </Modal>}
    </div>
  );
}
