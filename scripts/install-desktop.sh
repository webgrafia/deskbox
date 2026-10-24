#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/deskbox.desktop"
AUTOSTART_DIR="$HOME/.config/autostart"
AUTOSTART_FILE="$AUTOSTART_DIR/deskbox.desktop"
ICON_PNG="$DIR/src/ui/assets/icon.png"
ICON_SVG="$DIR/src/ui/assets/icon.svg"
EXEC_PATH="$DIR/scripts/run.sh"

chmod +x "$EXEC_PATH"
mkdir -p "$DESKTOP_DIR"
mkdir -p "$AUTOSTART_DIR"

# Install standard XDG hicolor icon theme so Ubuntu Dock & App Menu refresh immediately
for res in 32x32 48x48 64x64 128x128 256x256; do
  mkdir -p "$HOME/.local/share/icons/hicolor/$res/apps"
  if command -v convert >/dev/null 2>&1; then
    convert -background none "$ICON_SVG" -resize "$res" "$HOME/.local/share/icons/hicolor/$res/apps/deskbox.png"
  else
    cp "$ICON_PNG" "$HOME/.local/share/icons/hicolor/$res/apps/deskbox.png"
  fi
done

mkdir -p "$HOME/.local/share/icons/hicolor/scalable/apps"
cp "$ICON_SVG" "$HOME/.local/share/icons/hicolor/scalable/apps/deskbox.svg"

if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" || true
fi

cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Name=Deskbox
Comment=Lightweight workspace for Gmail, Calendar, Antigravity, Messages, WhatsApp and Telegram
Exec=$EXEC_PATH
Icon=deskbox
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
Icon=deskbox
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
echo "3. System Icon Cache: ~/.local/share/icons/hicolor (deskbox)"
