/**
 * Предупреждение о переходе на сторонний сайт.
 *
 * Ссылки в сообщениях пишут другие люди, поэтому клик по чужому адресу мы
 * перехватываем и показываем настоящий хост: «Остаться» / «Перейти» и галочка
 * «Больше не предупреждать». Свои домены открываются молча.
 *
 * Парная реализация для мобилки — mobile/lib/src/core/external_link.dart,
 * ключ настройки специально одинаковый: love_link_warning.
 */
(function () {
  'use strict';

  var OWN_DOMAIN = 'loveapp.chat';
  var PREF_KEY = 'love_link_warning';

  function warnEnabled() {
    try {
      var raw = localStorage.getItem(PREF_KEY);
      return raw !== 'false' && raw !== '0';
    } catch (e) {
      return true;
    }
  }

  function setWarnEnabled(enabled) {
    // Через settingsManager, если он есть: иначе его копия в памяти останется
    // старой и тумблер в настройках покажет не то, что на самом деле.
    try {
      if (window.settingsManager && typeof window.settingsManager.saveSetting === 'function') {
        window.settingsManager.saveSetting(PREF_KEY, !!enabled);
      } else {
        localStorage.setItem(PREF_KEY, enabled ? 'true' : 'false');
      }
    } catch (e) {
      /* приватный режим — просто останемся с предупреждениями */
    }
    syncToggle(!!enabled);
  }

  // Настройки строятся один раз на DOMContentLoaded, поэтому тумблер сам о
  // галочке из модалки не узнает — двигаем его руками.
  function syncToggle(enabled) {
    var toggles = document.querySelectorAll('input[type="checkbox"][data-setting-key="' + PREF_KEY + '"]');
    for (var i = 0; i < toggles.length; i++) toggles[i].checked = enabled;
  }

  // Поддомены проверяем суффиксом с точкой, иначе loveapp.chat.evil.com
  // сошёл бы за свой.
  function isOwn(url) {
    try {
      var host = new URL(url, location.href).hostname.toLowerCase();
      return host === OWN_DOMAIN || host.endsWith('.' + OWN_DOMAIN);
    } catch (e) {
      return false;
    }
  }

  function openNow(url) {
    if (window.electronAPI && typeof window.electronAPI.openExternal === 'function') {
      window.electronAPI.openExternal(url);
      return;
    }
    // Клиент, открытый в обычном браузере (тесты, веб-сборка).
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // ── Модалка ────────────────────────────────────────────────────────────────

  var modal = null;
  var els = null;
  var pending = null;

  function buildModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.className = 'modal-backdrop hidden';
    modal.id = 'external-link-modal';
    modal.style.zIndex = '20000';
    modal.innerHTML =
      '<div class="profile-card" style="width: 400px; max-width: calc(100% - 32px); padding: 26px; align-items: stretch; box-sizing: border-box;">' +
      '<h3 style="margin: 0 0 10px; font-family: var(--font-serif); font-size: 20px; color: var(--text-primary);">Переход на другой сайт</h3>' +
      '<p style="margin: 0 0 16px; font-size: 13.5px; color: var(--text-secondary); line-height: 1.5; font-family: var(--font-sans);">' +
      'Ссылка ведёт за пределы LOVE. Проверьте адрес — чужой сайт может притворяться знакомым.</p>' +
      '<div style="padding: 10px 12px; margin-bottom: 14px; border: 1px solid var(--border-active, rgba(255,255,255,0.12)); border-radius: 12px; background: rgba(255,255,255,0.04); overflow: hidden;">' +
      '<div data-role="host" style="font-family: var(--font-sans); font-size: 14.5px; font-weight: 800; color: var(--text-primary); overflow-wrap: anywhere;"></div>' +
      '<div data-role="tail" style="margin-top: 3px; font-family: var(--font-mono, monospace); font-size: 11.5px; line-height: 1.35; color: var(--text-muted, var(--text-secondary)); overflow-wrap: anywhere; max-height: 48px; overflow: hidden;"></div>' +
      '</div>' +
      '<label style="display: flex; align-items: center; gap: 9px; margin-bottom: 18px; font-size: 13px; color: var(--text-secondary); cursor: pointer; user-select: none;">' +
      '<input type="checkbox" data-role="dont-warn" style="width: 15px; height: 15px; accent-color: var(--text-primary); cursor: pointer;">' +
      '<span>Больше не предупреждать</span></label>' +
      '<div style="display: flex; gap: 10px;">' +
      '<button class="lvs-btn lvs-btn--ghost" data-role="stay" type="button" style="flex: 1;">Остаться</button>' +
      '<button class="lvs-btn" data-role="go" type="button" style="flex: 1;">Перейти</button>' +
      '</div></div>';

    els = {
      host: modal.querySelector('[data-role="host"]'),
      tail: modal.querySelector('[data-role="tail"]'),
      checkbox: modal.querySelector('[data-role="dont-warn"]'),
      stay: modal.querySelector('[data-role="stay"]'),
      go: modal.querySelector('[data-role="go"]')
    };

    els.stay.addEventListener('click', function () { close(false); });
    els.go.addEventListener('click', function () { close(true); });
    modal.addEventListener('click', function (event) {
      if (event.target === modal) close(false);
    });
    document.addEventListener('keydown', function (event) {
      if (!modal || modal.classList.contains('hidden')) return;
      if (event.key === 'Escape') close(false);
    });

    document.body.appendChild(modal);
  }

  function close(proceed) {
    // Галочка про сами предупреждения, а не про эту ссылку, поэтому сохраняем
    // её при любом ответе — иначе «отметил, а всё равно спрашивает».
    if (els.checkbox.checked) setWarnEnabled(false);
    modal.classList.add('hidden');
    var url = pending;
    pending = null;
    if (proceed && url) openNow(url);
  }

  function ask(url) {
    buildModal();
    var parsed;
    try {
      parsed = new URL(url, location.href);
    } catch (e) {
      return;
    }
    pending = url;
    els.host.textContent = parsed.hostname;
    var tail = (parsed.pathname === '/' ? '' : parsed.pathname) + parsed.search + parsed.hash;
    els.tail.textContent = tail;
    els.tail.style.display = tail ? '' : 'none';
    els.checkbox.checked = false;
    modal.classList.remove('hidden');
    els.stay.focus();
  }

  /** Открыть ссылку: чужую — через предупреждение, свою — сразу. */
  function open(url) {
    if (!/^https?:\/\//i.test(url)) return;
    if (isOwn(url) || !warnEnabled()) {
      openNow(url);
      return;
    }
    ask(url);
  }

  // ── Перехват кликов ────────────────────────────────────────────────────────

  function onClick(event) {
    if (event.defaultPrevented) return;
    // Средняя кнопка приходит в auxclick, правая — контекстное меню, её не трогаем.
    if (event.button !== 0 && event.button !== 1) return;
    var anchor = event.target && event.target.closest && event.target.closest('a[href]');
    if (!anchor) return;
    var href = anchor.getAttribute('href') || '';
    if (!/^https?:\/\//i.test(href)) return;
    // Ссылку открываем сами: иначе target=_blank уходит в setWindowOpenHandler
    // мимо предупреждения, а обычный href глушит will-navigate.
    event.preventDefault();
    event.stopPropagation();
    open(href);
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);

  window.LoveExternalLink = {
    open: open,
    isOwn: isOwn,
    warnEnabled: warnEnabled,
    setWarnEnabled: setWarnEnabled
  };
})();
