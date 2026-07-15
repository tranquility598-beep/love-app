# 05 — Love Hub (Bento Dashboard) — Design & Behavior Spec

Source of truth (read verbatim from the web/Electron client):
- Markup: `client/index.html` — view at lines ~969–1054 (`id="view-hub"`); modals at ~1925–1992.
- Logic: `client/js/new/script.js` — Love Hub section at lines ~4865–5493 (plus view-switch hook at ~176, admin toggle at ~5916–5953).
- Styles: `client/styles/style.css` — buttons ~1519–1554; status tags ~1875–1975; bento grid/cards ~5940–6151; modal cards ~8561–8825; mobile `@media (max-width:768px)` at ~10863–11025; devlog ~13720–13990.

> **CRITICAL ARCHITECTURE NOTE:** The Love Hub is **100% static / mock**. There are **no REST endpoints and no socket events** backing any cell, list, form, or vote. All content is hard-coded JS arrays and template literals in `script.js`. The only persistence is `localStorage` for Dev Log votes. Submissions (new update, hero edit, devlog post) mutate in-memory arrays only and are **lost on reload**. "Идеи"/"Баги" forms and lists are intentionally "coming soon" placeholders. Port this 1:1 as a local/static screen unless the backend spec says otherwise.

App version: `APP_VERSION` = `window.electronAPI.getVersion()` in Electron, else fallback string `'2.0.4'` (`script.js:4872`). On mobile (no electronAPI) use the native app version; fallback `'2.0.4'`.

---

## 1. View container & header

Root: `<div id="view-hub" class="view-panel panel-hidden">` → `<main class="hub-bento-dashboard">`.
Activated by the global nav; switching to `view-hub` calls `loadHub()` (`script.js:176-177`), which calls `updateHubBentoPreview()`.

Top-left floating control: `<button class="sidebar-toggle-trigger">` (chevron `‹`) — collapses side panels (shared control, not hub-specific).

Header `<header class="bento-header">`:
- `<h1 class="sidebar-title">` **"Love Hub"** (32px, serif).
- Subtitle `<p>` **"Центр управления сообществом и обновлениями"** (15px, `--text-secondary`).
- Actions row `<div class="hub-header-actions">` (flex, gap 10px, wraps).

### Header action buttons

| # | Label (RU) | id | Class | Admin-only | Handler → action |
|---|-----------|-----|-------|:---:|------------------|
| 1 | `Dev Log` | `hub-devlog-btn` | `hub-btn hub-btn-primary` | no | `initDevLog()` binds click → `openDevLog()` → `renderDevLog()` + show `#devlog-modal` |
| 2 | `История обновлений` | `hub-view-updates-btn` | `hub-btn hub-btn-ghost` | no | `openHubListModal("updates")` (`script.js:5214`) |
| 3 | `Все идеи` | `hub-view-ideas-btn` | `hub-btn hub-btn-ghost` | no | `openHubListModal("ideas")` (`:5217`) |
| 4 | `Все баги` | `hub-view-bugs-btn` | `hub-btn hub-btn-ghost admin-only hidden` | **yes** | `openHubListModal("bugs")` (`:5220`) |
| 5 | `Написать обновление` | `hub-add-update-btn` | `hub-btn hub-btn-primary admin-only hidden` | **yes** | `openHubFormModal("update")` (`:5223`) |
| 6 | `Предложить идею` | `hub-suggest-btn` | `hub-btn hub-btn-ghost` | no | `openHubFormModal("idea")` (`:5226`) |
| 7 | `Сообщить об ошибке` | `hub-report-bug-btn` | `hub-btn hub-btn-ghost` | no | `openHubFormModal("bug")` (`:5229`) |

Admin-only: elements carry classes `admin-only hidden`. Global "Режим разработчика" toggle (`#toggle-admin-btn`, `script.js:5916`) flips `isAdminMode` and adds/removes `.hidden` on every `.admin-only`. There is **no server permission check** — it's a purely client-side dev flag.

`.hub-btn`: height 40px, padding 0 18px, radius `--radius-md`, font 13.5px/500. `hub-btn-primary` = white bg / black text. `hub-btn-ghost` = `rgba(255,255,255,0.05)` bg, 1px `rgba(255,255,255,0.12)` border, white text. Hover lifts `translateY(-1px)`.

---

## 2. Bento grid cells (`.bento-grid`)

