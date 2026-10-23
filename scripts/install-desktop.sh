#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/deskbox.desktop"
AUTOSTART_DIR="$HOME/.config/autostart"
AUTOSTART_FILE="$AUTOSTART_DIR/deskbox.desktop"
ICON_PATH="$DIR/src/ui/assets/icon.png"
EXEC_PATH="$DIR/scripts/run.sh"

chmod +x "$EXEC_PATH"
mkdir -p "$DESKTOP_DIR"
mkdir -p "$AUTOSTART_DIR"

cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Name=Deskbox
Comment=Lightweight workspace for Gmail, Calendar, Antigravity, Messages, WhatsApp and Telegram
Exec=$EXEC_PATH
Icon=$ICON_PATH
Terminal=false
Type=Application
Categories=Network;Chat;InstantMessaging;Office;
StartupWMClass=deskbox
Keywords=rambox;chat;whatsapp;telegram;gmail;calendar;messages;antigravity;
EOF

chmod +x "$DESKTOP_FILE"

# Autostart on system login
cat <<EOF > "$AUTOSTART_FILE"
[Desktop Entry]
Type=Application
Version=1.0
Name=Deskbox
Comment=Autostart Deskbox workspace
Exec=$EXEC_PATH
Icon=$ICON_PATH
StartupNotify=false
Terminal=false
X-GNOME-Autostart-enabled=true
EOF

chmod +x "$AUTOSTART_FILE"

# Update desktop database if tool is available
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" || true
fi

echo "Deskbox has been successfully installed:"
echo "1. Ubuntu Application Menu: $DESKTOP_FILE"
echo "2. System Autostart on Boot: $AUTOSTART_FILE"
