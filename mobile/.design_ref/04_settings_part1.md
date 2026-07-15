# 04 — Settings, Part 1 (Sections 1–5)

Design/behavior spec extracted 1:1 from the Love web client. Covers the first
five settings sections: **Профиль, Аккаунт, Конфиденциальность, Внешний вид,
Уведомления**. Sections 6–10 (Голос и звук, Love Hub, Обновления, Расширенные,
О приложении) are out of scope here.

## Source files

| Concern | File | Notes |
|---|---|---|
| Markup | `client/index.html` | Settings view `#view-settings` (line 1135); sections 1135–1716; save-bar 1720–1727; close-confirm modal 1733–1743; account modal 2327–2337 |
| Controller (new design) | `client/js/new/settings-ui.js` | Whole `#settings-shell` behavior; the live source of truth for wiring |
| Legacy settings manager | `client/js/settings.js` | `window.settingsManager` — localStorage prefs (`get`/`saveSetting`), applies theme/scale/compact/animations |
| API layer | `client/js/api.js` | `AuthAPI`, `UsersAPI` (REST via Electron IPC proxy or `fetch` fallback) |
| Profile data + icon sets | `client/js/new/script.js` | `ownProfileData`, `moodIcons` (6466), `hobbyIcons` (6479), `myHobbies` (6492), `parseListening` (6022), `renderHobbyTags` (6509), `openHobbyEditor` (6557), `refreshProfileVitrine` (6040) |
| Profile music | `client/js/new/profile-music.js` | `window.ProfileMusic.setOwnMusic()` — local file + Cloudinary copy |
| Styles | `client/styles/settings.css` | `.lvs-*` design tokens; `@media` breakpoints at 1024 / 768 / 420 px |

Init: `settings-ui.js` runs on `DOMContentLoaded` → `initSettings()` which calls
`initNavigation, initModal, initProfile, initSelects, initSliders,
initThemeOptions, initNotifPreview, initVoice, initDangerActions, initUpdates,
initAbout, initVersions, initAdvanced, initAccount, initPrefsPersistence,
initDirtyTracking` in that order (settings-ui.js:9–29). All queries are scoped to
`#settings-shell`.

---

## Shell, navigation & mobile behavior

Container `#settings-shell` = left sidebar (`.settings-sidebar`) + right work area
(`.settings-content` → `.settings-content-scroll`).

**Close button** `#settings-close-btn` (X icon, `title/aria="Закрыть"`).
Handler in `initDirtyTracking`: calls `tryClose()` → if dirty, shows the
unsaved-changes modal; else `doClose()` returns to previous view (`lastView`,
default `view-chats`).

**Sidebar nav** — `<nav class="settings-nav">` with group headers
`Пользователь`, `Приложение`, `Система`. Each item is a `<button
class="settings-nav-item" data-settings-section="...">` with an SVG + `<span>`
label. Sections 1–5 map to these items (in order):

| Nav label (RU) | `data-settings-section` | Section `id` | Group |
|---|---|---|---|
| Профиль | `settings-profile` | `#settings-profile` | Пользователь |
| Аккаунт | `settings-account` | `#settings-account` | Пользователь |
| Конфиденциальность | `settings-privacy` | `#settings-privacy` | Пользователь |
| Внешний вид | `settings-appearance` | `#settings-appearance` | Приложение |
| Уведомления | `settings-notifications` | `#settings-notifications` | Приложение |

(Also present but out of scope: Голос и звук, Love Hub, Обновления, Расширенные,
О приложении.) Default active item/section = **Профиль** (`class="... active"`).

`initNavigation` (settings-ui.js:37): clicking a nav item →
`showSection(id)` toggles `.active` on the matching `<section>` and nav button,
sets the mobile header title `#settings-mobile-title` to the item's span text,
and scrolls `.settings-content-scroll` to top. On phones (`innerWidth <= 768`)
it also adds `.section-open` to the shell (slides content panel in).

**Mobile header** `.settings-mobile-header` (hidden on desktop, `display:flex`
under 768px) holds Back button `#settings-back-btn` (arrow-left SVG,
`aria="Назад"`) + `#settings-mobile-title` (default text `Профиль`).
`initNavigation` back handler removes `.section-open`.

