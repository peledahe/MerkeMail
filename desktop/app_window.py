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
    # Verificar si el backend ya está corriendo y responde correctamente
    if is_port_in_use(APP_PORT):
        try:
            import urllib.request
            req = urllib.request.Request(f"http://127.0.0.1:{APP_PORT}/api/desktop/window/state")
            with urllib.request.urlopen(req, timeout=1.0) as resp:
                if resp.status == 200:
                    print(f"Backend ya está activo y actualizado en http://127.0.0.1:{APP_PORT}")
                    return
        except Exception:
            print(f"Puerto {APP_PORT} en uso pero backend desactualizado o no responde. Reiniciando backend...")
            try:
                # Liberar puerto
                res = subprocess.run(["fuser", "-k", f"{APP_PORT}/tcp"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
                time.sleep(0.5)
            except Exception:
                pass

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

def get_unread_count() -> int:
    try:
        import sqlite3
        db_path = APP_DIR / "data" / "merkemail.db"
        if not db_path.exists():
            return 0
        conn = sqlite3.connect(str(db_path), timeout=2.0)
        cursor = conn.cursor()
        # Conteo de correos no leídos en Inbox y categorías principales
        row = cursor.execute(
            "SELECT COUNT(*) FROM emails WHERE is_read = 0 AND folder IN ('INBOX', 'CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS')"
        ).fetchone()
        count = int(row[0]) if row and row[0] is not None else 0
        if count == 0:
            alt_row = cursor.execute(
                "SELECT COUNT(*) FROM emails WHERE is_read = 0 AND folder NOT IN ('TRASH', 'trash', 'SPAM', 'spam', 'SENT', 'sent')"
            ).fetchone()
            count = int(alt_row[0]) if alt_row and alt_row[0] is not None else 0
        conn.close()
        return count
    except Exception:
        return 0

def create_tray_pixmap(unread_count: int):
    from PyQt6.QtGui import QPixmap, QImage, QPainter, QBrush, QPen, QColor
    from PyQt6.QtCore import Qt, QRectF

    tray_img_path = APP_DIR / "img" / "tray-icon.png"
    if not tray_img_path.exists():
        tray_img_path = ICON_PATH

    base_pix = QPixmap(str(tray_img_path)).scaled(48, 48, Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation)
    if base_pix.isNull():
        base_pix = QPixmap(48, 48)
        base_pix.fill(Qt.GlobalColor.transparent)

    if unread_count == 0:
        # Estado Todo Leído: icono en escala de grises suave conservando el canal alfa 100% transparente
        qimg = base_pix.toImage().convertToFormat(QImage.Format.Format_ARGB32)
        w, h = qimg.width(), qimg.height()
        for y in range(h):
            for x in range(w):
                c = qimg.pixelColor(x, y)
                if c.alpha() > 0:
                    gray = int(0.299 * c.red() + 0.587 * c.green() + 0.114 * c.blue())
                    new_a = int(c.alpha() * 0.6)
                    c.setRgb(gray, gray, gray, new_a)
                    qimg.setPixelColor(x, y, c)
        return QPixmap.fromImage(qimg)
    else:
        # Estado con No Leídos: icono a color vibrante con badge circular en esquina superior derecha
        result = QPixmap(base_pix.size())
        result.fill(Qt.GlobalColor.transparent)
        painter = QPainter(result)
        painter.setRenderHint(QPainter.RenderHint.Antialiasing)
        painter.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        painter.drawPixmap(0, 0, base_pix)
        
        badge_radius = 6.5
        cx = result.width() - badge_radius - 2
        cy = badge_radius + 2

        # Borde blanco fino y punto rojo vibrante
        painter.setPen(QPen(QColor("#ffffff"), 1.8))
        painter.setBrush(QBrush(QColor("#ef4444")))
        painter.drawEllipse(QRectF(cx - badge_radius, cy - badge_radius, badge_radius * 2, badge_radius * 2))
        painter.end()
        return result

def run_pyqt_window():
    from PyQt6.QtWidgets import QApplication, QMainWindow, QSystemTrayIcon, QMenu
    from PyQt6.QtWebEngineWidgets import QWebEngineView
    from PyQt6.QtWebEngineCore import QWebEnginePage, QWebEngineDownloadRequest
    from PyQt6.QtCore import Qt, QUrl, QPoint, QTimer, QRectF, QObject, pyqtSlot, QEvent, QStandardPaths
    from PyQt6.QtGui import QIcon, QAction, QPixmap, QPainter, QColor, QBrush, QPen, QImage, QDesktopServices
    from PyQt6.QtNetwork import QLocalSocket, QLocalServer
    from PyQt6.QtWebChannel import QWebChannel

    # Evitar el throttling de temporizadores de Chromium cuando la ventana está oculta en el System Tray
    chromium_flags = [
        "--disable-background-timer-throttling",
        "--disable-backgrounding-occluded-windows",
        "--disable-renderer-backgrounding",
    ]
    for flag in chromium_flags:
        if flag not in sys.argv:
            sys.argv.append(flag)

    # Asegurar que WM_CLASS coincida con merkemail.desktop en X11/GNOME
    if sys.argv:
        sys.argv[0] = "merkemail"

    app = QApplication(sys.argv)
    app.setApplicationName("merkemail")
    app.setApplicationDisplayName("MerkeMail")
    app.setDesktopFileName("merkemail")

    # Mecanismo de Instancia Única (Single Instance Lock)
    SOCKET_NAME = "merkemail_desktop_single_instance_sock"
    IPC_SOCK_PATH = "/tmp/merkemail_window_ipc.sock"

    # Verificar si el usuario invocó con comando especial (--toggle, --hide, --quit, etc.)
    cmd_to_send = b"SHOW\n"
    if "--toggle" in sys.argv:
        cmd_to_send = b"TOGGLE\n"
    elif "--hide" in sys.argv:
        cmd_to_send = b"HIDE\n"
    elif "--show" in sys.argv:
        cmd_to_send = b"SHOW\n"
    elif "--quit" in sys.argv or "--close" in sys.argv:
        cmd_to_send = b"QUIT\n"

    check_socket = QLocalSocket()
    check_socket.connectToServer(SOCKET_NAME)
    if check_socket.waitForConnected(400):
        # Ya existe una instancia abierta: enviar comando y salir de inmediato
        check_socket.write(cmd_to_send)
        check_socket.flush()
        check_socket.waitForBytesWritten(400)
        check_socket.close()
        sys.exit(0)

    if ICON_PATH.exists():
        app_icon = QIcon(str(ICON_PATH))
        app.setWindowIcon(app_icon)
    else:
        app_icon = QIcon()

    class DesktopBridgeObject(QObject):
        def __init__(self, win):
            super().__init__()
            self.win = win

        @pyqtSlot()
        def minimize(self):
            self.win.minimize_window()

        @pyqtSlot()
        def maximize(self):
            self.win.maximize_window()

        @pyqtSlot()
        def restore(self):
            self.win.restore_window()

        @pyqtSlot()
        def toggle_maximize(self):
            self.win.toggle_maximize()

        @pyqtSlot()
        def close(self):
            self.win.close_window()

        @pyqtSlot()
        def start_drag(self):
            self.win.start_drag()

        @pyqtSlot(str)
        def open_url(self, url: str):
            if url:
                QDesktopServices.openUrl(QUrl(url))

        @pyqtSlot(result=bool)
        def is_maximized(self):
            return self.win.isMaximized()

        @pyqtSlot()
        def print_dialog(self):
            if hasattr(self.win, "view") and self.win.view:
                page = self.win.view.page()
                if hasattr(page, "trigger_native_print"):
                    page.trigger_native_print()

        @pyqtSlot(str)
        @pyqtSlot(str, str)
        def save_pdf(self, title: str, html: str = ""):
            if html:
                try:
                    with open("/tmp/merkemail_print_doc.html", "w", encoding="utf-8") as f:
                        f.write(html)
                except Exception as e:
                    print(f"Error escribiendo buffer desde bridge: {e}")
            if hasattr(self.win, "view") and self.win.view:
                page = self.win.view.page()
                if hasattr(page, "save_pdf_dialog"):
                    page.save_pdf_dialog(title)

        @pyqtSlot(str, str)
        def show_notification(self, title: str, message: str):
            if hasattr(self.win, "show_notification"):
                self.win.show_notification(title, message)

    class CustomWebEnginePage(QWebEnginePage):
        def __init__(self, window, parent=None):
            super().__init__(parent)
            self.window = window
            try:
                self.printRequested.connect(self.trigger_native_print)
            except Exception:
                pass

        def save_pdf_dialog(self, raw_title: str):
            clean_name = "".join(c for c in (raw_title or "correo") if c.isalnum() or c in (" ", "-", "_", ".")).strip()
            if not clean_name:
                clean_name = "correo"
            if not clean_name.lower().endswith(".pdf"):
                clean_name += ".pdf"
            
            from PyQt6.QtWidgets import QFileDialog
            from PyQt6.QtCore import QStandardPaths, QUrl, QMarginsF
            from PyQt6.QtGui import QPageLayout, QPageSize
            from PyQt6.QtWebEngineCore import QWebEnginePage
            import json

            docs_dir = QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DocumentsLocation) or os.path.expanduser("~/Descargas")
            save_path, _ = QFileDialog.getSaveFileName(
                self.window,
                "Guardar correo como PDF",
                os.path.join(docs_dir, clean_name),
                "Documentos PDF (*.pdf)"
            )
            if save_path:
                if not save_path.lower().endswith(".pdf"):
                    save_path += ".pdf"
                
                buffer_path = "/tmp/merkemail_print_doc.html"
                options_path = "/tmp/merkemail_print_options.json"
                opts = {}
                if os.path.exists(options_path):
                    try:
                        with open(options_path, "r", encoding="utf-8") as f:
                            opts = json.load(f)
                    except Exception:
                        pass

                p_size = QPageSize.PageSizeId.Letter
                if opts.get("paperSize") == "a4":
                    p_size = QPageSize.PageSizeId.A4
                elif opts.get("paperSize") == "legal":
                    p_size = QPageSize.PageSizeId.Legal

                p_orient = QPageLayout.Orientation.Portrait
                if opts.get("layout") == "landscape":
                    p_orient = QPageLayout.Orientation.Landscape

                # Margen explícito según la configuración del usuario
                margin_choice = opts.get("margins", "default")
                if margin_choice == "none":
                    m_val = 0.0
                elif margin_choice == "minimum":
                    m_val = 8.0  # 8mm
                else:
                    m_val = 18.0 # 18mm estándar (~0.7 pulgada)

                page_layout = QPageLayout(
                    QPageSize(p_size),
                    p_orient,
                    QMarginsF(m_val, m_val, m_val, m_val),
                    QPageLayout.Unit.Millimeter
                )

                if os.path.exists(buffer_path):
                    # Usar página dedicada e independiente con el layout de márgenes configurado
                    self._pdf_render_page = QWebEnginePage(self.window)
                    def on_load_pdf(ok):
                        if ok:
                            self._pdf_render_page.printToPdf(save_path, page_layout)
                            def on_pdf_done(file_path, success):
                                self._pdf_render_page = None
                            try:
                                self._pdf_render_page.pdfPrintingFinished.connect(on_pdf_done)
                            except Exception:
                                pass
                    self._pdf_render_page.loadFinished.connect(on_load_pdf)
                    self._pdf_render_page.load(QUrl.fromLocalFile(buffer_path))
                else:
                    print("Aviso: /tmp/merkemail_print_doc.html no encontrado para imprimir.")

        def trigger_native_print(self):
            try:
                from PyQt6.QtPrintSupport import QPrinter, QPrintDialog
                from PyQt6.QtCore import QUrl
                from PyQt6.QtWebEngineCore import QWebEnginePage
                printer = QPrinter(QPrinter.PrinterMode.HighResolution)
                printer.setDocName("Correo MerkeMail")
                dlg = QPrintDialog(printer, self.window)
                dlg.setWindowTitle("Imprimir Correo - MerkeMail")
                if dlg.exec() == QPrintDialog.DialogCode.Accepted:
                    import tempfile
                    fd, tmp_path = tempfile.mkstemp(suffix=".pdf")
                    os.close(fd)
                    buffer_path = "/tmp/merkemail_print_doc.html"

                    def on_pdf_ready(file_path, success):
                        if success and os.path.exists(tmp_path):
                            try:
                                p_name = printer.printerName()
                                if p_name:
                                    subprocess.run(["lpr", "-P", p_name, tmp_path], check=False)
                                else:
                                    subprocess.run(["lpr", tmp_path], check=False)
                            except Exception as pe:
                                print(f"Aviso al enviar a lpr: {pe}")
                            finally:
                                try:
                                    os.unlink(tmp_path)
                                except Exception:
                                    pass
                                self._print_render_page = None

                    if os.path.exists(buffer_path):
                        self._print_render_page = QWebEnginePage(self.window)
                        def on_load_print(ok):
                            if ok:
                                self._print_render_page.printToPdf(tmp_path)
                                self._print_render_page.pdfPrintingFinished.connect(on_pdf_ready)
                        self._print_render_page.loadFinished.connect(on_load_print)
                        self._print_render_page.load(QUrl.fromLocalFile(buffer_path))
                    else:
                        print("Aviso: /tmp/merkemail_print_doc.html no encontrado para diálogo de impresión.")
            except Exception as e:
                print(f"Error en trigger_native_print: {e}")
                print(f"Error en trigger_native_print: {e}")

        def javaScriptConsoleMessage(self, level, message, line, source_id):
            if "ResizeObserver loop" in message:
                return
            # Movimiento continuo en tiempo real de la ventana
            if message.startswith("__PYQT_MOVE__:"):
                try:
                    parts = message.split(":")
                    dx = int(float(parts[1]))
                    dy = int(float(parts[2]))
                    self.window.move_by(dx, dy)
                except Exception:
                    pass
                return

            # Redimensionamiento continuo en tiempo real desde bordes y esquinas
            if message.startswith("__PYQT_RESIZE__:"):
                try:
                    parts = message.split(":")
                    edge = parts[1]
                    dx = int(float(parts[2]))
                    dy = int(float(parts[3]))
                    self.window.resize_by(edge, dx, dy)
                except Exception:
                    pass
                return

            # Canal ultrarrápido y directo de comunicación JS -> PyQt6
            if message.startswith("__PYQT_ACTION__:"):
                action = message.split(":", 1)[1]
                if action == "minimize":
                    self.window.minimize_window()
                elif action == "maximize":
                    self.window.maximize_window()
                elif action == "restore":
                    self.window.restore_window()
                elif action == "toggle_maximize":
                    self.window.toggle_maximize()
                elif action == "close":
                    self.window.close_window()
                elif action == "start_drag":
                    self.window.start_drag()
                elif action.startswith("open_url:"):
                    raw_url = action.split("open_url:", 1)[1].strip()
                    if raw_url:
                        QDesktopServices.openUrl(QUrl(raw_url))
                elif action.startswith("save_pdf:"):
                    raw_title = action.split("save_pdf:", 1)[1].strip()
                    self.save_pdf_dialog(raw_title)
                elif action == "print_dialog":
                    self.trigger_native_print()
                return
            super().javaScriptConsoleMessage(level, message, line, source_id)

        def acceptNavigationRequest(self, url, nav_type, is_main_frame):
            # Si es una descarga de adjunto de la propia app, procesarla localmente
            if url.isValid() and url.scheme() in ("http", "https"):
                if "/api/attachments/" in url.path():
                    return True
                host = url.host()
                if host not in ("127.0.0.1", "localhost"):
                    QDesktopServices.openUrl(url)
                    return False
            elif url.isValid() and url.scheme() == "mailto":
                QDesktopServices.openUrl(url)
                return False
            return super().acceptNavigationRequest(url, nav_type, is_main_frame)

        def createWindow(self, window_type):
            # Cuando un enlace abre popup / target="_blank", abrir en el navegador predeterminado salvo descargas locales
            class ExternalUrlCatchPage(QWebEnginePage):
                def acceptNavigationRequest(inner_self, url, nav_type, is_main_frame):
                    if url.isValid() and url.scheme() in ("http", "https"):
                        if "/api/attachments/" in url.path():
                            return True
                        host = url.host()
                        if host not in ("127.0.0.1", "localhost"):
                            QDesktopServices.openUrl(url)
                            return False
                    return False
            return ExternalUrlCatchPage(self)

    class FramelessMainWindow(QMainWindow):
        def __init__(self):
            super().__init__()
            # Ventana frameless: sin barra negra de título del sistema operativo
            self.setWindowFlags(Qt.WindowType.FramelessWindowHint | Qt.WindowType.Window)
            self.setAttribute(Qt.WidgetAttribute.WA_TranslucentBackground, False)
            self.setWindowTitle("MerkeMail - Gestor de Correos Inteligente")
            self.resize(1280, 800)
            # Permitir reducir la ventana hasta un tamaño prudencial tipo móvil (360x480)
            self.setMinimumSize(360, 480)

            self.drag_position = None

            self.view = QWebEngineView(self)
            self.custom_page = CustomWebEnginePage(self, parent=self.view)
            self.view.setPage(self.custom_page)

            # Conectar gestor de almacenamiento persistente y descargas de Qt WebEngine
            try:
                profile = self.view.page().profile()
                web_data_dir = DATA_DIR / "web_profile"
                web_data_dir.mkdir(parents=True, exist_ok=True)
                profile.setPersistentStoragePath(str(web_data_dir))
                profile.setCachePath(str(web_data_dir / "cache"))
                profile.downloadRequested.connect(self.on_download_requested)
            except Exception as dl_init_err:
                print(f"Aviso configurando perfil de almacenamiento web: {dl_init_err}")

            self.channel = QWebChannel(self.view.page())
            self.bridge = DesktopBridgeObject(self)
            self.channel.registerObject("pyqtBridge", self.bridge)
            self.view.page().setWebChannel(self.channel)

            self.view.setUrl(QUrl(f"http://127.0.0.1:{APP_PORT}/?desktop=1"))
            self.setCentralWidget(self.view)

        def on_download_requested(self, download: QWebEngineDownloadRequest):
            try:
                downloads_dir = QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DownloadLocation)
                if not downloads_dir or not os.path.exists(downloads_dir):
                    downloads_dir = str(Path.home() / "Descargas")
                    if not os.path.exists(downloads_dir):
                        downloads_dir = str(Path.home() / "Downloads")

                os.makedirs(downloads_dir, exist_ok=True)

                raw_filename = download.suggestedFileName() or download.downloadFileName() or "adjunto"
                clean_filename = os.path.basename(raw_filename).replace('"', '').replace("'", "")
                if not clean_filename:
                    clean_filename = "adjunto"

                download.setDownloadDirectory(downloads_dir)
                download.setDownloadFileName(clean_filename)
                download.accept()

                full_path = os.path.join(downloads_dir, clean_filename)
                print(f"[Desktop Download] Guardando adjunto en: {full_path}")

                def on_finished():
                    if download.isFinished():
                        print(f"[Desktop Download] Descarga completada: {full_path}")
                        try:
                            msg = f"Guardado en Descargas/{clean_filename}"
                            self.view.page().runJavaScript(
                                f"if (window.UI && typeof UI.showStickyToast === 'function') UI.showStickyToast('Descarga Completada', '{msg}', 'success');"
                            )
                        except Exception:
                            pass

                download.isFinishedChanged.connect(on_finished)
            except Exception as e:
                print(f"Error procesando descarga: {e}")

        def changeEvent(self, event):
            super().changeEvent(event)
            if event.type() == QEvent.Type.WindowStateChange:
                is_max = self.isMaximized()
                try:
                    self.view.page().runJavaScript(f"if (window.DesktopBridge) window.DesktopBridge.onNativeWindowStateChanged({str(is_max).lower()});")
                except Exception:
                    pass

        def move_by(self, dx: int, dy: int):
            if self.isMaximized():
                self.restore_window()
            new_pos = self.pos() + QPoint(dx, dy)
            self.move(new_pos)

        def resize_by(self, edge: str, dx: int, dy: int):
            if self.isMaximized():
                return
            geo = self.geometry()
            min_w = self.minimumWidth()
            min_h = self.minimumHeight()
            x, y, w, h = geo.x(), geo.y(), geo.width(), geo.height()

            if "e" in edge:
                w = max(min_w, w + dx)
            if "s" in edge:
                h = max(min_h, h + dy)
            if "w" in edge:
                new_w = max(min_w, w - dx)
                x += (w - new_w)
                w = new_w
            if "n" in edge:
                new_h = max(min_h, h - dy)
                y += (h - new_h)
                h = new_h

            self.setGeometry(x, y, w, h)

        def start_drag(self):
            # Si está maximizada, restaurar a tamaño normal antes de mover
            if self.isMaximized():
                self.restore_window()
            wh = self.windowHandle()
            if wh:
                wh.startSystemMove()

        def resizeEvent(self, event):
            super().resizeEvent(event)
            try:
                self.view.page().runJavaScript("if (window.UI && typeof UI.onWindowResizeFast === 'function') { UI.onWindowResizeFast(); }")
            except Exception:
                pass

        def maximize_window(self):
            if not self.isMaximized():
                self._normal_geom = self.geometry()
                self.showMaximized()
                try:
                    self.view.page().runJavaScript("if (window.UI && typeof UI.onWindowResizeFast === 'function') { UI.onWindowResizeFast(); } if (window.DesktopBridge) window.DesktopBridge.onNativeWindowStateChanged(true);")
                except Exception:
                    pass

        def restore_window(self):
            if self.isMaximized():
                self.showNormal()
                try:
                    screen = self.screen() or QApplication.primaryScreen()
                    if screen:
                        avail = screen.availableGeometry()
                        cur = self.geometry()
                        if cur.width() >= avail.width() - 24 and cur.height() >= avail.height() - 24:
                            target_w = min(1200, max(360, int(avail.width() * 0.78)))
                            target_h = min(780, max(480, int(avail.height() * 0.80)))
                            target_x = avail.x() + (avail.width() - target_w) // 2
                            target_y = avail.y() + (avail.height() - target_h) // 2
                            self.setGeometry(target_x, target_y, target_w, target_h)
                except Exception:
                    pass
                try:
                    self.view.page().runJavaScript("if (window.UI && typeof UI.onWindowResizeFast === 'function') { UI.onWindowResizeFast(); } if (window.DesktopBridge) window.DesktopBridge.onNativeWindowStateChanged(false);")
                except Exception:
                    pass

        def toggle_maximize(self) -> bool:
            if self.isMaximized():
                self.restore_window()
                return False
            else:
                self.maximize_window()
                return True

        def minimize_window(self):
            if is_tray_enabled():
                # Al tener el System Tray activo, ocultar completamente la ventana para no mostrar icono en el tablero/dock
                self.hide()
            else:
                self.showMinimized()

        def close_window(self):
            if is_tray_enabled():
                # Ocultar al System Tray sin dejar icono en el tablero
                self.hide()
            else:
                self.quit_app()

        def bring_to_foreground(self):
            """
            Trae la ventana principal al primer plano y le otorga foco activo.
            Maneja estados minimizados, ocultos o en segundo plano con soporte
            multiplataforma (Linux X11/Wayland, Windows y macOS).
            """
            if not self.isVisible():
                self.show()

            current_state = self.windowState()
            if current_state & Qt.WindowState.WindowMinimized:
                self.setWindowState(current_state & ~Qt.WindowState.WindowMinimized)
                self.showNormal()

            self.setWindowState(self.windowState() | Qt.WindowState.WindowActive)
            self.raise_()
            self.activateWindow()

            # Forzar activación a nivel de Window Manager
            try:
                handle = self.windowHandle()
                if handle:
                    handle.requestActivate()
            except Exception:
                pass

            # Soporte específico para Windows (prevenir bloqueo de focus stealing)
            if sys.platform.startswith("win"):
                try:
                    import ctypes
                    user32 = ctypes.windll.user32
                    hwnd = int(self.winId())
                    user32.ShowWindow(hwnd, 9)  # SW_RESTORE
                    user32.SetForegroundWindow(hwnd)
                except Exception:
                    pass

        def show_window(self):
            self.bring_to_foreground()

        def toggle_visibility(self):
            if self.isVisible() and not self.isMinimized():
                self.hide()
            else:
                self.bring_to_foreground()

        def show_notification(self, title: str, message: str):
            try:
                tray = getattr(self, "tray_icon", None)
                if tray and QSystemTrayIcon.isSystemTrayAvailable():
                    tray.showMessage(title or "MerkeMail", message or "", QSystemTrayIcon.MessageIcon.Information, 5000)
                    return
            except Exception as e:
                print(f"Aviso en showMessage de bandeja: {e}")
            try:
                import subprocess
                subprocess.run(["notify-send", "-a", "MerkeMail", title or "MerkeMail", message or ""], check=False)
            except Exception:
                pass

        def showEvent(self, event):
            super().showEvent(event)
            if hasattr(self, "_on_visibility_changed") and callable(self._on_visibility_changed):
                self._on_visibility_changed(True)

        def hideEvent(self, event):
            super().hideEvent(event)
            if hasattr(self, "_on_visibility_changed") and callable(self._on_visibility_changed):
                self._on_visibility_changed(False)

        def closeEvent(self, event):
            # Cuando el gestor de ventanas o la barra de tareas solicita cerrar la ventana, cerrar la aplicación
            event.accept()
            self.quit_app()

        def quit_app(self):
            global uvicorn_process
            # Limpiar socket IPC al salir
            try:
                if os.path.exists(IPC_SOCK_PATH):
                    os.unlink(IPC_SOCK_PATH)
            except Exception:
                pass
            if uvicorn_process:
                try:
                    uvicorn_process.terminate()
                    uvicorn_process.wait(timeout=2)
                except Exception:
                    uvicorn_process.kill()
            app.quit()

    window = FramelessMainWindow()

    # Escuchar nuevas conexiones de instancias secundarias
    local_server = QLocalServer(app)
    QLocalServer.removeServer(SOCKET_NAME)
    if local_server.listen(SOCKET_NAME):
        def on_instance_connection():
            client_conn = local_server.nextPendingConnection()
            if client_conn:
                def on_data_received():
                    try:
                        raw = client_conn.readAll().data().decode("utf-8", errors="ignore")
                        if "TOGGLE" in raw:
                            window.toggle_visibility()
                        elif "HIDE" in raw:
                            window.hide()
                        elif "QUIT" in raw:
                            window.quit_app()
                        else:
                            window.show_window()
                    except Exception:
                        pass
                    client_conn.close()
                client_conn.readyRead.connect(on_data_received)
        local_server.newConnection.connect(on_instance_connection)

    # Servidor IPC para atender peticiones de control de ventana desde el backend FastAPI
    def run_ipc_server():
        try:
            if os.path.exists(IPC_SOCK_PATH):
                os.unlink(IPC_SOCK_PATH)
            import socket
            server_sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
            server_sock.bind(IPC_SOCK_PATH)
            server_sock.listen(5)
            server_sock.settimeout(1.0)
            while True:
                try:
                    conn, _ = server_sock.accept()
                    data = conn.recv(1024).decode("utf-8").strip()
                    resp = "ok"
                    if data == "minimize":
                        QTimer.singleShot(0, window.minimize_window)
                    elif data == "maximize":
                        QTimer.singleShot(0, window.maximize_window)
                    elif data == "restore":
                        QTimer.singleShot(0, window.restore_window)
                    elif data == "toggle_maximize":
                        QTimer.singleShot(0, window.toggle_maximize)
                        resp = "true" if not window.isMaximized() else "false"
                    elif data == "close":
                        QTimer.singleShot(0, window.close_window)
                    elif data == "show":
                        QTimer.singleShot(0, window.show_window)
                    elif data == "toggle":
                        QTimer.singleShot(0, window.toggle_visibility)
                    elif data == "start_drag":
                        QTimer.singleShot(0, window.start_drag)
                    elif data.startswith("move_by:"):
                        try:
                            parts = data.split(":")
                            dx = int(parts[1])
                            dy = int(parts[2])
                            QTimer.singleShot(0, lambda dx=dx, dy=dy: window.move_by(dx, dy))
                        except Exception:
                            pass
                    elif data == "is_maximized":
                        resp = "true" if window.isMaximized() else "false"
                    conn.sendall(resp.encode("utf-8"))
                    conn.close()
                except socket.timeout:
                    continue
                except Exception:
                    break
        except Exception as e:
            print(f"Aviso servidor IPC: {e}")

    threading.Thread(target=run_ipc_server, daemon=True).start()

    # Registrar callbacks de control de ventana en backend.main
    try:
        sys.path.insert(0, str(APP_DIR))
        from backend.main import register_desktop_window_callbacks
        register_desktop_window_callbacks(
            minimize=lambda: window.minimize_window(),
            maximize=lambda: window.maximize_window(),
            restore=lambda: window.restore_window(),
            toggle_maximize=lambda: window.toggle_maximize(),
            close=lambda: window.close_window(),
            show=lambda: window.show_window(),
            is_maximized=lambda: window.isMaximized()
        )
    except Exception as reg_err:
        print(f"Aviso registrando callbacks de ventana: {reg_err}")

    # Configurar System Tray
    tray_icon = None
    tray_timer = None
    if QSystemTrayIcon.isSystemTrayAvailable():
        initial_unread = get_unread_count()
        last_notified_unread = initial_unread
        tray_icon = QSystemTrayIcon(QIcon(create_tray_pixmap(initial_unread)), app)
        window.tray_icon = tray_icon
        if initial_unread > 0:
            tray_icon.setToolTip(f"MerkeMail - {initial_unread} correo{'s' if initial_unread != 1 else ''} sin leer")
        else:
            tray_icon.setToolTip("MerkeMail - Todo al día (0 sin leer)")

        # Configurar menú contextual del tray (clic derecho) sin opciones duplicadas
        menu = QMenu()
        open_action = QAction("Mostrar Aplicación", menu)
        open_action.triggered.connect(window.bring_to_foreground)
        menu.addAction(open_action)
        menu.setDefaultAction(open_action)

        hide_action = QAction("Ocultar en segundo plano", menu)
        hide_action.triggered.connect(window.hide)
        menu.addAction(hide_action)

        menu.addSeparator()

        quit_action = QAction("Cerrar", menu)
        quit_action.triggered.connect(window.quit_app)
        menu.addAction(quit_action)

        tray_icon.setContextMenu(menu)

        # Clic izquierdo / activación del icono: mostrar y enfocar la aplicación en primer plano
        def on_tray_activated(reason):
            if reason in (
                QSystemTrayIcon.ActivationReason.Trigger,
                QSystemTrayIcon.ActivationReason.DoubleClick,
                QSystemTrayIcon.ActivationReason.MiddleClick
            ):
                window.bring_to_foreground()

        tray_icon.activated.connect(on_tray_activated)

        def update_tray_status():
            nonlocal last_notified_unread
            if not tray_icon:
                return
            unread = get_unread_count()
            pix = create_tray_pixmap(unread)
            tray_icon.setIcon(QIcon(pix))
            if unread > 0:
                tray_icon.setToolTip(f"MerkeMail - {unread} correo{'s' if unread != 1 else ''} sin leer")
                # Si llegaron correos nuevos mientras la ventana está oculta en segundo plano, mostrar notificación nativa
                if unread > last_notified_unread and not window.isVisible():
                    diff = unread - last_notified_unread
                    try:
                        tray_icon.showMessage(
                            "MerkeMail",
                            f"Tienes {diff} correo{'s' if diff != 1 else ''} nuevo{'s' if diff != 1 else ''}",
                            QSystemTrayIcon.MessageIcon.Information,
                            5000
                        )
                    except Exception:
                        pass
            else:
                tray_icon.setToolTip("MerkeMail - Todo al día (0 sin leer)")
            last_notified_unread = unread

        if is_tray_enabled():
            tray_icon.show()

        # Temporizador periódico cada 15 segundos para actualizar el estado del icono
        tray_timer = QTimer()
        tray_timer.timeout.connect(update_tray_status)
        tray_timer.start(15000)

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
