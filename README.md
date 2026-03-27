# Discord Clone - Полноценный клон Discord

Десктопное приложение для Windows и macOS, созданное с использованием Electron, Node.js, Socket.io, WebRTC и MongoDB.

## 🚀 Быстрый старт

### Требования
- **Node.js** v18+ (https://nodejs.org)
- **MongoDB** v6+ (https://www.mongodb.com/try/download/community)
- **Windows** 10/11 или **macOS** 10.15+

### 1. Установка зависимостей

```bash
cd c:\Users\Aleksandr\Desktop\Love
npm install
```

### 2. Настройка базы данных

Убедитесь что MongoDB запущен:
```bash
# Запустить MongoDB (если установлен как сервис)
net start MongoDB

# Или запустить вручную
mongod --dbpath C:\data\db
```

### 3. Настройка конфигурации

Файл `.env` уже создан в папке `server/`. При необходимости отредактируйте:
```env
MONGODB_URI=mongodb://localhost:27017/discord-clone
JWT_SECRET=your-super-secret-key
PORT=5000
```

### 4. Запуск приложения

```bash
npm start
```

Это запустит одновременно backend сервер и Electron приложение.

---

## 📦 Сборка EXE файла

### Сборка установщика для Windows:
```bash
npm run build
```

После сборки в папке `build/dist/` появится:
- `Discord Clone Setup.exe` — установщик для Windows
- `Discord Clone.exe` — портативная версия для Windows

### Сборка для macOS:
```bash
npm run build:mac
```

После сборки в папке `build/dist/` появится:
- `Love-1.0.5.dmg` — установщик для macOS
- `Love-1.0.5-mac.zip` — архив для macOS

---

## 🏗️ Структура проекта

```
Love/
├── client/                    # Electron frontend
│   ├── main.js               # Главный процесс Electron
│   ├── preload.js            # Preload скрипт
│   ├── index.html            # Главная HTML страница
│   ├── styles/               # CSS стили
│   │   ├── main.css          # Основные стили
│   │   ├── auth.css          # Стили авторизации
│   │   ├── chat.css          # Стили чата
│   │   ├── sidebar.css       # Стили боковых панелей
│   │   └── modals.css        # Стили модальных окон
│   └── js/                   # JavaScript модули
│       ├── api.js            # HTTP запросы к API
│       ├── socket.js         # Socket.io клиент
│       ├── voice.js          # WebRTC голосовой чат
│       ├── auth.js           # Авторизация
│       ├── app.js            # Главная логика приложения
│       ├── chat.js           # Управление сообщениями
│       ├── servers.js        # Управление серверами
│       ├── friends.js        # Система друзей
│       └── ui.js             # UI утилиты
├── server/                   # Backend сервер
│   ├── index.js              # Главный файл сервера
│   ├── .env                  # Конфигурация
│   ├── models/               # MongoDB модели
│   │   ├── User.js           # Модель пользователя
│   │   ├── Server.js         # Модель сервера
│   │   ├── Channel.js        # Модель канала
│   │   ├── Message.js        # Модель сообщения
│   │   └── DirectMessage.js  # Модель личного сообщения
│   ├── routes/               # API маршруты
│   │   ├── auth.js           # Авторизация
│   │   ├── users.js          # Пользователи
│   │   ├── servers.js        # Серверы
│   │   ├── channels.js       # Каналы
│   │   ├── messages.js       # Сообщения
│   │   ├── friends.js        # Друзья
│   │   ├── directMessages.js # Личные сообщения
│   │   └── upload.js         # Загрузка файлов
│   ├── middleware/
│   │   └── auth.js           # JWT middleware
│   ├── socket/
│   │   └── socketHandler.js  # Socket.io обработчики
│   └── uploads/              # Загруженные файлы
├── package.json              # Зависимости и скрипты
└── README.md                 # Документация
```

---

## ✨ Функциональность

### 🔐 Аккаунты
- Регистрация через email и пароль
- Авторизация с JWT токенами
- Загрузка аватара
- Настройка профиля и статуса

### 🏠 Серверы
- Создание серверов с иконкой и описанием
- Система инвайт-кодов для приглашения
- Присоединение по инвайт-коду
- Настройки сервера

### 📝 Текстовые каналы
- Отправка сообщений в реальном времени
- Ответы на сообщения
- Редактирование и удаление сообщений
- Эмодзи реакции
- Отправка изображений и файлов
- Индикатор печати
- Форматирование текста (**жирный**, *курсив*, `код`)

### 🎤 Голосовые каналы
- WebRTC peer-to-peer аудио
- Индикатор говорящего
- Кнопки мута и deafen
- Поддержка нескольких участников

### 👥 Друзья
- Поиск пользователей по имени
- Отправка/принятие/отклонение запросов
- Список друзей с онлайн статусом
- Личные сообщения

### 💬 Личные сообщения
- Диалоги между пользователями
- История сообщений
- Отправка файлов и изображений

---

## 🛠️ Технологии

| Компонент | Технология |
|-----------|-----------|
| Desktop App | Electron 28 (Windows, macOS) |
| Frontend | HTML5, CSS3, JavaScript |
| Backend | Node.js + Express |
| Real-time | Socket.io |
| Voice Chat | WebRTC |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcryptjs |
| Build | Electron Builder |

---

## 🔧 Разработка

### Запуск только сервера:
```bash
npm run server
```

### Запуск только Electron (сервер должен быть запущен):
```bash
npm run electron
```

### Сборка без установщика:
```bash
npm run pack
```

---

## 📋 Конфигурация MongoDB

### Локальная установка:
```
MONGODB_URI=mongodb://localhost:27017/discord-clone
```

### MongoDB Atlas (облако):
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/discord-clone
```

---

## 🐛 Решение проблем

### MongoDB не подключается:
1. Убедитесь что MongoDB запущен: `net start MongoDB`
2. Проверьте URI в `.env` файле
3. Приложение работает и без MongoDB (ограниченный функционал)

### Electron не запускается:
1. Убедитесь что сервер запущен на порту 5000
2. Проверьте что все зависимости установлены: `npm install`

### Голосовой чат не работает:
1. Разрешите доступ к микрофону в настройках Windows
2. Убедитесь что оба пользователя в одном голосовом канале
3. Проверьте настройки брандмауэра

### Ошибка при сборке:
```bash
# Очистите кэш и пересоберите
npm run pack
```
