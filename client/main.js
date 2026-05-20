/**
 * Electron Main Process
 * Запускает Electron приложение и управляет окнами
 */

const { app, BrowserWindow, ipcMain, shell, Notification, desktopCapturer, session, nativeTheme, safeStorage } = require('electron');

// ПРИНУДИТЕЛЬНЫЙ DARK MODE И НОВЫЙ ДИЗАЙН GOOGLE
app.commandLine.appendSwitch('force-dark-mode');
app.commandLine.appendSwitch('enable-features', 'WebContentsForceDark');
// Отключаем подозрительную детекцию 'embedded browser'
app.commandLine.appendSwitch('disable-features', 'UserAgentClientHint');

// Исправление ошибок кеша - используем временную папку
app.commandLine.appendSwitch('disk-cache-dir', app.getPath('temp') + '/love-cache');
app.commandLine.appendSwitch('disk-cache-size', '104857600'); // 100MB

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Настройка логгера для автообновлений
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';

// Отключаем аппаратное ускорение для совместимости
// app.disableHardwareAcceleration();

let mainWindow;
let incomingCallWindow; // Variable for the popup
let serverProcess;

// Путь к серверу
const serverPath = path.join(__dirname, '..', 'server', 'index.js');
const isPackaged = app.isPackaged;

/**
 * Запускает backend сервер как дочерний процесс
 */
function startServer() {
  if (isPackaged) {
    // В упакованном приложении сервер находится в resources
    const resourcesPath = process.resourcesPath;
    const serverIndexPath = path.join(resourcesPath, 'server', 'index.js');
    serverProcess = spawn('node', [serverIndexPath], {
      env: { ...process.env, NODE_ENV: 'production' },
      stdio: 'pipe'
    });
  } else {
    // В режиме разработки
    serverProcess = spawn('node', [serverPath], {
      env: { ...process.env, NODE_ENV: 'development' },
      stdio: 'pipe'
    });
  }

  serverProcess.stdout.on('data', (data) => {
    console.log(`Server: ${data}`);
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`Server Error: ${data}`);
  });

  serverProcess.on('close', (code) => {
    console.log(`Server process exited with code ${code}`);
  });
}

/**
 * Создает главное окно приложения
 */
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    backgroundColor: '#000000',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      enableRemoteModule: false,
      webviewTag: false // Запрещаем webview
    }
  });

  // Загружаем главную страницу
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Показываем окно когда оно готово
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Проверка начальных аргументов (deep link при первом запуске)
    if (process.platform === 'win32') {
      const url = process.argv.find(arg => arg.startsWith('love-app://'));
      if (url) {
        handleDeepLink(url);
      }
    }
  });

  // Открываем внешние ссылки в браузере
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Разрешаем только http/https
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  // Блокируем навигацию главного окна на сторонние сайты
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Разрешаем навигацию только по локальным файлам (index.html)
    if (!url.startsWith('file://')) {
      event.preventDefault();
      console.warn('Заблокирована небезопасная навигация окна на:', url);
    }
  });

  // Обработчик закрытия окна
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Обработчики IPC для управления окном
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// Обработчик для показа уведомлений
ipcMain.on('show-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

// ====== БЕЗОПАСНОЕ ХРАНЕНИЕ ТОКЕНА ======
const TOKEN_FILE_PATH = path.join(app.getPath('userData'), 'secure_token.enc');

ipcMain.handle('store-token', async (event, token) => {
  try {
    if (!token) return false;
    
    // В безопасном хранилище:
    if (safeStorage.isEncryptionAvailable()) {
      const encryptedToken = safeStorage.encryptString(token);
      fs.writeFileSync(TOKEN_FILE_PATH, encryptedToken);
    } else {
      // Фолбэк, если шифрование недоступно (например, Linux без кольца ключей)
      fs.writeFileSync(TOKEN_FILE_PATH, Buffer.from(token, 'utf-8').toString('base64'));
    }
    return true;
  } catch (error) {
    console.error('Error storing token:', error);
    return false;
  }
});

ipcMain.handle('get-token', async () => {
  try {
    if (!fs.existsSync(TOKEN_FILE_PATH)) return null;
    
    const tokenData = fs.readFileSync(TOKEN_FILE_PATH);
    
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(tokenData);
    } else {
      return Buffer.from(tokenData.toString(), 'base64').toString('utf-8');
    }
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
});

ipcMain.handle('clear-token', async () => {
  try {
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      fs.unlinkSync(TOKEN_FILE_PATH);
    }
    return true;
  } catch (error) {
    console.error('Error clearing token:', error);
    return false;
  }
});

