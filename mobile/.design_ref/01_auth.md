# Auth Screen — Design Reference (web → Flutter 1:1)

Source of truth: `client/styles/auth.css`, `client/index.html` (lines 61–320), `client/js/new/auth-ui.js`.
Target: ~390px phone. **CSS px == Flutter logical px.** Mobile = `@media (max-width:600px)` overrides (there is **no** 768px override for auth — auth.css only defines 600px and an empty 380px block).

Design tokens (`:root`): `--radius-md: 12px`, `--radius-xl: 20px`, `--font-sans: 'Outfit'`, `--font-serif: 'Lora'`, `--font-mono: 'Fira Mono'`. text-primary `#f5f5f5`, text-secondary `#a2a2a2`, text-muted `#646464`.
**Error color everywhere = `#eb5a5a` (red).** Not grayscale.

---

## 1. Screen container & background (`.auth-screen`)

- Full screen, flex center. Desktop padding `24px`. **Mobile (≤600px): `padding: 18px 14px`, `overflow-y: auto`, vertically + horizontally centered.**
- Background = radial gradient: `radial-gradient(120% 120% at 50% 0%, #0e0e0e 0%, #050505 60%, #000 100%)` — brightest at top-center, fading to pure black at bottom.
- Show/hide: opacity+visibility transition `0.5s ease` (`.auth-hidden` → opacity 0).

### Animated background layer (`.auth-bg`, absolute, behind card, pointer-events none)
Three blurred drifting orbs + rising particles + grain. All use `mix-blend-mode: screen` (approximate with additive white-glow at low opacity). **For mobile, orbs are the important part; particles/grain are optional polish.**

| Orb | Size | Position | Fill | Anim |
|---|---|---|---|---|
| `--1` | 460×460 | top −120, left −100 | `radial-gradient(circle, rgba(255,255,255,0.10), transparent 70%)` | `authOrbDrift1` 22s: 50% → translate(80,60) scale(1.15) |
| `--2` | 380×380 | bottom −140, right −80 | `rgba(255,255,255,0.07)` | `authOrbDrift2` 28s: 50% → translate(−70,−50) scale(1.1) |
| `--3` | 300×300 | top 40%, left 55% | `rgba(255,255,255,0.05)` | `authOrbDrift3` 34s: 50% → translate(−60,70) scale(0.9) |

- Each orb: `border-radius: 50%`, `filter: blur(70px)`, `opacity: 0.5`, infinite ease-in-out yoyo.
- `.auth-grain`: dotted radial pattern `rgba(255,255,255,0.025) 1px` on `3px 3px` grid, opacity 0.4, `mix-blend-mode: overlay`.
- `.auth-particle`: white hearts `rgba(255,255,255,0.18)` rising from bottom to `-110vh` over a linear loop, rotating to 140°, fade in to 0.5 then out.

---

## 2. Card (`.auth-card`)

- Width `400px`, `max-width:100%`. **Mobile (≤600px): `width:100%`, `padding: 26px 20px 24px`** (desktop `34px 34px 30px`).
- `background: rgba(13,13,13,0.72)` (semi-transparent over the gradient).
- `border: 1px solid rgba(255,255,255,0.08)`; `border-radius: 20px` (radius-xl).
- `backdrop-filter: blur(34px) saturate(1.2)` (glass). Flutter: use `BackdropFilter` w/ `ImageFilter.blur(34,34)` clipped to the rounded rect, or approximate with the translucent fill if blur is too costly.
- `box-shadow: 0 40px 90px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.05)`.
- Entry anim `authCardIn` 0.6s `cubic-bezier(0.22,1,0.36,1)`: from `opacity 0, translateY(24px) scale(0.97)` → settled.
- **`.auth-card--narrow` (Google-username OAuth step) = `width:380px`.**

Vertical order inside card (all stretch full width): **Brand → Switch → Forms**.

---

## 3. Brand (`.auth-brand`) — column, centered, `margin-bottom: 26px`

