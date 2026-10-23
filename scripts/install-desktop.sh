#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/deskbox.desktop"
ICON_PATH="$DIR/src/ui/assets/icon.png"
EXEC_PATH="$DIR/scripts/run.sh"

chmod +x "$EXEC_PATH"
mkdir -p "$DESKTOP_DIR"

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

# Update desktop database if tool is available
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" || true
fi

echo "Deskbox has been successfully added to your Ubuntu application menu!"
echo "Desktop file: $DESKTOP_FILE"
echo "You can launch it by pressing the Super (Windows) key and typing 'Deskbox'."
