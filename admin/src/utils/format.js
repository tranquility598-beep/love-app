export function formatDate(value, withTime = true) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(new Date(value));
}

export function toneForStatus(status) {
  if (['resolved', 'published', 'active', 'verified', 'online'].includes(status)) return 'success';
  if (['critical', 'banned', 'rejected', 'deleted', 'error'].includes(status)) return 'danger';
  if (['high', 'muted', 'waiting_user', 'scheduled'].includes(status)) return 'warning';
  if (['in_progress', 'triaged', 'new'].includes(status)) return 'info';
  return 'neutral';
}
