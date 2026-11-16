from typing import Dict, Any, List, Optional
from datetime import datetime
import icalendar
from backend.database import get_db

class CalendarService:
    @staticmethod
    def ensure_google_calendars():
        """Asegura que cada cuenta de Google activa tenga sus calendarios sincronizados y su calendario de Tareas."""
        conn = get_db()
        cursor = conn.cursor()
        
        # Purgar cualquier calendario que no sea de Google
        cursor.execute("DELETE FROM calendars WHERE provider != 'google'")

        # Obtener únicamente cuentas de Google activas
        accounts = cursor.execute("SELECT id, name, email, provider, color FROM accounts WHERE is_active = 1 AND provider IN ('google', 'gmail')").fetchall()
        
        for acc in accounts:
            acc_id = acc["id"]
            acc_name = acc["name"] or acc["email"].split("@")[0]
            acc_email = acc["email"]
            acc_color = acc["color"] or "#4f46e5"

            # Asegurar que la cuenta Google tenga al menos un calendario base si aún no existe ninguno
            has_cals = cursor.execute("SELECT COUNT(*) FROM calendars WHERE account_id = ?", (acc_id,)).fetchone()[0]
            if has_cals == 0:
                cal_title = f"Google Calendar ({acc_email})"
                cursor.execute(
                    "INSERT INTO calendars (name, provider, color, account_id, external_id, is_visible) VALUES (?, 'google', ?, ?, 'primary', 1)",
                    (cal_title, acc_color, acc_id)
                )

            # Asegurar calendario de Tareas (Google Tasks) para la cuenta
            task_cal = cursor.execute(
                "SELECT id FROM calendars WHERE account_id = ? AND (external_id = 'tasks_default' OR name LIKE 'Tareas%')",
                (acc_id,)
            ).fetchone()
            if not task_cal:
                cursor.execute(
                    "INSERT INTO calendars (name, provider, color, account_id, external_id, is_visible) VALUES (?, 'google', ?, ?, 'tasks_default', 1)",
                    ("Tareas", "#4285f4", acc_id)
                )
                task_cal_id = cursor.lastrowid
            else:
                task_cal_id = task_cal["id"]

            # Reasignar cualquier tarea que tenga calendar_id huérfano al calendario de Tareas
            cursor.execute(
                """
                UPDATE events 
                SET calendar_id = ?, account_id = ?
                WHERE (is_task = 1 OR title LIKE '[Tarea]%')
                  AND (account_id = ? OR account_id IS NULL)
                  AND (calendar_id IS NULL OR calendar_id NOT IN (SELECT id FROM calendars))
                """,
                (task_cal_id, acc_id, acc_id)
            )

        conn.commit()
        conn.close()

    @staticmethod
    def sync_account_calendars():
        """Asegura calendarios locales para cuentas de Google."""
        CalendarService.ensure_google_calendars()

    @staticmethod
    def get_calendars() -> List[Dict[str, Any]]:
        """Devuelve únicamente los calendarios sincronizados correspondientes a cuentas de Google activas."""
        conn = get_db()
        rows = conn.execute('''
            SELECT c.*, a.name as account_name, a.email as account_email, 
                   a.color as account_color, a.provider as account_provider, a.is_default as account_is_default
            FROM calendars c
            INNER JOIN accounts a ON c.account_id = a.id
            WHERE c.provider = 'google' AND a.provider IN ('google', 'gmail') AND a.is_active = 1
            ORDER BY COALESCE(a.is_default, 0) DESC, a.email ASC, c.name ASC
        ''').fetchall()
        conn.close()
        
        cals = []
        for r in rows:
            cal = dict(r)
            cal["effective_color"] = cal.get("color") or cal.get("account_color") or "#4f46e5"
            cals.append(cal)
            
        return cals

    @staticmethod
    def get_default_calendar_id() -> int:
        from backend.database import get_setting
        active_cals = CalendarService.get_calendars()
        valid_ids = [c["id"] for c in active_cals]
        
        def_raw = get_setting("default_calendar_id")
        if def_raw:
            try:
                def_id = int(def_raw)
                if def_id in valid_ids:
                    return def_id
            except (ValueError, TypeError):
                pass
        
        # Si no hay uno configurado explícitamente, preferir el calendario de la cuenta por defecto
        for c in active_cals:
            if c.get("account_is_default") == 1:
                return c["id"]

        return valid_ids[0] if valid_ids else 1

    @staticmethod
    def get_event_by_id(event_id: int) -> Optional[Dict[str, Any]]:
        conn = get_db()
        row = conn.execute('''
            SELECT e.*, c.name as calendar_name, c.provider as calendar_provider, c.color as calendar_color,
                   a.name as account_name, a.email as account_email, a.color as account_color
            FROM events e
            JOIN calendars c ON e.calendar_id = c.id
            LEFT JOIN accounts a ON a.id = COALESCE(e.account_id, c.account_id)
            WHERE e.id = ?
        ''', (event_id,)).fetchone()
        conn.close()
        if not row:
            return None
        ev = dict(row)
        ev["effective_color"] = ev.get("color") or ev.get("calendar_color") or ev.get("account_color") or "#4f46e5"
        return ev

    @staticmethod
    def get_events(start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict[str, Any]]:
        """Devuelve eventos de los calendarios activos, con fecha programada, excluyendo tareas sin fecha."""
        active_cals = CalendarService.get_calendars()
        if not active_cals:
            return []
            
        cal_ids = [c["id"] for c in active_cals]
        placeholders = ",".join("?" for _ in cal_ids)
        
        conn = get_db()
        query = f'''
            SELECT e.*, c.name as calendar_name, c.provider as calendar_provider, c.color as calendar_color,
                   a.name as account_name, a.email as account_email, a.color as account_color
            FROM events e
            JOIN calendars c ON e.calendar_id = c.id
            LEFT JOIN accounts a ON a.id = COALESCE(e.account_id, c.account_id)
            WHERE c.is_visible = 1 AND c.id IN ({placeholders})
              AND (e.start_time IS NOT NULL AND e.start_time != '')
        '''
        params = list(cal_ids)
        if start_date and end_date:
            query += " AND e.start_time >= ? AND e.start_time <= ?"
            params.extend([start_date, end_date])
            
        query += " ORDER BY e.start_time ASC"
        rows = conn.execute(query, params).fetchall()
        conn.close()

        result = []
        for r in rows:
            ev = dict(r)
            ev["effective_color"] = ev.get("color") or ev.get("calendar_color") or ev.get("account_color") or "#4f46e5"
            result.append(ev)
        return result

    @staticmethod
    def get_tasks(include_completed: bool = True) -> List[Dict[str, Any]]:
        """Devuelve las tareas (tasks) de los calendarios conectados, tanto con fecha como sin fecha."""
        active_cals = CalendarService.get_calendars()
        if not active_cals:
            return []
            
        cal_ids = [c["id"] for c in active_cals]
        placeholders = ",".join("?" for _ in cal_ids)

        conn = get_db()
        query = f'''
            SELECT e.*, c.name as calendar_name, c.provider as calendar_provider, c.color as calendar_color,
                   a.name as account_name, a.email as account_email, a.color as account_color
            FROM events e
            JOIN calendars c ON e.calendar_id = c.id
            LEFT JOIN accounts a ON a.id = COALESCE(e.account_id, c.account_id)
            WHERE c.is_visible = 1 AND c.id IN ({placeholders})
              AND (e.is_task = 1 OR e.title LIKE '[Tarea]%' OR e.start_time = '' OR e.start_time IS NULL)
        '''
        params = list(cal_ids)
        if not include_completed:
            query += " AND (e.is_completed = 0 OR e.is_completed IS NULL)"
        query += " ORDER BY e.is_completed ASC, e.id DESC"
        rows = conn.execute(query, params).fetchall()
        conn.close()

        tasks = []
        for r in rows:
            t = dict(r)
            t["effective_color"] = t.get("color") or t.get("calendar_color") or t.get("account_color") or "#4f46e5"
            tasks.append(t)
        return tasks

    @staticmethod
    def toggle_task(task_id: int) -> Optional[Dict[str, Any]]:
        """Marca una tarea como completada o pendiente de inmediato localmente y sincroniza en segundo plano."""
        import threading
        conn = get_db()
        row = conn.execute('''
            SELECT e.is_completed, e.external_id, c.account_id, c.external_id as cal_ext_id 
            FROM events e
            LEFT JOIN calendars c ON e.calendar_id = c.id
            WHERE e.id = ?
        ''', (task_id,)).fetchone()
        if not row:
            conn.close()
            return None
        current_val = row["is_completed"] or 0
        new_val = 0 if current_val == 1 else 1
        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        conn.execute(
            "UPDATE events SET is_completed = ?, updated_at = ?, local_modified = 1 WHERE id = ?",
            (new_val, now_iso, task_id)
        )
        conn.commit()
        ext_id = row["external_id"]
        cal_ext_id = row["cal_ext_id"]
        acc_id = row["account_id"]
        conn.close()

        # Si pertenece a Google Tasks, propagar el cambio en segundo plano
        if ext_id and cal_ext_id and str(cal_ext_id).startswith("tasks_list_") and acc_id:
            def _bg_toggle():
                try:
                    from backend.google_oauth import GoogleOAuthService
                    tl_id = str(cal_ext_id).replace("tasks_list_", "")
                    GoogleOAuthService.toggle_google_task(acc_id, tl_id, ext_id, bool(new_val == 1))
                except Exception as e:
                    print(f"[CalendarService] Error notificando toggle a Google Tasks en background: {e}")
            threading.Thread(target=_bg_toggle, daemon=True).start()

        return CalendarService.get_event_by_id(task_id)

    @staticmethod
    def create_event(
        calendar_id: Optional[int] = None, 
        title: str = "", 
        start_time: str = "", 
        end_time: str = "", 
        description: str = "", 
        location: str = "", 
        all_day: int = 0,
        origin_email_id: Optional[int] = None,
        is_task: int = 0,
        account_id: Optional[int] = None,
        meeting_url: Optional[str] = "",
        color: Optional[str] = "",
        recurrence: Optional[str] = "none",
        notification_minutes: Optional[int] = 10,
        attendees: Optional[str] = "",
        availability: Optional[str] = "busy",
        visibility: Optional[str] = "default"
    ) -> Dict[str, Any]:
        import threading
        active_cals = CalendarService.get_calendars()
        valid_ids = [c["id"] for c in active_cals]
        default_id = CalendarService.get_default_calendar_id()

        if calendar_id and calendar_id in valid_ids:
            target_cal_id = calendar_id
        elif default_id in valid_ids:
            target_cal_id = default_id
        else:
            target_cal_id = valid_ids[0] if valid_ids else 1

        # Detectar si el título indica que es tarea
        if title.lower().startswith("[tarea]"):
            is_task = 1

        conn = get_db()
        cursor = conn.cursor()
        cal_meta = cursor.execute("SELECT provider, account_id, external_id FROM calendars WHERE id = ?", (target_cal_id,)).fetchone()
        cal_provider = cal_meta["provider"] if cal_meta else None
        cal_acc_id = cal_meta["account_id"] if cal_meta else account_id
        cal_ext_id = cal_meta["external_id"] if cal_meta else None

        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

        cursor.execute('''
            INSERT INTO events (
                calendar_id, title, description, location, start_time, end_time, 
                all_day, origin_email_id, is_task, account_id, meeting_url, color,
                recurrence, notification_minutes, attendees, availability, visibility,
                external_id, updated_at, local_modified
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 1)
        ''', (
            target_cal_id, title, description or "", location or "", start_time, end_time, 
            all_day, origin_email_id, is_task, account_id or cal_acc_id, meeting_url or "", color or "",
            recurrence or "none", notification_minutes if notification_minutes is not None else 10,
            attendees or "", availability or "busy", visibility or "default", now_iso
        ))
        event_id = cursor.lastrowid
        conn.commit()
        conn.close()

        # Propagar en segundo plano a Google Calendar o Google Tasks sin bloquear la respuesta
        if cal_provider == "google" and cal_acc_id:
            def _bg_create():
                try:
                    from backend.google_oauth import GoogleOAuthService
                    ext_ev_id = None
                    if is_task or (cal_ext_id and str(cal_ext_id).startswith("tasks_")):
                        tl_id = str(cal_ext_id).replace("tasks_list_", "") if (cal_ext_id and str(cal_ext_id).startswith("tasks_list_")) else "@default"
                        ext_ev_id = GoogleOAuthService.create_google_task(
                            account_id=cal_acc_id,
                            tasklist_id=tl_id,
                            task_data={
                                "title": title.replace("[Tarea]", "").strip() or title,
                                "notes": description,
                                "due": start_time
                            }
                        )
                    else:
                        ext_ev_id = GoogleOAuthService.create_google_event(
                            account_id=cal_acc_id,
                            ext_calendar_id=cal_ext_id,
                            event_data={
                                "title": title,
                                "description": description,
                                "location": location,
                                "start_time": start_time,
                                "end_time": end_time,
                                "all_day": all_day
                            }
                        )
                    if ext_ev_id:
                        bg_conn = get_db()
                        bg_conn.execute("UPDATE events SET external_id = ? WHERE id = ?", (ext_ev_id, event_id))
                        bg_conn.commit()
                        bg_conn.close()
                except Exception as e:
                    print(f"[CalendarService] Aviso propagando creación en background: {e}")

            threading.Thread(target=_bg_create, daemon=True).start()
        
        return CalendarService.get_event_by_id(event_id)

    @staticmethod
    def update_event(
        event_id: int,
        calendar_id: Optional[int] = None, 
        title: Optional[str] = None, 
        start_time: Optional[str] = None, 
        end_time: Optional[str] = None, 
        description: Optional[str] = None, 
        location: Optional[str] = None, 
        all_day: Optional[int] = None,
        is_task: Optional[int] = None,
        account_id: Optional[int] = None,
        meeting_url: Optional[str] = None,
        color: Optional[str] = None,
        recurrence: Optional[str] = None,
        notification_minutes: Optional[int] = None,
        attendees: Optional[str] = None,
        availability: Optional[str] = None,
        visibility: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        import threading
        conn = get_db()
        cursor = conn.cursor()
        row = cursor.execute('''
            SELECT e.*, c.provider as cal_provider, c.account_id as cal_account_id, c.external_id as cal_external_id 
            FROM events e
            LEFT JOIN calendars c ON e.calendar_id = c.id
            WHERE e.id = ?
        ''', (event_id,)).fetchone()
        if not row:
            conn.close()
            return None

        now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

        # Construir campos a actualizar con prioridad local (local_modified = 1)
        updates = ["updated_at = ?", "local_modified = 1"]
        params = [now_iso]
        fields = {
            "calendar_id": calendar_id,
            "title": title,
            "start_time": start_time,
            "end_time": end_time,
            "description": description,
            "location": location,
            "all_day": all_day,
            "is_task": is_task,
            "account_id": account_id,
            "meeting_url": meeting_url,
            "color": color,
            "recurrence": recurrence,
            "notification_minutes": notification_minutes,
            "attendees": attendees,
            "availability": availability,
            "visibility": visibility
        }

        for k, v in fields.items():
            if v is not None:
                updates.append(f"{k} = ?")
                params.append(v)

        params.append(event_id)
        query = f"UPDATE events SET {', '.join(updates)} WHERE id = ?"
        cursor.execute(query, params)
        conn.commit()
        row_dict = dict(row)
        conn.close()

        # Propagar actualización en segundo plano a Google Calendar / Tasks
        if row_dict.get("cal_provider") == "google" and row_dict.get("external_id") and row_dict.get("cal_account_id"):
            def _bg_update():
                try:
                    from backend.google_oauth import GoogleOAuthService
                    cal_ext = str(row_dict.get("cal_external_id") or "")
                    if row_dict.get("is_task") or cal_ext.startswith("tasks_"):
                        tl_id = cal_ext.replace("tasks_list_", "") if cal_ext.startswith("tasks_list_") else "@default"
                        GoogleOAuthService.update_google_task(
                            account_id=row_dict["cal_account_id"],
                            tasklist_id=tl_id,
                            ext_task_id=row_dict["external_id"],
                            task_data={
                                "title": (title if title is not None else row_dict.get("title", "")).replace("[Tarea]", "").strip(),
                                "notes": description if description is not None else row_dict.get("description", ""),
                                "due": start_time if start_time is not None else row_dict.get("start_time", "")
                            }
                        )
                    else:
                        up_data = {}
                        if title is not None: up_data["title"] = title
                        if description is not None: up_data["description"] = description
                        if location is not None: up_data["location"] = location
                        if start_time is not None: up_data["start_time"] = start_time
                        if end_time is not None: up_data["end_time"] = end_time
                        if all_day is not None: up_data["all_day"] = all_day
                        GoogleOAuthService.update_google_event(
                            account_id=row_dict["cal_account_id"],
                            ext_calendar_id=row_dict["cal_external_id"],
                            ext_event_id=row_dict["external_id"],
                            event_data=up_data
                        )
                except Exception as e:
                    print(f"[CalendarService] Aviso actualizando evento/tarea en background: {e}")

            threading.Thread(target=_bg_update, daemon=True).start()

        return CalendarService.get_event_by_id(event_id)

    @staticmethod
    def create_task(
        calendar_id: Optional[int] = None,
        title: str = "",
        description: str = "",
        due_date: str = "",
        account_id: Optional[int] = None
    ) -> Dict[str, Any]:
        """Crea una tarea explícita (con o sin fecha)."""
        clean_title = title if title.startswith("[Tarea]") else f"[Tarea] {title}"
        return CalendarService.create_event(
            calendar_id=calendar_id,
            title=clean_title,
            start_time=due_date or "",
            end_time=due_date or "",
            description=description,
            is_task=1,
            account_id=account_id
        )

    @staticmethod
    def delete_event(event_id: int) -> bool:
        import threading
        conn = get_db()
        cursor = conn.cursor()
        ev_meta = cursor.execute('''
            SELECT e.external_id, e.is_task, e.account_id as ev_acc_id,
                   c.provider as cal_provider, c.account_id as cal_account_id, c.external_id as cal_external_id 
            FROM events e
            LEFT JOIN calendars c ON e.calendar_id = c.id
            WHERE e.id = ?
        ''', (event_id,)).fetchone()

        meta_dict = dict(ev_meta) if ev_meta else None
        if meta_dict and meta_dict.get("external_id"):
            acc_id = meta_dict.get("cal_account_id") or meta_dict.get("ev_acc_id") or 0
            # Registrar en deleted_events para que la eliminación local prevalezca siempre sobre el servidor
            cursor.execute('''
                INSERT INTO deleted_events (account_id, external_id, deleted_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(account_id, external_id) DO UPDATE SET deleted_at = CURRENT_TIMESTAMP
            ''', (acc_id, meta_dict["external_id"]))

        cursor.execute("DELETE FROM events WHERE id = ?", (event_id,))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()

        if meta_dict and meta_dict.get("cal_provider") == "google" and meta_dict.get("external_id") and meta_dict.get("cal_account_id"):
            def _bg_delete():
                try:
                    from backend.google_oauth import GoogleOAuthService
                    cal_ext = str(meta_dict.get("cal_external_id") or "")
                    if meta_dict.get("is_task") or cal_ext.startswith("tasks_"):
                        tl_id = cal_ext.replace("tasks_list_", "") if cal_ext.startswith("tasks_list_") else "@default"
                        GoogleOAuthService.delete_google_task(
                            account_id=meta_dict["cal_account_id"],
                            tasklist_id=tl_id,
                            ext_task_id=meta_dict["external_id"]
                        )
                    else:
                        GoogleOAuthService.delete_google_event(
                            account_id=meta_dict["cal_account_id"],
                            ext_calendar_id=meta_dict["cal_external_id"],
                            ext_event_id=meta_dict["external_id"]
                        )
                except Exception as e:
                    print(f"[CalendarService] Aviso eliminando evento/tarea en background: {e}")

            threading.Thread(target=_bg_delete, daemon=True).start()

        return deleted

    @staticmethod
    def import_ics(file_content: str, calendar_id: int) -> int:
        cal = icalendar.Calendar.from_ical(file_content)
        conn = get_db()
        cursor = conn.cursor()
        count = 0
        for component in cal.walk():
            if component.name == "VEVENT":
                title = str(component.get('summary', 'Sin Título'))
                desc = str(component.get('description', ''))
                loc = str(component.get('location', ''))
                start = component.get('dtstart').dt.isoformat()
                end = component.get('dtend').dt.isoformat() if component.get('dtend') else start
                
                cursor.execute('''
                    INSERT INTO events (calendar_id, title, description, location, start_time, end_time)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (calendar_id, title, desc, loc, start, end))
                count += 1
        conn.commit()
        conn.close()
        return count