1. **Heart** (`.auth-brand-heart`): 46×46 box, color `#fff`, `margin-bottom:12px`, `filter: drop-shadow(0 4px 14px rgba(255,255,255,0.18))`, pulse anim `authHeartPulse` 3.2s ease-in-out (scale 1 → 1.08 at 50%). SVG inside is **38×38**.
   - SVG (filled heart, `fill="currentColor"`, viewBox 0 0 24 24):
     `M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z`
   - **No rounded-box container, no border behind heart** — it's a bare glowing white heart.
2. **Wordmark** (`.auth-brand-name`): text **`L O V E`** (letters literally space-separated in markup). Font **Lora (serif)**, `22px`, weight **600**, `letter-spacing: 4px`, color `#f5f5f5`.
3. **Tag** (`.auth-brand-tag`): `мессенджер, сделанный с любовью`. Font **Fira Mono**, `10.5px`, `letter-spacing: 0.5px`, color `#646464` (muted), `margin-top: 6px`.

(OAuth step reuses brand with name = `Почти готово`, tag = `придумайте имя пользователя или оставьте предложенное`.)

---

## 4. Segmented toggle (`.auth-switch`) — Вход / Регистрация

- Container: flex row, `background: rgba(255,255,255,0.04)`, `border: 1px solid rgba(255,255,255,0.06)`, `border-radius: 12px` (radius-md), `padding: 4px`, `margin-bottom: 22px`.
- **Thumb** (`.auth-switch-thumb`, absolute): `top:4 left:4`, `width: calc(50% - 4px)`, `height: calc(100% - 8px)`, `background: #fff`, `border-radius: 9px`, `box-shadow: 0 4px 14px rgba(0,0,0,0.4)`. Slides via `transform: translateX(100%)` when register active. Transition `transform 0.32s cubic-bezier(0.5,0,0.2,1)`.
- **Buttons** (`.auth-switch-btn`): `flex:1`, transparent, `padding: 9px 0`, font **Outfit 13.5px weight 500**. Default color `#a2a2a2` (secondary). **Active color `#000`** (black over white thumb). Color transition `0.3s ease`.
- Labels: `Вход`, `Регистрация`.
- Height ≈ 40px total (9px×2 padding + line + 4+4 padding). Flutter should measure ~44px including the 8px vertical padding — current Flutter uses 44 which is fine.

---

## 5. Forms (`.auth-form`) — column, `gap: 15px`

Only the active form is `display:flex`; entry anim `authFormIn` 0.4s cubic-bezier(0.22,1,0.36,1) (opacity 0 + translateY(10px)→0). Five forms: **login, register, otp, forgot, reset**.

### 5a. Form head (`.auth-form-head`) — used by otp/forgot/reset only (NOT login/register)
- Column, `gap: 7px`, `margin-bottom: 2px`.
- **Title** (`.auth-form-title`): font **Lora**, `24px`, `line-height: 1.1`, weight **650**, color `#f5f5f5`, `letter-spacing: 0`.
- **Note** (`.auth-form-note`): color `#a2a2a2`, `13px`, `line-height: 1.45`.
> Login & register have **no** title/note in the web — they jump straight from the switch to fields. (Current Flutter renders a title/note for all four modes — see gaps.)

### 5b. Field (`.auth-field`) — column, `gap: 6px`
- **Label** (`.auth-label`): font **Fira Mono**, `10px`, `text-transform: uppercase`, `letter-spacing: 1px`, color `#646464` (muted). Labels: `Почта`, `Имя пользователя`, `Пароль`, `Новый пароль`.
- **Input wrap** (`.auth-input-wrap`): relative flex row, centers adornments.

