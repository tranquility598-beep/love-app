/**
 * Electron Main Process
 * Запускает Electron приложение и управляет окнами
 */

const { app, BrowserWindow, ipcMain, shell, Notification } = require('electron');
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
  autoUpdater.quitAndInstall();
});

// Запуск приложения
app.whenReady().then(() => {
  if (!isPackaged) {
    // В режиме разработки запускаем локальный сервер
    startServer();
    setTimeout(() => {
      createWindow();
    }, 2000);
  } else {
    // В Production режиме (у пользователей) открываем окно сразу (без локального сервера)
    createWindow();
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 3000);
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
