import sqlite3
import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional
from datetime import datetime

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "merkemail.db"
DB_PATH.parent.mkdir(parents=True, exist_ok=True)

def get_db():
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA temp_store=MEMORY")
    conn.execute("PRAGMA cache_size=-32000")
    conn.execute("PRAGMA mmap_size=268435456")
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
        "ALTER TABLE accounts ADD COLUMN is_default INTEGER DEFAULT 0",
        "ALTER TABLE labels ADD COLUMN remote_id TEXT",
        "ALTER TABLE labels ADD COLUMN type TEXT DEFAULT 'user'",
        "ALTER TABLE calendars ADD COLUMN account_id INTEGER",
        "ALTER TABLE calendars ADD COLUMN external_id TEXT",
        "ALTER TABLE events ADD COLUMN external_id TEXT",
        "ALTER TABLE contacts ADD COLUMN company TEXT",
        "ALTER TABLE contacts ADD COLUMN job_title TEXT",
        "ALTER TABLE contacts ADD COLUMN address TEXT",
        "ALTER TABLE contacts ADD COLUMN is_customized INTEGER DEFAULT 0",
        "ALTER TABLE contacts ADD COLUMN updated_at TIMESTAMP",
        "ALTER TABLE emails ADD COLUMN updated_at TIMESTAMP",
        "ALTER TABLE emails ADD COLUMN local_modified INTEGER DEFAULT 0",
        "ALTER TABLE events ADD COLUMN updated_at TIMESTAMP",
        "ALTER TABLE events ADD COLUMN local_modified INTEGER DEFAULT 0",
        "ALTER TABLE calendars ADD COLUMN updated_at TIMESTAMP",
        "ALTER TABLE labels ADD COLUMN updated_at TIMESTAMP",
        "ALTER TABLE labels ADD COLUMN local_modified INTEGER DEFAULT 0"
    ]
    for m in migrations:
        try:
            cursor.execute(m)
        except Exception:
            pass

    # Migración de cifrado seguro de credenciales para cuentas existentes
    try:
        from backend.crypto_service import CryptoService
        rows = cursor.execute("SELECT id, imap_password, oauth_refresh_token FROM accounts").fetchall()
        for r in rows:
            acc_id = r["id"]
            pw = r["imap_password"]
            rt = r["oauth_refresh_token"]
            new_pw = CryptoService.encrypt(pw) if pw and not str(pw).startswith("enc::") else pw
            new_rt = CryptoService.encrypt(rt) if rt and not str(rt).startswith("enc::") else rt
            if new_pw != pw or new_rt != rt:
                cursor.execute("UPDATE accounts SET imap_password = ?, oauth_refresh_token = ? WHERE id = ?", (new_pw, new_rt, acc_id))
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

    # Tabla de Libreta de Contactos (Address Book)
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS contacts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            email TEXT NOT NULL UNIQUE,
            phone TEXT,
            avatar_url TEXT,
            company TEXT,
            job_title TEXT,
            address TEXT,
            account_id INTEGER,
            source TEXT DEFAULT 'emails',
            notes TEXT,
            is_customized INTEGER DEFAULT 0,
            interaction_count INTEGER DEFAULT 1,
            last_interacted_at DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Registro de Contactos Eliminados deliberadamente para respetar exclusión en sincronizaciones
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS deleted_contacts (
            email TEXT PRIMARY KEY,
            deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Registro de Correos Eliminados en MerkeMail para que nunca se reimporten desde servidores
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS deleted_emails (
            account_id INTEGER NOT NULL,
            uid TEXT NOT NULL,
            deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (account_id, uid)
        )
    ''')

    # Registro de Eventos y Tareas Eliminados en MerkeMail para prevalecer sobre servidores
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS deleted_events (
            account_id INTEGER NOT NULL,
            external_id TEXT NOT NULL,
            deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (account_id, external_id)
        )
    ''')

    # Tabla de Perfil del Usuario Analizado por IA
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS user_ai_profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            name TEXT,
            roles_and_titles TEXT,
            organization TEXT,
            phone TEXT,
            address_location TEXT,
            websites TEXT,
            communication_style TEXT,
            summary_bio TEXT,
            extra_context TEXT,
            raw_analysis_json TEXT,
            last_analyzed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # Índices de alto rendimiento para acelerar listados, búsquedas, filtros y contadores
    indexes = [
        "CREATE INDEX IF NOT EXISTS idx_emails_acc_folder ON emails(account_id, folder)",
        "CREATE INDEX IF NOT EXISTS idx_emails_folder_date ON emails(folder, date DESC, id DESC)",
        "CREATE INDEX IF NOT EXISTS idx_emails_acc_folder_date ON emails(account_id, folder, date DESC, id DESC)",
        "CREATE INDEX IF NOT EXISTS idx_emails_date_id ON emails(date DESC, id DESC)",
        "CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date DESC)",
        "CREATE INDEX IF NOT EXISTS idx_emails_read ON emails(is_read)",
        "CREATE INDEX IF NOT EXISTS idx_emails_read_folder ON emails(is_read, folder, account_id)",
        "CREATE INDEX IF NOT EXISTS idx_emails_starred ON emails(is_starred)",
        "CREATE INDEX IF NOT EXISTS idx_emails_uid ON emails(account_id, uid)",
        "CREATE INDEX IF NOT EXISTS idx_email_labels_eid ON email_labels(email_id, label_id)",
        "CREATE INDEX IF NOT EXISTS idx_email_labels_lid ON email_labels(label_id, email_id)",
        "CREATE INDEX IF NOT EXISTS idx_attachments_eid ON attachments(email_id)",
        "CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)",
        "CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name)",
        "CREATE INDEX IF NOT EXISTS idx_events_cal_ext ON events(calendar_id, external_id)",
        "CREATE INDEX IF NOT EXISTS idx_events_start ON events(start_time)"
    ]
    for idx in indexes:
        try:
            cursor.execute(idx)
        except Exception:
            pass

    # Normalizar fechas existentes en emails para formato ISO uniforme y rápido ordenamiento por índice
    try:
        cursor.execute("UPDATE emails SET date = REPLACE(date, ' ', 'T') || 'Z' WHERE date IS NOT NULL AND date NOT LIKE '%T%' AND LENGTH(date) = 19")
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
        "gemini_model": "gemini-3.5-flash-lite",
        "theme": "dark",
        "ai_prompt_tone": "formal",
        "default_calendar_id": "1",
        "default_account_id": ""
    }
    for k, v in default_settings.items():
        cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))
    
    # Migrar modelos legacy o con alta latencia a gemini-3.5-flash-lite para respuesta ultrarrápida
    cursor.execute("UPDATE settings SET value = 'gemini-3.5-flash-lite' WHERE key = 'gemini_model' AND (value LIKE '%2.5%' OR value = 'gemini-3.1-flash-lite' OR value = 'gemini-3.8-flash')")
    
    # Asegurar que al menos una cuenta tenga is_default = 1 si existen cuentas
    try:
        def_count = cursor.execute("SELECT count(*) as total FROM accounts WHERE is_default = 1").fetchone()["total"]
        if def_count == 0:
            first_acc = cursor.execute("SELECT id FROM accounts ORDER BY id ASC LIMIT 1").fetchone()
            if first_acc:
                cursor.execute("UPDATE accounts SET is_default = 1 WHERE id = ?", (first_acc["id"],))
                cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('default_account_id', ?)", (str(first_acc["id"]),))
    except Exception:
        pass
    conn.commit()

    # Columnas adicionales para tareas y cuentas en events
    event_columns = [r["name"] for r in cursor.execute("PRAGMA table_info(events)").fetchall()]
    if "is_task" not in event_columns:
        cursor.execute("ALTER TABLE events ADD COLUMN is_task INTEGER DEFAULT 0")
    if "is_completed" not in event_columns:
        cursor.execute("ALTER TABLE events ADD COLUMN is_completed INTEGER DEFAULT 0")
    if "account_id" not in event_columns:
        cursor.execute("ALTER TABLE events ADD COLUMN account_id INTEGER")
    if "meeting_url" not in event_columns:
        cursor.execute("ALTER TABLE events ADD COLUMN meeting_url TEXT")
    if "color" not in event_columns:
        cursor.execute("ALTER TABLE events ADD COLUMN color TEXT")
    if "recurrence" not in event_columns:
        cursor.execute("ALTER TABLE events ADD COLUMN recurrence TEXT DEFAULT 'none'")
    if "notification_minutes" not in event_columns:
        cursor.execute("ALTER TABLE events ADD COLUMN notification_minutes INTEGER DEFAULT 10")
    if "attendees" not in event_columns:
        cursor.execute("ALTER TABLE events ADD COLUMN attendees TEXT")
    if "availability" not in event_columns:
        cursor.execute("ALTER TABLE events ADD COLUMN availability TEXT DEFAULT 'busy'")
    if "visibility" not in event_columns:
        cursor.execute("ALTER TABLE events ADD COLUMN visibility TEXT DEFAULT 'default'")
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

