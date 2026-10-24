const { app, session, BrowserWindow } = require('electron');
const path = require('path');
const { execFileSync } = require('child_process');

app.setName('deskbox');
app.setPath('userData', path.join(app.getPath('appData'), 'deskbox'));

const CLEAN_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
app.userAgentFallback = CLEAN_UA;

app.whenReady().then(async () => {
  const p = 'persist:test_unified_google';
  const ses = session.fromPartition(p);
  ses.setUserAgent(CLEAN_UA);

  // 1. Import fresh cookies
  const stdout = execFileSync('/home/marco/deskbox/scripts/sync_firefox_cookies.py').toString();
  const cookies = JSON.parse(stdout);

  for (const c of cookies) {
    const details = { ...c };
    if (details.name.startsWith('__Host-')) {
      delete details.domain;
      details.path = '/';
      details.secure = true;
    }
    try {
      await ses.cookies.set(details);
    } catch (e) {}
  }

  // 2. Load Gmail
  const winG = new BrowserWindow({ show: false, webPreferences: { partition: p } });
  await winG.loadURL('https://mail.google.com/mail/u/0/');

  // 3. Load Calendar in the SAME partition
  const winC = new BrowserWindow({ show: false, webPreferences: { partition: p } });
  await winC.loadURL('https://calendar.google.com/calendar/u/0/r');

  await new Promise(r => setTimeout(r, 6000));

  const gInfo = await winG.webContents.executeJavaScript(`({
    url: window.location.href,
    title: document.title,
    cookieProblem: document.body.innerText.includes('impostazioni dei cookie')
  })`);

  const cInfo = await winC.webContents.executeJavaScript(`({
    url: window.location.href,
    title: document.title,
    cookieProblem: document.body.innerText.includes('impostazioni dei cookie')
  })`);

  console.log('UNIFIED PARTITION TEST:');
  console.log('GMAIL:', gInfo);
  console.log('CALENDAR:', cInfo);

  app.quit();
});