// ====== БЕЗОПАСНЫЙ ПРОКСИ API ======
ipcMain.handle('api-request', async (event, { path, method = 'GET', body = null, headers = {} }) => {
  try {
    // 1. Получаем токен
    let token = null;
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      const tokenData = fs.readFileSync(TOKEN_FILE_PATH);
      token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(tokenData) : Buffer.from(tokenData.toString(), 'base64').toString('utf-8');
    }

    // 2. Строгие проверки Path
    if (!path || typeof path !== 'string' || !path.startsWith('/')) {
      throw new Error('Уязвимость: Некорректный путь API ' + path);
    }
    
    // Формируем URL в Main Process (надежно)
    // FIX (Windows + Node 18+): используем 127.0.0.1 вместо localhost, иначе undici
    // fetch резолвит localhost в ::1 (IPv6), а сервер слушает только 0.0.0.0 (IPv4) →
    // ECONNREFUSED. Это даёт "transport error" на всех запросах в dev-режиме.
    const isPackaged = app.isPackaged;
    const backendOrigin = isPackaged ? 'https://love-app-2ou3.onrender.com' : 'http://127.0.0.1:5555';
    const url = `${backendOrigin}/api${path}`;

    // 3. Формируем заголовки
    const fetchHeaders = { ...headers };
    if (token) {
      fetchHeaders['Authorization'] = `Bearer ${token}`;
    }

    // 4. Выполняем запрос через встроенный fetch
    const fetchOptions = {
      method,
      headers: fetchHeaders
    };
    
    // Поддерживаем отправку JSON
    if (body) {
      if (typeof body === 'string') {
         fetchOptions.body = body;
         if (!fetchHeaders['Content-Type']) fetchHeaders['Content-Type'] = 'application/json';
      }
    }

    const response = await fetch(url, fetchOptions);
    
    // Читаем ответ как текст (иногда сервер может вернуть не JSON)
    const responseText = await response.text();
    let responseData;
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      responseData = { message: responseText }; // fallback если не JSON
    }

    return {
      ok: response.ok,
      status: response.status,
      data: responseData
    };

  } catch (error) {
    console.error('API proxy error:', error.message);
    return { ok: false, status: 500, error: error.message };
  }
});

