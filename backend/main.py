import os
import datetime
import logging
from pathlib import Path
from typing import Dict, Any, List, Optional
from fastapi import FastAPI, HTTPException, Query, Body, BackgroundTasks, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, HTMLResponse, RedirectResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from google.genai import types

logger = logging.getLogger(__name__)

from backend.database import get_db, init_db, set_setting, get_setting, AVATARS_DIR
from backend.email_service import EmailService, deleted_email_key
from backend.calendar_service import CalendarService
from backend.gemini_service import GeminiService
from backend.config_service import ConfigService
from backend.antigravity_agent import AntigravityMailAgent
from backend.google_oauth import GoogleOAuthService
from backend.contacts_service import ContactsService
from backend.crypto_service import CryptoService
import secrets
import threading

app = FastAPI(title="MerkeMail - Email & Calendar Manager")

# Habilitar CORS seguro restringido a orígenes locales
ALLOWED_ORIGINS = [
    "http://localhost:8000",
    "http://127.0.0.1:8000",
    "http://localhost:6524",
    "http://127.0.0.1:6524",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "frontend"
IMG_DIR = BASE_DIR / "img"

# Sin cabecera Cache-Control, el navegador (y el perfil persistente de la app de escritorio)
# puede reutilizar por caché heurística un index.html/JS antiguo durante horas tras actualizar
# la aplicación. "no-cache" obliga a revalidar con ETag en cada carga (respuesta 304 si no cambió).
_NO_CACHE_PATHS = ("/", "/sw.js", "/manifest.json")

@app.middleware("http")
async def _frontend_no_cache(request, call_next):
    response = await call_next(request)
    path = request.url.path
    if (path in _NO_CACHE_PATHS or path.startswith("/static/")) and "cache-control" not in response.headers:
        response.headers["Cache-Control"] = "no-cache"
    return response

# Montar archivos estáticos
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/img", StaticFiles(directory=str(IMG_DIR)), name="img")

def cleanup_local_attachments():
    """Elimina ficheros residuales locales en data/attachments para no almacenar archivos innecesariamente."""
    try:
        att_dir = BASE_DIR / "data" / "attachments"
        if att_dir.exists():
            for p in att_dir.iterdir():
                if p.is_file():
                    try:
                        p.unlink()
                    except Exception:
                        pass
        conn = get_db()
        conn.execute("UPDATE attachments SET file_path = NULL WHERE file_path IS NOT NULL")
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Aviso limpiando archivos adjuntos locales: {e}")

cleanup_local_attachments()

# Modelos Pydantic
class AccountCreate(BaseModel):
    name: str
    email: EmailStr
    provider: str # 'gmail', 'proton', 'custom'
    imap_host: str
    imap_port: int
    imap_ssl: int = 1
    imap_user: str
    imap_password: str
    smtp_host: str
    smtp_port: int
    smtp_ssl: int = 1
    color: str = "#3b82f6"
    sync_interval: Optional[int] = 5

class AccountUpdate(BaseModel):
    name: str
    email: EmailStr
    provider: str
    imap_host: str
    imap_port: int
    imap_ssl: int = 1
    imap_user: str
    imap_password: Optional[str] = None
    smtp_host: str
    smtp_port: int
    smtp_ssl: int = 1
    color: str = "#3b82f6"
    sync_interval: Optional[int] = 5

class EmailAttachment(BaseModel):
    filename: str
    content_type: Optional[str] = "application/octet-stream"
    data_base64: str
    size: Optional[int] = 0

class EmailSendRequest(BaseModel):
    account_id: int
    to_email: str
    subject: str
    body: str
    is_html: bool = False
    cc: Optional[str] = None
    bcc: Optional[str] = None
    attachments: Optional[List[EmailAttachment]] = []

class AIDraftRequest(BaseModel):
    prompt: str
    tone: str = "formal"
    language: str = "es"
    recipient_context: Optional[str] = ""
    current_draft: Optional[str] = ""

class SmartReplyRequest(BaseModel):
    user_instruction: Optional[str] = ""
    current_draft: Optional[str] = ""
    tone: Optional[str] = "formal"

class AICleanupRequest(BaseModel):
    prompt: str
    folder: Optional[str] = "ALL"
    account_id: Optional[int] = None
    all_accounts: bool = True

class CommitmentConvertRequest(BaseModel):
    email_id: int
    title: str
    target_type: str = "task"  # "task" | "note"
    due_hint: Optional[str] = ""

class AIClassifyBatchRequest(BaseModel):
    email_ids: Optional[List[int]] = None
    limit: Optional[int] = 50

class BatchDeleteRequest(BaseModel):
    email_ids: List[int]
    permanent: bool = False

class BatchActionRequest(BaseModel):
    email_ids: List[int]
    action: str  # 'archive', 'spam', 'trash', 'mark_read', 'mark_unread', 'toggle_read', 'star', 'unstar', 'add_label', 'remove_label', 'move_folder'
    folder: Optional[str] = None
    label_id: Optional[int] = None

class EventCreateRequest(BaseModel):
    calendar_id: Optional[int] = None
    title: str
    start_time: Optional[str] = ""
    end_time: Optional[str] = ""
    description: Optional[str] = ""
    location: Optional[str] = ""
    all_day: int = 0
    origin_email_id: Optional[int] = None
    is_task: Optional[int] = 0
    account_id: Optional[int] = None
    meeting_url: Optional[str] = ""
    color: Optional[str] = ""
    recurrence: Optional[str] = "none"
    notification_minutes: Optional[int] = 10
    attendees: Optional[str] = ""
    availability: Optional[str] = "busy"
    visibility: Optional[str] = "default"

class EventUpdateRequest(BaseModel):
    calendar_id: Optional[int] = None
    title: Optional[str] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    all_day: Optional[int] = None
    is_task: Optional[int] = None
    account_id: Optional[int] = None
    meeting_url: Optional[str] = None
    color: Optional[str] = None
    recurrence: Optional[str] = None
    notification_minutes: Optional[int] = None
    attendees: Optional[str] = None
    availability: Optional[str] = None
    visibility: Optional[str] = None

class TaskCreateRequest(BaseModel):
    calendar_id: Optional[int] = None
    title: str
    description: Optional[str] = ""
    due_date: Optional[str] = ""
    account_id: Optional[int] = None

class SignatureCreateRequest(BaseModel):
    name: str
    content: str
    account_id: Optional[int] = None
    is_default: int = 0

class LabelCreateRequest(BaseModel):
    name: str
    color: Optional[str] = "#3b82f6"
    account_id: Optional[int] = None

class EmailLabelRequest(BaseModel):
    label_id: int

import asyncio
import time

_last_calendar_sync = 0
_last_email_sync = {}

async def _periodic_contacts_sync():
    """Sincroniza periódicamente la libreta de contactos cada 15 minutos."""
    while True:
        try:
            await asyncio.sleep(900)  # 15 minutos
            await asyncio.to_thread(ContactsService.sync_contacts)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[Contacts] Error en sincronización periódica: {e}")

async def _periodic_background_sync_loop():
    """
    Sincronizador en segundo plano continuo del backend.
    Garantiza que, incluso cuando la aplicación esté oculta en el System Tray,
    se cumplan las sincronizaciones periódicas:
    1. Calendario: cada 5 minutos (300 segundos) como mínimo.
    2. Correos: según el intervalo configurado de cada cuenta activa (mínimo 5 min por defecto).
    """
    global _last_calendar_sync, _last_email_sync
    # Espera inicial breve para arranque ágil del backend
    await asyncio.sleep(3)
    
    while True:
        try:
            now = time.time()

            # 1. Sincronización periódica de Calendarios (cada 5 minutos = 300s)
            if now - _last_calendar_sync >= 300:
                _last_calendar_sync = now
                try:
                    await asyncio.to_thread(CalendarService.sync_account_calendars)
                    conn = get_db()
                    g_accounts = conn.execute("SELECT id FROM accounts WHERE is_active = 1 AND provider IN ('google', 'gmail')").fetchall()
                    conn.close()
                    for g_acc in g_accounts:
                        try:
                            await asyncio.to_thread(GoogleOAuthService.sync_google_calendar, g_acc["id"])
                            await asyncio.to_thread(GoogleOAuthService.sync_google_tasks, g_acc["id"])
                        except Exception as ge:
                            print(f"[Calendar Background Sync] Aviso en cuenta Google {g_acc['id']}: {ge}")
                    print("[Calendar Background Sync] Sincronización periódica de 5 minutos finalizada.")
                except Exception as ce:
                    print(f"[Calendar Background Sync] Error en sincronización: {ce}")

            # 2. Sincronización periódica de Correos (según sync_interval de cada cuenta activa)
            try:
                conn = get_db()
                accounts = conn.execute("SELECT id, name, email, sync_interval, is_active FROM accounts WHERE is_active = 1").fetchall()
                conn.close()

                for acc in accounts:
                    acc_id = acc["id"]
                    # Intervalo en minutos (mínimo 1 minuto, por defecto 5 min)
                    interval_min = int(acc["sync_interval"]) if acc["sync_interval"] is not None else 5
                    if interval_min < 1:
                        interval_min = 5
                    interval_sec = interval_min * 60

                    last_sync = _last_email_sync.get(acc_id, 0)
                    if now - last_sync >= interval_sec:
                        _last_email_sync[acc_id] = now
                        print(f"[Email Background Sync] Sincronizando cuenta {acc['email']} (cada {interval_min} min)...")
                        try:
                            # Sincroniza INBOX con hasta 30 correos recientes
                            await asyncio.to_thread(EmailService.sync_mailbox, acc_id, "INBOX", None, 30)
                        except Exception as ee:
                            print(f"[Email Background Sync] Error sincronizando {acc['email']}: {ee}")
            except Exception as dbe:
                print(f"[Email Background Sync] Error consultando cuentas: {dbe}")

        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[Background Sync Loop] Excepción no controlada: {e}")

        # Revisar cada 20 segundos
        await asyncio.sleep(20)

@app.on_event("startup")
async def on_startup():
    init_db()
    asyncio.create_task(asyncio.to_thread(ContactsService.sync_contacts))
    asyncio.create_task(_periodic_contacts_sync())
    asyncio.create_task(_periodic_background_sync_loop())

@app.get("/")
def serve_index():
    return FileResponse(STATIC_DIR / "index.html")

@app.get("/info")
@app.get("/info.html")
def serve_info():
    return FileResponse(STATIC_DIR / "info.html")

@app.get("/manifest.json")
def serve_manifest():
    return FileResponse(STATIC_DIR / "manifest.json", media_type="application/manifest+json")

@app.get("/sw.js")
def serve_sw():
    return FileResponse(STATIC_DIR / "sw.js", media_type="application/javascript")


# --- ENDPOINTS DE GOOGLE OAUTH 2.0 (SIGN IN WITH GOOGLE) ---
class GoogleCredentialsRequest(BaseModel):
    client_id: str
    client_secret: str

@app.get("/api/auth/google/config")
def get_google_oauth_config():
    cfg = GoogleOAuthService.get_credentials_config()
    return {
        "has_config": bool(cfg["client_id"] and cfg["client_secret"]),
        "client_id": cfg["client_id"]
    }

@app.post("/api/auth/google/config")
def save_google_oauth_config(req: GoogleCredentialsRequest):
    set_setting("google_client_id", req.client_id.strip())
    set_setting("google_client_secret", req.client_secret.strip())
    return {"success": True, "message": "Credenciales OAuth de Google guardadas exitosamente"}

@app.get("/api/auth/google/url")
def get_google_auth_url(request: Request, redirect_uri: Optional[str] = None):
    effective_uri = redirect_uri or f"{str(request.base_url).rstrip('/')}/api/auth/google/callback"
    csrf_state = secrets.token_urlsafe(32)
    set_setting("oauth_csrf_state", csrf_state)
    url = GoogleOAuthService.get_authorization_url(effective_uri, state=csrf_state)
    if not url:
        return {
            "has_config": False,
            "message": "Configura tu Client ID y Client Secret de Google Cloud Console primero."
        }
    return {"has_config": True, "url": url}

@app.get("/api/auth/google/callback", response_class=HTMLResponse)
def google_oauth_callback(request: Request, code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    if error:
        return HTMLResponse(content=f"""
            <html><body style="font-family: sans-serif; text-align: center; padding: 40px; background: #0f172a; color: #fff;">
                <h2 style="color: #ef4444;">Autenticación Cancelada</h2>
                <p>Google devolvió el error: {error}</p>
                <button onclick="window.close()" style="padding: 10px 20px; background: #334155; color: #fff; border: none; border-radius: 8px; cursor: pointer;">Cerrar Ventana</button>
            </body></html>
        """)

    expected_state = get_setting("oauth_csrf_state")
    if expected_state and state and state != expected_state:
        return HTMLResponse(content="""
            <html><body style="font-family: sans-serif; text-align: center; padding: 40px; background: #0f172a; color: #fff;">
                <h2 style="color: #ef4444;">Fallo de Validación CSRF</h2>
                <p>El token de estado de autenticación no coincide. Por seguridad se canceló la vinculación.</p>
                <button onclick="window.close()" style="padding: 10px 20px; background: #334155; color: #fff; border: none; border-radius: 8px; cursor: pointer;">Cerrar Ventana</button>
            </body></html>
        """, status_code=403)

    if not code:
        return HTMLResponse(content="<h3>No se recibió código de autorización</h3>")

    try:
        redirect_uri = f"{str(request.base_url).rstrip('/')}/api/auth/google/callback"
        result = GoogleOAuthService.exchange_code_for_tokens(code, redirect_uri)
        user_email = result.get("email", "")

        return HTMLResponse(content=f"""
            <!DOCTYPE html>
            <html>
            <head><title>Cuenta Conectada</title></head>
            <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f172a; color: #fff;">
                <div style="text-align: center; padding: 30px; background: #1e293b; border-radius: 16px; border: 1px solid #334155; max-width: 400px; box-shadow: 0 10px 25px rgba(0,0,0,0.5);">
                    <div style="width: 50px; height: 50px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                        <svg style="width: 28px; height: 28px; fill: white;" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                    </div>
                    <h2 style="margin: 0 0 8px; font-size: 18px;">¡Conexión Exitosa con Google!</h2>
                    <p style="color: #94a3b8; font-size: 14px; margin: 0 0 20px;">Tu cuenta <strong>{user_email}</strong> ha sido conectada y autorizada.</p>
                    <p style="color: #64748b; font-size: 12px;">Esta ventana se cerrará automáticamente...</p>
                </div>
                <script>
                    if (window.opener) {{
                        window.opener.postMessage({{ type: 'GOOGLE_AUTH_SUCCESS', email: '{user_email}' }}, '*');
                        setTimeout(() => window.close(), 1500);
                    }} else {{
                        setTimeout(() => window.location.href = '/', 1500);
                    }}
                </script>
            </body>
            </html>
        """)
    except Exception as e:
        return HTMLResponse(content=f"""
            <html><body style="font-family: sans-serif; text-align: center; padding: 40px; background: #0f172a; color: #fff;">
                <h2 style="color: #ef4444;">Error al Conectar Cuenta</h2>
                <p>{str(e)}</p>
                <button onclick="window.close()" style="padding: 10px 20px; background: #334155; color: #fff; border: none; border-radius: 8px; cursor: pointer;">Cerrar</button>
            </body></html>
        """)

# --- ENDPOINTS DE AJUSTES Y API KEYS ---
@app.get("/api/settings")
def get_settings():
    return ConfigService.get_settings()

@app.post("/api/settings")
def update_settings(data: Dict[str, Any] = Body(...)):
    return ConfigService.update_settings(data)

@app.post("/api/settings/test-gemini")
def test_gemini_key(data: Dict[str, str] = Body(...)):
    key = data.get("api_key", "")
    return ConfigService.test_gemini(key)

@app.post("/api/settings/models")
def get_available_models(data: Dict[str, str] = Body(...)):
    key = data.get("api_key", "")
    return GeminiService.list_models_fast(key)

# --- ENDPOINTS DE APLICACIÓN DE ESCRITORIO (LINUX / UBUNTU) ---
_desktop_window_callbacks = {
    "minimize": None,
    "maximize": None,
    "restore": None,
    "toggle_maximize": None,
    "close": None,
    "show": None,
    "is_maximized": lambda: False
}

def register_desktop_window_callbacks(minimize=None, maximize=None, restore=None, toggle_maximize=None, close=None, is_maximized=None, show=None):
    global _desktop_window_callbacks
    if minimize: _desktop_window_callbacks["minimize"] = minimize
    if maximize: _desktop_window_callbacks["maximize"] = maximize
    if restore: _desktop_window_callbacks["restore"] = restore
    if toggle_maximize: _desktop_window_callbacks["toggle_maximize"] = toggle_maximize
    if close: _desktop_window_callbacks["close"] = close
    if is_maximized: _desktop_window_callbacks["is_maximized"] = is_maximized
    if show: _desktop_window_callbacks["show"] = show

@app.post("/api/desktop/window/{action}")
def window_action(action: str):
    cb = _desktop_window_callbacks.get(action)
    if cb:
        try:
            res = cb()
            return {"success": True, "action": action, "result": res}
        except Exception as e:
            return {"success": False, "error": str(e)}

    # Si corre en subproceso Uvicorn separado, comunicar vía socket IPC con la ventana nativa
    try:
        import socket
        ipc_path = "/tmp/merkemail_window_ipc.sock"
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(2.0)
            client.connect(ipc_path)
            client.sendall(f"{action}\n".encode("utf-8"))
            resp = client.recv(1024).decode("utf-8").strip()
            return {"success": True, "action": action, "result": resp}
    except Exception as e:
        return {"success": False, "error": f"Controlador de ventana no alcanzable: {e}"}

@app.post("/api/desktop/open-url")
def desktop_open_url(data: dict = Body(...)):
    url = data.get("url", "").strip()
    if url and (url.startswith("http://") or url.startswith("https://") or url.startswith("mailto:")):
        import webbrowser
        try:
            webbrowser.open(url)
            return {"success": True, "opened": url}
        except Exception as e:
            return {"success": False, "error": str(e)}
    return {"success": False, "error": "URL no válida"}

class DesktopPrintPayload(BaseModel):
    html: str
    title: Optional[str] = "correo"
    options: Optional[Dict[str, Any]] = None

@app.post("/api/desktop/print-buffer")
def set_desktop_print_buffer(payload: DesktopPrintPayload):
    buffer_path = "/tmp/merkemail_print_doc.html"
    options_path = "/tmp/merkemail_print_options.json"
    try:
        with open(buffer_path, "w", encoding="utf-8") as f:
            f.write(payload.html)
        if payload.options:
            import json
            with open(options_path, "w", encoding="utf-8") as f:
                json.dump(payload.options, f)
        return {"success": True, "path": buffer_path}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error al escribir buffer de impresión: {e}")

@app.get("/api/desktop/window/state")
def window_state():
    is_max = False
    cb = _desktop_window_callbacks.get("is_maximized")
    if cb:
        try:
            is_max = cb()
        except Exception:
            pass
        return {"is_maximized": bool(is_max), "has_handler": True}

    # Intentar consultar vía socket IPC
    try:
        import socket
        ipc_path = "/tmp/merkemail_window_ipc.sock"
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as client:
            client.settimeout(1.0)
            client.connect(ipc_path)
            client.sendall(b"is_maximized\n")
            resp = client.recv(1024).decode("utf-8").strip()
            is_max = (resp == "true" or resp == "1")
            return {"is_maximized": is_max, "has_handler": True}
    except Exception:
        pass

    return {"is_maximized": False, "has_handler": False}

@app.get("/api/desktop/settings")
def get_desktop_settings():
    return ConfigService.get_desktop_settings()

@app.post("/api/desktop/settings")
def update_desktop_settings(data: Dict[str, Any] = Body(...)):
    return ConfigService.update_desktop_settings(data)

@app.post("/api/desktop/reinstall")
def reinstall_desktop():
    import subprocess
    script_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "scripts", "install_desktop.sh")
    if os.path.exists(script_path):
        res = subprocess.run([script_path], capture_output=True, text=True)
        if res.returncode == 0:
            return {"success": True, "message": "MerkeMail Desktop sincronizado e instalado exitosamente"}
        else:
            raise HTTPException(status_code=500, detail=res.stderr or "Error durante la instalación")
    raise HTTPException(status_code=404, detail="Script de instalación no encontrado")

# --- ENDPOINTS DE CUENTAS ---
@app.get("/api/accounts")
def list_accounts():
    conn = get_db()
    rows = conn.execute("SELECT id, name, email, provider, imap_host, imap_port, imap_user, smtp_host, smtp_port, is_active, color, sync_interval, avatar_url, is_default FROM accounts ORDER BY id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/api/accounts/default")
def get_default_account():
    conn = get_db()
    row = conn.execute("SELECT id, name, email, provider, is_active, color, sync_interval, avatar_url, is_default FROM accounts WHERE is_default = 1 LIMIT 1").fetchone()
    if not row:
        row = conn.execute("SELECT id, name, email, provider, is_active, color, sync_interval, avatar_url, is_default FROM accounts ORDER BY id ASC LIMIT 1").fetchone()
    conn.close()
    if not row:
        return None
    return dict(row)

@app.post("/api/accounts/{account_id}/default")
def set_default_account(account_id: int):
    conn = get_db()
    acc = conn.execute("SELECT id, name, email, avatar_url, color FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if not acc:
        conn.close()
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    conn.execute("UPDATE accounts SET is_default = 0")
    conn.execute("UPDATE accounts SET is_default = 1 WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()
    set_setting("default_account_id", str(account_id))
    return {
        "success": True, 
        "account": dict(acc), 
        "message": f"'{acc['name'] or acc['email']}' establecida como cuenta por defecto"
    }

@app.get("/api/avatar/{email:path}")
def get_avatar_for_email(email: str):
    """Devuelve o descarga y almacena en caché en disco el avatar oficial para la cuenta o contacto."""
    clean_email = email.lower().strip()
    if "<" in clean_email and ">" in clean_email:
        clean_email = clean_email.split("<")[1].split(">")[0].strip()

    import hashlib
    email_hash = hashlib.sha256(clean_email.encode("utf-8")).hexdigest()
    cache_path = AVATARS_DIR / f"{email_hash}.png"

    # 1. Comprobar si ya existe en la caché local en disco y no está vacío
    if cache_path.exists() and cache_path.stat().st_size > 0:
        return FileResponse(
            cache_path,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=2592000, immutable"}
        )

    # 2. Buscar si coincide con alguna cuenta registrada con avatar_url
    target_url = None
    conn = get_db()
    row = conn.execute("SELECT avatar_url FROM accounts WHERE LOWER(email) = ?", (clean_email,)).fetchone()
    if row and row["avatar_url"]:
        target_url = row["avatar_url"]
    else:
        # 3. Buscar si en la libreta de contactos tiene avatar_url explícito (no autorreferente)
        crow = conn.execute("""
            SELECT avatar_url FROM contacts 
            WHERE LOWER(email) = ? AND avatar_url IS NOT NULL 
              AND avatar_url != '' AND avatar_url NOT LIKE '/api/avatar%'
        """, (clean_email,)).fetchone()
        if crow and crow["avatar_url"]:
            target_url = crow["avatar_url"]
    conn.close()

    # 4. Si no hay URL directa, usar favicon en alta resolución del dominio del remitente
    if not target_url:
        domain = clean_email.split("@")[-1] if "@" in clean_email else clean_email
        domain = domain.strip("<>[](), ")
        if domain and "." in domain:
            target_url = f"https://www.google.com/s2/favicons?domain={domain}&sz=128"

    if not target_url:
        raise HTTPException(status_code=404, detail="Avatar no disponible")

    # 5. Descargar imagen y persistirla en caché local en disco
    try:
        import urllib.request
        import urllib.error
        req = urllib.request.Request(
            target_url,
            headers={"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) MerkeMail/1.0"}
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            content_type = response.headers.get("content-type", "image/png")
            data = response.read()
            if data and len(data) > 0:
                with open(cache_path, "wb") as f:
                    f.write(data)
                return FileResponse(
                    cache_path,
                    media_type=content_type,
                    headers={"Cache-Control": "public, max-age=2592000, immutable"}
                )
    except urllib.error.HTTPError as he:
        if he.code == 404:
            raise HTTPException(status_code=404, detail="Avatar no disponible")
        return RedirectResponse(
            url=target_url,
            status_code=307,
            headers={"Cache-Control": "public, max-age=86400"}
        )
    except Exception:
        # Fallback de redirección si no hay conexión o falla la descarga temporalmente
        return RedirectResponse(
            url=target_url,
            status_code=307,
            headers={"Cache-Control": "public, max-age=86400"}
        )

    raise HTTPException(status_code=404, detail="Avatar no disponible")

# ================= SINCRONIZACIÓN TOTAL EN BACKGROUND =================
_full_sync_lock = threading.Lock()
_full_sync_state = {
    "is_syncing": False,
    "account_id": None,
    "account_name": "",
    "account_email": "",
    "current_folder": "",
    "folder_index": 0,
    "total_folders": 0,
    "synced_count": 0,
    "total_synced": 0,
    "percent": 0,
    "message": "",
    "status": "idle",  # "idle", "running", "completed", "error"
    "error": None
}

def _run_account_full_sync(account_id: int):
    global _full_sync_state
    try:
        account = EmailService.get_account(account_id)
        if not account:
            with _full_sync_lock:
                _full_sync_state["is_syncing"] = False
                _full_sync_state["status"] = "error"
                _full_sync_state["error"] = "Cuenta no encontrada"
                _full_sync_state["message"] = "Error: Cuenta no encontrada"
            return

        with _full_sync_lock:
            _full_sync_state["is_syncing"] = True
            _full_sync_state["account_id"] = account["id"]
            _full_sync_state["account_name"] = account["name"]
            _full_sync_state["account_email"] = account["email"]
            _full_sync_state["status"] = "running"
            _full_sync_state["folder_index"] = 0
            _full_sync_state["total_synced"] = 0
            _full_sync_state["synced_count"] = 0
            _full_sync_state["percent"] = 5
            _full_sync_state["error"] = None
            _full_sync_state["message"] = f"Obteniendo carpetas del servidor..."

        # Obtener lista completa de carpetas y etiquetas
        targets = EmailService.get_account_folders(account_id)
        if not targets:
            targets = [{"id": "INBOX", "name": "Bandeja de Entrada", "type": "folder", "key": "INBOX"}]

        total_targets = len(targets)
        total_synced = 0

        with _full_sync_lock:
            _full_sync_state["total_folders"] = total_targets

        for idx, target in enumerate(targets):
            folder_name = target["name"]
            folder_key = target.get("key") or target.get("id")
            label_id = target.get("label_id")

            with _full_sync_lock:
                _full_sync_state["folder_index"] = idx + 1
                _full_sync_state["current_folder"] = folder_name
                _full_sync_state["percent"] = int(((idx) / total_targets) * 100)
                _full_sync_state["message"] = f"Sincronizando {folder_name} ({idx+1}/{total_targets})..."

            try:
                if target.get("type") == "label" and label_id:
                    res = EmailService.sync_mailbox(account_id, folder=None, label_id=label_id, max_emails=0, all_pages=True)
                else:
                    res = EmailService.sync_mailbox(account_id, folder=folder_key, label_id=None, max_emails=0, all_pages=True)

                if res.get("success"):
                    count = res.get("synced_count", 0)
                    total_synced += count
                    with _full_sync_lock:
                        _full_sync_state["synced_count"] = count
                        _full_sync_state["total_synced"] = total_synced
            except Exception as f_err:
                print(f"Aviso sincronizando carpeta {folder_name} en background: {f_err}")

            with _full_sync_lock:
                _full_sync_state["percent"] = int(((idx + 1) / total_targets) * 100)

        with _full_sync_lock:
            _full_sync_state["is_syncing"] = False
            _full_sync_state["status"] = "completed"
            _full_sync_state["percent"] = 100
            _full_sync_state["message"] = f"Sincronización total completada ({total_synced} correos procesados)"

    except Exception as exc:
        print(f"Error crítico en sincronización en background: {exc}")
        with _full_sync_lock:
            _full_sync_state["is_syncing"] = False
            _full_sync_state["status"] = "error"
            _full_sync_state["error"] = str(exc)
            _full_sync_state["message"] = f"Error en sincronización: {str(exc)}"

@app.get("/api/accounts/sync-status")
def get_account_sync_status():
    """Consulta el estado en vivo de la sincronización en background."""
    with _full_sync_lock:
        return dict(_full_sync_state)

@app.post("/api/accounts/{account_id}/sync-full")
def start_account_full_sync(account_id: int):
    """Inicia la sincronización total de todas las carpetas del servidor en background."""
    global _full_sync_state
    with _full_sync_lock:
        if _full_sync_state.get("is_syncing"):
            return {
                "success": False,
                "error": "Ya hay una sincronización en segundo plano en ejecución",
                "state": dict(_full_sync_state)
            }

    account = EmailService.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")

    sync_thread = threading.Thread(target=_run_account_full_sync, args=(account_id,), daemon=True)
    sync_thread.start()

    return {
        "success": True,
        "message": f"Sincronización total iniciada en background para {account['email']}",
        "account_id": account_id
    }

@app.get("/api/accounts/{account_id}")
def get_account_detail(account_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    data = dict(row)
    # Seguridad crítica: nunca exponer contraseñas ni tokens OAuth en respuestas JSON
    data["imap_password"] = ""
    data["has_password"] = bool(row["imap_password"])
    data["has_oauth_token"] = bool(row["oauth_refresh_token"])
    data.pop("oauth_access_token", None)
    data.pop("oauth_refresh_token", None)
    return data

@app.post("/api/accounts")
def create_account(account: AccountCreate):
    conn = get_db()
    try:
        cursor = conn.cursor()
        interval = account.sync_interval if account.sync_interval is not None else 5
        imap_user = (account.imap_user or "").strip() or account.email
        if imap_user.endswith("@gmail.com") and not account.email.endswith("@gmail.com") and "gmail.com" not in (account.imap_host or ""):
            imap_user = account.email

        # Cifrar contraseña de correo de forma transparente
        encrypted_pass = CryptoService.encrypt(account.imap_password) if account.imap_password else ""

        cursor.execute('''
            INSERT INTO accounts (name, email, provider, imap_host, imap_port, imap_ssl, imap_user, imap_password, smtp_host, smtp_port, smtp_ssl, color, sync_interval)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            account.name, account.email, account.provider, account.imap_host, account.imap_port,
            account.imap_ssl, imap_user, encrypted_pass, account.smtp_host,
            account.smtp_port, account.smtp_ssl, account.color, interval
        ))
        conn.commit()
        acc_id = cursor.lastrowid
        return {"success": True, "id": acc_id, "message": "Cuenta agregada exitosamente"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.put("/api/accounts/{account_id}")
def update_account(account_id: int, account: AccountUpdate):
    conn = get_db()
    try:
        cursor = conn.cursor()
        interval = account.sync_interval if account.sync_interval is not None else 5
        imap_user = (account.imap_user or "").strip() or account.email
        if imap_user.endswith("@gmail.com") and not account.email.endswith("@gmail.com") and "gmail.com" not in (account.imap_host or ""):
            imap_user = account.email

        if account.imap_password and account.imap_password.strip():
            encrypted_pass = CryptoService.encrypt(account.imap_password)
            cursor.execute('''
                UPDATE accounts SET name = ?, email = ?, provider = ?, imap_host = ?, imap_port = ?,
                imap_ssl = ?, imap_user = ?, imap_password = ?, smtp_host = ?, smtp_port = ?, smtp_ssl = ?, color = ?, sync_interval = ?
                WHERE id = ?
            ''', (
                account.name, account.email, account.provider, account.imap_host, account.imap_port,
                account.imap_ssl, imap_user, encrypted_pass, account.smtp_host,
                account.smtp_port, account.smtp_ssl, account.color, interval, account_id
            ))
        else:
            cursor.execute('''
                UPDATE accounts SET name = ?, email = ?, provider = ?, imap_host = ?, imap_port = ?,
                imap_ssl = ?, imap_user = ?, smtp_host = ?, smtp_port = ?, smtp_ssl = ?, color = ?, sync_interval = ?
                WHERE id = ?
            ''', (
                account.name, account.email, account.provider, account.imap_host, account.imap_port,
                account.imap_ssl, imap_user, account.smtp_host, account.smtp_port,
                account.smtp_ssl, account.color, interval, account_id
            ))
        conn.commit()
        return {"success": True, "message": "Cuenta actualizada exitosamente"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.post("/api/accounts/test")
def test_account_connection(account: AccountCreate):
    acc_data = account.model_dump()
    imap_user = (acc_data.get("imap_user") or "").strip() or acc_data.get("email", "")
    if imap_user.endswith("@gmail.com") and not acc_data.get("email", "").endswith("@gmail.com") and "gmail.com" not in (acc_data.get("imap_host") or ""):
        imap_user = acc_data.get("email", "")
    acc_data["imap_user"] = imap_user
    result = EmailService.test_connection(acc_data)
    return result

@app.post("/api/accounts/{account_id}/test")
def test_saved_account(account_id: int):
    account = EmailService.get_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="Cuenta no encontrada")
    result = EmailService.test_connection(account)
    return result

@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: int):
    conn = get_db()
    conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Cuenta eliminada correctamente"}

@app.get("/api/image-proxy")
def image_proxy(url: str = Query(..., description="URL de la imagen remota a servir")):
    """Proxy seguro para servir imágenes remotas de correos con protección contra bloqueo de hotlinking."""
    if not url or not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(status_code=400, detail="URL inválida")
    try:
        import requests
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
        }
        try:
            res = requests.get(url, headers=headers, timeout=12)
        except requests.exceptions.SSLError:
            res = requests.get(url, headers=headers, timeout=12, verify=False)
        content_type = res.headers.get("content-type", "image/jpeg")
        return Response(content=res.content, media_type=content_type, headers={"Cache-Control": "public, max-age=604800"})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"No se pudo cargar la imagen remota: {e}")

@app.get("/api/attachments/{attachment_id}/download")
def download_attachment(attachment_id: int):
    """Descarga el contenido de un archivo adjunto bajo demanda directamente por streaming sin guardarlo en disco local."""
    conn = get_db()
    row = conn.execute('''
        SELECT a.id, a.email_id, a.filename, a.content_type, a.size, a.remote_id, a.file_path,
               e.account_id, e.uid, e.folder, e.source_folder, acc.provider, acc.auth_type
        FROM attachments a
        JOIN emails e ON a.email_id = e.id
        JOIN accounts acc ON e.account_id = acc.id
        WHERE a.id = ?
    ''', (attachment_id,)).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Archivo adjunto no encontrado")

    filename = row["filename"] or f"adjunto_{attachment_id}"
    content_type = row["content_type"] or "application/octet-stream"
    file_path = row["file_path"]

    import urllib.parse
    safe_filename = "".join(c for c in filename if c.isalnum() or c in "._- ")
    if not safe_filename:
        safe_filename = f"adjunto_{attachment_id}"
    encoded_fn = urllib.parse.quote(filename)
    headers = {
        "Content-Disposition": f'attachment; filename="{safe_filename}"; filename*=UTF-8\'\'{encoded_fn}',
        "Cache-Control": "no-cache, no-store, must-revalidate"
    }

    # 1. Si existe archivo residual de versiones previas en disco, leerlo y limpiarlo
    if file_path and os.path.exists(file_path):
        try:
            with open(file_path, "rb") as f:
                raw_bytes = f.read()
            # Eliminar copia local innecesaria en la app
            try:
                os.remove(file_path)
                conn = get_db()
                conn.execute("UPDATE attachments SET file_path = NULL WHERE id = ?", (attachment_id,))
                conn.commit()
                conn.close()
            except Exception:
                pass
            headers["Content-Length"] = str(len(raw_bytes))
            return Response(content=raw_bytes, media_type=content_type, headers=headers)
        except Exception:
            pass

    # 2. Si proviene de Google OAuth y tiene remote_id (Gmail API bajo demanda)
    if (row["provider"] in ("google", "gmail") or row["auth_type"] == "oauth2") and row["remote_id"]:
        try:
            creds = GoogleOAuthService.get_valid_credentials(row["account_id"])
            if not creds:
                raise HTTPException(status_code=401, detail="Credenciales expiradas para esta cuenta")
            from googleapiclient.discovery import build
            import base64
            service = build('gmail', 'v1', credentials=creds)
            att_resp = service.users().messages().attachments().get(
                userId='me', messageId=row["uid"], id=row["remote_id"]
            ).execute()
            data_b64 = att_resp.get("data", "")
            raw_bytes = base64.urlsafe_b64decode(data_b64)

            # Entregar directamente por streaming al usuario sin escribir a disco local
            headers["Content-Length"] = str(len(raw_bytes))
            return Response(content=raw_bytes, media_type=content_type, headers=headers)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error obteniendo adjunto desde Gmail: {e}")

    # 3. Si proviene de una cuenta IMAP tradicional, extraer bajo demanda del buzón remoto
    if row["account_id"] and row["uid"]:
        try:
            account = EmailService.get_account(row["account_id"])
            if account and account.get("auth_type") != "oauth2":
                import ssl, imaplib, email as email_pkg
                from backend.crypto_service import CryptoService
                is_local = "127.0.0.1" in account["imap_host"] or "localhost" in account["imap_host"]
                if account.get("imap_ssl", 1):
                    ctx = ssl.create_default_context()
                    if is_local:
                        ctx.check_hostname = False
                        ctx.verify_mode = ssl.CERT_NONE
                    mail = imaplib.IMAP4_SSL(account["imap_host"], int(account["imap_port"]), ssl_context=ctx)
                else:
                    mail = imaplib.IMAP4(account["imap_host"], int(account["imap_port"]))
                raw_pass = CryptoService.decrypt(account.get("imap_password", "")) or ""
                mail.login(account["imap_user"].strip(), raw_pass.replace(" ", "").strip())
                if row["source_folder"]:
                    # Buzón real del servidor + UID estable (la carpeta local puede ser ARCHIVE, SPAM...)
                    from backend.email_service import _quote_mailbox
                    mail.select(_quote_mailbox(row["source_folder"]), readonly=True)
                    res, msg_data = mail.uid("fetch", str(row["uid"]).encode(), "(RFC822)")
                else:
                    # Correos sincronizados por versiones anteriores (número de secuencia)
                    mail.select(row["folder"] or "INBOX", readonly=True)
                    res, msg_data = mail.fetch(str(row["uid"]).encode(), "(RFC822)")
                mail.logout()
                raw_part = next((p for p in (msg_data or []) if isinstance(p, tuple) and len(p) > 1), None)
                if res == "OK" and raw_part:
                    msg = email_pkg.message_from_bytes(raw_part[1])
                    for part in msg.walk():
                        part_fn = part.get_filename()
                        if part_fn:
                            from backend.email_service import decode_mime_header
                            dec_fn = decode_mime_header(part_fn)
                            if dec_fn == filename or dec_fn == row["filename"]:
                                raw_bytes = part.get_payload(decode=True)
                                if raw_bytes:
                                    headers["Content-Length"] = str(len(raw_bytes))
                                    return Response(content=raw_bytes, media_type=content_type, headers=headers)
        except Exception as imap_err:
            print(f"Error descargando adjunto IMAP bajo demanda: {imap_err}")

    raise HTTPException(status_code=404, detail="El contenido del archivo no está disponible")

# --- ENDPOINTS DE CORREOS ---
@app.get("/api/emails/unread-counts")
def get_unread_counts(account_id: Optional[int] = None):
    conn = get_db()
    acc_filter = " AND account_id = ?" if account_id else ""
    acc_param = (account_id,) if account_id else ()

    # Consulta única agrupada por carpeta y destacado para máxima velocidad
    grouped_rows = conn.execute(
        f"SELECT UPPER(COALESCE(folder, '')) as folder, is_starred, COUNT(*) as cnt FROM emails WHERE is_read = 0{acc_filter} GROUP BY UPPER(COALESCE(folder, '')), is_starred",
        acc_param
    ).fetchall()

    inbox_folders = {"INBOX", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS"}
    excluded_from_all = {"TRASH", "SPAM", "DRAFT", "DRAFTS"}
    inbox_cnt = 0
    starred_cnt = 0
    all_cnt = 0
    folder_totals: Dict[str, int] = {}

    for r in grouped_rows:
        f = (r["folder"] or "INBOX").upper()
        c = r["cnt"] or 0
        if f not in excluded_from_all:
            all_cnt += c
            if r["is_starred"]:
                starred_cnt += c
        if f in inbox_folders:
            inbox_cnt += c
        folder_totals[f] = folder_totals.get(f, 0) + c

    # Conteo para IMPORTANT (de inbox, categorías y archivo, excluyendo TRASH, SPAM, DRAFT, DRAFTS)
    acc_e_filter = " AND emails.account_id = ?" if account_id else ""
    imp_row = conn.execute(
        f"""SELECT COUNT(DISTINCT emails.id) as cnt FROM emails 
            WHERE emails.is_read = 0{acc_e_filter}
            AND (
                UPPER(COALESCE(emails.folder, '')) = 'IMPORTANT'
                OR emails.ai_urgency = 'alta'
                OR emails.id IN (
                    SELECT email_id FROM email_labels el
                    JOIN labels l ON el.label_id = l.id
                    WHERE UPPER(l.name) IN ('IMPORTANT', 'IMPORTANTE') OR UPPER(l.remote_id) = 'IMPORTANT'
                )
            )
            AND UPPER(COALESCE(emails.folder, '')) NOT IN ('TRASH', 'SPAM', 'DRAFT', 'DRAFTS')""",
        acc_param
    ).fetchone()
    important_cnt = imp_row["cnt"] if imp_row else 0

    folders_dict = {
        "INBOX": inbox_cnt,
        "STARRED": starred_cnt,
        "ALL": all_cnt,
        "SENT": folder_totals.get("SENT", 0),
        "DRAFT": folder_totals.get("DRAFT", 0) + folder_totals.get("DRAFTS", 0),
        "SPAM": folder_totals.get("SPAM", 0),
        "TRASH": folder_totals.get("TRASH", 0),
        "IMPORTANT": important_cnt,
        "CATEGORY_PROMOTIONS": folder_totals.get("CATEGORY_PROMOTIONS", 0),
        "CATEGORY_SOCIAL": folder_totals.get("CATEGORY_SOCIAL", 0),
        "CATEGORY_UPDATES": folder_totals.get("CATEGORY_UPDATES", 0),
        "CATEGORY_FORUMS": folder_totals.get("CATEGORY_FORUMS", 0),
        "ACTUALIZACIONES": folder_totals.get("CATEGORY_UPDATES", 0),
        "NOTIFICACIONES": folder_totals.get("CATEGORY_UPDATES", 0)
    }
    for f_name, f_cnt in folder_totals.items():
        if f_name not in folders_dict:
            folders_dict[f_name] = f_cnt

    # Conteos por etiquetas (labels)
    acc_label_filter = " AND e.account_id = ?" if account_id else ""
    label_rows = conn.execute(
        f"""SELECT el.label_id, COUNT(DISTINCT e.id) as cnt 
            FROM email_labels el 
            JOIN emails e ON el.email_id = e.id 
            WHERE e.is_read = 0{acc_label_filter} 
            GROUP BY el.label_id""",
        acc_param
    ).fetchall()
    labels_dict = {str(r["label_id"]): r["cnt"] for r in label_rows}

    conn.close()
    return {
        "folders": folders_dict,
        "labels": labels_dict
    }

@app.get("/api/emails")
def get_emails(
    folder: Optional[str] = "INBOX",
    account_id: Optional[int] = None,
    label_id: Optional[int] = None,
    label_ids: Optional[str] = None,
    search: Optional[str] = None,
    sender: Optional[str] = None,
    recipient: Optional[str] = None,
    subject: Optional[str] = None,
    has_attachments: Optional[bool] = None,
    is_starred: Optional[bool] = None,
    read_status: Optional[str] = None,
    unread_only: bool = False,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    ai_urgency: Optional[str] = None,
    page: int = 1,
    page_size: int = 15,
    auto_sync: bool = True
):
    conn = get_db()

    # Si no se pasó account_id, obtener la cuenta activa principal
    effective_acc_id = account_id
    if not effective_acc_id:
        acc = conn.execute("SELECT id FROM accounts WHERE is_active = 1 ORDER BY id ASC LIMIT 1").fetchone()
        if acc:
            effective_acc_id = acc["id"]

    query = '''
        SELECT emails.id, emails.account_id, emails.uid, emails.folder, emails.sender,
               emails.sender_name, emails.recipient, emails.subject, emails.snippet,
               emails.date, emails.is_read, emails.is_starred, emails.has_attachments,
               emails.ai_urgency, accounts.name as account_name, accounts.color as account_color,
               accounts.email as account_email, accounts.avatar_url as account_avatar_url
        FROM emails
        LEFT JOIN accounts ON emails.account_id = accounts.id
        WHERE 1=1
    '''
    count_query = "SELECT COUNT(*) as total FROM emails WHERE 1=1"
    params = []

    # 1. Filtro de Etiquetas (Múltiples o Individual)
    if label_ids and label_ids.strip():
        l_ids = [int(x.strip()) for x in label_ids.split(",") if x.strip().isdigit()]
        if l_ids:
            ph = ",".join("?" * len(l_ids))
            query += f" AND emails.id IN (SELECT email_id FROM email_labels WHERE label_id IN ({ph}))"
            count_query += f" AND emails.id IN (SELECT email_id FROM email_labels WHERE label_id IN ({ph}))"
            params.extend(l_ids)
    elif label_id:
        query += " AND emails.id IN (SELECT email_id FROM email_labels WHERE label_id = ?)"
        count_query += " AND emails.id IN (SELECT email_id FROM email_labels WHERE label_id = ?)"
        params.append(label_id)

    # 2. Filtro de Carpeta
    folder_upper = folder.upper() if folder else ""
    if folder_upper in ["ACTUALIZACIONES", "NOTIFICACIONES", "UPDATES"]:
        folder_upper = "CATEGORY_UPDATES"
    elif folder_upper in ["PROMOCIONES", "PROMOTIONS"]:
        folder_upper = "CATEGORY_PROMOTIONS"
    elif folder_upper in ["FOROS", "FORUMS"]:
        folder_upper = "CATEGORY_FORUMS"
    elif folder_upper in ["DESTACADOS", "STARRED"]:
        folder_upper = "STARRED"
    elif folder_upper in ["IMPORTANTES", "IMPORTANTE", "IMPORTANT"]:
        folder_upper = "IMPORTANT"
    elif folder_upper in ["ENVIADOS", "SENT"]:
        folder_upper = "SENT"
    elif folder_upper in ["BORRADORES", "DRAFT", "DRAFTS"]:
        folder_upper = "DRAFT"
    elif folder_upper in ["PAPELERA", "TRASH"]:
        folder_upper = "TRASH"
    elif folder_upper in ["RECIBIDOS", "INBOX"]:
        folder_upper = "INBOX"
    if folder_upper == "STARRED":
        query += " AND emails.is_starred = 1 AND UPPER(COALESCE(emails.folder, '')) NOT IN ('TRASH', 'SPAM', 'DRAFT', 'DRAFTS')"
        count_query += " AND emails.is_starred = 1 AND UPPER(COALESCE(emails.folder, '')) NOT IN ('TRASH', 'SPAM', 'DRAFT', 'DRAFTS')"
    elif not folder or folder_upper in ["ALL", "TODOS"]:
        query += " AND UPPER(COALESCE(emails.folder, '')) NOT IN ('TRASH', 'SPAM', 'DRAFT', 'DRAFTS')"
        count_query += " AND UPPER(COALESCE(emails.folder, '')) NOT IN ('TRASH', 'SPAM', 'DRAFT', 'DRAFTS')"
    elif folder_upper == "IMPORTANT":
        imp_filter = """ AND (
            UPPER(COALESCE(emails.folder, '')) = 'IMPORTANT'
            OR emails.ai_urgency = 'alta'
            OR emails.id IN (
                SELECT email_id FROM email_labels el
                JOIN labels l ON el.label_id = l.id
                WHERE UPPER(l.name) IN ('IMPORTANT', 'IMPORTANTE') OR UPPER(l.remote_id) = 'IMPORTANT'
            )
        ) AND UPPER(COALESCE(emails.folder, '')) NOT IN ('TRASH', 'SPAM', 'DRAFT', 'DRAFTS')"""
        query += imp_filter
        count_query += imp_filter
    elif folder_upper in ["CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS"]:
        cat_filter = """ AND (
            UPPER(emails.folder) = ?
            OR emails.id IN (
                SELECT email_id FROM email_labels el
                JOIN labels l ON el.label_id = l.id
                WHERE UPPER(l.name) = ? OR UPPER(l.remote_id) = ?
            )
        ) AND UPPER(COALESCE(emails.folder, '')) NOT IN ('TRASH', 'SPAM', 'DRAFT', 'DRAFTS')"""
        query += cat_filter
        count_query += cat_filter
        params.extend([folder_upper, folder_upper, folder_upper])
    elif folder_upper == "SENT":
        query += " AND UPPER(emails.folder) = 'SENT'"
        count_query += " AND UPPER(emails.folder) = 'SENT'"
    elif folder_upper in ["DRAFT", "DRAFTS"]:
        query += " AND UPPER(emails.folder) IN ('DRAFT', 'DRAFTS')"
        count_query += " AND UPPER(emails.folder) IN ('DRAFT', 'DRAFTS')"
    elif folder_upper == "SPAM":
        query += " AND UPPER(emails.folder) = 'SPAM'"
        count_query += " AND UPPER(emails.folder) = 'SPAM'"
    elif folder_upper == "TRASH":
        query += " AND UPPER(emails.folder) = 'TRASH'"
        count_query += " AND UPPER(emails.folder) = 'TRASH'"
    elif folder_upper == "INBOX":
        query += " AND UPPER(emails.folder) IN ('INBOX', 'CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS') AND UPPER(COALESCE(emails.folder, '')) NOT IN ('TRASH', 'SPAM', 'DRAFT', 'DRAFTS')"
        count_query += " AND UPPER(emails.folder) IN ('INBOX', 'CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS') AND UPPER(COALESCE(emails.folder, '')) NOT IN ('TRASH', 'SPAM', 'DRAFT', 'DRAFTS')"
    elif folder_upper in ["ARCHIVE", "ARCHIVED"]:
        query += " AND UPPER(emails.folder) IN ('ARCHIVE', 'ARCHIVED') AND UPPER(COALESCE(emails.folder, '')) NOT IN ('TRASH', 'SPAM', 'DRAFT', 'DRAFTS')"
        count_query += " AND UPPER(emails.folder) IN ('ARCHIVE', 'ARCHIVED') AND UPPER(COALESCE(emails.folder, '')) NOT IN ('TRASH', 'SPAM', 'DRAFT', 'DRAFTS')"
    elif folder:
        query += " AND UPPER(emails.folder) = ?"
        count_query += " AND UPPER(emails.folder) = ?"
        params.append(folder_upper)
    
    # 3. Cuenta
    if account_id:
        query += " AND emails.account_id = ?"
        count_query += " AND emails.account_id = ?"
        params.append(account_id)

    # 4. Estado de Lectura
    if read_status == "unread" or unread_only:
        query += " AND emails.is_read = 0"
        count_query += " AND emails.is_read = 0"
    elif read_status == "read":
        query += " AND emails.is_read = 1"
        count_query += " AND emails.is_read = 1"

    # 5. Remitente
    if sender and sender.strip():
        s_param = f"%{sender.strip()}%"
        query += " AND (emails.sender LIKE ? OR emails.sender_name LIKE ?)"
        count_query += " AND (emails.sender LIKE ? OR emails.sender_name LIKE ?)"
        params.extend([s_param, s_param])

    # 6. Destinatario
    if recipient and recipient.strip():
        r_param = f"%{recipient.strip()}%"
        query += " AND emails.recipient LIKE ?"
        count_query += " AND emails.recipient LIKE ?"
        params.append(r_param)

    # 7. Asunto
    if subject and subject.strip():
        sub_param = f"%{subject.strip()}%"
        query += " AND emails.subject LIKE ?"
        count_query += " AND emails.subject LIKE ?"
        params.append(sub_param)

    # 8. Archivos Adjuntos
    if has_attachments is True:
        query += " AND emails.has_attachments = 1"
        count_query += " AND emails.has_attachments = 1"
    elif has_attachments is False:
        query += " AND (emails.has_attachments = 0 OR emails.has_attachments IS NULL)"
        count_query += " AND (emails.has_attachments = 0 OR emails.has_attachments IS NULL)"

    # 9. Destacados / Estrella
    if is_starred is True:
        query += " AND emails.is_starred = 1"
        count_query += " AND emails.is_starred = 1"
    elif is_starred is False:
        query += " AND (emails.is_starred = 0 OR emails.is_starred IS NULL)"
        count_query += " AND (emails.is_starred = 0 OR emails.is_starred IS NULL)"

    # 10. Rango de Fechas y Horas (con normalización ISO)
    if date_from and date_from.strip():
        d_from = date_from.strip().replace("T", " ")
        if len(d_from) == 16:
            d_from += ":00"
        query += " AND REPLACE(emails.date, 'T', ' ') >= ?"
        count_query += " AND REPLACE(emails.date, 'T', ' ') >= ?"
        params.append(d_from)

    if date_to and date_to.strip():
        d_to = date_to.strip().replace("T", " ")
        if len(d_to) == 16:
            d_to += ":59"
        query += " AND REPLACE(emails.date, 'T', ' ') <= ?"
        count_query += " AND REPLACE(emails.date, 'T', ' ') <= ?"
        params.append(d_to)

    # 11. Urgencia IA
    if ai_urgency and ai_urgency.strip():
        query += " AND LOWER(emails.ai_urgency) = LOWER(?)"
        count_query += " AND LOWER(emails.ai_urgency) = LOWER(?)"
        params.append(ai_urgency.strip())

    # 12. Búsqueda Global por Palabra Clave
    if search and search.strip():
        search_param = f"%{search.strip()}%"
        query += " AND (emails.subject LIKE ? OR emails.sender LIKE ? OR emails.snippet LIKE ? OR emails.body_text LIKE ?)"
        count_query += " AND (emails.subject LIKE ? OR emails.sender LIKE ? OR emails.snippet LIKE ? OR emails.body_text LIKE ?)"
        params.extend([search_param, search_param, search_param, search_param])

    # Total de registros
    total_records = conn.execute(count_query, params).fetchone()["total"]

    # Si no hay registros y auto_sync está habilitado (y no es una búsqueda manual), lanzar sincronización en segundo plano sin bloquear la lista
    has_advanced = bool(search or sender or recipient or subject or date_from or date_to or label_ids or has_attachments is not None or is_starred is not None or read_status or ai_urgency)
    bg_sync_triggered = False
    if total_records == 0 and auto_sync and not has_advanced:
        try:
            if account_id:
                sync_accs = [account_id]
            else:
                acc_rows = conn.execute("SELECT id FROM accounts WHERE is_active = 1").fetchall()
                sync_accs = [r["id"] for r in acc_rows]

            if sync_accs:
                bg_sync_triggered = True
                def _bg_empty_folder_sync(accs, f_val, l_val):
                    for s_id in accs:
                        try:
                            if l_val:
                                EmailService.sync_mailbox(s_id, folder=None, label_id=l_val, max_emails=25)
                            elif f_val:
                                EmailService.sync_mailbox(s_id, folder=f_val, label_id=None, max_emails=25)
                        except Exception as sync_err:
                            print(f"Auto-sync background aviso: {sync_err}")

                threading.Thread(target=_bg_empty_folder_sync, args=(sync_accs, folder, label_id), daemon=True).start()
        except Exception as sync_err:
            print(f"Auto-sync aviso: {sync_err}")

    # Paginación rápida respaldada por índice B-Tree (date DESC, id DESC)
    offset = (page - 1) * page_size
    query += " ORDER BY emails.date DESC, emails.id DESC LIMIT ? OFFSET ?"
    query_params = params + [page_size, offset]

    rows = conn.execute(query, query_params).fetchall()
    email_items = [dict(r) for r in rows]

    # Adjuntar etiquetas asignadas a los correos obtenidos
    if email_items:
        email_ids = [e["id"] for e in email_items]
        placeholders = ",".join("?" for _ in email_ids)
        lbl_rows = conn.execute(f'''
            SELECT el.email_id, l.id as label_id, l.name as label_name, l.color as label_color
            FROM email_labels el
            JOIN labels l ON el.label_id = l.id
            WHERE el.email_id IN ({placeholders})
        ''', email_ids).fetchall()
        labels_by_email = {}
        for lr in lbl_rows:
            labels_by_email.setdefault(lr["email_id"], []).append({
                "id": lr["label_id"],
                "name": lr["label_name"],
                "color": lr["label_color"]
            })
        for e in email_items:
            e["labels"] = labels_by_email.get(e["id"], [])

    conn.close()

    return {
        "items": email_items,
        "total": total_records,
        "page": page,
        "page_size": page_size,
        "total_pages": (total_records + page_size - 1) // page_size if total_records > 0 else 1,
        "background_sync": bg_sync_triggered
    }

@app.get("/api/emails/{email_id}")
def get_email_detail(email_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM emails WHERE id = ?", (email_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Correo no encontrado")

    email_data = dict(row)
    label_rows = conn.execute('''
        SELECT l.id, l.name, l.color
        FROM labels l
        JOIN email_labels el ON l.id = el.label_id
        WHERE el.email_id = ? AND COALESCE(l.type, 'user') != 'system'
        ORDER BY l.name ASC
    ''', (email_id,)).fetchall()
    email_data["labels"] = [dict(lr) for lr in label_rows]

    # Adjuntar lista de archivos adjuntos registrados
    att_rows = conn.execute('''
        SELECT id, filename, content_type, size
        FROM attachments
        WHERE email_id = ?
        ORDER BY id ASC
    ''', (email_id,)).fetchall()
    
    # Si tiene adjuntos marcados pero aún no están en la tabla, extraerlos bajo demanda
    if email_data.get("has_attachments") and not att_rows and email_data.get("uid"):
        try:
            acc_row = conn.execute("SELECT provider FROM accounts WHERE id = ?", (email_data["account_id"],)).fetchone()
            if acc_row and acc_row["provider"] in ("google", "gmail"):
                creds = GoogleOAuthService.get_valid_credentials(email_data["account_id"])
                if creds:
                    from googleapiclient.discovery import build
                    service = build('gmail', 'v1', credentials=creds)
                    msg = service.users().messages().get(userId='me', id=email_data["uid"], format='full').execute()
                    atts = GoogleOAuthService._extract_attachments_metadata(msg.get("payload", {}))
                    for att in atts:
                        conn.execute('''
                            INSERT INTO attachments (email_id, filename, content_type, size, remote_id)
                            VALUES (?, ?, ?, ?, ?)
                        ''', (email_id, att["filename"], att["content_type"], att["size"], att.get("remote_id")))
                    conn.commit()
                    att_rows = conn.execute('''
                        SELECT id, filename, content_type, size
                        FROM attachments WHERE email_id = ? ORDER BY id ASC
                    ''', (email_id,)).fetchall()
        except Exception as att_err:
            print(f"Aviso extrayendo adjuntos bajo demanda para email {email_id}: {att_err}")

    email_data["attachments"] = [dict(ar) for ar in att_rows]

    # Resolver CIDs inline en tiempo real si aún contiene cid:
    if email_data.get("body_html") and "cid:" in email_data["body_html"]:
        try:
            resolved_html = GoogleOAuthService.resolve_cids_for_email(email_id, conn)
            if resolved_html:
                email_data["body_html"] = resolved_html
        except Exception as cid_err:
            print(f"Aviso resolviendo CIDs para email {email_id}: {cid_err}")

    conn.close()
    return email_data

@app.post("/api/emails/{email_id}/read")
def mark_email_as_read(email_id: int):
    from datetime import datetime
    conn = get_db()
    row = conn.execute("SELECT id, is_read, account_id, uid, folder FROM emails WHERE id = ?", (email_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Correo no encontrado")
    
    if not row["is_read"]:
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        conn.execute("UPDATE emails SET is_read = 1, updated_at = ?, local_modified = 1 WHERE id = ?", (now_iso, email_id))
        conn.commit()
        acc_id = row["account_id"]
        uid = row["uid"]
        acc = conn.execute("SELECT id, provider FROM accounts WHERE id = ?", (acc_id,)).fetchone()
        conn.close()

        if acc and acc["provider"] in ("google", "gmail") and uid:
            threading.Thread(
                target=GoogleOAuthService.modify_message_labels,
                args=(acc["id"], uid, None, ["UNREAD"]),
                daemon=True
            ).start()
    else:
        conn.close()
    return {"status": "ok", "email_id": email_id, "is_read": 1}

@app.post("/api/emails/{email_id}/toggle-read")
def toggle_email_read(email_id: int):
    from datetime import datetime
    conn = get_db()
    row = conn.execute("SELECT id, is_read, account_id, uid, folder FROM emails WHERE id = ?", (email_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Correo no encontrado")
    
    new_read = 0 if row["is_read"] else 1
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute("UPDATE emails SET is_read = ?, updated_at = ?, local_modified = 1 WHERE id = ?", (new_read, now_iso, email_id))
    conn.commit()
    acc_id = row["account_id"]
    uid = row["uid"]
    acc = conn.execute("SELECT id, provider FROM accounts WHERE id = ?", (acc_id,)).fetchone()
    conn.close()

    if acc and acc["provider"] in ("google", "gmail") and uid:
        add_l = None if new_read else ["UNREAD"]
        rem_l = ["UNREAD"] if new_read else None
        threading.Thread(
            target=GoogleOAuthService.modify_message_labels,
            args=(acc["id"], uid, add_l, rem_l),
            daemon=True
        ).start()

    return {"status": "ok", "email_id": email_id, "is_read": new_read}

@app.post("/api/emails/sync")
def sync_emails(account_id: Optional[int] = None, folder: Optional[str] = "INBOX", label_id: Optional[int] = None, background: bool = False):
    conn = get_db()
    if account_id:
        accounts = conn.execute("SELECT id FROM accounts WHERE id = ?", (account_id,)).fetchall()
    else:
        accounts = conn.execute("SELECT id FROM accounts WHERE is_active = 1").fetchall()
    conn.close()

    if not accounts:
        return {"success": False, "error": "No hay cuentas configuradas"}

    acc_ids = [acc["id"] for acc in accounts]

    def _run_sync_batch():
        total_synced = 0
        errors = []

        def sync_one(acc_id):
            try:
                return acc_id, EmailService.sync_mailbox(acc_id, folder=folder, label_id=label_id)
            except Exception as e:
                return acc_id, {"success": False, "error": str(e)}

        import concurrent.futures
        workers = min(len(acc_ids), 4)
        if workers > 1:
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
                futures = [executor.submit(sync_one, aid) for aid in acc_ids]
                for f in concurrent.futures.as_completed(futures):
                    aid, res = f.result()
                    if res.get("success"):
                        total_synced += res.get("synced_count", 0)
                    elif res.get("error"):
                        errors.append(f"Cuenta {aid}: {res.get('error')}")
        else:
            for aid in acc_ids:
                aid, res = sync_one(aid)
                if res.get("success"):
                    total_synced += res.get("synced_count", 0)
                elif res.get("error"):
                    errors.append(f"Cuenta {aid}: {res.get('error')}")
        return total_synced, errors

    if background:
        threading.Thread(target=_run_sync_batch, daemon=True).start()
        return {"success": True, "synced_count": 0, "background": True}

    total_synced, errors = _run_sync_batch()
    return {
        "success": True,
        "synced_count": total_synced,
        "errors": errors if errors else None
    }

@app.post("/api/emails/send")
def send_email(req: EmailSendRequest):
    attachments_data = [a.dict() for a in req.attachments] if req.attachments else []
    result = EmailService.send_email(
        account_id=req.account_id,
        to_email=req.to_email,
        subject=req.subject,
        body=req.body,
        is_html=req.is_html,
        cc=req.cc,
        bcc=req.bcc,
        attachments=attachments_data
    )
    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "Error al enviar correo"))
    return result

@app.post("/api/emails/{email_id}/star")
def toggle_star(email_id: int):
    from datetime import datetime
    conn = get_db()
    row = conn.execute("SELECT is_starred, account_id, uid FROM emails WHERE id = ?", (email_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Correo no encontrado")
    new_status = 0 if row["is_starred"] else 1
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute("UPDATE emails SET is_starred = ?, updated_at = ?, local_modified = 1 WHERE id = ?", (new_status, now_iso, email_id))
    conn.commit()
    acc_id = row["account_id"]
    uid = row["uid"]
    conn.close()

    if acc_id and uid:
        add_l = ["STARRED"] if new_status else None
        rem_l = None if new_status else ["STARRED"]
        threading.Thread(
            target=GoogleOAuthService.modify_message_labels,
            args=(acc_id, uid, add_l, rem_l),
            daemon=True
        ).start()

    return {"success": True, "is_starred": new_status}

@app.post("/api/emails/{email_id}/not-spam")
def mark_email_not_spam(email_id: int):
    from datetime import datetime
    conn = get_db()
    row = conn.execute("SELECT account_id, uid, folder FROM emails WHERE id = ?", (email_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Correo no encontrado")
    
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute("UPDATE emails SET folder = 'INBOX', updated_at = ?, local_modified = 1 WHERE id = ?", (now_iso, email_id))
    conn.commit()
    account_id = row["account_id"]
    uid = row["uid"]
    conn.close()

    if account_id and uid:
        threading.Thread(
            target=GoogleOAuthService.modify_message_labels,
            args=(account_id, uid, ["INBOX"], ["SPAM"]),
            daemon=True
        ).start()
    # Cuentas IMAP: mover también en el servidor (Spam -> Recibidos)
    EmailService.schedule_imap_push(email_ids=[email_id])

    return {"success": True, "message": "Correo marcado como legítimo y movido a Recibidos"}

@app.delete("/api/emails/{email_id}")
def delete_email(email_id: int):
    """Mueve el correo a la Papelera; si ya estaba en la Papelera, lo elimina definitivamente de MerkeMail."""
    from datetime import datetime
    conn = get_db()
    row = conn.execute("SELECT id, account_id, uid, folder, source_folder FROM emails WHERE id = ?", (email_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Correo no encontrado")
    permanent = (row["folder"] or "").upper() == "TRASH"
    if permanent:
        if row["uid"]:
            conn.execute(
                "INSERT OR REPLACE INTO deleted_emails (account_id, uid, deleted_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                (row["account_id"], deleted_email_key(row["source_folder"], row["uid"]))
            )
        conn.execute("DELETE FROM email_labels WHERE email_id = ?", (email_id,))
        conn.execute("DELETE FROM attachments WHERE email_id = ?", (email_id,))
        conn.execute("DELETE FROM emails WHERE id = ?", (email_id,))
    else:
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        conn.execute("UPDATE emails SET folder = 'TRASH', updated_at = ?, local_modified = 1 WHERE id = ?", (now_iso, email_id))
    conn.commit()
    conn.close()
    if row["account_id"] and row["uid"]:
        threading.Thread(
            target=GoogleOAuthService.modify_message_labels,
            args=(row["account_id"], row["uid"], ["TRASH"], ["INBOX"]),
            daemon=True
        ).start()
    # Cuentas IMAP: reflejar en el servidor (mover a su Papelera)
    if permanent:
        EmailService.schedule_imap_push(removed_rows=[dict(row)])
    else:
        EmailService.schedule_imap_push(email_ids=[email_id])
    return {"success": True, "permanent": permanent,
            "message": "Correo eliminado definitivamente" if permanent else "Correo movido a la papelera"}

@app.post("/api/emails/batch-delete")
def batch_delete_emails(req: BatchDeleteRequest):
    from datetime import datetime
    if not req.email_ids:
        return {"success": True, "deleted_count": 0}
    conn = get_db()
    placeholders = ",".join("?" for _ in req.email_ids)
    rows = conn.execute(f"SELECT id, account_id, uid, folder, source_folder FROM emails WHERE id IN ({placeholders})", req.email_ids).fetchall()
    targets = [dict(r) for r in rows]
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    if req.permanent:
        for t in targets:
            if t.get("uid"):
                conn.execute(
                    "INSERT OR REPLACE INTO deleted_emails (account_id, uid, deleted_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                    (t["account_id"], deleted_email_key(t.get("source_folder"), t["uid"]))
                )
        conn.execute(f"DELETE FROM email_labels WHERE email_id IN ({placeholders})", req.email_ids)
        conn.execute(f"DELETE FROM attachments WHERE email_id IN ({placeholders})", req.email_ids)
        conn.execute(f"DELETE FROM emails WHERE id IN ({placeholders})", req.email_ids)
    else:
        conn.execute(
            f"UPDATE emails SET folder = 'TRASH', updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})",
            [now_iso] + req.email_ids
        )
    conn.commit()
    conn.close()

    def _bg_batch_del():
        for t in targets:
            if t.get("account_id") and t.get("uid"):
                try:
                    GoogleOAuthService.modify_message_labels(t["account_id"], t["uid"], add_labels=["TRASH"], remove_labels=["INBOX"])
                except Exception:
                    pass
    threading.Thread(target=_bg_batch_del, daemon=True).start()
    # Cuentas IMAP: reflejar en el servidor (mover a su Papelera)
    if req.permanent:
        EmailService.schedule_imap_push(removed_rows=targets)
    else:
        EmailService.schedule_imap_push(email_ids=req.email_ids)

    return {"success": True, "deleted_count": len(req.email_ids), "message": f"{len(req.email_ids)} correos procesados exitosamente"}

@app.post("/api/emails/batch-action")
def batch_action_emails(req: BatchActionRequest):
    from datetime import datetime
    if not req.email_ids:
        return {"success": True, "count": 0, "message": "No hay correos seleccionados"}
    conn = get_db()
    placeholders = ",".join("?" for _ in req.email_ids)
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = conn.execute(f"SELECT id, account_id, uid, folder, is_read, is_starred FROM emails WHERE id IN ({placeholders})", req.email_ids).fetchall()
    targets = [dict(r) for r in rows]

    bg_label_ops = []  # list of (account_id, uid, add_labels, remove_labels)

    if req.action == "archive":
        # No permitir archivar o almacenar correos que están en Papelera (TRASH), Spam (SPAM) o Borradores (DRAFT/DRAFTS)
        cursor = conn.execute(
            f"""
            UPDATE emails 
            SET folder = CASE WHEN folder = 'ARCHIVE' THEN 'INBOX' ELSE 'ARCHIVE' END,
                source_folder = COALESCE(source_folder, folder, 'INBOX'),
                updated_at = ?, local_modified = 1
            WHERE id IN ({placeholders}) AND UPPER(COALESCE(folder, '')) NOT IN ('SPAM', 'TRASH', 'DRAFT', 'DRAFTS')
            """,
            [now_iso] + req.email_ids
        )
        for t in targets:
            if (t.get("folder") or "").upper() not in ("SPAM", "TRASH", "DRAFT", "DRAFTS") and t.get("uid"):
                if t.get("folder") == "ARCHIVE":
                    bg_label_ops.append((t["account_id"], t["uid"], ["INBOX"], None))
                else:
                    bg_label_ops.append((t["account_id"], t["uid"], None, ["INBOX"]))
        msg = f"{cursor.rowcount} correos procesados (Archivado / Restaurar a Recibidos)"
    elif req.action == "spam":
        conn.execute(
            f"UPDATE emails SET folder = CASE WHEN folder = 'SPAM' THEN 'INBOX' ELSE 'SPAM' END, source_folder = COALESCE(source_folder, folder, 'INBOX'), updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})",
            [now_iso] + req.email_ids
        )
        for t in targets:
            if t.get("uid"):
                if t.get("folder") == "SPAM":
                    bg_label_ops.append((t["account_id"], t["uid"], ["INBOX"], ["SPAM"]))
                else:
                    bg_label_ops.append((t["account_id"], t["uid"], ["SPAM"], ["INBOX"]))
        msg = f"{len(req.email_ids)} correos procesados (Spam / Restaurar a Recibidos)"
    elif req.action == "trash":
        conn.execute(
            f"UPDATE emails SET folder = CASE WHEN folder = 'TRASH' THEN 'INBOX' ELSE 'TRASH' END, source_folder = COALESCE(source_folder, folder, 'INBOX'), updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})",
            [now_iso] + req.email_ids
        )
        for t in targets:
            if t.get("uid"):
                if t.get("folder") == "TRASH":
                    bg_label_ops.append((t["account_id"], t["uid"], ["INBOX"], ["TRASH"]))
                else:
                    bg_label_ops.append((t["account_id"], t["uid"], ["TRASH"], ["INBOX"]))
        msg = f"{len(req.email_ids)} correos procesados (Papelera / Restaurados)"
    elif req.action in ("mark_read", "mark_unread", "toggle_read"):
        conn.execute(
            f"UPDATE emails SET is_read = CASE WHEN is_read = 1 THEN 0 ELSE 1 END, updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})",
            [now_iso] + req.email_ids
        )
        for t in targets:
            if t.get("uid"):
                if t.get("is_read") == 1:
                    bg_label_ops.append((t["account_id"], t["uid"], ["UNREAD"], None))
                else:
                    bg_label_ops.append((t["account_id"], t["uid"], None, ["UNREAD"]))
        msg = f"Estado de lectura alternado en {len(req.email_ids)} correos"
    elif req.action in ("star", "unstar", "toggle_star"):
        conn.execute(
            f"UPDATE emails SET is_starred = CASE WHEN is_starred = 1 THEN 0 ELSE 1 END, updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})",
            [now_iso] + req.email_ids
        )
        for t in targets:
            if t.get("uid"):
                if t.get("is_starred") == 1:
                    bg_label_ops.append((t["account_id"], t["uid"], None, ["STARRED"]))
                else:
                    bg_label_ops.append((t["account_id"], t["uid"], ["STARRED"], None))
        msg = f"Destacado alternado en {len(req.email_ids)} correos"
    elif (req.action in ("add_label", "toggle_label")) and req.label_id:
        added = 0
        removed = 0
        for t in targets:
            eid = t["id"]
            # Etiqueta efectiva según la cuenta de cada correo (ver _resolve_label_for_email)
            lbl = _resolve_label_for_email(conn, req.label_id, eid, t["account_id"])
            if not lbl:
                continue
            rem_lbl_id = lbl["remote_id"]
            exists = conn.execute(
                "SELECT 1 FROM email_labels WHERE email_id = ? AND label_id = ?",
                (eid, lbl["id"])
            ).fetchone()
            if exists:
                conn.execute(
                    "DELETE FROM email_labels WHERE email_id = ? AND label_id = ?",
                    (eid, lbl["id"])
                )
                removed += 1
                if rem_lbl_id and t.get("uid"):
                    bg_label_ops.append((t["account_id"], t["uid"], None, [rem_lbl_id]))
            else:
                conn.execute(
                    "INSERT OR IGNORE INTO email_labels (email_id, label_id) VALUES (?, ?)",
                    (eid, lbl["id"])
                )
                added += 1
                if rem_lbl_id and t.get("uid"):
                    bg_label_ops.append((t["account_id"], t["uid"], [rem_lbl_id], None))
        conn.execute(f"UPDATE emails SET updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})", [now_iso] + req.email_ids)
        msg = f"Etiqueta actualizada (+{added} asignadas, -{removed} removidas)"
    elif req.action == "remove_label" and req.label_id:
        for t in targets:
            lbl = _resolve_label_for_email(conn, req.label_id, t["id"], t["account_id"], for_removal=True)
            if not lbl:
                continue
            conn.execute("DELETE FROM email_labels WHERE email_id = ? AND label_id = ?", (t["id"], lbl["id"]))
            if lbl["remote_id"] and t.get("uid"):
                bg_label_ops.append((t["account_id"], t["uid"], None, [lbl["remote_id"]]))
        conn.execute(f"UPDATE emails SET updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})", [now_iso] + req.email_ids)
        msg = f"Etiqueta removida de {len(req.email_ids)} correos"
    elif req.action == "move_folder" and req.folder:
        dest_folder = req.folder.upper()
        conn.execute(
            f"UPDATE emails SET folder = ?, source_folder = COALESCE(source_folder, folder, 'INBOX'), updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})",
            [dest_folder, now_iso] + req.email_ids
        )
        all_cats = ("CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_UPDATES", "CATEGORY_FORUMS")
        for t in targets:
            if not t.get("uid"):
                continue
            old_f = (t.get("folder") or "INBOX").upper()
            add_l = []
            rem_l = []

            if dest_folder == "INBOX":
                add_l.append("INBOX")
                if old_f in ("SPAM", "TRASH"):
                    rem_l.append(old_f)
                for c in all_cats:
                    if old_f == c:
                        rem_l.append(c)
            elif dest_folder == "ARCHIVE":
                rem_l.append("INBOX")
                if old_f in ("SPAM", "TRASH"):
                    rem_l.append(old_f)
            elif dest_folder == "SPAM":
                add_l.append("SPAM")
                rem_l.append("INBOX")
                if old_f == "TRASH":
                    rem_l.append("TRASH")
                for c in all_cats:
                    if old_f == c:
                        rem_l.append(c)
            elif dest_folder == "TRASH":
                add_l.append("TRASH")
                rem_l.append("INBOX")
                if old_f == "SPAM":
                    rem_l.append("SPAM")
                for c in all_cats:
                    if old_f == c:
                        rem_l.append(c)
            elif dest_folder.startswith("CATEGORY_"):
                add_l.append(dest_folder)
                add_l.append("INBOX")
                for c in all_cats:
                    if c != dest_folder and (old_f == c or old_f.startswith("CATEGORY_")):
                        rem_l.append(c)
                if old_f in ("SPAM", "TRASH"):
                    rem_l.append(old_f)

            if add_l or rem_l:
                bg_label_ops.append((t["account_id"], t["uid"], add_l or None, rem_l or None))

        folder_names = {
            "INBOX": "Recibidos",
            "ARCHIVE": "Archivo",
            "TRASH": "Papelera",
            "SPAM": "Spam",
            "CATEGORY_PROMOTIONS": "Promociones",
            "CATEGORY_SOCIAL": "Social",
            "CATEGORY_UPDATES": "Notificaciones",
            "CATEGORY_FORUMS": "Foros"
        }
        dest_display = folder_names.get(dest_folder, dest_folder)
        msg = f"{len(req.email_ids)} correo(s) movido(s) a {dest_display}"
    else:
        conn.close()
        raise HTTPException(status_code=400, detail="Acción no soportada")

    conn.commit()
    conn.close()

    # Cuentas IMAP: reflejar en el servidor los cambios de carpeta (Archivar, Spam, Papelera, restaurar)
    if req.action in ("archive", "spam", "trash", "move_folder"):
        EmailService.schedule_imap_push(email_ids=req.email_ids)

    if bg_label_ops:
        def _bg_apply_ops():
            for acc_id, uid, add_l, rem_l in bg_label_ops:
                try:
                    GoogleOAuthService.modify_message_labels(acc_id, uid, add_labels=add_l, remove_labels=rem_l)
                except Exception:
                    pass
        threading.Thread(target=_bg_apply_ops, daemon=True).start()

    return {"success": True, "count": len(req.email_ids), "action": req.action, "message": msg}

# --- ENDPOINTS DE FIRMAS DE CORREO ---
@app.get("/api/signatures")
def list_signatures(account_id: Optional[int] = None):
    conn = get_db()
    query = '''
        SELECT s.*, a.name as account_name, a.email as account_email
        FROM signatures s
        LEFT JOIN accounts a ON s.account_id = a.id
        WHERE 1=1
    '''
    params = []
    if account_id:
        query += " AND (s.account_id = ? OR s.account_id IS NULL)"
        params.append(account_id)
    query += " ORDER BY s.is_default DESC, s.id ASC"
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/signatures")
def create_signature(req: SignatureCreateRequest):
    conn = get_db()
    cursor = conn.cursor()
    
    # Si se marca como default, desmarcar las existentes para esa cuenta
    if req.is_default:
        if req.account_id:
            cursor.execute("UPDATE signatures SET is_default = 0 WHERE account_id = ?", (req.account_id,))
        else:
            cursor.execute("UPDATE signatures SET is_default = 0 WHERE account_id IS NULL")

    cursor.execute('''
        INSERT INTO signatures (name, content, account_id, is_default)
        VALUES (?, ?, ?, ?)
    ''', (req.name, req.content, req.account_id, req.is_default))
    conn.commit()
    sig_id = cursor.lastrowid
    conn.close()
    return {"success": True, "id": sig_id, "message": "Firma guardada correctamente"}

@app.put("/api/signatures/{sig_id}")
def update_signature(sig_id: int, req: SignatureCreateRequest):
    conn = get_db()
    cursor = conn.cursor()
    
    row = cursor.execute("SELECT id FROM signatures WHERE id = ?", (sig_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Firma no encontrada")

    if req.is_default:
        if req.account_id:
            cursor.execute("UPDATE signatures SET is_default = 0 WHERE account_id = ? AND id != ?", (req.account_id, sig_id))
        else:
            cursor.execute("UPDATE signatures SET is_default = 0 WHERE account_id IS NULL AND id != ?", (sig_id,))

    cursor.execute('''
        UPDATE signatures
        SET name = ?, content = ?, account_id = ?, is_default = ?
        WHERE id = ?
    ''', (req.name, req.content, req.account_id, req.is_default, sig_id))
    conn.commit()
    conn.close()
    return {"success": True, "id": sig_id, "message": "Firma actualizada correctamente"}

@app.delete("/api/signatures/{sig_id}")
def delete_signature(sig_id: int):
    conn = get_db()
    conn.execute("DELETE FROM signatures WHERE id = ?", (sig_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Firma eliminada"}

@app.post("/api/signatures/{sig_id}/set-default")
def set_default_signature(sig_id: int):
    conn = get_db()
    row = conn.execute("SELECT account_id FROM signatures WHERE id = ?", (sig_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Firma no encontrada")
    
    acc_id = row["account_id"]
    cursor = conn.cursor()
    if acc_id:
        cursor.execute("UPDATE signatures SET is_default = 0 WHERE account_id = ?", (acc_id,))
    else:
        cursor.execute("UPDATE signatures SET is_default = 0 WHERE account_id IS NULL")
    
    cursor.execute("UPDATE signatures SET is_default = 1 WHERE id = ?", (sig_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Firma establecida como predeterminada"}

# --- ENDPOINTS DE PERFIL DEL USUARIO ANALIZADO POR IA ---
class UserProfileUpdateRequest(BaseModel):
    name: Optional[str] = None
    roles_and_titles: Optional[str] = None
    organization: Optional[str] = None
    phone: Optional[str] = None
    address_location: Optional[str] = None
    websites: Optional[str] = None
    communication_style: Optional[str] = None
    summary_bio: Optional[str] = None
    extra_context: Optional[str] = None

@app.get("/api/user-profile")
def get_user_profile():
    from backend.user_profile_service import UserProfileService
    profile = UserProfileService.get_profile()
    return {"success": True, "profile": profile}

@app.post("/api/user-profile/analyze")
def analyze_user_profile():
    from backend.user_profile_service import UserProfileService
    try:
        profile = UserProfileService.analyze_profile()
        return {"success": True, "profile": profile}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/user-profile")
def update_user_profile(req: UserProfileUpdateRequest):
    from backend.user_profile_service import UserProfileService
    try:
        profile = UserProfileService.update_profile(req.model_dump(exclude_unset=True))
        return {"success": True, "profile": profile}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- ENDPOINTS DE AGENTE AUTÓNOMO ANTIGRAVITY ---
class AgentChatRequest(BaseModel):
    message: str

@app.post("/api/agent/chat")
async def chat_with_agent(req: AgentChatRequest):
    result = await AntigravityMailAgent.chat(req.message)
    return result

@app.post("/api/agent/reset")
def reset_agent_context():
    """Reinicia la conversación del agente Elio sin persistir el contexto anterior."""
    return {"success": True, "message": "Contexto de conversación reiniciado exitosamente."}

@app.get("/api/agent/summary")
def get_agent_summary(lang: Optional[str] = "es"):
    """Genera un resumen inteligente en tiempo real de correos sin leer, asuntos urgentes, citas de la semana, tareas, notas y recomendaciones con IA en español o inglés."""
    conn = get_db()
    
    # Total de correos sin leer excluyendo Papelera, Borradores y Spam
    unread_count = conn.execute(
        "SELECT COUNT(*) as c FROM emails WHERE is_read = 0 AND UPPER(COALESCE(folder, '')) NOT IN ('TRASH', 'PAPELERA', 'DRAFT', 'DRAFTS', 'BORRADORES', 'SPAM', 'JUNK')"
    ).fetchone()["c"]

    # Total de correos en bandeja de entrada
    inbox_total = conn.execute(
        "SELECT COUNT(*) as c FROM emails WHERE UPPER(COALESCE(folder, '')) IN ('INBOX', 'RECIBIDOS', '')"
    ).fetchone()["c"]

    # Conteo por categorías inteligentes IA (trabajo, finanzas, personal, boletines)
    category_counts = {"trabajo": 0, "finanzas": 0, "personal": 0, "boletines": 0}
    cat_rows = conn.execute("""
        SELECT ai_tags FROM emails
        WHERE UPPER(COALESCE(folder, '')) IN ('INBOX', 'RECIBIDOS', '')
          AND is_read = 0 AND ai_tags IS NOT NULL AND ai_tags != ''
    """).fetchall()
    for crow in cat_rows:
        try:
            tags = json.loads(crow["ai_tags"]) if isinstance(crow["ai_tags"], str) else crow["ai_tags"]
            if isinstance(tags, list):
                for t in tags:
                    t_lower = str(t).lower()
                    if t_lower in category_counts:
                        category_counts[t_lower] += 1
        except Exception:
            pass

    acc_row = conn.execute("SELECT name, email, color FROM accounts LIMIT 1").fetchone()
    account_info = dict(acc_row) if acc_row else None

    # Correos que requieren atención prioritaria (pagos, facturas, alertas de cuenta o seguridad)
    priority_rows = conn.execute("""
        SELECT id, sender, subject, date, snippet
        FROM emails
        WHERE UPPER(COALESCE(folder, '')) NOT IN ('TRASH', 'PAPELERA', 'DRAFT', 'DRAFTS', 'BORRADORES', 'SPAM', 'JUNK')
          AND (
            subject LIKE '%pago%' OR subject LIKE '%factura%' OR subject LIKE '%alerta%'
            OR subject LIKE '%suspensi%' OR subject LIKE '%urgente%' OR subject LIKE '%rechazado%'
            OR snippet LIKE '%total a pagar%' OR snippet LIKE '%vencim%'
          )
        ORDER BY date DESC LIMIT 3
    """).fetchall()

    # Si hay pocos prioritarios, complementar con los correos sin leer más recientes
    unread_rows = []
    if len(priority_rows) < 3:
        p_ids = [r["id"] for r in priority_rows]
        placeholders = ",".join("?" for _ in p_ids) if p_ids else "-1"
        unread_rows = conn.execute(f"""
            SELECT id, sender, subject, date, snippet
            FROM emails
            WHERE is_read = 0 AND UPPER(COALESCE(folder, '')) NOT IN ('TRASH', 'PAPELERA', 'DRAFT', 'DRAFTS', 'BORRADORES', 'SPAM', 'JUNK') AND id NOT IN ({placeholders})
            ORDER BY date DESC LIMIT {3 - len(priority_rows)}
        """, p_ids if p_ids else []).fetchall()

    # Notas adhesivas
    notes_rows = conn.execute("SELECT id, content, color, z_index, created_at, updated_at FROM notes ORDER BY z_index DESC, id DESC").fetchall()
    notes = [dict(r) for r in notes_rows]
    notes_count = len(notes)

    # Contactos de la libreta
    contacts_count = conn.execute("SELECT COUNT(*) as c FROM contacts WHERE (is_pending = 0 OR is_pending IS NULL)").fetchone()["c"]
    pending_contacts_count = conn.execute("SELECT COUNT(*) as c FROM contacts WHERE is_pending = 1").fetchone()["c"]

    conn.close()

    now = datetime.datetime.now()
    today_prefix = now.strftime("%Y-%m-%d")

    # Próxima cita de la agenda (la más próxima a partir de hoy)
    upcoming_event = None
    try:
        all_events = CalendarService.get_events()
        future_events = [e for e in all_events if e.get("start_time") and e["start_time"] >= today_prefix]
        if future_events:
            upcoming_event = future_events[0]
    except Exception as e:
        logger.error(f"Error obteniendo próxima cita: {e}")

    # Eventos de la semana actual (lunes a domingo, o próximos 7 días)
    week_events = []
    try:
        start_of_week = (now - datetime.timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
        end_of_week = (start_of_week + datetime.timedelta(days=6)).replace(hour=23, minute=59, second=59)
        evs = CalendarService.get_events(start_of_week.isoformat(), end_of_week.isoformat())
        if now.weekday() >= 5 or len([e for e in evs if e.get("start_time") and e["start_time"] >= today_prefix]) == 0:
            next_7 = CalendarService.get_events(now.strftime("%Y-%m-%d 00:00:00"), (now + datetime.timedelta(days=7)).strftime("%Y-%m-%d 23:59:59"))
            seen_ids = set(e["id"] for e in evs)
            for ue in next_7:
                if ue["id"] not in seen_ids:
                    evs.append(ue)
        week_events = evs
    except Exception as e:
        logger.error(f"Error obteniendo eventos de la semana: {e}")

    # Tareas pendientes
    pending_tasks = []
    try:
        pending_tasks = CalendarService.get_tasks(include_completed=False)
    except Exception as e:
        logger.error(f"Error obteniendo tareas pendientes: {e}")

    # Generación de síntesis ejecutiva con IA (Gemini) o heurística
    ai_generated = False
    rec_text = ""
    is_en = (lang or "").lower().startswith("en")
    p_subjects = [r["subject"] for r in priority_rows if r["subject"]]
    task_titles = [t["title"].replace("[Tarea]", "").strip() for t in pending_tasks[:4] if t.get("title")]
    notes_snippets = [n["content"][:60].replace("\n", " ").strip() for n in notes[:4] if n.get("content")]
    week_events_summary = [f"'{e['title']}' ({e.get('start_time', '').replace('T', ' ')})" for e in week_events[:4] if e.get("title")]
    next_ev_str = f"'{upcoming_event['title']}' ({upcoming_event['start_time'].replace('T', ' ')})" if upcoming_event else ("No scheduled events" if is_en else "Sin citas agendadas")

    api_key = get_setting("gemini_api_key")
    if api_key:
        try:
            client = GeminiService.get_client()
            model = get_setting("gemini_model") or "gemini-3.5-flash-lite"
            
            if is_en:
                prompt_context = f"""Generate a concise, professional executive briefing (2 to 4 fluid sentences in English) synthesizing the user's current workday across all modules:
1. Inbox: {unread_count} unread emails ({inbox_total} total). Categories: {category_counts['trabajo']} work, {category_counts['finanzas']} finance, {category_counts['personal']} personal, {category_counts['boletines']} newsletters. Urgent alerts/invoices: {', '.join(p_subjects) if p_subjects else 'None'}.
2. Schedule: Next appointment: {next_ev_str}. Weekly events ({len(week_events)} total): {', '.join(week_events_summary) if week_events_summary else 'No events this week'}.
3. Pending Tasks ({len(pending_tasks)}): {', '.join(task_titles) if task_titles else 'None'}.
4. Sticky Notes on Board ({notes_count}): {'; '.join(notes_snippets) if notes_snippets else 'No notes'}.

MANDATORY: Synthesize all 4 areas (emails and category distribution, weekly schedule, pending tasks, and active sticky notes) into a cohesive summary. Do not omit any area. Return only the summary text without headings, greetings, or bullet points."""
            else:
                prompt_context = f"""Genera una síntesis ejecutiva concisa y profesional (de 2 a 4 oraciones fluidas en español de Latinoamérica) que consolide el estado de trabajo del usuario integrando todas las áreas:
1. Bandeja de correos: {unread_count} correos sin leer de {inbox_total}. Distribución: {category_counts['trabajo']} de trabajo, {category_counts['finanzas']} de finanzas, {category_counts['personal']} personales, {category_counts['boletines']} boletines. Alertas o facturas urgentes: {', '.join(p_subjects) if p_subjects else 'Ninguna urgente'}.
2. Agenda y Citas: Próxima cita: {next_ev_str}. Citas de la semana ({len(week_events)} en total): {', '.join(week_events_summary) if week_events_summary else 'Sin citas programadas esta semana'}.
3. Tareas pendientes ({len(pending_tasks)}): {', '.join(task_titles) if task_titles else 'Al día sin tareas pendientes'}.
4. Pizarra de notas adhesivas ({notes_count} notas): {'; '.join(notes_snippets) if notes_snippets else 'Pizarra vacía'}.

REGLA OBLIGATORIA: Debes sintetizar e incluir expresamente las 4 áreas (correos y categorías, agenda de la semana, tareas pendientes y notas de la pizarra). No omitas ninguna de estas áreas marcadas. Devuelve únicamente el párrafo de texto en español de Latinoamérica, sin encabezados, saludos ni viñetas."""

            resp = GeminiService._generate_with_fallback(
                client=client,
                preferred_model=model,
                contents=prompt_context,
                config=types.GenerateContentConfig(temperature=0.3)
            )
            if resp and resp.text and resp.text.strip():
                rec_text = resp.text.strip()
                ai_generated = True
        except Exception as e:
            logger.warning(f"No se pudo generar síntesis con Gemini: {e}")

    if not rec_text:
        recommendations = []
        has_disney_or_payment = any("pago" in (r["subject"] or "").lower() or "suspensi" in (r["subject"] or "").lower() for r in priority_rows)
        has_invoice = any("factura" in (r["subject"] or "").lower() for r in priority_rows)

        if is_en:
            # 1. Correos y categorías
            if has_disney_or_payment:
                recommendations.append("Review payment alerts and account notifications promptly to avoid subscription interruptions.")
            elif has_invoice:
                recommendations.append("Check amounts and due dates of recent invoices.")
            elif unread_count > 0:
                cat_parts = [f"{v} {k}" for k, v in category_counts.items() if v > 0]
                cat_info = f" ({', '.join(cat_parts)})" if cat_parts else ""
                recommendations.append(f"You have {unread_count} unread emails{cat_info} in your inbox.")

            # 2. Agenda y citas
            if upcoming_event:
                start_fmt = upcoming_event['start_time'].replace('T', ' ')
                recommendations.append(f"Keep in mind your next appointment: '{upcoming_event['title']}' ({start_fmt}).")
            elif len(week_events) > 0:
                recommendations.append(f"You have {len(week_events)} event(s) scheduled for this week.")

            # 3. Tareas pendientes
            if pending_tasks:
                first_task = f": '{task_titles[0]}'" if task_titles else ""
                recommendations.append(f"You have {len(pending_tasks)} pending task(s){first_task}.")

            # 4. Notas adhesivas
            if notes_count > 0:
                first_note = f" ('{notes_snippets[0]}')" if notes_snippets else ""
                recommendations.append(f"You have {notes_count} active sticky note(s) on your board{first_note}.")

            rec_text = " ".join(recommendations) if recommendations else "Everything is in order across your workspace. No high priority items pending."
        else:
            # 1. Correos y categorías
            if has_disney_or_payment:
                recommendations.append("Revisar prioritariamente los avisos de pagos y alertas de cuenta para prevenir cortes en tus suscripciones.")
            elif has_invoice:
                recommendations.append("Comprobar los importes y fechas de vencimiento de las facturas recientes.")
            elif unread_count > 0:
                cat_parts = [f"{v} de {k}" for k, v in category_counts.items() if v > 0]
                cat_info = f" ({', '.join(cat_parts)})" if cat_parts else ""
                recommendations.append(f"Tienes {unread_count} correos sin leer{cat_info} en tu bandeja.")

            # 2. Agenda y citas
            if upcoming_event:
                start_fmt = upcoming_event['start_time'].replace('T', ' ')
                recommendations.append(f"Considerar tu próxima cita: '{upcoming_event['title']}' ({start_fmt}).")
            elif len(week_events) > 0:
                recommendations.append(f"Tienes {len(week_events)} evento(s) programado(s) para esta semana.")

            # 3. Tareas pendientes
            if pending_tasks:
                first_task = f": '{task_titles[0]}'" if task_titles else ""
                recommendations.append(f"Tienes {len(pending_tasks)} tarea(s) pendiente(s){first_task}.")

            # 4. Notas adhesivas
            if notes_count > 0:
                first_note = f" ('{notes_snippets[0]}')" if notes_snippets else ""
                recommendations.append(f"Tienes {notes_count} nota(s) activa(s) en tu pizarra{first_note}.")

            rec_text = " ".join(recommendations) if recommendations else "Todo está en orden en tu espacio de trabajo. No tienes asuntos pendientes de alta prioridad."

    return {
        "success": True,
        "unread_count": unread_count,
        "inbox_total": inbox_total,
        "category_counts": category_counts,
        "account": account_info,
        "priority_emails": [dict(r) for r in priority_rows],
        "recent_unreads": [dict(r) for r in unread_rows],
        "upcoming_event": upcoming_event,
        "week_events": week_events,
        "pending_tasks": pending_tasks,
        "notes": notes,
        "notes_count": notes_count,
        "contacts_count": contacts_count,
        "pending_contacts_count": pending_contacts_count,
        "recommendation": rec_text,
        "ai_generated": ai_generated
    }

# --- ENDPOINTS DE LIBRETA DE CONTACTOS / AGENDA DE DIRECCIONES ---
class ContactCreateRequest(BaseModel):
    name: str
    email: str
    phone: Optional[str] = ""
    company: Optional[str] = ""
    job_title: Optional[str] = ""
    address: Optional[str] = ""
    notes: Optional[str] = ""
    account_id: Optional[int] = None

class ContactUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    job_title: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None

class ContactBatchActionRequest(BaseModel):
    ids: List[int]

@app.get("/api/contacts")
def list_contacts(q: str = "", limit: int = 300, include_pending: bool = False):
    return ContactsService.get_contacts(q=q, limit=limit, include_pending=include_pending)

@app.get("/api/contacts/pending")
def list_pending_contacts():
    return ContactsService.get_pending_contacts()

@app.post("/api/contacts/confirm")
def confirm_contacts(req: ContactBatchActionRequest):
    return ContactsService.confirm_contacts(req.ids)

@app.post("/api/contacts/reject")
def reject_contacts(req: ContactBatchActionRequest):
    return ContactsService.reject_contacts(req.ids)

@app.post("/api/contacts/delete-batch")
def delete_contacts_batch(req: ContactBatchActionRequest):
    count = ContactsService.delete_contacts_batch(req.ids)
    return {"success": True, "deleted_count": count}

@app.get("/api/contacts/{contact_id}")
def get_contact_detail(contact_id: int):
    contact = ContactsService.get_contact_by_id(contact_id)
    if not contact:
        raise HTTPException(status_code=404, detail="Contacto no encontrado")
    return contact

@app.post("/api/contacts/sync")
def sync_contacts():
    return ContactsService.sync_contacts()

@app.post("/api/contacts")
def create_contact(req: ContactCreateRequest):
    try:
        return ContactsService.add_contact(
            name=req.name,
            email_addr=req.email,
            phone=req.phone or "",
            company=req.company or "",
            job_title=req.job_title or "",
            address=req.address or "",
            notes=req.notes or "",
            account_id=req.account_id
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.put("/api/contacts/{contact_id}")
def update_contact(contact_id: int, req: ContactUpdateRequest):
    try:
        updated = ContactsService.update_contact(contact_id, req.model_dump(exclude_unset=True))
        return {"success": True, "contact": updated}
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/contacts/{contact_id}")
def delete_contact(contact_id: int):
    ContactsService.delete_contact(contact_id)
    return {"success": True, "message": "Contacto eliminado"}

# --- ENDPOINTS DE IA CON GEMINI ---
@app.post("/api/ai/draft")
def generate_draft(req: AIDraftRequest):
    try:
        result = GeminiService.generate_email_draft(
            prompt=req.prompt,
            tone=req.tone,
            language=req.language,
            recipient_context=req.recipient_context or "",
            current_draft=req.current_draft or ""
        )
        return {"success": True, "data": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.api_route("/api/gemini/smart-reply/{email_id}", methods=["GET", "POST"])
@app.api_route("/api/ai/smart-reply/{email_id}", methods=["GET", "POST"])
def get_smart_reply(email_id: int, req: Optional[SmartReplyRequest] = None):
    """Genera una respuesta inteligente para el correo especificado tomando su contexto completo."""
    conn = get_db()
    row = conn.execute("SELECT subject, sender, snippet, body_text, body_html FROM emails WHERE id = ?", (email_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Correo no encontrado")
    
    body = row["body_text"] or row["snippet"] or ""
    subject = row["subject"] or ""
    sender = row["sender"] or ""
    conn.close()

    user_inst = req.user_instruction if req else ""
    current_draft = req.current_draft if req else ""
    tone = (req.tone if req and req.tone else None) or get_setting("ai_prompt_tone") or get_setting("gemini_default_tone") or "formal"

    try:
        reply_data = GeminiService.generate_smart_reply(
            subject=subject,
            sender=sender,
            body=body,
            current_draft=current_draft,
            user_instruction=user_inst,
            tone=tone
        )
        return {"success": True, "draft_reply": reply_data.get("draft_reply", "")}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/ai/summarize/{email_id}")
def summarize_email(email_id: int):
    conn = get_db()
    row = conn.execute("SELECT subject, sender, snippet, body_text, body_html, ai_summary FROM emails WHERE id = ?", (email_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Correo no encontrado")
    
    body = row["body_text"] or row["snippet"] or ""
    try:
        summary_data = GeminiService.summarize_email(row["subject"], row["sender"], body)
        conn.execute("UPDATE emails SET ai_summary = ?, ai_urgency = ? WHERE id = ?", (summary_data.get("summary", ""), summary_data.get("urgency", "media"), email_id))
        conn.commit()
        return {"success": True, "data": summary_data}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

@app.get("/api/ai/commitments/{email_id}")
def get_email_commitments(email_id: int):
    """Detecta compromisos, tareas y acuerdos de un correo mediante IA."""
    conn = get_db()
    row = conn.execute("SELECT subject, sender, snippet, body_text FROM emails WHERE id = ?", (email_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Correo no encontrado")

    body = row["body_text"] or row["snippet"] or ""
    try:
        commitments = GeminiService.detect_commitments(row["subject"], row["sender"], body)
        return {"success": True, "commitments": commitments}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/ai/commitments/convert")
def convert_commitment(req: CommitmentConvertRequest):
    """Convierte un compromiso detectado en una Tarea de Calendario o Nota Adhesiva."""
    clean_title = (req.title or "Compromiso de correo").strip()
    conn = get_db()
    try:
        if req.target_type == "task":
            cal_id = CalendarService.get_default_calendar_id()
            task_event = CalendarService.create_event(
                calendar_id=cal_id,
                title=f"[Tarea] {clean_title}",
                description=f"Compromiso detectado por Elio en correo #{req.email_id}" + (f" (Plazo: {req.due_hint})" if req.due_hint else ""),
                is_task=1,
                origin_email_id=req.email_id
            )
            return {"success": True, "type": "task", "message": "Tarea agregada a la agenda", "id": task_event["id"]}
        else:
            from datetime import datetime
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            cur = conn.cursor()
            note_content = f"📌 {clean_title}" + (f"\n⏳ Plazo: {req.due_hint}" if req.due_hint else "") + f"\n(Ref: Correo #{req.email_id})"
            cur.execute("""
                INSERT INTO notes (content, color, x, y, width, height, z_index, created_at, updated_at)
                VALUES (?, 'yellow', 150, 150, 220, 170, 10, ?, ?)
            """, (note_content, now_str, now_str))
            conn.commit()
            note_id = cur.lastrowid
            return {"success": True, "type": "note", "message": "Nota añadida a la pizarra", "id": note_id}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        conn.close()

class TranslateEmailRequest(BaseModel):
    email_id: Optional[int] = None
    subject: str = ""
    body: Optional[str] = None
    text: Optional[str] = None
    target_lang: str = "es"

@app.post("/api/ai/translate")
def translate_email_endpoint(req: TranslateEmailRequest):
    """Traduce un correo electrónico (asunto y cuerpo) al idioma destino usando Gemini."""
    subject = req.subject or ""
    body = req.body or req.text or ""
    if req.email_id and not body:
        conn = get_db()
        row = conn.execute("SELECT subject, body_html, body_text, snippet FROM emails WHERE id = ?", (req.email_id,)).fetchone()
        conn.close()
        if row:
            subject = subject or row["subject"] or ""
            body = row["body_html"] or row["body_text"] or row["snippet"] or ""

    if not body and not subject:
        raise HTTPException(status_code=400, detail="No se proporcionó contenido para traducir.")

    api_key = get_setting("gemini_api_key")
    if not api_key:
        raise HTTPException(status_code=400, detail="Gemini API Key no configurada para traducción.")

    try:
        res = GeminiService.translate_email(subject, body, req.target_lang)
        res["translated_subject"] = res.get("subject", subject)
        res["translated_text"] = res.get("body", body)
        return res
    except Exception as e:
        logger.error(f"Error en traducción de correo: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ai/classify/{email_id}")
def classify_single_email(email_id: int):
    """Clasifica un correo en categoría ejecutiva inteligente con IA y actualiza ai_tags."""
    import json
    conn = get_db()
    row = conn.execute("SELECT id, subject, sender, snippet, body_text, ai_tags FROM emails WHERE id = ?", (email_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Correo no encontrado")

    category = GeminiService.classify_email(row["subject"], row["sender"], row["snippet"] or "", row["body_text"] or "")
    tags = [category]
    conn.execute("UPDATE emails SET ai_tags = ? WHERE id = ?", (json.dumps(tags), email_id))
    conn.commit()
    conn.close()
    return {"success": True, "email_id": email_id, "category": category, "tags": tags}

@app.post("/api/ai/classify-batch")
def classify_batch_emails(req: AIClassifyBatchRequest):
    """Clasifica en lote los correos que no tengan categoría asignada."""
    import json
    conn = get_db()
    if req.email_ids:
        placeholders = ",".join("?" for _ in req.email_ids)
        rows = conn.execute(f"SELECT id, subject, sender, snippet, body_text FROM emails WHERE id IN ({placeholders})", req.email_ids).fetchall()
    else:
        limit = max(10, min(100, req.limit or 50))
        rows = conn.execute(
            "SELECT id, subject, sender, snippet, body_text FROM emails WHERE (ai_tags IS NULL OR ai_tags = '' OR ai_tags = '[]') AND UPPER(COALESCE(folder, '')) NOT IN ('TRASH', 'PAPELERA', 'SPAM') ORDER BY date DESC LIMIT ?",
            (limit,)
        ).fetchall()

    classified = []
    for r in rows:
        cat = GeminiService.classify_email(r["subject"], r["sender"], r["snippet"] or "", r["body_text"] or "")
        tags = [cat]
        conn.execute("UPDATE emails SET ai_tags = ? WHERE id = ?", (json.dumps(tags), r["id"]))
        classified.append({"id": r["id"], "category": cat})
    
    conn.commit()
    conn.close()
    return {"success": True, "count": len(classified), "classified": classified}

@app.post("/api/ai/cleanup-preview")
def cleanup_preview(req: AICleanupRequest):
    """Evalúa todos los correos de todas las cuentas, carpetas y etiquetas según el prompt,
    excluyendo Papelera, Borradores y Spam a menos que el usuario lo indique explícitamente."""
    import re
    prompt_lower = (req.prompt or "").lower()
    folder_upper = (req.folder or "").upper().strip()

    explicit_trash = folder_upper in ("TRASH", "PAPELERA") or bool(re.search(r'\b(papelera|trash|eliminados?|borrados?)\b', prompt_lower))
    explicit_draft = folder_upper in ("DRAFT", "DRAFTS", "BORRADORES") or bool(re.search(r'\b(borrador|borradores|drafts?)\b', prompt_lower))
    explicit_spam = folder_upper in ("SPAM", "JUNK") or bool(re.search(r'\b(spam|no deseados?|correo basura|junk)\b', prompt_lower))

    excluded_folders = set()
    if not explicit_trash:
        excluded_folders.update(["TRASH", "PAPELERA"])
    if not explicit_draft:
        excluded_folders.update(["DRAFT", "DRAFTS", "BORRADORES"])
    if not explicit_spam:
        excluded_folders.update(["SPAM", "JUNK"])

    conn = get_db()
    query = """
        SELECT e.id, e.account_id, a.email as account_email, a.name as account_name,
               e.folder, e.sender, e.subject, e.snippet, e.date
        FROM emails e
        LEFT JOIN accounts a ON e.account_id = a.id
        WHERE 1=1
    """
    params: List[Any] = []
    if excluded_folders:
        ph_ex = ",".join("?" for _ in excluded_folders)
        query += f" AND UPPER(COALESCE(e.folder, '')) NOT IN ({ph_ex})"
        params.extend(list(excluded_folders))

    if req.account_id and not req.all_accounts:
        query += " AND e.account_id = ?"
        params.append(req.account_id)
    if folder_upper and folder_upper not in ('ALL', 'TODAS', 'TODOS', 'GLOBAL', ''):
        query += " AND UPPER(e.folder) = ?"
        params.append(folder_upper)
    query += " ORDER BY e.date DESC, e.id DESC"
    rows = conn.execute(query, params).fetchall()

    emails_data = [dict(r) for r in rows]
    if emails_data:
        eids = [e["id"] for e in emails_data]
        lbl_map: Dict[int, List[str]] = {}
        chunk_sz = 500
        for i in range(0, len(eids), chunk_sz):
            ch = eids[i:i + chunk_sz]
            ph = ",".join("?" for _ in ch)
            lrows = conn.execute(f"""
                SELECT el.email_id, l.name
                FROM email_labels el
                JOIN labels l ON el.label_id = l.id
                WHERE el.email_id IN ({ph})
            """, ch).fetchall()
            for lr in lrows:
                lbl_map.setdefault(lr["email_id"], []).append(lr["name"])
        for e in emails_data:
            e["labels"] = lbl_map.get(e["id"], [])

    conn.close()

    if not emails_data:
        return {"success": True, "candidates": []}

    try:
        result = GeminiService.analyze_cleanup_by_prompt(req.prompt, emails_data)
        return {"success": True, "candidates": result.get("candidates", [])}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- ENDPOINTS DE CALENDARIOS Y EVENTOS ---
_calendar_sync_lock = threading.Lock()
_calendar_sync_in_progress = False

@app.get("/api/calendars")
def get_calendars():
    return CalendarService.get_calendars()

@app.post("/api/calendars/sync")
def sync_calendars():
    global _calendar_sync_in_progress
    with _calendar_sync_lock:
        if _calendar_sync_in_progress:
            return {"success": True, "message": "Sincronización ya en curso en segundo plano", "in_progress": True}
        _calendar_sync_in_progress = True

    try:
        CalendarService.ensure_google_calendars()
        conn = get_db()
        google_accounts = conn.execute("SELECT id FROM accounts WHERE is_active = 1 AND provider IN ('google', 'gmail')").fetchall()
        conn.close()
        
        google_results = []
        any_api_disabled = False
        any_reauth_needed = False
        reauth_accounts = []
        enable_url = None

        for g_acc in google_accounts:
            acc_id = g_acc["id"]
            try:
                res_cal = GoogleOAuthService.sync_google_calendar(acc_id)
                res_tasks = GoogleOAuthService.sync_google_tasks(acc_id)
                google_results.append({"account_id": acc_id, "calendar": res_cal, "tasks": res_tasks})
                if isinstance(res_cal, dict):
                    if res_cal.get("api_disabled"):
                        any_api_disabled = True
                        enable_url = res_cal.get("enable_url")
                    if res_cal.get("needs_reauth") or "invalid_grant" in str(res_cal.get("error", "")):
                        any_reauth_needed = True
                        if acc_id not in reauth_accounts:
                            reauth_accounts.append(acc_id)
                if isinstance(res_tasks, dict):
                    if res_tasks.get("needs_reauth") or "invalid_grant" in str(res_tasks.get("error", "")):
                        any_reauth_needed = True
                        if acc_id not in reauth_accounts:
                            reauth_accounts.append(acc_id)
            except Exception as ge:
                print(f"[Calendar Sync] Aviso en cuenta Google {acc_id}: {ge}")

        if any_api_disabled:
            return {
                "success": False,
                "api_disabled": True,
                "needs_reauth": any_reauth_needed,
                "reauth_accounts": reauth_accounts,
                "enable_url": enable_url or GoogleOAuthService.build_api_enable_url("calendar-json.googleapis.com"),
                "message": "La API de Google Calendar está deshabilitada en la consola de Google Cloud para este proyecto."
            }

        return {
            "success": True,
            "message": "Calendarios sincronizados",
            "details": google_results
        }
    except Exception as e:
        print(f"[Calendar Sync] Error general: {e}")
        return {"success": False, "error": str(e)}
    finally:
        with _calendar_sync_lock:
            _calendar_sync_in_progress = False

@app.get("/api/events")
def get_events(start_date: Optional[str] = None, end_date: Optional[str] = None):
    return CalendarService.get_events(start_date, end_date)

@app.get("/api/events/{event_id}")
def get_event_detail(event_id: int):
    event = CalendarService.get_event_by_id(event_id)
    if not event:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    return event

@app.post("/api/events")
def create_event(event: EventCreateRequest):
    result = CalendarService.create_event(
        calendar_id=event.calendar_id,
        title=event.title,
        start_time=event.start_time,
        end_time=event.end_time,
        description=event.description or "",
        location=event.location or "",
        all_day=event.all_day,
        origin_email_id=event.origin_email_id,
        is_task=event.is_task or 0,
        account_id=event.account_id,
        meeting_url=event.meeting_url or "",
        color=event.color or "",
        recurrence=event.recurrence or "none",
        notification_minutes=event.notification_minutes,
        attendees=event.attendees or "",
        availability=event.availability or "busy",
        visibility=event.visibility or "default"
    )
    return {"success": True, "event": result, "message": "Evento guardado en el calendario"}

@app.put("/api/events/{event_id}")
def update_event(event_id: int, event: EventUpdateRequest):
    result = CalendarService.update_event(
        event_id=event_id,
        calendar_id=event.calendar_id,
        title=event.title,
        start_time=event.start_time,
        end_time=event.end_time,
        description=event.description,
        location=event.location,
        all_day=event.all_day,
        is_task=event.is_task,
        account_id=event.account_id,
        meeting_url=event.meeting_url,
        color=event.color,
        recurrence=event.recurrence,
        notification_minutes=event.notification_minutes,
        attendees=event.attendees,
        availability=event.availability,
        visibility=event.visibility
    )
    if not result:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    return {"success": True, "event": result, "message": "Evento actualizado exitosamente"}

@app.delete("/api/events/{event_id}")
def delete_event(event_id: int):
    success = CalendarService.delete_event(event_id)
    if not success:
        raise HTTPException(status_code=404, detail="Evento no encontrado")
    return {"success": True, "message": "Evento eliminado del calendario"}

@app.get("/api/tasks")
def list_tasks(include_completed: bool = True):
    return CalendarService.get_tasks(include_completed=include_completed)

@app.post("/api/tasks")
def create_task(task: TaskCreateRequest):
    result = CalendarService.create_task(
        calendar_id=task.calendar_id,
        title=task.title,
        description=task.description or "",
        due_date=task.due_date or "",
        account_id=task.account_id
    )
    return {"success": True, "task": result, "message": "Tarea guardada exitosamente"}

@app.patch("/api/tasks/{task_id}/toggle")
def toggle_task(task_id: int):
    updated = CalendarService.toggle_task(task_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Tarea no encontrada")
    return {"success": True, "task": updated}

@app.post("/api/events/from-email/{email_id}")
def create_event_from_email(email_id: int, calendar_id: Optional[int] = Query(None)):
    conn = get_db()
    row = conn.execute("SELECT subject, sender, body_text, snippet FROM emails WHERE id = ?", (email_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Correo no encontrado")

    body = row["body_text"] or row["snippet"] or ""
    try:
        event_info = GeminiService.extract_calendar_event(row["subject"], row["sender"], body)
        if not event_info:
            return {"success": False, "message": "No se detectaron fechas ni eventos específicos en el correo"}

        target_cal_id = calendar_id or CalendarService.get_default_calendar_id()
        event = CalendarService.create_event(
            calendar_id=target_cal_id,
            title=event_info.get("title", row["subject"]),
            start_time=event_info.get("start_time", "2026-11-20T10:00:00"),
            end_time=event_info.get("end_time", "2026-11-20T11:00:00"),
            description=event_info.get("description", ""),
            location=event_info.get("location", ""),
            origin_email_id=email_id
        )
        return {"success": True, "event": event, "message": "Evento creado exitosamente desde el correo"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# --- ENDPOINTS DE ETIQUETAS (LABELS) ---
def _resolve_label_for_email(conn, label_id: int, email_id: int, email_account_id: Optional[int], for_removal: bool = False) -> Optional[Dict[str, Any]]:
    """Etiqueta efectiva al asignar/quitar `label_id` en un correo de `email_account_id`.

    Las etiquetas pertenecen a una cuenta. Si se elige una etiqueta de OTRA cuenta (p. ej. con
    "Todas las cuentas" seleccionado):
      - Se usa la etiqueta homónima (mismo nombre) de la cuenta del correo.
      - Si la cuenta del correo no la tiene, se CREA en esa cuenta (mismo nombre y color) y se usa.
    Las etiquetas compartidas (sin cuenta) y las de la misma cuenta del correo se usan tal cual.
    Al quitar (`for_removal`) nunca se crea nada: se quita la asignada exacta o su homónima.
    """
    row = conn.execute("SELECT id, name, color, account_id, remote_id FROM labels WHERE id = ?", (label_id,)).fetchone()
    if not row:
        return None
    lbl = dict(row)
    if lbl["account_id"] is None or lbl["account_id"] == email_account_id or email_account_id is None:
        return lbl
    if for_removal and conn.execute(
        "SELECT 1 FROM email_labels WHERE email_id = ? AND label_id = ?", (email_id, label_id)
    ).fetchone():
        lbl["remote_id"] = None
        return lbl
    same = _find_label_in_account(conn, email_account_id, lbl["name"])
    if same:
        return same
    if for_removal:
        lbl["remote_id"] = None
        return lbl
    # Crear la etiqueta en la cuenta del correo (y en Gmail si la cuenta es Gmail)
    from datetime import datetime
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    _, remote_id, _ = _create_remote_label_if_gmail(email_account_id, lbl["name"], lbl["color"])
    cur = conn.execute(
        "INSERT INTO labels (name, color, account_id, remote_id, type, updated_at, local_modified) VALUES (?, ?, ?, ?, 'user', ?, 1)",
        (lbl["name"], lbl["color"] or "#3b82f6", email_account_id, remote_id, now_iso)
    )
    return {"id": cur.lastrowid, "name": lbl["name"], "color": lbl["color"], "account_id": email_account_id, "remote_id": remote_id}

def _create_remote_label_if_gmail(account_id: Optional[int], name: str, color: Optional[str]):
    """Si la cuenta es Gmail (OAuth), crea la etiqueta también en Gmail.
    Devuelve (es_gmail, remote_id, error). Si falla, la etiqueta queda local y se reintenta
    en la próxima sincronización de etiquetas (push_pending_local_labels)."""
    if not GoogleOAuthService.is_gmail_api_account(account_id):
        return False, None, None
    try:
        return True, GoogleOAuthService.create_gmail_label(account_id, name, color), None
    except Exception as e:
        print(f"Aviso: no se pudo crear la etiqueta '{name}' en Gmail: {e}")
        return True, None, str(e)

def _find_label_in_account(conn, account_id: int, name: str) -> Optional[Dict[str, Any]]:
    """Etiqueta de `account_id` con ese nombre (sin distinguir mayúsculas), o None."""
    key = (name or "").strip().casefold()
    for row in conn.execute(
        "SELECT id, name, color, account_id, remote_id FROM labels WHERE account_id = ? ORDER BY id", (account_id,)
    ).fetchall():
        if (row["name"] or "").strip().casefold() == key:
            return dict(row)
    return None

@app.get("/api/labels")
def list_labels(account_id: Optional[int] = None):
    """Lista de etiquetas.

    - Sin account_id ("Todas las cuentas"): todas las etiquetas de todas las cuentas.
    - Con account_id: solo las etiquetas de esa cuenta, es decir, las propias de la cuenta
      (labels.account_id = cuenta) más cualquier otra etiqueta que esté en uso en algún
      correo de esa cuenta.

    Cada etiqueta incluye `account_ids`: cuentas cuyos correos tienen asignada la etiqueta.
    """
    conn = get_db()

    # Auto-sincronizar etiquetas de Gmail (OAuth) en cuentas que aún no tienen ninguna.
    # En "Todas las cuentas" se revisan todas las cuentas activas, no solo la primera.
    if account_id:
        candidate_accs = conn.execute("SELECT id, auth_type FROM accounts WHERE id = ?", (account_id,)).fetchall()
    else:
        candidate_accs = conn.execute("SELECT id, auth_type FROM accounts WHERE is_active = 1 ORDER BY id ASC").fetchall()
    for acc in candidate_accs:
        if acc["auth_type"] != "oauth2":
            continue
        existing_acc_labels = conn.execute("SELECT COUNT(*) as total FROM labels WHERE account_id = ?", (acc["id"],)).fetchone()["total"]
        if existing_acc_labels == 0:
            threading.Thread(
                target=GoogleOAuthService.sync_gmail_labels,
                args=(acc["id"], True),
                daemon=True
            ).start()

    rows = conn.execute("SELECT * FROM labels WHERE COALESCE(type, 'user') != 'system' ORDER BY name COLLATE NOCASE ASC, account_id ASC").fetchall()
    usage_rows = conn.execute(
        """SELECT DISTINCT el.label_id, e.account_id
           FROM email_labels el
           JOIN emails e ON e.id = el.email_id
           WHERE e.account_id IS NOT NULL"""
    ).fetchall()
    conn.close()

    usage_by_label: Dict[int, List[int]] = {}
    for u in usage_rows:
        usage_by_label.setdefault(u["label_id"], []).append(u["account_id"])

    labels = []
    for r in rows:
        lbl = dict(r)
        lbl["account_ids"] = sorted(usage_by_label.get(lbl["id"], []))
        if account_id:
            owned = lbl["account_id"] == account_id
            in_use = account_id in lbl["account_ids"]
            if not (owned or in_use):
                continue
        labels.append(lbl)
    return labels

@app.post("/api/labels/sync")
def sync_labels(account_id: Optional[int] = None):
    conn = get_db()
    if account_id:
        target_ids = [account_id]
    else:
        # "Todas las cuentas": sincronizar las etiquetas de todas las cuentas Gmail (OAuth) activas
        all_accs = conn.execute("SELECT id, auth_type FROM accounts WHERE is_active = 1 ORDER BY id ASC").fetchall()
        if not all_accs:
            conn.close()
            return {"success": False, "error": "No hay cuentas configuradas"}
        target_ids = [a["id"] for a in all_accs if a["auth_type"] == "oauth2"]
    conn.close()

    from backend.google_oauth import GoogleOAuthService
    labels = []
    for acc_id in target_ids:
        labels.extend(GoogleOAuthService.sync_gmail_labels(acc_id, force=True))
    return {"success": True, "count": len(labels), "labels": labels}

@app.post("/api/labels")
def create_label(req: LabelCreateRequest):
    from datetime import datetime
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="El nombre de la etiqueta es obligatorio")
    name = req.name.strip()
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = get_db()
    # Si la cuenta ya tiene una etiqueta con ese nombre se reutiliza en lugar de duplicarla
    existing = _find_label_in_account(conn, req.account_id, name) if req.account_id else None
    conn.close()

    # En cuentas Gmail (OAuth) la etiqueta se crea también en Gmail (o se vincula si ya existe allí)
    is_gmail, remote_id, gmail_error = (False, None, None)
    if not existing or not existing.get("remote_id"):
        is_gmail, remote_id, gmail_error = _create_remote_label_if_gmail(
            req.account_id, existing["name"] if existing else name, existing["color"] if existing else req.color
        )
    else:
        is_gmail, remote_id = True, existing["remote_id"]

    conn = get_db()
    if existing:
        label_id = existing["id"]
        if remote_id and not existing.get("remote_id"):
            conn.execute("UPDATE labels SET remote_id = ?, type = 'user' WHERE id = ?", (remote_id, label_id))
        result_name, result_color = existing["name"], existing["color"]
    else:
        cursor = conn.execute(
            "INSERT INTO labels (name, color, account_id, remote_id, type, updated_at, local_modified) VALUES (?, ?, ?, ?, 'user', ?, 1)",
            (name, req.color or "#3b82f6", req.account_id, remote_id, now_iso)
        )
        label_id = cursor.lastrowid
        result_name, result_color = name, req.color
    conn.commit()
    conn.close()
    return {
        "success": True, "existing": bool(existing), "label_id": label_id,
        "name": result_name, "color": result_color, "account_id": req.account_id,
        "gmail": {"is_gmail": is_gmail, "synced": bool(remote_id), "remote_id": remote_id, "error": gmail_error},
    }

@app.put("/api/labels/{label_id}")
def update_label(label_id: int, req: LabelCreateRequest):
    from datetime import datetime
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = get_db()
    row = conn.execute("SELECT account_id, remote_id FROM labels WHERE id = ?", (label_id,)).fetchone()
    conn.execute("UPDATE labels SET name = ?, color = ?, updated_at = ?, local_modified = 1 WHERE id = ?", (req.name.strip(), req.color, now_iso, label_id))
    conn.commit()
    conn.close()

    # Reflejar el cambio en Gmail si la etiqueta existe allí
    gmail_error = None
    if row and row["remote_id"] and GoogleOAuthService.is_gmail_api_account(row["account_id"]):
        try:
            GoogleOAuthService.update_gmail_label(row["account_id"], row["remote_id"], req.name.strip(), req.color)
        except Exception as e:
            gmail_error = str(e)
            print(f"Aviso: no se pudo actualizar la etiqueta en Gmail: {e}")
    return {"success": True, "message": "Etiqueta actualizada", "gmail_error": gmail_error}

@app.delete("/api/labels/{label_id}")
def delete_label(label_id: int):
    conn = get_db()
    row = conn.execute("SELECT account_id, remote_id FROM labels WHERE id = ?", (label_id,)).fetchone()
    conn.close()

    # Eliminarla también en Gmail; si no, la próxima sincronización la volvería a importar
    if row and row["remote_id"] and GoogleOAuthService.is_gmail_api_account(row["account_id"]):
        try:
            GoogleOAuthService.delete_gmail_label(row["account_id"], row["remote_id"])
        except Exception as e:
            msg = str(e)
            if "404" not in msg and "not found" not in msg.lower():
                raise HTTPException(status_code=502, detail=f"No se pudo eliminar la etiqueta en Gmail: {msg}")

    conn = get_db()
    conn.execute("DELETE FROM email_labels WHERE label_id = ?", (label_id,))
    conn.execute("DELETE FROM labels WHERE id = ?", (label_id,))
    conn.commit()
    conn.close()
    return {"success": True, "message": "Etiqueta eliminada"}

@app.post("/api/emails/{email_id}/labels")
def add_label_to_email(email_id: int, req: EmailLabelRequest):
    from datetime import datetime
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = get_db()
    email_row = conn.execute("SELECT account_id, uid FROM emails WHERE id = ?", (email_id,)).fetchone()
    if not email_row:
        conn.close()
        raise HTTPException(status_code=404, detail="Correo no encontrado")
    lbl = _resolve_label_for_email(conn, req.label_id, email_id, email_row["account_id"])
    if not lbl:
        conn.close()
        raise HTTPException(status_code=404, detail="Etiqueta no encontrada")
    conn.execute("INSERT OR IGNORE INTO email_labels (email_id, label_id) VALUES (?, ?)", (email_id, lbl["id"]))
    conn.execute("UPDATE emails SET updated_at = ?, local_modified = 1 WHERE id = ?", (now_iso, email_id))
    conn.commit()
    conn.close()

    if lbl["remote_id"] and email_row["uid"]:
        threading.Thread(
            target=GoogleOAuthService.modify_message_labels,
            args=(email_row["account_id"], email_row["uid"], [lbl["remote_id"]], None),
            daemon=True
        ).start()

    return {"success": True, "message": "Etiqueta agregada al correo", "label_id": lbl["id"]}

@app.delete("/api/emails/{email_id}/labels/{label_id}")
def remove_label_from_email(email_id: int, label_id: int):
    from datetime import datetime
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = get_db()
    email_row = conn.execute("SELECT account_id, uid FROM emails WHERE id = ?", (email_id,)).fetchone()
    lbl = _resolve_label_for_email(conn, label_id, email_id, email_row["account_id"], for_removal=True) if email_row else None
    target_label_id = lbl["id"] if lbl else label_id
    conn.execute("DELETE FROM email_labels WHERE email_id = ? AND label_id = ?", (email_id, target_label_id))
    conn.execute("UPDATE emails SET updated_at = ?, local_modified = 1 WHERE id = ?", (now_iso, email_id))
    conn.commit()
    conn.close()

    if email_row and lbl and lbl["remote_id"] and email_row["uid"]:
        threading.Thread(
            target=GoogleOAuthService.modify_message_labels,
            args=(email_row["account_id"], email_row["uid"], None, [lbl["remote_id"]]),
            daemon=True
        ).start()

    return {"success": True, "message": "Etiqueta removida del correo"}

# --- ENDPOINTS DE PIZARRA DE NOTAS ADHESIVAS (ORGANIZER) ---
class NoteCreateRequest(BaseModel):
    content: Optional[str] = ""
    color: Optional[str] = "yellow"
    x: Optional[int] = 20
    y: Optional[int] = 20
    width: Optional[int] = 220
    height: Optional[int] = 170
    z_index: Optional[int] = 1

class NoteUpdateRequest(BaseModel):
    content: Optional[str] = None
    color: Optional[str] = None
    x: Optional[int] = None
    y: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None
    z_index: Optional[int] = None

class NotePosBatchItem(BaseModel):
    id: int
    x: int
    y: int

class NoteBatchPositionsRequest(BaseModel):
    positions: List[NotePosBatchItem]

@app.get("/api/notes")
def get_all_notes():
    """Retorna todas las notas ordenadas por apilamiento z_index ascendente."""
    conn = get_db()
    rows = conn.execute("SELECT * FROM notes ORDER BY z_index ASC, id ASC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/api/notes")
def create_note(req: NoteCreateRequest):
    """Crea una nueva nota adhesiva en la pizarra."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO notes (content, color, x, y, width, height, z_index)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        req.content or "",
        req.color or "yellow",
        req.x if req.x is not None else 20,
        req.y if req.y is not None else 20,
        max(220, req.width or 220),
        max(170, req.height or 170),
        req.z_index if req.z_index is not None else 1
    ))
    new_id = cursor.lastrowid
    conn.commit()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (new_id,)).fetchone()
    conn.close()
    return dict(row)

@app.put("/api/notes/{note_id}")
def update_note(note_id: int, req: NoteUpdateRequest):
    """Actualiza parcialmente una nota adhesiva."""
    conn = get_db()
    row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="Nota no encontrada")

    updates = []
    params = []

    if req.content is not None:
        updates.append("content = ?")
        params.append(req.content)
    if req.color is not None:
        updates.append("color = ?")
        params.append(req.color)
    if req.x is not None:
        updates.append("x = ?")
        params.append(req.x)
    if req.y is not None:
        updates.append("y = ?")
        params.append(req.y)
    if req.width is not None:
        updates.append("width = ?")
        params.append(max(220, req.width))
    if req.height is not None:
        updates.append("height = ?")
        params.append(max(170, req.height))
    if req.z_index is not None:
        updates.append("z_index = ?")
        params.append(req.z_index)

    if updates:
        updates.append("updated_at = CURRENT_TIMESTAMP")
        query = f"UPDATE notes SET {', '.join(updates)} WHERE id = ?"
        params.append(note_id)
        conn.execute(query, params)
        conn.commit()

    updated_row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
    conn.close()
    return dict(updated_row)

@app.delete("/api/notes/{note_id}")
def delete_note(note_id: int):
    """Elimina una nota adhesiva de la pizarra."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    if not deleted:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    return {"success": True, "message": "Nota eliminada exitosamente"}

@app.post("/api/notes/batch-position")
def batch_update_note_positions(req: NoteBatchPositionsRequest):
    """Actualiza en lote las posiciones (x, y) de las notas al auto-organizar."""
    conn = get_db()
    cursor = conn.cursor()
    for item in req.positions:
        cursor.execute("UPDATE notes SET x = ?, y = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (item.x, item.y, item.id))
    conn.commit()
    conn.close()
    return {"success": True, "message": f"{len(req.positions)} notas actualizadas"}

