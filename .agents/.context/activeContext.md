# Contexto Activo - MerkeMail

## Estado de Desarrollo Actual

- **Fase 79 - Restauración Integral de Funcionalidades (Contactos, Perfil de Usuario y Asistente Elio):**
  - **Libreta de Contactos y Agenda de Direcciones:**
    - Restaurado el acceso directo en la cabecera superior (`[ 👥 ]`) y en el menú de navegación lateral (`#nav-item-contacts`).
    - Restaurado el panel lateral completo `drawer-contacts` con buscador interactivo en vivo, badge de total de contactos (144 contactos actuales), botón para sincronizar al instante (`ContactsManager.syncNow`) con sticky toasts, y enlace directo para redactar o copiar correo.
    - Autocompletado de contactos activo en tiempo real en los campos `Para`, `CC` y `CCO` de la ventana de redacción (`#compose-to`, `#compose-cc`, `#compose-bcc`).
    - Inclusión del script `<script src="/static/js/contacts.js"></script>` en el frontend.
  - **Perfil del Usuario IA:**
    - Restaurado el botón de acceso directo en el header (`[ 👤 ]`) y en el sidebar bajo "Herramientas IA".
    - Panel lateral `drawer-user-profile` completamente operativo con análisis inteligente vía Gemini (`/api/user-profile/analyze`), campos de bio, cargos, organizaciones, teléfono, ubicación, sitios web y directrices de estilo.
    - Sincronización automática del perfil en las instrucciones de redacción y del asistente Elio.
  - **Asistente Elio y Barra de Búsqueda:**
    - Sidebar actualizado con la marca e identidad visual de `Elio (@elio)` y su icono oficial `img/bot.png`.
    - Barra de búsqueda superior con invocación rápida a `@elio`, chip de acción rápida `Preguntar a Elio` y placeholder contextual.
    - Drawer de Elio (`drawer-antigravity-copilot`) restaurado con su interfaz moderna: botón de `+ Nuevo Chat` (`#btn-antigravity-new-chat`), botón de expansión/compresión, badges de capacidades centrados, saludo inteligente con cuentas reales y sugerencias rápidas sin fechas inventadas.
  - **Sincronización:**
    - Verificación y sincronización con el instalador de escritorio (`install_desktop.sh`).

- **Fase 78 - Selección de Cuenta por Defecto y Avatar de Usuario:**
  - **Soporte en Base de Datos y Backend:**
    - Columna `is_default INTEGER DEFAULT 0` en tabla `accounts` y configuración `default_account_id` en `settings`.
    - Endpoints `GET /api/accounts/default` y `POST /api/accounts/{account_id}/default` para consultar y conmutar la cuenta principal de forma atómica.
    - `GET /api/accounts` expone `is_default` para consumo reactivo en la UI.
  - **Gestión Visual de Cuentas (`drawer-accounts` y `drawer-settings`):**
    - En el panel de "Cuentas Conectadas", la cuenta por defecto se destaca con badge `★ Predeterminada`, marco resaltado y estrella dorada.
    - Las demás cuentas cuentan con el botón interactivo para "Establecer como cuenta por defecto" (`EmailManager.setDefaultAccount`), con sticky toast al guardar.
    - Selector desplegable en el panel de Configuración (`#settings-default-account-select`) sincronizado en tiempo real.
  - **Avatar de Usuario Reactivo:**
    - `AvatarService.updateSystemHeaderAvatar()` prioriza la cuenta por defecto (`is_default === 1`).
    - Actualiza el avatar del header (`#user-header-avatar`) y el del drawer de perfil de usuario (`#user-profile-header-avatar`), utilizando la imagen de perfil oficial de Google (`avatar_url`) o las iniciales estilizadas con el color de la cuenta.
  - **Redacción de Correos:**
    - El selector de remitente en la ventana de redacción (`#compose-account`) preselecciona automáticamente la cuenta por defecto con indicador visual `★`.
  - **Sincronización:** Instalación de escritorio actualizada con `install_desktop.sh`.

- **Fase 78 - Selección de Cuenta por Defecto y Avatar de Usuario:**
  - **Soporte en Base de Datos y Backend:**
    - Columna `is_default INTEGER DEFAULT 0` en tabla `accounts` y configuración `default_account_id` en `settings`.
    - Endpoints `GET /api/accounts/default` y `POST /api/accounts/{account_id}/default` para consultar y conmutar la cuenta principal de forma atómica.
    - `GET /api/accounts` expone `is_default` para consumo reactivo en la UI.
  - **Gestión Visual de Cuentas (`drawer-accounts` y `drawer-settings`):**
    - En el panel de "Cuentas Conectadas", la cuenta por defecto se destaca con badge `★ Predeterminada`, marco resaltado y estrella dorada.
    - Las demás cuentas cuentan con el botón interactivo para "Establecer como cuenta por defecto" (`EmailManager.setDefaultAccount`), con sticky toast al guardar.
    - Selector desplegable en el panel de Configuración (`#settings-default-account-select`) sincronizado en tiempo real.
  - **Avatar de Usuario Reactivo:**
    - `AvatarService.updateSystemHeaderAvatar()` prioriza la cuenta por defecto (`is_default === 1`).
    - Actualiza el avatar del header (`#user-header-avatar`) y el del drawer de perfil de usuario (`#user-profile-header-avatar`), utilizando la imagen de perfil oficial de Google (`avatar_url`) o las iniciales estilizadas con el color de la cuenta.
  - **Redacción de Correos:**
    - El selector de remitente en la ventana de redacción (`#compose-account`) preselecciona automáticamente la cuenta por defecto con indicador visual `★`.
  - **Sincronización:** Instalación de escritorio actualizada con `install_desktop.sh`.

- **Fase 77 - Creación y Edición de Eventos con Características Completas Estilo Google Calendar:**
  - **Modal de Creación y Edición Enriquecido (`new-event-modal`):**
    - Rediseño integral inspirado en Google Calendar, con soporte para crear nuevos eventos y editar registros existentes (`POST /api/events` y `PUT /api/events/{id}`).
    - **Horario y Fechas Avanzadas:** Modo "Todo el día" (conmuta dinámicamente entre selectores de solo fecha o fecha+hora de inicio y fin).
    - **Recurrencia / Repetición (`recurrence`):** Opciones para "No se repite", "Cada día", "Cada semana", "Cada mes", "Anualmente" y "Todos los días laborables (lun-vie)".
    - **Videoconferencia Integrada Google Meet (`meeting_url`):** Botón para generar salas virtuales automáticas (`meet.google.com/xxx-yyyy-zzz`), caja de reunión con botón para copiar enlace con sticky toast, enlace directo clickeable y opción para quitar o personalizar con URLs de Zoom/Teams.
    - **Ubicación Física:** Campo para direcciones, salas u oficinas.
    - **Gestión de Invitados (`attendees`):** Chips interactivos de asistentes con botón de eliminación `×` y validación de correo.
    - **Paleta Cromática Google Calendar (`color`):** 11 tonos oficiales (Pavo real, Lavanda, Uva, Flamenco, Tomate, Mandarina, Plátano, Salvia, Albahaca, Arándano, Grafito) más el color predeterminado del calendario.
    - **Recordatorios / Notificaciones (`notification_minutes`):** 10 min, 15 min, 30 min, 1 hora, 1 día o sin recordatorio.
    - **Disponibilidad y Visibilidad (`availability` / `visibility`):** Ocupado/Disponible y Predeterminada/Pública/Privada.
    - **Notas y Descripción:** Soporte amplio para agenda y enlaces clickeables.
  - **Drawer de Detalle del Evento (`drawer-event-detail`):**
    - Visualización de insignia de recurrencia, botón prominente "Unirse con Google Meet", lista de invitados con avatares iniciales, badges de disponibilidad/visibilidad y botón "✏️ Editar" para abrir el formulario de actualización inmediata.
  - **Integración con Asistente Elio:**
    - `agendar_evento_calendario` en `antigravity_agent.py` actualizado para aceptar videollamadas, invitados y eventos de día completo.

- **Fase 77 - Creación y Edición de Eventos con Características Completas Estilo Google Calendar:**
  - **Modal de Creación y Edición Enriquecido (`new-event-modal`):**
    - Rediseño integral inspirado en Google Calendar, con soporte para crear nuevos eventos y editar registros existentes (`POST /api/events` y `PUT /api/events/{id}`).
    - **Horario y Fechas Avanzadas:** Modo "Todo el día" (conmuta dinámicamente entre selectores de solo fecha o fecha+hora de inicio y fin).
    - **Recurrencia / Repetición (`recurrence`):** Opciones para "No se repite", "Cada día", "Cada semana", "Cada mes", "Anualmente" y "Todos los días laborables (lun-vie)".
    - **Videoconferencia Integrada Google Meet (`meeting_url`):** Botón para generar salas virtuales automáticas (`meet.google.com/xxx-yyyy-zzz`), caja de reunión con botón para copiar enlace con sticky toast, enlace directo clickeable y opción para quitar o personalizar con URLs de Zoom/Teams.
    - **Ubicación Física:** Campo para direcciones, salas u oficinas.
    - **Gestión de Invitados (`attendees`):** Chips interactivos de asistentes con botón de eliminación `×` y validación de correo.
    - **Paleta Cromática Google Calendar (`color`):** 11 tonos oficiales (Pavo real, Lavanda, Uva, Flamenco, Tomate, Mandarina, Plátano, Salvia, Albahaca, Arándano, Grafito) más el color predeterminado del calendario.
    - **Recordatorios / Notificaciones (`notification_minutes`):** 10 min, 15 min, 30 min, 1 hora, 1 día o sin recordatorio.
    - **Disponibilidad y Visibilidad (`availability` / `visibility`):** Ocupado/Disponible y Predeterminada/Pública/Privada.
    - **Notas y Descripción:** Soporte amplio para agenda y enlaces clickeables.
  - **Drawer de Detalle del Evento (`drawer-event-detail`):**
    - Visualización de insignia de recurrencia, botón prominente "Unirse con Google Meet", lista de invitados con avatares iniciales, badges de disponibilidad/visibilidad y botón "✏️ Editar" para abrir el formulario de actualización inmediata.
  - **Integración con Asistente Elio:**
    - `agendar_evento_calendario` en `antigravity_agent.py` actualizado para aceptar videollamadas, invitados y eventos de día completo.

