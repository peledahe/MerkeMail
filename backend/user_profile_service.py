import json
import logging
from typing import Dict, Any, Optional
from backend.database import get_db, get_user_ai_profile, save_user_ai_profile
from backend.gemini_service import GeminiService

logger = logging.getLogger(__name__)

class UserProfileService:
    @classmethod
    def get_profile(cls) -> Optional[Dict[str, Any]]:
        profile = get_user_ai_profile()
        if profile and profile.get("raw_analysis_json"):
            try:
                profile["analysis"] = json.loads(profile["raw_analysis_json"])
            except Exception:
                profile["analysis"] = {}
        return profile

    @classmethod
    def update_profile(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        save_user_ai_profile(data)
        return cls.get_profile() or {}

    @classmethod
    def analyze_profile(cls) -> Dict[str, Any]:
        """
        Recopila firmas, cuentas y muestras de correos enviados para que Gemini
        analice el perfil del usuario, estilo de comunicación y datos de contacto.
        """
        conn = get_db()
        
        # 1. Cuentas conectadas
        accounts = conn.execute("SELECT id, name, email, provider FROM accounts WHERE is_active = 1").fetchall()
        accounts_data = [dict(a) for a in accounts]

        # 2. Firmas registradas
        signatures = conn.execute("SELECT id, name, content, account_id, is_default FROM signatures").fetchall()
        signatures_data = [dict(s) for s in signatures]

        # 3. Muestra de correos enviados y redactados por el usuario (excluyendo Papelera, Borradores y Spam)
        sent_emails = conn.execute("""
            SELECT id, sender, recipient, subject, date, snippet, body_text 
            FROM emails 
            WHERE (folder = 'SENT' OR sender LIKE '%daniels%' OR sender LIKE '%merke%')
              AND UPPER(COALESCE(folder, '')) NOT IN ('TRASH', 'PAPELERA', 'DRAFT', 'DRAFTS', 'BORRADORES', 'SPAM', 'JUNK')
            ORDER BY date DESC LIMIT 25
        """).fetchall()
        emails_sample = []
        for e in sent_emails:
            emails_sample.append({
                "from": e["sender"],
                "to": e["recipient"],
                "subject": e["subject"],
                "date": e["date"],
                "snippet": e["snippet"] or (e["body_text"][:250] if e["body_text"] else "")
            })

        # 4. Top contactos frecuentes
        top_contacts = conn.execute("""
            SELECT name, email, interaction_count 
            FROM contacts 
            ORDER BY interaction_count DESC LIMIT 15
        """).fetchall()
        contacts_sample = [dict(c) for c in top_contacts]
        
        conn.close()

        # Armar el prompt para Gemini
        prompt = f"""
Eres un analista de comunicación y perfil personal para un cliente de correo electrónico corporativo y personal.
Analiza detenidamente la información del usuario obtenida de sus cuentas de correo, firmas configuradas y correos redactados.

### Cuentas del usuario:
{json.dumps(accounts_data, ensure_ascii=False, indent=2)}

### Firmas configuradas:
{json.dumps(signatures_data, ensure_ascii=False, indent=2)}

### Muestra de correos enviados/redactados:
{json.dumps(emails_sample, ensure_ascii=False, indent=2)}

### Contactos frecuentes:
{json.dumps(contacts_sample, ensure_ascii=False, indent=2)}

Debes extraer y consolidar un perfil completo y fidedigno del usuario en formato JSON estricto.
El JSON debe tener exactamente esta estructura con claves en minúsculas:
{{
  "name": "Nombre completo preferido del usuario",
  "roles_and_titles": "Cargos, profesiones o títulos detectados (ej: Líder de Desarrollo / Ingeniero de Software)",
  "organization": "Empresas u organizaciones principales (ej: Merke.net, SETESA)",
  "phone": "Teléfono, números de contacto o casilleros postales detectados",
  "address_location": "Ubicación geográfica detectada (ciudad, país o dirección)",
  "websites": "Sitios web o URLs asociadas (ej: https://merke.net)",
  "communication_style": "Descripción detallada de su forma de hablar y redactar: nivel de formalidad, tono habitual (amigable, cordial, formal), fórmulas de saludo típicas, formas de despedida frecuentes y estructura de sus correos",
  "summary_bio": "Resumen ejecutivo del perfil del usuario (2 a 3 oraciones integrando quién es y qué hace)",
  "extra_context": "Puntos clave y directrices para que la IA redacte correos futuros de forma auténtica en su nombre"
}}

IMPORTANTE: Responde ÚNICAMENTE con el objeto JSON válido, sin bloques de código markdown ni explicaciones adicionales.
"""

        try:
            client = GeminiService.get_client()
            from google.genai import types
            from backend.database import get_setting
            model_name = get_setting("gemini_model", "gemini-3.1-flash-lite")

            response = GeminiService._generate_with_fallback(
                client=client,
                preferred_model=model_name,
                contents=prompt,
                config=types.GenerateContentConfig(
                    system_instruction="Eres un extractor y analizador de perfiles de usuario de correos en formato JSON estricto.",
                    response_mime_type="application/json",
                    temperature=0.3
                )
            )
            raw_text = response.text
            cleaned_text = raw_text.strip()
            if cleaned_text.startswith("```"):
                cleaned_text = cleaned_text.split("```")[1]
                if cleaned_text.startswith("json"):
                    cleaned_text = cleaned_text[4:]
            cleaned_text = cleaned_text.strip()
            
            data = json.loads(cleaned_text)
            
            profile_record = {
                "name": data.get("name", "Usuario"),
                "roles_and_titles": data.get("roles_and_titles", ""),
                "organization": data.get("organization", ""),
                "phone": data.get("phone", ""),
                "address_location": data.get("address_location", ""),
                "websites": data.get("websites", ""),
                "communication_style": data.get("communication_style", ""),
                "summary_bio": data.get("summary_bio", ""),
                "extra_context": data.get("extra_context", ""),
                "raw_analysis_json": json.dumps(data, ensure_ascii=False)
            }
            
            save_user_ai_profile(profile_record)
            logger.info("Perfil de usuario analizado y guardado exitosamente por IA.")
            return cls.get_profile() or profile_record

        except Exception as e:
            logger.error(f"Error analizando el perfil del usuario con IA: {e}")
            raise e

    @classmethod
    def get_context_prompt_snippet(cls) -> str:
        """
        Retorna un fragmento de texto con el perfil del usuario para inyectar en las
        herramientas de redacción de IA y copiloto autónomo.
        """
        p = cls.get_profile()
        if not p or not p.get("name"):
            return ""

        parts = [
            "### PERFIL Y ESTILO DEL USUARIO (CONTEXTO DE REDACCIÓN):",
            f"- Nombre del remitente: {p.get('name')}",
        ]
        if p.get("roles_and_titles"):
            parts.append(f"- Cargo / Rol: {p.get('roles_and_titles')}")
        if p.get("organization"):
            parts.append(f"- Organización / Empresa: {p.get('organization')}")
        if p.get("phone"):
            parts.append(f"- Teléfono / Contacto: {p.get('phone')}")
        if p.get("address_location"):
            parts.append(f"- Ubicación: {p.get('address_location')}")
        if p.get("websites"):
            parts.append(f"- Enlaces web: {p.get('websites')}")
        if p.get("communication_style"):
            parts.append(f"- Estilo y forma de hablar del usuario: {p.get('communication_style')}")
        if p.get("summary_bio"):
            parts.append(f"- Biografía / Resumen: {p.get('summary_bio')}")
        if p.get("extra_context"):
            parts.append(f"- Notas de redacción: {p.get('extra_context')}")
            
        parts.append("Cuando redactes o sugieras respuestas, redacta en primera persona adoptando auténticamente la voz, datos y estilo de este usuario.")
        return "\n".join(parts) + "\n"