### Responsive layout (settings.css @media)

| Breakpoint | Changes |
|---|---|
| `≤1024px` | sidebar width var 248→**210px**; `.lvs-grid--split` collapses to 1 column; `.lvs-preview-card { position: static }` |
| `≤768px` | `#view-settings` full-screen, no backdrop blur; shell 100%×100%, no radius/border/shadow; sidebar full-width; content panel is `position:absolute; inset:0; transform:translateX(100%)` and slides to `0` when `.section-open`; mobile header shown; `.lvs-row { flex-wrap: wrap }`; `.lvs-slider-wrap { min-width:100% }`; `.lvs-select { min-width:150px }`; save-bar becomes fixed full-width bottom bar with its text hidden; `.lvs-vitrine-preview { position: static }` |
| `≤420px` | `.lvs-theme-grid` → 1 column; `.lvs-avatar-row` stacks vertically (`flex-direction:column`) |

**Port note (Flutter):** phones always use the mobile pattern — a list of section
rows that pushes to a full-screen detail page with a Back button; there is no
two-pane split. The desktop sidebar+content split is not needed on Android.

---

## Section 1 — Профиль (`#settings-profile`)

Header: title **«Профиль»**, desc **«Так вас видят другие пользователи Love»**.
Layout `.lvs-grid lvs-grid--split` = edit form card (left) + live preview card
(right; becomes stacked below on ≤1024px). Wired by `initProfile`
(settings-ui.js:77) with the live-preview updater `syncVitrine()` (123).

### Form fields

| Control | id | Type | Limit / attrs | RU label / placeholder | Counter | Reads/writes |
|---|---|---|---|---|---|---|
| Avatar preview | `#lvs-avatar-preview` (letters in `#lvs-avatar-letters`) | div w/ bg-image | — | — | — | `applyAvatar()`; letters via `lettersFrom(name)` |
| Avatar upload btn | `#lvs-avatar-upload` | button | — | «Загрузить» | — | opens `#lvs-avatar-input` |
| Avatar remove btn | `#lvs-avatar-remove` (`.lvs-btn--ghost`) | button | — | «Удалить» | — | clears preview + `__pendingAvatarFile=null` |
| Avatar file input | `#lvs-avatar-input` | `file`, `accept="image/*"`, hidden | — | hint: «PNG, JPG или GIF. До 5 МБ.» | — | on change → `URL.createObjectURL`, stores `window.__pendingAvatarFile` (uploaded on Save) |
| Отображаемое имя | `#lvs-input-name` | `text` | `maxlength="32"` | «Отображаемое имя» | `#lvs-name-count` `/32` | `syncVitrine`; saved as `nickname` |
| Имя пользователя | `#lvs-input-username` | `text` | `maxlength="24"`, **set `readOnly=true` by JS** | «Имя пользователя», `@` prefix (`.lvs-input-prefix`) | — | hint `#lvs-username-result` forced to «Имя пользователя меняется в разделе «Аккаунт».» (settings-ui.js:112–113). Edited only in Аккаунт. |
| О себе | `#lvs-input-bio` | `textarea` | `maxlength="190"`, `rows="3"` | placeholder «Расскажите о себе...» | `#lvs-bio-count` `/190` | saved as `bio` |
| Статус (настроение) | `#lvs-input-status` | `text` | `maxlength="48"` | «Статус (настроение)», placeholder «Чем заняты прямо сейчас?» | — | saved as `customStatus` |
| Иконка настроения | `#lvs-mood-picker` | button grid | — | label «Иконка настроения» | — | `moodIcons` set; writes `ownProfileData.mood`; saved as `mood` |
| Сейчас слушает | `#lvs-input-listening` | `text` | `maxlength="80"` | placeholder «Исполнитель — Название», hint «Формат «Исполнитель — Название». Можно загрузить свой трек.» | — | saved as `listening` |
| Audio upload btn | `#lvs-audio-upload` (`.lvs-btn--ghost`) | button | — | «Загрузить», `title="Импортировать свой аудиофайл"` | — | opens `#lvs-audio-input` |
| Audio file input | `#lvs-audio-input` | `file`, `accept="audio/*"`, hidden | — | — | — | `ProfileMusic.setOwnMusic(file)` (async, uploads immediately) |
| Сферы увлечений | `#lvs-hobbies-editor` | dynamic list | max **5**, ≤**20** chars each | label «Сферы увлечений», hint «До 5 увлечений, по 20 символов каждое.» | — | `myHobbies` array; saved as `hobbies` |