- **Fase 76 - Tareas sin Fecha en Calendarios, Herencia de Color de Cuentas y Control de Desbordamiento con Modal:**
  - **Sección de Tareas sin Fecha (Tasks):**
    - Nueva tarjeta lateral en el módulo de Calendario (`#calendar-tasks-list`) con contador dinámico y botón de creación directa (`+ Nueva`).
    - Soporte completo en backend (`backend/database.py`, `backend/calendar_service.py`, `backend/main.py`) para tareas sin fecha fija (`start_time=""` o `NULL`, `is_task=1`, `is_completed=0/1`).
    - Checkboxes interactivos para marcar tareas como completadas o reactivarlas (`PATCH /api/tasks/{id}/toggle`), con tachado visual y persistencia.
  - **Identificación Cromática según Calendario o Cuenta Conectada:**
    - Eventos y tareas heredan el color específico del calendario (`calendar_color`) y, en caso de no tenerlo, el color de la cuenta conectada (`account_color`), garantizando que cada registro muestre visualmente su procedencia.
    - Soporte multicuenta sin duplicaciones (`LEFT JOIN` corregido con subconsulta determinista).
  - **Control de Desbordamiento en Celdas Mensuales (`+N más`):**
    - En la vista de mes, cada celda muestra un máximo de 2 eventos para evitar distorsiones en la cuadrícula.
    - Cuando un día supera este límite, se renderiza un botón estilizado `+N más (X total)`.
    - Al hacer clic en el botón se abre el modal central `#modal-day-events`, mostrando todos los eventos y tareas programados para esa fecha con su hora, color y acceso directo al modal lateral de detalle.

- **Fase 75 - Mejoras Avanzadas en Calendario: Modal Lateral de Detalle, Vistas (Mes, Semana, Día con Horas), Botón Hoy y Calendario por Defecto:**
  - **Modal Lateral (Drawer) de Detalle del Evento (`drawer-event-detail`):** Panel lateral derecho que presenta toda la información disponible de citas y eventos. Incluye detector de enlaces para unirse con un clic a reuniones de Google Meet, Zoom o Teams en nueva pestaña (`target="_blank" rel="noopener noreferrer"`), enlaces web activos en la descripción (`linkifyText`), botón para saltar al correo de origen y eliminación protegida por modal `UI.confirm` con notificación sticky.
  - **Vistas Dinámicas de Mes, Semana y Día (Horas):** Selector de modalidades con persistencia en `localStorage` (`merke_calendar_view`).
    - *Mes:* Cuadrícula mensual completa con indicadores de días y eventos.
    - *Semana:* 7 columnas (Lun-Dom) con franjas horarias (07:00 a 21:00) y eventos mapeados a sus horas respectivas.
    - *Día:* Timeline diario vertical de 06:00 a 23:00 con detalle exhaustivo de compromisos y atajos para agendar en horas vacías.
  - **Botón Hoy y Navegación Reactiva:** Botón `Hoy` para regresar a la fecha actual y navegación `<` / `>` adaptada a semanas, días o meses según la vista activa.
  - **Calendario por Defecto y Tareas:**
    - Selector en `drawer-settings` (`settings-default-calendar-select`) guardado en la base de datos (`default_calendar_id`).
    - Modal de creación (`new-event-modal`) con alternador de tipo "Evento / Cita" vs "Tarea / Pendiente", preseleccionando el calendario por defecto y permitiendo elegir otro.
    - Asistente Elio (`agendar_evento_calendario`) agenda citas y tareas en el calendario configurado por defecto.

- **Fase 74 - Solución a Error de Conexión en Lanzador de Escritorio (`ERR_CONNECTION_REFUSED`):**
  - **Incompatibilidad pyOpenSSL en Virtualenv:** Se resolvió el conflicto de `AttributeError: module 'lib' has no attribute 'GEN_EMAIL'` originado por paquetes de sistema en Ubuntu 24.04 al importar bibliotecas de Google API con `cryptography` moderna.
  - **Fijación de pyopenssl:** Se instaló y fijó `pyopenssl==26.4.0` tanto en el venv de la app de escritorio (`~/.local/share/merkemail/.venv`) como en desarrollo y en `requirements.txt`.
  - **Margen de Arranque en Ventana:** Se aumentó la ventana de espera de arranque del backend a 8 segundos en `desktop/app_window.py` y `desktop/tray.py`.
  - **Sincronización:** Se ejecutó `scripts/install_desktop.sh` y se validó que el backend responda en el puerto 6524.

- **Fase 73 - Blindaje y Auditoría de Seguridad de Cuentas Conectadas:**
  - **Cifrado de Credenciales y Tokens en SQLite:** Implementado `backend/crypto_service.py` con clave `data/.secret.key` (permisos 0600). Las contraseñas IMAP y tokens de actualización (`oauth_refresh_token`) se almacenan cifrados con Fernet.
  - **Eliminación de Exposición de Tokens:** Se blindaron los endpoints `/api/accounts` y `/api/accounts/{id}` para no exponer bajo ninguna circunstancia los tokens OAuth ni contraseñas.
  - **Endurecimiento de CORS:** Eliminado `allow_origins=["*"]` y limitado exclusivamente a localhost/127.0.0.1 para evitar peticiones cruzadas desde webs de terceros.
  - **CSRF Token en OAuth2:** Generación y validación de tokens aleatorios para el parámetro `state` en el flujo de Google OAuth.
  - **CSP Estricto en Visor de Correos:** Aislamiento total de scripts en el iframe de lectura con `Content-Security-Policy: script-src 'none'`.

- **Fase 72 - Reubicación Responsiva de Etiquetas en Barra Delgada Secundaria:**
  - **Detección Automática de Espacio Disponible:** Implementado `EmailManager.setupLabelsResponsivePlacement` con `ResizeObserver` y detector de ancho en el panel de lectura.
  - **Barra Delgada Inferior (`#email-secondary-labels-bar`):** Al estrechar la ventana o en pantallas compactas donde los botones de acción ocupan el ancho superior, las etiquetas se desplazan fluidamente a una barra secundaria delgada ubicada justo debajo de las acciones.
  - **Comportamiento Reversible y Scroll Suave:** Al recuperar el espacio en pantalla grande, las etiquetas retornan arriba; en ambas ubicaciones cuentan con desplazamiento horizontal fluido con rueda de ratón o tacto.

- **Fase 71 - Scroll Horizontal para Etiquetas en Barra Superior de Correo:**
  - **Desplazamiento Horizontal en `.email-labels-scroll`:** Se modificó la barra superior del visor de correo abierto individual para contener las etiquetas en un carril con `overflow-x-auto flex-nowrap` y scrollbar delgado estilizado.
  - **Interacción Fluida con Rueda del Ratón:** Se habilitó el desplazamiento horizontal con la rueda del ratón (`wheel` a `scrollLeft`), evitando que las etiquetas se oculten o salten de línea.
  - **Blindaje de la Barra de Acciones:** La barra de acciones de la derecha se mantiene intacta en una sola fila con `flex-nowrap shrink-0`.

- **Fase 70 - Opción de Nuevo Chat Limpio (Sin Resumen ni Persistencia de Contexto):**
  - **Botón en Cabecera de Elio:** Se incorporó el botón con icono `+` (`#btn-antigravity-new-chat`) al lado del control de ampliación.
  - **Limpieza Total de Contexto:** Al activarlo, descarta y borra todos los mensajes y estados previos del DOM y memoria sin guardarlos, e invoca el endpoint `POST /api/agent/reset`.
  - **Inicio Directo sin Tarjeta de Resumen:** La nueva conversación se inicia con un saludo limpio y directo de Elio sin inyectar la tarjeta de estado de bandeja ni recomendaciones, enfocando el input para redactar o consultar de inmediato.

- **Fase 69 - Búsqueda de Correos por Fecha y Estado (Leídos y No Leídos en Recibidos):**
  - **Detección de Fechas Relativas en Herramientas:** Se mejoró `buscar_correos` en `backend/antigravity_agent.py` para reconocer términos como "ayer", "hoy", "antier" y formatos de fecha YYYY-MM-DD o DD/MM/YYYY.
  - **Depuración de Stopwords:** Se eliminan automáticamente términos de orden o intención (`busca`, `correos`, `de ayer`, `leídos`) del filtro textual para evitar que fallen búsquedas temporales.
  - **Inclusión de Leídos y No Leídos en Recibidos:** La herramienta ahora busca tanto en correos leídos (`is_read = 1`) como no leídos (`is_read = 0`) en toda la bandeja de Recibidos (`INBOX`, `CATEGORY_UPDATES`, `CATEGORY_PROMOTIONS`, etc.), permitiendo a Elio listar todos los correos recibidos ayer o en cualquier fecha con sus respectivos enlaces directos al visor.

- **Fase 68 - Ventana de Asistente Elio Redimensionable y Ajuste Responsivo Total:**
  - **Tirador Resizer Interactivo:** Se integró un resizer lateral arrastrable (`#antigravity-drawer-resizer`) en el borde izquierdo del panel de Elio con cursor `ew-resize`, permitiendo al usuario cambiar el ancho libremente con el ratón entre 360px y el 94% del ancho de la pantalla, persistiendo la medida en `localStorage`.
  - **Botón de Ampliar/Restaurar:** Botón `#btn-antigravity-toggle-expand` en la cabecera de Elio para alternar entre vista estándar (~448px) y vista expandida (~680px - 90vw), con cambio reactivo de iconos expand/compress.
  - **Ajuste Estricto de Contenido:** Se aplicaron clases `min-w-0 w-full overflow-hidden break-words` en `#antigravity-messages-container`, `#antigravity-welcome-bubble` y en los mensajes del chat, solucionando el desborde horizontal de texto y botones en el modo estándar.

- **Fase 67 - Licencia Business Source License 1.1 (BSL 1.1) y Perfil IA del Usuario:**
  - **Licencia BSL 1.1:** Archivo `LICENSE` asignado formalmente con conversión a Apache 2.0 a los 4 años y referenciado en `README.md`.
  - **Perfil IA del Usuario:** Módulo `user_profile_service.py` y `frontend/js/user_profile.js` para extraer y sintetizar datos del usuario (nombre, teléfono, dirección, rol, tono, enlaces) desde firmas y correos, alimentando el contexto para la redacción de correos.

