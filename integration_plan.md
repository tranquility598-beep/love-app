# План: новый дизайн → рабочее приложение на реальном бэкенде

## Суть подхода
Новый `script.js` становится единственным контроллером UI (владеет всем DOM). Реальные `api.js` + `socket.js` + RTC-ядро `voice.js` переиспользуются как слой данных/транспорта. Старые UI-контроллеры (`app.js, chat.js, servers.js, rooms.js, friends.js, profile.js, roles.js, navigation-controller.js, ui.js, search.js, pinned.js, auth.js, onboarding.js`) **не подключаются** — их поведение переносится в новый `script.js`.

**Почему так, а не переписывать селекторы в старых модулях:** старые модули завязаны на ~400KB кода со старыми DOM id, плюс старый и новый код объявляют одинаковые глобальные функции (`loadFriends`, `appendMessage`, `displayProfile`...) — вместе они не уживутся. Новый макет уже реализует сложный UX (созвездие войса, единый сайдбар, витрина профиля). Транспортный слой UI-независим.

## Ключевые проверенные факты
- Electron грузит `client/index.html` (`client/main.js:103`). Сейчас это пустая заглушка.
- CSP блокирует внешние шрифты (`main.js:683`, `font-src 'self' data:`) → шрифты Google нужно встроить локально (`.woff2` + `@font-face`).
- CSP разрешает `socket.io` с CDN и inline-обработчики (`'unsafe-inline'`).
- `socket.js` вызывает UI-колбэки через `window.*`. Часть вызовов **без** `typeof`-защиты → их обязательно объявить как глобалы до `initSocket()`.
- Бэкенда НЕТ для: Hub (идеи/баги/changelog), уведомлений. В модели User нет mood/hobbies/listening.

## Решения по продукту (согласовано)
- **Love Hub** — пока статичный/read-only: changelog из версии package.json; идеи/баги/голосование — нефункциональные заглушки без фейк-данных. Реальное управление позже через **админ-панель** (в следующей обнове).
- **Уведомления** — строим бэкенд: модель `Notification` + роуты (список/прочитано/очистить) + запись на сервере при упоминании, заявке в друзья, принятии заявки, пропущенном звонке, новом DM. Клиент рендерит реальную ленту.
- **Профиль** — расширяем бэкенд: добавить `mood`, `hobbies[]` (макс 5, по ≤20 симв.), `listening`. Убрать `profileColor` и `banner` из UI и выдачи. `customStatus` → заменить на `mood`. Презенс `status` (online/idle/dnd/offline) оставить.
- **Подача — по этапам с проверками.**

## Контракт `window.*` колбэков (объявить в Фазе 2 до initSocket)
Незащищённые (обязаны существовать, иначе обработчик сокета падает): `appendMessage, scrollToBottom, updateMessageInDOM, updateTempMessageInDOM, removeMessageFromDOM, updateMessageReactions, showTypingIndicator, hideTypingIndicator, updateUserStatus, showNotification, updateVoiceChannelUI, updateVoiceChannelMembersUI, updateSpeakingIndicator, hideVoicePanel`.
Состояние, которое читает socket.js: `currentUser, currentChannelId, currentDMConversation(Id), currentServer(Id), servers, serverRoles, currentProfileUserId, voiceManager, currentVoiceChannel, pendingDMCall, tempIdMapping`.

## voice.js
Оставить RTC-ядро `VoiceManager` (медиа, RTCPeerConnection, offer/answer/ICE, mute/deafen, screenshare). DOM-«хвост» (`updateVoiceChannelUI/MembersUI/SpeakingIndicator/UserVoiceState`) переопределить через `window.fn = ...` в новом script.js (грузится после voice.js → побеждает), перенаправив на `renderVoiceChannel()`. В index.html добавить скрытые контейнеры: `#audio-container`, `#screen-share-container`, `#local-screen-video`.

## Загрузка ассетов в client/
- `app.html` → `client/index.html`; CSS → `client/styles/`; `script.js/auth-ui.js/settings-ui.js/settings.js` → `client/js/new/`.
- Шрифты встроить локально в `client/assets/fonts/`.
- Порядок скриптов: `api.js` → socket.io(CDN) → `socket.js` → `voice.js` → `settings.js` → `settings-ui.js` → `script.js` → `auth-ui.js`. (Добавить `settings.js` — в макете его не было, но socket.js читает `window.settingsManager`.)

---

## Фазы (каждая заканчивается проверкой)

