/**
 * Electron Main Process
 * Запускает Electron приложение и управляет окнами
 */

const { app, BrowserWindow, ipcMain, shell, Notification, desktopCapturer, session, nativeTheme, safeStorage, Menu, Tray, nativeImage } = require('electron');
const { createCanvas } = require('canvas');

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
// Фоновое авто-обновление: при наличии обновления оно само скачивается, и
// устанавливается тихо при выходе из приложения. Параллельно рендер показывает
// уведомление + раздел Настройки → Обновления с кнопкой «обновить сейчас».
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
// macOS: билд не подписан сертификатом Apple — Squirrel.Mac не сможет
// установить обновление тихо. Не качаем в фоне (будут ошибки),
// только проверяем и показываем «доступна версия» + кнопку скачать.
if (process.platform === 'darwin') {
  autoUpdater.autoDownload = false;
}

// Отключаем аппаратное ускорение для совместимости
// app.disableHardwareAcceleration();

let mainWindow;
let incomingCallWindow; // Variable for the popup
let serverProcess;
let tray = null;
let isQuitting = false;

const appIcon = process.platform === 'win32'
  ? path.join(__dirname, 'assets', 'icon.ico')
  : path.join(__dirname, 'assets', 'icon.png');

// Путь к серверу
const serverPath = path.join(__dirname, '..', 'server', 'index.js');
const isPackaged = app.isPackaged;
const requestedBackendMode = process.argv
  .find(argument => argument.startsWith('--backend='))
  ?.slice('--backend='.length)
  .trim()
  .toLowerCase();
const usesProductionBackend = isPackaged || requestedBackendMode === 'production';
const backendOrigin = usesProductionBackend
  ? 'https://api.loveapp.chat'
  : 'http://127.0.0.1:5555';
console.log(`[Backend] ${usesProductionBackend ? 'production' : 'local'}: ${backendOrigin}`);

/**
 * Запускает backend сервер как дочерний процесс
 */
function startServer() {
  if (usesProductionBackend) return;

  serverProcess = spawn('node', [serverPath], {
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: 'pipe'
  });

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
    minWidth: 1100,
    minHeight: 720,
    frame: false,
    backgroundColor: '#000000',
    icon: appIcon,
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

  // Обработчик закрытия окна (сворачивание в трей вместо закрытия)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function showMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

function createTray() {
  let icon;
  if (fs.existsSync(appIcon)) {
    icon = nativeImage.createFromPath(appIcon);
  } else {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Open Love', 
      click: () => {
        showMainWindow();
      } 
    },
    { type: 'separator' },
    { 
      label: 'Check for Updates', 
      click: () => {
        autoUpdater.checkForUpdatesAndNotify();
      } 
    },
    { type: 'separator' },
    { 
      label: 'Quit', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);

  tray.setToolTip('Love');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    showMainWindow();
  });
}

function createBadgeImage(count) {
  const size = 16;
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#E53935';
  ctx.beginPath();
  ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(count > 9 ? '9+' : String(count), size/2, size/2 + 1);
  return nativeImage.createFromBuffer(canvas.toBuffer('image/png'));
}

// IPC handler to set badge count on macOS/Windows taskbar
ipcMain.on('set-badge-count', (event, count) => {
  const n = parseInt(count, 10) || 0;
  app.setBadgeCount(n);
  if (process.platform === 'win32' && mainWindow) {
    if (n === 0) {
      mainWindow.setOverlayIcon(null, '');
    } else {
      const badgeImage = createBadgeImage(n);
      mainWindow.setOverlayIcon(badgeImage, `${n} непрочитанных`);
    }
  }
});

// Обработчики IPC для управления окном
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
    } else if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});

// Обработчик для показа уведомлений (с опциональным payload для перехода по клику)
ipcMain.on('show-notification', (event, { title, body, payload }) => {
  if (Notification.isSupported()) {
    const n = new Notification({ title, body, icon: appIcon, silent: false });
    n.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('notification-clicked', payload || null);
      }
    });
    n.show();
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

// Реестр активных контроллеров для отмены устаревших запросов (Deduplication)
const activeRequests = new Map();

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

    // Легковесная отмена только для Auth Namespace (Deduplication)
    const isAuthRoute = path.startsWith('/auth/');
    if (isAuthRoute) {
      if (activeRequests.has(path)) {
        activeRequests.get(path).abort();
      }
      const controller = new AbortController();
      activeRequests.set(path, controller);
      fetchOptions.signal = controller.signal;
    }

    let response;
    try {
      response = await fetch(url, fetchOptions);
    } finally {
      if (isAuthRoute) {
        activeRequests.delete(path);
      }
    }
    
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
    // Если это была принудительная отмена (AbortController)
    if (error.name === 'AbortError') {
      return { ok: false, aborted: true, data: null };
    }
    console.error('API proxy error:', error.message);
    return { ok: false, status: 500, data: { message: error.message }, error: error.message };
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
    return { ok: false, status: 500, data: { message: error.message }, error: error.message };
  }
});

