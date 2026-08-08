import {
  AlertTriangle, ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ClipboardCheck,
  Gavel, LayoutGrid, LifeBuoy, MessageSquare, Search, ShieldCheck, UserRound, UsersRound
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import { useAuth } from '../auth/useAuth.js';
import { Badge, ErrorState, Notice } from '../components/ui.jsx';
import { useLocale } from '../i18n/useLocale.js';
import { documentationArticles, documentationGroups, localize } from './documentationContent.js';

const iconMap = {
  start: BookOpen,
  panels: LayoutGrid,
  cases: MessageSquare,
  actions: Gavel,
  appeals: ClipboardCheck,
  communication: LifeBuoy,
  incidents: AlertTriangle,
  conduct: UsersRound,
  security: ShieldCheck,
  role: UserRound
};

function localized(locale, value) {
  return localize(value, locale);
}

function ArticleSection({ section, locale, index }) {
  return (
    <section className="docs-section" id={`section-${index + 1}`}>
      <div className="docs-section-heading"><span>{String(index + 1).padStart(2, '0')}</span><h2>{localized(locale, section.title)}</h2></div>
      {section.intro && <p className="docs-lead">{localized(locale, section.intro)}</p>}

      {section.steps && <ol className="docs-steps">{section.steps.map((step, stepIndex) => (
        <li key={stepIndex}><span>{stepIndex + 1}</span><p>{localized(locale, step)}</p></li>
      ))}</ol>}

      {section.bullets && <ul className="docs-bullets">{section.bullets.map((item, itemIndex) => (
        <li key={itemIndex}><CheckCircle2 size={16} /><span>{localized(locale, item)}</span></li>
      ))}</ul>}

      {section.table && <div className="docs-table-wrap"><table className="docs-table"><thead><tr>{section.table.headers.map((header, headerIndex) => <th key={headerIndex}>{localized(locale, header)}</th>)}</tr></thead><tbody>{section.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{localized(locale, cell)}</td>)}</tr>)}</tbody></table></div>}

      {section.callout && <aside className={`docs-callout docs-callout-${section.callout.tone || 'info'}`}>
        {section.callout.tone === 'danger' || section.callout.tone === 'warning' ? <AlertTriangle size={19} /> : <ShieldCheck size={19} />}
        <div><strong>{localized(locale, section.callout.title)}</strong><p>{localized(locale, section.callout.text)}</p></div>
      </aside>}

      {section.examples && <div className="docs-examples">{section.examples.map((example, exampleIndex) => (
        <article className="docs-example" key={exampleIndex}>
          <header><span>{localized(locale, { ru: 'ПРИМЕР', en: 'EXAMPLE' })} {exampleIndex + 1}</span><h3>{localized(locale, example.title)}</h3></header>
          <div className="docs-example-situation"><strong>{localized(locale, { ru: 'Ситуация', en: 'Situation' })}</strong><p>{localized(locale, example.situation)}</p></div>
          <div className="docs-example-choices">
            <div className="is-wrong"><strong>{localized(locale, { ru: 'Неправильно', en: 'Wrong' })}</strong><p>{localized(locale, example.wrong)}</p></div>
            <div className="is-right"><strong>{localized(locale, { ru: 'Правильно', en: 'Right' })}</strong><p>{localized(locale, example.right)}</p></div>
          </div>
          <footer><strong>{localized(locale, { ru: 'Результат', en: 'Outcome' })}</strong><span>{localized(locale, example.outcome)}</span></footer>
        </article>
      ))}</div>}
    </section>
  );
}

