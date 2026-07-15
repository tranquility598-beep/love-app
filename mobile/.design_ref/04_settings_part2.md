# Love — Settings Spec, Part 2 (Sections 6–10)

> Source of truth (read verbatim, not guessed):
> - Markup: `client/index.html` (nav ~1148–1196; sections 6–10 ~1502–1716; save bar ~1720–1727)
> - Styles: `client/styles/settings.css`
> - Logic: `client/js/new/settings-ui.js` (main controller), `client/js/new/updates.js` (updates), `client/js/settings.js` (legacy `SettingsManager` = persistence layer), `client/js/preload.js` (Electron IPC bridge)
>
> Scope of this file: nav order (all 10) + sections **6 Голос и звук**, **7 Love Hub**, **8 Обновления**, **9 Расширенные**, **10 О приложении**. Sections 1–5 are covered elsewhere.

---

## 0. Full settings navigation (desktop sidebar order)

Rendered in `<nav class="settings-nav">` (`index.html:1148`). Items are grouped by `<div class="settings-nav-group">` headers. Each item is `<button class="settings-nav-item" data-settings-section="…">` with an inline stroke SVG (24×24, `stroke-width="2"`) + `<span>` label. Clicking calls `showSection()` in `settings-ui.js:43` — toggles `.active` on the matching `<section>` and nav item, updates `#settings-mobile-title`, scrolls content to top; on ≤768px also adds `.section-open` to slide the content panel in.

| # | Group (RU) | `data-settings-section` | Label (RU) | Icon (lucide-style) |
|---|---|---|---|---|
| 1 | Пользователь | `settings-profile` | Профиль | user (head + shoulders) |
| 2 | Пользователь | `settings-account` | Аккаунт | lock / padlock |
| 3 | Пользователь | `settings-privacy` | Конфиденциальность | shield |
| 4 | Приложение | `settings-appearance` | Внешний вид | palette (dots + blob) |
| 5 | Приложение | `settings-notifications` | Уведомления | bell |
| 6 | Приложение | `settings-voice` | Голос и звук | microphone |
| 7 | Приложение | `settings-hub` | Love Hub | heart |
| 8 | Система | `settings-updates` | Обновления | refresh-cw (circular arrows) |
| 9 | Система | `settings-advanced` | Расширенные | gear / settings cog |
| 10 | Система | `settings-about` | О приложении | info circle (ⓘ) |

Default active item on load: **Профиль** (`class="settings-nav-item active"`, `index.html:1151`). Mobile back button `#settings-back-btn` removes `.section-open` (`settings-ui.js:66`).

---

## Persistence model (READ THIS FIRST — it governs sections 6–10)

There are **two** settings systems in the tree; only some controls are actually wired:

1. **`SettingsManager`** (`client/js/settings.js:5`) — the real persistence layer. `window.settingsManager`. `get(key)` reads, `saveSetting(key,val)` writes to **`localStorage` (one key per setting, raw value)** and re-applies. Defaults live in `loadSettings()` (`settings.js:13`).
2. **New-design binder** (`settings-ui.js:1061 initPrefsPersistence`) — only binds `input[type=checkbox][data-setting-key]` and `#lvs-scale-slider`/theme. **In sections 6–10 there is NOT A SINGLE `data-setting-key`** (grep of `index.html` finds `data-setting-key` only at lines 1444 `compact-mode` and 1448 `animations`, both in section 4 Appearance).

**Consequence for the port:** the toggles rendered in **section 6 (Шумоподавление / Эхоподавление / Активация по голосу)** and **all of section 7 (Love Hub)** are **visual-only in the current web build** — they have no `id`, no `data-setting-key`, and no change handler. They render from their hard-coded `checked` attribute and are only reset (to that same attribute) by `resetSettings()` (`settings-ui.js:672`, triggered by section-9 "Сбросить"). They are **not saved anywhere**.

The **legacy** `SettingsManager` DOES define matching voice keys (used by the actual WebRTC path in `voice.js` via `getVoiceAudioConstraints()`), but those keys are bound to the OLD settings DOM (`initializeSettingsUI` in `settings.js:239`, ids without the `lvs-` prefix), NOT the new `lvs-…` markup. Relevant legacy keys/defaults (`settings.js:22`):

