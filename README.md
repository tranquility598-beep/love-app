# Love - Приложение для общения!

Десктопное приложение для Windows и macOS: голосовой и текстовый чат, серверы и каналы. Стек: Electron, Node.js, Socket.io, WebRTC и MongoDB.

**Авторское право:** © 2026 Love App. Все права защищены. Использование, копирование и распространение исходного кода и материалов репозитория без письменного разрешения правообладателя запрещены. Полный текст — в файле [`LICENSE`](LICENSE). Зависимости npm остаются под лицензиями своих авторов.

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

Скопируйте `.env.example` в `.env` и заполните своими данными:
```bash
cp .env.example .env
```

Отредактируйте `.env` файл:
```env
MONGODB_URI=mongodb://localhost:27017/love-app
JWT_SECRET=your-super-secret-key-CHANGE-THIS
PORT=5555
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GMAIL_USER=your-gmail@gmail.com
GMAIL_PASS=your-gmail-app-password
```

**ВАЖНО:** Сгенерируйте безопасный JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
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
- установщик NSIS (например, `Love Setup.exe`) — установщик для Windows
- исполняемый файл приложения — портативный запуск для Windows

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

## 🔐 Безопасность и секреты

### Настройка переменных окружения

**ВАЖНО:** Файл `.env` содержит конфиденциальные данные и НЕ должен попадать в git!

1. **Скопируйте шаблон:**
```bash
cp .env.example .env
```

2. **Заполните свои данные в `.env`:**
   - `JWT_SECRET` - сгенерируйте случайную строку (см. ниже)
   - `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET` - из Google Cloud Console
   - `GMAIL_USER` и `GMAIL_PASS` - для отправки OTP кодов

3. **Генерация безопасного JWT_SECRET:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Google OAuth настройка

Для работы Google OAuth нужно создать credentials в [Google Cloud Console](https://console.cloud.google.com/):

**Development (локально):**
1. Создайте OAuth 2.0 Client ID
2. Добавьте Authorized Redirect URI: `http://localhost:5555/api/auth/google/callback`
3. Скопируйте Client ID и Client Secret в `.env`

**Production (Render/Heroku):**
1. Создайте ОТДЕЛЬНЫЕ credentials для production (рекомендуется)
2. Добавьте Authorized Redirect URI: `https://your-domain.onrender.com/api/auth/google/callback`
3. Добавьте credentials в Environment Variables на платформе

### Gmail App Password

Для отправки OTP кодов используется Gmail. Нужен App Password (не обычный пароль):

1. Включите 2FA в Google аккаунте
2. Перейдите: https://myaccount.google.com/apppasswords
3. Создайте App Password для "Mail"
4. Скопируйте 16-значный код в `.env` как `GMAIL_PASS`

### Deployment на Render

При деплое на Render НЕ используйте `.env` файл! Добавьте переменные через Dashboard:

1. Зайдите в Render Dashboard → ваш сервис → Environment
2. Добавьте все переменные из `.env.example`
3. Используйте РАЗНЫЕ значения для production:
   - `JWT_SECRET` - другой случайный ключ
   - `MONGODB_URI` - MongoDB Atlas connection string
   - `GOOGLE_CLIENT_ID/SECRET` - production credentials
   - `PROD_GOOGLE_CALLBACK_URL` - ваш production домен

### Проверка безопасности

Убедитесь что:
- ✅ `.env` в `.gitignore`
- ✅ `.env` НЕ закоммичен в git
- ✅ Используете разные секреты для dev и production
- ✅ Google OAuth credentials разные для dev и prod
- ✅ Gmail App Password (не обычный пароль)

**Если секреты попали в git:**
1. Смените все пароли и ключи
2. Пересоздайте Google OAuth credentials
3. Очистите git history: `git filter-branch` или BFG Repo-Cleaner

---

## 📋 Конфигурация MongoDB

### Локальная установка:
```
MONGODB_URI=mongodb://localhost:27017/love-app
```

### MongoDB Atlas (облако):
```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/love-app
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
