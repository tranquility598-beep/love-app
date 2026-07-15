# LOVE — Global Design System (mobile 1:1 reference)

Source of truth: `client/styles/style.css`, `auth.css`, `settings.css`, `perf-android.css`, `index.html`.
Target: ~390px-wide phone. CSS px == Flutter logical px.
Mobile = rules under `@media (max-width: 768px)` (+ 600px/580px refinements) AND the Android runtime flag `html.perf-lite`.

> **CRITICAL RUNTIME FACT (perf-android.css).** The web app is delivered to Android through a WebView that always gets the class `html.perf-lite`. That class:
> - Kills **all** `backdrop-filter` / glass blur (`backdrop-filter: none !important`).
> - **Hides the animated starfield canvas** (`#starfield-canvas { display:none }`) and the JS loop never starts (starfield.js early-returns on `/Android/i`).
> - Forces `body { background-color: #0a0a0a }` (flat, no radial gradient, no stars).
> - Clears `will-change` and decorative `filter: blur()` glows.
>
> **Implication for Flutter:** the real mobile experience is **flat `#0a0a0a`, no blur, no stars.** Glass panels degrade to their solid rgba fill over `#0a0a0a`. Implement glass as a plain translucent fill (NOT a `BackdropFilter`) to match the actual Android look and to keep 60fps. The starfield is desktop/`space-theme`-only eye-candy — do **not** port it as the app background.

---

## 0. Design tokens (`:root`) — verbatim

| Token | Value | Flutter mapping |
|---|---|---|
| `--bg-primary` | `#080808` | LoveColors.bgPrimary ✅ |
| `--bg-secondary` | `#0d0d0d` | LoveColors.bgSecondary ✅ |
| `--bg-tertiary` | `#121212` | LoveColors.bgTertiary ✅ |
| Android body bg | `#0a0a0a` | **missing** — see Background §11 |
| Desktop body bg | `#040404` + `radial-gradient(circle at 50% 50%, #101010 0%, #040404 100%)` | n/a on mobile |
| `--border-color` | `rgba(255,255,255,0.04)` | LoveColors.border `0x14FFFFFF` = 0.078 ❌ too strong (see §Gaps) |
| `--border-color-active` | `rgba(255,255,255,0.12)` | LoveColors.borderActive `0x2EFFFFFF` = 0.18 ❌ too strong |
| `--bubble-own` / text | `#e2e2e2` / `#080808` | ✅ |
| `--bubble-partner` / text | `#171717` / `#dfdfdf` | ✅ (partner text is `#dfdfdf`, tokens has none) |
| `--text-primary` | `#f5f5f5` | ✅ |
| `--text-secondary` | `#a2a2a2` | ✅ |
| `--text-muted` | `#646464` | ✅ |
| `--radius-sm/md/lg/xl` | `8 / 12 / 16 / 20` px | ✅ |
| `--radius-round` | `50%` | StadiumBorder / CircleBorder |
| `--spacing-xs/sm/md/lg/xl` | `4 / 8 / 16 / 24 / 32` | ✅ |
| `--glass-bg` | `rgba(10,10,10,0.96)` | `0xF50A0A0A` ✅ |
| `--glass-blur` | `blur(30px) saturate(1.2)` | **drop on mobile** (perf-lite disables) |
| `--transition-smooth` | `all .25s cubic-bezier(0.4,0,0.2,1)` | Curves.easeInOut-ish, 250ms |

Fonts: `--font-sans:'Outfit'`, `--font-serif:'Lora'`, `--font-mono:'Fira Mono'`.
Global: `* { box-sizing:border-box; margin:0; padding:0; -webkit-font-smoothing:antialiased }`. Body base font = Outfit, color `#f5f5f5`, no explicit base size (browser 16px); every component sets its own size below.

Extra danger tokens (settings.css, the ONLY real accent color in the app):
`--settings-danger: #e5544f`, danger-bg `rgba(229,84,79,0.07)`, danger-border `rgba(229,84,79,0.22)`, danger hover `#d13b36`.
Auth error red: `#eb5a5a` / border `rgba(235,90,90,0.55)`.
> Note: `love_tokens.dart` sets `danger = #E6E6E6` (a near-white) — that is wrong for destructive UI; real danger is `#e5544f`. See Gaps.

---

## 1. Typography scale (measured)

