const { ipcRenderer } = require('electron');

// 1. Mask automation / electron flags
try {
  // Fix navigator.webdriver
  if (navigator.webdriver) {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
      configurable: true
    });
  }

  // Ensure window.chrome behaves like native Chrome
  if (!window.chrome) {
    window.chrome = {};
  }
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      PlatformOs: { ANDROID: 'android', CROS: 'cros', LINUX: 'linux', MAC: 'mac', OPENBSD: 'openbsd', WIN: 'win' },
      PlatformArch: { ARM: 'arm', ARM64: 'arm64', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
      PlatformNaclArch: { ARM: 'arm', MIPS: 'mips', MIPS64: 'mips64', X86_32: 'x86-32', X86_64: 'x86-64' },
      RequestUpdateCheckStatus: { NO_UPDATE: 'no_update', THROTTLED: 'throttled', UPDATE_AVAILABLE: 'update_available' },
      OnInstalledReason: { CHROME_UPDATE: 'chrome_update', INSTALL: 'install', SHARED_MODULE_UPDATE: 'shared_module_update', UPDATE: 'update' },
      OnRestartRequiredReason: { APP_UPDATE: 'app_update', OS_UPDATE: 'os_update', PERIODIC: 'periodic' }
    };
  }
} catch (e) {
  // Silent fail if restricted
}

let currentCount = 0;

function parseUnreadCount() {
  let count = 0;

  // 1. Check document.title pattern: (N) Title or Title (N)
  const title = document.title || '';
  const titleMatch = title.match(/\(([0-9]+)\+?\)/);
  if (titleMatch) {
    const val = parseInt(titleMatch[1], 10);
    if (!isNaN(val) && val > 0) {
      count = Math.max(count, val);
    }
  }

  // 2. WhatsApp specific DOM checks
  if (window.location.hostname.includes('whatsapp.com')) {
    const waBadges = document.querySelectorAll(
      '[aria-label*="unread"], [aria-label*="non letto"], [aria-label*="non letti"], span[data-testid="icon-unread-count"]'
    );
    let domCount = 0;
    waBadges.forEach((el) => {
      const text = el.textContent || '';
      const num = parseInt(text.trim(), 10);
      if (!isNaN(num)) {
        domCount += num;
      } else if (text.trim().length > 0) {
        domCount += 1;
      }
    });
    if (domCount > 0) {
      count = Math.max(count, domCount);
    }
  }

  // 3. Telegram specific DOM checks
  if (window.location.hostname.includes('telegram.org')) {
    const tgBadges = document.querySelectorAll('.ChatBadge.unread, .badge, .ListItem-badge');
    let tgCount = 0;
    tgBadges.forEach((el) => {
      const num = parseInt(el.textContent.trim(), 10);
      if (!isNaN(num)) {
        tgCount += num;
      } else {
        tgCount += 1;
      }
    });
    if (tgCount > 0) {
      count = Math.max(count, tgCount);
    }
  }

  // 4. Gmail specific DOM checks
  if (window.location.hostname.includes('mail.google.com')) {
    const gmailUnread = document.querySelector('.bsU');
    if (gmailUnread) {
      const num = parseInt(gmailUnread.textContent.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num)) {
        count = Math.max(count, num);
      }
    }
  }

  return count;
}

function updateBadge() {
  const newCount = parseUnreadCount();
  if (newCount !== currentCount) {
    currentCount = newCount;
    ipcRenderer.sendToHost('unread-count', { count: currentCount });
  }
}

// Watch title changes
window.addEventListener('DOMContentLoaded', () => {
  const titleEl = document.querySelector('title');
  if (titleEl) {
    const observer = new MutationObserver(() => updateBadge());
    observer.observe(titleEl, { subtree: true, characterData: true, childList: true });
  }

  // Periodic fallback check (every 3 seconds) for dynamic single page apps
  setInterval(updateBadge, 3000);
  updateBadge();
});