#### Input (`.auth-input`)
- `height: 44px`, `padding: 0 14px`, `box-sizing: border-box`.
- `background: rgba(255,255,255,0.03)`; `border: 1px solid rgba(255,255,255,0.08)`; `border-radius: 12px`.
- Text: **Outfit 14px**, color `#f5f5f5`. Placeholder color `#646464`.
- **Focus**: `border-color: rgba(255,255,255,0.35)`, `background: rgba(255,255,255,0.06)`, `box-shadow: 0 0 0 3px rgba(255,255,255,0.05)` (3px soft ring). Transition `0.25s ease`.
- **is-ok** (valid): `border-color: rgba(255,255,255,0.4)`.
- **is-error**: `border-color: rgba(235,90,90,0.55)`; error+focus ring `rgba(235,90,90,0.12)`.
- Placeholders: login-email `you@example.com`; login-password `••••••••`; reg-password `минимум 8 символов и 1 цифра`; reg-username `username`; reset-password `минимум 8 символов и 1 цифра`.

#### Prefixed input (`@` username — `.auth-input-prefixed`)
- Input `padding-left: 30px`, `padding-right: 38px`.
- **Prefix `@`** (`.auth-prefix`): absolute `left:13px`, font **Fira Mono 14px**, color `#646464`, non-interactive.

#### Eye toggle (`.auth-eye`) — password fields
- Absolute `right:6px`, 32×32 tap target, transparent, color `#646464` (→ `#a2a2a2` on hover). SVG **18×18**, stroke-based, `stroke-width:2`, round caps.
- Two SVGs, toggle `.hidden`:
  - eye-on: `<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/>`
  - eye-off: `<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>`
- Behavior: toggles input obscure; swaps icons. Flutter: `Icons.visibility_outlined` / `Icons.visibility_off_outlined` acceptable, or ship the SVGs.

#### Status indicator (`.auth-status`) — register email/username only
- Absolute `right:12px`, 18×18, SVG 16×16, non-interactive. States drive color + icon:
  - `is-ok`: color `#fff`, check icon.
  - `is-error`: color `#eb5a5a`, cross/x icon.
  - `is-loading`: color `#646464`, spinner icon, `authSpin` 0.8s linear infinite.

#### Hint (`.auth-hint`) — below field
- Font **Outfit 11.5px**, `line-height: 1.35`, `min-height: 14px` (reserves space even when empty), color `#646464`.
- `is-ok` → `#d6d6d6`; `is-error` → `#eb5a5a`. Transition color 0.2s.
- Copy from JS (`checkPassword`, validators):
  - email ok: `Почта корректна`; err: `Некорректный адрес почты`.
  - username err (format): `3–24 символа: латиница, цифры, _`; loading: `Проверяем доступность…`; taken: `Это имя уже занято`; free: `Имя свободно`.
  - password: `Минимум 8 символов` / `Добавьте хотя бы одну цифру` / `Пароль слишком слабый — избегайте простых комбинаций` / `Пароль подходит` (medium) / `Надёжный пароль` (strong).

#### Message block (`.auth-message`) — otp/forgot/reset errors & success
- `display:block`, `min-height:16px`, font **Outfit 12.5px**, `line-height:1.45`. `--error` → `#eb5a5a`; `--success` → `rgba(235,255,235,0.86)`. Hidden via `.hidden`.

---

## 6. Password strength bar (`.auth-strength`) — register only, between password wrap and hint

- Track: `height: 4px`, `border-radius: 3px`, `background: rgba(255,255,255,0.06)`, `overflow:hidden`.
- Fill (`.auth-strength-fill`): height 100%, `border-radius: 3px`, animated `width 0.35s ease, opacity 0.35s ease`.
- **JS drives inline width + background** (overrides the CSS `data-level` rules — use these):
  - weak: `width 30%`, `background #333333`
  - medium: `width 60%`, `background #888888`
  - strong: `width 100%`, `background #ffffff`
  - empty: `width 0%`.
- (CSS `data-level` fallback differs: 33/66/100% w/ opacity 0.4/0.7/1 white — but the live JS values above win.)

Strength logic: <8 chars or no digit → weak(invalid); common-weak/sequence → weak(invalid); len≥10 & ≥3 char-classes → strong; else medium. Both medium & strong are `ok:true`.

---

## 7. Terms checkbox (`.auth-terms`) — register only

