/**
 * CSS публичной страницы профиля.
 *
 * Собирается на сервере под конкретную страницу и уезжает одним inline-<style>
 * с nonce. Почему не отдельный .css-файл: набор правил зависит от темы,
 * раскладки, рамки и эффекта, то есть кэшировать общий файл всё равно нельзя,
 * а лишний запрос замедлил бы первый кадр — а первый кадр здесь и есть продукт.
 *
 * Внешних шрифтов не подключаем НИ ОДНОГО, даже с Google Fonts. Каждый такой
 * запрос сообщает чужому серверу IP всех, кто открыл страницу, — то же самое,
 * из-за чего мы не пускаем чужие картинки. Outfit, Lora, Fira Mono и
 * Cormorant загружаются из собственных статических файлов Love.
 * Выбранный шрифт применяется к имени и экрану входа, интерфейсный текст
 * использует единый читаемый стек с поддержкой кириллицы.
 *
 * Пользовательских значений здесь ровно два вида: токены выбранной темы и
 * акцент в hex (проверен регуляркой в роуте). Ни строчки CSS от пользователя.
 */

const ACCENT_FALLBACK = '#e4e7eb';

/** Значение для CSS. Обрезаем кавычки, скобки и точку с запятой, чтобы даже при ошибке
 * валидации выше нельзя было закрыть свойство и дописать своё. */
