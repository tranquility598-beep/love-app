# Tasks - Controlled Rollout Execution Plan

## Шаг 1: Стабилизация слоя оверлеев и модальных окон (Минимальный первый шаг)
- [x] Заменить legacy `closeModal(id)` в `client/index.html` на безопасный прокси-метод.
- [x] Расширить возможности `ModalManager` в `client/js/ui.js` для управления бэкдропами и плавными CSS-переходами.
- [x] Исключить DOM-байпасы и ручные `classList` в `client/js/roles.js` (управление ролями).
- [x] Отрефакторить `openRoomSettings` и `closeRoomSettings` в `client/js/rooms.js` на вызовы `ModalManager`, удалив все прямые DOM-мутации.
- [x] Отрефакторить `forceClearRoomOverlays` в `client/js/app.js` на тонкое делегирование в `ModalManager.closeAll()`.
- [x] Удалить legacy Escape-обработчик и click-outside-слушатель из `client/index.html` (ликвидация stale stack entries).
- [x] Перевести `screen-share-settings-modal` в `client/js/voice.js` на стандартные `openModal`/`closeModal` (устранение hidden active hitbox).
- [x] Зарегистрировать динамические админ-модалки в `client/js/founder.js` и просмотрщик картинок в `client/js/ui.js` внутри стека `ModalManager` (полное единое владение).

## Шаг 2: Устранение навигационного байпаса (DMs & Voice)
- [ ] Реализовать `navigateToDM` и `navigateToVoice` в `client/js/navigation-controller.js`.
- [ ] Отрефакторить `openDMConversation` в `client/js/app.js` на делегирование в `NavigationController`.
- [ ] Отрефакторить `joinVoiceChannel` в `client/js/voice.js` на делегирование в `NavigationController`.

## Шаг 3: Закрепление DOM State Ownership (ES6 Getters)
- [ ] Обернуть навигационные переменные `window.*` в read-only ES6-геттеры к стейту `NavigationController`.

## Шаг 4: Связывание жизненного цикла сокетов с навигацией
- [ ] Интегрировать вызовы `detachScope` при переходах каналов в `NavigationController`.
- [ ] Исправить блокировку сокет-слушателей при реконнекте в `client/js/socket.js`.
