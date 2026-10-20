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

function themeVars(view) {
  const t = view.theme.tokens;
  const accent = cssSafe(view.accent, ACCENT_FALLBACK);
  const accentTo = view.accentTo ? cssSafe(view.accentTo, accent) : accent;
  return `
:root{
  --bg:${cssSafe(t.bg, '#090a0c')};
  --bg2:${cssSafe(t.bg2, '#141619')};
  --surface:${cssSafe(t.surface, 'rgba(255,255,255,0.05)')};
  --text:${cssSafe(t.text, '#f2f3f4')};
  --muted:${cssSafe(t.muted, '#a0a5ab')};
  --accent:${accent};
  --accent-to:${accentTo};
  --accent-text:${cssSafe(t.accentText, '#ffffff')};
  --border:${cssSafe(t.border, 'rgba(255,255,255,0.09)')};
  --ui-font:Outfit,"Segoe UI",sans-serif;
  --font:${cssFontStack(view.fontStack, 'system-ui, sans-serif')};
  --radius:18px;
  --grad:linear-gradient(135deg,var(--accent),var(--accent-to));
}`;
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
.pf-cta{display:inline-flex;align-items:center;justify-content:center;gap:9px;max-width:100%;min-height:44px;margin-top:26px;padding:10px 17px;border:1px solid transparent;border-radius:999px;background:var(--grad);color:var(--accent-text);font:500 12px/1.5 var(--ui-font);transition:transform .2s,filter .2s}.pf-cta>svg{flex:none}.pf-cta>span{margin-left:12px;opacity:.6;font-size:15px}.pf-cta:hover{filter:brightness(1.1);transform:translateY(-2px)}
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
.pf-layout-cinema{padding:84px 6vw 36px}.pf-layout-cinema .pf-main{max-width:1160px}.pf-layout-cinema .pf-composition{grid-template-columns:minmax(0,1fr) minmax(280px,370px);align-items:center;gap:clamp(44px,8vw,140px);padding:0}.pf-layout-cinema .pf-author-row{display:block}.pf-layout-cinema .pf-avatar-wrap{width:92px;height:92px;--avatar-size:92px;margin-bottom:34px}.pf-layout-cinema .pf-handle{margin-bottom:14px;letter-spacing:.08em}.pf-layout-cinema .pf-name{font-size:clamp(64px,7.2vw,100px);line-height:.98;letter-spacing:-.055em}.pf-layout-cinema .pf-badges{margin-top:21px}.pf-layout-cinema .pf-intro{margin-top:28px}.pf-layout-cinema .pf-headline{font-size:18px}.pf-layout-cinema .pf-bio{font-size:14px}.pf-layout-cinema .pf-cta{margin-top:30px}.pf-layout-cinema .pf-links{grid-template-columns:minmax(0,1fr)}.pf-layout-cinema .pf-link{min-height:78px;background:color-mix(in srgb,var(--bg) 54%,transparent);border-color:color-mix(in srgb,var(--text) 18%,transparent)}.pf-layout-cinema .pf-player{background:color-mix(in srgb,var(--bg) 65%,transparent);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-color:color-mix(in srgb,var(--text) 18%,transparent)}.pf-layout-cinema .pf-content{gap:18px}.pf-layout-cinema .pf-foot{max-width:1160px;margin-top:70px}.pf-layout-cinema .pf-composition:not(:has(.pf-content>*)){grid-template-columns:minmax(0,1fr)}
@media(max-width:760px){.pf-layout-cinema{padding:44px 26px 24px;justify-content:flex-start}.pf-layout-cinema .pf-composition{grid-template-columns:minmax(0,1fr);gap:38px}.pf-layout-cinema .pf-avatar-wrap{width:82px;height:82px;--avatar-size:82px;margin-bottom:28px}.pf-layout-cinema .pf-name{font-size:64px}.pf-layout-cinema .pf-intro{margin-top:24px}.pf-layout-cinema .pf-headline{font-size:16px}.pf-layout-cinema .pf-bio{font-size:13px}.pf-layout-cinema .pf-link{min-height:70px}.pf-layout-cinema .pf-foot{margin-top:36px}.pf-cover-shade{background:linear-gradient(180deg,color-mix(in srgb,var(--bg) 58%,transparent),color-mix(in srgb,var(--bg) 82%,transparent) 55%,var(--bg)),linear-gradient(90deg,color-mix(in srgb,var(--bg) 45%,transparent),transparent)}}
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
.pf-glow{position:fixed;inset:0;z-index:0;width:100%;height:100%;pointer-events:none;opacity:.35;transition:opacity .8s;background:radial-gradient(ellipse 420px 360px at var(--gx,50%) var(--gy,35%),color-mix(in srgb,var(--accent) 28%,transparent),transparent 75%)}.pf-glow.is-on{opacity:.8}.pf-glow::after{content:'';position:absolute;inset:0;background:radial-gradient(ellipse at 20% 70%,color-mix(in srgb,var(--accent-to) 7%,transparent),transparent 60%);animation:pf-glow-drift 15s ease-in-out infinite alternate}@keyframes pf-glow-drift{to{transform:translate(8%,-5%);opacity:.5}}
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

function buildStyles(view) {
  const parts = [require('./profilePageFonts'), themeVars(view), BASE];

  parts.push(LAYOUT_CSS[view.layout] || '');
  parts.push(FRAME_CSS[view.avatarFrame] || '');

  // Анимация темы отключается, если пользователь поставил свой фон: два
  // движущихся слоя друг поверх друга — это уже не оформление, а мигание.
  if (view.theme.animated && !view.background) {
    parts.push(ANIMATED_THEME_CSS[view.theme.id] || '');
  }

  parts.push(EFFECT_CSS[view.effect] || '');
  parts.push(REDUCED_MOTION);

  // Monochrome is the default look, including uploaded imagery. Other themes
  // keep their original colors, so choosing a different theme restores them.
  const monochrome = view.theme.id === 'midnight';
  if (monochrome) {
    parts.push(`.pf-banner,.pf-cover-art>img,.pf-avatar,.pf-person-av{filter:grayscale(1)}`);
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
    .replace(/:root\b/g, ':host')
    .replace(/(^|[\s,{}>+~])(?:html|body)\b/g, '$1.pf-body')
    .replace(/\b(\d+(?:\.\d+)?)(?:dvh|vh)\b/g, (_match, value) =>
      Number(value) === 100 ? 'var(--pf-viewport-height, 100%)'
        : `calc(var(--pf-viewport-height, 100vh) * ${Number(value) / 100})`)
    .replace(/(\d+(?:\.\d+)?)vw\b/g, '$1cqw')
    .replace(/@media\s*\(\s*((?:max|min)-width\s*:)/g, '@container pf ($1');
}

module.exports = { buildStyles, cssSafe, scopeForShadow };