Font families: **Outfit** (sans, UI default), **Lora** (serif, used for titles/brand — often *italic*), **Fira Mono** (mono, used for tiny uppercase labels, timestamps, numeric badges, OTP).

| Role | Element | Family | Size | Weight | Letter-spacing | Line-height | Color | Transform |
|---|---|---|---|---|---|---|---|---|
| List/page title | `.sidebar-title` ("беседы") | Lora | **20px** | 400 | -0.5px | — | text-primary | **italic**, lowercase |
| Form title | `.auth-form-title` | Lora | 24px | 650 | 0 | 1.1 | text-primary | — |
| Brand wordmark | `.auth-brand-name` | Lora | 22px | 600 | 4px | — | text-primary | — |
| Empty-state title | `.empty-state-panel h3` | Lora | 22px | 600 | — | — | text-primary | — |
| Conversation name | `.conv-name` | Outfit | 14.5px | 500 | — | — | text-primary | ellipsis |
| Conversation preview | `.conv-last-msg` | Outfit | 13px | 400 | — | — | text-secondary | ellipsis |
| Conversation time | `.conv-time` | Outfit | 11px | 400 | — | — | text-muted | — |
| Chat partner name | `.partner-name` | Outfit | 15px | 500 | — | — | text-primary | — |
| Chat partner status | `.partner-status` | Outfit | 11.5px | 400 | — | — | text-secondary | — |
| Settings nav item | `.settings-nav-item` | Outfit | 14px | 500 | — | — | text-secondary | — |
| Section label (mono) | `.settings-nav-group` | Fira Mono | 10px | 400 | 1.4px | — | text-muted | UPPERCASE |
| Section subtitle (sans) | `.lvs-section-subtitle` | Outfit | 12px | 600 | 0.8px | — | text-muted | UPPERCASE |
| Input label | `.auth-label` | Fira Mono | 10px | 400 | 1px | — | text-muted | UPPERCASE |
| Brand tagline | `.auth-brand-tag` | Fira Mono | 10.5px | 400 | 0.5px | — | text-muted | — |
| Timestamp | `.notif-time` | Fira Mono | 10px | 400 | 0.2px | — | rgba(255,255,255,0.35) | — |
| Body note | `.auth-form-note` | Outfit | 13px | 400 | — | 1.45 | text-secondary | — |
| Empty-state body | `.empty-state-panel p` | Outfit | 13px | 400 | — | 1.45 | text-muted | — |
| Badge count | `.pulse-badge-dot` | Fira Mono | 8.5px | 800 | — | 1 | #000 | — |
| Avatar initials | `.avatar-letter` / `.conv-avatar` | Outfit | 14px | 600 | — | — | text-primary | UPPERCASE |
| OTP digit | `.otp-digit` | Fira Mono | 22px | 400 | — | — | text-primary | — |

**Pattern to internalize:** big titles are **Lora serif (often italic)**; tiny meta labels are **Fira Mono UPPERCASE with wide tracking**; everything else is Outfit 13–15px weight 400–600. There is almost no pure black text and almost no color — the palette is monochrome grey-on-near-black; the only chromatic accent is destructive-red `#e5544f`.

---

## 2. Buttons

### 2.1 Primary (filled white) — `.auth-submit`, `.empty-state-btn`, switch thumb
- bg `#fff`, text `#000`, border `1px solid #fff`, radius `--radius-md` (12px) (empty-state uses 10px).
- Height 46px (auth) / 38px (empty-state). Padding `0 18px`. Font Outfit 14px/13px weight 600.
- Full-width in forms (`width:100%`).
- **hover:** `transform: translateY(-1px)` + `box-shadow: 0 8px 24px rgba(255,255,255,0.14)`.
- **active/pressed:** `translateY(0)`.
- **disabled:** `opacity: 0.35; cursor:not-allowed`.
- **loading:** external spinner; keep bg.
- Transition: `transform .15s ease, box-shadow .2s, background .2s, opacity .2s`.

### 2.2 Secondary / outline — `.auth-google`, `.lvs-btn`
- bg `rgba(255,255,255,0.04)` (auth) / `rgba(255,255,255,0.06)` (settings), border `1px rgba(255,255,255,0.10)` / `--border-color`, text text-primary, radius md.
- Height 46px (auth-google) or padding `9px 16px` (lvs-btn). Font Outfit 13.5px weight 500.
- **hover:** bg `rgba(255,255,255,0.08–0.10)`, border `--border-color-active`, `translateY(-1px)`.
- **active:** `transform: scale(0.97)`.
- **loading:** `.is-loading { pointer-events:none; opacity:0.65 }`.

