import os
import json
from typing import Dict, Any, List, Optional
from google import genai
from google.genai import types
from backend.database import get_setting

TONE_DESCRIPTIONS = {
    "formal": "formal y ejecutivo (estilo profesional de negocios, muy respetuoso, estructurado y formal)",
    "cordial": "cordial (amable, educado, atento y profesional con calidez)",
    "amigable": "amigable (cercano y jovial, con calidez humana, entusiasmo, simpatía y trato cercano sin formalismos rígidos)",
    "familiar": "familiar (con profundo afecto, cercanía entrañable, cariño y confianza íntima, como si se tratara de un miembro de la propia familia)",
    "conciso": "conciso y directo (breve, al grano, sin rodeos ni frases de relleno)",
    "comercial": "comercial y persuasivo (orientado a ventas, destacando beneficios y con una llamada a la acción atractiva)"
}

def get_tone_description(tone: str) -> str:
    key = (tone or "formal").strip().lower()
    return TONE_DESCRIPTIONS.get(key, tone)

class GeminiService:
    @staticmethod
    def get_client(api_key: Optional[str] = None) -> genai.Client:
        if not api_key:
            gemini_enabled = get_setting("gemini_enabled", "true").strip().lower() in ("true", "1", "yes")
            if not gemini_enabled:
                raise ValueError("El servicio de IA con Gemini está desactivado en los Ajustes.")
        key = api_key or get_setting("gemini_api_key") or os.getenv("GEMINI_API_KEY")
        if not key:
            raise ValueError("No se ha configurado la API Key de Gemini. Ingrésala en Ajustes.")
        return genai.Client(api_key=key)

    @classmethod
    def test_and_list_models(cls, api_key: str) -> Dict[str, Any]:
        """
        Prueba la API Key consultando la lista real de modelos disponibles
        directamente desde los servidores de Google para esta cuenta.
        """
        if not api_key or not api_key.strip():
            return {"success": False, "error": "La API Key está vacía", "models": []}
        
        clean_key = api_key.strip()
        try:
            client = genai.Client(api_key=clean_key)
            
            # Consultar modelos reales devueltos por la API conectada
            available_models = []
            for m in client.models.list():
                raw_name = m.name or ""
                model_id = raw_name.replace("models/", "")
                
                # Filtrar modelos de texto / chat (excluir embedding, aqa, etc.)
                lower_id = model_id.lower()
                if "gemini" in lower_id and "embedding" not in lower_id and "imagen" not in lower_id:
                    display = m.display_name or model_id
                    available_models.append({
                        "id": model_id,
                        "name": f"{display} ({model_id})",
                        "description": m.description or ""
                    })

            if not available_models:
                return {
                    "success": False, 
                    "error": "No se encontraron modelos Gemini disponibles para esta API Key.",
                    "models": []
                }

            # Probar generación con el primer modelo disponible o el actual
            current_pref = get_setting("gemini_model")
            chosen_model = current_pref if any(m["id"] == current_pref for m in available_models) else available_models[0]["id"]

            try:
                resp = client.models.generate_content(
                    model=chosen_model,
                    contents="Responde únicamente: OK",
                )
                test_output = resp.text.strip()
            except Exception as gen_err:
                # Si el modelo específico falla, intentar con el primero de la lista
                fallback_m = available_models[0]["id"]
                resp = client.models.generate_content(
                    model=fallback_m,
                    contents="Responde únicamente: OK",
                )
                chosen_model = fallback_m
                test_output = resp.text.strip()

            return {
                "success": True,
                "message": f"Conexión exitosa. Se detectaron {len(available_models)} modelos autorizados en tu cuenta.",
                "models": available_models,
                "selected_model": chosen_model,
                "response": test_output
            }
        except Exception as e:
            return {"success": False, "error": str(e), "models": []}

    @classmethod
    def test_api_key(cls, api_key: str) -> Dict[str, Any]:
        return cls.test_and_list_models(api_key)

    @classmethod
    def _generate_with_fallback(cls, client: genai.Client, preferred_model: str, contents: Any, config: Any):
        """Ejecuta generate_content probando modelos de fallback si el principal agota cuota (429) o no existe (404)."""
        candidate_models = [
            preferred_model,
            "gemini-3.1-flash-lite",
            "gemini-3.5-flash-lite",
            "gemini-3.8-flash"
        ]
        seen = set()
        models = [m for m in candidate_models if not (m in seen or seen.add(m))]

        last_error = None
        for m in models:
            try:
                return client.models.generate_content(
                    model=m,
                    contents=contents,
                    config=config
                )
            except Exception as e:
                err_str = str(e)
                last_error = e
                if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "404" in err_str or "NOT_FOUND" in err_str:
                    continue
                raise e
        raise last_error

    @classmethod
    def generate_email_draft(
        cls, 
        prompt: str, 
        tone: str = "formal", 
        language: str = "es", 
        recipient_context: str = "",
        current_draft: str = ""
    ) -> Dict[str, str]:
        """Genera o mejora un borrador de correo con base en un prompt libre y directrices."""
        client = cls.get_client()
        model_name = get_setting("gemini_model", "gemini-3.1-flash-lite")
        
        system_instruction = (
            "Eres un asistente ejecutivo experto en redacción de correos electrónicos profesionales, "
            "claros, persuasivos y empáticos. Devuelve siempre un objeto JSON válido con los campos: "
            "'subject' (asunto sugerido) y 'body' (cuerpo del correo formateado en párrafos limpios)."
        )
        
        tone_desc = get_tone_description(tone)
        
        user_profile_context = ""
        try:
            from backend.user_profile_service import UserProfileService
            user_profile_context = UserProfileService.get_context_prompt_snippet()
        except Exception:
            pass

        user_content = f"""
        {user_profile_context}

        Instrucción del usuario: {prompt}
        Tono deseado: {tone_desc}
        Idioma: {language}
        Contexto del destinatario: {recipient_context or 'No especificado'}
        Borrador actual existente (si aplica mejorar): {current_draft or 'Ninguno'}
        
        Por favor genera un asunto relevante y el cuerpo completo del correo listo para enviar.
        """

        response = cls._generate_with_fallback(
            client=client,
            preferred_model=model_name,
            contents=user_content,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                temperature=0.7
            )
        )
        
        try:
            data = json.loads(response.text)
            return {
                "subject": data.get("subject", "Sin Asunto"),
                "body": data.get("body", response.text)
            }
        except Exception:
            return {
                "subject": "Respuesta generada",
                "body": response.text
            }

    @classmethod
    def generate_smart_reply(
        cls,
        subject: str,
        sender: str,
        body: str,
        current_draft: str = "",
        user_instruction: str = "",
        tone: str = "formal"
    ) -> Dict[str, str]:
        """Genera una respuesta de correo inteligente altamente contextualizada al correo recibido."""
        client = cls.get_client()
        model_name = get_setting("gemini_model", "gemini-3.1-flash-lite")

        system_instruction = (
            "Eres un asistente ejecutivo de correo altamente profesional y empático. "
            "Tu tarea es redactar una respuesta adecuada, natural, clara y cordial al correo recibido, "
            "tomando en cuenta el remitente, el asunto y los puntos clave del mensaje recibido. "
            "Responde SIEMPRE en formato JSON con la clave: 'draft_reply', conteniendo el texto de respuesta "
            "organizado en párrafos limpios y listos para enviar."
        )

        user_profile_context = ""
        try:
            from backend.user_profile_service import UserProfileService
            user_profile_context = UserProfileService.get_context_prompt_snippet()
        except Exception:
            pass

        user_content = f"""
        {user_profile_context}

        CORREO RECIBIDO:
        De: {sender}
        Asunto: {subject}
        Mensaje original:
        {body[:4000]}

        INSTRUCCIÓN O NOTA ADICIONAL: {user_instruction or 'Redactar una respuesta completa, atenta y profesional respondiendo a lo planteado en el correo.'}
        BORRADOR PREVIO DEL USUARIO (si empezó a escribir algo): {current_draft or 'Ninguno'}
        TONO DESEADO: {get_tone_description(tone)}

        Por favor genera la respuesta apropiada en español respetando el contexto del correo recibido y adoptando el perfil del remitente.
        """

        response = cls._generate_with_fallback(
            client=client,
            preferred_model=model_name,
            contents=user_content,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                temperature=0.7
            )
        )

        try:
            data = json.loads(response.text)
            return {"draft_reply": data.get("draft_reply", response.text)}
        except Exception:
            return {"draft_reply": response.text}

    @classmethod
    def summarize_email(cls, subject: str, sender: str, body: str) -> Dict[str, Any]:
        """Genera un resumen ejecutivo, puntos clave y nivel de urgencia del correo."""
        client = cls.get_client()
        model_name = get_setting("gemini_model", "gemini-3.1-flash-lite")

        system_instruction = (
            "Eres un analizador inteligente de correos. "
            "Responde en formato JSON con los campos: "
            "'summary' (resumen de 1-2 oraciones), "
            "'key_points' (lista de puntos clave en viñetas), "
            "'urgency' ('alta', 'media' o 'baja'), "
            "'action_items' (lista de tareas pendientes detectadas), "
            "'suggested_replies' (lista de 3 respuestas breves posibles)."
        )

        content = f"Remitente: {sender}\nAsunto: {subject}\nCuerpo:\n{body[:3000]}"

        response = cls._generate_with_fallback(
            client=client,
            preferred_model=model_name,
            contents=content,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                temperature=0.3
            )
        )

        try:
            return json.loads(response.text)
        except Exception:
            return {
                "summary": response.text[:200],
                "key_points": [],
                "urgency": "media",
                "action_items": [],
                "suggested_replies": ["Recibido, muchas gracias.", "Enterado, lo reviso hoy.", "Gracias, quedo al pendiente."]
            }

    @classmethod
    def analyze_cleanup_by_prompt(cls, prompt: str, emails_metadata: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analiza una lista de correos y determina cuáles coinciden con el prompt de depuración del usuario.
        Retorna la lista de IDs candidatos para depuración con el motivo específico.
        """
        client = cls.get_client()
        model_name = get_setting("gemini_model", "gemini-3.8-flash")

        system_instruction = (
            "Eres un asistente de depuración y limpieza inteligente de bandejas de correo. "
            "Tu tarea es evaluar la lista de correos proporcionada con respecto a la instrucción del usuario "
            "y devolver en formato JSON una lista llamada 'candidates'. Cada elemento de 'candidates' debe contener: "
            "'id' (el id numérico del correo), 'subject' (asunto), 'sender' (remitente), "
            "'reason' (explicación breve y justificada de por qué coincide con el criterio de depuración)."
        )

        # Preparar versión ligera de los correos para el prompt
        emails_summary = [
            {
                "id": m.get("id"),
                "sender": m.get("sender"),
                "subject": m.get("subject"),
                "snippet": m.get("snippet", "")[:120],
                "date": str(m.get("date")),
                "folder": m.get("folder")
            }
            for m in emails_metadata[:80] # procesar hasta 80 correos por tanda
        ]

        content = f"""
        Instrucción de depuración del usuario: "{prompt}"
        
        Lista de correos a evaluar:
        {json.dumps(emails_summary, ensure_ascii=False)}
        
        Devuelve JSON con la clave 'candidates' conteniendo los que cumplen el criterio. Si ninguno cumple, lista vacía.
        """

        response = client.models.generate_content(
            model=model_name,
            contents=content,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                temperature=0.2
            )
        )

        try:
            return json.loads(response.text)
        except Exception:
            return {"candidates": []}

    @classmethod
    def extract_calendar_event(cls, subject: str, sender: str, body: str) -> Optional[Dict[str, Any]]:
        """Extrae detalles de un evento de calendario a partir del contenido de un correo."""
        client = cls.get_client()
        model_name = get_setting("gemini_model", "gemini-3.8-flash")

        system_instruction = (
            "Analiza el correo electrónico y extrae información sobre una reunión, cita o evento si existe. "
            "Devuelve un JSON con: 'has_event' (boolean), 'title' (título de la cita), 'description' (notas), "
            "'location' (lugar o enlace si lo hay), 'start_time' (ISO 8601 YYYY-MM-DDTHH:MM:SS), "
            "'end_time' (ISO 8601 YYYY-MM-DDTHH:MM:SS) o cadenas vacías si no hay evento."
        )

        content = f"Asunto: {subject}\nRemitente: {sender}\nCuerpo:\n{body[:2500]}"

        response = client.models.generate_content(
            model=model_name,
            contents=content,
            config=types.GenerateContentConfig(
                system_instruction=system_instruction,
                response_mime_type="application/json",
                temperature=0.2
            )
        )

        try:
            data = json.loads(response.text)
            if data.get("has_event"):
                return data
            return None
        except Exception:
            return None
