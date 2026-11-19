import imaplib
import smtplib
import ssl
import email
from email.header import decode_header
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from bs4 import BeautifulSoup
from backend.database import get_db
from backend.crypto_service import CryptoService

def decode_mime_header(header_value: str) -> str:
    """Decodifica encabezados codificados en RFC 2047."""
    if not header_value:
        return ""
    decoded_fragments = []
    for fragment, encoding in decode_header(header_value):
        if isinstance(fragment, bytes):
            try:
                decoded_fragments.append(fragment.decode(encoding or "utf-8", errors="replace"))
            except Exception:
                decoded_fragments.append(fragment.decode("latin1", errors="replace"))
        else:
            decoded_fragments.append(str(fragment))
    return "".join(decoded_fragments)


# ---------------------------------------------------------------------------------------------
# Correspondencia entre buzones IMAP del servidor y carpetas de MerkeMail
# ---------------------------------------------------------------------------------------------
# Marcas estándar RFC 6154 (SPECIAL-USE) -> carpeta de la app. None = buzón virtual que se omite
# (p. ej. "[Gmail]/Todos", "Destacados", "Importantes": duplicarían correos de otros buzones).
IMAP_SPECIAL_USE = {
    "\\sent": "SENT", "\\drafts": "DRAFT", "\\junk": "SPAM", "\\trash": "TRASH", "\\archive": "ARCHIVE",
    "\\all": None, "\\flagged": None, "\\important": None,
}
# Nombres habituales (inglés / español) cuando el servidor no anuncia SPECIAL-USE
IMAP_FOLDER_NAMES = {
    "SENT": {"sent", "sent items", "sent messages", "sent mail", "enviados", "elementos enviados",
             "correo enviado", "mensajes enviados"},
    "DRAFT": {"drafts", "draft", "borradores", "borrador"},
    "SPAM": {"spam", "junk", "junk e-mail", "junk email", "bulk mail", "correo no deseado", "no deseado"},
    "TRASH": {"trash", "deleted items", "deleted messages", "bin", "papelera", "elementos eliminados", "eliminados"},
    "ARCHIVE": {"archive", "archives", "archived", "archivo", "archivados"},
}
APP_ONLY_FOLDERS = {"ALL", "TODOS", "STARRED", "IMPORTANT", "UNREAD"}


def decode_imap_utf7(name: str) -> str:
    """Decodifica nombres de buzón en UTF-7 modificado (RFC 3501), p. ej. 'Elementos eliminados'."""
    import base64
    out, i = [], 0
    while i < len(name):
        ch = name[i]
        if ch == "&":
            j = name.find("-", i)
            if j == -1:
                out.append(name[i:])
                break
            if j == i + 1:
                out.append("&")
            else:
                b64 = name[i + 1:j].replace(",", "/")
                b64 += "=" * (-len(b64) % 4)
                try:
                    out.append(base64.b64decode(b64).decode("utf-16-be", errors="replace"))
                except Exception:
                    out.append(name[i:j + 1])
            i = j + 1
        else:
            out.append(ch)
            i += 1
    return "".join(out)


def parse_imap_list(list_data) -> List[Tuple[str, List[str]]]:
    """Respuesta de LIST -> [(nombre_crudo_en_servidor, [marcas en minúsculas])], para cualquier delimitador."""
    import re as _re
    result = []
    for entry in list_data or []:
        if isinstance(entry, tuple):  # nombre enviado como literal {n}
            head, literal = entry[0], entry[1]
            m = _re.match(rb'\((?P<flags>[^)]*)\)', head)
            flags = m.group("flags").decode(errors="ignore").lower().split() if m else []
            result.append((literal.decode(errors="ignore"), flags))
            continue
        if not isinstance(entry, bytes):
            continue
        m = _re.match(rb'\((?P<flags>[^)]*)\)\s+(?:"(?:[^"\\]|\\.)*"|NIL)\s+(?P<name>.+)$', entry.strip())
        if not m:
            continue
        name = m.group("name").decode(errors="ignore").strip()
        if len(name) >= 2 and name[0] == '"' and name[-1] == '"':
            name = name[1:-1].replace('\\"', '"').replace("\\\\", "\\")
        result.append((name, m.group("flags").decode(errors="ignore").lower().split()))
    return result


def imap_local_folder(server_name: str, flags: Optional[List[str]] = None) -> Optional[str]:
    """Buzón del servidor -> carpeta de MerkeMail ('INBOX', 'SENT', 'SPAM'...). None = no sincronizar."""
    if server_name.upper() == "INBOX":
        return "INBOX"
    flags = flags or []
    for fl in flags:
        if fl in IMAP_SPECIAL_USE:
            return IMAP_SPECIAL_USE[fl]
    if "\\noselect" in flags or "\\nonexistent" in flags:
        return None
    decoded = decode_imap_utf7(server_name)
    for candidate in (decoded, decoded.replace("\\", "/").split("/")[-1], decoded.split(".")[-1]):
        low = candidate.strip().lower()
        for key, names in IMAP_FOLDER_NAMES.items():
            if low in names:
                return key
    return decoded  # carpeta personalizada del usuario: se conserva su nombre (legible, sin UTF-7)


def _imap_connect(account: Dict[str, Any]):
    """Abre y autentica una conexión IMAP (SSL, con respaldo en texto plano para Bridge en localhost)."""
    is_local = "127.0.0.1" in account["imap_host"] or "localhost" in account["imap_host"]
    if account.get("imap_ssl", 1):
        try:
            ctx = ssl.create_default_context()
            if is_local:
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
            mail = imaplib.IMAP4_SSL(account["imap_host"], int(account["imap_port"]), ssl_context=ctx)
        except Exception:
            if not is_local:
                raise
            mail = imaplib.IMAP4(account["imap_host"], int(account["imap_port"]))
    else:
        mail = imaplib.IMAP4(account["imap_host"], int(account["imap_port"]))
    raw_pass = CryptoService.decrypt(account.get("imap_password", "")) or ""
    mail.login(account["imap_user"].strip(), raw_pass.replace(" ", "").strip())
    return mail


def _quote_mailbox(name: str) -> str:
    return '"' + name.replace("\\", "\\\\").replace('"', '\\"') + '"'


