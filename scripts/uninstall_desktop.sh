#!/usr/bin/env bash
# Desinstalador de MerkeMail Desktop
set -e

INSTALL_DIR="$HOME/.local/share/merkemail"
echo "Desinstalando MerkeMail Desktop..."

rm -f "$HOME/.local/share/applications/merkemail.desktop"
rm -f "$HOME/.config/autostart/merkemail.desktop"
rm -f "$HOME/.local/share/icons/hicolor/512x512/apps/merkemail.png"
rm -f "$HOME/.local/share/icons/hicolor/192x192/apps/merkemail.png"
rm -f "$HOME/.local/share/icons/hicolor/scalable/apps/merkemail.svg"

if [ -d "$INSTALL_DIR" ]; then
    rm -rf "$INSTALL_DIR"
fi

if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
fi

echo "MerkeMail ha sido desinstalado completamente de tu sistema."
