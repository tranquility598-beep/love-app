import { ChevronRight, Globe2, Hash, LockKeyhole, Radio, Search, Server, Trash2, UsersRound, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import { Avatar, Badge, EmptyState, ErrorState, Modal, Notice, PageHeader, SearchField } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';
import PageLoader from '../components/PageLoader.jsx';
import { useAdminRealtime } from '../realtime/useAdminRealtime.js';

const channelLabels = {
  text: 'Текстовый',
  voice: 'Голосовой',
  announcement: 'Анонсы',
  dm: 'Личный'
};

function ChannelIcon({ type }) {
  const Icon = type === 'voice' ? Volume2 : type === 'announcement' ? Radio : Hash;
  return <Icon size={15} />;
}

export default function ServersPage() {
  const { user } = useAuth();
  const [servers, setServers] = useState([]);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [detailTarget, setDetailTarget] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailError, setDetailError] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);
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

  async function openServer(server) {
    setDetailTarget(server);
    setDetails(null);
    setDetailError('');
    try {
      const { data } = await api.get(`/servers/${server._id}`);
      setDetails(data.server);
    } catch (requestError) {
      setDetailError(errorMessage(requestError, 'Не удалось загрузить сервер'));
    }
  }

  function openDelete(event, server) {
    event.stopPropagation();
    setConfirmName('');
    setDeleteTarget(server);
  }

  async function removeServer(event) {
    event.preventDefault();
    if (!deleteTarget || confirmName !== deleteTarget.name) return;
    setBusy(true);
    try {
      await api.delete(`/servers/${deleteTarget._id}`);
      if (detailTarget?._id === deleteTarget._id) {
        setDetailTarget(null);
        setDetails(null);
      }
      setDeleteTarget(null);
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
        <thead><tr><th>Сервер</th><th>Владелец</th><th>Участники</th><th>Каналы</th><th>Создан</th><th aria-label="Действия" /></tr></thead>
        <tbody>{servers.map(item => <tr key={item._id} role="button" tabIndex="0" aria-label={`Открыть сервер ${item.name}`} onClick={() => openServer(item)} onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openServer(item);
          }
        }}>
          <td><div className="user-cell"><span className="avatar avatar-small server-avatar">{item.icon ? <img src={item.icon} alt="" /> : <Server size={16} />}</span><span><strong>{item.name}</strong><small>{item._id}</small></span></div></td>
          <td><div className="user-cell"><Avatar user={item.owner} size="avatar-tiny" /><span><strong>@{item.owner?.username || 'unknown'}</strong><small>{item.owner?.email}</small></span></div></td>
          <td><span className="icon-value"><UsersRound size={15} />{item.memberCount ?? item.members?.length ?? 0}</span></td>
          <td>{item.channelCount ?? item.channels?.length ?? 0}</td><td>{formatDate(item.createdAt, false)}</td>
          <td><div className="row-actions">{canManage && <button className="icon-button safe-desktop-only danger-icon" onClick={event => openDelete(event, item)} title="Удалить сервер"><Trash2 size={16} /></button>}<ChevronRight size={17} aria-hidden="true" /></div></td>
        </tr>)}</tbody>
      </table></div> : <EmptyState title="Серверы не найдены" icon={Search} />}
    </section>

    {detailTarget && <Modal title={detailTarget.name} onClose={() => { setDetailTarget(null); setDetails(null); setDetailError(''); }} wide>
      {!details && !detailError ? <PageLoader /> : detailError ? <ErrorState message={detailError} retry={() => openServer(detailTarget)} /> : <div className="server-detail-grid">
        <section className="detail-summary">
          <div className="server-profile-heading">
            <span className="server-detail-avatar">{details.icon ? <img src={details.icon} alt="" /> : <Server size={27} />}</span>
            <div><span><Badge tone={details.settings?.isPublic ? 'success' : 'neutral'}>{details.settings?.isPublic ? 'Публичный' : 'Приватный'}</Badge><Badge>{details.settings?.kind === 'room' ? 'Комната' : 'Сервер'}</Badge></span><h3>{details.name}</h3><p>{details.description || 'Описание не добавлено'}</p></div>
          </div>
          <dl className="definition-list">
            <div><dt>ID</dt><dd>{details._id}</dd></div>
            <div><dt>Владелец</dt><dd>@{details.owner?.username || 'unknown'}</dd></div>
            <div><dt>Участники</dt><dd>{details.memberCount}</dd></div>
            <div><dt>Каналы</dt><dd>{details.channelCount}</dd></div>
            <div><dt>Роли</dt><dd>{details.roleCount}</dd></div>
            <div><dt>Категории</dt><dd>{details.categoryCount}</dd></div>
            <div><dt>Приглашения</dt><dd>{details.inviteCount}</dd></div>
            <div><dt>Проверка</dt><dd>Уровень {details.settings?.verificationLevel ?? 0}</dd></div>
            <div><dt>Уведомления</dt><dd>{details.settings?.defaultNotifications === 'all' ? 'Все сообщения' : 'Только упоминания'}</dd></div>
            <div><dt>Создан</dt><dd>{formatDate(details.createdAt)}</dd></div>
          </dl>
        </section>

        <section className="server-detail-directory">
          <div className="server-detail-block">
            <header><div><UsersRound size={17} /><h3>Участники</h3></div><Badge>{details.memberCount}</Badge></header>
            <div className="server-detail-list">{details.members?.length ? details.members.map((member, index) => {
              const memberName = member.user?.nickname || member.nickname || member.user?.username || 'Удалённый пользователь';
              return <article className="server-detail-row" key={member.user?._id || `${memberName}-${index}`}><Avatar user={member.user || { username: memberName }} size="avatar-small" /><span><strong>{memberName}</strong><small>{member.user?.username ? `@${member.user.username}` : 'Аккаунт недоступен'} · ролей: {member.roleCount}</small></span><time>{formatDate(member.joinedAt, false)}</time></article>;
            }) : <p className="server-detail-empty">Участников нет</p>}</div>
          </div>

          <div className="server-detail-block">
            <header><div><Hash size={17} /><h3>Каналы</h3></div><Badge>{details.channelCount}</Badge></header>
            <div className="server-detail-list">{details.channels?.length ? details.channels.map(channel => <article className="server-detail-row" key={channel._id}><span className="server-channel-icon"><ChannelIcon type={channel.type} /></span><span><strong>{channel.name}</strong><small>{channelLabels[channel.type] || channel.type}{channel.category ? ` · ${channel.category}` : ''}</small></span>{channel.settings?.nsfw ? <Badge tone="warning">NSFW</Badge> : null}</article>) : <p className="server-detail-empty">Каналов нет</p>}</div>
          </div>

          <div className="server-access-summary">
            {details.settings?.isPublic ? <Globe2 size={17} /> : <LockKeyhole size={17} />}
            <div><strong>{details.settings?.isPublic ? 'Открытый сервер' : 'Доступ по приглашению'}</strong><span>{details.settings?.isPublic ? 'Сервер может отображаться в публичных разделах LOVE.' : 'Присоединение доступно только через приглашение.'}</span></div>
          </div>
        </section>
      </div>}
    </Modal>}

    {deleteTarget && <Modal title="Удаление сервера" onClose={() => { setDeleteTarget(null); setConfirmName(''); }} footer={<><button className="button button-secondary" onClick={() => { setDeleteTarget(null); setConfirmName(''); }}>Отмена</button><button className="button button-danger" form="delete-server" disabled={busy || confirmName !== deleteTarget.name}><Trash2 size={16} />Удалить</button></>}>
      <form id="delete-server" className="form-stack" onSubmit={removeServer}>
        <p>Будут удалены сервер <strong>{deleteTarget.name}</strong>, его каналы и сообщения.</p>
        <label className="field"><span>Введите название сервера</span><input name="server-confirm-name" value={confirmName} onChange={event => setConfirmName(event.target.value)} autoFocus /></label>
      </form>
    </Modal>}
  </div>;
}
