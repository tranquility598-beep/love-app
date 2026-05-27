# Архитектурный план: Backend Throttling & Strict Semantics

## Извлеченные уроки и строгие контракты
- **Отсутствие "магии" в UI**: Фронтенд больше не пытается угадывать состояние сервера. 429 означает только Rate Limit (запрет действия), 200 означает только Success (переход стейта).
- **Защита от False Lockout**: Метка кулдауна ставится **только после** успешной отправки письма. Если SMTP упал, юзер не получает 60-секундный lock.

## Этапы внедрения

### 1. Модель User (`server/models/User.js`)
Добавляем:
```javascript
otpLastSentAt: { type: Date }
```

### 2. Блокировка In-Flight запросов (Защита от параллельной гонки)
В `server/routes/auth.js` создаем Set для синхронных локов на время выполнения запроса:
```javascript
const activeAuthRequests = new Set();
```

### 3. Строгая логика Throttling (Backend)
Во всех маршрутах (`/login`, `/register`, `/forgot-password`, `/resend-otp`):

```javascript
const lockKey = `auth:${email}`;
if (activeAuthRequests.has(lockKey)) {
  return res.status(429).json({ code: 'RATE_LIMITED', message: 'Запрос обрабатывается' });
}
activeAuthRequests.add(lockKey);

try {
  // 1. Проверка кулдауна
  const COOLDOWN_MS = 60 * 1000;
  if (user.otpLastSentAt && (Date.now() - user.otpLastSentAt.getTime() < COOLDOWN_MS)) {
    const retryAfter = Math.ceil((COOLDOWN_MS - (Date.now() - user.otpLastSentAt.getTime())) / 1000);
    return res.status(429).json({ 
      code: 'RATE_LIMITED', 
      message: `Подождите ${retryAfter} сек. перед новой попыткой`,
      retryAfter 
    });
  }

  // 2. Отправка письма (критическая точка)
  await sendOTPEmail(email, otp);

  // 3. Запись стейта ТОЛЬКО после успеха SMTP
  user.otpLastSentAt = new Date();
  await user.save();

  // 4. Явный 200 OK (разрешение для UI перейти на следующий экран)
  return res.json({ message: 'Успешно', requireVerification: true });

} finally {
  activeAuthRequests.delete(lockKey);
}
```

### 4. Исправление Express Rate Limiter
В `server/middleware/rateLimiter.js` убираем `skipSuccessfulRequests: true` из `authLimiter`, чтобы защититься от login-флуда (генерации бесконечных токенов при правильном пароле).

### 5. Реакция Frontend
В `client/js/auth.js` мы ничего не меняем концептуально. Мы просто отображаем сообщение из `error.message` в красной плашке. Никаких автопереходов на `otp-screen` при ошибках.

> [!IMPORTANT]
> **Open Question:**  
> Архитектура очищена и приведена к эталону. Готовы ли вы дать зеленый свет на реализацию этого 3-го уровня (Server-Side Throttling + Rate Limit fixes)?
