# Прогресс проекта LOVE

## Сделано

### Инфраструктура и деплой
- **Лендинг задеплоен**: loveapp.chat на Render (static site, publish dir `sandbox/public`)
- **API сервер задеплоен**: `https://loveapp-1-dk8a.onrender.com` (Web Service, root dir `sandbox/api`)
- **Resend настроен**: API ключ на Render, домен loveapp.chat DNS записи добавлены (DKIM/SPF/MX в Spaceship)
- **Cloudflare**: nameservers `benedict.ns.cloudflare.com` / `maisie.ns.cloudflare.com`, CNAME `@` → `loveapp-landing.onrender.com`, CNAME `api` → `loveapp-1-dk8a.onrender.com`, Email Routing: support@loveapp.chat → loveapp.support@gmail.com
- **CORS whitelist**: `loveapp.chat`, `loveapp-landing.onrender.com`

### Формы
- **Early access form**: POST → API → Resend шлет на support@loveapp.chat + авто-ответ юзеру
- **Support form**: POST → API → Resend шлет нотификацию + авто-ответ, `replyTo` = email юзера
- **MAIL_FROM** временно `LOVE <onboarding@resend.dev>` — переключим на `noreply@loveapp.chat` после верификации домена Resend

### Фавикон
- `client/assets/icon.png` скопирован в `sandbox/public/icon.png`, `<link rel="icon">` добавлен

### UI дизайн-система (sandbox/new-design)
- **Wabi-sabi ЧБ стиль**: монохромная палитра, никаких эмодзи, только SVG иконки
- **Аватарки**: круглые круги с буквой (не квадрат, не circle-in-circle), шрифт Outfit 600, uppercase
- **Кнопки навигации**: круг → скругленный квадрат на hover/active, без морфинга
- **2-оконная архитектура**: Global Sidebar + Content Panel (убрана 3-уровневая)
- **Плавные переходы**: `transitionPanels()` с fade + translateY, `hubModalSlideIn` для модалок

### Голосовой канал — серверный (Server Voice Panel)
- **Созвездие (Constellation)**: органическая раскладка аватарок по wabi-sabi координатам
- **SVG линии созвездия**: `.constellation-lines-svg` с пульсацией `lineBreath`
- **Парение**: `starFloatOdd` / `starFloatEven` колебания
- **Волны разговора**: `speakingPulse` + `voiceWave` концентрические кольца
- **Float preview**: полупрозрачный превью с 16:9 aspect-ratio, появляется/исчезает по клику на аватарку
- **Draggable preview**: `_dragState`, lerp 0.25 через rAF, clamped в родительский контейнер, touch+mouse
- **Expand/collapse preview**: toggle EXPAND_SVG ↔ SHRINK_SVG, сохраняет `_miniPos[userId]`, анимация от текущей позиции до 90% панели и обратно
- **Appear animation**: `.appearing` CSS класс с `previewAppear` keyframes, удаляется по `animationend`
- **Hide animation**: `animatePreviewToAvatar()` — Web Animations API scale(1)→scale(0) с transformOrigin у центра аватарки
- **Shrink animation**: `animatePreviewShrink()` — Web Animations API scale(1)→scale(0) center origin, при выключении кам/шары
- **Камера ↔ Скриншер взаимное исключение**: `_streamAnimating` блокирует клики во время анимации, переключение: shrink → re-render
- **Safety timeout на `_streamAnimating`**: 800мс автоматический сброс
- **Один полуоткрытый превью**: `_voicePreviewState.openUserId`, collapsed показывает иконку типа (share vs cam)
- **Позиции**: `ps.positions[userId]` сохраняются перед удалением, восстанавливаются при пересоздании; expanded позиции НЕ сохраняются
- **Индикаторы mute**: `.voice-status-badge.mic-muted` = `left: -2px`, `.voice-status-badge.sound-muted` = `right: -2px`
- **Кнопки управления**: mic/sound/cam/share/disconnect — актив = белый фон + черный глиф, muted = полупрозрачный + пунктир
- **Disconnect**: пилюля с белой заливкой, hover инверсия, иконка трубки 135° → 0°

