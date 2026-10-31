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
const { BLOCK_IDS } = require('../config/profileTiers');
const { placeCells } = require('./profileCustomLayout');
const { compactCount } = require('./profileHearts');
const { hexRgb, luminance } = require('./profileColor');

const luminanceOf = hex => { const rgb = hexRgb(hex); return rgb ? luminance(rgb) : 0; };

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
  if (view.bgPattern) layers.push('<div class="pf-bg-pattern"></div>');

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
    return `<li><a class="pf-link" href="${attr(link.url)}" data-i="${Number(link.index) || 0}" target="_blank" rel="noopener noreferrer nofollow ugc">`
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
  // Свои теги страницы, если их задали, — иначе увлечения из профиля Love
  // (они видны вместе с блоком статуса, как раньше).
  const tags = view.tags || [];
  const hobbies = tags.length ? [] : (view.status?.hobbies || []);
  if (!tags.length && !hobbies.length) return '';
  const chips = tags.length
    ? tags.map(tag => `<span class="pf-tag"><span>${esc(tag)}</span></span>`)
    : hobbies.map(h => `<span class="pf-tag">${iconSvg(hasIcon(h.icon) ? h.icon : 'star', { size: 14 })}<span>${esc(h.text)}</span></span>`);
  return `<section class="pf-interests" aria-label="Интересы"><h2 class="pf-section-label">Интересы</h2>`
    + `<div class="pf-tags">${chips.join('')}</div></section>`;
}

function renderGallery(view) {
  const shots = view.gallery || [];
  if (!shots.length) return '';
  const items = shots.map((url, index) => `<a class="pf-shot" href="${attr(url)}" target="_blank" rel="noopener" aria-label="Фото ${index + 1}">`
    + `<img src="${attr(url)}" alt="" loading="lazy" decoding="async"></a>`).join('');
  return `<section class="pf-gallery" aria-label="Галерея"><h2 class="pf-section-label"><span>Галерея</span>`
    + `<span class="pf-section-count">${shots.length < 10 ? '0' : ''}${shots.length}</span></h2>`
    + `<div class="pf-gallery-grid">${items}</div></section>`;
}

function membersWord(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return 'участников';
  if (mod10 === 1) return 'участник';
  if (mod10 >= 2 && mod10 <= 4) return 'участника';
  return 'участников';
}

function renderInvite(view) {
  const invite = view.invite;
  if (!invite) return '';
  const icon = invite.icon
    ? `<img src="${attr(invite.icon)}" alt="" width="48" height="48">`
    : esc(initial(invite.name));
  const kicker = invite.kind === 'room' ? 'Комната в Love' : 'Сфера в Love';
  return `<a class="pf-invite pf-block" href="${attr(invite.url)}" target="_blank" rel="noopener">`
    + `<span class="pf-invite-icon" aria-hidden="true">${icon}</span>`
    + `<span class="pf-invite-copy"><span class="pf-invite-kicker">${esc(kicker)}</span>`
    + `<span class="pf-invite-name">${esc(invite.name)}</span>`
    + `<span class="pf-invite-meta">${esc(`${invite.members} ${membersWord(invite.members)}`)}</span></span>`
    + `<span class="pf-invite-cta">Вступить</span></a>`;
}

function renderQuote(view) {
  if (!view.quote) return '';
  return `<figure class="pf-quote"><blockquote>${esc(view.quote.text)}</blockquote>`
    + (view.quote.author ? `<figcaption>— ${esc(view.quote.author)}</figcaption>` : '')
    + `</figure>`;
}

/**
 * Таймер обратного отсчёта. Цифры считаются здесь же, на сервере: превью в
 * редакторе и страница без JS показывают верное значение на момент открытия,
 * а скрипт страницы дальше просто тикает.
 */
function countdownParts(at, now = Date.now()) {
  const left = Math.max(0, new Date(at).getTime() - now);
  const total = Math.floor(left / 1000);
  return {
    done: left <= 0,
    d: Math.floor(total / 86400),
    h: Math.floor(total / 3600) % 24,
    m: Math.floor(total / 60) % 60,
    s: total % 60
  };
}

