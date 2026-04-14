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
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  
  // Пути
  getDownloadsPath: () => ipcRenderer.invoke('get-downloads-path'),
  
  // Версия приложения
  getVersion: () => process.env.npm_package_version || '1.0.0',
  
  // Режим (разработка/продакшн)
  isPackaged: () => ipcRenderer.invoke('get-is-packaged'),
  isPackagedSync: () => ipcRenderer.sendSync('get-is-packaged-sync'),
  
  // Автообновления
  onUpdateMessage: (callback) => ipcRenderer.on('updater-message', (_event, data) => callback(data)),
  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  installUpdate: () => ipcRenderer.send('install-update'),

  // Голосовые звонки
  showIncomingCall: (caller) => ipcRenderer.send('show-incoming-call', { caller }),
  closeIncomingCall: () => ipcRenderer.send('close-incoming-call'),
  onIncomingCallData: (callback) => ipcRenderer.on('incoming-call-data', (_event, data) => callback(data)),
  sendCallAction: (data) => ipcRenderer.send('call-action', data),
  onCallResponseFromPopup: (callback) => ipcRenderer.on('call-response-from-popup', (_event, data) => callback(data)),
  
  // Платформа
  platform: process.platform,

  // Google Auth
  openGoogleLogin: () => ipcRenderer.send('google-login'),
  onGoogleAuthSuccess: (callback) => ipcRenderer.on('google-auth-success', (_event, token) => callback(token))
});
