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

