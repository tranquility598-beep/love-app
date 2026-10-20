/**
 * HTML публичной страницы профиля.
 *
 * СЕРВЕРНЫЙ РЕНДЕР ЗДЕСЬ ОБЯЗАТЕЛЕН. Ссылку кладут в био — её открывают
 * Telegram, ВК, Discord и поисковики, а они читают OpenGraph, не выполняя JS.
 * Страница, которую собирает клиентский скрипт, в превью выглядит пустой, и
 * половина смысла визитки теряется. Тот же довод, что в routes/invitePage.js.
 *
 * ЧТО СЮДА ПРИХОДИТ. Только объект из utils/profilePageView — уже урезанный по
 * тарифу и без единого лишнего поля аккаунта. Документы Mongo сюда не попадают
 * намеренно: рендер не должен иметь возможности напечатать email.
 *
 * ЭКРАНИРОВАНИЕ. Всё пользовательское проходит через esc/attr. Отдельно —
 * jsonForScript: внутри <script> закрывающий тег и U+2028/2029 ломают разбор,
 * и это классический способ выйти из строки в инъекцию.
 *
 * CSP. Инлайновые <style> и <script> подписаны nonce, который выдаёт роут.
 * Без nonce строгая политика их не выполнит — а строгая она потому, что на
 * этом хосте живёт пользовательское оформление.
 */

const { buildStyles, scopeForShadow } = require('./profilePageStyles');
const { iconSvg, hasIcon } = require('./profileIcons');
const { mountProfileEffects } = require('./profileEffects');

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

/** Значение атрибута. Отдельно от esc, чтобы в вызове было видно намерение. */
function attr(value) {
  return esc(value);
}

function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Домен ссылки — подпись справа в кнопке. Битый URL просто не подписываем. */
function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function initial(text) {
  const str = String(text || '').trim();
  return str ? str[0].toUpperCase() : '?';
}

function truncate(text, max) {
  const str = String(text || '').replace(/\s+/g, ' ').trim();
  if (str.length <= max) return str;
  return `${str.slice(0, max - 1).trimEnd()}…`;
}

// ─────────────────────────────── блоки ───────────────────────────────

function renderBackground(view) {
  const layers = ['<div class="pf-bg-grad"></div>'];

  if (view.theme.animated && !view.background) {
    layers.push('<div class="pf-bg-anim"></div>');
  }

  if (view.background) {
    if (view.background.kind === 'video') {
      // playsinline и muted — иначе iOS откроет видео на весь экран вместо фона.
      layers.push(
        `<video class="pf-bg-media" src="${attr(view.background.url)}" autoplay muted loop playsinline preload="auto"></video>`
      );
    } else {
      layers.push(`<img class="pf-bg-media" src="${attr(view.background.url)}" alt="" decoding="async">`);
    }
    layers.push('<div class="pf-bg-dim"></div>');
  }

  return `<div class="pf-bg" aria-hidden="true">${layers.join('')}</div>`;
}

function renderAvatar(view) {
  const inner = view.avatar
    ? `<img class="pf-avatar" src="${attr(view.avatar)}" alt="${attr(view.title)}" width="124" height="124">`
    : `<div class="pf-avatar pf-avatar-fallback">${esc(initial(view.title))}</div>`;
  return `<div class="pf-avatar-wrap">${inner}</div>`;
}

function renderBadges(view) {
  if (!view.badges.length) return '';
  const items = view.badges
    .map(badge => `<span class="pf-badge pf-badge--${attr(badge.id)}">${esc(badge.label)}</span>`)
    .join('');
  return `<div class="pf-badges">${items}</div>`;
}

