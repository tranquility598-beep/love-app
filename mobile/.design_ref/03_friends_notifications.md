# Design Spec 03 — FRIENDS (`#view-friends`) & NOTIFICATIONS (`#view-notifications`)

Extracted 1:1 from the web reference (`client/index.html`, `client/styles/style.css`, `client/js/new/script.js`).
Target: native Flutter, ~390 px-wide phone. **CSS px == Flutter logical px.**
Focus is the mobile layout — rules under `@media (max-width: 768px)` / `600px` / `580px` override desktop; where a mobile override exists it is the source of truth and is called out.

Design tokens referenced (from `:root`): `--bg-primary #080808`, `--font-sans 'Outfit'`, `--font-serif 'Lora'`, `--font-mono 'Fira Mono'`, `--spacing-xs/sm/md/lg/xl = 4/8/16/24/32`, `--radius-sm/md/lg/xl = 8/12/16/20`.

> ⚠️ Both current Flutter screens use a generic `ScreenFrame` + Material `IconButton`/`LoveSurface` card list. The web design is **borderless flat rows** (friends) and **glass column cards** (notifications), NOT boxed list tiles. See "GAP" sections at the end.

---

## PART A — FRIENDS (`#view-friends`)

### A.0 DOM tree (mobile)
```
.friends-unified-panel                      (full-bleed, padding 0 on mobile)
  └ .unified-glass-card                      (transparent on mobile, no border)
      ├ header.friends-unified-header        (column, padding 16, bottom border)
      │   ├ .friends-header-main-row         (row, space-between)
      │   │   ├ h1.friends-title  "Друзья"
      │   │   └ .friends-header-actions      (add-btn — HIDDEN on mobile)
      │   └ .friends-header-secondary-row    (column, gap 12)
      │       ├ .friends-count-title         (HIDDEN on mobile)
      │       ├ .friends-filter-nav          (pill tabs, horizontal scroll)
      │       │    В сети (n) | Все (n) | Запросы (n)• | Добавить
      │       └ .friends-inline-search-bar   (search input)
      └ .friends-list-content #friends-list-container   (scroll list of .friend-card)
```