| Legacy key | Default | Read by |
|---|---|---|
| `voice-input-device` | `'default'` | `getVoiceAudioConstraints()` `settings.js:370` |
| `voice-output-device` | `'default'` | `applyAudioOutputDevice()` `settings.js:384` |
| `input-volume` | `100` | — |
| `output-volume` | `100` | `applyAudioOutputDevice` vol, sound-manager, voice-messages |
| `noise-suppression` | `true` | `getVoiceAudioConstraints` → `noiseSuppression` |
| `echo-cancellation` | `true` | `getVoiceAudioConstraints` → `echoCancellation` |
| `auto-gain-control` | `true` | `getVoiceAudioConstraints` → `autoGainControl` |
| `voice-activation` | `false` | — |

> **Port recommendation:** to reach 1:1 *behavior* (not just 1:1 pixels) the mobile app should persist the section-6 toggles to these keys and feed them into the mic-capture `getUserMedia` constraints, since that is the real desktop audio contract. Flag: web build currently does NOT wire them — decide whether mobile mirrors the (broken) web state or the intended contract.

---

## Section 6 — Голос и звук  (`#settings-voice`, `index.html:1503–1564`)

Header: title **«Голос и звук»**, desc **«Микрофон, динамики и обработка»** (`.lvs-section-head`).
Controller: `initVoice(shell)` + `initSliders(shell)` in `settings-ui.js`.

### Card 1 — Input / microphone

| Control | id | Type | Label (RU) | Default | Backing logic |
|---|---|---|---|---|---|
| Устройство ввода | `#lvs-input-device` | custom `.lvs-select` (`data-value="default"`) | «Устройство ввода» | «Микрофон по умолчанию» (`data-value=default`) | `populateDevices()` → `fillSelect()` `settings-ui.js:587,596` fills menu from `navigator.mediaDevices.enumerateDevices()` filtered to `kind==='audioinput'`; label fallback `Микрофон N`. Selection updates `dataset.value` + button label only — **not persisted**. |
| Громкость ввода | `#lvs-mic-volume` | `<input type="range">` min 0 / max 100 | «Громкость ввода» | **80** | `bindSlider('#lvs-mic-volume','#lvs-mic-volume-value', v=>v+'%')` `settings-ui.js:474`. Writes text to `#lvs-mic-volume-value` (shows `80%`). No persistence. |
| (mic level meter) | `#lvs-mic-meter` | `.lvs-meter-fill` bar | — | width `0%` | Driven live only while mic test runs. |
| Проверить микрофон | `#lvs-mic-test` | `.lvs-btn` | «🎙 Проверить микрофон» | — | Click toggles a live meter: `getUserMedia({audio:true})` → `AudioContext` `AnalyserNode` (`fftSize=256`), RAF loop sets `#lvs-mic-meter` width = `min(100,(avg)*1.6)%`; button text → «⏹ Остановить»; second click stops & resets to `0%`. On permission failure text → «🎙 Нет доступа к микрофону» for 2 s. `settings-ui.js:519–564`. |

### Card 2 — Output / speakers

| Control | id | Type | Label (RU) | Default | Backing logic |
|---|---|---|---|---|---|
| Устройство вывода | `#lvs-output-device` | custom `.lvs-select` (`data-value="default"`) | «Устройство вывода» | «Динамики по умолчанию» | `fillSelect()` with `kind==='audiooutput'`, fallback `Динамик N`. Not persisted. |
| Громкость вывода | `#lvs-out-volume` | `range` 0–100 | «Громкость вывода» | **100** | `bindSlider('#lvs-out-volume','#lvs-out-volume-value', v=>v+'%')` `settings-ui.js:475`. Shows `100%`. No persistence. |
| Проверить звук | `#lvs-sound-test` | `.lvs-btn` | «🔊 Проверить звук» | — | Click plays a 440 Hz sine "beep" via WebAudio: gain ramps 0.0001→0.2 (20 ms) →0.0001 (400 ms), osc stops at 0.42 s. `settings-ui.js:567–584`. |