### 2.3 Ghost — `.lvs-btn--ghost`
- Identical to secondary but `background: transparent`; hover bg `rgba(255,255,255,0.035)`.

### 2.4 Danger — `.lvs-btn--danger`
- bg `#e5544f`, text `#fff`, border transparent, radius md. **hover** bg `#d13b36`.
- Danger card variant `.lvs-card--danger`: bg `rgba(229,84,79,0.07)`, border `rgba(229,84,79,0.22)`. Danger text `#e5544f`.

### 2.5 Icon button (square, toggle) — `.action-btn`
- 36×36, radius `--radius-sm` (8px), bg transparent, color text-secondary, border `1px transparent`. SVG 18×18.
- **hover:** color text-primary, bg `rgba(255,255,255,0.02)`, border `--border-color`.
- **active (toggled on):** color text-primary, bg `rgba(255,255,255,0.05)`, border `rgba(255,255,255,0.15)`.
- Group gap 6px.

### 2.6 Icon button (borderless) — `.compose-btn`
- transparent, color text-secondary, padding 6px, radius 6px, SVG 18×18. hover: text-primary + bg `rgba(255,255,255,0.02)`.

### 2.7 Circle icon button (mobile floating) — mobile `#nav-hub/#nav-settings/#nav-profile`
- 44×44, radius 50%, bg `rgba(15,15,15,0.98)`, border `1px rgba(255,255,255,0.1)`. Revealed by "More": from `opacity:0; translateY(20px) scale(0.9)` → `opacity:1; translateY(0) scale(1)`, `all .3s cubic-bezier(0.4,0,0.2,1)`.

---

## 3. Text inputs

### 3.1 Search field — `.search-box input`
- Height 36px, bg `rgba(0,0,0,0.25)`, border `1px --border-color`, radius `--radius-sm` (8px), padding `0 12px`, Outfit 14px, color text-primary. Placeholder text-muted.
- **focus:** border `--border-color-active`, bg `rgba(0,0,0,0.4)`. No focus ring. Wrapped in `.search-box { padding:12px 18px }`.

