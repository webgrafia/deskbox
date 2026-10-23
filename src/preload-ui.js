const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deskboxAPI', {
  getServices: () => ipcRenderer.invoke('get-services'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  updateTotalBadge: (total) => ipcRenderer.send('update-total-badge', total),
  onSwitchService: (callback) => ipcRenderer.on('switch-service', (_event, index) => callback(index)),
  openFirefoxGoogle: () => ipcRenderer.invoke('open-firefox-google'),
  syncGoogleCookies: () => ipcRenderer.invoke('sync-google-cookies'),
  onTriggerSyncGoogle: (callback) => ipcRenderer.on('trigger-sync-google', () => callback()),
  clearCacheCookies: () => ipcRenderer.invoke('clear-cache-cookies'),
  onCacheCleared: (callback) => ipcRenderer.on('cache-cleared', () => callback())
});
