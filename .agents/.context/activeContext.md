# Contexto Activo - MerkeMail

## Estado de Desarrollo Actual

- **Fase 63 - Instalador y Ejecución Nativa de Escritorio para Linux (Ubuntu):**
  - **Instalación Aislada:** Creado el instalador `scripts/install_desktop.sh` que instala la aplicación de forma 100% independiente en `~/.local/share/merkemail` con su propio entorno virtual `.venv` y dependencias (`requirements.txt`).
  - **Puerto Exclusivo para la App (6524):** La app instalada corre en el puerto **6524**, permitiendo que el entorno de desarrollo en `/home/perry/Desarrollo/MerkeMail` siga activo y operativo en el puerto **8000** sin interferencias.
  - **Acceso en el Menú de Ubuntu (`.desktop`):** Registrado `~/.local/share/applications/merkemail.desktop` con iconos oficiales en `~/.local/share/icons/hicolor/` (512x512, 192x192 y SVG) y acciones rápidas de Redactar y Ajustes.
  - **Bandeja del Sistema (System Tray):** Implementado `desktop/tray.py` con `pystray` y ventana Chrome en modo aplicación (`--app=http://127.0.0.1:6524 --class=merkemail`), ofreciendo opciones de Abrir, Redactar, Sincronizar, Ajustes y Salir.
  - **Controles en Ajustes:** Añadida la tarjeta "Aplicación de Escritorio (Ubuntu)" en `#drawer-settings` con switches reactivos para activar/desactivar el **System Tray** y el **Inicio Automático al encender la máquina** (`~/.config/autostart/merkemail.desktop`), gestionados por `frontend/js/desktop.js` y endpoints `/api/desktop/settings`.

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