def parse_imap_message(raw_email: bytes, account: Dict[str, Any]) -> Dict[str, Any]:
    """RFC822 -> campos de la tabla emails (remitente, asunto, cuerpo, snippet, fecha UTC ISO, adjuntos)."""
    from datetime import timezone
    msg = email.message_from_bytes(raw_email)

    subject = decode_mime_header(msg.get("Subject", "(Sin Asunto)"))
    sender = decode_mime_header(msg.get("From", "Desconocido"))
    recipient = decode_mime_header(msg.get("To", account["email"]))
    date_str = msg.get("Date", "")

    body_text = ""
    body_html = ""
    has_attachments = 0

    cid_map = {}
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            content_disposition = str(part.get("Content-Disposition"))
            content_id = str(part.get("Content-ID") or "").strip("<>").strip()

            if "attachment" in content_disposition and not content_id:
                has_attachments = 1
                continue

            payload = part.get_payload(decode=True)
            if payload:
                if content_id and content_type.startswith("image/"):
                    cid_map[content_id] = (payload, content_type)

                charset = part.get_content_charset() or "utf-8"
                try:
                    decoded = payload.decode(charset, errors="replace")
                except Exception:
                    decoded = payload.decode("latin1", errors="replace")

                if content_type == "text/plain" and not body_text:
                    body_text = decoded
                elif content_type == "text/html" and not body_html:
                    body_html = decoded

        if body_html and cid_map:
            import base64
            for cid, (c_payload, c_type) in cid_map.items():
                if c_payload:
                    b64 = base64.b64encode(c_payload).decode("ascii")
                    data_uri = f"data:{c_type};base64,{b64}"
                    body_html = body_html.replace(f"cid:{cid}", data_uri)
                    body_html = body_html.replace(f"cid:<{cid}>", data_uri)
                    body_html = body_html.replace(f"cid:&lt;{cid}&gt;", data_uri)
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            try:
                body_text = payload.decode(charset, errors="replace")
            except Exception:
                body_text = payload.decode("latin1", errors="replace")

    # Generar snippet
    if body_text:
        snippet = " ".join(body_text.split())[:160]
    elif body_html:
        soup = BeautifulSoup(body_html, "html.parser")
        snippet = " ".join(soup.get_text().split())[:160]
    else:
        snippet = "(Sin contenido de texto)"

    # Parsear fecha de recibido en buzón a UTC ISO estándar
    date_val = None
    if date_str:
        try:
            from email.utils import parsedate_to_datetime
            dt = parsedate_to_datetime(date_str)
            dt = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
            date_val = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
        except Exception:
            pass
    has_real_date = bool(date_val)
    if not date_val:
        date_val = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    return {
        "sender": sender, "recipient": recipient, "subject": subject, "snippet": snippet,
        "body_text": body_text, "body_html": body_html, "date": date_val, "has_real_date": has_real_date,
        "has_attachments": has_attachments,
    }


# ---------------------------------------------------------------------------------------------
# Propagación al servidor IMAP de Archivar / Spam / Papelera (modelo de reconciliación)
# ---------------------------------------------------------------------------------------------
# La carpeta local (emails.folder) es lo que el usuario decidió en MerkeMail; emails.source_folder es el
# buzón del servidor donde está realmente el mensaje. Si no coinciden, hay un movimiento pendiente que se
# ejecuta en segundo plano justo después de la acción y se reintenta al inicio de cada sincronización.
import re as _re
import threading as _threading

IMAP_MANAGED_FOLDERS = ("INBOX", "ARCHIVE", "SPAM", "TRASH")
_ACCOUNT_LOCKS: Dict[int, Any] = {}
_ACCOUNT_LOCKS_GUARD = _threading.Lock()


def _account_lock(account_id: int):
    """Un candado por cuenta: evita que una sincronización y un movimiento en el servidor se crucen."""
    with _ACCOUNT_LOCKS_GUARD:
        lock = _ACCOUNT_LOCKS.get(account_id)
        if lock is None:
            lock = _ACCOUNT_LOCKS[account_id] = _threading.RLock()
        return lock


def deleted_email_key(source_folder: Optional[str], uid: Any) -> str:
    """Clave en deleted_emails. En IMAP los UID son por buzón, así que la clave incluye el buzón."""
    return f"{source_folder}::{uid}" if source_folder else str(uid)


