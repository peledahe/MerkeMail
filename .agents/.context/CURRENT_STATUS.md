# Estado Actual de MerkeMail

## Novedades y Correcciones Recientes
1. **Tareas sin Fecha, Colores de Calendario/Cuenta y Control de Desbordamiento (+N más):**
   - **Sección Lateral de Tareas sin Fecha (Tasks):** Tarjeta dedicada en el panel lateral del calendario (`#calendar-tasks-list`) con contador de tareas pendientes (`#calendar-tasks-count`), checkbox para marcar como completada/reactivar (`PATCH /api/tasks/{id}/toggle`), botón de creación rápida (`openNewTaskModal`) y eliminación con confirmación.
   - **Herencia e Indicativo de Colores (Calendario y Cuenta):** Cada evento y tarea resuelve su color de forma jerárquica (`effective_color`): color del calendario y, si este no tiene o para complementar, el color distintivo de la cuenta conectada (`account_color`), visible tanto en píldoras mensuales, franjas semanales/diarias como en badges de la cuenta.
   - **Control de Desbordamiento con Contador en Celdas Mensuales (+N más):** En la vista de Mes, cada celda muestra hasta 2 eventos/tareas y un botón con contador interactivo `+N más (total)` para días con alta densidad. Al hacer clic, abre `modal-day-events` con el listado completo y detallado del día y acceso directo a detalles.

2. **Mejoras Integrales al Calendario Unificado:**
   - **Modal Lateral (Drawer) de Detalle del Evento:** Al hacer clic en cualquier evento (desde la grilla del calendario o desde la lista lateral de próximos eventos), se abre un drawer lateral derecho (`drawer-event-detail`) con toda la información disponible:
     - Título, fecha, hora de inicio/fin formateada en español, duración calculada y badge de color/proveedor del calendario.
     - Detección inteligente de enlaces de videollamada (Google Meet, Zoom, Teams, URLs externas): se muestra un botón destacado para abrir o unirse directamente en otra pestaña (`target="_blank" rel="noopener noreferrer"`).
     - Notas / descripción con auto-enlace (`linkifyText`) de cualquier URL para abrir en pestaña nueva con un clic.
     - Botón para abrir directamente el correo de origen si el evento provino de un email (`origin_email_id`).
     - Botón para eliminar el evento con diálogo modal de confirmación (`UI.confirm`) y notificación sticky (`UI.showStickyToast`).
   - **Vistas de Mes, Semana y Día (Horas):**
     - Nuevo selector segmentado para alternar entre vista de **Mes** (grilla mensual de 7 columnas), **Semana** (7 columnas de Lunes a Domingo con franjas horarias y eventos posicionados por hora) y **Día** (timeline vertical completo de 06:00 a 23:00 con detalle exhaustivo de eventos y atajo para agendar).
     - Persistencia automática de la modalidad seleccionada en `localStorage` (`merke_calendar_view`).
     - Botón **Hoy** (`goToToday`) para regresar instantáneamente a la fecha actual en la vista activa.
     - Navegación contextual `<` y `>` adaptada a la vista (avanza/retrocede 1 mes, 1 semana o 1 día).
   - **Calendario por Defecto y Tareas:**
     - En **Configuración (`drawer-settings`)**, se añadió el selector **"Calendario Predeterminado"** (`settings-default-calendar-select`) donde el usuario define cuál es su calendario por defecto (Google, Proton, etc.). Se almacena en la tabla SQLite `settings` (`default_calendar_id`).
     - En la modal de **Nuevo Evento / Cita**, se preselecciona automáticamente el calendario por defecto pero se permite al usuario seleccionar cualquier otro.
     - Soporte para alternar tipo de entrada: **Evento / Cita** o **Tarea / Pendiente** (etiquetando tareas con `[Tarea]`).
     - **Integración con Elio:** El asistente inteligente de IA agenda citas, eventos y tareas automáticamente en el calendario por defecto del usuario a través de `agendar_evento_calendario` y `CalendarService.get_default_calendar_id()`.