function renderCountdown(view) {
  if (!view.countdown) return '';
  const parts = countdownParts(view.countdown.at);
  const two = value => String(value).padStart(2, '0');
  const unit = (key, value, label) => `<span class="pf-cd-unit"><b data-u="${key}">${key === 'd' ? value : two(value)}</b><i>${label}</i></span>`;
  return `<section class="pf-countdown pf-block" data-at="${attr(view.countdown.at)}" aria-label="Таймер">`
    + (view.countdown.title ? `<div class="pf-countdown-title">${esc(view.countdown.title)}</div>` : '')
    + `<div class="pf-countdown-units"${parts.done ? ' hidden' : ''}>${unit('d', parts.d, 'дн')}${unit('h', parts.h, 'ч')}${unit('m', parts.m, 'мин')}${unit('s', parts.s, 'сек')}</div>`
    + `<div class="pf-countdown-done"${parts.done ? '' : ' hidden'}>Уже началось</div></section>`;
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
  const many = (view.music.tracks || []).length > 1;
  const skip = (id, label, d) => `<button class="pf-player-skip" id="${id}" type="button" aria-label="${label}">`
    + `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg></button>`;
  return `<div class="pf-player${many ? ' has-tracks' : ''}" id="pf-player">`
    + (many ? skip('pf-player-prev', 'Предыдущий трек', 'M7 6h2v12H7zM20 6v12l-9-6z') : '')
    + `<button class="pf-player-btn" id="pf-player-btn" type="button" aria-label="Играть">`
    + `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" id="pf-player-ico">`
    + `<path d="M8 5.2v13.6L19 12z"/></svg>`
    + `</button>`
    + (many ? skip('pf-player-next', 'Следующий трек', 'M15 6h2v12h-2zM4 6v12l9-6z') : '')
    + `<div class="pf-player-text"><div class="pf-player-title" id="pf-player-title">${esc(title)}</div>`
    + `<div class="pf-player-artist" id="pf-player-artist"${view.music.artist ? '' : ' hidden'}>${esc(view.music.artist || '')}</div>`
    + (many ? `<div class="pf-player-count" id="pf-player-count">1 / ${view.music.tracks.length}</div>` : '')
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

/**
 * Сердечко посетителей рядом с «Написать в Love». Токен выдаёт роут при
 * показе страницы (utils/profileHearts); в превью редактора его нет, и кнопка
 * там только показывает, как будет выглядеть.
 */
function renderHeart(view, opts) {
  if (!view.hearts) return '';
  const count = view.hearts.count;
  return `<button class="pf-heart" id="pf-heart" type="button" aria-pressed="false" aria-label="Нравится: ${count}"`
    + ` data-count="${count}"${opts.heartToken ? ` data-token="${attr(opts.heartToken)}"` : ''}>`
    + `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.4s-7.6-4.6-7.6-10.4A4.3 4.3 0 0 1 12 7.5a4.3 4.3 0 0 1 7.6 2.5c0 5.8-7.6 10.4-7.6 10.4z"/></svg>`
    + `<span class="pf-heart-count" id="pf-heart-count">${esc(compactCount(count))}</span>`
    + `<span class="pf-heart-burst" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span></button>`;
}

function renderActions(view, opts) {
  // Без сердечка разметка шапки прежняя — у страниц, где его не включали,
  // не меняется даже отступ.
  if (!view.hearts) return renderContact(view, opts);
  return `<div class="pf-actions">${renderContact(view, opts)}${renderHeart(view, opts)}</div>`;
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

function renderLightbox(view) {
  if (!(view.gallery || []).length) return '';
  return `<dialog class="pf-lightbox" id="pf-lightbox" aria-label="Фото">`
    + `<img id="pf-lightbox-img" alt="">`
    + `<button class="pf-lightbox-close" id="pf-lightbox-close" type="button" aria-label="Закрыть">×</button></dialog>`;
}

const DIALOG_CSS = `
.pf-dialog{border:1px solid var(--border);border-radius:20px;padding:20px;
  background:var(--bg2);color:var(--text);max-width:min(92vw,380px);width:100%;
  font-family:var(--font);color-scheme:var(--scheme,dark)}
.pf-dialog::backdrop{background:rgba(0,0,0,.6);backdrop-filter:blur(3px)}
.pf-dialog h2{margin:0 0 14px;font-size:17px}
.pf-dialog label{display:block;font-size:13px;color:var(--muted);margin-bottom:12px}
.pf-dialog select,.pf-dialog textarea{display:block;width:100%;margin-top:6px;padding:10px 12px;
  border-radius:12px;border:1px solid var(--border);background:var(--surface);
  color:var(--text);font:inherit;font-size:14.5px;resize:vertical}
.pf-dialog option{background-color:var(--bg2);color:var(--text)}
/* Общая обводка фокуса страницы (2px с отступом 4px) у полей окна выглядела
   толстой рамкой, отстающей от поля; у select Chrome показывает её и на клик. */
.pf-dialog select:focus-visible,.pf-dialog textarea:focus-visible{outline:none;
  border-color:color-mix(in srgb,var(--accent) 70%,var(--border));
  box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 22%,transparent)}
.pf-dialog-row{display:flex;gap:8px;justify-content:flex-end;margin-top:4px}
.pf-dialog-row button{padding:9px 16px;border-radius:999px;border:1px solid var(--border);
  color:var(--muted);font-size:14px}
/* .pf-dialog-row button задаёт серый текст и перебивал одиночный класс —
   «Отправить» сливался с градиентом. */
.pf-dialog-row .pf-dialog-primary{background:var(--grad);background-origin:border-box;
  color:var(--accent-text);border-color:transparent!important;font-weight:600}
.pf-dialog-note{margin:12px 0 0;font-size:13px;color:var(--accent)}
.pf-dialog-note.is-error{color:var(--text)}
.pf-dialog-row button:disabled{opacity:.6;cursor:default}
.pf-lightbox{padding:0;border:0;background:transparent;max-width:min(94vw,1100px);max-height:92vh;overflow:visible}
.pf-lightbox::backdrop{background:rgba(0,0,0,.84);backdrop-filter:blur(4px)}
.pf-lightbox img{display:block;max-width:min(94vw,1100px);max-height:88vh;border-radius:14px;object-fit:contain}
.pf-lightbox-close{position:fixed;top:16px;right:16px;display:grid;place-items:center;width:40px;height:40px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;font-size:22px;line-height:1}
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
    // Для аналитики владельца: сколько гостей решились написать.
    try {
      if (window.fetch) fetch('/api/profile-page/click', {
        method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cfg.username, kind: 'cta' })
      }).catch(function () {});
    } catch (_) {}
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

  // ── нажатия ссылок ──
  // Считаем на сервере, без своих идентификаторов: номер ссылки и адрес,
  // который сервер сверит с сохранённым. Ответ не ждём — переход не тормозим.
  d.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a.pf-link[data-i]');
    if (!link || !cfg.username || !window.fetch) return;
    try {
      fetch('/api/profile-page/click', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cfg.username, index: Number(link.getAttribute('data-i')), url: link.href })
      }).catch(function () {});
    } catch (_) {}
  });

  // ── таймер ──
  var countdowns = d.querySelectorAll('.pf-countdown[data-at]');
  function tickCountdowns() {
    var running = false;
    for (var i = 0; i < countdowns.length; i++) {
      var box = countdowns[i];
      var left = Math.max(0, new Date(box.getAttribute('data-at')).getTime() - Date.now());
      var total = Math.floor(left / 1000);
      var values = { d: Math.floor(total / 86400), h: Math.floor(total / 3600) % 24, m: Math.floor(total / 60) % 60, s: total % 60 };
      for (var key in values) {
        var cell = box.querySelector('[data-u="' + key + '"]');
        if (cell) cell.textContent = key === 'd' ? String(values[key]) : (values[key] < 10 ? '0' : '') + values[key];
      }
      var units = box.querySelector('.pf-countdown-units');
      var done = box.querySelector('.pf-countdown-done');
      if (units) units.hidden = left <= 0;
      if (done) done.hidden = left > 0;
      if (left > 0) running = true;
    }
    if (running) setTimeout(tickCountdowns, 1000 - (Date.now() % 1000));
  }
  if (countdowns.length) tickCountdowns();

  // ── фото галереи ──
  var lightbox = d.getElementById('pf-lightbox');
  var lightboxImg = d.getElementById('pf-lightbox-img');
  if (lightbox && lightbox.showModal && lightboxImg) {
    d.addEventListener('click', function (event) {
      var shot = event.target.closest && event.target.closest('a.pf-shot');
      if (!shot) return;
      event.preventDefault();
      lightboxImg.src = shot.getAttribute('href');
      lightbox.showModal();
    });
    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox || event.target.id === 'pf-lightbox-close') lightbox.close();
    });
  }

  // ── сердечко ──
  // Сразу отвечаем на нажатие (и откатываем, если сервер не принял). Что
  // посетитель уже нажимал, помним в localStorage; сервер всё равно считает
  // одно сердечко на посетителя, даже если localStorage очистили.
  var heart = d.getElementById('pf-heart');
  if (heart && heart.getAttribute('data-token') && window.fetch) {
    var heartStore = 'pf-heart:' + cfg.username;
    var heartCount = Number(heart.getAttribute('data-count')) || 0;
    var heartLiked = false, heartBusy = false;
    var heartLabel = d.getElementById('pf-heart-count');
    try { heartLiked = window.localStorage.getItem(heartStore) === '1'; } catch (_) {}
    var compact = function (n) {
      if (n < 1000) return String(n);
      if (n < 1e6) return (n / 1000).toFixed(n < 1e4 ? 1 : 0).replace('.0', '').replace('.', ',') + ' тыс.';
      return (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + ' млн';
    };
    var paintHeart = function () {
      heart.setAttribute('aria-pressed', heartLiked ? 'true' : 'false');
      heart.setAttribute('aria-label', (heartLiked ? 'Вам нравится' : 'Нравится') + ': ' + heartCount);
      if (heartLabel) heartLabel.textContent = compact(heartCount);
    };
    var rememberHeart = function () {
      try { if (heartLiked) window.localStorage.setItem(heartStore, '1'); else window.localStorage.removeItem(heartStore); } catch (_) {}
    };
    paintHeart();
    heart.addEventListener('click', function () {
      if (heartBusy) return;
      heartBusy = true;
      var next = !heartLiked;
      var before = { liked: heartLiked, count: heartCount };
      heartLiked = next;
      heartCount = Math.max(0, heartCount + (next ? 1 : -1));
      paintHeart();
      if (next) { heart.classList.remove('is-pop'); void heart.offsetWidth; heart.classList.add('is-pop'); }
      fetch('/api/profile-page/heart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: cfg.username, token: heart.getAttribute('data-token'), action: next ? 'like' : 'unlike' })
      }).then(function (response) { return response.ok ? response.json() : null; })
        .then(function (data) {
          if (data && typeof data.count === 'number') { heartCount = data.count; heartLiked = Boolean(data.liked); }
          else { heartLiked = before.liked; heartCount = before.count; }
        })
        .catch(function () { heartLiked = before.liked; heartCount = before.count; })
        .then(function () { heartBusy = false; paintHeart(); rememberHeart(); });
    });
  }

  // ── экран входа ──
  var overlay = d.getElementById('pf-enter');
  var audio = null;
  var revealed = false;
  var disposeEffects = null;
  function startEffect() {
    if (disposeEffects) return;
    var list = [].concat(cfg.effect || []).filter(function (id) { return id && id !== 'none'; });
    // Тема по времени суток: ночью на странице звёзды.
    if (cfg.nightStars && root.classList.contains('pf-night') && list.indexOf('stars') < 0) list.push('stars');
    disposeEffects = mountProfileEffects(d.body, list);
  }

  var tracks = cfg.music && cfg.music.tracks && cfg.music.tracks.length > 1 ? cfg.music.tracks : null;
  var trackIndex = 0;
  function showTrack() {
    if (!tracks) return;
    var track = tracks[trackIndex];
    var title = d.getElementById('pf-player-title'), artist = d.getElementById('pf-player-artist'), count = d.getElementById('pf-player-count');
    if (title) title.textContent = track.title || 'Музыка профиля';
    if (artist) { artist.textContent = track.artist || ''; artist.hidden = !track.artist; }
    if (count) count.textContent = (trackIndex + 1) + ' / ' + tracks.length;
  }
  function playTrack(index) {
    if (!tracks) return;
    trackIndex = (index + tracks.length) % tracks.length;
    showTrack();
    if (!audio) { startAudio(); return; }
    audio.src = tracks[trackIndex].url;
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
  }

  function startAudio() {
    if (!cfg.music) return;
    audio = new Audio(tracks ? tracks[trackIndex].url : cfg.music.url);
    // Один трек играет по кругу, плейлист — по порядку и с начала.
    audio.loop = !tracks;
    audio.addEventListener('ended', function () { if (tracks) playTrack(trackIndex + 1); });
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

  var prev = d.getElementById('pf-player-prev'), next = d.getElementById('pf-player-next');
  if (prev) prev.addEventListener('click', function () { playTrack(trackIndex - 1); });
  if (next) next.addEventListener('click', function () { playTrack(trackIndex + 1); });

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

  // ── наклон аватара ──
  // Углы — переменные CSS (--tilt-x/--tilt-y), сама анимация — в стилях.
  // На телефоне — от наклона устройства; iOS спрашивает разрешение по касанию.
  var tiltWrap = cfg.tilt && !calm ? d.querySelector('.pf-avatar-wrap') : null;
  if (tiltWrap) {
    var clampTilt = function (v, max) { return Math.max(-max, Math.min(max, v)); };
    var setTilt = function (rx, ry) {
      tiltWrap.style.setProperty('--tilt-x', rx.toFixed(2) + 'deg');
      tiltWrap.style.setProperty('--tilt-y', ry.toFixed(2) + 'deg');
    };
    window.addEventListener('pointermove', function (event) {
      if (event.pointerType === 'touch') return;
      var box = tiltWrap.getBoundingClientRect();
      var dx = (event.clientX - (box.left + box.width / 2)) / Math.max(1, window.innerWidth);
      var dy = (event.clientY - (box.top + box.height / 2)) / Math.max(1, window.innerHeight);
      setTilt(clampTilt(-dy * 32, 14), clampTilt(dx * 32, 14));
    }, { passive: true });
    root.addEventListener('pointerleave', function () { setTilt(0, 0); });
    var onOrient = function (event) {
      if (event.beta == null || event.gamma == null) return;
      setTilt(clampTilt((event.beta - 40) * .35, 12), clampTilt(event.gamma * .4, 12));
    };
    var DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') {
      d.addEventListener('click', function askTilt() {
        d.removeEventListener('click', askTilt);
        DOE.requestPermission().then(function (state) { if (state === 'granted') window.addEventListener('deviceorientation', onOrient); }).catch(function () {});
      });
    } else if (DOE) {
      window.addEventListener('deviceorientation', onOrient, { passive: true });
    }
  }

  // ── звуки ──
  // Тихий отклик из наших записанных звуков. Браузер не даст играть до первого
  // жеста, поэтому звучит только после первого нажатия (экран входа — тоже оно).
  if (cfg.sounds && window.Audio) {
    var soundsOn = false, lastHover = 0, bank = {};
    var playSound = function (name, volume) {
      if (!soundsOn) return;
      var base = bank[name] || (bank[name] = new Audio('/build/sounds/' + name + '.ogg'));
      try {
        var copy = base.cloneNode();
        copy.volume = volume;
        var p = copy.play();
        if (p && p.catch) p.catch(function () {});
      } catch (_) {}
    };
    d.addEventListener('pointerdown', function () { soundsOn = true; }, { passive: true });
    d.addEventListener('pointerover', function (event) {
      if (event.pointerType === 'touch') return;
      var target = event.target.closest && event.target.closest('a,button');
      if (!target || (event.relatedTarget && target.contains(event.relatedTarget))) return;
      var now = Date.now();
      if (now - lastHover < 90) return;
      lastHover = now;
      playSound('hover', .16);
    });
    d.addEventListener('click', function (event) {
      var target = event.target.closest && event.target.closest('a,button,[role="button"]');
      if (target) playSound(target.id === 'pf-heart' ? 'heart' : 'tap', .3);
    }, true);
  }

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
/**
 * Части страницы для своей расстановки — каждая отдельной клеткой. Пустые
 * (нет статуса, нет галереи) не попадают: от них не должно оставаться дыр.
 * Считается один раз до стилей: месту клетки нужны и стили, и разметка.
 */
function prepareCustom(view, opts) {
  if (!view.customCells) return null;
  if (view.customParts) return view.customParts;
  const intro = (view.headline ? `<p class="pf-headline">${esc(view.headline)}</p>` : '')
    + (view.bio ? `<p class="pf-bio">${esc(view.bio)}</p>` : '');
  const html = {
    avatar: renderAvatar(view),
    name: `<div class="pf-title-group"><p class="pf-handle">@${esc(view.username)}</p><h1 class="pf-name">${esc(view.title)}</h1>${renderBadges(view)}</div>`,
    intro: intro ? `<div class="pf-intro">${intro}</div>` : '',
    status: renderStatus(view),
    actions: renderActions(view, opts || {})
  };
  for (const id of view.blocks || BLOCK_IDS) {
    if (BLOCK_RENDERERS[id]) html[id] = BLOCK_RENDERERS[id](view);
  }
  const present = Object.keys(html).filter(id => String(html[id] || '').trim());
  view.customPlaced = placeCells(view.customCells, present);
  view.customPhonePlaced = view.customPhone ? placeCells(view.customPhone, present) : null;
  view.customParts = html;
  return html;
}

/** Пометить корень блока: по этой метке редактор своей расстановки находит его на странице. */
function markBlock(html, id) {
  return html ? String(html).replace(/^(\s*<[a-z]+)/i, `$1 data-block="${id}"`) : '';
}

function renderCanvas(view) {
  // Порядок в разметке — сверху вниз, слева направо: так клетки встают на
  // телефоне и так их читает экранный диктор.
  return [...view.customPlaced]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(cell => `<div class="pf-cell pf-cell-${cell.id}" data-cell="${cell.id}">${view.customParts[cell.id]}</div>`)
    .join('\n      ');
}

function renderBody(view, opts) {
  const custom = prepareCustom(view, opts);
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
<div class="pf-shell pf-layout-${attr(view.layout)}${custom ? ' pf-layout-custom' : ''}"${view.enterOverlay ? ' inert' : ''}>
  <main class="pf-main${bannerHtml ? ' has-banner' : ''}">
    ${bannerHtml}
    ${custom ? `<div class="pf-canvas">
      ${renderCanvas(view)}
    </div>` : `<div class="pf-composition">
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
        ${renderActions(view, opts)}
      </header>
      <div class="pf-content">
        ${(view.blocks || BLOCK_IDS).map(id => markBlock(BLOCK_RENDERERS[id] ? BLOCK_RENDERERS[id](view) : '', id)).filter(Boolean).join('\n        ')}
      </div>
    </div>`}
  </main>
  ${renderFooter(view, opts)}
</div>
${overlay}`;
}

function renderLinkSection(view) {
  if (!view.links.length) return '';
  return `<section class="pf-link-section" aria-label="Ссылки"><h2 class="pf-section-label"><span>Найти меня</span>`
    + `<span class="pf-section-count">${view.links.length < 10 ? '0' : ''}${view.links.length}</span></h2>${renderLinks(view)}</section>`;
}

// Порядок задаёт view.blocks (style.blockOrder без скрытых). Пустой блок
// возвращает '', и в разметке от него не остаётся даже пустой строки.
const BLOCK_RENDERERS = {
  links: renderLinkSection,
  player: renderPlayer,
  gallery: renderGallery,
  invite: renderInvite,
  interests: renderInterests,
  quote: renderQuote,
  countdown: renderCountdown,
  pair: renderPair,
  friends: renderCloseFriends
};

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
  prepareCustom(view, opts || {});
  return {
    css: scopeForShadow(buildStyles(view)),
    html: renderBody(view, opts || {}),
    bodyClass: view.enterOverlay ? 'pf-locked' : 'pf-ready',
    runtime: {
      effect: view.effect,
      effects: [...(view.effects || (view.effect && view.effect !== 'none' ? [view.effect] : [])), ...(view.liveBg ? [view.liveBg] : [])],
      tilt: Boolean(view.style && view.style.avatarTilt),
      sounds: Boolean(view.style && view.style.sounds),
      music: view.music ? { url: view.music.url, volume: view.music.volume, tracks: view.music.tracks || [] } : null
    }
  };
}

