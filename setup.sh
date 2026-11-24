#!/usr/bin/env bash
# MerkeMail - instalación, prueba y arranque en un solo comando.
#
#   ./setup.sh            -> instala dependencias + ejecuta smoke test + arranca la app web
#   ./setup.sh install    -> solo instala (crea .venv e instala requirements)
#   ./setup.sh test       -> solo ejecuta el smoke test automático
#   ./setup.sh run        -> solo arranca la app web (http://127.0.0.1:8000)
#   ./setup.sh desktop    -> instala PyQt6 y arranca la versión de escritorio
#   ./setup.sh reset      -> borra data/ (base de datos, clave de cifrado, logs) -> vuelve a datos demo
#   ./setup.sh seed [..]  -> genera varios días de correo ficticio de prueba (--add-accounts crea 2 cuentas extra; ver -h)
#   ./setup.sh seed-calendar [..] -> eventos, subcalendarios y tareas de prueba para las cuentas Google (ver -h)
set -e
cd "$(dirname "$0")"
VENV=".venv"
PY="$VENV/bin/python"

step() { printf "\n\033[1;34m==> %s\033[0m\n" "$1"; }

install() {
    step "Verificando Python"
    command -v python3 >/dev/null || { echo "ERROR: python3 no encontrado. Instala Python 3.11+"; exit 1; }
    python3 -c 'import sys; assert sys.version_info >= (3, 11), sys.version' \
        || { echo "ERROR: se requiere Python 3.11 o superior"; exit 1; }
    python3 --version

    if [ ! -x "$PY" ]; then
        step "Creando entorno virtual en $VENV"
        python3 -m venv "$VENV" || { echo "ERROR: falta el módulo venv (Debian/Ubuntu: sudo apt install python3-venv)"; exit 1; }
    fi
    step "Instalando dependencias (requirements.txt)"
    "$PY" -m pip install --upgrade pip -q
    "$PY" -m pip install -r requirements.txt -q
    "$PY" -m pip check
}

run_tests() {
    step "Ejecutando smoke test automático (base de datos temporal, no toca data/)"
    "$PY" tests/smoke_test.py
}

run_web() {
    step "Arrancando MerkeMail en http://127.0.0.1:${PORT:-8000}  (Ctrl+C para detener)"
    "$PY" run.py
}

run_desktop() {
    step "Instalando dependencias de escritorio (PyQt6)"
    "$PY" -m pip install -r requirements-desktop.txt -q
    step "Arrancando MerkeMail Desktop (puerto 6524)"
    exec ./desktop/launcher.sh
}

case "${1:-all}" in
    install) install ;;
    test)    [ -x "$PY" ] || install; run_tests ;;
    run)     [ -x "$PY" ] || install; run_web ;;
    desktop) [ -x "$PY" ] || install; run_desktop ;;
    reset)   rm -rf data/ && echo "data/ eliminado. El próximo arranque cargará datos demo." ;;
    seed)    [ -x "$PY" ] || install; shift; "$PY" tests/generate_test_emails.py "$@" ;;
    seed-calendar) [ -x "$PY" ] || install; shift; "$PY" tests/generate_test_calendar.py "$@" ;;
    all)     install; run_tests; run_web ;;
    *)       sed -n '2,12p' "$0"; exit 1 ;;
esac
