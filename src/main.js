const { app, BrowserWindow, Tray, Menu, ipcMain, shell, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile, spawn } = require('child_process');

// Ensure standard app name and userData directory across executions
app.setName('deskbox');
app.setPath('userData', path.join(app.getPath('appData'), 'deskbox'));

// Disable automation flags so Google does not detect automated browser
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');

// Standard Chrome Linux User-Agent
const CLEAN_USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

// Allow cross-site storage and completely disable third-party cookie restrictions
app.commandLine.appendSwitch('disable-features', 'TrackingProtection3pcd,BlockThirdPartyCookies,ThirdPartyStoragePartitioning,ThirdPartyCookieDeprecation');

// Set global fallback user agent BEFORE app is ready
app.userAgentFallback = CLEAN_USER_AGENT;

const GOOGLE_PARTITIONS = [
  'persist:google',
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
  console.log('[Deskbox] Another instance is already running. Quitting.');
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
    console.error('[Config] Error loading default services.json:', err);
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
      console.warn('[Config] Could not initialize user-services.json:', e);
    }
    return defaults;
  }

  try {
    const raw = fs.readFileSync(userConfigPath, 'utf8');
    const userServices = JSON.parse(raw);

    const userIds = new Set(userServices.map(s => s.id));
    let hasChanges = false;
    for (const d of defaults) {
      if (!userIds.has(d.id)) {
        userServices.push(d);
        hasChanges = true;
      }
    }

    // Unify all Google services to the shared 'persist:google' partition
    // so Gmail, Calendar, Antigravity, and Messages share rolling Google session tokens seamlessly
    const googleServiceIds = ['gmail', 'calendar', 'antigravity', 'messages'];
    for (const s of userServices) {
      if (googleServiceIds.includes(s.id) && s.partition !== 'persist:google') {
        s.partition = 'persist:google';
        hasChanges = true;
      }
    }

    if (hasChanges) {
      try {
        fs.writeFileSync(userConfigPath, JSON.stringify(userServices, null, 2), 'utf8');
      } catch (e) {
        console.warn('[Config] Could not persist new defaults into user-services.json:', e);
      }
    }
    return userServices;
  } catch (err) {
    console.error('[Config] Error loading user-services.json, falling back to defaults:', err);
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
    console.log('[Config] User services saved successfully.');
    return true;
  } catch (err) {
    console.error('[Config] Error saving user services config:', err);
    return false;
  }
}

function configureSession(ses) {
  ses.setUserAgent(CLEAN_USER_AGENT);

  ses.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowed = ['notifications', 'media', 'audioCapture', 'mediaKeySystem', 'clipboard-read', 'clipboard-sanitized-write'];
    callback(allowed.includes(permission));
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

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    console.log(`[UI] ${message}`);
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
        label: 'Calculator (Ctrl+Alt+C)',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('toggle-calculator');
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
        label: 'Google Account Sign-In',
        click: () => {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send('open-google-login');
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

  updateTrayMenu(0);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  return updateTrayMenu;
}

let updateTrayBadgeRef = null;

async function clearAllPartitions() {
  console.log('[Cleanup] Clearing all storage partitions...');
  const partitions = [
    'persist:google',
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
      console.log(`[Cleanup] Cleared storage for ${part}`);
    } catch (e) {
      console.warn(`[Cleanup] Error clearing ${part}:`, e.message);
    }
  }
}