// ====== БЕЗОПАСНЫЙ ПРОКСИ ЗАГРУЗКИ ФАЙЛОВ ======
ipcMain.handle('api-upload', async (event, { path, method = 'POST', fileData, fileName, mimeType, additionalFields = {} }) => {
  try {
    let token = null;
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      const tokenData = fs.readFileSync(TOKEN_FILE_PATH);
      token = safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(tokenData) : Buffer.from(tokenData.toString(), 'base64').toString('utf-8');
    }

    if (!path || typeof path !== 'string' || !path.startsWith('/')) {
      throw new Error('Уязвимость: Некорректный путь API ' + path);
    }
    
    // Тот же fix IPv4 для api-upload (см. комментарий выше).
    const isPackaged = app.isPackaged;
    const backendOrigin = isPackaged ? 'https://love-app-2ou3.onrender.com' : 'http://127.0.0.1:5555';
    // Для загрузки иногда /api/upload, а иногда /api/servers/...
    const url = `${backendOrigin}${path.startsWith('/api') ? path : '/api' + path}`;

    const fetchHeaders = {};
    if (token) {
      fetchHeaders['Authorization'] = `Bearer ${token}`;
    }

    const formData = new FormData();
    // buffer to blob
    if (fileData) {
      const blob = new Blob([fileData], { type: mimeType });
      // Имя поля FormData выбираем по endpoint'у — backend ожидает
      // конкретное имя (req.files.<fieldName>):
      //   /icon          → icon
      //   /banner        → banner
      //   /avatar        → avatar
      //   /emojis        → emoji
      //   всё остальное  → file
      let fieldName = 'file';
      if (path.endsWith('/icon')) fieldName = 'icon';
      else if (path.endsWith('/banner')) fieldName = 'banner';
      else if (path.includes('/avatar')) fieldName = 'avatar';
      else if (path.includes('/emoji')) fieldName = 'emoji';
      formData.append(fieldName, blob, fileName);
    }
    
    for (const [key, value] of Object.entries(additionalFields)) {
      formData.append(key, value);
    }

    const response = await fetch(url, {
      method,
      headers: fetchHeaders,
      body: formData
    });

    const responseText = await response.text();
    let responseData;
    try {
      responseData = responseText ? JSON.parse(responseText) : {};
    } catch (e) {
      responseData = { message: responseText };
    }

    return {
      ok: response.ok,
      status: response.status,
      data: responseData
    };
  } catch (error) {
    console.error('API upload error:', error);
    return { ok: false, status: 500, error: error.message };
  }
});

// Обработчик для получения режима (разработка/продакшн)
ipcMain.handle('get-is-packaged', () => {
  return app.isPackaged;
});

// Синхронный обработчик
ipcMain.on('get-is-packaged-sync', (event) => {
  event.returnValue = app.isPackaged;
});

// Обработчик для получения пути к папке загрузок
ipcMain.handle('get-downloads-path', () => {
  return app.getPath('downloads');
});

// Обработчики автообновлений
autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
  if (mainWindow) mainWindow.webContents.send('updater-message', { type: 'checking' });
});

autoUpdater.on('update-available', (info) => {
  log.info('Update available.');
  if (mainWindow) mainWindow.webContents.send('updater-message', { type: 'available', info });
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available.');
  if (mainWindow) mainWindow.webContents.send('updater-message', { type: 'not-available', info });
});

autoUpdater.on('error', (err) => {
  log.info('Error in auto-updater. ' + err);
  if (mainWindow) mainWindow.webContents.send('updater-message', { type: 'error', error: err.message });
});

autoUpdater.on('download-progress', (progressObj) => {
  log.info(`Download speed: ${progressObj.bytesPerSecond} - Downloaded ${progressObj.percent}%`);
  if (mainWindow) mainWindow.webContents.send('updater-message', { type: 'progress', progress: progressObj });
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded');
  if (mainWindow) mainWindow.webContents.send('updater-message', { type: 'downloaded', info });
});