**Фаза 0 — Посадка UI, загрузка до экрана авторизации.** Заменить заглушку index.html, перенести CSS/JS, встроить шрифты, выставить порядок скриптов. Без проводки данных. ✅ Проверка: Electron открывается, экран авторизации с верными шрифтами, нет ошибок CSP в консоли.

**Фаза 1 — Авторизация (реальная).** auth-ui.js → AuthAPI (register/login/OTP/2FA/forgot/reset/Google/onboarding), токен через electronAPI, getMe на старте, afterAuth → initApp. ✅ Проверка: регистрация реального аккаунта → OTP → вход; перезапуск сохраняет сессию; неверный пароль показывает ошибку.

**Фаза 2 — Бутстрап, состояние, реальный сайдбар, контракт колбэков.** mockServers→ServersAPI/RoomsAPI, mockConversations→DMAPI, initSocket после установки контракта. ✅ Проверка: сайдбар показывает реальные сферы/комнаты/DM; сокет подключён; нет ReferenceError от обработчиков.

**Фаза 3 — DM + чат.** mockConversations→DMAPI; отправка/приём через сокет; пагинация; набор текста; ответы; реакции; загрузка файлов; temp-id маппинг; XSS через textContent/escapeHTML. ✅ Проверка: два аккаунта переписываются вживую, edit/delete/react/typing работают, прокрутка вверх подгружает историю.

**Фаза 4 — Сферы/серверы + каналы + роли.** mockServers→ServersAPI/ChannelsAPI; серверный чат через MessagesAPI/сокет; участники; создание/вступление; роли (role:* обработчики). ✅ Проверка: реальные серверы, переключение каналов грузит историю, создание сервера+инвайт+вступление вторым аккаунтом, создание/назначение роли вживую.

**Фаза 5 — Друзья.** mockFriends→FriendsAPI; поиск (UsersAPI.search), заявки/принять/отклонить/удалить; live friend:request_*. ✅ Проверка: заявка A→B вживую, принятие, удаление, «открыть DM» из друга.

**Фаза 6 — Войс (созвездие ↔ RTC).** Кнопки войса → joinVoiceChannel/leaveVoiceChannel + socketJoinVoice; перенаправить DOM-хвост voice.js на renderVoiceChannel; screenshare; DM-звонки (Electron popup). Убрать симуляции войса. ✅ Проверка: два аккаунта в одном войсе слышат друг друга, кольца речи, mute/deafen, демонстрация экрана, DM-звонок звонит и соединяет.

**Фаза 7 — Профиль (расширение бэкенда).** User.js: +mood/+hobbies[]/+listening, убрать выдачу profileColor/banner, customStatus→mood. routes/users.js PUT /profile: принимать новые поля. Клиент: ownProfileData/myHobbies/moodIcons из currentUser; правка → UsersAPI.updateProfile; аватар → UsersAPI.uploadAvatar. ✅ Проверка: правка mood/хобби/bio/трека сохраняется после перезапуска и видна другим; аватар обновляется; нет контролов цвета/баннера.

**Фаза 8 — Настройки.** Префы через SettingsManager (localStorage); смена пароля (changePassword); 2FA toggle; список сессий (getLoginLogs/logoutAll); смена статуса (updateStatus). ✅ Проверка: смена пароля и вход с новым; включение 2FA; список реальных сессий; статус меняется у друга вживую.

**Фаза 9 — Бэкенд уведомлений.** Модель Notification + routes (GET/POST read/DELETE) + запись на сервере в местах эмита (mention, friend_request, friend_accepted, new_dm, missed_call) + эмит notification:new. Клиент: mockNotifications→реальные роуты, лента, бейдж. ✅ Проверка: упоминание/заявка/новый DM создают персистентное уведомление, переживающее перезапуск; прочитано/очистить работают; бейдж точный.

**Фаза 10 — Hub статичный + финальная чистка.** Hub: changelog из package.json, идеи/баги/голосование — заглушки «скоро» без фейк-данных (комментарий: управление позже через админ-панель). Удалить все mock-переменные и мёртвые старые модули; проверить, что фейковых юзеров/серверов (founder/maria/ivan) нигде нет; чистая консоль CSP. ✅ Проверка: grep не находит живых mock*; приложение работает только на транспортном слое + новый UI.

## Риски
CSP-шрифты (встроить локально) · коллизии глобалов (не грузить старые модули) · незащищённые колбэки сокета (объявить в Фазе 2) · scope attach/detach при навигации · temp-id для оптимистичных сообщений · ownProfileData как единый источник профиля до Фазы 7 · XSS через textContent/escapeHTML · добавить settings.js в подключения · холодный старт Render (getMe до 60с — показать warmup).
