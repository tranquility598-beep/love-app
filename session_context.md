# Love App — Session Context

## Версия
5.1.0

## Что сделано (Фаза 1 завершена)
- Стабилизация модальных окон: ModalManager, синхронизация бэкдропов, rooms.js
- navigateToDM реализован в NavigationController, openDMConversation делегирован
- ES6 геттеры на window.current*, StateGuard, все прямые записи убраны 
  из app.js, rooms.js, voice.js, socket.js, roles.js
- Сокет-слушатели привязаны к навигации, detachScope при переходах, 
  handleReconnect починен

## Следующий шаг
Этап 4 — Desktop Integration
Начинаем с tray в client/main.js:
- иконка в трее
- меню: Open Love, Check Updates, Quit
- badge со счётчиком непрочитанных сообщений
- иконка меняется при наличии непрочитанных

## Архитектурные решения
- NavigationController единственный владелец state
- window.current* только ES6 геттеры, запись через _commitState
- socketLifecycle.detachScope вызывается при каждом переходе
- ModalManager единственная точка открытия и закрытия модалок
- admin-app запланирован как отдельный веб-интерфейс для founder и staff