class _ImapMover:
    """Operaciones de movimiento sobre una conexión IMAP ya autenticada."""

    def __init__(self, mail):
        self.mail = mail
        caps = getattr(mail, "capabilities", ()) or ()
        self.caps = {(c.decode() if isinstance(c, bytes) else str(c)).upper() for c in caps}
        try:
            st, data = mail.list()
            self.mailboxes = parse_imap_list(data) if st == "OK" else []
        except Exception:
            self.mailboxes = []
        self.selected: Optional[str] = None
        self._targets: Dict[str, Optional[str]] = {}

    def flags_of(self, name: str) -> List[str]:
        for n, fl in self.mailboxes:
            if n == name:
                return fl
        return []

    def key_of(self, mailbox: str) -> Optional[str]:
        """Carpeta de la app que corresponde a un buzón del servidor ('Todos' de Gmail cuenta como Archivo)."""
        if mailbox.upper() == "INBOX":
            return "INBOX"
        if "\\all" in self.flags_of(mailbox) or self._targets.get("ARCHIVE") == mailbox:
            return "ARCHIVE"
        return imap_local_folder(mailbox, self.flags_of(mailbox))

    def target(self, key: str) -> Optional[str]:
        """Buzón del servidor para INBOX / ARCHIVE / SPAM / TRASH (se crea si no existe)."""
        if key == "INBOX":
            return "INBOX"
        if key in self._targets:
            return self._targets[key]
        flag = {"ARCHIVE": "\\archive", "SPAM": "\\junk", "TRASH": "\\trash"}[key]
        found = next((n for n, fl in self.mailboxes if flag in fl), None)
        if not found:
            found = next((n for n, fl in self.mailboxes if imap_local_folder(n, fl) == key), None)
        if not found and key == "ARCHIVE":
            # Gmail por IMAP: archivar = dejar el mensaje solo en "Todos" ([Gmail]/All Mail)
            found = next((n for n, fl in self.mailboxes if "\\all" in fl), None)
        if not found:
            name = {"ARCHIVE": "Archive", "SPAM": "Spam", "TRASH": "Trash"}[key]
            typ, _ = self.mail.create(_quote_mailbox(name))
            if typ == "OK":
                try:
                    self.mail.subscribe(_quote_mailbox(name))
                except Exception:
                    pass
                self.mailboxes.append((name, []))
                found = name
        self._targets[key] = found
        return found

    def _select_rw(self, mailbox: str):
        if self.selected != mailbox:
            typ, _ = self.mail.select(_quote_mailbox(mailbox))  # lectura-escritura
            if typ != "OK":
                raise RuntimeError(f"No se pudo abrir el buzón {mailbox}")
            self.selected = mailbox

    def _message_id(self, uid: str) -> Optional[str]:
        typ, data = self.mail.uid("fetch", uid, "(BODY.PEEK[HEADER.FIELDS (MESSAGE-ID)])")
        for part in data or []:
            if isinstance(part, tuple) and len(part) > 1:
                m = _re.search(rb"(?im)^message-id:\s*(<[^<>\s]+>)", part[1])
                return m.group(1).decode() if m else None
        return None

    def move(self, source: str, uid: str, dest: str) -> Tuple[str, Optional[str]]:
        """Mueve un mensaje entre buzones. Devuelve ('moved', uid_nuevo|None) o ('missing', None)."""
        self._select_rw(source)
        typ, data = self.mail.uid("search", None, f"UID {uid}")
        if typ != "OK" or not data or not data[0] or uid.encode() not in data[0].split():
            return "missing", None
        msg_id = None if "UIDPLUS" in self.caps else self._message_id(uid)
        self.mail.response("COPYUID")  # limpiar códigos de respuesta anteriores
        # Desde "Todos" de Gmail solo se copia: borrar ahí eliminaría el mensaje de toda la cuenta
        copy_only = "\\all" in self.flags_of(source)
        if "MOVE" in self.caps and not copy_only:
            typ, data = self.mail.uid("MOVE", uid, _quote_mailbox(dest))
        else:
            typ, data = self.mail.uid("COPY", uid, _quote_mailbox(dest))
            if typ == "OK" and not copy_only:
                self.mail.uid("STORE", uid, "+FLAGS.SILENT", "(\\Deleted)")
                if "UIDPLUS" in self.caps:
                    self.mail.uid("EXPUNGE", uid)
                # Sin UIDPLUS no se hace un EXPUNGE general (borraría otros mensajes marcados por otros
                # clientes): el original queda con \Deleted y la sincronización lo ignora (UNDELETED).
        if typ != "OK":
            detail = data[0].decode(errors="ignore") if data and isinstance(data[0], bytes) else data
            raise RuntimeError(f"El servidor rechazó el movimiento a {dest}: {detail}")
        new_uid = None
        _, codes = self.mail.response("COPYUID")
        for code in codes or []:
            parts = (code.decode() if isinstance(code, bytes) else str(code or "")).split()
            if len(parts) >= 3 and parts[2].isdigit():
                new_uid = parts[2]
        if not new_uid and msg_id:
            self._select_rw(dest)
            typ, data = self.mail.uid("search", None, "HEADER", "Message-ID", f'"{msg_id}"')
            found = data[0].split() if typ == "OK" and data and data[0] else []
            if found:
                new_uid = found[-1].decode()
        return "moved", new_uid


def _push_pending_moves(conn, account_id: int, mover: "_ImapMover", only_ids: Optional[List[int]] = None) -> Dict[str, Any]:
    """Aplica en el servidor los cambios de carpeta hechos en MerkeMail que aún no están reflejados."""
    import sqlite3 as _sqlite3
    q = ("SELECT id, uid, folder, source_folder FROM emails WHERE account_id = ? AND source_folder IS NOT NULL "
         "AND uid NOT LIKE 'seed-%' AND UPPER(folder) IN ('INBOX', 'ARCHIVE', 'SPAM', 'TRASH')")
    params: List[Any] = [account_id]
    if only_ids:
        q += f" AND id IN ({','.join('?' for _ in only_ids)})"
        params += list(only_ids)
    rows = [dict(r) for r in conn.execute(q, params).fetchall()]
    result = {"moved": 0, "failed": 0, "errors": []}
    pending = [r for r in rows if mover.key_of(r["source_folder"]) != r["folder"].upper()]
    for r in sorted(pending, key=lambda x: x["source_folder"]):
        want = r["folder"].upper()
        try:
            dest = mover.target(want)
            if not dest:
                raise RuntimeError(f"El servidor no tiene ni permite crear una carpeta para {want}")
            status, new_uid = mover.move(r["source_folder"], str(r["uid"]), dest)
        except Exception as e:
            result["failed"] += 1
            result["errors"].append(f"id {r['id']}: {e}")
            continue
        if status == "missing" or not new_uid:
            # Ya no está en el buzón de origen (otro cliente lo movió) o el servidor no informó el UID nuevo:
            # se deja sin buzón de origen y la próxima sincronización de ese buzón lo reconoce (remitente+asunto+fecha).
            conn.execute("UPDATE emails SET source_folder = NULL WHERE id = ?", (r["id"],))
        else:
            try:
                conn.execute("UPDATE emails SET uid = ?, source_folder = ? WHERE id = ?", (new_uid, dest, r["id"]))
            except _sqlite3.IntegrityError:
                # El mismo mensaje ya se había descargado desde el buzón destino: se conserva la fila del usuario
                conn.execute("DELETE FROM emails WHERE account_id = ? AND folder = ? AND uid = ? AND source_folder = ? AND id != ?",
                             (account_id, r["folder"], new_uid, dest, r["id"]))
                conn.execute("UPDATE emails SET uid = ?, source_folder = ? WHERE id = ?", (new_uid, dest, r["id"]))
        if status == "moved":
            result["moved"] += 1
    conn.commit()
    return result