**Counters:** `syncVitrine` sets `nameCount.textContent = name.length` and
`bioCount.textContent = bio.length` on every `input` event (settings-ui.js:170).

**Mood picker** (settings-ui.js:256): renders one `.lvs-mood-item` button per
`window.moodIcons`. `moodIcons` names (script.js:6466) in order:
`tea, smile, frown, heart, star, moon, sun, cloud, music, book`. Default selected
= `ownProfileData.mood || 'tea'`. Click → set active, update `ownProfileData.mood`,
`syncVitrine()`.

**Hobbies editor** (`renderHobbiesEditor`, settings-ui.js:281): each hobby row
`.lvs-hobby-row` shows its icon SVG + text + delete button `.lvs-hobby-delete`.
Delete → `splice` + re-render. Row click (not on delete) → `openHobbyEditor(index,
cb)`. If `< 5` hobbies, an add button `.lvs-hobby-add` («Добавить») appends →
`openHobbyEditor(-1, cb)`. `hobbyIcons` names (script.js:6479):
`tea, palette, code, music, book, camera, globe, game, heart, activity`.
Default `myHobbies` (script.js:6492): «Чайный мастер»/tea, «UI Творец»/palette,
«Кодер»/code, «Меломан»/music. Hobby editor modal `#hobby-editor-modal` lives in
`script.js` (`openHobbyEditor`, 6557) — name input `#hobby-input-name`, icon
picker `#hobby-icon-picker`, save `#hobby-btn-save`, delete `#hobby-btn-delete`,
title toggles «Изменить сферу»/«Добавить сферу».

### Live preview (`#lvs-profile-preview` / `.lvs-vitrine`)

Label «Так видят ваш профиль». Mirror elements updated by `syncVitrine()`:
`#lvs-vitrine-avatar`(+`-text`), `#lvs-vitrine-name` (empty→«Без имени»),
`#lvs-vitrine-username` (`@`+user||`username`), section label «настроение:» with
`#lvs-vitrine-mood` (SVG) + `#lvs-vitrine-status` (hidden when empty), «сейчас
слушает:» lofi player with `#lvs-vitrine-track-title` / `#lvs-vitrine-track-artist`
(parsed via `window.parseListening`), «сферы увлечений:» `#lvs-vitrine-hobbies`
(`renderHobbyTags(..., {editable:false})`). `parseListening` (script.js:6022):
splits on first `-` → `{artist, title}`; no dash → artist «Неизвестный».

### Save / Reset / Dirty tracking

Managed by `initDirtyTracking` (settings-ui.js:778). A snapshot of
`{name,user,bio,status,listening,mood,avatarUrl,hobbies(JSON)}` is taken on init
and after each save; `checkDirty()` (called on every input via
`window.__settingsRefreshDirty`) compares and toggles `.visible` on the save bar.

**Save bar** `#lvs-save-bar` (index.html 1720): text «Есть несохранённые
изменения» (`.lvs-save-bar-text`, hidden on mobile), buttons
`#lvs-reset-btn` «Сбросить» (`.lvs-btn--ghost`) and `#lvs-save-btn` «Сохранить».

**Save flow** `doSave()` (settings-ui.js:836):
1. Validate: trimmed name must be non-empty, else `#lvs-username-result` shows
   «Имя не может быть пустым» in red (`#ff4a4a`) and aborts.
2. If `window.__pendingAvatarFile` set → `UsersAPI.uploadAvatar(file)` first.
3. `UsersAPI.updateProfile(payload)` with payload keys:
   `{ nickname, bio, customStatus, listening, mood, hobbies:[{text,icon}] }`.
4. On success: sync `currentUser`/`ownProfileData`, re-snapshot, toast
   `showToast('Профиль','Изменения сохранены.')`, `refreshProfileVitrine()`,
   update nav avatar letter, reset hint text. On error → red hint + error toast.

