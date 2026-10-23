const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { app } = require('electron');

function findChromePath() {
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return c;
    }
  }
  return 'google-chrome';
}

function waitForCDP(port, maxAttempts = 20) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          clearInterval(interval);
          try {
            const data = JSON.parse(raw);
            resolve(data.webSocketDebuggerUrl);
          } catch (e) {
            reject(e);
          }
        });
      }).on('error', () => {
        if (attempts >= maxAttempts) {
          clearInterval(interval);
          reject(new Error('Timeout in attesa di Google Chrome'));
        }
      });
    }, 500);
  });
}

async function transferCookiesToElectron(cookies, electronSession) {
  let count = 0;
  for (const cookie of cookies) {
    // Only import Google and related auth cookies
    if (!cookie.domain.includes('google')) continue;

    const domain = cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain;
    const protocol = cookie.secure ? 'https' : 'http';
    const cookieUrl = `${protocol}://${domain}${cookie.path || '/'}`;

    const details = {
      url: cookieUrl,
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path || '/',
      secure: cookie.secure,
      httpOnly: cookie.httpOnly
    };

    if (cookie.expires && cookie.expires > 0) {
      details.expirationDate = cookie.expires;
    }

    if (cookie.sameSite) {
      const sameSiteLower = cookie.sameSite.toLowerCase();
      if (['strict', 'lax', 'no_restriction'].includes(sameSiteLower)) {
        details.sameSite = sameSiteLower;
      }
    }

    try {
      await electronSession.cookies.set(details);
      count++;
    } catch (err) {
      console.warn(`[Cookie Sync] Errore cookie ${cookie.name}:`, err.message);
    }
  }
  return count;
}

function startGoogleLogin(electronSession) {
  return new Promise(async (resolve, reject) => {
    const chromePath = findChromePath();
    const port = 9234;
    const profileDir = path.join(app.getPath('userData'), 'chrome-google-login-profile');

    console.log(`[Google Login Bridge] Avvio di ${chromePath} con profilo: ${profileDir}`);

    const args = [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--app=https://accounts.google.com/ServiceLogin?service=mail&continue=https://mail.google.com/mail/'
    ];

    const chromeProcess = spawn(chromePath, args);
    let resolved = false;
    let ws = null;
    let pollTimer = null;

    const cleanup = () => {
      if (pollTimer) clearInterval(pollTimer);
      if (ws) {
        try { ws.close(); } catch (e) {}
      }
      try {
        chromeProcess.kill();
      } catch (e) {}
    };

    chromeProcess.on('exit', (code) => {
      console.log(`[Google Login Bridge] Finestra Chrome chiusa (codice: ${code})`);
      cleanup();
      if (!resolved) {
        resolve({ success: false, message: 'Finestra di accesso chiusa prima del completamento.' });
      }
    });

    try {
      const wsUrl = await waitForCDP(port);
      console.log('[Google Login Bridge] Connesso a Chrome DevTools:', wsUrl);

      ws = new WebSocket(wsUrl);

      ws.on('open', () => {
        let msgId = 1;

        // Poll cookies every 1.5 seconds
        pollTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ id: msgId++, method: 'Storage.getCookies' }));
          }
        }, 1500);
      });

      ws.on('message', async (data) => {
        try {
          const resp = JSON.parse(data.toString());
          if (resp.result && resp.result.cookies) {
            const cookies = resp.result.cookies;
            const hasAuthCookie = cookies.some(c =>
              (c.name === 'SID' || c.name === '__Secure-1PSID' || c.name === '__Secure-3PSID' || c.name === 'SSID') &&
              c.domain.includes('google.com')
            );

            if (hasAuthCookie && !resolved) {
              console.log('[Google Login Bridge] Cookie di autenticazione Google rilevati!');
              resolved = true;
              const transferred = await transferCookiesToElectron(cookies, electronSession);
              console.log(`[Google Login Bridge] ${transferred} cookie Google sincronizzati in Deskbox!`);
              cleanup();
              resolve({ success: true, count: transferred });
            }
          }
        } catch (e) {
          console.error('[Google Login Bridge] Errore elaborazione risposta CDP:', e);
        }
      });

      ws.on('error', (err) => {
        console.error('[Google Login Bridge] Errore WebSocket:', err);
      });

    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

module.exports = {
  startGoogleLogin
};
