import os
import json
from typing import Dict, Any, List, Optional
from datetime import datetime

try:
    from google.antigravity import Agent, LocalAgentConfig, GeminiModelOptions
    ANTIGRAVITY_AVAILABLE = True
except ImportError:
    ANTIGRAVITY_AVAILABLE = False

from backend.database import get_db, get_setting
from backend.calendar_service import CalendarService

# --- HERRAMIENTAS PERSONALIZADAS PARA EL AGENTE ANTIGRAVITY ---

def buscar_correos(consulta: str) -> str:
    """Busca correos en la base de datos de MerkeMail por asunto, remitente o contenido.
    
    Args:
        consulta: Término de búsqueda, nombre, correo o palabra clave.
    """
    conn = get_db()
    param = f"%{consulta}%"
    rows = conn.execute("""
        SELECT id, folder, sender, subject, snippet, date 
        FROM emails 
        WHERE subject LIKE ? OR sender LIKE ? OR snippet LIKE ?
        ORDER BY date DESC LIMIT 8
    """, (param, param, param)).fetchall()
    conn.close()

    if not rows:
        return f"No se encontraron correos que coincidan con '{consulta}'."

    results = []
    for r in rows:
        results.append(f"[ID: {r['id']}] Carpeta: {r['folder']} | De: {r['sender']} | Asunto: {r['subject']} | Fecha: {r['date']}\nResumen: {r['snippet']}")
    return "\n---\n".join(results)

def leer_correo(id_correo: int) -> str:
    """Obtiene el contenido completo y detalles de un correo por su ID numérico.
    
    Args:
        id_correo: Identificador único del correo.
    """
    conn = get_db()
    row = conn.execute("SELECT * FROM emails WHERE id = ?", (id_correo,)).fetchone()
    conn.close()

    if not row:
        return f"No existe ningún correo con el ID {id_correo}."

    return (
        f"ID: {row['id']}\n"
        f"Remitente: {row['sender']}\n"
        f"Destinatario: {row['recipient']}\n"
        f"Asunto: {row['subject']}\n"
        f"Fecha: {row['date']}\n"
        f"Contenido:\n{row['body_text'] or row['snippet'] or '(Sin contenido de texto)'}"
    )

def agendar_evento_calendario(titulo: str, fecha_inicio: str, fecha_fin: str, lugar: str = "", notas: str = "") -> str:
    """Crea una cita o reunión en el Calendario Unificado de MerkeMail.
    
    Args:
        titulo: Nombre o asunto de la reunión/evento.
        fecha_inicio: Formato ISO 8601 (YYYY-MM-DDTHH:MM:SS), ej: 2026-11-20T16:00:00
        fecha_fin: Formato ISO 8601 (YYYY-MM-DDTHH:MM:SS), ej: 2026-11-20T17:00:00
        lugar: Ubicación física o enlace de videollamada (ej. Google Meet).
        notas: Descripción o notas adicionales del evento.
    """
    try:
        ev = CalendarService.create_event(
            calendar_id=1, # Google Calendar por defecto
            title=titulo,
            start_time=fecha_inicio,
            end_time=fecha_fin,
            description=notas,
            location=lugar
        )
        return f"✔ Evento agendado exitosamente: '{ev['title']}' el {ev['start_time']} ({ev['calendar_name']})."
    except Exception as e:
        return f"Error al agendar evento: {str(e)}"

def listar_proximos_eventos() -> str:
    """Consulta la lista de próximos eventos y citas agendadas en el calendario unificado."""
    events = CalendarService.get_events()
    if not events:
        return "No hay eventos ni reuniones programadas en el calendario."

    res = []
    for ev in events[:7]:
        res.append(f"- {ev['title']} ({ev['calendar_name']}): {ev['start_time']} en {ev['location'] or 'Sin lugar'}")
    return "\n".join(res)

# --- CLASE PRINCIPAL DEL ASISTENTE ANTIGRAVITY ---

class AntigravityMailAgent:
    @classmethod
    async def chat(cls, user_message: str) -> Dict[str, Any]:
        """Ejecuta una conversación con el agente Antigravity equipado con herramientas."""
        api_key = get_setting("gemini_api_key") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            return {
                "success": False,
                "response": "Por favor configura tu API Key de Gemini en el panel de Ajustes para activar el agente Antigravity.",
                "tools_used": []
            }

        if not ANTIGRAVITY_AVAILABLE:
            return {
                "success": False,
                "response": "El paquete google-antigravity no está disponible en este entorno.",
                "tools_used": []
            }

        model_name = get_setting("gemini_model", "gemini-3.8-flash")

        system_instruction = (
            "Eres Antigravity Mail Copilot, el asistente autónomo de máxima inteligencia integrado en MerkeMail. "
            "Tienes acceso a herramientas en tiempo real para buscar correos, leer correos en profundidad, "
            "agendar citas en el calendario de Google/Proton y listar eventos. "
            "Sé conciso, cordial, sumamente eficiente y responde siempre en español. "
            "Cuando el usuario te pida buscar o agendar, utiliza inmediatamente tus herramientas correspondientes."
        )

        config = LocalAgentConfig(
            api_key=api_key,
            model=model_name,
            system_instructions=system_instruction,
            tools=[
                buscar_correos,
                leer_correo,
                agendar_evento_calendario,
                listar_proximos_eventos
            ]
        )

        try:
            async with Agent(config) as agent:
                resp = await agent.chat(user_message)
                text = await resp.text()
                return {
                    "success": True,
                    "response": text,
                    "model": model_name
                }
        except Exception as e:
            return {
                "success": False,
                "response": f"Error ejecutando Antigravity Agent: {str(e)}",
                "error": str(e)
            }
