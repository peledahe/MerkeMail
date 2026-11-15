from typing import Dict, Any, List, Optional
from datetime import datetime
import icalendar
from backend.database import get_db

class CalendarService:
    @staticmethod
    def get_calendars() -> List[Dict[str, Any]]:
        conn = get_db()
        rows = conn.execute("SELECT * FROM calendars ORDER BY id ASC").fetchall()
        conn.close()
        return [dict(r) for r in rows]

    @staticmethod
    def get_events(start_date: Optional[str] = None, end_date: Optional[str] = None) -> List[Dict[str, Any]]:
        conn = get_db()
        query = '''
            SELECT e.*, c.name as calendar_name, c.provider as calendar_provider, c.color as calendar_color
            FROM events e
            JOIN calendars c ON e.calendar_id = c.id
            WHERE c.is_visible = 1
        '''
        params = []
        if start_date and end_date:
            query += " AND e.start_time >= ? AND e.start_time <= ?"
            params.extend([start_date, end_date])
            
        query += " ORDER BY e.start_time ASC"
        rows = conn.execute(query, params).fetchall()
        conn.close()
        return [dict(r) for r in rows]

    @staticmethod
    def create_event(
        calendar_id: int, 
        title: str, 
        start_time: str, 
        end_time: str, 
        description: str = "", 
        location: str = "", 
        all_day: int = 0,
        origin_email_id: Optional[int] = None
    ) -> Dict[str, Any]:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO events (calendar_id, title, description, location, start_time, end_time, all_day, origin_email_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (calendar_id, title, description, location, start_time, end_time, all_day, origin_email_id))
        event_id = cursor.lastrowid
        conn.commit()
        
        row = conn.execute('''
            SELECT e.*, c.name as calendar_name, c.provider as calendar_provider, c.color as calendar_color
            FROM events e
            JOIN calendars c ON e.calendar_id = c.id
            WHERE e.id = ?
        ''', (event_id,)).fetchone()
        conn.close()
        return dict(row)

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
    def import_ics_data(calendar_id: int, ics_content: str) -> int:
        """Importa eventos desde formato iCalendar (ICS)."""
        conn = get_db()
        imported = 0
        try:
            cal = icalendar.Calendar.from_ical(ics_content)
            for component in cal.walk():
                if component.name == "VEVENT":
                    summary = str(component.get("summary", "Sin título"))
                    description = str(component.get("description", ""))
                    location = str(component.get("location", ""))
                    dtstart = component.get("dtstart")
                    dtend = component.get("dtend") or dtstart

                    start_iso = dtstart.dt.isoformat() if dtstart else datetime.now().isoformat()
                    end_iso = dtend.dt.isoformat() if dtend else start_iso

                    conn.execute('''
                        INSERT INTO events (calendar_id, title, description, location, start_time, end_time)
                        VALUES (?, ?, ?, ?, ?, ?)
                    ''', (calendar_id, summary, description, location, start_iso, end_iso))
                    imported += 1
            conn.commit()
        except Exception:
            pass
        finally:
            conn.close()
        return imported