function renderLinks(view) {
  if (!view.links.length) return '';
  const items = view.links.map(link => {
    const host = hostOf(link.url);
    // Подпись пустая — показываем домен: кнопка без текста выглядит как баг.
    const label = link.label || host || 'Ссылка';
    return `<li><a class="pf-link" href="${attr(link.url)}" target="_blank" rel="noopener noreferrer nofollow ugc">`
      + `<span class="pf-link-ico">${iconSvg(link.icon, { size: 18 })}</span>`
      + `<span class="pf-link-copy"><span class="pf-link-label">${esc(label)}</span>`
      + (host && link.label ? `<span class="pf-link-host">${esc(host)}</span>` : '')
      + `</span><svg class="pf-link-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>`
      + `</a></li>`;
  }).join('');
  return `<ul class="pf-links">${items}</ul>`;
}

function renderStatus(view) {
  if (!view.status) return '';
  const rows = view.status.items.map(item => {
    const key = { mood: 'Настроение', status: 'Статус', listening: 'Слушаю' }[item.kind] || 'Сейчас';
    return `<div class="pf-status-item pf-status-item--${attr(item.kind)}" aria-label="${attr(key)}: ${attr(item.text)}">`
      + iconSvg(hasIcon(item.icon) ? item.icon : 'star', { size: 15 })
      + `<span>${esc(item.text)}</span></div>`;
  }).join('');
  return rows ? `<div class="pf-status" aria-label="Сейчас">${rows}</div>` : '';
}

function renderInterests(view) {
  const hobbies = view.status?.hobbies || [];
  if (!hobbies.length) return '';
  return `<section class="pf-interests" aria-label="Интересы"><h2 class="pf-section-label">Интересы</h2>`
    + `<div class="pf-tags">${hobbies.map(h => `<span class="pf-tag">${iconSvg(hasIcon(h.icon) ? h.icon : 'star', { size: 14 })}<span>${esc(h.text)}</span></span>`).join('')}</div></section>`;
}

function personAvatar(person) {
  return person.avatar
    ? `<img class="pf-person-av" src="${attr(person.avatar)}" alt="" width="40" height="40">`
    : `<div class="pf-person-av pf-avatar-fallback">${esc(initial(person.nickname || person.username))}</div>`;
}

function renderPair(view) {
  if (!view.pair) return '';
  const name = view.pair.nickname || view.pair.username;
  return `<div class="pf-people"><div class="pf-pair">`
    + `<span class="pf-pair-heart">${iconSvg('love', { size: 20 })}</span>`
    + personAvatar(view.pair)
    + `<div class="pf-pair-text"><div class="pf-pair-name">${esc(name)}</div>`
    + `<div class="pf-pair-since">${esc(view.pair.label)}</div></div>`
    + `</div></div>`;
}

function renderCloseFriends(view) {
  if (!view.closeFriends.length) return '';
  const items = view.closeFriends.map(friend => {
    const name = friend.nickname || friend.username;
    return `<div class="pf-friend">${personAvatar(friend)}<span class="pf-friend-name">${esc(name)}</span></div>`;
  }).join('');
  return `<div class="pf-people"><div class="pf-people-title">Близкие</div>`
    + `<div class="pf-friends">${items}</div></div>`;
}

function renderPlayer(view) {
  if (!view.music) return '';
  const title = view.music.title || 'Музыка профиля';
  return `<div class="pf-player" id="pf-player">`
    + `<button class="pf-player-btn" id="pf-player-btn" type="button" aria-label="Играть">`
    + `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" id="pf-player-ico">`
    + `<path d="M8 5.2v13.6L19 12z"/></svg>`
    + `</button>`
    + `<div class="pf-player-text"><div class="pf-player-title">${esc(title)}</div>`
    + (view.music.artist ? `<div class="pf-player-artist">${esc(view.music.artist)}</div>` : '')
    + `</div><span class="pf-equalizer" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`
    + `<input class="pf-player-volume" id="pf-player-volume" type="range" min="0" max="100" value="${Math.max(0, Math.min(100, Number(view.music.volume ?? 60)))}" aria-label="Громкость музыки">`
    + `<div class="pf-player-progress" aria-hidden="true"></div></div>`;
}

