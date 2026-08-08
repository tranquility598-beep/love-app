import { Archive, ArchiveRestore, ArrowUpRight, Bug, CalendarClock, ChevronDown, ChevronUp, Eye, EyeOff, Heart, MessageCircle, Newspaper, Pencil, Plus, Send, ThumbsDown, ThumbsUp, Trash2, Wrench } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import { Avatar, Badge, EmptyState, ErrorState, Modal, Notice, PageHeader, Segmented } from '../components/ui.jsx';
import { formatDate, toneForStatus } from '../utils/format.js';
import PageLoader from '../components/PageLoader.jsx';
import { useLocale } from '../i18n/useLocale.js';
import { useAdminRealtime } from '../realtime/useAdminRealtime.js';

const tabs = [
  { value: 'ideas', label: 'Идеи' }, { value: 'bugs', label: 'Баги' },
  { value: 'devlog', label: 'Dev Log' }
];

const emptyPostForm = { title: '', body: '', tags: '', status: 'draft', scheduledAt: '' };
const ideaCategories = [
  ['messaging', 'Чаты и сообщения', 'Chats and messages'], ['voice', 'Голос и звонки', 'Voice and calls'],
  ['servers', 'Серверы', 'Servers'], ['profile', 'Профиль', 'Profile'], ['mobile', 'Мобильное приложение', 'Mobile app'],
  ['safety', 'Безопасность', 'Safety'], ['accessibility', 'Доступность', 'Accessibility'], ['other', 'Другое', 'Other']
];
const ideaStatuses = [
  ['under_review', 'На рассмотрении', 'Under review'], ['planned', 'Запланировано', 'Planned'],
  ['in_progress', 'В разработке', 'In development'], ['completed', 'Реализовано', 'Completed'],
  ['declined', 'Не планируется', 'Not planned']
];
const bugStatuses = ['new', 'triaged', 'in_progress', 'waiting_user', 'resolved', 'rejected'];
const communityManagerRoles = new Set(['junior_admin', 'senior_admin', 'deputy_developer', 'developer']);

function optionLabel(options, value, locale) {
  const option = options.find(([key]) => key === value);
  return option ? option[locale === 'en' ? 2 : 1] : value;
}

function localDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default function CommunityPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { locale, valueLabel } = useLocale();
  const text = (ru, en) => locale === 'en' ? en : ru;
  const [tab, setTab] = useState('ideas');
  const [devlogScope, setDevlogScope] = useState('active');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [publishItem, setPublishItem] = useState(null);
  const [publishForm, setPublishForm] = useState({ summary: '', category: 'other', status: 'under_review' });
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [postForm, setPostForm] = useState(emptyPostForm);
  const [expandedPostId, setExpandedPostId] = useState(null);
  const [commentsByPost, setCommentsByPost] = useState({});
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const canPublish = communityManagerRoles.has(user.role) && (user.permissions?.includes('*') || user.permissions?.includes('community.publish'));
  const canModerateComments = user.permissions?.includes('*') || user.permissions?.includes('community.moderate_comments');
  const canDeleteDevlog = user.role === 'developer';

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'ideas' || tab === 'bugs') {
        const { data } = await api.get('/cases', { params: { kind: tab === 'ideas' ? 'idea' : 'bug', limit: 100 } });
        setItems(data.cases);
      } else {
        const { data } = await api.get('/devlog', { params: { status: devlogScope } });
        setItems(data.posts);
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, devlogScope]);

  useEffect(() => { load(); }, [load]);
  useAdminRealtime('community', load);

  useEffect(() => {
    if (tab !== 'devlog') return undefined;
    const timer = window.setInterval(async () => {
      try {
        const { data } = await api.get('/devlog', { params: { status: devlogScope } });
        setItems(data.posts);
      } catch {
        // The visible error state is handled by explicit loads and actions.
      }
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [tab, devlogScope]);

  function beginPublish(item) {
    setPublishItem(item);
    setPublishForm({
      summary: item.public?.summary || item.description,
      category: item.public?.category || 'other',
      status: item.public?.status || 'under_review'
    });
  }

  async function submitPublish(event) {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post(`/cases/${publishItem._id}/publish`, { ...publishForm, published: true });
      setPublishItem(null);
      setNotice('Материал опубликован в Community.');
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function unpublish(item) {
    setBusy(true);
    try {
      await api.post(`/cases/${item._id}/publish`, { published: false });
      setNotice('Материал снят с публикации.');
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function updateBugStatus(item, status) {
    setBusy(true);
    try {
      const { data } = await api.patch(`/cases/${item._id}`, { status });
      setItems(current => current.map(entry => entry._id === item._id ? { ...entry, ...data.case } : entry));
      setNotice(text('Рабочий статус бага обновлён.', 'Bug workflow status updated.'));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function archiveItem(item) {
    if (!window.confirm(text(`Переместить «${item.title}» в архив? Запись останется доступна в Центре обращений.`, `Move “${item.title}” to the archive? It will remain available in the Case center.`))) return;
    setBusy(true);
    try {
      await api.patch(`/cases/${item._id}`, { status: 'archived' });
      setItems(current => current.filter(entry => entry._id !== item._id));
      setNotice(text('Материал перемещён в архив.', 'Item moved to archive.'));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  function beginCreatePost() {
    setEditingPost(null);
    setPostForm(emptyPostForm);
    setEditorOpen(true);
  }

  function beginEditPost(post) {
    setEditingPost(post);
    setPostForm({
      title: post.title || '',
      body: post.body || '',
      tags: (post.tags || []).join(', '),
      status: post.status || 'draft',
      scheduledAt: localDateTime(post.scheduledAt)
    });
    setEditorOpen(true);
  }

  async function savePost(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const payload = {
        ...postForm,
        tags: postForm.tags.split(',').map(value => value.trim()).filter(Boolean),
        scheduledAt: postForm.status === 'scheduled' ? new Date(postForm.scheduledAt).toISOString() : null
      };
      if (editingPost) await api.patch(`/devlog/${editingPost._id}`, payload);
      else await api.post('/devlog', payload);
      setEditorOpen(false);
      setEditingPost(null);
      setPostForm(emptyPostForm);
      setNotice(editingPost ? 'Запись Dev Log обновлена.' : 'Запись Dev Log сохранена.');
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function toggleComments(post) {
    if (expandedPostId === post._id) {
      setExpandedPostId(null);
      return;
    }
    setExpandedPostId(post._id);
    setCommentsLoading(true);
    try {
      const { data } = await api.get(`/devlog/${post._id}/comments`);
      setCommentsByPost(current => ({ ...current, [post._id]: data.comments }));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setCommentsLoading(false);
    }
  }

  async function moderateComment(item, status) {
    try {
      await api.patch(`/comments/${item._id}`, { status, reason: status === 'hidden' ? 'Скрыто модератором' : 'Восстановлено модератором' });
      const postId = String(item.post?._id || item.post);
      const { data } = await api.get(`/devlog/${postId}/comments`);
      setCommentsByPost(current => ({ ...current, [postId]: data.comments }));
      const { data: devlogData } = await api.get('/devlog', { params: { status: devlogScope } });
      setItems(devlogData.posts);
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  }

  async function archiveDevlog(post) {
    if (!window.confirm(text(`Архивировать «${post.title}»? Запись сразу исчезнет из приложения Love.`, `Archive “${post.title}”? The post will immediately disappear from Love.`))) return;
    setBusy(true);
    try {
      await api.post(`/devlog/${post._id}/archive`);
      setExpandedPostId(current => current === post._id ? null : current);
      setItems(current => current.filter(item => item._id !== post._id));
      setNotice(text('Запись Dev Log перемещена в архив.', 'Dev Log post moved to archive.'));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function restoreDevlog(post) {
    setBusy(true);
    try {
      await api.post(`/devlog/${post._id}/restore`);
      setExpandedPostId(current => current === post._id ? null : current);
      setItems(current => current.filter(item => item._id !== post._id));
      setNotice(text('Запись Dev Log восстановлена.', 'Dev Log post restored.'));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  async function deleteDevlog(post) {
    if (!window.confirm(text(`Навсегда удалить «${post.title}» вместе с комментариями и голосами? Отменить это действие нельзя.`, `Permanently delete “${post.title}” with its comments and votes? This cannot be undone.`))) return;
    setBusy(true);
    try {
      await api.delete(`/devlog/${post._id}`);
      setExpandedPostId(current => current === post._id ? null : current);
      setItems(current => current.filter(item => item._id !== post._id));
      setNotice(text('Запись Dev Log удалена навсегда.', 'Dev Log post permanently deleted.'));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page-stack">
      <PageHeader title="Community" description={text('Каталог идей, внутренняя очередь багов и Dev Log', 'Ideas catalogue, private bug queue and Dev Log')} actions={tab === 'devlog' && devlogScope === 'active' && canPublish && <button className="button button-primary" onClick={beginCreatePost}><Plus size={16} />{text('Новая запись', 'New post')}</button>} />
      {notice && <Notice onClose={() => setNotice('')}>{notice}</Notice>}
      {error && <ErrorState message={error} retry={load} />}
      <Segmented value={tab} onChange={setTab} options={tabs} label="Раздел Community" />
      {tab === 'devlog' && <Segmented value={devlogScope} onChange={setDevlogScope} options={[{ value: 'active', label: text('Активные', 'Active') }, { value: 'archived', label: text('Архив', 'Archive') }]} label={text('Состояние Dev Log', 'Dev Log state')} />}

      {tab === 'bugs' && <div className="community-workflow-note"><Wrench size={16} /><div><strong>{text('Баги не публикуются', 'Bugs stay private')}</strong><span>{text('Это закрытая рабочая очередь. Меняйте статус по мере проверки и исправления; пользовательские сведения и диагностика остаются внутри команды.', 'This is a private workflow queue. Update the status during investigation and resolution; user data and diagnostics stay within the team.')}</span></div></div>}

      <section className="panel community-panel">
        {loading ? <PageLoader /> : !items.length ? <EmptyState title="Здесь пока пусто" description="Новые материалы появятся после отправки пользователями." icon={tab === 'ideas' ? Heart : tab === 'bugs' ? Bug : Newspaper} /> : (
          <div className="community-list">
            {(tab === 'ideas' || tab === 'bugs') && items.map(item => <article className={`community-row ${tab === 'bugs' ? 'community-bug-row' : ''}`} key={item._id}>
              <span className={`community-icon ${tab === 'ideas' ? 'idea' : 'bug'}`}>{tab === 'ideas' ? <Heart size={18} /> : <Bug size={18} />}</span>
              <div className="community-copy"><span><strong>{item.title}</strong>{tab === 'ideas' ? <><Badge tone={item.public?.published ? 'success' : 'warning'}>{item.public?.published ? text('в каталоге', 'in catalogue') : text('приватно', 'private')}</Badge><Badge>{optionLabel(ideaStatuses, item.public?.status || 'under_review', locale)}</Badge></> : <><Badge tone={toneForStatus(item.status)}>{valueLabel(item.status)}</Badge><Badge tone={toneForStatus(item.priority)}>{text('Риск:', 'Risk:')} {valueLabel(item.priority)}</Badge></>}</span><p>{item.description}</p><small>{item.number} · @{item.reporter?.username} · {formatDate(item.createdAt)}{tab === 'ideas' ? ` · ${optionLabel(ideaCategories, item.public?.category || 'other', locale)}` : ''}</small></div>
              {tab === 'ideas' ? <div className="vote-summary"><span><ThumbsUp size={14} />{item.public?.upVotes || 0}</span><span><ThumbsDown size={14} />{item.public?.downVotes || 0}</span></div> : <label className="field compact community-bug-status"><span>{text('Рабочий статус', 'Workflow status')}</span><select name={`bug-status-${item._id}`} value={item.status} disabled={busy} onChange={event => updateBugStatus(item, event.target.value)}>{bugStatuses.map(status => <option key={status} value={status}>{valueLabel(status)}</option>)}</select></label>}
              <div className="row-actions safe-desktop-only">
                {tab === 'ideas' && canPublish && (item.public?.published ? <button className="icon-button" onClick={() => unpublish(item)} disabled={busy} title={text('Убрать идею из каталога', 'Remove idea from catalogue')}><EyeOff size={17} /></button> : <button className="icon-button" onClick={() => beginPublish(item)} disabled={busy} title={text('Проверить и добавить идею в каталог', 'Review and add idea to catalogue')}><Eye size={17} /></button>)}
                {tab === 'bugs' && <button className="icon-button" onClick={() => navigate(`/cases?case=${item._id}`)} disabled={busy} title={text('Открыть баг со всеми сведениями и перепиской', 'Open bug with diagnostics and conversation')}><ArrowUpRight size={17} /></button>}
                <button className="icon-button" onClick={() => archiveItem(item)} disabled={busy} title={text('Переместить в архив', 'Move to archive')}><Archive size={17} /></button>
              </div>
            </article>)}

            {tab === 'devlog' && items.map(post => <article className="devlog-card" key={post._id}>
              <div className="devlog-row">
                <div><span><Badge tone={toneForStatus(post.status)}>{valueLabel(post.status)}</Badge><time>{formatDate(post.publishedAt || post.scheduledAt || post.createdAt)}</time></span><h3>{post.title}</h3><p>{post.body}</p><div className="tag-list">{post.tags?.map(tag => <Badge key={tag}>{tag}</Badge>)}</div></div>
                <div className="devlog-actions">
                  <div className="devlog-meta"><span><ThumbsUp size={15} />{post.upVotes || 0}</span><span><ThumbsDown size={15} />{post.downVotes || 0}</span></div>
                  <button className="button button-secondary devlog-comments-toggle" onClick={() => toggleComments(post)} aria-expanded={expandedPostId === post._id} aria-label={text(`Комментарии (${post.commentCount || 0})`, `Comments (${post.commentCount || 0})`)}>
                    <MessageCircle size={15} />{post.commentCount || 0}{expandedPostId === post._id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                  {canPublish && post.status !== 'archived' && <button className="icon-button" onClick={() => beginEditPost(post)} disabled={busy} title={text('Редактировать запись', 'Edit post')}><Pencil size={17} /></button>}
                  {canPublish && (post.status === 'archived'
                    ? <button className="icon-button" onClick={() => restoreDevlog(post)} disabled={busy} title={text('Восстановить запись', 'Restore post')}><ArchiveRestore size={17} /></button>
                    : <button className="icon-button" onClick={() => archiveDevlog(post)} disabled={busy} title={text('Архивировать и убрать из Love', 'Archive and remove from Love')}><Archive size={17} /></button>)}
                  {canDeleteDevlog && <button className="icon-button danger-icon" onClick={() => deleteDevlog(post)} disabled={busy} title={text('Удалить навсегда', 'Delete permanently')}><Trash2 size={17} /></button>}
                </div>
              </div>
              {expandedPostId === post._id && <section className="devlog-comments-inline" aria-label={`Комментарии к записи ${post.title}`}>
                {commentsLoading ? <PageLoader /> : commentsByPost[post._id]?.length ? commentsByPost[post._id].map(comment => <article className="comment-row" key={comment._id}>
                  <Avatar user={comment.author} size="avatar-small" />
                  <div><span><strong>@{comment.author?.username || 'unknown'}</strong><Badge tone={toneForStatus(comment.status)}>{valueLabel(comment.status)}</Badge><time>{formatDate(comment.createdAt)}</time></span><p>{comment.body}</p></div>
                  {canModerateComments && <div className="row-actions safe-desktop-only">{comment.status === 'active' ? <button className="icon-button" onClick={() => moderateComment(comment, 'hidden')} title="Скрыть"><EyeOff size={17} /></button> : <button className="icon-button" onClick={() => moderateComment(comment, 'active')} title="Восстановить"><Eye size={17} /></button>}</div>}
                </article>) : <div className="notes-empty"><MessageCircle size={16} />Комментариев пока нет.</div>}
              </section>}
            </article>)}
          </div>
        )}
      </section>

      {publishItem && <Modal title={text('Добавить идею в каталог', 'Add idea to catalogue')} onClose={() => setPublishItem(null)} footer={<><button className="button button-secondary" onClick={() => setPublishItem(null)}>{text('Отмена', 'Cancel')}</button><button className="button button-primary" form="publish-form" disabled={busy}><Send size={16} />{text('Сохранить и показать', 'Save and show')}</button></>}>
        <form id="publish-form" className="form-stack" onSubmit={submitPublish}>
          <p className="form-hint">{text('Пользователи увидят понятные названия категории и статуса. Технические значения вводить вручную больше не нужно.', 'Users will see friendly category and status labels. Technical values no longer need to be entered manually.')}</p>
          <label className="field"><span>{text('Описание в каталоге', 'Catalogue description')}</span><textarea name="community-summary" rows="6" value={publishForm.summary} onChange={event => setPublishForm(form => ({ ...form, summary: event.target.value }))} required maxLength="1000" /></label>
          <label className="field"><span>{text('Раздел приложения', 'App area')}</span><select name="community-category" value={publishForm.category} onChange={event => setPublishForm(form => ({ ...form, category: event.target.value }))}>{ideaCategories.map(([value, ru, en]) => <option key={value} value={value}>{locale === 'en' ? en : ru}</option>)}</select></label>
          <label className="field"><span>{text('Статус идеи', 'Idea status')}</span><select name="community-status" value={publishForm.status} onChange={event => setPublishForm(form => ({ ...form, status: event.target.value }))}>{ideaStatuses.map(([value, ru, en]) => <option key={value} value={value}>{locale === 'en' ? en : ru}</option>)}</select></label>
        </form>
      </Modal>}

      {editorOpen && <Modal title={editingPost ? 'Редактирование Dev Log' : 'Новая запись Dev Log'} onClose={() => setEditorOpen(false)} wide footer={<><button className="button button-secondary" onClick={() => setEditorOpen(false)}>Отмена</button><button className="button button-primary" form="devlog-form" disabled={busy}><Newspaper size={16} />Сохранить</button></>}>
        <form id="devlog-form" className="form-stack" onSubmit={savePost}>
          <label className="field"><span>Заголовок</span><input name="devlog-title" value={postForm.title} onChange={event => setPostForm(form => ({ ...form, title: event.target.value }))} required maxLength="160" /></label>
          <label className="field"><span>Текст</span><textarea name="devlog-body" rows="10" value={postForm.body} onChange={event => setPostForm(form => ({ ...form, body: event.target.value }))} required /></label>
          <label className="field"><span>Теги через запятую</span><input name="devlog-tags" value={postForm.tags} onChange={event => setPostForm(form => ({ ...form, tags: event.target.value }))} /></label>
          <label className="field"><span>Публикация</span><select name="devlog-status" value={postForm.status} onChange={event => setPostForm(form => ({ ...form, status: event.target.value }))}><option value="draft">Черновик</option><option value="scheduled">По расписанию</option><option value="published">Сейчас</option></select></label>
          {postForm.status === 'scheduled' && <label className="field"><span>Дата и время</span><div><CalendarClock size={16} /><input name="devlog-scheduled-at" type="datetime-local" value={postForm.scheduledAt} onChange={event => setPostForm(form => ({ ...form, scheduledAt: event.target.value }))} required /></div></label>}
        </form>
      </Modal>}
    </div>
  );
}
