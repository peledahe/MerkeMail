import sqlite3
import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "merkemail.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Tabla de cuentas de correo
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            provider TEXT NOT NULL, -- 'gmail', 'proton', 'custom'
            auth_type TEXT DEFAULT 'password', -- 'password' o 'oauth2'
            imap_host TEXT NOT NULL DEFAULT '',
            imap_port INTEGER NOT NULL DEFAULT 993,
            imap_ssl INTEGER DEFAULT 1,
            imap_user TEXT NOT NULL DEFAULT '',
            imap_password TEXT NOT NULL DEFAULT '',
            smtp_host TEXT NOT NULL DEFAULT '',
            smtp_port INTEGER NOT NULL DEFAULT 587,
            smtp_ssl INTEGER DEFAULT 1,
            color TEXT DEFAULT '#ef4444',
            oauth_access_token TEXT,
            oauth_refresh_token TEXT,
            oauth_token_expiry TIMESTAMP,
            sync_interval INTEGER DEFAULT 5,
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Migrar columnas nuevas si la tabla ya existía
    migrations = [
        "ALTER TABLE accounts ADD COLUMN color TEXT DEFAULT '#ef4444'",
        "ALTER TABLE accounts ADD COLUMN auth_type TEXT DEFAULT 'password'",
        "ALTER TABLE accounts ADD COLUMN oauth_access_token TEXT",
        "ALTER TABLE accounts ADD COLUMN oauth_refresh_token TEXT",
        "ALTER TABLE accounts ADD COLUMN oauth_token_expiry TIMESTAMP",
        "ALTER TABLE accounts ADD COLUMN sync_interval INTEGER DEFAULT 5",
        "ALTER TABLE accounts ADD COLUMN avatar_url TEXT",
        "ALTER TABLE labels ADD COLUMN remote_id TEXT",
        "ALTER TABLE labels ADD COLUMN type TEXT DEFAULT 'user'"
    ]
    for m in migrations:
        try:
            cursor.execute(m)
        except Exception:
            pass
    
    # Tabla de correos en caché local
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS emails (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            uid TEXT NOT NULL,
            folder TEXT NOT NULL DEFAULT 'INBOX',
            sender TEXT NOT NULL,
            sender_name TEXT,
            recipient TEXT NOT NULL,
            subject TEXT,
            snippet TEXT,
            body_text TEXT,
            body_html TEXT,
            date TIMESTAMP,
            is_read INTEGER DEFAULT 0,
            is_starred INTEGER DEFAULT 0,
            has_attachments INTEGER DEFAULT 0,
            ai_summary TEXT,
            ai_urgency TEXT, -- 'alta', 'media', 'baja'
            ai_tags TEXT, -- JSON array
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(account_id, folder, uid),
            FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
        )
    ''')
    
    # Tabla de calendarios (Google, Proton, etc.)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS calendars (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            provider TEXT NOT NULL, -- 'google', 'proton', 'local'
            color TEXT DEFAULT '#4f46e5',
            ics_url TEXT,
            is_visible INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Tabla de eventos de calendario
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            calendar_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            location TEXT,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            all_day INTEGER DEFAULT 0,
            origin_email_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (calendar_id) REFERENCES calendars (id) ON DELETE CASCADE
        )
    ''')
    
    # Tabla de configuraciones y API Keys
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Tabla de firmas de correo
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS signatures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            content TEXT NOT NULL,
            account_id INTEGER, -- NULL para todas las cuentas
            is_default INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (account_id) REFERENCES accounts (id) ON DELETE CASCADE
        )
    ''')

    # Tabla de etiquetas personalizadas (Labels)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS labels (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT DEFAULT '#3b82f6',
            account_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Tabla relacional de correos y etiquetas
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS email_labels (
            email_id INTEGER NOT NULL,
            label_id INTEGER NOT NULL,
            PRIMARY KEY (email_id, label_id),
            FOREIGN KEY (email_id) REFERENCES emails (id) ON DELETE CASCADE,
            FOREIGN KEY (label_id) REFERENCES labels (id) ON DELETE CASCADE
        )
    ''')

    # Tabla de archivos adjuntos (Attachments)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email_id INTEGER NOT NULL,
            filename TEXT NOT NULL,
            content_type TEXT DEFAULT 'application/octet-stream',
            size INTEGER DEFAULT 0,
            remote_id TEXT,
            file_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (email_id) REFERENCES emails (id) ON DELETE CASCADE
        )
    ''')

    # Índices de alto rendimiento para acelerar listados, búsquedas, filtros y contadores
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_emails_acc_folder ON emails(account_id, folder)",
        "CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC)",
        "CREATE INDEX IF NOT EXISTS idx_emails_read ON emails(is_read)",
        "CREATE INDEX IF NOT EXISTS idx_emails_starred ON emails(is_starred)",
        "CREATE INDEX IF NOT EXISTS idx_emails_uid ON emails(account_id, uid)",
        "CREATE INDEX IF NOT EXISTS idx_email_labels_eid ON email_labels(email_id, label_id)",
        "CREATE INDEX IF NOT EXISTS idx_attachments_eid ON attachments(email_id)"
    ]
    for idx in indexes:
        try:
            cursor.execute(idx)
        except Exception:
            pass
    
    conn.commit()

    # Sembrar etiquetas por defecto si está vacía
    lbl_count = cursor.execute("SELECT count(*) as total FROM labels").fetchone()["total"]
    if lbl_count == 0:
        demo_labels = [
            ("Proyectos", "#3b82f6"),
            ("Facturación", "#10b981"),
            ("Trabajo", "#f59e0b"),
            ("Personal", "#ec4899"),
            ("Suscripciones", "#8b5cf6")
        ]
        cursor.executemany("INSERT INTO labels (name, color) VALUES (?, ?)", demo_labels)
        conn.commit()
    
    # Inicializar configuraciones por defecto si no existen
    default_settings = {
        "gemini_api_key": os.getenv("GEMINI_API_KEY", ""),
        "gemini_model": "gemini-3.8-flash",
        "theme": "dark",
        "ai_prompt_tone": "formal"
    }
    for k, v in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))
    
    # Migrar modelo legacy a gemini-3.8-flash si estuviera en 2.5
    cursor.execute("UPDATE settings SET value = 'gemini-3.8-flash' WHERE key = 'gemini_model' AND value LIKE '%2.5%'")
    conn.commit()
        
    # Inicializar calendarios por defecto si no existen
    cursor.execute("SELECT COUNT(*) as count FROM calendars")
    if cursor.fetchone()["count"] == 0:
        cursor.execute("INSERT INTO calendars (name, provider, color) VALUES (?, ?, ?)", ("Google Calendar", "google", "#3b82f6"))
        cursor.execute("INSERT INTO calendars (name, provider, color) VALUES (?, ?, ?)", ("Proton Calendar", "proton", "#8b5cf6"))
    
    conn.commit()
    conn.close()

# Helper functions para Settings
def get_setting(key: str, default: str = "") -> str:
    conn = get_db()
    row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row["value"] if row else default

def set_setting(key: str, value: str):
    conn = get_db()
    conn.execute('''
        INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    ''', (key, value))
    conn.commit()
    conn.close()

def get_all_settings() -> Dict[str, str]:
    conn = get_db()
    rows = conn.execute("SELECT key, value FROM settings").fetchall()
    conn.close()
    return {row["key"]: row["value"] for row in rows}

init_db()
