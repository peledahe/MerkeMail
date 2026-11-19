#!/usr/bin/env python3
"""
MerkeMail - fictitious mail generator for testing.

Fills the local database with several days of realistic-looking mail for the accounts
that exist in the DB. Nothing is sent anywhere; it only writes rows in SQLite with the
same shape the IMAP / Gmail sync would produce.

Each active account gets a profile (one generator and random stream per account):
  * 1st Gmail account  -> work (MerkeMail dev team: PRs, QA bugs, client proposal, GitHub/Sentry...)
  * 2nd+ Gmail account -> personal / consumer (running club, landlord, online course, shopping,
                          subscriptions, social networks, reading club)
  * Proton             -> personal / freelance (friends & family, freelance client, accountant...)
  * custom (manual IMAP/SMTP server) -> company mailbox of the IT coordinator (colleagues at the
                          account's own domain replying "RE:", help-desk tickets, Zabbix, backups,
                          MAILER-DAEMON bounces, quota warnings, payslips, suppliers, CEO-fraud spam)

What it generates (all relative to "now", so the inbox always looks fresh):
  * Recibidos (INBOX) with conversation threads (replies, quoted text, CC, attachments),
    newsletters and service notifications; Gmail accounts also get CATEGORY_PROMOTIONS /
    SOCIAL / UPDATES / FORUMS (other providers have no categories, as on their real servers).
  * Enviados (SENT) with the account's default signature (from the `signatures` table),
    Borradores (DRAFT), Spam, Papelera (TRASH) and Archivo (ARCHIVE).
  * Read/unread by age (today's mail mostly unread), stars, the existing labels, attachment
    metadata, and AI urgency/tags on part of the mail.
  * Continuity with the original demo mail (replies to Sofia's meeting email, next Tech Weekly
    issues, more Black Friday / Google Cloud / Proton mail).

--add-accounts first creates two extra test accounts through the app's API (a 2nd Gmail
account and a fictional company account with manual server configuration), each with a
default signature. It is idempotent (existing e-mail addresses are skipped).

Every generated row has a uid that starts with "seed-", so it never collides with real
IMAP/Gmail UIDs and can be removed without touching anything else.

Usage (from the `proyecto/` folder, server may be running):
    .venv/bin/python tests/generate_test_emails.py                  # generate 14 days
    .venv/bin/python tests/generate_test_emails.py --add-accounts   # + create the 2 extra accounts (server running)
    .venv/bin/python tests/generate_test_emails.py --days 7         # shorter window
    .venv/bin/python tests/generate_test_emails.py --reset          # delete previous seed data and regenerate
    .venv/bin/python tests/generate_test_emails.py --purge          # only delete seed data
    .venv/bin/python tests/generate_test_emails.py --dry-run        # show what would be generated
    .venv/bin/python tests/generate_test_emails.py --tz America/Mexico_City

The output is deterministic for a given --seed and the same "now" (--now).
"""

from __future__ import annotations

import argparse
import html
import json
import math
import random
import sqlite3
import sys
import urllib.request
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Callable, Dict, List, Optional, Sequence, Tuple

try:
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover
    ZoneInfo = None  # type: ignore

SEED_PREFIX = "seed-"
DEFAULT_DB = Path(__file__).resolve().parent.parent / "data" / "merkemail.db"

DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
DIAS_CORTOS = ["lun", "mar", "mié", "jue", "vie", "sáb", "dom"]
MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
         "septiembre", "octubre", "noviembre", "diciembre"]
MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"]

CONTENT_TYPES = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "ics": "text/calendar",
    "log": "text/plain",
    "zip": "application/zip",
    "csv": "text/csv",
    "xml": "application/xml",
    "ipynb": "application/x-ipynb+json",
}
SIZE_RANGES = {  # bytes
    "pdf": (60_000, 2_400_000), "png": (150_000, 1_600_000), "jpg": (1_200_000, 4_200_000),
    "xlsx": (18_000, 240_000), "docx": (25_000, 320_000), "ics": (900, 3_200),
    "log": (4_000, 65_000), "zip": (400_000, 6_000_000), "csv": (3_000, 90_000),
    "xml": (4_000, 12_000), "ipynb": (40_000, 900_000),
}


# --------------------------------------------------------------------------------------
# Data model
# --------------------------------------------------------------------------------------
@dataclass(frozen=True)
class Person:
    name: str
    email: str

    @property
    def addr(self) -> str:
        return f"{self.name} <{self.email}>"

    @property
    def first(self) -> str:
        return self.name.split()[0]


@dataclass
class Account:
    id: int
    name: str
    email: str
    provider: str
    signature: str = ""
    imap_host: str = ""
    profile: str = ""

    @property
    def addr(self) -> str:
        return f"{self.name} <{self.email}>"


@dataclass
class Msg:
    account_id: int
    folder: str
    sender: str
    recipient: str
    subject: str
    body_text: str
    body_html: str
    date: datetime  # aware
    kind: str  # human | notification | newsletter | promo | social | forum | spam | sent | draft
    is_read: int = 0
    is_starred: int = 0
    attachments: List[Tuple[str, str, int]] = field(default_factory=list)
    labels: List[str] = field(default_factory=list)
    ai_urgency: Optional[str] = None
    ai_tags: Optional[List[str]] = None
    star_p: float = 0.0
    force_unread: bool = False


ME = None  # marker for "the account owner" inside thread steps


@dataclass
class Step:
    frm: Optional[Person]             # None == the account owner (goes to SENT)
    to: Sequence[Person]
    body: str
    delay: Tuple[float, float] = (1, 4)  # hours after previous step
    cc: Sequence[Person] = ()
    atts: Sequence[str] = ()
    urgency: Optional[str] = None
    tags: Sequence[str] = ()
    star_p: float = 0.0
    subject: Optional[str] = None     # override (default: "Re: " + thread subject)


# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------
def fecha_larga(d: date) -> str:
    return f"{DIAS[d.weekday()]} {d.day} de {MESES[d.month - 1]}"


def fecha_cita(dt: datetime) -> str:
    """Format used in the quoted-reply header ('El mié, 18 nov 2026 a las 10:32')."""
    return f"{DIAS_CORTOS[dt.weekday()]}, {dt.day} {MESES_CORTOS[dt.month - 1]} {dt.year} a las {dt:%H:%M}"


def next_weekday(d: date, offset_days: int) -> date:
    """Date after adding `offset_days` business days."""
    cur = d
    added = 0
    while added < offset_days:
        cur += timedelta(days=1)
        if cur.weekday() < 5:
            added += 1
    return cur


def text_to_html(text: str) -> str:
    """Plain text -> simple HTML (paragraphs, quoted blocks) like most mail clients send."""
    out: List[str] = []
    quote: List[str] = []
    para: List[str] = []

    def flush_para():
        if para:
            out.append("<p>" + "<br>".join(html.escape(x) for x in para) + "</p>")
            para.clear()

    def flush_quote():
        if quote:
            inner = "<br>".join(html.escape(x[1:].lstrip()) for x in quote)
            out.append('<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex;color:#555">'
                       + inner + "</blockquote>")
            quote.clear()

    for line in text.split("\n"):
        if line.startswith(">"):
            flush_para()
            quote.append(line)
        elif not line.strip():
            flush_para()
            flush_quote()
        else:
            flush_quote()
            para.append(line)
    flush_para()
    flush_quote()
    return '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">' + "".join(out) + "</div>"


def html_card(brand: str, color: str, title: str, paragraphs: Sequence[str], cta: Optional[str] = None,
              footer: str = "Recibes este correo porque estás suscrito. Cancelar suscripción · Preferencias") -> str:
    """Newsletter/notification style HTML with inline styles and no remote images (works offline)."""
    ps = "".join(f'<p style="margin:0 0 12px 0">{html.escape(p)}</p>' for p in paragraphs)
    button = (f'<p style="margin:18px 0"><a href="#" style="background:{color};color:#fff;padding:10px 18px;'
              f'border-radius:6px;text-decoration:none;font-weight:bold">{html.escape(cta)}</a></p>') if cta else ""
    return (
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:16px 0">'
        '<tr><td align="center">'
        '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;'
        'overflow:hidden;font-family:Arial,Helvetica,sans-serif;color:#1f2937">'
        f'<tr><td style="background:{color};color:#ffffff;padding:16px 24px;font-size:18px;font-weight:bold">{html.escape(brand)}</td></tr>'
        f'<tr><td style="padding:24px"><h2 style="margin:0 0 14px 0;font-size:20px">{html.escape(title)}</h2>{ps}{button}</td></tr>'
        f'<tr><td style="padding:14px 24px;background:#f9fafb;color:#6b7280;font-size:11px">{html.escape(footer)}</td></tr>'
        '</table></td></tr></table>'
    )


def snippet_of(text: str) -> str:
    # Same rule as EmailService.sync_mailbox
    return " ".join(text.split())[:160] if text else "(Sin contenido de texto)"