function cssSafe(value, fallback = '') {
  const str = String(value == null ? '' : value);
  if (/[;{}<>"'\\]/.test(str)) return fallback;
  return str;
}

/**
 * Значение для font-family.
 *
 * Отдельно от cssSafe, и это не послабление. В CSS название семейства из
 * нескольких слов ОБЯЗАНО быть в кавычках: "Segoe UI", "Nunito". cssSafe
 * режет кавычки — и глушил все четыре стека из каталога, включая системный,
 * подставляя вместо них голый system-ui. То есть выбор шрифта (платная
 * возможность) не доезжал до страницы вообще, молча.
 *
 * Пускать кавычки здесь можно потому, что значение никогда не приходит от
 * пользователя: FONTS в config/profileTiers отдаёт стек по id, а id проверен
 * при сохранении. Плюс сама проверка ниже оставляет только буквы, цифры,
 * пробелы, дефисы, точки, запятые и кавычки — ни точки с запятой, ни фигурной
 * скобки, то есть закрыть свойство и дописать своё правило нечем даже при
 * незакрытой кавычке.
 */
function cssFontStack(value, fallback) {
  const str = String(value == null ? '' : value).trim();
  if (!str || !/^[A-Za-z0-9 ",.\-]+$/.test(str)) return fallback;
  return str;
}

// Контраст по WCAG. Цвет текста на кнопках темы подобран под её родной
// акцент, а человек может выбрать свои два цвета градиента (например белый →
// фиолетовый): тогда тёмный текст темы терялся на фиолетовой половине.
// Сами расчёты живут в profileColor — ими же пользуется конструктор темы.
const { hexRgb, luminance, readableOnGradient } = require('./profileColor');

function themeVars(view) {
  const t = view.theme.tokens;
  const accent = cssSafe(view.accent, ACCENT_FALLBACK);
  const accentTo = view.accentTo ? cssSafe(view.accentTo, accent) : accent;
  const customAccent = accent !== t.accent || accentTo !== accent;
  const accentText = customAccent
    ? readableOnGradient(accent, accentTo, cssSafe(t.accentText, '#ffffff'))
    : cssSafe(t.accentText, '#ffffff');
  // Нативные элементы (выпадающий список в жалобе) рисуются в схеме страницы:
  // без неё у тёмной темы список открывался белым со светлым текстом.
  const bgRgb = hexRgb(t.bg);
  const scheme = bgRgb && luminance(bgRgb) > 0.4 ? 'light' : 'dark';
  return `
:root{
  --bg:${cssSafe(t.bg, '#090a0c')};
  --bg2:${cssSafe(t.bg2, '#141619')};
  --surface:${cssSafe(t.surface, 'rgba(255,255,255,0.05)')};
  --text:${cssSafe(t.text, '#f2f3f4')};
  --muted:${cssSafe(t.muted, '#a0a5ab')};
  --accent:${accent};
  --accent-to:${accentTo};
  --accent-text:${accentText};
  --scheme:${scheme};
  --border:${cssSafe(t.border, 'rgba(255,255,255,0.09)')};
  --ui-font:Outfit,"Segoe UI",sans-serif;
  --font:${cssFontStack(view.fontStack, 'system-ui, sans-serif')};
  --radius:18px;
  --grad:linear-gradient(135deg,var(--accent),var(--accent-to));${effectVars(view)}${trailVars(view)}
}${altVars(view)}`;
}

// Шлейф курсора: цвета, толщина, длина, свечение. Движок читает переменные.
function trailVars(view) {
  const trail = view.trail;
  if (!trail) return '';
  const colors = (trail.colors || []).filter(color => /^#[0-9a-f]{6}$/i.test(String(color)));
  return (colors.length ? `\n  --trail-1:${colors[0]};\n  --trail-2:${colors[1] || colors[0]};` : '')
    + `\n  --trail-width:${(Number(trail.width) / 100).toFixed(2)};\n  --trail-life:${Math.round(Number(trail.length) || 560)};\n  --trail-glow:${trail.glow === false ? 0 : 1};`;
}

/**
 * Переменные второй темы. Свой акцент человека остаётся тем же в обеих — он
 * выбирал его, а не тему. Шлём только токены палитры.
 */
function altVars(view) {
  const t = view.altTheme && view.altTheme.tokens;
  if (!t) return '';
  const own = view.accent !== view.theme.tokens.accent || Boolean(view.accentTo);
  const bgRgb = hexRgb(t.bg);
  const scheme = bgRgb && luminance(bgRgb) > 0.4 ? 'light' : 'dark';
  const vars = `--bg:${cssSafe(t.bg, '#090a0c')};--bg2:${cssSafe(t.bg2, '#141619')};--surface:${cssSafe(t.surface, 'rgba(255,255,255,0.05)')};`
    + `--text:${cssSafe(t.text, '#f2f3f4')};--muted:${cssSafe(t.muted, '#a0a5ab')};--border:${cssSafe(t.border, 'rgba(255,255,255,0.09)')};--scheme:${scheme};`
    + (own ? '' : `--accent:${cssSafe(t.accent, ACCENT_FALLBACK)};--accent-to:${cssSafe(t.accent, ACCENT_FALLBACK)};--accent-text:${cssSafe(t.accentText, '#ffffff')};`);
  // По системе гостя — медиазапросом, без скрипта. По времени суток — классом
  // pf-alt, который ставит скрипт в <head> до первой отрисовки.
  // Класс pf-alt для режима «как у гостя» нужен только превью редактора:
  // на странице его никто не ставит, там работает медиазапрос.
  if (view.themeMode === 'system') return `\n@media (prefers-color-scheme:${scheme}){:root{${vars}}}\n:root.pf-alt{${vars}}`;
  if (view.themeMode === 'time') return `\n:root.pf-alt{${vars}}`;
  return '';
}

// Свои цвета эффектов. Без них движок и свечение берут цвета акцента.
function effectVars(view) {
  const colors = (view.effectColors || []).filter(color => /^#[0-9a-f]{6}$/i.test(String(color)));
  if (!colors.length) return '';
  return `\n  --fx-1:${colors[0]};\n  --fx-2:${colors[1] || colors[0]};`;
}

const BASE = `
*,*::before,*::after{box-sizing:border-box}
html,body{margin:0;padding:0}
html{-webkit-text-size-adjust:100%}
body{min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--text);font:400 14px/1.6 var(--ui-font);-webkit-font-smoothing:antialiased;overflow-x:hidden}
a{color:inherit;text-decoration:none}img,video{display:block;max-width:100%}button{font:inherit;color:inherit;border:0;background:none;cursor:pointer}input{font:inherit}
[hidden]{display:none!important}:focus-visible{outline:2px solid var(--accent);outline-offset:4px}::selection{background:var(--accent);color:var(--accent-text)}
.pf-bg{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none}.pf-bg-grad{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 0%,var(--bg2),transparent 70%),var(--bg)}.pf-bg-media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.pf-bg-dim{position:absolute;inset:0;background:#000}
.pf-cover-art{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}.pf-cover-art>img{width:100%;height:100%;object-fit:cover;object-position:center;opacity:.85}.pf-cover-shade{position:absolute;inset:0;background:linear-gradient(90deg,color-mix(in srgb,var(--bg) 90%,transparent),color-mix(in srgb,var(--bg) 54%,transparent) 55%,color-mix(in srgb,var(--bg) 64%,transparent)),linear-gradient(0deg,var(--bg),transparent 35%,transparent 75%,color-mix(in srgb,var(--bg) 25%,transparent))}
.pf-shell{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;min-height:100vh;min-height:100dvh;padding:64px 32px 32px}
.pf-main{position:relative;isolation:isolate;width:100%;max-width:660px;flex:none;min-width:0}
.pf-banner{width:100%;height:190px;object-fit:cover;border-radius:18px}
.pf-composition{position:relative;display:grid;gap:30px;min-width:0;padding-top:30px}
.pf-identity{display:flex;flex-direction:column;align-items:flex-start;min-width:0;text-align:left}
.pf-author-row{display:flex;align-items:center;gap:24px;min-width:0;width:100%}.pf-title-group{min-width:0;flex:1}
.pf-avatar-wrap{position:relative;isolation:isolate;width:88px;height:88px;--avatar-size:88px;flex:none;border-radius:50%;margin:0}
.pf-avatar{position:relative;width:100%;height:100%;border-radius:inherit;object-fit:cover;background:var(--bg2);border:3px solid color-mix(in srgb,var(--bg) 75%,transparent);box-shadow:0 0 0 1px var(--border)}
.pf-avatar-fallback{display:grid;place-items:center;color:var(--text);background:linear-gradient(145deg,var(--bg2),var(--bg));font:500 36px/1 var(--ui-font)}
.pf-handle{margin:0 0 8px;font:400 11px/1.4 var(--ui-font);letter-spacing:.06em;color:var(--muted)}
.pf-name{margin:0;font:500 clamp(38px,5vw,52px)/1.06 var(--font);letter-spacing:-.045em;overflow-wrap:anywhere;text-wrap:balance}
.pf-badges{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:13px}.pf-badge{font:400 10px/1.5 var(--ui-font);padding:3px 7px;color:var(--muted);border:1px solid var(--border);border-radius:5px;background:var(--surface)}.pf-badge--premium,.pf-badge--pro{color:var(--text)}.pf-badge--premium::before,.pf-badge--pro::before{content:'✦';margin-right:4px;color:var(--accent);background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.pf-intro{margin-top:26px;max-width:45ch}.pf-intro:not(:has(*)){display:none}.pf-headline{margin:0;font:500 16px/1.6 var(--ui-font);color:var(--text);overflow-wrap:anywhere}.pf-bio{margin:8px 0 0;font:400 13px/1.8 var(--ui-font);color:var(--muted);white-space:pre-wrap;overflow-wrap:anywhere}.pf-bio:first-child{margin-top:0}
.pf-status{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-top:20px;min-width:0;width:100%}.pf-status-item{display:inline-flex;align-items:center;gap:7px;max-width:100%;padding:5px 9px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--muted);font:400 11px/1.5 var(--ui-font)}.pf-status-item>svg{flex:none;opacity:.8}.pf-status-item>span{overflow-wrap:anywhere;min-width:0}.pf-status-item--status{width:100%;padding:0 0 4px;border:0;border-radius:0;background:none;color:var(--text);font-size:13px}.pf-status-item--listening{padding-left:0;border-color:transparent;background:none}
.pf-content{display:grid;align-content:start;gap:20px;min-width:0}.pf-content:not(:has(*)){display:none}.pf-section-label{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px;font:400 10px/1.5 var(--ui-font);letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}.pf-section-count{font-size:10px;opacity:.6;font-variant-numeric:tabular-nums}
.pf-links{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;list-style:none;margin:0;padding:0;min-width:0}.pf-links:has(>li:only-child){grid-template-columns:minmax(0,1fr)}.pf-links>li{min-width:0}
.pf-link{display:flex;align-items:center;gap:12px;width:100%;min-height:70px;padding:14px 16px;border:1px solid var(--border);border-radius:13px;background:color-mix(in srgb,var(--bg2) 64%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);transition:transform .2s,background .2s,border-color .2s}.pf-link:hover{transform:translateY(-3px);border-color:color-mix(in srgb,var(--text) 35%,transparent);background:color-mix(in srgb,var(--bg2) 90%,transparent)}.pf-link:active{transform:translateY(0)}
.pf-link-ico{display:grid;place-items:center;flex:none;width:30px;height:32px;color:var(--text)}.pf-link-ico>svg{width:21px;height:21px}.pf-link-copy{display:grid;gap:4px;flex:1;min-width:0}.pf-link-label{font:500 13px/1.4 var(--ui-font);overflow-wrap:anywhere}.pf-link-host{font:400 10px/1.3 var(--ui-font);color:var(--muted);overflow-wrap:anywhere}.pf-link-arrow{flex:none;opacity:.5;transition:transform .2s,opacity .2s}.pf-link:hover .pf-link-arrow{opacity:1;transform:translate(2px,-2px)}
.pf-interests{padding-top:18px;border-top:1px solid var(--border)}.pf-tags{display:flex;flex-wrap:wrap;gap:7px;min-width:0}.pf-tag{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:5px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--muted);font:400 11px/1.5 var(--ui-font)}.pf-tag>svg{flex:none;opacity:.6}.pf-tag>span{min-width:0;overflow-wrap:anywhere}
.pf-people{min-width:0}.pf-people-title{margin-bottom:12px;font:500 10px/1.4 var(--ui-font);letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}
.pf-pair{display:flex;align-items:center;gap:12px;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--surface)}.pf-pair-heart{color:var(--accent);flex:none}.pf-person-av{width:38px;height:38px;flex:none;border-radius:50%;object-fit:cover;background:var(--bg2)}.pf-pair-text{min-width:0}.pf-pair-name{font-size:13px;font-weight:500;overflow-wrap:anywhere}.pf-pair-since{font-size:11px;color:var(--muted)}
.pf-person-av.pf-avatar-fallback{font-size:16px}
.pf-friends{display:flex;gap:8px;flex-wrap:wrap}.pf-friend{display:flex;align-items:center;gap:8px;padding:7px 10px 7px 7px;border-radius:9px;border:1px solid var(--border);max-width:100%;min-width:0}.pf-friend .pf-person-av{width:28px;height:28px}.pf-friend-name{font-size:11px;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pf-cta{display:inline-flex;align-items:center;justify-content:center;gap:9px;max-width:100%;min-height:44px;margin-top:26px;padding:10px 17px;border:1px solid transparent;border-radius:999px;background:var(--grad);background-origin:border-box;color:var(--accent-text);font:500 12px/1.5 var(--ui-font);transition:transform .2s,filter .2s}.pf-cta>svg{flex:none}.pf-cta>span{margin-left:12px;opacity:.85;font-size:15px}.pf-cta:hover{filter:brightness(1.1);transform:translateY(-2px)}
.pf-foot{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px 20px;width:100%;max-width:660px;margin-top:28px;padding-top:17px;border-top:1px solid var(--border);font:400 10px/1.5 var(--ui-font);color:var(--muted)}.pf-madein{opacity:.6}.pf-madein a{color:var(--text)}.pf-meta{font-variant-numeric:tabular-nums;opacity:.7}.pf-report{padding:0;color:var(--muted);font-size:10px;opacity:.5}.pf-report:hover{opacity:1}
.pf-player{position:relative;display:flex;align-items:center;gap:11px;width:100%;min-width:0;min-height:68px;padding:14px;border:1px solid var(--border);border-radius:12px;background:var(--bg2);overflow:hidden}
.pf-player-btn{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:50%;background:var(--text);color:var(--bg)}.pf-player-text{min-width:0;flex:1;line-height:1.5}.pf-player-title{font:500 12px/1.5 var(--ui-font);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pf-player-artist{margin-top:2px;font:400 10px/1.4 var(--ui-font);color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pf-player-volume{appearance:none;width:44px;height:3px;flex:none;accent-color:var(--accent);background:var(--border);border-radius:3px;cursor:pointer}.pf-player-volume::-webkit-slider-thumb{appearance:none;width:8px;height:8px;border-radius:50%;background:var(--text)}
.pf-player-progress{position:absolute;left:0;right:0;bottom:0;height:2px;background:var(--surface)}.pf-player-progress::after{content:'';display:block;width:var(--progress,0%);height:100%;background:var(--grad);transition:width .25s linear}
.pf-equalizer{display:flex;align-items:center;justify-content:center;gap:2px;flex:none;width:16px;height:20px;color:var(--accent);opacity:.7}.pf-equalizer i{width:2px;height:4px;border-radius:1px;background:currentColor}.is-playing .pf-equalizer i{animation:pf-wave .8s ease-in-out infinite alternate}.is-playing .pf-equalizer i:nth-child(2){animation-delay:-.4s}.is-playing .pf-equalizer i:nth-child(3){animation-delay:-.65s}.is-playing .pf-equalizer i:nth-child(4){animation-delay:-.2s}@keyframes pf-wave{from{height:4px}to{height:17px}}
.pf-enter{position:fixed;inset:0;z-index:10;display:grid;place-items:center;padding:24px;background:color-mix(in srgb,var(--bg) 94%,transparent);backdrop-filter:blur(24px);text-align:center;cursor:pointer;transition:opacity .5s,visibility .5s}.pf-enter.is-gone{opacity:0;visibility:hidden;pointer-events:none}.pf-enter-inner{display:flex;flex-direction:column;align-items:center;gap:22px}.pf-enter-kicker{font:400 11px/1.5 var(--ui-font);letter-spacing:.1em;color:var(--muted)}.pf-enter-text{font:500 clamp(30px,6vw,52px)/1.15 var(--font);letter-spacing:-.04em}.pf-enter-hint{font:400 11px/1.6 var(--ui-font);color:var(--muted)}.pf-enter-hint>span{margin-left:10px}
body.pf-locked .pf-shell{opacity:0;pointer-events:none}body.pf-ready .pf-shell{animation:pf-in .65s cubic-bezier(.2,.8,.2,1) both}@keyframes pf-in{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
.pf-empty{margin:auto;text-align:center;max-width:380px}.pf-empty h1{font-size:24px;margin:0 0 8px}.pf-empty p{color:var(--muted);margin:0}
.pf-fx{position:fixed;inset:0;z-index:0;width:100%;height:100%;pointer-events:none;display:block}.pf-fx--trail{z-index:5}
.pf-block{min-width:0;padding:16px;border:1px solid var(--border);border-radius:13px;background:color-mix(in srgb,var(--bg2) 64%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.pf-gallery-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.pf-gallery-grid:has(>a:nth-child(2):last-child){grid-template-columns:repeat(2,minmax(0,1fr))}.pf-gallery-grid:has(>a:only-child){grid-template-columns:minmax(0,1fr)}.pf-gallery-grid:has(>a:only-child)>.pf-shot{aspect-ratio:16/10}.pf-shot{display:block;aspect-ratio:1;overflow:hidden;border-radius:10px;border:1px solid var(--border);background:var(--bg2)}.pf-shot>img{width:100%;height:100%;object-fit:cover;transition:transform .35s}.pf-shot:hover>img{transform:scale(1.04)}
.pf-invite{display:flex;align-items:center;gap:14px;transition:transform .2s,border-color .2s}.pf-invite:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--text) 35%,transparent)}.pf-invite-icon{display:grid;place-items:center;flex:none;width:48px;height:48px;border-radius:14px;overflow:hidden;background:linear-gradient(145deg,var(--bg2),var(--bg));border:1px solid var(--border);font:500 20px/1 var(--ui-font)}.pf-invite-icon>img{width:100%;height:100%;object-fit:cover}.pf-invite-copy{display:grid;gap:2px;flex:1;min-width:0}.pf-invite-kicker{font:400 10px/1.4 var(--ui-font);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.pf-invite-name{font:500 14px/1.35 var(--ui-font);overflow-wrap:anywhere}.pf-invite-meta{font:400 11px/1.4 var(--ui-font);color:var(--muted)}.pf-invite-cta{flex:none;padding:7px 13px;border-radius:999px;background:var(--grad);background-origin:border-box;color:var(--accent-text);font:500 11px/1.4 var(--ui-font)}
.pf-quote{margin:0;padding:4px 0 4px 18px;border-left:2px solid var(--accent)}.pf-quote blockquote{margin:0;font:400 19px/1.5 var(--font);letter-spacing:-.01em;white-space:pre-wrap;overflow-wrap:anywhere}.pf-quote figcaption{margin-top:8px;font:400 11px/1.4 var(--ui-font);color:var(--muted)}
.pf-countdown-title{margin-bottom:10px;font:400 10px/1.5 var(--ui-font);letter-spacing:.1em;text-transform:uppercase;color:var(--muted);overflow-wrap:anywhere}.pf-countdown-units{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.pf-cd-unit{display:grid;justify-items:center;gap:2px;padding:10px 4px;border-radius:10px;background:var(--surface)}.pf-cd-unit>b{font:500 24px/1.1 var(--font);font-variant-numeric:tabular-nums;letter-spacing:-.02em}.pf-cd-unit>i{font:400 10px/1.3 var(--ui-font);font-style:normal;color:var(--muted)}.pf-countdown-done{font:500 16px/1.4 var(--ui-font)}
.pf-actions{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-top:26px}.pf-actions>.pf-cta{margin-top:0}
.pf-heart{position:relative;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:10px 16px 10px 14px;border:1px solid var(--border);border-radius:999px;background:var(--surface);color:var(--text);font:500 12px/1.5 var(--ui-font);font-variant-numeric:tabular-nums;transition:transform .2s,border-color .2s,background .2s}.pf-heart:hover{transform:translateY(-2px);border-color:color-mix(in srgb,var(--text) 35%,transparent)}.pf-heart:disabled{cursor:default}
.pf-heart>svg{flex:none;overflow:visible;transition:transform .25s cubic-bezier(.3,1.6,.5,1)}.pf-heart path{fill:transparent;stroke:currentColor;stroke-width:1.8;transition:fill .2s,stroke .2s}
.pf-heart[aria-pressed="true"]{border-color:color-mix(in srgb,var(--accent) 55%,var(--border))}.pf-heart[aria-pressed="true"] path{fill:var(--accent);stroke:var(--accent)}
.pf-heart-burst{position:absolute;left:23px;top:50%;width:0;height:0;pointer-events:none}.pf-heart-burst i{position:absolute;width:5px;height:5px;margin:-2.5px;border-radius:50%;background:var(--accent);opacity:0}
.pf-heart-burst i:nth-child(2){--a:60deg}.pf-heart-burst i:nth-child(3){--a:120deg}.pf-heart-burst i:nth-child(4){--a:180deg}.pf-heart-burst i:nth-child(5){--a:240deg}.pf-heart-burst i:nth-child(6){--a:300deg}
.pf-heart.is-pop>svg{animation:pf-heart-pop .45s cubic-bezier(.3,1.6,.5,1)}.pf-heart.is-pop .pf-heart-burst i{animation:pf-heart-burst .6s ease-out}
@keyframes pf-heart-pop{40%{transform:scale(1.38)}}@keyframes pf-heart-burst{from{opacity:1;transform:rotate(var(--a,0deg)) translateY(-4px) scale(1)}to{opacity:0;transform:rotate(var(--a,0deg)) translateY(-24px) scale(.3)}}
.pf-player-skip{display:grid;place-items:center;flex:none;width:28px;height:28px;border-radius:50%;color:var(--muted);transition:color .2s,background .2s}.pf-player-skip:hover{color:var(--text);background:var(--surface)}.pf-player-count{margin-top:2px;font:400 10px/1.4 var(--ui-font);color:var(--muted);font-variant-numeric:tabular-nums}
@media(max-width:600px){.pf-shell{padding:32px 20px 24px}.pf-banner{height:150px;border-radius:14px}.pf-composition{padding-top:24px;gap:28px}.pf-author-row{gap:18px}.pf-avatar-wrap{width:74px;height:74px;--avatar-size:74px}.pf-name{font-size:38px}.pf-handle{font-size:10px}.pf-badges{margin-top:10px}.pf-badge{font-size:9px;padding:3px 6px}.pf-intro{margin-top:24px}.pf-links{gap:8px}.pf-link{padding:12px;min-height:66px;gap:9px}.pf-link-ico{width:23px}.pf-link-label{font-size:12px}.pf-link-host{font-size:9px}.pf-link-arrow{width:13px}.pf-foot{font-size:9px;margin-top:24px}.pf-player-volume{width:34px}.pf-cta{font-size:12px}.pf-player-title{font-size:12px}}
`;

// Public-page compositions. The editor receives exactly this markup and CSS.
const LAYOUT_CSS = {
  stack: `
.pf-layout-stack .pf-content{padding-top:26px;border-top:1px solid var(--border)}.pf-layout-stack .pf-composition{padding-right:3px;padding-left:3px}
`,
  card: `
.pf-layout-card .pf-main{max-width:940px;border:1px solid var(--border);border-radius:24px;background:color-mix(in srgb,var(--bg) 88%,transparent);backdrop-filter:blur(26px);-webkit-backdrop-filter:blur(26px);box-shadow:0 25px 90px #0004}.pf-layout-card .pf-banner{height:230px;border-radius:23px 23px 0 0}.pf-layout-card .pf-composition{grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:44px;padding:36px}.pf-layout-card .pf-author-row{display:block}.pf-layout-card .pf-avatar-wrap{width:88px;height:88px;margin-bottom:25px}.pf-layout-card .pf-name{font-size:46px}.pf-layout-card .pf-links{grid-template-columns:minmax(0,1fr)}.pf-layout-card .pf-foot{max-width:940px}.pf-layout-card .pf-composition:not(:has(.pf-content>*)){grid-template-columns:minmax(0,1fr)}
@media(max-width:680px){.pf-layout-card .pf-composition{grid-template-columns:minmax(0,1fr);gap:30px;padding:24px}.pf-layout-card .pf-banner{height:170px}.pf-layout-card .pf-author-row{display:flex}.pf-layout-card .pf-avatar-wrap{width:72px;height:72px;margin:0;--avatar-size:72px}.pf-layout-card .pf-name{font-size:38px}.pf-layout-card .pf-content{padding-top:24px;border-top:1px solid var(--border)}}
`,
  cinema: `
.pf-layout-cinema{padding:84px 6vw 36px}.pf-layout-cinema .pf-main{max-width:1160px}.pf-layout-cinema .pf-composition{grid-template-columns:minmax(0,1fr) minmax(280px,370px);align-items:center;gap:clamp(44px,8vw,140px);padding:0}.pf-layout-cinema .pf-author-row{display:block}.pf-layout-cinema .pf-avatar-wrap{width:92px;height:92px;--avatar-size:92px;margin-bottom:34px}.pf-layout-cinema .pf-handle{margin-bottom:14px;letter-spacing:.08em}.pf-layout-cinema .pf-name{font-size:clamp(64px,7.2vw,100px);line-height:.98;letter-spacing:-.055em}.pf-layout-cinema .pf-badges{margin-top:21px}.pf-layout-cinema .pf-intro{margin-top:28px}.pf-layout-cinema .pf-headline{font-size:18px}.pf-layout-cinema .pf-bio{font-size:14px}.pf-layout-cinema .pf-cta{margin-top:30px}.pf-layout-cinema .pf-actions{margin-top:30px}.pf-layout-cinema .pf-actions>.pf-cta{margin-top:0}.pf-layout-cinema .pf-links{grid-template-columns:minmax(0,1fr)}.pf-layout-cinema .pf-link{min-height:78px;background:color-mix(in srgb,var(--bg) 54%,transparent);border-color:color-mix(in srgb,var(--text) 18%,transparent)}.pf-layout-cinema .pf-player{background:color-mix(in srgb,var(--bg) 65%,transparent);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-color:color-mix(in srgb,var(--text) 18%,transparent)}.pf-layout-cinema .pf-content{gap:18px}.pf-layout-cinema .pf-foot{max-width:1160px;margin-top:70px}.pf-layout-cinema .pf-composition:not(:has(.pf-content>*)){grid-template-columns:minmax(0,1fr)}
@media(max-width:760px){.pf-layout-cinema{padding:44px 26px 24px;justify-content:flex-start}.pf-layout-cinema .pf-composition{grid-template-columns:minmax(0,1fr);gap:38px}.pf-layout-cinema .pf-avatar-wrap{width:82px;height:82px;--avatar-size:82px;margin-bottom:28px}.pf-layout-cinema .pf-name{font-size:64px}.pf-layout-cinema .pf-intro{margin-top:24px}.pf-layout-cinema .pf-headline{font-size:16px}.pf-layout-cinema .pf-bio{font-size:13px}.pf-layout-cinema .pf-link{min-height:70px}.pf-layout-cinema .pf-foot{margin-top:36px}.pf-cover-shade{background:linear-gradient(180deg,color-mix(in srgb,var(--bg) 58%,transparent),color-mix(in srgb,var(--bg) 82%,transparent) 55%,var(--bg)),linear-gradient(90deg,color-mix(in srgb,var(--bg) 45%,transparent),transparent)}}
`,
  center: `
.pf-layout-center .pf-main{max-width:560px}.pf-layout-center .pf-identity{align-items:center;text-align:center}.pf-layout-center .pf-author-row{flex-direction:column;gap:18px}.pf-layout-center .pf-title-group{display:flex;flex-direction:column;align-items:center}.pf-layout-center .pf-badges,.pf-layout-center .pf-actions{justify-content:center}.pf-layout-center .pf-intro{margin-left:auto;margin-right:auto}.pf-layout-center .pf-links{grid-template-columns:minmax(0,1fr)}.pf-layout-center .pf-link{min-height:60px}.pf-layout-center .pf-section-label{justify-content:center;gap:10px}.pf-layout-center .pf-content{padding-top:26px;border-top:1px solid var(--border)}.pf-layout-center .pf-foot{max-width:560px;justify-content:center}
`,
  bento: `
.pf-layout-bento .pf-main{max-width:1040px}.pf-layout-bento .pf-composition{grid-template-columns:minmax(250px,330px) minmax(0,1fr);gap:16px;align-items:start;padding-top:0}.pf-layout-bento .pf-identity{position:sticky;top:32px;padding:26px;border:1px solid var(--border);border-radius:22px;background:color-mix(in srgb,var(--bg2) 64%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}.pf-layout-bento .pf-author-row{display:block}.pf-layout-bento .pf-avatar-wrap{width:76px;height:76px;--avatar-size:76px;margin-bottom:20px}.pf-layout-bento .pf-name{font-size:clamp(32px,3.4vw,42px)}.pf-layout-bento .pf-intro{margin-top:18px}.pf-layout-bento .pf-content{gap:16px}.pf-layout-bento .pf-links{grid-template-columns:repeat(2,minmax(0,1fr))}.pf-layout-bento .pf-links>li:first-child{grid-column:1/-1}.pf-layout-bento .pf-links>li:first-child .pf-link{min-height:112px;align-items:flex-end}.pf-layout-bento .pf-foot{max-width:1040px}.pf-layout-bento .pf-composition:not(:has(.pf-content>*)){grid-template-columns:minmax(0,1fr)}
@media(max-width:760px){.pf-layout-bento .pf-composition{grid-template-columns:minmax(0,1fr)}.pf-layout-bento .pf-identity{position:static}}
`,
  magazine: `
.pf-layout-magazine .pf-main{max-width:980px}.pf-layout-magazine .pf-identity{padding-bottom:28px;border-bottom:1px solid var(--border)}.pf-layout-magazine .pf-author-row{flex-direction:row-reverse;justify-content:space-between;align-items:flex-end}.pf-layout-magazine .pf-avatar-wrap{width:64px;height:64px;--avatar-size:64px}.pf-layout-magazine .pf-name{font-size:clamp(56px,9vw,120px);line-height:.92;letter-spacing:-.06em}.pf-layout-magazine .pf-handle{letter-spacing:.1em;text-transform:uppercase}.pf-layout-magazine .pf-intro{max-width:none}.pf-layout-magazine .pf-bio{columns:2;column-gap:36px}.pf-layout-magazine .pf-links{grid-template-columns:minmax(0,1fr);gap:0;counter-reset:pf-mag}.pf-shell.pf-layout-magazine .pf-link{min-height:66px;padding:16px 4px;border:0;border-bottom:1px solid var(--border);border-radius:0;background:none;backdrop-filter:none;-webkit-backdrop-filter:none;box-shadow:none}.pf-shell.pf-layout-magazine .pf-link::before{counter-increment:pf-mag;content:counter(pf-mag,decimal-leading-zero);flex:none;width:30px;font:400 11px/1 var(--ui-font);letter-spacing:.06em;color:var(--muted)}.pf-shell.pf-layout-magazine .pf-link:hover{transform:translateX(6px);background:none}.pf-layout-magazine .pf-link-label{font-size:18px}.pf-layout-magazine .pf-foot{max-width:980px}
@media(max-width:760px){.pf-layout-magazine .pf-author-row{flex-direction:column;align-items:flex-start;gap:18px}.pf-layout-magazine .pf-name{font-size:58px}.pf-layout-magazine .pf-bio{columns:1}}
`
};

const FRAME_CSS = {
  none: '',
  ring: `
.pf-avatar-wrap::before{content:'';position:absolute;inset:-5px;border:1px solid;border-color:var(--accent) var(--accent-to) var(--accent-to) var(--accent);border-radius:inherit;opacity:.8;pointer-events:none}.pf-avatar-wrap::after{content:'';position:absolute;inset:-9px;border:1px solid var(--border);border-radius:inherit;pointer-events:none}
`,
  pulse: `
.pf-avatar-wrap::before{content:'';position:absolute;inset:-9px;border-radius:inherit;background:var(--grad);filter:blur(16px);opacity:.22;animation:pf-halo-breathe 4.5s ease-in-out infinite;z-index:-1}.pf-avatar-wrap::after{content:'';position:absolute;inset:-4px;border:1px solid color-mix(in srgb,var(--accent) 70%,transparent);border-radius:inherit;pointer-events:none}@keyframes pf-halo-breathe{0%,100%{opacity:.15;transform:scale(.96)}50%{opacity:.38;transform:scale(1.08)}}
`,
  orbit: `
.pf-avatar-wrap::before{content:'';position:absolute;inset:-10px;border:1px solid var(--border);border-radius:50%;pointer-events:none}.pf-avatar-wrap::after{content:'';position:absolute;inset:-11px;border-radius:50%;background:conic-gradient(transparent 0deg 15deg,var(--accent) 20deg 23deg,transparent 27deg 190deg,var(--accent-to) 195deg 197deg,transparent 202deg);mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px));animation:pf-frame-orbit 14s linear infinite;pointer-events:none}@keyframes pf-frame-orbit{to{transform:rotate(360deg)}}
`,
  liquid: `
.pf-avatar-wrap::before{content:'';position:absolute;inset:-5px;border-radius:inherit;background:conic-gradient(from 30deg,var(--accent),transparent 30%,var(--accent-to) 52%,transparent 78%,var(--accent));mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 1px));animation:pf-frame-prism 8s linear infinite;pointer-events:none}.pf-avatar-wrap::after{content:'';position:absolute;inset:-12px;border-radius:inherit;background:conic-gradient(var(--accent),transparent,var(--accent-to),transparent,var(--accent));filter:blur(13px);opacity:.2;z-index:-1;animation:pf-frame-prism 8s linear infinite}@keyframes pf-frame-prism{to{transform:rotate(-360deg)}}
`,
  corners: `
.pf-avatar-wrap,.pf-avatar{border-radius:24px}.pf-avatar-wrap::before{content:'';position:absolute;inset:-6px;border-radius:29px;border:1px solid var(--border);pointer-events:none}.pf-avatar-wrap::after{content:'';position:absolute;inset:-6px;border-radius:29px;border:2px solid;border-color:var(--accent) var(--accent-to) var(--accent-to) var(--accent);mask:conic-gradient(transparent 0deg 22deg,#000 22deg 68deg,transparent 68deg 112deg,#000 112deg 158deg,transparent 158deg 202deg,#000 202deg 248deg,transparent 248deg 292deg,#000 292deg 338deg,transparent 338deg);pointer-events:none}
`
};

// Анимация фона у премиальных тем. Живёт в отдельном слое .pf-bg-anim, чтобы
// не мешать картинке пользователя, если он её поставил.
const ANIMATED_THEME_CSS = {
  liquid: `
.pf-bg-anim{position:absolute;inset:-20%;
  background:
    radial-gradient(closest-side,var(--accent),transparent) 20% 30%/55% 55% no-repeat,
    radial-gradient(closest-side,var(--accent-to),transparent) 75% 65%/50% 50% no-repeat;
  filter:blur(70px);opacity:.4;animation:pf-liquid 22s ease-in-out infinite alternate}
@keyframes pf-liquid{
  0%{transform:translate3d(0,0,0) scale(1)}
  50%{transform:translate3d(-6%,4%,0) scale(1.12)}
  100%{transform:translate3d(5%,-5%,0) scale(1.04)}}`,
  starfield: `
.pf-bg-anim{position:absolute;inset:0;opacity:.75;
  background-image:
    radial-gradient(1.4px 1.4px at 20% 30%,#fff,transparent),
    radial-gradient(1.2px 1.2px at 70% 15%,#fff,transparent),
    radial-gradient(1.6px 1.6px at 45% 70%,#fff,transparent),
    radial-gradient(1.1px 1.1px at 85% 55%,#fff,transparent),
    radial-gradient(1.3px 1.3px at 10% 80%,#fff,transparent),
    radial-gradient(1px 1px at 60% 90%,#fff,transparent);
  background-size:520px 520px;animation:pf-stars 90s linear infinite}
@keyframes pf-stars{to{background-position:520px 520px,520px 520px,520px 520px,520px 520px,520px 520px,520px 520px}}`,
  velvet: `
.pf-bg-anim{position:absolute;inset:-30%;
  background:conic-gradient(from 0deg,transparent,var(--accent) 25%,transparent 50%,var(--accent-to) 75%,transparent);
  filter:blur(90px);opacity:.32;animation:pf-spin 40s linear infinite}
@keyframes pf-spin{to{transform:rotate(360deg)}}`,
  // Сезонные: туман над тыквенным светом, золотая метель, тёплые розовые отсветы.
  halloween: `
.pf-bg-anim{position:absolute;inset:-20%;
  background:
    radial-gradient(closest-side,color-mix(in srgb,var(--accent) 55%,transparent),transparent) 18% 78%/45% 40% no-repeat,
    radial-gradient(closest-side,#5b1d7a,transparent) 80% 20%/55% 50% no-repeat;
  filter:blur(60px);opacity:.42;animation:pf-liquid 26s ease-in-out infinite alternate}`,
  newyear: `
.pf-bg-anim{position:absolute;inset:0;opacity:.8;
  background-image:
    radial-gradient(1.6px 1.6px at 15% 20%,var(--accent),transparent),
    radial-gradient(1.2px 1.2px at 65% 10%,#fff,transparent),
    radial-gradient(1.8px 1.8px at 40% 60%,var(--accent),transparent),
    radial-gradient(1.1px 1.1px at 85% 45%,#fff,transparent),
    radial-gradient(1.4px 1.4px at 25% 85%,#fff,transparent);
  background-size:380px 380px;animation:pf-newyear 40s linear infinite}
@keyframes pf-newyear{to{background-position:0 380px,0 380px,0 380px,0 380px,0 380px}}`,
  valentine: `
.pf-bg-anim{position:absolute;inset:-20%;
  background:
    radial-gradient(closest-side,var(--accent),transparent) 25% 30%/50% 45% no-repeat,
    radial-gradient(closest-side,#ff9ec0,transparent) 75% 70%/45% 45% no-repeat;
  filter:blur(80px);opacity:.3;animation:pf-liquid 20s ease-in-out infinite alternate}`,
  aurora: `
.pf-bg-anim{position:absolute;left:-25%;right:-25%;top:-30%;height:90%;
  background:
    linear-gradient(100deg,transparent,var(--accent) 40%,transparent 70%),
    linear-gradient(260deg,transparent 30%,var(--accent-to) 60%,transparent);
  filter:blur(80px);opacity:.35;animation:pf-aurora 18s ease-in-out infinite alternate}
@keyframes pf-aurora{
  0%{transform:translateY(0) skewY(-6deg) scaleY(1)}
  100%{transform:translateY(9%) skewY(5deg) scaleY(1.25)}}`
};

const EFFECT_CSS = {
  glow: `
.pf-glow{position:fixed;inset:0;z-index:0;width:100%;height:100%;pointer-events:none;opacity:.35;transition:opacity .8s;background:radial-gradient(ellipse 420px 360px at var(--gx,50%) var(--gy,35%),color-mix(in srgb,var(--fx-1,var(--accent)) 28%,transparent),transparent 75%)}.pf-glow.is-on{opacity:.8}.pf-glow::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 20% 70%,color-mix(in srgb,var(--fx-2,var(--accent-to)) 7%,transparent),transparent 60%);animation:pf-glow-drift 15s ease-in-out infinite alternate}@keyframes pf-glow-drift{to{transform:translate(8%,-5%);opacity:.5}}
`,
  // Кинескоп: строки развёртки, мягкая виньетка и бегущая полоса. Только CSS,
  // поверх содержимого, но мимо курсора (pointer-events:none).
  scanlines: `
.pf-scan{position:fixed;inset:0;z-index:4;width:100%;height:100%;pointer-events:none;overflow:hidden;background:repeating-linear-gradient(0deg,rgba(0,0,0,.18) 0 1px,transparent 1px 3px);animation:pf-scan-flicker 5s steps(40) infinite}.pf-scan::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 58%,rgba(0,0,0,.42))}.pf-scan::before{content:'';position:absolute;left:0;right:0;top:-25%;height:25%;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--fx-1,var(--text)) 7%,transparent),transparent);animation:pf-scan-roll 8s linear infinite}@keyframes pf-scan-roll{to{transform:translateY(520%)}}@keyframes pf-scan-flicker{50%{opacity:.86}}
`
};

// Уважение к prefers-reduced-motion. Не косметика: у части людей от таких
// анимаций реально болит голова, а страница-визитка не тот случай, где стоит
// настаивать. Эффекты на canvas глушит сам скрипт.
const REDUCED_MOTION = `
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.001s!important;animation-iteration-count:1!important;
    transition-duration:.001s!important}
  .pf-bg-anim{animation:none}
}`;

// ─────────────────── детали оформления (view.style) ───────────────────
//
// Каждое правило выводится только для значения, отличного от умолчания: тогда
// страница, где ничего не настраивали, получает ровно прежний CSS. Префикс
// .pf-shell поднимает вес правил над раскладками (.pf-layout-cinema .pf-link),
// а место в конце сборки — над ними же при равном весе.

const SURFACES = ['.pf-link', '.pf-player', '.pf-pair', '.pf-friend', '.pf-block'];
const inShell = list => list.map(sel => `.pf-shell ${sel}`).join(',');
const HEX6 = /^#[0-9a-f]{6}$/i;

// Курсоры — свои SVG с цветом акцента. Цвета приходят только проверенным hex
// (акцент) и токенами темы из каталога, поэтому разметка собирается здесь же.
function cursorSvg(id, color, edge, colorTo) {
  // Два цвета — заливка переходом по диагонали. Цвета — только проверенный hex.
  const paint = colorTo && colorTo !== color ? 'url(#g)' : color;
  const defs = paint === 'url(#g)'
    ? `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${colorTo}"/></linearGradient></defs>`
    : '';
  color = paint;
  const shapes = {
    dot: `<circle cx="12" cy="12" r="5" fill="${color}" stroke="${edge}" stroke-width="1.5"/>`,
    ring: `<circle cx="12" cy="12" r="8.5" fill="none" stroke="${color}" stroke-width="2"/><circle cx="12" cy="12" r="1.8" fill="${color}"/>`,
    heart: `<path d="M12 20s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20z" fill="${color}" stroke="${edge}" stroke-width="1.4"/>`,
    spark: `<path d="M12 3l2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2z" fill="${color}" stroke="${edge}" stroke-width="1.2"/>`,
    cross: `<path d="M12 3v6M12 15v6M3 12h6M15 12h6" stroke="${color}" stroke-width="2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.5" fill="${color}"/>`
  };
  if (!shapes[id]) return null;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${defs}${shapes[id]}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12`;
}

const ENTRANCE_KEYFRAMES = {
  fade: '@keyframes pf-blk{from{opacity:0}to{opacity:1}}',
  rise: '@keyframes pf-blk{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}',
  stagger: '@keyframes pf-blk{from{opacity:0;transform:translateY(22px) scale(.985)}to{opacity:1;transform:none}}'
};

function styleCss(view) {
  const s = view.style;
  if (!s) return '';
  const out = [];
  const alpha = s.cardAlpha;

  if (view.bgGradient) {
    const colors = view.bgGradient.colors.map(color => (HEX6.test(color) ? color : '#000000')).join(',');
    out.push(`.pf-bg-grad{background:linear-gradient(${Number(view.bgGradient.angle) || 0}deg,${colors})}`);
  }

  // Подложки: плотность, скругление, рамка, тень.
  if (alpha !== 64) {
    out.push(`${inShell(SURFACES)}{background:color-mix(in srgb,var(--bg2) ${alpha}%,transparent)}`
      + `.pf-shell .pf-link:hover{background:color-mix(in srgb,var(--bg2) ${Math.min(100, alpha + 26)}%,transparent)}`
      + `.pf-layout-card .pf-main{background:color-mix(in srgb,var(--bg) ${Math.min(100, alpha + 24)}%,transparent)}`);
    if (alpha === 0) out.push(`${inShell(SURFACES)}{backdrop-filter:none;-webkit-backdrop-filter:none}`);
  }
  if (s.cardRadius !== 13) {
    const r = s.cardRadius;
    out.push(`${inShell(['.pf-link', '.pf-player', '.pf-pair', '.pf-block', '.pf-shot', '.pf-cd-unit'])}{border-radius:${r}px}`
      + `.pf-shell .pf-banner{border-radius:${r + 5}px}.pf-layout-card .pf-main{border-radius:${r + 11}px}.pf-layout-card .pf-banner{border-radius:${r + 10}px ${r + 10}px 0 0}`);
  }
  if (!s.cardBorder) {
    out.push(`${inShell(SURFACES)},.pf-layout-card .pf-main{border-color:transparent}`);
  }
  if (s.cardShadow !== 'none') {
    const shadow = s.cardShadow === 'deep' ? '0 18px 50px rgba(0,0,0,.38)' : '0 8px 24px rgba(0,0,0,.16)';
    out.push(`${inShell(SURFACES)}{box-shadow:${shadow}}`);
  }

  // Ссылки: форма, заливка, сетка.
  if (s.linkShape === 'pill') out.push('.pf-shell .pf-link{border-radius:999px;padding-left:20px;padding-right:20px}');
  if (s.linkShape === 'square') out.push('.pf-shell .pf-link{border-radius:4px}');
  if (s.linkFill === 'solid') {
    out.push('.pf-shell .pf-link{background:var(--bg2);backdrop-filter:none;-webkit-backdrop-filter:none}.pf-shell .pf-link:hover{background:color-mix(in srgb,var(--bg2) 88%,var(--text))}');
  } else if (s.linkFill === 'outline') {
    out.push('.pf-shell .pf-link{background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;border-color:color-mix(in srgb,var(--text) 32%,transparent)}.pf-shell .pf-link:hover{background:var(--surface);border-color:color-mix(in srgb,var(--text) 55%,transparent)}');
  } else if (s.linkFill === 'accent') {
    out.push('.pf-shell .pf-link{background:var(--grad);background-origin:border-box;border-color:transparent;color:var(--accent-text);backdrop-filter:none;-webkit-backdrop-filter:none}.pf-shell .pf-link:hover{background:var(--grad);filter:brightness(1.08);border-color:transparent}.pf-shell .pf-link .pf-link-ico{color:inherit}.pf-shell .pf-link .pf-link-host{color:inherit;opacity:.72}');
  }
  if (s.linkLayout === 'grid') out.push('.pf-shell .pf-links{grid-template-columns:repeat(2,minmax(0,1fr))}.pf-shell .pf-links:has(>li:only-child){grid-template-columns:minmax(0,1fr)}');
  if (s.linkLayout === 'list') out.push('.pf-shell .pf-links{grid-template-columns:minmax(0,1fr)}');

  // Аватар.
  if (s.avatarShape === 'squircle') out.push('.pf-shell .pf-avatar-wrap{border-radius:30%}');
  if (s.avatarShape === 'square') out.push('.pf-shell .pf-avatar-wrap{border-radius:14px}');
  if (s.avatarSize === 'sm') out.push('.pf-shell .pf-avatar-wrap{zoom:.8}');
  if (s.avatarSize === 'lg') out.push('.pf-shell .pf-avatar-wrap{zoom:1.3}');

  // Имя.
  if (s.nameSize === 'sm') out.push('.pf-shell .pf-name{zoom:.8}');
  if (s.nameSize === 'lg') out.push('.pf-shell .pf-name{zoom:1.22}');
  if (s.nameAlign === 'center') {
    out.push('.pf-shell .pf-identity{align-items:center;text-align:center}.pf-shell .pf-author-row{flex-direction:column;align-items:center;gap:20px}'
      + '.pf-shell .pf-title-group{display:flex;flex-direction:column;align-items:center;width:100%}.pf-shell .pf-avatar-wrap{margin-left:auto;margin-right:auto}'
      + '.pf-shell .pf-badges,.pf-shell .pf-status,.pf-shell .pf-actions{justify-content:center}.pf-shell .pf-intro{margin-left:auto;margin-right:auto}');
  }
  const fill = s.nameFill || 'theme';
  const nameColors = (s.nameColors || []).filter(color => HEX6.test(color));
  const clipText = '-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent';
  if (fill !== 'theme' || s.nameEffect === 'shimmer' || s.nameEffect === 'typewriter') {
    out.push('.pf-shell .pf-name{width:fit-content;max-width:100%}');
  }
  if (fill === 'solid' && nameColors[0]) out.push(`.pf-shell .pf-name{color:${nameColors[0]}}`);
  // Заливка имени слоем фона: её же блик кладёт под свою полосу света.
  const angle = Math.max(0, Math.min(360, Number(s.nameAngle) || 0));
  const fillLayer = fill === 'gradient' && nameColors.length >= 2 ? `linear-gradient(${angle}deg,${nameColors.join(',')})`
    : fill === 'accent' ? 'var(--grad)'
      : fill === 'solid' && nameColors[0] ? `linear-gradient(${nameColors[0]},${nameColors[0]})`
        : null;
  if (s.nameEffect !== 'shimmer' && fillLayer && fill !== 'solid') {
    out.push(`.pf-shell .pf-name{background:${fillLayer};${clipText}}`);
  }
  if (s.nameEffect === 'glow') {
    out.push('.pf-shell .pf-name{filter:drop-shadow(0 0 12px color-mix(in srgb,var(--accent) 55%,transparent));animation:pf-name-glow 3.6s ease-in-out infinite}'
      + '@keyframes pf-name-glow{50%{filter:drop-shadow(0 0 22px color-mix(in srgb,var(--accent) 80%,transparent))}}');
  } else if (s.nameEffect === 'shimmer') {
    // Блик — отдельная полоса света ПОВЕРХ заливки имени, сама заливка стоит на
    // месте. Раньше бежал весь градиент целиком, и на своём градиенте
    // (красный → фиолетовый → белый) середина пропадала, а в конце круга
    // заливка перескакивала обратно. Полоса начинает и заканчивает путь за
    // краем имени, поэтому круг замыкается без скачка.
    const shine = fillLayer ? 'color-mix(in srgb,#ffffff 82%,var(--text))' : 'var(--accent)';
    const base = fillLayer || 'linear-gradient(var(--text),var(--text))';
    out.push(`.pf-shell .pf-name{background-image:linear-gradient(105deg,transparent 42%,${shine} 50%,transparent 58%),${base};`
      + `background-size:250% 100%,100% 100%;background-repeat:no-repeat;background-position:100% 0,0 0;${clipText};animation:pf-name-shimmer 5s ease-in-out infinite}`
      + '@keyframes pf-name-shimmer{0%{background-position:100% 0,0 0}60%,100%{background-position:0% 0,0 0}}');
  } else if (s.nameEffect === 'typewriter') {
    // Шаг на каждый символ имени: steps() без числа букв печатал бы рывками
    // невпопад. Имя короткое (до 40 символов), поэтому всё укладывается в 3 с.
    const letters = Math.max(1, Math.min(40, [...String(view.title || '')].length));
    out.push(`.pf-shell .pf-name{clip-path:inset(0 100% 0 0)}body.pf-ready .pf-shell .pf-name{animation:pf-type ${(letters * 0.075).toFixed(2)}s steps(${letters},end) .35s forwards}`
      + '.pf-shell .pf-name::after{content:"";display:inline-block;width:.06em;height:.8em;margin-left:.08em;vertical-align:-.04em;background:var(--accent);animation:pf-caret .9s steps(1) infinite}'
      + '@keyframes pf-type{to{clip-path:inset(0 -.3em 0 0)}}@keyframes pf-caret{50%{opacity:0}}');
  }

  // Обводка ссылок в движении. Блик идёт по самой рамке (маска вырезает
  // середину), начинается и кончается за краем — круг без скачка.
  if (s.linkMotion === 'sweep') {
    // Мягкий блик проходит по всей кнопке, как отблеск на стекле. Раньше свет
    // бежал только по рамке и в середине пути выглядел кривой дугой на одном
    // боку. Путь начинается и кончается за краем, затем пауза — круг без скачка.
    out.push('.pf-shell .pf-link{position:relative;overflow:hidden}.pf-shell .pf-link::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;'
      + 'background:linear-gradient(105deg,transparent 38%,color-mix(in srgb,var(--text) 13%,transparent) 47%,color-mix(in srgb,var(--accent) 22%,transparent) 50%,color-mix(in srgb,var(--text) 13%,transparent) 53%,transparent 62%) 0 0/260% 100% no-repeat;'
      + 'animation:pf-link-sweep 4.2s ease-in-out infinite}'
      + '@keyframes pf-link-sweep{0%{background-position:130% 0}55%,100%{background-position:-30% 0}}'
      + [2, 3, 4, 5, 6].map(n => `.pf-shell .pf-links>li:nth-child(${n}) .pf-link::after{animation-delay:${((n - 1) * 0.25).toFixed(2)}s}`).join(''));
  } else if (s.linkMotion === 'pulse') {
    out.push('.pf-shell .pf-link{animation:pf-link-pulse 3.6s ease-in-out infinite}'
      + '@keyframes pf-link-pulse{50%{border-color:color-mix(in srgb,var(--accent) 70%,transparent);box-shadow:0 0 20px -6px color-mix(in srgb,var(--accent) 60%,transparent)}}'
      + [2, 3, 4, 5, 6].map(n => `.pf-shell .pf-links>li:nth-child(${n}) .pf-link{animation-delay:-${((n - 1) * 0.5).toFixed(2)}s}`).join(''));
  }

  // Наклон аватара: углы ставит скрипт страницы (--tilt-x/--tilt-y).
  if (s.avatarTilt) {
    out.push('.pf-shell .pf-avatar-wrap{transform:perspective(520px) rotateX(var(--tilt-x,0deg)) rotateY(var(--tilt-y,0deg));transition:transform .3s cubic-bezier(.2,.8,.2,1);will-change:transform}'
      + '.pf-shell .pf-avatar-wrap .pf-avatar{box-shadow:0 0 0 1px var(--border),calc(var(--tilt-y,0deg) / 1deg * -.6px) calc(var(--tilt-x,0deg) / 1deg * .6px) 22px rgba(0,0,0,.35)}');
  }

  // Свой курсор-картинка: адрес только с наших хостов, без кавычек и скобок
  // (проверено при сохранении и ещё раз здесь).
  if (s.cursor === 'custom' && view.cursorImage && !/["'()\\\s]/.test(view.cursorImage)) {
    const spot = s.cursorHotspot === 'center' ? '24 24' : '0 0';
    out.push(`body{cursor:url("${view.cursorImage}") ${spot},auto}a,button,[role="button"],input[type="range"]{cursor:url("${view.cursorImage}") ${spot},pointer}`);
  }

  // Курсор.
  if (s.cursor !== 'default' && s.cursor !== 'custom') {
    const t = view.theme.tokens;
    const own = (s.cursorColors || []).filter(value => HEX6.test(String(value)));
    const color = own[0] || (HEX6.test(String(view.accent)) ? String(view.accent) : '#ffffff');
    const colorTo = own[1] || null;
    const edge = HEX6.test(String(t.bg)) ? t.bg : '#000000';
    const cursor = cursorSvg(s.cursor, color, edge, colorTo);
    if (cursor) out.push(`body{cursor:${cursor},auto}a,button,[role="button"],input[type="range"]{cursor:${cursor},pointer}`);
  }

  // Появление блоков после экрана входа (или сразу после загрузки).
  if (ENTRANCE_KEYFRAMES[s.entrance]) {
    const list = 'body.pf-ready .pf-identity>*,body.pf-ready .pf-content>*,body.pf-ready .pf-foot';
    const parts = [ENTRANCE_KEYFRAMES[s.entrance], `${list}{animation:pf-blk .7s cubic-bezier(.2,.8,.2,1) both}`];
    if (s.entrance === 'stagger') {
      for (let i = 1; i <= 8; i += 1) {
        parts.push(`body.pf-ready .pf-identity>:nth-child(${i}){animation-delay:${(0.06 * i).toFixed(2)}s}`);
        parts.push(`body.pf-ready .pf-content>:nth-child(${i}){animation-delay:${(0.3 + 0.09 * i).toFixed(2)}s}`);
      }
      parts.push('body.pf-ready .pf-foot{animation-delay:1.1s}');
    } else {
      parts.push('body.pf-ready .pf-content>*{animation-delay:.12s}body.pf-ready .pf-foot{animation-delay:.2s}');
    }
    out.push(parts.join(''));
  }

  return out.join('\n');
}

const WAVE_MASK = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="28" viewBox="0 0 120 28"><path d="M0 14c15 0 15-10 30-10s15 10 30 10 15-10 30-10 15 10 30 10" fill="none" stroke="#000" stroke-width="1.2"/></svg>') + '")';
const PATTERN_CSS = {
  dots: '.pf-bg-pattern{background-image:radial-gradient(color-mix(in srgb,var(--text) 55%,transparent) 1px,transparent 1.6px);background-size:18px 18px}',
  grid: '.pf-bg-pattern{background-image:linear-gradient(color-mix(in srgb,var(--text) 22%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--text) 22%,transparent) 1px,transparent 1px);background-size:32px 32px}',
  checks: '.pf-bg-pattern{background:conic-gradient(color-mix(in srgb,var(--text) 12%,transparent) 25%,transparent 0 50%,color-mix(in srgb,var(--text) 12%,transparent) 0 75%,transparent 0) 0 0/44px 44px}',
  diagonal: '.pf-bg-pattern{background-image:repeating-linear-gradient(45deg,color-mix(in srgb,var(--text) 20%,transparent) 0 1px,transparent 1px 13px)}',
  waves: `.pf-bg-pattern{background:var(--text);-webkit-mask:${WAVE_MASK} 0 0/120px 28px repeat;mask:${WAVE_MASK} 0 0/120px 28px repeat}`
};

function backgroundExtras(view) {
  const out = [];
  if (view.bgPattern && PATTERN_CSS[view.bgPattern.kind]) {
    // Узор растворяется к низу экрана: ровная сетка до самого края выглядит
    // как миллиметровка, а не как фон.
    out.push('.pf-bg-pattern{position:absolute;inset:0;pointer-events:none;-webkit-mask-image:linear-gradient(#000,rgba(0,0,0,.35) 75%,transparent);mask-image:linear-gradient(#000,rgba(0,0,0,.35) 75%,transparent)}');
    out.push(PATTERN_CSS[view.bgPattern.kind]);
    out.push(`.pf-bg-pattern{opacity:${(view.bgPattern.opacity / 100).toFixed(2)}}`);
    if (view.bgPattern.kind === 'waves') out.push('.pf-bg-pattern{-webkit-mask-composite:source-in}');
  }
  if (view.bgGradient && view.bgGradient.animated) {
    const colors = view.bgGradient.colors.filter(color => HEX6.test(color));
    // Фон в три раза больше экрана, и раньше в окно попадала треть градиента —
    // часто это был один цвет на весь экран. Теперь набор цветов повторяется
    // трижды: какую бы треть ни показывало окно, в ней все цвета.
    const cycle = [...colors, ...colors, ...colors, colors[0]];
    out.push(`.pf-bg-grad{background:linear-gradient(${Number(view.bgGradient.angle) || 0}deg,${cycle.join(',')});background-size:300% 300%;animation:pf-grad-flow 18s ease-in-out infinite alternate}`
      + '@keyframes pf-grad-flow{0%{background-position:0% 50%}100%{background-position:100% 50%}}');
  }
  return out.join('\n');
}

const FONT_FORMATS = { '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' };

/** Свой шрифт человека: адрес с наших хостов, без кавычек и скобок. */
function customFontFace(view) {
  const url = view.customFont;
  if (!url || /["'()\\\s]/.test(url)) return '';
  const ext = (/\.(woff2|woff|ttf|otf)(?:$|\?)/i.exec(url) || [])[1];
  const format = FONT_FORMATS[`.${String(ext || 'woff2').toLowerCase()}`] || 'woff2';
  return `@font-face{font-family:"LoveCustom";src:url("${url}") format("${format}");font-display:swap}`;
}

/**
 * Своя расстановка: холст-сетка и место каждой клетки. Стили раскладки,
 * поверх которой расставляли, остаются — от неё берётся вид кнопок и имени, а
 * композицию задают клетки. На телефоне сетки нет: клетки идут столбиком в
 * порядке разметки (сервер уже отсортировал их сверху вниз, слева направо).
 */
function customLayoutCss(view) {
  const cells = view.customPlaced;
  if (!cells || !cells.length) return '';
  const { COLS, ROW, CANVAS, bottomOf } = require('./profileCustomLayout');
  const colPx = CANVAS / COLS;
  const phoneColPx = 350 / COLS;
  const rows = Math.max(view.customRows || 0, bottomOf(cells));
  const out = [
    // Страница со своей расстановкой начинается сверху: «верх» в редакторе —
    // это верх страницы, без центрирования по высоте экрана.
    '.pf-shell.pf-layout-custom{justify-content:flex-start}',
    `.pf-layout-custom .pf-main,.pf-layout-custom .pf-foot{max-width:${CANVAS}px}`,
    `.pf-canvas{display:grid;grid-template-columns:repeat(${COLS},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(${ROW}px,auto));grid-auto-rows:minmax(${ROW}px,auto);align-content:start}`,
    '.pf-cell{position:relative;min-width:0;display:flex;flex-direction:column;align-items:stretch}',
    '.pf-cell>*{margin-top:0!important;margin-bottom:0!important}',
    // Ширину текста в клетке задаёт сама клетка, а не «45 знаков» раскладки.
    '.pf-cell-avatar{align-items:center;justify-content:center}.pf-cell-name .pf-title-group{min-width:0}.pf-cell .pf-intro{max-width:none}',
    '.pf-cell-actions .pf-actions{flex-wrap:wrap}'
  ];
  for (const cell of cells) {
    out.push(`.pf-cell-${cell.id}{grid-column:${cell.x + 1}/span ${cell.w};grid-row:${cell.y + 1}/span ${cell.h}}`);
  }
  const autoLinks = !view.style || !view.style.linkLayout || view.style.linkLayout === 'auto';
  // Аватар растягивается вместе с клеткой: квадрат по меньшей стороне.
  // «Как в раскладке» у ссылок здесь значит «по ширине клетки».
  const sized = (list, col) => {
    const parts = [];
    const avatar = list.find(cell => cell.id === 'avatar');
    if (avatar) {
      const size = Math.round(Math.min(avatar.h * ROW, avatar.w * col));
      parts.push(`.pf-shell .pf-cell-avatar .pf-avatar-wrap{width:min(100%,${size}px);height:auto;aspect-ratio:1;--avatar-size:${size}px;zoom:1}`);
    }
    const links = list.find(cell => cell.id === 'links');
    if (links && autoLinks) {
      parts.push(`.pf-shell .pf-cell-links .pf-links{grid-template-columns:${links.w * col >= 560 ? 'repeat(2,minmax(0,1fr))' : 'minmax(0,1fr)'}}`);
    }
    return parts;
  };
  out.push(...sized(cells, colPx));

  const phone = view.customPhonePlaced;
  if (phone && phone.length) {
    const phoneRows = Math.max(view.customPhoneRows || 0, bottomOf(phone));
    const inner = [`.pf-canvas{grid-template-rows:repeat(${phoneRows},minmax(${ROW}px,auto))}`];
    for (const cell of phone) {
      inner.push(`.pf-cell-${cell.id}{grid-column:${cell.x + 1}/span ${cell.w};grid-row:${cell.y + 1}/span ${cell.h}}`);
    }
    inner.push(...sized(phone, phoneColPx));
    out.push(`@media(max-width:760px){${inner.join('')}}`);
  } else {
    // Своей расстановки для телефона нет — столбиком в порядке компьютера.
    const avatar = cells.find(cell => cell.id === 'avatar');
    const size = avatar ? Math.min(128, Math.round(Math.min(avatar.h * ROW, avatar.w * colPx))) : 0;
    out.push('@media(max-width:760px){.pf-canvas{display:flex;flex-direction:column;gap:22px}.pf-shell .pf-cell-links .pf-links{grid-template-columns:minmax(0,1fr)}'
      + (size ? `.pf-shell .pf-cell-avatar .pf-avatar-wrap{width:${size}px;--avatar-size:${size}px}` : '') + '}');
  }
  return out.join('\n');
}

function buildStyles(view) {
  const parts = [require('./profilePageFonts'), customFontFace(view), themeVars(view), BASE];

  parts.push(LAYOUT_CSS[view.layout] || '');
  parts.push(customLayoutCss(view));
  parts.push(FRAME_CSS[view.avatarFrame] || '');

  // Анимация темы отключается, если пользователь поставил свой фон: два
  // движущихся слоя друг поверх друга — это уже не оформление, а мигание.
  if (view.theme.animated && !view.background) {
    parts.push(ANIMATED_THEME_CSS[view.theme.id] || '');
  }

  for (const id of view.effects || [view.effect]) parts.push(EFFECT_CSS[id] || '');
  parts.push(styleCss(view));
  parts.push(backgroundExtras(view));
  parts.push(REDUCED_MOTION);

  // Monochrome is the default look, including uploaded imagery. Other themes
  // keep their original colors, so choosing a different theme restores them.
  const monochrome = view.theme.id === 'midnight';
  if (monochrome) {
    parts.push(`.pf-banner,.pf-cover-art>img,.pf-avatar,.pf-person-av,.pf-shot>img,.pf-invite-icon>img{filter:grayscale(1)}`);
  }

  if (view.background) {
    const blur = Math.max(0, Math.min(20, Number(view.background.blur) || 0));
    const rawDim = Number(view.background.dim ?? 40);
    const dim = Number.isFinite(rawDim) ? Math.max(0, Math.min(85, rawDim)) : 40;
    parts.push(`
.pf-bg-media{filter:${monochrome ? 'grayscale(1) ' : ''}blur(${blur}px) saturate(1.05);transform:scale(${1 + blur / 100 + 0.02})}
.pf-bg-dim{opacity:${(dim / 100).toFixed(3)}}`);
  } else if (monochrome) {
    parts.push('.pf-bg-media{filter:grayscale(1)}');
  }

  return parts.filter(Boolean).join('\n');
}

/**
 * Тот же CSS, но для теневого дерева — им рисуется живое превью в редакторе.
 *
 * Превью нельзя показать через iframe: у страницы `/build` в CSP стоит
 * `frame-src 'none'`, и это правильно — редактор не должен уметь вставлять в
 * себя кадры. Значит страница рисуется в shadow DOM на том же документе, а
 * shadow DOM меняет смысл трёх вещей:
 *
 *  1. `:root` внутри теневого дерева не совпадает ни с чем, и все переменные
 *     темы просто не объявились бы. Их место — `:host`.
 *  2. `html` и `body` там тоже не существуют. Их роль играет обёртка `.pf-body`,
 *     поэтому селекторы-элементы переписываются на её класс.
 *  3. `100vh` — высота окна браузера, а не рамки превью: страница вылезла бы за
 *     край и «на телефоне» выглядела бы совсем не так, как на телефоне.
 *
 * Заодно медиазапросы по ширине переводятся в контейнерные: превью в рамке
 * 390px должно показывать телефонную вёрстку, а окно редактора при этом широкое,
 * и обычный @media отдал бы настольную.
 *
 * Логическую высоту рамки задаёт preview.js через --pf-viewport-height.
 * Процентная min-height вложенного shell не вычисляется относительно
 * min-height обёртки: без явной длины компактный профиль теряет центрирование.
 * Переменная даёт ту же высоту, что vh у настоящей страницы, сохраняя прокрутку.
 */
function scopeForShadow(css) {
  return String(css)
    .replace(/:root((?:\.[\w-]+)+)/g, ':host($1)')
    .replace(/:root\b/g, ':host')
    .replace(/(^|[\s,{}>+~])(?:html|body)\b/g, '$1.pf-body')
    .replace(/\b(\d+(?:\.\d+)?)(?:dvh|vh)\b/g, (_match, value) =>
      Number(value) === 100 ? 'var(--pf-viewport-height, 100%)'
        : `calc(var(--pf-viewport-height, 100vh) * ${Number(value) / 100})`)
    .replace(/(\d+(?:\.\d+)?)vw\b/g, '$1cqw')
    .replace(/@media\s*\(\s*((?:max|min)-width\s*:)/g, '@container pf ($1');
}

module.exports = { buildStyles, cssSafe, scopeForShadow };
