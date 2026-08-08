import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Inbox, Search, X } from 'lucide-react';

export function PageHeader({ title, description, actions }) {
  return (
    <div className="page-heading">
      <div><h2>{title}</h2>{description && <p>{description}</p>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Metric({ label, value, detail, icon: Icon, tone = 'neutral' }) {
  return (
    <article className={`metric metric-${tone}`}>
      <div className="metric-label"><span>{label}</span>{Icon && <Icon size={17} />}</div>
      <strong>{value}</strong>
      {detail && <small>{detail}</small>}
    </article>
  );
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function Avatar({ user, size = '' }) {
  const name = user?.nickname || user?.username || '?';
  if (user?.avatar) return <img className={`avatar ${size}`} src={user.avatar} alt="" />;
  return <span className={`avatar ${size}`}>{name.slice(0, 1).toUpperCase()}</span>;
}

export function EmptyState({ title, description, icon: Icon = Inbox, action }) {
  return (
    <div className="empty-state">
      <span><Icon size={24} /></span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, retry }) {
  return (
    <div className="inline-state state-error">
      <AlertCircle size={18} /><span>{message}</span>
      {retry && <button className="button button-secondary" onClick={retry}>Повторить</button>}
    </div>
  );
}

export function Notice({ children, tone = 'success', onClose }) {
  return (
    <div className={`notice notice-${tone}`}>
      {tone === 'success' ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
      <span>{children}</span>
      {onClose && <button className="icon-button" onClick={onClose} title="Закрыть"><X size={15} /></button>}
    </div>
  );
}

export function SearchField({ value, onChange, placeholder = 'Поиск', name = 'search' }) {
  return (
    <label className="search-field">
      <Search size={17} />
      <input name={name} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
      {value && <button onClick={() => onChange('')} title="Очистить" type="button"><X size={15} /></button>}
    </label>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null;
  return (
    <div className="pagination">
      <button className="icon-button" disabled={page <= 1} onClick={() => onChange(page - 1)} title="Предыдущая страница"><ChevronLeft size={17} /></button>
      <span>{page} / {pages}</span>
      <button className="icon-button" disabled={page >= pages} onClick={() => onChange(page + 1)} title="Следующая страница"><ChevronRight size={17} /></button>
    </div>
  );
}

export function Modal({ title, children, onClose, footer, wide = false }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header><h3>{title}</h3><button className="icon-button" onClick={onClose} title="Закрыть"><X size={18} /></button></header>
        <div className="modal-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}

export function Segmented({ value, onChange, options, label }) {
  return (
    <div className="segmented" aria-label={label}>
      {options.map(option => (
        <button key={option.value} className={value === option.value ? 'active' : ''} onClick={() => onChange(option.value)} type="button">
          {option.label}
        </button>
      ))}
    </div>
  );
}
