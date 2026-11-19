#!/usr/bin/env python3
"""
MerkeMail - fictitious calendar / tasks generator for testing.

Creates test data for the Calendar view of the **Google accounts only** (the app only shows
Google calendars): events from N months before today to N months after today (default 2/2),
extra sub-calendars and Google-Tasks-style task lists per account (a different number for
each account), and varied tasks, including tasks WITHOUT due date for the "Tareas" panel.

Profiles (same rule as tests/generate_test_emails.py):
  * 1st Gmail account  -> work:     primary + 5 sub-calendars (Equipo MerkeMail, Clientes,
                                     Guardias y despliegues, Días festivos en México, Cumpleaños)
                                     + 3 task lists (Mis tareas, Sprint, Ideas y backlog)
  * 2nd+ Gmail account -> personal: primary + 3 sub-calendars (Entrenamiento 10K, Familia,
                                     Diplomado Ciencia de Datos) + 2 task lists (Mis tareas, Compras)
The auto-created "Tareas" list of each account also gets a few locally-created "[Tarea]" tasks.

Everything is stored in the same shape the app uses (naive local times "YYYY-MM-DDTHH:MM:SS",
all-day = T00:00:00..T23:59:59, tasks without due date = start_time ''), recurring meetings are
stored one row per occurrence (as the Google sync does with singleEvents=True) with the
recurrence badge set. Some events/tasks are linked to the generated test emails (origin_email_id),
with dates taken from the email text (invitation, deploy window, dentist appointment, 10K race...).

Every generated event/task has external_id 'seed-...' and every generated calendar an external_id
containing 'seed-': the app never uploads them to Google (the sync only uploads rows without
external_id) and they can be removed without touching anything else.

Usage (from the `proyecto/` folder; run it AFTER generating the test mail so links resolve):
    .venv/bin/python tests/generate_test_calendar.py                 # 2 months back + 2 ahead
    .venv/bin/python tests/generate_test_calendar.py --reset         # regenerate
    .venv/bin/python tests/generate_test_calendar.py --purge         # remove calendar test data
    .venv/bin/python tests/generate_test_calendar.py --dry-run
    .venv/bin/python tests/generate_test_calendar.py --months-back 3 --months-ahead 1
"""

from __future__ import annotations

import argparse
import calendar as pycal
import random
import re
import sqlite3
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

sys.path.insert(0, str(Path(__file__).resolve().parent))
from generate_test_emails import DEFAULT_DB, MESES, connect, load_accounts, Account  # noqa: E402

SEED = "seed-"
MEET = "https://meet.google.com/{}"
# Google Calendar palette (backgroundColor values the Google API returns)
G_COLORS = {"tomato": "#d50000", "flamingo": "#e67c73", "tangerine": "#f4511e", "banana": "#f6bf26",
            "sage": "#33b679", "basil": "#0b8043", "peacock": "#039be5", "blueberry": "#3f51b5",
            "lavender": "#7986cb", "grape": "#8e24aa", "graphite": "#616161"}


def add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    y += d.year
    m += 1
    return date(y, m, min(d.day, pycal.monthrange(y, m)[1]))


def nth_weekday(year: int, month: int, weekday: int, n: int) -> date:
    d = date(year, month, 1)
    d += timedelta(days=(weekday - d.weekday()) % 7)
    return d + timedelta(weeks=n - 1)


def mexican_holidays(year: int) -> List[Tuple[date, str]]:
    """Official holidays + observances, like Google's 'Días festivos en México' calendar."""
    return [
        (date(year, 1, 1), "Año Nuevo"), (date(year, 1, 6), "Día de Reyes"),
        (nth_weekday(year, 2, 0, 1), "Día de la Constitución (descanso)"), (date(year, 2, 14), "Día de San Valentín"),
        (nth_weekday(year, 3, 0, 3), "Natalicio de Benito Juárez (descanso)"), (date(year, 5, 1), "Día del Trabajo"),
        (date(year, 5, 10), "Día de las Madres"), (date(year, 9, 16), "Día de la Independencia"),
        (date(year, 10, 12), "Día de la Raza"), (date(year, 11, 1), "Día de Todos los Santos"),
        (date(year, 11, 2), "Día de Muertos"), (nth_weekday(year, 11, 0, 3), "Día de la Revolución (descanso)"),
        (date(year, 12, 12), "Día de la Virgen de Guadalupe"), (date(year, 12, 24), "Nochebuena"),
        (date(year, 12, 25), "Navidad"), (date(year, 12, 31), "Fin de Año"),
    ]


def parse_fecha(text: str, ref: date) -> Optional[date]:
    """'martes 24 de noviembre' / '24 de noviembre' -> date closest to `ref` (year inferred)."""
    m = re.search(r"(\d{1,2}) de (" + "|".join(MESES) + r")", (text or "").lower())
    if not m:
        return None
    day, month = int(m.group(1)), MESES.index(m.group(2)) + 1
    cands = []
    for y in (ref.year - 1, ref.year, ref.year + 1):
        try:
            cands.append(date(y, month, day))
        except ValueError:
            pass
    return min(cands, key=lambda c: abs((c - ref).days)) if cands else None


def parse_horas(text: str) -> List[time]:
    return [time(int(h), int(mi)) for h, mi in re.findall(r"\b(\d{1,2}):(\d{2})\b", text or "") if int(h) < 24]


def next_dow(d: date, weekday: int, include_today: bool = False) -> date:
    delta = (weekday - d.weekday()) % 7
    if delta == 0 and not include_today:
        delta = 7
    return d + timedelta(days=delta)


@dataclass
class Cal:
    key: str
    name: str
    color: str
    external_id: str
    existing_id: Optional[int] = None  # primary / tasks_default already created by the app
    is_task_list: bool = False