Grid: `grid-template-columns: repeat(4, 1fr)`, 3 auto rows, gap 20px. Cards `.bento-card`: bg `rgba(255,255,255,0.03)`, 1px `rgba(255,255,255,0.05)` border, radius `--radius-xl`, padding `--spacing-lg`, `overflow:hidden`. Hover: `translateY(-2px)`, brighter bg/border. Most cards show a `.bento-corner-icon` (18px arrow ↗ SVG, top-right, nudges on hover).

| Cell | Class(es) / id | Grid span | Static content (RU) | Dynamic? | Click behavior |
|------|----------------|-----------|---------------------|----------|----------------|
| Hero | `bento-card bento-hero` | col span 3 / row span 2 | tag `Текущая версия`; `<h2 id="hub-hero-title">` set to **"Love App v{APP_VERSION}"**; `<p id="hub-hero-desc">` default "Спасибо, что вы с нами. Полная история обновлений и голосование за идеи появятся в одном из ближайших релизов." | title set by `updateHubBentoPreview()` (`:4915`) | whole card → `openHubListModal("updates")` (ignores clicks on button/`a`) |
| Version stat | `bento-card bento-stat` | col span 1 / row span 2 | `<h3>` **"Версия"**; `<div class="stat-value" id="hub-version-value">` set to **"v{APP_VERSION}"** (default "—"); `<div class="stat-trend">` **"установлена"** | value set by `updateHubBentoPreview()` (`:4913`) | none |
| Top idea | `bento-card bento-idea` | col span 2 | Re-rendered by `updateHubBentoPreview()` to: tag `Идеи` + status `Скоро`, `<h3>` **"Голосование за идеи"**, `<p>` "Голосуйте за лучшие предложения в реальном времени. Функция появится в следующем обновлении." | innerHTML rewritten (`:4919-4929`) | whole card → `openHubListModal("ideas")` |
| Useful links | `bento-card bento-actions` | col span 2 / row span 1 | `<h3>` **"Полезное"**; 3 links (see §3) | static | per-link (see §3) |
| Minor update | `bento-card bento-minor` | col span 2 | tag `Обновления`, `<h3>` **"История версий"**, `<p>` "Полный список изменений будет доступен здесь." | static | whole card → `openHubListModal("updates")` |
| Dev Log | `bento-card bento-devlog` id=`bento-devlog-card` | col span 2 | tag `Dev Log`, `<h3>` **"Заметки разработки"**, `<p>` "Голосуйте за идеи и направление развития — [heart] за, [broken-heart] против." (inline SVG hearts), CTA `<span class="bento-devlog-cta">` **"Открыть и проголосовать"** | static | whole card → open Dev Log modal |

Note: an HTML `bento-idea` initial markup exists (h3 "Скоро", status "В разработке") but is immediately overwritten by `updateHubBentoPreview()` on load. There is **no** `.bento-bug` card in the current HTML — JS references it defensively (`if (bentoBugCard)`), so bug handlers/queries never fire from the grid. The "Все баги" path is header-button + admin-only only.

Bento tags `.bento-tag`: 11px uppercase, radius `--radius-sm`, margin-bottom 16px. Variants `idea`/`bug`/`update` = translucent white; `devlog` = solid white bg / black text. Bug priority accents (`.bento-tag.bug.critical/high/medium/low`) and `.bug-status.in-progress/investigating/fixed` colors exist in CSS (§7) but are unused by current markup.

---

## 3. "Полезное" (Useful links) card

Container `.bento-action-links` (vertical, gap 12px). Each `<a>` is a pill (bg `rgba(255,255,255,0.02)`, radius 10px, space-between).

| Link text (RU) | id | Handler | Result |
|----------------|-----|---------|--------|
| `Правила сообщества ↗` | `hub-link-rules` | `openHubInfoModal("rules")` (`:5285`) | fills `#hub-info-modal` with `HUB_INFO_CONTENT.rules` |
| `Roadmap проекта ↗` | `hub-link-roadmap` | `openHubInfoModal("roadmap")` (`:5288`) | fills `#hub-info-modal` with `HUB_INFO_CONTENT.roadmap` |
| `Сообщить об ошибке ↗` | `hub-link-report-bug` | `openHubFormModal("bug")` (`:5291`) | opens the "Сообщить об ошибке" placeholder form |

All handlers `e.preventDefault()` (hrefs are `#`).

### HUB_INFO_CONTENT (`script.js:5232-5271`) — rendered into `#hub-info-modal-body`

