import { BellRing, Languages, MonitorCog, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader, Segmented } from '../components/ui.jsx';
import { useLocale } from '../i18n/useLocale.js';

const defaults = { density: 'comfortable', reduceMotion: false, desktopAlerts: true, confirmDangerous: true };

function loadSettings() {
  try { return { ...defaults, ...JSON.parse(localStorage.getItem('love-admin-settings') || '{}') }; }
  catch { return defaults; }
}

export default function SettingsPage() {
  const { locale, setLocale } = useLocale();
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    localStorage.setItem('love-admin-settings', JSON.stringify(settings));
    document.documentElement.dataset.adminDensity = settings.density;
    document.documentElement.dataset.reduceMotion = String(settings.reduceMotion);
  }, [settings]);

  const update = (key, value) => setSettings(current => ({ ...current, [key]: value }));
  return <div className="page-stack admin-settings-page">
    <PageHeader title={locale === 'en' ? 'Settings' : 'Настройки'} description={locale === 'en' ? 'Workspace, notifications and safety confirmations' : 'Рабочее пространство, уведомления и подтверждения безопасности'} />
    <section className="settings-group"><header><MonitorCog size={19} /><div><h2>Интерфейс</h2><p>Настройки сохраняются только для этого устройства.</p></div></header><div className="settings-row"><div><strong>Плотность интерфейса</strong><span>Компактный режим показывает больше строк без уменьшения кнопок.</span></div><Segmented value={settings.density} onChange={value => update('density', value)} options={[{ value: 'comfortable', label: 'Обычно' }, { value: 'compact', label: 'Компактно' }]} label="Плотность" /></div><div className="settings-row"><div><strong>Уменьшить движение</strong><span>Отключает раскрытия и декоративные переходы.</span></div><label className="admin-toggle"><input name="reduce-motion" type="checkbox" checked={settings.reduceMotion} onChange={event => update('reduceMotion', event.target.checked)} /><span /></label></div></section>
    <section className="settings-group"><header><BellRing size={19} /><div><h2>События</h2><p>LIVE-канал продолжает обновлять данные независимо от этих уведомлений.</p></div></header><div className="settings-row"><div><strong>Уведомления на рабочем столе</strong><span>Показывать срочные обращения, когда вкладка неактивна.</span></div><label className="admin-toggle"><input name="desktop-alerts" type="checkbox" checked={settings.desktopAlerts} onChange={event => update('desktopAlerts', event.target.checked)} /><span /></label></div><div className="settings-row"><div><strong>Подтверждать опасные действия</strong><span>Дополнительный шаг перед удалением, баном и сменой роли.</span></div><label className="admin-toggle"><input name="confirm-dangerous" type="checkbox" checked={settings.confirmDangerous} onChange={event => update('confirmDangerous', event.target.checked)} /><span /></label></div></section>
    <section className="settings-group"><header><Languages size={19} /><div><h2>Язык</h2><p>Язык навигации и поддерживаемых элементов панели.</p></div></header><div className="settings-row"><div><strong>RU / EN</strong><span>Можно также переключить в верхней панели.</span></div><Segmented value={locale} onChange={setLocale} options={[{ value: 'ru', label: 'Русский' }, { value: 'en', label: 'English' }]} label="Язык" /></div></section>
    <section className="settings-security"><ShieldCheck size={20} /><div><strong>Защищённая административная сессия</strong><span>HttpOnly cookie, CSRF, привязка к устройству, 30 минут бездействия и максимум 8 часов. В production смена роли требует свежий код Authenticator.</span></div></section>
  </div>;
}