### Card 3 — Processing toggles (VISUAL-ONLY, see persistence note)

| Control | Type | Label / sub (RU) | Default (checked attr) | Backing |
|---|---|---|---|---|
| Шумоподавление | `.lvs-toggle` checkbox | «Шумоподавление» | **on** (`checked`) | none in new build; intended `noise-suppression` |
| Эхоподавление | `.lvs-toggle` checkbox | «Эхоподавление» | **on** (`checked`) | intended `echo-cancellation` |
| Активация по голосу | `.lvs-toggle` checkbox | «Активация по голосу» | **on** (`checked`) | intended `voice-activation` (legacy default is `false` — mismatch) |
| Push-to-Talk | static `<kbd class="lvs-kbd">` | «Push-to-Talk» / sub «Говорить при зажатой клавише» | keycap **`V`** | display only, no rebind UI |

> No `id`/`data-setting-key` on any Card-3 checkbox. `resetSettings()` restores each to its `checked` attribute.

---

## Section 7 — Love Hub  (`#settings-hub`, `index.html:1567–1596`)

Header: title **«Love Hub»**, desc **«Уведомления из центра сообщества»**.
No dedicated controller — **all toggles are visual-only** (no id, no key, no handler).

| Control | Type | Label (RU) | Sub-label (RU) | Default |
|---|---|---|---|---|
| Анонсы | `.lvs-toggle` checkbox | «Анонсы» | «Новости и важные объявления» | **on** (`checked`) |
| Dev Log | `.lvs-toggle` checkbox | «Dev Log» | «Заметки разработки» | **on** (`checked`) |
| Идеи | `.lvs-toggle` checkbox | «Идеи» | «Предложения сообщества» | **off** (no `checked`) |
| Обратная связь | `.lvs-toggle` checkbox | «Обратная связь» | «Ответы на ваши отзывы» | **on** (`checked`) |

Info banner (`.lvs-info-banner`, ⓘ icon): text **«Вы подписаны на `<b>`3 из 4`</b>` каналов Love Hub.»** — the "3 из 4" is **hard-coded static markup**, not computed from the toggles (`index.html:1594`).

---

## Section 8 — Обновления  (`#settings-updates`, `index.html:1599–1637`)

Header: title **«Обновления»**, desc **«Версия и канал обновлений»**.
Controller: `client/js/new/updates.js` (Electron-updater bridge). `initUpdates()` (`settings-ui.js:681`) just calls `window.renderUpdatesSection()` (= `paint()`), and `initVersions()` (`settings-ui.js:698`) seeds version text.

**Web/mobile fallback (no `electronAPI`):** module short-circuits at `updates.js:24`. On DOMContentLoaded it hides the check button (`#lvs-check-updates` → `display:none`), hides the beta-channel row (`beta.closest('.lvs-row')` → `display:none`), and sets status text to:
- mobile (`window.Capacitor` or UA matches `Android|iPhone|iPad`): **«Новые версии — на loveapp.chat»**
- otherwise: **«Авто-обновления — в десктоп-приложении»**

### Controls