function renderContact(view, opts) {
  // Кнопка «Написать в Love» — воронка, ради которой всё и делается.
  // Резать её на бесплатном тарифе нельзя: именно она приводит новых людей.
  // Сначала пробуем открыть приложение сразу на профиле (love-app://user/ник,
  // см. PAGE_SCRIPT): раньше кнопка вела на главную сайта, и человек терялся.
  // href на сайт остаётся запасным путём — без JS и когда Love не установлен.
  const username = encodeURIComponent(view.username);
  return `<a class="pf-cta" href="${attr(`${opts.siteUrl}/?u=${username}`)}" data-app-link="${attr(`love-app://user/${username}`)}"`
    + ` target="_blank" rel="noopener">${iconSvg('love', { size: 15 })} Написать в Love`
    + `<span aria-hidden="true">↗</span></a>`;
}

function renderFooter(view, opts) {
  const parts = [];

  const meta = [];
  if (view.showViews && view.views > 0) meta.push(`${view.views} ${viewsWord(view.views)}`);
  if (meta.length) parts.push(`<div class="pf-meta">${meta.map(esc).join(' · ')}</div>`);

  if (view.showFooter) {
    parts.push(`<div class="pf-madein">Сделано в <a href="${attr(opts.siteUrl)}" target="_blank" rel="noopener">Love</a></div>`);
  }

  parts.push(`<button class="pf-report" id="pf-report-open" type="button">Пожаловаться</button>`);

  return `<footer class="pf-foot">${parts.join('')}</footer>`;
}

function viewsWord(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'просмотров';
  if (mod10 === 1) return 'просмотр';
  if (mod10 >= 2 && mod10 <= 4) return 'просмотра';
  return 'просмотров';
}

/**
 * Форма жалобы. Без входа: публичную страницу открывают незалогиненными, и
 * требовать регистрацию, чтобы пожаловаться, — верный способ не получить ни
 * одной жалобы (см. комментарий в models/ProfilePage).
 */
function renderReportDialog(view) {
  const reasons = [
    ['spam', 'Спам или реклама'],
    ['nsfw', 'Материалы 18+'],
    ['impersonation', 'Выдаёт себя за другого'],
    ['malware', 'Опасные ссылки'],
    ['hate', 'Оскорбления, травля'],
    ['other', 'Другое']
  ];
  const options = reasons.map(([id, label]) => `<option value="${attr(id)}">${esc(label)}</option>`).join('');
  return `<dialog class="pf-dialog" id="pf-report">
  <form id="pf-report-form">
    <h2>Пожаловаться на страницу</h2>
    <label>Причина<select name="reason">${options}</select></label>
    <label>Что не так<textarea name="note" rows="3" maxlength="400" placeholder="Необязательно"></textarea></label>
    <div class="pf-dialog-row">
      <button type="button" id="pf-report-cancel">Отмена</button>
      <button type="submit" class="pf-dialog-primary">Отправить</button>
    </div>
    <p class="pf-dialog-note" id="pf-report-note" role="status" aria-live="polite" hidden></p>
  </form>
</dialog>`;
}

const DIALOG_CSS = `
.pf-dialog{border:1px solid var(--border);border-radius:20px;padding:20px;
  background:var(--bg2);color:var(--text);max-width:min(92vw,380px);width:100%;
  font-family:var(--font)}
.pf-dialog::backdrop{background:rgba(0,0,0,.6);backdrop-filter:blur(3px)}
.pf-dialog h2{margin:0 0 14px;font-size:17px}
.pf-dialog label{display:block;font-size:13px;color:var(--muted);margin-bottom:12px}
.pf-dialog select,.pf-dialog textarea{display:block;width:100%;margin-top:6px;padding:10px 12px;
  border-radius:12px;border:1px solid var(--border);background:var(--surface);
  color:var(--text);font:inherit;font-size:14.5px;resize:vertical}
.pf-dialog-row{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
.pf-dialog-row button{padding:9px 16px;border-radius:999px;border:1px solid var(--border);
  color:var(--muted);font-size:14px}
.pf-dialog-primary{background:var(--grad);color:var(--accent-text);border-color:transparent!important;
  font-weight:600}
.pf-dialog-note{margin:12px 0 0;font-size:13px;color:var(--accent)}
.pf-dialog-note.is-error{color:var(--text)}
.pf-dialog-row button:disabled{opacity:.6;cursor:default}
`;