- Row, `align-items: flex-start`, `gap: 10px`, `margin-top: 2px`, cursor pointer.
- **Checkbox box** (`.auth-checkbox-box`): 20×20, `border: 1px solid rgba(255,255,255,0.2)`, `border-radius: 6px`, `background: rgba(255,255,255,0.03)`, `margin-top:1px`. Transition all 0.2s.
  - **Checked**: `background:#fff`, `border-color:#fff`; check SVG (13×13, `#000`, stroke-width 3, polyline `20 6 9 17 4 12`) scales 0.6→1, opacity 0→1.
- **Text** (`.auth-terms-text`): font **Outfit 12px**, `line-height:1.45`, color `#a2a2a2`. Content: `Я принимаю [Условия пользования] и [Политику конфиденциальности]`.
- **Links** (`.auth-link`): inline, color `#f5f5f5`, `text-decoration: underline`, `text-underline-offset: 2px`, underline color `rgba(255,255,255,0.35)` (→ `#fff` on hover). Tapping opens docs (external browser).

---

## 8. Primary submit button (`.auth-submit`)

- Full width, `height: 46px`, `margin-top: 6px`, `box-sizing: border-box`.
- `background: #fff`, `color: #000`, `border: 1px solid #fff`, `border-radius: 12px`.
- Font **Outfit 14px weight 600**.
- **Hover** (`:not(:disabled)`): `box-shadow: 0 8px 24px rgba(255,255,255,0.14)`, `translateY(-1px)`.
- **Active/pressed**: `translateY(0)`.
- **Disabled**: `opacity: 0.35`, not-allowed. (register-submit & otp-submit start disabled.)
- Transition `transform 0.15s, background 0.2s, opacity 0.2s, box-shadow 0.2s`.
- **Loading**: JS sets `textContent = 'Проверка...'` + disables (no spinner in web — just text swap).
- Labels: login `Войти`; register `Создать аккаунт`; otp `Подтвердить`; forgot `Отправить письмо`; reset `Сменить пароль`; oauth `Продолжить`.

Note: web is a flat white button (light, not gradient). "Light gradient" in the brief maps to solid `#fff` here.

---

## 9. Divider (`.auth-divider`) — login/register only

- Flex row `gap: 12px`, `margin: 2px 0`. Center label `или` (lowercase in markup, `text-transform: uppercase` → renders **ИЛИ**). Font **Fira Mono 10px**, `letter-spacing: 1px`, color `#646464`.
- Lines: `::before`/`::after` `flex:1; height:1px; background: rgba(255,255,255,0.08)`.

---

## 10. Google button (`.auth-google`) — login/register only

- Full width, `height: 46px`, flex row centered, `gap: 10px`.
- `background: rgba(255,255,255,0.04)`, `border: 1px solid rgba(255,255,255,0.1)`, `border-radius: 12px`, color `#f5f5f5`.
- Font **Outfit 13.5px weight 500**.
- **Hover**: `background: rgba(255,255,255,0.08)`, `border-color: rgba(255,255,255,0.2)`, `translateY(-1px)`. Transition 0.2s / transform 0.15s.
- Icon: multi-path Google "G" glyph, **20×20**, `flex-shrink:0`, `fill=currentColor` (monochrome, colored by text color — NOT the multicolor Google logo). Paths (main "G"):
  `M21 12.3c0-.7-.06-1.4-.18-2H12v3.8h5.06a4.3 4.3 0 0 1-1.87 2.82v2.34h3.02C19.98 17.6 21 15.2 21 12.3z` + 3 more paths at opacity 1/0.55/0.8 (see index.html:167). Emoji-free.
- Labels: login `Войти через Google`; register `Регистрация через Google`.

---

## 11. OTP / 2FA verify form (`#auth-form-otp`)

Shown after register (email verify) OR after login when 2FA on. Same DOM, title/subtitle differ by `window.otpType`.