export default function DocumentationPage() {
  const { user, refreshSession } = useAuth();
  const { locale } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const policyVersion = user.adminPolicyRequiredVersion || 'current';
  const progressKey = `love-admin-docs:${user._id}:${policyVersion}`;
  const [visited, setVisited] = useState(() => {
    try { return JSON.parse(localStorage.getItem(progressKey) || '[]'); } catch { return []; }
  });

  const requestedSlug = location.pathname.replace(/^\/documentation\/?/, '') || 'start';
  const articleIndex = documentationArticles.findIndex(item => item.slug === requestedSlug);
  const currentIndex = articleIndex >= 0 ? articleIndex : 0;
  const article = documentationArticles[currentIndex];
  const needsAcceptance = Boolean(user.adminPolicyRequiredVersion && user.adminPolicyAcceptedVersion !== user.adminPolicyRequiredVersion);
  const requiredSlugs = useMemo(() => ['start', 'actions', 'conduct', 'security', `roles/${user.role}`], [user.role]);
  const requiredVisited = requiredSlugs.filter(slug => visited.includes(slug));
  const allRequiredVisited = requiredVisited.length === requiredSlugs.length;

  useEffect(() => {
    if (articleIndex < 0) {
      navigate('/documentation/start', { replace: true });
      return;
    }
    setVisited(current => {
      if (current.includes(article.slug)) return current;
      const next = [...current, article.slug];
      localStorage.setItem(progressKey, JSON.stringify(next));
      return next;
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [article.slug, articleIndex, navigate, progressKey]);

  const filteredArticles = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale === 'ru' ? 'ru-RU' : 'en-US');
    if (!normalized) return documentationArticles;
    return documentationArticles.filter(item => `${localized(locale, item.title)} ${localized(locale, item.summary)}`.toLocaleLowerCase().includes(normalized));
  }, [locale, query]);

  async function acceptPolicy() {
    if (!allRequiredVisited || !accepted) return;
    setBusy(true);
    setError('');
    try {
      await api.post('/policy/accept', { accepted: true });
      await refreshSession();
      setNotice(localized(locale, { ru: 'Правила команды приняты. Рабочие разделы доступны.', en: 'Team rules accepted. Work sections are now available.' }));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }

  const previous = documentationArticles[currentIndex - 1];
  const next = documentationArticles[currentIndex + 1];
  const ArticleIcon = iconMap[article.icon] || BookOpen;

  return <div className="documentation-page">
    {notice && <Notice onClose={() => setNotice('')}>{notice}</Notice>}
    {error && <ErrorState message={error} />}

    {needsAcceptance && <section className="policy-gate docs-policy-gate">
      <BookOpen size={24} />
      <div><strong>{localized(locale, { ru: 'Обязательное знакомство с правилами', en: 'Required policy reading' })}</strong><p>{localized(locale, { ru: `Откройте обязательные страницы для вашей должности: ${requiredVisited.length} из ${requiredSlugs.length}. После этого подтвердите согласие внизу статьи.`, en: `Open the required pages for your role: ${requiredVisited.length} of ${requiredSlugs.length}. Then confirm acceptance below.` })}</p></div>
      <Badge tone={allRequiredVisited ? 'success' : 'warning'}>{requiredVisited.length}/{requiredSlugs.length}</Badge>
    </section>}

    <div className="docs-mobile-picker">
      <label htmlFor="docs-page-select">{localized(locale, { ru: 'Страница справочника', en: 'Guide page' })}</label>
      <select id="docs-page-select" name="docs-page" value={article.slug} onChange={event => navigate(`/documentation/${event.target.value}`)}>
        {documentationArticles.map(item => <option key={item.slug} value={item.slug}>{localized(locale, item.title)}</option>)}
      </select>
    </div>

    <div className="docs-layout">
      <aside className="docs-navigation">
        <div className="docs-navigation-title"><BookOpen size={18} /><div><strong>{localized(locale, { ru: 'Справочник Love', en: 'Love handbook' })}</strong><span>{localized(locale, { ru: 'Версия', en: 'Version' })} {policyVersion}</span></div></div>
        <label className="docs-search"><Search size={15} /><input name="documentation-search" value={query} onChange={event => setQuery(event.target.value)} placeholder={localized(locale, { ru: 'Найти инструкцию', en: 'Find a guide' })} /></label>
        <nav aria-label={localized(locale, { ru: 'Разделы документации', en: 'Documentation sections' })}>
          {documentationGroups.map(group => {
            const items = filteredArticles.filter(item => item.group === group.id);
            if (!items.length) return null;
            return <section key={group.id}><h2>{localized(locale, group.title)}</h2>{items.map(item => {
              const Icon = iconMap[item.icon] || BookOpen;
              return <Link key={item.slug} to={`/documentation/${item.slug}`} className={article.slug === item.slug ? 'active' : ''} title={localized(locale, item.summary)}><Icon size={15} /><span>{localized(locale, item.title)}</span>{requiredSlugs.includes(item.slug) && <i className={visited.includes(item.slug) ? 'is-read' : ''} />}</Link>;
            })}</section>;
          })}
        </nav>
      </aside>

      <main className="docs-article">
        <header className="docs-article-header">
          <div className="docs-breadcrumb"><BookOpen size={14} /><span>{localized(locale, documentationGroups.find(group => group.id === article.group)?.title)}</span><span>/</span><span>{localized(locale, article.title)}</span></div>
          <div className="docs-title-row"><span className="docs-title-icon"><ArticleIcon size={23} /></span><div><h1>{localized(locale, article.title)}</h1><p>{localized(locale, article.summary)}</p></div></div>
          <div className="docs-meta"><Badge tone="info">{article.readTime} {localized(locale, { ru: 'мин чтения', en: 'min read' })}</Badge><span>{article.sections.length} {localized(locale, { ru: 'раздела', en: 'sections' })}</span>{visited.includes(article.slug) && <span className="docs-read-mark"><CheckCircle2 size={14} />{localized(locale, { ru: 'Открыто', en: 'Opened' })}</span>}</div>
        </header>

        <div className="docs-article-body">{article.sections.map((section, index) => <ArticleSection key={index} section={section} locale={locale} index={index} />)}</div>

        <nav className="docs-pagination" aria-label={localized(locale, { ru: 'Следующая страница', en: 'Article pagination' })}>
          {previous ? <Link to={`/documentation/${previous.slug}`}><ArrowLeft size={16} /><span><small>{localized(locale, { ru: 'Назад', en: 'Previous' })}</small><strong>{localized(locale, previous.title)}</strong></span></Link> : <span />}
          {next && <Link to={`/documentation/${next.slug}`}><span><small>{localized(locale, { ru: 'Далее', en: 'Next' })}</small><strong>{localized(locale, next.title)}</strong></span><ArrowRight size={16} /></Link>}
        </nav>

        {needsAcceptance && <section className="policy-acceptance docs-policy-acceptance">
          <div>
            <label><input name="accept-admin-policy" type="checkbox" checked={accepted} disabled={!allRequiredVisited} onChange={event => setAccepted(event.target.checked)} /><span>{localized(locale, { ru: 'Я прочитал обязанности своей роли, правила работы с данными и последствия злоупотребления полномочиями.', en: 'I have read my role duties, data rules and consequences of abusing authority.' })}</span></label>
            {!allRequiredVisited && <p>{localized(locale, { ru: 'Сначала откройте все страницы, отмеченные точкой в оглавлении.', en: 'First open every page marked with a dot in the contents.' })}</p>}
          </div>
          <button className="button button-primary" disabled={!accepted || !allRequiredVisited || busy} onClick={acceptPolicy}><ClipboardCheck size={16} />{localized(locale, { ru: 'Принять правила', en: 'Accept policy' })}</button>
        </section>}
      </main>
    </div>
  </div>;
}