// ─────────────────────────────── скрипт ───────────────────────────────

/**
 * Скрипт страницы. Один, инлайновый, без зависимостей.
 *
 * Внешние библиотеки здесь были бы прямым противоречием остальным решениям:
 * любой CDN получил бы IP каждого посетителя, а именно от этого мы страницу и
 * защищаем. Всё, что делает скрипт, — экран входа, музыка, атмосферные эффекты
 * страницы и форма жалобы, — собрано в одном небольшом встроенном модуле.
 */
const PAGE_SCRIPT = `var mountProfileEffects = ${mountProfileEffects.toString()};\n` + String.raw`
(function () {
  var d = document, root = d.documentElement;
  var raw = d.getElementById('pf-data');
  var cfg = raw ? JSON.parse(raw.textContent) : {};
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── «Написать в Love»: приложение, а если его нет — сайт ──
  // Переход на love-app:// открывает установленный Love (окно страницы при
  // этом теряет фокус или прячется). Если через 1,6 с страница всё ещё на
  // экране и в фокусе — приложения нет, открываем сайт со скачиванием.
  d.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[data-app-link]');
    if (!link) return;
    event.preventDefault();
    var left = false;
    function markLeft() { left = true; }
    window.addEventListener('blur', markLeft, { once: true });
    d.addEventListener('visibilitychange', markLeft, { once: true });
    window.location.href = link.getAttribute('data-app-link');
    setTimeout(function () {
      window.removeEventListener('blur', markLeft);
      d.removeEventListener('visibilitychange', markLeft);
      if (!left && d.visibilityState === 'visible') window.open(link.href, '_blank', 'noopener');
    }, 1600);
  });

  // ── экран входа ──
  var overlay = d.getElementById('pf-enter');
  var audio = null;
  var revealed = false;
  var disposeEffects = null;
  function startEffect() {
    if (!disposeEffects) disposeEffects = mountProfileEffects(d.body, cfg.effect);
  }

  function startAudio() {
    if (!cfg.music) return;
    audio = new Audio(cfg.music.url);
    audio.loop = true;
    audio.addEventListener('play', syncPlayerIcon);
    audio.addEventListener('pause', syncPlayerIcon);
    audio.addEventListener('error', function () { if (btn) btn.setAttribute('aria-label', 'Трек недоступен'); });
    audio.volume = Math.max(0, Math.min(1, (cfg.music.volume == null ? 60 : cfg.music.volume) / 100));
    // play() возвращает промис и отклоняется, если браузер всё равно не пустил.
    // Молча гасим: страница без музыки лучше, чем ошибка в консоли посетителя.
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
    audio.addEventListener('timeupdate', function () {
      var progress = d.querySelector('.pf-player-progress');
      if (progress && audio.duration) progress.style.setProperty('--progress', (audio.currentTime / audio.duration * 100) + '%');
    });
    syncPlayerIcon();
  }

  function reveal() {
    if (revealed) return;
    revealed = true;
    d.removeEventListener('keydown', onEnterKey);
    var shell = d.querySelector('.pf-shell');
    if (shell) shell.inert = false;
    d.body.classList.remove('pf-locked');
    d.body.classList.add('pf-ready');
    if (overlay) {
      overlay.tabIndex = -1;
      overlay.classList.add('is-gone');
      setTimeout(function () { overlay.hidden = true; }, 600);
    }
    startAudio();
    startEffect();
  }

  function onEnterKey(e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(); }
  }
  if (overlay) {
    overlay.addEventListener('click', reveal, { once: true });
    d.addEventListener('keydown', onEnterKey);
  } else {
    d.body.classList.add('pf-ready');
    startEffect();
  }

  // ── плеер ──
  var btn = d.getElementById('pf-player-btn');
  var ico = d.getElementById('pf-player-ico');
  var PAUSE = '<rect x="6" y="5" width="4" height="14" rx="1.3"/><rect x="14" y="5" width="4" height="14" rx="1.3"/>';
  var PLAY = '<path d="M8 5.2v13.6L19 12z"/>';

  function syncPlayerIcon() {
    if (!audio) return;
    var playing = !audio.paused;
    if (ico) ico.innerHTML = playing ? PAUSE : PLAY;
    var player = d.querySelector('.pf-player');
    if (player) player.classList.toggle('is-playing', playing);
    if (btn) btn.setAttribute('aria-label', playing ? 'Пауза' : 'Играть');
  }

  if (btn) {
    btn.addEventListener('click', function () {
      if (!audio) { startAudio(); return; }
      if (audio.paused) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
      else { audio.pause(); }
      syncPlayerIcon();
    });
  }

  var volume = d.getElementById('pf-player-volume');
  if (volume) volume.addEventListener('input', function () { if (audio) audio.volume = Number(volume.value) / 100; });

  // Ушли со вкладки — глушим звук. Музыка с невидимой вкладки, которую человек
  // потом ищет по всем окнам, — самая раздражающая вещь на таких страницах.
  var resumeAudio = false;
  d.addEventListener('visibilitychange', function () {
    if (!audio) return;
    if (d.hidden) { resumeAudio = !audio.paused; audio.pause(); }
    else if (resumeAudio) { var p = audio.play(); if (p && p.catch) p.catch(function () {}); }
    syncPlayerIcon();
  });

  // ── жалоба ──
  var dialog = d.getElementById('pf-report');
  var open = d.getElementById('pf-report-open');
  var cancel = d.getElementById('pf-report-cancel');
  var form = d.getElementById('pf-report-form');
  var note = d.getElementById('pf-report-note');
  var submit = form ? form.querySelector('[type="submit"]') : null;
  var reportPending = false, reportSent = false, reportCloseTimer = null;

  function reportNote(text, failed) {
    if (!note) return;
    note.textContent = text;
    note.classList.toggle('is-error', failed);
    note.hidden = false;
  }

  if (open && dialog) {
    open.addEventListener('click', function () {
      clearTimeout(reportCloseTimer);
      if (!reportPending) {
        reportSent = false;
        if (note) note.hidden = true;
        if (submit) { submit.disabled = false; submit.textContent = 'Отправить'; }
      }
      if (dialog.showModal) dialog.showModal(); else dialog.setAttribute('open', '');
    });
  }
  if (cancel && dialog) cancel.addEventListener('click', function () { dialog.close(); });
  if (form) {
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (reportPending || reportSent) return;
      var body = { username: cfg.username, reason: form.reason.value, note: form.note.value };
      reportPending = true;
      if (submit) { submit.disabled = true; submit.textContent = 'Отправляем…'; }
      form.setAttribute('aria-busy', 'true');
      if (note) note.hidden = true;
      var failure = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
      try {
        var response = await fetch('/api/profile-page/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!response.ok) {
          failure = response.status === 429
            ? 'Слишком много попыток. Подождите немного и попробуйте ещё раз.'
            : 'Не удалось отправить жалобу. Попробуйте ещё раз.';
          throw new Error('Report was not accepted');
        }
        reportSent = true;
        reportNote('Спасибо, мы посмотрим.', false);
        reportCloseTimer = setTimeout(function () { if (dialog) dialog.close(); }, 1200);
      } catch (_) {
        reportNote(failure, true);
      } finally {
        reportPending = false;
        form.removeAttribute('aria-busy');
        if (submit) { submit.disabled = reportSent; submit.textContent = reportSent ? 'Отправлено' : 'Отправить'; }
      }
    });
  }
})();
`;

