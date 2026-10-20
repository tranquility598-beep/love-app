import { Crown, KeyRound, LockKeyhole, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { Modal } from '../components/ui.jsx';
import { formatDate } from '../utils/format.js';
import PageLoader from '../components/PageLoader.jsx';

// Блоки в карточке пользователя: подписка, право удаления, удаление аккаунта.
// Права проверяет сервер; здесь только прячем то, что ранг всё равно не даст.

const PLANS = [['free', 'Free'], ['pro', 'Pro'], ['premium', 'Premium'], ['duo', 'Duo']];
const DURATIONS = [[30, '30 дней'], [7, '7 дней'], [90, '90 дней'], [365, '1 год'], ['', 'Бессрочно']];
const ADMIN_ROLES = ['junior_admin', 'senior_admin', 'deputy_developer'];

function planLabel(user) {
  const plan = user.plan || 'free';
  const expired = user.planExpiresAt && new Date(user.planExpiresAt) < new Date();
  const name = PLANS.find(([id]) => id === plan)?.[1] || plan;
  if (plan === 'free') return 'Free';
  if (expired) return `${name} · истекла ${formatDate(user.planExpiresAt, false)}`;
  return user.planExpiresAt ? `${name} · до ${formatDate(user.planExpiresAt, false)}` : `${name} · бессрочно`;
}

function TotpField({ value, onChange, name }) {
  return (
    <label className="field"><span>Код Authenticator</span>
      <div><LockKeyhole size={16} /><input name={name} value={value} onChange={event => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" maxLength="6" required /></div>
    </label>
  );
}

export default function UserAdminTools({ actor, target, onChanged, onDeleted, onError }) {
  const [dialog, setDialog] = useState(null); // 'plan' | 'grant' | 'delete'
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const isDeveloper = actor.role === 'developer';
  const canPlans = isDeveloper || actor.role === 'deputy_developer';
  const isSelf = String(actor._id) === String(target._id);
  const targetIsDeveloper = target.role === 'developer';
  const canGrant = isDeveloper && !isSelf && ADMIN_ROLES.includes(target.role);
  const canDelete = Boolean(actor.canDeleteUsers) && !isSelf && !targetIsDeveloper;

  if (!canPlans && !canGrant && !canDelete && !target.canDeleteUsers) return null;

  function close() { setDialog(null); setLocalError(''); }

  async function run(request, done) {
    setBusy(true);
    setLocalError('');
    try {
      const { data } = await request();
      close();
      done?.(data);
    } catch (requestError) {
      setLocalError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="admin-tools">
      {canPlans && (
        <div className="admin-tool-row">
          <Crown size={17} />
          <div><strong>Подписка</strong><small>{planLabel(target)}</small></div>
          <button className="button button-secondary" onClick={() => setDialog('plan')}>Изменить</button>
        </div>
      )}
      {(canGrant || target.canDeleteUsers) && (
        <div className="admin-tool-row">
          <KeyRound size={17} />
          <div><strong>Право удалять аккаунты</strong><small>{target.canDeleteUsers ? `Выдано ${formatDate(target.canDeleteUsersGrantedAt)}` : 'Не выдано'}</small></div>
          {canGrant && <button className="button button-secondary" onClick={() => setDialog('grant')}>{target.canDeleteUsers ? 'Забрать' : 'Выдать'}</button>}
        </div>
      )}
      {canDelete && (
        <div className="admin-tool-row admin-tool-danger">
          <Trash2 size={17} />
          <div><strong>Удалить аккаунт</strong><small>Полностью и без возможности восстановления</small></div>
          <button className="button button-danger" onClick={() => setDialog('delete')}>Удалить</button>
        </div>
      )}

      {dialog === 'plan' && <PlanDialog target={target} busy={busy} error={localError} onClose={close}
        onSubmit={(plan, days) => run(() => api.put(`/users/${target._id}/plan`, { plan, days }), data => onChanged(data.message))} />}
      {dialog === 'grant' && <GrantDialog target={target} busy={busy} error={localError} onClose={close}
        onSubmit={totpCode => run(() => api.put(`/users/${target._id}/delete-permission`, { enabled: !target.canDeleteUsers, totpCode }), data => onChanged(data.message))} />}
      {dialog === 'delete' && <DeleteDialog target={target} busy={busy} error={localError} onClose={close} onError={onError}
        onSubmit={form => run(() => api.delete(`/users/${target._id}`, { data: form }), data => onDeleted(data.message))} />}
    </section>
  );
}

function PlanDialog({ target, busy, error, onClose, onSubmit }) {
  const [plan, setPlan] = useState(target.plan || 'free');
  const [days, setDays] = useState(30);
  return (
    <Modal title={`Подписка @${target.username}`} onClose={onClose} footer={<><button className="button button-secondary" onClick={onClose}>Отмена</button><button className="button button-primary" form="plan-form" disabled={busy}>Сохранить</button></>}>
      <form id="plan-form" className="form-stack" onSubmit={event => { event.preventDefault(); onSubmit(plan, plan === 'free' || days === '' ? null : Number(days)); }}>
        <p className="form-hint">Сейчас: {planLabel(target)}. Выдача записывается в журнал аудита, пользователь увидит тариф в настройках.</p>
        <label className="field"><span>Тариф</span><select name="plan-id" value={plan} onChange={event => setPlan(event.target.value)}>{PLANS.map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
        {plan !== 'free' && <label className="field"><span>Срок</span><select name="plan-days" value={days} onChange={event => setDays(event.target.value)}>{DURATIONS.map(([value, label]) => <option value={value} key={label}>{label}</option>)}</select></label>}
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

function GrantDialog({ target, busy, error, onClose, onSubmit }) {
  const [code, setCode] = useState('');
  const granting = !target.canDeleteUsers;
  return (
    <Modal title={granting ? 'Выдать право удаления' : 'Забрать право удаления'} onClose={onClose} footer={<><button className="button button-secondary" onClick={onClose}>Отмена</button><button className={`button ${granting ? 'button-danger' : 'button-primary'}`} form="grant-form" disabled={busy || code.length !== 6}>{granting ? 'Выдать' : 'Забрать'}</button></>}>
      <form id="grant-form" className="form-stack" onSubmit={event => { event.preventDefault(); onSubmit(code); }}>
        <p>{granting
          ? <>Администратор <strong>@{target.username}</strong> сможет полностью удалять аккаунты. Роль не меняется, право можно забрать в любой момент.</>
          : <>У <strong>@{target.username}</strong> пропадёт право удалять аккаунты.</>}</p>
        <TotpField name="grant-totp-code" value={code} onChange={setCode} />
        {error && <p className="form-error">{error}</p>}
      </form>
    </Modal>
  );
}

function DeleteDialog({ target, busy, error, onClose, onSubmit, onError }) {
  const [footprint, setFootprint] = useState(null);
  const [form, setForm] = useState({ reason: '', confirmUsername: '', totpCode: '' });

  // Предпросмотр — один раз на открытие окна (onClose/onError меняются на
  // каждой перерисовке родителя, в зависимостях они дали бы цикл запросов).
  useEffect(() => {
    api.get(`/users/${target._id}/purge-preview`)
      .then(({ data }) => setFootprint(data.footprint))
      .catch(requestError => { onError(errorMessage(requestError)); onClose(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target._id]);

  const ready = form.reason.trim().length >= 5
    && form.confirmUsername.trim().toLowerCase() === String(target.username).toLowerCase()
    && form.totpCode.length === 6;

  return (
    <Modal title="Удалить аккаунт навсегда" onClose={onClose} footer={<><button className="button button-secondary" onClick={onClose}>Отмена</button><button className="button button-danger" form="purge-form" disabled={busy || !ready}>Удалить навсегда</button></>}>
      {!footprint ? <PageLoader /> : (
        <form id="purge-form" className="form-stack" onSubmit={event => { event.preventDefault(); onSubmit(form); }}>
          <div className="purge-warning">
            <strong>@{target.username} будет удалён полностью. Отменить нельзя.</strong>
            <ul>
              <li>Сообщений автора: {footprint.messages}</li>
              <li>Личных чатов (целиком, у обоих): {footprint.conversations}</li>
              <li>Серверов, где он владелец (со всеми каналами): {footprint.ownedServers.length}{footprint.ownedServers.length ? ` — ${footprint.ownedServers.map(server => server.name).join(', ')}` : ''}</li>
              <li>Публичная страница, уведомления, друзья, сессии</li>
            </ul>
            <small>Журнал аудита, обращения и история модерации сохраняются.</small>
          </div>
          <label className="field"><span>Причина</span><textarea name="purge-reason" rows="3" maxLength="1000" value={form.reason} onChange={event => setForm(value => ({ ...value, reason: event.target.value }))} required /></label>
          <label className="field"><span>Введите ник <strong>{target.username}</strong> для подтверждения</span><input name="purge-confirm-username" value={form.confirmUsername} onChange={event => setForm(value => ({ ...value, confirmUsername: event.target.value }))} autoComplete="off" spellCheck="false" required /></label>
          <TotpField name="purge-totp-code" value={form.totpCode} onChange={totpCode => setForm(value => ({ ...value, totpCode }))} />
          {error && <p className="form-error">{error}</p>}
        </form>
      )}
    </Modal>
  );
}