@dataclass
class Item:
    cal_key: str
    title: str
    start_time: str
    end_time: str
    all_day: int = 0
    is_task: int = 0
    is_completed: int = 0
    description: str = ""
    location: str = ""
    meeting_url: str = ""
    attendees: str = ""
    color: str = ""
    recurrence: str = "none"
    notification_minutes: int = 10
    availability: str = "busy"
    visibility: str = "default"
    origin_email_id: Optional[int] = None
    meta: Dict[str, str] = field(default_factory=dict)


class CalendarGenerator:
    def __init__(self, rng: random.Random, conn: sqlite3.Connection, acc: Account, today: date, now: datetime,
                 first: date, last: date):
        self.rng, self.conn, self.acc = rng, conn, acc
        self.today, self.now, self.first, self.last = today, now, first, last
        self.cals: Dict[str, Cal] = {}
        self.items: List[Item] = []
        self.blocked: set = set()  # days without routine meetings (holidays, vacation)

    # ------------------------------------------------------------------ helpers
    def days(self) -> List[date]:
        return [self.first + timedelta(days=i) for i in range((self.last - self.first).days + 1)]

    def in_window(self, d: date) -> bool:
        return self.first <= d <= self.last

    def meet(self) -> str:
        r = self.rng
        code = "".join(r.choice("abcdefghijkmnopqrstuvwxyz") for _ in range(10))
        return MEET.format(f"{code[:3]}-{code[3:7]}-{code[7:]}")

    def add_cal(self, key: str, name: str, color: str, slug: str, task_list: bool = False) -> None:
        ext = f"tasks_list_{SEED}{self.acc.id}-{slug}" if task_list else f"{SEED}{self.acc.id}-{slug}@group.calendar.google.com"
        if slug == "holidays":
            ext = f"{SEED}{self.acc.id}-es.mexican#holiday@group.v.calendar.google.com"
        self.cals[key] = Cal(key, name, color, ext, is_task_list=task_list)

    def use_existing(self, key: str, external_id: str) -> None:
        row = self.conn.execute("SELECT id, name, color FROM calendars WHERE account_id = ? AND external_id = ? ORDER BY id LIMIT 1",
                                (self.acc.id, external_id)).fetchone()
        if row:
            self.cals[key] = Cal(key, row["name"], row["color"], external_id, existing_id=row["id"],
                                 is_task_list=(external_id == "tasks_default"))
        else:  # same thing the app's CalendarService.ensure_google_calendars() would create
            name = f"Google Calendar ({self.acc.email})" if external_id == "primary" else "Tareas"
            color = "#4285f4" if external_id == "tasks_default" else "#4f46e5"
            self.cals[key] = Cal(key, name, color, external_id, is_task_list=(external_id == "tasks_default"))

    def email_id(self, subject_like: str, body_like: Optional[str] = None, include_spam: bool = False) -> Optional[sqlite3.Row]:
        q = ("SELECT id, subject, body_text, date, folder FROM emails WHERE account_id = ? AND subject LIKE ? "
             "AND folder NOT IN ('TRASH'" + ("" if include_spam else ", 'SPAM'") + ")")
        params: List = [self.acc.id, subject_like]
        if body_like:
            q += " AND body_text LIKE ?"
            params.append(body_like)
        return self.conn.execute(q + " ORDER BY date ASC LIMIT 1", params).fetchone()

    def email_any_account(self, subject_like: str) -> Optional[sqlite3.Row]:
        return self.conn.execute("SELECT id, subject, body_text, date, account_id FROM emails WHERE subject LIKE ? "
                                 "ORDER BY date ASC LIMIT 1", (subject_like,)).fetchone()

    @staticmethod
    def email_date(row) -> date:
        return datetime.fromisoformat(str(row["date"]).replace("Z", "+00:00").replace(" ", "T")).date()

    # ------------------------------------------------------------------ builders
    def event(self, cal: str, title: str, d: date, start: str, minutes: int, **kw) -> Optional[Item]:
        if not self.in_window(d):
            return None
        h, m = map(int, start.split(":"))
        s = datetime.combine(d, time(h, m))
        e = s + timedelta(minutes=minutes)
        it = Item(cal, title, s.strftime("%Y-%m-%dT%H:%M:%S"), e.strftime("%Y-%m-%dT%H:%M:%S"), **kw)
        return self._append(it)

    def _append(self, it: Item) -> Optional[Item]:
        if any(o.cal_key == it.cal_key and o.title == it.title and o.start_time == it.start_time for o in self.items):
            return None  # exact duplicate (e.g. two random client meetings on the same slot)
        self.items.append(it)
        return it

    def allday(self, cal: str, title: str, d: date, d_end: Optional[date] = None, **kw) -> Optional[Item]:
        if not self.in_window(d):
            return None
        kw.setdefault("notification_minutes", 1440)
        it = Item(cal, title, f"{d:%Y-%m-%d}T00:00:00", f"{(d_end or d):%Y-%m-%d}T23:59:59", all_day=1, **kw)
        return self._append(it)

    def series(self, cal: str, title: str, weekdays: Sequence[int], start: str, minutes: int, recurrence: str,
               every_weeks: int = 1, anchor: Optional[date] = None, skip_p: float = 0.0,
               until: Optional[date] = None, since: Optional[date] = None, **kw) -> int:
        """One row per occurrence (what Google's singleEvents expansion gives), skipping blocked days."""
        n = 0
        anchor = anchor or self.first
        for d in self.days():
            if d.weekday() not in weekdays or d in self.blocked:
                continue
            if until and d > until or since and d < since:
                continue
            if every_weeks > 1 and ((d - anchor).days // 7) % every_weeks:
                continue
            if skip_p and self.rng.random() < skip_p:
                continue  # cancelled that week
            if self.event(cal, title, d, start, minutes, recurrence=recurrence, **kw):
                n += 1
        return n

    def task(self, lst: str, title: str, due: Optional[date], done: Optional[bool] = None, **kw) -> Optional[Item]:
        """Google-Tasks-style task. `due=None` -> no due date (only in the 'Tareas' panel)."""
        if due is not None and not self.in_window(due):
            return None
        if done is None:
            if due is None:
                done = self.rng.random() < 0.25
            elif due < self.today:
                done = self.rng.random() < 0.85
            else:
                done = self.rng.random() < 0.1
        st = f"{due:%Y-%m-%d}T00:00:00" if due else ""
        kw.setdefault("notification_minutes", 0 if not due else 1440)
        it = Item(lst, title, st, st, is_task=1, is_completed=1 if done else 0, **kw)
        self.items.append(it)
        return it

    def block_holidays(self) -> List[Tuple[date, str]]:
        hol = []
        for y in range(self.first.year, self.last.year + 1):
            hol += [(d, n) for d, n in mexican_holidays(y) if self.in_window(d)]
        official = ("Año Nuevo", "Constitución", "Juárez", "Trabajo", "Independencia", "Revolución", "Navidad")
        self.blocked |= {d for d, n in hol if any(o in n for o in official)}
        return hol

    # ================================================================== WORK profile
    def gen_work(self) -> None:
        r, today = self.rng, self.today
        team = ["smartinez@empresa.com", "crivera@empresa.com", "lfernandez@empresa.com", "dherrera@empresa.com",
                "vrojas@empresa.com"]
        self.use_existing("primary", "primary")
        self.use_existing("tareas", "tasks_default")
        self.add_cal("equipo", "Equipo MerkeMail", G_COLORS["peacock"], "equipo-merkemail")
        self.add_cal("clientes", "Clientes", G_COLORS["banana"], "clientes")
        self.add_cal("guardias", "Guardias y despliegues", G_COLORS["tomato"], "guardias")
        self.add_cal("festivos", "Días festivos en México", G_COLORS["basil"], "holidays")
        self.add_cal("cumples", "Cumpleaños", G_COLORS["grape"], "cumpleanos")
        self.add_cal("t_mis", "Tareas (Mis tareas)", self.acc_color(), "mis-tareas", task_list=True)
        sprint_no = 24 + max(0, (today - date(2026, 10, 5)).days // 14)
        self.add_cal("t_sprint", f"Tareas (Sprint {sprint_no})", self.acc_color(), "sprint", task_list=True)
        self.add_cal("t_ideas", "Tareas (Ideas y backlog)", self.acc_color(), "backlog", task_list=True)

        # --- holidays & vacation (also block routine meetings) -------------------------
        for d, name in self.block_holidays():
            self.allday("festivos", name, d, availability="free", visibility="public", notification_minutes=0,
                        description="Días festivos y celebraciones en México.")
        vac = self.email_id("Solicitud de vacaciones:%")
        v_from, v_to = date(today.year, 12, 21), date(today.year, 12, 31)
        if today.month < 6:  # window around the new year -> the previous December
            v_from, v_to = date(today.year - 1, 12, 21), date(today.year - 1, 12, 31)
        if vac:
            m = re.search(r"(\d{1,2}) al (\d{1,2}) de (" + "|".join(MESES) + ")", vac["subject"].lower())
            ref = self.email_date(vac)
            if m:
                d1 = parse_fecha(f"{m.group(1)} de {m.group(3)}", ref)
                if d1:
                    v_from, v_to = d1, d1.replace(day=int(m.group(2)))
        self.allday("primary", "Vacaciones 🌴 (fuera de la oficina)", v_from, v_to, availability="busy",
                    description="Fuera de la oficina. Para temas urgentes contactar a Sofia Martinez.",
                    origin_email_id=vac["id"] if vac else None, recurrence="none")
        self.blocked |= {v_from + timedelta(days=i) for i in range((v_to - v_from).days + 1)}

        # --- team routines ----------------------------------------------------------------
        self.series("equipo", "Daily standup", range(5), "09:30", 15, "weekdays", meeting_url=self.meet(),
                    attendees=", ".join(team), notification_minutes=10, skip_p=0.03,
                    description="¿Qué hice ayer? ¿Qué haré hoy? ¿Tengo bloqueos?")
        self.series("equipo", "Reunión semanal de equipo", [0], "11:00", 60, "weekly", location="Sala Orión, piso 3",
                    meeting_url=self.meet(), attendees=", ".join(team), notification_minutes=15,
                    description="Revisión de avances y acuerdos. La minuta se envía por correo al terminar.")
        sprint_anchor = date(2026, 10, 5)
        self.series("equipo", "Sprint planning", [0], "12:15", 75, "weekly", every_weeks=2, anchor=sprint_anchor,
                    meeting_url=self.meet(), attendees=", ".join(team), notification_minutes=30,
                    description="Planeación del sprint. Tablero: https://tablero.empresa.com/merkemail")
        self.series("equipo", "Sprint review + retrospectiva", [4], "15:00", 120, "weekly", every_weeks=2,
                    anchor=sprint_anchor + timedelta(days=11), meeting_url=self.meet(), attendees=", ".join(team),
                    notification_minutes=30, color=G_COLORS["lavender"])
        self.series("primary", "1:1 con Andrés", [3], "16:00", 30, "weekly", meeting_url=self.meet(),
                    attendees="amorales@empresa.com", visibility="private", notification_minutes=10, skip_p=0.1)
        self.series("primary", "Bloque de concentración (sin reuniones)", [2], "14:00", 120, "weekly",
                    availability="busy", visibility="private", notification_minutes=0,
                    description="Tiempo reservado para trabajo profundo. Por favor no agendar reuniones.")

        # --- events linked to the test mail --------------------------------------------
        plan = self.conn.execute("SELECT id, subject, body_text, date FROM emails WHERE account_id = ? AND "
                                 "subject LIKE 'Reunión de Planificación de Proyecto%' ORDER BY date LIMIT 1",
                                 (self.acc.id,)).fetchone()
        if plan:
            d = parse_fecha(plan["body_text"], self.email_date(plan)) or next_dow(today, 4)
            hrs = parse_horas(plan["body_text"]) or [time(16, 0), time(17, 0)]
            self.event("equipo", "Reunión de Planificación de Proyecto", d, hrs[0].strftime("%H:%M"), 60,
                       meeting_url=self.meet(), attendees=", ".join(team), origin_email_id=plan["id"],
                       description="Revisión de entregables de MerkeMail y del despliegue del calendario.",
                       notification_minutes=30)
        inv = self.email_id("Invitación: Demo MerkeMail con Grupo Altavista%")
        demo_day = parse_fecha(inv["subject"], self.email_date(inv)) if inv else next_dow(today, 1)
        self.event("clientes", "Demo MerkeMail con Grupo Altavista", demo_day, "11:00", 60, meeting_url=self.meet(),
                   attendees="martin.gomez@grupoaltavista.com, smartinez@empresa.com, amorales@empresa.com",
                   origin_email_id=inv["id"] if inv else None, notification_minutes=30, color=G_COLORS["tomato"],
                   description="Agenda:\n1. Bandeja unificada\n2. Calendario Google + Proton\n3. Agente Elio\n4. Preguntas")
        dep = self.email_id("Ventana de mantenimiento: despliegue%")
        if dep:
            d = parse_fecha(dep["body_text"], self.email_date(dep))
            ver = re.search(r"v(\d+\.\d+\.\d+)", dep["subject"])
            if d:
                self.event("guardias", f"Despliegue v{ver.group(1) if ver else ''} a producción", d, "22:00", 60,
                           origin_email_id=dep["id"], attendees="dherrera@empresa.com, crivera@empresa.com",
                           notification_minutes=60, description="Checklist: https://wiki.empresa.com/despliegues")
        # other deploys every 2 weeks on Thursday night
        self.series("guardias", "Despliegue a producción", [3], "22:00", 60, "none", every_weeks=2,
                    anchor=sprint_anchor + timedelta(days=3), attendees="dherrera@empresa.com",
                    notification_minutes=60, description="Ventana de despliegue. Rollback: https://wiki.empresa.com/rollback")
        # on-call weeks (multi-day all-day)
        monday = self.first - timedelta(days=self.first.weekday())
        k = 0
        while monday <= self.last:
            if k % 3 == 1:
                self.allday("guardias", "Guardia (on-call) 📟", monday, monday + timedelta(days=6), availability="free",
                            description="Teléfono de guardia activo. Escalar incidentes P1 a Diego Herrera.")
            monday += timedelta(days=7)
            k += 1
        first_db = max(self.first, today - timedelta(days=30))
        self.event("guardias", "Mantenimiento de base de datos (vacuum + índices)",
                   next_dow(first_db, 5), "01:00", 120, notification_minutes=60, availability="busy",
                   description="Ventana de madrugada. Sincronización pausada durante la tarea.")

        # --- clients -----------------------------------------------------------------
        clients = [("Grupo Altavista", "martin.gomez@grupoaltavista.com", "Av. Constitución 2050, Monterrey, N.L."),
                   ("Consultoría Norte", "lmendez@consultoria-norte.com", "Calz. del Valle 400, San Pedro Garza García"),
                   ("Distribuidora Sol", "compras@distribuidorasol.mx", "Blvd. Ávila Camacho 88, CDMX")]
        for i in range(9):
            name, mail, addr = r.choice(clients)
            d = self.first + timedelta(days=r.randint(0, (self.last - self.first).days))
            if d.weekday() >= 5 or d in self.blocked:
                continue
            kind = r.choice(["Llamada de seguimiento", "Revisión de propuesta", "Visita a oficinas", "Capacitación"])
            onsite = kind == "Visita a oficinas"
            self.event("clientes", f"{kind}: {name}", d, r.choice(["10:00", "12:00", "13:00", "16:30"]),
                       180 if onsite else r.choice([30, 45, 60]), attendees=mail,
                       location=addr if onsite else "", meeting_url="" if onsite else self.meet(),
                       notification_minutes=60 if onsite else 15, availability="busy")
        lm = self.email_id("Seguimiento: cotización de licencias%", include_spam=True)  # the legit mail that landed in Spam
        self.event("clientes", "Llamada: Consultoría Norte - 15 licencias", next_weekday_in(today, 2), "17:00", 30,
                   attendees="lmendez@consultoria-norte.com", meeting_url=self.meet(),
                   origin_email_id=lm["id"] if lm else None, notification_minutes=15)
        # intentional conflict with the weekly team meeting (overlapping events)
        self.event("clientes", "Llamada urgente con Martín Gómez (Altavista)", next_dow(today, 0, True), "11:30", 30,
                   attendees="martin.gomez@grupoaltavista.com", meeting_url=self.meet(), color=G_COLORS["tomato"],
                   description="Se empalma con la reunión semanal de equipo.")

        # --- one-off events ------------------------------------------------------------
        one_offs = [
            (-40, "primary", "Comida con Carlos", "14:30", 90, dict(location="La Casa de Toño, Av. Insurgentes Sur 1050, CDMX",
                                                                    availability="free", notification_minutes=30)),
            (-21, "equipo", "Taller interno: pruebas E2E con Playwright", "16:00", 90,
             dict(location="Sala Orión, piso 3", meeting_url=self.meet(), attendees=", ".join(team),
                  description="Material: https://playwright.dev/python/docs/intro")),
            (-9, "equipo", "Revisión de mockups: bandeja v2", "12:00", 45, dict(attendees="vrojas@empresa.com, smartinez@empresa.com",
                                                                                meeting_url=self.meet())),
            (0, "primary", "Revisar PR de exportación de contactos", "17:30", 30, dict(notification_minutes=0, visibility="private")),
            (1, "primary", "Entrevista candidato Frontend Sr.", "13:00", 60, dict(meeting_url=self.meet(),
                                                                                  attendees="rrhh@empresa.com",
                                                                                  visibility="private")),
            (12, "primary", "Revisión de desempeño anual", "10:00", 60, dict(attendees="amorales@empresa.com",
                                                                             visibility="private", location="Oficina de Dirección")),
            (25, "equipo", "Posada de fin de año del equipo 🎄", "19:00", 240,
             dict(location="Salón Los Arcos, Av. Revolución 1500, CDMX", visibility="public", availability="busy",
                  attendees=", ".join(team + ["amorales@empresa.com"]), notification_minutes=60)),
            (38, "primary", "Kickoff 2027: objetivos del año", "10:00", 120, dict(meeting_url=self.meet(),
                                                                                  attendees="amorales@empresa.com")),
        ]
        for offset, cal, title, start, mins, kw in one_offs:
            d = today + timedelta(days=offset)
            while d.weekday() >= 5 or d in self.blocked:
                d += timedelta(days=1)
            self.event(cal, title, d, start, mins, **kw)
        devfest = next_dow(today + timedelta(days=16), 5)
        self.allday("primary", f"DevFest CDMX {devfest.year}", devfest, devfest + timedelta(days=1), availability="busy",
                    location="https://devfest.cdmx.example/agenda", description="Conferencia de desarrolladores. Charlas de IA y web.")

        # --- birthdays (yearly) ----------------------------------------------------------
        people = ["Sofia Martinez", "Carlos Rivera", "Lucía Fernández", "Diego Herrera", "Valentina Rojas", "Andrés Morales"]
        for p in people:
            d = self.first + timedelta(days=r.randint(0, (self.last - self.first).days))
            self.allday("cumples", f"Cumpleaños de {p} 🎂", d, recurrence="yearly", availability="free")

        # --- tasks ------------------------------------------------------------------------
        budget = self.email_id("Presupuesto Q1%")
        b_due = parse_fecha(budget["body_text"], self.email_date(budget)) if budget else today + timedelta(days=2)
        self.task("t_mis", f"Enviar estimaciones del presupuesto Q1 {today.year + 1} a Andrés", b_due, done=False,
                  origin_email_id=budget["id"] if budget else None, color=G_COLORS["tomato"],
                  description="- [x] Backend 480 h\n- [x] Frontend 360 h\n- [ ] Confirmar infraestructura con Diego\n- [ ] Enviar plantilla")
        self.task("t_mis", "Revisar PR de exportación de contactos", today, done=False)
        self.task("t_mis", "Renovar certificado SSL de staging", today - timedelta(days=3), done=False,
                  description="Vence el certificado de staging.empresa.com. Ver https://letsencrypt.org/docs/")
        self.task("t_mis", "Preparar entorno de demo para Grupo Altavista", demo_day - timedelta(days=1), done=False,
                  color=G_COLORS["banana"], origin_email_id=inv["id"] if inv else None)
        self.task("t_mis", "Responder a Laura Méndez sobre las 15 licencias", None, done=False,
                  origin_email_id=lm["id"] if lm else None, description="Llegó a Spam; confirmar disponibilidad para llamada.")
        self.task("t_mis", "Actualizar documentación de la API de etiquetas", None, done=False,
                  description="Documentar /api/labels y /api/emails/{id}/labels en el wiki.")
        self.task("t_mis", "Leer artículo sobre agentes con tool calling", None, done=False,
                  description="https://ai.google.dev/gemini-api/docs/function-calling")
        self.task("t_mis", "Comprar boleto para DevFest", None, done=True)
        self.task("t_mis", "Solicitar vacaciones de diciembre a RRHH", v_from - timedelta(days=35), done=True,
                  origin_email_id=vac["id"] if vac else None)
        fri = today - timedelta(days=(today.weekday() - 4) % 7)
        for w in range(6, -2, -1):  # weekly timesheet: past ones done (one forgotten), next one pending
            d = fri - timedelta(weeks=w)
            self.task("t_mis", "Registrar horas de la semana en el portal", d,
                      done=(d < today and w != 3), recurrence="weekly", notification_minutes=60)
        cloud = self.conn.execute("SELECT id, date FROM emails WHERE account_id = ? AND sender LIKE '%notifications@google.com%' "
                                  "AND subject LIKE 'Facturación Mensual%' LIMIT 1", (self.acc.id,)).fetchone()
        self.task("tareas", "[Tarea] Revisar factura de Google Cloud", self.email_date(cloud) + timedelta(days=2) if cloud else
                  today - timedelta(days=4), done=True, origin_email_id=cloud["id"] if cloud else None)
        self.task("tareas", "[Tarea] Llamar a soporte del proveedor de hosting", None, done=False)
        self.task("tareas", "[Tarea] Pedir acceso de administrador a Sentry", None, done=True)

        sprint_end = sprint_anchor + timedelta(days=((today - sprint_anchor).days // 14) * 14 + 11)
        for code, title, due, done in [
            ("MM-412", "Paginación virtual en la bandeja", None, False),
            ("MM-415", "Bug: eventos duplicados al sincronizar el calendario", today - timedelta(days=5), True),
            ("MM-418", "Filtro por urgencia IA en búsqueda avanzada", sprint_end, False),
            ("MM-420", "Exportar contactos a CSV", sprint_end, False),
            ("MM-421", "Pruebas E2E del calendario", None, False),
            ("MM-399", "Compilar Tailwind con la CLI (quitar runtime del navegador)", today - timedelta(days=12), True),
            ("MM-423", "Accesibilidad: navegación con teclado en la bandeja", None, False),
            ("MM-424", "Corregir 'Próximos eventos' (mostrar solo futuros)", None, False),
        ]:
            self.task("t_sprint", f"{code} {title}", due, done=done,
                      description=f"Ticket: https://tablero.empresa.com/merkemail/{code}")
        for idea in ["Notificaciones push para correos urgentes", "Modo sin conexión para leer correos",
                     "Plantillas de respuesta rápida", "Integración con Microsoft 365", "Atajos de teclado estilo Gmail",
                     "Exportar calendario a .ics"]:
            self.task("t_ideas", idea, None, done=r.random() < 0.15,
                      description=r.choice(["", "Pendiente de priorizar con Sofia.", "Idea de la retro del sprint."]))

    # ================================================================== PERSONAL profile
    def gen_personal(self) -> None:
        r, today = self.rng, self.today
        self.use_existing("primary", "primary")
        self.use_existing("tareas", "tasks_default")
        self.add_cal("run", "Entrenamiento 10K", G_COLORS["tangerine"], "entrenamiento")
        self.add_cal("familia", "Familia", G_COLORS["flamingo"], "familia")
        self.add_cal("diplo", "Diplomado Ciencia de Datos", G_COLORS["blueberry"], "diplomado")
        self.add_cal("t_mis", "Tareas (Mis tareas)", self.acc_color(), "mis-tareas", task_list=True)
        self.add_cal("t_compras", "Tareas (Compras)", self.acc_color(), "compras", task_list=True)
        hols = self.block_holidays()
        xmas_break = (date(today.year, 12, 19), date(today.year + 1, 1, 10))
        if today.month < 6:
            xmas_break = (date(today.year - 1, 12, 19), date(today.year, 1, 10))

        # --- training ---------------------------------------------------------------------
        park = "Parque Bosque de Tlalpan, entrada principal"
        self.series("run", "Entrenamiento con el club 🏃", [1, 3], "06:30", 75, "weekly", location=park,
                    notification_minutes=30, skip_p=0.08, description="Series y técnica con el coach Daniel.")
        self.series("run", "Fondo largo", [6], "07:00", 90, "weekly", skip_p=0.15, availability="busy",
                    notification_minutes=60, description="Ritmo cómodo. Hidratación cada 5 km.")
        race_mail = self.email_id("Carrera 10K del %")
        race_day = parse_fecha(race_mail["subject"], self.email_date(race_mail)) if race_mail else next_dow(today + timedelta(days=7), 6)
        self.event("run", "🏁 Carrera 10K", race_day, "07:00", 120, location="Estadio Olímpico Universitario, CDMX",
                   origin_email_id=race_mail["id"] if race_mail else None, notification_minutes=1440,
                   color=G_COLORS["tomato"], description="Recoger kit el viernes. Salida 7:00, llegar 6:15.")
        self.allday("run", "Recoger kit de la carrera", race_day - timedelta(days=2), notification_minutes=60,
                    location="Tienda DeporTotal Coyoacán")

        # --- course ---------------------------------------------------------------------
        course_end = min(self.last, xmas_break[0] - timedelta(days=1))
        self.series("diplo", "Clase: Diplomado en Ciencia de Datos", [5], "09:00", 240, "weekly", until=course_end,
                    location="Campus Sur, Edificio B, aula 204", notification_minutes=60)
        self.series("diplo", "Asesoría en línea", [2], "19:00", 90, "weekly", until=course_end, meeting_url=self.meet(),
                    attendees="ecardenas@diplomados-uvirtual.edu.mx", notification_minutes=15, skip_p=0.2)
        self.series("diplo", "Clase: Diplomado en Ciencia de Datos (módulo 3)", [5], "09:00", 240, "weekly",
                    since=xmas_break[1], location="Campus Sur, Edificio B, aula 204", notification_minutes=60)
        hw = self.email_id("Diplomado en Ciencia de Datos - Tarea 4%")
        hw4 = parse_fecha(hw["body_text"], self.email_date(hw)) if hw else today - timedelta(days=2)
        for n in range(1, 9):
            d = hw4 + timedelta(days=14 * (n - 4))
            if xmas_break[0] <= d <= xmas_break[1]:
                continue
            self.allday("diplo", f"Entrega: Tarea {n}", d, notification_minutes=1440, color=G_COLORS["grape"] if n == 4 else "",
                        origin_email_id=hw["id"] if (hw and n == 4) else None)
            self.task("t_mis", f"Entregar Tarea {n} del diplomado", d, done=d < today)
        self.event("diplo", "Examen final del módulo 2", course_end - timedelta(days=(course_end.weekday() - 5) % 7),
                   "09:00", 180, location="Campus Sur, Edificio B, aula 204", notification_minutes=1440, color=G_COLORS["tomato"])

        # --- family & personal ----------------------------------------------------------
        self.series("familia", "Comida familiar en casa de mamá", [6], "14:00", 180, "weekly", every_weeks=2,
                    location="Calle Pino 23, Coyoacán", availability="free", skip_p=0.2)
        for name in ["Pao", "mamá", "papá", "la abuela Lupita"]:
            d = self.first + timedelta(days=r.randint(0, (self.last - self.first).days))
            self.allday("familia", f"Cumpleaños de {name} 🎂", d, recurrence="yearly", availability="free")
        xmas = date(xmas_break[0].year, 12, 24)
        self.event("familia", "Cena de Nochebuena 🎄", xmas, "20:00", 300, location="Calle Pino 23, Coyoacán",
                   visibility="public", notification_minutes=1440)
        self.event("familia", "Posada familiar", date(xmas.year, 12, 19), "19:00", 240, location="Casa de la tía Carmen")
        # trip planned by mail in the Proton account (Oaxaca) -> shared family/friends plan
        trip = self.email_any_account("Viaje a Oaxaca%")
        self.allday("primary", "Viaje a Oaxaca 🎒", date(xmas.year, 12, 27), date(xmas.year, 12, 30),
                    location="Oaxaca de Juárez, Oax.", availability="busy",
                    description="Casa reservada en el centro. Autobús ADO 23:45 desde TAPO." +
                                (" (Planeado por correo en la cuenta Proton.)" if trip else ""))
        for m in range(-2, 3):  # rent reminder, day 1 of each month
            d1 = add_months(date(today.year, today.month, 1), m)
            self.allday("primary", "Pago de renta 🏠", d1, recurrence="monthly", notification_minutes=1440, color=G_COLORS["banana"])
            self.task("t_mis", f"Pagar renta de {MESES[d1.month - 1]}", d1, done=d1 < today)
        dent = self.email_id("Confirmación de tu cita%")
        if dent:
            d = parse_fecha(dent["body_text"], self.email_date(dent))
            hrs = parse_horas(dent["body_text"]) or [time(17, 30)]
            if d:
                self.event("primary", "Dentista: limpieza dental 🦷", d, hrs[0].strftime("%H:%M"), 60,
                           location="Clínica Dental Sonrisa, Av. Universidad 1200, CDMX", origin_email_id=dent["id"],
                           notification_minutes=60)
        car = self.email_id("Re: Cotización servicio de 60,000 km")
        car_day = next_dow(self.email_date(car), 5) if car else next_dow(today - timedelta(days=20), 5)
        self.event("primary", "Servicio del auto (60,000 km)", car_day, "09:00", 120, location="Taller Automotriz Sánchez",
                   origin_email_id=car["id"] if car else None, notification_minutes=60)
        game = self.email_id("¿Partido del jueves?")
        self.event("primary", "Fútbol con los amigos ⚽", next_dow(self.email_date(game), 3) if game else next_dow(today, 3),
                   "20:00", 90, location="Canchas Deportivo Xotepingo", origin_email_id=game["id"] if game else None,
                   availability="free")
        concert = self.email_id("Link del concierto")
        c_day = next_dow(today + timedelta(days=20), 5)
        self.event("primary", "Concierto 🎵", c_day, "21:00", 180, location="Palacio de los Deportes, CDMX",
                   origin_email_id=concert["id"] if concert else None, notification_minutes=1440, visibility="private")
        for k in range(-2, 3):
            d = today + timedelta(days=30 * k + r.randint(-3, 3))
            self.event("primary", "Corte de pelo", d, r.choice(["10:00", "18:30"]), 45, location="Barbería El Bigote",
                       notification_minutes=60)
        self.event("primary", "Año nuevo con amigos 🎉", date(xmas.year, 12, 31), "21:00", 240, location="Casa de Rodrigo")
        for d, name in hols:
            if d.month == 12 and d.day == 12:
                self.allday("primary", "Día libre (puente)", d, availability="free", notification_minutes=0)

        # --- tasks ------------------------------------------------------------------------
        gift = self.email_id("Regalo de Navidad para mamá%")
        self.task("t_mis", "Transferir $2,100 a Pao (regalo de mamá)", None, done=False,
                  origin_email_id=gift["id"] if gift else None, description="CLABE en el correo de Pao.")
        self.task("t_mis", "Pagar tarjeta Kora", today + timedelta(days=5), done=False, color=G_COLORS["tomato"],
                  description="Pago mínimo $1,850. Fecha límite de pago.")
        self.task("t_mis", "Llevar la bici a afinar", today - timedelta(days=6), done=False)
        self.task("t_mis", "Renovar pasaporte", None, done=False,
                  description="Requisitos: https://www.gob.mx/sre\n- Acta de nacimiento\n- INE\n- Pago de derechos")
        self.task("t_mis", "Agendar servicio del auto", car_day - timedelta(days=4), done=True,
                  origin_email_id=car["id"] if car else None)
        self.task("t_mis", "Juntar facturas para la declaración anual", None, done=False)
        self.task("t_mis", "Cancelar suscripción de Streamly", None, done=True)
        self.task("t_mis", "Comprar regalo de Navidad para papá", date(xmas.year, 12, 20), done=False)
        self.task("tareas", "[Tarea] Llamar al casero por el calentador", None, done=True)
        self.task("tareas", "[Tarea] Confirmar cita con el dentista", None, done=False)
        for item in ["Leche deslactosada", "Café de grano", "Tenis para correr (talla 27)", "Pilas AA", "Croquetas para Firulais",
                     "Gel energético para la carrera", "Foco LED para la cocina", "Papel de regalo"]:
            self.task("t_compras", item, None, done=r.random() < 0.3)

    def acc_color(self) -> str:
        row = self.conn.execute("SELECT color FROM accounts WHERE id = ?", (self.acc.id,)).fetchone()
        return (row["color"] if row else None) or "#4285f4"


def next_weekday_in(d: date, n: int) -> date:
    cur, added = d, 0
    while added < n:
        cur += timedelta(days=1)
        if cur.weekday() < 5:
            added += 1
    return cur


# ------------------------------------------------------------------------------ DB
def purge(conn: sqlite3.Connection) -> Dict[str, int]:
    res = {
        "events_and_tasks": conn.execute("DELETE FROM events WHERE external_id LIKE ? OR calendar_id IN "
                                         "(SELECT id FROM calendars WHERE external_id LIKE ?)",
                                         (SEED + "%", f"%{SEED}%")).rowcount,
        "calendars": conn.execute("DELETE FROM calendars WHERE external_id LIKE ?", (f"%{SEED}%",)).rowcount,
        "deleted_events": conn.execute("DELETE FROM deleted_events WHERE external_id LIKE ?", (SEED + "%",)).rowcount,
    }
    conn.commit()
    return res


def insert(conn: sqlite3.Connection, gen: CalendarGenerator, now_iso: str) -> Tuple[int, int]:
    ids: Dict[str, int] = {}
    new_cals = 0
    for key, c in gen.cals.items():
        if c.existing_id:
            ids[key] = c.existing_id
            continue
        row = conn.execute("SELECT id FROM calendars WHERE account_id = ? AND external_id = ?",
                           (gen.acc.id, c.external_id)).fetchone()
        if row:
            ids[key] = row["id"]
            continue
        cur = conn.execute("INSERT INTO calendars (name, provider, color, account_id, external_id, is_visible, updated_at) "
                           "VALUES (?, 'google', ?, ?, ?, 1, ?)", (c.name, c.color, gen.acc.id, c.external_id, now_iso))
        ids[key] = cur.lastrowid
        new_cals += 1
    n = 0
    for it in sorted(gen.items, key=lambda x: (x.start_time or "9999", x.title)):
        n += 1
        conn.execute(
            """INSERT INTO events (calendar_id, title, description, location, start_time, end_time, all_day, origin_email_id,
                                   is_task, is_completed, account_id, meeting_url, color, recurrence, notification_minutes,
                                   attendees, availability, visibility, external_id, updated_at, local_modified)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
            (ids[it.cal_key], it.title, it.description, it.location, it.start_time, it.end_time, it.all_day,
             it.origin_email_id, it.is_task, it.is_completed, gen.acc.id, it.meeting_url, it.color, it.recurrence,
             it.notification_minutes, it.attendees, it.availability, it.visibility,
             f"{SEED}{gen.acc.id}-{n:05d}", now_iso))
    conn.commit()
    return new_cals, n


def summary(gen: CalendarGenerator) -> None:
    today_s = gen.today.strftime("%Y-%m-%d")
    print(f"\n  Account #{gen.acc.id} {gen.acc.email} -> {len(gen.cals)} calendars/lists "
          f"({sum(1 for c in gen.cals.values() if not c.existing_id)} new)")
    print(f"    {'calendar / task list':<40}{'events':>8}{'past':>6}{'future':>8}{'all-day':>9}{'recurr.':>9}"
          f"{'tasks':>7}{'done':>6}{'no date':>9}{'overdue':>9}{'linked✉':>9}")
    for key, c in gen.cals.items():
        its = [i for i in gen.items if i.cal_key == key]
        evs = [i for i in its if not i.is_task]
        tks = [i for i in its if i.is_task]
        print(f"    {c.name[:39]:<40}{len(evs):>8}{sum(e.start_time[:10] < today_s for e in evs):>6}"
              f"{sum(e.start_time[:10] >= today_s for e in evs):>8}{sum(e.all_day for e in evs):>9}"
              f"{sum(e.recurrence != 'none' for e in evs):>9}{len(tks):>7}{sum(t.is_completed for t in tks):>6}"
              f"{sum(not t.start_time for t in tks):>9}"
              f"{sum(bool(t.start_time) and t.start_time[:10] < today_s and not t.is_completed for t in tks):>9}"
              f"{sum(bool(i.origin_email_id) for i in its):>9}")


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate calendar events, sub-calendars and tasks for the Google accounts.")
    ap.add_argument("--db", type=Path, default=DEFAULT_DB)
    ap.add_argument("--months-back", type=int, default=2)
    ap.add_argument("--months-ahead", type=int, default=2)
    ap.add_argument("--seed", type=int, default=2026)
    ap.add_argument("--tz", default=None, help="IANA time zone used to decide 'today' (default: system)")
    ap.add_argument("--now", default=None, help="override 'now' (ISO datetime)")
    ap.add_argument("--reset", action="store_true", help="replace previously generated calendar test data")
    ap.add_argument("--purge", action="store_true", help="only remove generated calendar test data")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not args.db.exists():
        print(f"ERROR: database not found: {args.db}. Start MerkeMail once first.")
        return 1
    if args.tz:
        from zoneinfo import ZoneInfo
        tz = ZoneInfo(args.tz)
    else:
        tz = datetime.now().astimezone().tzinfo
    now = datetime.fromisoformat(args.now) if args.now else datetime.now(tz)
    if now.tzinfo is None:
        now = now.replace(tzinfo=tz)
    today = now.astimezone(tz).date()
    first, last = add_months(today, -args.months_back), add_months(today, args.months_ahead)

    conn = connect(args.db)
    if args.purge:
        print("Removed:", purge(conn))
        return 0
    existing = conn.execute("SELECT COUNT(*) c FROM events WHERE external_id LIKE ?", (SEED + "%",)).fetchone()["c"]
    if existing and not args.reset and not args.dry_run:
        print(f"The database already has {existing} generated events/tasks. Use --reset to replace them or --purge.")
        return 1

    google = [a for a in load_accounts(conn) if (a.provider or "").lower() in ("gmail", "google")]
    if not google:
        print("No active Google (gmail) accounts: the calendar only shows Google calendars. Nothing to do.")
        return 1
    skipped = [a for a in load_accounts(conn) if a not in google]
    print(f"Window: {first} -> {last} (today {today}, {tz})")
    for a in skipped:
        print(f"Skipped (not Google, the calendar doesn't show it): #{a.id} {a.email} [{a.provider}]")

    gens = []
    for a in google:
        g = CalendarGenerator(random.Random(f"{args.seed}:cal:{a.email.lower()}"), conn, a, today, now, first, last)
        (g.gen_work if a.profile == "gmail_work" else g.gen_personal)()
        gens.append(g)
        summary(g)

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return 0
    if existing:
        print("\nRemoved previous calendar test data:", purge(conn))
    now_iso = now.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for g in gens:
        nc, ni = insert(conn, g, now_iso)
        print(f"Inserted for {g.acc.email}: {nc} calendars/lists, {ni} events+tasks")
    print("Reload the browser and open Calendario. If some calendars don't show, open 'Mis Calendarios' and tick them "
          "(the visible set is remembered per browser).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
