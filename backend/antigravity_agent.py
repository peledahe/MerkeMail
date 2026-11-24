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
        raise ValueError("No hay cuentas de correo activas configuradas en Senda.")
    
    if cuenta_hint:
        hint_clean = str(cuenta_hint).lower().strip()
        for r in rows:
            if hint_clean in r["email"].lower() or hint_clean in r["name"].lower() or hint_clean == str(r["id"]):
                return dict(r)
    return dict(rows[0])

def _detect_explicit_excluded_folders(text: str) -> Dict[str, bool]:
    """Detecta si el texto pide explícitamente Papelera, Borradores o Spam."""
    import re
    lower = (text or "").lower()
    return {
        "trash": bool(re.search(r'\b(papelera|trash|eliminados?|borrados?)\b', lower)),
        "draft": bool(re.search(r'\b(borrador|borradores|drafts?)\b', lower)),
        "spam": bool(re.search(r'\b(spam|no deseados?|correo basura|junk)\b', lower)),
    }

def buscar_correos(
    consulta: str = "",
    fecha: str = "",
    carpeta: str = "TODOS",
    etiqueta: str = "",
    solo_no_leidos: bool = False,
    limite: int = 20
) -> str:
    """Busca correos en TODAS las cuentas, TODAS las carpetas y TODAS las etiquetas de Senda.
    Por regla general NO incluye Papelera (TRASH), Borradores (DRAFT) ni Spam (SPAM) a menos que se indique explícitamente.
    Busca TANTO correos leídos como no leídos por defecto.
    
    Args:
        consulta: Término de búsqueda de texto, asunto, remitente, destinatario, carpeta, etiqueta o palabra clave. Dejar vacío si solo se busca por fecha o carpeta/etiqueta.
        fecha: Fecha a consultar: 'ayer', 'hoy', 'antier', 'YYYY-MM-DD' o vacío.
        carpeta: 'TODOS' (predeterminado: abarca todo correo, toda carpeta y toda etiqueta excepto Papelera, Borradores y Spam), 'RECIBIDOS'/'INBOX', 'SENT', 'ARCHIVE', 'STARRED', o explícitamente 'TRASH', 'DRAFT', 'SPAM'.
        etiqueta: Nombre de etiqueta o carpeta específica si el usuario la menciona (ej. 'Trabajo', 'Facturación', 'Proyectos').
        solo_no_leidos: Si es False (predeterminado), busca leídos y no leídos. Si es True, solo no leídos.
        limite: Número máximo de resultados (predeterminado 20).
    """
    global _current_discovered_emails
    import re
    from datetime import datetime, timedelta

    now = datetime.now()
    target_date_str = None
    raw_combined = f"{consulta or ''} {fecha or ''} {carpeta or ''} {etiqueta or ''}".lower()
    explicit_flags = _detect_explicit_excluded_folders(raw_combined)

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
        "no leidos", "no leídos", "no leido", "no leído", "todos", "todas", "carpeta", "etiqueta",
        "los", "las", "el", "la", "un", "una", "unos", "unas", "de", "del", "en", "que", "para"
    ]
    for tw in stop_words:
        clean_query = re.sub(rf'\b{re.escape(tw)}\b', '', clean_query, flags=re.IGNORECASE)
    clean_query = clean_query.strip()

    conn = get_db()
    sql = """
        SELECT DISTINCT e.id, e.folder, e.sender, e.recipient, e.subject, e.snippet, e.date, e.is_read, e.is_starred
        FROM emails e
        LEFT JOIN email_labels el ON e.id = el.email_id
        LEFT JOIN labels l ON el.label_id = l.id
        WHERE 1=1
    """
    params: List[Any] = []

    carp = (carpeta or "TODOS").upper().strip()

    # Regla 4: Abarcar todo correo, toda carpeta y toda etiqueta, excluyendo Papelera, Borradores y Spam salvo petición explícita
    if carp in ("TRASH", "PAPELERA") or explicit_flags["trash"]:
        sql += " AND UPPER(COALESCE(e.folder, '')) IN ('TRASH', 'PAPELERA')"
        clean_query = re.sub(r'\b(papelera|trash|eliminados?|borrados?)\b', '', clean_query, flags=re.IGNORECASE).strip()
    elif carp in ("DRAFT", "DRAFTS", "BORRADORES", "BORRADOR") or explicit_flags["draft"]:
        sql += " AND UPPER(COALESCE(e.folder, '')) IN ('DRAFT', 'DRAFTS', 'BORRADORES')"
        clean_query = re.sub(r'\b(borrador|borradores|drafts?)\b', '', clean_query, flags=re.IGNORECASE).strip()
    elif carp in ("SPAM", "JUNK") or explicit_flags["spam"]:
        sql += " AND UPPER(COALESCE(e.folder, '')) IN ('SPAM', 'JUNK')"
        clean_query = re.sub(r'\b(spam|no deseados?|correo basura|junk)\b', '', clean_query, flags=re.IGNORECASE).strip()
    else:
        # Exclusión estricta por defecto de Papelera, Borradores y Spam
        sql += " AND UPPER(COALESCE(e.folder, '')) NOT IN ('TRASH', 'PAPELERA', 'DRAFT', 'DRAFTS', 'BORRADORES', 'SPAM', 'JUNK')"
        if carp in ("SENT", "ENVIADOS"):
            sql += " AND UPPER(e.folder) = 'SENT'"
        elif carp in ("STARRED", "DESTACADOS"):
            sql += " AND e.is_starred = 1"
        elif carp in ("ARCHIVE", "ARCHIVO", "ARCHIVADOS"):
            sql += " AND UPPER(e.folder) = 'ARCHIVE'"
        elif carp not in ("TODOS", "ALL", "TODAS", "GLOBAL", "RECIBIDOS", "INBOX", ""):
            # Si especificó el nombre de una carpeta o etiqueta personalizada
            sql += " AND (UPPER(e.folder) = ? OR LOWER(l.name) LIKE ?)"
            params.extend([carp, f"%{carpeta.strip().lower()}%"])

    if etiqueta and etiqueta.strip():
        lbl_q = f"%{etiqueta.strip()}%"
        sql += " AND (l.name LIKE ? OR e.folder LIKE ?)"
        params.extend([lbl_q, lbl_q])

    if solo_no_leidos:
        sql += " AND e.is_read = 0"

    if target_date_str:
        sql += " AND e.date LIKE ?"
        params.append(f"{target_date_str}%")

    if clean_query:
        p = f"%{clean_query}%"
        sql += " AND (e.subject LIKE ? OR e.sender LIKE ? OR e.recipient LIKE ? OR e.snippet LIKE ? OR e.body_text LIKE ? OR e.folder LIKE ? OR l.name LIKE ?)"
        params.extend([p, p, p, p, p, p, p])

    sql += " ORDER BY e.date DESC, e.id DESC LIMIT ?"
    params.append(max(1, min(int(limite), 50)))

    rows = conn.execute(sql, params).fetchall()

    # Obtener etiquetas de los correos encontrados
    labels_by_eid: Dict[int, List[str]] = {}
    if rows:
        eids = [r["id"] for r in rows]
        ph = ",".join("?" for _ in eids)
        lrows = conn.execute(f"""
            SELECT el.email_id, l.name
            FROM email_labels el
            JOIN labels l ON el.label_id = l.id
            WHERE el.email_id IN ({ph})
        """, eids).fetchall()
        for lr in lrows:
            labels_by_eid.setdefault(lr["email_id"], []).append(lr["name"])

    conn.close()

    fecha_desc = f" con fecha {target_date_str}" if target_date_str else ""
    texto_desc = f" que coincidan con '{clean_query}'" if clean_query else ""

    if not rows:
        return f"No se encontraron correos{fecha_desc}{texto_desc} (buscando en todas las carpetas y etiquetas, excluyendo Papelera, Borradores y Spam)."

    results = []
    for r in rows:
        _current_discovered_emails.append({
            "id": r["id"],
            "subject": r["subject"] or "(Sin Asunto)",
            "sender": r["sender"] or ""
        })
        estado = "Leído" if r["is_read"] else "No leído"
        lbls = labels_by_eid.get(r["id"], [])
        lbls_str = f" | Etiquetas: {', '.join(lbls)}" if lbls else ""
        results.append(
            f"Correo ID {r['id']} | [{estado}] | Carpeta: {r['folder']}{lbls_str} | De: {r['sender']} | Asunto: {r['subject']} | Fecha: {r['date']}\n"
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
    """Busca contactos en la libreta de direcciones de Senda por nombre o correo.
    
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
    """Envía inmediatamente un correo electrónico a través del servidor de Senda.
    
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
    """Mueve a la papelera (o elimina permanentemente) uno o varios correos por sus IDs numéricos en cualquier carpeta o etiqueta.
    
    Args:
        ids_correos: Lista de IDs numéricos separados por comas (ej. '100, 115' o '142').
        permanente: True para borrar definitivamente; False (predeterminado) para mover a la papelera (TRASH).
    """
    import re, threading
    ids = [int(n) for n in re.findall(r'\b\d+\b', str(ids_correos))]
    if not ids:
        return "No se especificaron IDs de correos válidos para eliminar."

    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = get_db()
    placeholders = ",".join("?" for _ in ids)
    target_rows = conn.execute(f"SELECT id, account_id, uid, folder, source_folder FROM emails WHERE id IN ({placeholders})", ids).fetchall()
    targets = [dict(r) for r in target_rows]
    from backend.email_service import EmailService, deleted_email_key

    if permanente:
        for t in targets:
            if t.get("uid"):
                conn.execute(
                    "INSERT OR REPLACE INTO deleted_emails (account_id, uid, deleted_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
                    (t["account_id"], deleted_email_key(t.get("source_folder"), t["uid"]))
                )
        conn.execute(f"DELETE FROM email_labels WHERE email_id IN ({placeholders})", ids)
        conn.execute(f"DELETE FROM attachments WHERE email_id IN ({placeholders})", ids)
        conn.execute(f"DELETE FROM emails WHERE id IN ({placeholders})", ids)
        action_desc = "eliminado permanentemente"
    else:
        conn.execute(
            f"UPDATE emails SET folder = 'TRASH', updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})",
            [now_iso] + ids
        )
        action_desc = "movido a la papelera"
    conn.commit()
    conn.close()

    # Sincronizar en segundo plano con el servidor remoto
    def _bg_sync_del():
        try:
            from backend.google_oauth import GoogleOAuthService
            for t in targets:
                if t.get("uid") and t.get("account_id"):
                    GoogleOAuthService.modify_message_labels(
                        t["account_id"], t["uid"], add_labels=["TRASH"], remove_labels=["INBOX"]
                    )
        except Exception:
            pass
    threading.Thread(target=_bg_sync_del, daemon=True).start()
    # Cuentas IMAP: reflejar en el servidor (mover a su Papelera)
    if permanente:
        EmailService.schedule_imap_push(removed_rows=targets)
    else:
        EmailService.schedule_imap_push(email_ids=ids)

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

def gestionar_correos(ids_correos: str, accion: str, destino: str = "") -> str:
    """Realiza acciones sobre uno o varios correos de cualquier cuenta, carpeta o etiqueta.
    
    Args:
        ids_correos: IDs numéricos de los correos separados por coma (ej. '105, 112').
        accion: Acción a ejecutar: 'archivar', 'marcar_leido', 'marcar_no_leido', 'destacar', 'quitar_destacado', 'agregar_etiqueta', 'quitar_etiqueta', 'mover_carpeta', 'spam', 'no_spam'.
        destino: Nombre de la etiqueta o carpeta si la acción es 'agregar_etiqueta', 'quitar_etiqueta' o 'mover_carpeta'.
    """
    import re, threading
    ids = [int(n) for n in re.findall(r'\b\d+\b', str(ids_correos))]
    if not ids:
        return "No se especificaron IDs de correos válidos."

    act = (accion or "").strip().lower()
    now_iso = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    conn = get_db()
    placeholders = ",".join("?" for _ in ids)
    rows = conn.execute(f"SELECT id, account_id, uid, folder FROM emails WHERE id IN ({placeholders})", ids).fetchall()
    targets = [dict(r) for r in rows]
    if not targets:
        conn.close()
        return "No se encontraron los correos indicados."

    add_remote_lbls: List[str] = []
    rem_remote_lbls: List[str] = []
    desc = ""

    if act in ("archivar", "archive"):
        conn.execute(
            f"UPDATE emails SET folder = 'ARCHIVE', updated_at = ?, local_modified = 1 WHERE id IN ({placeholders}) AND UPPER(COALESCE(folder, '')) NOT IN ('SPAM', 'TRASH', 'DRAFT', 'DRAFTS')",
            [now_iso] + ids
        )
        rem_remote_lbls.append("INBOX")
        desc = "archivados"
    elif act in ("marcar_leido", "leido", "read", "mark_read"):
        conn.execute(f"UPDATE emails SET is_read = 1, updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})", [now_iso] + ids)
        rem_remote_lbls.append("UNREAD")
        desc = "marcados como leídos"
    elif act in ("marcar_no_leido", "no_leido", "unread", "mark_unread"):
        conn.execute(f"UPDATE emails SET is_read = 0, updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})", [now_iso] + ids)
        add_remote_lbls.append("UNREAD")
        desc = "marcados como no leídos"
    elif act in ("destacar", "star"):
        conn.execute(f"UPDATE emails SET is_starred = 1, updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})", [now_iso] + ids)
        add_remote_lbls.append("STARRED")
        desc = "destacados con estrella"
    elif act in ("quitar_destacado", "unstar"):
        conn.execute(f"UPDATE emails SET is_starred = 0, updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})", [now_iso] + ids)
        rem_remote_lbls.append("STARRED")
        desc = "retirados de destacados"
    elif act == "spam":
        conn.execute(f"UPDATE emails SET folder = 'SPAM', updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})", [now_iso] + ids)
        add_remote_lbls.append("SPAM")
        rem_remote_lbls.append("INBOX")
        desc = "movidos a Spam"
    elif act in ("no_spam", "not_spam"):
        conn.execute(f"UPDATE emails SET folder = 'INBOX', updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})", [now_iso] + ids)
        add_remote_lbls.append("INBOX")
        rem_remote_lbls.append("SPAM")
        desc = "restaurados a Recibidos (No es spam)"
    elif act in ("mover_carpeta", "move_folder") and destino.strip():
        target_f = destino.strip().upper()
        conn.execute(f"UPDATE emails SET folder = ?, updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})", [target_f, now_iso] + ids)
        desc = f"movidos a la carpeta {target_f}"
    elif act in ("agregar_etiqueta", "add_label", "quitar_etiqueta", "remove_label") and destino.strip():
        lbl_row = conn.execute("SELECT id, name, remote_id FROM labels WHERE LOWER(name) LIKE ?", (f"%{destino.strip().lower()}%",)).fetchone()
        if not lbl_row:
            conn.close()
            return f"No se encontró la etiqueta '{destino}'."
        if "agregar" in act or "add" in act:
            for eid in ids:
                conn.execute("INSERT OR IGNORE INTO email_labels (email_id, label_id) VALUES (?, ?)", (eid, lbl_row["id"]))
            conn.execute(f"UPDATE emails SET updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})", [now_iso] + ids)
            if lbl_row["remote_id"]:
                add_remote_lbls.append(lbl_row["remote_id"])
            desc = f"etiquetados con '{lbl_row['name']}'"
        else:
            conn.execute(f"DELETE FROM email_labels WHERE label_id = ? AND email_id IN ({placeholders})", [lbl_row["id"]] + ids)
            conn.execute(f"UPDATE emails SET updated_at = ?, local_modified = 1 WHERE id IN ({placeholders})", [now_iso] + ids)
            if lbl_row["remote_id"]:
                rem_remote_lbls.append(lbl_row["remote_id"])
            desc = f"desetiquetados de '{lbl_row['name']}'"
    else:
        conn.close()
        return f"Acción '{accion}' no reconocida."

    conn.commit()
    conn.close()

    # Cuentas IMAP: reflejar en el servidor los cambios de carpeta
    if act in ("archivar", "archive", "spam", "no_spam", "not_spam", "mover_carpeta", "move_folder"):
        from backend.email_service import EmailService
        EmailService.schedule_imap_push(email_ids=ids)

    if add_remote_lbls or rem_remote_lbls:
        def _bg_mod():
            try:
                from backend.google_oauth import GoogleOAuthService
                for t in targets:
                    if t.get("uid") and t.get("account_id"):
                        GoogleOAuthService.modify_message_labels(
                            t["account_id"], t["uid"], add_labels=add_remote_lbls or None, remove_labels=rem_remote_lbls or None
                        )
            except Exception:
                pass
        threading.Thread(target=_bg_mod, daemon=True).start()

    del_b64 = base64.b64encode(json.dumps({"ids": ids, "count": len(ids), "action": act}).encode('utf-8')).decode('utf-8')
    return f"[ACCION_ELIMINACION:{del_b64}]\n✔ {len(ids)} correo(s) han sido {desc} exitosamente."

def agendar_evento_calendario(titulo: str, fecha_inicio: str, fecha_fin: str, lugar: str = "", notas: str = "", calendario_id: int = 0, videollamada: str = "", invitados: str = "", todo_el_dia: int = 0) -> str:
    """Crea una cita, evento o tarea en el Calendario de Senda con soporte para videollamadas, invitados y recurrencia. Se programa por defecto en el calendario configurado por el usuario, salvo que se especifique otro.
    
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

def sincronizar_servicios(modulo: str = "todos") -> str:
    """Sincroniza en tiempo real los servicios de la aplicación: 'calendario', 'contactos', 'correos' o 'todos'.
    Útil cuando el usuario pide sincronizar, actualizar o refrescar sus calendarios, eventos, contactos o correos.
    
    Args:
        modulo: 'calendario', 'contactos', 'correos' o 'todos'.
    """
    mod = (modulo or "todos").strip().lower()
    results = []

    # 1. Correos
    if mod in ("todos", "correos", "emails", "inbox", "correo"):
        try:
            from backend.email_service import EmailService
            EmailService.sync_emails_background()
            results.append("✉️ Correos: Sincronización en segundo plano iniciada correctamente.")
        except Exception as e:
            results.append(f"✉️ Correos: Error al iniciar sincronización ({e})")

    # 2. Contactos
    if mod in ("todos", "contactos", "contacts"):
        try:
            from backend.contacts_service import ContactsService
            c_res = ContactsService.sync_contacts()
            synced_count = c_res.get("contacts_count", 0)
            results.append(f"👥 Contactos: Sincronizados exitosamente ({synced_count} contactos actualizados).")
        except Exception as e:
            results.append(f"👥 Contactos: Error al sincronizar ({e})")

    # 3. Calendarios y Tareas
    if mod in ("todos", "calendario", "calendarios", "calendar", "eventos", "tareas"):
        try:
            from backend.calendar_service import CalendarService
            from backend.google_oauth import GoogleOAuthService
            CalendarService.ensure_google_calendars()
            conn = get_db()
            google_accounts = conn.execute("SELECT id FROM accounts WHERE is_active = 1 AND provider IN ('google', 'gmail')").fetchall()
            conn.close()

            cal_count = 0
            task_count = 0
            warnings = []
            for g_acc in google_accounts:
                res_cal = GoogleOAuthService.sync_google_calendar(g_acc["id"])
                res_tasks = GoogleOAuthService.sync_google_tasks(g_acc["id"])
                if isinstance(res_cal, dict):
                    if res_cal.get("success"):
                        cal_count += res_cal.get("synced", 0)
                    elif res_cal.get("needs_reauth"):
                        warnings.append(f"Cuenta #{g_acc['id']}: Sesión Google requiere reautenticación")
                if isinstance(res_tasks, dict) and res_tasks.get("success"):
                    task_count += res_tasks.get("synced", 0)

            msg = f"📅 Calendario: Sincronizados {cal_count} eventos y {task_count} tareas."
            if warnings:
                msg += f" (Nota: {', '.join(warnings)})"
            results.append(msg)
        except Exception as e:
            results.append(f"📅 Calendario: Error al sincronizar ({e})")

    return "\n".join(results) if results else "No se seleccionó ningún módulo válido para sincronizar."

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
                "response": f"¡Hola! Soy **Elio**, tu asistente inteligente en Senda. Tengo acceso a {services_str} y {cals_str}. ¿En qué puedo ayudarte hoy? Puedes pedirme buscar correos, redactar borradores o consultar tu agenda.",
                "tools_used": []
            }

        api_key = get_setting("gemini_api_key") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {
                "success": False,
                "response": "Hola, soy Elio. Por favor configura tu API Key en el panel de Ajustes para activar mis funciones de asistencia.",
                "tools_used": []
            }

        model_name = get_setting("gemini_model", "gemini-3.5-flash-lite")

        now = datetime.now()
        hoy_str = now.strftime("%Y-%m-%d (%d de %B de %Y)")
        ayer_str = (now - timedelta(days=1)).strftime("%Y-%m-%d (%d de %B de %Y)")

        system_instruction = (
            f"Eres Elio, el asistente inteligente y copiloto autónomo integrado en Senda. "
            f"El usuario puede interactuar contigo directamente o invocarte escribiendo @elio. "
            f"Tienes acceso a herramientas en tiempo real para buscar correos, leer correos, gestionar correos (archivar, etiquetar, mover carpetas, marcar visto/no leído, destacar), preparar borradores, enviar correos, responder correos, eliminar correos, agendar citas en {cals_str} y listar eventos. "
            f"Las cuentas y servicios que el usuario REALMENTE tiene conectados son: {services_str} y {cals_str}. "
            f"REGLA CRÍTICA DE ALCANCE UNIVERSAL (TODO CORREO, TODA CARPETA Y TODA ETIQUETA):\n"
            f"- La fecha actual del sistema es {hoy_str} y ayer fue {ayer_str}.\n"
            f"- Todas tus búsquedas (`buscar_correos`) y acciones (`gestionar_correos`, `eliminar_correos`) afectan a TODO correo, TODA carpeta (Recibidos, Enviados, Archivo, Destacados, categorías, carpetas personalizadas) y TODA etiqueta de todas las cuentas activas.\n"
            f"- NUNCA tomes en cuenta Papelera (TRASH), Borradores (DRAFT/DRAFTS) ni Spam (SPAM) a menos que el usuario lo indique explícitamente en su instrucción.\n"
            f"- Cuando el usuario te pida buscar correos de cualquier fecha, remitente, carpeta o etiqueta, ejecuta de inmediato `buscar_correos`. NUNCA afirmes que no hay correos sin antes haber llamado a `buscar_correos`.\n"
            f"REGLA CRÍTICA DE PROVEEDORES: Habla ÚNICAMENTE de los servicios que el usuario tiene realmente conectados ({services_str}, {cals_str}). "
            f"NUNCA menciones ProtonMail u otros servicios si el usuario no los tiene conectados. "
            f"REGLA CRÍTICA DE REDACCIÓN, ENVÍO, RESPUESTA Y GESTIÓN DE CORREOS:\n"
            f"- Cuando el usuario te pida redactar o enviar un correo, NUNCA lo envíes de golpe sin autorización. Utiliza SIEMPRE primero `preparar_borrador_correo` para mostrarle el borrador y pedir confirmación.\n"
            f"- Si el usuario confirma expresamente (ej: 'sí, envíalo', 'confirmo', 'adelante', 'procede') o pide enviar de inmediato sin preguntar, ejecuta `enviar_correo`.\n"
            f"- Cuando el usuario pida responder a un correo, usa `responder_correo` o `preparar_borrador_correo`.\n"
            f"- Cuando el usuario pida borrar o eliminar correos, utiliza `eliminar_correos`.\n"
            f"- Cuando el usuario pida archivar, marcar como leído/no leído, destacar, mover de carpeta o asignar/quitar etiquetas, utiliza `gestionar_correos`.\n"
            f"REGLA DE ENLACES INTERACTIVOS (MUY IMPORTANTE): Siempre que menciones, encuentres o listes correos en tu respuesta, incluye un enlace interactivo en formato markdown con el ID numérico del correo: [✉️ Abrir correo #{'{id}'}: {'{asunto}'}](email:{'{id}'}) para que el usuario pueda hacer clic y abrirlo directamente en el visor de correo. "
            f"Siempre que menciones o listes citas del calendario, incluye un enlace con el ID del evento: [📅 Ver cita #{'{id}'}: {'{titulo}'}](event:{'{id}'}) para que el usuario pueda hacer clic y abrirla directamente en el calendario. "
            f"REGLA DE AGENDAMIENTO RESPONSABLE: Cuando el usuario quiera agendar una cita o reunión y no especifique fecha/hora exacta, NUNCA inventes ni asignes una fecha u hora al azar. "
            f"Consulta SIEMPRE primero `listar_proximos_eventos`, revisa los compromisos existentes, y PREGUNTA amablemente al usuario qué título, fecha y hora prefiere según la disponibilidad. "
            f"Sé conciso, empático, cordial, sumamente eficiente y responde siempre en español. "
            f"Tu nombre es Elio. Preséntate siempre como Elio si te preguntan quién eres.\n"
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

        agent_tools = [
            buscar_correos,
            leer_correo,
            buscar_contactos,
            obtener_perfil_usuario,
            preparar_borrador_correo,
            enviar_correo,
            responder_correo,
            eliminar_correos,
            gestionar_correos,
            agendar_evento_calendario,
            listar_proximos_eventos,
            sincronizar_servicios
        ]

        # Ejecución ultrarrápida con pre-consulta indexada para búsquedas (1 solo roundtrip ~2s) y failover inmediato
        import asyncio, re
        def _run_fast_chat():
            from google.genai import types
            from backend.gemini_service import GeminiService
            client = GeminiService.get_client(api_key=api_key)

            lower_msg = cleaned_message.lower()
            is_action_intent = bool(re.search(
                r'\b(borra|borrar|elimina|eliminar|env[ií]a|enviar|redacta|redactar|escribe|escribir|'
                r'responde|responder|contesta|contestar|archiva|archivar|etiqueta|etiquetar|'
                r'mueve|mover|marca|marcar|destaca|destacar|agenda|agendar|programa|programar|'
                r'crea|crear|confirmo|procede|adelante|sincroniza|sincronizar|actualiza|actualizar|'
                r'refresca|refrescar)\b|#\d+',
                lower_msg
            ))

            # Ruta rápida de 1 solo roundtrip para consultas/búsquedas de correos y agenda
            if not is_action_intent:
                email_ctx = buscar_correos(consulta=cleaned_message, limite=15)
                cal_ctx = listar_proximos_eventos() if any(w in lower_msg for w in ("cita", "evento", "agenda", "calendario", "reuni")) else ""
                combined_prompt = (
                    f"Solicitud del usuario: {cleaned_message}\n\n"
                    f"Resultados en tiempo real de correos (todas las carpetas y etiquetas, sin Papelera/Borradores/Spam salvo indicación explícita):\n"
                    f"{email_ctx}\n"
                )
                if cal_ctx:
                    combined_prompt += f"\nPróximos eventos del calendario:\n{cal_ctx}\n"
                resp = GeminiService._generate_with_fallback(
                    client=client,
                    preferred_model=model_name,
                    contents=combined_prompt,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        temperature=0.2
                    )
                )
                return model_name, (resp.text or "")

            candidate_models = [
                "gemini-3.5-flash-lite",
                model_name,
                "gemini-3.1-flash-lite",
                "gemini-3.6-flash",
                "gemini-3.5-flash",
                "gemini-3.8-flash"
            ]
            seen = set()
            models = [m for m in candidate_models if m and not (m in seen or seen.add(m))]
            last_err = None
            for m in models:
                try:
                    cfg_kwargs: Dict[str, Any] = {
                        "system_instruction": system_instruction,
                        "tools": agent_tools,
                        "temperature": 0.2,
                        "automatic_function_calling": types.AutomaticFunctionCallingConfig(maximum_remote_calls=2),
                    }
                    if "gemini-3" in m:
                        cfg_kwargs["thinking_config"] = types.ThinkingConfig(thinking_level="MINIMAL")
                    chat_session = client.chats.create(
                        model=m,
                        config=types.GenerateContentConfig(**cfg_kwargs)
                    )
                    resp = chat_session.send_message(cleaned_message)
                    return m, (resp.text or "")
                except Exception as err:
                    last_err = err
                    err_str = str(err).upper()
                    if any(tok in err_str for tok in ("429", "RESOURCE_EXHAUSTED", "404", "NOT_FOUND", "503", "UNAVAILABLE", "500", "502", "504", "DEADLINE", "TIMEOUT", "INVALID_ARGUMENT")):
                        continue
                    break
            raise last_err

        try:
            used_model, text = await asyncio.to_thread(_run_fast_chat)
            return {
                "success": True,
                "response": enrich_response_with_links(text),
                "model": used_model
            }
        except Exception as fast_err:
            if ANTIGRAVITY_AVAILABLE:
                try:
                    config = LocalAgentConfig(
                        api_key=api_key,
                        model="gemini-3.5-flash-lite",
                        system_instructions=system_instruction,
                        tools=agent_tools
                    )
                    async with Agent(config) as agent:
                        resp = await agent.chat(cleaned_message)
                        text = await resp.text()
                        return {
                            "success": True,
                            "response": enrich_response_with_links(text),
                            "model": "gemini-3.5-flash-lite"
                        }
                except Exception:
                    pass

            return {
                "success": False,
                "response": "Hola, soy Elio. No pude procesar tu solicitud en este momento. Parece que se interrumpió la conexión o el servicio está ocupado.",
                "error": str(fast_err)
            }