**Reset flow** `doReset()` (settings-ui.js:922): restores all inputs and
`ownProfileData` from the last snapshot, re-renders, toast «Настройки» /
«Изменения сброшены.».

**Endpoints (api.js):**

| Action | Method | Endpoint | Body / field |
|---|---|---|---|
| Save profile | `PUT` | `/users/profile` | `{nickname,bio,customStatus,listening,mood,hobbies}` (`UsersAPI.updateProfile`) |
| Upload avatar | `PUT` | `/users/avatar` | multipart, field **`avatar`** (`UsersAPI.uploadAvatar`) |
| Upload music (Cloudinary copy) | `POST` | `/upload` | multipart, field **`file`** (`UsersAPI.uploadMusic`), then `updateProfile({listening, music:{url,title}})` |

**Music note** (`ProfileMusic.setOwnMusic`, profile-music.js:32): title =
filename minus extension; owner's local path saved to `localStorage`
(`love_my_music_path`/`love_my_music_title`); compressed copy uploaded to
Cloudinary for other listeners; if cloud upload fails, toast warns «Трек добавлен,
но копию для друзей загрузить не удалось. Попробуйте аудиофайл до 10 МБ.»

---

## Section 2 — Аккаунт (`#settings-account`)

Header: **«Аккаунт»** / **«Данные для входа и безопасность»**. Wired by
`initAccount` (settings-ui.js:1105); `fillAccountInfo()` populates from
`window.currentUser`.

### Card 1 — credentials (read rows + «Изменить» buttons)

| Row label | Value element | Button | Modal type |
|---|---|---|---|
| Электронная почта | `#lvs-acc-email` (default «—») | `#lvs-acc-email-btn` «Изменить» | `email` |
| Имя пользователя | `#lvs-acc-username` (default «—», rendered as `@username`) | `#lvs-acc-username-btn` «Изменить» | `username` |
| Пароль | sub-text «Регулярно обновляйте пароль» | `#lvs-acc-password-btn` «Изменить» | `password` |
| Дата создания | `#lvs-acc-created` (`toLocaleDateString('ru-RU', {day,month:'long',year})`) | badge `#lvs-acc-age` = `N дн.` | — (read-only) |

`fillAccountInfo` (settings-ui.js:1141): email→`u.email||'—'`,
username→`'@'+u.username`, created from `u.createdAt`, age = days since creation.

### Card 2 — security

| Row | Control id | Default | Handler / endpoint |
|---|---|---|---|
| Двухфакторная аутентификация («Дополнительная защита при входе») | toggle `#lvs-2fa-toggle` | `= !!u.twoFactorEnabled` | `AuthAPI.toggleTwoFactor(enabled)` → `POST /auth/security/2fa` `{enabled}`; on error reverts + toast |
| Выйти из аккаунта («Завершить текущую сессию») | button `#lvs-logout-btn` «Выйти» | — | `doLogout()` → `AuthAPI.logout()` `POST /auth/logout`, teardown music, disconnect socket, clear token/user, `showAuthScreen()` |

### Card 3 — danger zone (`.lvs-card--danger`)

Subtitle «Опасная зона»; desc «Удаление аккаунта необратимо. Все сообщения,
серверы и данные будут стёрты навсегда.» Button `#lvs-delete-account`
«Удалить аккаунт» (`.lvs-btn--danger`). Handler `initDangerActions`
(settings-ui.js:620): `confirmDanger('Удалить аккаунт безвозвратно? Все данные
будут стёрты.')` → **`window.confirm` only; no delete endpoint is called (stub).**

### Account modal (`#lvs-account-modal`, index.html 2327)

`.profile-card` with close `#lvs-account-close`, title `#lvs-account-title`,
dynamic fields `#lvs-account-fields`, error `#lvs-account-error`, submit
`#lvs-account-submit` «Подтвердить». Fields built by `openAccountModal(type)`
(settings-ui.js:1198) via `mk(label,type,placeholder,maxlen)`:

| type | Title | Fields (label / input type / placeholder / maxlen) | Validation | API |
|---|---|---|---|---|
| `password` | «Изменить пароль» | «Текущий пароль» pwd `••••••••`; «Новый пароль» pwd «Минимум 8 символов» max 128; «Повторите новый пароль» pwd max 128 | non-empty; new ≥8 («Новый пароль — минимум 8 символов»); match («Пароли не совпадают») | `AuthAPI.changePassword(cur,next)` → `POST /auth/change-password` `{currentPassword,newPassword}`; ok «Пароль изменён» |
| `email` | «Изменить почту» | «Новая почта» email `name@example.com`; «Текущий пароль» pwd | email non-empty («Введите новую почту») | `UsersAPI.updateAccount({email,currentPassword})` → `PUT /users/account`; ok «Почта обновлена» |
| `username` | «Изменить имя пользователя» | «Новое имя пользователя» text `username` max 32; «Текущий пароль» pwd | ≥2 chars («Имя — минимум 2 символа») | `UsersAPI.updateAccount({username,currentPassword})` → `PUT /users/account`; ok «Имя пользователя обновлено» — also updates `#lvs-input-username` |

Submit (`initAccountModal`, 1173): disables button, runs `_accountSubmit()`,
on success toast `'Аккаунт'`/okMsg + closes; on error writes message to
`#lvs-account-error`. Backdrop mousedown / close btn hides modal.

---

## Section 3 — Конфиденциальность (`#settings-privacy`)

Header: **«Конфиденциальность»** / **«Кто и что может видеть о вас»**.

> ⚠️ **GAP / behavior note:** none of these controls have an `id` or
> `data-setting-key`, and `settings-ui.js` has **no `initPrivacy`** — so in the
> new design these toggles/selects are **display-only**: they render with their
> hardcoded defaults, custom-select open/close works (`initSelects`), but **no
> value is persisted and no API/endpoint is called.** The legacy
> `settings.js` defaults (`privacy-online-status`, `privacy-activity`,
> `privacy-friend-requests`, `privacy-server-invites`, `privacy-dm-from-servers`,
> `privacy-typing-indicator`, all default `true`) exist in `settingsManager` but
> are **not bound to this markup**. Treat defaults below as the source of truth
> for a 1:1 visual port; wire persistence yourself if the native app needs it.

### Card «Видимость»

| Control | Type | Default | Options (`data-value` → label) |
|---|---|---|---|
| Статус «в сети» («Показывать, когда вы онлайн») | toggle `<input type=checkbox checked>` | **on** | — |
| Кто видит профиль | `.lvs-select` `data-value="all"` | **Все** | `all`→Все, `friends`→Друзья, `none`→Никто |
| Показывать активность («Что вы слушаете и во что играете») | toggle checked | **on** | — |

### Card «Запросы»

| Control | Type | Default | Options |
|---|---|---|---|
| Запросы в друзья | `.lvs-select` `data-value="all"` | **Все** | `all`→Все, `fof`→Друзья друзей, `none`→Никто |
| Личные сообщения | `.lvs-select` `data-value="friends"` | **Друзья** | `all`→Все, `friends`→Друзья, `none`→Никто |

**Custom select mechanics** (`initSelects`, settings-ui.js:357): button
`.lvs-select-btn` (span label + chevron SVG) toggles `.open`; the `<ul
.lvs-select-menu>` is re-parented to `document.body` and `position:fixed` under
the button (avoids backdrop-filter clipping), repositioned on scroll/resize,
flips above if it would overflow. Selecting an `<li>` sets `select.dataset.value`,
updates the label, marks `.selected`, returns menu to the select, and dispatches
`CustomEvent('lvs-change', {detail: value})`. Outside click closes all.

---

## Section 4 — Внешний вид (`#settings-appearance`)

Header: **«Внешний вид»** / **«Тема, масштаб и эффекты интерфейса»**.

### Card «Тема» — `.lvs-theme-grid` (3 buttons, 1 col ≤420px)

| Button | `data-theme` | Label | Default |
|---|---|---|---|
| `.lvs-theme-option active` | `dark` | «Тёмная» | **active by default** |
| `.lvs-theme-option` | `light` | «Светлая» | |
| `.lvs-theme-option` | `system` | «Системная» | |

