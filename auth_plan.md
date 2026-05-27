# Архитектурный план: Auth UI Version Guard (State Machine & Cancellation)

## Цель
Полностью исключить возможность того, что **stale async responses** (задержавшиеся ответы от сервера) смогут мутировать UI или глобальное состояние после того, как пользователь уже сменил экран (например, перешел с Login на Register).

## Проблема (Stale Async)
Текущий флоу:
1. Юзер нажимает "Войти" -> `handleLogin()` делает `await AuthAPI.login()`.
2. Сеть тормозит (Slow 3G).
3. Юзер переключается на экран регистрации.
4. Ответ от `login` приходит (успех или 500).
5. Код внутри `handleLogin()` продолжает выполняться, изменяя состояние кнопок, показывая ошибки на скрытых экранах или редиректя пользователя, ломая текущий UX.

## Предлагаемое решение: Version Guard (Execution Identity)

Мы внедряем легковесный стейт-менеджер переходов, который будет отбрасывать любые асинхронные коллбеки, если экран был изменен.

### 1. Глобальный токен версии
Создаем глобальный счетчик или идентификатор текущего контекста аутентификации.
```javascript
window.authTransitionId = 0;
```

### 2. Смена экранов (State Machine)
Модифицируем функцию `hideAllAuthScreens()` или создаем новую обертку `switchAuthScreen(screenId)`, которая при каждом вызове инкрементирует токен:
```javascript
function switchAuthScreen(screenId) {
  // 1. Убиваем все старые async контексты
  window.authTransitionId++; 
  
  // 2. Прячем экраны и чистим старые ошибки
  hideAllAuthScreens();
  
  // 3. Показываем нужный
  document.getElementById(screenId).classList.remove('hidden');
}
```
Тогда `showLogin()` превратится в:
```javascript
function showLogin() {
  switchAuthScreen('login-screen');
}
```

### 3. Version Guard внутри Async цепочек
Во всех обработчиках (`handleLogin`, `handleRegister`, `handleForgotPassword` и т.д.) мы захватываем текущий `authTransitionId` до `await`, и проверяем его сразу после:

```javascript
async function handleLogin() {
  const currentTransitionId = window.authTransitionId;
  // ... валидация и disabled = true ...

  try {
    const data = await AuthAPI.login(email, password);
    
    // GUARD: Если юзер уже ушел с экрана логина - отбрасываем ответ
    if (window.authTransitionId !== currentTransitionId) return;

    // ... нормальная логика успеха ...
  } catch (error) {
    // GUARD: Отбрасываем stale ошибки
    if (window.authTransitionId !== currentTransitionId) return;

    showAuthError('login-error', error.message);
  } finally {
    // GUARD: Не разблокируем кнопку, если экран уже сменился 
    // (хотя скрытие экрана и так делает ее невидимой, мы предотвращаем фантомные клики)
    if (window.authTransitionId === currentTransitionId) {
      btn.disabled = false;
      btn.textContent = 'Войти';
    }
  }
}
```

## Преимущества этого подхода
1. **Zero External Dependencies**: Не требует RxJS, Redux или сложной логики `AbortController` (который отменяет сетевой запрос, но не спасает от фантомных выполнений `finally`).
2. **Гарантированная изоляция**: Если пользователь кликает 10 раз туда-сюда, выживет только тот коллбек, который относится к *текущему открытому окну*.
3. **Безопасность**: Защищает от race conditions, когда успешный вход от старого запроса может триггернуть загрузку комнат, в то время как юзер уже запустил регистрацию.

> [!IMPORTANT]
> **Open Question для вас:**  
> Достаточно ли нам Version Guard на уровне UI-переходов (auth transition), или вы хотите чтобы мы использовали настоящий `AbortController` внутри `apiFetch` для хард-канселинга самих HTTP-запросов (чтобы экономить ресурсы сервера при быстрых переключениях)? Обычно Version Guard достаточно для защиты стейта, а `AbortController` добавляет много бойлерплейта на фронтенде. Каков ваш вердикт?