// ─────────────────────────────── страница ───────────────────────────────

/**
 * @param {object} view  результат profilePageView.buildView
 * @param {object} opts  { nonce, canonical, ogImageUrl, siteUrl, noindex }
 */
/**
 * Разметка внутри <body>: фон, содержимое, плеер, экран входа.
 *
 * Вынесена отдельно, потому что этим же кодом рисуется живое превью в
 * редакторе. Собирать превью отдельной функцией было бы проще ровно один день —
 * дальше две разметки начали бы расходиться, и расхождение заметил бы не автор
 * страницы, а его гости.
 *
 * Служебный диалог жалобы и скрипты сюда не входят: они нужны настоящей
 * странице, а не картинке в редакторе.
 */
function renderBody(view, opts) {
  const cinema = view.layout === 'cinema';
  const bannerHtml = view.banner && !cinema
    ? `<img class="pf-banner" src="${attr(view.banner)}" alt="" decoding="async">`
    : '';
  const backdrop = cinema && view.banner && !view.background
    ? `<div class="pf-cover-art" aria-hidden="true"><img src="${attr(view.banner)}" alt="" decoding="async"><div class="pf-cover-shade"></div></div>`
    : '';

  const overlay = view.enterOverlay
    ? `<div class="pf-enter" id="pf-enter" role="button" tabindex="0" aria-label="Войти">`
      + `<div class="pf-enter-inner"><span class="pf-enter-kicker">@${esc(view.username)}</span><div class="pf-enter-text">${esc(view.enterOverlay.text)}</div><span class="pf-enter-hint">Нажмите, чтобы открыть профиль <span aria-hidden="true">↗</span></span></div></div>`
    : '';

  return `${renderBackground(view)}${backdrop}
<div class="pf-shell pf-layout-${attr(view.layout)}"${view.enterOverlay ? ' inert' : ''}>
  <main class="pf-main${bannerHtml ? ' has-banner' : ''}">
    ${bannerHtml}
    <div class="pf-composition">
      <header class="pf-identity">
        <div class="pf-author-row">
          ${renderAvatar(view)}
          <div class="pf-title-group"><p class="pf-handle">@${esc(view.username)}</p><h1 class="pf-name">${esc(view.title)}</h1>${renderBadges(view)}</div>
        </div>
        <div class="pf-intro">
          ${view.headline ? `<p class="pf-headline">${esc(view.headline)}</p>` : ''}
          ${view.bio ? `<p class="pf-bio">${esc(view.bio)}</p>` : ''}
        </div>
        ${renderStatus(view)}
        ${renderContact(view, opts)}
      </header>
      <div class="pf-content">
        ${view.links.length ? `<section class="pf-link-section" aria-label="Ссылки"><h2 class="pf-section-label"><span>Найти меня</span><span class="pf-section-count">${view.links.length < 10 ? '0' : ''}${view.links.length}</span></h2>${renderLinks(view)}</section>` : ''}
        ${renderPlayer(view)}
        ${renderInterests(view)}
        ${renderPair(view)}
        ${renderCloseFriends(view)}
      </div>
    </div>
  </main>
  ${renderFooter(view, opts)}
</div>
${overlay}`;
}

