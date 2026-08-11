# Handoff: состояние проекта Love и выполненные работы

**Дата:** 2026-08-09
**Подготовил:** WorkBuddy (AI-ассистент) по поручению владельца проекта (Vexel)
**Назначение:** передача контекста другому исполнителю для продолжения работ.

---

## 1. Контекст проекта

- **Продукт:** мессенджер Love (универсальный). Стек: Electron (Windows/macOS), Flutter/Capacitor (Android), Node.js + Express + Socket.IO backend, MongoDB Atlas, Cloudinary, coturn на собственном VDS.
- **Запуск:** ограниченный публичный запуск для друзей и родных, без рекламы. Целевая нагрузка — до 100 пользователей.
- **Стратегия:** E2EE — после общей стабилизации; монетизация (подписка + добровольная поддержка) — позже; групповые ЛС отложены, незавершённый UI должен быть скрыт до запуска.
- **Репозиторий:** `github.com/tranquility598-beep/love-app` — **публичный** (важно: любой коммит виден всем, секретам там не место).

## 2. Инфраструктура (фактическое состояние)

| Компонент | Значение |
|---|---|
| VDS | `87.199.197.158` (VDSina), Ubuntu, диск 9.8G (занято ~72%) |
| SSH | ключ `~/.ssh/id_ed25519` на машине владельца; доступны `love-deploy@` (ограниченный, sudo только на deploy/rollback-скрипты) и `root@` |
| Домены | `api.loveapp.chat` (backend через Nginx+TLS), `loveapp.chat` (сайт), `admin.loveapp.chat` (админка) |
| Backend | PM2 (`love-backend`), порт 5555 на `127.0.0.1` (внешний доступ закрыт ufw), env: `/etc/love/production.env` |
| БД | MongoDB Atlas (внешняя; `mongod` на VDS не используется) |
| Медиа | Cloudinary (все новые вложения), старые файлы — `/var/www/love-app/server/uploads` (39 МБ, раздаётся через `/uploads`) |
| TURN | coturn на VDS, порт 3478; режим `use-auth-secret` (временные HMAC-credentials) |

### Ключевые пути на VDS

- `/var/www/love-current` → симлинк на активный релиз `/var/www/love-releases/<timestamp>`
- `/var/www/love-staging` — каталог загрузки релизов
- `/var/www/love-app` — legacy-каталог; используются только `server/uploads`, `server/private-uploads`, `server/temp` (симлинки в каждый релиз)
- `/usr/local/sbin/love-deploy-release`, `/usr/local/sbin/love-rollback-release` — deploy/rollback (root)
- `/usr/local/sbin/love-backup-daily` — ежедневный backup (root, cron `/etc/cron.d/love-backup`, 03:30 UTC)
- `/var/backups/love/` — backup-копии (ретенция 14 дней для `daily-*`)
- Логи: `/var/log/love-backup.log`, PM2 — `/root/.pm2/logs/`

## 3. Выполненные работы (2026-08-08 – 2026-08-09)

### 3.1. Аудит безопасности и инфраструктуры
Полный read-only аудит: репозиторий, VDS, публичные endpoints, установщик v2.0.6 (распакован и просканирован).
**Отчёт: `docs/INFRASTRUCTURE_AUDIT_2026-08-08.md`** — читать первым.

### 3.2. Исправления критических рисков (код, задеплоено)

1. **TURN credentials удалены из клиентского кода.** Раньше статические логин/пароль coturn лежали в `client/js/voice.js`, публичном репозитории и установщике. Теперь:
   - `server/routes/webrtc.js` — endpoint `GET /api/webrtc/ice-config` (auth required), выдаёт временные credentials: `username="<expiry>:<userId>"`, `credential=base64(HMAC-SHA1(username, TURN_SECRET))`, TTL 24ч (`TURN_TTL`).
   - `client/js/voice.js` — запрашивает конфиг через `apiFetch` перед входом в голосовой канал; fallback — STUN-only.
   - coturn на VDS переведён на `use-auth-secret` + новый `static-auth-secret` (секрет сгенерирован на сервере, нигде не печатался).
   - **Старый static user (`loveturn`) НАРОЧИТО оставлен в coturn** — клиенты v2.0.6 без него потеряют голос. Удалить после того, как пользователи обновятся на v2.0.7+.
