from typing import Dict, Any, List, Optional
from datetime import datetime
import icalendar
from backend.database import get_db

class CalendarService:
    @staticmethod
    def sync_account_calendars():
        """Sincroniza y crea calendarios para todas las cuentas conectadas que lo permitan."""
        conn = get_db()
        cursor = conn.cursor()
        
        accounts = cursor.execute("SELECT id, name, email, provider, color FROM accounts WHERE is_active = 1").fetchall()
        
        for acc in accounts:
            acc_id = acc["id"]
            prov = (acc["provider"] or "").lower()
            acc_name = acc["name"] or acc["email"].split("@")[0]
            acc_email = acc["email"]
            acc_color = acc["color"] or "#4f46e5"
            
            # Si es cuenta de Google, intentar sincronizar con Google Calendar API si está disponible
            if prov in ("google", "gmail"):
                synced_from_api = False
                try:
                    from backend.google_oauth import GoogleOAuthService
                    from googleapiclient.discovery import build
                    creds = GoogleOAuthService.get_valid_credentials(acc_id)
                    if creds:
                        service = build('calendar', 'v3', credentials=creds)
                        cal_list = service.calendarList().list().execute()
                        items = cal_list.get('items', [])
                        if items:
                            for item in items:
                                ext_id = item.get('id')
                                is_primary = item.get('primary', False)
                                summary = item.get('summary') or ("Google Calendar" if is_primary else ext_id)
                                cal_title = f"{summary} ({acc_email})" if is_primary else f"{summary} ({acc_name})"
                                cal_color = item.get('backgroundColor') or acc_color
                                
                                existing = cursor.execute(
                                    "SELECT id FROM calendars WHERE account_id = ? AND (external_id = ? OR name = ?)",
                                    (acc_id, ext_id, cal_title)
                                ).fetchone()
                                if existing:
                                    cursor.execute(
                                        "UPDATE calendars SET name = ?, color = ?, provider = 'google', external_id = ? WHERE id = ?",
                                        (cal_title, cal_color, ext_id, existing["id"])
                                    )
                                else:
                                    cursor.execute(
                                        "INSERT INTO calendars (name, provider, color, account_id, external_id) VALUES (?, 'google', ?, ?, ?)",
                                        (cal_title, cal_color, acc_id, ext_id)
                                    )
                            synced_from_api = True
                except Exception:
                    pass
                
                if not synced_from_api:
                    # Asegurar que la cuenta Google tenga al menos un calendario
                    existing = cursor.execute(
                        "SELECT id FROM calendars WHERE account_id = ? OR (id = 1 AND account_id IS NULL)", 
                        (acc_id,)
                    ).fetchone()
                    cal_title = f"Google Calendar ({acc_email})"
                    if existing:
                        cursor.execute(
                            "UPDATE calendars SET name = ?, provider = 'google', color = ?, account_id = ?, external_id = 'primary' WHERE id = ?",
                            (cal_title, acc_color, acc_id, existing["id"])
                        )
                    else:
                        cursor.execute(
                            "INSERT INTO calendars (name, provider, color, account_id, external_id) VALUES (?, 'google', ?, ?, 'primary')",
                            (cal_title, acc_color, acc_id)
                        )
            
            elif prov == "proton":
                existing = cursor.execute(
                    "SELECT id FROM calendars WHERE account_id = ? OR (id = 2 AND account_id IS NULL)", 
                    (acc_id,)
                ).fetchone()
                cal_title = f"Proton Calendar ({acc_email})"
                if existing:
                    cursor.execute(
                        "UPDATE calendars SET name = ?, provider = 'proton', color = ?, account_id = ? WHERE id = ?",
                        (cal_title, acc_color, acc_id, existing["id"])
                    )
                else:
                    cursor.execute(
                        "INSERT INTO calendars (name, provider, color, account_id) VALUES (?, 'proton', ?, ?)",
                        (cal_title, acc_color, acc_id)
                    )
            
            else: # custom o cualquier otro proveedor que permita calendario
                existing = cursor.execute(
                    "SELECT id FROM calendars WHERE account_id = ?", 
                    (acc_id,)
                ).fetchone()
                cal_title = f"Calendario ({acc_name})"
                if existing:
                    cursor.execute(
                        "UPDATE calendars SET name = ?, provider = ?, color = ? WHERE id = ?",
                        (cal_title, prov or "custom", acc_color, existing["id"])
                    )
                else:
                    cursor.execute(
                        "INSERT INTO calendars (name, provider, color, account_id) VALUES (?, ?, ?, ?)",
                        (cal_title, prov or "custom", acc_color, acc_id)
                    )
                    
        conn.commit()
        conn.close()

    @staticmethod
    def get_calendars() -> List[Dict[str, Any]]:
        """Devuelve todos los calendarios sincronizados correspondientes a las cuentas conectadas y locales."""
        CalendarService.sync_account_calendars()
        conn = get_db()
        rows = conn.execute('''
            SELECT c.*, a.name as account_name, a.email as account_email, 
                   a.color as account_color, a.provider as account_provider, a.is_default as account_is_default
            FROM calendars c
            LEFT JOIN accounts a ON c.account_id = a.id
            WHERE (c.account_id IS NOT NULL AND a.id IS NOT NULL) OR c.provider = 'local'
            ORDER BY COALESCE(a.is_default, 0) DESC, c.id ASC
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
        """Marca una tarea como completada o pendiente."""
        conn = get_db()
        row = conn.execute("SELECT is_completed FROM events WHERE id = ?", (task_id,)).fetchone()
        if not row:
            conn.close()
            return None
        current_val = row["is_completed"] or 0
        new_val = 0 if current_val == 1 else 1
        conn.execute("UPDATE events SET is_completed = ? WHERE id = ?", (new_val, task_id))
        conn.commit()
        conn.close()
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
        cursor.execute('''
            INSERT INTO events (
                calendar_id, title, description, location, start_time, end_time, 
                all_day, origin_email_id, is_task, account_id, meeting_url, color,
                recurrence, notification_minutes, attendees, availability, visibility
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            target_cal_id, title, description or "", location or "", start_time, end_time, 
            all_day, origin_email_id, is_task, account_id, meeting_url or "", color or "",
            recurrence or "none", notification_minutes if notification_minutes is not None else 10,
            attendees or "", availability or "busy", visibility or "default"
        ))
        event_id = cursor.lastrowid
        conn.commit()
        conn.close()
        
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
        conn = get_db()
        cursor = conn.cursor()
        row = cursor.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        if not row:
            conn.close()
            return None

        # Construir campos a actualizar
        updates = []
        params = []
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

        if updates:
            params.append(event_id)
            query = f"UPDATE events SET {', '.join(updates)} WHERE id = ?"
            cursor.execute(query, params)
            conn.commit()
        conn.close()
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
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM events WHERE id = ?", (event_id,))
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
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
