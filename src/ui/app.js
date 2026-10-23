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

    if (target.hostname === service.hostname || target.hostname.endsWith('.' + service.hostname)) {
      return true;
    }

    const isGoogleService = service.hostname.includes('google.com');
    const isGoogleTarget = target.hostname.includes('google.com') ||
                           target.hostname.includes('googleusercontent.com') ||
                           target.hostname.includes('gstatic.com');
    if (isGoogleService && isGoogleTarget) {
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
  btnReload.addEventListener('click', reloadActiveService);

  // Google Login Modal Handlers
  btnGoogleLogin.addEventListener('click', () => openModal(modalGoogle));
  modalClose.addEventListener('click', () => closeModal(modalGoogle));
  modalGoogle.addEventListener('click', (e) => {
    if (e.target === modalGoogle) closeModal(modalGoogle);
  });
  btnOpenFirefox.addEventListener('click', handleOpenFirefox);
  btnSyncSession.addEventListener('click', handleSyncSession);
  btnClearCache.addEventListener('click', handleClearCache);

  // Settings Modal Handlers
  btnSettings.addEventListener('click', openSettings);
  settingsClose.addEventListener('click', () => closeModal(modalSettings));
  btnCancelSettings.addEventListener('click', () => closeModal(modalSettings));
  modalSettings.addEventListener('click', (e) => {
    if (e.target === modalSettings) closeModal(modalSettings);
  });
  btnSaveSettings.addEventListener('click', handleSaveSettings);
  btnAddService.addEventListener('click', handleAddCustomService);

  // Tray Event Listeners
  window.deskboxAPI.onTriggerSyncGoogle(() => openModal(modalGoogle));
  window.deskboxAPI.onOpenSettings(() => openSettings());
  window.deskboxAPI.onCacheCleared(() => {
    showToast('Cache and cookies cleared from system menu.');
    reloadAllServices();
  });

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modalGoogle.classList.contains('open')) closeModal(modalGoogle);
      if (modalSettings.classList.contains('open')) closeModal(modalSettings);
    }
    if (e.ctrlKey || e.metaKey) {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= enabledServices.length) {
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

  // System shortcut switch
  window.deskboxAPI.onSwitchService((index) => {
    if (enabledServices[index]) {
      switchService(enabledServices[index].id);
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
    iconImg.src = service.icon || 'assets/icon.svg';
    iconImg.alt = service.name;

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

      webview.addEventListener('new-window', (e) => {
        if (e.url && !e.url.startsWith('about:')) {
          if (isAuthOrInternalUrl(service.url, e.url)) {
            webview.loadURL(e.url);
          } else {
            e.preventDefault();
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
  if (id === activeServiceId) return;

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

function reloadActiveService() {
  if (!activeServiceId) return;
  const activeWebview = document.getElementById(`view-${activeServiceId}`);
  if (activeWebview) {
    activeWebview.reload();
  }
}

function reloadAllServices() {
  document.querySelectorAll('#webview-container webview').forEach(wv => wv.reload());
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

document.addEventListener('DOMContentLoaded', init);
