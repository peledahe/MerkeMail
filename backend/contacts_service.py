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
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email)')
        cursor.execute('CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name)')
        
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS deleted_contacts (
                email TEXT PRIMARY KEY,
                deleted_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ''')
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
                SELECT c.*, a.name as account_name, a.provider as account_provider, a.email as account_email, a.color as account_color
                FROM contacts c
                LEFT JOIN accounts a ON c.account_id = a.id
                WHERE c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ? OR c.company LIKE ? OR c.job_title LIKE ?
                ORDER BY c.interaction_count DESC, c.name ASC
                LIMIT ?
            """, (param, param, param, param, param, limit)).fetchall()
        else:
            rows = conn.execute("""
                SELECT c.*, a.name as account_name, a.provider as account_provider, a.email as account_email, a.color as account_color
                FROM contacts c
                LEFT JOIN accounts a ON c.account_id = a.id
                ORDER BY c.interaction_count DESC, c.name ASC
                LIMIT ?
            """, (limit,)).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    @classmethod
    def get_contact_by_id(cls, contact_id: int) -> Optional[Dict[str, Any]]:
        """Obtiene todos los detalles de un contacto específico por su ID."""
        cls.init_table()
        conn = get_db()
        row = conn.execute("""
            SELECT c.*, a.name as account_name, a.provider as account_provider, a.email as account_email, a.color as account_color
            FROM contacts c
            LEFT JOIN accounts a ON c.account_id = a.id
            WHERE c.id = ?
        """, (contact_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    @classmethod
    def sync_contacts(cls, force: bool = False) -> Dict[str, Any]:
        """
        Sincroniza y extrae contactos de todas las cuentas y correos del sistema en memoria.
        Prioridad 1: Los cambios de MerkeMail (contactos personalizados is_customized = 1 y
        eliminaciones en deleted_contacts) prevalecen siempre.
        Prioridad 2: Entre las versiones extraídas, prevalece el nombre y metadatos más
        recientes (según fecha del correo) y finalmente los datos del servidor.
        No toma en cuenta Papelera, Borradores ni Spam.
        """
        cls.init_table()
        conn = get_db()
        cursor = conn.cursor()

        # 1. Cargar set de correos eliminados por el usuario para ignorarlos
        deleted_rows = cursor.execute("SELECT email FROM deleted_contacts").fetchall()
        deleted_set = {r["email"].lower().strip() for r in deleted_rows if r["email"]}

        # 2. Cargar contactos existentes para respetar prioridades (is_customized, updated_at, last_interacted_at)
        existing_rows = cursor.execute("SELECT email, name, is_customized, updated_at, last_interacted_at FROM contacts").fetchall()
        existing_map = {r["email"].lower().strip(): dict(r) for r in existing_rows if r["email"]}

        # 3. Obtener remitentes y destinatarios excluyendo Papelera, Borradores y Spam
        rows = cursor.execute("""
            SELECT account_id, sender, recipient, date 
            FROM emails 
            WHERE UPPER(COALESCE(folder, '')) NOT IN ('TRASH', 'PAPELERA', 'DRAFT', 'DRAFTS', 'BORRADORES', 'SPAM', 'JUNK')
            ORDER BY date ASC
        """).fetchall()
        
        # Agregar en memoria en una sola pasada: {address: {name, acc_id, count, last_date}}
        aggregated: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            acc_id = r["account_id"]
            date_str = str(r["date"] or "")
            for field in (r["sender"], r["recipient"]):
                if not field:
                    continue
                for part in str(field).split(","):
                    realname, address = email.utils.parseaddr(part.strip())
                    address = address.lower().strip()
                    if not address or "@" not in address or "." not in address:
                        continue
                    if address in deleted_set:
                        continue

                    raw_clean_name = realname.strip("\"' ")
                    fallback_name = address.split("@")[0]
                    clean_name = raw_clean_name or fallback_name

                    if address not in aggregated:
                        aggregated[address] = {
                            "name": clean_name,
                            "has_real_name": bool(raw_clean_name and "via" not in raw_clean_name.lower()),
                            "account_id": acc_id,
                            "count": 1,
                            "last_date": date_str
                        }
                    else:
                        entry = aggregated[address]
                        entry["count"] += 1
                        is_newer = date_str >= (entry["last_date"] or "")
                        is_valid_real = bool(raw_clean_name and "via" not in raw_clean_name.lower())
                        # Conservar la versión más reciente del nombre si es un nombre real válido
                        if is_valid_real and (is_newer or not entry["has_real_name"]):
                            entry["name"] = raw_clean_name
                            entry["has_real_name"] = True
                        if is_newer and date_str:
                            entry["last_date"] = date_str
                            entry["account_id"] = acc_id

        synced_count = 0
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

        for address, info in aggregated.items():
            existing = existing_map.get(address)
            if existing:
                if existing.get("is_customized") == 1:
                    # Prioridad absoluta a los cambios hechos en MerkeMail: solo actualizar conteo/fecha de interacción
                    cursor.execute("""
                        UPDATE contacts SET
                            interaction_count = MAX(COALESCE(interaction_count, 1), ?),
                            last_interacted_at = MAX(COALESCE(last_interacted_at, ''), COALESCE(?, ''))
                        WHERE email = ?
                    """, (info["count"], info["last_date"], address))
                else:
                    # Conservar el nombre de la versión más reciente
                    ext_last = str(existing.get("last_interacted_at") or "")
                    best_name = info["name"] if (info["last_date"] >= ext_last and info["has_real_name"]) else (existing.get("name") or info["name"])
                    cursor.execute("""
                        UPDATE contacts SET
                            name = ?,
                            interaction_count = ?,
                            last_interacted_at = MAX(COALESCE(last_interacted_at, ''), COALESCE(?, ''))
                        WHERE email = ?
                    """, (best_name, info["count"], info["last_date"], address))
            else:
                cursor.execute("""
                    INSERT INTO contacts (name, email, account_id, interaction_count, last_interacted_at, source, updated_at)
                    VALUES (?, ?, ?, ?, ?, 'emails', ?)
                """, (info["name"], address, info["account_id"], info["count"], info["last_date"], now_iso))
            synced_count += 1

        conn.commit()
        total = cursor.execute("SELECT COUNT(*) as c FROM contacts").fetchone()["c"]
        conn.close()

        set_setting("last_contacts_sync", datetime.now().isoformat())

        return {
            "success": True,
            "total_contacts": total,
            "synced_count": synced_count,
            "last_sync": datetime.now().isoformat()
        }

    @classmethod
    def add_contact(cls, name: str, email_addr: str, phone: str = "", company: str = "", job_title: str = "", address: str = "", notes: str = "", account_id: Optional[int] = None) -> Dict[str, Any]:
        """Añade un contacto manualmente a la libreta de direcciones con prioridad local."""
        cls.init_table()
        clean_email = email_addr.lower().strip()
        if not clean_email or "@" not in clean_email:
            raise ValueError("Dirección de correo electrónico inválida")

        clean_name = name.strip() or clean_email.split("@")[0]
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        conn = get_db()
        cursor = conn.cursor()

        # Si el usuario lo está añadiendo manualmente, remover de la lista de eliminados
        cursor.execute("DELETE FROM deleted_contacts WHERE email = ?", (clean_email,))

        cursor.execute("""
            INSERT INTO contacts (name, email, phone, company, job_title, address, notes, account_id, source, is_customized, interaction_count, last_interacted_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', 1, 1, CURRENT_TIMESTAMP, ?)
            ON CONFLICT(email) DO UPDATE SET
                name = excluded.name,
                phone = COALESCE(excluded.phone, phone),
                company = COALESCE(excluded.company, company),
                job_title = COALESCE(excluded.job_title, job_title),
                address = COALESCE(excluded.address, address),
                notes = COALESCE(excluded.notes, notes),
                is_customized = 1,
                updated_at = excluded.updated_at
        """, (clean_name, clean_email, phone, company, job_title, address, notes, account_id, now_iso))
        conn.commit()
        row = cursor.execute("SELECT id FROM contacts WHERE email = ?", (clean_email,)).fetchone()
        contact_id = row["id"] if row else cursor.lastrowid
        conn.close()
        return {"success": True, "id": contact_id, "name": clean_name, "email": clean_email}

    @classmethod
    def update_contact(cls, contact_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        """Actualiza la información de un contacto existente y lo marca como personalizado con timestamp reciente."""
        cls.init_table()
        conn = get_db()
        cursor = conn.cursor()

        existing = cursor.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,)).fetchone()
        if not existing:
            conn.close()
            raise ValueError(f"Contacto con ID {contact_id} no encontrado")

        new_email = (data.get("email") or existing["email"]).lower().strip()
        if not new_email or "@" not in new_email:
            conn.close()
            raise ValueError("Dirección de correo inválida")

        # Verificar unicidad del email si cambió
        if new_email != existing["email"]:
            dup = cursor.execute("SELECT id FROM contacts WHERE email = ? AND id != ?", (new_email, contact_id)).fetchone()
            if dup:
                conn.close()
                raise ValueError(f"Ya existe otro contacto con el correo {new_email}")
            # Si el nuevo email estaba en deleted_contacts, removerlo
            cursor.execute("DELETE FROM deleted_contacts WHERE email = ?", (new_email,))

        new_name = (data.get("name") if data.get("name") is not None else existing["name"]) or new_email.split("@")[0]
        phone = data.get("phone") if data.get("phone") is not None else existing["phone"]
        company = data.get("company") if data.get("company") is not None else existing["company"]
        job_title = data.get("job_title") if data.get("job_title") is not None else existing["job_title"]
        address = data.get("address") if data.get("address") is not None else existing["address"]
        notes = data.get("notes") if data.get("notes") is not None else existing["notes"]
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

        cursor.execute("""
            UPDATE contacts SET
                name = ?,
                email = ?,
                phone = ?,
                company = ?,
                job_title = ?,
                address = ?,
                notes = ?,
                is_customized = 1,
                updated_at = ?
            WHERE id = ?
        """, (new_name.strip(), new_email, phone, company, job_title, address, notes, now_iso, contact_id))
        conn.commit()

        updated = cursor.execute("""
            SELECT c.*, a.name as account_name, a.provider as account_provider, a.email as account_email, a.color as account_color
            FROM contacts c
            LEFT JOIN accounts a ON c.account_id = a.id
            WHERE c.id = ?
        """, (contact_id,)).fetchone()
        conn.close()
        return dict(updated)

    @classmethod
    def delete_contact(cls, contact_id: int) -> bool:
        """
        Elimina un contacto de la libreta de direcciones y lo registra en
        deleted_contacts para que futuras sincronizaciones respeten su eliminación.
        """
        cls.init_table()
        conn = get_db()
        cursor = conn.cursor()
        
        row = cursor.execute("SELECT email FROM contacts WHERE id = ?", (contact_id,)).fetchone()
        if row and row["email"]:
            clean_email = row["email"].lower().strip()
            # Registrar en tabla de eliminados para proteger de futuras auto-sincronizaciones
            cursor.execute("""
                INSERT INTO deleted_contacts (email, deleted_at)
                VALUES (?, CURRENT_TIMESTAMP)
                ON CONFLICT(email) DO UPDATE SET deleted_at = CURRENT_TIMESTAMP
            """, (clean_email,))

        cursor.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
        conn.commit()
        conn.close()
        return True
