import os
import json
from concurrent.futures import ThreadPoolExecutor, as_completed
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
    _client_cache: Dict[str, genai.Client] = {}
    _models_cache: Dict[str, List[Dict[str, Any]]] = {}

    @classmethod
    def get_client(cls, api_key: Optional[str] = None) -> genai.Client:
        if not api_key:
            gemini_enabled = get_setting("gemini_enabled", "true").strip().lower() in ("true", "1", "yes")
            if not gemini_enabled:
                raise ValueError("El servicio de IA de Elio (@elio) está desactivado en los Ajustes.")
        key = (api_key or get_setting("gemini_api_key") or os.getenv("GEMINI_API_KEY") or "").strip()
        if not key:
            raise ValueError("No se ha configurado la API Key de Gemini. Ingrésala en Ajustes.")
        if key not in cls._client_cache:
            cls._client_cache[key] = genai.Client(
                api_key=key,
                http_options=types.HttpOptions(
                    timeout=18000,
                    retry_options=types.HttpRetryOptions(attempts=1)
                )
            )
        return cls._client_cache[key]

    @classmethod
    def list_models_fast(cls, api_key: str) -> Dict[str, Any]:
        """Devuelve la lista de modelos autorizados usando caché en memoria sin llamada de prueba extra."""
        clean_key = (api_key or "").strip()
        if not clean_key:
            return {"success": False, "error": "La API Key está vacía", "models": []}
        if clean_key in cls._models_cache and cls._models_cache[clean_key]:
            models = cls._models_cache[clean_key]
            current_pref = get_setting("gemini_model") or "gemini-3.5-flash-lite"
            chosen = current_pref if any(m["id"] == current_pref for m in models) else models[0]["id"]
            return {"success": True, "models": models, "selected_model": chosen}
        return cls.test_and_list_models(clean_key, skip_test_generation=True)

    @classmethod
    def test_and_list_models(cls, api_key: str, skip_test_generation: bool = False) -> Dict[str, Any]:
        """
        Prueba la API Key consultando la lista real de modelos disponibles
        directamente desde los servidores de Google para esta cuenta.
        """
        if not api_key or not api_key.strip():
            return {"success": False, "error": "La API Key está vacía", "models": []}
        
        clean_key = api_key.strip()
        try:
            client = cls.get_client(api_key=clean_key)
            
            # Consultar modelos reales devueltos por la API conectada
            available_models = []
            for m in client.models.list():
                raw_name = m.name or ""
                model_id = raw_name.replace("models/", "")
                
                # Filtrar modelos de texto / chat (excluir embedding, aqa, imagen, etc.)
                lower_id = model_id.lower()
                if "gemini" in lower_id and "embedding" not in lower_id and "imagen" not in lower_id and "image" not in lower_id:
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

            cls._models_cache[clean_key] = available_models

            # Preferir gemini-3.5-flash-lite o el modelo configurado
            current_pref = get_setting("gemini_model") or "gemini-3.5-flash-lite"
            chosen_model = current_pref if any(m["id"] == current_pref for m in available_models) else available_models[0]["id"]

            if skip_test_generation:
                return {
                    "success": True,
                    "message": f"Se detectaron {len(available_models)} modelos autorizados.",
                    "models": available_models,
                    "selected_model": chosen_model,
                    "response": "OK"
                }

            resp = cls._generate_with_fallback(
                client=client,
                preferred_model=chosen_model,
                contents="Responde únicamente: OK",
                config=types.GenerateContentConfig(temperature=0.1)
            )
            test_output = (resp.text or "OK").strip()

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
        return cls.test_and_list_models(api_key, skip_test_generation=False)

    @classmethod
    def _generate_with_fallback(cls, client: genai.Client, preferred_model: str, contents: Any, config: Any):
        """Ejecuta generate_content priorizando baja latencia y alternando de inmediato ante 503, 429 o 404."""
        candidate_models = [
            "gemini-3.5-flash-lite",
            preferred_model,
            "gemini-3.1-flash-lite",
            "gemini-3.6-flash",
            "gemini-3.5-flash",
            "gemini-3.8-flash"
        ]
        seen = set()
        models = [m for m in candidate_models if m and not (m in seen or seen.add(m))]

        last_error = None
        for m in models:
            try:
                effective_config = config
                if isinstance(config, types.GenerateContentConfig) and getattr(config, "thinking_config", None) is None and "gemini-3" in m:
                    try:
                        effective_config = config.model_copy(update={"thinking_config": types.ThinkingConfig(thinking_level="MINIMAL")})
                    except Exception:
                        effective_config = config
                return client.models.generate_content(
                    model=m,
                    contents=contents,
                    config=effective_config
                )
            except Exception as e:
                err_str = str(e).upper()
                last_error = e
                if any(tok in err_str for tok in ("429", "RESOURCE_EXHAUSTED", "404", "NOT_FOUND", "503", "UNAVAILABLE", "500", "502", "504", "DEADLINE", "TIMEOUT", "INVALID_ARGUMENT")):
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
        Analiza exhaustivamente correos de todas las cuentas, carpetas y etiquetas,
        determinando cuáles coinciden con el prompt de depuración del usuario usando
        procesamiento concurrente de lotes y failover instantáneo de modelos.
        """
        if not emails_metadata:
            return {"candidates": []}

        client = cls.get_client()
        model_name = get_setting("gemini_model", "gemini-3.5-flash-lite")

        system_instruction = (
            "Eres un evaluador inteligente de correos para depuración y limpieza multicuenta de bandejas de correo. "
            "Tu misión es analizar rigurosamente la lista de correos provista (incluyendo su cuenta 'acc', carpeta 'f', "
            "etiquetas 'lbls', remitente 's', asunto 'sub' y resumen 'snip') e identificar TODOS los correos que cumplen "
            "con el criterio o instrucción en lenguaje natural solicitado por el usuario (por ejemplo: redes sociales "
            "como LinkedIn, TikTok, Facebook, Instagram, Twitter/X, Pinterest, YouTube; boletines informativos o newsletters; "
            "ofertas o promociones; notificaciones automáticas o transaccionales; correos de cierta carpeta o etiqueta; etc.). "
            "Devuelve ÚNICAMENTE un objeto JSON con la clave 'candidates', donde cada elemento es un objeto con: "
            "'id' (número entero identificador del correo), 'reason' (explicación breve, concisa y justificada en español "
            "de por qué cumple el criterio)."
        )

        chunk_size = 200
        chunks = [emails_metadata[i:i + chunk_size] for i in range(0, len(emails_metadata), chunk_size)]

        def process_chunk(chunk):
            compact_list = [
                {
                    "id": m.get("id"),
                    "acc": m.get("account_email") or f"Cuenta #{m.get('account_id')}",
                    "f": m.get("folder", ""),
                    "lbls": m.get("labels", []),
                    "s": (m.get("sender") or "")[:70],
                    "sub": (m.get("subject") or "")[:90],
                    "snip": (m.get("snippet") or "")[:110]
                }
                for m in chunk
            ]
            content = f"""
            Instrucción de depuración del usuario: "{prompt}"
            
            Lista de correos a evaluar:
            {json.dumps(compact_list, ensure_ascii=False)}
            
            Devuelve JSON con la clave 'candidates' conteniendo los correos que cumplen el criterio:
            {{"candidates": [{{"id": 123, "reason": "motivo justificado..."}}]}}
            Si ninguno cumple, devuelve {{"candidates": []}}.
            """
            try:
                response = cls._generate_with_fallback(
                    client=client,
                    preferred_model=model_name,
                    contents=content,
                    config=types.GenerateContentConfig(
                        system_instruction=system_instruction,
                        response_mime_type="application/json",
                        temperature=0.1
                    )
                )
                data = json.loads(response.text)
                return data.get("candidates", [])
            except Exception as e:
                print(f"[GeminiService] Error analizando lote de correos: {e}")
                return []

        raw_candidates = []
        if len(chunks) == 1:
            raw_candidates = process_chunk(chunks[0])
        else:
            with ThreadPoolExecutor(max_workers=min(8, len(chunks))) as executor:
                futures = [executor.submit(process_chunk, c) for c in chunks]
                for f in as_completed(futures):
                    raw_candidates.extend(f.result())

        # Enriquecer y ordenar los candidatos preservando metadatos completos y orden cronológico
        seen_ids = set()
        candidates = []
        raw_candidates_map = {}
        for rc in raw_candidates:
            cid = rc.get("id")
            if cid is not None and cid not in raw_candidates_map:
                raw_candidates_map[cid] = rc.get("reason") or "Coincide con el criterio de depuración"

        for m in emails_metadata:
            mid = m.get("id")
            if mid in raw_candidates_map and mid not in seen_ids:
                seen_ids.add(mid)
                candidates.append({
                    "id": mid,
                    "subject": m.get("subject") or "(Sin Asunto)",
                    "sender": m.get("sender") or "",
                    "account": m.get("account_email") or f"Cuenta #{m.get('account_id')}",
                    "folder": m.get("folder") or "Bandeja",
                    "labels": m.get("labels", []),
                    "date": str(m.get("date") or "")[:19],
                    "reason": raw_candidates_map[mid]
                })

        return {"candidates": candidates}

    @classmethod
    def extract_calendar_event(cls, subject: str, sender: str, body: str) -> Optional[Dict[str, Any]]:
        """Extrae detalles de un evento de calendario a partir del contenido de un correo."""
        client = cls.get_client()
        model_name = get_setting("gemini_model", "gemini-3.5-flash-lite")

        system_instruction = (
            "Analiza el correo electrónico y extrae información sobre una reunión, cita o evento si existe. "
            "Devuelve un JSON con: 'has_event' (boolean), 'title' (título de la cita), 'description' (notas), "
            "'location' (lugar o enlace si lo hay), 'start_time' (ISO 8601 YYYY-MM-DDTHH:MM:SS), "
            "'end_time' (ISO 8601 YYYY-MM-DDTHH:MM:SS) o cadenas vacías si no hay evento."
        )

        content = f"Asunto: {subject}\nRemitente: {sender}\nCuerpo:\n{body[:2500]}"

        response = cls._generate_with_fallback(
            client=client,
            preferred_model=model_name,
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
