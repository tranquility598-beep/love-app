# Walkthrough - Phase 3C: Room Navigation & Lifecycle Stabilization

Мы успешно стабилизировали жизненный цикл комнат (Room Lifecycle) и устранили критический класс асинхронных гонок (cross-domain overwrite race) между личными сообщениями (DM), серверами и комнатами. 

Ниже представлен отчет о внесенных изменениях и стабилизационных мерах.

---

### 1. Устранение асинхронных гонок (Context Invalidation)
**Файл**: [navigation-controller.js](file:///C:/Users/Aleksandr/desktop/love/client/js/navigation-controller.js)

* **Реализовано**: Добавлена генерация глобального идентификатора навигации (`globalSeq`) при старте серверной навигации (`navigateToServer`):
  ```javascript
  const globalSeq = ++window._globalNavigationSeq;
  window._activeNavigationRequestId = globalSeq;
  ```
* **Результат**: Мгновенно аннулирует все запущенные ранее фоновые асинхронные лоадеры других доменов (например, `loadDMMessages`), не позволяя им по завершении перезаписывать состояние навигации комнаты и вызывать деструктивный метод `showDMView`.

---

### 2. Ликвидация рассинхрона состояния (Half State Commit Fix)
**Файл**: [navigation-controller.js](file:///C:/Users/Aleksandr/desktop/love/client/js/navigation-controller.js)

* **Реализовано**: Заменен ранний возврат (early return) для комнат в `navigateToServer` на полноценный синхронный коммит состояния:
  ```javascript
  this._commitState({
    currentView: 'server',
    currentServer: server,
    currentServerId: serverId
  }, triggeredBy);

  if (typeof setNavigationState === 'function') {
    setNavigationState({
      currentView: 'server',
      activeServerId: serverId,
      activeDMId: null
    });
  }
  ```

### Voice Rooms and Screen Share
- Fixed screenshare rendering inside Room voice channels. The `showScreenShareVideo` and `hideScreenShareVideoForUser` functions now properly inject and clear the video stream cards into `#room-voice-panel-cards`.
- Added CSS layout rules to display screenshare streams at the top/full-width inside the room voice panel (`aspect-ratio`, `max-height`, `contain`).
- Refactored voice control UI to feature monochrome (black, white, and translucent glass) button active states instead of vivid green and blue colors, aligning with the dark, minimalist aesthetic. Red mute/deafened/leave buttons are retained as universally recognized warning colors.
- **Theater Mode:** Replaced the rigid native OS `requestFullscreen` with a custom "Theater Mode" lightbox overlay. Clicking the enlarge button now floats the video in the center of the screen at 90% size with a cinematic dark backdrop that closes seamlessly when clicked outside.

### Messaging and State Fixes
- **Pinned Messages (Server & DM):** Fixed a server routing issue where `message:pin` events were only broadcast to server-bound channels, failing silently in DMs. Added fallback routing for `DirectMessage` participants.
- **Pinned Messages (Client):** Fixed a scope mismatch in `pinned.js` where the modal was reading from a stale local array instead of the globally updated `window.currentChannelPinnedMessages` array.
- **Search Highlighting:** Overhauled the visual feedback when jumping to a message. Messages now smoothly pulse with a white glass overlay (`rgba(255, 255, 255, 0.2)`) and fade out over 1.5 seconds instead of a jarring dimming effect.
- **Avatar Image Fix:** Removed dead `via.placeholder.com` links and replaced them with the native `getAvatarUrl` local fallback logic, resolving `net::ERR_CONNECTION_CLOSED` errors across the search, pinned messages, and profile views.

## Package and Release Support
- Confirmed `package.json` natively configures macOS distribution targeting `dmg` builds for both Apple Silicon (`arm64`) and Intel (`x64`) architectures seamlessly.

## Validation Results

* **Результат**: 
  * Устранен MEDIUM warning в логах диагностики (`currentView="dm" but currentServer is still set`).
  * Полностью восстановлена мгновенная подсветка активного состояния комнаты в левой панели (метод `applyNavigationState` теперь корректно видит статус `'server'`).
  * `ModalManager` больше не сбрасывает комнатные окна и настройки как «устаревшие» (stale), так как реальный контекст DOM и состояние навигации находятся в полной синхронизации.

---

### 3. Самовосстановление и идемпотентность Room UI (Self-Healing & Idempotent Binding)
**Файл**: [rooms.js](file:///C:/Users/Aleksandr/desktop/love/client/js/rooms.js)

* **Реализовано**: 
  1. Обеспечен сброс старых обработчиков перед каждым новым входом:
     ```javascript
     function enterRoomMode() {
       document.body.classList.add('room-mode');
       destroyRoomListeners();
       registerRoomListeners();
     }
     ```
  2. Внедрен механизм самовосстановления (**Self-Healing**) в `registerRoomListeners()`: если функция обнаруживает, что флаг `_registered` равен `true`, она не блокирует выполнение через `return`, а динамически выполняет очистку устаревших слушателей через `destroyRoomListeners()` и заново опрашивает актуальный DOM-снимок для привязки событий.

---

### 4. Разделение и очистка слоев видимости DOM (UI Visibility Lifecycle Enforcement)
**Файлы**: [rooms.js](file:///C:/Users/Aleksandr/desktop/love/client/js/rooms.js), [app.js](file:///C:/Users/Aleksandr/desktop/love/client/js/app.js)

* **Проблема**: 
  1. После выхода из комнаты визуальный контейнер комнаты (`room-view`) оставался незакрытым при переключении на другие root-представления (друзья, приветственный экран и т.д.), что вызывало сбои в детекции `Multiple main views visible` и наложение неактивных DOM-слоев.
  2. Размывающий задний фон настроек комнаты (`room-settings-backdrop`) мог оставаться видимым и перекрывать весь экран, делая кнопки комнаты неинтерактивными (пользователь не мог нажать на элементы, так как клик перехватывался невидимым оверлеем).
* **Реализовано**:
  1. В `rooms.js` в функции `exitRoomMode()` и `applyRoomViewFor()` добавлено принудительное синхронное скрытие выдвижной панели настроек и заднего фона комнаты (`room-settings-backdrop` и `room-settings-panel` принудительно получают класс `hidden` и лишаются `visible`).
  2. В `app.js` в функции показа корневых экранов (`showChatView`, `showWelcomeView`, `showFriendsView`, `showVoiceView`) встроен строгий инвариант: если пользователь не находится в режиме комнаты (`room-mode`), `room-view` гарантированно и мгновенно скрывается (`classList.add('hidden')`).
* **Результат**: Оверлеи больше не зависают в DOM, не блокируют клики, а диагностический лог подтверждает полную консистентность видимых экранов.

---

### 5. Дополнительные материалы
Для поддержания порядка в коде в будущем в корневой каталог проекта добавлен документ:
* **[ownership_map.md](file:///C:/Users/Aleksandr/desktop/love/ownership_map.md)** — Карта владения глобальным состоянием и готовый код детектора дрейфа состояний (`Drift Detection`) для отладки в будущем.

---

### 6. Устранение рассинхронизации бэкдропа и зависания создания комнат (Backdrop Desync & Room Creation Fix)
**Файлы**: [ui.js](file:///C:/Users/Aleksandr/desktop/love/client/js/ui.js), [app.js](file:///C:/Users/Aleksandr/desktop/love/client/js/app.js)

* **Проблема**: 
  1. Асинхронное скрытие элементов (`transitionend` и 350ms safety fallback `setTimeout` в `ModalManager.close`) приводило к десинхронизации стейта `ModalManager.stack` и реального состояния DOM.
  2. Во время создания комнаты закрытие модалки `create-room-modal` происходило асинхронно, из-за чего хитбокс модалки оставался видимым (хоть и с `pointer-events: none`) в течение 350мс, блокируя клики при переходе и создавая ощущение зависания интерфейса.
  3. В случае быстрых переходов или сбоев возникали "orphaned" бэкдропы, которые не чистились функцией `forceClearRoomOverlays()`, так как она делегировала задачу в `ModalManager.closeAll()`, стек которого на тот момент был уже пуст.
* **Реализовано**:
  1. **Синхронное скрытие в ModalManager**: Полностью удалена асинхронная функция `hideElement()`, слушатели `transitionend` и таймаут-фоллбэки. Теперь и модальное окно, и связанный с ним бэкдроп скрываются **синхронно и атомарно в одном тике** с немедленным добавлением класса `hidden` (`display: none !important`) и удалением `visible`.
  2. **Реализация ядерного сброса в forceClearRoomOverlays**: Изменена функция `forceClearRoomOverlays()`. Теперь она не только очищает стек `ModalManager`, но и **всегда гарантированно сбрасывает** все оверлеи, бэкдропы и панели управления комнатой напрямую в DOM, предотвращая появление "осиротевших" оверлеев.
  3. **Глобальный экспорт**: `ModalManager` и его методы совместимости (`openModal`, `closeModal`) теперь принудительно экспортируются на объект `window` для исключения ошибок доступа из любых сторонних контекстов.
* **Результат**: 
  * Диагностика больше не выдает ошибки рассинхрона бэкдропов (`backdrop visible but no modals open`).
  * Процесс создания и мгновенного входа в комнату работает абсолютно стабильно и мгновенно.

---

### 7. Исправление звонков в ЛС и оптимизация битрейта WebRTC (DM Calling Fix & WebRTC Bitrate Capping)
**Файлы**: [socket.js](file:///C:/Users/Aleksandr/Desktop/Love/client/js/socket.js), [voice.js](file:///C:/Users/Aleksandr/Desktop/Love/client/js/voice.js), [screenshare.js](file:///C:/Users/Aleksandr/Desktop/Love/client/js/screenshare.js)

* **Проблема**:
  1. Звонки в ЛС не доходили до получателя, потому что сокет-функции сигналинга (`socketRequestCall`, `socketSendCallResponse`, `socketEndCall`) не были экспортированы в глобальный объект `window`. При попытке вызвать `window.socketRequestCall()` или `window.socketEndCall()` происходил тихий пропуск, и сокет-запрос не уходил на сервер.
  2. Во время демонстрации экрана голос сильно пролагивал. В WebRTC не было жесткого ограничения битрейта (`maxBitrate`) для трансляции экрана, из-за чего видеопоток забивал весь исходящий канал (достигая 4-6 Mbps) и приводил к высокой потере пакетов, джиттеру и задержке на аудиоканале.
* **Реализовано**:
  1. **Экспорт сокет-методов**: В `socket.js` в глобальный объект `window` добавлены все необходимые сокет-интерфейсы: `socketJoinVoice`, `socketLeaveVoice`, `socketSendOffer`, `socketSendAnswer`, `socketSendIceCandidate`, `socketSpeaking`, `socketToggleMute`, `socketToggleDeafen`, `socketRequestCall`, `socketSendCallResponse`, `socketEndCall`.
  2. **Ограничение битрейта WebRTC**: В `voice.js` реализован метод `applyVideoBitrate(pc, bitrateValue)`, который находит активный видео-сендер (`RTCRtpSender`) и принудительно выставляет параметр `maxBitrate`.
  3. **Оптимизированные пресеты качества**: Уменьшены максимальные битрейты трансляций для домашних/мобильных интернет-соединений, чтобы защитить аудиоканал от забивания:
     - `low`: 500 kbps (480p 10fps)
     - `medium` (стандартный): 1.2 Mbps (720p 15fps)
     - `high`: 2.0 Mbps (1080p 24fps)
     - `ultra`: 3.0 Mbps (1080p 30fps)
  4. **Автоматическое применение**: Ограничение битрейта автоматически форсируется во всех точках жизненного цикла соединения (при успешном созвоне `connected`, обмене SDP-офферами/ансверами в `handleAnswer` и при пересогласовании `renegotiate`).
* **Результат**: Звонки в ЛС теперь стабильно доходят и вызывают оверлей звонка, а при запуске демонстрации экрана звук голоса остается кристально чистым и не пролагивает.

---

### 8. Разработка панели администратора (Admin App Development)
**Файлы**: [admin/index.html](file:///C:/Users/Aleksandr/Desktop/Love/admin/index.html), [admin/src/index.css](file:///C:/Users/Aleksandr/Desktop/Love/admin/src/index.css), [admin/src/App.jsx](file:///C:/Users/Aleksandr/Desktop/Love/admin/src/App.jsx)

* **Результат**: 
  - *Login Screen*: Вход по почте/паролю с полноценной поддержкой 2FA-кодов.
  - *Home (Аналитика)*: Графики Recharts по дням для новых регистраций и сообщений, а также KPI плитки.
  - *Users (Модерация)*: Живой поиск, выдача мута (от 10 минут до бессрочного), бан с указанием причины, принудительное отключение от сокетов (Kick), смена ролей (Support / Moderator / Admin / Founder).
  - *Servers*: Просмотр и полное удаление комнат/серверов.
  - *Reports (Жалобы)*: Очередь жалоб пользователей с возможностью отклонения или вынесения вердикта.
  - *Announcements (Анонсы)*: Форма отправки анонсов на клиенты (тосты или модальные окна) с интерактивным превью.
  - *Logs (Аудит)*: Список всех действий администрации.
  - *Infrastructure*: Режимы баз данных, Cloudinary, Node Uptime/Memory и количество сокет-соединений в реальном времени.
* **Результат**: Полностью готовое к деплою на Vercel приложение, безопасно управляющее платформой.

---

### 9. Премиальный экран блокировки (Ban Screen), Real-Time выселение и поддержка/жалобы
**Файлы**: [auth.js](file:///C:/Users/Aleksandr/Desktop/Love/server/middleware/auth.js), [auth.js](file:///C:/Users/Aleksandr/Desktop/Love/server/routes/auth.js), [admin.js](file:///C:/Users/Aleksandr/Desktop/Love/server/routes/admin.js), [users.js](file:///C:/Users/Aleksandr/Desktop/Love/server/routes/users.js), [index.html](file:///C:/Users/Aleksandr/Desktop/Love/client/index.html), [auth.js](file:///C:/Users/Aleksandr/Desktop/Love/client/js/auth.js), [app.js](file:///C:/Users/Aleksandr/Desktop/Love/client/js/app.js), [socket.js](file:///C:/Users/Aleksandr/Desktop/Love/client/js/socket.js), [api.js](file:///C:/Users/Aleksandr/Desktop/Love/client/js/api.js), [ui.js](file:///C:/Users/Aleksandr/Desktop/Love/client/js/ui.js), [auth.css](file:///C:/Users/Aleksandr/Desktop/Love/client/styles/auth.css), [main.css](file:///C:/Users/Aleksandr/Desktop/Love/client/styles/main.css), [modals.css](file:///C:/Users/Aleksandr/Desktop/Love/client/styles/modals.css)

* **Реализовано**:
  1. **Премиальный экран бана**: Добавлен новый оверлей `#ban-screen` с анимированным пульсирующим щитом блокировки, подробным блоком причины нарушения правил и кнопкой возврата.
  2. **Real-time сокет-выселение**: При бане на бэкенде сначала отправляется персональное сокет-событие `user:banned`, и только через `setTimeout` (~500мс) сокет закрывается. Это гарантирует, что клиент успеет обработать событие и плавно переключится на экран блокировки. Также была удалена дублирующая отправка старого сокет-события `founder:announcement`, чтобы исключить появление старого верхнего баннера при публикации анонсов.
  3. **Прямой редирект при запуске**: Защита на уровне `/api/auth/me` и `AuthAPI.getMe()` перехватывает бан и отправляет пользователя на Ban Screen прямо при запуске приложения.
  4. **Адекватная система жалоб (Reports)**:
     - Добавлен эндпоинт `POST /api/users/report` на бэкенде с регистронезависимым поиском нарушителя через RegExp (`User.findOne({ username: { $regex: new RegExp("^" + escapedUsername + "$", "i") } })`) с экранированием спецсимволов.
     - Добавлен раздел «Поддержка и жалобы» в настройки пользователя в клиенте.
     - Пользователи могут выбрать причину (спам, домогательства, шок-контент и др.), указать нарушителя и отправить жалобу, которая мгновенно попадает в очередь модераторов в админке.
  5. **Редизайн тостов и модальных окон**:
     - Тосты перерисованы в премиальном полупрозрачном стеклянном стиле (`backdrop-filter`) с неоновой подсветкой левой грани, соответствующей типу уведомления (Emerald green для успеха, Ruby red для ошибок, Amber для предупреждений и Cyber blue для инфо).
     - Модальные окна стали более размытыми и аккуратными, добавлен новый `#announcement-modal` для глобальных объявлений от основателей и администрации.
     - Полностью отключена регистрация старого сокет-слушателя `founder:announcement` в `client/js/socket.js`, а старый эмиттер в `server/socket/socketHandler.js` перенаправлен на событие `admin:announcement` типа `normal`, чтобы всегда выводить аккуратные тосты вместо верхнего баннера.
