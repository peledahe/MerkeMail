import os
import re
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
    "https://www.googleapis.com/auth/tasks",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid"
]

class GoogleOAuthService:
    @staticmethod
    def build_api_enable_url(api_name: str, err_str: str = "") -> str:
        """Construye la URL de la consola de Google Cloud para habilitar una API,
        usando el número de proyecto del propio usuario (extraído del error de Google
        o del prefijo de su Client ID), sin IDs de proyecto fijos en el código."""
        base = f"https://console.developers.google.com/apis/api/{api_name}/overview"
        match = re.search(r"project[=\s]+(\d+)", err_str or "")
        project = match.group(1) if match else ""
        if not project:
            client_id = (get_setting("google_client_id") or os.getenv("GOOGLE_CLIENT_ID", "")).strip()
            cid_match = re.match(r"^(\d+)-", client_id)
            project = cid_match.group(1) if cid_match else ""
        return f"{base}?project={project}" if project else base

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

        # Sincronizar correos, calendario y tareas en segundo plano sin bloquear el callback OAuth
        import threading
        def _bg_initial_sync():
            try:
                cls.sync_gmail(acc_id, max_results=20)
                cls.sync_google_calendar(acc_id)
                cls.sync_google_tasks(acc_id)
            except Exception as e:
                print(f"Error sincronización inicial Google en background: {e}")

        threading.Thread(target=_bg_initial_sync, daemon=True).start()

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
            scopes=None
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
    def sync_google_calendar(cls, account_id: int) -> Dict[str, Any]:
        """Sincroniza todos los calendarios y eventos de Google Calendar con la base de datos de MerkeMail."""
        try:
            creds = cls.get_valid_credentials(account_id)
            if not creds:
                return {"success": False, "error": "Credenciales no válidas", "synced": 0}

            cal_service = build("calendar", "v3", credentials=creds)

            # 1. Obtener y registrar la lista completa de calendarios de la cuenta
            cal_list_resp = cal_service.calendarList().list().execute()
            cal_items = cal_list_resp.get("items", [])

            conn = get_db()
            cursor = conn.cursor()

            acc_row = cursor.execute("SELECT name, email, color FROM accounts WHERE id = ?", (account_id,)).fetchone()
            acc_color = (acc_row["color"] if acc_row else None) or "#4f46e5"
            acc_email = acc_row["email"] if acc_row else ""

            calendar_map = {}  # ext_id -> local_id

            for item in cal_items:
                ext_id = item.get("id")
                if not ext_id:
                    continue
                is_primary = item.get("primary", False)
                summary = item.get("summary") or ("Google Calendar" if is_primary else ext_id)
                cal_color = item.get("backgroundColor") or acc_color

                existing = cursor.execute(
                    "SELECT id FROM calendars WHERE account_id = ? AND external_id = ?",
                    (account_id, ext_id)
                ).fetchone()

                if existing:
                    cursor.execute(
                        "UPDATE calendars SET name = ?, color = ?, provider = 'google' WHERE id = ?",
                        (summary, cal_color, existing["id"])
                    )
                    local_cal_id = existing["id"]
                else:
                    cursor.execute(
                        "INSERT INTO calendars (name, provider, color, account_id, external_id) VALUES (?, 'google', ?, ?, ?)",
                        (summary, cal_color, account_id, ext_id)
                    )
                    local_cal_id = cursor.lastrowid

                calendar_map[ext_id] = local_cal_id

            conn.commit()

            # Si no devolvió calendarios de la API, asegurar que exista el primary local
            if not calendar_map:
                existing_primary = cursor.execute(
                    "SELECT id FROM calendars WHERE account_id = ? AND external_id = 'primary'",
                    (account_id,)
                ).fetchone()
                if existing_primary:
                    calendar_map["primary"] = existing_primary["id"]

            # Cargar registro de eventos eliminados en MerkeMail para que prevalezcan siempre
            del_rows = cursor.execute("SELECT external_id FROM deleted_events WHERE account_id = ?", (account_id,)).fetchall()
            deleted_ext_ids = {r["external_id"] for r in del_rows if r["external_id"]}

            # 2. Rango de sincronización de eventos: desde hace 60 días hasta 180 días adelante
            time_min = (datetime.utcnow() - timedelta(days=60)).isoformat() + "Z"
            time_max = (datetime.utcnow() + timedelta(days=180)).isoformat() + "Z"

            total_synced = 0

            # 3. Iterar por TODOS los calendarios para sincronizar eventos con prioridad local
            for ext_id, local_cal_id in calendar_map.items():
                try:
                    # 3a. Subir primero cualquier evento creado localmente aún no sincronizado (external_id IS NULL)
                    unsynced_locals = cursor.execute(
                        "SELECT * FROM events WHERE calendar_id = ? AND (external_id IS NULL OR external_id = '') AND (is_task = 0 OR is_task IS NULL)",
                        (local_cal_id,)
                    ).fetchall()
                    for u_ev in unsynced_locals:
                        new_ext = cls.create_google_event(
                            account_id=account_id,
                            ext_calendar_id=ext_id,
                            event_data={
                                "title": u_ev["title"],
                                "description": u_ev["description"],
                                "location": u_ev["location"],
                                "start_time": u_ev["start_time"],
                                "end_time": u_ev["end_time"],
                                "all_day": u_ev["all_day"]
                            }
                        )
                        if new_ext:
                            cursor.execute("UPDATE events SET external_id = ? WHERE id = ?", (new_ext, u_ev["id"]))
                    conn.commit()

                    events_result = cal_service.events().list(
                        calendarId=ext_id,
                        timeMin=time_min,
                        timeMax=time_max,
                        maxResults=250,
                        singleEvents=True,
                        orderBy="startTime"
                    ).execute()

                    events = events_result.get("items", [])
                    for ev in events:
                        ext_ev_id = ev.get("id")
                        # Si fue eliminado en MerkeMail, prevalece la eliminación local y se borra en servidor si sigue activo
                        if ext_ev_id and ext_ev_id in deleted_ext_ids:
                            if ev.get("status") != "cancelled":
                                try:
                                    cal_service.events().delete(calendarId=ext_id, eventId=ext_ev_id).execute()
                                except Exception:
                                    pass
                            continue

                        # Si el evento fue cancelado/borrado en Google
                        if ev.get("status") == "cancelled":
                            if ext_ev_id:
                                cursor.execute(
                                    "DELETE FROM events WHERE calendar_id = ? AND external_id = ? AND (local_modified = 0 OR local_modified IS NULL)",
                                    (local_cal_id, ext_ev_id)
                                )
                            continue

                        title = ev.get("summary") or "(Sin título)"
                        description = ev.get("description", "") or ""
                        location = ev.get("location", "") or ""
                        remote_updated = ev.get("updated") or ""

                        start_dict = ev.get("start", {})
                        end_dict = ev.get("end", {})

                        start = start_dict.get("dateTime") or start_dict.get("date")
                        end = end_dict.get("dateTime") or end_dict.get("date") or start

                        if not start:
                            continue

                        is_all_day = 1 if "date" in start_dict and "dateTime" not in start_dict else 0

                        # Buscar si ya existe por external_id o (calendar_id, start_time, title)
                        existing_ev = None
                        if ext_ev_id:
                            existing_ev = cursor.execute(
                                "SELECT * FROM events WHERE calendar_id = ? AND external_id = ?",
                                (local_cal_id, ext_ev_id)
                            ).fetchone()
                        if not existing_ev:
                            existing_ev = cursor.execute(
                                "SELECT * FROM events WHERE calendar_id = ? AND title = ? AND start_time = ?",
                                (local_cal_id, title, start)
                            ).fetchone()

                        if existing_ev:
                            local_mod = existing_ev["local_modified"] or 0
                            local_upd = str(existing_ev["updated_at"] or "")
                            # Prioridad 1: Cambios en MerkeMail o versión local más reciente prevalecen
                            if local_mod == 1 and (not remote_updated or local_upd >= remote_updated[:20]):
                                # Si difiere del servidor, empujar la versión de MerkeMail al servidor
                                if (existing_ev["title"] != title or existing_ev["start_time"] != start or existing_ev["description"] != description):
                                    cls.update_google_event(
                                        account_id=account_id,
                                        ext_calendar_id=ext_id,
                                        ext_event_id=ext_ev_id,
                                        event_data={
                                            "title": existing_ev["title"],
                                            "description": existing_ev["description"],
                                            "location": existing_ev["location"],
                                            "start_time": existing_ev["start_time"],
                                            "end_time": existing_ev["end_time"],
                                            "all_day": existing_ev["all_day"]
                                        }
                                    )
                                if not existing_ev["external_id"] and ext_ev_id:
                                    cursor.execute("UPDATE events SET external_id = ? WHERE id = ?", (ext_ev_id, existing_ev["id"]))
                            else:
                                # Prioridad 2: Versión más reciente del servidor
                                cursor.execute('''
                                    UPDATE events 
                                    SET title = ?, description = ?, location = ?, start_time = ?, end_time = ?,
                                        all_day = ?, external_id = ?, updated_at = COALESCE(?, updated_at), local_modified = 0
                                    WHERE id = ?
                                ''', (title, description, location, start, end, is_all_day, ext_ev_id, remote_updated, existing_ev["id"]))
                        else:
                            cursor.execute('''
                                INSERT INTO events (calendar_id, title, description, location, start_time, end_time, all_day, external_id, updated_at, local_modified)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                            ''', (local_cal_id, title, description, location, start, end, is_all_day, ext_ev_id, remote_updated))
                            total_synced += 1

                    conn.commit()
                except Exception as ev_err:
                    print(f"Aviso sincronizando eventos del calendario {ext_id}: {ev_err}")

            conn.close()
            return {"success": True, "synced": total_synced}
        except Exception as e:
            err_str = str(e)
            print(f"Error sincronizando Google Calendar: {err_str}")
            is_disabled = "accessNotConfigured" in err_str or "Google Calendar API has not been used" in err_str
            return {
                "success": False,
                "error": err_str,
                "api_disabled": is_disabled,
                "enable_url": cls.build_api_enable_url("calendar-json.googleapis.com", err_str) if is_disabled else None,
                "synced": 0
            }

    @classmethod
    def create_google_event(cls, account_id: int, ext_calendar_id: str, event_data: Dict[str, Any]) -> Optional[str]:
        """Crea un evento en Google Calendar y devuelve su ID externo."""
        try:
            creds = cls.get_valid_credentials(account_id)
            if not creds:
                return None
            cal_service = build("calendar", "v3", credentials=creds)

            all_day = event_data.get("all_day", 0)
            start_time = event_data.get("start_time", "")
            end_time = event_data.get("end_time", "") or start_time

            body = {
                "summary": event_data.get("title", "(Sin título)"),
                "description": event_data.get("description", "") or "",
                "location": event_data.get("location", "") or ""
            }

            if all_day:
                s_date = start_time.split("T")[0] if "T" in start_time else start_time[:10]
                e_date = end_time.split("T")[0] if "T" in end_time else end_time[:10]
                body["start"] = {"date": s_date}
                body["end"] = {"date": e_date}
            else:
                s_dt = start_time if ("T" in start_time) else f"{start_time}T09:00:00"
                e_dt = end_time if ("T" in end_time) else f"{end_time}T10:00:00"
                body["start"] = {"dateTime": s_dt}
                body["end"] = {"dateTime": e_dt}

            cal_target = ext_calendar_id if ext_calendar_id else "primary"
            created = cal_service.events().insert(calendarId=cal_target, body=body).execute()
            ext_id = created.get("id")
            print(f"[Google Calendar] Evento creado en Google Calendar ({cal_target}): {ext_id}")
            return ext_id
        except Exception as e:
            print(f"[Google Calendar] Error creando evento en Google: {e}")
            return None

    @classmethod
    def update_google_event(cls, account_id: int, ext_calendar_id: str, ext_event_id: str, event_data: Dict[str, Any]) -> bool:
        """Actualiza un evento existente en Google Calendar."""
        try:
            creds = cls.get_valid_credentials(account_id)
            if not creds or not ext_event_id:
                return False
            cal_service = build("calendar", "v3", credentials=creds)

            all_day = event_data.get("all_day", 0)
            start_time = event_data.get("start_time", "")
            end_time = event_data.get("end_time", "") or start_time

            body = {}
            if "title" in event_data:
                body["summary"] = event_data["title"]
            if "description" in event_data:
                body["description"] = event_data["description"]
            if "location" in event_data:
                body["location"] = event_data["location"]

            if start_time:
                if all_day:
                    s_date = start_time.split("T")[0] if "T" in start_time else start_time[:10]
                    e_date = end_time.split("T")[0] if "T" in end_time else end_time[:10]
                    body["start"] = {"date": s_date}
                    body["end"] = {"date": e_date}
                else:
                    s_dt = start_time if ("T" in start_time) else f"{start_time}T09:00:00"
                    e_dt = end_time if ("T" in end_time) else f"{end_time}T10:00:00"
                    body["start"] = {"dateTime": s_dt}
                    body["end"] = {"dateTime": e_dt}

            cal_target = ext_calendar_id if ext_calendar_id else "primary"
            cal_service.events().patch(calendarId=cal_target, eventId=ext_event_id, body=body).execute()
            print(f"[Google Calendar] Evento {ext_event_id} actualizado en Google Calendar ({cal_target})")
            return True
        except Exception as e:
            print(f"[Google Calendar] Error actualizando evento en Google: {e}")
            return False

    @classmethod
    def delete_google_event(cls, account_id: int, ext_calendar_id: str, ext_event_id: str) -> bool:
        """Elimina un evento de Google Calendar."""
        try:
            creds = cls.get_valid_credentials(account_id)
            if not creds or not ext_event_id:
                return False
            cal_service = build("calendar", "v3", credentials=creds)
            cal_target = ext_calendar_id if ext_calendar_id else "primary"
            cal_service.events().delete(calendarId=cal_target, eventId=ext_event_id).execute()
            print(f"[Google Calendar] Evento {ext_event_id} eliminado de Google Calendar ({cal_target})")
            return True
        except Exception as e:
            print(f"[Google Calendar] Error eliminando evento de Google: {e}")
            return False

    @classmethod
    def sync_google_tasks(cls, account_id: int) -> Dict[str, Any]:
        """Sincroniza listas de tareas y tareas desde Google Tasks API."""
        try:
            creds = cls.get_valid_credentials(account_id)
            if not creds:
                return {"success": False, "error": "Credenciales inválidas", "synced": 0}

            tasks_service = build("tasks", "v1", credentials=creds)
            tasklists_res = tasks_service.tasklists().list().execute()
            tasklists = tasklists_res.get("items", [])

            conn = get_db()
            cursor = conn.cursor()

            acc_row = cursor.execute("SELECT name, email, color FROM accounts WHERE id = ?", (account_id,)).fetchone()
            acc_color = (acc_row["color"] if acc_row else None) or "#3b82f6"
            acc_email = acc_row["email"] if acc_row else ""

            # Cargar registro de tareas eliminadas en MerkeMail para prevalecer sobre el servidor
            del_rows = cursor.execute("SELECT external_id FROM deleted_events WHERE account_id = ?", (account_id,)).fetchall()
            deleted_ext_ids = {r["external_id"] for r in del_rows if r["external_id"]}

            total_synced = 0

            for tl in tasklists:
                tl_id = tl.get("id")
                tl_title = tl.get("title") or "Tareas"
                cal_name = f"Tareas ({tl_title})"
                cal_ext_id = f"tasks_list_{tl_id}"

                existing_cal = cursor.execute(
                    "SELECT id FROM calendars WHERE account_id = ? AND external_id = ?",
                    (account_id, cal_ext_id)
                ).fetchone()

                if existing_cal:
                    local_cal_id = existing_cal["id"]
                    cursor.execute(
                        "UPDATE calendars SET name = ?, provider = 'google', color = ? WHERE id = ?",
                        (cal_name, acc_color, local_cal_id)
                    )
                else:
                    cursor.execute(
                        "INSERT INTO calendars (name, provider, color, account_id, external_id) VALUES (?, 'google', ?, ?, ?)",
                        (cal_name, acc_color, account_id, cal_ext_id)
                    )
                    local_cal_id = cursor.lastrowid

                # Subir primero tareas locales nuevas sin external_id asignadas a esta lista
                unsynced_tasks = cursor.execute(
                    "SELECT * FROM events WHERE calendar_id = ? AND (external_id IS NULL OR external_id = '') AND is_task = 1",
                    (local_cal_id,)
                ).fetchall()
                for ut in unsynced_tasks:
                    new_tid = cls.create_google_task(
                        account_id=account_id,
                        tasklist_id=tl_id,
                        task_data={
                            "title": (ut["title"] or "").replace("[Tarea]", "").strip() or ut["title"],
                            "notes": ut["description"] or "",
                            "due": ut["start_time"] or "",
                            "is_completed": bool(ut["is_completed"] == 1)
                        }
                    )
                    if new_tid:
                        cursor.execute("UPDATE events SET external_id = ? WHERE id = ?", (new_tid, ut["id"]))
                conn.commit()

                # Descargar tareas de esta lista
                tasks_res = tasks_service.tasks().list(tasklist=tl_id, showCompleted=True, showHidden=True, maxResults=100).execute()
                items = tasks_res.get("items", [])

                for item in items:
                    task_id = item.get("id")
                    if task_id and task_id in deleted_ext_ids:
                        if not item.get("deleted"):
                            try:
                                tasks_service.tasks().delete(tasklist=tl_id, task=task_id).execute()
                            except Exception:
                                pass
                        continue

                    if not task_id or item.get("deleted"):
                        if task_id:
                            cursor.execute(
                                "DELETE FROM events WHERE calendar_id = ? AND external_id = ? AND (local_modified = 0 OR local_modified IS NULL)",
                                (local_cal_id, task_id)
                            )
                        continue

                    title = item.get("title") or "(Tarea sin título)"
                    notes = item.get("notes") or ""
                    due = item.get("due") or ""
                    is_completed = 1 if item.get("status") == "completed" else 0
                    remote_updated = item.get("updated") or ""

                    existing_task = cursor.execute(
                        "SELECT * FROM events WHERE calendar_id = ? AND external_id = ?",
                        (local_cal_id, task_id)
                    ).fetchone()

                    if existing_task:
                        local_mod = existing_task["local_modified"] or 0
                        local_upd = str(existing_task["updated_at"] or "")
                        # Prioridad 1: Los cambios en MerkeMail o la versión más reciente prevalecen
                        if local_mod == 1 and (not remote_updated or local_upd >= remote_updated[:20]):
                            if (existing_task["is_completed"] != is_completed or existing_task["title"].replace("[Tarea]", "").strip() != title.replace("[Tarea]", "").strip()):
                                cls.update_google_task(
                                    account_id=account_id,
                                    tasklist_id=tl_id,
                                    ext_task_id=task_id,
                                    task_data={
                                        "title": existing_task["title"].replace("[Tarea]", "").strip() or existing_task["title"],
                                        "notes": existing_task["description"] or "",
                                        "due": existing_task["start_time"] or "",
                                        "is_completed": bool(existing_task["is_completed"] == 1)
                                    }
                                )
                        else:
                            # Prioridad 2: Versión más reciente del servidor
                            cursor.execute('''
                                UPDATE events
                                SET title = ?, description = ?, start_time = ?, end_time = ?, is_completed = ?,
                                    is_task = 1, updated_at = COALESCE(?, updated_at), local_modified = 0
                                WHERE id = ?
                            ''', (title, notes, due, due, is_completed, remote_updated, existing_task["id"]))
                    else:
                        cursor.execute('''
                            INSERT INTO events (calendar_id, title, description, start_time, end_time, is_completed, is_task, account_id, external_id, updated_at, local_modified)
                            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, 0)
                        ''', (local_cal_id, title, notes, due, due, is_completed, account_id, task_id, remote_updated))
                        total_synced += 1

                conn.commit()

            conn.close()
            return {"success": True, "synced": total_synced}
        except Exception as e:
            err_str = str(e)
            is_insufficient = "insufficient authentication scopes" in err_str.lower()
            is_disabled = "accessnotconfigured" in err_str.lower() or "google tasks api has not been used" in err_str.lower()
            if is_insufficient:
                print(f"[Google Tasks] Cuenta {account_id}: El permiso de Tasks se activará al volver a iniciar sesión con Google.")
            else:
                print(f"[Google Tasks] Error sincronizando tareas: {err_str}")

            return {
                "success": not is_disabled,
                "error": err_str if is_disabled else None,
                "api_disabled": is_disabled,
                "needs_reauth": is_insufficient,
                "enable_url": cls.build_api_enable_url("tasks.googleapis.com", err_str) if is_disabled else None,
                "synced": 0
            }

    @classmethod
    def create_google_task(cls, account_id: int, tasklist_id: str, task_data: Dict[str, Any]) -> Optional[str]:
        """Crea una tarea en Google Tasks y devuelve su ID externo."""
        try:
            creds = cls.get_valid_credentials(account_id)
            if not creds:
                return None
            tasks_service = build("tasks", "v1", credentials=creds)
            body: Dict[str, Any] = {
                "title": task_data.get("title", "(Tarea)"),
                "notes": task_data.get("notes", "") or "",
                "status": "completed" if task_data.get("is_completed") else "needsAction"
            }
            due = (task_data.get("due") or "").strip()
            if due:
                if "T" not in due:
                    due = f"{due[:10]}T00:00:00.000Z"
                elif not due.endswith("Z") and "+" not in due:
                    due = f"{due}Z"
                body["due"] = due
            tl = tasklist_id if tasklist_id else "@default"
            created = tasks_service.tasks().insert(tasklist=tl, body=body).execute()
            return created.get("id")
        except Exception as e:
            print(f"[Google Tasks] Error creando tarea en Google: {e}")
            return None

    @classmethod
    def update_google_task(cls, account_id: int, tasklist_id: str, ext_task_id: str, task_data: Dict[str, Any]) -> bool:
        """Actualiza una tarea existente en Google Tasks."""
        try:
            creds = cls.get_valid_credentials(account_id)
            if not creds or not ext_task_id:
                return False
            tasks_service = build("tasks", "v1", credentials=creds)
            body: Dict[str, Any] = {}
            if "title" in task_data and task_data["title"] is not None:
                body["title"] = task_data["title"]
            if "notes" in task_data and task_data["notes"] is not None:
                body["notes"] = task_data["notes"]
            if "is_completed" in task_data and task_data["is_completed"] is not None:
                body["status"] = "completed" if task_data["is_completed"] else "needsAction"
            due = (task_data.get("due") or "").strip()
            if due:
                if "T" not in due:
                    due = f"{due[:10]}T00:00:00.000Z"
                elif not due.endswith("Z") and "+" not in due:
                    due = f"{due}Z"
                body["due"] = due
            tl = tasklist_id if tasklist_id else "@default"
            tasks_service.tasks().patch(tasklist=tl, task=ext_task_id, body=body).execute()
            return True
        except Exception as e:
            print(f"[Google Tasks] Error actualizando tarea en Google: {e}")
            return False

    @classmethod
    def delete_google_task(cls, account_id: int, tasklist_id: str, ext_task_id: str) -> bool:
        """Elimina una tarea de Google Tasks."""
        try:
            creds = cls.get_valid_credentials(account_id)
            if not creds or not ext_task_id:
                return False
            tasks_service = build("tasks", "v1", credentials=creds)
            tl = tasklist_id if tasklist_id else "@default"
            tasks_service.tasks().delete(tasklist=tl, task=ext_task_id).execute()
            return True
        except Exception as e:
            print(f"[Google Tasks] Error eliminando tarea en Google: {e}")
            return False

    @classmethod
    def toggle_google_task(cls, account_id: int, tasklist_id: str, ext_task_id: str, is_completed: bool) -> bool:
        """Marca una tarea en Google Tasks como completada o pendiente."""
        try:
            creds = cls.get_valid_credentials(account_id)
            if not creds:
                return False
            tasks_service = build("tasks", "v1", credentials=creds)
            status_val = "completed" if is_completed else "needsAction"
            tasks_service.tasks().patch(tasklist=tasklist_id, task=ext_task_id, body={"status": status_val}).execute()
            print(f"[Google Tasks] Tarea {ext_task_id} actualizada a {status_val}")
            return True
        except Exception as e:
            print(f"[Google Tasks] Error actualizando estado de tarea en Google: {e}")
            return False

    _last_labels_sync_by_acc: Dict[int, float] = {}

    # Paleta de colores de fondo que acepta la API de Gmail para etiquetas (cualquier otro valor
    # devuelve error 400). El color elegido en MerkeMail se aproxima al más cercano de esta lista.
    _GMAIL_LABEL_BG_COLORS = [
        "#000000", "#434343", "#666666", "#999999", "#cccccc", "#efefef", "#f3f3f3", "#ffffff",
        "#fb4c2f", "#ffad47", "#fad165", "#16a766", "#43d692", "#4a86e8", "#a479e2", "#f691b3",
        "#f6c5be", "#ffe6c7", "#fef1d1", "#b9e4d0", "#c6f3de", "#c9daf8", "#e4d7f5", "#fcdee8",
        "#efa093", "#ffd6a2", "#fce8b3", "#89d3b2", "#a0eac9", "#a4c2f4", "#d0bcf1", "#fbc8d9",
        "#e66550", "#ffbc6b", "#fcda83", "#44b984", "#68dfa9", "#6d9eeb", "#b694e8", "#f7a7c0",
        "#cc3a21", "#eaa041", "#f2c960", "#149e60", "#3dc789", "#3c78d8", "#8e63ce", "#e07798",
        "#ac2b16", "#cf8933", "#d5ae49", "#0b804b", "#2a9c68", "#285bac", "#653e9b", "#b65775",
        "#822111", "#a46a21", "#aa8831", "#076239", "#1a764d", "#1c4587", "#41236d", "#83334c",
    ]

    @classmethod
    def is_gmail_api_account(cls, account_id: Optional[int]) -> bool:
        """True si la cuenta es de Gmail conectada por OAuth (sincroniza por la API REST de Gmail)."""
        if not account_id:
            return False
        conn = get_db()
        row = conn.execute("SELECT auth_type FROM accounts WHERE id = ?", (account_id,)).fetchone()
        conn.close()
        return bool(row and row["auth_type"] == "oauth2")

    @classmethod
    def _gmail_label_color(cls, hex_color: Optional[str]) -> Optional[Dict[str, str]]:
        """Color de Gmail más cercano al color local (fondo + texto legible), o None si no es válido."""
        m = re.fullmatch(r"#?([0-9a-fA-F]{6})", (hex_color or "").strip())
        if not m:
            return None
        rgb = tuple(int(m.group(1)[i:i + 2], 16) for i in (0, 2, 4))
        def dist(c):
            c_rgb = tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))
            return sum((a - b) ** 2 for a, b in zip(rgb, c_rgb))
        bg = min(cls._GMAIL_LABEL_BG_COLORS, key=dist)
        r, g, b = (int(bg[i:i + 2], 16) for i in (1, 3, 5))
        text = "#000000" if (0.299 * r + 0.587 * g + 0.114 * b) > 150 else "#ffffff"
        return {"backgroundColor": bg, "textColor": text}

    @classmethod
    def create_gmail_label(cls, account_id: int, name: str, color: Optional[str] = None) -> str:
        """Crea la etiqueta en Gmail y devuelve su id remoto. Si ya existe una con ese nombre
        (sin distinguir mayúsculas) se reutiliza. Lanza excepción si Gmail no está disponible."""
        creds = cls.get_valid_credentials(account_id)
        service = build("gmail", "v1", credentials=creds)
        key = (name or "").strip().casefold()
        for glbl in service.users().labels().list(userId="me").execute().get("labels", []):
            if (glbl.get("name") or "").strip().casefold() == key:
                return glbl["id"]
        body = {"name": name.strip(), "labelListVisibility": "labelShow", "messageListVisibility": "show"}
        gcolor = cls._gmail_label_color(color)
        if gcolor:
            body["color"] = gcolor
        try:
            created = service.users().labels().create(userId="me", body=body).execute()
        except Exception:
            if "color" not in body:
                raise
            body.pop("color")  # Reintentar sin color si Gmail lo rechaza
            created = service.users().labels().create(userId="me", body=body).execute()
        return created["id"]

    @classmethod
    def update_gmail_label(cls, account_id: int, remote_id: str, name: str, color: Optional[str] = None) -> None:
        """Renombra / cambia el color de la etiqueta en Gmail."""
        creds = cls.get_valid_credentials(account_id)
        service = build("gmail", "v1", credentials=creds)
        body = {"name": name.strip()}
        gcolor = cls._gmail_label_color(color)
        if gcolor:
            body["color"] = gcolor
        try:
            service.users().labels().patch(userId="me", id=remote_id, body=body).execute()
        except Exception:
            if "color" not in body:
                raise
            body.pop("color")
            service.users().labels().patch(userId="me", id=remote_id, body=body).execute()

    @classmethod
    def delete_gmail_label(cls, account_id: int, remote_id: str) -> None:
        """Elimina la etiqueta en Gmail (los mensajes no se borran, solo pierden la etiqueta)."""
        creds = cls.get_valid_credentials(account_id)
        service = build("gmail", "v1", credentials=creds)
        service.users().labels().delete(userId="me", id=remote_id).execute()

    @classmethod
    def push_pending_local_labels(cls, account_id: int) -> int:
        """Crea en Gmail las etiquetas de la cuenta que aún son solo locales (sin remote_id), p. ej.
        si Gmail no respondía al crearlas, y envía a Gmail sus asignaciones a correos.
        Devuelve cuántas etiquetas se crearon."""
        conn = get_db()
        pending = conn.execute(
            "SELECT id, name, color FROM labels WHERE account_id = ? AND (remote_id IS NULL OR remote_id = '')",
            (account_id,)
        ).fetchall()
        conn.close()
        created = 0
        for lbl in pending:
            try:
                remote_id = cls.create_gmail_label(account_id, lbl["name"], lbl["color"])
            except Exception as e:
                print(f"Aviso: no se pudo crear la etiqueta '{lbl['name']}' en Gmail: {e}")
                continue
            conn = get_db()
            conn.execute("UPDATE labels SET remote_id = ?, type = 'user' WHERE id = ?", (remote_id, lbl["id"]))
            uids = [r["uid"] for r in conn.execute(
                """SELECT e.uid FROM email_labels el JOIN emails e ON e.id = el.email_id
                   WHERE el.label_id = ? AND e.account_id = ? AND e.uid IS NOT NULL AND e.uid != ''""",
                (lbl["id"], account_id)
            ).fetchall()]
            conn.commit()
            conn.close()
            for uid in uids:
                cls.modify_message_labels(account_id, uid, add_labels=[remote_id])
            created += 1
        return created

    @classmethod
    def sync_gmail_labels(cls, account_id: int, force: bool = True) -> List[Dict[str, Any]]:
        """Sincroniza todas las etiquetas (labels) de la cuenta de Gmail a la base de datos local."""
        import time
        now_ts = time.time()
        if not force and (now_ts - cls._last_labels_sync_by_acc.get(account_id, 0) < 300):
            conn = get_db()
            rows = conn.execute("SELECT id, remote_id, name, color, account_id FROM labels WHERE account_id = ?", (account_id,)).fetchall()
            conn.close()
            if rows:
                return [dict(r) for r in rows]

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
                    "SELECT id, name, color, local_modified FROM labels WHERE account_id = ? AND (remote_id = ? OR name = ?)",
                    (account_id, remote_id, name)
                ).fetchone()

                if existing:
                    # Respetar nombre y color personalizados en MerkeMail si local_modified == 1
                    if existing["local_modified"] == 1:
                        cursor.execute(
                            "UPDATE labels SET remote_id = ?, type = ? WHERE id = ?",
                            (remote_id, lbl_type, existing["id"])
                        )
                        name = existing["name"]
                        color = existing["color"]
                    else:
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

            # Etiquetas creadas en MerkeMail que aún no existen en Gmail -> crearlas allí
            try:
                cls.push_pending_local_labels(account_id)
            except Exception as push_err:
                print(f"Aviso enviando etiquetas locales pendientes a Gmail: {push_err}")

            cls._last_labels_sync_by_acc[account_id] = now_ts
            return saved_labels
        except Exception as e:
            print(f"Error sincronizando etiquetas Gmail: {e}")
            return []

    @classmethod
    def sync_gmail(cls, account_id: int, folder: Optional[str] = None, label_id: Optional[int] = None, max_results: int = 30, all_pages: bool = False, max_pages: int = 100) -> Dict[str, Any]:
        """Sincroniza correos usando la Gmail REST API oficial (OAuth2), prevaleciendo siempre los cambios locales de MerkeMail."""
        creds = cls.get_valid_credentials(account_id)
        service = build("gmail", "v1", credentials=creds)

        # 1. Sincronizar etiquetas con caché de 5 min para máxima velocidad
        cls.sync_gmail_labels(account_id, force=False)

        conn = get_db()
        acc = conn.execute("SELECT email FROM accounts WHERE id = ?", (account_id,)).fetchone()
        user_email = acc["email"] if acc else ""

        # Cargar UIDs eliminados en MerkeMail para jamás re-importarlos
        del_rows = conn.execute("SELECT uid FROM deleted_emails WHERE account_id = ?", (account_id,)).fetchall()
        deleted_uids = {r["uid"] for r in del_rows if r["uid"]}

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

        msg_ids = [m["id"] for m in messages if m.get("id") and m["id"] not in deleted_uids]
        if not msg_ids:
            conn.commit()
            conn.close()
            return {"success": True, "synced_count": 0}

        existing_rows = []
        chunk_size = 500
        for i in range(0, len(msg_ids), chunk_size):
            chunk = msg_ids[i:i + chunk_size]
            ph = ",".join("?" for _ in chunk)
            rows = conn.execute(
                f"SELECT id, uid, folder, is_read, is_starred, local_modified, updated_at FROM emails WHERE account_id = ? AND uid IN ({ph})",
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

        # 1. Descarga concurrente de mensajes nuevos con ThreadPoolExecutor (hasta 12 hilos)
        full_messages = {}
        if new_msg_ids:
            import concurrent.futures
            def fetch_full(mid):
                try:
                    s = get_thread_service()
                    return mid, s.users().messages().get(userId="me", id=mid, format="full").execute()
                except Exception:
                    return mid, None

            with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(new_msg_ids), 12)) as executor:
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
                except Exception:
                    return mid, None

            with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(existing_msg_ids), 12)) as executor:
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
                        snippet, body_text, body_html, date, is_read, is_starred, has_attachments, updated_at, local_modified
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                ''', (
                    account_id, msg_id, msg_folder, sender, recipient, subject,
                    snippet, body_text, body_html, date_val, is_read, is_starred, has_attachments, date_val
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

        # Etiquetas de usuario (con id remoto de ESTA cuenta) asignadas localmente a los correos existentes
        local_remote_labels_by_email: Dict[int, set] = {}
        existing_db_ids = [existing_by_uid[mid]["id"] for mid in existing_msg_ids]
        for i in range(0, len(existing_db_ids), 500):
            chunk = existing_db_ids[i:i + 500]
            ph = ",".join("?" for _ in chunk)
            for r in conn.execute(
                f"""SELECT el.email_id, l.remote_id FROM email_labels el JOIN labels l ON l.id = el.label_id
                    WHERE el.email_id IN ({ph}) AND l.account_id = ? AND l.remote_id IS NOT NULL AND l.remote_id != ''""",
                chunk + [account_id]
            ).fetchall():
                local_remote_labels_by_email.setdefault(r["email_id"], set()).add(r["remote_id"])

        # Procesar actualizaciones de mensajes existentes respetando Prioridad 1 (cambios en MerkeMail prevalecen)
        for msg_id in existing_msg_ids:
            min_data = minimal_messages.get(msg_id)
            if not min_data:
                continue

            existing = existing_by_uid[msg_id]
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

            # Si el correo fue modificado en MerkeMail (local_modified == 1), prevalece el estado local
            if existing.get("local_modified") == 1:
                add_lbls = []
                rem_lbls = []
                if existing["is_read"] != is_read:
                    if existing["is_read"] == 1:
                        rem_lbls.append("UNREAD")
                    else:
                        add_lbls.append("UNREAD")
                if existing["is_starred"] != is_starred:
                    if existing["is_starred"] == 1:
                        add_lbls.append("STARRED")
                    else:
                        rem_lbls.append("STARRED")
                if existing["folder"] != msg_folder:
                    if existing["folder"] == "TRASH":
                        add_lbls.append("TRASH")
                        if "INBOX" in msg_label_ids:
                            rem_lbls.append("INBOX")
                    elif existing["folder"] == "SPAM":
                        add_lbls.append("SPAM")
                        if "INBOX" in msg_label_ids:
                            rem_lbls.append("INBOX")
                    elif existing["folder"] == "ARCHIVE":
                        if "INBOX" in msg_label_ids:
                            rem_lbls.append("INBOX")
                    elif existing["folder"] == "INBOX":
                        add_lbls.append("INBOX")
                        for sys_rm in ("TRASH", "SPAM"):
                            if sys_rm in msg_label_ids:
                                rem_lbls.append(sys_rm)
                # Etiquetas de usuario: las asignadas en MerkeMail prevalecen y se envían a Gmail
                # (reintenta también envíos que fallaron al asignar/quitar la etiqueta)
                local_user = local_remote_labels_by_email.get(existing["id"], set())
                remote_user = {l for l in msg_label_ids if l in remote_to_local_label}
                add_lbls.extend(sorted(local_user - remote_user))
                rem_lbls.extend(sorted(remote_user - local_user))
                if add_lbls or rem_lbls:
                    threading.Thread(
                        target=cls.modify_message_labels,
                        args=(account_id, msg_id, add_lbls, rem_lbls),
                        daemon=True
                    ).start()
                continue

            # Prioridad 2: Si no fue modificado localmente, adoptar cambios del servidor
            if (existing["folder"] != msg_folder or 
                existing["is_read"] != is_read or 
                existing["is_starred"] != is_starred):
                
                conn.execute(
                    "UPDATE emails SET folder = ?, is_read = ?, is_starred = ? WHERE id = ?",
                    (msg_folder, is_read, is_starred, existing["id"])
                )

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