| Control | id | Type | Label (RU) | Default text | Backing |
|---|---|---|---|---|---|
| Текущая версия | `#settings-updates-version` | `.lvs-badge` | «Текущая версия» | `2.0.0` | `initVersions` sets to `getAppVersion()` = `electronAPI.getVersion()` (reads `package.json` version, else `2.0.0`) `settings-ui.js:691` / `preload.js:23`; also repainted in `paint()` `updates.js:72`. |
| Статус | `#settings-updates-status` | `.lvs-badge` (success variant) | «Статус» | «Актуальная версия» (green) | Text/class set by `paint()` per `state.status` — table below. |
| Получать бета-версии | `#lvs-beta-channel` | `.lvs-toggle` checkbox | «Получать бета-версии» / sub «Новые функции раньше всех — но могут быть нестабильны» | **off** | `change` handler `updates.js:241`: persists `localStorage['love_update_channel']='beta'|'stable'`, calls `electronAPI.setUpdateChannel(beta)` (IPC `set-update-channel`, arg = allowPrerelease bool), re-checks, toasts «Канал: Beta/Stable». Reflected on paint via `betaEl.checked = isBetaChannel()`. |
| Загрузка обновления (progress row) | `#settings-updates-progress` | row, `display:none` by default | «Загрузка обновления» | hidden | Shown during `available`/`downloading`. Fill bar `#settings-updates-progress-fill` (inline: `height:100%;background:#fff;transition:width .25s`), pct badge `#settings-updates-progress-pct` («0%»). Width = `max(2,percent)%`, pct = `round(percent)`. |
| Проверить обновления | `#lvs-check-updates` | `.lvs-btn` | «Проверить обновления» | visible (desktop) | Delegated click `updates.js:229`: if not already checking/downloading → `state='checking'`, `paint()`, `electronAPI.checkForUpdates()` (IPC `check-for-updates`); 9 s watchdog reverts to `not-available` if silent. |
| (action button) | `#settings-updates-action` | `.lvs-btn`, `display:none` (white bg) | dynamic | hidden | Label/handler set by `paint()`: «Загрузка…» (disabled), «Перезапустить и установить» → `electronAPI.installUpdate()` (IPC `install-update`), or «Скачать с сайта» → `electronAPI.openExternal('https://loveapp.chat')`. |

### Status state machine (`updates.js:98 paint()`, driven by `onUpdateMessage` `updates.js:185`)

IPC channel in: `updater-message` (`preload.js:37`), `data.type` ∈ checking/available/progress/downloaded/not-available/error.

| `state.status` | Status badge text | Extra UI |
|---|---|---|
| `idle` / default | «Актуальная версия» (success) | check btn visible |
| `checking` | «Проверка обновлений…» | check btn disabled, text «Проверка…» |
| `available` / `downloading` | «Доступно v`<v>`» (success), or «Доступно обновление» | check btn hidden; progress row shown; action btn «Загрузка…» (disabled); changelog card shown |
| `downloaded` | «Готово к установке v`<v>`» (success) | action btn «Перезапустить и установить» (enabled) → install |
| `not-available` | «Актуальная версия» (success) | — |
| `error` | «Не удалось проверить» | action btn «Скачать с сайта» → openExternal loveapp.chat |

### Changelog card (`#settings-updates-changelog-card`, `display:none` default)

- Title `#settings-updates-changelog-title` = «Что нового в v`<v>`» (or «Что нового»).
- Body `#settings-updates-changelog` (`.lvs-changelog`): items built from `state.info.releaseNotes` via `parseNotes()` (`updates.js:53`) — strips HTML, splits on `</p>/</li>/</div>/</hN>` + newlines, strips leading `-*•#>`, max 12 lines; empty → single «Улучшения и исправления.». Each item is a `<div.lvs-changelog-item>` prefixed «• » (inline style: 14px, `rgba(255,255,255,.7)`).
- Shown only for available/downloading/downloaded when a version or notes exist.

Toast helper (`updates.js:178`) uses `window.showAppNotification({useHeart:true,onClick:openUpdatesSection})`. `openUpdatesSection()` clicks `#nav-settings` then the `settings-updates` tab.

Persisted key: **`love_update_channel`** = `'stable' | 'beta'` (localStorage). Boot applies it via `setUpdateChannel(isBetaChannel())` (`updates.js:258`).

---

## Section 9 — Расширенные  (`#settings-advanced`, `index.html:1640–1672`)

Header: title **«Расширенные»**, desc **«Для продвинутых пользователей»**.
Warning banner (`.lvs-warning-banner`, ⚠ icon, amber `#e8b341`): **«Изменяйте эти настройки, только если понимаете последствия.»**
Controllers: `initAdvanced()` (`settings-ui.js:710`) + `initDangerActions()` (`settings-ui.js:620`).