### 3.2 Form input — `.auth-input`
- Height 44px, padding `0 14px`, bg `rgba(255,255,255,0.03)`, border `1px rgba(255,255,255,0.08)`, radius `--radius-md` (12px), Outfit 14px, color text-primary. Placeholder text-muted.
- **focus:** border `rgba(255,255,255,0.35)`, bg `rgba(255,255,255,0.06)`, **focus ring** `box-shadow: 0 0 0 3px rgba(255,255,255,0.05)`.
- **valid (`.is-ok`):** border `rgba(255,255,255,0.4)`.
- **error (`.is-error`):** border `rgba(235,90,90,0.55)`; focused error ring `rgba(235,90,90,0.12)`.
- With prefix: `padding-left:30px` (prefix at left:13px, Fira Mono 14px muted). Trailing eye/status icon at right (18px).
- Field layout: `.auth-field { flex-column; gap:6px }` → uppercase mono **label above** the input (this is the app's "label" pattern — a static Fira Mono 10px UPPERCASE label, NOT a Material floating label). Hint text below (`.auth-hint` Outfit 11.5px muted; ok→`#d6d6d6`, error→`#eb5a5a`).

### 3.3 OTP digit — `.otp-digit`
- 48px tall, border `1px rgba(255,255,255,0.1)`, radius md, bg `rgba(255,255,255,0.04)`, Fira Mono 22px centered. focus: border `rgba(255,255,255,0.35)`, bg `rgba(255,255,255,0.07)`, ring 3px `rgba(255,255,255,0.05)`. Error container shakes (`authShake .38s`).

---

## 4. Cards / surfaces / dividers

### 4.1 Content card — `.lvs-card`
- bg `rgba(255,255,255,0.018)`, border `1px rgba(255,255,255,0.05)`, radius `--radius-lg` (16px), padding `20px 22px`, column, gap 4px, margin-bottom 18px, `backdrop-filter: var(--glass-blur)` (→ none on Android). Hover: border-color transition only.

### 4.2 List row — `.conversation-item`
- padding `10px 14px` (mobile **`12px 16px`**), radius `--radius-sm` (8px), border `1px transparent`, margin-bottom 4px.
- **hover:** bg `rgba(255,255,255,0.02)`. **active/selected:** bg `rgba(255,255,255,0.04)`, border `--border-color`.

### 4.3 Notification row — `.notification-item`
- radius, `backdrop-filter: blur(10px)` (→ none on Android), inset glow. **hover:** bg `rgba(255,255,255,0.03)`, border `rgba(255,255,255,0.08)`, `translateY(-2px)`, shadow `0 8px 24px rgba(0,0,0,0.25)`. **unread:** bg `rgba(255,255,255,0.025)`, border `rgba(255,255,255,0.06)`.

### 4.4 Empty state panel — `.empty-state-panel`
- `width:min(100%,360px)`, min-height 180px, centered column, padding `26px 22px`, gap 10px, text-align center.
- Mark: 46×46 circle, border `1px rgba(255,255,255,0.16)`, icon 24px `#fff`.
- Title Lora 22px/600; body Outfit 13px/1.45 muted, max-width 280px; optional primary button.

### 4.5 Dividers
- Standard hairline: `1px solid --border-color` = `rgba(255,255,255,0.04)`. Header bottoms, list separators, panel edges all use this. Stronger/active edges use `--border-color-active` `rgba(255,255,255,0.12)`.
- `.sidebar-divider` is **hidden on mobile**.

---

## 5. Glass panels (desktop values + Android degradation)

| Panel | bg | blur (desktop) | border | radius | shadow | Android (perf-lite) |
|---|---|---|---|---|---|---|
| `.global-sidebar` (desktop rail) | `rgba(8,8,8,0.6)` | `blur(20px)` | `1px rgba(255,255,255,0.05)` | xl (20) | `0 8px 32px rgba(0,0,0,0.3)` | n/a (becomes bottom bar) |
| Mobile bottom nav | `rgba(10,10,10,0.95)` | `blur(30px) saturate(1.2)` | top only `1px rgba(255,255,255,0.08)` | 0 | `0 -8px 32px rgba(0,0,0,0.4)` | **no blur** → solid `rgba(10,10,10,0.95)` |
| `.auth-card` | `rgba(13,13,13,0.72)` | `blur(34px) saturate(1.2)` | `1px rgba(255,255,255,0.08)` | xl (20) | `0 40px 90px rgba(0,0,0,0.65)`, inset `0 1px 0 rgba(255,255,255,0.05)` | **no blur** → solid fill |
| `.chat-header` | `rgba(13,13,13,0.35)` | `blur(12px)` | bottom `1px --border-color` | 0 | — | **no blur** → thin translucent |
| `--glass-bg` generic | `rgba(10,10,10,0.96)` | `blur(30px) saturate(1.2)` | — | — | — | no blur |

**Flutter rule:** render these as `Container(color: <rgba fill>)` with the listed border/shadow. Skip `BackdropFilter` (matches Android truth and avoids jank). The inset top highlight on auth-card = a 1px top border `rgba(255,255,255,0.05)`.

---

## 6. Avatars

All avatars are **circles** (`--radius-round`) with a subtle 1px border and **flat dark fill** (no gradient in the web app). Fallback = initials in Outfit weight 600 UPPERCASE.

| Use | Size | bg fill | border | initials |
|---|---|---|---|---|
| Nav profile `.user-avatar-btn` | 38×38 | `#151515` | `1px --border-color-active` | Outfit 14px/600 |
| Conversation `.conv-avatar` | 38×38 | `#141414` | `1px --border-color` | Outfit 14px/600 UPPERCASE |
| Friend `.friend-avatar-wrap` | 38×38 | dark | 1px, hover border `rgba(255,255,255,0.2)` | — |
| Chat header `.partner-avatar` | 38×38 | `#181818` | `1px --border-color` | Outfit /600 |
| Notification `.notif-avatar` | 44×44 | dark | 1px | — |
| Voice member | (voice screen) | dark | — | first 2 chars UPPERCASE |

Initials logic (voice): `name.slice(0,2).toUpperCase()`. Conv/nav: first letter(s) uppercase.
> The web has **no gradient avatar and no seeded color palette** — it's a single flat dark fill per context. Current Flutter `LoveAvatar` picks from 4 grey steps (`#202020..#343434`) by a rune-sum seed; keep it if you like (it's a tasteful superset) but the border alpha is too strong (uses borderActive 0.18 vs web 0.04–0.12) and the initials use weight 900 vs web 600.