2. **Solución a Error de Conexión en Lanzador de Escritorio (`ERR_CONNECTION_REFUSED` en puerto 6524):**
   - **Causa detectada:** El entorno virtual de la instalación de escritorio (`~/.local/share/merkemail/.venv`) utilizaba `--system-site-packages`, lo que provocaba que Python cargara el paquete `/usr/lib/python3/dist-packages/OpenSSL` desactualizado de Ubuntu 24.04, colisionando con `cryptography` moderna y arrojando `AttributeError: module 'lib' has no attribute 'GEN_EMAIL'` al arrancar Uvicorn.
   - **Solución implementada:** Se instaló y fijó `pyopenssl==26.4.0` en los entornos virtuales y en [requirements.txt](file:///home/perry/Desarrollo/MerkeMail/requirements.txt).
   - Se incrementó el tiempo de polling y tolerancia de arranque en `desktop/app_window.py` y `desktop/tray.py` a 8 segundos.
   - Se sincronizó la instalación con `scripts/install_desktop.sh` y se verificó que el backend de escritorio levante y responda correctamente en `http://127.0.0.1:6524/`.

2. **Selector de Tono en Respuesta Rápida:**
   - Agregado en la barra inferior de respuesta en el detalle de correo (`#inline-reply-tone-select`), inmediatamente después del botón `+ Responder con IA`.
   - Incorpora los nuevos tonos solicitados:
     - **Amigable**: cercano y jovial, con calidez, entusiasmo y naturalidad.
     - **Familiar**: con afecto, cariño y confianza íntima, como de la propia familia.
     - Formal, Cordial, Conciso y Comercial.
   - Viene preseleccionado con el tono por defecto de configuración y solo afecta al mensaje actual.

2. **Indicador de IA / Antigravity:**
   - Si la API Key no está configurada o Antigravity/IA no está activo, el indicador muestra **Inactivo en rojo** (`<span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span> Inactivo`) tanto en la tarjeta de servicio como en la cabecera de Ajustes y en el badge de Elio.
   - Solo se muestra en verde `• Activo` cuando la API Key está configurada y validada.

3. **Garantía Visual de `error.gif`:**
   - Convertido a formato GIF 89a real.
   - Embebido como Data URI base64 en `UI.ERROR_GIF_DATA_URI` para que se visualice al 100% incluso cuando el backend o la conexión de red estén completamente caídos (evitando imágenes rotas).

4. **Cuentas y Calendarios Reales:**
   - Se filtran y muestran únicamente los proveedores que realmente están conectados (ej. Google y Merke), eliminando ProtonMail si no existe dicha cuenta.

5. **Enlaces Interactivos de Correos y Citas en Respuestas de Elio:**
   - Garantía absoluta de enlaces markdown tanto en el prompt de Elio como mediante post-procesamiento automático en backend (`enrich_response_with_links`), asegurando que todos los correos (`[✉️ Abrir correo #ID: Asunto](email:ID)`) y citas (`[📅 Ver cita #ID: Titulo](event:ID)`) dispongan de su botón píldora interactivo.
   - Al hacer clic en un correo, se cierra el asistente de Elio (`UI.closeDrawer('drawer-antigravity-copilot')`), se activa la pestaña de correo y se abre directamente en el visor de lectura con `EmailManager.openEmailDetail(id)`.
   - Al hacer clic en una cita, se cierra el asistente, se cambia a la vista de calendario, se enfoca la fecha del evento y se visualiza su detalle con `CalendarManager.viewEventDetail(id)`.

6. **Agendamiento Responsable sin Fechas al Azar:**
   - El botón rápido de agendar reunión consulta primero la disponibilidad de la agenda mediante `listar_proximos_eventos` y solicita al usuario título, fecha y hora sin asignar valores aleatorios.

7. **Alineación Visual en Asistente Elio:**
   - Las etiquetas de capacidades del asistente (`🔍 Búsqueda profunda`, `📅 Agendamiento`, `✉️ Lectura inteligente`) se centraron horizontalmente (`justify-center items-center`) debajo del encabezado.

8. **Redacción, Envío, Respuesta y Borrado Autónomo de Correos:**
   - Nuevas herramientas nativas para Elio:
     - `preparar_borrador_correo`: Estructura un borrador y genera una tarjeta interactiva en el chat con vista previa (`Para`, `Asunto`, `Mensaje`) y dos botones de acción directa: **Confirmar y Enviar** (con notificación sticky y actualización en vivo) y **Editar en Redactor** (abre el modal completo de redacción con los datos precargados).
     - `enviar_correo`: Envío de correos a través de las cuentas activas (Gmail API / SMTP).
     - `responder_correo`: Prepara borradores de respuesta contextualizados a un correo específico por ID.
     - `eliminar_correos`: Mueve correos a la papelera o los elimina, refrescando de inmediato la lista de correos.
   - Flujo de confirmación: Ante cualquier orden de redactar o enviar, Elio siempre muestra primero el borrador y solicita la confirmación del usuario antes de proceder al envío.

9. **Resumen Inteligente y Recomendaciones de Atención al Abrir Elio:**
   - Al abrir el asistente de Elio, se consulta en tiempo real el nuevo endpoint `/api/agent/summary`.
   - El mensaje de bienvenida se actualiza dinámicamente con:
     - **Estado de la Bandeja:** Conteo real de correos sin leer.
     - **Asuntos Prioritarios:** Enlaces directos a correos críticos (pagos, facturas, alertas de cuenta o seguridad) con botones clickeables para abrirlos en el visor.
     - **Próxima Cita:** Enlace directo a la cita más cercana en el calendario unificado.
     - **Recomendaciones de Atención:** Sugerencias inteligentes y contextuales de Elio sobre qué atender primero.

20. **Auditoría y Blindaje de Seguridad para Cuentas Conectadas:**
    - **Cifrado de Credenciales en Reposo:** Creado `backend/crypto_service.py` con Fernet (AES-128-CBC + HMAC) y clave protegida con permisos `0600`. Se migraron y cifran automáticamente las contraseñas IMAP y tokens de actualización OAuth (`oauth_refresh_token`) en la base de datos local SQLite.
    - **Prevención de Fuga de Tokens en API:** Sanitizado `GET /api/accounts/{id}` y `GET /api/accounts` para eliminar completamente los tokens de acceso y de actualización de las respuestas JSON, previniendo exposición involuntaria al frontend.
    - **Restricción Estricta de CORS:** Eliminado `allow_origins=["*"]` en FastAPI; ahora está restringido a orígenes locales seguros (`localhost:8000`, `127.0.0.1:8000`, `localhost:6524`, `127.0.0.1:6524`) para evitar ataques de robo de sesión desde páginas web externas.
    - **Protección CSRF en Google OAuth:** Generación de un token criptográfico único (`secrets.token_urlsafe(32)`) para el parámetro `state` con validación estricta en el callback.
    - **Content Security Policy (CSP) en Visor de Correos:** Inyección de `<meta http-equiv="Content-Security-Policy" content="script-src 'none'; object-src 'none';">` en el iframe de lectura para bloquear ejecución de scripts maliciosos de correos entrantes.

19. **Barra Secundaria Delgada para Etiquetas en Espacio Reducido:**
    - Al reducir el ancho de la ventana o panel de lectura (como en móviles o ventanas estrechas), si las etiquetas no caben en la barra superior junto a las acciones, se trasladan automáticamente a una **barra nueva delgada** inmediatamente debajo de la barra de acciones (`#email-secondary-labels-bar`).
    - La barra secundaria cuenta con altura compacta (`min-h-[34px]`), fondo sutil, scroll horizontal suave con la rueda del ratón/trackpad (`.email-labels-scroll`) y preserva todas las opciones de interacción y eliminación de etiquetas.
    - Cuando el espacio se amplía de nuevo, las etiquetas regresan limpiamente a la barra superior y la barra delgada inferior se oculta.

18. **Scroll Horizontal para Etiquetas en la Barra de Correo:**
    - El contenedor de etiquetas en la barra superior del visor de correo individual (`.email-labels-scroll`) ahora cuenta con `overflow-x-auto`, `flex-nowrap` y barra de desplazamiento estilizada de 4px.
    - Soporta desplazamiento suave con la rueda del ratón (`onwheel`) o deslizamiento táctil/trackpad.
    - Mantiene protegida la barra de acciones superior derecha (`flex-nowrap shrink-0`) sin desbordes ni saltos de línea indeseados.

17. **Opción de Nuevo Chat Limpio (Sin Resumen ni Persistencia):**
    - Se agregó el botón con icono `+` (`#btn-antigravity-new-chat`) en la cabecera del asistente Elio.
    - Al pulsarlo, limpia el historial y contexto de la conversación previa sin guardarlo (`POST /api/agent/reset`).
    - Inicia una nueva conversación limpia con saludo directo de Elio sin la tarjeta de resumen ni recomendaciones, dejando el campo de entrada enfocado para comenzar de inmediato.

16. **Búsqueda Inteligente de Correos por Fecha y Estado (Leídos y No Leídos):**
    - Se optimizó la herramienta `buscar_correos` de Elio para interpretar fechas relativas (`ayer`, `hoy`, `antier`, formatos de fecha) y depurar palabras de intención (`busca`, `correos`, `de ayer`).
    - Búsqueda en la bandeja de **Recibidos** completa (abarcando `INBOX` y categorías como Actualizaciones o Promociones).
    - Inclusión predeterminada de **correos leídos y no leídos**, permitiendo a Elio listar correos de ayer sin importar si ya fueron abiertos previamente, con sus enlaces interactivos directos `[✉️ Abrir correo #ID: Asunto](email:ID)`.

13. **Ventana de Elio Ampliable y Ajuste Responsivo Total:**
    - Botón para maximizar / restaurar el ancho en la cabecera de la modal lateral de Elio.
    - Resizer interactivo arrastrable en el borde izquierdo (`#antigravity-drawer-resizer`), permitiendo al usuario cambiar el ancho libremente con el mouse y guardando su preferencia en `localStorage`.
    - Ajuste estricto de textos largos, botones de correos prioritarios, recomendaciones y burbujas de chat (`min-w-0 w-full overflow-hidden break-words`), eliminando desbordes y cortes de texto en el modo estándar.

14. **Licencia BSL 1.1:**
    - Adopción de Business Source License 1.1 en archivo `LICENSE` y documentación en `README.md`.

15. **Perfil de Usuario Analizado por IA:**
    - Modal lateral y servicio de extracción semántica de datos de identidad (nombre, teléfono, dirección, cargo, firmas, tono) para proveer contexto personalizado en la redacción y asistencia.

10. **Libreta de Contactos y Sincronización Automática:**
    - **Botón 1 (Libreta de Contactos):** Abre el drawer lateral `drawer-contacts` con buscador en tiempo real, contador badge de contactos, sincronización manual y lista interactiva con acciones de redactar directo y copiar email.
    - **Botón 3 (Avatar de Usuario):** Mantiene la apertura de `drawer-accounts` para gestión de cuentas.
    - **Sincronización Periódica:** Tarea en segundo plano en backend (`_periodic_contacts_sync`) y en frontend que actualiza la agenda cada 15 minutos (900s) a partir de los remitentes y destinatarios de todas las cuentas conectadas.
    - **Autocompletado en Composer:** Al redactar, responder o reenviar correos, los campos `Para`, `CC` y `CCO` sugieren contactos en tiempo real mediante un menú desplegable contextual interactivo.
    - **Búsqueda por IA:** Elio cuenta con la herramienta `buscar_contactos(consulta)` para consultar direcciones y nombres de la libreta.

11. **Invocación de @elio desde la Barra de Búsqueda:**
    - Se eliminó el comportamiento erróneo donde escribir `@elio` ejecutaba una búsqueda local de correos que dejaba la bandeja vacía en `0-0 de 0`.
    - Ahora, al escribir `@elio`, se reconoce inmediatamente como una entrada para el asistente inteligente.
    - Se muestra un botón interactivo dentro de la barra (`Preguntar a Elio ↵`).
    - Al presionar Enter, hacer clic en el botón o en la lupa:
      - Si contiene una pregunta (ej. `@elio ¿tengo facturas?`), extrae la pregunta, abre la ventana modal/drawer de Elio y traslada la pregunta enviándola directamente al chat.
      - Si solo escribió `@elio`, abre la modal/drawer de Elio y enfoca el campo de texto del chat.
      - Limpia el input de búsqueda y restaura inmediatamente la bandeja de correos sin alterar la lista.

12. **Restablecimiento del Visor de Correos al Estado Inicial:**
    - Se implementó `EmailManager.resetDetailView()`.
    - Cuando la lista de correos está vacía (`0 de 0`), al cambiar a una carpeta sin correos o ante cualquier error de conexión con el servidor, el panel derecho de lectura se restablece automáticamente a la pantalla inicial ("Ningún correo seleccionado"), evitando que se quede visible el último correo consultado.
    - Se cancelan temporizadores de lectura en curso y se deselecciona cualquier identificador previo.

13. **Restricción de Almacenamiento/Archivado en Spam, Papelera y Borradores:**
    - Se ocultó el botón de archivar/almacenar en el visor de lectura individual cuando el correo se encuentra en las carpetas Papelera (`TRASH`), Spam (`SPAM`) o Borradores (`DRAFT`/`DRAFTS`).
    - En la barra de acciones masivas, los botones de archivar en lote (`#btn-batch-archive` y menú desplegable) se ocultan automáticamente cuando la carpeta actual es Spam, Papelera o Borradores.
    - Se agregaron validaciones tanto en frontend (`archiveCurrentEmail` y `executeBatchAction`) como en el backend (`batch_action_emails`) para bloquear cualquier intento de archivar correos pertenecientes a estas carpetas.

14. **Perfil del Usuario Analizado por IA (Contexto Continuo para Redacción):**
    - Se agregó en la sección 'HERRAMIENTAS IA' del menú lateral izquierdo la opción **'Perfil del Usuario'** con icono de usuario.
    - Al pulsar, abre un panel lateral (`drawer-user-profile`) con el estado del perfil y botón destacado **'Analizar con IA'**.
    - El análisis examina firmas configuradas, cuentas del sistema, contactos frecuentes y muestra de correos enviados para extraer con precisión:
      - Nombre completo y cargos/roles profesionales.
      - Organizaciones y empresas (Merke.net, SETESA, etc.).
      - Teléfonos, casilleros postales y medios de contacto.
      - Ubicación geográfica y sitios web/enlaces.
      - Análisis profundo de su estilo comunicativo y tono habitual.
      - Resumen ejecutivo y directrices de redacción.
    - La información se almacena en la tabla SQLite `user_ai_profile` y persiste como contexto permanente hasta que el usuario ejecute un nuevo análisis.
    - El usuario puede editar y ajustar cualquiera de los datos manualmente con el botón 'Guardar Cambios' (con notificación sticky).
    - El perfil se inyecta automáticamente en:
      - `GeminiService.generate_email_draft` (Redactor con IA)
      - `GeminiService.generate_smart_reply` (Respuestas con IA)
      - `AntigravityMailAgent` / Asistente Elio (con conocimiento de identidad y herramienta `obtener_perfil_usuario`).

15. **Licencia de Software BSL 1.1:**
    - Se creó el archivo oficial [LICENSE](file:///home/perry/Desarrollo/MerkeMail/LICENSE) con la Business Source License 1.1 (BSL 1.1).
    - Titular / Licenciante: Perry Daniels / Merke.net.
    - Concesión de uso: libre para uso personal, educativo, evaluación y operaciones internas sin ofrecerlo como servicio alojado o SaaS competidor sin licencia comercial.
    - Licencia de cambio (Change License): GNU General Public License v2.0 or later (GPL-2.0-or-later) a partir de la fecha de cambio (Change Date: 2030-11-15).
    - Actualizado README.md con referencia y enlace al archivo de licencia.
