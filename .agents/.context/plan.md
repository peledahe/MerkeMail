# Plan de Desarrollo - MerkeMail

## Objetivos
Construir una aplicación de gestión de correos y calendarios altamente gráfica en Python que se conecte a Gmail y ProtonMail, potenciada con el SDK de Gemini de Google (`google-genai`) y el **Google Antigravity SDK (`google-antigravity`)**, con diseño moderno Split View estilo Gmail bajo los estándares de `02-admin-apps`.

## Fases del Plan

### Fase 1: Estructura del Proyecto y Entorno Python
- [x] Configurar el entorno con `uv` / dependencias (`fastapi`, `uvicorn`, `google-genai`, `google-antigravity`, `google-auth-oauthlib`, etc.).
- [x] Establecer la estructura de carpetas (`backend/`, `frontend/`, `img/`, `data/`).

### Fase 2: Módulo de Conexión de Correo (Gmail y ProtonMail)
- [x] Implementar cliente IMAP/SMTP genérico con soporte para SSL/TLS.
- [x] Configurar presets para Gmail (App Password, SSL 993, SMTP 587/465).
- [x] **Autenticación Oficial Google OAuth 2.0:** Flujo web oficial (1 clic en popup) con `google-auth-oauthlib`, sincronización mediante Gmail REST API y scopes para Google Calendar.
- [x] Configurar presets para ProtonMail (Proton Bridge localhost:1143 / 1025).
- [x] **Personalización de Cuentas:** Asignación de colores por cuenta, indicativos visuales en la bandeja, edición de cuentas y pruebas de conexión IMAP/SMTP en tiempo real.
- [x] Implementar soporte de almacenamiento local SQLite para cuentas y caché de correos (`data/merkemail.db`).

### Fase 3: Integración de IA con Gemini y Google Antigravity SDK
- [x] Implementar `gemini_service.py` con `google-genai` y detección dinámica de modelos vía `client.models.list()`.
- [x] **Configuración Gráfica e Intuitiva de API Keys de IA:**
  - Panel visual amigable para ingresar y gestionar la API Key de Gemini.
  - Validación y prueba de conexión en tiempo real ("Probar conexión").
  - Selector visual del modelo (`gemini-2.5-flash`, etc.).
  - Notificación *sticky* al guardar o actualizar la clave.
- [x] **Antigravity Copilot (Agente Autónomo):** Integración con `google-antigravity` para búsqueda de correos, lectura profunda, agendamiento y consulta de agenda mediante *tool calling*.
- [x] **Gestor de Firmas Multi-Cuenta:** Tabla SQLite `signatures`, asignación por cuenta, firma predeterminada e inyección automática en el redactor.
- [x] **Depuración Inteligente de Correos por Prompt (Mail Cleanup AI):**
  - Prompt en lenguaje natural para depurar buzones (ej: *"localiza newsletters y promociones no leídas de hace más de 30 días"*).
  - Previsualización en tabla de los correos seleccionados antes de aplicar cualquier acción.
  - Modal de confirmación obligatorio antes de archivar o eliminar definitivamente.
- [x] **Área de Prompt interactiva para Redacción con IA:**
  - Panel dedicado donde el usuario introduce instrucciones en lenguaje natural.
  - Selección de tono (formal, cordial, persuasivo, conciso), idioma y objetivo.
  - Generación de asunto y cuerpo de correo con inserción directa en el editor.
- [x] Resumen de correos (TL;DR, puntos clave) y Smart Reply / Responder con IA.
- [x] Extracción automática de eventos/citas desde correos hacia el calendario.

### Fase 4: Calendario Unificado (Google + Proton)
- [x] Módulo de sincronización y visualización combinada de calendarios (Google Calendar y Proton Calendar vía CalDAV / ICS / APIs).
- [x] Vista gráfica mensual, semanal y de agenda integrada en la interfaz.
- [x] Creación, edición y eliminación de eventos (con modales de confirmación).
- [x] Enlace inteligente: convertir correos en eventos de calendario con 1 clic mediante Gemini.

### Fase 5: Frontend y UI Split View Estilo Gmail (Estándar 02-admin-apps)
- [x] **Top Header Global:** Barra de búsqueda en cápsula *"Pregúntale a MerkeMail o busca correos..."*, badge de estado `● Activo`, accesos rápidos y avatar del usuario.
- [x] **Sidebar Estilo Gmail:** Botón cápsula prominente `+ Redactar`, navegación de carpetas con badges numéricos y selector de cuentas.
- [x] **Split View Horizontal (Master-Detail):**
  - Columna izquierda: Lista compacta de correos con checkboxes, estrellas, hora, asunto y snippet.
  - Columna derecha: Visor de lectura continuo con asunto grande, badge, cuerpo en scroll propio y barra inferior fija (`Responder`, `Reenviar`, `✨ Responder con IA`, `Agendar en Calendario`).
- [x] Dark Mode y Light Mode (`dark:bg-slate-950`, `dark:bg-slate-900`).
- [x] **Modales Laterales (Slide-over / Drawers laterales):**
  - Drawer para Copiloto Autónomo Antigravity.
  - Drawer para Redactor IA / Área de Prompts.
  - Drawer para Depuración de Correos por Prompt.
  - Drawer para Búsqueda Avanzada.
  - Drawer para Gestor de Firmas Multi-Cuenta.
  - Drawer para Ajustes y API Key de Gemini.
  - Drawer para Cuentas Conectadas.
- [x] Sistema de notificaciones Sticky para guardado/actualizaciones.
- [x] Modales de confirmación para borrado de correos, eventos o cuentas.

### Fase 6: Sistema de Administración de Etiquetas (Labels) y Filtros Dinámicos
- [x] Tablas `labels` y `email_labels` en SQLite con endpoints CRUD completos.
- [x] Sección interactiva de **Etiquetas** en el sidebar con botón `+` para crear nuevas etiquetas y paleta de colores.
- [x] Filtrado instantáneo por etiqueta y sincronización de vista de correos (cambio automático desde calendario).
- [x] Selector desplegable para asignar/desasignar etiquetas a correos individuales.
- [x] Badges de color en lista dividida y panel de lectura.

### Fase 7: Ajustes de Contraste, Botones y Capas de Modales
- [x] Resolución de conflictos de superposición: Drawers en `z-[60]` y Modales en `z-[100]`/`z-[110]` con desenfoque de fondo.
- [x] Botones con contraste sólido y legible en modo claro y modo oscuro.
- [x] Navegación consistente entre carpetas y calendario.