- **Head**: title `Подтвердите почту` (verification) or **`Код входа`** (login/2FA). Subtitle always `Мы отправили код на почту {email}`.
- **6-digit grid** (`.otp-input-container`): `display:grid`, `grid-template-columns: repeat(6, minmax(0,1fr))`, `gap: 8px`, full width.
  - Each digit (`.otp-digit`): `height: 48px`, `border: 1px solid rgba(255,255,255,0.1)`, `border-radius: 12px`, `background: rgba(255,255,255,0.04)`, `text-align:center`, font **Fira Mono 22px**, color `#f5f5f5`.
  - **Focus**: `border-color: rgba(255,255,255,0.35)`, `background: rgba(255,255,255,0.07)`, ring `0 0 0 3px rgba(255,255,255,0.05)`.
  - Behavior: 1 char each; auto-advance on input; backspace on empty → prev; paste splits 6 digits across cells; submit auto-enables at 6 chars.
  - **Error shake**: add `.shake` → `authShake` 0.38s (translateX −6/+5/−3), removed after 500ms.
- **Error message** (`#otp-error`, `.auth-message--error`): red `#eb5a5a`, hidden until error.
- **Submit** `Подтвердить` (disabled until 6 digits; text→`Проверка...` while checking).
- **Secondary row** (`.auth-secondary-row`): `min-height:18px`, centered, `gap:8px`, color `#646464`, `12px`. Shows countdown `Новый код через <b>60</b> сек.` (60→0, 1s tick) then hides timer and reveals **`Отправить ещё раз`** link. For 2FA-login resend shows `Для получения нового кода повторите вход`.
- **Back link** (`.auth-back-link`, `.auth-link`): centered, `margin-top:2px`, color `#a2a2a2`, text `Назад ко входу`.

## 11b. Forgot (`#auth-form-forgot`) & Reset (`#auth-form-reset`)
- Forgot: head (`Восстановление пароля` / `Введите почту аккаунта. Мы отправим письмо с кнопкой для смены пароля.`) → email field → error/success message → submit `Отправить письмо` → back link.
- Reset: head (`Новый пароль` / `Введите код из письма и новый пароль`) → 6-digit grid (`.reset-otp-digit`, identical style to otp) → new-password field (label `Новый пароль`, eye, hint) → error → submit `Сменить пароль` → back link.
- (Current Flutter uses an AlertDialog for forgot; web uses inline forms. Optional to match — see gaps.)

---

## 12. Animation/transition summary

| Element | Property | Duration / Easing |
|---|---|---|
| Screen show/hide | opacity, visibility | 0.5s ease |
| Card entry | authCardIn | 0.6s cubic-bezier(0.22,1,0.36,1) |
| Form swap | authFormIn | 0.4s cubic-bezier(0.22,1,0.36,1) |
| Switch thumb slide | transform | 0.32s cubic-bezier(0.5,0,0.2,1) |
| Switch label color | color | 0.3s ease |
| Input focus | border/bg/shadow | 0.25s ease |
| Eye/status/hint color | color | 0.2s ease |
| Strength fill | width, opacity | 0.35s ease |
| Submit hover/press | transform/shadow | 0.15s / 0.2s |
| Heart pulse | scale 1→1.08 | 3.2s ease-in-out ∞ |
| Orbs drift | transform | 22/28/34s ease-in-out ∞ |
| OTP error shake | authShake | 0.38s ease |
| Spinner | authSpin | 0.8s linear ∞ |

---

## 13. Typography quick-reference (px, weight, family)