| Control | id | Type | Label / sub (RU) | Default | Persist key | Backing logic |
|---|---|---|---|---|---|---|
| Режим отладки | `#lvs-debug-mode` | `.lvs-toggle` checkbox | «Режим отладки» / «Подробные логи в консоли» | **off** | `localStorage['love_debug_mode']` (`'true'`/`'false'`) | `settings-ui.js:712`: on load reads key; sets `window.__LOVE_DEBUG`; change writes key + logs «[Love] Режим отладки включён.» |
| Аппаратное ускорение | `#lvs-hw-accel` | `.lvs-toggle` checkbox | «Аппаратное ускорение» / «Использовать GPU для отрисовки» | **on** (`checked`; on = key ≠ `'off'`) | `localStorage['love_hw_accel']` (`'on'`/`'off'`) | `settings-ui.js:725`: change writes key, then `electronAPI.restartForHwAccel(bool)` if present, else toast «Перезапустите приложение / Изменение вступит в силу после перезагрузки.» |
| Кэш приложения | (button `#lvs-clear-cache`, sub `#lvs-cache-size`) | `.lvs-btn` | «Кэш приложения» / «Занято 128 МБ» (placeholder) | live | — | `settings-ui.js:633`: `#lvs-cache-size` refreshed via `window.ProfileMusic.getCacheSizeBytes()` → «Занято N.N МБ/КБ» (`fmtMB`). Clear: disables btn, text «Очистка…», `ProfileMusic.clearCache()`, sets «Занято 0 МБ», «Готово», restores «Очистить» after 1.2 s. |
| Диагностика | `#lvs-diagnostics` | `.lvs-btn` | «Диагностика» / «Сведения о среде выполнения» | — | — | `settings-ui.js:740`: `console.table({version,userAgent,platform,language,online,screen,viewport,timezone})` + toast «Диагностика / Сведения выведены в консоль (F12 → Console).» |
| Сбросить все настройки | `#lvs-reset-settings` | `.lvs-btn.lvs-btn--danger` | «Сбросить все настройки» / «Вернуть приложение к настройкам по умолчанию. Действие необратимо.» | — | — | `settings-ui.js:626`: `window.confirm('Сбросить все настройки к значениям по умолчанию?')` → `resetSettings()`: every `.lvs-toggle input` reset to its `checked` attr; `#lvs-scale-slider`→100; clears `documentElement.style.fontSize`. |

> ⚠ **Markup bug to preserve or fix on port:** the «Диагностика» row `<div class="lvs-row">` at `index.html:1664` is **not closed** before the «Сбросить все настройки» row opens (`:1667`), so the reset row is DOM-nested inside the diagnostics row. Renders acceptably but is malformed — the mobile port should lay these out as two sibling rows.

`initDangerActions` also wires `#lvs-delete-account` (Account section, out of scope) with `confirm('Удалить аккаунт безвозвратно? …')`.

---

## Section 10 — О приложении  (`#settings-about`, `index.html:1675–1716`)

Header: title **«О приложении»**, desc **«Информация о Love»**.
Single centered `.lvs-card.lvs-about-card`. Controllers: `initAbout()` (`settings-ui.js:760`, stub links) + `initVersions()` (`settings-ui.js:698`, version/build badges).

| Element | id | Content | Backing |
|---|---|---|---|
| Logo | — | heart SVG (filled, 52px, white glow) | static |
| App name | — | **«L O V E»** (serif, 30px, letter-spacing 6px) | static |
| Version badge | `#settings-about-version` | «v2.0.0» | `initVersions`: `'v' + getAppVersion()` (`settings-ui.js:701`) |
| Build badge | `#settings-about-build` | «build» → «build YYYYMMDD» | `initVersions`: `'build ' + new Date().toISOString().slice(0,10).replace(/-/g,'')` (`settings-ui.js:704`) — today's date, recomputed each open |
| Tagline | — | «Мессенджер, сделанный с любовью.» | static |
| Divider | `.lvs-divider` | — | static |
| Credits header | `.lvs-section-subtitle` | «Команда» | static |
| Credit row | `.lvs-credit-row` | name «Александр» / role «Основатель» | static |

### Links (`.lvs-about-links`)

