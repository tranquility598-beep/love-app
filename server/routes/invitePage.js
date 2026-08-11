const express = require('express');
const Server = require('../models/Server');
const { buildReleaseInfo, getBaseUrl } = require('../utils/releaseInfo');
const { isInviteCode, webInviteUrl, deepInviteUrl } = require('../utils/inviteLinks');
const { publicPageLimiter } = require('../middleware/rateLimiter');

/**
 * Страница приглашения: `GET /invite/:code`.
 *
 * Зачем сервер, а не статика сайта: превью зависит от кода. Мессенджеры и
 * соцсети тянут OpenGraph-теги сами, без исполнения JS, поэтому название
 * сферы, описание и картинку надо отдать уже в HTML. Статика на Render так
 * не умеет — отсюда серверный рендер.
 *
 * Страница живёт на том же origin, что и SPA, и это не случайность: токен
 * лежит в localStorage этого origin, поэтому кнопка «Вступить» работает
 * сразу — без отдельного логина и без передачи токена в URL.
 *
 * Всё, что попадает в HTML из базы, проходит через esc(): название и
 * описание сферы пишет пользователь.
 */

const router = express.Router();

const SITE_URL = (process.env.SITE_URL || 'https://loveapp.chat').replace(/\/+$/, '');

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

// JSON внутрь <script>. Экранируем `<`, иначе строка вида "</script>" в
// названии сферы закрыла бы тег и превратилась в разметку. U+2028/U+2029 —
// валидный JSON, но перевод строки для JS-парсера.
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

// Иконки и баннеры приходят либо абсолютным адресом Cloudinary, либо путём
// /uploads/... на нашем хосте. Всё прочее (в том числе javascript:) режем.
function safeMediaUrl(raw, baseUrl) {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/uploads/')) return `${baseUrl}${value}`;
  return '';
}

// Android содержит в UA слово Linux, iPadOS — Macintosh: порядок проверок
// важен, а точность «до устройства» тут и не нужна — это лишь подсказка,
// какой установщик показать первым. Дальше JS уточняет через userAgentData.
function detectPlatform(userAgent) {
  const ua = String(userAgent || '');
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Linux|X11/i.test(ua)) return 'linux';
  return 'unknown';
}

function membersLabel(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} участников`;
  if (mod10 === 1) return `${count} участник`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} участника`;
  return `${count} участников`;
}

// Установщики: Windows/macOS/Android отдаёт сам сервер (или внешние ссылки
// из env), для iOS и Linux сборок нет — там ведём на сайт.
function installTargets(req) {
  const { downloads } = buildReleaseInfo(req);
  return {
    windows: { href: downloads.windows.href, label: 'Скачать для Windows' },
    mac: { href: downloads.mac.href, label: 'Скачать для macOS' },
    android: { href: downloads.android.href, label: 'Скачать для Android' },
    ios: { href: `${SITE_URL}/#download`, label: 'Открыть сайт LOVE' },
    linux: { href: `${SITE_URL}/#download`, label: 'Открыть сайт LOVE' },
    unknown: { href: `${SITE_URL}/#download`, label: 'Все версии на сайте' }
  };
}

const STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; padding: 24px 16px;
    display: flex; align-items: center; justify-content: center;
    background: #050505;
    background-image: radial-gradient(80% 55% at 50% 0%, #171717 0%, #050505 70%);
    color: #f2f2f2;
    font: 400 15px/1.5 "Inter", "Segoe UI", system-ui, -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  .card {
    width: 100%; max-width: 420px; overflow: hidden;
    background: #0d0d0d; border: 1px solid rgba(255,255,255,.07);
    border-radius: 18px; box-shadow: 0 24px 60px rgba(0,0,0,.55);
  }
  .banner { display: block; width: 100%; height: 124px; object-fit: cover; background: #141414; }
  .banner-empty {
    height: 124px; display: flex; align-items: center; justify-content: center;
    font-size: 26px; color: rgba(255,255,255,.22);
    background: linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,.02));
  }
  .body { padding: 16px 18px 20px; }
  .head { display: flex; gap: 12px; align-items: center; }
  .icon, .icon-empty {
    width: 60px; height: 60px; flex: 0 0 60px; border-radius: 16px;
    object-fit: cover; background: #1b1b1b; margin-top: -34px;
    border: 3px solid #0d0d0d;
  }
  .icon-empty {
    display: flex; align-items: center; justify-content: center;
    font-weight: 900; font-size: 22px; color: #8c8c8c;
  }
  .kicker { font-size: 11px; font-weight: 800; letter-spacing: 1.4px; color: #6f6f6f; text-transform: uppercase; }
  h1 { margin: 2px 0 3px; font-size: 21px; font-weight: 900; letter-spacing: -.2px; word-break: break-word; }
  .meta { font-size: 12.5px; color: #7d7d7d; }
  .desc { margin: 14px 0 0; font-size: 13.5px; line-height: 1.55; color: #b9b9b9; word-break: break-word; }
  .actions { margin-top: 18px; display: flex; flex-direction: column; gap: 9px; }
  .btn {
    display: flex; align-items: center; justify-content: center; gap: 8px;
    height: 46px; padding: 0 16px; border: 0; border-radius: 12px;
    font: inherit; font-size: 14.5px; font-weight: 800; text-decoration: none;
    cursor: pointer; transition: transform .12s ease, opacity .12s ease, background .12s ease;
  }
  .btn:active { transform: scale(.985); }
  .btn-primary { background: #f4f4f4; color: #070707; }
  .btn-primary:hover { background: #fff; }
  .btn-ghost { background: transparent; color: #dcdcdc; border: 1px solid rgba(255,255,255,.14); }
  .btn-ghost:hover { background: rgba(255,255,255,.05); }
  .btn[disabled] { opacity: .55; cursor: default; }
  .state {
    margin-top: 14px; padding: 11px 13px; border-radius: 12px; font-size: 13px;
    background: rgba(255,255,255,.05); color: #cfcfcf;
  }
  .state.bad { background: rgba(255,255,255,.05); color: #ff9d9d; }
  .state.good { background: rgba(255,255,255,.07); color: #d8ffd8; }
  .note { margin: 16px 0 0; font-size: 11.5px; line-height: 1.5; color: #5f5f5f; text-align: center; }
  .note a { color: #9a9a9a; }
  .hidden { display: none !important; }
  .brand { margin: 18px auto 0; text-align: center; font-size: 11px; letter-spacing: 2.6px; color: #4d4d4d; font-weight: 800; }
`;

function renderPage({ title, description, ogImage, ogUrl, bodyHtml, bootstrap }) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="noindex, nofollow">
<meta name="theme-color" content="#050505">
<meta property="og:site_name" content="LOVE">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${esc(ogUrl)}">
${ogImage ? `<meta property="og:image" content="${esc(ogImage)}">\n<meta property="og:image:alt" content="${esc(title)}">` : ''}
<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}">` : ''}
<style>${STYLES}</style>
</head>
<body>
${bodyHtml}
<script>${INLINE_SCRIPT.replace('__BOOTSTRAP__', () => jsonForScript(bootstrap))}</script>
</body>
</html>`;
}

// Скрипт страницы. Живёт строкой, потому что отдавать отдельный файл ради
// сорока строк — лишний запрос; CSP приложения инлайн разрешает.
const INLINE_SCRIPT = `
(function () {
  var DATA = __BOOTSTRAP__;
  var $ = function (id) { return document.getElementById(id); };

  // Уточняем ОС на клиенте: серверу видно только UA, а он врёт (Chrome на
  // Windows 11 всё ещё пишет "Windows NT 10.0"). userAgentData точнее.
  function platform() {
    var hinted = (navigator.userAgentData && navigator.userAgentData.platform) || '';
    var ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) return 'android';
    if (/iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(hinted) && navigator.maxTouchPoints > 2)) return 'ios';
    if (/Win/i.test(hinted) || /Windows/i.test(ua)) return 'windows';
    if (/mac/i.test(hinted) || /Macintosh|Mac OS X/i.test(ua)) return 'mac';
    if (/Linux/i.test(hinted) || /Linux|X11/i.test(ua)) return 'linux';
    return 'unknown';
  }

  var install = DATA.install[platform()] || DATA.install.unknown;
  var installBtn = $('install');
  if (installBtn) {
    installBtn.href = install.href;
    installBtn.textContent = install.label;
  }

  function token() {
    try { return localStorage.getItem('token'); } catch (e) { return null; }
  }

  function setState(text, kind) {
    var box = $('state');
    if (!box) return;
    box.textContent = text;
    box.className = 'state' + (kind ? ' ' + kind : '');
    box.classList.remove('hidden');
  }

  // Открыть приложение = уйти на love-app://. Браузер не сообщает, получилось
  // ли: если схему никто не обслуживает, страница просто остаётся на месте.
  // Поэтому ставим таймер и, если через 1.8 с мы всё ещё видимы, честно
  // говорим, что приложения нет, и показываем установщик.
  var openBtn = $('open');
  if (openBtn && DATA.deepLink) {
    openBtn.addEventListener('click', function () {
      var timer = setTimeout(function () {
        if (document.visibilityState === 'visible') {
          setState('Похоже, LOVE не установлен на этом устройстве — установи и открой ссылку снова.');
          var block = $('install-block');
          if (block) block.classList.remove('hidden');
        }
      }, 1800);
      var cancel = function () { clearTimeout(timer); };
      window.addEventListener('blur', cancel, { once: true });
      window.addEventListener('pagehide', cancel, { once: true });
      document.addEventListener('visibilitychange', cancel, { once: true });
      window.location.href = DATA.deepLink;
    });
  }

  var joinBtn = $('join');
  if (joinBtn && DATA.code) {
    // Не залогинен в браузере — сначала SPA: она подхватит ?invite= и вступит
    // сразу после входа.
    if (!token()) {
      joinBtn.textContent = 'Войти и вступить';
      joinBtn.addEventListener('click', function () {
        window.location.href = '/?invite=' + encodeURIComponent(DATA.code);
      });
    } else {
      joinBtn.addEventListener('click', function () {
        joinBtn.disabled = true;
        joinBtn.textContent = 'Вступаем…';
        fetch('/api/servers/join/' + encodeURIComponent(DATA.code), {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token() }
        }).then(function (res) {
          return res.json().catch(function () { return {}; }).then(function (body) {
            return { status: res.status, ok: res.ok, body: body };
          });
        }).then(function (res) {
          if (res.ok) {
            setState('Готово — вы участник «' + DATA.name + '». Откройте LOVE.', 'good');
            joinBtn.classList.add('hidden');
            return;
          }
          if (res.status === 401) {
            window.location.href = '/?invite=' + encodeURIComponent(DATA.code);
            return;
          }
          var message = res.body && res.body.message ? String(res.body.message) : '';
          if (/уже являетесь/i.test(message)) {
            setState('Вы уже участник этой сферы.', 'good');
            joinBtn.classList.add('hidden');
            return;
          }
          setState(message || 'Не удалось вступить. Попробуйте позже.', 'bad');
          joinBtn.disabled = false;
          joinBtn.textContent = 'Вступить';
        }).catch(function () {
          setState('Нет связи с сервером. Проверьте интернет.', 'bad');
          joinBtn.disabled = false;
          joinBtn.textContent = 'Вступить';
        });
      });
    }
  }
})();
`;

router.get('/:code', publicPageLimiter, async (req, res) => {
  const rawCode = String(req.params.code || '').trim();
  const baseUrl = getBaseUrl(req);
  const install = installTargets(req);
  const platform = detectPlatform(req.headers['user-agent']);

  res.set('X-Robots-Tag', 'noindex, nofollow');
  res.set('Cache-Control', 'public, max-age=60');
  res.type('html');

  const notFound = (message) => {
    const bodyHtml = `<main class="card">
  <div class="banner-empty">♡</div>
  <div class="body">
    <div class="kicker">Приглашение</div>
    <h1>Ссылка не работает</h1>
    <p class="desc">${esc(message)}</p>
    <div class="actions">
      <a class="btn btn-primary" id="install" href="${esc(install[platform].href)}">${esc(install[platform].label)}</a>
      <a class="btn btn-ghost" href="${esc(SITE_URL)}">О LOVE</a>
    </div>
    <p class="note">Попроси новую ссылку — старую можно было обновить или отозвать.</p>
  </div>
</main>
<div class="brand">LOVE</div>`;

    return res.status(404).send(renderPage({
      title: 'Приглашение LOVE не найдено',
      description: 'Ссылка-приглашение недействительна или была обновлена.',
      ogImage: '',
      ogUrl: webInviteUrl(req, rawCode),
      bodyHtml,
      bootstrap: { code: '', name: '', deepLink: '', install }
    }));
  };

  if (!isInviteCode(rawCode)) {
    return notFound('Такого приглашения не существует: код в ссылке неполный или испорчен.');
  }

  try {
    const server = await Server.findOne({ 'invites.code': rawCode })
      .select('name description icon banner settings members')
      .lean();

    if (!server) {
      return notFound('Приглашение не найдено или истекло.');
    }

    const kind = (server.settings && server.settings.kind) || 'guild';
    const kindLabel = kind === 'room' ? 'Комната' : 'Сфера';
    const name = String(server.name || 'Сфера LOVE');
    const description = String(server.description || '');
    const memberCount = Array.isArray(server.members) ? server.members.length : 0;
    const icon = safeMediaUrl(server.icon, baseUrl);
    const banner = safeMediaUrl(server.banner, baseUrl);

    const ogDescription = description
      ? `${description.slice(0, 160)}`
      : `${kindLabel} в LOVE · ${membersLabel(memberCount)}. Присоединяйся по приглашению.`;

    const bodyHtml = `<main class="card">
  ${banner
    ? `<img class="banner" src="${esc(banner)}" alt="">`
    : '<div class="banner-empty">♡</div>'}
  <div class="body">
    <div class="head">
      ${icon
        ? `<img class="icon" src="${esc(icon)}" alt="">`
        : `<div class="icon-empty">${esc(name.trim().charAt(0).toUpperCase() || 'L')}</div>`}
      <div>
        <div class="kicker">Приглашение в LOVE</div>
        <h1>${esc(name)}</h1>
        <div class="meta">${esc(kindLabel)} · ${esc(membersLabel(memberCount))}</div>
      </div>
    </div>
    ${description ? `<p class="desc">${esc(description)}</p>` : ''}
    <div class="actions">
      <button class="btn btn-primary" id="join" type="button">Вступить</button>
      <button class="btn btn-ghost" id="open" type="button">Открыть в приложении</button>
    </div>
    <div class="state hidden" id="state"></div>
    <div class="actions hidden" id="install-block">
      <a class="btn btn-ghost" id="install" href="${esc(install[platform].href)}">${esc(install[platform].label)}</a>
    </div>
    <p class="note">Нет LOVE на этом устройстве? <a href="${esc(SITE_URL)}/#download">Скачай для своей системы</a> — Windows, macOS и Android.</p>
  </div>
</main>
<div class="brand">LOVE</div>`;

    return res.send(renderPage({
      title: `${name} · приглашение в LOVE`,
      description: ogDescription,
      ogImage: banner || icon,
      ogUrl: webInviteUrl(req, rawCode),
      bodyHtml,
      bootstrap: {
        code: rawCode,
        name,
        deepLink: deepInviteUrl(rawCode),
        install
      }
    }));
  } catch (error) {
    console.error('Invite page error:', error);
    return notFound('Сервер не смог проверить приглашение. Попробуй ещё раз через минуту.');
  }
});

module.exports = router;
