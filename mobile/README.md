# Love Mobile Flutter

Flutter-клиент для Love. Он живет рядом с текущими Electron/web/Capacitor частями и не меняет существующий backend.

## Что уже заложено

- Темная мобильная тема Love, перенесенная из текущих mobile CSS tokens.
- Auth flow: login, register, OTP verification, 2FA verification.
- Secure token storage через `flutter_secure_storage`.
- REST API client для существующего Express backend.
- Socket.IO client с короткоживущим `/api/auth/socket-token`.
- Нижняя мобильная навигация: чаты, сферы, друзья, уведомления, Love Hub, настройки.
- Live chat foundation: загрузка истории через REST, отправка и получение сообщений через Socket.IO.

## Что осталось вторым слоем

- Полная настройка профиля, ролей, серверов и загрузок файлов в UI.
- Push notifications через FCM.
- Voice messages.
- Voice channels, calls, camera and WebRTC.
- Native Android project files.

## Запуск после установки Flutter SDK

Flutter SDK сейчас не найден в PATH этой машины, поэтому native Android-шаблон не сгенерирован. После установки Flutter:

```powershell
cd C:\Users\Aleksandr\Desktop\Love\mobile
flutter create --platforms=android .
flutter pub get
flutter run --dart-define=LOVE_API_BASE_URL=https://api.loveapp.chat
```

Для локального backend на Android emulator:

```powershell
flutter run --dart-define=LOVE_API_BASE_URL=http://10.0.2.2:5555
```

Для реального Android-телефона в локальной сети:

```powershell
flutter run --dart-define=LOVE_API_BASE_URL=http://YOUR_PC_LAN_IP:5555
```

## Backend compatibility

Flutter-клиент использует текущие endpoint'ы:

- `POST /api/auth/login`
- `POST /api/auth/register`
- `POST /api/auth/verify-otp`
- `POST /api/auth/verify-2fa`
- `GET /api/auth/me`
- `POST /api/auth/socket-token`
- `GET /api/dm`
- `GET /api/dm/:conversationId/messages`
- `GET /api/servers`
- `GET /api/messages/:channelId`
- `GET /api/friends`
- `GET /api/notifications`

Socket events уже подключены к существующим `message:new`, `message:update`, `dm:new_message`, `message:send`.
