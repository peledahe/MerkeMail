import os
import json
import base64
from typing import Dict, Any, List, Optional
from datetime import datetime, timedelta

try:
    from google.antigravity import Agent, LocalAgentConfig, GeminiModelOptions
    ANTIGRAVITY_AVAILABLE = True
except ImportError:
    ANTIGRAVITY_AVAILABLE = False

from backend.database import get_db, get_setting
from backend.calendar_service import CalendarService
from backend.email_service import EmailService
from backend.contacts_service import ContactsService

# --- HERRAMIENTAS PERSONALIZADAS PARA EL AGENTE ANTIGRAVITY ---

_current_discovered_emails: List[Dict[str, Any]] = []
_current_discovered_events: List[Dict[str, Any]] = []

def _get_active_account(cuenta_hint: str = "") -> Dict[str, Any]:
    """Obtiene una cuenta de correo activa según coincidencia o la primera por defecto."""
    conn = get_db()
    rows = conn.execute("SELECT id, name, email, provider, is_active FROM accounts WHERE is_active = 1").fetchall()
    conn.close()
    if not rows:
        raise ValueError("No hay cuentas de correo activas configuradas en MerkeMail.")
    
    if cuenta_hint:
        hint_clean = str(cuenta_hint).lower().strip()
        for r in rows:
            if hint_clean in r["email"].lower() or hint_clean in r["name"].lower() or hint_clean == str(r["id"]):
                return dict(r)
    return dict(rows[0])

