let allServices = [];
let enabledServices = [];
let activeServiceId = null;
const badgeCounts = {};
let preloadServicePath = '';
let userAgent = '';

// DOM Elements
const serviceListEl = document.getElementById('service-list');
const webviewContainerEl = document.getElementById('webview-container');
const btnReload = document.getElementById('btn-reload');
const btnGoogleLogin = document.getElementById('btn-google-login');
const btnSettings = document.getElementById('btn-settings');
const toastEl = document.getElementById('toast');

// Google Login Modal Elements
const modalGoogle = document.getElementById('modal-google');
const modalClose = document.getElementById('modal-close');
const btnOpenFirefox = document.getElementById('btn-open-firefox');
const btnSyncSession = document.getElementById('btn-sync-session');
const btnClearCache = document.getElementById('btn-clear-cache');

// Settings Modal Elements
const modalSettings = document.getElementById('modal-settings');
const settingsClose = document.getElementById('settings-close');
const settingsServicesList = document.getElementById('settings-services-list');
const btnCancelSettings = document.getElementById('btn-cancel-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnAddService = document.getElementById('btn-add-service');
const inputNewName = document.getElementById('new-service-name');
const inputNewUrl = document.getElementById('new-service-url');

// Calculator Flyout Elements
const btnCalc = document.getElementById('btn-calc');
const flyoutCalc = document.getElementById('flyout-calc');
const calcBtnClose = document.getElementById('calc-btn-close');
const calcBtnHistory = document.getElementById('calc-btn-history');
const calcHistoryPanel = document.getElementById('calc-history-panel');
const calcHistoryList = document.getElementById('calc-history-list');
const calcBtnClearHistory = document.getElementById('calc-btn-clear-history');
const calcExpr = document.getElementById('calc-expr');
const calcDisplay = document.getElementById('calc-display');
const calcBtnCopy = document.getElementById('calc-btn-copy');

// Calculator In-Memory State (session life)
let calcCurrent = '0';
let calcPrev = null;
let calcOp = null;
let calcResetOnNext = false;
let calcHistory = [];

let toastTimer = null;
function showToast(message, duration = 4000) {
  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add('show');
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

function openModal(el) {
  el.classList.add('open');
}

function closeModal(el) {
  el.classList.remove('open');
}

function isAuthOrInternalUrl(serviceUrl, targetUrl) {
  try {
    const target = new URL(targetUrl);
    const service = new URL(serviceUrl);

    // Google redirect tracker (google.com/url?q=...) is ALWAYS external!
    if ((target.hostname === 'www.google.com' || target.hostname === 'google.com' || target.hostname.endsWith('.google.com') || target.hostname.endsWith('.google.it')) && target.pathname === '/url') {
      return false;
    }

    // Exact hostname match or subdomain
    if (target.hostname === service.hostname || target.hostname.endsWith('.' + service.hostname)) {
      return true;
    }

    // Google Accounts & authentication endpoints
    const authHosts = ['accounts.google.com', 'myaccount.google.com'];
    if (authHosts.includes(target.hostname)) {
      return true;
    }

    return false;
  } catch (err) {
    return false;
  }
}

async function init() {
  const config = await window.deskboxAPI.getServices();
  allServices = config.services || [];
  preloadServicePath = config.preloadServicePath;
  userAgent = config.userAgent;

  renderServices();

  // Reload active service
  btnReload.addEventListener('click', () => reloadActiveService(false));
  btnReload.addEventListener('dblclick', () => reloadActiveService(true));
  btnReload.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    reloadActiveService(true);
  });

  // Google Login Modal Handlers
  btnGoogleLogin.addEventListener('click', () => openModal(modalGoogle));
  modalClose.addEventListener('click', () => closeModal(modalGoogle));
  modalGoogle.addEventListener('click', (e) => {
    if (e.target === modalGoogle) closeModal(modalGoogle);
  });
  btnOpenFirefox.addEventListener('click', handleOpenFirefox);
  btnSyncSession.addEventListener('click', handleSyncSession);
  btnClearCache.addEventListener('click', handleClearCache);

  // Calculator Handlers
  btnCalc.addEventListener('click', toggleCalculator);
  calcBtnClose.addEventListener('click', closeCalculator);
  calcBtnHistory.addEventListener('click', toggleCalcHistory);
  calcBtnClearHistory.addEventListener('click', clearCalcHistory);
  calcBtnCopy.addEventListener('click', copyCalcResult);

  document.querySelectorAll('.calc-key').forEach(btn => {
    btn.addEventListener('click', () => {
      handleCalcAction(btn.dataset.action, btn.dataset.val);
    });
  });

  // Settings Modal Handlers
  btnSettings.addEventListener('click', openSettings);
  settingsClose.addEventListener('click', () => closeModal(modalSettings));
  btnCancelSettings.addEventListener('click', () => closeModal(modalSettings));
  modalSettings.addEventListener('click', (e) => {
    if (e.target === modalSettings) closeModal(modalSettings);
  });
  btnSaveSettings.addEventListener('click', handleSaveSettings);
  btnAddService.addEventListener('click', handleAddCustomService);

  // IPC Event Listeners (Tray & Global Shortcuts)
  window.deskboxAPI.onTriggerSyncGoogle?.(() => openModal(modalGoogle));
  window.deskboxAPI.onOpenGoogleLogin?.(() => openModal(modalGoogle));
  window.deskboxAPI.onOpenSettings?.(() => openSettings());
  window.deskboxAPI.onReloadActiveService?.(() => reloadActiveService());
  window.deskboxAPI.onToggleCalculator?.(() => toggleCalculator());
  window.deskboxAPI.onCloseModals?.(() => {
    closeModal(modalGoogle);
    closeModal(modalSettings);
    closeCalculator();
  });
  window.deskboxAPI.onCacheCleared?.(() => {
    showToast('Cache and cookies cleared.');
    reloadAllServices();
  });
  window.deskboxAPI.onSwitchService?.((index) => {
    if (enabledServices[index]) {
      switchService(enabledServices[index].id);
    }
  });

  // Window-level Keyboard Shortcuts fallback
  window.addEventListener('keydown', (e) => {
    // If Calculator flyout is open, intercept keyboard calculator typing
    if (flyoutCalc && flyoutCalc.classList.contains('open')) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeCalculator();
        return;
      }
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleCalcAction('num', e.key);
        return;
      }
      if (e.key === '.' || e.key === ',') {
        e.preventDefault();
        handleCalcAction('dot');
        return;
      }
      if (e.key === '+' || e.key === '-') {
        e.preventDefault();
        handleCalcAction('op', e.key);
        return;
      }
      if (e.key === '*' || e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        handleCalcAction('op', '*');
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        handleCalcAction('op', '/');
        return;
      }
      if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleCalcAction('equals');
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        if (calcCurrent.length > 1 && !calcResetOnNext && calcCurrent !== 'Error') {
          calcCurrent = calcCurrent.slice(0, -1);
        } else {
          calcCurrent = '0';
        }
        updateCalcDisplay();
        return;
      }
    }

    if (e.key === 'Escape') {
      if (modalGoogle.classList.contains('open')) closeModal(modalGoogle);
      if (modalSettings.classList.contains('open')) closeModal(modalSettings);
      closeCalculator();
    }

    if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      toggleCalculator();
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      let num = NaN;
      if (e.code && e.code.startsWith('Digit')) {
        num = parseInt(e.code.slice(5), 10);
      } else if (e.code && e.code.startsWith('Numpad')) {
        num = parseInt(e.code.slice(6), 10);
      } else {
        num = parseInt(e.key, 10);
      }

      if (!isNaN(num) && num >= 1 && num <= enabledServices.length) {
        e.preventDefault();
        switchService(enabledServices[num - 1].id);
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        reloadActiveService();
      } else if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        openModal(modalGoogle);
      } else if (e.key === ',') {
        e.preventDefault();
        openSettings();
      }
    }
  });
}

