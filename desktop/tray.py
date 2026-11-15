#!/usr/bin/env python3
"""
MerkeMail Desktop Tray & Application Manager
Permite ejecutar MerkeMail como aplicación local de escritorio con System Tray e inicio automático.
"""

import os
import sys
import time
import socket
import subprocess
import threading
import webbrowser
from pathlib import Path
from PIL import Image

APP_PORT = int(os.environ.get("MERKEMAIL_PORT", 6524))
APP_DIR = Path(__file__).resolve().parent.parent
ICON_PATH = APP_DIR / "img" / "icon-192.png"
if not ICON_PATH.exists():
    ICON_PATH = APP_DIR / "img" / "icon-512.png"

uvicorn_process = None
tray_icon = None

def is_port_in_use(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex(('127.0.0.1', port)) == 0

def start_backend():
    global uvicorn_process
    if is_port_in_use(APP_PORT):
        print(f"Backend ya está activo en http://127.0.0.1:{APP_PORT}")
        return

    python_bin = APP_DIR / ".venv" / "bin" / "python3"
    if not python_bin.exists():
        python_bin = Path(sys.executable)

    cmd = [
        str(python_bin), "-m", "uvicorn", "backend.main:app",
        "--host", "127.0.0.1",
        "--port", str(APP_PORT)
    ]
    env = os.environ.copy()
    env["PORT"] = str(APP_PORT)

    uvicorn_process = subprocess.Popen(
        cmd,
        cwd=str(APP_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    # Esperar a que el backend responda
    for _ in range(30):
        if is_port_in_use(APP_PORT):
            break
        time.sleep(0.1)

def open_window(subpath=""):
    url = f"http://127.0.0.1:{APP_PORT}/{subpath}".rstrip("/")
    chrome_bin = "/usr/bin/google-chrome"
    profile_dir = Path.home() / ".config" / "merkemail" / "chrome-profile"
    profile_dir.mkdir(parents=True, exist_ok=True)

    if Path(chrome_bin).exists():
        cmd = [
            chrome_bin,
            f"--app={url}",
            "--class=merkemail",
            f"--user-data-dir={profile_dir}"
        ]
        subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        webbrowser.open(url)

def sync_now():
    try:
        import urllib.request
        req = urllib.request.Request(f"http://127.0.0.1:{APP_PORT}/api/emails/sync", method="POST")
        urllib.request.urlopen(req, timeout=10)
    except Exception as e:
        print(f"Error sincronizando: {e}")

def quit_app():
    global tray_icon, uvicorn_process
    if tray_icon:
        tray_icon.stop()
    if uvicorn_process:
        try:
            uvicorn_process.terminate()
            uvicorn_process.wait(timeout=2)
        except Exception:
            uvicorn_process.kill()
    sys.exit(0)

def setup_tray():
    global tray_icon
    try:
        import pystray
    except ImportError:
        print("pystray no disponible, ejecutando sin system tray")
        return None

    try:
        pil_img = Image.open(str(ICON_PATH)).resize((64, 64), Image.Resampling.LANCZOS)
    except Exception as e:
        print(f"Error cargando icono: {e}")
        pil_img = Image.new("RGBA", (64, 64), (79, 70, 229, 255))

    menu = pystray.Menu(
        pystray.MenuItem("📧 Abrir MerkeMail", lambda: open_window()),
        pystray.MenuItem("✍️ Redactar Correo", lambda: open_window("#compose")),
        pystray.MenuItem("🔄 Sincronizar Bandeja", lambda: threading.Thread(target=sync_now, daemon=True).start()),
        pystray.MenuItem("⚙️ Ajustes", lambda: open_window("#settings")),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("🚪 Salir de MerkeMail", lambda: quit_app())
    )

    tray_icon = pystray.Icon("MerkeMail", pil_img, "MerkeMail - Correo Inteligente", menu)
    return tray_icon

def is_tray_enabled() -> bool:
    try:
        import sqlite3
        db_path = APP_DIR / "data" / "merkemail.db"
        if not db_path.exists():
            return True
        conn = sqlite3.connect(str(db_path))
        row = conn.execute("SELECT value FROM settings WHERE key = 'desktop_system_tray'").fetchone()
        conn.close()
        if row and row[0].strip().lower() in ("false", "0", "no"):
            return False
        return True
    except Exception:
        return True

def main():
    is_autostart = "--autostart" in sys.argv
    start_backend()

    # Si no es autostart o si tray está deshabilitado, abrir la ventana de inmediato
    tray_enabled = is_tray_enabled()

    if not is_autostart:
        open_window()

    if tray_enabled:
        tray = setup_tray()
        if tray:
            tray.run()
        else:
            # Si no hay tray disponible, esperar al proceso o mantener vivo
            if uvicorn_process:
                uvicorn_process.wait()
    else:
        if uvicorn_process:
            uvicorn_process.wait()

if __name__ == "__main__":
    main()