def buscar_correos(
    consulta: str = "",
    fecha: str = "",
    carpeta: str = "RECIBIDOS",
    solo_no_leidos: bool = False,
    limite: int = 15
) -> str:
    """Busca correos en la base de datos de MerkeMail por texto, fecha, carpeta o estado de lectura.
    Busca TANTO correos leídos como no leídos por defecto en la bandeja de recibidos.
    
    Args:
        consulta: Término de búsqueda de texto, asunto, remitente o palabra clave (ej. 'Platzi', 'factura', 'seguridad'). Dejar vacío si solo se busca por fecha o generales.
        fecha: Fecha a consultar: puede ser 'ayer', 'hoy', 'antier', una fecha en formato 'YYYY-MM-DD' (ej. '2026-11-14') o dejar vacío.
        carpeta: Carpeta donde buscar: 'RECIBIDOS' (predeterminado, incluye bandeja de entrada y categorías como actualizaciones o promociones), 'TODOS', 'SENT' (enviados), 'SPAM', 'TRASH' (papelera).
        solo_no_leidos: Si es False (predeterminado), busca TANTO correos leídos como no leídos. Si es True, filtra únicamente los no leídos.
        limite: Número máximo de resultados a devolver (predeterminado 15).
    """
    global _current_discovered_emails
    import re
    from datetime import datetime, timedelta, timedelta

    now = datetime.now()
    target_date_str = None
    raw_combined = f"{consulta or ''} {fecha or ''}".lower()

    # Detección inteligente de fechas relativas o específicas
    if "ayer" in raw_combined or "yesterday" in raw_combined:
        target_date_str = (now - timedelta(days=1)).strftime("%Y-%m-%d")
    elif "antier" in raw_combined or "anteayer" in raw_combined:
        target_date_str = (now - timedelta(days=2)).strftime("%Y-%m-%d")
    elif "hoy" in raw_combined or "today" in raw_combined:
        target_date_str = now.strftime("%Y-%m-%d")
    elif re.search(r'\b\d{4}-\d{2}-\d{2}\b', raw_combined):
        m = re.search(r'\b\d{4}-\d{2}-\d{2}\b', raw_combined)
        target_date_str = m.group(0)
    elif re.search(r'\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b', raw_combined):
        m = re.search(r'\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b', raw_combined)
        d, m_num, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        if y < 100:
            y += 2000
        target_date_str = f"{y:04d}-{m_num:02d}-{d:02d}"

    # Limpiar stopwords de intención para extraer términos reales de búsqueda de texto
    clean_query = str(consulta or "")
    stop_words = [
        "busca", "buscar", "buscame", "búscame", "encuentra", "encontrar", "muéstrame", 
        "muestrame", "mostrar", "ver", "dame", "listar", "lista", "hay", "tengo", 
        "quiero", "por favor", "correos", "correo", "emails", "email", "mensajes", 
        "mensaje", "de ayer", "ayer", "de hoy", "hoy", "antier", "anteayer", 
        "recibidos", "recibido", "leidos", "leídos", "leido", "leído", "sin leer", 
        "no leidos", "no leídos", "no leido", "no leído",
        "los", "las", "el", "la", "un", "una", "unos", "unas", "de", "del", "en", "que", "para"
    ]
    for tw in stop_words:
        clean_query = re.sub(rf'\b{re.escape(tw)}\b', '', clean_query, flags=re.IGNORECASE)
    clean_query = clean_query.strip()

    conn = get_db()
    sql = """
        SELECT id, folder, sender, subject, snippet, date, is_read 
        FROM emails 
        WHERE 1=1
    """
    params = []

    # Filtrado por carpeta (por defecto 'RECIBIDOS' agrupa INBOX y todas las subcategorías de entrada)
    carp = (carpeta or "RECIBIDOS").upper().strip()
    if carp in ("RECIBIDOS", "INBOX"):
        sql += " AND folder IN ('INBOX', 'CATEGORY_PROMOTIONS', 'CATEGORY_SOCIAL', 'CATEGORY_UPDATES', 'CATEGORY_FORUMS')"
    elif carp == "SENT":
        sql += " AND folder = 'SENT'"
    elif carp == "SPAM":
        sql += " AND folder = 'SPAM'"
    elif carp == "TRASH":
        sql += " AND folder = 'TRASH'"
    elif carp == "TODOS":
        sql += " AND folder NOT IN ('TRASH', 'SPAM')"
    elif carp:
        sql += " AND folder = ?"
        params.append(carpeta)

    # Filtrado por estado de lectura: si solo_no_leidos es False, incluye leídos y no leídos
    if solo_no_leidos:
        sql += " AND is_read = 0"

    # Filtrado por fecha
    if target_date_str:
        sql += " AND date LIKE ?"
        params.append(f"{target_date_str}%")

    # Filtrado por texto en asunto, remitente o resumen
    if clean_query:
        sql += " AND (subject LIKE ? OR sender LIKE ? OR snippet LIKE ?)"
        p = f"%{clean_query}%"
        params.extend([p, p, p])

    sql += " ORDER BY date DESC LIMIT ?"
    params.append(max(1, min(int(limite), 50)))

    rows = conn.execute(sql, params).fetchall()
    conn.close()

    fecha_desc = f" con fecha {target_date_str}" if target_date_str else ""
    texto_desc = f" que coincidan con '{clean_query}'" if clean_query else ""

    if not rows:
        return f"No se encontraron correos en {carp}{fecha_desc}{texto_desc}."

    results = []
    for r in rows:
        _current_discovered_emails.append({
            "id": r["id"],
            "subject": r["subject"] or "(Sin Asunto)",
            "sender": r["sender"] or ""
        })
        estado = "Leído" if r["is_read"] else "No leído"
        results.append(
            f"Correo ID {r['id']} | [{estado}] | De: {r['sender']} | Asunto: {r['subject']} | Fecha: {r['date']}\n"
            f"ENLACE_OBLIGATORIO_MARKDOWN: [✉️ Abrir correo #{r['id']}: {r['subject']}](email:{r['id']})\n"
            f"Resumen: {r['snippet']}"
        )
    return "\n---\n".join(results)

def leer_correo(id_correo: int) -> str:
    """Obtiene el contenido completo y detalles de un correo por su ID numérico.
    
    Args:
        id_correo: Identificador único del correo.
    """
    global _current_discovered_emails
    conn = get_db()
    row = conn.execute("SELECT * FROM emails WHERE id = ?", (id_correo,)).fetchone()
    conn.close()

    if not row:
        return f"No existe ningún correo con el ID {id_correo}."

    _current_discovered_emails.append({
        "id": row["id"],
        "subject": row["subject"] or "(Sin Asunto)",
        "sender": row["sender"] or ""
    })

    return (
        f"ID: {row['id']}\n"
        f"Remitente: {row['sender']}\n"
        f"Destinatario: {row['recipient']}\n"
        f"Asunto: {row['subject']}\n"
        f"Fecha: {row['date']}\n"
        f"Contenido:\n{row['body_text'] or row['snippet'] or '(Sin contenido de texto)'}"
    )

