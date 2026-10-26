# Deskbox 🚀

<p align="center">
  <img src="src/ui/assets/icon.svg" alt="Deskbox Logo" width="120" height="120">
  <br>
  <b>A modern, ultra-lightweight, and customizable workspace application for Linux and macOS.</b>
  <br>
  <i>A fast, clean alternative to Rambox and Ferdium.</i>
  <br><br>
  <a href="https://webgrafia.github.io/deskbox/">🌐 <b>Visit Project Website & Live Showcase</b></a>
</p>

Deskbox groups your daily productivity and communication web apps into a single organized, distraction-free interface:
- **Gmail**
- **Google Calendar**
- **Google Antigravity** (`https://antigravity.google.com/`)
- **Android Messages / Google Messages SMS** (`https://messages.google.com/web`)
- **WhatsApp Web**
- **Telegram Web**
- **Built-in Mini Calculator Utility**
- *Any custom web app you want to add!*

---

## 🌟 Key Features

- **Dynamic Left Sidebar**: Seamlessly switch between services using mouse clicks or keyboard shortcuts (`Ctrl+1`, `Ctrl+2`, etc.).
- **Real-Time Unread Badges**: Tracks unread emails and incoming chats via DOM and page title monitoring, displaying clear numerical badges on each tab and total count in the system tray.
- **Settings & Service Reordering**: An integrated Settings Panel (`Ctrl+,`) lets you enable/disable services, reorder them with Up/Down controls, or add custom web apps. Preferences are automatically persisted across launches.
- **Shared Google Session**: Log in once and automatically stay authenticated across Gmail, Google Calendar, Google Antigravity, and Android Messages.
- **Google Auth Bridge**: Bypasses embedded OAuth restrictions ("This browser or app may not be secure") with a convenient 2-step sync wizard via Firefox.
- **Built-in Utilities**: Quick-access popup calculator in the sidebar for calculations on the fly.
- **System Tray (Background Execution)**: Closing the window minimizes Deskbox to the system tray with unread notification indicators.
- **External Links in Default Browser**: Links clicked inside messages and emails automatically open in your default browser (Chrome, Firefox, Brave, etc.).
- **Hardware & Media Permissions**: Voice notes and camera permissions for WhatsApp and Telegram work out-of-the-box.
- **Cross-Platform Ready**: Run natively on Linux (Ubuntu, Debian, Fedora, Arch) and macOS (Apple Silicon M1-M4 & Intel).

---

## 🚀 Quick Start

### Prerequisites
- Node.js (v18+) and npm
- Python 3 with `browser_cookie3` (standard on modern Linux)
- Linux desktop environment (Ubuntu / Debian / Fedora / Arch)

### Installation
Clone the repository and install dependencies:
```bash
git clone https://github.com/webgrafia/deskbox.git
cd deskbox
npm install
```

### Install Desktop Launcher (Ubuntu App Grid)
To add Deskbox to your Ubuntu application launcher with the official icon:
```bash
./scripts/install-desktop.sh
```
Now you can launch **Deskbox** by pressing the **Super (Windows)** key and typing `Deskbox`.

### Run from Terminal
```bash
./scripts/run.sh
```
or:
```bash
npm start
```

---

## ⚙️ Managing Services

Open the **Settings Panel** by clicking the gear icon ⚙️ in the sidebar bottom or pressing `Ctrl+,`:
- **Toggle Services**: Turn on or off any built-in service.
- **Reorder Services**: Use the **▲** and **▼** buttons to move services up and down.
- **Add Custom Service**: Input a name and URL (e.g., Slack, Discord, Trello) to add it to your sidebar.
- Click **Save & Apply** to update your sidebar immediately.

Configuration is saved in your local user data directory (`user-services.json`), keeping your personal setup safe from git updates.

---

## 🔑 Google Authentication (Gmail, Calendar, Antigravity)

Because Google actively blocks credential input in embedded Electron webviews:
1. Click the **Google (G)** icon on the bottom-left sidebar (or press `Ctrl+G`).
2. Click **"1. Open Firefox & Sign In"** to log into your Google Account in standard Firefox.
3. Click **"2. Sync Session"** in Deskbox: your authentication cookies are imported into the shared session, unlocking Gmail, Google Calendar, Antigravity, and Messages permanently!

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + 1` ... `Ctrl + 9` | Switch to corresponding service tab |
| `Ctrl + R` | Reload active tab |
| `Ctrl + G` | Open Google Sign-In & Sync modal |
| `Ctrl + ,` | Open Settings & Manage Services panel |
| `Escape` | Close active modal dialog |

---

## 🍏 Building for macOS

Deskbox can be packaged directly for macOS (even from Ubuntu/Linux):

```bash
# Package for Apple Silicon (M1/M2/M3/M4):
npm run build:mac -- --arm64

# Package for Intel Mac:
npm run build:mac -- --x64
```
The output `.zip` containing `Deskbox.app` is placed in `dist/`.

---

## 📄 License
MIT License. Free and open source.
