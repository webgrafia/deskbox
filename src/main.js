const { app, BrowserWindow, Tray, Menu, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');

// Standard Chrome Linux User-Agent (strips all Electron / Deskbox identifiers)
const CLEAN_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Allow cross-site storage / third party cookies between Google accounts and Gmail
app.commandLine.appendSwitch('disable-features', 'ThirdPartyStoragePartitioning,ThirdPartyCookieDeprecation');

// Set global fallback user agent BEFORE app is ready
app.userAgentFallback = CLEAN_USER_AGENT;

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Ensure single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function loadServicesConfig() {
  const configPath = path.join(__dirname, '..', 'services.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading services.json:', err);
    return [];
  }
}

function configureSession(ses) {
  ses.setUserAgent(CLEAN_USER_AGENT);

  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['notifications', 'media', 'audioCapture', 'mediaKeySystem', 'clipboard-read', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
  });

  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = CLEAN_USER_AGENT;
    if (details.requestHeaders['sec-ch-ua']) {
      details.requestHeaders['sec-ch-ua'] = '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"';
    }
    if (details.requestHeaders['sec-ch-ua-mobile']) {
      details.requestHeaders['sec-ch-ua-mobile'] = '?0';
    }
    if (details.requestHeaders['sec-ch-ua-platform']) {
      details.requestHeaders['sec-ch-ua-platform'] = '"Linux"';
    }
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 800,
    minHeight: 600,
    title: 'Deskbox',
    icon: path.join(__dirname, 'ui', 'assets', 'icon.png'),
    backgroundColor: '#0b0f19',
    autoHideMenuBar: true,
    webPreferences: {
      webviewTag: true,
      preload: path.join(__dirname, 'preload-ui.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'ui', 'index.html'));

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  const trayIconPath = path.join(__dirname, 'ui', 'assets', 'tray-icon.png');
  tray = new Tray(trayIconPath);
  tray.setToolTip('Deskbox');

  const updateTrayMenu = (totalBadge = 0) => {
    const services = loadServicesConfig();
    const serviceMenuItems = services.map((s, index) => ({
      label: s.name,
      click: () => {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('switch-service', index);
      }
    }));

    const contextMenu = Menu.buildFromTemplate([
      {
        label: totalBadge > 0 ? `Deskbox (${totalBadge} non letti)` : 'Deskbox',
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Mostra finestra',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        }
      },
      {
        label: 'Sincronizza sessione Google (da Firefox)',
        click: async () => {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('trigger-sync-google');
        }
      },
      {
        label: 'Svuota Cookie e Cache',
        click: async () => {
          const sharedSession = session.fromPartition('persist:shared');
          await sharedSession.clearStorageData();
          mainWindow.webContents.send('cache-cleared');
        }
      },
      { type: 'separator' },
      ...serviceMenuItems,
      { type: 'separator' },
      {
        label: 'Esci da Deskbox',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
  };

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  updateTrayMenu(0);
  return updateTrayMenu;
}

let updateTrayBadgeRef = null;

app.whenReady().then(() => {
  configureSession(session.defaultSession);
  configureSession(session.fromPartition('persist:shared'));

  createMainWindow();
  updateTrayBadgeRef = createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

// IPC Handlers
ipcMain.handle('get-services', () => {
  const services = loadServicesConfig();
  const preloadServicePath = path.join(__dirname, 'preload-service.js');
  return {
    services,
    preloadServicePath,
    userAgent: CLEAN_USER_AGENT
  };
});

ipcMain.on('open-external', (_event, url) => {
  if (url) {
    shell.openExternal(url);
  }
});

ipcMain.on('update-total-badge', (_event, total) => {
  if (app.setBadgeCount) {
    app.setBadgeCount(total);
  }
  if (updateTrayBadgeRef) {
    updateTrayBadgeRef(total);
  }
  if (tray) {
    tray.setToolTip(total > 0 ? `Deskbox - ${total} messaggi non letti` : 'Deskbox');
  }
});

// Clear cache & cookies
ipcMain.handle('clear-cache-cookies', async () => {
  try {
    const sharedSession = session.fromPartition('persist:shared');
    await sharedSession.clearStorageData();
    return { success: true };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// Open Firefox to Google Sign In
ipcMain.handle('open-firefox-google', () => {
  return new Promise((resolve) => {
    const proc = spawn('firefox', ['https://accounts.google.com/ServiceLogin?service=mail']);
    proc.on('error', (err) => {
      resolve({ success: false, message: `Errore avvio Firefox: ${err.message}` });
    });
    resolve({ success: true });
  });
});

// Sync Google cookies from Firefox
ipcMain.handle('sync-google-cookies', async () => {
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'sync_firefox_cookies.py');
    execFile(scriptPath, [], { maxBuffer: 10 * 1024 * 1024 }, async (err, stdout, stderr) => {
      if (err) {
        return resolve({ success: false, message: `Errore script sync: ${err.message}` });
      }
      try {
        const cookies = JSON.parse(stdout);
        const authCookies = cookies.filter(c => ['SID', 'SSID', 'HSID', 'SAPISID'].includes(c.name));

        if (authCookies.length === 0) {
          return resolve({
            success: false,
            message: 'Nessun account Google trovato in Firefox. Apri Firefox, accedi al tuo account Google e riprova.'
          });
        }

        const sharedSession = session.fromPartition('persist:shared');
        let imported = 0;
        for (const c of cookies) {
          try {
            await sharedSession.cookies.set(c);
            imported++;
          } catch (e) {
            // Ignore minor cookies
          }
        }

        resolve({ success: true, count: imported, authCount: authCookies.length });
      } catch (parseErr) {
        resolve({ success: false, message: `Errore parsing cookies: ${parseErr.message}` });
      }
    });
  });
});
