import { ArrowLeft, Heart, KeyRound, LoaderCircle, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import { Notice, Segmented } from '../components/ui.jsx';

export default function LoginPage() {
  const { completeLogin } = useAuth();
  const [step, setStep] = useState('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [methods, setMethods] = useState([]);
  const [method, setMethod] = useState('email');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function sendEmailCode(token = challengeToken) {
    const { data } = await api.post('/auth/challenge/email', { challengeToken: token });
    if (data.developmentCode) {
      setCode(data.developmentCode);
      setMessage(`Локальная проверка: код ${data.developmentCode} уже подставлен. В production этот режим отключён.`);
      return;
    }
    setMessage('Код отправлен на почту');
  }

  async function submitCredentials(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const { data } = await api.post('/auth/login', { email, password });
      const preferred = data.methods.includes('totp')
        ? 'totp'
        : data.methods.includes('bootstrap') ? 'bootstrap' : 'email';
      setChallengeToken(data.challengeToken);
      setMethods(data.methods);
      setMethod(preferred);
      setStep('verify');
      if (preferred === 'email') await sendEmailCode(data.challengeToken);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Не удалось войти'));
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/auth/verify', { challengeToken, method, code });
      completeLogin(data);
    } catch (requestError) {
      setError(errorMessage(requestError, 'Код не принят'));
    } finally {
      setBusy(false);
    }
  }

  async function chooseMethod(nextMethod) {
    setMethod(nextMethod);
    setCode('');
    setError('');
    setMessage('');
    if (nextMethod === 'email') {
      setBusy(true);
      try {
        await sendEmailCode();
      } catch (requestError) {
        setError(errorMessage(requestError));
      } finally {
        setBusy(false);
      }
    }
  }

  const methodOptions = methods.map(value => ({
    value,
    label: value === 'totp'
      ? 'Authenticator'
      : value === 'recovery' ? 'Резервный код' : value === 'bootstrap' ? 'Первичная настройка' : 'Email'
  }));

  const codeIsText = method === 'recovery' || method === 'bootstrap';

  return (
    <main className="login-page">
      <section className="login-brand">
        <div className="login-wordmark"><Heart size={22} fill="currentColor" /> LOVE</div>
        <div>
          <span className="eyebrow">CONTROL CENTER</span>
          <h1>Безопасность начинается с ясных решений.</h1>
          <p>Административная среда Love</p>
        </div>
        <span className="login-security"><ShieldCheck size={16} /> Журналируемая сессия</span>
      </section>

      <section className="login-form-wrap">
        <form className="login-panel" onSubmit={step === 'credentials' ? submitCredentials : submitCode}>
          {step === 'verify' && (
            <button type="button" className="back-button" onClick={() => { setStep('credentials'); setCode(''); setError(''); }}>
              <ArrowLeft size={16} /> Назад
            </button>
          )}
          <div className="auth-icon">{step === 'credentials' ? <LockKeyhole size={22} /> : <KeyRound size={22} />}</div>
          <h2>{step === 'credentials' ? 'Вход в панель' : 'Подтверждение входа'}</h2>
          <p>{step === 'credentials' ? 'Используйте учётную запись сотрудника.' : 'Выберите доступный способ подтверждения.'}</p>

          {error && <Notice tone="error">{error}</Notice>}
          {message && <Notice>{message}</Notice>}

          {step === 'credentials' ? (
            <>
              <label className="field"><span>Email</span><div><Mail size={16} /><input name="email" type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" required /></div></label>
              <label className="field"><span>Пароль</span><div><LockKeyhole size={16} /><input name="password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></div></label>
            </>
          ) : (
            <>
              {methodOptions.length > 1 && <Segmented value={method} onChange={chooseMethod} options={methodOptions} label="Способ подтверждения" />}
              <label className="field"><span>{method === 'recovery' ? 'Резервный код' : method === 'bootstrap' ? 'Одноразовый код первичной настройки' : 'Код подтверждения'}</span><div><KeyRound size={16} /><input name="verification-code" value={code} onChange={event => setCode(event.target.value)} inputMode={codeIsText ? 'text' : 'numeric'} autoComplete="one-time-code" maxLength={method === 'bootstrap' ? 40 : method === 'recovery' ? 20 : 6} required autoFocus /></div></label>
            </>
          )}

          <button className="button button-primary button-full" disabled={busy}>
            {busy ? <LoaderCircle size={17} className="spin" /> : <ShieldCheck size={17} />}
            {step === 'credentials' ? 'Продолжить' : 'Подтвердить'}
          </button>
        </form>
      </section>
    </main>
  );
}