# --------------------------------------------------------------------------------------
# Generator
# --------------------------------------------------------------------------------------
class MailGenerator:
    def __init__(self, rng: random.Random, tz, now: datetime, days: int, existing: List[sqlite3.Row]):
        self.rng = rng
        self.tz = tz
        self.now = now.astimezone(tz)
        self.days = days
        self.first_day = self.now.date() - timedelta(days=days - 1)
        self.window_start = datetime.combine(self.first_day, time(0, 0), tzinfo=tz)
        self.existing = existing
        self.msgs: List[Msg] = []
        self.pr_counter = rng.randint(310, 340)
        self.order_counter = rng.randint(40_000, 90_000)

    # ---------------- time helpers ----------------
    def day_list(self) -> List[date]:
        return [self.first_day + timedelta(days=i) for i in range(self.days)]

    def weekdays(self) -> List[date]:
        """Business days in the window (falls back to all days for short weekend-only windows)."""
        return [d for d in self.day_list() if d.weekday() < 5] or self.day_list()

    def at(self, d: date, hour: float) -> datetime:
        base = datetime.combine(d, time(0, 0), tzinfo=self.tz)
        return base + timedelta(hours=hour)

    def work_hour(self) -> float:
        h = self.rng.gauss(self.rng.choice([10.3, 12.5, 16.2]), 1.4)
        return min(max(h, 8.0), 19.4)

    def personal_hour(self) -> float:
        h = self.rng.gauss(self.rng.choice([9.5, 14.0, 20.5]), 1.8)
        return min(max(h, 7.5), 23.3)

    def fit_hours(self, dt: datetime, work: bool) -> datetime:
        """Move a timestamp into plausible human hours (work: Mon-Fri 8-19h, personal: 8-23h)."""
        dt = dt.astimezone(self.tz)
        lo, hi = (8.0, 19.5) if work else (8.0, 23.5)
        h = dt.hour + dt.minute / 60
        d = dt.date()
        if h > hi:
            d = d + timedelta(days=1)
            dt = self.at(d, lo + self.rng.uniform(0.2, 1.8))
        elif h < lo:
            dt = self.at(d, lo + self.rng.uniform(0.2, 1.8))
        if work:
            while dt.weekday() >= 5:
                dt = self.at(dt.date() + timedelta(days=1), lo + self.rng.uniform(0.2, 1.8))
        return dt

    def poisson(self, lam: float) -> int:
        if lam <= 0:
            return 0
        l_exp, k, p = math.exp(-lam), 0, 1.0
        while True:
            p *= self.rng.random()
            if p <= l_exp:
                return k
            k += 1

    def size(self, filename: str) -> Tuple[str, str, int]:
        ext = filename.rsplit(".", 1)[-1].lower()
        lo, hi = SIZE_RANGES.get(ext, (10_000, 500_000))
        return filename, CONTENT_TYPES.get(ext, "application/octet-stream"), self.rng.randint(lo, hi)

    # ---------------- emit ----------------
    def add(self, acc: Account, folder: str, sender: str, recipient: str, subject: str, text: str,
            dt: datetime, kind: str, html_body: Optional[str] = None, atts: Sequence[str] = (),
            labels: Sequence[str] = (), urgency: Optional[str] = None, tags: Sequence[str] = (),
            star_p: float = 0.0) -> Optional[Msg]:
        if dt > self.now or dt < self.window_start:
            return None
        window = {"human": 3 * 86400, "spam": 86400}.get(kind)
        if window and any(o.kind == kind and o.sender == sender and o.subject == subject
                          and abs((o.date - dt).total_seconds()) < window for o in self.msgs):
            return None  # no identical mail twice from the same person (3 days) or spam campaign (1 day)
        m = Msg(
            account_id=acc.id, folder=folder, sender=sender, recipient=recipient, subject=subject,
            body_text=text, body_html=html_body if html_body is not None else text_to_html(text),
            date=dt, kind=kind, attachments=[self.size(a) for a in atts], labels=list(labels),
            ai_urgency=urgency, ai_tags=list(tags) if tags else None, star_p=star_p,
        )
        self.msgs.append(m)
        return m

    # ---------------- threads ----------------
    def thread(self, acc: Account, subject: str, steps: List[Step], start: datetime, work: bool,
               labels: Sequence[str] = (), reply_prefix: str = "Re:") -> None:
        """A conversation: incoming steps go to INBOX, the owner's steps (frm=ME) go to SENT.
        `reply_prefix` is what the other people's mail client uses (Outlook in Spanish: "RE:")."""
        prev_dt: Optional[datetime] = None
        prev_text = ""
        prev_from = ""
        for i, st in enumerate(steps):
            if i == 0:
                dt = self.fit_hours(start, work)
            else:
                dt = self.fit_hours(prev_dt + timedelta(hours=self.rng.uniform(*st.delay)), work)
            if dt > self.now:
                break  # rest of the conversation hasn't happened yet
            subj = st.subject or (subject if i == 0 else f"{'Re:' if st.frm is ME else reply_prefix} {subject}")
            body = st.body
            if st.frm is ME:
                body = body.rstrip() + ("\n\n" + acc.signature if acc.signature else "")
            if i > 0 and prev_text:
                quoted = "\n".join("> " + ln if ln else ">" for ln in prev_text.strip().split("\n"))
                body = f"{body}\n\nEl {fecha_cita(prev_dt)}, {prev_from} escribió:\n{quoted}"
            if st.frm is ME:
                rcpt = ", ".join(p.email for p in list(st.to) + list(st.cc))
                self.add(acc, "SENT", acc.addr, rcpt, subj, body, dt, "sent", atts=st.atts, labels=labels)
                prev_from = acc.addr
            else:
                others = [p.email for p in list(st.to) + list(st.cc) if p.email != st.frm.email]
                rcpt = ", ".join([acc.email] + [e for e in others if e != acc.email])
                self.add(acc, "INBOX", st.frm.addr, rcpt, subj, body, dt, "human", atts=st.atts,
                         labels=labels, urgency=st.urgency, tags=st.tags, star_p=st.star_p)
                prev_from = st.frm.addr
            prev_dt, prev_text = dt, st.body
        return None

    def random_start(self, work: bool, min_days_before_end: int = 0) -> datetime:
        """Random start for a conversation inside the window (never in the future)."""
        days = [d for d in self.day_list() if (not work or d.weekday() < 5)]
        cutoff = self.now.date() - timedelta(days=min_days_before_end)
        days = [d for d in days if d <= cutoff] or days or self.day_list()
        dt = self.now
        for _ in range(20):
            d = self.rng.choice(days)
            dt = self.fit_hours(self.at(d, self.work_hour() if work else self.personal_hour()), work)
            if dt <= self.now:
                return dt
        return self.now - timedelta(minutes=self.rng.randint(5, 90))

    def recent(self, hours_ago: Tuple[float, float], work: bool) -> datetime:
        """A plausible timestamp roughly `hours_ago` before now (used for drafts)."""
        for _ in range(20):
            dt = self.fit_hours(self.now - timedelta(hours=self.rng.uniform(*hours_ago)), work)
            if self.window_start <= dt <= self.now:
                return dt
        span = max((self.now - self.window_start).total_seconds(), 60)
        return self.now - timedelta(seconds=self.rng.uniform(0.05, 0.9) * min(span, 3600))

    def fresh(self, acc: Account, make: Callable[[datetime], Optional[dict]], n: int, work: bool) -> None:
        """Guarantee a few just-arrived, unread messages so 'today' never looks empty."""
        added = 0
        for _ in range(n * 10):
            if added >= n:
                break
            dt = self.recent((0.1, 5), work)
            spec = make(dt)
            m = self.add(acc, dt=dt, **spec) if spec else None
            if m:
                m.force_unread = True
                added += 1

    # ---------------- automated streams ----------------
    def stream(self, acc: Account, rate_weekday: float, rate_weekend: float, hours: Tuple[float, float],
               make: Callable[[datetime], Optional[dict]]) -> None:
        for d in self.day_list():
            n = self.poisson(rate_weekday if d.weekday() < 5 else rate_weekend)
            # chronological order, so counters (tickets, PRs, orders) grow with time
            for h in sorted(self.rng.uniform(*hours) for _ in range(n)):
                dt = self.at(d, h)
                spec = make(dt)
                if spec:
                    self.add(acc, dt=dt, **spec)

    # ==================================================================================
    # GMAIL account (work profile)
    # ==================================================================================
    def gen_gmail(self, acc: Account) -> None:
        r = self.rng
        me = Person(acc.name, acc.email)
        sofia = Person("Sofia Martinez", "smartinez@empresa.com")
        carlos = Person("Carlos Rivera", "crivera@empresa.com")
        lucia = Person("Lucía Fernández", "lfernandez@empresa.com")
        diego = Person("Diego Herrera", "dherrera@empresa.com")
        vale = Person("Valentina Rojas", "vrojas@empresa.com")
        andres = Person("Andrés Morales", "amorales@empresa.com")
        rrhh = Person("Recursos Humanos", "rrhh@empresa.com")
        martin = Person("Martín Gómez", "martin.gomez@grupoaltavista.com")
        W = ["Trabajo"]
        WP = ["Trabajo", "Proyectos"]

        # --- Pull requests to review (2 threads) -------------------------------------
        features = [
            ("sincronización incremental de etiquetas", "backend/email_service.py"),
            ("caché de avatares con expiración", "backend/main.py"),
            ("paginación virtual en la bandeja", "frontend/js/email.js"),
            ("reintentos exponenciales en la conexión IMAP", "backend/email_service.py"),
            ("filtro por urgencia IA en la búsqueda avanzada", "backend/main.py"),
            ("exportación de contactos a CSV", "backend/contacts_service.py"),
        ]
        for feat, module in r.sample(features, 2):
            self.pr_counter += r.randint(1, 6)
            n = self.pr_counter
            self.thread(acc, f"Revisión de PR #{n}: {feat}", [
                Step(carlos, [me], (
                    f"Hola,\n\nAcabo de abrir el PR #{n} con la {feat}. ¿Lo puedes revisar cuando tengas un momento?\n"
                    f"Los tests pasan en local; me falta validarlo en staging.\n\n"
                    f"https://github.com/empresa/merkemail/pull/{n}\n\nGracias,\nCarlos"),
                    urgency="media", tags=["Código", "Revisión"]),
                Step(ME, [carlos], (
                    f"Hola Carlos,\n\nYa lo revisé. Dejé un par de comentarios sobre el manejo de errores en {module}; "
                    f"el resto se ve bien. En cuanto los resuelvas lo apruebo."), delay=(1, 5)),
                Step(carlos, [], (
                    "Listo, ya apliqué los cambios y rebasé contra main. ¿Le das otra mirada?\n\nCarlos"),
                    delay=(2, 20), urgency="baja", tags=["Código"]),
            ], self.random_start(True, 1), True, WP)

        # --- QA bug thread ----------------------------------------------------------------
        bug, bug_detail = r.choice([
            ("eventos duplicados al sincronizar el calendario",
             "Al forzar la sincronización dos veces seguidas, los eventos de Google Calendar aparecen duplicados en la vista semanal."),
            ("el contador de no leídos no se actualiza al mover a Spam",
             "Si muevo un correo no leído a Spam, el contador de Recibidos sigue mostrando el mismo número hasta recargar la página."),
            ("la firma se inserta dos veces al responder",
             "Al responder un correo de la cuenta Gmail, la firma predeterminada aparece dos veces en el cuerpo del mensaje."),
        ])
        d0 = self.random_start(True, 2)
        self.thread(acc, f"Bug crítico: {bug}", [
            Step(lucia, [me], (
                f"Hola,\n\nEncontramos un bug en la versión de staging: {bug_detail}\n\n"
                "Pasos para reproducir:\n1. Iniciar sesión con la cuenta de pruebas.\n2. Repetir la acción dos veces.\n"
                "3. Revisar el resultado en la interfaz.\n\nAdjunto captura. Lo marqué como bloqueante para el release.\n\nLucía"),
                cc=[carlos], atts=["captura_bug_staging.png"], urgency="alta", tags=["Bug", "QA"], star_p=0.5),
            Step(ME, [lucia], (
                "Gracias Lucía. ¿Me puedes pasar el log del backend del momento en que ocurre? "
                "Con eso lo revisamos con Carlos hoy mismo."), cc=[carlos], delay=(0.4, 2)),
            Step(lucia, [me], "Claro, te adjunto el log completo de la sesión.\n\nLucía", cc=[carlos],
                 delay=(0.5, 3), atts=[f"backend_{d0:%Y-%m-%d}.log"], urgency="alta", tags=["Bug", "QA"]),
            Step(carlos, [me], (
                "Encontré la causa: no estábamos respetando el bloqueo por cuenta durante la sincronización. "
                f"Subo el fix en el PR #{self.pr_counter + 1} y se lo paso a Lucía para validar.\n\nCarlos"),
                cc=[lucia], delay=(2, 7), urgency="media", tags=["Bug"]),
        ], d0, True, WP)

        # --- Design mockups ---------------------------------------------------------------
        self.thread(acc, "Mockups: nueva vista de bandeja de entrada v2", [
            Step(vale, [me], (
                "Hola,\n\nComparto los mockups de la nueva bandeja (modo claro y oscuro). Los cambios principales:\n"
                "- Agrupación por día (Hoy, Ayer, Esta semana).\n- Indicador de color por cuenta más visible.\n"
                "- Acciones rápidas al pasar el ratón.\n\n¿Me das feedback antes del jueves?\n\nVale"),
                cc=[sofia], atts=["Bandeja_v2_mockups.pdf", "Bandeja_v2_modo_oscuro.png"], urgency="media",
                tags=["Diseño", "UX"]),
            Step(ME, [vale], (
                "Se ven muy bien. Dos comentarios: el indicador de cuenta debería verse también en la vista "
                "compacta, y me preocupa el contraste de las etiquetas en modo oscuro. Lo demás, aprobado."),
                cc=[sofia], delay=(3, 26)),
            Step(vale, [me], "¡Gracias! Ajusto ambos puntos y subo la versión final a Figma.\n\nVale",
                 cc=[sofia], delay=(1, 5), tags=["Diseño"]),
        ], self.random_start(True, 2), True, WP)

        # --- Deploy window ----------------------------------------------------------------
        ver = f"1.{r.randint(7, 9)}.{r.randint(0, 4)}"
        dstart = self.random_start(True, 3)
        deploy_day = next_weekday(dstart.date(), 2)
        self.thread(acc, f"Ventana de mantenimiento: despliegue v{ver} a producción", [
            Step(diego, [me, carlos, lucia], (
                f"Equipo,\n\nEl {fecha_larga(deploy_day)} de 22:00 a 23:00 haremos el despliegue de la v{ver} a producción. "
                "Durante la ventana la sincronización estará pausada unos minutos.\n\n"
                "Necesito que alguien de backend esté disponible por si hay que hacer rollback.\n\nDiego"),
                urgency="media", tags=["Despliegue", "Producción"]),
            Step(ME, [diego], "Confirmado, estaré conectado durante la ventana.", cc=[carlos, lucia], delay=(0.5, 3)),
            Step(diego, [me, carlos, lucia], (
                f"Despliegue de la v{ver} completado sin incidencias. Monitoreo normal, sin errores nuevos en Sentry.\n\n"
                "Gracias a todos.\n\nDiego"), delay=(30, 50), urgency="baja", tags=["Despliegue"]),
        ], dstart, True, W)

        # --- Client commercial proposal --------------------------------------------------
        self.thread(acc, "Propuesta comercial - Integración de MerkeMail en Grupo Altavista", [
            Step(martin, [me], (
                "Buenos días,\n\nTal como lo platicamos en la llamada, le comparto el documento de requerimientos para la "
                "integración de MerkeMail con nuestras 40 cuentas corporativas.\n\nNos interesa especialmente el calendario "
                "unificado y la depuración de correos con IA. ¿Podría enviarnos una propuesta económica?\n\n"
                "Saludos cordiales,\nMartín Gómez\nGerente de TI | Grupo Altavista"),
                atts=["Requerimientos_Altavista.pdf"], urgency="alta", tags=["Cliente", "Propuesta"], star_p=0.8),
            Step(ME, [martin], (
                "Estimado Martín,\n\nGracias por la información. Adjunto la propuesta con el alcance, plan de trabajo y costos. "
                "Quedo atento a cualquier duda."), cc=[andres], delay=(4, 28), atts=["Propuesta_MerkeMail_Altavista_v1.pdf"]),
            Step(martin, [me], (
                "Recibido, muchas gracias. Lo revisamos con dirección esta semana y le confirmamos.\n\nSaludos,\nMartín"),
                cc=[andres], delay=(20, 48), urgency="media", tags=["Cliente"]),
        ], self.random_start(True, 3), True, ["Trabajo", "Facturación"])

        # --- Q1 budget (reply is still a draft) ------------------------------------------
        bstart = self.random_start(True, 1)
        deadline = next_weekday(bstart.date(), 3)
        ny = self.now.year + 1
        self.thread(acc, f"Presupuesto Q1 {ny} - estimaciones del equipo", [
            Step(andres, [me], (
                f"Hola,\n\nNecesito las estimaciones de horas y costos de tu equipo para el primer trimestre de {ny}. "
                f"Usa la plantilla adjunta y envíamela a más tardar el {fecha_larga(deadline)}.\n\nGracias,\nAndrés"),
                atts=[f"Plantilla_Presupuesto_Q1_{ny}.xlsx"], urgency="alta", tags=["Presupuesto"], star_p=0.6),
        ], bstart, True, W)
        self.add(acc, "DRAFT", acc.addr, andres.email, f"Re: Presupuesto Q1 {ny} - estimaciones del equipo",
                 "Hola Andrés,\n\nTe comparto la primera versión de las estimaciones. Backend: 480 h, Frontend: 360 h, QA: 200 h.\n"
                 "Pendiente: confirmar con Diego el costo de infraestructura y",
                 self.recent((2, 20), True), "draft")

        # --- Vacation request (starts in SENT) -------------------------------------------
        self.thread(acc, "Solicitud de vacaciones: 21 al 31 de diciembre", [
            Step(ME, [rrhh], (
                "Hola,\n\nSolicito vacaciones del 21 al 31 de diciembre (7 días hábiles). Ya lo coordiné con Sofia "
                "y el equipo queda cubierto durante esas fechas.\n\nGracias."), cc=[sofia]),
            Step(rrhh, [me], (
                "Hola,\n\nTu solicitud de vacaciones del 21 al 31 de diciembre fue aprobada. Te quedan 5 días disponibles "
                "para el próximo periodo.\n\nSaludos,\nRecursos Humanos"), cc=[sofia], delay=(18, 40),
                urgency="baja", tags=["RRHH", "Vacaciones"]),
        ], self.random_start(True, 2), True, ["Personal"])

        # --- Client demo invitation ------------------------------------------------------
        istart = self.random_start(True, 1)
        demo_day = next_weekday(istart.date(), r.randint(2, 5))
        self.thread(acc, f"Invitación: Demo MerkeMail con Grupo Altavista - {fecha_larga(demo_day)} 11:00", [
            Step(sofia, [me, martin, andres], (
                f"Hola,\n\nLes envío la invitación para la demo del {fecha_larga(demo_day)} de 11:00 a 12:00 por Google Meet.\n"
                "Agenda:\n1. Recorrido por la bandeja unificada.\n2. Calendario Google + Proton.\n3. Agente Elio y depuración con IA.\n"
                "4. Preguntas.\n\nSaludos,\nSofia"), atts=["invite.ics"], urgency="media", tags=["Reunión", "Cliente"]),
            Step(ME, [sofia], "Aceptado. Preparo el entorno de demo con datos de prueba.", delay=(0.3, 3)),
        ], istart, True, WP)

        # --- Other one-off work mail ----------------------------------------------------
        self.thread(acc, "Rotación de credenciales del entorno de staging", [
            Step(diego, [me, carlos], (
                "Hola,\n\nHoy a las 18:00 rotamos las credenciales de la base de datos y del bucket de staging. "
                "Las nuevas estarán en el gestor de secretos; actualicen su .env local.\n\nDiego"),
                urgency="media", tags=["Seguridad", "Infraestructura"]),
        ], self.random_start(True), True, W)

        sprint = r.randint(20, 30)
        self.thread(acc, f"Retrospectiva del Sprint {sprint}: ¿qué mejoramos?", [
            Step(sofia, [me, carlos, lucia, diego, vale], (
                f"Hola equipo,\n\nAntes de la retro del Sprint {sprint}, por favor dejen en el tablero sus puntos: "
                "qué salió bien, qué no y qué propuestas tienen.\n\nGracias,\nSofia"),
                urgency="baja", tags=["Sprint", "Equipo"]),
        ], self.random_start(True), True, WP)

        # --- Weekly mail: Monday meeting minutes, Friday timesheet reminder ----------
        for d in self.day_list():
            if d.weekday() == 0:
                self.add(acc, "INBOX", sofia.addr, f"{acc.email}, {carlos.email}, {lucia.email}, {diego.email}",
                         f"Minuta reunión semanal {d:%d/%m/%Y}",
                         "Hola equipo,\n\nAdjunto la minuta de la reunión de hoy con los acuerdos y responsables.\n"
                         "Recuerden actualizar el estado de sus tareas en el tablero antes del miércoles.\n\nSofia",
                         self.at(d, r.uniform(12.5, 14.5)), "human", atts=[f"Minuta_{d:%Y-%m-%d}.docx"],
                         labels=WP, urgency="baja", tags=["Minuta", "Equipo"])
            if d.weekday() == 4:
                self.add(acc, "INBOX", rrhh.addr, acc.email, "Recordatorio: registra tus horas de la semana",
                         "Hola,\n\nTe recordamos registrar tus horas trabajadas de esta semana en el portal antes de las "
                         "18:00 de hoy.\n\nGracias,\nRecursos Humanos",
                         self.at(d, r.uniform(10, 12)), "notification", labels=W, urgency="baja", tags=["RRHH"])

        # --- Short one-off messages from colleagues (weekdays) ---------------------------
        def colleague(dt):
            p = r.choice([sofia, carlos, lucia, diego, vale, andres])
            s, t, u, tg, atts = r.choice([
                ("¿Tienes 10 minutos?", "¿Tienes 10 minutos hoy para una llamada rápida? Quiero comentarte algo del sprint.",
                 "media", ["Equipo"], []),
                ("Documento de arquitectura actualizado", "Te comparto la versión actualizada del documento de arquitectura "
                 "con los cambios que platicamos.", "baja", ["Documentación"], ["Arquitectura_MerkeMail_v3.pdf"]),
                ("Datos de uso de la última semana", "Adjunto el export con los datos de uso; el pico fue el martes por la "
                 "mañana.", "baja", ["Métricas"], ["uso_semanal.csv"]),
                ("Duda sobre el endpoint de etiquetas", "Una duda: ¿el endpoint de etiquetas debe devolver también las del "
                 "sistema de Gmail o solo las del usuario?", "media", ["Código"], []),
                ("Hoy trabajo desde casa", "Aviso que hoy trabajo desde casa; estoy disponible por chat y en las reuniones.",
                 "baja", ["Equipo"], []),
                ("Re: pendientes de la semana", "Ya cerré mis pendientes de la semana; solo queda revisar el PR de Carlos.",
                 "baja", ["Equipo"], []),
            ])
            return dict(folder="INBOX", sender=p.addr, recipient=acc.email, subject=s,
                        text=f"Hola,\n\n{t}\n\n{p.first}", kind="human", atts=atts, labels=W, urgency=u, tags=tg)

        self.stream(acc, 1.0, 0.0, (8.5, 18.5), colleague)
        self.fresh(acc, colleague, 2, True)

        # --- Continuity with the existing demo mail ---------------------------------
        self.continue_existing_gmail(acc, sofia, carlos, lucia)

        # --- Automated notifications (CATEGORY_UPDATES) ----------------------------------
        gh = "GitHub <notifications@github.com>"
        repo = "empresa/merkemail"

        def github(dt):
            self.pr_counter += 1
            n = self.pr_counter
            author = r.choice([carlos, lucia, diego, vale])
            kind = r.choice(["review", "merged", "ci", "issue", "comment"])
            if kind == "review":
                s = f"[{repo}] {author.first} solicitó tu revisión en el PR #{n}"
                t = f"@{author.first.lower()} solicitó tu revisión en {repo}#{n}.\n\nVer el pull request en GitHub."
            elif kind == "merged":
                s = f"Re: [{repo}] PR #{n} fusionado en main"
                t = f"Fusionado #{n} en main.\n\n{r.randint(2, 14)} archivos cambiados, {r.randint(20, 480)} adiciones."
            elif kind == "ci":
                s = f"[{repo}] Ejecución fallida: CI - main ({r.choice(['a3f9c1e', '7b21d0f', 'e55c812', '0d94ab3'])})"
                t = "El workflow CI falló en la rama main.\n\nJob: tests (python 3.12)\nPaso: pytest -q\n\nVer los detalles en GitHub Actions."
            elif kind == "issue":
                s = f"[{repo}] Nuevo issue #{n}: {r.choice(['Error al adjuntar archivos grandes', 'Mejorar accesibilidad del calendario', 'Traducción incompleta en Ajustes', 'Timeout al sincronizar Proton Bridge'])}"
                t = f"{author.first} abrió el issue #{n}.\n\nResponde a este correo directamente o míralo en GitHub."
            else:
                s = f"Re: [{repo}] PR #{n - r.randint(1, 5)}"
                t = f"{author.first} comentó: \"{r.choice(['LGTM 👍', 'Falta un test para este caso', '¿Podemos extraer esto a un helper?', 'Listo, corregido'])}\""
            return dict(folder="CATEGORY_UPDATES", sender=gh, recipient=acc.email, subject=s, text=t, kind="notification",
                        html_body=html_card("GitHub", "#24292f", s, t.split("\n\n"), "Ver en GitHub",
                                            "Recibes esto porque estás suscrito a este repositorio."),
                        urgency="media" if kind == "ci" else "baja", tags=["GitHub", "Código"])

        self.stream(acc, 2.6, 0.4, (7.5, 20.5), github)

        def sentry(dt):
            err = r.choice(["TimeoutError: IMAP4 read timed out", "sqlite3.OperationalError: database is locked",
                            "KeyError: 'payload'", "ConnectionResetError en sync_mailbox"])
            s = f"[merkemail-backend] {err}"
            t = (f"Nuevo problema en producción: {err}\n\nEventos: {r.randint(3, 120)}  ·  Usuarios afectados: {r.randint(1, 18)}\n\n"
                 "Primer evento: hace unos minutos. Entorno: production.")
            return dict(folder="CATEGORY_UPDATES", sender="Sentry <alerts@sentry.io>", recipient=acc.email, subject=s, text=t,
                        kind="notification", html_body=html_card("Sentry", "#362d59", s, t.split("\n\n"), "Ver problema"),
                        urgency="alta", tags=["Alerta", "Producción"])

        self.stream(acc, 0.6, 0.3, (0, 24), sentry)

        def bank(dt):
            amount = r.choice([129.0, 349.5, 58.9, 1250.0, 89.0, 499.0, 2130.4, 75.5])
            shop = r.choice(["SUPERMERCADO LA ESTRELLA", "GASOLINERA RUTA 5", "CAFETERÍA EL GRANO", "FARMACIA CENTRAL",
                             "CINE PLAZA NORTE", "LIBRERÍA PÁGINAS"])
            s = f"Cargo de ${amount:,.2f} en tu tarjeta terminación 4821"
            t = (f"Se realizó un cargo por ${amount:,.2f} en {shop}.\n\nFecha: {dt:%d/%m/%Y %H:%M}\n\n"
                 "Si no reconoces este movimiento, comunícate de inmediato con nosotros.")
            return dict(folder="CATEGORY_UPDATES", sender="Banco Horizonte <alertas@bancohorizonte.com>", recipient=acc.email,
                        subject=s, text=t, kind="notification", labels=["Facturación"],
                        html_body=html_card("Banco Horizonte", "#0f766e", "Notificación de cargo", t.split("\n\n")),
                        urgency="baja", tags=["Banco", "Finanzas"])

        self.stream(acc, 0.45, 0.7, (8, 22), bank)

        def shop_order(dt):
            self.order_counter += r.randint(3, 40)
            item = r.choice(["Teclado mecánico K8", "Monitor 27\" 4K", "Audífonos inalámbricos", "Hub USB-C 7 en 1",
                             "Soporte para laptop", "Disco SSD 1 TB"])
            status = r.choice(["confirmado", "enviado", "entregado"])
            s = f"Tu pedido #{self.order_counter} ha sido {status}"
            t = f"Hola,\n\nTu pedido #{self.order_counter} ({item}) ha sido {status}.\n\nPuedes seguir el estado desde tu cuenta."
            return dict(folder="CATEGORY_UPDATES", sender="TiendaTech <pedidos@tiendatech.com>", recipient=acc.email,
                        subject=s, text=t, kind="notification",
                        html_body=html_card("TiendaTech", "#ea580c", f"Pedido {status}", t.split("\n\n"), "Ver mi pedido"),
                        urgency="baja", tags=["Compras"])

        self.stream(acc, 0.3, 0.4, (9, 21), shop_order)

        def ride(dt):
            total = r.uniform(58, 240)
            s = f"Tu recibo del viaje del {fecha_larga(dt.date())}"
            t = f"Gracias por viajar con Movi.\n\nTotal: ${total:,.2f} MXN\nDistancia: {r.uniform(3, 19):.1f} km · Duración: {r.randint(11, 48)} min"
            return dict(folder="CATEGORY_UPDATES", sender="Movi <recibos@movi-app.com>", recipient=acc.email, subject=s,
                        text=t, kind="notification", labels=["Facturación"],
                        html_body=html_card("Movi", "#111827", "Recibo de tu viaje", t.split("\n\n")),
                        urgency="baja", tags=["Recibo", "Transporte"])

        self.stream(acc, 0.25, 0.35, (7, 23), ride)

        # Google Cloud (same sender as the demo billing email)
        gc_day = self.rng.choice(self.weekdays())
        pct = r.choice([50, 75, 90])
        self.add(acc, "CATEGORY_UPDATES", "Google Cloud Alerts <notifications@google.com>", acc.email,
                 f"Alerta de presupuesto: {pct}% del presupuesto mensual alcanzado (merkemail-prod)",
                 f"Estimado cliente,\n\nEl proyecto merkemail-prod ha alcanzado el {pct}% de su presupuesto mensual de $30.00 USD.\n"
                 "Revise la consola de Facturación para ver el detalle por servicio.",
                 self.at(gc_day, r.uniform(3, 7)), "notification", labels=["Facturación"], urgency="media",
                 tags=["Facturación", "Cloud"],
                 html_body=html_card("Google Cloud", "#1a73e8", f"Alerta de presupuesto: {pct}%",
                                     [f"El proyecto merkemail-prod ha alcanzado el {pct}% de su presupuesto mensual de $30.00 USD.",
                                      "Revise la consola de Facturación para ver el detalle por servicio."], "Ir a Facturación"))
        sec_day = self.rng.choice(self.day_list())
        self.add(acc, "CATEGORY_UPDATES", "Google <no-reply@accounts.google.com>", acc.email,
                 "Alerta de seguridad: nuevo inicio de sesión en Linux",
                 f"Se detectó un nuevo inicio de sesión en tu cuenta {acc.email} desde un dispositivo Linux.\n\n"
                 "Si fuiste tú, no necesitas hacer nada. Si no, te ayudaremos a proteger tu cuenta.",
                 self.at(sec_day, r.uniform(8, 23)), "notification", urgency="media", tags=["Seguridad"],
                 html_body=html_card("Google", "#4285f4", "Nuevo inicio de sesión en Linux",
                                     [f"Se detectó un nuevo inicio de sesión en tu cuenta {acc.email} desde un dispositivo Linux.",
                                      "Si fuiste tú, no necesitas hacer nada. Si no, te ayudaremos a proteger tu cuenta."],
                                     "Revisar actividad", "Recibiste este correo para informarte de cambios importantes en tu cuenta."))

        # --- Newsletter in INBOX: Tech Weekly continues the existing numbering ------------
        self.tech_weekly(acc)

        # --- Promotions ---------------------------------------------------------------
        black_friday = self.black_friday(self.now.year)

        def promo(dt):
            brand, addr, color, subjects = r.choice([
                ("Ofertas BlackFriday Deals", "promo@shoppingdeals.com", "#111827", [
                    "{bf_countdown}",
                    "Acceso anticipado: hasta 60% en laptops y monitores",
                    "Tu carrito te espera 🛒 + envío gratis solo hoy"]),
                ("ElectroMundo", "ofertas@electromundo.com", "#dc2626", [
                    "🔥 Hot Sale de fin de año: pantallas desde $4,999",
                    "Meses sin intereses en toda la tienda este fin de semana",
                    "Nuevos audífonos con cancelación de ruido, 30% menos"]),
                ("VuelaFácil", "promos@vuelafacil.com", "#0284c7", [
                    "✈️ Vuelos a Cancún desde $1,299 — solo 48 horas",
                    "Escápate en diciembre: paquetes con hotel incluido",
                    "Tu próximo destino te está esperando"]),
                ("Aprende+", "hola@aprendemas.com", "#7c3aed", [
                    "Curso de Python avanzado con 70% de descuento",
                    "🎓 Certifícate en IA generativa este diciembre",
                    "Último día: suscripción anual a mitad de precio"]),
                ("Librería Páginas", "hola@libreriapaginas.com", "#92400e", [
                    "Novedades de la semana: 12 libros que no te puedes perder",
                    "📚 2x1 en novela negra solo este fin de semana"]),
            ])
            bf_days = (black_friday - dt.date()).days
            if bf_days > 1:
                countdown = f"⏰ Faltan {bf_days} días para el Black Friday: regístrate y compra antes"
            elif bf_days == 1:
                countdown = "⏰ ¡Mañana es Black Friday! Acceso anticipado para suscriptores"
            else:
                countdown = "Últimas horas: ofertas de temporada hasta 60% de descuento"
            s = r.choice(subjects).replace("{bf_countdown}", countdown)
            t = (f"Hola,\n\n{r.choice(['Solo para suscriptores', 'Esta semana', 'Por tiempo limitado'])}: aprovecha descuentos "
                 "exclusivos en nuestra tienda en línea. Oferta válida hasta agotar existencias.\n\n"
                 "Para dejar de recibir estos correos, cancela tu suscripción.")
            return dict(folder="CATEGORY_PROMOTIONS", sender=f"{brand} <{addr}>", recipient=acc.email, subject=s, text=t,
                        kind="promo", labels=["Suscripciones"], urgency="baja", tags=["Publicidad", "Ofertas"],
                        html_body=html_card(brand, color, s, [
                            "Aprovecha descuentos exclusivos para suscriptores.",
                            "Oferta por tiempo limitado o hasta agotar existencias."], "Ver ofertas"))

        self.stream(acc, 2.4, 2.0, (7, 22), promo)

        # --- Social -------------------------------------------------------------------
        def social(dt):
            who = r.choice(["Mariana Torres", "Ricardo Paredes", "Elena Vázquez", "Jorge Navarro", "Camila Ruiz", "Tomás Aguilar"])
            s, t = r.choice([
                (f"{who} quiere conectar contigo", f"{who}, Ingeniera/o de Software, quiere conectar contigo en LinkedIn."),
                (f"Tu perfil apareció en {r.randint(5, 60)} búsquedas esta semana", "Descubre quién está viendo tu perfil."),
                (f"{who} comentó tu publicación", f"{who} comentó: \"¡Excelente artículo sobre agentes de IA!\""),
                ("Nuevos empleos que coinciden con tu perfil: Tech Lead Python", "Tech Lead Python · Remoto · 5 empleos nuevos."),
            ])
            return dict(folder="CATEGORY_SOCIAL", sender="LinkedIn <notificaciones@linkedin.com>", recipient=acc.email,
                        subject=s, text=t, kind="social", urgency="baja", tags=["Redes sociales"],
                        html_body=html_card("LinkedIn", "#0a66c2", s, [t], "Ver en LinkedIn"))

        self.stream(acc, 0.9, 0.6, (7, 23), social)

        for d in self.day_list():
            if d.weekday() == 2:  # Wednesdays: meetup announcement
                s = "Meetup de diciembre: FastAPI + agentes de IA en producción"
                t = ("¡Hola, comunidad!\n\nNuestro próximo meetup será presencial y en streaming. Charlas: FastAPI a escala, "
                     "agentes con tool calling y lecciones de producción.\n\nCupo limitado, confirma tu asistencia.")
                self.add(acc, "CATEGORY_SOCIAL", "Comunidad Python Latam <eventos@pythonlatam.org>", acc.email, s, t,
                         self.at(d, r.uniform(17, 19)), "social", labels=["Suscripciones"], urgency="baja",
                         tags=["Evento", "Comunidad"], html_body=html_card("Comunidad Python Latam", "#3776ab", s,
                                                                           t.split("\n\n")[1:], "Confirmar asistencia"))

        # --- Forums / mailing lists ------------------------------------------------------
        topics = ["¿Cómo manejar tareas en segundo plano con FastAPI?", "Pydantic v2: validadores personalizados",
                  "Problema con WebSockets detrás de Nginx", "Buenas prácticas para pruebas con SQLite en memoria",
                  "Despliegue con uvicorn y systemd", "Dependencias con yield y manejo de errores",
                  "OAuth2 con Google: error redirect_uri_mismatch"]

        def forum(dt):
            if r.random() < 0.55:
                k = r.randint(2, 5)
                s = f"Resumen de FastAPI en Español - {k} temas nuevos"
                t = "Temas de hoy:\n\n" + "\n".join(f"- {x}" for x in r.sample(topics, k))
                sender = "FastAPI en Español <fastapi-es@googlegroups.com>"
            else:
                topic = r.choice(topics)
                author = r.choice(["Pedro Salas", "Irene Campos", "Luis Ortega", "Nora Gil"])
                s = f"[fastapi-es] Re: {topic}"
                t = f"{author} escribió:\n\nA mí me funcionó separar la lógica en un servicio y probarlo con TestClient."
                sender = "FastAPI en Español <fastapi-es@googlegroups.com>"
            return dict(folder="CATEGORY_FORUMS", sender=sender, recipient="fastapi-es@googlegroups.com", subject=s, text=t,
                        kind="forum", labels=["Suscripciones"], urgency="baja", tags=["Foro", "Python"])

        self.stream(acc, 1.0, 0.5, (6, 23), forum)

        # --- Spam ------------------------------------------------------------------------
        def spam(dt):
            sender, s, t = r.choice([
                ("Soporte Cuenta <security-alert@g00gle-verify.com>", "⚠️ Su cuenta será suspendida en 24 horas",
                 "Detectamos actividad inusual. Verifique su identidad en el siguiente enlace para evitar la suspensión."),
                ("Premios Internacionales <ganador@premios-mundiales.biz>", "¡FELICIDADES! Usted ha ganado $850,000 USD",
                 "Su dirección de correo fue seleccionada en nuestro sorteo anual. Responda con sus datos bancarios."),
                ("Paquetería Express <entregas@paqxpress-mx.top>", "Su paquete está retenido: pague $29 de aduana",
                 "No pudimos entregar su paquete. Pague la tarifa de aduana para liberar el envío."),
                ("CryptoMax <invest@cryptomax-profit.io>", "Multiplica tu dinero x10 con nuestro bot de trading 🚀",
                 "Rendimientos garantizados del 300% mensual. Plazas limitadas."),
                ("Dr. James Wilson <jwilson.fund@mail-transfer.ru>", "Propuesta confidencial de negocios",
                 "Necesito su ayuda para transferir un fondo de 12.5 millones de dólares. Usted recibirá el 30%."),
                ("Farmacia Online <ventas@pharma-barata.shop>", "Medicamentos sin receta con 80% de descuento",
                 "Envío discreto a todo el país. Sin receta médica."),
                ("Netflix <billing@netflx-pagos.com>", "Problema con tu método de pago",
                 "No pudimos procesar tu último pago. Actualiza tu tarjeta para no perder el acceso."),
            ])
            return dict(folder="SPAM", sender=sender, recipient=acc.email, subject=s, text=t, kind="spam",
                        html_body=f'<div style="font-family:Arial"><h2 style="color:#dc2626">{html.escape(s)}</h2>'
                                  f'<p>{html.escape(t)}</p><p><a href="#" style="background:#16a34a;color:#fff;padding:10px 16px;'
                                  f'text-decoration:none">HAGA CLIC AQUÍ</a></p></div>')

        self.stream(acc, 1.1, 1.1, (0, 24), spam)
        # One false positive: a legitimate client email that landed in Spam (to test "No es spam")
        fp_day = self.rng.choice(self.weekdays()[-5:])
        self.add(acc, "SPAM", "Laura Méndez <lmendez@consultoria-norte.com>", acc.email,
                 "Seguimiento: cotización de licencias para 15 usuarios",
                 "Hola,\n\nLe escribo para dar seguimiento a la cotización que nos envió la semana pasada. "
                 "Nos interesa avanzar con 15 licencias. ¿Podemos agendar una llamada?\n\nSaludos,\nLaura Méndez\nConsultoría Norte",
                 self.at(fp_day, self.work_hour()), "spam")

        # --- Another draft ---------------------------------------------------------------
        self.add(acc, "DRAFT", acc.addr, carlos.email, "Propuesta: notificaciones push para correos urgentes",
                 "Carlos,\n\nEstuve pensando en usar la urgencia que calcula Elio para mandar notificaciones push solo "
                 "cuando llega algo 'alta'. Ideas:\n- Web Push desde el service worker\n- ",
                 self.recent((20, 44), True), "draft")

    def continue_existing_gmail(self, acc: Account, sofia: Person, carlos: Person, lucia: Person) -> None:
        """Replies to the demo planning-meeting email, if it exists in this account."""
        anchor = next((e for e in self.existing if e["account_id"] == acc.id
                       and (e["subject"] or "").startswith("Reunión de Planificación de Proyecto")), None)
        if not anchor:
            return
        try:
            a_dt = datetime.fromisoformat(str(anchor["date"]).replace("Z", "+00:00").replace(" ", "T"))
            if a_dt.tzinfo is None:
                a_dt = a_dt.replace(tzinfo=timezone.utc)
        except ValueError:
            return
        if not (self.window_start - timedelta(days=7) <= a_dt <= self.now):
            return
        subject = anchor["subject"]
        me = Person(acc.name, acc.email)
        team = [carlos, lucia]
        original = anchor["body_text"] or ""
        steps = [
            Step(carlos, [sofia, me], "Confirmo asistencia. Llevo el avance del módulo de sincronización.\n\nCarlos",
                 delay=(1, 4), urgency="baja", tags=["Reunión"]),
            Step(lucia, [sofia, me], "Confirmo. Les comparto antes el reporte de QA del sprint para revisarlo en la sesión.\n\nLucía",
                 delay=(0.5, 5), atts=["Reporte_QA_Sprint.pdf"], urgency="media", tags=["Reunión", "QA"]),
            Step(ME, [sofia], "Confirmado. Agrego a la agenda la revisión del despliegue del calendario.", cc=team,
                 delay=(0.5, 3)),
            Step(sofia, [me], "Perfecto, gracias a todos. Adjunto la agenda final de la sesión.\n\nSofia", cc=team,
                 delay=(3, 20), atts=["Agenda_Revision_Proyecto.pdf"], urgency="media", tags=["Reunión", "Proyecto"],
                 star_p=0.3),
        ]
        # The original email is already in the DB (not re-inserted); the first reply quotes it.
        prev_dt, prev_text, prev_from = a_dt.astimezone(self.tz), original, anchor["sender"]
        for st in steps:
            dt = self.fit_hours(prev_dt + timedelta(hours=self.rng.uniform(*st.delay)), True)
            if dt > self.now:
                break
            quoted = "\n".join("> " + ln if ln else ">" for ln in prev_text.strip().split("\n"))
            body = st.body.rstrip()
            if st.frm is ME and acc.signature:
                body += "\n\n" + acc.signature
            body = f"{body}\n\nEl {fecha_cita(prev_dt)}, {prev_from} escribió:\n{quoted}"
            if st.frm is ME:
                self.add(acc, "SENT", acc.addr, ", ".join(p.email for p in list(st.to) + list(st.cc)),
                         f"Re: {subject}", body, dt, "sent", labels=["Trabajo", "Proyectos"])
                prev_from = acc.addr
            else:
                rcpt = ", ".join([acc.email] + [p.email for p in list(st.to) + list(st.cc)
                                                if p.email not in (acc.email, st.frm.email)])
                self.add(acc, "INBOX", st.frm.addr, rcpt, f"Re: {subject}", body, dt, "human", atts=st.atts,
                         labels=["Trabajo", "Proyectos"], urgency=st.urgency, tags=st.tags, star_p=st.star_p)
                prev_from = st.frm.addr
            prev_dt, prev_text = dt, st.body

    def tech_weekly(self, acc: Account) -> None:
        import re
        anchor = next((e for e in self.existing if e["account_id"] == acc.id
                       and "techweekly" in (e["sender"] or "") and re.search(r"#(\d+)", e["subject"] or "")), None)
        if anchor:
            num = int(re.search(r"#(\d+)", anchor["subject"]).group(1))
            a_dt = datetime.fromisoformat(str(anchor["date"]).replace("Z", "+00:00").replace(" ", "T"))
            if a_dt.tzinfo is None:
                a_dt = a_dt.replace(tzinfo=timezone.utc)
        else:
            num, a_dt = 200, self.window_start - timedelta(days=3, hours=-8)
        topics = ["Agentes de IA con herramientas: patrones que sí funcionan", "Python 3.14: lo que viene",
                  "SQLite en producción: mitos y realidades", "Tailwind 4 y el fin del CSS runtime",
                  "Cómo escalar FastAPI a miles de conexiones", "Privacidad por diseño en apps de correo"]
        k = 1
        while True:
            dt = a_dt + timedelta(days=7 * k)
            if dt > self.now:
                break
            if dt >= self.window_start:
                topic = topics[(num + k) % len(topics)]
                s = f"Boletín Semanal #{num + k}: {topic}"
                t = (f"Hola suscriptor,\n\nEn la edición #{num + k}: {topic}.\n\nAdemás: herramientas de la semana, "
                     "un tutorial práctico y las ofertas de empleo remoto de la comunidad.\n\nPara cancelar suscripción haz clic aquí.")
                self.add(acc, "INBOX", "Tech Weekly Newsletter <news@techweekly.dev>", acc.email, s, t, dt, "newsletter",
                         labels=["Suscripciones"], urgency="baja", tags=["Boletín"],
                         html_body=html_card("Tech Weekly", "#4f46e5", f"Edición #{num + k}", [
                             topic, "Además: herramientas de la semana, un tutorial práctico y ofertas de empleo remoto."],
                             "Leer la edición completa"))
            k += 1

    @staticmethod
    def black_friday(year: int) -> date:
        """Day after the 4th Thursday of November."""
        d = date(year, 11, 1)
        thursdays = [d + timedelta(days=i) for i in range(30) if (d + timedelta(days=i)).weekday() == 3]
        return thursdays[3] + timedelta(days=1)

    # ==================================================================================
    # PROTON account (personal / freelance, privacy-oriented)
    # ==================================================================================
    def gen_proton(self, acc: Account) -> None:
        r = self.rng
        me = Person(acc.name, acc.email)
        laura = Person("Laura Castillo", "laura.castillo@tuta.io")
        javier = Person("Javier Ortega", "javier.ortega@pm.me")
        mama = Person("María López", "maria.lopez@proton.me")
        ana = Person("Ana Beltrán", "ana@estudiobeltran.com")
        paty = Person("Patricia Núñez", "pnunez@despachonunez.mx")
        roberto = Person("Roberto Salinas", "roberto@coworkinglaterraza.com")
        P = ["Personal"]

        self.thread(acc, "Viaje a Oaxaca en diciembre 🎒", [
            Step(laura, [me], (
                "¡Hola!\n\n¿Siempre sí vamos a Oaxaca? Estaba viendo del 27 al 30 de diciembre; encontré una casa en el centro "
                "para 4 personas con buen precio. ¿Qué dicen?\n\nLau"), cc=[javier], urgency="media", tags=["Viaje", "Amigos"]),
            Step(ME, [laura], "¡Va! Esas fechas me quedan perfectas. Yo me encargo de los boletos de autobús.", cc=[javier],
                 delay=(1, 10)),
            Step(javier, [laura, me], "Me apunto 🙌 Yo llevo la cámara. ¿Reservamos ya antes de que suba el precio?",
                 delay=(0.5, 8), tags=["Viaje"]),
            Step(laura, [me], "Listo, ya reservé. Les paso la confirmación; son $1,150 por persona.\n\nLau", cc=[javier],
                 delay=(4, 30), atts=["Reserva_Casa_Oaxaca.pdf"], urgency="media", tags=["Viaje", "Reserva"], star_p=0.5),
        ], self.random_start(False, 2), False, P)

        self.thread(acc, "Consulta: asesoría en seguridad de correo para el estudio", [
            Step(ana, [me], (
                "Hola,\n\nMe recomendaron tu trabajo. En el estudio somos 8 personas y queremos migrar el correo a algo más "
                "seguro (cifrado, 2FA, buenas prácticas). ¿Podrías enviarnos una cotización?\n\nGracias,\nAna Beltrán\nEstudio Beltrán"),
                urgency="alta", tags=["Cliente", "Cotización"], star_p=0.4),
            Step(ME, [ana], (
                "Hola Ana,\n\nCon gusto. Te adjunto la cotización: diagnóstico, migración a Proton for Business, "
                "configuración de 2FA y una sesión de capacitación para el equipo."), delay=(3, 24),
                atts=["Cotizacion_Asesoria_Seguridad_Correo.pdf"]),
            Step(ana, [me], (
                "¡Perfecto! Aceptamos la propuesta. ¿Podríamos empezar la próxima semana? Te comparto los datos de "
                "facturación.\n\nAna"), delay=(18, 50), urgency="alta", tags=["Cliente", "Facturación"], star_p=0.7),
        ], self.random_start(False, 3), True, ["Trabajo", "Facturación"])

        prev_m = self.now.replace(day=1) - timedelta(days=1)
        self.thread(acc, "Documentos pendientes para tu declaración", [
            Step(paty, [me], (
                "Hola,\n\nPara preparar tu declaración necesito tu constancia de situación fiscal actualizada y las facturas "
                f"emitidas de {MESES[prev_m.month - 1]}.\n\nSaludos,\nC.P. Patricia Núñez"), urgency="media", tags=["Impuestos", "Contabilidad"]),
            Step(ME, [paty], "Hola Patricia, te envío ambos documentos. Avísame si falta algo.", delay=(6, 40),
                 atts=["Constancia_Situacion_Fiscal.pdf", f"Facturas_{MESES[prev_m.month - 1].capitalize()}_{prev_m.year}.zip"]),
            Step(paty, [me], "Recibido, todo en orden. Te aviso cuando esté lista.\n\nPatricia", delay=(3, 24),
                 urgency="baja", tags=["Impuestos"]),
        ], self.random_start(True, 2), True, ["Facturación"])

        self.thread(acc, "¿Vienes a comer el domingo?", [
            Step(mama, [me], "Hola hijo/a, ¿vienes a comer el domingo? Voy a hacer mole. Avísame para comprar lo necesario.\n\nBesos, mamá",
                 urgency="baja", tags=["Familia"]),
            Step(ME, [mama], "¡Claro! Llego como a las 2. ¿Llevo algo?", delay=(1, 6)),
            Step(mama, [me], "Trae tortillas y pan dulce. Te esperamos 😊", delay=(0.5, 4), tags=["Familia"]),
        ], self.random_start(False, 1), False, P)

        self.thread(acc, "Fotos de la carne asada 📸", [
            Step(javier, [me], "Aquí van las fotos del sábado. ¡Salieron muy bien!\n\nJavi",
                 atts=["IMG_2041.jpg", "IMG_2044.jpg", "IMG_2050.jpg"], tags=["Amigos", "Fotos"]),
            Step(ME, [javier], "¡Qué buenas! Gracias por pasarlas.", delay=(2, 12)),
        ], self.random_start(False), False, P)

        self.thread(acc, "Renovación de tu membresía del coworking", [
            Step(roberto, [me], (
                "Hola,\n\nTu membresía de escritorio flexible vence a fin de mes. Adjunto la factura de renovación; "
                "puedes pagar por transferencia.\n\nSaludos,\nRoberto Salinas\nCoworking La Terraza"),
                atts=["Factura_Coworking.pdf"], urgency="media", tags=["Factura", "Coworking"]),
        ], self.random_start(True), True, ["Facturación"])

        # Proton system mail (INBOX: Proton has no categories)
        proton_notes = [
            ("Nuevo inicio de sesión en tu cuenta Proton", "Se inició sesión en tu cuenta desde Proton Mail Bridge en Linux. "
             "Si no fuiste tú, cambia tu contraseña de inmediato.", "media", ["Seguridad", "Proton"]),
            ("Proton Mail Bridge: nueva versión disponible", "Hay una nueva versión de Proton Mail Bridge con mejoras de "
             "estabilidad en la sincronización IMAP. Se instalará automáticamente.", "baja", ["Proton", "Actualización"]),
            ("Tu resumen de seguridad mensual", "Este mes se bloquearon 14 rastreadores de correo y 3 intentos de phishing. "
             "Tu cuenta tiene 2FA activado.", "baja", ["Seguridad", "Proton"]),
        ]
        for s, t, u, tg in proton_notes:
            d = r.choice(self.day_list())
            self.add(acc, "INBOX", "Proton <no-reply@proton.me>", acc.email, s, f"Hola,\n\n{t}\n\nEl equipo de Proton",
                     self.at(d, r.uniform(6, 22)), "notification", urgency=u, tags=tg,
                     html_body=html_card("Proton", "#6d4aff", s, [t], None, "Proton AG · Ginebra, Suiza"))
        d = r.choice(self.day_list()[-6:])
        self.add(acc, "INBOX", "Proton Support <support@proton.me>", acc.email,
                 "Consejos de Privacidad: activa las direcciones ocultas",
                 "Hola,\n\nLas direcciones ocultas (alias) te permiten registrarte en servicios sin revelar tu dirección real. "
                 "Actívalas desde Proton Pass.", self.at(d, r.uniform(9, 12)), "newsletter", urgency="baja",
                 tags=["Seguridad", "Proton"], labels=["Suscripciones"])

        for d in self.day_list():
            if d.weekday() == 3:
                s = "Privacidad Digital #%d: rastreadores en correos de marketing" % (60 + d.isocalendar()[1] % 40)
                t = ("Esta semana: cómo detectar píxeles de seguimiento, qué hacer ante una filtración de datos y "
                     "3 herramientas libres para cifrar tus archivos.")
                self.add(acc, "INBOX", "Boletín Privacidad Digital <boletin@privacidaddigital.org>", acc.email, s, t,
                         self.at(d, r.uniform(8.8, 9.3)), "newsletter", labels=["Suscripciones"], urgency="baja",
                         tags=["Boletín", "Privacidad"], html_body=html_card("Privacidad Digital", "#059669", s, [t], "Leer más"))

        def mastodon(dt):
            who = r.choice(["@ana_dev", "@cifrado_mx", "@pythonista", "@linuxlatam", "@privacidad"])
            s, t = r.choice([
                (f"{who} te mencionó", f"{who}: \"Muy buen hilo sobre Proton Bridge, ¿lo usas con clientes IMAP de escritorio?\""),
                (f"{who} comenzó a seguirte", f"{who} ahora te sigue en mastodon.social."),
                (f"{who} impulsó tu publicación", f"{who} impulsó: \"Guía rápida para migrar tu correo a un proveedor cifrado\""),
            ])
            return dict(folder="INBOX", sender="Mastodon <notifications@mastodon.social>", recipient=acc.email,
                        subject=s, text=t, kind="social", urgency="baja", tags=["Redes sociales"],
                        html_body=html_card("Mastodon", "#6364ff", s, [t], "Ver en Mastodon"))

        self.stream(acc, 0.5, 0.7, (8, 23), mastodon)

        d = r.choice(self.weekdays())
        month = MESES[(self.now.month - 2) % 12]  # statement of the previous month
        self.add(acc, "INBOX", "Banco Nube <estados@banconube.mx>", acc.email, f"Tu estado de cuenta de {month} ya está disponible",
                 f"Hola,\n\nTu estado de cuenta correspondiente a {month} está disponible. Por seguridad, el PDF está protegido "
                 "con tu fecha de nacimiento.\n\nBanco Nube", self.at(d, r.uniform(5, 8)), "notification",
                 atts=[f"EstadoCuenta_{month.capitalize()}.pdf"], labels=["Facturación"], urgency="media", tags=["Banco", "Finanzas"])
        d = r.choice(self.day_list())
        self.add(acc, "INBOX", "Fibra Total <facturas@fibratotal.mx>", acc.email, "Tu factura de internet está lista",
                 f"Hola,\n\nTu factura por $549.00 MXN vence el {fecha_larga(next_weekday(d, 8))}. Puedes pagar en línea o "
                 "domiciliar el pago.\n\nFibra Total", self.at(d, r.uniform(7, 10)), "notification", atts=["Factura_FibraTotal.pdf"],
                 labels=["Facturación"], urgency="media", tags=["Factura", "Servicios"])

        def parcel(dt):
            g = r.randint(10_000_000, 99_999_999)
            st = r.choice(["está en camino", "llegará hoy", "fue entregado"])
            return dict(folder="INBOX", sender="EnvíaYa <rastreo@enviaya-mx.com>", recipient=acc.email,
                        subject=f"Tu paquete {st} (guía {g})",
                        text=f"Hola,\n\nTu paquete con guía {g} {st}.\n\nConsulta el rastreo en nuestro sitio.",
                        kind="notification", urgency="baja", tags=["Envío"])

        self.stream(acc, 0.15, 0.1, (9, 19), parcel)

        def friend(dt):
            p = r.choice([laura, javier, mama])
            s, t = r.choice([
                ("¿Nos vemos esta semana?", "¿Tienes tiempo esta semana para un café? Hay varias cosas que contarte."),
                ("Te mandé un mensaje", "Te escribí por Signal pero no me contestaste, ¿todo bien?"),
                ("Receta que me pediste", "Aquí va la receta del pan de elote que te gustó. ¡Luego me cuentas cómo te quedó!"),
            ])
            return dict(folder="INBOX", sender=p.addr, recipient=acc.email, subject=s, text=f"Hola,\n\n{t}\n\n{p.first}",
                        kind="human", labels=P, urgency="baja", tags=["Personal"])

        self.stream(acc, 0.3, 0.5, (9, 22), friend)
        self.fresh(acc, friend, 1, False)

        def proton_spam(dt):
            sender, s, t = r.choice([
                ("Proton Security <no-reply@pr0ton-secure.net>", "Tu buzón está lleno: verifica para seguir recibiendo correos",
                 "Tu almacenamiento superó el límite. Inicia sesión en el enlace para ampliar tu cuota gratis."),
                ("Inversiones Globales <info@global-invest.click>", "Oportunidad única: invierte desde $500",
                 "Rendimientos garantizados. Responde a este correo para recibir información."),
                ("Amazon <pedidos@amaz0n-soporte.com>", "Tu pedido fue cancelado, confirma tus datos",
                 "Hubo un problema con tu pedido. Confirma tus datos de pago en las próximas 12 horas."),
            ])
            return dict(folder="SPAM", sender=sender, recipient=acc.email, subject=s, text=t, kind="spam")

        self.stream(acc, 0.35, 0.35, (0, 24), proton_spam)

        self.add(acc, "DRAFT", acc.addr, ana.email, "Datos para iniciar la asesoría",
                 "Hola Ana,\n\nPara arrancar la próxima semana necesito:\n1. Lista de cuentas a migrar\n2. ",
                 self.recent((1, 10), False), "draft")

    # ==================================================================================
    # COMPANY account on its own mail server (manual IMAP/SMTP configuration)
    # ==================================================================================
    def gen_company(self, acc: Account) -> None:
        """Corporate mailbox of the IT coordinator of a (fictional) logistics company.

        Colleagues' addresses use the account's own domain, server notices come from the
        account's IMAP host, and everything lives in plain IMAP folders (no Gmail categories).
        """
        r = self.rng
        me = Person(acc.name, acc.email)
        domain = acc.email.split("@", 1)[1]
        host = acc.imap_host or f"mail.{domain}"
        company = "Nubaria Logística" if "nubaria" in domain else domain.split(".")[0].capitalize()

        def staff(name: str, user: str) -> Person:
            return Person(name, f"{user}@{domain}")

        director = staff("Fernando Ibarra", "fibarra")
        finanzas = staff("Gabriela Soto", "gsoto")
        operaciones = staff("Raúl Mendoza", "rmendoza")
        almacen = staff("Héctor Vargas", "hvargas")
        rrhh = staff("Mónica Delgado", "mdelgado")
        ventas = staff("Adriana Ponce", "aponce")
        soporte = staff("Iván Castro", "icastro")  # IT support technician (reports to the user)
        todos = Person(f"Todos {company}", f"todos@{domain}")
        compured = Person("Ricardo Lozano", "rlozano@compured.com.mx")
        telenet = Person("Soporte Empresarial TeleNet", "empresas@telenet-soporte.com.mx")
        W = ["Trabajo"]
        RE = "RE:"  # colleagues use Outlook in Spanish

        # --- Purchase of laptops: supplier quote -> finance approval ----------------------
        self.thread(acc, "Solicitud de aprobación: compra de 12 laptops para operaciones", [
            Step(ME, [finanzas], (
                "Hola Gabriela,\n\nTe comparto la cotización de CompuRed para renovar 12 laptops del área de operaciones "
                "(equipos con más de 5 años). El total es de $236,400.00 MXN + IVA, con entrega en 10 días hábiles.\n\n"
                "¿Me ayudas con la aprobación para emitir la orden de compra?"), atts=["Cotizacion_CompuRed_CQ-8841.pdf"]),
            Step(finanzas, [me], (
                "Hola,\n\nRevisé la cotización. Podemos aprobarla si el pago se divide en dos exhibiciones (50% con la orden "
                "y 50% contra entrega). ¿Lo puedes negociar con el proveedor?\n\nSaludos,\nGabriela Soto\nFinanzas"),
                delay=(3, 24), urgency="media", tags=["Compras", "Finanzas"]),
            Step(ME, [compured], (
                "Ricardo, buen día.\n\nFinanzas aprueba la compra si el pago se divide 50% con la orden y 50% contra entrega. "
                "¿Es posible?"), cc=[finanzas], delay=(1, 6)),
            Step(compured, [me], (
                "Buen día,\n\nSin problema, aceptamos el esquema 50/50. En cuanto recibamos la orden de compra programamos "
                "la entrega.\n\nSaludos,\nRicardo Lozano\nEjecutivo de Cuenta | CompuRed"),
                cc=[finanzas], delay=(2, 20), urgency="media", tags=["Compras", "Proveedor"], star_p=0.4),
        ], self.random_start(True, 3), True, ["Trabajo", "Facturación"], RE)

        # --- Operational incident (urgent) -------------------------------------------------
        inc_start = self.random_start(True, 1)
        self.thread(acc, "URGENTE: no funciona el sistema de rastreo de la flotilla", [
            Step(operaciones, [me], (
                "Buenos días,\n\nDesde las 7:00 el sistema de rastreo GPS no muestra la ubicación de las unidades y los "
                "clientes están llamando. ¿Pueden revisarlo lo antes posible?\n\nRaúl Mendoza\nGerente de Operaciones"),
                cc=[soporte], urgency="alta", tags=["Incidente", "Operaciones"], star_p=0.5),
            Step(ME, [operaciones], (
                "Raúl, ya lo estamos revisando con Iván. El proveedor del servicio reporta una falla en su API; "
                "te aviso en cuanto se restablezca."), cc=[soporte], delay=(0.2, 1)),
            Step(soporte, [me], (
                "El servicio ya se restableció. Reinicié el conector del servidor y las unidades vuelven a reportar "
                "ubicación. Dejo el ticket abierto para dar seguimiento.\n\nIván Castro\nSoporte TI"),
                cc=[operaciones], delay=(1, 3), urgency="media", tags=["Incidente"]),
            Step(operaciones, [me], "Confirmado, ya vemos todas las unidades. Gracias por la rápida atención.\n\nRaúl",
                 cc=[soporte], delay=(0.3, 2), urgency="baja", tags=["Incidente"]),
        ], inc_start, True, W, RE)

        # --- New employee account ---------------------------------------------------------
        hire_day = next_weekday(self.now.date() - timedelta(days=6), 5)
        self.thread(acc, "Alta de nuevo colaborador: Sergio Ramírez (Almacén)", [
            Step(rrhh, [me], (
                f"Hola,\n\nEl {fecha_larga(hire_day)} ingresa Sergio Ramírez como Supervisor de Almacén. "
                "Por favor crea su cuenta de correo, usuario del ERP y asígnale un equipo.\n\n"
                "Adjunto el formato de alta firmado.\n\nMónica Delgado\nRecursos Humanos"),
                atts=["Formato_Alta_Sergio_Ramirez.pdf"], urgency="media", tags=["RRHH", "Altas"]),
            Step(ME, [rrhh], (
                f"Listo Mónica. Cuenta creada: sramirez@{domain} (contraseña temporal enviada a su jefe directo). "
                "Usuario del ERP y laptop quedan listos para su primer día."), cc=[soporte], delay=(4, 26)),
            Step(rrhh, [me], "¡Muchas gracias!\n\nMónica", delay=(0.3, 3), tags=["RRHH"]),
        ], self.random_start(True, 2), True, W, RE)

        # --- Monthly IT report for the director -------------------------------------------
        self.thread(acc, "Informe mensual de Sistemas para el comité", [
            Step(director, [me], (
                "Hola,\n\nPara el comité del próximo lunes necesito el informe mensual de Sistemas: incidentes, "
                "disponibilidad de los servidores, avance de proyectos y presupuesto ejercido.\n\n"
                "Fernando Ibarra\nDirector General"), urgency="alta", tags=["Informe", "Dirección"], star_p=0.6),
            Step(ME, [director], (
                "Fernando, te comparto el informe. Resumen: disponibilidad del 99.6%, 41 tickets atendidos, "
                "migración del servidor de correo al 80% y presupuesto ejercido al 72%."),
                delay=(20, 50), atts=["Informe_Sistemas_Mensual.pdf", "Indicadores_TI.xlsx"]),
            Step(director, [me], "Gracias, muy completo. Lo presento el lunes.\n\nFernando", delay=(1, 20),
                 urgency="baja", tags=["Informe"]),
        ], self.random_start(True, 3), True, W, RE)

        # --- Other work mail --------------------------------------------------------------
        self.thread(acc, "El escáner del andén 3 no conecta a la red", [
            Step(almacen, [me], (
                "Buenas tardes,\n\nEl escáner de códigos del andén 3 no se conecta al Wi-Fi desde esta mañana y estamos "
                "capturando a mano. ¿Pueden mandar a alguien?\n\nHéctor Vargas\nJefe de Almacén"),
                urgency="media", tags=["Soporte", "Almacén"]),
            Step(ME, [almacen], "Héctor, Iván pasa en 30 minutos a revisarlo.", cc=[soporte], delay=(0.2, 1.5)),
        ], self.random_start(True), True, W, RE)
        self.thread(acc, "Cotización para cliente: integración EDI con nuestro sistema", [
            Step(ventas, [me], (
                "Hola,\n\nUn cliente nuevo (Distribuidora Norte) nos pide integración EDI para enviar sus órdenes. "
                "¿Es viable con nuestro ERP? Necesito una estimación para incluirla en la propuesta.\n\n"
                "Adriana Ponce\nGerente Comercial"), urgency="media", tags=["Ventas", "Proyecto"]),
            Step(ME, [ventas], (
                "Adriana, sí es viable. Estimo 3 semanas de trabajo con el proveedor del ERP. "
                "Te paso el detalle técnico para la propuesta."), delay=(4, 30), atts=["Estimacion_Integracion_EDI.docx"]),
        ], self.random_start(True, 2), True, ["Trabajo", "Proyectos"], RE)
        maint_start = self.random_start(True, 2)
        maint_day = next_weekday(maint_start.date(), 2)
        self.thread(acc, f"Mantenimiento programado del servidor de correo - {fecha_larga(maint_day)}", [
            Step(ME, [todos], (
                f"Estimados compañeros:\n\nEl {fecha_larga(maint_day)} de 21:00 a 23:00 realizaremos mantenimiento al "
                "servidor de correo. Durante ese horario no podrán enviar ni recibir mensajes; los correos entrantes "
                "se entregarán al terminar.\n\nGracias por su comprensión."), subject=None),
        ], maint_start, True, W, RE)

        # --- Periodic company mail ------------------------------------------------------
        for d in self.day_list():
            if d.day == 15 or (d + timedelta(days=1)).day == 1:  # payroll: 15th and last day of month
                self.add(acc, "INBOX", f"Nómina {company} <nomina@{domain}>", acc.email,
                         f"Recibo de nómina - quincena del {d:%d/%m/%Y}",
                         "Estimado colaborador:\n\nAdjunto encontrarás tu recibo de nómina (CFDI) correspondiente a "
                         "esta quincena. Cualquier aclaración, comunícate con Recursos Humanos.",
                         self.at(d, r.uniform(6, 8)), "notification", atts=[f"Recibo_Nomina_{d:%Y%m%d}.pdf",
                                                                             f"Recibo_Nomina_{d:%Y%m%d}.xml"],
                         labels=["Personal"], urgency="baja", tags=["Nómina"])
            if d.weekday() == 0:
                self.add(acc, "INBOX", f"Comunicación Interna <comunicacion@{domain}>", todos.email,
                         f"Boletín interno {company} - semana {d.isocalendar()[1]}",
                         "Esta semana: resultados de entregas a tiempo (96.8%), bienvenida a nuevos colaboradores, "
                         "recordatorio del simulacro de evacuación del jueves y menú del comedor.",
                         self.at(d, r.uniform(9, 10)), "newsletter", urgency="baja", tags=["Comunicado"],
                         html_body=html_card(f"{company} · Comunicación Interna", "#b45309",
                                             f"Boletín de la semana {d.isocalendar()[1]}", [
                                                 "Entregas a tiempo: 96.8% (meta 95%).",
                                                 "Bienvenida a los nuevos colaboradores de Almacén y Ventas.",
                                                 "Jueves: simulacro de evacuación a las 11:00."], None,
                                             "Uso interno. No reenviar fuera de la organización."))
            if d.weekday() < 6:
                ok = r.random() < 0.85
                self.add(acc, "INBOX", f"Respaldos <backup@srv-backup01.{domain}>", acc.email,
                         f"[{'OK' if ok else 'ERROR'}] Respaldo nocturno {d:%Y-%m-%d} - srv-erp01",
                         (f"Trabajo: respaldo-erp-diario\nEstado: {'Completado' if ok else 'Fallido'}\n"
                          f"Tamaño: {r.uniform(38, 46):.1f} GB\nDuración: {r.randint(42, 75)} min\n"
                          + ("" if ok else "Error: no hay espacio suficiente en el volumen de destino /mnt/backup\n")),
                         self.at(d, r.uniform(2.5, 4.5)), "notification", urgency="baja" if ok else "alta",
                         tags=["Respaldo", "Servidor"])

        # Help desk tickets
        ticket = [r.randint(4800, 4900)]

        def helpdesk(dt):
            ticket[0] += r.randint(1, 4)
            who = r.choice([almacen, operaciones, ventas, finanzas, rrhh, staff("Luis Peña", "lpena"), staff("Carmen Ruiz", "cruiz")])
            issue = r.choice(["No puedo entrar al ERP", "La impresora de recepción no imprime", "Solicito acceso a la carpeta de Compras",
                              "Mi correo no sincroniza en el celular", "Cambio de contraseña", "El monitor parpadea",
                              "Necesito instalar el lector de PDF", "No llegan correos de un cliente"])
            status = r.choice(["Nuevo ticket", "Nuevo ticket", "Ticket asignado a Iván Castro", "Ticket resuelto"])
            return dict(folder="INBOX", sender=f"Mesa de Ayuda <mesadeayuda@{domain}>", recipient=acc.email,
                        subject=f"[Ticket #{ticket[0]}] {status}: {issue}",
                        text=f"{status}\n\nSolicitante: {who.name}\nAsunto: {issue}\nPrioridad: "
                             f"{r.choice(['Baja', 'Media', 'Media', 'Alta'])}\n\nResponde a este correo para agregar un comentario al ticket.",
                        kind="notification", urgency="media" if status == "Nuevo ticket" else "baja", tags=["Ticket", "Soporte"])

        self.stream(acc, 2.2, 0.1, (8, 19), helpdesk)

        # Monitoring alerts
        def zabbix(dt):
            server, problem = r.choice([("srv-erp01", "Uso de CPU > 90% por 5 min"), ("srv-mail01", "Cola de correo > 200 mensajes"),
                                        ("srv-files01", "Espacio libre en disco < 10%"), ("fw-principal", "Latencia alta al ISP"),
                                        ("srv-backup01", "Servicio de respaldo detenido")])
            resolved = r.random() < 0.5
            s = f"{'Resuelto' if resolved else 'Problema'}: {problem} en {server}"
            return dict(folder="INBOX", sender=f"Zabbix <zabbix@{domain}>", recipient=acc.email, subject=s,
                        text=f"{s}\n\nHost: {server}\nSeveridad: {r.choice(['Advertencia', 'Alta'])}\n"
                             f"Hora del evento: {dt:%H:%M:%S} {dt:%Y-%m-%d}", kind="notification",
                        urgency="baja" if resolved else "alta", tags=["Monitoreo", "Servidor"])

        self.stream(acc, 0.9, 0.5, (0, 24), zabbix)

        # Mail-server notices: bounces and quota (typical of self-hosted mail)
        for _ in range(2):
            d = r.choice(self.weekdays())
            bad = r.choice(["compras@proveedor-inexistente.mx", "j.martinez@clientenorte.com.mx", "facturacion@transportesdelvalle.mx"])
            self.add(acc, "INBOX", f"Mail Delivery System <MAILER-DAEMON@{host}>", acc.email,
                     "Undelivered Mail Returned to Sender",
                     f"This is the mail system at host {host}.\n\nI'm sorry to have to inform you that your message could "
                     f"not be delivered to one or more recipients.\n\n<{bad}>: host mx.{bad.split('@')[1]} said: "
                     "550 5.1.1 User unknown (in reply to RCPT TO command)",
                     self.at(d, self.work_hour()), "notification", urgency="media", tags=["Correo rebotado"],
                     html_body=None)
        d = r.choice(self.day_list()[-4:])
        self.add(acc, "INBOX", f"Postmaster <postmaster@{domain}>", acc.email,
                 "Aviso: tu buzón está al 91% de su capacidad",
                 "Tu buzón utiliza 4.55 GB de 5 GB. Cuando llegue al 100% no podrás recibir correos nuevos.\n\n"
                 "Te recomendamos vaciar la Papelera y archivar los mensajes antiguos.",
                 self.at(d, r.uniform(0, 6)), "notification", urgency="alta", tags=["Servidor de correo", "Cuota"])

        # Suppliers / ISP / newsletters
        d = r.choice(self.weekdays())
        self.add(acc, "INBOX", compured.addr, acc.email, "Factura CompuRed F-20931",
                 "Buen día,\n\nAdjuntamos la factura F-20931 (PDF y XML) correspondiente a consumibles de impresión.\n\n"
                 "Saludos,\nCuentas por Cobrar | CompuRed", self.at(d, self.work_hour()), "notification",
                 atts=["F-20931.pdf", "F-20931.xml"], labels=["Facturación"], urgency="media", tags=["Factura", "Proveedor"])
        d = r.choice(self.weekdays())
        self.add(acc, "INBOX", telenet.addr, acc.email, "Aviso de mantenimiento en su enlace dedicado",
                 f"Estimado cliente:\n\nEl {fecha_larga(next_weekday(d, 3))} entre 01:00 y 04:00 realizaremos trabajos de "
                 "mantenimiento en nuestra red. Su enlace dedicado podría presentar intermitencias.\n\nTeleNet Empresas",
                 self.at(d, r.uniform(10, 13)), "notification", urgency="media", tags=["Proveedor", "Internet"])

        for d in self.day_list():
            if d.weekday() == 1:
                s = f"Alertas de ciberseguridad de la semana: {r.choice(['ransomware en pymes', 'phishing con facturas falsas', 'vulnerabilidad crítica en VPN'])}"
                t = ("Resumen semanal de vulnerabilidades y campañas activas en la región, con recomendaciones "
                     "para equipos de TI de empresas medianas.")
                self.add(acc, "INBOX", "CERT Latam <boletin@cert-latam.org>", acc.email, s, t, self.at(d, r.uniform(7, 9)),
                         "newsletter", labels=["Suscripciones"], urgency="baja", tags=["Ciberseguridad", "Boletín"],
                         html_body=html_card("CERT Latam", "#1e3a8a", s, [t], "Leer el boletín"))
            if d.weekday() == 3:
                s = "Webinar: cómo reducir costos logísticos con visibilidad en tiempo real"
                t = "Te invitamos a nuestro webinar gratuito del próximo martes a las 10:00. Cupo limitado."
                self.add(acc, "INBOX", "Expo Logística <eventos@expologistica.com.mx>", acc.email, s, t,
                         self.at(d, r.uniform(11, 13)), "promo", labels=["Suscripciones"], urgency="baja", tags=["Evento"],
                         html_body=html_card("Expo Logística", "#0e7490", s, [t], "Registrarme"))

        # Short messages from colleagues + guaranteed fresh mail
        def colleague(dt):
            p = r.choice([finanzas, operaciones, almacen, rrhh, ventas, soporte])  # the director has his own thread
            s, t, u, tg, atts = r.choice([
                ("Reunión de seguimiento", "¿Podemos vernos mañana a las 10 en la sala de juntas para revisar pendientes?",
                 "media", ["Reunión"], []),
                ("Acceso al sistema de facturación", "¿Me puedes dar acceso al módulo de facturación? Mi jefe ya lo autorizó.",
                 "media", ["Accesos"], []),
                ("Reporte de inventario", "Te comparto el reporte de inventario de equipo de cómputo que me pediste.",
                 "baja", ["Inventario"], ["Inventario_Equipo_Computo.xlsx"]),
                ("Correo sospechoso", "Me llegó un correo pidiendo actualizar mi contraseña, ¿es legítimo? Te lo reenvío.",
                 "alta", ["Seguridad"], []),
                ("Proyector de la sala de juntas", "El proyector de la sala de juntas no enciende; tenemos presentación a las 4.",
                 "media", ["Soporte"], []),
            ])
            return dict(folder="INBOX", sender=p.addr, recipient=acc.email, subject=s,
                        text=f"Hola,\n\n{t}\n\nSaludos,\n{p.name}", kind="human", atts=atts, labels=W, urgency=u, tags=tg)

        self.stream(acc, 1.3, 0.0, (8.5, 18.5), colleague)
        self.fresh(acc, colleague, 2, True)

        # Spam that reaches a company server (impersonation, fake invoices)
        def spam(dt):
            sender, s, t = r.choice([
                (f"{director.name} <direccion.general.{domain.split('.')[0]}@gmail-ejecutivos.com>", "¿Estás disponible?",
                 "Necesito que me ayudes con un pago urgente a un proveedor. No puedo hablar ahora, estoy en junta. "
                 "Respóndeme por este medio."),
                ("Facturación Electrónica <cfdi@factura-sat-mx.info>", "Factura electrónica pendiente de pago #A-99812",
                 "Adjuntamos su factura electrónica. Descargue el archivo comprimido para ver el detalle."),
                ("Administrador de correo <admin@webmail-actualizacion.net>", f"Su cuenta {acc.email} será desactivada",
                 "Su buzón superó el límite. Valide su cuenta en las próximas 24 horas para no perder sus mensajes."),
                ("Global Freight Partners <sales@globalfreight-leads.biz>", "Base de datos de 50,000 empresas de logística",
                 "Vendemos bases de datos verificadas de contactos de logística en México. Precio especial esta semana."),
                ("DHL Express <notificacion@dhl-entregas-mx.top>", "Envío retenido: confirme dirección de entrega",
                 "Su envío no pudo ser entregado. Confirme su dirección y pague el cargo de reenvío."),
            ])
            return dict(folder="SPAM", sender=sender, recipient=acc.email, subject=s, text=t, kind="spam",
                        atts=["Factura_A-99812.zip"] if "Factura" in s else [])

        self.stream(acc, 1.0, 0.8, (0, 24), spam)

        self.add(acc, "DRAFT", acc.addr, todos.email, "Nueva política de contraseñas y doble factor",
                 "Estimados compañeros:\n\nA partir del próximo mes será obligatorio:\n- Contraseñas de al menos 12 caracteres.\n"
                 "- Doble factor de autenticación en el correo y la VPN.\n- ",
                 self.recent((2, 30), True), "draft")

    # ==================================================================================
    # Second GMAIL account: personal / consumer life
    # ==================================================================================
    def gen_gmail_personal(self, acc: Account) -> None:
        r = self.rng
        me = Person(acc.name, acc.email)
        coach = Person("Daniel Flores", "coach@clubcorredoresbosque.mx")
        casero = Person("Jorge Medina", "jorge.medina.rentas@gmail.com")
        profe = Person("Dra. Elena Cárdenas", "ecardenas@diplomados-uvirtual.edu.mx")
        hermana = Person("Paola Demo", "paola.demo@gmail.com")
        taller = Person("Taller Automotriz Sánchez", "servicio@tallersanchez.mx")
        amigo = Person("Rodrigo Lara", "rodrigo.lara@gmail.com")
        P = ["Personal"]

        race_day = self.now.date() + timedelta(days=(6 - self.now.weekday()) % 7 + 7)
        self.thread(acc, f"Carrera 10K del {fecha_larga(race_day)}: inscripción del club", [
            Step(coach, [me], (
                f"¡Hola, corredores!\n\nYa está abierta la inscripción para la carrera 10K del {fecha_larga(race_day)}. "
                "El club cubre el 50% de la inscripción para quienes confirmen antes del viernes.\n\n"
                "Entrenamiento especial: martes y jueves 6:30 en el parque.\n\nCoach Daniel"),
                urgency="media", tags=["Deporte", "Evento"]),
            Step(ME, [coach], "¡Me apunto! Ya hice el pago de mi parte.", delay=(2, 20)),
            Step(coach, [me], "¡Excelente! Te adjunto tu confirmación y el plan de entrenamiento.\n\nDaniel",
                 delay=(1, 12), atts=["Confirmacion_Inscripcion_10K.pdf", "Plan_Entrenamiento_10K.pdf"],
                 urgency="baja", tags=["Deporte"], star_p=0.3),
        ], self.random_start(False, 2), False, P)

        self.thread(acc, "Renta de diciembre y reparación del calentador", [
            Step(ME, [casero], (
                "Hola Don Jorge,\n\nLe aviso que el calentador del departamento dejó de encender desde ayer. "
                "¿Podría mandar a alguien a revisarlo? Por cierto, la renta de diciembre se la deposito el día 1 como siempre.")),
            Step(casero, [me], (
                "Hola, gracias por avisar. El jueves en la tarde pasa el técnico. Sin problema con la renta.\n\nSaludos,\nJorge Medina"),
                delay=(2, 18), urgency="media", tags=["Hogar"]),
            Step(ME, [casero], "Perfecto, ahí estaré. Gracias.", delay=(0.5, 5)),
        ], self.random_start(False, 2), False, P, "RE:")

        hw_start = self.random_start(True, 2)
        due = next_weekday(hw_start.date(), 4)
        self.thread(acc, "Diplomado en Ciencia de Datos - Tarea 4: regresión logística", [
            Step(profe, [me], (
                f"Estimados participantes:\n\nLa Tarea 4 (regresión logística) vence el {fecha_larga(due)} a las 23:59. "
                "Adjunto el enunciado y el dataset.\n\nDra. Elena Cárdenas"),
                atts=["Tarea4_Enunciado.pdf", "dataset_clientes.csv"], urgency="alta", tags=["Estudios", "Tarea"], star_p=0.6),
            Step(ME, [profe], "Buenas tardes, Dra. Cárdenas. Le envío mi tarea 4. Saludos.", delay=(40, 80),
                 atts=["Tarea4_Solucion.ipynb"]),
            Step(profe, [me], "Recibida. Calificación: 9.5. Muy buen análisis de las variables.\n\nDra. Cárdenas",
                 delay=(20, 60), urgency="baja", tags=["Estudios", "Calificación"]),
        ], hw_start, True, ["Personal", "Proyectos"])

        self.thread(acc, "Regalo de Navidad para mamá 🎁", [
            Step(hermana, [me], (
                "¡Hola!\n\n¿Qué te parece si este año le regalamos a mamá una tablet para las videollamadas con la familia? "
                "Vi una en oferta de $4,200, salimos a $2,100 cada quien.\n\nPao"), urgency="baja", tags=["Familia"]),
            Step(ME, [hermana], "¡Me parece perfecto! Cómprala tú y te transfiero mi parte.", delay=(1, 10)),
            Step(hermana, [me], "Va, ya la pedí. Te paso la cuenta: CLABE 0121 8000 1234 5678 90.\n\nPao", delay=(1, 24),
                 tags=["Familia"]),
        ], self.random_start(False, 1), False, P)

        self.thread(acc, "Cotización servicio de 60,000 km", [
            Step(taller, [me], (
                "Buen día,\n\nLe enviamos la cotización del servicio de 60,000 km para su vehículo: cambio de aceite, filtros, "
                "bujías y revisión de frenos. Total: $4,850.00 con IVA.\n\nTaller Automotriz Sánchez"),
                atts=["Cotizacion_Servicio_60000km.pdf"], urgency="media", tags=["Auto", "Cotización"]),
            Step(ME, [taller], "Gracias. ¿Tienen espacio el sábado a las 9:00?", delay=(3, 30)),
            Step(taller, [me], "Sí, queda agendado el sábado a las 9:00. Lo esperamos.", delay=(1, 6), tags=["Auto"]),
        ], self.random_start(True, 2), True, P)

        self.thread(acc, "¿Partido del jueves?", [
            Step(amigo, [me], "¿Vas al fútbol del jueves? Nos falta uno para completar el equipo ⚽\n\nRodrigo",
                 tags=["Amigos", "Deporte"]),
            Step(ME, [amigo], "¡Cuenta conmigo!", delay=(0.5, 8)),
        ], self.random_start(False), False, P)

        # Updates (bills, subscriptions, deliveries, bank)
        def updates(dt):
            kind = r.choice(["stream", "music", "market", "bank", "phone", "delivery", "market"])
            if kind == "stream":
                s, t, brand, color = ("Tu recibo de Streamly", f"Gracias por tu pago de $219.00 MXN por el plan Estándar "
                                      f"({MESES[dt.month - 1]}).", "Streamly", "#e50914")
            elif kind == "music":
                s, t, brand, color = ("Tu resumen semanal en Sonora Music", "Escuchaste 14 h de música esta semana. "
                                      "Tu artista más escuchado: Natalia Lafourcade.", "Sonora Music", "#1db954")
            elif kind == "market":
                self.order_counter += r.randint(3, 40)
                item = r.choice(["Tenis para correr", "Licuadora", "Funda para celular", "Libro 'Hábitos atómicos'",
                                 "Lámpara de escritorio", "Mochila de hidratación"])
                st = r.choice(["está en camino", "fue entregado", "fue confirmado"])
                s, t, brand, color = (f"Tu compra #{self.order_counter} {st}", f"{item}: tu compra {st}.",
                                      "MercadoPlus", "#facc15")
            elif kind == "bank":
                amt = r.choice([320.5, 1249.0, 89.9, 560.0, 2150.0, 45.0])
                s, t, brand, color = (f"Compra aprobada por ${amt:,.2f} con tu tarjeta Kora",
                                      f"Compra aprobada por ${amt:,.2f} MXN. Si no la reconoces, bloquea tu tarjeta desde la app.",
                                      "Kora", "#7c3aed")
            elif kind == "phone":
                s, t, brand, color = ("Tu factura MóvilMax está lista", "Tu factura por $399.00 MXN está disponible. "
                                      "Plan ilimitado 20 GB.", "MóvilMax", "#0ea5e9")
            else:
                s, t, brand, color = ("Tu pedido de Comida Ya va en camino 🛵", "Tu repartidor llegará en 15-25 minutos.",
                                      "Comida Ya", "#ef4444")
            addr = {"Streamly": "recibos@streamly.tv", "Sonora Music": "no-reply@sonoramusic.com",
                    "MercadoPlus": "compras@mercadoplus.com.mx", "Kora": "alertas@kora.mx",
                    "MóvilMax": "facturas@movilmax.mx", "Comida Ya": "pedidos@comidaya.app"}[brand]
            return dict(folder="CATEGORY_UPDATES", sender=f"{brand} <{addr}>", recipient=acc.email, subject=s, text=t,
                        kind="notification", labels=["Facturación"] if kind in ("stream", "bank", "phone") else [],
                        urgency="baja", tags=["Notificación", brand],
                        html_body=html_card(brand, color, s, [t], "Ver detalles"))

        self.stream(acc, 1.8, 2.0, (7, 23), updates)

        def promo(dt):
            brand, addr, color, subjects = r.choice([
                ("SuperAhorro", "ofertas@superahorro.com.mx", "#16a34a", ["🛒 Martes de frescura: frutas y verduras al 2x1",
                                                                         "Cupón de $150 en tu próxima compra en línea"]),
                ("Moda Urbana", "hola@modaurbana.mx", "#db2777", ["Nueva colección de invierno ❄️", "Hasta 50% en chamarras"]),
                ("DeporTotal", "promos@deportotal.com.mx", "#f97316", ["Tenis para correr con 30% de descuento 🏃",
                                                                      "Todo para tu próximo 10K"]),
                ("Comida Ya", "promos@comidaya.app", "#ef4444", ["🍕 Envío gratis en tu próximo pedido", "2x1 en hamburguesas hoy"]),
                ("VuelaFácil", "promos@vuelafacil.com", "#0284c7", ["Vacaciones de invierno: vuelos desde $999",
                                                                   "Último día de precios especiales a la playa"]),
                ("Streamly", "novedades@streamly.tv", "#e50914", ["Nuevos estrenos esta semana 🎬"]),
            ])
            s = r.choice(subjects)
            t = "Hola,\n\nOfertas seleccionadas para ti. Válido por tiempo limitado.\n\nPara darte de baja, haz clic aquí."
            return dict(folder="CATEGORY_PROMOTIONS", sender=f"{brand} <{addr}>", recipient=acc.email, subject=s, text=t,
                        kind="promo", labels=["Suscripciones"], urgency="baja", tags=["Publicidad"],
                        html_body=html_card(brand, color, s, ["Ofertas seleccionadas para ti.", "Válido por tiempo limitado."],
                                            "Ver ofertas"))

        self.stream(acc, 3.2, 3.6, (7, 22.5), promo)

        def social(dt):
            who = r.choice(["Pao", "Rodrigo", "Mariana", "Luis", "Tía Carmen", "Beto"])
            brand, addr, color, s = r.choice([
                ("Fotogram", "no-reply@fotogram.app", "#c026d3", f"A {who} le gustó tu foto"),
                ("Fotogram", "no-reply@fotogram.app", "#c026d3", f"{who} publicó una historia por primera vez en un tiempo"),
                ("RunTrack", "kudos@runtrack.app", "#ea580c", f"{who} y 4 personas más te dieron kudos por tu carrera"),
                ("RunTrack", "kudos@runtrack.app", "#ea580c", "Tu resumen semanal: 21.4 km corridos 🏃"),
                ("Vecinos Conectados", "avisos@vecinosconectados.mx", "#0d9488", "Nueva publicación en tu colonia: corte de agua el sábado"),
            ])
            return dict(folder="CATEGORY_SOCIAL", sender=f"{brand} <{addr}>", recipient=acc.email, subject=s, text=s,
                        kind="social", urgency="baja", tags=["Redes sociales"], html_body=html_card(brand, color, s, [s], "Abrir"))

        self.stream(acc, 1.5, 2.0, (7, 23.5), social)

        def forum(dt):
            book = r.choice(["Pedro Páramo", "La casa de los espíritus", "Cien años de soledad", "El túnel"])
            author = r.choice(["Lucía M.", "Andrés P.", "Fer G.", "Sofía R."])
            s, t = r.choice([
                (f"[Café y Letras] Lectura de diciembre: {book}", f"{author} escribió:\n\nPropongo {book} para diciembre. ¿Votamos?"),
                ("[Café y Letras] Re: Lugar de la próxima reunión", f"{author} escribió:\n\n¿Qué tal la cafetería de la plaza? Tiene mesas grandes."),
                ("[Café y Letras] Resumen de la reunión", f"{author} escribió:\n\nGracias a todos por venir. Adjunto las notas de la sesión."),
            ])
            return dict(folder="CATEGORY_FORUMS", sender="Club de Lectura Café y Letras <cafe-y-letras@googlegroups.com>",
                        recipient="cafe-y-letras@googlegroups.com", subject=s, text=t, kind="forum",
                        labels=["Suscripciones"], urgency="baja", tags=["Club de lectura"])

        self.stream(acc, 0.5, 0.8, (8, 23), forum)

        d = r.choice(self.day_list())
        self.add(acc, "INBOX", "Clínica Dental Sonrisa <citas@clinicasonrisa.mx>", acc.email, "Confirmación de tu cita",
                 f"Hola,\n\nTe recordamos tu cita de limpieza dental el {fecha_larga(next_weekday(d, 2))} a las 17:30. "
                 "Responde CONFIRMO para confirmar.\n\nClínica Dental Sonrisa", self.at(d, r.uniform(9, 12)), "notification",
                 urgency="media", tags=["Salud", "Cita"])

        def friend(dt):
            p = r.choice([hermana, amigo, Person("Mariana Ríos", "mariana.rios@hotmail.com")])
            s, t = r.choice([("Fotos del cumpleaños 🎂", "¡Aquí van las fotos del cumpleaños! Salieron muy bien."),
                             ("¿Comemos el sábado?", "¿Te late comer el sábado en el lugar nuevo de tacos?"),
                             ("Link del concierto", "Te paso el link para comprar los boletos del concierto, ¡se acaban rápido!")])
            return dict(folder="INBOX", sender=p.addr, recipient=acc.email, subject=s, text=f"Hola,\n\n{t}\n\n{p.first}",
                        kind="human", labels=P, urgency="baja", tags=["Amigos"],
                        atts=["IMG_3301.jpg", "IMG_3305.jpg"] if s.startswith("Fotos") else [])

        self.stream(acc, 0.4, 0.8, (9, 22.5), friend)
        self.fresh(acc, friend, 2, False)

        def spam(dt):
            sender, s, t = r.choice([
                ("Ganador Oficial <premios@tusorteo-ganador.win>", "🎉 ¡Ganaste un iPhone 16! Reclámalo hoy",
                 "Eres el visitante número 1,000,000. Completa la encuesta para reclamar tu premio."),
                ("Kora Seguridad <alertas@kora-verificacion.co>", "Tu tarjeta Kora fue bloqueada",
                 "Detectamos un cargo sospechoso. Ingresa tus datos para desbloquear tu tarjeta."),
                ("Citas Online <match@amor-express.love>", "Alguien cerca de ti quiere conocerte 💕",
                 "Tienes 3 mensajes nuevos sin leer. Regístrate gratis para verlos."),
                ("Empleo Desde Casa <rh@trabajo-facil-ya.biz>", "Gana $3,000 diarios desde tu casa",
                 "Sin experiencia. Solo necesitas un celular. Cupo limitado."),
            ])
            return dict(folder="SPAM", sender=sender, recipient=acc.email, subject=s, text=t, kind="spam")

        self.stream(acc, 0.9, 1.1, (0, 24), spam)

        self.add(acc, "DRAFT", acc.addr, "aclaraciones@kora.mx", "Aclaración: cargo duplicado en mi tarjeta",
                 "Hola,\n\nEn mi estado de cuenta aparece dos veces el mismo cargo por $1,249.00 del día ",
                 self.recent((1, 30), False), "draft")

    # ==================================================================================
    # User behaviour: read/unread, stars, archive, trash, labels, AI analysis
    # ==================================================================================
    def apply_user_behaviour(self) -> None:
        r = self.rng
        today = self.now.date()
        read_p = {  # (today, yesterday, older)
            "human": (0.35, 0.85, 0.97), "notification": (0.25, 0.6, 0.85), "newsletter": (0.1, 0.45, 0.7),
            "promo": (0.08, 0.3, 0.45), "social": (0.2, 0.5, 0.7), "forum": (0.1, 0.35, 0.55), "spam": (0.0, 0.03, 0.05),
        }
        for m in self.msgs:
            age = (today - m.date.astimezone(self.tz).date()).days
            if m.kind in ("sent", "draft"):
                m.is_read = 1
            elif m.force_unread:
                m.is_read = 0
            else:
                p = read_p[m.kind][0 if age == 0 else 1 if age == 1 else 2]
                m.is_read = 1 if r.random() < p else 0
            if m.star_p and r.random() < m.star_p:
                m.is_starred = 1
            elif m.kind == "human" and r.random() < 0.04:
                m.is_starred = 1
            elif m.kind == "sent" and m.attachments and r.random() < 0.3:
                m.is_starred = 1

            # Tidy-up actions the user took on older mail
            if age >= 2 and m.folder in ("INBOX", "CATEGORY_UPDATES", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"):
                if m.kind == "promo" and r.random() < 0.22:
                    m.folder = "TRASH"
                elif m.kind in ("notification", "social") and m.is_read and r.random() < 0.08:
                    m.folder = "TRASH"
                elif m.kind == "human" and m.is_read and not m.is_starred and age >= 4 and r.random() < 0.2:
                    m.folder = "ARCHIVE"
                elif m.kind == "newsletter" and m.is_read and r.random() < 0.25:
                    m.folder = "ARCHIVE"
            if m.folder in ("TRASH", "SPAM"):
                m.is_starred = 0
                m.labels = []

            # Not everything is labelled by the user, and not everything was analysed by Elio (AI)
            if m.labels and r.random() > 0.75:
                m.labels = []
            if m.kind in ("spam", "sent", "draft") or r.random() > 0.6:
                m.ai_urgency, m.ai_tags = None, None


# --------------------------------------------------------------------------------------
# DB
# --------------------------------------------------------------------------------------
def connect(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(db_path), timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def seed_addresses(conn: sqlite3.Connection) -> set:
    """Addresses that appear in seed mail (used to clean the contacts that the app derived from it)."""
    import email.utils
    addrs = set()
    for row in conn.execute("SELECT sender, recipient FROM emails WHERE uid LIKE ?", (SEED_PREFIX + "%",)):
        for fld in (row["sender"], row["recipient"]):
            for part in str(fld or "").split(","):
                a = email.utils.parseaddr(part.strip())[1].lower().strip()
                if a:
                    addrs.add(a)
    return addrs


def purge(conn: sqlite3.Connection) -> Dict[str, int]:
    addrs = seed_addresses(conn)
    ids = "SELECT id FROM emails WHERE uid LIKE :p"
    p = {"p": SEED_PREFIX + "%"}
    res = {
        # calendar items created by tests/generate_test_calendar.py that point to seed mail lose the link
        # (re-run that script with --reset after regenerating mail to link them to the new emails)
        "event_links_cleared": conn.execute(f"UPDATE events SET origin_email_id = NULL WHERE origin_email_id IN ({ids})", p).rowcount,
        "email_labels": conn.execute(f"DELETE FROM email_labels WHERE email_id IN ({ids})", p).rowcount,
        "attachments": conn.execute(f"DELETE FROM attachments WHERE email_id IN ({ids})", p).rowcount,
        "emails": conn.execute("DELETE FROM emails WHERE uid LIKE :p", p).rowcount,
        "deleted_emails": conn.execute("DELETE FROM deleted_emails WHERE uid LIKE :p", p).rowcount,
    }
    # Contacts auto-extracted from seed mail that no remaining mail references (never touches edited contacts).
    remaining = set()
    import email.utils
    for row in conn.execute("SELECT sender, recipient FROM emails"):
        for fld in (row["sender"], row["recipient"]):
            for part in str(fld or "").split(","):
                remaining.add(email.utils.parseaddr(part.strip())[1].lower().strip())
    acc_emails = {r["email"].lower() for r in conn.execute("SELECT email FROM accounts")}
    stale = [a for a in addrs if a not in remaining and a not in acc_emails]
    n = 0
    for a in stale:
        n += conn.execute("DELETE FROM contacts WHERE LOWER(email) = ? AND source = 'emails' AND COALESCE(is_customized,0) = 0",
                          (a,)).rowcount
    res["contacts"] = n
    conn.commit()
    return res


PROFILE_LABELS = {
    "gmail_work": "Gmail - work (MerkeMail team)",
    "gmail_personal": "Gmail - personal / consumer",
    "proton": "Proton - personal / freelance",
    "company": "Company server (manual IMAP/SMTP)",
}


def load_accounts(conn: sqlite3.Connection) -> List[Account]:
    """Active accounts with the profile used to generate their mail.

    gmail/google: the first one is the work account, the next ones get the personal profile.
    proton: personal/freelance profile.  custom (manual server) and any other provider: company profile.
    """
    accounts: List[Account] = []
    gmail_seen = 0
    for row in conn.execute("SELECT id, name, email, provider, imap_host FROM accounts "
                            "WHERE COALESCE(is_active,1) = 1 ORDER BY id"):
        sig = conn.execute("SELECT content FROM signatures WHERE account_id = ? ORDER BY is_default DESC, id LIMIT 1",
                           (row["id"],)).fetchone()
        prov = (row["provider"] or "").lower()
        if prov in ("gmail", "google"):
            profile = "gmail_work" if gmail_seen == 0 else "gmail_personal"
            gmail_seen += 1
        elif prov == "proton":
            profile = "proton"
        else:
            profile = "company"
        accounts.append(Account(row["id"], row["name"], row["email"], row["provider"],
                                sig["content"] if sig else "", row["imap_host"] or "", profile))
    return accounts


# The two extra test accounts (created through the app's own API, like the "Cuentas conectadas" form does).
# The company domain is invented; its servers do not need to exist (sync just fails to log in, like the demo ones).
EXTRA_ACCOUNTS = [
    {
        "account": {
            "name": "Gmail Personal", "email": "usuario.personal@gmail.com", "provider": "gmail",
            "imap_host": "imap.gmail.com", "imap_port": 993, "imap_ssl": 1, "imap_user": "usuario.personal@gmail.com",
            "imap_password": "demo_app_password", "smtp_host": "smtp.gmail.com", "smtp_port": 587, "smtp_ssl": 1,
            "color": "#10b981", "sync_interval": 5,
        },
        "signature": ("Firma Personal (Gmail)", "--\nSaludos,\nUsuario Demo\nEnviado desde mi correo personal"),
    },
    {
        "account": {
            "name": "Nubaria Logística (Corporativo)", "email": "usuario.demo@nubaria-logistica.com.mx", "provider": "custom",
            "imap_host": "mail.nubaria-logistica.com.mx", "imap_port": 993, "imap_ssl": 1,
            "imap_user": "usuario.demo@nubaria-logistica.com.mx", "imap_password": "demo_pass_corp",
            "smtp_host": "mail.nubaria-logistica.com.mx", "smtp_port": 587, "smtp_ssl": 1,
            "color": "#f59e0b", "sync_interval": 5,
        },
        "signature": ("Firma Corporativa (Nubaria)", "--\nUsuario Demo\nCoordinador de Sistemas | Nubaria Logística S.A. de C.V.\n"
                      "Tel. +52 (55) 5000 1234 ext. 210\nAv. Industrial 455, Tlalnepantla, Edo. de México\n"
                      "Este mensaje es confidencial y para uso exclusivo del destinatario."),
    },
]


def api_call(api: str, method: str, path: str, payload: Optional[dict] = None):
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(api.rstrip("/") + path, data=data, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode() or "null")


def add_extra_accounts(api: str) -> bool:
    """Create the extra test accounts (+ default signature) through the running MerkeMail API. Idempotent."""
    try:
        existing = {a["email"].lower() for a in api_call(api, "GET", "/api/accounts")}
    except Exception as e:
        print(f"ERROR: --add-accounts needs the MerkeMail server running at {api} ({e}).\n"
              "Start it with ./setup.sh run (or pass --api URL).")
        return False
    for spec in EXTRA_ACCOUNTS:
        acc = spec["account"]
        if acc["email"].lower() in existing:
            print(f"Account already exists, skipped: {acc['email']}")
            continue
        res = api_call(api, "POST", "/api/accounts", acc)
        name, content = spec["signature"]
        api_call(api, "POST", "/api/signatures", {"name": name, "content": content, "account_id": res["id"], "is_default": 1})
        print(f"Account created: #{res['id']} {acc['name']} <{acc['email']}> [{acc['provider']}] "
              f"IMAP {acc['imap_host']}:{acc['imap_port']} / SMTP {acc['smtp_host']}:{acc['smtp_port']} + signature")
    return True


def insert(conn: sqlite3.Connection, msgs: List[Msg]) -> None:
    labels = {r["name"].lower(): r["id"] for r in conn.execute("SELECT id, name FROM labels")}
    msgs = sorted(msgs, key=lambda m: m.date)
    counters: Dict[int, int] = {}
    for m in msgs:
        counters[m.account_id] = counters.get(m.account_id, 0) + 1
        uid = f"{SEED_PREFIX}{m.account_id}-{counters[m.account_id]:05d}"
        d = m.date.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        cur = conn.execute(
            """INSERT INTO emails (account_id, uid, folder, sender, recipient, subject, snippet, body_text, body_html,
                                   date, is_read, is_starred, has_attachments, ai_urgency, ai_tags, updated_at, local_modified)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
            (m.account_id, uid, m.folder, m.sender, m.recipient, m.subject, snippet_of(m.body_text), m.body_text,
             m.body_html, d, m.is_read, m.is_starred, 1 if m.attachments else 0, m.ai_urgency,
             json.dumps(m.ai_tags, ensure_ascii=False) if m.ai_tags else None, d))
        eid = cur.lastrowid
        for fn, ct, sz in m.attachments:
            conn.execute("INSERT INTO attachments (email_id, filename, content_type, size) VALUES (?, ?, ?, ?)", (eid, fn, ct, sz))
        for lname in dict.fromkeys(m.labels):
            lid = labels.get(lname.lower())
            if lid:
                conn.execute("INSERT OR IGNORE INTO email_labels (email_id, label_id) VALUES (?, ?)", (eid, lid))
    conn.commit()


def print_summary(conn: sqlite3.Connection, msgs: List[Msg], accounts: List[Account], tz) -> None:
    folders = ["INBOX", "CATEGORY_UPDATES", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS",
               "SENT", "DRAFT", "SPAM", "TRASH", "ARCHIVE"]
    print("\nGenerated mail per account and folder (total / unread):")
    ws = [max(14, len(a.email) + 2) for a in accounts]
    print(f"  {'folder':<22}" + "".join(f"{a.email:>{w}}" for a, w in zip(accounts, ws)))
    for f in folders:
        cells = []
        for a in accounts:
            sub = [m for m in msgs if m.account_id == a.id and m.folder == f]
            cells.append(f"{len(sub)} / {sum(1 for m in sub if not m.is_read)}")
        print(f"  {f:<22}" + "".join(f"{c:>{w}}" for c, w in zip(cells, ws)))
    print(f"  {'TOTAL':<22}" + "".join(f"{sum(1 for m in msgs if m.account_id == a.id):>{w}}" for a, w in zip(accounts, ws)))
    by_day: Dict[date, int] = {}
    for m in msgs:
        if m.kind not in ("sent", "draft"):
            dd = m.date.astimezone(tz).date()
            by_day[dd] = by_day.get(dd, 0) + 1
    print("\nReceived mail per day (local time):")
    for dd in sorted(by_day):
        print(f"  {DIAS_CORTOS[dd.weekday()]} {dd:%Y-%m-%d}  {'#' * by_day[dd]} {by_day[dd]}")
    print(f"\nStarred: {sum(m.is_starred for m in msgs)} · with attachments: {sum(1 for m in msgs if m.attachments)} · "
          f"with AI urgency: {sum(1 for m in msgs if m.ai_urgency)} · labelled: {sum(1 for m in msgs if m.labels)}")


def trigger_contacts_sync(api: str) -> None:
    try:
        req = urllib.request.Request(api.rstrip("/") + "/api/contacts/sync", method="POST", data=b"")
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
            print(f"Contacts refreshed through the running server: {data.get('total_contacts')} contacts.")
    except Exception:
        print("Server not reachable: contacts will be extracted from the new mail on the next server start "
              "(or call POST /api/contacts/sync).")


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate several days of fictitious test mail for MerkeMail.")
    ap.add_argument("--db", type=Path, default=DEFAULT_DB, help=f"SQLite database (default: {DEFAULT_DB})")
    ap.add_argument("--days", type=int, default=14, help="number of days of mail to generate, ending now (default 14)")
    ap.add_argument("--seed", type=int, default=2026, help="random seed for reproducible data (default 2026)")
    ap.add_argument("--tz", default=None, help="IANA time zone for 'office hours' (default: system time zone)")
    ap.add_argument("--now", default=None, help="override 'now' (ISO datetime, e.g. 2026-11-18T17:00)")
    ap.add_argument("--reset", action="store_true", help="delete previously generated test mail before generating")
    ap.add_argument("--purge", action="store_true", help="only delete previously generated test mail and exit")
    ap.add_argument("--dry-run", action="store_true", help="generate in memory and print the summary, write nothing")
    ap.add_argument("--add-accounts", action="store_true",
                    help="first create the extra test accounts (2nd Gmail + company manual-server account) via the API")
    ap.add_argument("--api", default="http://127.0.0.1:8000", help="running MerkeMail URL to refresh contacts ('' to skip)")
    args = ap.parse_args()

    if not args.db.exists():
        print(f"ERROR: database not found: {args.db}\nStart MerkeMail once (./setup.sh run) so it creates the demo accounts.")
        return 1
    if args.days < 1 or args.days > 90:
        print("ERROR: --days must be between 1 and 90")
        return 1

    if args.tz:
        if ZoneInfo is None:
            print("ERROR: zoneinfo not available")
            return 1
        tz = ZoneInfo(args.tz)
    else:
        tz = datetime.now().astimezone().tzinfo
    now = datetime.fromisoformat(args.now) if args.now else datetime.now(tz)
    if now.tzinfo is None:
        now = now.replace(tzinfo=tz)

    if args.add_accounts and not args.dry_run:
        if not add_extra_accounts(args.api or "http://127.0.0.1:8000"):
            return 1

    conn = connect(args.db)
    existing_seed = conn.execute("SELECT COUNT(*) c FROM emails WHERE uid LIKE ?", (SEED_PREFIX + "%",)).fetchone()["c"]

    if args.purge:
        print("Removed:", purge(conn))
        if args.api:
            trigger_contacts_sync(args.api)
        return 0

    if existing_seed and not args.reset and not args.dry_run:
        print(f"The database already has {existing_seed} generated test emails (uid '{SEED_PREFIX}*').\n"
              "Use --reset to replace them or --purge to remove them.")
        return 1

    accounts = load_accounts(conn)
    if not accounts:
        print("ERROR: no active accounts found in the database.")
        return 1
    for a in accounts:
        print(f"Account #{a.id}: {a.name} <{a.email}> [{a.provider}] -> profile: {PROFILE_LABELS[a.profile]}"
              f"  (signature: {'yes' if a.signature else 'no'})")

    existing = conn.execute(
        "SELECT id, account_id, sender, subject, body_text, date FROM emails WHERE uid NOT LIKE ?", (SEED_PREFIX + "%",)
    ).fetchall()

    # One generator (and one random stream) per account: adding/removing an account
    # does not change the mail generated for the others.
    all_msgs: List[Msg] = []
    gen = None
    for a in accounts:
        gen = MailGenerator(random.Random(f"{args.seed}:{a.email.lower()}"), tz, now, args.days, existing)
        {"gmail_work": gen.gen_gmail, "gmail_personal": gen.gen_gmail_personal,
         "proton": gen.gen_proton, "company": gen.gen_company}[a.profile](a)
        gen.apply_user_behaviour()
        all_msgs.extend(gen.msgs)
    print(f"\nWindow: {gen.window_start:%Y-%m-%d %H:%M} -> {gen.now:%Y-%m-%d %H:%M} ({tz})")
    print_summary(conn, all_msgs, accounts, tz)

    if args.dry_run:
        print("\n--dry-run: nothing written.")
        return 0
    if existing_seed and args.reset:
        print("\nRemoved previous test data:", purge(conn))
    insert(conn, all_msgs)
    print(f"\nInserted {len(all_msgs)} emails into {args.db}")
    conn.close()
    if args.api:
        trigger_contacts_sync(args.api)
    print("Reload the browser (F5) to see the new mail.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
