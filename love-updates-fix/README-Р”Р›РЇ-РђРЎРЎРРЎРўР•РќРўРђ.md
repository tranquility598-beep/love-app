# LOVE — фикс скачивания с сайта + обновление сайта на VDSina

## Проблема

Кнопки скачивания на loveapp.chat возвращают:

```json
{"error":"Failed to fetch installer from GitHub","details":"GITHUB_TOKEN is not configured on the server"}
```

Причина: `server/routes/updates.js` требует переменную окружения `GITHUB_TOKEN`,
хотя репозиторий публичный и токен не нужен.

## Шаг 1. Применить патч

См. `server/routes/updates.js.patch.md` — заменить одну функцию `githubHeaders`.
Закоммитить:

```bash
git add server/routes/updates.js
git commit -m "fix(server): make GITHUB_TOKEN optional for public release downloads"
git push origin main
```

## Шаг 2. Обновить сервер на VDSina

На сервере (SSH):

```bash
cd /путь/к/love-app
git pull origin main
# если менялись зависимости сервера:
cd server && npm install && cd ..
# перезапуск (выбрать свой вариант):
pm2 restart all          # если через pm2
# или
systemctl restart love    # если через systemd
```

Это же обновит и сайт, если он раздаётся этим же сервером из папки `site/`.

## Шаг 3. Проверить

```bash
# сайт обновился (без кэша браузера):
curl -s https://loveapp.chat | head -50

# скачивание работает (должен быть HTTP 200 и бинарный файл, а не JSON с ошибкой):
curl -sI https://api.loveapp.chat/api/updates/download/android | head -5
curl -sI https://api.loveapp.chat/api/updates/download/win | head -5
```

В браузере: Ctrl+F5 (жёсткая перезагрузка), т.к. старая версия сайта могла закэшироваться.

## Важно про релиз

Эндпоинт `/download/android` берёт ПЕРВЫЙ `.apk` из ПОСЛЕДНЕГО релиза.
После пересоздания v2.0.5 в релизе будут и старый `Love-2.0.5.apk` (Capacitor, из release.yml),
и новые Flutter `love-mobile-v2.0.5-*.apk`. Чтобы сайт отдавал именно Flutter-версию, в `updates.js`
заменить строку:

```js
router.get('/download/android', handleDownload(
  'android',
  (assets) => assets.find(isApk),
  'LoveSetup.apk'
));
```

на:

```js
router.get('/download/android', handleDownload(
  'android',
  (assets) => preferArch(assets, isApk, 'arm64')
    || assets.find(isApk),
  'LoveSetup.apk'
));
```

Тогда в приоритете будет `love-mobile-v2.0.5-arm64-v8a.apk`.
