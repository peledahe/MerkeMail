# Arquitectura Técnica - MerkeMail

## Tecnologías y Componentes

- **Backend:**
  - Python 3.12+ con **FastAPI** y servidor asíncrono **Uvicorn**.
  - **Google GenAI SDK (`google-genai`):** Modelos (`gemini-3.8-flash`, `gemini-3.8-pro`, etc.) con detección dinámica mediante `client.models.list()`.
  - **Google Antigravity SDK (`google-antigravity`):** Implementación de `AntigravityMailAgent` en `backend/antigravity_agent.py` para agentes autónomos con *tool calling* nativo.
  - **Autenticación Google OAuth 2.0 & Gmail API:** `google-auth-oauthlib` y `google-api-python-client` para flujo de inicio de sesión web en 1 clic y sincronización REST.
  - **Soporte ProtonMail:** Conexión local con **Proton Mail Bridge** (`127.0.0.1:1143` IMAP / `127.0.0.1:1025` SMTP) con fallback inteligente SSL/texto plano.
  - **Persistencia Local:** SQLite (`data/merkemail.db`) para cuentas, correos cacheados, firmas y eventos.

- **Frontend & UI (Estándar 02-admin-apps + Split View estilo Gmail):**
  - **Layout:** Header superior transversal con barra de búsqueda tipo píldora (*"Pregúntale a MerkeMail o busca correos..."*), badge de estado y avatar de usuario.
  - **Sidebar:** Botón flotante `+ Redactar` tipo cápsula, carpetas con badges numéricos y selector de cuentas.
  - **Split View (Master-Detail):**
    - Columna izquierda: Lista compacta de correos con selección masiva, estrellas, hora, asunto y snippet.
    - Columna derecha: Panel de lectura en tiempo real con asunto grande, badge, cuerpo en scroll independiente y botones flotantes al pie (`Responder`, `Reenviar`, `✨ Responder con IA`, `Agendar en Calendario`).
  - **Modo Dual:** Light Mode y Dark Mode (`dark:bg-slate-950`, `dark:bg-slate-900`).
  - **Modales Laterales (*Drawers*):** Copiloto Autónomo Antigravity, Redactor IA, Depurador de Correos, Búsqueda Avanzada, Firmas, Ajustes y Cuentas.
  - **Notificaciones Sticky & Modales de Confirmación:** Reemplazo integral y elegante de diálogos nativos.