2. **Порт 5555 закрыт извне:** удалено правило ufw, backend слушает `127.0.0.1` (`HOST` env). Весь внешний трафик — только через Nginx (443, TLS).
3. **Публичный JWT fallback удалён.** `'love-app-secret-key-2024'` был захардкожен в 4 файлах. Теперь `server/utils/jwtSecret.js`: production требует `JWT_SECRET` ≥32 символов (fail-fast), dev получает эфемерный секрет на время процесса.
4. **Health-check честный:** `/api/health` проверяет `mongoose.connection.readyState`; при потере БД — HTTP 503. Раньше возвращал `ok` при мёртвой БД.
5. **Защита сборки от утечки `.env`:**
   - `package.json`: исключения `!**/.env`, `!**/.env.*` в `build.files` и `build.extraResources`.
   - `ops/check-build-secrets.cjs` — guard-скрипт, ищет секреты в артефактах; встроен в `.github/workflows/release.yml` **до** публикации.
   - Локальная сборка `build/dist` очищена от попавшего туда production `.env`.

### 3.3. Backup и восстановление

- **Ежедневный backup:** `/usr/local/sbin/love-backup-daily` (root, cron 03:30 UTC) — дамп БД (EJSON, все коллекции) + `uploads.tar.gz`. Ретенция 14 дней.
- **Restore-скрипт:** `server/scripts/restore-backup.js` — dry-run по умолчанию, `--apply` для записи, `RESTORE_MONGODB_URI` для восстановления в отдельную базу.
- **Restore drill выполнен успешно** (2026-08-08): backup восстановлен в тестовую БД `love-app-restore-drill`, все 25 коллекций на месте, после проверки база удалена.
- **Offsite-копия:** автоматизация на машине владельца — каждое воскресенье 04:00 скачивает последний `daily-*` в `C:\Users\Aleksandr\Love-backups\` (хранит 8 копий). Первый запуск 2026-08-09 — успешен, целостность подтверждена.
- **Инцидент:** первая версия cron-записи не содержала поле пользователя (для `/etc/cron.d` обязательно) — ночной запуск 2026-08-09 не состоялся. Исправлено, ручной прогон подтверждён.

### 3.4. Диск VDS

Было 85% → стало ~72%: vacuum journald (1 ГБ журналов) + лимит `SystemMaxUse=200M`, очистка npm-кэшей root, удаление мёртвого `node_modules` и `.git` из legacy-каталога.

### 3.5. Uploads → Cloudinary

`server/routes/upload.js`: удалена ветка локального сохранения видео и файлов >5 МБ. Все типы (image/audio ≤10 МБ, video ≤50 МБ, document ≤5 МБ) теперь уходят в Cloudinary. Локальный fallback — только для dev без конфигурации Cloudinary.

## 4. Состояние Git и деплоя

### ⚠️ Push на GitHub НЕ выполнен
Три коммита существуют **только локально** на машине владельца:
- `e54a0ca` — security fixes (включает накопленную ранее незакоммиченную работу, 205 файлов)
- `5f255c7` — ops runbook
- `42eae92` — uploads→Cloudinary + restore-скрипт

Причина: на машине нет git-credentials (ни GCM, ни SSH-ключа GitHub). Требуется `git push origin main` в интерактивном терминале (откроется OAuth-окно) или PAT.

### Деплой production выполнен БЕЗ GitHub
Production работает на коде этих коммитов. Процедура (проверена дважды, релизы `20260808T102427Z`, `20260808T103532Z`):

```bash
# На машине владельца, из корня репозитория:
# admin/dist — артефакт сборки, в git его нет, а сервер отдаёт с него /admin.
# Без этой строки админка на проде превратится в 503 «не собрана».
(cd admin && MSYS_NO_PATHCONV=1 npx vite build --base=/admin/)
GIT_SHA=$(git rev-parse HEAD)
printf '{"gitSha":"%s","builtAt":"%s"}\n' "$GIT_SHA" "$(date -u +%FT%TZ)" > release-manifest.json
tar --exclude='server/.env' --exclude='server/node_modules' --exclude='server/uploads' \
    --exclude='server/private-uploads' --exclude='server/temp' --exclude='.env' --exclude='.env.*' \
    -czf /tmp/love-release.tgz release-manifest.json package.json server client sandbox/public ops/production admin/dist
