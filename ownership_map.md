# Карта владения состоянием и предотвращение дрейфа (State Ownership Map & Drift Prevention)

Этот документ фиксирует зоны ответственности за запись в ключевые переменные состояния навигации после внедрения стабилизационного патча Phase 3C (Room Navigation).

---

## 1. Карта владения (State Ownership Map)

| Переменная | Единственный владелец (Writer) | Читатели (Readers) | Назначение |
| :--- | :--- | :--- | :--- |
| **`window.currentServer`** <br> **`window.currentServerId`** | `NavigationController` (через `_commitState` / `_syncWindowState`) | `rooms.js`, `servers.js`, `app.js`, `socket.js` | Активный сервер (гильдия или комната) |
| **`window.currentChannel`** <br> **`window.currentChannelId`** | `NavigationController` (через `navigateToChannel` / `_syncWindowState`) | `chat.js`, `app.js`, `socket.js`, `rooms.js` | Активный текстовый/голосовой канал |
| **`window.currentRoom`** | `rooms.js` (через `applyRoomViewFor` / `exitRoomMode`) | `rooms.js` (UI-методы), `ui.js` (закрытие настроек) | Активная комната (DOM-контекст) |
| **`window.currentDMConversation`** <br> **`window.currentDMConversationId`** | `app.js` (`openDMConversation`) | `app.js`, `chat.js`, `runtime-diagnostics.js` | Активный диалог личных сообщений (DM) |
| **`window.currentView`** <br> **`window.navigationState`** | `app.js` (`setNavigationState`) / `NavigationController` (`_syncWindowState`) | `runtime-diagnostics.js`, `servers.js`, `ui.js` | Активное представление (визуальный режим) |

---

## 2. Золотые правила стабильности системы (No-Drift Rules)

1. **Никакой прямой записи в `window.currentServer` / `currentChannelId` из внешних файлов**:
   Любые изменения контекста навигации обязаны проходить через публичные методы `NavigationController.navigateToServer()` и `NavigationController.navigateToChannel()`.
2. **Мгновенный сдвиг токена безопасности при старте**:
   Каждая инициация навигации (клик по серверу, каналу или DM) обязана мгновенно инкрементировать `window._globalNavigationSeq` и обновлять `window._activeNavigationRequestId` до начала любых сетевых запросов.
3. **Строгая изоляция асинхронных лоадеров**:
   Функции `loadMessages()` и `loadDMMessages()` обязаны выполнять guard-проверку `globalSeq !== window._activeNavigationRequestId` сразу после разрешения API Promise.

---

## 3. Слой аудита и детекции дрейфа (Drift Detection)

Для предотвращения рассинхронизации состояния между `NavigationController._state` и `window.*` во время разработки, встроить следующую проверку в отладочный слой (например, в метод логирования контроллера или интервальный аудит):

```javascript
function auditStateDrift() {
  const controller = window.NavigationController;
  if (!controller) return;

  const state = controller._state;
  const drift = [];

  if (state.currentServerId !== window.currentServerId) {
    drift.push(`currentServerId mismatch (controller: "${state.currentServerId}", window: "${window.currentServerId}")`);
  }
  if (state.currentChannelId !== window.currentChannelId) {
    drift.push(`currentChannelId mismatch (controller: "${state.currentChannelId}", window: "${window.currentChannelId}")`);
  }
  if (window.navigationState && state.currentView !== window.navigationState.currentView) {
    drift.push(`currentView mismatch (controller: "${state.currentView}", window.navigationState: "${window.navigationState.currentView}")`);
  }

  if (drift.length > 0) {
    console.error('⚠️ [Navigation Audit] State drift detected:\n' + drift.join('\n'));
  }
}
```
