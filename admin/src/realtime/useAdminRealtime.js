import { useEffect, useRef } from 'react';

export function useAdminRealtime(scopes, handler, options = {}) {
  const handlerRef = useRef(handler);
  const scopeKey = Array.isArray(scopes) ? scopes.join(',') : String(scopes || '*');
  const debounceMs = Number.isFinite(options.debounceMs) ? options.debounceMs : 120;

  useEffect(() => {
    handlerRef.current = handler;
  }, [handler]);

  useEffect(() => {
    let timer = null;
    const accepted = new Set(scopeKey.split(',').filter(Boolean));
    const onUpdate = event => {
      const update = event.detail || {};
      if (!accepted.has('*') && !accepted.has(update.scope)) return;
      if (debounceMs <= 0) {
        handlerRef.current?.(update);
        return;
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(() => handlerRef.current?.(update), debounceMs);
    };
    window.addEventListener('love-admin-update', onUpdate);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('love-admin-update', onUpdate);
    };
  }, [debounceMs, scopeKey]);
}