**Rules** — title "Правила сообщества". Lead: "Love — это уютное пространство. Чтобы всем здесь было хорошо, придерживайтесь нескольких простых правил." Ordered list (`.hub-info-list`):
1. **Уважение.** Никаких оскорблений, травли и дискриминации. Относитесь к другим так, как хотели бы, чтобы относились к вам.
2. **Без спама.** Не засоряйте чаты рекламой, флудом и повторяющимися сообщениями.
3. **Безопасность.** Не делитесь чужими личными данными и не выдавайте себя за других людей.
4. **Контент 18+.** Запрещён нелегальный и оскорбляющий контент. Будьте тактичны.
5. **Помощь.** Нашли нарушение — сообщите через «Сообщить об ошибке» или поддержку.

Note (`.hub-info-note`): "Нарушение правил может привести к ограничению доступа к приложению."

**Roadmap** — title "Roadmap проекта". Lead: "Над чем мы работаем и что ждёт Love в ближайших обновлениях." Items (`.hub-roadmap-item` with badge):

| Badge (RU) | State class | Title | Description |
|-----------|-------------|-------|-------------|
| `Готово` | `done` | Новый дизайн (Wabi-Sabi) | Полностью переработанный визуальный стиль приложения. |
| `В работе` | `progress` | Голосовые комнаты 2.0 | Новый дизайн войса с «орбами присутствия» и адаптивом. |
| `Запланировано` | `planned` | Кастомные звуки и стикеры | Загрузка своих звуков уведомлений и наборов стикеров. |
| `Запланировано` | `planned` | Веб-версия Love | Доступ к приложению прямо из браузера, без установки. |

---

## 4. Modals

Four modals, all `.modal-backdrop.hidden` toggled by add/remove `hidden` class. Card `.hub-modal-card`: bg `rgba(10,10,10,0.96)`, blur 30px, radius 20px, padding 28px 32px, slide-in animation `hubModalSlideIn` 0.35s. Header `.hub-modal-header` = title (serif italic 22px) + close btn `.profile-close-btn` (× SVG). Close on: close button, backdrop click (`e.target === modal`), and Escape (`script.js:5456`, for list+form modals).

### 4a. List modal — `#hub-list-modal` (`.hub-fullscreen-card`, 820px / 92vw, height 80vh / max 800px)
Title `#hub-modal-title`; body `#hub-modal-list-container`. Driven by `openHubListModal(type)` (`:4987`), `currentModalType` tracks type.

| type | Title | Content |
|------|-------|---------|
| `ideas` | "Идеи сообщества" | Empty-state placeholder: 💡 + **"Голосование за идеи"** + "Раздел предложений и народного голосования появится в следующем обновлении после запуска админ-панели." |
| `bugs` | "Баг-трекер" | Empty-state placeholder: 🐛 + **"Публичный баг-трекер"** + "Отслеживание ошибок и ход их исправления разработчиками будут доступны в ближайшее время." |
| `updates` | "История обновлений" | `renderUpdatesList()` → real list from `mockHubUpdates` (see §5). Empty → "История обновлений пуста." |

### 4b. Form modal — `#hub-form-modal` (`.hub-form-card`, 480px / 90vw)
Title `#hub-form-modal-title`; body `#hub-form-container`. Driven by `openHubFormModal(type)` (`:5051`). Dismiss buttons carry `data-hub-dismiss` (delegated close, bound once).

| type | Title | Content |
|------|-------|---------|
| `idea` | "Предложить идею" | Placeholder: 💡 + **"Функция появится позже"** + "Раздел народных предложений и голосования за идеи находится на стадии проектирования." + button **"Понятно"** (`data-hub-dismiss`) |
| `bug` | "Сообщить об ошибке" | Placeholder: 🐛 + **"Раздел в разработке"** + "Отправка баг-репортов и публичное отслеживание ошибок будут реализованы в ближайшем обновлении." + button **"Понятно"** |
| `update` | "Опубликовать обновление" | **Working admin form** (see §6) |

### 4c. Dev Log modal — `#devlog-modal` (`.hub-fullscreen-card`)
Header: `<h3>` "Dev Log" + subtitle "Заметки разработки. Голосуйте за идеи — [heart] за, [broken] против." Content: admin-only composer `#devlog-composer` (`admin-only hidden`) + feed `#devlog-feed`. See §8.

### 4d. Info modal — `#hub-info-modal` (`.hub-fullscreen-card`)
Title `#hub-info-modal-title`; body `#hub-info-modal-body.hub-info-body`. Fed by §3.

---

## 5. Updates history data (`mockHubUpdates`, `script.js:4876`)

