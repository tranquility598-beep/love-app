# LOVE v2.1.1

Маленький выпуск про одну надоевшую надпись.

## Что починили

**Приложение считало себя версией 2.0.0.** В настройках, в Love Hub и в истории
обновлений висел номер 2.0.0 — при том что установлено было 2.1.0. Обновлялось
всё честно, файлы приходили правильные, врала только надпись. Причина скучная:
интерфейс пытался прочитать номер версии не оттуда, где он лежит, и молча
подставлял старую заглушку. Теперь номер берётся у самой сборки.

**Свежая запись в истории обновлений подписывалась чужим номером.** Верхняя
запись брала версию установленного приложения, поэтому прошлый выпуск мог
оказаться подписан новой версией. Теперь у каждого выпуска свой номер, и только
у текущего он подставляется из сборки.

**Чтобы это не вернулось**, сборка релиза теперь сама сверяет номер версии во
всех местах, где он зашит. Забыли обновить хоть в одном — релиз не соберётся.

Больше в этом выпуске ничего нет: всё остальное — то же самое, что в 2.1.0.
Если вы её ещё не видели, там приглашения, уведомления и войс:
[заметки к 2.1.0](https://github.com/tranquility598-beep/love-app/releases/tag/v2.1.0).

## Как поставить

- **Windows** — `LoveSetup.exe`
- **macOS** — `.dmg` (Apple Silicon и Intel)
- **Android** — `love-mobile-v2.1.1-arm64-v8a.apk` (для старых телефонов —
  `armeabi-v7a`). Проще всего скачать с [loveapp.chat](https://loveapp.chat) —
  сайт сам подберёт файл под ваше устройство.

На компьютере обновление придёт само. На Android, если у вас стоит 2.1.0 или
старее, установка поверх не пройдёт — сборки подписаны разными ключами, Android
так устроен. Удалите старое приложение и поставьте новое: переписки, друзья и
аккаунт хранятся на сервере, ничего не потеряется.

---

## English

A small release about one annoying label.

**The app thought it was version 2.0.0.** Settings, Love Hub and the update
history all showed 2.0.0 while 2.1.0 was actually installed. Updates worked
correctly the whole time — only the label lied. The interface was reading the
version from the wrong place and silently fell back to a stale default. It now
takes the number from the build itself.

**The newest history entry borrowed the wrong number.** The top entry used the
installed version, so an older release could end up labelled with a newer
number. Every release now carries its own number; only the current one is filled
in from the build.

**So it can't come back**, the release build now verifies the version number
everywhere it is hardcoded. Miss one place and the build stops.

Nothing else changed — everything else is identical to 2.1.0. If you missed it,
that's the one with invites, notifications and voice:
[2.1.0 notes](https://github.com/tranquility598-beep/love-app/releases/tag/v2.1.0).

**Installing on Android** — if you have 2.1.0 or older, Android won't install
this over it: the builds are signed with different keys. Uninstall the old app
first, then install this one; chats, friends and your account live on the server
and stay intact.
