import os
import sqlite3
import email.utils
from typing import Dict, Any, List, Optional
from datetime import datetime

from backend.database import get_db, get_setting, set_setting

class ContactsService:
    @classmethod
    def init_table(cls):
        """Asegura que la tabla de contactos y sus índices existan en la base de datos."""
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS contacts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                email TEXT NOT NULL UNIQUE,
                phone TEXT,
                avatar_url TEXT,
                account_id INTEGER,
                source TEXT DEFAULT 'emails',
                notes TEXT,
                interaction_count INTEGER DEFAULT 1,
                last_interacted_at DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name)')
        conn.commit()
        conn.close()

    @classmethod
    def get_contacts(cls, q: str = "", limit: int = 300) -> List[Dict[str, Any]]:
        """Obtiene la lista de contactos ordenados por relevancia e interacciones."""
        cls.init_table()
        conn = get_db()
        if q:
            param = f"%{q.strip()}%"
            rows = conn.execute("""
                SELECT c.*, a.name as account_name, a.provider as account_provider
                FROM contacts c
                LEFT JOIN accounts a ON c.account_id = a.id
                WHERE c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?
                ORDER BY c.interaction_count DESC, c.name ASC
                LIMIT ?
            """, (param, param, param, limit)).fetchall()
        else:
            rows = conn.execute("""
                SELECT c.*, a.name as account_name, a.provider as account_provider
                FROM contacts c
                LEFT JOIN accounts a ON c.account_id = a.id
                ORDER BY c.interaction_count DESC, c.name ASC
                LIMIT ?
            """, (limit,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    @classmethod
    def sync_contacts(cls, force: bool = False) -> Dict[str, Any]:
        """Sincroniza y extrae contactos de todas las cuentas y correos del sistema."""
        cls.init_table()
        conn = get_db()
        cursor = conn.cursor()

        # Obtener todos los remitentes y destinatarios de la tabla emails
        rows = cursor.execute("SELECT account_id, sender, recipient, date FROM emails").fetchall()
        
        synced_count = 0
        for r in rows:
            acc_id = r["account_id"]
            date_str = r["date"] or ""
            for field in (r["sender"], r["recipient"]):
                if not field:
                    continue
                # Manejar múltiples destinatarios separados por coma
                for part in str(field).split(","):
                    realname, address = email.utils.parseaddr(part.strip())
                    address = address.lower().strip()
                    if address and "@" in address and "." in address:
                        clean_name = realname.strip("\"' ") or address.split("@")[0]
                        cursor.execute("""
                            INSERT INTO contacts (name, email, account_id, interaction_count, last_interacted_at, source)
                            VALUES (?, ?, ?, 1, ?, 'emails')
                            ON CONFLICT(email) DO UPDATE SET
                                interaction_count = contacts.interaction_count + 1,
                                name = CASE 
                                    WHEN LENGTH(?) > LENGTH(contacts.name) AND ? NOT LIKE '%via%' THEN ? 
                                    WHEN contacts.name IS NULL OR contacts.name = '' THEN ?
                                    ELSE contacts.name 
                                END,
                                last_interacted_at = MAX(COALESCE(contacts.last_interacted_at, ''), COALESCE(?, ''))
                        """, (clean_name, address, acc_id, date_str, clean_name, clean_name, clean_name, clean_name, date_str))
                        synced_count += 1

        conn.commit()

        # Obtener total de contactos almacenados
        total = cursor.execute("SELECT COUNT(*) as c FROM contacts").fetchone()["c"]
        conn.close()

        # Registrar timestamp de última sincronización
        set_setting("last_contacts_sync", datetime.now().isoformat())

        return {
            "success": True,
            "total_contacts": total,
            "synced_count": synced_count,
            "last_sync": datetime.now().isoformat()
        }

    @classmethod
    def add_contact(cls, name: str, email_addr: str, phone: str = "", notes: str = "", account_id: Optional[int] = None) -> Dict[str, Any]:
        """Añade un contacto manualmente a la libreta de direcciones."""
        cls.init_table()
        clean_email = email_addr.lower().strip()
        if not clean_email or "@" not in clean_email:
            raise ValueError("Dirección de correo electrónico inválida")

        clean_name = name.strip() or clean_email.split("@")[0]
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO contacts (name, email, phone, notes, account_id, source, interaction_count, last_interacted_at)
            VALUES (?, ?, ?, ?, ?, 'manual', 1, CURRENT_TIMESTAMP)
            ON CONFLICT(email) DO UPDATE SET
                name = ?,
                phone = COALESCE(?, phone),
                notes = COALESCE(?, notes)
        """, (clean_name, clean_email, phone, notes, account_id, clean_name, phone, notes))
        conn.commit()
        contact_id = cursor.lastrowid
        conn.close()
        return {"success": True, "id": contact_id, "name": clean_name, "email": clean_email}

    @classmethod
    def delete_contact(cls, contact_id: int) -> bool:
        """Elimina un contacto de la libreta de direcciones."""
        conn = get_db()
        conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
        conn.commit()
        conn.close()
        return True
