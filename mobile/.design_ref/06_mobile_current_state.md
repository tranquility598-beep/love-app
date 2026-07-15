# 06 — Mobile CURRENT state (Settings + Love Hub) & gap vs desktop

Maps what the native Flutter app renders TODAY so we know what to build to match the
desktop Settings (`client/index.html` §settings-shell + `client/js/new/settings-ui.js`)
and Love Hub (`view-hub`).

Sources read (mobile):
- `mobile/lib/src/features/settings/settings_screen.dart` (1063 ln)
- `mobile/lib/src/features/more/love_hub_screen.dart` (265 ln)
- `mobile/lib/src/features/more/more_screen.dart`, `detail_rows.dart`
- `mobile/lib/src/core/network/love_api.dart`
- `mobile/lib/src/session/app_session.dart`, `features/auth/auth_repository.dart` (AuthUser)
- `mobile/lib/src/widgets/*`

---

## A. settings_screen.dart — structure

Single `StatefulWidget`, one `_SettingsSection` enum with **10 tabs** (matches desktop 1:1):
`profile, account, privacy, appearance, notifications, voice, hub, updates, advanced, about`.

Rendered as a horizontal-scroll strip of icon+label buttons (`_SettingsTabs` → `_SettingsTabButton`,
86px wide each) at the top; body switches on `_section`. Reachable two ways:
- embedded page inside the bottom-nav "More" tab (`showBack:false`, no Scaffold), OR
- pushed route from the More menu (`showBack:true`, wraps in `Scaffold`+`LoveBackground`, adds back button).

Hydrates from `AppSessionScope.of(context).user` in `didChangeDependencies` (`_hydrate`), keyed by user id.
Text controllers: `_nickname, _bio, _customStatus, _mood, _listening, _musicTitle, _hobbies` (+ `_musicUrl` string).

### Per-section content (CURRENT)

| Tab | What is actually there today | Real vs placeholder |
|---|---|---|
| **profile** | Avatar card (`LoveAvatar` + "Аватар" upload via `_pickAvatar`→`uploadAvatar`). "Публичная карточка" card: TextFields for **Отображаемое имя** (32), **О себе** (190), **Статус** (48), **Настроение** (32, *plain text*). "Активность" card: **Сейчас слушает**, **Название трека** + music upload (`_pickMusic`→`uploadMusic`) / clear, **Сферы увлечений** (comma text). Error line + **Сохранить профиль** (`_saveProfile`→`updateProfile`). | **FUNCTIONAL** (only fully-real section) |
| **account** | `_SettingsCard` of read-only `DetailRow`s: Email, @username, created (`compactDate`), last seen. `DetailStatGrid`: friends/servers/role/status. `_securitySection`: 3 read-only `_SettingsRow`s (Пароль / Google OAuth / 2FA — status text only). "Сессия" card → logout button. | **READ-ONLY** (no edit actions, no real 2FA) |
| **privacy** | `_SettingsCard` with 3 hard-coded `_SettingsSwitchRow`s (Показывать онлайн, Запросы в друзья, ЛС из сфер) all `value:true`. | **FAKE** (local-only, not persisted) |
| **appearance** | 1 `_SettingsRow` "Тема: Черная" + 2 switches (Анимации false, Показывать аватары true). | **FAKE / partial** |
| **notifications** | 3 switches (Сообщения, Упоминания, Звук). | **FAKE** |
| **voice** | 2 switches (Шумоподавление, Эхо-компенсация) + 1 `_SettingsRow` "Устройство ввода: Системный микрофон". | **FAKE** |
| **hub** | 2 static `_SettingsRow`s (Love Hub / Ранний доступ — descriptive text). | **INFO only** |
| **updates** | 2 static `_SettingsRow`s (Канал: mobile debug / Проверка). | **INFO only** |
| **advanced** | 1 `_SettingsRow` "Кеш" + logout button. | **partial** |
| **about** | 2 `DetailRow`s (Клиент: Flutter / Пользователь). | **INFO only** |

### Shared building-block widgets defined *inside* settings_screen.dart (private)
- `_SettingsTabs` / `_SettingsTabSpec` / `_SettingsTabButton` — the top tab strip.
- `_SettingsCard(title, subtitle, child)` — `LoveSurface` card w/ title + muted subtitle + content.
- `_SettingsRow(icon, title, subtitle)` — static 38px-circle-icon row (no interaction).
- `_SettingsSwitchRow(icon, title, value)` — **stateful, local `_value` only; onChanged just `setState`. No callback, no persistence, no API.**
- Also reuses `DetailRow` / `DetailStat` / `DetailStatGrid` from `more/detail_rows.dart`.

**Key limitation:** every toggle/select-like control outside `profile` is decorative — no
selects, no sliders, no persistence layer, no backend/localStorage write.

---

## B. love_hub_screen.dart — structure