### Голосовой канал — комнаты (Room Voice Panel)
- **Preconnect overlay**: `.voice-preconnect-overlay` с кнопкой "Войти в голосовой" + счетчик участников
- **Join button**: скрывает overlay, показывает connected bar, ставит `roomVoiceConnected = true`, синкает кнопки
- **Disconnect button**: показывает overlay, скрывает connected bar, ставит `roomVoiceConnected = false`
- **Footer bar**: mic/sound/cam/share/leave — делегируют клики серверным кнопкам через `.click()`
- **Делегирование**: `syncRoomBtns()` глобальная — синкает классы/иконки с серверных на комнатные кнопки

### DM звонок
- **Mini-bar**: draggable (touch+mouse), lerp 0.25, clamped к экрану, `.dragging` убирает `translateX(-50%)`
- **Анимации**: appear = scale(0.9)→1; minimize = `callEndShrink` + `miniBarSlideIn`; expand = `miniBarSlideOut` + scale(0.95)→1; end = `callEndShrink` + `miniBarSlideOut`

### SVG иконки
- `MIC_OFF_SVG` — микрофон + диагональ
- `SOUND_OFF_SVG` — наушники + диагональ
- `SCREENSHARE_SVG` — монитор
- `CAM_SVG` — силуэт человека (не видеокамера)
- `EXPAND_SVG` / `SHRINK_SVG` — стрелки expand/collapse
- `DEVLOG_BROKEN_SVG` — сердце + трещина `M13 5l-2.5 5 3.5 2-3 4.5` (НЕ диагональ)
- **Канальные иконки**: текст = chat bubble SVG, войс = microphone SVG (14px, opacity 0.5)
- **Emoji→SVG**: 🤍 и 💔 в Dev Log заменены на SVG сердце и broken heart

### Модалка создания сферы/комнаты
- Тип-селектор: Сфера (сервер с каналами) / Комната (приватный войс+чат)
- Поле названия с плейсхолдером
- Создает запись в `serversData`, рендерит сайдбар, выбирает созданное, показывает toast
- CSS: `.create-space-type-selector`, `.create-space-type-btn` с active/hover стилями

### Deafen → auto-mute
- `soundBtn` click: мьютит микрофон при выключении звука
- `micBtn` click: анмьютит звук при включении микрофона

### Сайдбар
- **`renderUnifiedSidebar()`**: создает аккордеон один раз, при переключениях меняет только CSS классы (`.active`, `.expanded`)
- **Channel items**: плавные переходы, `gap: 6px` для иконки + текста
- **Space cards**: плавное раскрытие `max-height: 250px`

### Прочее
- **Room voice preconnect**: счетчик участников обновляется при `renderVoiceChannel()`
- **Тестовая панель удалена** из HTML (функция `setTestUsers` оставлена в JS для отладки)
- **Favicon** добавлен на лендинг
- **Support page** lang=ru, async form handler, category fallback
- **`_voicePreviewState`** всегда инициализируется с `_miniPos: {}`, `positions: {}`, `collapsed: {}`

---

## В процессе / Не сделано

### Голосовые фичи
- [ ] Wire room voice join к реальному WebRTC (сейчас toast + UI toggle, нет реального подключения)
- [ ] Wire server voice к реальному WebRTC
- [ ] DM call mini-bar — привязать к реальным звонкам (сейчас mock)

### UI фичи
- [ ] Настройки: привязать слайдеры и тоглы к реальным данным
- [ ] Friends: привязать к реальному списку контактов
- [ ] Notifications: привязать к реальным уведомлениям
- [ ] Admin panel: привязать логи к реальным серверным метрикам
- [ ] Hub: привязать идеи/обновления к реальной БД

### Инфраструктура
- [ ] Resend domain verification — дождаться DNS propagation, переключить `MAIL_FROM` на `noreply@loveapp.chat`
- [ ] Cloudflare zone activation — дождаться nameserver propagation

---

## План переноса sandbox/new-design → client/