ipcMain.on('check-for-updates', () => {
  autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.on('install-update', () => {
  if (mainWindow) {
    // Прячем основное окно
    mainWindow.hide();
  }

  // Создаем кастомный splash-экран обновления
  const updateWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,             // Без стандартных Windows рамок
    transparent: true,        // Прозрачный фон
    alwaysOnTop: true,        // Поверх всех окон
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  updateWindow.loadFile(path.join(__dirname, 'update-splash.html'));

  // Даем загрузиться анимации 3 секунды, затем запускаем тихий инсталлер
  setTimeout(() => {
    // Внимание: после вызова этой функции Electron немедленно закроет приложение
    // и запустит распаковку обновления в фоне.
    autoUpdater.quitAndInstall(true, true); 
  }, 3500);
});

/**
 * Управление окном Входящего Звонка
 */
ipcMain.on('show-incoming-call', (event, { caller }) => {
  if (incomingCallWindow) return; // Уже открыто

  incomingCallWindow = new BrowserWindow({
    width: 380,
    height: 480,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    show: false,
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  incomingCallWindow.loadFile(path.join(__dirname, 'call-popup.html'));

  incomingCallWindow.once('ready-to-show', () => {
    incomingCallWindow.show();
    // Отправляем данные вызывающего в попап
    incomingCallWindow.webContents.send('incoming-call-data', { caller });
  });

  incomingCallWindow.on('closed', () => {
    incomingCallWindow = null;
  });
});

ipcMain.on('close-incoming-call', () => {
  if (incomingCallWindow) {
    incomingCallWindow.close();
  }
});

// Регистрация протокола для внешнего браузера
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('love-app', process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient('love-app');
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Если приложение уже запущено, фокусируемся на нем
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    
    // Обработка ссылки для Windows
    const url = commandLine.pop();
    if (url && url.includes('love-app://')) {
      handleDeepLink(url);
    }
  });

  // Запуск сервера с обработкой занятого порта
  app.whenReady().then(() => {
    // === Content Security Policy (CSP) ===
    // ВАЖНО: Текущий CSP использует 'unsafe-inline' и 'unsafe-eval' из-за:
    // 1. Множество inline onclick обработчиков в HTML (123+ мест)
    // 2. DOMPurify требует 'unsafe-eval' для работы
    // 3. CDN скрипты (socket.io, DOMPurify, emoji-picker) требуют разрешения
    // 
    // TODO для полной безопасности:
    // 1. Мигрировать все onclick на addEventListener в JS файлах
    // 2. Заменить DOMPurify на альтернативу без eval или использовать nonce
    // 3. Скачать CDN скрипты локально
    // 4. После миграции включить строгий CSP (см. ниже)
    //
    // Строгий CSP (для будущего использования после миграции):
    // "default-src 'self';" +
    // "script-src 'self';" +
    // "style-src 'self';" +
    // "img-src 'self' data: blob: http://localhost:* https:;" +
    // "connect-src 'self' http://localhost:* ws://localhost:* https: wss:;" +
    // "font-src 'self' data:;" +
    // "media-src 'self' blob: data:;"
    
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': [
            "default-src 'self';" +
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://cdn.socket.io;" + 
            "style-src 'self' 'unsafe-inline';" +
            "img-src 'self' data: blob: http://localhost:* https:;" +
            "connect-src 'self' http://localhost:* ws://localhost:* https: wss:;" +
            "font-src 'self' data:;" +
            "media-src 'self' blob: data: https:;"
          ]
        }
      });
    });

    // Настройка обработчика захвата экрана
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
        if (sources && sources.length > 0) {
          const source = sources.find(s => s.id.startsWith('screen')) || sources[0];
          callback({ video: source, audio: 'loopback' });
        } else {
          callback();
        }
      }).catch(err => {
        console.error('getDisplayMedia error:', err);
        callback();
      });
    });

    if (!isPackaged) {
      startServer();
      setTimeout(() => {
        createWindow();
      }, 2000);
    } else {
      createWindow();
      setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 3000);
      setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify();
      }, 60 * 60 * 1000); 
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

// Обработка ссылки для macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Парсинг токена из ссылки (love-app://login-success?token=...)
function handleDeepLink(url) {
  try {
    // НЕ логируем сам url целиком (содержит token).
    // Извлекаем токен через поиск параметра (надежнее для кастомных протоколов)
    const tokenMatch = url.match(/[?&]token=([^&]+)/);
    const token = tokenMatch ? tokenMatch[1] : null;

    if (token && mainWindow) {
      // Отправляем токен в рендерер через IPC
      mainWindow.webContents.send('google-auth-success', token);

      // Фокусируемся на окне
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  } catch (e) {
    console.error('Failed to parse deep link URL (redacted):', e.message);
  }
}

// Обработка Google Auth через системный браузер
ipcMain.on('google-login', (event) => {
  // В разработке используем локалхост, в билде — продакшн
  const authUrl = app.isPackaged 
    ? 'https://love-app-2ou3.onrender.com/api/auth/google'
    : 'http://localhost:5555/api/auth/google';

  // Открываем браузер по умолчанию (Chrome/Safari/etc)
  shell.openExternal(authUrl);
});

// Закрываем приложение когда все окна закрыты
app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Убиваем сервер при выходе
app.on('before-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