`LoveHubScreen` (pushed route from More). Loads `_api.releaseInfo()` (`GET /release`) once,
renders through `AsyncValueView` + `RefreshIndicator`. Shows:
- Hero `LoveSurface`: sparkle icon, `title` ("LOVE"), `Версия {version}`, a **progress bar** +
  `Готовность: {progress}%`, and a `message` line — all pulled from the `/release` payload.
- "Загрузки" section: one `_DownloadTile` per `downloads` map entry (label + href → `launchUrl`
  external; platform icon guessed from label). Empty-state text if none.

That's the whole screen — it is essentially a **release/version + download-links viewer**.
It does NOT reproduce the desktop Love Hub bento dashboard (hero announcement editor, version
stat, top-idea card, useful links, Dev Log / update-history / ideas / bugs modals, suggest-idea /
report-bug actions). Those desktop features are largely stubbed ("Скоро" / "В разработке") and
have **no dedicated backend**, so this is a lower-priority gap.

---

## C. More menu wiring (more_screen.dart + detail_rows.dart)

`MoreScreen` (a bottom-nav tab, `ScreenFrame` "Еще"): user header card (`LoveAvatar` + name +
status/email line), then 3 `_MoreTile`s that `Navigator.push` to:
1. **Профиль** → `ProfileScreen()` (subtitle = friends/servers counts)
2. **Love Hub** → `LoveHubScreen()`
3. **Настройки** → `SettingsScreen(showBack:true)` (subtitle = login methods password/Google/2FA)

`detail_rows.dart` exports reusable `DetailRow` (icon+label+value), `DetailStat`/`DetailStatGrid`
(2-col stat cards), and `compactDate(DateTime?)` → `dd.mm.yyyy`.

---

## D. API surface — `LoveApi` public methods (mobile)

DM/chat: `conversations`, `conversationMessages`, `openConversation`, `deleteConversation`,
`messages`, `sendMessage`, `uploadFile`.
Search: `searchUsers`.
Servers/rooms: `servers`, `server`, `createServer`, `rooms`, `createRoom`, `createInvite`,
`updateServer`, `leaveServer`, `deleteServer`, `uploadServerIcon`, `uploadServerBanner`,
`deleteServerIcon`, `deleteServerBanner`, `invitePreview`, `joinInvite`.
Friends: `friends`, `sendFriendRequest`, `acceptFriend`, `declineFriend`, `removeFriend`.
Notifications: `notifications`, `markNotificationsRead`, `clearNotifications`.
Profile/media: **`updateProfile`** (`PUT /users/profile`), **`uploadAvatar`** (`PUT /users/avatar`),
`uploadMusic` (`POST /upload`), `uploadAttachment` (`POST /upload`).
Release: **`releaseInfo`** (`GET /release`).

Auth-adjacent (in `AuthRepository`, not LoveApi): login/register/verifyOtp/verifyTwoFactor/
completeExternalAuth/forgotPassword/issueSocketToken/logout/restoreSession.

### Session / user state (`app_session.dart`)
`AppSession extends ChangeNotifier`; holds `user (AuthUser?)`, `isBooting/isBusy/error`.
Auth flows via `_runAuth`. **`updateUser(AuthUser)` / `updateUserFromJson(Map)`** replace the
current user and `notifyListeners()` — this is how Settings pushes saved profile data back
(`session.updateUserFromJson(response['user'])`). Exposed through `AppSessionScope` (InheritedNotifier).
`AuthUser` already models: nickname, bio, customStatus, mood, listening, music(title/url), hobbies,
badges, servers, friends, hasPassword, hasGoogle, twoFactorEnabled, createdAt, lastSeen, role, isFounder.

---

## E. Shared reusable widgets (`lib/src/widgets/`) — reuse targets

- **love_surface.dart** — `LoveSurface`: the base card/panel (faint translucent fill, hairline border, radius, optional shadow). Building block for every card.
- **love_background.dart** — `LoveBackground`: flat `#0a0a0a` scaffold background (perf-lite truth).
- **love_avatar.dart** — `LoveAvatar`: circular avatar w/ image or initials + presence dot.
- **love_pill_tabs.dart** — `LovePillTabs`/`LovePillTab`: horizontal pill filter tabs (count + pending dot). *Candidate to replace the bespoke `_SettingsTabs` strip.*
- **love_search_field.dart** — `LoveSearchField`: compact translucent search input.
- **empty_state.dart** — `EmptyState`: centered icon+title+message (+ optional action).
- **async_value_view.dart** — `AsyncValueView<T>`: FutureBuilder wrapper (loading/error/retry/empty). Used by Love Hub.
- **love_nav_icons.dart** — `LoveNavIcon`/`LoveNavGlyph`: exact web bottom-nav SVG glyphs.