function renderPage(view, opts) {
  prepareCustom(view, opts);
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
    // Движок принимает и один id, и список — несколько эффектов сразу.
    // Живой фон — тот же движок, просто рисует под всем остальным.
    effect: [...(view.effects && view.effects.length ? view.effects : [view.effect]), ...(view.liveBg ? [view.liveBg] : [])],
    nightStars: view.themeMode === 'time',
    tilt: Boolean(view.style && view.style.avatarTilt),
    sounds: Boolean(view.style && view.style.sounds),
    music: view.music ? { url: view.music.url, volume: view.music.volume, tracks: view.music.tracks || [] } : null
  };

  // Тема по времени суток решается до первой отрисовки, иначе страница
  // мигнула бы дневной палитрой ночью. Час — по часам гостя.
  const altDark = view.altTheme ? luminanceOf(view.altTheme.tokens.bg) <= 0.4 : false;
  const timeScript = view.themeMode === 'time'
    ? `<script nonce="${nonce}">(function(){var h=new Date().getHours(),n=h>=20||h<6,r=document.documentElement;if(n)r.classList.add('pf-night');if(n===${altDark})r.classList.add('pf-alt');})();</script>`
    : '';

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
${timeScript}
</head>
<body class="${view.enterOverlay ? 'pf-locked' : ''}">
${renderBody(view, opts)}
${renderReportDialog(view)}
${renderLightbox(view)}
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

module.exports = { renderPage, renderPreviewFragment, renderNotice, esc, attr, jsonForScript, hostOf, countdownParts };
