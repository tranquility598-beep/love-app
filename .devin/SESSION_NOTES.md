# Session Notes — Love App

Заметки для продолжения работы. Последняя сессия: 2026-05-18.

## Статус проекта

- **Версия**: 5.0.0 (выпущена 2026-05-18)
- **Текущая ветка**: `main`
- **Production-сервер**: https://love-app-2ou3.onrender.com (Render Free tier)
- **Релиз на GitHub**: https://github.com/tranquility598-beep/love-app/releases/tag/v5.0.0

## Что было сделано в сессии 2026-05-18

### 1. Выпуск v5.0.0
- Поднята версия в `package.json` и `package-lock.json` с 3.9.0 → 5.0.0
- Создан коммит `4f48f1f` с двумя чистыми фиксами:
  - `client/js/api.js`: при 401 вместо `location.reload()` — мягкий `showAuthScreen()` (нет циклов перезагрузки)
  - `client/js/servers.js`: меню «+» в server-rail открывается вверх (не уезжает за край экрана)
- Тег `v5.0.0` запушен → GitHub Actions собрали Windows + macOS билды
- Release notes лежат в `RELEASE_NOTES_v5.0.0.md`

### 2. Откат new-sidebar
- Файлы `client/js/new-sidebar.js` и `client/styles/new-sidebar.css` удалены
- Изменения в `client/index.html`, `client/js/app.js`, `client/styles/main.css`, `client/styles/sidebar.css` (связанные с new-sidebar) откатаны
- Решено: новую sidebar в этом релизе НЕ выпускаем

### 3. Починка production на Render
**Корневая проблема**: на Render не было половины env vars, и сервер крутился на захардкоженном `JWT_SECRET = 'love-app-secret-key-2024'` (см. `server/middleware/auth.js:9` и `server/routes/auth.js:15`). Из-за этого + флаков Render деплои падали, а старый код продолжал работать.

**Что добавили в Render → Environment** (10 переменных, все на месте):
- `NODE_ENV=production`
- `JWT_SECRET` (свежий 96-символьный hex, рандомно сгенерён через crypto.randomBytes(48))
- `JWT_EXPIRES=7d`
- `GOOGLE_CLIENT_ID=488277920447-blagb6cn887r5085t6gomapaeifvdntm.apps.googleusercontent.com`
- `GOOGLE_CLIENT_SECRET` (новый секрет, выпущен в Google Cloud Console)
- `PROD_GOOGLE_CALLBACK_URL=https://love-app-2ou3.onrender.com/api/auth/google/callback`
- `ALLOWED_ORIGINS=https://love-app-2ou3.onrender.com`
- `MONGODB_URI`, `GMAIL_USER`, `GMAIL_PASS` (были раньше)

После сохранения env vars Render сделал auto-deploy — 4f48f1f live, сервер заработал корректно (socket-token, rooms, авторизация).

### 4. Подтверждённые рабочие фичи
- Socket.io подключение (`✅ Socket connected: ...`)
- Авторизация через email/password
- Founder mode (`👑 FOUNDER MODE ACTIVATED`)
- DM-чаты

## Известные проблемы (TODO)

### 1. Cloudinary интеграция ✅
**Решено (2026-05-19):** Аватары и файлы теперь загружаются в Cloudinary.
- Установлен `cloudinary` + `streamifier`
- Создан `server/config/cloudinary.js`
- Обновлены `server/routes/users.js` и `server/routes/upload.js`
- `.env` добавлены `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`

**Чтобы активировать:**
1. Зарегистрироваться на https://cloudinary.com (бесплатно, 25GB)
2. Скопировать Cloud Name, API Key, API Secret из Dashboard
3. Добавить в Render → Environment Variables
4. Удалить старую папку `server/uploads/` (больше не нужна)

### 2. Новая sidebar
Файлы `client/js/new-sidebar.js` (322 строки) и `client/styles/new-sidebar.css` (406 строк) удалены, но фича задумана. В `client/index.html` остались некоторые крючки (закомментированный `<link>` на CSS, primary-rail markup). Если будем доделывать — восстановить из git history (коммит `4f48f1f` минус один шаг назад) или начать заново.

### 3. Старые провалившиеся деплои на Render
Видно в Events: до 4f48f1f было 4 неудачных деплоя подряд (`15e1ca4`, `db6969a`, `cf2425c`, `22f4c21`). Не разобрались, почему именно они падали — возможно out-of-memory на free tier, возможно что-то в коде. Если ситуация повторится — открыть лог упавшего деплоя и читать.

### 4. Render Free Tier spin-down
50+ секунд задержка на первый запрос после периода неактивности. UX-проблема.
**Решения**: апгрейд плана ($7/мес), либо UptimeRobot пинг каждые 10 мин на `/api/health` (бесплатно).

## Полезные ссылки
- Render Dashboard: https://dashboard.render.com
- Google Cloud OAuth: https://console.cloud.google.com/apis/credentials
- Production health-check: https://love-app-2ou3.onrender.com/api/health
- GitHub Actions: https://github.com/tranquility598-beep/love-app/actions

## Команды для запуска локально

```bash
npm run dev   # сервер на :5555 + Electron клиент
npm run build       # Windows installer
npm run build:mac   # macOS dmg
npm run build:all   # обе платформы
```

## Команды для нового релиза (шаблон)

```bash
# 1. Обновить версию в package.json и package-lock.json вручную
# 2. Закоммитить изменения и запушить
git commit -am "chore: bump version to X.Y.Z"
git push origin main

# 3. Создать тег с release notes из файла
git tag -a vX.Y.Z -F RELEASE_NOTES_vX.Y.Z.md
git push origin vX.Y.Z

# 4. Дождаться GitHub Actions, опубликовать черновик в Releases
```