Handlers: `initThemeOptions` (settings-ui.js:489) toggles `.active` and sets
`document.documentElement.setAttribute('data-theme', theme)`.
`initPrefsPersistence` (1061) **persists** to `localStorage['app-theme']` and
re-applies the saved theme + active class on load.

### Card «Масштаб / режимы»

| Control | id / attrs | Type | Range / default | RU label + sub | Persistence |
|---|---|---|---|---|---|
| Масштаб интерфейса | `#lvs-scale-slider` `min=75 max=125 step=5 value=100`; value `#lvs-scale-value` («100%») | `range` | 75–125%, **100%** | «Масштаб интерфейса» / «Размер текста и элементов» | `settingsManager.saveSetting('ui-scale', N)` on `change`; applies `documentElement.style.fontSize = 16*v/100 px` (settings-ui.js:470, 1078) |
| Компактный режим | toggle `data-setting-key="compact-mode"` | checkbox | **off** | «Компактный режим» / «Плотнее размещать сообщения» | `settingsManager` key `compact-mode` (default `false`); adds `body.compact-mode` |
| Анимации | toggle `data-setting-key="animations" checked` | checkbox | **on** | «Анимации» / «Плавные переходы интерфейса» | `settingsManager` key `animations` (default `true`); toggles `body.no-animations` |
| Эффекты прозрачности | toggle `<input checked>` (**no id, no key**) | checkbox | **on** | «Эффекты прозрачности» / «Размытие и стекло» | ⚠️ **not persisted / no handler** — visual only |

Generic toggle persistence (`initPrefsPersistence`, 1089): any
`input[type=checkbox][data-setting-key]` is initialized from
`settingsManager.get(key)` and writes back on `change`. Slider value label is
formatted `v + '%'` by `bindSlider`/`initSliders`.

---

## Section 5 — Уведомления (`#settings-notifications`)

Header: **«Уведомления»** / **«Что и где вам показывать»**.

**Preview** `#lvs-notif-preview` (`initNotifPreview`, settings-ui.js:503): a mock
toast — Love heart icon, title «Love», body «Так будут выглядеть ваши
уведомления». Click replays its entrance animation (removes/re-adds `.replay`
class with a reflow).

**Toggle list** (single `.lvs-card`). All are bare `<input type="checkbox">`
with **no id and no `data-setting-key`**:

| Row label (RU) | Default |
|---|---|
| Уведомления на рабочем столе | **on** (`checked`) |
| Push на телефон | **on** |
| Сообщения | **on** |
| Упоминания | **on** |
| Обновления приложения | **off** (no `checked`) |
| Love Hub | **on** |

> ⚠️ **GAP:** like Privacy, these notification toggles are **not wired** in
> `settings-ui.js` — no persistence, no endpoint. Legacy `settings.js`
> `settingsManager` defines `notif-messages/-friends/-sound/-mentions/-preview`
> (all default `true`) but they are **not bound** to this new markup. Use the
> defaults above for the visual port; add persistence natively if required.

---

## Cross-cutting: unsaved-changes guard

`initDirtyTracking` also intercepts navigation while settings are open and dirty:

- **Close confirm modal** `#lvs-close-confirm` (index.html 1733): heading
  «Несохранённые изменения», body «У вас есть несохранённые изменения настроек.
  Сохранить их перед выходом?», buttons `#lvs-close-confirm-cancel` «Отмена» and
  `#lvs-close-confirm-save` «Сохранить».
- Trigger points: settings close button, backdrop mousedown, `Escape` key, and
  clicking any other `[data-target]` sidebar/nav button — all call `tryClose()` /
  set a pending action; if `dirty`, the modal blocks and offers Save.
- Only **profile** fields participate in dirty tracking (name/user/bio/status/
  listening/mood/avatar/hobbies). Theme, scale, and toggles persist immediately
  and are **not** part of the dirty snapshot.

## Networking note

`apiFetch`/`apiUpload` (api.js) route through Electron IPC proxy
(`window.electronAPI.apiRequest`/`apiUpload`) when available, else `fetch` with a
`Bearer` token from `localStorage`. Base URL: `https://api.loveapp.chat/api` in
production/Capacitor, else localhost. For the native Android port, the same REST
endpoints/payloads apply — auth via the stored token.