def buscar_contactos(consulta: str) -> str:
    """Busca contactos en la libreta de direcciones de MerkeMail por nombre o correo.
    
    Args:
        consulta: Nombre, apellido o dirección de correo a buscar.
    """
    contacts = ContactsService.get_contacts(q=consulta, limit=6)
    if not contacts:
        return f"No se encontraron contactos en la libreta de direcciones para '{consulta}'."
    
    lines = []
    for c in contacts:
        name = c["name"] or c["email"].split("@")[0]
        lines.append(f"- **{name}**: `{c['email']}`")
    return "Contactos encontrados:\n" + "\n".join(lines)

def obtener_perfil_usuario() -> str:
    """Obtiene los datos personales, profesionales y estilo de comunicación del usuario analizados por IA."""
    try:
        from backend.user_profile_service import UserProfileService
        snippet = UserProfileService.get_context_prompt_snippet()
        return snippet or "Aún no se ha realizado un análisis del perfil del usuario."
    except Exception as e:
        return f"Error al consultar perfil del usuario: {str(e)}"

def preparar_borrador_correo(destinatario: str, asunto: str, cuerpo: str, cuenta_remitente: str = "") -> str:
    """Prepara y estructura un borrador de correo para que el usuario lo revise antes de enviarlo.
    
    Args:
        destinatario: Dirección de correo del destinatario (ej. contacto@ejemplo.com).
        asunto: Asunto o título del correo.
        cuerpo: Contenido del mensaje.
        cuenta_remitente: Opcional. ID, correo o nombre de la cuenta emisora a utilizar.
    """
    try:
        acc = _get_active_account(cuenta_remitente)
    except Exception as e:
        return f"Error al seleccionar cuenta emisora: {str(e)}"

    draft_info = {
        "to": destinatario.strip(),
        "subject": asunto.strip(),
        "body": cuerpo.strip(),
        "account_id": acc["id"],
        "account_email": acc["email"]
    }
    draft_json = json.dumps(draft_info, ensure_ascii=False)
    draft_b64 = base64.b64encode(draft_json.encode('utf-8')).decode('utf-8')

    return (
        f"[BORRADOR_ACTION:{draft_b64}]\n"
        f"He preparado el siguiente borrador de correo para que lo revises antes de enviarlo:\n"
        f"- **Para:** {destinatario}\n"
        f"- **Asunto:** {asunto}\n"
        f"- **Desde:** {acc['email']}\n"
        f"- **Mensaje:**\n"
        f"```\n{cuerpo}\n```\n"
        f"¿Deseas que proceda con el envío o prefieres editarlo primero en el redactor?"
    )

def enviar_correo(destinatario: str, asunto: str, cuerpo: str, cuenta_remitente: str = "") -> str:
    """Envía inmediatamente un correo electrónico a través del servidor de MerkeMail.
    
    Args:
        destinatario: Dirección de correo del destinatario.
        asunto: Asunto o título del correo.
        cuerpo: Contenido del mensaje.
        cuenta_remitente: Opcional. Cuenta emisora a utilizar.
    """
    try:
        acc = _get_active_account(cuenta_remitente)
        res = EmailService.send_email(
            account_id=acc["id"],
            to_email=destinatario.strip(),
            subject=asunto.strip(),
            body=cuerpo.strip(),
            is_html=False
        )
        if res.get("success"):
            return f"✔ Correo enviado exitosamente a '{destinatario}' con el asunto '{asunto}' desde {acc['email']}."
        else:
            return f"Error al enviar correo: {res.get('error', 'Fallo de entrega')}"
    except Exception as e:
        return f"Error al procesar envío de correo: {str(e)}"

def responder_correo(id_correo: int, respuesta_cuerpo: str) -> str:
    """Genera una respuesta como borrador para un correo existente por su ID numérico.
    
    Args:
        id_correo: ID numérico del correo al que se desea responder.
        respuesta_cuerpo: Contenido o texto de la respuesta propuesta.
    """
    conn = get_db()
    row = conn.execute("SELECT * FROM emails WHERE id = ?", (id_correo,)).fetchone()
    conn.close()

    if not row:
        return f"No se encontró el correo #{id_correo} para responder."

    sender = row["sender"]
    to_email = sender
    if "<" in sender and ">" in sender:
        to_email = sender.split("<")[1].split(">")[0].strip()

    subject = row["subject"] or ""
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"

    return preparar_borrador_correo(
        destinatario=to_email,
        asunto=subject,
        cuerpo=respuesta_cuerpo,
        cuenta_remitente=str(row["account_id"])
    )