There is **no** shared toggle-row / select-row / slider-row widget yet — the settings switch/row
primitives are private to `settings_screen.dart` and non-functional. Building real, reusable
`SettingsToggleRow` / `SettingsSelectRow` / `SettingsSliderRow` widgets is the main groundwork.

---

## F. GAP ANALYSIS — desktop vs mobile

Desktop settings sections & controls come from `client/index.html` lines ~1150–1727 and are wired
in `settings-ui.js`. Section list is identical; the **controls inside are the gap**. Also note the
desktop has a global **dirty-tracking Save/Reset bar** + unsaved-changes confirm modal — mobile has
only a per-section "Сохранить профиль" button (profile only).

| Section | Desktop controls | Mobile status | Gap |
|---|---|---|---|
| **Profile** | avatar upload/remove, name(32), username(read-only here), bio(190), status(48), **mood ICON picker**, listening + audio upload, **hobbies editor (add/edit/delete, ≤5, icon per hobby)**, **live "vitrine" preview** | most fields present; mood is a **plain text field**, hobbies is a **comma string**, **no icon picker, no live preview, avatar remove missing** | **PARTIAL** |
| **Account** | change email (modal+password), change username (modal+password), change password (modal), created + age badge, **real 2FA toggle**, logout, **delete account (danger)** | all read-only + logout | **MISSING** all edit actions, real 2FA, delete |
| **Privacy** | online toggle, **who-sees-profile select** (all/friends/none), show-activity toggle, **friend-request select**, **DM select** | 3 fake toggles | **MISSING** selects + activity + granularity + persistence |
| **Appearance** | **theme grid** (dark/light/system), **UI-scale slider 75–125%**, compact-mode, animations, transparency toggles | 1 static theme row + 2 fake toggles | **MISSING** theme picker, scale slider, compact/transparency; note mobile is dark-only per perf spec |
| **Notifications** | notif **preview**, desktop, **push**, messages, mentions, app-updates, Love-Hub toggles (6) | 3 fake toggles | **PARTIAL/MISSING** (push, updates, hub, preview) |
| **Voice & sound** | input **device select**, input **volume slider**, **mic meter + test**, output device select, output volume slider, **sound test**, noise-suppr, echo-cancel, voice-activation, **push-to-talk key** | 2 fake toggles + 1 static device row | **MISSING** devices/sliders/meter/test/PTT |
| **Love Hub (settings)** | 4 channel subscribe toggles (Анонсы/Dev Log/Идеи/Обратная связь) + info banner | 2 info rows | **MISSING** toggles |
| **Updates** | version badge, status badge, **beta-channel toggle**, download progress, **check-updates button**, changelog card | 2 info rows | **MISSING** (mobile can’t self-update, but version/status/check are showable) |
| **Advanced** | debug-mode, hw-accel toggles, **cache size + clear**, **diagnostics**, **reset-all-settings (danger)**, warning banner | cache info row + logout | **MISSING** debug/clear/diagnostics/reset |
| **About** | logo, version + build badges, tagline, team credits, links (site/docs/support), email | 2 info rows | **MISSING** version/build/credits/links |

### API methods: exist vs need to add

**Backend endpoints already exist** — mobile just needs `LoveApi` wrappers:
- `updateAccount({username,email,currentPassword})` → **`PUT /users/account`** (users.js:152). *Missing on mobile* → powers Account change email/username.
- `changePassword(currentPassword,newPassword)` → **`POST /auth/change-password`** (auth.js:612). *Missing on mobile.*
- `toggleTwoFactor(enabled)` → **`POST /auth/security/2fa`** (auth.js:651). *Missing on mobile* → real 2FA switch.
- `updateStatus(status,customStatus)` → **`PUT /auth/update-status`** (auth.js:791). *Missing.*
- (optional security) `getLoginLogs` / `logoutAll` → `GET /auth/login-logs`, `POST /auth/logout-all`. *Missing.*

**Already covered by mobile LoveApi:** profile save (`updateProfile`), avatar (`uploadAvatar`),
music (`uploadMusic`), release/hub (`releaseInfo`), logout (`AuthRepository.logout`).

**No backend / no API needed (client-local on desktop too):** Privacy / Appearance / Notifications /
Voice / settings-Hub / Advanced toggles are persisted on desktop via **localStorage + `settingsManager`**,
NOT the server. Mobile equivalent = a local prefs store (e.g. `shared_preferences`) + a real reusable
toggle/select/slider widget set — **no new API required**, this is UI + local-persistence work.

**Delete account:** desktop button is a `window.confirm` stub with **no backend endpoint** — do not
assume an API exists.

**Love Hub content (ideas/bugs/update-history):** **no server routes/models exist** (only
`/release`, `/updates/download/*`, `/early-access`, and admin `/admin/announcements`). Desktop hub
cards are placeholders. So the mobile Hub screen is not far behind functionally; matching it is mostly
visual (bento layout, useful-links, version stat), not new endpoints.