function renderServices() {
  enabledServices = allServices.filter(s => s.enabled !== false);
  serviceListEl.innerHTML = '';

  // Remember current active if possible, or pick first enabled
  let nextActiveId = activeServiceId;
  if (!enabledServices.some(s => s.id === nextActiveId)) {
    nextActiveId = enabledServices.length > 0 ? enabledServices[0].id : null;
  }

  enabledServices.forEach((service, index) => {
    if (!(service.id in badgeCounts)) {
      badgeCounts[service.id] = 0;
    }

    // 1. Sidebar Button
    const btn = document.createElement('div');
    btn.className = `service-item ${service.id === nextActiveId ? 'active' : ''}`;
    btn.id = `btn-${service.id}`;
    btn.title = `${service.name} (Ctrl+${index + 1})`;

    const iconImg = document.createElement('img');
    iconImg.className = 'service-icon';
    iconImg.src = service.faviconUrl || service.icon || 'assets/icon.svg';
    iconImg.alt = service.name;
    iconImg.onerror = () => {
      iconImg.src = service.icon || 'assets/icon.svg';
    };

    const badge = document.createElement('div');
    badge.className = `badge ${badgeCounts[service.id] > 0 ? 'visible' : ''}`;
    badge.id = `badge-${service.id}`;
    badge.textContent = badgeCounts[service.id] > 99 ? '99+' : badgeCounts[service.id];

    btn.appendChild(iconImg);
    btn.appendChild(badge);
    btn.addEventListener('click', () => switchService(service.id));
    serviceListEl.appendChild(btn);

    // 2. Webview (create if doesn't exist yet)
    let webview = document.getElementById(`view-${service.id}`);
    if (!webview) {
      webview = document.createElement('webview');
      webview.id = `view-${service.id}`;
      webview.className = service.id === nextActiveId ? 'active' : '';

      webview.setAttribute('partition', service.partition || 'persist:shared');
      if (userAgent) {
        webview.setAttribute('useragent', userAgent);
      }
      webview.setAttribute('allowpopups', 'true');
      webview.setAttribute('webpreferences', 'contextIsolation=true, allowRunningInsecureContent=false');
      webview.setAttribute('preload', `file://${preloadServicePath}`);
      webview.setAttribute('src', service.url);

      webview.addEventListener('ipc-message', (event) => {
        if (event.channel === 'unread-count') {
          const count = event.args[0]?.count || 0;
          updateServiceBadge(service.id, count);
        }
      });

      // Live Favicon extraction directly from the loaded service
      webview.addEventListener('page-favicon-updated', (e) => {
        if (e.favicons && e.favicons.length > 0) {
          const favUrl = e.favicons[e.favicons.length - 1];
          if (favUrl) {
            const btnIcon = document.querySelector(`#btn-${service.id} .service-icon`);
            if (btnIcon && btnIcon.src !== favUrl) {
              console.log(`[Favicon:${service.name}] Live icon updated: ${favUrl}`);
              btnIcon.src = favUrl;
              service.faviconUrl = favUrl;
            }
          }
        }
      });

      // Navigation & Event Logging
      webview.addEventListener('did-start-loading', () => {
        console.log(`[NAV:${service.name}] Started loading: ${service.url}`);
      });

      webview.addEventListener('did-navigate', (e) => {
        console.log(`[NAV:${service.name}] Navigated to: ${e.url}`);
      });

      webview.addEventListener('did-fail-load', (e) => {
        console.error(`[FAIL:${service.name}] Load failed (${e.errorCode}): ${e.errorDescription} for ${e.validatedURL}`);
      });

      webview.addEventListener('dom-ready', () => {
        webview.executeJavaScript('({ title: document.title, url: window.location.href, isCookieWarning: (document.body.innerText.includes("cookie") || document.body.innerText.includes("Cookie")) && document.body.innerText.includes("problema") })').then(async (info) => {
          if (info.isCookieWarning) {
            console.warn(`[DOM:${service.name}] Cookie warning detected! Title: "${info.title}" @ ${info.url}`);
            showToast(`Auto-recovering session for ${service.name}...`, 4000);
            const syncRes = await window.deskboxAPI.syncGoogleCookies();
            if (syncRes && syncRes.success) {
              console.log(`[DOM:${service.name}] Auto-sync succeeded, resetting to canonical URL: ${service.url}`);
              webview.loadURL(service.url);
            }
          } else {
            console.log(`[DOM:${service.name}] Ready: "${info.title}" @ ${info.url}`);
          }
        }).catch(() => {});
      });

      webview.addEventListener('console-message', (e) => {
        if (e.level >= 2) {
          console.warn(`[CONSOLE:${service.name}] ${e.message}`);
        }
      });

      webview.addEventListener('new-window', (e) => {
        if (e.url && !e.url.startsWith('about:')) {
          e.preventDefault();
          if (isAuthOrInternalUrl(service.url, e.url)) {
            webview.loadURL(e.url);
          } else {
            window.deskboxAPI.openExternal(e.url);
          }
        }
      });

      webviewContainerEl.appendChild(webview);
    } else {
      webview.className = service.id === nextActiveId ? 'active' : '';
    }
  });

  // Remove webviews for disabled services
  const enabledIds = new Set(enabledServices.map(s => s.id));
  document.querySelectorAll('#webview-container webview').forEach((wv) => {
    const id = wv.id.replace('view-', '');
    if (!enabledIds.has(id)) {
      wv.remove();
    }
  });

  activeServiceId = nextActiveId;
  updateTotalBadgeCount();
}