### A.1 Panel background & card
- `.friends-unified-panel`: `width/height:100%`, `display:flex; flex-direction:column`.
  Desktop background is a radial-gradient wabi-sabi wash over `--bg-primary`; **mobile: `padding:0`** (desktop `padding:16`).
  Background gradient (keep on mobile too — it's on the panel, not overridden):
  `radial-gradient(circle at 75% 25%, rgba(255,255,255,0.03) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(255,255,255,0.015) 0%, transparent 40%), #080808`.
- `.unified-glass-card` desktop: `bg rgba(10,10,10,0.4)`, `backdrop-filter blur(40px) saturate(1.2)`, `border 1px rgba(255,255,255,0.05)`, `radius 20`, `box-shadow 0 40px 80px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.02)`.
  **Mobile override: `border-radius:0; border:none; background:transparent`** → on phone the card is invisible; content sits directly on the panel gradient.

### A.2 Header — `.friends-unified-header` (mobile)
- `padding: 16` (var-md) all sides; `flex-direction: column`; `gap: 12`; `background: transparent`; `border-bottom: 1px solid rgba(255,255,255,0.06)`; `height:auto`.
  (Desktop was `padding: 28px 40px 20px 40px`, `background rgba(255,255,255,0.01)`.)

#### A.2.1 Title — `h1.friends-title` = "Друзья"
| prop | value |
|---|---|
| font-family | `Lora` (serif) |
| font-size | **28px** (mobile; desktop 32) |
| font-weight | 400 |
| font-style | **italic** |
| color | `#ffffff` |
| margin | 0 |

#### A.2.2 Header main row — `.friends-header-main-row`
- `display:flex; justify-content:space-between; align-items:center; width:100%`.
- `.friends-header-actions` (right): `display:flex; gap:8; align-items:center`.
  - `.friends-action-btn` (the `+` add button, `#friends-add-toggle-btn`): **`display:none` on mobile** (both the id-rule and the media rule hide it). Add-friend is reached via the "Добавить" tab instead.
    - (Desktop spec for reference: 36×36, radius 8, transparent bg, color `rgba(255,255,255,0.4)`; hover → color `#fff`, bg `rgba(255,255,255,0.06)`; active → `scale(0.95)`; svg 18×18. Transition `all 0.2s ease`.)

#### A.2.3 Secondary row — `.friends-header-secondary-row`
- Mobile: `display:flex; flex-direction:column; gap:12; width:100%; margin-top:14px`.
- `.friends-count-title` (`#friends-list-title`, e.g. "Друзья в сети — 0"): **`display:none` on mobile.** (Desktop: 14px, weight 400, color `rgba(255,255,255,0.35)`.)

#### A.2.4 Filter tabs — `.friends-filter-nav` (mobile pills)
- Container: `display:flex; gap:6; padding:0; margin:4px 0; overflow-x:auto` (horizontal scroll, scrollbar hidden); `margin-left:0`.
- Tab `.filter-tab` (mobile):
  | prop | value |
  |---|---|
  | padding | **8px 16px** (var-sm 16) |
  | border-radius | **99px** (full pill) |
  | background | `rgba(255,255,255,0.03)` |
  | color | `rgba(255,255,255,0.4)` |
  | border | `1px solid rgba(255,255,255,0.04)` |
  | font-family | `Outfit` |
  | font-size | 13px |
  | font-weight | 500 |
  | flex-shrink | 0 |
  | transition | `color 0.2s, background 0.2s` |
- Active `.filter-tab.active`: `background rgba(255,255,255,0.08)`, `color #fff`, `border-color rgba(255,255,255,0.12)`.
- Hover (desktop only) `:hover:not(.active)`: `color rgba(255,255,255,0.7)`, `bg rgba(255,255,255,0.03)`.
- Tab labels (Russian, keep verbatim):
  - `В сети <span class="tab-count">(0)</span>` — filters `type==="friend" && online`.
  - `Все (0)` — **default active** — all friends.
  - `Запросы (0)` + `<span class="pending-indicator-dot">` — pending requests.
  - `Добавить` — class `add-friend-tab` (dashed on desktop: `1px dashed rgba(255,255,255,0.15)`; but on mobile inherits the pill style above; still shown via `display:inline-flex`).
- `.tab-count`: inline count text, same styling as tab.
- `.pending-indicator-dot`: `6×6`, `background #ffffff`, `border-radius 50%`, `margin-left 6px`, `vertical-align middle`, `display:inline-block`. Has `.hidden` → `display:none` when no pending.

#### A.2.5 Inline search — `.friends-inline-search-bar` / `#friends-local-search-input`
- Bar: `width:100%; margin-top:12px; display:block`; transition `all 0.3s cubic-bezier(0.4,0,0.2,1)`. `.hidden` → `display:none; height:0`.
- Wrapper `.friends-search-input-wrapper`: `position:relative; width:100%; display:flex; align-items:center`.
- Search icon `.friends-search-icon` (SVG magnifier): `position:absolute; left:14px; 16×16; color rgba(255,255,255,0.35); pointer-events:none`. SVG = `<circle cx=11 cy=11 r=8>` + `<line 21,21 → 16.65,16.65>`, stroke-width 1.8.
- Input `#friends-local-search-input`:
  | prop | value |
  |---|---|
  | width | 100% |
  | background | `rgba(255,255,255,0.03)` |
  | border | `1px solid rgba(255,255,255,0.06)` |
  | border-radius | 12px |
  | padding | `10px 40px 10px 40px` (icon-left + clear-right) |
  | color | `#ffffff` |
  | font-size | 14px, font-family `Outfit` |
  | placeholder | "Поиск по имени..." |
  | focus | bg `rgba(255,255,255,0.05)`, border `rgba(255,255,255,0.15)`, `box-shadow 0 0 0 2px rgba(255,255,255,0.02)` |
- Clear button `.friends-clear-btn` (`#friends-clear-search-btn`, shown only when text present): `position:absolute; right:12px; 50% radius; color rgba(255,255,255,0.4)`; svg 14×14 (X). Hover → color `#fff`, bg `rgba(255,255,255,0.08)`.

### A.3 Friends list — `.friends-list-content` (`#friends-list-container`)
- `display:flex; flex-direction:column; gap:2px; padding:0; overflow-y:auto; flex-grow:1`. Desktop caps `max-width:680px`.
- **Mobile: `padding-bottom: 80px`** (clear the fixed 60px bottom nav).
- Rows are dynamically injected `.friend-card` elements (see A.4). Category headers/dividers appear in the "Запросы" tab (A.6).

### A.4 Friend row — `.friend-card` (regular friend)
DOM (from `script.js` ~4787):
```
.friend-card
  └ .friend-info-left            (row, gap 14, align-center)
      ├ .friend-avatar-wrap      (relative)
      │   ├ .friend-avatar       (44×44 circle, initial/img)
      │   └ .friend-status-dot .online|.offline
      ├ .friend-name-col         (column, gap 2)
      │   ├ .friend-name
      │   └ .friend-status-text
      └ .friend-actions-inline   (row, gap 6)  ← 3 icon buttons
```

- `.friend-card`: `display:flex; flex-direction:row; align-items:center; justify-content:flex-start; padding:14px 24px; background:transparent; border:none; border-radius:12px; cursor:pointer; box-shadow:none`. Transition `background 0.2s ease`.
  - **Hover** (`:hover`): `background: rgba(255,255,255,0.04)` (radius stays 12).
  - NOTE this is a **flat borderless row**, not a boxed card. Gap between rows = 2px.
- `.friend-info-left`: `display:flex; flex-direction:row; align-items:center; gap:14px; text-align:left`.
  - ⚠ Note: in the current markup `friend-actions-inline` sits *inside* `friend-info-left`, so avatar + name + actions all share the 14px gap row; name col does NOT flex-grow, actions sit right after name (left-aligned, not pushed to far right).

#### A.4.1 Avatar — `.friend-avatar` + wrap
- `.friend-avatar-wrap`: `position:relative; flex-shrink:0`.
- `.friend-avatar`: `44×44`, `border-radius:50%`, `background:#161616`, `border:1px solid rgba(255,255,255,0.08)`, `font-size:17px`, `font-family:Lora (serif)`, `color:rgba(255,255,255,0.7)`, centered. Transition `border-color 0.3s`.
  - Content = initial letter, OR background-image when `friend.avatarUrl` present (`avatarStyle()` sets `background-image`, `avatarInner()` empties text).
  - Hover (card): border-color → `rgba(255,255,255,0.2)`.
- `.friend-status-dot`: `position:absolute; bottom:0; right:0; 10×10; border-radius:50%; border:2px solid #0a0a0a; z-index:2`.
  - `.online` → `background:#ffffff`.
  - `.offline` → `background:rgba(255,255,255,0.2)`.

#### A.4.2 Name column — `.friend-name-col` (column, gap 2, align-start)
- `.friend-name`: `font-size:14px; font-weight:500; color:#ffffff` (font-family Outfit).
- `.friend-status-text`: `font-size:12px; color:rgba(255,255,255,0.3)` (this is `friend.statusText`, e.g. "В сети" / a custom status / "Не в сети").

#### A.4.3 Row actions — `.friend-actions-inline` (regular friend = 3 buttons)
Container: `display:flex; gap:6; align-items:center; margin-left:12px`; **always visible** (`opacity:1; pointer-events:auto`).
Buttons `.action-btn` (base): `32×32; border-radius:8px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.08); color:rgba(255,255,255,0.5); padding:0`; centered; svg **15×15**; transition `all 0.2s ease`.
Three buttons in order:
1. `.chat-direct-action` — "Начать чат". SVG = speech bubble `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z">` stroke-width 2.
2. `.call-action` — "Аудиозвонок". SVG = phone handset (the long `M22 16.92...` path).
3. `.remove-friend-action` — "Удалить из друзей". SVG = X (`18,6→6,18` + `6,6→18,18`).
- Hover (chat/call): `background:rgba(255,255,255,0.15); color:#fff; border-color:rgba(255,255,255,0.3)`.
- (Desktop uses a different `.friend-actions-right` variant that is `opacity:0` until row hover and pushed right with `margin-left:auto`; **on mobile use the always-visible `.friend-actions-inline` variant above**.)

### A.5 Friend REQUEST row — `.friend-card.request-card`
Same skeleton as A.4 but built by `createRequestCard()` (~4505). Status dot forced `.offline`. Actions differ:
- **Incoming request** → two buttons:
  1. `.action-btn.accept-btn` — "Принять запрос". SVG = check `<polyline points="20 6 9 17 4 12">`.
     - Style: `border:1px solid rgba(255,255,255,0.2); background:rgba(255,255,255,0.04); color:#ffffff`.
     - Hover: `background:#ffffff; color:#000000; border-color:#ffffff`.
  2. `.action-btn.reject-btn` — "Отклонить запрос". SVG = X.
     - Style: `border:1px solid rgba(255,255,255,0.1); background:rgba(255,255,255,0.02); color:rgba(255,255,255,0.5)`.
     - Hover: `background:rgba(255,255,255,0.15); color:#fff; border-color:rgba(255,255,255,0.3)`.
- **Outgoing request** → one button:
  - `.action-btn.cancel-btn` — "Отменить запрос". SVG = X. Style: `border 1px rgba(255,255,255,0.1); bg rgba(255,255,255,0.02); color rgba(255,255,255,0.5)`; hover same as reject.

### A.6 Pending-tab structure & category headers
When "Запросы" tab active, list is split with:
- `.friends-category-header` (e.g. "Входящие запросы", "Исходящие запросы"): `font-size:11px; font-weight:600; text-transform:uppercase; color:rgba(255,255,255,0.35); letter-spacing:0.8px; margin:24px 0 12px; padding-left:16px; font-family:Outfit`.
- `.friends-category-divider`: `height:1px; background:rgba(255,255,255,0.05); margin:24px 16px`.
- Empty sub-section `.friends-empty-category` (e.g. "Нет входящих запросов."): `font-size:13px; color:rgba(255,255,255,0.25); font-style:italic; padding:16px 24px; font-family:Outfit`.
- List title text (hidden on mobile, but drives semantics): "Запросы — Входящие: N" / with "Исходящие: M".

### A.7 Friends EMPTY state — `.empty-state-panel` (via `createEmptyState()`)
Shown when the active tab list is empty. DOM: mark `+`, `<h3>`, `<p>`, optional button.
- `.empty-state-panel`: `width: min(100%, 360px); min-height:180px; margin:auto` (centered); `padding:26px 22px`; column; center; `gap:10px`; `color:var(--text-secondary)`.
- `.empty-state-mark` (the `+` glyph): `46×46; border-radius:50%; border:1px solid rgba(255,255,255,0.16); color:#fff; font-size:24px`; centered.
- `h3`: `font-family:Lora; font-size:22px; font-weight:600; color:#f5f5f5; margin:4px 0 0`.
- `p`: `max-width:280px; font-size:13px; line-height:1.45; color:#646464 (text-muted); margin:0`.
- `.empty-state-btn`: `margin-top:8px; height:38px; padding:0 18px; border-radius:10px; border:1px solid #fff; background:#fff; color:#000; font-family:Outfit; font-size:13px; font-weight:600`. Hover → `translateY(-1px)`, `box-shadow 0 10px 24px rgba(255,255,255,0.14)`. Transition `transform 0.16s, box-shadow 0.18s`.
- Copy examples:
  - online tab empty: title "Никого нет в сети".
  - all tab empty: title "Пока нет друзей", body "Добавьте первого человека, чтобы быстро писать, звонить и видеть статус.", button "Добавить" → switches to add tab.

### A.8 Add-friend MODAL — `#add-friend-modal` (`.modal-backdrop`)
Reached on mobile via the "Добавить" tab (desktop opens this modal). Card `.profile-card` (width 420 desktop → make full-width-16 on phone). `padding:28`.
- Close btn `.profile-close-btn`: top 20 right 20, X svg.
- Heading `.add-friend-heading` = "Кого ищем?": `font-family:Outfit; font-size:26px; font-weight:700; letter-spacing:-0.01em; color:#fff; text-align:center; margin:4px 0 22px`.
- Form `.add-friend-form`: `flex column; gap:14px`.
- Input wrap `.add-friend-input-wrap`: relative; search icon `.add-friend-search-icon` at `left:15px; 18×18; color rgba(255,255,255,0.4)`.
- Input `#add-friend-modal-input` (placeholder "Никнейм пользователя"): `width:100%; padding:13px 16px 13px 44px; border-radius:14px; border:1px solid rgba(255,255,255,0.12); background:rgba(255,255,255,0.05); color:#fff; font-size:14.5px; font-family:Outfit`. Focus → `border rgba(255,255,255,0.35); bg rgba(255,255,255,0.07)`.
- Submit `.add-friend-submit` = "Добавить": `width:100%; min-height:46px; border:none; border-radius:14px; background:#fff; color:#000; font-size:15px; font-weight:600`. Hover → `translateY(-1px); opacity 0.92`. Transition `transform 0.15s, opacity 0.15s`.
- Status line `.add-friend-status`: `min-height:18px; font-size:12.5px; text-align:center; color:rgba(255,255,255,0.55)`. `.is-success`→`#fff`; `.is-error`→`#ff5a5a`.

---

## PART B — NOTIFICATIONS (`#view-notifications`)

### B.0 DOM tree (mobile)
```
.notifications-unified-panel                (full-bleed, padding 0 on mobile)
  └ .unified-glass-card
      ├ header.notifications-unified-header  (row, space-between, padding 16)
      │   ├ h1.friends-title  "Уведомления"
      │   └ .notif-actions-top
      │       ├ button#mark-all-read-notifs  "Прочитать все"
      │       └ button#clear-all-notifs      "Очистить все"
      ├ .friends-filter-nav.notif-filter-nav (2 pills: Обычные | Системные)
      └ .notifications-feed-list #notif-feed-container   (column of .notification-item)
```

### B.1 Panel & header
- `.notifications-unified-panel`: same gradient bg + `padding:16` as friends; **mobile padding:0**; `overflow-y:hidden`. Its `.unified-glass-card` forced `width/height:100%`, transparent/no-border on mobile.
- `.notifications-unified-header` (mobile): `padding:16; flex-direction:row; align-items:center; justify-content:space-between; gap:12; background:rgba(255,255,255,0.01); border-bottom:1px solid rgba(255,255,255,0.06); height:auto`.
  - Title = `h1.friends-title` "Уведомления" (same style as A.2.1: Lora italic 28px `#fff` on mobile).
  - `.notif-actions-top`: `display:flex; flex-wrap:nowrap; gap:8; justify-content:flex-end`.
    - `.notif-action-text-btn` (two: "Прочитать все" `#mark-all-read-notifs`, "Очистить все" `#clear-all-notifs`; markup uses `<br>` so text wraps two lines): `background:transparent; border:none; color:#a2a2a2 (text-secondary); font-family:Outfit; font-size:12px; font-weight:500; padding:6px 8px (mobile); border-radius:8px; text-align:right; line-height:1.2`. Hover → `color:#f5f5f5; bg:rgba(255,255,255,0.04)`.

### B.2 Notif filter tabs — `.notif-filter-nav.friends-filter-nav`
Same pill styling as A.2.4 (mobile pills). Two tabs:
- `Обычные` `data-notif-tab="normal"` — **default active**.
- `Системные` `data-notif-tab="system"`.

### B.3 Feed list — `.notifications-feed-list` (`#notif-feed-container`)
- `display:flex; flex-direction:column; gap:16px; padding:24px 40px; overflow-y:auto; flex-grow:1`.
- **Mobile override: `padding:16` (var-md)** and **`padding-bottom:80px`** for the bottom nav.
- Children = `.notification-item` cards. Newest first.

### B.4 Notification card — `.notification-item` (base)
DOM: header row + body + (optional) actions, stacked in a column.
```
.notification-item[.unread]
  ├ .notif-card-header       (row, gap 14)
  │   ├ [avatar: .notif-avatar  OR  .notif-avatar-combo]
  │   ├ .notif-meta-info      (column, gap 2, flex-grow)
  │   │   ├ .notif-user-name
  │   │   └ .notif-time
  │   ├ [.notif-unread-dot]   (only if unread)
  │   └ button.notif-close-btn
  ├ .notif-card-body
  │   └ p.notif-message-text
  └ [.notif-card-actions]     (variant-specific buttons/form)
```
- `.notification-item`: `background:rgba(255,255,255,0.015); border:1px solid rgba(255,255,255,0.03); border-radius:16px; padding:18px 22px; display:flex; flex-direction:column; align-items:stretch; gap:12px; overflow:hidden; box-shadow:inset 0 0 12px rgba(255,255,255,0.005); backdrop-filter:blur(10px)`. Transition `all 0.3s cubic-bezier(0.2,0.8,0.2,1)`.
  - **Mobile override: `padding:14px 16px; gap:10px`.**
  - **Hover** (desktop): `background:rgba(255,255,255,0.03); border-color:rgba(255,255,255,0.08); transform:translateY(-2px); box-shadow: inset 0 0 12px rgba(255,255,255,0.015), 0 8px 24px rgba(0,0,0,0.25)`.
- **Unread `.notification-item.unread`**: `background:rgba(255,255,255,0.025); border-color:rgba(255,255,255,0.06); box-shadow:inset 0 0 15px rgba(255,255,255,0.015)`.

#### B.4.1 Header sub-elements
- `.notif-card-header`: `display:flex; align-items:center; gap:14px; width:100%; position:relative`.
- `.notif-avatar` (single avatar): `44×44; border-radius:50%; background:rgba(255,255,255,0.04); color:#fff; font-weight:700; font-size:15px; border:1px solid rgba(255,255,255,0.08); text-transform:uppercase; flex-shrink:0`. Holds an emoji/initial (e.g. avatar char).
- `.notif-avatar-combo` (mention variant — group + sender): `position:relative; 44×44`.
  - `.group-avatar`: `34×34; border-radius:8px; top:0 left:0; font-size:12px`.
  - `.sender-avatar-mini`: `20×20; border-radius:50%; bottom:0 right:0; font-size:8px; border:1.5px solid #0d0d0d; background:rgba(255,255,255,0.15); box-shadow:0 2px 6px rgba(0,0,0,0.4)`.
- `.notif-meta-info`: `display:flex; flex-direction:column; gap:2px; flex-grow:1`.
  - `.notif-user-name`: `font-weight:700; color:#fff; font-size:14px` (Outfit).
  - `.notif-time`: `font-size:10px; font-family:'Fira Mono'; color:rgba(255,255,255,0.35); letter-spacing:0.2px`. (Value is a preformatted string `notif.time`, e.g. "5 мин назад", "Вчера".)
- `.notif-unread-dot` (only when unread): `8×8; border-radius:50%; background:#ffffff; box-shadow:0 0 10px #ffffff; margin-right:8px; flex-shrink:0`.
- `.notif-close-btn`: `32×32; border-radius:50%; background:transparent; border:none; color:rgba(255,255,255,0.25)`; svg 16×16 X (stroke-width 2). Card-hover raises color to `rgba(255,255,255,0.5)`; own hover → `color:#fff; bg:rgba(255,255,255,0.05); transform:rotate(90deg)`. Transition `all 0.2s`.

#### B.4.2 Body — `.notif-card-body` / `.notif-message-text`
- `.notif-card-body`: **desktop `padding-left:58px` (aligns text under avatar); mobile override `padding-left:0`**. `margin-top:-4px`.
- `.notif-message-text`: `font-size:13.5px; color:rgba(255,255,255,0.75); line-height:1.55; margin:0` (Outfit).
  - Unread: `.unread .notif-message-text` → `color:#ffffff`.
  - `<strong>` inside (mention) = bold same color.

#### B.4.3 Actions — `.notif-card-actions`
- `.notif-card-actions`: **desktop `padding-left:58px`; mobile override `padding-left:0`**; `display:flex; flex-wrap:wrap; gap:10px; margin-top:6px`.
- Buttons `.notif-action-btn`: `font-family:Outfit; font-size:13px; font-weight:500; text-transform:none; padding:10px 20px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); background:rgba(255,255,255,0.02); color:rgba(255,255,255,0.7); white-space:nowrap; min-width:120px; text-align:center`. Hover → `bg rgba(255,255,255,0.06); color:#fff; border-color:rgba(255,255,255,0.15)`.
  - `.primary`: `bg rgba(255,255,255,0.08); color:#fff; border rgba(255,255,255,0.15)`; hover bg `rgba(255,255,255,0.15)`.
  - `.notif-btn-bw`: `color rgba(255,255,255,0.85); border rgba(255,255,255,0.15); bg rgba(255,255,255,0.04)`; hover `#fff / bg 0.1 / border 0.25`.
  - `.success`: `color #85e3b2; border rgba(133,227,178,0.2); bg rgba(133,227,178,0.03)`; hover bg 0.08 / border 0.4.
  - `.danger`: `color #ff8585; border rgba(255,133,133,0.2); bg rgba(255,133,133,0.03)`; hover bg 0.08 / border 0.4.
- Reply form `.notif-reply-form`: `display:flex; width:100%; flex-wrap:wrap; gap:10px`. **Mobile → `flex-direction:column; align-items:stretch`; input & button both `width:100%`.**
  - `.notif-reply-input` (placeholder "Написать ответ..."): `flex-grow:1; min-width:0; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.08); color:#fff; padding:8px 14px; border-radius:8px; font-size:13px`. Focus → `border rgba(255,255,255,0.25); bg rgba(0,0,0,0.3); box-shadow 0 0 0 2px rgba(255,255,255,0.02)`.

### B.5 Notification VARIANTS (by `notif.type`) — from `script.js` ~5608
All share the base card + header + close btn + unread-dot. They differ in avatar, body, and actions:

| Variant | class added | avatar | body text | actions |
|---|---|---|---|---|
| **DM / new message** | `notif-card-dm` | `.notif-avatar` (sender char) | `notif.text` plain | reply form → input + `.notif-action-btn.primary` "Ответить" |
| **Mention** | `notif-card-mention` | `.notif-avatar-combo` (group 34×34 + sender mini 20×20) | `<strong>{name}</strong> упомянул вас в <strong>[{group}]</strong>: "{text}"` | one `.notif-action-btn` "Перейти к чату" |
| **Friend request** | `notif-card-request` | `.notif-avatar` | `{text}` or "{name} хочет добавить вас в друзья" | `.notif-card-actions.buttons-row`: `.notif-action-btn.primary` "Принять" + `.notif-action-btn.notif-btn-bw` "Отклонить" |
| **Missed call (system)** | `notif-card-system notif-card-call` | `.notif-avatar.call-avatar` | `.notif-message-text.missed-call-text` with inline phone svg (14×14, `margin-right:4px`) + `{text}` | `.notif-action-btn.primary` "Перезвонить" |
| **User joined / default (system)** | `notif-card-system notif-card-joined` | `.notif-avatar.joined-avatar` | `{text}` | *(none)* |

- The two filter tabs split these: `notif-card-system*` → "Системные"; the rest → "Обычные".
- Icons are **emoji/initial glyphs inside the avatar** (JS passes `notif.avatar` as a char) plus inline stroke SVGs (phone for calls, X for close). There is **no per-type colored badge icon** like the current Flutter uses.

### B.6 Notifications EMPTY state — `.notif-empty-state`
- `.notif-empty-state`: `display:flex; align-items:center; justify-content:center; flex-grow:1; height:100%; text-align:center; padding:40px 0`.
- `.helper-text`: `font-size:14px; color:rgba(255,255,255,0.35); letter-spacing:0.5px; font-family:Outfit`.
- Copy: normal tab → "Ответы, упоминания, заявки в друзья и звонки появятся здесь."; system tab → "Системные события — принятые заявки, объявления — появятся здесь."
  (Note: the friends screen uses the richer `.empty-state-panel`; notifications uses this simpler centered helper text. The JS also sometimes reuses `createEmptyState` — but the primary notif empty is `.notif-empty-state`.)

### B.7 Interactions / animations
- Tapping a card (not on a button/input/form) marks it read: removes `.unread` class + removes `.notif-unread-dot`. No animation beyond the class-swap (0.3s cubic transition on bg/border).
- "Прочитать все" clears all unread; "Очистить все" empties the feed (shows toast "Удалено").
- Card entrance/hover uses `cubic-bezier(0.2,0.8,0.2,1)` over 0.3s.

---

## PART C — GAP vs CURRENT FLUTTER

### C.1 `friends_screen.dart` — required changes
- **Header:** replace `ScreenFrame(title:'Друзья', trailing: refresh IconButton)` with the custom header: serif-italic `Lora` 28px title "Друзья", a **pill tab row** (`В сети / Все / Запросы / Добавить`, radius 99, bg `rgba(255,255,255,0.03)`, active bg `0.08` + border `0.12`), and a search input below. Remove the Material refresh button (web has none in header; refresh is pull-to-refresh only).
- **Add search bar** (`#friends-local-search-input` equivalent): rounded 12 field, bg `rgba(255,255,255,0.03)`, border `0.06`, magnifier icon left, clear-X right — currently absent.
- **Friend rows are flat, not boxed.** Current uses `LoveSurface(radius:16, color:surfaceStrong, padding:12)` per tile with 10px bottom margin. Change to **borderless `.friend-card`**: `padding:14px 24px`, transparent bg, `border-radius:12`, hover/pressed bg `rgba(255,255,255,0.04)`, **gap 2px** between rows (not 10).
- **Avatar:** current `LoveAvatar`. Web = 44×44 circle, bg `#161616`, border `rgba(255,255,255,0.08)`, initial in **Lora 17px** color `rgba(255,255,255,0.7)`. Status dot = 10×10, `bottom/right:0`, **2px `#0a0a0a` border ring**; online `#ffffff`, offline `rgba(255,255,255,0.2)`. (Current uses a status string, not the correct dot colors.)
- **Name/status typography:** name `14px/500 #fff`; status `12px color rgba(255,255,255,0.3)`. Current name is `w800` (too heavy) and status uses `textMuted 12`. Match weights: name 500, not 800.
- **Row actions:** current shows a single `Icons.more_horiz`. Web friend row has **3 icon buttons** (chat, call, remove) each 32×32, radius 8, bg `rgba(255,255,255,0.02)`, border `0.08`, icon 15×15 color `rgba(255,255,255,0.5)`, always visible, sitting right after the name (inside the info row, not pushed to the far edge). Add these.
- **Section labels:** current `_SectionLabel` (11px w800 letterSpacing 0.8 muted) is close to `.friends-category-header` (11px/600 uppercase, `rgba(255,255,255,0.35)`, letter-spacing 0.8, padding-left 16, margin 24/12) — adjust weight 800→600 and color to `rgba(255,255,255,0.35)`. Category divider = 1px `rgba(255,255,255,0.05)` with margin `24 16`.
- **Request tiles:** current uses Material `IconButton.filledTonal` check + close. Web wants accept-btn (32×32, border `rgba(255,255,255,0.2)`, bg `0.04`, white check; hover→ solid white bg / black icon) and reject-btn (border `0.1`, bg `0.02`, color `0.5`). Use the flat `.friend-actions-inline` style, checkmark = polyline, not `check_rounded`.
- **Empty state:** current `EmptyState(icon, title, message)`. Web `.empty-state-panel`: circular `+` mark 46×46 with 1px `rgba(255,255,255,0.16)` border, `h3` Lora 22px/600, `p` 13px `#646464` max-width 280, and a white pill CTA button "Добавить" (38px, radius 10, bg #fff, black text). Replace generic empty state with this; per-tab copy ("Пока нет друзей" etc.).
- **List padding:** web `padding:0` with `padding-bottom:80` for bottom nav. Current uses `fromLTRB(16,8,16,104)` — reduce horizontal to 0 (rows have their own 24 side padding) or keep side inset small; bottom ~80–104 is fine.
- **Add-friend modal:** implement `#add-friend-modal` (heading "Кого ищем?" Outfit 26/700, search input radius 14, white "Добавить" submit 46px radius 14) — currently missing entirely.

### C.2 `notifications_screen.dart` — required changes
- **Header:** keep title "Уведомления" but style as **Lora italic 28px `#fff`**, and replace the single `done_all` IconButton with **two text buttons** "Прочитать все" + "Очистить все" (`.notif-action-text-btn`: transparent, 12px/500 `#a2a2a2`, padding 6×8, radius 8, hover bg `rgba(255,255,255,0.04)`). Web wraps their labels to two lines via `<br>`.
- **Add filter tabs:** `Обычные` / `Системные` pill row (same pill spec as friends), default "Обычные". Currently absent — add it and split system vs normal notifications.
- **Card is a vertical column, not a horizontal row.** Current builds a `Row(avatar | Column(name, preview))`. Web `.notification-item` is a **column**: header row (avatar + name/time + unread dot + close X) on top, then body text, then optional actions. Restructure.
  - Card: `padding 14×16` (mobile), `gap 10`, `radius 16`, bg `rgba(255,255,255,0.015)`, border `rgba(255,255,255,0.03)`, `backdrop-filter blur(10)`, inset shadow. Gap between cards **16** (current 10).
  - Unread: bg `rgba(255,255,255,0.025)`, border `rgba(255,255,255,0.06)` + `.notif-unread-dot` (8×8 white, glow `0 0 10px #fff`) in the header; unread body text → pure `#fff` vs `rgba(255,255,255,0.75)` read.
- **Avatar:** current is a 40×40 circle with a *type-based Material icon* (chat/person/@/heart) tinted white on `white08` bg. Web uses a **44×44 avatar holding an emoji/initial glyph** (`notif.avatar` char), font 15/700 uppercase, bg `rgba(255,255,255,0.04)`, border `0.08`. Mentions use a **combo avatar** (34×34 group square radius 8 + 20×20 sender mini circle bottom-right). Drop the icon-mapping; use glyph avatars (+ combo for mentions).
- **Name/time:** name `14px/700 #fff`; add a **`.notif-time`** line — 10px **`Fira Mono`** `rgba(255,255,255,0.35)` letter-spacing 0.2 (currently no timestamp shown at all).
- **Body text:** `13.5px`, read `rgba(255,255,255,0.75)` / unread `#fff`, line-height 1.55. On mobile body `padding-left:0` (no 58px avatar indent). Current uses `textSecondary` height 1.35 — bump line-height and switch color by read-state.
- **Add close button** (`.notif-close-btn`, 32×32 circle, X, color `rgba(255,255,255,0.25)`, hover rotate-90 + white) per card — currently missing.
- **Add per-variant actions** (currently none): DM → reply form (input + "Ответить" primary); mention → "Перейти к чату"; friend request → "Принять" (primary) + "Отклонить" (notif-btn-bw); missed call → "Перезвонить" (primary) with inline phone svg in body; joined/system → no action. Buttons use `.notif-action-btn` spec (13px/500, radius 8, min-width 120, wrap on mobile → full-width column for reply form).
- **Tap-to-read:** tapping card body marks read (remove unread styling + dot). Wire `onTap` to update state.
- **Empty state:** web `.notif-empty-state` = simple centered `.helper-text` 14px `rgba(255,255,255,0.35)` letter-spacing 0.5, per-tab copy ("Ответы, упоминания…" / "Системные события…"). Current `EmptyState(icon+title+message)` is heavier — simplify to centered helper text (or reuse the friends empty-panel style consistently, but web uses the lighter one here).

### C.3 Shared / tokens
- Both panels: full-bleed on mobile (`padding:0`, transparent card), content sits on the panel's radial-gradient wash over `#080808`. Bottom scroll padding ~80px to clear the fixed 60px bottom nav.
- Fonts to load/confirm: `Outfit` (sans body/labels), `Lora` (serif titles + friend-avatar initial), `Fira Mono` (notif timestamps).
- Accent success/danger colors used only in notif action buttons: `#85e3b2` (success/green), `#ff8585` (danger/red), and `#ff5a5a` (add-friend error text).