In-memory array; renders newest-first via `renderUpdatesList()` (`:4951`). Seed entry (index 0):

| Field | Value |
|-------|-------|
| version | `"v" + APP_VERSION` |
| date | `""` (empty) |
| tag | `"Текущая версия"` |
| title | `"Love App v" + APP_VERSION` |
| desc | "Уведомления: нативные на ПК, категории в панели, рабочие заявки. Камера-флип на мобиле." |
| changes[] | 1) "Панель уведомлений: вкладки «Обычные» и «Системные»" · 2) "Заявки в друзья прямо из уведомлений — кнопки «Принять» / «Отклонить»" · 3) "Нативные ПК-уведомления при свёрнутом окне (сообщения, заявки, упоминания, звонки) + иконка" · 4) "Кнопка разворота камеры (фронт/зад) на мобиле" · 5) "Авто-обновления и канал Beta (из 2.0.3)" |

Row markup `.hub-list-item.update-item`: title (16px) + tag pill (`.bento-tag.update`) + date (`--text-muted`) + version (mono, right) + desc + `<ul class="hub-update-changes-list">` of `.hub-update-change-bullet` (disc bullets). Each row `animation-delay = index * 0.04s`. All text passed through `escapeHTML()` (alias of global `escHTML`).

---

## 6. "Опубликовать обновление" form (admin, `openHubFormModal("update")`)

Intro `<p>`: "Добавьте информацию о новом релизе или обновлении. Она сразу же появится в истории обновлений."

| Field | id | Type | Placeholder / options | Required |
|-------|-----|------|-----------------------|:--------:|
| Title | `hub-new-update-title` | `text` (`.profile-status-input`) | "Название обновления (например, Новые анимации)..." | **yes** |
| Version | `hub-new-update-version` | `text` (`.profile-status-input`, flex) | "Версия (v5.3.0)..." | **yes** |
| Tag | `hub-new-update-tag` | native `<select>` (flex, 38px) | options: `Major Release` (default/selected), `Minor Release`, `Улучшение`, `Исправление` | no |
| Description | `hub-new-update-desc` | `<textarea rows=2>` (min-h 50px) | "Краткое описание обновления..." | no |
| Changes | `hub-new-update-changes` | `<textarea rows=4>` (min-h 80px) | "Список изменений (каждое изменение с новой строки)..." | no |
| Submit | `hub-submit-update-btn` | button `.submit-action-btn` | "Опубликовать обновление" | — |

Submit handler (`script.js:5115-5162`):
- Trims all; if `!title || !version` → `showToast("Ошибка", "Заполните название и версию обновления.")` and abort.
- `changes` split by `\n`, trimmed, empties dropped; if none → `["Внутренние оптимизации и исправления."]`.
- `mockHubUpdates.unshift({ id: Date.now(), title, version, tag, date: new Date().toLocaleDateString('ru-RU', {day:'2-digit',month:'2-digit',year:'numeric'}), desc: desc||"Без описания", changes })`.
- `showToast("Обновление опубликовано", "Версия {version} добавлена в историю.")`.
- Updates the hero card: `#hub-hero-title` → "Обновление Love App {version}", `#hub-hero-desc` → desc||title, `.bento-hero .bento-tag` → tag.
- Closes form modal; if the list modal is open on `updates`, re-renders it.
- **No network call.** Data is in-memory only.

---

## 7. Hero inline-edit (admin) — `#hub-hero-edit-btn`

Button "Редактировать" (`submit-action-btn admin-only hidden`, absolute bottom-right of hero). Handler (`script.js:5469`): toggles `contentEditable` on `#hub-hero-title` + `#hub-hero-desc`, adds `.editing-active` (dashed outline), label flips **"Редактировать" ↔ "Сохранить"**, focuses title. On save → `showToast("Объявление обновлено", "Новый анонс сохранен в Love Hub.")`. **Not persisted** (edits DOM only). Turning off admin mode while editing reverts editing state (`:5931-5943`).

---

## 8. Dev Log (`script.js:5300-5431`)

Data `devLogPosts` (in-memory, seeded 3 posts by author "Александр"):

| id | date | text | hearts | broken |
|----|------|------|:------:|:------:|
| dl1 | "10 июня" | "Переработал экран голосовых каналов — участники теперь в виде «орбов присутствия» с живой аурой у говорящего. Как вам такой подход?" | 42 | 6 |
| dl2 | "8 июня" | "Думаю добавить авто-переключение тёмной/светлой темы по системным настройкам. Нужно вам это?" | 88 | 12 |
| dl3 | "5 июня" | "Веб-версия Love — делать её в первую очередь, или сначала довести десктоп и мобильный билд?" | 65 | 33 |

