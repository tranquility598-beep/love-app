/**
 * Electron Preload Script
 * Безопасный мост между renderer процессом и main процессом
 */

const { contextBridge, ipcRenderer } = require('electron');

// Экспортируем безопасные API в renderer процесс
contextBridge.exposeInMainWorld('electronAPI', {
  // Управление окном
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  maximizeWindow: () => ipcRenderer.send('window-maximize'),
  closeWindow: () => ipcRenderer.send('window-close'),
  
  // Уведомления
  showNotification: (title, body, payload) => ipcRenderer.send('show-notification', { title, body, payload }),
  onNotificationClick: (callback) => ipcRenderer.on('notification-clicked', (_event, payload) => callback(payload)),
  
  // Пути
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),
  
  // Версия приложения
  getVersion: () => {
    try {
      return require('../package.json').version;
    } catch (e) {
      return process.env.npm_package_version || '1.7.2';
    }
  },
  
  // Режим (разработка/продакшн)
  isPackaged: () => ipcRenderer.invoke('get-is-packaged'),
  getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),
  isPackagedSync: () => ipcRenderer.sendSync('get-is-packaged-sync'),
  
  // Автообновления
  onUpdateMessage: (callback) => ipcRenderer.on('updater-message', (_event, data) => callback(data)),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  installUpdate: () => ipcRenderer.send('install-update'),

  // Голосовые звонки
  showIncomingCall: (caller, conversationId, channelId) => ipcRenderer.send('show-incoming-call', { caller, conversationId, channelId }),
  closeIncomingCall: () => ipcRenderer.send('close-incoming-call'),
  setBadgeCount: (n) => ipcRenderer.send('set-badge-count', n),
  onIncomingCallData: (callback) => ipcRenderer.on('incoming-call-data', (_event, data) => callback(data)),
  sendCallAction: (data) => ipcRenderer.send('call-action', data),
  onCallResponseFromPopup: (callback) => ipcRenderer.on('call-response-from-popup', (_event, data) => callback(data)),
  
  // Платформа
  platform: process.platform,

  // Google Auth
  openGoogleLogin: () => ipcRenderer.send('google-login'),
  onGoogleAuthSuccess: (callback) => ipcRenderer.on('google-auth-success', (_event, token) => callback(token)),

  // Безопасное хранилище токенов (только для сохранения/удаления)
  storeToken: (token) => ipcRenderer.invoke('store-token', token),
  clearToken: () => ipcRenderer.invoke('clear-token'),
  
  // Прокси для безопасных API запросов (токен подставляется в main process)
  // Renderer НИКОГДА не получает raw token - все запросы идут через IPC
  apiRequest: (options) => ipcRenderer.invoke('api-request', options),
  apiUpload: (options) => ipcRenderer.invoke('api-upload', options),

  // Локальный файл музыки профиля (владелец слушает со своего диска)
  checkLocalFile: (filePath) => ipcRenderer.invoke('check-local-file', filePath),
  readLocalFile: (filePath) => ipcRenderer.invoke('read-local-file', filePath)
});