def eliminar_correos(ids_correos: str, permanente: bool = False) -> str:
    """Mueve a la papelera (o elimina permanentemente) uno o varios correos por sus IDs numéricos.
    
    Args:
        ids_correos: Lista de IDs numéricos separados por comas (ej. '100, 115' o '142').
        permanente: True para borrar definitivamente; False (predeterminado) para mover a la papelera (TRASH).
    """
    import re
    ids = [int(n) for n in re.findall(r'\b\d+\b', str(ids_correos))]
    if not ids:
        return "No se especificaron IDs de correos válidos para eliminar."

    conn = get_db()
    placeholders = ",".join("?" for _ in ids)
    if permanente:
        conn.execute(f"DELETE FROM emails WHERE id IN ({placeholders})", ids)
        action_desc = "eliminado permanentemente"
    else:
        conn.execute(f"UPDATE emails SET folder = 'TRASH' WHERE id IN ({placeholders})", ids)
        action_desc = "movido a la papelera"
    conn.commit()
    conn.close()

    del_data = {
        "ids": ids,
        "count": len(ids),
        "permanent": permanente
    }
    del_b64 = base64.b64encode(json.dumps(del_data).encode('utf-8')).decode('utf-8')

    return (
        f"[ACCION_ELIMINACION:{del_b64}]\n"
        f"✔ Se han {action_desc} exitosamente {len(ids)} correo(s) (IDs: {', '.join(map(str, ids))})."
    )

def agendar_evento_calendario(titulo: str, fecha_inicio: str, fecha_fin: str, lugar: str = "", notas: str = "", calendario_id: int = 0, videollamada: str = "", invitados: str = "", todo_el_dia: int = 0) -> str:
    """Crea una cita, evento o tarea en el Calendario de MerkeMail con soporte para videollamadas, invitados y recurrencia. Se programa por defecto en el calendario configurado por el usuario, salvo que se especifique otro.
    
    Args:
        titulo: Nombre o asunto de la reunión, evento o tarea.
        fecha_inicio: Formato ISO 8601 (YYYY-MM-DDTHH:MM:SS), ej: 2026-11-20T16:00:00
        fecha_fin: Formato ISO 8601 (YYYY-MM-DDTHH:MM:SS), ej: 2026-11-20T17:00:00
        lugar: Ubicación física (ej. Sala de juntas, oficina).
        notas: Descripción o notas adicionales del evento.
        calendario_id: Opcional. ID numérico del calendario destino. Si es 0 o no se proporciona, se utiliza automáticamente el calendario por defecto del usuario.
        videollamada: Opcional. Enlace de videollamada (ej. Google Meet, Zoom) o 'meet' para autogenerar una sala de Google Meet.
        invitados: Opcional. Correos de invitados separados por coma.
        todo_el_dia: 1 si es un evento de día completo, 0 si tiene horario específico.
    """
    global _current_discovered_events
    try:
        target_cal = calendario_id if calendario_id and calendario_id > 0 else CalendarService.get_default_calendar_id()
        meeting_url = ""
        if videollamada:
            if videollamada.lower() in ("meet", "google meet", "si", "true"):
                import random, string
                code = f"{''.join(random.choices(string.ascii_lowercase, k=3))}-{''.join(random.choices(string.ascii_lowercase, k=4))}-{''.join(random.choices(string.ascii_lowercase, k=3))}"
                meeting_url = f"https://meet.google.com/{code}"
            else:
                meeting_url = videollamada

        ev = CalendarService.create_event(
            calendar_id=target_cal,
            title=titulo,
            start_time=fecha_inicio,
            end_time=fecha_fin,
            description=notas,
            location=lugar,
            all_day=todo_el_dia,
            meeting_url=meeting_url,
            attendees=invitados
        )
        _current_discovered_events.append({
            "id": ev["id"],
            "title": ev["title"]
        })
        meet_msg = f" (Videollamada: {ev['meeting_url']})" if ev.get('meeting_url') else ""
        return f"✔ Evento agendado exitosamente en '{ev['calendar_name']}': '{ev['title']}' el {ev['start_time']}{meet_msg}. Enlace: [📅 Ver cita #{ev['id']}: {ev['title']}](event:{ev['id']})"
    except Exception as e:
        return f"Error al agendar evento: {str(e)}"