### 6.1 Status / presence dots
- `.online-dot` (conv/friend avatar): **10×10**, circle, positioned `bottom:-2px; right:-2px`, bg `#fff` when online, border `2px --bg-secondary`, glow `box-shadow: 0 0 6px rgba(255,255,255,0.4)`, z-index above avatar.
- `.friend-status-dot`: 10×10, border `2px #0a0a0a`. `.online` → `#fff`; `.offline` → `rgba(255,255,255,0.2)`.
- `.quick-status-dot`: same idea (online white).
- **There is no green/red presence** — online = solid white dot, offline = dim white (`rgba(255,255,255,0.2)`) or hidden.
> Current Flutter uses `size*0.24` (≈10.5 at 44px) online=textPrimary, offline=textMuted with a 2px bgSecondary ring — close; switch offline to `rgba(255,255,255,0.2)` and add the online glow.

### 6.2 Voice mute badges — `.voice-status-badge`
- 18×18 circle, bg `#000`, border `1px rgba(255,255,255,0.15)`, positioned at avatar bottom corners (`mic-muted` left:-2px, `sound-muted` right:-2px). SVG 13×13, color `rgba(255,255,255,0.5)`. (Detail for voice spec.)

---

## 7. Badges & counts

### 7.1 Unread dot (chats list) — `.unread-indicator`
- 6×6 circle, bg `--text-primary` (#f5f5f5), margin-left 8px, flex-shrink 0. Pure dot, **no number** in the list. Shown on mobile (`display:flex !important`).

### 7.2 Unread dot (notifications) — `.notif-unread-dot`
- 8×8 circle, bg `#fff`, glow `box-shadow: 0 0 10px #fff`, margin-right 8px.

### 7.3 Count badge (nav bell) — `.pulse-badge-dot`
- Absolute top:6px right:6px, `min-width:14px; height:14px`, bg `#fff`, text `#000`, radius `--radius-sm` (8px), border `1px --bg-primary`, Fira Mono 8.5px weight 800, line-height 1, centered, glow `box-shadow: 0 0 8px rgba(255,255,255,0.6)`. Hidden until `.visible`. Holds a number.
- Pure-dot variant `#mobile-more-badge`: 8×8, radius 50%, bg `#fff`, glow `0 0 6px rgba(255,255,255,0.7)`.

> Palette takeaway: **badges are white pills with black text + white glow**, never colored.

---

## 8. Top headers

Two header archetypes; both **64px tall**, hairline bottom border, no blur on Android.

### 8.1 List/sidebar header — `.sidebar-header`
- height 64px, padding `0 20px`, flex row, `justify-content: space-between`, border-bottom `1px --border-color`.
- Left: `.sidebar-title` (Lora 20px italic 400, -0.5px). Right: `.compose-btn` (borderless icon 18px). On mobile a close "×" (`.mobile-only-toggle-close`, 36×36 circle) sits at right:12px and `.sidebar-header` gets `padding-right:52px`.

### 8.2 Chat header — `.chat-header`
- height 64px, padding `0 24px` (desktop), flex row space-between, bg `rgba(13,13,13,0.35)` + blur(12px) (no blur on Android), border-bottom `1px --border-color`.
- Left: `.chat-partner-info` = 38px avatar + column (`.partner-name` 15px/500, `.partner-status` 11.5px secondary).
- Right: `.chat-actions` = gap 6px of `.action-btn` (36×36 icon buttons, §2.5).

> Current Flutter `ScreenFrame`: 72px tall, title **Outfit 28px weight 800** (sans, bold). This does NOT match the web (Lora 20px italic, 64px header). See Gaps.

---

## 9. Bottom mobile navigation bar (the key mobile chrome)

Web converts the left rail `.global-sidebar` into a bottom bar at `@media (max-width:768px)`:

**Container** (`body .app-container .global-sidebar`):
- `position: fixed; left:0; right:0; bottom:0; width:100%`.
- **height 60px** (+ `env(safe-area-inset-bottom)` padding on Android via perf-android.css → `height: calc(60px + safe-area)`).
- padding `0 16px`, flex **row**, `justify-content: space-around`, `align-items:center`.
- **`border-radius: 0`** (flat bar, NOT a floating pill), border-top `1px rgba(255,255,255,0.08)`, no side/bottom border.
- bg `rgba(10,10,10,0.95)`, `backdrop-filter: blur(30px) saturate(1.2)` (→ none on Android; solid fill).
- `box-shadow: 0 -8px 32px rgba(0,0,0,0.4)`, `z-index:2000`.
- `.app-container` gets `padding-bottom: 60px` so content clears the bar.

**Items (5 visible), each a 44×44 button** (`.nav-btn` / `.logo-nav-area`):
- 44×44, min-height 44, `border-radius: 50%` (circle) by default, bg transparent, no border, color **text-secondary** `#a2a2a2`, SVG 24×24. Transition `all .3s ease`.
- **inactive:** circle, secondary color.
- **hover (touch n/a):** bg `rgba(255,255,255,0.04)`.
- **active:** color `#fff`, bg `rgba(255,255,255,0.08)`, **`border-radius: 12px`** (morphs circle→rounded-square), active SVG gets `filter: drop-shadow(0 0 8px rgba(255,255,255,0.4))`.
- **No text labels** on the web bottom bar — icon-only.

**Item order (left→right):**
1. **Chats** `.logo-nav-area` — filled **heart** when active (`#logo-icon-heart`, glow), **bubble outline** when inactive (`#logo-icon-bubble`).
2. **Servers/Spheres** `#nav-servers` — layers/box icon.
3. **Friends** `#nav-friends` — users icon.
4. **Notifications** `#nav-notifications` — bell icon + `.pulse-badge-dot` count (top:6 right:6).
5. **More** `#mobile-more-trigger` — 3-line "menu" icon. Tapping toggles `.more-open` on the sidebar, revealing 3 floating circle buttons stacked above the More button:
   - `#nav-hub` at `bottom:80px`, `#nav-settings` at `bottom:136px`, `#nav-profile-btn` at `bottom:192px`, all `right:16px`, 44×44 circles (bg `rgba(15,15,15,0.98)`, border `rgba(255,255,255,0.1)`), staggered reveal (`opacity/translateY(20px)/scale(0.9)` → shown), `all .3s cubic-bezier(0.4,0,0.2,1)`. More button itself squares to radius 12 + bg `rgba(255,255,255,0.08)` while open; its icon animates `scale(1.1) rotate(8deg)` + glow.
- The desktop `.sidebar-footer`, `#help-quick-access-btn`, `.sidebar-quick-access`, `.sidebar-divider` are all hidden on mobile.

**Nav icon SVGs (24×24 viewBox, feather/lucide style, stroke-width 1.8, round caps unless noted):**
- Heart (filled, `fill:currentColor`): `M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z`
- Bubble (stroke): `M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z`
- Servers (layers): `polygon 12 2 2 7 12 12 22 7 12 2` + `polyline 2 17 12 22 22 17` + `polyline 2 12 12 17 22 12`
- Friends (users): `M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2` + `circle 9,7 r4` + `M23 21v-2a4 4 0 0 0-3-3.87` + `M16 3.13a4 4 0 0 1 0 7.75`
- Hub (grid): four `rect`s 7×7 at (3,3)(14,3)(14,14)(3,14)
- Bell: `M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9` + `M13.73 21a2 2 0 0 1-3.46 0`
- More (menu): three lines y=6/12/18, x 3→21
- Settings (gear): feather "settings" cog (`circle 12,12 r3` + long gear path)

> Use the exact SVG paths for 1:1 (bundle as assets or `flutter_svg` strings). Material `Icons.favorite`/`layers`/`people`/`notifications`/`menu` are acceptable approximations but the heart-vs-bubble swap and layers glyph are signature.

---

## 10. Motion / transitions

- Global `--transition-smooth`: `all .25s cubic-bezier(0.4,0,0.2,1)`.
- View/panel swap: opacity+scale(0.985) + slide, `.25–.35s cubic-bezier(0.4,0,0.2,1)`.
- Nav icon hover: `svg transform scale(1.1) rotate(8deg)`, `.4s`; nav shape morph circle↔12px via border-radius on active.
- Buttons: hover `translateY(-1px)` `.15s`, primary active `translateY(0)`, secondary active `scale(0.97)`.
- Auth: card in `authCardIn .6s cubic-bezier(0.22,1,0.36,1)` (fade + `translateY(24px) scale(0.97)`→0); form in `.4s`; switch thumb `.32s cubic-bezier(0.5,0,0.2,1)`; spinner `authSpin .8s linear`; shake `.38s`.
- Voice/call easings: EASE_OUT `cubic-bezier(0.16,1,0.3,1)`, EASE_IN `cubic-bezier(0.4,0,1,1)`; mini-bar fades 220–360ms with blur; drag uses lerp `+= (target-cur)*0.16`.
- Floating "more" menu reveal: `all .3s cubic-bezier(0.4,0,0.2,1)`.

---

## 11. Background & the "starfield" (context)

- **Mobile/Android app background = flat `#0a0a0a`.** No stars, no blur, no radial gradient (perf-lite). This is the value to use for the Flutter scaffold/background.
- Desktop non-space default: `#040404` + `radial-gradient(circle at 50% 50%, #101010 0%, #040404 100%)`.
- **Starfield (`starfield.js`)** — desktop-only, gated on `document.body.classList.contains('space-theme')` AND early-returns on Android/`perf-lite`. If ever ported (optional flourish): full-screen `<canvas>` prepended to body; 300 stars + 3 nebulae; stars spawned on a disk (radius `sqrt(rand)*2500`), depth z 0–2500, fly toward camera (`z-=1`, respawn at 2500); each frame paints `rgba(0,0,0,0.8)` then draws. Most stars are 0.2–0.6px dots at `rgba(255,255,255,twinkle)` with a faint radial glow; **max 5** "hero" stars render a 4-point cross + thinner diagonal rays (white gradients) + radial glow. Camera auto-rotates slowly and eases toward mouse (parallax `*0.15`); whole scene rotates `+=0.0003/frame`. Nebulae = huge faint radial gradients, purple `rgba(138,43,226,0.08)` or blue `rgba(0,100,255,0.06)`. **Recommendation: do NOT implement as the mobile background** (matches Android and perf). At most, a static twinkle layer behind auth.
- **Voice constellation (`voice-constellation.js`)** is NOT a background — it's the voice-room member visualization: member cards (`.voice-pcard` buttons: avatar + name, `.speaking`/`.is-own`/`.compact` states) laid in a grid with SVG lines connecting consecutive avatar centers, plus mic/sound mute badges. Belongs to the Voice spec (task #7).

---

## 12. GAP vs current Flutter — concrete change list

### `lib/src/theme/love_tokens.dart`
- **border too strong:** `border = 0x14FFFFFF` (α .078) → should be `rgba(255,255,255,0.04)` = `0x0AFFFFFF`. `borderActive = 0x2EFFFFFF` (α .18) → should be `0x1FFFFFFF` (α .12).
- **danger is wrong:** `danger = #E6E6E6` (near-white) → real destructive red `#E5544F` (`0xFFE5544F`); add danger-bg `0x12E5544F` (α .07), danger-border `0x38E5544F` (α .22), danger-hover `0xFFD13B36`. Keep a separate `accent`/white for filled primary.
- Add `bubblePartnerText = 0xFFDFDFDF`.
- Add `bgAndroid = Color(0xFF0A0A0A)` for the scaffold background.
- Add mono/serif font constants (Outfit/Lora/Fira Mono) once fonts are bundled; add `presenceOnlineGlow`.

### `lib/src/theme/love_theme.dart`
- Fonts not wired: set `fontFamily: 'Outfit'` and register Lora + Fira Mono. Titles must be able to use **Lora italic**.
- `inputDecorationTheme`: fill `Colors.white.withOpacity(0.03)` (auth) — current `0.045` ok-ish; **enabled border** should be `rgba(255,255,255,0.08)` ✅ but radius is right (12). **focused border** `rgba(255,255,255,0.35)` ✅. Add a 3px focus "ring" look (thicker/lighter border or overlay) and height ~44–46. Label style should be Fira Mono 10px uppercase muted (not default).
- `filledButtonTheme`: white/black/12px/weight800 — set weight to **600** (web uses 600, not 800), min height 46 (currently 48), add pressed `translateY`/scale via `overlayColor`. Add disabled opacity 0.35.
- Add explicit `OutlinedButton`/secondary theme: bg `rgba(255,255,255,0.06)`, border `--border-color`, radius 12, weight 500 — for ghost/secondary actions.
- `iconTheme` size 22 → web icon buttons use **18px** glyphs (action-btn) and **24px** nav glyphs; don't globalize to 22.
- Danger color in colorScheme.error should be `#E5544F`.

### `lib/src/widgets/love_background.dart`
- Replace the vertical gradient `#141414→#070707→#030303` with **flat `#0A0A0A`** to match Android reality (or the desktop radial `#101010→#040404` if you want a hint of depth — but flat is the true mobile value). Remove implied blur expectations.

### `lib/src/widgets/love_avatar.dart`
- Border uses `LoveColors.borderActive` (0.18) — too strong; web conv/partner avatars use `--border-color` (0.04). Nav/profile uses border-active (0.12). Make border configurable per context.
- Initials weight 900 → **600**; web is Outfit 600 uppercase. Font size ratio ~0.36 (web 14px on 38px ≈ 0.37) is fine.
- Fallback fill: web uses a single flat dark (`#141414`/`#151515`/`#181818`) not a 4-step seeded grey; simplify or keep but lower contrast.
- Status dot: offline should be `rgba(255,255,255,0.2)` (not textMuted `#646464`); online should add glow `boxShadow 0 0 6px rgba(255,255,255,0.4)`; ring color `#0a0a0a`/bgSecondary 2px ✅. Size 10px at these avatar sizes (current `size*0.24` gives 9–10.5, ok).

### `lib/src/widgets/love_surface.dart`
- Default fill `LoveColors.surface` (`0xEB111111`) is heavier than web card `rgba(255,255,255,0.018)` over dark. For content cards mirror `.lvs-card`: fill `rgba(255,255,255,0.018)`, border `rgba(255,255,255,0.05)`, radius **16**, padding `20×22`. Keep a separate opaque variant for list backgrounds. Drop `shadow` default (web cards are flat; only hover/floating elements get shadow).

### `lib/src/widgets/empty_state.dart`
- Close to web already. Adjust: mark 46×46 (currently 52), border `rgba(255,255,255,0.16)`, icon 24px. Title should be **Lora 22px/600** (currently titleLarge sans/800). Body Outfit 13px/1.45 muted (currently default size). Panel width min(100%,360) ✅. Radius 16 (currently 18).

### `lib/src/widgets/async_value_view.dart`
- Loading spinner `CircularProgressIndicator` color should be `textSecondary`/muted, strokeWidth 2 ✅. Error/empty styling matches muted grey; retry button should be the secondary/outline style (§2.2), not default OutlinedButton.

### `lib/src/features/shell/screen_frame.dart`
- Header height **64** (currently 72). Title should be **Lora 20px italic weight 400, letter-spacing -0.5** for list screens (currently Outfit 28px/800) — this is the single biggest visual mismatch. Padding `0 20px`. Bottom hairline border `rgba(255,255,255,0.04)`. Trailing action = 36×36 icon button (§2.5) / borderless compose (§2.6).

### `lib/src/features/shell/main_shell.dart` (bottom nav)
- Current = **floating rounded pill** (radius 22, margins 12, height 64, labels-on-active, shadow). Web = **flat full-width bar**: radius 0, height 60 (+safe-area), border-top only `rgba(255,255,255,0.08)`, bg `rgba(10,10,10,0.95)` (solid on Android — no BackdropFilter), shadow `0 -8px 32px rgba(0,0,0,0.4)`, `space-around`, **icon-only (no labels)**.
- Items: 44×44 buttons, inactive = circle + color `#a2a2a2`; active = `border-radius 12`, color `#fff`, bg `rgba(255,255,255,0.08)`, icon drop-shadow glow `0 0 8px rgba(255,255,255,0.4)`. Icon 24px. Animate the circle→rounded-square morph (`.3s`).
- Order must be Chats / Servers / Friends / Notifications / More (matches). Chats icon should swap filled-heart(active)↔bubble(inactive). Notifications badge = white pill w/ black mono count (`.pulse-badge-dot`), not a plain red dot; the current `danger` red dot for socket state is off-palette (use white dot).
- The current per-tab border-active (0.18) + white 0.10 bg differ from web active bg 0.08; align to 0.08 and border none (web active has no border, just bg + radius).
- "More" should optionally reveal the floating Hub/Settings/Profile circle stack (§9) rather than a 5th flat page, if matching web exactly — otherwise keep the More page but know the web pattern.

### General
- Only chromatic color anywhere is danger `#e5544f`; everything else is white-alpha on `#0a0a0a`. Avoid introducing accent hues.
- Prefer solid translucent fills over `BackdropFilter` everywhere (Android truth + perf).