function switchService(id) {
  if (id === activeServiceId) {
    // Clicking the active tab again resets it to home URL (instant recovery without disable/re-enable)
    reloadActiveService(true);
    return;
  }

  document.querySelectorAll('.service-item').forEach(el => el.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-${id}`);
  if (activeBtn) activeBtn.classList.add('active');

  document.querySelectorAll('#webview-container webview').forEach(wv => wv.classList.remove('active'));
  const activeWebview = document.getElementById(`view-${id}`);
  if (activeWebview) {
    activeWebview.classList.add('active');
    activeWebview.focus();
  }

  activeServiceId = id;
}

function reloadActiveService(forceHome = false) {
  if (!activeServiceId) return;
  const activeWebview = document.getElementById(`view-${activeServiceId}`);
  const service = enabledServices.find(s => s.id === activeServiceId);
  if (!activeWebview || !service) return;

  let currentUrl = '';
  try {
    currentUrl = activeWebview.getURL() || '';
  } catch (e) {}

  const isStuckOrError = !currentUrl ||
                         currentUrl.startsWith('about:') ||
                         currentUrl.includes('accounts.google.com') ||
                         currentUrl.includes('ServiceLogin') ||
                         currentUrl.includes('CheckCookie') ||
                         currentUrl.includes('support.google.com') ||
                         currentUrl.includes('answer/61416');

  if (forceHome || isStuckOrError) {
    console.log(`[Reload:${service.name}] Resetting webview to canonical root URL: ${service.url}`);
    activeWebview.loadURL(service.url);
    showToast(`Resetting ${service.name} to home...`, 2000);
  } else {
    console.log(`[Reload:${service.name}] Reloading ignoring cache: ${currentUrl}`);
    activeWebview.reloadIgnoringCache();
    showToast(`Reloaded ${service.name}`, 1500);
  }
}

function reloadAllServices() {
  enabledServices.forEach(service => {
    const wv = document.getElementById(`view-${service.id}`);
    if (wv) {
      console.log(`[ReloadAll] Resetting ${service.name} to canonical root: ${service.url}`);
      wv.loadURL(service.url);
    }
  });
}

function updateServiceBadge(serviceId, count) {
  badgeCounts[serviceId] = count;
  const badgeEl = document.getElementById(`badge-${serviceId}`);
  if (badgeEl) {
    if (count > 0) {
      badgeEl.textContent = count > 99 ? '99+' : count.toString();
      badgeEl.classList.add('visible');
    } else {
      badgeEl.classList.remove('visible');
    }
  }
  updateTotalBadgeCount();
}

function updateTotalBadgeCount() {
  const total = Object.entries(badgeCounts)
    .filter(([id]) => enabledServices.some(s => s.id === id))
    .reduce((acc, [, c]) => acc + c, 0);
  window.deskboxAPI.updateTotalBadge(total);
}

/* Settings Logic */
let tempSettingsServices = [];

function openSettings() {
  tempSettingsServices = JSON.parse(JSON.stringify(allServices));
  renderSettingsList();
  openModal(modalSettings);
}

function renderSettingsList() {
  settingsServicesList.innerHTML = '';

  tempSettingsServices.forEach((service, index) => {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const meta = document.createElement('div');
    meta.className = 'service-meta';

    const iconImg = document.createElement('img');
    iconImg.className = 'service-meta-icon';
    iconImg.src = service.icon || 'assets/icon.svg';
    iconImg.alt = service.name;

    const texts = document.createElement('div');
    texts.className = 'service-texts';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'service-name';
    nameSpan.textContent = service.name;

    const urlSpan = document.createElement('span');
    urlSpan.className = 'service-url';
    urlSpan.textContent = service.url;

    texts.appendChild(nameSpan);
    texts.appendChild(urlSpan);
    meta.appendChild(iconImg);
    meta.appendChild(texts);

    const controls = document.createElement('div');
    controls.className = 'settings-controls';

    // Order buttons
    const orderBtns = document.createElement('div');
    orderBtns.className = 'order-btns';

    const upBtn = document.createElement('button');
    upBtn.className = 'order-btn';
    upBtn.innerHTML = '▲';
    upBtn.title = 'Move Up';
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => moveService(index, -1));

    const downBtn = document.createElement('button');
    downBtn.className = 'order-btn';
    downBtn.innerHTML = '▼';
    downBtn.title = 'Move Down';
    downBtn.disabled = index === tempSettingsServices.length - 1;
    downBtn.addEventListener('click', () => moveService(index, 1));

    orderBtns.appendChild(upBtn);
    orderBtns.appendChild(downBtn);

    // Toggle switch
    const switchLabel = document.createElement('label');
    switchLabel.className = 'switch';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = service.enabled !== false;
    checkbox.addEventListener('change', (e) => {
      service.enabled = e.target.checked;
    });

    const slider = document.createElement('span');
    slider.className = 'slider';

    switchLabel.appendChild(checkbox);
    switchLabel.appendChild(slider);

    controls.appendChild(orderBtns);
    controls.appendChild(switchLabel);

    row.appendChild(meta);
    row.appendChild(controls);

    settingsServicesList.appendChild(row);
  });
}

function moveService(index, delta) {
  const targetIndex = index + delta;
  if (targetIndex < 0 || targetIndex >= tempSettingsServices.length) return;

  const item = tempSettingsServices.splice(index, 1)[0];
  tempSettingsServices.splice(targetIndex, 0, item);
  renderSettingsList();
}

function handleAddCustomService() {
  const name = inputNewName.value.trim();
  const url = inputNewUrl.value.trim();

  if (!name || !url) {
    showToast('Please provide both a name and a valid URL.');
    return;
  }

  const id = 'custom_' + Date.now();
  tempSettingsServices.push({
    id,
    name,
    url,
    icon: 'assets/icon.svg',
    partition: 'persist:shared',
    enabled: true
  });

  inputNewName.value = '';
  inputNewUrl.value = '';
  renderSettingsList();
  showToast(`Added ${name}! Click "Save & Apply" to activate.`);
}

async function handleSaveSettings() {
  allServices = JSON.parse(JSON.stringify(tempSettingsServices));
  await window.deskboxAPI.saveServices(allServices);
  renderServices();
  closeModal(modalSettings);
  showToast('Settings saved and applied successfully!');
}

/* Google Login Actions */
async function handleOpenFirefox() {
  showToast('Opening Firefox on Google Sign-In... Please log in.');
  const res = await window.deskboxAPI.openFirefoxGoogle();
  if (res && !res.success) {
    showToast(res.message);
  }
}

async function handleSyncSession() {
  showToast('Searching and importing Google session cookies from Firefox...');
  const res = await window.deskboxAPI.syncGoogleCookies();
  if (res && res.success) {
    showToast(`Google session synced successfully (${res.count} cookies)! Reloading services...`);
    closeModal(modalGoogle);
    reloadAllServices();
  } else if (res && res.message) {
    showToast(res.message, 6000);
  }
}

async function handleClearCache() {
  if (confirm('Clear all cookies and cache? You will need to re-sync your session.')) {
    showToast('Clearing cache and cookies...');
    const res = await window.deskboxAPI.clearCacheCookies();
    if (res && res.success) {
      showToast('Cache and cookies cleared successfully!');
      reloadAllServices();
    }
  }
}

/* Calculator Logic */
function toggleCalculator() {
  if (flyoutCalc.classList.contains('open')) {
    closeCalculator();
  } else {
    openCalculator();
  }
}

function openCalculator() {
  flyoutCalc.classList.add('open');
  btnCalc.classList.add('active');
  updateCalcDisplay();
}

function closeCalculator() {
  flyoutCalc.classList.remove('open');
  btnCalc.classList.remove('active');
  calcHistoryPanel.classList.remove('show');
}

function formatCalcNumber(num) {
  if (isNaN(num) || !isFinite(num)) return 'Error';
  const rounded = parseFloat(num.toPrecision(12));
  const str = rounded.toString();
  if (str.length > 13) {
    return rounded.toExponential(6);
  }
  return str;
}

function updateCalcDisplay() {
  calcDisplay.textContent = calcCurrent;
  if (calcPrev !== null && calcOp) {
    const opSymbol = calcOp === '*' ? '×' : calcOp === '/' ? '÷' : calcOp === '-' ? '−' : '+';
    calcExpr.textContent = `${calcPrev} ${opSymbol}`;
  } else {
    calcExpr.textContent = '';
  }
}

function handleCalcAction(action, val) {
  if (action === 'num') {
    if (calcResetOnNext || calcCurrent === '0' || calcCurrent === 'Error') {
      calcCurrent = val;
      calcResetOnNext = false;
    } else {
      if (calcCurrent.length < 13) {
        calcCurrent += val;
      }
    }
    updateCalcDisplay();
  } else if (action === 'dot') {
    if (calcResetOnNext || calcCurrent === 'Error') {
      calcCurrent = '0.';
      calcResetOnNext = false;
    } else if (!calcCurrent.includes('.')) {
      calcCurrent += '.';
    }
    updateCalcDisplay();
  } else if (action === 'clear') {
    calcCurrent = '0';
    calcPrev = null;
    calcOp = null;
    calcResetOnNext = false;
    calcExpr.textContent = '';
    updateCalcDisplay();
  } else if (action === 'plusminus') {
    if (calcCurrent !== '0' && calcCurrent !== 'Error') {
      if (calcCurrent.startsWith('-')) {
        calcCurrent = calcCurrent.slice(1);
      } else {
        calcCurrent = '-' + calcCurrent;
      }
      updateCalcDisplay();
    }
  } else if (action === 'percent') {
    const num = parseFloat(calcCurrent);
    if (!isNaN(num)) {
      calcCurrent = formatCalcNumber(num / 100);
      updateCalcDisplay();
    }
  } else if (action === 'op') {
    const num = parseFloat(calcCurrent);
    if (calcPrev !== null && calcOp && !calcResetOnNext) {
      calcExecute();
    } else {
      calcPrev = num;
    }
    calcOp = val;
    calcResetOnNext = true;
    updateCalcDisplay();
  } else if (action === 'equals') {
    if (calcPrev !== null && calcOp) {
      calcExecute(true);
    }
  }
}

function calcExecute(isFinal = false) {
  const prev = calcPrev;
  const curr = parseFloat(calcCurrent);
  if (isNaN(prev) || isNaN(curr)) return;

  let res = 0;
  if (calcOp === '+') res = prev + curr;
  else if (calcOp === '-') res = prev - curr;
  else if (calcOp === '*') res = prev * curr;
  else if (calcOp === '/') {
    if (curr === 0) {
      calcCurrent = 'Error';
      calcPrev = null;
      calcOp = null;
      calcResetOnNext = true;
      updateCalcDisplay();
      return;
    }
    res = prev / curr;
  }

  const opSymbol = calcOp === '*' ? '×' : calcOp === '/' ? '÷' : calcOp === '-' ? '−' : '+';
  const resultStr = formatCalcNumber(res);
  const exprStr = `${prev} ${opSymbol} ${curr} =`;

  if (isFinal) {
    calcExpr.textContent = exprStr;
    addCalcHistory(exprStr, resultStr);
    calcPrev = null;
    calcOp = null;
  } else {
    calcPrev = parseFloat(resultStr);
  }

  calcCurrent = resultStr;
  calcResetOnNext = true;
  calcDisplay.textContent = calcCurrent;
}

function addCalcHistory(expr, result) {
  calcHistory.unshift({ expr, result });
  if (calcHistory.length > 25) calcHistory.pop();
  renderCalcHistory();
}

function renderCalcHistory() {
  if (!calcHistoryList) return;
  if (calcHistory.length === 0) {
    calcHistoryList.innerHTML = '<div class="calc-history-empty">No calculations yet</div>';
    return;
  }
  calcHistoryList.innerHTML = '';
  calcHistory.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'calc-history-item';
    row.innerHTML = `<span class="calc-hist-expr">${item.expr}</span><span class="calc-hist-res">${item.result}</span>`;
    row.addEventListener('click', () => {
      calcCurrent = item.result;
      calcResetOnNext = true;
      updateCalcDisplay();
      calcHistoryPanel.classList.remove('show');
    });
    calcHistoryList.appendChild(row);
  });
}

function clearCalcHistory() {
  calcHistory = [];
  renderCalcHistory();
}

function toggleCalcHistory() {
  calcHistoryPanel.classList.toggle('show');
}

function copyCalcResult() {
  if (calcCurrent && calcCurrent !== 'Error') {
    navigator.clipboard.writeText(calcCurrent).then(() => {
      showToast(`Copied ${calcCurrent} to clipboard!`, 2000);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = calcCurrent;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showToast(`Copied ${calcCurrent} to clipboard!`, 2000);
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
