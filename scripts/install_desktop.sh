#!/usr/bin/env bash
# ==============================================================================
# Instalador de MerkeMail como Aplicación de Escritorio Local (Ubuntu / Linux)
# Instala MerkeMail en ~/.local/share/merkemail con puerto dedicado 6524
# ==============================================================================
set -e

SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INSTALL_DIR="$HOME/.local/share/merkemail"
APP_PORT="6524"

echo "========================================================"
echo "  Instalando MerkeMail Desktop en tu sistema..."
echo "  Origen:  $SOURCE_DIR"
echo "  Destino: $INSTALL_DIR"
echo "  Puerto:  $APP_PORT"
echo "========================================================"

# 1. Crear directorios base
mkdir -p "$INSTALL_DIR"
mkdir -p "$HOME/.local/share/applications"
mkdir -p "$HOME/.local/share/icons/hicolor/512x512/apps"
mkdir -p "$HOME/.local/share/icons/hicolor/192x192/apps"
mkdir -p "$HOME/.local/share/icons/hicolor/scalable/apps"
mkdir -p "$HOME/.config/autostart"
mkdir -p "$INSTALL_DIR/data"

# 2. Copiar archivos del proyecto excluyendo entornos temporales
echo "-> Copiando código de aplicación..."
rsync -av --delete \
    --exclude='.venv' \
    --exclude='__pycache__' \
    --exclude='*.pyc' \
    --exclude='.git' \
    --exclude='.agents' \
    --exclude='node_modules' \
    --exclude='data/*.db*' \
    "$SOURCE_DIR/" "$INSTALL_DIR/"

# Si no existe la BD en la app instalada, copiar la BD existente para conservar cuentas
if [ ! -f "$INSTALL_DIR/data/merkemail.db" ] && [ -f "$SOURCE_DIR/data/merkemail.db" ]; then
    echo "-> Inicializando base de datos local con tus cuentas configuradas..."
    cp "$SOURCE_DIR/data/merkemail.db" "$INSTALL_DIR/data/merkemail.db"
fi

# 3. Crear entorno virtual independiente con uv y habilitar system site-packages para PyQt6 WebEngine
echo "-> Configurando entorno virtual Python independiente..."
if command -v uv >/dev/null 2>&1; then
    if [ ! -d "$INSTALL_DIR/.venv" ]; then
        uv venv --system-site-packages "$INSTALL_DIR/.venv"
    elif [ -f "$INSTALL_DIR/.venv/pyvenv.cfg" ]; then
        sed -i 's/include-system-site-packages = false/include-system-site-packages = true/' "$INSTALL_DIR/.venv/pyvenv.cfg"
    fi
    echo "-> Instalando todas las dependencias desde requirements.txt..."
    uv pip install --python "$INSTALL_DIR/.venv/bin/python3" -r "$INSTALL_DIR/requirements.txt"
else
    echo "-> uv no encontrado, usando python3 -m venv..."
    if [ ! -d "$INSTALL_DIR/.venv" ]; then
        python3 -m venv --system-site-packages "$INSTALL_DIR/.venv"
    elif [ -f "$INSTALL_DIR/.venv/pyvenv.cfg" ]; then
        sed -i 's/include-system-site-packages = false/include-system-site-packages = true/' "$INSTALL_DIR/.venv/pyvenv.cfg"
    fi
    "$INSTALL_DIR/.venv/bin/pip" install -r "$INSTALL_DIR/requirements.txt"
fi

# 4. Asegurar permisos ejecutables en lanzadores
chmod +x "$INSTALL_DIR/desktop/launcher.sh" "$INSTALL_DIR/desktop/tray.py" "$INSTALL_DIR/desktop/app_window.py" 2>/dev/null || true

# 5. Instalar iconos en el sistema
echo "-> Instalando iconos del sistema..."
cp "$SOURCE_DIR/img/icon-512.png" "$HOME/.local/share/icons/hicolor/512x512/apps/merkemail.png"
cp "$SOURCE_DIR/img/icon-192.png" "$HOME/.local/share/icons/hicolor/192x192/apps/merkemail.png"
if [ -f "$SOURCE_DIR/img/merke.svg" ]; then
    cp "$SOURCE_DIR/img/merke.svg" "$HOME/.local/share/icons/hicolor/scalable/apps/merkemail.svg"
fi

# 6. Crear archivo .desktop en el menú de aplicaciones
echo "-> Creando acceso directo en el menú de aplicaciones de Ubuntu..."
cat <<EOF > "$HOME/.local/share/applications/merkemail.desktop"
[Desktop Entry]
Version=1.0
Type=Application
Name=MerkeMail
GenericName=Cliente de Correo
Comment=Cliente de Correo Inteligente con IA Gemini
Exec=$INSTALL_DIR/desktop/launcher.sh
Icon=merkemail
Terminal=false
StartupWMClass=merkemail
Actions=Show;Quit;

[Desktop Action Show]
Name=Mostrar la aplicación
Exec=$INSTALL_DIR/desktop/launcher.sh --show

[Desktop Action Quit]
Name=Cerrar
Exec=$INSTALL_DIR/desktop/launcher.sh --quit
EOF

chmod +x "$HOME/.local/share/applications/merkemail.desktop"

# 7. Actualizar bases de datos de escritorio e iconos
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
    gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true
fi

echo "========================================================"
echo "  ¡Instalación completada exitosamente!"
echo "  - Ubicación: $INSTALL_DIR"
echo "  - Puerto: $APP_PORT"
echo "  - Lanzador: MerkeMail ya está disponible en el menú de aplicaciones de Ubuntu"
echo "  - Ejecutar ahora con: $INSTALL_DIR/desktop/launcher.sh"
echo "========================================================"
