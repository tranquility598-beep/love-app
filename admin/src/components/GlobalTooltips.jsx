import { useEffect } from 'react';

export default function GlobalTooltips() {
  useEffect(() => {
    const tooltip = document.createElement('div');
    tooltip.className = 'global-tooltip';
    tooltip.setAttribute('role', 'tooltip');
    document.body.appendChild(tooltip);
    let active = null;

    function textFor(element) {
      if (!element) return '';
      if (element.dataset.tooltip) return element.dataset.tooltip;
      if (element.getAttribute('title')) return element.getAttribute('title');
      if (element.getAttribute('aria-label')) return element.getAttribute('aria-label');
      if (element.tagName === 'SELECT') {
        const label = element.closest('label')?.querySelector('span')?.textContent?.trim();
        return label ? `Выбор: ${label}` : 'Выберите значение';
      }
      return element.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120) || '';
    }

    function position(element) {
      const rect = element.getBoundingClientRect();
      const width = tooltip.offsetWidth;
      const height = tooltip.offsetHeight;
      let left = rect.left + rect.width / 2 - width / 2;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      let top = rect.top - height - 9;
      if (top < 8) top = rect.bottom + 9;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    function show(event) {
      const element = event.target.closest('button, select, [data-tooltip]');
      const text = textFor(element);
      if (!element || !text || element.disabled) return;
      active = element;
      tooltip.textContent = text;
      tooltip.classList.add('visible');
      requestAnimationFrame(() => position(element));
    }

    function hide(event) {
      if (!active || (event.relatedTarget && active.contains(event.relatedTarget))) return;
      active = null;
      tooltip.classList.remove('visible');
    }

    document.addEventListener('mouseover', show);
    document.addEventListener('mouseout', hide);
    document.addEventListener('focusin', show);
    document.addEventListener('focusout', hide);
    window.addEventListener('scroll', hide, true);
    return () => {
      document.removeEventListener('mouseover', show);
      document.removeEventListener('mouseout', hide);
      document.removeEventListener('focusin', show);
      document.removeEventListener('focusout', hide);
      window.removeEventListener('scroll', hide, true);
      tooltip.remove();
    };
  }, []);

  return null;
}
