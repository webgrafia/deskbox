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
Comment=Clone leggero di Rambox per Gmail, Calendar, WhatsApp e Telegram
Exec=$EXEC_PATH
Icon=$ICON_PATH
Terminal=false
Type=Application
Categories=Network;Chat;InstantMessaging;Office;
StartupWMClass=deskbox
Keywords=rambox;chat;whatsapp;telegram;gmail;calendar;
EOF

chmod +x "$DESKTOP_FILE"

# Update desktop database if tool available
if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database "$DESKTOP_DIR" || true
fi

echo "✅ Deskbox è stato installato nel menu applicazioni di Ubuntu!"
echo "   File desktop: $DESKTOP_FILE"
echo "   Puoi cercarlo premendo il tasto Super (Windows) e digitando 'Deskbox'."