// Обработчик для получения режима (разработка/продакшн)
ipcMain.handle('get-is-packaged', () => {
  return app.isPackaged;
});

ipcMain.handle('get-backend-mode', () => ({
  production: usesProductionBackend,
  origin: backendOrigin
}));

// Обработчик для получения версии приложения
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-screen-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['window', 'screen'],
    thumbnailSize: { width: 320, height: 180 }
  });
  return sources.map(s => {
    let name = s.name;
    if (!name || !name.trim()) {
      name = s.id.startsWith('screen') ? 'Весь экран' : 'Окно приложения';
    }
    return {
      id: s.id,
      name: name,
      thumbnail: s.thumbnail.toDataURL()
    };
  });
});

// Синхронный обработчик
ipcMain.on('get-is-packaged-sync', (event) => {
  event.returnValue = app.isPackaged;
});

ipcMain.on('get-backend-mode-sync', (event) => {
  event.returnValue = {
    production: usesProductionBackend,
    origin: backendOrigin
  };
});

// Обработчик для получения пути к папке загрузок
ipcMain.handle('get-downloads-path', () => {
  return app.getPath('downloads');
});

// ── Локальный файл музыки профиля (владелец слушает со своего диска) ──
ipcMain.handle('check-local-file', (event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') return false;
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (e) {
    return false;
  }
});

ipcMain.handle('read-local-file', (event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') return { ok: false };
    if (!fs.existsSync(filePath)) return { ok: false };
    const stat = fs.statSync(filePath);
    // Ограничение 20 МБ — чтобы не читать гигантские файлы в память
    if (stat.size > 20 * 1024 * 1024) return { ok: false, tooLarge: true };
    const buffer = fs.readFileSync(filePath);
    const ext = (path.extname(filePath) || '').toLowerCase();
    const mimeMap = {
      '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
      '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac',
      '.webm': 'audio/webm', '.opus': 'audio/opus'
    };
    return {
      ok: true,
      data: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
      mime: mimeMap[ext] || 'audio/mpeg'
    };
  } catch (e) {
    return { ok: false };
  }
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
  autoUpdater.checkForUpdates().catch((err) => {
    if (mainWindow) mainWindow.webContents.send('updater-message', { type: 'error', error: err.message });
  });
});

// Пользователь нажал «Скачать обновление» — запускаем загрузку.
ipcMain.on('download-update', () => {
  autoUpdater.downloadUpdate().catch((err) => {
    if (mainWindow) mainWindow.webContents.send('updater-message', { type: 'error', error: err.message });
  });
});

// Канал обновлений: stable (false) или beta/предрелизы (true).
// Рендер шлёт сохранённый выбор при старте и при переключении тумблера.
ipcMain.on('set-update-channel', (_event, allowPrerelease) => {
  autoUpdater.allowPrerelease = !!allowPrerelease;
  log.info('Update channel: ' + (allowPrerelease ? 'beta (prerelease)' : 'stable'));
});

// Открыть ссылку во внешнем браузере (фолбэк скачивания для macOS и пр.).
ipcMain.on('open-external', (_event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    shell.openExternal(url);
  }
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
ipcMain.on('show-incoming-call', (event, { caller, conversationId, channelId }) => {
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
    incomingCallWindow.webContents.send('incoming-call-data', { caller, conversationId, channelId });
  });

  incomingCallWindow.on('closed', () => {
    incomingCallWindow = null;
  });
});

ipcMain.on('call-action', (event, data) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('call-response-from-popup', data);
  }

  if (incomingCallWindow && !incomingCallWindow.isDestroyed()) {
    incomingCallWindow.close();
  }
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
            "img-src 'self' data: blob: http://localhost:* http://127.0.0.1:* https:;" +
            "connect-src 'self' http://localhost:* http://127.0.0.1:* ws://localhost:* ws://127.0.0.1:* https: wss:;" +
            "font-src 'self' data:;" +
            "media-src 'self' blob: data: https: http: http://localhost:* http://127.0.0.1:*;"
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

    if (!usesProductionBackend) {
      startServer();
      setTimeout(() => {
        createWindow();
        createTray();
      }, 2000);
    } else {
      createWindow();
      createTray();
      setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 3000);
      setInterval(() => {
        autoUpdater.checkForUpdates().catch(() => {});
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
  const authUrl = `${backendOrigin}/api/auth/google`;

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
  isQuitting = true;
  if (serverProcess) {
    serverProcess.kill();
  }
});
