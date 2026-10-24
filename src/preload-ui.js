const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deskboxAPI', {
  getServices: () => ipcRenderer.invoke('get-services'),
  saveServices: (services) => ipcRenderer.invoke('save-services', services),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  updateTotalBadge: (total) => ipcRenderer.send('update-total-badge', total),
  onSwitchService: (callback) => ipcRenderer.on('switch-service', (_event, index) => callback(index)),
  onReloadActiveService: (callback) => ipcRenderer.on('reload-active-service', () => callback()),
  openFirefoxGoogle: () => ipcRenderer.invoke('open-firefox-google'),
  syncGoogleCookies: () => ipcRenderer.invoke('sync-google-cookies'),
  onTriggerSyncGoogle: (callback) => ipcRenderer.on('trigger-sync-google', () => callback()),
  clearCacheCookies: () => ipcRenderer.invoke('clear-cache-cookies'),
  onCacheCleared: (callback) => ipcRenderer.on('cache-cleared', () => callback()),
  onOpenSettings: (callback) => ipcRenderer.on('open-settings', () => callback()),
  onOpenGoogleLogin: (callback) => ipcRenderer.on('open-google-login', () => callback()),
  onToggleCalculator: (callback) => ipcRenderer.on('toggle-calculator', () => callback()),
  onCloseModals: (callback) => ipcRenderer.on('close-modals', () => callback())
});
