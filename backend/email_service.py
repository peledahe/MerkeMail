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

        conn = get_db()
        try:
            is_local = "127.0.0.1" in account["imap_host"] or "localhost" in account["imap_host"]
            mail = None
            if account.get("imap_ssl", 1):
                try:
                    ctx = ssl.create_default_context()
                    if is_local:
                        ctx.check_hostname = False
                        ctx.verify_mode = ssl.CERT_NONE
                    mail = imaplib.IMAP4_SSL(account["imap_host"], int(account["imap_port"]), ssl_context=ctx)
                except Exception as ssl_err:
                    if is_local:
                        mail = imaplib.IMAP4(account["imap_host"], int(account["imap_port"]))
                    else:
                        raise ssl_err
            else:
                mail = imaplib.IMAP4(account["imap_host"], int(account["imap_port"]))

            raw_pass = CryptoService.decrypt(account.get("imap_password", "")) or ""
            mail.login(account["imap_user"].strip(), raw_pass.replace(" ", "").strip())
            status, _ = mail.select(folder, readonly=True)
            if status != "OK":
                return {"success": False, "error": f"No se pudo seleccionar la carpeta {folder}"}

            status, search_data = mail.search(None, "ALL")
            if status != "OK":
                return {"success": False, "error": "Error al buscar correos en la carpeta"}

            mail_ids = search_data[0].split()
            # Descargar los más recientes primero o todos si se solicita
            if (all_pages or max_emails <= 0) and len(mail_ids) > 0:
                selected_ids = list(mail_ids)
            else:
                selected_ids = list(mail_ids[-max_emails:])
            selected_ids.reverse()

            synced_count = 0
            for uid_bytes in selected_ids:
                uid_str = uid_bytes.decode()
                # Verificar si ya existe en caché
                existing = conn.execute(
                    "SELECT id FROM emails WHERE account_id = ? AND folder = ? AND uid = ?",
                    (account_id, folder, uid_str)
                ).fetchone()

                if existing:
                    continue

                res, msg_data = mail.fetch(uid_bytes, "(RFC822)")
                if res != "OK" or not msg_data or not msg_data[0]:
                    continue

                raw_email = msg_data[0][1]
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
                        from datetime import timezone
                        dt = parsedate_to_datetime(date_str)
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                        else:
                            dt = dt.astimezone(timezone.utc)
                        date_val = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                    except Exception:
                        pass
                if not date_val:
                    from datetime import timezone
                    date_val = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

                conn.execute('''
                    INSERT INTO emails (
                        account_id, uid, folder, sender, recipient, subject,
                        snippet, body_text, body_html, date, has_attachments
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    account_id, uid_str, folder, sender, recipient, subject,
                    snippet, body_text, body_html, date_val, has_attachments
                ))
                synced_count += 1

            conn.commit()
            mail.logout()
            return {"success": True, "synced_count": synced_count}
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
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
                mail = None
                is_local = "127.0.0.1" in account["imap_host"] or "localhost" in account["imap_host"]
                if account.get("imap_ssl", 1):
                    ctx = ssl.create_default_context()
                    if is_local:
                        ctx.check_hostname = False
                        ctx.verify_mode = ssl.CERT_NONE
                    mail = imaplib.IMAP4_SSL(account["imap_host"], int(account["imap_port"]), ssl_context=ctx)
                else:
                    mail = imaplib.IMAP4(account["imap_host"], int(account["imap_port"]))
                raw_pass = CryptoService.decrypt(account.get("imap_password", "")) or ""
                mail.login(account["imap_user"].strip(), raw_pass.replace(" ", "").strip())
                status, folder_data = mail.list()
                mail.logout()
                if status == "OK" and folder_data:
                    found_folders = []
                    for f_entry in folder_data:
                        if isinstance(f_entry, bytes):
                            f_str = f_entry.decode("utf-8", errors="ignore")
                            parts = f_str.split(' "/" ')
                            if len(parts) > 1:
                                f_name = parts[-1].strip().strip('"')
                                if f_name and f_name not in found_folders:
                                    found_folders.append(f_name)
                    if found_folders:
                        base_folders = found_folders
            except Exception as e:
                print(f"Aviso listando carpetas IMAP: {e}")

            for f in base_folders:
                folders.append({
                    "id": f,
                    "name": f,
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
                "--\nAtentamente,\nPerry Daniels\nLíder de Desarrollo | MerkeMail\nTel: +1 (555) 019-2834\nhttps://merke.dev",
            ))

            conn.execute('''
                INSERT INTO signatures (name, content, account_id, is_default)
                VALUES (?, ?, 2, 1)
            ''', (
                "Firma Cifrada (Proton)",
                "--\nEnviado con cifrado de extremo a extremo vía Proton Mail.\nPerry Daniels | PGP ID: 0x9B4E21FA",
            ))

            conn.commit()
        conn.close()

EmailService.populate_demo_data_if_empty()