| Element | Family | Size | Weight | Spacing | Color | Transform |
|---|---|---|---|---|---|---|
| Wordmark `L O V E` | Lora | 22 | 600 | 4px | #f5f5f5 | — |
| Brand tag | Fira Mono | 10.5 | 400 | 0.5px | #646464 | — |
| Switch label | Outfit | 13.5 | 500 | — | #a2a2a2 / #000 active | — |
| Form title | Lora | 24 | 650 | 0 | #f5f5f5 | — |
| Form note | Outfit | 13 | 400 | — | #a2a2a2 | — |
| Field label | Fira Mono | 10 | 400 | 1px | #646464 | uppercase |
| Input text | Outfit | 14 | 400 | — | #f5f5f5 | — |
| Prefix `@` | Fira Mono | 14 | 400 | — | #646464 | — |
| Hint | Outfit | 11.5 | 400 | — | #646464 (ok #d6d6d6 / err #eb5a5a) | — |
| Message | Outfit | 12.5 | 400 | — | #eb5a5a / rgba(235,255,235,.86) | — |
| Terms text | Outfit | 12 | 400 | — | #a2a2a2 | — |
| Submit | Outfit | 14 | 600 | — | #000 | — |
| Divider `ИЛИ` | Fira Mono | 10 | 400 | 1px | #646464 | uppercase |
| Google label | Outfit | 13.5 | 500 | — | #f5f5f5 | — |
| OTP digit | Fira Mono | 22 | 400 | — | #f5f5f5 | — |
| Secondary/back | Outfit | 12 | 400 | — | #646464 / #a2a2a2 | — |

Available font weights shipped: **Outfit 300/400/500/600**, **Lora 400–700 range**, **Fira Mono 400**. Do **not** use w800/w900 — max Outfit weight is 600.

---

## 14. GAP vs current Flutter (`mobile/lib/src/features/auth/auth_screen.dart`)

Fix these to match the web:

- **Error/validation color is wrong.** `LoveColors.danger = #E6E6E6` (grayscale). Web uses **`#eb5a5a` red** for input error borders, hints, status crosses, and messages. Add a dedicated `authError = Color(0xFFEB5A5A)` and use it for `_ErrorBox`, error hints, and invalid input borders.
- **Font weights too heavy.** `_BrandMark` uses `FontWeight.w900` for wordmark → should be **w600** (Lora). `_SwitchButton` uses `w800` → should be **w500** (Outfit); active label color is right (black). Submit button text should be **w600**, not default.
- **Wordmark string & font.** Currently `'LOVE'` in the default sans font. Should be **`'L O V E'`** (spaced) in **Lora serif**, size 22, letterSpacing 4, w600, color #f5f5f5.
- **Brand mark is a boxed icon.** `_BrandMark` renders a 58×58 rounded container (`radius 18`, border, `white 0.06` fill) around an SVG. Web has a **bare 46×46 white heart, no box/border/background**, with a white drop-shadow glow and a 3.2s pulse. Inner SVG 38×38. Remove the container; add glow + pulse.
- **Brand tag missing.** Add mono `мессенджер, сделанный с любовью`, 10.5px, #646464, 6px below wordmark. Brand block `margin-bottom: 26px`.
- **Switch container radius/border.** Web: radius **12** (radius-md), border `rgba(255,255,255,0.04→0.06)`, padding 4, `margin-bottom:22`. Thumb radius **9**, white with `0 4px 14px rgba(0,0,0,0.4)` shadow, slide easing `cubic-bezier(0.5,0,0.2,1)` 0.32s. Current uses radius 14 / thumb radius 11 and 180ms — retune.
- **Login/register have title+note in Flutter but NOT in web.** Remove `_title`/`_note` rendering for `login` & `register` modes (keep them only for `otp`/`twoFactor`). In web, login/register go switch → fields directly.
- **Note/title copy differs.** Web otp title = `Подтвердите почты`→`Подтвердите почту` (verify) / `Код входа` (2FA). Note = `Мы отправили код на почту {email}`. Current Flutter copy is custom — align to web strings. Register button label should be **`Создать аккаунт`** (Flutter has `Зарегистрироваться`); register title/note removed anyway.
- **Missing register fields & validation.** Web register order is **Почта → Имя пользователя(@ prefix) → Пароль(strength bar) → terms checkbox**. Flutter has username(plain)→email→password and no `@` prefix, no strength bar, no terms checkbox, no live validation/status icons/hints. Add: `@` prefix adornment, uppercase mono labels, per-field hint line (min-height 14), status check/cross/spinner, password-strength bar (30/60/100% widths at #333/#888/#fff), and terms checkbox gating submit (`register-submit` disabled until email+username+password+terms all valid).
- **Uppercase mono field labels missing.** Flutter uses `InputDecoration.labelText` (floating Material label). Web labels sit **above** the field: Fira Mono 10px, uppercase, letter-spacing 1px, #646464. Rebuild `_LoveField` as label-column + boxed input rather than Material floating label.
- **Input styling.** Web input: height 44, radius 12, `bg rgba(255,255,255,0.03)`, border `rgba(255,255,255,0.08)`, focus border `rgba(255,255,255,0.35)` + bg `0.06` + 3px ring `rgba(255,255,255,0.05)`, text Outfit 14 #f5f5f5, placeholder #646464. Match these exactly.
- **Password eye adornment.** Web password fields have a trailing eye toggle (32×32, #646464→#a2a2a2). Flutter `_LoveField` has no visibility toggle. Add suffix icon toggling obscureText.
- **Submit button not flat-white.** Ensure `FilledButton` is solid `#fff` bg, `#000` text, height 46, radius 12, disabled opacity 0.35, hover/press translate; web has **no spinner** on submit (text → `Проверка...`). Current Flutter shows a black `CircularProgressIndicator` — either keep or switch to text-swap to match web.
- **Divider label.** Web renders `или` uppercased → `ИЛИ`, Fira Mono 10px, letterSpacing 1, #646464, 1px lines at `rgba(255,255,255,0.08)`. Flutter renders lowercase `или` bold — change to mono uppercase, weight 400.
- **Google button.** Web: full-width height 46, `bg rgba(255,255,255,0.04)`, border `rgba(255,255,255,0.1)`, radius 12, label **`Войти через Google`** / **`Регистрация через Google`** (mode-specific), monochrome G glyph 20×20. Flutter uses `OutlinedButton` height 48, radius 12, generic `Продолжить с Google`, and a hand-painted arc mark — retune size/label/mark.
- **OTP input is a single field in Flutter.** Web uses **6 separate boxed cells** (48px tall, radius 12, Fira Mono 22, gap 8, auto-advance, paste-split, shake-on-error). Replace the single `_LoveField` code input with a 6-cell Pinput-style widget.
- **Resend timer missing.** Add `Новый код через N сек.` countdown (60→0) then `Отправить ещё раз` link + `Назад ко входу` back link (`#a2a2a2`).
- **Forgot flow.** Web uses inline `forgot`+`reset` forms (email → email link → 6-digit code + new password). Flutter uses an AlertDialog. Acceptable to keep dialog, but for 1:1 fidelity convert to inline forms with the same copy (`Восстановление пароля`, `Отправить письмо`, `Новый пароль`, `Сменить пароль`).
- **Background.** `LoveBackground` is a top→bottom linear gradient `#141414→#070707→#030303`. Web auth bg is a **radial** `radial-gradient(120% 120% at 50% 0%, #0e0e0e, #050505 60%, #000)` plus three blurred drifting white orbs (opacity 0.5, blur 70). For the auth screen specifically, swap to the radial gradient and add the orbs (or at least a subtle top-center radial glow) rather than the linear gradient.
- **Card glass.** Web card is `rgba(13,13,13,0.72)` with `backdrop-filter blur(34) saturate(1.2)`, border `rgba(255,255,255,0.08)`, radius 20, shadow `0 40px 90px rgba(0,0,0,0.65)` + inset top highlight. Ensure `LoveSurface` here uses radius **20** (currently 22), the translucent fill, and ideally a real `BackdropFilter` blur.
- **Card padding.** Web mobile card padding `26 20 24`; Flutter uses `22 24 22 22`. Align to `EdgeInsets.fromLTRB(20, 26, 20, 24)`. Screen padding web mobile `18 14` (Flutter uses all-18 — set horizontal 14).
- **maxWidth.** Web card 400px; Flutter constrains to 420 — set to **400**.
