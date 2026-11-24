#!/usr/bin/env python3
"""
MerkeMail - Smoke test de la API (sin dependencias extra, solo stdlib).

Copia el proyecto a un directorio temporal, arranca el backend en un puerto libre
con una base de datos NUEVA (datos demo), ejecuta pruebas sobre los endpoints
principales y apaga el servidor. Tu carpeta data/ real nunca se toca.

Uso (desde la raíz del proyecto, con el venv activo):
    python tests/smoke_test.py            # pruebas offline (no requiere Internet ni claves)
    python tests/smoke_test.py --keep     # deja el directorio temporal para inspeccionarlo

Código de salida 0 = todo OK, 1 = hubo fallos.
"""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESULTS = []


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def call(base, method, path, body=None, timeout=30):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            status = r.status
    except urllib.error.HTTPError as e:
        raw, status = e.read(), e.code
    try:
        return status, json.loads(raw)
    except Exception:
        return status, raw.decode("utf-8", "replace")


def check(name, cond, detail=""):
    RESULTS.append((name, bool(cond), detail))
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f"  -> {detail}" if detail and not cond else ""))


def run_tests(base):
    print("\n== Frontend / estáticos")
    s, b = call(base, "GET", "/")
    check("GET / sirve index.html", s == 200 and "<html" in str(b).lower())
    check("index.html usa Tailwind local (no el CDN)", "cdn.tailwindcss.com" not in str(b)
          and "/static/js/vendor/tailwindcss-3.4.17.js" in str(b))
    for p in ("/manifest.json", "/sw.js", "/static/js/app.js", "/static/css/app.css", "/img/merke.png",
              "/static/js/vendor/tailwindcss-3.4.17.js"):
        req = urllib.request.Request(base + p)
        try:
            with urllib.request.urlopen(req, timeout=10) as r:
                check(f"GET {p}", r.status == 200)
        except Exception as e:
            check(f"GET {p}", False, str(e))

    print("\n== Ajustes")
    s, b = call(base, "GET", "/api/settings")
    check("GET /api/settings", s == 200 and "gemini_model" in b, b)
    s, b = call(base, "GET", "/api/auth/google/config")
    check("GET /api/auth/google/config", s == 200 and "has_config" in b, b)

    print("\n== Cuentas (datos demo)")
    s, accs = call(base, "GET", "/api/accounts")
    check("GET /api/accounts devuelve cuentas demo", s == 200 and isinstance(accs, list) and len(accs) >= 1, accs)
    s, b = call(base, "GET", "/api/accounts/1")
    check("GET /api/accounts/1 no expone la contraseña", s == 200 and b.get("imap_password") == "", b)
    check("GET /api/accounts/1 no expone tokens OAuth",
          "oauth_refresh_token" not in b and "oauth_access_token" not in b)
    s, b = call(base, "GET", "/api/accounts/default")
    check("GET /api/accounts/default", s == 200 and b and "email" in b, b)

    print("\n== Correos")
    s, b = call(base, "GET", "/api/emails?folder=INBOX")
    items = b.get("items", []) if isinstance(b, dict) else []
    check("GET /api/emails?folder=INBOX lista correos demo", s == 200 and len(items) >= 1, b)
    eid = items[0]["id"] if items else 1
    s, b = call(base, "GET", f"/api/emails/{eid}")
    check(f"GET /api/emails/{eid} detalle", s == 200 and "subject" in b, b)
    s, b = call(base, "GET", "/api/emails?search=Reuni%C3%B3n")
    check("Búsqueda de correos", s == 200 and len(b.get("items", [])) >= 1, b)
    s, b = call(base, "GET", "/api/emails/unread-counts")
    check("GET /api/emails/unread-counts", s == 200 and "folders" in b, b)
    s, b = call(base, "POST", f"/api/emails/{eid}/star")
    check("Marcar/desmarcar destacado", s == 200, b)
    s, b = call(base, "POST", f"/api/emails/{eid}/toggle-read")
    check("Alternar leído/no leído", s == 200, b)

    print("\n== Etiquetas")
    s, b = call(base, "POST", "/api/labels", {"name": "SmokeTest", "color": "#ff0000"})
    lid = b.get("label_id") if isinstance(b, dict) else None
    check("Crear etiqueta", s == 200 and lid, b)
    if lid:
        s, b = call(base, "POST", f"/api/emails/{eid}/labels", {"label_id": lid})
        check("Asignar etiqueta a correo", s == 200, b)
        s, b = call(base, "DELETE", f"/api/emails/{eid}/labels/{lid}")
        check("Quitar etiqueta de correo", s == 200, b)
        s, b = call(base, "DELETE", f"/api/labels/{lid}")
        check("Eliminar etiqueta", s == 200, b)

    print("\n== Firmas")
    s, b = call(base, "POST", "/api/signatures", {"name": "Smoke", "content": "-- smoke"})
    sid = b.get("id") if isinstance(b, dict) else None
    check("Crear firma", s == 200 and sid, b)
    if sid:
        s, b = call(base, "PUT", f"/api/signatures/{sid}", {"name": "Smoke2", "content": "-- smoke2"})
        check("Editar firma", s == 200, b)
        s, b = call(base, "DELETE", f"/api/signatures/{sid}")
        check("Eliminar firma", s == 200, b)

    print("\n== Contactos")
    s, b = call(base, "POST", "/api/contacts", {"name": "Smoke Test", "email": "smoke@ejemplo.com"})
    cid = b.get("id") if isinstance(b, dict) else None
    check("Crear contacto", s == 200 and cid, b)
    if cid:
        s, b = call(base, "GET", f"/api/contacts/{cid}")
        check("Leer contacto", s == 200, b)
        s, b = call(base, "DELETE", f"/api/contacts/{cid}")
        check("Eliminar contacto", s == 200, b)

    print("\n== Calendario y tareas")
    # En una instalación nueva los calendarios de Google se crean en segundo plano
    # (ensure_google_calendars) unos segundos después del arranque; esperar a que existan
    # para que el evento se asigne a un calendario visible.
    b = []
    for _ in range(30):
        s, b = call(base, "GET", "/api/calendars")
        if s == 200 and isinstance(b, list) and b:
            break
        time.sleep(1)
    check("GET /api/calendars (calendario inicializado)", s == 200 and isinstance(b, list) and len(b) >= 1, b)
    s, b = call(base, "POST", "/api/events", {"title": "Smoke event",
                                               "start_time": "2030-01-10T10:00:00",
                                               "end_time": "2030-01-10T11:00:00"})
    ev = (b or {}).get("event") if isinstance(b, dict) else None
    check("Crear evento", s == 200 and ev, b)
    if ev:
        s, b = call(base, "GET", "/api/events?start_date=2030-01-01&end_date=2030-01-31")
        check("Evento visible en rango de fechas", s == 200 and any(e["id"] == ev["id"] for e in b), b)
        s, b = call(base, "DELETE", f"/api/events/{ev['id']}")
        check("Eliminar evento", s == 200, b)
    s, b = call(base, "POST", "/api/tasks", {"title": "Smoke task", "due_date": "2030-01-11"})
    task = (b or {}).get("task") if isinstance(b, dict) else None
    check("Crear tarea", s == 200 and task, b)
    if task:
        s, b = call(base, "PATCH", f"/api/tasks/{task['id']}/toggle")
        check("Completar tarea", s == 200, b)

    print("\n== IA (sin API key: debe fallar de forma controlada)")
    s, b = call(base, "POST", "/api/ai/draft", {"prompt": "hola", "tone": "formal"})
    check("Borrador IA sin key -> 400 controlado", s == 400, b)
    s, b = call(base, "POST", "/api/agent/chat", {"message": "hola"})
    check("Agente Elio sin key -> respuesta controlada", s == 200 and b.get("success") is False, b)

    print("\n== Escritorio")
    s, b = call(base, "GET", "/api/desktop/window/state")
    check("GET /api/desktop/window/state", s == 200, b)


