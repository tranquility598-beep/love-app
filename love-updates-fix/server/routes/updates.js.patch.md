# Патч: server/routes/updates.js — сделать GITHUB_TOKEN необязательным

Репозиторий `love-app` публичный, поэтому GitHub API отдаёт релизы и файлы без токена.
Сейчас `githubHeaders()` бросает ошибку «GITHUB_TOKEN is not configured on the server»,
если переменная окружения не задана — из-за этого падают все кнопки скачивания на сайте.

## Заменить функцию `githubHeaders`

БЫЛО:

```js
function githubHeaders(accept = 'application/vnd.github.v3+json') {
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is not configured on the server');
  }

  return {
    Authorization: `token ${GITHUB_TOKEN}`,
    Accept: accept,
    'User-Agent': 'Love-App-Server'
  };
}
```

СТАЛО:

```js
function githubHeaders(accept = 'application/vnd.github.v3+json') {
  const headers = {
    Accept: accept,
    'User-Agent': 'Love-App-Server'
  };

  // Токен необязателен: репозиторий публичный.
  // Если токен задан — используем его (выше лимиты GitHub API: 5000/час вместо 60/час).
  if (GITHUB_TOKEN) {
    headers.Authorization = `token ${GITHUB_TOKEN}`;
  }

  return headers;
}
```

Больше ничего менять не нужно — остальной код работает с любым вариантом заголовков.

## Рекомендация (необязательно)

Без токена лимит GitHub API — 60 запросов/час с IP сервера (кэш релиза на 60 сек уже есть в коде,
так что для обычного трафика хватает). Если скачиваний будет много — добавь токен в `.env` на сервере:

1. GitHub → Settings → Developer settings → Fine-grained tokens → создать токен только с доступом Contents: Read к `love-app`.
2. На сервере в `.env` рядом с `server/`:

```
GITHUB_TOKEN=github_pat_XXXXXXXX
```

3. Перезапустить процесс (см. README).
