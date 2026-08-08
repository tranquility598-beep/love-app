# Runbook: усиление TURN и сетевого периметра VDS (87.199.197.158)

**Статус:** кодовая часть выполнена и закоммичена локально (без push).
Эти команды выполняются **на VDS от root** (или sudo). Пользователь `love-deploy`
намеренно не имеет таких прав.

**Почему порядок важен:** клиентский код больше не содержит TURN-credentials.
Если задеплоить новый код до настройки coturn, голосовые звонки за NAT деградируют
до STUN-only. Поэтому: сначала пункты 1–3, потом деплой (пункт 4).

---

## 1. Сгенерировать TURN shared secret и переконфигурировать coturn

```bash
# Сгенерировать секрет (сохраните вывод — понадобится в пункте 2)
openssl rand -hex 32
```

Отредактировать `/etc/turnserver.conf`:

```conf
# УДАЛИТЬ или закомментировать старые статические учётные данные:
# user=loveturn:Lv2026Turn_Xk9q        <- скомпрометированы (публичный репозиторий)

# Включить REST API с временными credentials:
use-auth-secret
static-auth-secret=<СЕКРЕТ_ИЗ_КОМАНДЫ_ВЫШЕ>
```

Перезапустить coturn:

```bash
systemctl restart coturn
systemctl is-active coturn   # ожидается: active
```

Проверка схемы: клиент получит `username="<unix_expiry>:<userId>"` и
`credential=base64(HMAC-SHA1(username, secret))` — coturn проверит подпись сам.

## 2. Обновить production-окружение backend

В `/etc/love/production.env` добавить:

```bash
TURN_URLS=turn:87.199.197.158:3478,turn:87.199.197.158:3478?transport=tcp
TURN_SECRET=<ТОТ_ЖЕ_СЕКРЕТ>
TURN_TTL=86400
HOST=127.0.0.1
```

`HOST=127.0.0.1` привязывает Express к loopback — backend перестаёт слушать
внешний интерфейс напрямую (весь трафик идёт через Nginx с TLS).

## 3. Закрыть порт 5555 на firewall

```bash
ufw deny 5555/tcp
ufw status | grep 5555
```

После перезапуска backend (пункт 4) порт и так будет на 127.0.0.1 —
правило ufw является вторым уровнем защиты (defense in depth).

## 4. Деплой и проверка

С локальной машины (после пунктов 1–3):

```bash
git push origin master        # или ваш рабочий бранч → запускает deploy pipeline
```

Проверки после деплоя:

```bash
# 1. API здоров и видит БД
curl -s https://api.loveapp.chat/api/health
# ожидается: {"status":"ok","db":"connected",...} с HTTP 200

# 2. Прямой доступ к backend закрыт (должно НЕ отвечать)
curl -s --max-time 8 http://87.199.197.158:5555/api/health
# ожидается: connection refused / timeout

# 3. ice-config требует авторизацию
curl -s https://api.loveapp.chat/api/webrtc/ice-config
# ожидается: 401 {"message":"Токен авторизации не предоставлен"}

# 4. Авторизованный запрос возвращает временные credentials
#    (выполнить из приложения или с валидным токеном):
curl -s -H "Authorization: Bearer <TOKEN>" https://api.loveapp.chat/api/webrtc/ice-config
# ожидается: mode="ephemeral", username вида "<expiry>:<userId>"

# 5. Голосовой звонок между двумя аккаунтами за разными NAT
```

## 5. Откат (если что-то пошло не так)

```bash
sudo -u love-deploy /usr/local/sbin/love-rollback-release   # откат кода к предыдущему релизу
# coturn: вернуть user=loveturn:... в turnserver.conf и systemctl restart coturn
```

Старый клиент (v2.0.6) продолжит работать со статическими credentials,
пока они возвращены в coturn. После подтверждения стабильности нового релиза
статический пользователь должен быть удалён окончательно.