async function importGoogleCookies() {
  console.log('[Google Auth] Running sync_firefox_cookies.py to gather fresh session...');
  return new Promise((resolve) => {
    const scriptPath = path.join(__dirname, '..', 'scripts', 'sync_firefox_cookies.py');
    execFile(scriptPath, [], { maxBuffer: 10 * 1024 * 1024 }, async (err, stdout, stderr) => {
      if (err) {
        console.error('[Google Auth] Script error:', err.message, stderr);
        return resolve({ success: false, message: `Sync script error: ${err.message}` });
      }
      try {
        const cookies = JSON.parse(stdout);
        const authCookies = cookies.filter(c => ['SID', 'SSID', 'HSID', 'SAPISID'].includes(c.name));
        console.log(`[Google Auth] Gathered ${cookies.length} cookies (${authCookies.length} core auth tokens)`);

        if (authCookies.length === 0) {
          console.warn('[Google Auth] No active Google session found in Firefox.');
          return resolve({
            success: false,
            message: 'No Google account found in Firefox. Please log into Google on Firefox first and try again.'
          });
        }

        // Apply cookies to all isolated Google partitions
        for (const part of GOOGLE_PARTITIONS) {
          const ses = session.fromPartition(part);
          configureSession(ses);
          let count = 0;
          for (const c of cookies) {
            const details = { ...c };
            // RFC 6265bis: __Host- cookies must NOT have a domain attribute
            if (details.name.startsWith('__Host-')) {
              delete details.domain;
              details.path = '/';
              details.secure = true;
            }
            try {
              await ses.cookies.set(details);
              count++;
            } catch (e) {
              // Ignore non-critical set failures
            }
          }
          console.log(`[Google Auth] Wrote ${count}/${cookies.length} cookies to partition ${part}`);
        }

        resolve({ success: true, count: cookies.length, authCount: authCookies.length });
      } catch (parseErr) {
        console.error('[Google Auth] Parse error:', parseErr.message);
        resolve({ success: false, message: `Error parsing cookies: ${parseErr.message}` });
      }
    });
  });
}

async function checkAndAutoSyncCookies() {
  try {
    const googleSes = session.fromPartition('persist:google');
    const existing = await googleSes.cookies.get({ domain: 'google.com' });
    console.log(`[Startup] Existing Google cookies in persist:google: ${existing.length}`);
    if (existing.length < 5) {
      console.log('[Startup] No Google cookies detected in partition. Attempting automatic seed from Firefox...');
      const res = await importGoogleCookies();
      if (res.success) {
        console.log(`[Startup] Auto-seeded ${res.count} Google cookies successfully.`);
      } else {
        console.log(`[Startup] Auto-seed skipped: ${res.message}`);
      }
    }
  } catch (err) {
    console.warn('[Startup] Auto-sync check warning:', err.message);
  }
}

function unwrapUrl(targetUrl) {
  if (!targetUrl) return '';
  try {
    const parsed = new URL(targetUrl);
    // Unwrap Google redirect URLs (e.g. https://www.google.com/url?q=https://...)
    if ((parsed.hostname === 'www.google.com' || parsed.hostname === 'google.com' || parsed.hostname.endsWith('.google.com') || parsed.hostname.endsWith('.google.it')) && parsed.pathname === '/url') {
      const q = parsed.searchParams.get('q') || parsed.searchParams.get('url');
      if (q) return q;
    }
  } catch (e) {}
  return targetUrl;
}

function isExternalUrl(targetUrl) {
  if (!targetUrl) return false;
  try {
    const parsed = new URL(targetUrl);

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    // Google redirect wrapper is ALWAYS external
    if ((parsed.hostname === 'www.google.com' || parsed.hostname === 'google.com' || parsed.hostname.endsWith('.google.com') || parsed.hostname.endsWith('.google.it')) && parsed.pathname === '/url') {
      return true;
    }

    const host = parsed.hostname.toLowerCase();

    // Internal service hosts
    const internalHosts = [
      'mail.google.com',
      'calendar.google.com',
      'accounts.google.com',
      'messages.google.com',
      'antigravity.google.com',
      'myaccount.google.com',
      'web.whatsapp.com',
      'web.telegram.org'
    ];

    if (internalHosts.some(h => host === h || host.endsWith('.' + h))) {
      return false;
    }

    if (host.endsWith('whatsapp.com') || host.endsWith('whatsapp.net')) {
      return false;
    }

    if (host.endsWith('telegram.org')) {
      return false;
    }

    // Everything else (links in emails, websites, articles, docs) is external
    return true;
  } catch (e) {
    return false;
  }
}

