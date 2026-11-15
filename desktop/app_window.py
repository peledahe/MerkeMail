#!/usr/bin/env python3
"""
MerkeMail Desktop Native Window Manager (PyQt6 Frameless)
Proporciona una ventana de aplicación moderna sin la barra superior del sistema operativo,
con controles de ventana integrados en el header web y soporte para System Tray.
"""

import os
import sys
import time
import socket
import signal
import subprocess
import threading
from pathlib import Path

APP_PORT = int(os.environ.get("MERKEMAIL_PORT", 6524))
APP_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = APP_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = DATA_DIR / "backend_desktop.log"

ICON_PATH = APP_DIR / "img" / "icon-192.png"
if not ICON_PATH.exists():
    ICON_PATH = APP_DIR / "img" / "icon-512.png"

uvicorn_process = None

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
    env["PYTHONPATH"] = f"{str(APP_DIR)}:{env.get('PYTHONPATH', '')}"

    log_fp = open(LOG_FILE, "a", encoding="utf-8")
    log_fp.write(f"\n--- Iniciando MerkeMail Backend en puerto {APP_PORT} [{time.ctime()}] ---\n")
    log_fp.flush()

    uvicorn_process = subprocess.Popen(
        cmd,
        cwd=str(APP_DIR),
        env=env,
        stdout=log_fp,
        stderr=subprocess.STDOUT
    )

    for _ in range(80):
        if uvicorn_process.poll() is not None:
            print(f"Error: Backend se detuvo con código {uvicorn_process.returncode}")
            break
        if is_port_in_use(APP_PORT):
            print(f"Backend listo y escuchando en http://127.0.0.1:{APP_PORT}")
            break
        time.sleep(0.1)

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

def run_pyqt_window():
    from PyQt6.QtWidgets import QApplication, QMainWindow, QSystemTrayIcon, QMenu
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    from PyQt6.QtCore import Qt, QUrl, QPoint
    from PyQt6.QtGui import QIcon, QAction

    app = QApplication(sys.argv)
    app.setApplicationName("MerkeMail")
    app.setApplicationDisplayName("MerkeMail")
    app.setDesktopFileName("merkemail")

    if ICON_PATH.exists():
        app_icon = QIcon(str(ICON_PATH))
        app.setWindowIcon(app_icon)
    else:
        app_icon = QIcon()

    class FramelessMainWindow(QMainWindow):
        def __init__(self):
            super().__init__()
            # Ventana frameless: sin barra negra de título del sistema operativo
            self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Window)
            self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
            self.setWindowTitle("MerkeMail - Gestor de Correos Inteligente")
            self.resize(1280, 800)
            self.setMinimumSize(960, 600)

            self.drag_position = None

            self.view = QWebEngineView(self)
            self.view.setUrl(QUrl(f"http://127.0.0.1:{APP_PORT}/?desktop=1"))
            self.setCentralWidget(self.view)

        def mousePressEvent(self, event):
            # Permitir arrastrar la ventana desde el header (primeros 64 píxeles superiores)
            if event.button() == Qt.MouseButton.LeftButton and event.pos().y() <= 64:
                if self.windowHandle():
                    # Usar arrastre nativo del sistema de ventanas si está soportado
                    self.windowHandle().startSystemMove()
                else:
                    self.drag_position = event.globalPosition().toPoint() - self.frameGeometry().topLeft()
                event.accept()
            else:
                super().mousePressEvent(event)

        def mouseMoveEvent(self, event):
            if self.drag_position and event.buttons() == Qt.MouseButton.LeftButton:
                self.move(event.globalPosition().toPoint() - self.drag_position)
                event.accept()
            else:
                super().mouseMoveEvent(event)

        def mouseReleaseEvent(self, event):
            self.drag_position = None
            super().mouseReleaseEvent(event)

        def toggle_maximize(self) -> bool:
            if self.isMaximized():
                self.showNormal()
                return False
            else:
                self.showMaximized()
                return True

        def close_window(self):
            if is_tray_enabled():
                self.hide()
            else:
                self.quit_app()

        def quit_app(self):
            global uvicorn_process
            if uvicorn_process:
                try:
                    uvicorn_process.terminate()
                    uvicorn_process.wait(timeout=2)
                except Exception:
                    uvicorn_process.kill()
            app.quit()

    window = FramelessMainWindow()

    # Registrar callbacks de control de ventana en backend.main
    try:
        sys.path.insert(0, str(APP_DIR))
        from backend.main import register_desktop_window_callbacks
        register_desktop_window_callbacks(
            minimize=lambda: window.showMinimized(),
            toggle_maximize=lambda: window.toggle_maximize(),
            close=lambda: window.close_window(),
            is_maximized=lambda: window.isMaximized()
        )
    except Exception as reg_err:
        print(f"Aviso registrando callbacks de ventana: {reg_err}")

    # Configurar System Tray
    tray_icon = None
    if QSystemTrayIcon.isSystemTrayAvailable():
        tray_icon = QSystemTrayIcon(app_icon, app)
        tray_icon.setToolTip("MerkeMail - Correo Inteligente")

        menu = QMenu()
        open_action = QAction("📧 Abrir MerkeMail", menu)
        open_action.triggered.connect(lambda: (window.show(), window.raise_(), window.activateWindow()))
        menu.addAction(open_action)

        sync_action = QAction("🔄 Sincronizar Bandeja", menu)
        def trigger_sync():
            try:
                import urllib.request
                req = urllib.request.Request(f"http://127.0.0.1:{APP_PORT}/api/emails/sync", method="POST")
                urllib.request.urlopen(req, timeout=5)
            except Exception:
                pass
        sync_action.triggered.connect(trigger_sync)
        menu.addAction(sync_action)

        menu.addSeparator()
        quit_action = QAction("🚪 Salir de MerkeMail", menu)
        quit_action.triggered.connect(window.quit_app)
        menu.addAction(quit_action)

        tray_icon.setContextMenu(menu)
        tray_icon.activated.connect(lambda reason: (
            (window.show(), window.raise_(), window.activateWindow()) 
            if reason in (QSystemTrayIcon.ActivationReason.Trigger, QSystemTrayIcon.ActivationReason.DoubleClick)
            else None
        ))
        if is_tray_enabled():
            tray_icon.show()

    # Si no es autostart, mostrar ventana
    is_autostart = "--autostart" in sys.argv
    if not is_autostart:
        window.show()

    sys.exit(app.exec())

def main():
    start_backend()

    # Intentar ejecutar con PyQt6 Frameless
    try:
        import PyQt6.QtWidgets
        import PyQt6.QtWebEngineWidgets
        run_pyqt_window()
        return
    except Exception as e:
        print(f"PyQt6 WebEngine no disponible ({e}), usando fallback tray.py")

    # Fallback a desktop/tray.py con Chrome
    tray_py = APP_DIR / "desktop" / "tray.py"
    subprocess.run([sys.executable, str(tray_py)] + sys.argv[1:])

if __name__ == "__main__":
    main()