| Link | Attr | Label (RU) | Behavior |
|---|---|---|---|
| Сайт | `<a href="https://loveapp.chat" target="_blank" rel="noopener">` (globe icon) | «Сайт» | real external link |
| Документация | `<a href="#" data-stub="docs">` (file icon) | «Документация» | **stub**: `initAbout` `settings-ui.js:760` — `preventDefault`, label→«Скоро» for 1.4 s, then restore |
| Поддержка | `<a href="#" data-stub="support" id="lvs-support-link">` (chat icon) | «Поддержка» | same stub behavior |

Footer: mail **«support@loveapp.chat»** (`.lvs-about-mail`, mono) + **«Сделано с ♥»** (`.lvs-about-made`, inline heart SVG `.lvs-inline-heart`).

---

## Global save bar & dirty tracking (applies while ANY section open)

Markup `#lvs-save-bar` (`index.html:1720`): text «Есть несохранённые изменения», buttons `#lvs-reset-btn` «Сбросить» (ghost) + `#lvs-save-btn` «Сохранить». Controller `initDirtyTracking()` (`settings-ui.js:778`).

- **Dirty state tracks ONLY the Profile form fields** (name/username/bio/status/listening/mood/avatar/hobbies — `checkDirty()` `settings-ui.js:816`). Toggling anything in sections 6–10 does **not** mark the bar dirty or trigger a save. Save writes profile only via `UsersAPI.updateProfile` / `UsersAPI.uploadAvatar`.
- Bar visibility: `saveBar.classList.toggle('visible', dirty)`.
- Close/nav-away with dirty → confirm modal `#lvs-close-confirm`; Esc closes; overlay mousedown closes.
- Mobile (`settings.css:795`): save bar becomes fixed full-width bottom bar (`border-radius:0`), and its text label is hidden (`.lvs-save-bar-text{display:none}`) — only the two buttons show.

---

## Mobile / responsive CSS overrides (`settings.css`)

**≤1024px** (`:1000`): sidebar width var → 210px; content padding 32px; split grids collapse to 1 col; preview card `position:static`.

**≤768px** (`:1008`) — the phone layout, a two-pane push stack:
- `#view-settings`: fullscreen, `padding:0`, solid `--bg-primary`, no backdrop blur.
- `.settings-shell`: 100%×100%, no radius/border/shadow/animation, `position:relative`.
- `.settings-sidebar`: full width (list of nav items), no right border. `.settings-nav-item`: min-height 50px, 15px font. Icons 20px.
- `.settings-content`: `position:absolute; inset:0; z-index:10; transform:translateX(100%)`, transition 0.32s cubic-bezier — **slides in** when `.settings-shell.section-open` is present (added on nav-item tap, removed by `#settings-back-btn`).
- `.settings-mobile-header` (`#settings-back-btn` + `#settings-mobile-title`) becomes visible (`display:flex`); desktop it's hidden.
- Rows wrap (`.lvs-row{flex-wrap:wrap}`); `.lvs-slider-wrap{min-width:100%}` (slider takes full row under its label); `.lvs-select{min-width:150px}`.
- Section title 23px; section-head margin 18px; scroll padding 16px.

**≤420px** (`:1068`): theme grid → 1 col; avatar row stacks (section 4, out of scope).

### Key visual tokens used by these sections
- `.lvs-badge`: mono 11.5px, pill (`radius 999px`), translucent. `--success` variant → green text `--settings-success` on `--settings-success-bg`, border `rgba(76,185,106,.25)`.
- `.lvs-meter` 8px pill track; `.lvs-meter-fill` gradient green→yellow→red (`#4cb96a→#b9d34c→#e5544f`), `transition width .08s`.
- `.lvs-kbd`: mono 12px keycap, 2px bottom border, min-width 28px.
- `.lvs-btn`: 9×16px, 13.5px; `--ghost` transparent; `--danger` white-on-`--settings-danger`, hover `#d13b36`.
- `.lvs-warning-banner`: amber `#e8b341` on `rgba(232,179,65,.07)`. `.lvs-info-banner`: secondary text, card bg; `<b>` → primary text.
- `.lvs-changelog` items 13.5px secondary; about name serif 30px / spacing 6px.