app.whenReady().then(async () => {
  console.log(`[Deskbox] Application ready. UserData path: ${app.getPath('userData')}`);

  // Global shortcut handler for all webContents (main window + all service webviews)
  app.on('web-contents-created', (_event, contents) => {
    contents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;

      if (input.key === 'Escape') {
        mainWindow?.webContents.send('close-modals');
        return;
      }

      if ((input.control || input.meta) && input.alt && input.key.toLowerCase() === 'c') {
        event.preventDefault();
        mainWindow?.webContents.send('toggle-calculator');
        return;
      }

      if (input.control || input.meta) {
        let num = NaN;
        if (input.code && input.code.startsWith('Digit')) {
          num = parseInt(input.code.slice(5), 10);
        } else if (input.code && input.code.startsWith('Numpad')) {
          num = parseInt(input.code.slice(6), 10);
        } else {
          num = parseInt(input.key, 10);
        }

        if (!isNaN(num) && num >= 1 && num <= 9) {
          event.preventDefault();
          mainWindow?.webContents.send('switch-service', num - 1);
          return;
        }

        const key = input.key.toLowerCase();
        if (key === 'r') {
          event.preventDefault();
          mainWindow?.webContents.send('reload-active-service');
        } else if (key === ',') {
          event.preventDefault();
          mainWindow?.webContents.send('open-settings');
        } else if (key === 'g') {
          event.preventDefault();
          mainWindow?.webContents.send('open-google-login');
        }
      } else if (input.key === 'F5') {
        event.preventDefault();
        mainWindow?.webContents.send('reload-active-service');
      }
    });

    // Handle link clicks from all guest service webviews
    // Intercept window.open / <a target="_blank"> and open in default browser
    contents.setWindowOpenHandler(({ url }) => {
      const cleanUrl = unwrapUrl(url);
      if (isExternalUrl(cleanUrl)) {
        console.log('[Link Handler] setWindowOpenHandler opening external link:', cleanUrl);
        shell.openExternal(cleanUrl);
        return { action: 'deny' };
      }
      return { action: 'allow' };
    });

    // Intercept in-page navigations to external sites (e.g. clicked email links)
    contents.on('will-navigate', (event, url) => {
      const cleanUrl = unwrapUrl(url);
      if (isExternalUrl(cleanUrl)) {
        event.preventDefault();
        console.log('[Link Handler] will-navigate opening external link:', cleanUrl);
        shell.openExternal(cleanUrl);
      }
    });
  });

  app.on('session-created', (ses) => {
    configureSession(ses);
  });

  configureSession(session.defaultSession);
  for (const part of GOOGLE_PARTITIONS) {
    configureSession(session.fromPartition(part));
  }

  // Ensure cookies are seeded if missing
  await checkAndAutoSyncCookies();

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

ipcMain.on('open-external', (_event, rawUrl) => {
  if (rawUrl) {
    const url = unwrapUrl(rawUrl);
    console.log('[External Link] Opening in default browser:', url);
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
    // Automatically re-seed fresh cookies from Firefox right away
    const syncRes = await importGoogleCookies();
    return { success: true, reseeded: syncRes.success };
  } catch (err) {
    return { success: false, message: err.message };
  }
});

// Open Firefox to Google Sign In
ipcMain.handle('open-firefox-google', () => {
  return new Promise((resolve) => {
    console.log('[Google Auth] Launching Firefox on Google account...');
    const proc = spawn('firefox', ['https://accounts.google.com/']);
    proc.on('error', (err) => {
      console.error('[Google Auth] Failed to launch Firefox:', err.message);
      resolve({ success: false, message: `Could not launch Firefox: ${err.message}` });
    });
    resolve({ success: true });
  });
});

// Sync Google cookies from Firefox
ipcMain.handle('sync-google-cookies', async () => {
  return await importGoogleCookies();
});
