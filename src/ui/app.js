let services = [];
let activeServiceId = null;
const badgeCounts = {};

const serviceListEl = document.getElementById('service-list');
const webviewContainerEl = document.getElementById('webview-container');
const btnReload = document.getElementById('btn-reload');
const btnGoogleLogin = document.getElementById('btn-google-login');
const toastEl = document.getElementById('toast');

const modalGoogle = document.getElementById('modal-google');
const modalClose = document.getElementById('modal-close');
const btnOpenFirefox = document.getElementById('btn-open-firefox');
const btnSyncSession = document.getElementById('btn-sync-session');
const btnClearCache = document.getElementById('btn-clear-cache');

let toastTimer = null;
function showToast(message, duration = 4500) {
  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add('show');
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

function reloadGoogleServices() {
  const gmailView = document.getElementById('view-gmail');
  const calView = document.getElementById('view-calendar');
  if (gmailView) gmailView.reload();
  if (calView) calView.reload();
}

function openModal() {
  modalGoogle.classList.add('open');
}

function closeModal() {
  modalGoogle.classList.remove('open');
}

async function handleOpenFirefox() {
  showToast('🦊 Apertura di Firefox su Google... Accedi al tuo account Google.');
  const res = await window.deskboxAPI.openFirefoxGoogle();
  if (res && !res.success) {
    showToast(res.message);
  }
}

async function handleClearCache() {
  if (confirm('Vuoi svuotare cookie e cache? Dovrai risincronizzare la sessione.')) {
    showToast('🧹 Svuotamento cookie e cache in corso...');
    const res = await window.deskboxAPI.clearCacheCookies();
    if (res && res.success) {
      showToast('✅ Cookie e cache svuotati con successo!');
      reloadGoogleServices();
    }
  }
}

async function handleSyncSession() {
  showToast('🔄 Ricerca e sincronizzazione cookie da Firefox...');
  const res = await window.deskboxAPI.syncGoogleCookies();
  if (res && res.success) {
    showToast(`✅ Sessione sincronizzata con successo (${res.count} cookie)! Ricarico Gmail e Calendar...`);
    closeModal();
    reloadGoogleServices();
  } else if (res && res.message) {
    showToast(`⚠️ ${res.message}`, 6000);
  }
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
  services = config.services || [];
  const preloadServicePath = config.preloadServicePath;
  const userAgent = config.userAgent;

  services.forEach((service, index) => {
    badgeCounts[service.id] = 0;

    // 1. Create Sidebar Button
    const btn = document.createElement('div');
    btn.className = `service-item ${index === 0 ? 'active' : ''}`;
    btn.id = `btn-${service.id}`;
    btn.title = `${service.name} (Ctrl+${index + 1})`;

    const iconImg = document.createElement('img');
    iconImg.className = 'service-icon';
    iconImg.src = service.icon;
    iconImg.alt = service.name;

    const badge = document.createElement('div');
    badge.className = 'badge';
    badge.id = `badge-${service.id}`;
    badge.textContent = '0';

    btn.appendChild(iconImg);
    btn.appendChild(badge);
    btn.addEventListener('click', () => switchService(service.id));
    serviceListEl.appendChild(btn);

    // 2. Create Webview (configure all attributes BEFORE setting src)
    const webview = document.createElement('webview');
    webview.id = `view-${service.id}`;
    webview.className = index === 0 ? 'active' : '';

    webview.setAttribute('partition', service.partition || 'persist:shared');
    if (userAgent) {
      webview.setAttribute('useragent', userAgent);
    }
    webview.setAttribute('allowpopups', 'true');
    webview.setAttribute('webpreferences', 'contextIsolation=true, allowRunningInsecureContent=false');
    webview.setAttribute('preload', `file://${preloadServicePath}`);

    // Set src after attributes are defined
    webview.setAttribute('src', service.url);

    // Intercept unread badge count messages from preload-service.js
    webview.addEventListener('ipc-message', (event) => {
      if (event.channel === 'unread-count') {
        const count = event.args[0]?.count || 0;
        updateServiceBadge(service.id, count);
      }
    });

    // Handle new-window: Keep auth / internal links inside webview, open external links in system browser
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
  });

  if (services.length > 0) {
    activeServiceId = services[0].id;
  }

  // Reload active service
  btnReload.addEventListener('click', () => {
    reloadActiveService();
  });

  // Modal Handlers
  btnGoogleLogin.addEventListener('click', openModal);
  modalClose.addEventListener('click', closeModal);
  modalGoogle.addEventListener('click', (e) => {
    if (e.target === modalGoogle) closeModal();
  });

  btnOpenFirefox.addEventListener('click', handleOpenFirefox);
  btnSyncSession.addEventListener('click', handleSyncSession);
  btnClearCache.addEventListener('click', handleClearCache);

  window.deskboxAPI.onCacheCleared(() => {
    showToast('✅ Cache svuotata dal menu di sistema.');
    reloadGoogleServices();
  });

  // Trigger from Tray
  window.deskboxAPI.onTriggerSyncGoogle(() => {
    openModal();
  });

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modalGoogle.classList.contains('open')) {
      closeModal();
    }
    if (e.ctrlKey || e.metaKey) {
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= services.length) {
        e.preventDefault();
        switchService(services[num - 1].id);
      } else if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        reloadActiveService();
      } else if (e.key.toLowerCase() === 'g') {
        e.preventDefault();
        openModal();
      }
    }
  });

  // Listen for switch events from main process
  window.deskboxAPI.onSwitchService((index) => {
    if (services[index]) {
      switchService(services[index].id);
    }
  });
}

function switchService(id) {
  if (id === activeServiceId) return;

  document.querySelectorAll('.service-item').forEach((el) => el.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-${id}`);
  if (activeBtn) activeBtn.classList.add('active');

  document.querySelectorAll('#webview-container webview').forEach((wv) => {
    wv.classList.remove('active');
  });
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

  const total = Object.values(badgeCounts).reduce((acc, c) => acc + c, 0);
  window.deskboxAPI.updateTotalBadge(total);
}

document.addEventListener('DOMContentLoaded', init);
