import { Check, Clipboard, Heart, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import { Notice } from '../components/ui.jsx';
import PageLoader from '../components/PageLoader.jsx';

export default function SecuritySetupPage() {
  const { refreshSession, logout } = useAuth();
  const navigate = useNavigate();
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.post('/auth/totp/setup')
      .then(response => setSetup(response.data))
      .catch(requestError => setError(errorMessage(requestError)))
      .finally(() => setLoading(false));
  }, []);

  async function confirm(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/totp/confirm', { code });
      setRecoveryCodes(data.recoveryCodes);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  return <main className="security-setup-page">
    <header className="security-setup-header"><span><Heart size={18} fill="currentColor" /> LOVE ADMIN</span><button className="button button-ghost" onClick={logout}>Выйти</button></header>
    <section className="security-setup-panel">
      {loading ? <PageLoader label="Создаём защищённый ключ" /> : recoveryCodes.length ? <div className="recovery-view">
        <span className="auth-icon"><ShieldCheck size={22} /></span>
        <span className="eyebrow">ЗАЩИТА ВКЛЮЧЕНА</span><h1>Authenticator подключён</h1>
        <p>Резервные коды показываются только сейчас. Каждый код одноразовый.</p>
        <div className="recovery-codes">{recoveryCodes.map(value => <code key={value}>{value}</code>)}</div>
        <button className="button button-secondary" onClick={() => navigator.clipboard.writeText(recoveryCodes.join('\n'))}><Clipboard size={16} />Копировать коды</button>
        <button className="button button-primary button-full" onClick={async () => { await refreshSession(); navigate('/'); }}><Check size={16} />Открыть админ-панель</button>
      </div> : setup ? <form className="totp-setup" onSubmit={confirm}>
        <span className="auth-icon"><KeyRound size={22} /></span>
        <span className="eyebrow">ОБЯЗАТЕЛЬНАЯ ЗАЩИТА</span><h1>Подключите Authenticator</h1>
        <p>Без него административные API остаются заблокированы.</p>
        {error && <Notice tone="error">{error}</Notice>}
        <img src={setup.qrCode} alt="QR-код Authenticator" />
        <code>{setup.manualKey}</code>
        <label className="field"><span>Код из Authenticator</span><div><LockKeyhole size={16} /><input name="totp-code" value={code} onChange={event => setCode(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength="6" required autoFocus /></div></label>
        <button className="button button-primary button-full" disabled={busy}>Подтвердить и продолжить</button>
      </form> : <Notice tone="error">{error || 'Не удалось начать настройку'}</Notice>}
    </section>
  </main>;
}
