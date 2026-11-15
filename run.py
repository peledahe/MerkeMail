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