- **Fase 66 - Libreta de Contactos, Invocación @elio y Prevención de Guardado en Spam/Papelera:**
  - **Sincronización de Contactos:** Servicio y drawer de contactos de cuentas conectadas sincronizado periódicamente cada 15 min.
  - **Invocación @elio en Búsqueda:** Al escribir `@elio ...` en la barra de búsqueda superior, se intercepta automáticamente, abriendo el chat de Elio y trasladando la consulta.
  - **Restricción de Almacenamiento:** Deshabilitado el botón de almacenar/archivar para correos en Spam, Papelera o Borradores.
  - **Visor Inicial Vacío:** Si la lista de correos está vacía o hay error, el visor muestra la pantalla inicial en lugar de retener el último correo abierto.

- **Fase 65 - Mensajes de Error Empáticos y Humanos con Ilustración `error.gif`:**
  - **Ilustración de Desconexión (`img/error.gif`):** Incorporada la ilustración del usuario en el sistema (`img/error.gif` y `~/.local/share/merkemail/img/error.gif`).
  - **Función Centralizada `UI.renderErrorState`:** Genera un diseño centrado, limpio y amable adaptado con tamaños proporcionados (`sm` para drawers/chat, `md` para listas y detalle de correos), explicando de manera humana lo ocurrido y ofreciendo un botón para reintentar la acción.
  - **Humanización de Errores Técnicos:** Sustituidos mensajes como `Failed to fetch` o excepciones HTTP por explicaciones empáticas en Antigravity Copilot, la lista de correos, el visor de lectura y las notificaciones sticky.
  - **Reintento Directo en Copilot:** En caso de corte o desconexión, el chat de Antigravity muestra la tarjeta con `error.gif` y el botón *"Reintentar mensaje"* para reenviar la última solicitud sin tener que volver a escribirla.

- **Fase 62 - Optimización de Rendimiento y Resolución de Procesos Huérfanos/Zombies:**
  - **Detección y Limpieza de Procesos:** Se identificaron procesos secundarios huérfanos/zombies acumulados de recargas previas de Uvicorn (`--reload`) que causaban congestión en los sockets locales. Se purgaron todos los procesos huérfanos y se estabilizó el servidor Uvicorn en modo directo, reduciendo la latencia de respuesta de los correos a **6-8 ms**.
  - **Eliminación de Bloqueos en Cascada en el Front-End:** Se modificó `EmailManager.loadLabels()` para pre-almacenar en memoria (`accountLabelsCache`) todas las etiquetas asociadas a cada cuenta de una sola vez, eliminando las peticiones de red redundantes y bloqueantes (`await fetch('/api/labels?account_id=...')`) que ocurrían cada vez que se abría un correo.

- **Fase 61 - Acciones Individuales en Visor de Correo (Barra Superior) y Ocultación de Agendar Cita IA:**
  - **Eliminación de Redundancia de Etiquetas:** Se eliminó el botón duplicado `+ Etiqueta` del lado izquierdo de la barra superior del correo abierto individual ([frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js)), unificando la asignación y gestión de etiquetas exclusivamente en el botón con icono **`🏷️`** de la barra de acciones superior derecha (con su menú desplegable flotante interactivo y cierre automático al hacer clic fuera).
  - **Ocultación Dinámica de Agendar Cita con IA:** Cuando el servicio de IA no está activo o se desactiva, el botón **`📅 Agendar en Calendario con IA`** (`#btn-top-schedule-ai` / `.btn-schedule-ai-feature`) se oculta automáticamente tanto en la barra superior de lectura como reactivamente en `GeminiAI.applyAIStatusUI()`, y `EmailManager.scheduleFromEmail` valida el estado activo de la IA antes de proceder.
  - **Acciones Individuales Integradas:** Se añadieron a la barra superior del correo abierto individual ([frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js)) las opciones análogas a la barra de acciones masivas:
    1. **Archivar (📥):** retira el correo de Recibidos / carpeta actual y regresa con sticky toast (`EmailManager.archiveCurrentEmail`).
    2. **Marcar como Spam (🚫):** envía el correo a la carpeta SPAM o lo restaura si ya estaba en SPAM (`EmailManager.markSpamCurrentEmail`).
    3. **Mover a Papelera (🗑️):** confirmación modal y traslado a papelera (`EmailManager.deleteCurrentEmail`).
    4. **Marcar como Visto / No Leído (✉️):** botón interactivo con cambio dinámico de icono (sobre abierto / cerrado), cancelación del temporizador automático de 7s y endpoint atómico `POST /api/emails/{id}/toggle-read` sincronizado con Gmail remoto (`UNREAD`).
    5. **Asignar Etiquetas (🏷️):** selector desplegable interactivo con checkboxes de etiquetas pertenecientes a la cuenta de origen del correo (accesible tanto desde el badge `+ Etiqueta` a la izquierda como desde el icono `🏷️` en la barra derecha con autocierre al hacer clic fuera).
    6. **Destacar (⭐):** alternancia de estado favorito.
    7. Acciones complementarias preservadas: Responder, Reenviar, Responder con IA (Gemini), Agendar en Calendario e Imprimir.

- **Fase 60 - Rediseño Visual Premium del Switch y Sección de IA:**
  - **Tarjeta Estilizada con Gradiente y Jerarquía:** Se reemplazó el bloque rígido anterior por `#gemini-service-card`, con gradiente sutil, icono destacado con halo púrpura, tipografía con jerarquía y badge inline reactivo (`● Activo` animado o `Desactivado`).
  - **Switch Toggle Estilo iOS / Radix UI:** Eliminación del checkbox deformado con checkmark nativo; implementación de un botón `role="switch"` con thumb deslizante (`translate-x-5` / `translate-x-0`), sombra flotante y transiciones ultra suaves.
  - **Transición y Feedback de Estado Pausado:** Cuando la IA se desactiva, las opciones de API Key, modelo y tono se atenúan elegantemente (`opacity-40 pointer-events-none`) y se despliega un banner informativo explicativo.

- **Fase 59 - Bordes con Color de Cuenta en Avatares:**
  - **Identificación Cromática en Avatares:** Se implementó en `AvatarService.render` ([frontend/js/avatars.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/avatars.js)) la aplicación automática y explícita de un borde circular de 2px (`border: 2px solid ${accountColor}`) con el color asignado a cada cuenta de correo.
  - **Menú Desplegable del Sidebar y Administrador de Cuentas:** Tanto en la lista rápida de cuentas del sidebar ([frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js)) como en el drawer de administración de cuentas y en las respuestas inline, las cuentas con fotos de perfil de Google o iniciales muestran su marco perimetral con el color correspondiente (ej. `#06b6d4` para Perry Daniels, `#ef4444` para Merke, `#f59e0b` para IONOS).
  - **Avatar del Header Superior:** El avatar del usuario en la barra superior (`#user-header-avatar`) refleja el borde con el color correspondiente a la cuenta activa o del sistema.

- **Fase 58 - Control Global de Servicio IA Gemini, Indicador de Estado y Ocultación Reactiva:**
  - **Interruptor de Activación/Desactivación en Ajustes (`#drawer-settings`):** Switch interactivo para habilitar o inhabilitar completamente el servicio de IA con Gemini, guardado en BD local (`settings.gemini_enabled`).
  - **Indicador de Estado en el Icono de Configuración:** Dot circular superior (`#gemini-status-dot`) que se muestra en verde (`bg-emerald-500`) cuando la IA está activa (activada y con API Key válida) y en **rojo** (`bg-rose-500`) cuando está inactiva o desactivada.
  - **Ocultación Reactiva de Funciones IA cuando está Inactiva:**
    - Badge `AI` junto a la marca MerkeMail en la cabecera (`#brand-ai-badge`).
    - Sección completa de "HERRAMIENTAS IA" en el sidebar izquierdo (`#sidebar-ai-section`), incluyendo título, Copiloto Autónomo, Redactor con IA y Depurar por Prompt.
    - Botón `✨ Asistente IA Prompt` en el modal de redacción de nuevo correo (`#btn-compose-ai-prompt`).
    - Botones de respuesta con IA (`✨ Responder con IA` y `+ Responder con IA`) en la barra de lectura y en el cuadro de respuestas inline.
  - **Protección a Nivel de Backend:** `GeminiService.get_client` valida `gemini_enabled`, impidiendo ejecuciones no autorizadas si el servicio se encuentra apagado.

