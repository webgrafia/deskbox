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
  // Silent fallback
}

let currentCount = 0;

function parseUnreadCount() {
  const host = window.location.hostname.toLowerCase();
  const title = document.title || '';

  // 1. WhatsApp Web
  if (host.includes('whatsapp.com')) {
    // Standard WhatsApp title: "(3) WhatsApp"
    const titleMatch = title.match(/^\(([0-9]+)\)/);
    if (titleMatch) {
      return parseInt(titleMatch[1], 10) || 0;
    }
    let domCount = 0;
    const waBadges = document.querySelectorAll(
      '[aria-label*="unread"], [aria-label*="non letto"], [aria-label*="non letti"], span[data-testid="icon-unread-count"]'
    );
    waBadges.forEach((el) => {
      const text = el.textContent || '';
      const num = parseInt(text.trim(), 10);
      if (!isNaN(num)) domCount += num;
    });
    return domCount;
  }

  // 2. Telegram Web
  if (host.includes('telegram.org')) {
    // Standard Telegram title: "(5) Telegram"
    const titleMatch = title.match(/^\(([0-9]+)\)/);
    if (titleMatch) {
      return parseInt(titleMatch[1], 10) || 0;
    }
    let tgCount = 0;
    const tgBadges = document.querySelectorAll('.ChatBadge.unread, .badge:not(.muted), .ListItem-badge');
    tgBadges.forEach((el) => {
      const num = parseInt(el.textContent.trim(), 10);
      if (!isNaN(num)) tgCount += num;
    });
    return tgCount;
  }

  // 3. Android Messages (Google Messages)
  if (host.includes('messages.google.com')) {
    // Google Messages title format when unread: "(1) Messages for web" or "(2) Messaggi per il Web"
    const titleMatch = title.match(/^\(([0-9]+)\)/);
    if (titleMatch) {
      return parseInt(titleMatch[1], 10) || 0;
    }

    // Fallback: only match conversations explicitly flagged as unread
    const unreadItems = document.querySelectorAll('mws-conversation-list-item[is-unread="true"], [data-is-unread="true"]');
    if (unreadItems.length > 0) {
      return unreadItems.length;
    }

    return 0;
  }

  // 4. Gmail (mail.google.com)
  if (host.includes('mail.google.com')) {
    // Gmail unread count appears exclusively in the Inbox title or the Inbox folder link
    // Examples: "Posta in arrivo (2) - ..." or "Inbox (2) - ..." or "(2) Posta in arrivo"
    // If no unread mail: "Posta in arrivo - ..." (no parentheses or number)
    const inboxMatch = title.match(/(?:Inbox|Posta in arrivo)\s*\(([0-9]+)\)/i) || 
                       title.match(/^\(([0-9]+)\)\s*(?:Inbox|Posta in arrivo)/i);
    if (inboxMatch) {
      return parseInt(inboxMatch[1], 10) || 0;
    }

    // Target the specific Inbox folder element in the left nav (avoid matching Spam / Promotions)
    const inboxEl = document.querySelector('a[href*="#inbox"] .bsU, div[data-tooltip*="Inbox"] .bsU, div[data-tooltip*="Posta in arrivo"] .bsU');
    if (inboxEl) {
      const num = parseInt(inboxEl.textContent.replace(/[^0-9]/g, ''), 10);
      if (!isNaN(num)) {
        return num;
      }
    }

    return 0;
  }

  // Services like Google Calendar, Google Antigravity, etc. do NOT have unread message counts
  return 0;
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

  // Periodic fallback check (every 3 seconds) for dynamic SPAs
  setInterval(updateBadge, 3000);
  updateBadge();
});

// Intercept link clicks in the webview to reliably open external links in default browser
document.addEventListener('click', (e) => {
  const target = e.target.closest('a');
  if (target && target.href) {
    const href = target.href;
    if (href.startsWith('http://') || href.startsWith('https://')) {
      const isGoogleRedirect = href.includes('google.com/url?') || href.includes('google.it/url?');
      if (isGoogleRedirect || target.target === '_blank') {
        e.preventDefault();
        ipcRenderer.send('open-external', href);
      }
    }
  }
}, true);