Post card `.devlog-post`: avatar (first letter of author) + author + date; text; `.devlog-vote-bar` fill = `hearts/(hearts+broken)*100`%; two reaction buttons + `{pct}% за`.

Reactions: `.devlog-react-btn.heart` (title "За", filled-heart SVG) and `.devlog-react-btn.broken` (title "Против", broken-heart SVG). `handleDevLogVote(id, vote)` (`:5402`):
- Toggle semantics: clicking your current vote removes it (`next=null`); switching moves the count between hearts/broken; counts floored at 0.
- Persisted in `localStorage["love_devlog_votes"]` as `{postId: "heart"|"broken"}` (`getDevLogVotes`/`persistDevLogVote`). Voted button gets `.voted`; a `.pop` animation plays on the newly chosen button.

Composer `#devlog-composer` (**admin-only**): `<textarea id="devlog-input" rows=2>` placeholder "Написать новый пост в Dev Log...", button `#devlog-post-btn` "Опубликовать". On post → `devLogPosts.unshift({ id:"dl"+Date.now(), author:"Александр", date:"только что", text, hearts:0, broken:0 })`, clears input, re-renders. In-memory only.

---

## 9. Styling — key values & mobile behavior

Desktop layout (§2): 4-col bento grid, gap 20px. Hero 3×2, stat 1×2, others 2-wide. Dashboard shell `.hub-bento-dashboard`: bg `rgba(10,10,10,0.45)`, blur 25px, radius 24px, `margin: --spacing-md`, size `calc(100% - 32px)`, padding 40px (inline), scroll-y. `.stat-value` mono 52px. `.hub-modal-card` slide-in.

Status tags: `.idea-status-tag.planned` = subtle white; `.bug-status.*` and `.bento-tag.bug.*` colored accents defined but unused by current markup.

### Mobile `@media (max-width: 768px)` (`style.css:10863-11025`)
- `.hub-bento-dashboard` padding → `20px 16px 100px 16px` (extra bottom for mobile nav bar).
- `.bento-header` → column, `align-items:flex-start`, gap 16px, left pad 16px, margin-bottom 24px; `h1` → 28px.
- `.bento-grid` → **single column** (`1fr`), auto rows, gap 16px; every `.bento-card` forced to `span 1`, padding 20px.
- `.bento-hero h2` → 24px, full width; `.bento-hero p` → 14px full width; `.bento-hero-visual` **hidden** (prevents overlap). `.stat-value` → 36px.
- Header actions (`.bento-header div:last-child`): row, wrap, gap 8px, full width; each `.submit-action-btn` → `flex 1 1 calc(50% - 4px)` (2-up), min-height 44px, 12px font, wraps text; `.hidden` stays hidden.
- Modals: `.hub-modal-card` padding `20px 16px`, radius 16px; header column-ish, `h3` 18px; `.hub-list-item` → column layout, `.hub-item-right` full-width with top border. `.profile-close-btn` forced `position:static`.

> The hub CSS/JS heavily targets `.hub-btn` in the header, but the actual header buttons in `index.html` use `hub-btn`/`hub-btn-ghost` classes (not `submit-action-btn`). The mobile `@media` overrides key on `.bento-header div:last-child .submit-action-btn` — since current buttons are `.hub-btn`, the primary responsive sizing that applies is `.hub-header-actions{flex-wrap:wrap}` + generic `.hub-btn`. Flag for the porter: replicate a wrapping 2-up button row on phones regardless of class naming.

---

## 10. Endpoints / socket summary

**None.** No `fetch`/REST, no socket events for the entire Love Hub. Inventory of data sources:
- App version: `window.electronAPI.getVersion()` (native/desktop bridge), fallback `'2.0.4'`.
- Updates history: in-memory `mockHubUpdates`.
- Dev Log posts: in-memory `devLogPosts`; votes in `localStorage["love_devlog_votes"]`.
- Ideas / Bugs: static "coming soon" placeholders (no data).
- Admin gating: client-only `isAdminMode` via `#toggle-admin-btn` toggling `.admin-only .hidden`.

(Separately, `client/js/new/updates.js` handles the Electron auto-updater UI inside **Settings → Обновления** — NOT the Hub. On mobile/web it hides the check button and shows "Новые версии — на loveapp.chat". Out of scope for this view but noted to avoid confusion with the Hub's "История обновлений".)