def main():
    keep = "--keep" in sys.argv
    tmp = Path(tempfile.mkdtemp(prefix="merkemail-smoke-"))
    app_dir = tmp / "app"
    shutil.copytree(ROOT, app_dir, ignore=shutil.ignore_patterns(
        ".venv", "venv", "data", "__pycache__", ".git", "tests"))
    port = free_port()
    base = f"http://127.0.0.1:{port}"
    log_path = tmp / "server.log"
    env = dict(os.environ, PYTHONPATH=str(app_dir))
    print(f"Proyecto temporal: {app_dir}\nServidor: {base}\nLog: {log_path}")

    with open(log_path, "w") as log:
        proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "backend.main:app",
                                 "--host", "127.0.0.1", "--port", str(port)],
                                cwd=app_dir, env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            for _ in range(150):
                if proc.poll() is not None:
                    print("El servidor terminó al arrancar. Log:\n" + log_path.read_text())
                    return 1
                try:
                    urllib.request.urlopen(base + "/api/settings", timeout=1)
                    break
                except Exception:
                    time.sleep(0.2)
            else:
                print("Timeout esperando al servidor. Log:\n" + log_path.read_text())
                return 1
            run_tests(base)
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()

    failed = [r for r in RESULTS if not r[1]]
    print(f"\nResultado: {len(RESULTS) - len(failed)}/{len(RESULTS)} pruebas OK")
    if "Traceback" in log_path.read_text():
        print(f"Aviso: hay trazas de error en el log del servidor ({log_path})")
    if not keep and not failed:
        shutil.rmtree(tmp, ignore_errors=True)
    else:
        print(f"Directorio temporal conservado: {tmp}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
