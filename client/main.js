/**
 * Electron Main Process
 * Запускает Electron приложение и управляет окнами
 */

const { app, BrowserWindow, ipcMain, shell, Notification, desktopCapturer, session } = require('electron');
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
    title: 'Love',
    width: 1280,
    height: 800,
    minWidth: 940,
    minHeight: 600,
    frame: false, // Убираем стандартную рамку для кастомного заголовка
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false // Разрешаем загрузку локальных ресурсов
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    show: false // Не показываем до загрузки
  });

  // Загружаем главную страницу
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Показываем окно когда оно готово
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Открываем внешние ссылки в браузере
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
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

// Пересылаем ответ из попапа в главное окно
ipcMain.on('call-action', (event, { accepted, callerId }) => {
  if (mainWindow) {
    mainWindow.webContents.send('call-response-from-popup', { accepted, callerId });
  }
  if (incomingCallWindow) {
    incomingCallWindow.close();
  }
});

// Запуск приложения
app.whenReady().then(() => {
  // Настройка обработчика захвата экрана для getDisplayMedia в Electron
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      if (sources && sources.length > 0) {
        // Берем первый доступный экран
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
    // В режиме разработки запускаем локальный сервер
    startServer();
    setTimeout(() => {
      createWindow();
    }, 2000);
  } else {
    // В Production режиме (у пользователей) открываем окно сразу (без локального сервера)
    createWindow();
    
    // Начальная проверка через 3 секунды после запуска
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 3000);
    
    // Проверять наличие обновлений каждый час, пока приложение открыто
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