def _trash_removed_on_server(conn, account_id: int, mover: "_ImapMover", removed: List[Tuple[str, str]]) -> int:
    """Correos eliminados definitivamente en MerkeMail: en el servidor se mueven a la Papelera (no se destruyen)."""
    moved = 0
    for source, uid in removed:
        if not source or mover.key_of(source) == "TRASH":
            continue
        try:
            dest = mover.target("TRASH")
            if not dest:
                continue
            status, new_uid = mover.move(source, str(uid), dest)
        except Exception as e:
            print(f"[IMAP] Aviso moviendo a la papelera del servidor ({source}/{uid}): {e}")
            continue
        if status == "moved":
            moved += 1
            if new_uid:  # que la sincronización de la Papelera no lo vuelva a descargar
                conn.execute("INSERT OR REPLACE INTO deleted_emails (account_id, uid, deleted_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                             (account_id, deleted_email_key(dest, new_uid)))
    conn.commit()
    return moved


class EmailService:
    @staticmethod
    def get_account(account_id: int) -> Optional[Dict[str, Any]]:
        conn = get_db()
        row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        conn.close()
        return dict(row) if row else None

    @classmethod
    def test_connection(cls, account_data: Dict[str, Any]) -> Dict[str, Any]:
        """Prueba la conexión IMAP y SMTP de una cuenta o valida credenciales OAuth2."""
        if account_data.get("auth_type") == "oauth2":
            try:
                from backend.google_oauth import GoogleOAuthService
                creds = GoogleOAuthService.get_valid_credentials(account_data["id"])
                return {"imap": True, "smtp": True, "success": True, "message": "Tokens OAuth2 de Google válidos"}
            except Exception as e:
                return {"imap": False, "smtp": False, "success": False, "errors": [str(e)]}

        results = {"imap": False, "smtp": False, "errors": []}
        
        # Test IMAP
        try:
            raw_pass = CryptoService.decrypt(account_data.get("imap_password", "")) or ""
            imap_pass = raw_pass.replace(" ", "").strip()
            is_local = "127.0.0.1" in account_data["imap_host"] or "localhost" in account_data["imap_host"]
            mail = None
            if account_data.get("imap_ssl", 1):
                try:
                    ctx = ssl.create_default_context()
                    if is_local:
                        ctx.check_hostname = False
                        ctx.verify_mode = ssl.CERT_NONE
                    mail = imaplib.IMAP4_SSL(account_data["imap_host"], int(account_data["imap_port"]), ssl_context=ctx)
                except Exception as ssl_err:
                    if is_local:
                        # Fallback a texto plano para Hydroxide en localhost
                        mail = imaplib.IMAP4(account_data["imap_host"], int(account_data["imap_port"]))
                    else:
                        raise ssl_err
            else:
                mail = imaplib.IMAP4(account_data["imap_host"], int(account_data["imap_port"]))
                
            mail.login(account_data["imap_user"].strip(), imap_pass)
            mail.select("INBOX")
            mail.logout()
            results["imap"] = True
        except Exception as e:
            err_msg = str(e)
            if "Application-specific password required" in err_msg:
                err_msg = "Google requiere una 'Contraseña de Aplicación' de 16 letras (no tu contraseña normal de Google). Créala en: https://myaccount.google.com/apppasswords"
            results["errors"].append(f"Fallo en IMAP: {err_msg}")

        # Test SMTP
        try:
            raw_pass = CryptoService.decrypt(account_data.get("imap_password", "")) or ""
            smtp_pass = raw_pass.replace(" ", "").strip()
            port = int(account_data["smtp_port"])
            is_local = "127.0.0.1" in account_data["smtp_host"] or "localhost" in account_data["smtp_host"]
            if port == 465 or account_data.get("smtp_ssl") == 2:
                ctx = ssl.create_default_context()
                if is_local:
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                server = smtplib.SMTP_SSL(account_data["smtp_host"], port, context=ctx)
            else:
                server = smtplib.SMTP(account_data["smtp_host"], port)
                if account_data.get("smtp_ssl", 1):
                    try:
                        ctx = ssl.create_default_context()
                        if is_local:
                            ctx.check_hostname = False
                            ctx.verify_mode = ssl.CERT_NONE
                        server.starttls(context=ctx)
                    except Exception as tls_err:
                        if not is_local:
                            raise tls_err
            
            server.login(account_data["imap_user"].strip(), smtp_pass)
            server.quit()
            results["smtp"] = True
        except Exception as e:
            results["errors"].append(f"Fallo en SMTP: {str(e)}")

        results["success"] = results["imap"] and results["smtp"]
        return results

    @classmethod
    def push_imap_changes(cls, account_id: int, removed: Optional[List[Tuple[str, str]]] = None,
                          only_ids: Optional[List[int]] = None) -> Dict[str, Any]:
        """Refleja en el servidor IMAP los cambios de carpeta (Archivar, Spam, Papelera, restaurar) hechos en MerkeMail."""
        account = cls.get_account(account_id)
        if not account or account.get("auth_type") == "oauth2" or not account.get("imap_host"):
            return {"success": True, "skipped": True}
        with _account_lock(account_id):
            conn = get_db()
            mail = None
            try:
                mail = _imap_connect(account)
                mover = _ImapMover(mail)
                res = _push_pending_moves(conn, account_id, mover, only_ids)
                if removed:
                    res["trashed"] = _trash_removed_on_server(conn, account_id, mover, removed)
                if res.get("errors"):
                    print(f"[IMAP] Cuenta {account_id}: {len(res['errors'])} movimiento(s) pendiente(s): {res['errors'][:3]}")
                return {"success": True, **res}
            except Exception as e:
                return {"success": False, "error": str(e)}
            finally:
                if mail is not None:
                    try:
                        mail.logout()
                    except Exception:
                        pass
                conn.close()

    @classmethod
    def schedule_imap_push(cls, email_ids: Optional[List[int]] = None,
                           removed_rows: Optional[List[Dict[str, Any]]] = None) -> None:
        """Lanza en segundo plano la propagación al servidor para los correos IMAP afectados por una acción."""
        by_account: Dict[int, Dict[str, Any]] = {}
        try:
            conn = get_db()
            if email_ids:
                ph = ",".join("?" for _ in email_ids)
                for r in conn.execute(
                    f"SELECT e.id, e.account_id FROM emails e JOIN accounts a ON a.id = e.account_id "
                    f"WHERE e.id IN ({ph}) AND e.source_folder IS NOT NULL AND COALESCE(a.auth_type, 'password') != 'oauth2'",
                    list(email_ids)
                ).fetchall():
                    by_account.setdefault(r["account_id"], {"ids": [], "removed": []})["ids"].append(r["id"])
            for r in removed_rows or []:
                if r.get("source_folder") and r.get("uid") and r.get("account_id"):
                    acc = conn.execute("SELECT auth_type FROM accounts WHERE id = ?", (r["account_id"],)).fetchone()
                    if acc and (acc["auth_type"] or "password") != "oauth2":
                        by_account.setdefault(r["account_id"], {"ids": [], "removed": []})["removed"].append(
                            (r["source_folder"], str(r["uid"])))
            conn.close()
        except Exception as e:
            print(f"[IMAP] Aviso preparando propagación al servidor: {e}")
            return
        if not by_account:
            return

        def _run():
            for acc_id, work in by_account.items():
                res = cls.push_imap_changes(acc_id, removed=work["removed"] or None, only_ids=work["ids"] or None)
                if not res.get("success"):
                    print(f"[IMAP] Cuenta {acc_id}: cambios pendientes de reflejar en el servidor "
                          f"(se reintentará en la próxima sincronización): {res.get('error')}")
        _threading.Thread(target=_run, daemon=True).start()

    @classmethod
    def sync_mailbox(cls, account_id: int, folder: Optional[str] = "INBOX", label_id: Optional[int] = None, max_emails: int = 30, all_pages: bool = False) -> Dict[str, Any]:
        """Sincroniza y descarga correos desde el servidor IMAP o Gmail API a SQLite."""
        account = cls.get_account(account_id)
        if not account:
            return {"success": False, "error": "Cuenta no encontrada"}

        if account.get("auth_type") == "oauth2":
            from backend.google_oauth import GoogleOAuthService
            try:
                return GoogleOAuthService.sync_gmail(account_id, folder=folder, label_id=label_id, max_results=max_emails, all_pages=all_pages or (max_emails <= 0))
            except Exception as e:
                return {"success": False, "error": f"Error en sincronización Gmail API: {str(e)}"}

        requested = (folder or "INBOX").strip()
        if requested.upper() in APP_ONLY_FOLDERS or requested.upper().startswith("CATEGORY_"):
            # Vistas propias de la app (Todos, Destacados, categorías de Gmail): no existen como buzón IMAP
            return {"success": True, "synced_count": 0}

        with _account_lock(account_id):
            return cls._sync_imap_mailbox(account, requested, max_emails, all_pages)

    @classmethod
    def _sync_imap_mailbox(cls, account: Dict[str, Any], requested: str, max_emails: int, all_pages: bool) -> Dict[str, Any]:
        account_id = account["id"]
        conn = get_db()
        mail = None
        try:
            mail = _imap_connect(account)
            mover = _ImapMover(mail)

            # 0. Reflejar en el servidor los cambios de carpeta pendientes (reintento si antes falló)
            pushed = None
            try:
                pushed = _push_pending_moves(conn, account_id, mover)
            except Exception as push_err:
                print(f"[IMAP] Aviso aplicando cambios pendientes en el servidor: {push_err}")

            # 1. Resolver el buzón real del servidor y la carpeta de la app donde se guardará
            mailboxes = mover.mailboxes
            server_folder, flags = None, []
            if requested.upper() == "INBOX":
                server_folder = "INBOX"
            else:
                for name, fl in mailboxes:                      # nombre exacto del servidor
                    if name == requested or decode_imap_utf7(name) == requested:
                        server_folder, flags = name, fl
                        break
                if server_folder is None:                       # clave de la app (SENT, SPAM...) -> buzón del servidor
                    for name, fl in mailboxes:
                        if imap_local_folder(name, fl) == requested.upper():
                            server_folder, flags = name, fl
                            break
                if server_folder is None:
                    server_folder = requested
            local_folder = imap_local_folder(server_folder, flags)
            if local_folder is None:
                return {"success": True, "synced_count": 0, "skipped": f"Buzón virtual omitido: {server_folder}"}

            status, _ = mail.select(_quote_mailbox(server_folder), readonly=True)
            if status != "OK":
                return {"success": False, "error": f"No se pudo seleccionar la carpeta {requested}"}

            # 2. UIDs reales (estables aunque se borren mensajes en el servidor), no números de secuencia
            status, search_data = mail.uid("search", None, "UNDELETED")
            if status != "OK":
                return {"success": False, "error": "Error al buscar correos en la carpeta"}
            mail_uids = search_data[0].split() if search_data and search_data[0] else []
            if (all_pages or max_emails <= 0) and len(mail_uids) > 0:
                selected_uids = list(mail_uids)
            else:
                selected_uids = list(mail_uids[-max_emails:])
            selected_uids.reverse()

            # 3. Correos ya conocidos de ESTE buzón del servidor, estén en la carpeta local que estén
            #    (archivados, movidos a Spam/Papelera...), más los eliminados en MerkeMail
            #    (en IMAP los UID son por buzón: la clave de eliminados es "buzón::uid")
            del_rows = conn.execute("SELECT uid FROM deleted_emails WHERE account_id = ?", (account_id,)).fetchall()
            prefix = f"{server_folder}::"
            deleted_uids = {r["uid"][len(prefix):] for r in del_rows if r["uid"] and r["uid"].startswith(prefix)}
            ex_rows = conn.execute(
                "SELECT uid FROM emails WHERE account_id = ? AND source_folder = ?", (account_id, server_folder)
            ).fetchall()
            existing_uids = {r["uid"] for r in ex_rows if r["uid"]} | deleted_uids
            has_legacy = conn.execute(
                "SELECT 1 FROM emails WHERE account_id = ? AND source_folder IS NULL "
                "AND uid NOT LIKE 'seed-%' LIMIT 1", (account_id,)
            ).fetchone() is not None

            synced_count = 0
            migrated_count = 0
            removed_duplicates = 0
            for uid_bytes in selected_uids:
                uid_str = uid_bytes.decode()
                if uid_str in existing_uids:
                    continue

                res, msg_data = mail.uid("fetch", uid_bytes, "(RFC822)")
                raw_email = None
                if res == "OK" and msg_data:
                    for part in msg_data:
                        if isinstance(part, tuple) and len(part) > 1:
                            raw_email = part[1]
                            break
                if not raw_email:
                    continue

                data = parse_imap_message(raw_email, account)

                # 4. Filas creadas por versiones anteriores (sin buzón de origen y con número de secuencia):
                #    se reconocen por remitente + asunto + fecha y se actualizan en lugar de duplicarse.
                if has_legacy and data["has_real_date"]:
                    legacy = conn.execute(
                        "SELECT id, local_modified FROM emails "
                        "WHERE account_id = ? AND source_folder IS NULL AND uid NOT LIKE 'seed-%' "
                        "AND sender = ? AND subject = ? AND date = ? "
                        "ORDER BY COALESCE(local_modified, 0) DESC, id ASC",
                        (account_id, data["sender"], data["subject"], data["date"])
                    ).fetchall()
                    if legacy:
                        keeper = legacy[0]["id"]
                        # Si la versión anterior la guardó con el nombre del servidor ('Sent', 'Junk'...)
                        # se corrige a la carpeta de la app; si el usuario la movió, se respeta su carpeta.
                        conn.execute(
                            "UPDATE emails SET uid = ?, source_folder = ?, "
                            "folder = CASE WHEN folder = ? THEN ? ELSE folder END WHERE id = ?",
                            (uid_str, server_folder, server_folder, local_folder, keeper))
                        # Copias idénticas creadas por el error anterior y nunca modificadas por el usuario
                        for dup in legacy[1:]:
                            if not dup["local_modified"]:
                                conn.execute("DELETE FROM email_labels WHERE email_id = ?", (dup["id"],))
                                conn.execute("DELETE FROM attachments WHERE email_id = ?", (dup["id"],))
                                conn.execute("DELETE FROM emails WHERE id = ?", (dup["id"],))
                                removed_duplicates += 1
                        existing_uids.add(uid_str)
                        migrated_count += 1
                        continue

                conn.execute(
                    "INSERT INTO emails (account_id, uid, folder, source_folder, sender, recipient, subject, "
                    "snippet, body_text, body_html, date, has_attachments) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (account_id, uid_str, local_folder, server_folder, data["sender"], data["recipient"],
                     data["subject"], data["snippet"], data["body_text"], data["body_html"], data["date"],
                     data["has_attachments"])
                )
                existing_uids.add(uid_str)
                synced_count += 1

            conn.commit()
            result = {"success": True, "synced_count": synced_count}
            if pushed and (pushed.get("moved") or pushed.get("failed")):
                result["server_moves"] = {"moved": pushed["moved"], "failed": pushed["failed"]}
            if migrated_count or removed_duplicates:
                result.update({"migrated_count": migrated_count, "removed_duplicates": removed_duplicates})
            return result
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            if mail is not None:
                try:
                    mail.logout()
                except Exception:
                    pass
            conn.close()

    @classmethod
    def send_email(
        cls, 
        account_id: int, 
        to_email: str, 
        subject: str, 
        body: str, 
        is_html: bool = False,
        cc: Optional[str] = None,
        bcc: Optional[str] = None,
        attachments: Optional[List[Dict[str, Any]]] = None
    ) -> Dict[str, Any]:
        """Envía un correo mediante el servidor SMTP de la cuenta o Google OAuth con soporte para archivos adjuntos."""
        account = cls.get_account(account_id)
        if not account:
            return {"success": False, "error": "Cuenta no configurada"}

        if account.get("auth_type") == "oauth2":
            from backend.google_oauth import GoogleOAuthService
            try:
                res = GoogleOAuthService.send_gmail(account_id, to_email, subject, body, is_html, cc, bcc, attachments)
                return {"success": True, "message": "Correo enviado con éxito vía Gmail API"}
            except Exception as e:
                return {"success": False, "error": f"Error enviando vía Gmail API: {str(e)}"}

        if attachments:
            msg = MIMEMultipart("mixed")
            body_part = MIMEMultipart("alternative")
            if is_html:
                body_part.attach(MIMEText(body, "html", "utf-8"))
            else:
                body_part.attach(MIMEText(body, "plain", "utf-8"))
            msg.attach(body_part)

            import base64
            for att in attachments:
                try:
                    raw_data = base64.b64decode(att["data_base64"].split(",")[-1])
                    filename = att.get("filename", "adjunto")
                    ctype = att.get("content_type", "application/octet-stream")
                    maintype, subtype = ctype.split("/", 1) if "/" in ctype else ("application", "octet-stream")
                    part = MIMEBase(maintype, subtype)
                    part.set_payload(raw_data)
                    encoders.encode_base64(part)
                    part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
                    msg.attach(part)
                except Exception as att_err:
                    print(f"Error adjuntando archivo en SMTP: {att_err}")
        else:
            msg = MIMEMultipart("alternative")
            if is_html:
                msg.attach(MIMEText(body, "html", "utf-8"))
            else:
                msg.attach(MIMEText(body, "plain", "utf-8"))

        msg["From"] = f"{account['name']} <{account['email']}>"
        msg["To"] = to_email
        if cc:
            msg["Cc"] = cc
        msg["Subject"] = subject
        msg["Date"] = email.utils.formatdate(localtime=True)

        recipients = [addr.strip() for addr in to_email.split(",") if addr.strip()]
        if cc:
            recipients.extend([addr.strip() for addr in cc.split(",") if addr.strip()])
        if bcc:
            recipients.extend([addr.strip() for addr in bcc.split(",") if addr.strip()])

        try:
            port = int(account["smtp_port"])
            is_local = "127.0.0.1" in account["smtp_host"] or "localhost" in account["smtp_host"]
            if port == 465 or account.get("smtp_ssl") == 2:
                ctx = ssl.create_default_context()
                if is_local:
                    ctx.check_hostname = False
                    ctx.verify_mode = ssl.CERT_NONE
                server = smtplib.SMTP_SSL(account["smtp_host"], port, context=ctx)
            else:
                server = smtplib.SMTP(account["smtp_host"], port)
                if account.get("smtp_ssl", 1):
                    try:
                        ctx = ssl.create_default_context()
                        if is_local:
                            ctx.check_hostname = False
                            ctx.verify_mode = ssl.CERT_NONE
                        server.starttls(context=ctx)
                    except Exception as tls_err:
                        if not is_local:
                            raise tls_err

            raw_pass = CryptoService.decrypt(account.get("imap_password", "")) or ""
            server.login(account["imap_user"].strip(), raw_pass.replace(" ", "").strip())
            server.sendmail(account["email"], recipients, msg.as_string())
            server.quit()

            # Limpiar texto del cuerpo para el snippet antes de guardar en Sent
            if is_html:
                try:
                    from bs4 import BeautifulSoup
                    clean_text = " ".join(BeautifulSoup(body, "html.parser").get_text().split())
                except Exception:
                    import re
                    clean_text = re.sub(r'<[^>]+>', ' ', body).strip()
                clean_snippet = clean_text[:160]
                body_text_val = clean_text
                body_html_val = body
            else:
                clean_snippet = " ".join(body.split())[:160]
                body_text_val = body
                body_html_val = ""

            from datetime import timezone
            sent_date_val = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            has_att_val = 1 if (attachments and len(attachments) > 0) else 0

            # Guardar copia en SQLite (carpeta Sent)
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO emails (
                    account_id, uid, folder, sender, recipient, subject,
                    snippet, body_text, body_html, date, is_read, has_attachments
                ) VALUES (?, ?, 'SENT', ?, ?, ?, ?, ?, ?, ?, 1, ?)
            ''', (
                account_id, f"sent_{int(datetime.now().timestamp())}", 
                f"{account['name']} <{account['email']}>", to_email, subject,
                clean_snippet, body_text_val, body_html_val,
                sent_date_val, has_att_val
            ))
            sent_email_id = cursor.lastrowid

            # Guardar registros de metadata en la tabla attachments sin guardar ficheros innecesarios en disco local
            if attachments and sent_email_id:
                for att in attachments:
                    try:
                        att_fn = att.get("filename", "adjunto")
                        att_ct = att.get("content_type", "application/octet-stream")
                        att_sz = att.get("size", 0)
                        cursor.execute('''
                            INSERT INTO attachments (email_id, filename, content_type, size)
                            VALUES (?, ?, ?, ?)
                        ''', (sent_email_id, att_fn, att_ct, att_sz))
                    except Exception as ins_att_err:
                        print(f"Error guardando metadata de attachment: {ins_att_err}")

            conn.commit()
            conn.close()

            return {"success": True, "message": "Correo enviado con éxito"}
        except Exception as e:
            return {"success": False, "error": str(e)}

    @classmethod
    def get_account_folders(cls, account_id: int) -> List[Dict[str, Any]]:
        """Obtiene la lista completa de carpetas y etiquetas que se deben sincronizar."""
        account = cls.get_account(account_id)
        if not account:
            return []

        folders = []
        if account.get("auth_type") == "oauth2":
            # Carpetas estándar de Gmail
            folders = [
                {"id": "INBOX", "name": "Bandeja de Entrada", "type": "folder", "key": "INBOX"},
                {"id": "SENT", "name": "Enviados", "type": "folder", "key": "SENT"},
                {"id": "CATEGORY_PROMOTIONS", "name": "Promociones", "type": "folder", "key": "CATEGORY_PROMOTIONS"},
                {"id": "CATEGORY_SOCIAL", "name": "Social", "type": "folder", "key": "CATEGORY_SOCIAL"},
                {"id": "CATEGORY_UPDATES", "name": "Notificaciones", "type": "folder", "key": "CATEGORY_UPDATES"},
                {"id": "CATEGORY_FORUMS", "name": "Foros", "type": "folder", "key": "CATEGORY_FORUMS"},
                {"id": "STARRED", "name": "Destacados", "type": "folder", "key": "STARRED"},
                {"id": "DRAFT", "name": "Borradores", "type": "folder", "key": "DRAFT"},
                {"id": "SPAM", "name": "Spam", "type": "folder", "key": "SPAM"},
                {"id": "TRASH", "name": "Papelera", "type": "folder", "key": "TRASH"},
            ]
            try:
                from backend.google_oauth import GoogleOAuthService
                GoogleOAuthService.sync_gmail_labels(account_id)
            except Exception:
                pass

            conn = get_db()
            user_lbls = conn.execute("SELECT id, name, remote_id FROM labels WHERE account_id = ? AND remote_id IS NOT NULL", (account_id,)).fetchall()
            conn.close()
            for lbl in user_lbls:
                folders.append({
                    "id": f"label_{lbl['id']}",
                    "name": f"Etiqueta: {lbl['name']}",
                    "type": "label",
                    "label_id": lbl["id"],
                    "key": lbl["name"]
                })
        else:
            base_folders = ["INBOX", "Sent", "Drafts", "Trash", "Spam", "Archive"]
            try:
                mail = _imap_connect(account)
                status, folder_data = mail.list()
                mail.logout()
                if status == "OK" and folder_data:
                    found_folders = []
                    for f_name, f_flags in parse_imap_list(folder_data):
                        # Omitir buzones no seleccionables y virtuales ([Gmail]/Todos, Destacados, Importantes)
                        if imap_local_folder(f_name, f_flags) is None:
                            continue
                        if f_name and f_name not in found_folders:
                            found_folders.append(f_name)
                    if found_folders:
                        base_folders = found_folders
            except Exception as e:
                print(f"Aviso listando carpetas IMAP: {e}")

            for f in base_folders:
                folders.append({
                    "id": f,
                    "name": decode_imap_utf7(f),
                    "type": "folder",
                    "key": f
                })

        return folders

    @classmethod
    def populate_demo_data_if_empty(cls):
        """Si no hay cuentas ni correos, carga datos demostrativos amigables para probar de inmediato."""
        conn = get_db()
        acc_count = conn.execute("SELECT COUNT(*) as c FROM accounts").fetchone()["c"]
        if acc_count == 0:
            # Crear cuentas de prueba para Gmail y Proton
            conn.execute('''
                INSERT INTO accounts (name, email, provider, imap_host, imap_port, imap_user, imap_password, smtp_host, smtp_port)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', ("Gmail Profesional", "usuario@gmail.com", "gmail", "imap.gmail.com", 993, "usuario@gmail.com", "demo_pass", "smtp.gmail.com", 587))
            
            conn.execute('''
                INSERT INTO accounts (name, email, provider, imap_host, imap_port, imap_user, imap_password, smtp_host, smtp_port)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', ("ProtonMail Seguro", "contacto@proton.me", "proton", "127.0.0.1", 1143, "contacto@proton.me", "demo_pass", "127.0.0.1", 1025))
            
            # Cargar correos de muestra representativos (incluyendo boletines, citas para calendario y correos de trabajo)
            demo_emails = [
                (1, "101", "INBOX", "Google Cloud Alerts <notifications@google.com>", "usuario@gmail.com", 
                 "Facturación Mensual y Resumen de Servicios Cloud", 
                 "Tu factura del ciclo actual está disponible para revisión. El consumo fue de $14.50 USD.",
                 "Estimado cliente,\n\nLe informamos que su estado de cuenta mensual de Google Cloud ya está disponible.\nEl total a facturar este periodo es de $14.50 USD.\nPuede acceder a la consola de Facturación para descargar el desglose detallado.",
                 "<p>Estimado cliente,</p><p>Le informamos que su estado de cuenta mensual de <strong>Google Cloud</strong> ya está disponible.</p><p>Total: <strong>$14.50 USD</strong>.</p>",
                 "2026-11-14 09:30:00", 0, 1, 0, "alta", '["Facturación", "Cloud"]'),

                (1, "102", "INBOX", "Tech Weekly Newsletter <news@techweekly.dev>", "usuario@gmail.com",
                 "Boletín Semanal #240: Novedades en IA y Python 3.13",
                 "Descubre las últimas tendencias en modelos multimodales, frameworks de alto rendimiento y tips de arquitectura.",
                 "Hola suscriptor,\n\nEn esta edición revisamos los avances de los nuevos agentes de IA y las mejoras de concurrencia en Python.\nNo te pierdas los artículos destacados de nuestra comunidad.\n\nPara cancelar suscripción haz clic aquí.",
                 "<p>Hola suscriptor,</p><p>En esta edición revisamos los avances de los nuevos agentes de IA y tips de Python.</p>",
                 "2026-11-10 08:15:00", 1, 0, 0, "baja", '["Boletín", "Promoción"]'),

                (1, "103", "INBOX", "Sofia Martinez <smartinez@empresa.com>", "usuario@gmail.com",
                 "Reunión de Planificación de Proyecto - Viernes 16:00 hrs",
                 "Hola equipo, propongo coordinar la sesión de seguimiento este viernes 20 de noviembre a las 16:00 en Sala Virtual.",
                 "Hola equipo,\n\nPropongo que tengamos la sesión de revisión de avances este viernes 20 de noviembre de 16:00 a 17:00 hrs.\nRevisaremos los entregables de MerkeMail y el despliegue del calendario.\n\nFavor de confirmar asistencia.",
                 "<p>Hola equipo,</p><p>Propongo coordinar la sesión este <strong>viernes 20 de noviembre de 16:00 a 17:00 hrs</strong>.</p>",
                 "2026-11-13 14:20:00", 0, 1, 1, "alta", '["Reunión", "Proyecto"]'),

                (2, "201", "INBOX", "Proton Support <support@proton.me>", "contacto@proton.me",
                 "Consejos de Privacidad: Protege tus llaves de cifrado",
                 "Aprende cómo mantener seguro tu llavero PGP y respaldar tus frases de recuperación.",
                 "Hola,\n\nTu privacidad es nuestra prioridad. Te compartimos las mejores prácticas para asegurar tus comunicaciones y respaldar tus claves de cifrado en Proton Mail.",
                 "<p>Tu privacidad es nuestra prioridad. Revisa las mejores prácticas de seguridad en Proton Mail.</p>",
                 "2026-11-12 11:00:00", 1, 0, 0, "media", '["Seguridad", "Proton"]'),

                (1, "104", "INBOX", "Ofertas BlackFriday Deals <promo@shoppingdeals.com>", "usuario@gmail.com",
                 "¡Gran Venta Especial! 50% de Descuento en Electrónica",
                 "Aprovecha las rebajas exclusivas por tiempo limitado en gadgets y accesorios tecnológicos.",
                 "¡No te lo pierdas! Tenemos descuentos del 50% en laptops, monitores y más.\nOferta válida hasta agotar existencias.",
                 "<p>¡Aprovecha descuentos exclusivos del 50% en tecnología!</p>",
                 "2026-10-25 10:00:00", 1, 0, 0, "baja", '["Publicidad", "Ofertas"]')
            ]

            for em in demo_emails:
                conn.execute('''
                    INSERT OR IGNORE INTO emails (
                        account_id, uid, folder, sender, recipient, subject, snippet,
                        body_text, body_html, date, is_read, is_starred, has_attachments,
                        ai_urgency, ai_tags
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', em)
            
            # Cargar eventos demostrativos de Google Calendar y Proton Calendar
            conn.execute('''
                INSERT INTO events (calendar_id, title, description, location, start_time, end_time, all_day)
                VALUES (1, 'Reunión de Planificación de Proyecto', 'Seguimiento de entregables y roadmap', 'Google Meet', '2026-11-20T16:00:00', '2026-11-20T17:00:00', 0)
            ''')
            conn.execute('''
                INSERT INTO events (calendar_id, title, description, location, start_time, end_time, all_day)
                VALUES (2, 'Revisión de Seguridad y Cifrado Proton', 'Auditoría de llaves y certificados', 'Oficina Principal', '2026-11-22T10:00:00', '2026-11-22T11:30:00', 0)
            ''')

            # Cargar firmas de correo de ejemplo
            conn.execute('''
                INSERT INTO signatures (name, content, account_id, is_default)
                VALUES (?, ?, 1, 1)
            ''', (
                "Firma Corporativa (Gmail)",
                "--\nAtentamente,\nUsuario Demo\nLíder de Desarrollo | MerkeMail\nTel: +1 (555) 010-0000\nhttps://ejemplo.com",
            ))

            conn.execute('''
                INSERT INTO signatures (name, content, account_id, is_default)
                VALUES (?, ?, 2, 1)
            ''', (
                "Firma Cifrada (Proton)",
                "--\nEnviado con cifrado de extremo a extremo vía Proton Mail.\nUsuario Demo | PGP ID: 0x00000000",
            ))

            conn.commit()
        conn.close()

EmailService.populate_demo_data_if_empty()
