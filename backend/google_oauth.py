import os
import json
import base64
import urllib.parse
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
import requests
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from bs4 import BeautifulSoup
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from backend.database import get_db, get_setting, set_setting
from backend.crypto_service import CryptoService

GOOGLE_SCOPES = [
    "https://mail.google.com/",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid"
]

class GoogleOAuthService:
    @staticmethod
    def get_credentials_config() -> Dict[str, str]:
        """Obtiene el Client ID y Client Secret de los settings o variables de entorno."""
        return {
            "client_id": get_setting("google_client_id") or os.getenv("GOOGLE_CLIENT_ID", ""),
            "client_secret": get_setting("google_client_secret") or os.getenv("GOOGLE_CLIENT_SECRET", "")
        }

    @classmethod
    def get_authorization_url(cls, redirect_uri: str, state: str = "merke_auth") -> Optional[str]:
        """Genera la URL oficial de consentimiento de Google OAuth2."""
        cfg = cls.get_credentials_config()
        if not cfg["client_id"]:
            return None

        params = {
            "client_id": cfg["client_id"],
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": " ".join(GOOGLE_SCOPES),
            "access_type": "offline",
            "prompt": "consent",
            "state": state
        }
        return f"https://accounts.google.com/o/oauth2/v2/auth?{urllib.parse.urlencode(params)}"

    @classmethod
    def exchange_code_for_tokens(cls, code: str, redirect_uri: str) -> Dict[str, Any]:
        """Intercambia el código de autorización por tokens de acceso y actualización."""
        cfg = cls.get_credentials_config()
        token_url = "https://oauth2.googleapis.com/token"

        data = {
            "code": code,
            "client_id": cfg["client_id"],
            "client_secret": cfg["client_secret"],
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code"
        }

        resp = requests.post(token_url, data=data)
        if resp.status_code != 200:
            raise ValueError(f"Error al canjear código con Google: {resp.text}")

        token_data = resp.json()
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        expires_in = token_data.get("expires_in", 3600)
        expiry_date = (datetime.now() + timedelta(seconds=expires_in)).isoformat()

        # Obtener información del usuario autenticado
        user_info_resp = requests.get(
            "https://www.googleapis.com/oauth2/v2/userinfo",
            headers={"Authorization": f"Bearer {access_token}"}
        )
        user_info = user_info_resp.json() if user_info_resp.status_code == 200 else {}
        user_email = user_info.get("email", "")
        user_name = user_info.get("name", "Cuenta Gmail")

        if not user_email:
            raise ValueError("No se pudo obtener el correo de la cuenta de Google.")

        # Guardar o actualizar la cuenta en SQLite
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("SELECT id, oauth_refresh_token FROM accounts WHERE email = ?", (user_email,))
        existing = cursor.fetchone()

        avatar_url = user_info.get("picture", "")

        if existing:
            acc_id = existing["id"]
            raw_refresh = refresh_token or CryptoService.decrypt(existing["oauth_refresh_token"])
            final_refresh_token = CryptoService.encrypt(raw_refresh)
            cursor.execute('''
                UPDATE accounts SET
                    name = ?, provider = 'gmail', auth_type = 'oauth2',
                    oauth_access_token = ?, oauth_refresh_token = ?, oauth_token_expiry = ?,
                    color = '#ef4444', avatar_url = ?
                WHERE id = ?
            ''', (user_name, access_token, final_refresh_token, expiry_date, avatar_url, acc_id))
        else:
            encrypted_refresh = CryptoService.encrypt(refresh_token)
            cursor.execute('''
                INSERT INTO accounts (
                    name, email, provider, auth_type,
                    imap_host, imap_port, imap_user, imap_password,
                    smtp_host, smtp_port, color, avatar_url,
                    oauth_access_token, oauth_refresh_token, oauth_token_expiry
                ) VALUES (?, ?, 'gmail', 'oauth2', 'imap.gmail.com', 993, ?, '', 'smtp.gmail.com', 587, '#ef4444', ?, ?, ?, ?)
            ''', (user_name, user_email, user_email, avatar_url, access_token, encrypted_refresh, expiry_date))
            acc_id = cursor.lastrowid

        conn.commit()
        conn.close()

        # Sincronizar correos y eventos de Google Calendar en segundo plano
        try:
            cls.sync_gmail(acc_id, max_results=20)
            cls.sync_google_calendar(acc_id)
        except Exception as e:
            print(f"Error sincronización inicial Google: {e}")

        return {
            "success": True,
            "account_id": acc_id,
            "email": user_email,
            "name": user_name
        }

    @classmethod
    def get_valid_credentials(cls, account_id: int) -> Credentials:
        """Obtiene credenciales válidas refrescándolas automáticamente si están expiradas."""
        conn = get_db()
        acc = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
        conn.close()

        if not acc:
            raise ValueError("Cuenta no encontrada")

        cfg = cls.get_credentials_config()
        decrypted_refresh = CryptoService.decrypt(acc["oauth_refresh_token"])
        creds = Credentials(
            token=acc["oauth_access_token"],
            refresh_token=decrypted_refresh,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=cfg["client_id"],
            client_secret=cfg["client_secret"],
            scopes=GOOGLE_SCOPES
        )

        if creds.expired and creds.refresh_token:
            from google.auth.transport.requests import Request
            creds.refresh(Request())
            # Actualizar en BD
            conn = get_db()
            conn.execute('''
                UPDATE accounts SET oauth_access_token = ?, oauth_token_expiry = ? WHERE id = ?
            ''', (creds.token, creds.expiry.isoformat() if creds.expiry else None, account_id))
            conn.commit()
            conn.close()

        return creds

    @classmethod
    def sync_google_calendar(cls, account_id: int) -> int:
        """Sincroniza eventos de Google Calendar con la base de datos de MerkeMail."""
        try:
            creds = cls.get_valid_credentials(account_id)
            cal_service = build("calendar", "v3", credentials=creds)
            now = datetime.utcnow().isoformat() + "Z"
            events_result = cal_service.events().list(
                calendarId="primary",
                timeMin=now,
                maxResults=50,
                singleEvents=True,
                orderBy="startTime"
            ).execute()
            items = events_result.get("items", [])

            conn = get_db()
            synced = 0
            for item in items:
                title = item.get("summary", "(Sin título)")
                description = item.get("description", "")
                location = item.get("location", "")
                start = item.get("start", {}).get("dateTime") or item.get("start", {}).get("date")
                end = item.get("end", {}).get("dateTime") or item.get("end", {}).get("date") or start

                if not start:
                    continue

                existing = conn.execute(
                    "SELECT id FROM events WHERE calendar_id = 1 AND title = ? AND start_time = ?",
                    (title, start)
                ).fetchone()

                if not existing:
                    conn.execute('''
                        INSERT INTO events (calendar_id, title, description, location, start_time, end_time)
                        VALUES (1, ?, ?, ?, ?, ?)
                    ''', (title, description, location, start, end))
                    synced += 1

            conn.commit()
            conn.close()
            return synced
        except Exception as e:
            print(f"Error sincronizando Google Calendar: {e}")
            return 0

    @classmethod
    def sync_gmail_labels(cls, account_id: int) -> List[Dict[str, Any]]:
        """Sincroniza todas las etiquetas (labels) de la cuenta de Gmail a la base de datos local."""
        try:
            creds = cls.get_valid_credentials(account_id)
            service = build("gmail", "v1", credentials=creds)

            labels_res = service.users().labels().list(userId="me").execute()
            gmail_labels = labels_res.get("labels", [])

            palette = [
                "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6",
                "#06b6d4", "#f97316", "#14b8a6", "#6366f1", "#d946ef",
                "#84cc16", "#ef4444", "#64748b"
            ]

            conn = get_db()
            cursor = conn.cursor()

            saved_labels = []
            for glbl in gmail_labels:
                remote_id = glbl.get("id")
                name = glbl.get("name")
                lbl_type = glbl.get("type", "user")

                # Sincronizamos las etiquetas creadas por el usuario
                if lbl_type != "user":
                    continue

                color = glbl.get("color", {}).get("backgroundColor") if glbl.get("color") else None
                if not color or not str(color).startswith("#"):
                    color = palette[abs(hash(name)) % len(palette)]

                existing = cursor.execute(
                    "SELECT id FROM labels WHERE account_id = ? AND (remote_id = ? OR name = ?)",
                    (account_id, remote_id, name)
                ).fetchone()

                if existing:
                    cursor.execute(
                        "UPDATE labels SET name = ?, color = ?, remote_id = ?, type = ? WHERE id = ?",
                        (name, color, remote_id, lbl_type, existing["id"])
                    )
                    label_id = existing["id"]
                else:
                    cursor.execute(
                        "INSERT INTO labels (name, color, account_id, remote_id, type) VALUES (?, ?, ?, ?, ?)",
                        (name, color, account_id, remote_id, lbl_type)
                    )
                    label_id = cursor.lastrowid

                saved_labels.append({
                    "id": label_id,
                    "remote_id": remote_id,
                    "name": name,
                    "color": color,
                    "account_id": account_id
                })

            conn.commit()
            conn.close()
            return saved_labels
        except Exception as e:
            print(f"Error sincronizando etiquetas Gmail: {e}")
            return []

    @classmethod
    def sync_gmail(cls, account_id: int, folder: Optional[str] = None, label_id: Optional[int] = None, max_results: int = 30, all_pages: bool = False, max_pages: int = 100) -> Dict[str, Any]:
        """Sincroniza correos usando la Gmail REST API oficial (OAuth2), admitiendo filtro por carpeta o etiqueta y paginación completa."""
        creds = cls.get_valid_credentials(account_id)
        service = build("gmail", "v1", credentials=creds)

        # 1. Sincronizar etiquetas primero
        cls.sync_gmail_labels(account_id)

        conn = get_db()
        acc = conn.execute("SELECT email FROM accounts WHERE id = ?", (account_id,)).fetchone()
        user_email = acc["email"] if acc else ""

        # Mapeo de remote_id a local_id para etiquetas
        lbl_rows = conn.execute("SELECT id, remote_id FROM labels WHERE account_id = ? AND remote_id IS NOT NULL", (account_id,)).fetchall()
        remote_to_local_label = {r["remote_id"]: r["id"] for r in lbl_rows}

        # Preparar parámetros de consulta para Gmail API
        page_size = 250 if all_pages else min(max_results, 500)
        list_params = {"userId": "me", "maxResults": page_size}
        include_spam_trash = False

        google_folder_labels = {
            "STARRED": ["STARRED"],
            "SENT": ["SENT"],
            "TRASH": ["TRASH"],
            "SPAM": ["SPAM"],
            "DRAFT": ["DRAFT"],
            "IMPORTANT": ["IMPORTANT"],
            "CATEGORY_PROMOTIONS": ["CATEGORY_PROMOTIONS"],
            "CATEGORY_SOCIAL": ["CATEGORY_SOCIAL"],
            "CATEGORY_UPDATES": ["CATEGORY_UPDATES"],
            "CATEGORY_FORUMS": ["CATEGORY_FORUMS"],
            "INBOX": ["INBOX"]
        }

        if label_id:
            target_lbl = conn.execute("SELECT remote_id FROM labels WHERE id = ?", (label_id,)).fetchone()
            if target_lbl and target_lbl["remote_id"]:
                list_params["labelIds"] = [target_lbl["remote_id"]]
            else:
                list_params["labelIds"] = ["INBOX"]
        elif folder in google_folder_labels:
            list_params["labelIds"] = google_folder_labels[folder]
            if folder in ["TRASH", "SPAM"]:
                include_spam_trash = True
        elif folder in ["ALL", "TODOS"]:
            # Sin restricción de labelIds para traer todos
            pass
        elif folder:
            list_params["q"] = f"in:{folder.lower()}"
        else:
            list_params["labelIds"] = ["INBOX"]

        if include_spam_trash:
            list_params["includeSpamTrash"] = True

        messages = []
        page_token = None
        pages_count = 0

        while True:
            cur_params = dict(list_params)
            if page_token:
                cur_params["pageToken"] = page_token

            results = service.users().messages().list(**cur_params).execute()
            batch = results.get("messages", [])
            if batch:
                messages.extend(batch)

            pages_count += 1
            page_token = results.get("nextPageToken")

            if not all_pages or not page_token or pages_count >= max_pages:
                break

        if not messages:
            conn.commit()
            conn.close()
            return {"success": True, "synced_count": 0}

        msg_ids = [m["id"] for m in messages]
        existing_rows = []
        chunk_size = 500
        for i in range(0, len(msg_ids), chunk_size):
            chunk = msg_ids[i:i + chunk_size]
            ph = ",".join("?" for _ in chunk)
            rows = conn.execute(
                f"SELECT id, uid, folder, is_read, is_starred FROM emails WHERE account_id = ? AND uid IN ({ph})",
                [account_id] + chunk
            ).fetchall()
            existing_rows.extend(rows)

        existing_by_uid = {r["uid"]: dict(r) for r in existing_rows}

        new_msg_ids = [mid for mid in msg_ids if mid not in existing_by_uid]
        existing_msg_ids = [mid for mid in msg_ids if mid in existing_by_uid]

        # Google API Client no es thread-safe; aislamos una instancia de service por hilo
        import threading
        thread_local = threading.local()

        def get_thread_service():
            if not hasattr(thread_local, "service"):
                thread_local.service = build("gmail", "v1", credentials=creds)
            return thread_local.service

        # 1. Descarga concurrente de mensajes nuevos con ThreadPoolExecutor
        full_messages = {}
        if new_msg_ids:
            import concurrent.futures
            def fetch_full(mid):
                try:
                    s = get_thread_service()
                    return mid, s.users().messages().get(userId="me", id=mid, format="full").execute()
                except Exception as e:
                    return mid, None

            with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(new_msg_ids), 8)) as executor:
                futures = [executor.submit(fetch_full, mid) for mid in new_msg_ids]
                for fut in concurrent.futures.as_completed(futures):
                    mid, data = fut.result()
                    if data:
                        full_messages[mid] = data

        # 2. Descarga concurrente ultraligera (solo labelIds) para mensajes ya existentes
        minimal_messages = {}
        if existing_msg_ids:
            import concurrent.futures
            def fetch_min(mid):
                try:
                    s = get_thread_service()
                    return mid, s.users().messages().get(userId="me", id=mid, fields="id,labelIds").execute()
                except Exception as e:
                    return mid, None

            with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(existing_msg_ids), 8)) as executor:
                futures = [executor.submit(fetch_min, mid) for mid in existing_msg_ids]
                for fut in concurrent.futures.as_completed(futures):
                    mid, data = fut.result()
                    if data:
                        minimal_messages[mid] = data

        synced_count = 0

        # Procesar mensajes nuevos primero
        for msg_id in new_msg_ids:
            msg = full_messages.get(msg_id)
            if not msg:
                continue

            try:
                headers = {h["name"].lower(): h["value"] for h in msg.get("payload", {}).get("headers", [])}
                subject = headers.get("subject", "(Sin Asunto)")
                sender = headers.get("from", "Desconocido")
                recipient = headers.get("to", user_email)
                snippet = msg.get("snippet", "")

                internal_date_ms = msg.get("internalDate")
                date_val = None
                if internal_date_ms:
                    try:
                        from datetime import timezone
                        dt = datetime.fromtimestamp(int(internal_date_ms) / 1000.0, tz=timezone.utc)
                        date_val = dt.strftime("%Y-%m-%dT%H:%M:%SZ")
                    except Exception:
                        date_val = None

                date_raw = headers.get("date", "")
                if not date_val and date_raw:
                    try:
                        from email.utils import parsedate_to_datetime
                        from datetime import timezone
                        dt = parsedate_to_datetime(date_raw)
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

                msg_label_ids = msg.get("labelIds", [])
                is_starred = 1 if "STARRED" in msg_label_ids else 0
                is_read = 0 if "UNREAD" in msg_label_ids else 1

                if "TRASH" in msg_label_ids:
                    msg_folder = "TRASH"
                elif "SENT" in msg_label_ids:
                    msg_folder = "SENT"
                elif "SPAM" in msg_label_ids:
                    msg_folder = "SPAM"
                elif "DRAFT" in msg_label_ids:
                    msg_folder = "DRAFT"
                elif "CATEGORY_PROMOTIONS" in msg_label_ids:
                    msg_folder = "CATEGORY_PROMOTIONS"
                elif "CATEGORY_SOCIAL" in msg_label_ids:
                    msg_folder = "CATEGORY_SOCIAL"
                elif "CATEGORY_UPDATES" in msg_label_ids:
                    msg_folder = "CATEGORY_UPDATES"
                elif "CATEGORY_FORUMS" in msg_label_ids:
                    msg_folder = "CATEGORY_FORUMS"
                else:
                    msg_folder = "INBOX"

                body_text, body_html = cls._extract_body(msg.get("payload", {}))
                if body_html and "cid:" in body_html:
                    body_html = cls._resolve_cids(service, msg_id, msg.get("payload", {}), body_html)
                has_attachments = cls._has_attachments(msg.get("payload", {}))

                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO emails (
                        account_id, uid, folder, sender, recipient, subject,
                        snippet, body_text, body_html, date, is_read, is_starred, has_attachments
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    account_id, msg_id, msg_folder, sender, recipient, subject,
                    snippet, body_text, body_html, date_val, is_read, is_starred, has_attachments
                ))
                email_db_id = cursor.lastrowid
                synced_count += 1

                for remote_lbl in msg_label_ids:
                    if remote_lbl in remote_to_local_label:
                        local_lbl_id = remote_to_local_label[remote_lbl]
                        conn.execute(
                            "INSERT OR IGNORE INTO email_labels (email_id, label_id) VALUES (?, ?)",
                            (email_db_id, local_lbl_id)
                        )

                attachments_meta = cls._extract_attachments_metadata(msg.get("payload", {}))
                if attachments_meta:
                    conn.execute("DELETE FROM attachments WHERE email_id = ?", (email_db_id,))
                    for att in attachments_meta:
                        conn.execute('''
                            INSERT INTO attachments (email_id, filename, content_type, size, remote_id)
                            VALUES (?, ?, ?, ?, ?)
                        ''', (email_db_id, att["filename"], att["content_type"], att["size"], att.get("remote_id")))
            except Exception as item_err:
                print(f"Error procesando mensaje nuevo {msg_id}: {item_err}")
                continue

        # Procesar actualizaciones ligeras de mensajes existentes (solo si cambiaron sus etiquetas)
        for msg_id in existing_msg_ids:
            min_data = minimal_messages.get(msg_id)
            if not min_data:
                continue

            msg_label_ids = min_data.get("labelIds", [])
            is_starred = 1 if "STARRED" in msg_label_ids else 0
            is_read = 0 if "UNREAD" in msg_label_ids else 1

            if "TRASH" in msg_label_ids:
                msg_folder = "TRASH"
            elif "SENT" in msg_label_ids:
                msg_folder = "SENT"
            elif "SPAM" in msg_label_ids:
                msg_folder = "SPAM"
            elif "DRAFT" in msg_label_ids:
                msg_folder = "DRAFT"
            elif "CATEGORY_PROMOTIONS" in msg_label_ids:
                msg_folder = "CATEGORY_PROMOTIONS"
            elif "CATEGORY_SOCIAL" in msg_label_ids:
                msg_folder = "CATEGORY_SOCIAL"
            elif "CATEGORY_UPDATES" in msg_label_ids:
                msg_folder = "CATEGORY_UPDATES"
            elif "CATEGORY_FORUMS" in msg_label_ids:
                msg_folder = "CATEGORY_FORUMS"
            else:
                msg_folder = "INBOX"

            existing = existing_by_uid[msg_id]
            # Solo actualizar si hubo un cambio real de estado
            if (existing["folder"] != msg_folder or 
                existing["is_read"] != is_read or 
                existing["is_starred"] != is_starred):
                
                conn.execute(
                    "UPDATE emails SET folder = ?, is_read = ?, is_starred = ? WHERE id = ?",
                    (msg_folder, is_read, is_starred, existing["id"])
                )

            # Sincronizar etiquetas de usuario asociadas
            if remote_to_local_label:
                conn.execute("DELETE FROM email_labels WHERE email_id = ?", (existing["id"],))
                for remote_lbl in msg_label_ids:
                    if remote_lbl in remote_to_local_label:
                        local_lbl_id = remote_to_local_label[remote_lbl]
                        conn.execute(
                            "INSERT OR IGNORE INTO email_labels (email_id, label_id) VALUES (?, ?)",
                            (existing["id"], local_lbl_id)
                        )

        conn.commit()
        conn.close()
        return {"success": True, "synced_count": synced_count}

    @classmethod
    def send_gmail(
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
        """Envía un correo usando la Gmail API oficial con soporte completo para archivos adjuntos."""
        from email.mime.base import MIMEBase
        from email import encoders

        creds = cls.get_valid_credentials(account_id)
        service = build("gmail", "v1", credentials=creds)

        if attachments:
            message = MIMEMultipart("mixed")
            body_part = MIMEMultipart("alternative")
            if is_html:
                body_part.attach(MIMEText(body, "html", "utf-8"))
            else:
                body_part.attach(MIMEText(body, "plain", "utf-8"))
            message.attach(body_part)

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
                    message.attach(part)
                except Exception as att_err:
                    print(f"Error adjuntando archivo en Gmail: {att_err}")
        else:
            message = MIMEMultipart("alternative")
            if is_html:
                message.attach(MIMEText(body, "html", "utf-8"))
            else:
                message.attach(MIMEText(body, "plain", "utf-8"))

        message["to"] = to_email
        if cc:
            message["cc"] = cc
        if bcc:
            message["bcc"] = bcc
        message["subject"] = subject

        raw_msg = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
        sent = service.users().messages().send(userId="me", body={"raw": raw_msg}).execute()

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

        # Guardar en Sent (con fecha canónica UTC para ordenamiento cronológico perfecto)
        from datetime import timezone
        sent_date_val = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        has_att_val = 1 if (attachments and len(attachments) > 0) else 0

        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO emails (
                account_id, uid, folder, sender, recipient, subject,
                snippet, body_text, body_html, date, is_read, has_attachments
            ) VALUES (?, ?, 'SENT', 'Yo', ?, ?, ?, ?, ?, ?, 1, ?)
        ''', (
            account_id, sent["id"], to_email, subject,
            clean_snippet, body_text_val, body_html_val,
            sent_date_val, has_att_val
        ))
        sent_email_id = cursor.lastrowid

        # Guardar registros en la tabla attachments y persistir ficheros en disco
        if attachments and sent_email_id:
            for att in attachments:
                try:
                    att_fn = att.get("filename", "adjunto")
                    att_ct = att.get("content_type", "application/octet-stream")
                    att_sz = att.get("size", 0)
                    att_b64 = att.get("data_base64", "")
                    cursor.execute('''
                        INSERT INTO attachments (email_id, filename, content_type, size)
                        VALUES (?, ?, ?, ?)
                    ''', (sent_email_id, att_fn, att_ct, att_sz))
                    new_att_id = cursor.lastrowid
                    if att_b64 and new_att_id:
                        safe_fn = "".join(c for c in att_fn if c.isalnum() or c in "._- ")
                        fpath = os.path.join("data", "attachments", f"{new_att_id}_{safe_fn}")
                        os.makedirs(os.path.join("data", "attachments"), exist_ok=True)
                        with open(fpath, "wb") as f:
                            f.write(base64.b64decode(att_b64))
                        cursor.execute("UPDATE attachments SET file_path = ? WHERE id = ?", (fpath, new_att_id))
                except Exception as ins_att_err:
                    print(f"Error guardando attachment db: {ins_att_err}")

        conn.commit()
        conn.close()

        return {"success": True, "message_id": sent["id"]}

    @classmethod
    def _extract_body(cls, payload: Dict[str, Any]) -> tuple:
        body_text = ""
        body_html = ""

        if "parts" in payload:
            for part in payload["parts"]:
                mime_type = part.get("mimeType", "")
                data = part.get("body", {}).get("data", "")
                if data:
                    decoded = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
                    if mime_type == "text/plain" and not body_text:
                        body_text = decoded
                    elif mime_type == "text/html" and not body_html:
                        body_html = decoded
                if "parts" in part:
                    sub_text, sub_html = cls._extract_body(part)
                    if sub_text and not body_text: body_text = sub_text
                    if sub_html and not body_html: body_html = sub_html
        else:
            data = payload.get("body", {}).get("data", "")
            if data:
                decoded = base64.urlsafe_b64decode(data).decode("utf-8", errors="replace")
                if payload.get("mimeType") == "text/html":
                    body_html = decoded
                else:
                    body_text = decoded

        return body_text, body_html

    @classmethod
    def _has_attachments(cls, payload: Dict[str, Any]) -> int:
        """Determina recursivamente si un mensaje de Gmail contiene archivos adjuntos."""
        if not payload:
            return 0
        filename = payload.get("filename", "")
        if filename and filename.strip():
            return 1
        if payload.get("body", {}).get("attachmentId"):
            return 1
        for part in payload.get("parts", []):
            if cls._has_attachments(part):
                return 1
        return 0

    @classmethod
    def _extract_attachments_metadata(cls, payload: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extrae la lista de archivos adjuntos (no inline/cid) de un mensaje de Gmail."""
        attachments = []
        def walk(part):
            filename = part.get("filename", "")
            headers = {h.get("name", "").lower(): h.get("value", "") for h in part.get("headers", [])}
            content_disposition = headers.get("content-disposition", "")
            content_id = headers.get("content-id", "")
            body = part.get("body", {})
            att_id = body.get("attachmentId", "")
            size = body.get("size", 0)
            mime_type = part.get("mimeType", "application/octet-stream")

            if filename and (att_id or "data" in body):
                is_inline_cid = content_id and mime_type.startswith("image/") and not ("attachment" in content_disposition.lower())
                if not is_inline_cid:
                    attachments.append({
                        "filename": filename,
                        "content_type": mime_type,
                        "size": size,
                        "remote_id": att_id
                    })
            for sub in part.get("parts", []):
                walk(sub)
        walk(payload)
        return attachments

    @classmethod
    def modify_message_labels(cls, account_id: int, message_uid: str, add_labels: List[str] = None, remove_labels: List[str] = None):
        """Modifica las etiquetas de un mensaje en los servidores reales de Gmail."""
        try:
            creds = cls.get_valid_credentials(account_id)
            service = build('gmail', 'v1', credentials=creds)
            body = {}
            if add_labels:
                body['addLabelIds'] = add_labels
            if remove_labels:
                body['removeLabelIds'] = remove_labels
            if body:
                service.users().messages().modify(userId='me', id=message_uid, body=body).execute()
        except Exception as e:
            print(f"Aviso modificando etiquetas en Gmail remoto: {e}")

    @classmethod
    def _resolve_cids(cls, service, msg_id: str, payload: Dict[str, Any], body_html: str) -> str:
        """Resuelve imágenes inline referenciadas con cid: convirtiéndolas en data URIs base64."""
        if not body_html or "cid:" not in body_html:
            return body_html

        cids = {}
        def collect_cids(part):
            headers = {h.get('name', '').lower(): h.get('value', '') for h in part.get('headers', [])}
            cid = headers.get('content-id', '')
            if cid:
                clean_cid = cid.strip('<>').strip()
                mime = part.get('mimeType', 'image/png')
                data = part.get('body', {}).get('data', '')
                att_id = part.get('body', {}).get('attachmentId', '')
                cids[clean_cid] = {'data': data, 'att_id': att_id, 'mime': mime}
            for sub in part.get('parts', []):
                collect_cids(sub)

        collect_cids(payload)
        for cid, info in cids.items():
            if f"cid:{cid}" in body_html or f"cid:&lt;{cid}&gt;" in body_html or f"cid:<{cid}>" in body_html:
                b64_data = info['data']
                if not b64_data and info['att_id']:
                    try:
                        att = service.users().messages().attachments().get(
                            userId='me', messageId=msg_id, id=info['att_id']
                        ).execute()
                        b64_data = att.get('data', '')
                    except Exception as e:
                        print(f"Error descargando CID attachment {cid}: {e}")
                if b64_data:
                    normalized_b64 = b64_data.replace('-', '+').replace('_', '/')
                    data_uri = f"data:{info['mime']};base64,{normalized_b64}"
                    body_html = body_html.replace(f"cid:{cid}", data_uri)
                    body_html = body_html.replace(f"cid:<{cid}>", data_uri)
                    body_html = body_html.replace(f"cid:&lt;{cid}&gt;", data_uri)
        return body_html

    @classmethod
    def resolve_cids_for_email(cls, email_id: int, conn) -> Optional[str]:
        """Resuelve CIDs bajo demanda para un correo específico y actualiza la base de datos."""
        row = conn.execute("SELECT account_id, uid, body_html FROM emails WHERE id = ?", (email_id,)).fetchone()
        if not row or not row["body_html"] or "cid:" not in row["body_html"]:
            return None
        
        account_id = row["account_id"]
        uid = row["uid"]
        body_html = row["body_html"]
        
        try:
            creds = cls.get_valid_credentials(account_id)
            if not creds:
                return None
            service = build('gmail', 'v1', credentials=creds)
            msg = service.users().messages().get(userId='me', id=uid, format='full').execute()
            resolved = cls._resolve_cids(service, uid, msg.get("payload", {}), body_html)
            if resolved and resolved != body_html:
                conn.execute("UPDATE emails SET body_html = ? WHERE id = ?", (resolved, email_id))
                conn.commit()
                return resolved
        except Exception as e:
            print(f"Error en resolve_cids_for_email para correo {email_id}: {e}")
        return None
