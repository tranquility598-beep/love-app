# LOVE v2.1.0

Приглашения, уведомления и войс. Три вещи, которые раньше раздражали больше всего.

## Что нового

**Приглашения работают откуда угодно.** Одна ссылка — и не важно, откуда её открыли.
В браузере показывается превью: кто зовёт, куда, сколько там людей. В приложении
открывается сама сфера. Молча, вслепую, никуда больше не вступаете.

**Уведомления перестали шуметь.** Десять сообщений от одного человека — одна карточка,
а не десять. Фото приходит миниатюрой, голосовое, видео и файл — понятной подписью,
а не «вложение».

**Войс в сферах выглядит как звонок в личке.** Та же панель, те же кнопки. Аватарки
видно с первой секунды, а не после первого мута. Кнопки камеры и демонстрации
управляют вашим потоком, а не потоком собеседника.

**Демонстрацию можно открыть на весь экран** и приближать — колесом на компьютере,
пальцами на телефоне. Остальные участники при этом остаются полоской сбоку, никто
не пропадает.

**Медиа.** Фотографии приближаются пальцами, видео открывается во весь экран
и разворачивается в ландшафт.

**Голосовые.** Во время записи видно живую волну уровня — понятно, что вас слышно.

**Светлая тема** доделана целиком, а не местами. В настройках у тем появились
нормальные иконки.

**Ссылки на чужие сайты** сначала спрашивают, точно ли вы туда хотите.

## Что починили

- Сообщения, пришедшие пока приложение было свёрнуто, больше не теряются: при
  возвращении переписка дочитывается сама. Было и на телефоне, и на компьютере.
- Скачивание на Android с сайта. Раньше вместо файла уносило на страницу GitHub —
  ссылку собирал браузер через GitHub API, а там лимит запросов на IP, и у мобильных
  операторов он вечно исчерпан. Теперь файл отдаёт наш сервер напрямую.
- Быстрые нажатия на голосовой канал в сфере больше не перезаходят в него по кругу.
- Во время звонка в личке нельзя случайно провалиться в голосовой канал сферы.
- Таблетка звонка на компьютере не уезжает под панель, и в ней видно аватарку.
- Демонстрация на компьютере больше не открывается крошечной, а в комнатах в войсе
  показываются реальные экраны, а не заглушки.
- «Открыть в приложении» на странице приглашения действительно открывает сферу.
- Настройки: вкладка «Внешний вид» работает, микрофон переключается на ходу
  без перезапуска звонка.
- Базовый канал новой сферы называется «Чат», а не «general».

## Как поставить

- **Windows** — `LoveSetup.exe`
- **macOS** — `.dmg` (Apple Silicon и Intel)
- **Android** — `love-mobile-v2.1.0-arm64-v8a.apk` (для старых телефонов —
  `armeabi-v7a`). Проще всего скачать с [loveapp.chat](https://loveapp.chat) —
  сайт сам подберёт файл под ваше устройство.

На Android обновление поверх прежней версии не встанет — Android так устроен, когда
сборка подписана другим ключом. Удалите старое приложение и поставьте новое:
переписки, друзья и аккаунт хранятся на сервере, ничего не потеряется.

---

## English

Invites, notifications and voice — the three things that annoyed people most.

**Invites** — one link works everywhere: a preview in the browser, the sphere itself
in the app. No more silently joining something you haven't seen.

**Notifications** — ten messages from one person make one card, not ten. Photos show
a thumbnail; voice notes, video and files get a readable label.

**Voice in spheres** — same panel as DM calls. Avatars appear immediately, and the
camera / screen-share buttons control your own stream.

**Screen share** — open it fullscreen and zoom (wheel on desktop, pinch on mobile);
other participants stay visible in a side strip.

**Also** — pinch-zoom for photos, fullscreen and landscape video, a live level meter
while recording voice notes, a finished light theme, proper theme icons in settings,
and a confirmation before following external links.

**Fixed** — messages that arrived while the app was minimised are no longer missed;
Android downloads from the site now stream from our own server instead of bouncing
to GitHub; rapid taps no longer re-join a voice channel; no accidental sphere-voice
join during a DM call; call pill position and avatar on desktop; screen share size on
desktop and real screens instead of placeholders in rooms; "Open in app" on the
invite page; live microphone switching; the default channel is now named "Чат".

**Installing on Android** — this build is signed with a different key, so Android
won't install it over the previous version. Uninstall the old app first, then install
this one; chats, friends and your account live on the server and stay intact.
