const { app, BrowserWindow, Tray, Menu, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');

// Disable automation flags so Google does not detect automated browser
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Standard Chrome Linux User-Agent
const CLEAN_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Allow cross-site storage / third-party cookies for Google authentication
app.commandLine.appendSwitch('disable-features', 'ThirdPartyStoragePartitioning,ThirdPartyCookieDeprecation');

// Set global fallback user agent BEFORE app is ready
app.userAgentFallback = CLEAN_USER_AGENT;

const GOOGLE_PARTITIONS = [
  'persist:service_gmail',
  'persist:service_calendar',
  'persist:service_antigravity',
  'persist:service_messages',
  'persist:shared'
];

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

function getDefaultServices() {
  const defaultPath = path.join(__dirname, '..', 'services.json');
  try {
    const raw = fs.readFileSync(defaultPath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error loading default services.json:', err);
    return [];
  }
}

function getUserConfigPath() {
  return path.join(app.getPath('userData'), 'user-services.json');
}

function loadServicesConfig() {
  const userConfigPath = getUserConfigPath();
  const defaults = getDefaultServices();

  if (!fs.existsSync(userConfigPath)) {
    try {
      fs.writeFileSync(userConfigPath, JSON.stringify(defaults, null, 2), 'utf8');
    } catch (e) {
      console.warn('Could not initialize user-services.json:', e);
    }
    return defaults;
  }

  try {
    const raw = fs.readFileSync(userConfigPath, 'utf8');
    const userServices = JSON.parse(raw);

    // Ensure any new default services are added if missing
    const userIds = new Set(userServices.map(s => s.id));
    let hasChanges = false;
    for (const d of defaults) {
      if (!userIds.has(d.id)) {
        userServices.push(d);
        hasChanges = true;
      }
    }

    // Upgrade partition isolation and legacy URLs
    for (const s of userServices) {
      if (!s.partition || s.partition === 'persist:shared') {
        s.partition = `persist:service_${s.id}`;
        hasChanges = true;
      }
      if (s.id === 'calendar' && s.url === 'https://calendar.google.com/') {
        s.url = 'https://calendar.google.com/calendar/u/0/r';
        hasChanges = true;
      }
    }

    if (hasChanges) {
      fs.writeFileSync(userConfigPath, JSON.stringify(userServices, null, 2), 'utf8');
    }
    return userServices;
  } catch (err) {
    console.error('Error loading user-services.json, falling back to defaults:', err);
    return defaults;
  }
}

function saveServicesConfig(services) {
  const userConfigPath = getUserConfigPath();
  try {
    fs.writeFileSync(userConfigPath, JSON.stringify(services, null, 2), 'utf8');
    if (updateTrayBadgeRef) {
      updateTrayBadgeRef();
    }
    return true;
  } catch (err) {
    console.error('Error saving user services config:', err);
    return false;
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
    const services = loadServicesConfig().filter(s => s.enabled !== false);
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
        label: totalBadge > 0 ? `Deskbox (${totalBadge} unread)` : 'Deskbox',
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Show Window',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
        }
      },
      {
        label: 'Settings / Manage Services',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('open-settings');
        }
      },
      {
        label: 'Sync Google Session (via Firefox)',
        click: async () => {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('trigger-sync-google');
        }
      },
      {
        label: 'Clear Cache & Cookies',
        click: async () => {
          await clearAllPartitions();
          mainWindow.webContents.send('cache-cleared');
        }
      },
      { type: 'separator' },
      ...serviceMenuItems,
      { type: 'separator' },
      {
        label: 'Quit Deskbox',
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

async function clearAllPartitions() {
  const partitions = [
    'persist:service_gmail',
    'persist:service_calendar',
    'persist:service_antigravity',
    'persist:service_messages',
    'persist:service_whatsapp',
    'persist:service_telegram',
    'persist:shared'
  ];
  for (const part of partitions) {
    try {
      await session.fromPartition(part).clearStorageData();
    } catch (e) {}
  }
}

app.whenReady().then(() => {
  // Automatically configure any session / partition created
  app.on('session-created', (ses) => {
    configureSession(ses);
  });

  configureSession(session.defaultSession);
  for (const part of GOOGLE_PARTITIONS) {
    configureSession(session.fromPartition(part));
  }

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

ipcMain.handle('save-services', (_event, updatedServices) => {
  const success = saveServicesConfig(updatedServices);
  return { success };
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
    tray.setToolTip(total > 0 ? `Deskbox - ${total} unread messages` : 'Deskbox');
  }
});

// Clear cache & cookies
ipcMain.handle('clear-cache-cookies', async () => {
  try {
    await clearAllPartitions();
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
      resolve({ success: false, message: `Could not launch Firefox: ${err.message}` });
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
        return resolve({ success: false, message: `Sync script error: ${err.message}` });
      }
      try {
        const cookies = JSON.parse(stdout);
        const authCookies = cookies.filter(c => ['SID', 'SSID', 'HSID', 'SAPISID'].includes(c.name));

        if (authCookies.length === 0) {
          return resolve({
            success: false,
            message: 'No Google account found in Firefox. Please log into Google on Firefox first and try again.'
          });
        }

        // Apply cookies to all isolated Google partitions so each service has its own clean session
        let totalImported = 0;
        for (const part of GOOGLE_PARTITIONS) {
          const ses = session.fromPartition(part);
          configureSession(ses);
          for (const c of cookies) {
            try {
              await ses.cookies.set(c);
              totalImported++;
            } catch (e) {
              // Ignore minor cookie domain mismatches
            }
          }
        }

        resolve({ success: true, count: cookies.length, authCount: authCookies.length });
      } catch (parseErr) {
        resolve({ success: false, message: `Error parsing cookies: ${parseErr.message}` });
      }
    });
  });
});
