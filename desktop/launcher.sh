#!/usr/bin/env bash
# MerkeMail Desktop Launcher
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MERKEMAIL_PORT="${MERKEMAIL_PORT:-6524}"
export DISPLAY="${DISPLAY:-:0}"
export PYTHONPATH="$DIR:$PYTHONPATH"

PYTHON_BIN="$DIR/.venv/bin/python3"
if [ ! -f "$PYTHON_BIN" ]; then
    PYTHON_BIN="$(which python3)"
fi

if [ -f "$DIR/desktop/app_window.py" ]; then
    exec "$PYTHON_BIN" "$DIR/desktop/app_window.py" "$@"
else
    exec "$PYTHON_BIN" "$DIR/desktop/tray.py" "$@"
fi