- **Aplicación 100% Funcional y Operativa:** Servidor FastAPI en `http://127.0.0.1:8000`.
- **Cuenta de Usuario Conectada y Sincronizada:** Cuenta de Google OAuth 2.0 activa (`perrydaniels@gmail.com`) con correos descargados y cacheados en SQLite local (`data/merkemail.db`).
- **Diseño Moderno Split View (Estilo Gmail Dual Mode: Light & Dark):**
  - **Header Superior Transversal:** Barra de búsqueda central en forma de píldora (*"Pregúntale a MerkeMail o busca correos..."*), badge de estado `● Activo` con contraste óptimo en ambos temas, accesos rápidos y avatar del usuario.
  - **Sidebar Estilo Gmail:** Botón flotante `+ Redactar` con bordes y sombras sólidas en modo claro y oscuro, navegación de carpetas con badges numéricos (`Recibidos`, `Destacados`, `Enviados`, `Papelera`), acceso directo a Calendario, Herramientas IA y lista de cuentas con dots de colores personalizados.
  - **Administración Integral de Etiquetas (Labels):**
    - Sección de Etiquetas en el Sidebar con botón `+` para crear nuevas etiquetas.
    - Soporte CRUD completo: Crear, editar nombre y color (#hex), eliminar con modal de confirmación y asignación/desasignación a correos.
    - Filtrado dinámico instantáneo por etiqueta (al hacer clic carga los correos con esa etiqueta y alterna la vista si se estaba en el calendario).
    - Badges de color en la lista dividida de correos y en el encabezado de lectura.
  - **Navegación Unificada y Corrección de Vistas:**
    - Al hacer clic en cualquier carpeta o etiqueta, la vista principal cambia inmediatamente de Calendario a la bandeja de Correos y resalta la selección activa.
    - Filtro de `STARRED` funcional con `is_starred = 1`.
  - **Jerarquía y Corrección de Modales y Drawers:**
    - Drawers laterales estandarizados en capa `z-[60]` con backdrop desenfocado `backdrop-blur-sm`.
    - Modales centrales (Redactar, Nueva Cuenta, Google OAuth, Nueva Etiqueta, Nuevo Evento, Modal de Confirmación de Borrado) en `z-[100]` y `z-[110]`.
    - Cierre automático de drawers al abrir modales para evitar superposiciones desordenadas.
  - **Botones con Diseño y Contraste Mejorado:**
    - Contraste nítido de botones en Light y Dark Mode (`Responder`, `Reenviar`, `Responder con IA`, `Agendar en Calendario`, botones de acción del header y del visor de correos).
  - **Perfeccionamiento Visual de Opciones Seleccionadas (Light & Dark Mode):**
    - **Header superior:** Botón de Ajustes con dot verde discreto de status, sin desbordamiento de texto. Botones de acción circulares uniformes.
    - **Sidebar izquierdo:** Estados activos nítidos en carpetas (`INBOX`, `STARRED`, `SENT`, `TRASH`) y etiquetas con fondo suave y borde izquierdo indicador (`border-l-2 border-indigo-600`).
    - **Gestión y Selector de Cuentas en Sidebar:** Opción "Todas las cuentas" y cuentas individuales con dot de color, truncado elegante, indicador de selección activa y sincronización bidireccional con el filtro superior.
    - **Detalle de Correo:** Inyección y renderizado de etiquetas en la cabecera del correo con chip de color y opción de eliminar/añadir etiquetas; botones inferiores en píldora con excelente contraste (`Responder`, `Reenviar`, `Responder con IA`, `Agendar en Calendario`).
  - **Soporte Dinámico para Carpetas del Sistema Google/Gmail e IMAP:**
    - Integración de todas las carpetas del ecosistema Google: `Recibidos`, `Destacados`, `Enviados`, `Borradores`, `Papelera`, `Spam`, `Todos`, `Importantes`, `Promociones`, `Social`, `Notificaciones`, `Foros`.
    - Sección desplegable `Más / Menos` en el sidebar idéntica a la experiencia de Gmail oficial.
    - Auto-sincronización remota bajo demanda para cada carpeta solicitada con descarga de correos y clasificación nativa (`labelIds`).
  - **Barra de Acciones Superior en Visor de Correos:**
    - Se eliminó el área inferior flotante del visor de correos, otorgando el 100% de la altura al contenido del mensaje.
    - Se integraron todos los botones de acción (`Responder`, `Reenviar`, `Responder con IA`, `Agendar en Calendario`, `Destacar`, `Imprimir`, `Mover a papelera`) en la barra superior derecha del correo como iconos con tooltips.
  - **Sincronización en Vivo de Etiquetas y Carpetas Reales de la Cuenta:**
    - Conexión e importación automática de las etiquetas de usuario reales desde la cuenta conectada (`users().labels().list`).
    - Consulta dinámica de correos por carpeta (`INBOX`, `SENT`, `STARRED`, `TRASH`) y por etiqueta remota con descarga y vinculación automática bajo demanda.
    - Botón de sincronización manual de etiquetas y actualización integral de la vista activa.
    - Reubicación del botón **Redactar** en la cabecera superior al lado de la marca MerkeMail para mayor comodidad y amplitud en el sidebar.
  - **Capacidades de IA Activas:**
    - **Google Gemini SDK (`google-genai`):** Modelos dinámicos (`gemini-2.5-flash`, etc.), resumen ejecutivo, smart reply, extracción de citas al calendario y redactor con tono personalizable.
    - **Google Antigravity SDK (`google-antigravity`):** Copiloto autónomo (`AntigravityMailAgent`) con ejecución de herramientas (`buscar_correos`, `leer_correo`, `agendar_evento_calendario`, `listar_proximos_eventos`).
    - **Mail Cleanup AI:** Depuración inteligente de buzones mediante instrucciones en lenguaje natural.
  - **Gestor de Firmas Multi-Cuenta:** Gestión CRUD de firmas con asignación por cuenta e inyección automática en el redactor.
  - **Calendario Unificado:** Matriz mensual y lista de agenda combinada para Google Calendar y Proton Calendar.
  - **Aislamiento y Contención de Contenido HTML en Correos:**
    - Solucionado el problema de desbordamiento horizontal en newsletters y promociones con tablas de ancho fijo (`<table width="650">`, etc.).
    - Incorporación de `min-w-0`, `overflow-x-auto` y contención responsive profunda en el panel de detalle (`#email-detail-container`), la cabecera y el contenedor `.email-body-content` en `app.css` y `email.js`, garantizando márgenes estables e inmutables en toda la aplicación.
  - **Acciones por Lote en la Lista de Correos (Toolbar Superior):**
  - **Contadores de Correos No Leídos en Todas las Carpetas y Etiquetas:**
    - Nuevo endpoint ultra-rápido en backend `GET /api/emails/unread-counts` (soporta filtro opcional `account_id` para cuentas individuales o todas las cuentas).
    - Cálculo de no leídos (`is_read = 0`) para Recibidos (`INBOX` + categorías), Destacados (`STARRED`), Enviados (`SENT`), Borradores (`DRAFT`), Spam (`SPAM`), Papelera (`TRASH`), Todos (`ALL`), Importantes (`IMPORTANT`), Promociones, Social, Notificaciones, Foros y todas las etiquetas personalizadas de usuario.
    - Badges numéricos visibles y estilizados en todas las carpetas y en cada etiqueta (`#label-badge-${id}`) con actualización en vivo al abrir correos, cambiar de cuenta, aplicar acciones masivas o sincronizar.
    - Integración con el flyout `#sidebar-hover-bar` en modo colapsado.
    - Al seleccionar uno o varios correos con los checkboxes, se activan y muestran automáticamente los botones de acción masiva solicitados (Archivar, Marcar como Spam, Mover a Papelera, Marcar Leído/No Leído, Mover a Carpeta) con feedback sticky y modales de confirmación para borrado.
  - **Barra Lateral Contraíble y Redimensionable por Arrastre (Sidebar Resizer):**
    - Botón de colapsar / expandir en la parte superior del sidebar (y en el menú hamburguesa del header) que alterna entre la vista completa (240px) y una vista compacta de iconos (64px) con tooltips descriptivos.
    - Divisor interactivo (`#sidebar-resizer`) entre el sidebar y el panel de correos para redimensionar libremente mediante arrastre de ratón (drag-to-resize) con límites protegidos: no menos de un espacio prudencial (64px) y máximo de 280px.
    - Persistencia automática del ancho y estado colapsado en `localStorage`.
    - Sincronización global multicuenta: `/api/emails/sync` ahora recorre y actualiza todas las cuentas activas conectadas cuando se está en la vista unificada.
    - Soporte unificado de `INBOX` para subcategorías de Gmail (`CATEGORY_UPDATES`, `CATEGORY_PROMOTIONS`, etc.): Los correos clasificados en categorías de sistema aparecen en la bandeja `Recibidos` y en sus respectivas subcarpetas, permitiendo ver de inmediato los correos de cuentas adicionales y nuevas.
    - Sincronización bidireccional entre el selector de cuentas superior y el panel lateral con restablecimiento automático a la bandeja de entrada al alternar entre cuentas.
  - **Filtros de Búsqueda Avanzada Completos y Multicriterio:**
    - Panel lateral tipo drawer (`#drawer-search-advanced`) enriquecido con controles completos:
      - Búsqueda general por palabra clave (asunto, cuerpo, remitente, snippet).
      - Remitente específico (`De:`) y destinatario específico (`Para:`).
      - Asunto específico (`Asunto:`).
      - Selección múltiple de etiquetas de usuario con chips interactivos y dots de color (`label_ids`).
      - Rango de fechas y horas exactas con selectores de tipo `datetime-local` (`date_from` y `date_to`) y atajos rápidos (*Hoy*, *7 días*, *30 días*, *Este año*).
      - Ubicación/Carpeta (`INBOX`, `STARRED`, `SENT`, `DRAFT`, `SPAM`, `TRASH`, `IMPORTANT`, `CATEGORY_*`).
      - Cuenta de correo específica o Todas las cuentas.
      - Estado de lectura (Todos / Solo No Leídos / Solo Leídos).
      - Destacados (Todos / Con estrella / Sin destacar).
      - Solo con archivos adjuntos (`has_attachments = true`).
      - Urgencia/Prioridad IA (Alta, Media, Baja).
    - Banner informativo de filtros activos (`#active-filters-banner`) con botón de limpieza en un clic y dot indicador en el header.
    - Soporte completo en backend (`/api/emails`) con consultas SQL parametrizadas y rápidas.
    - Solucionado el problema donde solo el primer correo mostraba la franja azul izquierda.
    - La causa era que la regla `divide-y` de Tailwind sobreescribía `border-color` en los elementos hermanos (`~ :not([hidden])`).
    - Se creó la clase `.email-list-item.selected` en `app.css` con `border-left-color: #4f46e5 !important;` y fondo distintivo, permitiendo que cualquier correo seleccionado resalte con su franja azul y fondo activo de forma uniforme y nítida.
  - **Indicativo Visual de Archivos Adjuntos (Icono de Clip):**
    - Sincronización precisa de `has_attachments` tanto en IMAP como en Gmail API (OAuth2) mediante análisis recursivo de partes y `attachmentId`.
    - Base de datos local actualizada para todos los correos preexistentes que contienen adjuntos.
    - Icono de clip (`📎`) estilizado en la lista dividida de correos (junto a la fecha/hora de recepción) para cada correo con adjuntos.
    - Chip e indicador de adjuntos en la cabecera del visor de lectura de correos.
    - Reubicado en la posición superior de la barra lateral (reemplazando el texto estático "Carpetas").
    - Se retiró el selector del header superior y se eliminó la lista repetida del pie del sidebar, concentrando toda la interacción en un único componente limpio y accesible.
    - Aspecto idéntico y enriquecido al de la lista original: muestra dot de color personalizado por cuenta (o gradiente para la bandeja combinada), nombre del titular, dirección de correo, estado activo y acceso directo a la administración de cuentas.
    - Soporte responsivo: cuando el sidebar está colapsado a 64px, el botón muestra únicamente el dot de color centrado con tooltip descriptivo y el menú flotante se despliega hacia la derecha.
  - **Barra de Acciones Masivas por Lote (Estilo Gmail):**
    - Desplegable de criterios de selección: Todos, Ninguno, Leídos, No leídos, Destacados, Sin destacar.
    - Barra dinámica de herramientas que se activa al marcar checkboxes:
      1. Archivar (`archive`)
      2. Marcar como Spam (`spam`)
      3. Eliminar con modal de confirmación (`trash` / papelera)
      4. Marcar como leído / no leído (`toggle_read`)
      5. Menú de etiquetas en lote (`add_label`)
      6. Más opciones (Destacar / Quitar estrella)
    - Nuevo endpoint FastAPI `/api/emails/batch-action` para procesamiento instantáneo de acciones masivas en SQLite.
  - **Redimensionamiento y Modo Compacto de la Lista de Correos:**
    - Divisor interactivo (`#email-list-resizer`) entre la lista de correos y el panel de lectura para arrastrar y cambiar de tamaño con fluidez.
    - Límites: mínimo de 200px y máximo de 480px (su ancho actual original).
    - Ocultamiento inteligente al reducir tamaño (`.compact-mode` <= 340px): se oculta el snippet de texto de vista previa y las etiquetas, compactando la altura de cada elemento y ocultando el texto del paginador ("1-12 de 89") en la barra superior para evitar saturación visual.
    - Modo ultra-compacto (`.ultra-compact-mode` <= 260px): se ocultan elementos secundarios como la fecha para priorizar remitente y asunto sin saturación.
    - Persistencia en `localStorage` (`email_list_width`).
  - **Barras Divisorias Ultra-Delgadas (1 px):**
    - Se eliminaron los bordes dobles en `#sidebar-container` y `#email-list-container`.
    - Los divisores `#sidebar-resizer` y `#email-list-resizer` ahora tienen exactamente 1 px de grosor visual, eliminando el espacio muerto entre columnas.
    - Cuentan con un área de contacto invisible (`::after`) de 9 px para poder agarrar y arrastrar con total facilidad y precisión.
  - **Barra de Acciones por Lote Responsiva (Overflow Dinámico):**
    - Se eliminó el botón hamburguesa redundante del header superior.
    - Cuando hay espacio suficiente (ancho amplio/normal): se muestran todos los iconos de acción directamente en la barra (Archivar, Spam, Eliminar, Leído/No leído, Etiquetas, Destacar, Quitar estrella), y el selector de 3 puntos se oculta automáticamente al no tener elementos desbordados.
    - Cuando la columna se reduce: los iconos que ya no caben se transfieren automáticamente al menú de 3 puntos (Destacar, Quitar estrella, Etiquetas, etc.), mostrando el selector de 3 puntos solo cuando contiene opciones.
  - **Sincronización Total de Checkboxes y Deselección Automática de Acciones:**
    - Arquitectura con `selectedBatchIds = new Set()` para rastreo infalible del estado de selección de correos.
    - Función centralizada `clearSelection()` que desmarca todas las casillas del DOM, reinicia el checkbox principal `#split-select-all` (eliminando estado checked e indeterminate), oculta la barra masiva `#batch-actions-bar` y restaura el botón de refrescar.
    - Deselección total garantizada tras ejecutar cualquier acción por lote (`executeBatchAction`, `deleteSelectedBatch`), así como al cambiar de carpeta, cuenta, etiqueta, buscar o paginar.
    - Función `updateBatchSelectionUI()` ejecutada en cada renderizado para mantener coherencia visual y lógica al 100%.
  - **Sidebar Colapsado: Conservación del Botón Flecha, Ocultamiento del Selector de Cuentas y Barra Flotante:**
    - Al reducir/colapsar la barra lateral (64px), el selector de cuentas (`#sidebar-account-dropdown-wrapper`) desaparece completamente (`display: none !important;`) para no recargar visualmente.
    - El botón de colapso/expansión (`#btn-sidebar-collapse`, opción 1) permanece activo y centrado (38x38px) con su flecha rotada hacia la derecha (`transform: rotate(180deg)`), permitiendo al usuario volver a expandir el sidebar con 1 solo clic.
    - Se reemplazó el tooltip nativo tosco y demorado del navegador (opción 2) por una **barra flotante estilizada** (`#sidebar-hover-bar`): aparece suavemente al lado de cada icono con el texto de la opción, badge numérico o dot de color correspondiente, eliminando el atributo `title` para que Chrome/OS no pinte el tooltip nativo.
    - Opciones de expansión múltiple: clic directo en la flecha `#btn-sidebar-collapse`, doble clic en el resizer o arrastre del divisor `#sidebar-resizer`.
  - **Entorno Completamente Responsivo y Práctico (Móvil, Tablet y Escritorio):**
    - **Móviles (< 768px):**
      - Header adaptativo con botón menú hamburguesa para desplegar el sidebar como drawer deslizante con backdrop oscuro.
      - Al seleccionar carpeta, etiqueta o cuenta, el sidebar móvil se auto-cierra con fluidez.
      - Navegación Master-Detail en vista única: en móvil se muestra la lista de correos al 100% de ancho; al pulsar un correo se muestra el visor a pantalla completa con botón "← Volver" para regresar a la lista.
      - Ocultamiento de divisores de arrastre (`#sidebar-resizer`, `#email-list-resizer`) que no aplican a pantallas táctiles.
      - Modales y Drawers ajustados al ancho de pantalla móvil con márgenes protegidos.
    - **Tablets (768px a 1023px):**
      - Lista de correos optimizada en tamaño compacto (340px) y split view simultáneo con el visor de lectura.
    - **Escritorio (>= 1024px):**
      - Split view amplio con redimensionamiento fluido por arrastre y persistencia en `localStorage`.
    - **Calendario Responsivo:**
      - Header flexible y diseño adaptativo en columna única para móvil/tablet y matriz con agenda lateral para desktop.
  - **Lógica Bidireccional Inteligente (Toggle) en Acciones Masivas:**
    - **Etiquetas:** Al aplicar una etiqueta sobre múltiples correos seleccionados, a los correos que ya la tengan previamente se les remueve y a los que no la tengan se les asigna.
    - **Destacados (Estrellas):** Toggle inteligente por correo (`CASE WHEN is_starred = 1 THEN 0 ELSE 1 END`), quitando la estrella a los destacados y añadiéndola a los no destacados.
    - **Leído / No leído:** Alterna el estado de cada correo según su condición previa (`is_read = 1 <-> 0`).
    - **Spam, Archivo y Papelera:** Mueve o restaura a la bandeja principal (`INBOX`) según el estado previo del correo.
  - **Contador de Correos No Leídos en Todas las Carpetas y Etiquetas:**
    - Badges numéricos reactivos en el sidebar para carpetas del sistema (Recibidos, Destacados, Enviados, Borradores, Spam, Papelera) y etiquetas personalizadas.
    - Endpoint `/api/emails/unread-counts` optimizado con actualización periódica e inmediata tras cada acción.
  - **Filtros de Búsqueda Avanzada Multicriterio:**
    - Drawer deslizable con filtros por palabra clave, remitente, destinatario, asunto, selección múltiple de etiquetas con chips interactivos, rango de fechas y horas (`datetime-local`) con atajos rápidos ("Hoy", "Esta semana", "Este mes", "Año actual"), carpeta, cuenta, estado de lectura, destacados, adjuntos y urgencia IA.
    - Banner informativo de filtros activos con botón de limpieza directa.
  - **Indicador de Archivos Adjuntos (Icono Clip 📎):**
    - Extracción recursiva de adjuntos en IMAP/Gmail API (`has_attachments = 1`).
    - Icono de clip sutil y moderno en cada fila de la lista de correos y en el visor de lectura junto al asunto y fecha.
  - **Control de Sincronización Automática (Activo / Pausado) e Intervalos por Cuenta:**
    - Botón de estado interactivo en el header (`#btn-toggle-auto-sync`) con estados visuales:
      - **Activo:** Indicador verde con pulso animado, sincronizaciones periódicas activadas en background.
      - **Pausado:** Indicador ámbar con icono `⏸`, suspensión total de tareas periódicas de sincronización.
      - Alterne al vuelo con sticky toasts de notificación y persistencia en `localStorage`.
    - Intervalo de sincronización configurable por cuenta (`sync_interval` en SQLite):
      - Selector en modal de Crear/Editar cuenta con opciones habituales: 1 minuto (alta frecuencia), 5 minutos (recomendado), 15 minutos, 30 minutos, 1 hora, o Manual.
      - Planificador en segundo plano (`initAutoSyncScheduler`) que gestiona la frecuencia independiente de cada cuenta conectada sin interrumpir al usuario.
  - **Corrección de Visibilidad y Centrado de Iconos/Dots de Etiquetas:**
    - Se solucionó el problema donde el contenedor de badge de no leídos empujaba o invisibilizaba los dots de las etiquetas en la barra lateral.
    - Contenedor derecho envuelto en `.sidebar-text` para auto-ocultarse completamente al colapsar el sidebar.
    - Círculos de color (`.label-dot`) fijos a la izquierda en vista normal y perfectamente centrados (38x38px) en vista colapsada, evitando cualquier desplazamiento lateral indeseado.
  - **Asignación y Eliminación de Etiquetas Contextuales en Correo Abierto:**
    - Eliminación directa de etiquetas asignadas con botón `×` visible y estilizado en cada chip.
    - Botón `×` en el chip de `Recibidos` para archivar el correo inmediatamente.
    - Desplegable `+ Etiqueta` inteligente que carga las etiquetas exclusivas de la cuenta origen del correo (`email.account_id`).
    - Casillas interactivas con checkmark (`✔`) estilo Gmail para alternar etiquetas con un solo clic.
    - Sincronización en tiempo real en SQLite y con la API de Gmail en segundo plano (`modify_message_labels`).
  - **Jerarquía Responsiva con Máxima Prioridad al Correo Actual:**
    - Cascada adaptativa en tablets y pantallas medianas que cede el espacio prioritario al panel de lectura del correo:
      1. Se colapsa primero la barra lateral (`#sidebar-container`) a 64px al reducirse a menos de 1200px.
      2. Se reduce luego la lista de correos (`#email-list-container`) a modo compacto (270px-320px) en tablets verticales/medianas (< 992px).
    - El área del correo (`#email-detail-container`) retiene siempre más de 420px de ancho disponible, impidiendo su estrangulamiento.
    - El redimensionador manual protege un ancho mínimo de 380px para la lectura.
  - **Botón de Limpieza Inmediata en la Barra de Búsqueda:**
    - Botón `×` (`#btn-clear-search`) ubicado a la derecha del texto ingresado antes de los filtros avanzados.
    - Se muestra automáticamente en cuanto el usuario escribe y se oculta cuando el campo está vacío.
    - Soporta clic directo y atajo de teclado tecla `Escape`, limpiando la consulta y recargando la bandeja con notificación sutil.
  - **Checkboxes Limpios y Vacíos (Estilo Gmail):**
    - Se suprimió el renderizado oscuro de widgets nativos de Chromium/OS (`appearance: none`).
    - En estado desmarcado (vacío) se visualizan con fondo blanco transparente y un marco gris suave (`border-slate-300`).
    - Al marcarse o estar en selección parcial, muestran fondo índigo nítido con tilde blanca o guión.
  - **Instalación Local como Progressive Web App (PWA):**
    - `manifest.json` y `sw.js` servidos con scope `"/"` desde FastAPI (`GET /manifest.json` y `GET /sw.js`).
    - Iconos de aplicación estándar generados en 192x192 y 512x512 (`/img/icon-192.png`, `/img/icon-512.png`).
    - Service Worker con estrategia Network First y fallback offline para assets estáticos.
    - Captura del evento `beforeinstallprompt` con botón de instalación en la barra superior (`#btn-install-pwa`) y en Ajustes (`#drawer-settings`).
    - Detección de modo `standalone` y eventos de instalación exitosa con sticky toast.
  - **Redactor de Correos con Formato HTML Enriquecido (WYSIWYG Composer):**
    - Modal de redacción renovado y expandible (`Composer.toggleExpand()`) con campos plegables para `Cc` y `Cco`.
    - Barra completa de herramientas de formato HTML:
      - Deshacer / Rehacer (`Ctrl+Z`, `Ctrl+Y`).
      - Selector de Encabezados/Bloques (Normal, H1, H2, H3, Código `<pre>`).
      - Selector de Tipografías (Inter, Arial, Georgia, Courier New).
      - Estilos de carácter: Negrita (`Ctrl+B`), Cursiva (`Ctrl+I`), Subrayado (`Ctrl+U`), Tachado.
      - Paleta de color de texto y marcador de resaltado con swatchers visuales.
      - Alineaciones: Izquierda, Centro, Derecha, Justificado.
      - Listas ordenadas y desordenadas (viñetas/números), sangría (outdent/indent).
      - Citas en bloque (`<blockquote>`), separador horizontal (`<hr>`), modal para insertar enlaces web (`Ctrl+K`).
      - Limpiador de formato (`removeFormat`) y alternador de código fuente HTML (`</>`).
    - Área `contenteditable` con soporte de placeholder y sincronización continua con el backend (`is_html: true`).
    - Integración transparente con firmas corporativas y generación de borradores con Gemini IA.
  - **Editor de Respuesta en Línea Estilo Gmail (Inline Quick Reply):**
    - Caja de respuesta integrada al pie del correo abierto con avatar de cuenta, destinatario y botón de pop-out hacia modal flotante.
    - Barra de formato HTML colapsable mediante el botón `Aa` (negrita, cursiva, subrayado, tachado, encabezados, colores, viñetas, alineación).
    - Botones dedicados para: Enviar con icono de flecha, "+ Responder con IA" (Gemini Smart-Reply), insertar enlace web y descartar borrador (papelera).
    - Inserción automática de la firma de la cuenta y scroll suave instantáneo al pulsar "Responder" o "Responder con IA" en la cabecera.
  - **Traducción de Categorías y Etiquetas Nativas al Español:**
    - Mapeo automático de categorías del sistema de Gmail (`CATEGORY_UPDATES` -> "Actualizaciones", `CATEGORY_PROMOTIONS` -> "Promociones", `CATEGORY_SOCIAL` -> "Social", `CATEGORY_FORUMS` -> "Foros", `CATEGORY_PERSONAL` -> "Principal").
    - Chips traducidos en la cabecera del correo abierto, lista de correos, barra lateral y selector desplegable de asignación de etiquetas.
    - Soporte de archivado directo (botón `×`) para correos ubicados en categorías de entrada.
  - **Gestor de Firmas con Formato HTML y Edición Directa:**
    - Formato HTML enriquecido en firmas: barra de herramientas en el drawer (`Negrita`, `Cursiva`, `Subrayado`, `Viñetas`, `Listas numeradas`, `Insertar enlace`, `Color de texto`, `Limpiar formato` y vista `</> HTML` crudo).
    - Carga y edición de firmas en el formulario superior: al hacer clic en cualquier firma guardada o en su botón de lápiz, sus datos (nombre, cuenta, contenido HTML, opción default) se cargan inmediatamente en el formulario.
    - Modo dual "Nueva Firma" / "Editar Firma" con badge de estado, botón de "Cancelar edición" y botón dinámico "Actualizar Firma".
    - Endpoint `PUT /api/signatures/{sig_id}` en backend para actualizar firmas existentes manteniendo la sincronización de firma predeterminada.
    - Renderizado visual interactivo del HTML de cada firma en la lista inferior y resaltado con anillo distintivo cuando una firma está en edición activa.
    - Notificaciones sticky toast al guardar o actualizar y modales de confirmación antes de eliminar.
  - **Firma por Defecto Automática y Cursor Superior en Editores:**
    - Carga automática y asíncrona de la firma por defecto de la cuenta (o firma predeterminada global) tanto en la respuesta rápida en línea (`InlineReply`, `#inline-reply-editor`) como en el redactor modal (`Composer`, `#compose-editor`).
    - Estructura limpia y protegida: el bloque de firma se añade en la parte inferior con separación adecuada y `contenteditable="false"` para evitar deformación accidental al redactar.
    - Ubicación automática del cursor en la parte superior: creación/enfoque de bloque editable inicial antes de la firma (`setCursorToTop` / `focusTop`) para que el usuario pueda escribir su mensaje directamente desde la primera línea.
    - Placeholder inteligente responsivo que se muestra en la parte superior cuando no hay texto ingresado y desaparece tan pronto como el usuario escribe.
    - Soporte completo al abrir el correo, al pulsar "↩ Responder", al abrir el redactor modal o al descartar borradores.
  - **Limpieza de Etiquetas HTML en Snippets de los Listados de Correos:**
    - Filtrado y extracción de texto plano mediante `cleanSnippet` en `frontend/js/email.js`, eliminando cualquier tag HTML (`<p>`, `<div>`, `<br>`, etc.) y decodificando entidades antes de renderizar la vista previa en la lista de correos.
    - Almacenamiento limpio en backend (`google_oauth.py` y `email_service.py`): conversión de `body` HTML a texto puro limpio para el `snippet` de 160 caracteres al enviar correos.
    - Sanitización de registros históricos en la base de datos local SQLite (`data/merkemail.db`).
  - **Ordenamiento Cronológico Descendente Estricto (Más Nuevo Arriba, Más Viejo al Final):**
    - Identificación y corrección de discrepancia de ordenamiento en SQLite provocada por zonas horarias heterogéneas (`+00:00`, `-08:00`, etc.) donde la comparación alfabética de texto desfasaba los correos.
    - Consulta SQL optimizada con `ORDER BY COALESCE(datetime(emails.date), emails.date) DESC, emails.id DESC` en `/api/emails` y consultas de limpieza de IA.
    - Captura canónica de la fecha de recibido: uso de `internalDate` de Gmail API (marca de tiempo Unix en ms de llegada al buzón) y normalización a ISO 8601 UTC uniforme (`YYYY-MM-DDTHH:MM:SSZ`) en `google_oauth.py` e `email_service.py`.
    - Migración y normalización de las 175 fechas históricas existentes en `data/merkemail.db`.
    - Ordenamiento protector adicional en el cliente JavaScript (`new Date(date).getTime()`) al renderizar la tabla.
  - **Aislamiento Total del Diseño del Correo y Visualización 100% Fiel de Imágenes:**
    - Renderizado de correos HTML dentro de un `iframe` aislado (`email-body-frame`), protegiendo completamente el entorno de la aplicación de fugas de estilos (`body { padding: ... }`, resets globales, etc.) que alteraban márgenes del sidebar, cabecera y aplicación.
    - Preservación íntegra del diseño original: tablas, anchos, colores y tipografías se despliegan con las reglas estándar de emails sin interferencia del preflight de Tailwind.
    - Altura auto-ajustable con `ResizeObserver` y `MutationObserver` para eliminar barras de desplazamiento internas duplicadas.
    - Resolución integral de imágenes inline (`cid:`): conversión de todas las imágenes incrustadas a Data URIs (`data:image/png;base64,...`) tanto en la base de datos como en tiempo real vía Gmail API e IMAP.
    - Soporte completo para imágenes remotas mediante `<meta name="referrer" content="no-referrer">`, atributos `referrerpolicy` y endpoint de proxy seguro `/api/image-proxy` con fallback automático.
  - **Gestión de Spam y Protección de Imágenes en Correos No Deseados:**
    - Botón **"No es spam"** disponible en la barra de herramientas superior del correo abierto y en el banner de advertencia para correos en la carpeta de Spam.
    - Endpoint backend `POST /api/emails/{email_id}/not-spam` que mueve el correo a `INBOX` en SQLite y sincroniza etiquetas remotas (`removeLabelIds: ['SPAM']`, `addLabelIds: ['INBOX']`) en Gmail.
    - Bloqueo preventivo de imágenes para correos en Spam: sustitución de fuentes de imagen y neutralización de fondos para evitar solicitudes de red y rastreo no autorizado.
    - Banner de advertencia con botón **"Mostrar imágenes"** para autorizar de forma explícita y bajo demanda la visualización de imágenes en el correo abierto.
  - **Detección, Visualización y Descarga Completa de Archivos Adjuntos:**
    - Registro y sincronización de metadatos de adjuntos (`filename`, `content_type`, `size`, `remote_id`, `file_path`) para correos de Gmail API y cuentas SMTP/IMAP en la base de datos local SQLite.
    - Endpoint `GET /api/attachments/{attachment_id}/download` que recupera el documento en tiempo real desde la API de Gmail o del disco local con su nombre y cabeceras MIME de descarga directa.
    - Sección enriquecida de archivos adjuntos en el visor de lectura con tarjetas responsivas, distintivos de tipo de documento (PDF en rojo, Excel/Hojas en esmeralda, Word en azul, Imágenes en púrpura, Comprimidos en amarillo), tamaño formateado en KB/MB y botón de descarga individual.
    - Botón "Descargar todos" para descargar secuencialmente todos los archivos adjuntos de un correo con notificación sticky informativa.
  - **Alternancia Bidireccional de Ocultar/Mostrar Imágenes en Correos de Spam:**
    - Botón interactivo de conmutación en el banner de advertencia superior de Spam (`btn-toggle-spam-images-${email.id}`).
    - Permite tanto desbloquear las imágenes bajo demanda (*"Mostrar imágenes"*) como volver a bloquearlas y ocultarlas en cualquier momento (*"Ocultar imágenes"*).
    - Estado reactivo: actualiza el texto informativo del banner, conmuta el icono y etiqueta del botón, y re-renderiza de inmediato el `iframe` aislado de forma segura.
    - Notificaciones del sistema de tipo sticky toast informando al usuario sobre el bloqueo o desbloqueo de imágenes.
  - **Optimización y Eliminación de Espacio Residual en Visor de Correos:**
    - Erradicación del efecto de expansión continua (*ratchet effect*) y de los márgenes vacíos al final del mensaje.
    - Contenedor aislado `#merke-email-content` con `display: flow-root` y `height: auto` que encapsula flotantes y colapso de márgenes sin inflar la altura con el viewport.
    - Supresión de márgenes inferiores en los últimos elementos y tablas del HTML (`#merke-email-content > *:last-child`).
    - Medición exacta de la altura sin añadidos arbitrarios (`+20px` eliminado) y `ResizeObserver` restringido únicamente al contenido interno.
    - Reducción del padding del marco contenedor exterior (`p-1.5 md:p-3`) y `min-height: 30px` en el iframe.
  - **Marcado Automático de Correo Visto tras 7 Segundos de Selección:**
    - Desacoplamiento de la lectura inmediata en `GET /api/emails/{id}`, permitiendo previsualizar correos no leídos manteniendo su estado original.
    - Endpoint backend dedicado `POST /api/emails/{email_id}/read` para asentar el visto tanto en SQLite local como en los servidores remotos de Gmail (`removeLabelIds: ['UNREAD']`).
    - Temporizador inteligente de 7 segundos (`readTimerId`) en `EmailManager`: si el usuario permanece leyendo el correo durante 7 segundos continuos, se marca automáticamente como visto, se transiciona el estilo visual en la lista y se recalculan los contadores del sidebar.
    - Cancelación inmediata del temporizador si el usuario cambia a otro correo o vuelve a la lista antes de cumplirse los 7 segundos.
  - **Corrección de Conexión Manual IMAP/SMTP y Protección contra Autofill:**
    - Diagnóstico y resolución del fallo de autenticación (`authentication failed` / `535 Authentication credentials invalid`) en cuentas con dominio propio (como `merke.net` en IONOS): el autocompletado del navegador rellenaba automáticamente el campo "Usuario IMAP" con la cuenta de Gmail del usuario (`pl.daniels@gmail.com`).
    - Sincronización bidireccional reactiva en el formulario entre "Dirección de Correo" y "Usuario IMAP/SMTP", auto-completando con el correo completo y corrigiendo automáticamente valores huérfanos o desfasados de Gmail.
    - Protección contra autocompletado intrusivo del navegador mediante `autocomplete="off"` y `autocomplete="new-password"`.
    - Corrección en backend (`create_account`, `update_account`, `test_account_connection`): uso del correo de la cuenta como fallback automático cuando `imap_user` está vacío o tiene una discrepancia evidente de dominio.
    - Actualización y validación de la cuenta IONOS (`pl.daniels@merke.net`) en base de datos local con verificación exitosa 100% en IMAP y SMTP.
  - **Aceleración Masiva de Sincronización, Búsqueda y Visualización de Correos:**
    - Creación de 7 índices de alto rendimiento en SQLite (`idx_emails_acc_folder`, `idx_emails_date`, `idx_emails_read`, `idx_emails_starred`, `idx_emails_uid`, `idx_email_labels_eid`, `idx_attachments_eid`), acelerando búsquedas y filtros a menos de 25ms.
    - Optimización del payload de `GET /api/emails`: exclusión de `body_html` y `body_text` en listados reduciendo el peso de la respuesta en un 99.5% (de ~5MB a ~30KB).
    - Descarga concurrente con `ThreadPoolExecutor` en `sync_gmail` y sincronización paralela multi-cuenta en `POST /api/emails/sync`.
    - Caché local en memoria en el cliente (`emailDetailCache` y `accountLabelsCache`) con apertura instantánea (0ms) en correos ya visitados y precarga inteligente en segundo plano de los primeros mensajes.
  - **Expansión Vertical y Cancelación Completa en Depuración por Prompt (Mail Cleanup AI):**
    - Rediseño flex del panel lateral `#drawer-cleanup-ai` (`flex-1 flex flex-col min-h-0`): el contenedor de candidatos se expande verticalmente ocupando el 100% del alto disponible sin altura fija artificial (`max-h-72` eliminado).
    - Método `cancelAndClearCleanup()` en `GeminiAI` asignado al botón "Cancelar", a la cruz de cierre y al backdrop: cierra el drawer, vacía el textarea del prompt, reinicia el contador a 0, restaura el mensaje de estado inicial y deshabilita el botón de ejecución.







  - **Avatares de Gmail en Caché y Avatar de la Cuenta del Sistema:**
    - Almacenamiento y persistencia de `avatar_url` en la base de datos `accounts` para todas las cuentas conectadas vía Google OAuth.
    - Servicio `AvatarService` en [frontend/js/avatars.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/avatars.js) con doble nivel de caché (en memoria y `localStorage` con clave `merkemail_avatar_cache_v2`) para no realizar peticiones repetitivas a la red.
    - Endpoint backend `/api/avatar/{email}` con cabecera HTTP inmutable `Cache-Control: public, max-age=604800` (7 días).
    - Visualización del avatar oficial de la cuenta del sistema (primera cuenta registrada, `accounts[0]`) en la esquina superior derecha del header global.
    - Visualización del avatar del remitente en el detalle del correo y del avatar de la cuenta activa en la caja de respuesta en línea (Inline Quick Reply).
    - Visualización de avatares en el menú desplegable del sidebar y en el drawer de administración de cuentas.

  - **Avatares de Gmail en Caché y Avatar de la Cuenta del Sistema:**
    - Almacenamiento y persistencia de `avatar_url` en la base de datos `accounts` para todas las cuentas conectadas vía Google OAuth.
    - Servicio `AvatarService` en [frontend/js/avatars.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/avatars.js) con doble nivel de caché (en memoria y `localStorage` con clave `merkemail_avatar_cache_v2`) para no realizar peticiones repetitivas a la red.
    - Endpoint backend `/api/avatar/{email}` con cabecera HTTP inmutable `Cache-Control: public, max-age=604800` (7 días).
    - Visualización del avatar oficial de la cuenta del sistema (primera cuenta registrada, `accounts[0]`) en la esquina superior derecha del header global.
    - Visualización del avatar del remitente en el detalle del correo y del avatar de la cuenta activa en la caja de respuesta en línea (Inline Quick Reply).
    - Visualización de avatares en el menú desplegable del sidebar y en el drawer de administración de cuentas.




  - **Traducción de Categorías y Etiquetas Nativas al Español:**
    - Mapeo automático de categorías del sistema de Gmail (`CATEGORY_UPDATES` -> "Actualizaciones", `CATEGORY_PROMOTIONS` -> "Promociones", `CATEGORY_SOCIAL` -> "Social", `CATEGORY_FORUMS` -> "Foros", `CATEGORY_PERSONAL` -> "Principal").
    - Chips traducidos en la cabecera del correo abierto, lista de correos, barra lateral y selector desplegable de asignación de etiquetas.
    - Soporte de archivado directo (botón `×`) para correos ubicados en categorías de entrada.
  - **Gestor de Firmas con Formato HTML y Edición Directa:**
    - Formato HTML enriquecido en firmas: barra de herramientas en el drawer (`Negrita`, `Cursiva`, `Subrayado`, `Viñetas`, `Listas numeradas`, `Insertar enlace`, `Color de texto`, `Limpiar formato` y vista `</> HTML` crudo).
    - Carga y edición de firmas en el formulario superior: al hacer clic en cualquier firma guardada o en su botón de lápiz, sus datos (nombre, cuenta, contenido HTML, opción default) se cargan inmediatamente en el formulario.
    - Modo dual "Nueva Firma" / "Editar Firma" con badge de estado, botón de "Cancelar edición" y botón dinámico "Actualizar Firma".
    - Endpoint `PUT /api/signatures/{sig_id}` en backend para actualizar firmas existentes manteniendo la sincronización de firma predeterminada.
    - Renderizado visual interactivo del HTML de cada firma en la lista inferior y resaltado con anillo distintivo cuando una firma está en edición activa.
    - Notificaciones sticky toast al guardar o actualizar y modales de confirmación antes de eliminar.
  - **Firma por Defecto Automática y Cursor Superior en Editores:**
    - Carga automática y asíncrona de la firma por defecto de la cuenta (o firma predeterminada global) tanto en la respuesta rápida en línea (`InlineReply`, `#inline-reply-editor`) como en el redactor modal (`Composer`, `#compose-editor`).
    - Estructura limpia y protegida: el bloque de firma se añade en la parte inferior con separación adecuada y `contenteditable="false"` para evitar deformación accidental al redactar.
    - Ubicación automática del cursor en la parte superior: creación/enfoque de bloque editable inicial antes de la firma (`setCursorToTop` / `focusTop`) para que el usuario pueda escribir su mensaje directamente desde la primera línea.
    - Placeholder inteligente responsivo que se muestra en la parte superior cuando no hay texto ingresado y desaparece tan pronto como el usuario escribe.
    - Soporte completo al abrir el correo, al pulsar "↩ Responder", al abrir el redactor modal o al descartar borradores.
  - **Limpieza de Etiquetas HTML en Snippets de los Listados de Correos:**
    - Filtrado y extracción de texto plano mediante `cleanSnippet` en `frontend/js/email.js`, eliminando cualquier tag HTML (`<p>`, `<div>`, `<br>`, etc.) y decodificando entidades antes de renderizar la vista previa en la lista de correos.
    - Almacenamiento limpio en backend (`google_oauth.py` y `email_service.py`): conversión de `body` HTML a texto puro limpio para el `snippet` de 160 caracteres al enviar correos.
    - Sanitización de registros históricos en la base de datos local SQLite (`data/merkemail.db`).
  - **Ordenamiento Cronológico Descendente Estricto (Más Nuevo Arriba, Más Viejo al Final):**
    - Identificación y corrección de discrepancia de ordenamiento en SQLite provocada por zonas horarias heterogéneas (`+00:00`, `-08:00`, etc.) donde la comparación alfabética de texto desfasaba los correos.
    - Consulta SQL optimizada con `ORDER BY COALESCE(datetime(emails.date), emails.date) DESC, emails.id DESC` en `/api/emails` y consultas de limpieza de IA.
    - Captura canónica de la fecha de recibido: uso de `internalDate` de Gmail API (marca de tiempo Unix en ms de llegada al buzón) y normalización a ISO 8601 UTC uniforme (`YYYY-MM-DDTHH:MM:SSZ`) en `google_oauth.py` e `email_service.py`.
    - Migración y normalización de las 175 fechas históricas existentes en `data/merkemail.db`.
    - Ordenamiento protector adicional en el cliente JavaScript (`new Date(date).getTime()`) al renderizar la tabla.
  - **Aislamiento Total del Diseño del Correo y Visualización 100% Fiel de Imágenes:**
    - Renderizado de correos HTML dentro de un `iframe` aislado (`email-body-frame`), protegiendo completamente el entorno de la aplicación de fugas de estilos (`body { padding: ... }`, resets globales, etc.) que alteraban márgenes del sidebar, cabecera y aplicación.
    - Preservación íntegra del diseño original: tablas, anchos, colores y tipografías se despliegan con las reglas estándar de emails sin interferencia del preflight de Tailwind.
    - Altura auto-ajustable con `ResizeObserver` y `MutationObserver` para eliminar barras de desplazamiento internas duplicadas.
    - Resolución integral de imágenes inline (`cid:`): conversión de todas las imágenes incrustadas a Data URIs (`data:image/png;base64,...`) tanto en la base de datos como en tiempo real vía Gmail API e IMAP.
    - Soporte completo para imágenes remotas mediante `<meta name="referrer" content="no-referrer">`, atributos `referrerpolicy` y endpoint de proxy seguro `/api/image-proxy` con fallback automático.
  - **Gestión de Spam y Protección de Imágenes en Correos No Deseados:**
    - Botón **"No es spam"** disponible en la barra de herramientas superior del correo abierto y en el banner de advertencia para correos en la carpeta de Spam.
    - Endpoint backend `POST /api/emails/{email_id}/not-spam` que mueve el correo a `INBOX` en SQLite y sincroniza etiquetas remotas (`removeLabelIds: ['SPAM']`, `addLabelIds: ['INBOX']`) en Gmail.
    - Bloqueo preventivo de imágenes para correos en Spam: sustitución de fuentes de imagen y neutralización de fondos para evitar solicitudes de red y rastreo no autorizado.
    - Banner de advertencia con botón **"Mostrar imágenes"** para autorizar de forma explícita y bajo demanda la visualización de imágenes en el correo abierto.
  - **Detección, Visualización y Descarga Completa de Archivos Adjuntos:**
    - Registro y sincronización de metadatos de adjuntos (`filename`, `content_type`, `size`, `remote_id`, `file_path`) para correos de Gmail API y cuentas SMTP/IMAP en la base de datos local SQLite.
    - Endpoint `GET /api/attachments/{attachment_id}/download` que recupera el documento en tiempo real desde la API de Gmail o del disco local con su nombre y cabeceras MIME de descarga directa.
    - Sección enriquecida de archivos adjuntos en el visor de lectura con tarjetas responsivas, distintivos de tipo de documento (PDF en rojo, Excel/Hojas en esmeralda, Word en azul, Imágenes en púrpura, Comprimidos en amarillo), tamaño formateado en KB/MB y botón de descarga individual.
    - Botón "Descargar todos" para descargar secuencialmente todos los archivos adjuntos de un correo con notificación sticky informativa.
  - **Alternancia Bidireccional de Ocultar/Mostrar Imágenes en Correos de Spam:**
    - Botón interactivo de conmutación en el banner de advertencia superior de Spam (`btn-toggle-spam-images-${email.id}`).
    - Permite tanto desbloquear las imágenes bajo demanda (*"Mostrar imágenes"*) como volver a bloquearlas y ocultarlas en cualquier momento (*"Ocultar imágenes"*).
    - Estado reactivo: actualiza el texto informativo del banner, conmuta el icono y etiqueta del botón, y re-renderiza de inmediato el `iframe` aislado de forma segura.
    - Notificaciones del sistema de tipo sticky toast informando al usuario sobre el bloqueo o desbloqueo de imágenes.
  - **Optimización y Eliminación de Espacio Residual en Visor de Correos:**
    - Erradicación del efecto de expansión continua (*ratchet effect*) y de los márgenes vacíos al final del mensaje.
    - Contenedor aislado `#merke-email-content` con `display: flow-root` y `height: auto` que encapsula flotantes y colapso de márgenes sin inflar la altura con el viewport.
    - Supresión de márgenes inferiores en los últimos elementos y tablas del HTML (`#merke-email-content > *:last-child`).
    - Medición exacta de la altura sin añadidos arbitrarios (`+20px` eliminado) y `ResizeObserver` restringido únicamente al contenido interno.
    - Reducción del padding del marco contenedor exterior (`p-1.5 md:p-3`) y `min-height: 30px` en el iframe.
  - **Marcado Automático de Correo Visto tras 7 Segundos de Selección:**
    - Desacoplamiento de la lectura inmediata en `GET /api/emails/{id}`, permitiendo previsualizar correos no leídos manteniendo su estado original.
    - Endpoint backend dedicado `POST /api/emails/{email_id}/read` para asentar el visto tanto en SQLite local como en los servidores remotos de Gmail (`removeLabelIds: ['UNREAD']`).
    - Temporizador inteligente de 7 segundos (`readTimerId`) en `EmailManager`: si el usuario permanece leyendo el correo durante 7 segundos continuos, se marca automáticamente como visto, se transiciona el estilo visual en la lista y se recalculan los contadores del sidebar.
    - Cancelación inmediata del temporizador si el usuario cambia a otro correo o vuelve a la lista antes de cumplirse los 7 segundos.
  - **Corrección de Conexión Manual IMAP/SMTP y Protección contra Autofill:**
    - Diagnóstico y resolución del fallo de autenticación (`authentication failed` / `535 Authentication credentials invalid`) en cuentas con dominio propio (como `merke.net` en IONOS): el autocompletado del navegador rellenaba automáticamente el campo "Usuario IMAP" con la cuenta de Gmail del usuario (`pl.daniels@gmail.com`).
    - Sincronización bidireccional reactiva en el formulario entre "Dirección de Correo" y "Usuario IMAP/SMTP", auto-completando con el correo completo y corrigiendo automáticamente valores huérfanos o desfasados de Gmail.
    - Protección contra autocompletado intrusivo del navegador mediante `autocomplete="off"` y `autocomplete="new-password"`.
    - Corrección en backend (`create_account`, `update_account`, `test_account_connection`): uso del correo de la cuenta como fallback automático cuando `imap_user` está vacío o tiene una discrepancia evidente de dominio.
    - Actualización y validación de la cuenta IONOS (`pl.daniels@merke.net`) en base de datos local con verificación exitosa 100% en IMAP y SMTP.
  - **Aceleración Masiva de Sincronización, Búsqueda y Visualización de Correos:**
    - Creación de 7 índices de alto rendimiento en SQLite (`idx_emails_acc_folder`, `idx_emails_date`, `idx_emails_read`, `idx_emails_starred`, `idx_emails_uid`, `idx_email_labels_eid`, `idx_attachments_eid`), acelerando búsquedas y filtros a menos de 25ms.
    - Optimización del payload de `GET /api/emails`: exclusión de `body_html` y `body_text` en listados reduciendo el peso de la respuesta en un 99.5% (de ~5MB a ~30KB).
    - Descarga concurrente con `ThreadPoolExecutor` en `sync_gmail` y sincronización paralela multi-cuenta en `POST /api/emails/sync`.
    - Caché local en memoria en el cliente (`emailDetailCache` y `accountLabelsCache`) con apertura instantánea (0ms) en correos ya visitados y precarga inteligente en segundo plano de los primeros mensajes.
  - **Expansión Vertical y Cancelación Completa en Depuración por Prompt (Mail Cleanup AI):**
    - Rediseño flex del panel lateral `#drawer-cleanup-ai` (`flex-1 flex flex-col min-h-0`): el contenedor de candidatos se expande verticalmente ocupando el 100% del alto disponible sin altura fija artificial (`max-h-72` eliminado).
    - Método `cancelAndClearCleanup()` en `GeminiAI` asignado al botón "Cancelar", a la cruz de cierre y al backdrop: cierra el drawer, vacía el textarea del prompt, reinicia el contador a 0, restaura el mensaje de estado inicial y deshabilita el botón de ejecución.











## Última Actualización: Libreta de Contactos y Sincronización cada 15m
- Botón 1 ahora abre el Drawer de Libreta de Contactos (`drawer-contacts`).
- Botón 3 conserva la apertura del Drawer de Cuentas (`drawer-accounts`).
- Sincronización automática de contactos en segundo plano cada 15 minutos (900s) extrayendo interactores de todas las cuentas.
- Autocompletado inteligente en los campos de destinatarios (`Para`, `CC`, `CCO`) al redactar, responder y reenviar.
- Acceso a búsqueda de contactos integrado en el agente inteligente Elio.

## Última Actualización: Invocación @elio en Buscador Principal
- `@elio` en el buscador ya no se procesa como búsqueda de correos; no filtra ni vacía la bandeja.
- Abre automáticamente el drawer de Elio y traslada la pregunta correspondiente.
- Se agregó botón contextual `Preguntar a Elio ↵` en el buscador para envío inmediato por Enter o clic.

## Última Actualización: Visor de Correos Inicial en Vacío o Error
- El visor de lectura se resetea automáticamente a "Ningún correo seleccionado" cuando la lista no tiene correos, ocurre un error o el correo consultado ya no está en la bandeja activa.

## Última Actualización: Bloqueo de Almacenamiento/Archivado en Spam, Papelera y Borradores
- No se permite archivar correos que pertenezcan a Spam, Papelera o Borradores (se ocultan los botones en la interfaz y se bloquea en backend).

## Última Actualización: Perfil de Usuario Analizado por IA
- Integrado en el sidebar bajo 'HERRAMIENTAS IA' -> 'Perfil del Usuario'.
- Drawer lateral con botón para analizar con Gemini firmas, cuentas y correos enviados.
- Almacenamiento persistente en base de datos e inyección de contexto en redactor, respuestas inteligentes y asistente Elio.

## Última Actualización: Licencia BSL 1.1
- Se configuró la Business Source License 1.1 (BSL 1.1) en el archivo LICENSE y README.md.