def listar_proximos_eventos() -> str:
    """Consulta la lista de próximos eventos y citas agendadas en el calendario unificado."""
    global _current_discovered_events
    events = CalendarService.get_events()
    if not events:
        return "No hay eventos ni reuniones programadas en el calendario."

    res = []
    for ev in events[:7]:
        _current_discovered_events.append({
            "id": ev["id"],
            "title": ev["title"] or "(Sin Título)"
        })
        res.append(f"- [📅 Ver cita #{ev['id']}: {ev['title']}](event:{ev['id']}) ({ev['calendar_name']}): {ev['start_time']} en {ev['location'] or 'Sin lugar'}")
    return "\n".join(res)

# --- CLASE PRINCIPAL DEL ASISTENTE ANTIGRAVITY ---

class AntigravityMailAgent:
    @classmethod
    async def chat(cls, user_message: str) -> Dict[str, Any]:
        """Ejecuta una conversación con el asistente inteligente Elio equipado con herramientas."""
        # Limpiar invocación @elio si el usuario la incluyó
        cleaned_message = user_message.replace("@elio", "").replace("@Elio", "").strip()

        # Obtener en tiempo real las cuentas y calendarios realmente conectados
        conn = get_db()
        accounts = conn.execute("SELECT name, email, provider FROM accounts").fetchall()
        conn.close()

        active_cals = CalendarService.get_calendars()

        # Determinar proveedores reales de correo
        services_list = []
        for a in accounts:
            p = (a["provider"] or "").lower()
            if p in ("gmail", "google") and "Gmail" not in services_list:
                services_list.append("Gmail")
            elif p == "proton" and "ProtonMail" not in services_list:
                services_list.append("ProtonMail")
            elif p == "custom":
                email_domain = a["email"].split("@")[-1] if "@" in a["email"] else "Personalizado"
                domain_name = email_domain.split(".")[0].capitalize()
                label = f"{domain_name} ({email_domain})"
                if label not in services_list:
                    services_list.append(label)

        if not services_list:
            services_str = "tus cuentas de correo"
        elif len(services_list) == 1:
            services_str = f"tus correos de {services_list[0]}"
        else:
            services_str = f"tus correos de {', '.join(services_list[:-1])} y {services_list[-1]}"

        # Determinar calendarios reales conectados
        cal_names = [c["name"] for c in active_cals]
        if not cal_names:
            cals_str = "tu calendario"
        elif len(cal_names) == 1:
            cals_str = f"tu {cal_names[0]}"
        else:
            cals_str = f"tu Calendario Unificado ({' y '.join(cal_names)})"

        if not cleaned_message:
            return {
                "success": True,
                "response": f"¡Hola! Soy **Elio**, tu asistente inteligente en MerkeMail. Tengo acceso a {services_str} y {cals_str}. ¿En qué puedo ayudarte hoy? Puedes pedirme buscar correos, redactar borradores o consultar tu agenda.",
                "tools_used": []
            }

        api_key = get_setting("gemini_api_key") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {
                "success": False,
                "response": "Hola, soy Elio. Por favor configura tu API Key en el panel de Ajustes para activar mis funciones de asistencia.",
                "tools_used": []
            }

        model_name = get_setting("gemini_model", "gemini-3.1-flash-lite")

        now = datetime.now()
        hoy_str = now.strftime("%Y-%m-%d (%d de %B de %Y)")
        ayer_str = (now - timedelta(days=1)).strftime("%Y-%m-%d (%d de %B de %Y)")

        system_instruction = (
            f"Eres Elio, el asistente inteligente y copiloto autónomo integrado en MerkeMail. "
            f"El usuario puede interactuar contigo directamente o invocarte escribiendo @elio. "
            f"Tienes acceso a herramientas en tiempo real para buscar correos, leer correos, preparar borradores, enviar correos, responder correos, eliminar correos, agendar citas en {cals_str} y listar eventos. "
            f"Las cuentas y servicios que el usuario REALMENTE tiene conectados son: {services_str} y {cals_str}. "
            f"REGLA CRÍTICA DE FECHAS Y BÚSQUEDA DE CORREOS:\n"
            f"- La fecha actual del sistema es {hoy_str} y ayer fue {ayer_str}.\n"
            f"- Tu herramienta `buscar_correos` busca TANTO correos leídos como no leídos en la bandeja de recibidos (INBOX y subcategorías de entrada).\n"
            f"- Cuando el usuario te pida buscar correos de ayer, de hoy o de cualquier fecha (ej. 'busca correos de ayer', 'qué correos llegaron ayer', 'correos de hoy'), "
            f"ejecuta de inmediato `buscar_correos(fecha='ayer')` o la fecha indicada. Media vez estén en la carpeta de recibidos (leídos o no leídos), los encontrarás y debes mostrarlos al usuario.\n"
            f"- NUNCA afirmes que no hay correos sin antes haber llamado a la herramienta `buscar_correos` con los parámetros correspondientes.\n"
            f"REGLA CRÍTICA DE PROVEEDORES: Habla ÚNICAMENTE de los servicios que el usuario tiene realmente conectados ({services_str}, {cals_str}). "
            f"NUNCA menciones ProtonMail u otros servicios si el usuario no los tiene conectados. "
            f"REGLA CRÍTICA DE REDACCIÓN, ENVÍO Y RESPUESTA DE CORREOS:\n"
            f"- Tienes herramientas completas para redactar, enviar, responder y borrar correos.\n"
            f"- Cuando el usuario te pida redactar o enviar un correo (ej. 'envía un correo a...', 'redacta un mensaje para...', 'avísale a...'), "
            f"NUNCA lo envíes de golpe sin autorización. Utiliza SIEMPRE primero la herramienta `preparar_borrador_correo` para estructurarlo y mostrarle el borrador al usuario, pidiéndole amablemente confirmación antes del envío.\n"
            f"- Si el usuario te confirma expresamente (ej: 'sí, envíalo', 'confirmo', 'adelante', 'procede') o te pide explícitamente enviar de inmediato sin preguntar, ejecuta la herramienta `enviar_correo`.\n"
            f"- Cuando el usuario te pida responder a un correo (ej: 'responde al correo #X diciendo...'), usa `responder_correo` o `preparar_borrador_correo` para presentarle el borrador de respuesta y solicitar confirmación.\n"
            f"- Cuando el usuario te pida borrar o eliminar correos (ej: 'borra los correos de spam', 'elimina el correo #100', 'limpia los correos viejos'), "
            f"utiliza la herramienta `eliminar_correos` para procesar la eliminación o moverlos a la papelera.\n"
            f"REGLA DE ENLACES INTERACTIVOS (MUY IMPORTANTE): Siempre que menciones, encuentres o listes correos en tu respuesta, incluye un enlace interactivo en formato markdown con el ID numérico del correo: [✉️ Abrir correo #{'{id}'}: {'{asunto}'}](email:{'{id}'}) para que el usuario pueda hacer clic y abrirlo directamente en el visor de correo. "
            f"Siempre que menciones o listes citas del calendario, incluye un enlace con el ID del evento: [📅 Ver cita #{'{id}'}: {'{titulo}'}](event:{'{id}'}) para que el usuario pueda hacer clic y abrirla directamente en el calendario. "
            f"REGLA DE AGENDAMIENTO RESPONSABLE: Cuando el usuario quiera agendar una cita o reunión (especialmente desde el botón rápido de agendar o si no especifica fecha/hora exacta), NUNCA inventes ni asignes una fecha u hora al azar. "
            f"Consulta SIEMPRE primero tus herramientas de calendario (listar_proximos_eventos), revisa los compromisos existentes, y PREGUNTA amablemente al usuario qué título, fecha y hora prefiere según la disponibilidad para agendarla con exactitud. "
            f"Al crear citas, reuniones o tareas en el calendario, prográmalas automáticamente en el calendario configurado por defecto del usuario mediante `agendar_evento_calendario`, a menos que el usuario solicite expresamente guardarlo en otro calendario específico. "
            f"Sé conciso, empático, cordial, sumamente eficiente y responde siempre en español. "
            f"Tu nombre es Elio. Preséntate siempre como Elio si te preguntan quién eres. "
            f"Cuando el usuario te pida buscar, redactar, enviar, borrar o agendar, utiliza inmediatamente tus herramientas correspondientes.\n"
        )

        try:
            from backend.user_profile_service import UserProfileService
            profile_ctx = UserProfileService.get_context_prompt_snippet()
            if profile_ctx:
                system_instruction += f"\n{profile_ctx}\n"
        except Exception:
            pass

        global _current_discovered_emails, _current_discovered_events
        _current_discovered_emails = []
        _current_discovered_events = []

        def enrich_response_with_links(response_text: str) -> str:
            """Garantiza al 100% que cualquier correo o cita descubierta en herramientas tenga su botón interactivo."""
            text = response_text or ""
            if _current_discovered_emails:
                missing_emails = []
                for em in _current_discovered_emails:
                    link_pattern = f"(email:{em['id']})"
                    if link_pattern not in text:
                        subj = em['subject'] or "Sin Asunto"
                        missing_emails.append(f"[✉️ Abrir correo #{em['id']}: {subj}](email:{em['id']})")
                if missing_emails:
                    unique_missing = list(dict.fromkeys(missing_emails))[:6]
                    text += "\n\n**Correos relacionados para abrir:**\n" + "\n".join(f"- {m}" for m in unique_missing)

            if _current_discovered_events:
                missing_events = []
                for ev in _current_discovered_events:
                    link_pattern = f"(event:{ev['id']})"
                    if link_pattern not in text:
                        title = ev['title'] or "Cita"
                        missing_events.append(f"[📅 Ver cita #{ev['id']}: {title}](event:{ev['id']})")
                if missing_events:
                    unique_missing = list(dict.fromkeys(missing_events))[:6]
                    text += "\n\n**Citas de tu calendario:**\n" + "\n".join(f"- {m}" for m in unique_missing)
            # Detectar si el asistente redactó un borrador en texto pero no invocó la herramienta
            if "[BORRADOR_ACTION:" not in text:
                import re
                m_to = re.search(r'\*\*Para:\*\*\s*([^\n\r*]+)', text, re.IGNORECASE)
                m_sub = re.search(r'\*\*Asunto:\*\*\s*([^\n\r*]+)', text, re.IGNORECASE)
                if m_to and m_sub:
                    to_cand = m_to.group(1).replace('`', '').strip()
                    sub_cand = m_sub.group(1).replace('`', '').strip()
                    m_msg = re.search(r'\*\*Mensaje:\*\*\s*\n([\s\S]+?)(?=\n\n|\Z)', text, re.IGNORECASE)
                    body_cand = m_msg.group(1).replace('>', '').strip() if m_msg else ''
                    try:
                        acc = _get_active_account()
                        draft_info = {
                            "to": to_cand,
                            "subject": sub_cand,
                            "body": body_cand,
                            "account_id": acc["id"],
                            "account_email": acc["email"]
                        }
                        draft_b64 = base64.b64encode(json.dumps(draft_info, ensure_ascii=False).encode('utf-8')).decode('utf-8')
                        text += f"\n\n[BORRADOR_ACTION:{draft_b64}]"
                    except Exception:
                        pass

            return text

        if not ANTIGRAVITY_AVAILABLE:
            try:
                from google import genai
                client = genai.Client(api_key=api_key)
                resp = client.models.generate_content(
                    model=model_name,
                    contents=cleaned_message,
                    config={"system_instruction": system_instruction}
                )
                return {
                    "success": True,
                    "response": enrich_response_with_links(resp.text),
                    "model": model_name
                }
            except Exception as e:
                return {
                    "success": False,
                    "response": f"Hola, soy Elio. Encontré una dificultad al procesar tu solicitud: {str(e)}",
                    "error": str(e)
                }

        config = LocalAgentConfig(
            api_key=api_key,
            model=model_name,
            system_instructions=system_instruction,
            tools=[
                buscar_correos,
                leer_correo,
                buscar_contactos,
                obtener_perfil_usuario,
                preparar_borrador_correo,
                enviar_correo,
                responder_correo,
                eliminar_correos,
                agendar_evento_calendario,
                listar_proximos_eventos
            ]
        )

        try:
            async with Agent(config) as agent:
                resp = await agent.chat(cleaned_message)
                text = await resp.text()
                return {
                    "success": True,
                    "response": enrich_response_with_links(text),
                    "model": model_name
                }
        except Exception as e:
            # Fallback transparente con google.genai si falla Agent
            try:
                from google import genai
                client = genai.Client(api_key=api_key)
                resp = client.models.generate_content(
                    model=model_name,
                    contents=cleaned_message,
                    config={"system_instruction": system_instruction}
                )
                return {
                    "success": True,
                    "response": enrich_response_with_links(resp.text),
                    "model": model_name
                }
            except Exception:
                pass

            return {
                "success": False,
                "response": "Hola, soy Elio. No pude procesar tu solicitud en este momento. Parece que se interrumpió la conexión o el servicio está ocupado.",
                "error": str(e)
            }