def get_user_ai_profile() -> Optional[Dict[str, Any]]:
    conn = get_db()
    row = conn.execute("SELECT * FROM user_ai_profile WHERE id = 1").fetchone()
    conn.close()
    return dict(row) if row else None

def save_user_ai_profile(data: Dict[str, Any]):
    conn = get_db()
    conn.execute('''
        INSERT INTO user_ai_profile (
            id, name, roles_and_titles, organization, phone, address_location,
            websites, communication_style, summary_bio, extra_context,
            raw_analysis_json, last_analyzed_at, updated_at
        ) VALUES (
            1, :name, :roles_and_titles, :organization, :phone, :address_location,
            :websites, :communication_style, :summary_bio, :extra_context,
            :raw_analysis_json, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT(id) DO UPDATE SET
            name = COALESCE(:name, user_ai_profile.name),
            roles_and_titles = COALESCE(:roles_and_titles, user_ai_profile.roles_and_titles),
            organization = COALESCE(:organization, user_ai_profile.organization),
            phone = COALESCE(:phone, user_ai_profile.phone),
            address_location = COALESCE(:address_location, user_ai_profile.address_location),
            websites = COALESCE(:websites, user_ai_profile.websites),
            communication_style = COALESCE(:communication_style, user_ai_profile.communication_style),
            summary_bio = COALESCE(:summary_bio, user_ai_profile.summary_bio),
            extra_context = COALESCE(:extra_context, user_ai_profile.extra_context),
            raw_analysis_json = COALESCE(:raw_analysis_json, user_ai_profile.raw_analysis_json),
            last_analyzed_at = CASE WHEN :raw_analysis_json IS NOT NULL THEN CURRENT_TIMESTAMP ELSE user_ai_profile.last_analyzed_at END,
            updated_at = CURRENT_TIMESTAMP
    ''', {
        "name": data.get("name"),
        "roles_and_titles": data.get("roles_and_titles"),
        "organization": data.get("organization"),
        "phone": data.get("phone"),
        "address_location": data.get("address_location"),
        "websites": data.get("websites"),
        "communication_style": data.get("communication_style"),
        "summary_bio": data.get("summary_bio"),
        "extra_context": data.get("extra_context"),
        "raw_analysis_json": data.get("raw_analysis_json")
    })
    conn.commit()
    conn.close()

init_db()