### Принцип: **wrap, don't rewrite**
Старый `client/js/voice.js` (1958 строк) продолжает управлять WebRTC.
Новый код из `sandbox/new-design/script.js` только рендерит UI и реагирует на события.
Сокеты и WebRTC остаются нетронутыми.

### Шаг 1: CSS — `voice-constellation.css`
Создать `client/styles/voice-constellation.css`, перенести из `sandbox/new-design/style.css`:
- Стили созвездия: `.voice-member-bubble`, `.voice-member-avatar-wrap`, `.voice-cam-stream-mock`
- Волны: `speakingPulse`, `voiceWave`, `.speaking::before/::after`
- Float preview: `.float-preview`, `.preview-appear`, `previewAppear`, `.expanded`
- Drag: стили draggable
- Footer bar: `.voice-footer-bar`, `.voice-control-btn`, `.voice-disconnect-btn`
- Preconnect overlay: `.voice-preconnect-overlay`, `.voice-preconnect-join-btn`
- Status badges: `.voice-status-badge.mic-muted`, `.voice-status-badge.sound-muted`
- Mini-bar DM: `.dm-call-mini-bar`, `miniBarSlideIn`, `miniBarSlideOut`, `callEndShrink`
- Модалка создания: `.create-space-type-selector`, `.create-space-type-btn`
- Мобильные адаптации из медиа-запросов

Не переносить:
- Старый тестовый CSS
- Стили лендинга / Hub / друзей / уведомлений / настроек (они уже есть или будут отдельно)
- Устаревший `.group-voice-grid` (заменен на constellation)

### Шаг 2: HTML — `client/index.html`
Добавить контейнеры и элементы:
1. **Серверный voice panel** — обновить `#voice-panel` / `#voice-view`:
   - Добавить `#server-voice-grid-constellation`
   - Float preview контейнер
   - Обновить footer bar с новыми SVG иконками

2. **Room voice panel** — обновить room voice section:
   - Добавить `#room-voice-grid-constellation`
   - `#room-voice-preconnect` overlay с join button
   - `#room-voice-connected-bar` footer
   - Room control buttons (mic/sound/cam/share/disconnect)

3. **DM call overlay**:
   - Mini-bar с аватаркой и кнопками
   - Обновить control dock

4. **Модалка создания**:
   - `#create-space-modal` с тип-селектором и name input

5. **Подключить** `voice-constellation.css`

### Шаг 3: JS — `client/js/voice-constellation.js`
Новый файл, перенести из `sandbox/new-design/script.js`:

**Константы:**
- SVG иконки: `MIC_OFF_SVG`, `SOUND_OFF_SVG`, `SCREENSHARE_SVG`, `CAM_SVG`, `EXPAND_SVG`, `SHRINK_SVG`

**Рендер:**
- `renderVoiceChannel()` — рендер 3 контейнеров (server + room + voice-view)
- `queueRenderVoiceChannel()` — rAF debounce
- Wabi-sabi координаты для созвездия (1–20 участников)

**Drag:**
- `makeDraggable()` — touch + mouse, lerp 0.25, clamped
- `_dragState` глобальный

**Анимации:**
- `animatePreviewToAvatar()` — Web Animations API
- `animatePreviewShrink()` — Web Animations API
- `.appearing` class toggle

**Состояние:**
- `_voicePreviewState` структура: `{ openUserId, collapsed, positions, _miniPos }`
- `_streamAnimating` флаг + safety timeout 800мс

**Кнопки:**
- `syncRoomBtns()` — синк room ↔ server кнопок
- Delegation: room → server `.click()`
- Deafen → auto-mute логика

**Модалка:**
- `initCreateSpaceModal()` — тип-селектор, создание в `serversData`

**Не переносить:**
- `setTestUsers()`, `TEST_NAMES`
- Моковые данные (`mockHubUpdates`, `mockFriends` и т.д.)
- Логика лендинга, Hub, друзей, уведомлений, настроек

### Шаг 4: Интеграция с `client/js/voice.js`
Добавить вызовы `renderVoiceChannel()` в существующие socket handlers:

```
// После того как voice.js обновил список участников:
socket.on('voice-users-update', (users) => {
    // ... существующий код voice.js ...
    if (typeof renderVoiceChannel === 'function') renderVoiceChannel();
});

// После mute/unmute:
socket.on('user-muted', () => {
    // ... существующий код ...
    if (typeof syncRoomBtns === 'function') syncRoomBtns();
});
```

Не трогать:
- WebRTC логику
- Socket connection/disconnect
- Media stream management
- SDP/ICE negotiation

### Шаг 5: Очистка
- Удалить старый test code из `sandbox/new-design/script.js`
- Удалить мертвый CSS (устаревший `.group-voice-grid` и т.д.)
- Убрать `body.room-mode` override (новый рендер заменяет)
- Проверить что 21 selector `border-radius: 8px` в `client/styles/` (раньше ошибочно измененный) корректно overridden новым CSS

### Шаг 6: Тестирование
- [ ] Созвездие рендерится в серверном voice
- [ ] Созвездие рендерится в room voice
- [ ] Float preview drag работает (touch + mouse)
- [ ] Expand/collapse preview работает
- [ ] Камера ↔ скриншер взаимное исключение
- [ ] Deafen → auto-mute
- [ ] Join/disconnect в room voice
- [ ] DM call mini-bar drag
- [ ] Модалка создания сферы/комнаты
- [ ] Мобильная адаптация (<= 768px, 768–1024px)
- [ ] Нет конфликтов с `voice.js` WebRTC

---

## Ключевые контексты

| Что | Значение |
|-----|----------|
| MAIL_FROM | `LOVE <onboarding@resend.dev>` — временно, ждать Resend verification |
| EARLY_ACCESS_TO | `support@loveapp.chat` → `loveapp.support@gmail.com` (Cloudflare Email Routing) |
| API endpoint | `https://loveapp-1-dk8a.onrender.com` |
| Landing | `https://loveapp.chat` → `loveapp-landing.onrender.com` |
| `_voicePreviewState` | `{ openUserId, collapsed: {}, positions: {}, _miniPos: {} }` |
| `_streamAnimating` | Флаг + 800мс safety timeout |
| `roomVoiceConnected` | `boolean`, управляет preconnect ↔ connected bar |
| `renderVoiceChannel()` | Рендерит 3 контейнера: server grid, room grid, voice-view |
| `syncRoomBtns()` | Глобальная, синкает классы/иконки server → room кнопок |
| `DEVLOG_BROKEN_SVG` | Сердце + трещина `M13 5l-2.5 5 3.5 2-3 4.5` (НЕ диагональ `x1=1 y1=1 x2=23 y2=23`) |
| Cam SVG | Силуэт человека (НЕ видеокамера) |
| Deafen → mute | sound off → mic off; mic on → sound on |
| Preview lerp | 0.25 factor, requestAnimationFrame |
| Preview clamp | Внутри parent bounds (voice panel) |
| Preview aspect | 16:9 |
| `client/js/voice.js` | 1958 строк, WebRTC — wrap, don't rewrite |
| `body.room-mode` | Скрывает `#voice-view, #voice-panel` — room рендерит в свой контейнер |

---

## Критические файлы

| Файл | Назначение |
|------|-----------|
| `sandbox/api/server.js` | Express API: `/api/early-access`, `/api/support`, `/api/health` |
| `sandbox/api/package.json` | express, cors, resend |
| `sandbox/public/index.html` | Лендинг, ACCESS_ENDPOINT, favicon, lang=ru |
| `sandbox/public/support/index.html` | Страница поддержки, async form, lang=ru |
| `sandbox/new-design/app.html` | Все панели: voice, room, DM call, hub, friends, settings, create modal |
| `sandbox/new-design/style.css` | Весь CSS: constellation, preview, drag, modals, mobile |
| `sandbox/new-design/script.js` | Весь JS: render, drag, animations, delegation, modal |
| `server/index.js` | CORS whitelist включает loveapp.chat |
| `client/js/voice.js` | 1958 строк WebRTC — не трогать при порте |