(cd /tmp && sha256sum love-release.tgz > love-release.tgz.sha256)
rm release-manifest.json
scp -i ~/.ssh/id_ed25519 /tmp/love-release.tgz /tmp/love-release.tgz.sha256 love-deploy@87.199.197.158:/var/www/love-staging/
ssh -i ~/.ssh/id_ed25519 root@87.199.197.158 "/usr/local/sbin/love-deploy-release"
```

Deploy-скрипт сам делает: проверку checksum, отказ от `.env` в архиве, `npm ci`, `npm audit`, тесты, pre-deploy backup, миграции, smoke-тесты, переключение симлинка, reload PM2, **автоматический rollback при сбое**.

### Проверки после деплоя
```bash
curl -s https://api.loveapp.chat/api/health          # {"status":"ok","db":"connected",...}
curl -s http://87.199.197.158:5555/api/health        # должен НЕ отвечать (timeout)
curl -s https://api.loveapp.chat/api/webrtc/ice-config  # 401 без токена
```

## 5. Открытые задачи (приоритет сверху вниз)

1. **`git push origin main`** — действие владельца, ~30 секунд. Деблокирует CI и сборку клиента.
2. **Релиз клиента v2.0.7:** bump версии в `package.json`, тег `v2.0.7` → workflow соберёт Windows/macOS установщики с новым голосовым кодом. Пользователи обновятся через electron-updater.
3. **После обновления клиентов** — удалить static user из `/etc/turnserver.conf` на VDS и `systemctl restart coturn`. Только после этого старые TURN-секреты перестанут быть действительными.
4. **Скрыть незавершённый UI** (групповые ЛС и пр.) — блокер запуска для друзей.
5. **Тестирование двумя реальными аккаунтами** — ключевые сценарии: регистрация, личка, вложения (в т.ч. >5 МБ и видео — проверить, что уходят в Cloudinary), голосовой канал (проверить ephemeral TURN).
6. **PM2 от root** — backend работает от root; выделить системного пользователя. Затрагивает deploy-скрипты — делать аккуратно, не в спешке.
7. **Далее по стратегии:** E2EE, монетизация, подготовка к росту.

## 6. Правила и предостережения для следующего исполнителя

- **Репозиторий публичный.** Перед каждым коммитом — проверка на секреты. Никогда не коммитить `.env`, значения из `/etc/love/production.env`, TURN-секреты.
- Значения секретов нигде не задокументированы намеренно. Источник истины — `/etc/love/production.env` на VDS (root) и `.env` на машине владельца.
- Старые TURN credentials (`loveturn/…`) считать скомпрометированными навсегда — они в публичной Git-истории. Не использовать нигде.
- Деплой-скрипт отклоняет архивы с `.env` — это фича, не баг.
- Restore drill повторять после каждого изменения backup/restore кода.
- Суточные backup-копии (`daily-*`) ~40 МБ каждая; при росте uploads пересмотреть ретенцию или место хранения.
- Перед удалением чего-либо из `/var/www/love-app` (legacy) — убедиться, что deploy-скрипт по-прежнему симлинкует оттуда `uploads`, `private-uploads`, `temp`.

## 7. Полезные файлы в репозитории

- `docs/INFRASTRUCTURE_AUDIT_2026-08-08.md` — полный аудит с доказательствами
- `ops/production/turn-firewall-hardening.md` — runbook TURN/firewall (выполнен, оставлен для справки и отката)
- `ops/production/deploy-release.sh` / `rollback-release.sh` — механика деплоя
- `ops/check-build-secrets.cjs` — guard секретов в артефактах
- `server/routes/webrtc.js` + `server/tests/webrtc-ice-config.test.js` — TURN credentials
- `server/scripts/backup-admin-v1.js` / `restore-backup.js` — backup/restore
