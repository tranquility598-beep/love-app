import { BellRing, Megaphone, Send, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import { Badge, EmptyState, ErrorState, Notice, PageHeader, Segmented } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';
import { useAdminRealtime } from '../realtime/useAdminRealtime.js';

const types = [
  { value: 'silent', label: 'Только в хабе' },
  { value: 'normal', label: 'Уведомление' },
  { value: 'global', label: 'Важное' }
];

export default function AnnouncementsPage() {
  const { user } = useAuth();
  const [form, setForm] = useState({ title: '', content: '', type: 'normal' });
  const [announcements, setAnnouncements] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canDelete = user.role === 'developer' || user.permissions?.includes('*');

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/announcements');
      setAnnouncements(data.announcements || []);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAdminRealtime('announcements', load);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/announcements', form);
      setNotice('Анонс отправлен пользователям Love.');
      setForm({ title: '', content: '', type: 'normal' });
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function removeAnnouncement(item) {
    if (!window.confirm(`Удалить анонс «${item.title}»?`)) return;
    setBusy(true);
    try {
      await api.delete(`/announcements/${item._id}`);
      setNotice('Анонс удалён.');
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return <div className="page-stack">
    <PageHeader title="Анонсы" description="Публикация системных сообщений в клиентах Love" />
    {notice && <Notice onClose={() => setNotice('')}>{notice}</Notice>}
    {error && <ErrorState message={error} />}
    <section className="announcement-layout">
      <form className="panel form-stack" onSubmit={submit}>
        <label className="field"><span>Заголовок</span><input name="announcement-title" value={form.title} onChange={event => setForm(value => ({ ...value, title: event.target.value }))} maxLength="120" required /></label>
        <label className="field"><span>Текст</span><textarea name="announcement-content" rows="9" value={form.content} onChange={event => setForm(value => ({ ...value, content: event.target.value }))} maxLength="4000" required /></label>
        <div className="field"><span>Показывать как</span><Segmented value={form.type} onChange={type => setForm(value => ({ ...value, type }))} options={types} label="Тип анонса" /></div>
        <button className="button button-primary" disabled={busy}><Send size={16} />Опубликовать</button>
      </form>
      <aside className="announcement-preview">
        <span className="preview-label">Предпросмотр</span>
        <article className={`announcement-card announcement-${form.type}`}><span><BellRing size={18} /></span><div><small>LOVE</small><h3>{form.title || 'Заголовок анонса'}</h3><p>{form.content || 'Текст сообщения будет показан здесь.'}</p></div></article>
        <div className="delivery-note"><Megaphone size={17} /><span>Публикация сразу попадёт в Love Hub и журнал аудита.</span></div>
      </aside>
    </section>
    <section className="panel announcement-history">
      <header><div><h3>Опубликованные анонсы</h3><p>История сохраняется и доступна клиентам Love Hub.</p></div><Badge>{announcements.length}</Badge></header>
      {announcements.length ? <div>{announcements.map(item => <article key={item._id}>
        <span className={`announcement-history-icon announcement-${item.type}`}><BellRing size={16} /></span>
        <div><span><strong>{item.title}</strong><Badge>{types.find(type => type.value === item.type)?.label || item.type}</Badge></span><p>{item.content}</p><small>@{item.author?.username || 'Love'} · {formatDate(item.publishedAt)}</small></div>
        {canDelete && <button className="icon-button danger-icon" onClick={() => removeAnnouncement(item)} disabled={busy} title="Удалить анонс"><Trash2 size={16} /></button>}
      </article>)}</div> : <EmptyState title="Анонсов пока нет" description="Первая публикация появится здесь и в Love Hub." icon={Megaphone} />}
    </section>
  </div>;
}
