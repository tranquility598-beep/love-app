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
## Приоритетные баги и текущая задача (В процессе)
- [x] **Текущая задача**: Добавить регулятор громкости на плеер голосовых сообщений (ГС) в чате.
  - Найти рендеринг плеера ГС в [client/js/chat.js](file:///C:/Users/Aleksandr/Desktop/Love/client/js/chat.js) и добавить кнопку mute (🔊/🔇) и тонкий белый слайдер громкости (input range, 60px).
  - Стилизовать в [client/styles/chat.css](file:///C:/Users/Aleksandr/Desktop/Love/client/styles/chat.css) аналогично видеоплееру.
- [x] **Баг 1 (ВЫСОКИЙ)**: Спам уведомлений от удалённых из друзей.
  - В [server/socket/socketHandler.js](file:///C:/Users/Aleksandr/Desktop/Love/server/socket/socketHandler.js) проверять, есть ли отправитель в списке друзей получателя перед отправкой DM.
- [x] **Баг 2 (НИЗКИЙ)**: Видимый бэкдроп без открытых модалок.
  - Локализовать в [client/js/ui.js](file:///C:/Users/Aleksandr/Desktop/Love/client/js/ui.js) или [client/js/rooms.js](file:///C:/Users/Aleksandr/Desktop/Love/client/js/rooms.js), почему диагностика выдает "1 backdrop visible but no modals open".

## Шаг 2: Устранение навигационного байпаса (DMs & Voice)
- [x] Реализовать `navigateToDM` и `navigateToVoice` в `client/js/navigation-controller.js`.
- [x] Отрефакторить `openDMConversation` в `client/js/app.js` на делегирование в `NavigationController`.
- [x] Отрефакторить `joinVoiceChannel` в `client/js/voice.js` на делегирование в `NavigationController`.

## Шаг 3: Закрепление DOM State Ownership (ES6 Getters)
- [x] Обернуть навигационные переменные `window.*` в read-only ES6-геттеры к стейту `NavigationController`.

## Шаг 4: Связывание жизненного цикла сокетов с навигацией
- [x] Интегрировать вызовы `detachScope` при переходах каналов в `NavigationController` (делегировано в `SocketLifecycle`).
- [x] Исправить блокировку сокет-слушателей при реконнекте в `client/js/socket.js`.

## Шаг 5: Кастомизация интерфейса и премиальный дизайн (Кастомные SVG-иконки)
- [ ] Провести аудит текущих иконок приложения (поиск дефолтных плейсхолдеров и AI-артефактов).
- [ ] Разработать и интегрировать единый стиль кастомных SVG-иконок для повышения премиальности визуального оформления:
  - Иконки каналов (текстовые, голосовые, защищенные)
  - Иконки элементов управления (микрофон, звук, экраны, настройки)
  - Навигационные элементы (стрелки, поиск, бургер-меню, триггеры ЛС)
- [ ] Оптимизировать SVG-код (чистка метаданных, адаптация под `currentColor` для динамической стилизации через CSS/глассморфизм).