/**
 * Кусок для живого превью в редакторе: стили под теневое дерево и та же самая
 * разметка страницы.
 *
 * `bodyClass` отдаётся отдельно, потому что классы `pf-locked` / `pf-ready`
 * переключает клик по превью — так же, как на настоящей странице это делает её
 * скрипт. Встроенный скрипт страницы в превью не запускается: редактор
 * подключает общий движок эффектов из статики и управляет плеером сам.
 */
function renderPreviewFragment(view, opts) {
  return {
    css: scopeForShadow(buildStyles(view)),
    html: renderBody(view, opts || {}),
    bodyClass: view.enterOverlay ? 'pf-locked' : 'pf-ready',
    runtime: { effect: view.effect, music: view.music ? { url: view.music.url, volume: view.music.volume } : null }
  };
}

function renderPage(view, opts) {
  const nonce = attr(opts.nonce);
  const title = `${view.title} — Love`;
  const description = truncate(view.headline || view.bio || `Профиль ${view.title} в Love`, 200);
  const ogImage = view.ogImage || opts.ogImageUrl;

  // Форма превью. Своя картинка и фирменная карточка — широкие 1200×630,
  // аватар — квадрат. Соврать здесь нельзя: если объявить квадратный аватар как
  // 1200×630, Telegram и Twitter обрежут его по бокам и в превью останется
  // полоска из середины лица. Поэтому под квадрат берётся summary без размеров.
  const wideOg = ogImage ? opts.ogImageWide !== false : false;
  const ogImageTags = ogImage
    ? [
      `<meta property="og:image" content="${attr(ogImage)}">`,
      `<meta property="og:image:alt" content="${attr(view.title)} в Love">`,
      ...(wideOg
        ? ['<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">']
        : []),
      `<meta name="twitter:card" content="${wideOg ? 'summary_large_image' : 'summary'}">`,
      `<meta name="twitter:image" content="${attr(ogImage)}">`
    ].join('\n')
    : '<meta name="twitter:card" content="summary">';

  const data = {
    username: view.username,
    effect: view.effect,
    music: view.music ? { url: view.music.url, volume: view.music.volume } : null
  };

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${attr(description)}">
${opts.noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow">'}
<link rel="canonical" href="${attr(opts.canonical)}">
<meta property="og:type" content="profile">
<meta property="og:site_name" content="Love">
<meta property="og:title" content="${attr(view.title)}">
<meta property="og:description" content="${attr(description)}">
<meta property="og:url" content="${attr(opts.canonical)}">
<meta property="profile:username" content="${attr(view.username)}">
${ogImageTags}
<meta name="twitter:title" content="${attr(view.title)}">
<meta name="twitter:description" content="${attr(description)}">
<meta name="theme-color" content="${attr(view.theme.tokens.bg)}">
<link rel="icon" href="/favicon.ico">
<style nonce="${nonce}">${buildStyles(view)}${DIALOG_CSS}</style>
</head>
<body class="${view.enterOverlay ? 'pf-locked' : ''}">
${renderBody(view, opts)}
${renderReportDialog(view)}
<script type="application/json" id="pf-data" nonce="${nonce}">${jsonForScript(data)}</script>
<script nonce="${nonce}">${PAGE_SCRIPT}</script>
</body>
</html>`;
}

/**
 * Служебная страница: страницы нет, выключена или скрыта модерацией.
 *
 * Оформлена в том же языке, что и обычная страница, и намеренно НЕ говорит,
 * существует ли такой аккаунт: «нет страницы» и «есть аккаунт, но страница
 * выключена» отвечают одинаково. Иначе публичный хост превращается в
 * инструмент проверки ников по списку.
 */
function renderNotice({ nonce, title, heading, text, siteUrl }) {
  const fallbackView = {
    theme: { id: 'midnight', tokens: require('../config/profileTiers').THEME_BY_ID.midnight.tokens, animated: false },
    layout: 'stack',
    fontStack: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    effect: 'none',
    avatarFrame: 'none',
    accent: require('../config/profileTiers').THEME_BY_ID.midnight.tokens.accent,
    accentTo: null,
    background: null
  };
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="/favicon.ico">
<style nonce="${attr(nonce)}">${buildStyles(fallbackView)}</style>
</head>
<body>
<div class="pf-bg" aria-hidden="true"><div class="pf-bg-grad"></div></div>
<div class="pf-shell">
  <div class="pf-empty">
    <h1>${esc(heading)}</h1>
    <p>${esc(text)}</p>
  </div>
  <footer class="pf-foot">
    <a class="pf-cta" href="${attr(siteUrl)}" target="_blank" rel="noopener">${iconSvg('love', { size: 16 })} Что такое Love</a>
  </footer>
</div>
</body>
</html>`;
}

module.exports = { renderPage, renderPreviewFragment, renderNotice, esc, attr, jsonForScript, hostOf };
