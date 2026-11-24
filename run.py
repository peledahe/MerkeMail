#!/usr/bin/env python3
"""
Lanzador de MerkeMail - Gestor de Correos y Calendario con Gemini AI
"""

import sys
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
venv_dir = BASE_DIR / ".venv"
venv_python = venv_dir / "bin" / "python3"

# Auto-activar el entorno virtual si se ejecuta con el python del sistema
if venv_python.exists() and sys.prefix != str(venv_dir):
    os.execv(str(venv_python), [str(venv_python)] + sys.argv)


def check_dependencies() -> None:
    """Verifica que las librerías de requirements.txt estén instaladas antes de arrancar,
    para mostrar un mensaje claro en lugar de un ModuleNotFoundError a mitad del arranque."""
    import re
    from importlib import metadata

    req_file = BASE_DIR / "requirements.txt"
    if not req_file.exists():
        return
    missing = []
    for line in req_file.read_text(encoding="utf-8").splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        name = re.split(r"[<>=!~;\[ ]", line, maxsplit=1)[0]
        try:
            metadata.distribution(name)
        except metadata.PackageNotFoundError:
            missing.append(name)
    if missing:
        print("ERROR: faltan librerías necesarias para ejecutar MerkeMail:")
        print("   " + ", ".join(missing))
        print(f"Python en uso: {sys.executable}")
        if not venv_python.exists():
            print("No existe el entorno virtual .venv. Instala las dependencias con:")
        else:
            print("El entorno virtual .venv está incompleto. Reinstala las dependencias con:")
        print("   ./setup.sh install")
        print("(o manualmente: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)")
        sys.exit(1)


check_dependencies()

import webbrowser
import threading
import time
import uvicorn

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

def open_browser(port: int):
    time.sleep(1.2)
    url = f"http://127.0.0.1:{port}"
    print(f"\n🚀 Abriendo MerkeMail en tu navegador: {url}\n")
    try:
        webbrowser.open(url)
    except Exception as e:
        print(f"No se pudo abrir el navegador automáticamente: {e}")

def main():
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "127.0.0.1")

    print("=" * 60)
    print("           📬 MERKEMAIL - GESTOR DE CORREOS & CALENDARIO")
    print("               Potenciado con Google Gemini AI SDK")
    print("=" * 60)
    print(f" Servidor iniciado en: http://{host}:{port}")
    print(" Presiona CTRL+C para detener el servidor")
    print("=" * 60)

    # Iniciar hilo para abrir el navegador
    threading.Thread(target=open_browser, args=(port,), daemon=True).start()

    # Ejecutar FastAPI
    uvicorn.run("backend.main:app", host=host, port=port, log_level="info")

if __name__ == "__main__":
    main()
