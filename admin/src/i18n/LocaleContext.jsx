import { useEffect, useMemo, useState } from 'react';
import { LocaleContext } from './context.js';

const messages = {
  ru: {
    staffComms: '\u0421\u0432\u044f\u0437\u044c',
    dashboard: 'Дашборд', users: 'Пользователи', moderation: 'Модерация', cases: 'Обращения',
    community: 'Community', team: 'Команда', servers: 'Серверы', announcements: 'Анонсы',
    audit: 'Аудит', infrastructure: 'Инфраструктура', documentation: 'Документация', settings: 'Настройки', secureSession: 'защищённая сессия',
    notifications: 'Уведомления', openMenu: 'Открыть меню', closeMenu: 'Закрыть меню',
    collapseMenu: 'Свернуть меню', expandMenu: 'Развернуть меню', logout: 'Выйти'
  },
  en: {
    staffComms: 'Communications',
    dashboard: 'Dashboard', users: 'Users', moderation: 'Moderation', cases: 'Cases',
    community: 'Community', team: 'Team', servers: 'Servers', announcements: 'Announcements',
    audit: 'Audit', infrastructure: 'Infrastructure', documentation: 'Documentation', settings: 'Settings', secureSession: 'secure session',
    notifications: 'Notifications', openMenu: 'Open menu', closeMenu: 'Close menu',
    collapseMenu: 'Collapse menu', expandMenu: 'Expand menu', logout: 'Sign out'
  }
};

const valueLabels = {
  ru: {
    all: 'Все', new: 'Новое', triaged: 'Принято', in_progress: 'В работе', waiting_user: 'Ждёт пользователя',
    resolved: 'Решено', rejected: 'Отклонено', archived: 'Архив', low: 'Низкий', normal: 'Обычный',
    high: 'Высокий', critical: 'Критический', draft: 'Черновик', scheduled: 'По расписанию',
    published: 'Опубликовано', under_review: 'На рассмотрении', planned: 'Запланировано', completed: 'Реализовано',
    declined: 'Не планируется', active: 'Активно', hidden: 'Скрыто', deleted: 'Удалено'
  },
  en: {
    all: 'All', new: 'New', triaged: 'Triaged', in_progress: 'In progress', waiting_user: 'Waiting for user',
    resolved: 'Resolved', rejected: 'Rejected', archived: 'Archived', low: 'Low', normal: 'Normal',
    high: 'High', critical: 'Critical', draft: 'Draft', scheduled: 'Scheduled', published: 'Published',
    under_review: 'Under review', planned: 'Planned', completed: 'Completed', declined: 'Not planned',
    active: 'Active', hidden: 'Hidden', deleted: 'Deleted'
  }
};

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => localStorage.getItem('love-admin-locale') === 'en' ? 'en' : 'ru');
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(() => ({
    locale,
    setLocale(next) {
      const normalized = next === 'en' ? 'en' : 'ru';
      localStorage.setItem('love-admin-locale', normalized);
      document.documentElement.lang = normalized;
      setLocaleState(normalized);
    },
    t(key) { return messages[locale][key] || key; },
    valueLabel(value) { return valueLabels[locale][value] || value; }
  }), [locale]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
