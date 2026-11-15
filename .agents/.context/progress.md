# Progreso del Proyecto - MerkeMail

## Historial de Hitos Completados

- [x] **Fase 96: Color Dinámico de la Orilla de Selección según la Cuenta del Correo:**
  - Sustitución del color fijo índigo en la orilla vertical del correo seleccionado por el color correspondiente a la cuenta de dicho correo (`email.account_color`).
  - Coincidencia exacta con el punto indicador cromático de la cuenta.
  - Implementación con variable CSS `--account-accent-color`, atributo de datos y sincronización en tiempo real al seleccionar cualquier elemento.
  - Sincronización exitosa con `install_desktop.sh`.

- [x] **Fase 95: Optimización y Reducción del Espacio Superior de Arrastre de Ventana:**
  - Reducción de la franja superior `#desktop-window-drag-strip` de 10px a solo 3px.
  - Integración cromática con el fondo del header (`bg-white dark:bg-slate-900`), eliminando la banda oscura gruesa.
  - Preservación completa de la interacción de arrastre de ventana con clic sostenido.
  - Sincronización exitosa con `install_desktop.sh`.

- [x] **Fase 94: Sincronización Total de la Cuenta en Background e Indicador en Barra Lateral Izquierda:**
  - Opción especial *"Sincronización Total (Todas las carpetas)"* en la configuración de cuentas (`drawer-accounts`).
  - Worker asíncrono en background con endpoints `/api/accounts/{account_id}/sync-full` y `/api/accounts/sync-status`.
  - Recorrido y sincronización completa de todas las carpetas del servidor (INBOX, SENT, Promociones, Social, Actualizaciones, Foros, Destacados, Borradores, Spam, Papelera) y etiquetas personalizadas.
  - Paginación completa de correos en Gmail REST API (`all_pages=True`) y soporte total para buzones IMAP.
  - Indicador de progreso dinámico en la parte inferior de la barra lateral izquierda (`#sidebar-sync-progress`) con descripción en tiempo real, spinner, porcentaje y barra de carga fluida.
  - Notificación sticky al completar y actualización de la vista sin interrupción.
  - Sincronización exitosa con `install_desktop.sh`.

- [x] **Fase 93: Franja Superior y Arrastre Continuo de Ventana en Tiempo Real (Clic Sostenido):**
  - Implementación de franja superior de arrastre `#desktop-window-drag-strip` a lo largo de todo el borde superior de la ventana.
  - Corrección de selector `id="main-header"` que impedía la vinculación de eventos de ratón.
  - Motor de arrastre continuo en tiempo real con transmisión instantánea `__PYQT_MOVE__:<dx>:<dy>` y reposicionamiento nativo con `window.move_by(dx, dy)`.
  - Sincronización exitosa con `install_desktop.sh`.

- [x] **Fase 92: Simplificación Estricta del Menú de la Barra de Tareas y Bandeja del Sistema:**
  - Reducción del menú contextual tanto en la barra de tareas (dock/panel) como en el System Tray a únicamente dos opciones: *"Mostrar la aplicación"* y *"Cerrar"*.
  - Limpieza de metadatos superfluos en el archivo `.desktop` y actualización de la base de datos de escritorio de Ubuntu.
  - Sincronización exitosa con `install_desktop.sh`.

- [x] **Fase 91: Enlaces de Correo Externos por Entorno y Control Unívoco de Maximizar/Restaurar:**
  - Enlaces de correos abiertos en el navegador por defecto del SO en modo instalado y PWA (`QDesktopServices.openUrl` + `/api/desktop/open-url`), y en pestaña nueva en modo web navegador.
  - Corrección del botón Ampliar/Restaurar: eliminación del doble despacho concurrente, implementando acciones explícitas `maximize` o `restore` unívocas según el estado actual de la ventana con bloqueo anti-rebote.
  - Sincronización exitosa con `install_desktop.sh`.

- [x] **Fase 90: Corrección Integral del System Tray (Transparencia Alfa y Conteo Real de No Leídos):**
  - Fondo 100% transparente en el icono del System Tray tanto en estado atenuado como a color, eliminando el fondo negro generado por la conversión sin canal alfa.
  - Corrección de la consulta SQL SQLite a la tabla `emails` para sincronizar con el Inbox y categorías reales (25 no leídos), activando el icono a color con el badge circular rojo.
  - Sincronización exitosa con `install_desktop.sh`.

- [x] **Fase 89: Arrastre Fluido de Ventana por Clic Sostenido, Controles Nativos Directos y Menú de Tablero Exclusivo:**
  - Arrastre acelerado por hardware con `QWindow::startSystemMove()` al hacer clic sostenido en cualquier espacio libre del header superior.
  - Canal de comunicación directo e instantáneo JS -> PyQt6 (`CustomWebEnginePage` + socket IPC + bridge) con latencia cero para las acciones de ventana.
  - Corrección de botones de control (`_`, `□`, `✕`): minimizar, maximizar/restaurar y cerrar funcionando de forma instantánea y robusta.
  - Sincronización automática de estado maximizado/restaurado entre Qt y la interfaz web.
  - Menú contextual del tablero / dock de Ubuntu configurado para mostrar exclusivamente *"Mostrar / Ocultar MerkeMail"* y *"Cerrar MerkeMail"*, alineado con el System Tray.
  - Limpieza de procesos huérfanos y despliegue sincronizado con `install_desktop.sh`.

- [x] **Fase 88: Instancia Única, Ocultamiento del Dock al Minimizar en Systray y Controles de Ventana:**
  - Instancia única nativa (`QLocalSocket` / `QLocalServer`), enfocando la ventana activa si se pulsa de nuevo en el menú de aplicaciones.
  - Al minimizar o cerrar con System Tray activo, la ventana se oculta (`hide()`), retirando el icono del tablero/dock de Ubuntu.
  - Menú de bandeja simplificado estrictamente a "Mostrar/Ocultar" y "Cerrar".
  - Controles de ventana nativos integrados junto al avatar de la cuenta en el header (minimizar, ampliar/restaurar, cerrar).
  - Ocultado el botón de imprimir exclusivamente en modo instalado (visible en modo PWA y browser).
  - Sincronización exitosa con `install_desktop.sh`.

- [x] **Fase 87: Sincronización Silenciosa Imperceptible e Indicativo Inteligente en Systray:**
  - Sincronización asíncrona no bloqueante de correo, tareas, eventos y contactos en segundo plano sin interrumpir la experiencia de usuario ni congelar la pantalla.
  - Indicativo dinámico en el System Tray:
    - Sin correos sin leer: logo tenue/gris (`opacity 0.55`) y tooltip *"Todo al día"*.
    - Con correos sin leer: logo a color con badge circular rojo (`#ef4444`) en la esquina superior derecha y conteo de no leídos.
  - Verificada la total independencia del modo desarrollo en la aplicación instalada (`~/.local/share/merkemail`).
  - Sincronización exitosa con `install_desktop.sh`.

- [x] **Fase 86: Tooltips Globales con Bordes Redondeados Suaves para todos los Botones:**
  - Sistema global de tooltips flotantes (`#app-global-tooltip` & `UI.initAppTooltips`).
  - Suprime el tooltip rectangular tosco nativo del navegador mediante captura dinámica de `title` a `data-app-tooltip`.
  - Bordes redondeados suaves (`rounded-xl` / `10px`), fondo oscuro con blur y sombreado premium.
  - Posicionamiento reactivo arriba/abajo centrado con prevención de desbordamiento en pantalla.
  - Sincronización exitosa con `install_desktop.sh`.

- [x] **Fase 85: Formulario de Evento/Cita Básico vs Ampliado y Optimización de Espacios:**
  - Versión Básica compacta con campos esenciales: Tipo (Evento/Tarea), Título, Horario/Fecha (todo el día), Google Meet, Calendario Destino y Selector de Color.
  - Eliminado el indicador de texto redundante sobre "Calendario Destino" para un encabezado limpio y alineado.
  - Versión Ampliada colapsable (`Más opciones ▾` / `Menos opciones ▴`): Repetición/Recurrencia, Ubicación, Invitados, Notificaciones, Disponibilidad, Visibilidad y Notas.
  - Apertura inteligente: en creación abre versión básica sin scroll; en edición con datos avanzados se auto-expande.
  - Corregida la interacción del botón "Más opciones" con auto-scroll suave hacia los campos avanzados y versionado de scripts (`?v=87`) contra caché de navegador.
  - Sincronización exitosa con `install_desktop.sh`.

- [x] **Fase 84: Filtrado Dinámico y Reactivo por Cuenta en Calendario, Eventos y Tareas:**
  - Filtrado integral reactivo al activar o desactivar cualquiera de las cuentas en la cabecera.
  - Oculta o muestra dinámicamente: cuadrícula del calendario (mes, semana, día), lista de próximos eventos y panel de tareas pendientes.
  - Atenuación visual del indicador de cuenta al estar inactivo (`opacity-40`).
  - Persistencia de selección de fuentes activas en `localStorage`.
  - Sincronización exitosa con `install_desktop.sh`.

- [x] **Fase 83: Rediseño Integral de Vistas de Calendario (Mes, Semana, Día) y Limpieza de Sidebar:**
  - Eliminado el indicativo `G+P` del botón de Calendario en la barra lateral izquierda.
  - Vista Semanal: Cabecera con espaciado vertical holgado, números en chips redondeados, columna de horas ampliada con alineación de líneas, celdas de 64-70px y tarjetas de eventos con píldora horaria y título nítido.
  - Vista Mensual: Mayor altura mínima por celda (105-115px), realce del día de hoy con aro índigo, y distinción cromática para fines de semana en modos claro y oscuro.
  - Vista Diaria: Banner de cabecera con tarjeta de fecha, desglose horario espacioso y tarjetas de citas completas.
  - Sincronización exitosa con `install_desktop.sh`.

- [x] **Fase 82: Modales con Scrollbar al Extremo Derecho y Optimización de Espacio en Calendario:**
  - Filtros de fuentes de calendario compactados en cabecera: muestran solo el nombre de la cuenta y el círculo de color, ahorrando valioso espacio horizontal.
  - Alineación del scrollbar al borde exterior derecho en `#new-event-modal` y `#modal-day-events`.
  - Reubicación de padding horizontal y vertical dentro del contenedor scrollable, eliminando el espacio en blanco de 24px entre el scrollbar y el marco de la modal.
  - Fijación de cabecera y barra de acciones inferior (botones Cancelar / Guardar Cita) en la base de la modal para acceso inmediato sin scroll obligado.
  - Unificación de la identidad de marca a **Elio (@elio)** e inclusión del avatar del usuario en los globos de chat.
  - Sincronización exitosa con `install_desktop.sh` y verificación de sintaxis JS limpia.

- [x] **Fase 81: Modal de Información Completa de Contactos, Edición, Eliminación y Sincronización Protegida:**
  - Modal enriquecida `modal-contact-detail` accesible al hacer clic en cualquier contacto de la libreta o en su botón de detalle `[ 👁️ ]`.
  - Muestra todos los datos disponibles: nombre, email, teléfono, empresa/organización, cargo/puesto, dirección, notas, cuenta de origen, fecha del último contacto e intercambios totales.
  - Pestañas fluidas para ver detalles y editar información con guardado vía `PUT /api/contacts/{id}` y notificaciones sticky toast.
  - Botón de nuevo contacto manual (`+ Nuevo`) en el header de la libreta.
  - Eliminación con modal de confirmación `UI.confirm` y registro permanente en `deleted_contacts`.
  - Sincronización protegida: `ContactsService.sync_contacts` respeta los contactos eliminados para no reimportarlos y preserva los campos editados (`is_customized = 1`).
  - Sincronización completa con `install_desktop.sh`.

- [x] **Fase 80: Calendarios Multi-Cuenta en Ajustes, Avatar Estático e Interacción de Perfil:**
  - `calendars` en SQLite ampliado con `account_id` y `external_id`.
  - Backend `CalendarService.sync_account_calendars()` y `get_calendars()` descubren y sincronizan calendarios de todas las cuentas conectadas (Google, Proton, Custom).
  - Selector en Ajustes (`#settings-default-calendar-select`) muestra todos los calendarios disponibles vinculados a cada cuenta y correo para seleccionar el predeterminado con persistencia en `settings.default_calendar_id`.
  - Corregido el error `this.renderAccounts is not a function` en `frontend/js/email.js`.
  - Avatar superior (`#user-header-avatar`) desacoplado de modales/drawers (`cursor-default`), operando como indicador visual fijo.
  - Botón de perfil (`[ 👤 ]`) en header abre con precisión `UserProfileAI.openDrawer()`.
  - Barra de etiquetas secundaria delgada y alternancia fluida de lista/detalle en pantallas compactas.
  - Sincronización completa con `install_desktop.sh`.

- [x] **Fase 79: Restauración Integral de Funcionalidades (Contactos, Perfil de Usuario y Asistente Elio):**
  - Libreta de Contactos restaurada con acceso en cabecera (`[ 👥 ]`), navegación lateral, drawer lateral `drawer-contacts`, sincronización en un clic y autocompletado en redacción.
  - Perfil del Usuario IA restaurado con acceso en cabecera (`[ 👤 ]`) y barra lateral, análisis automático Gemini e integración en prompts.
  - Asistente Elio restaurado con su marca e icono oficial `img/bot.png`, botón de nuevo chat limpio (`+`), resizer y chip rápido `@elio` en la barra de búsqueda.
  - Conservación absoluta de todas las nuevas funcionalidades: selección de cuenta por defecto, avatar reactivo, vistas completas de calendario (mes, semana, día) y creación de eventos enriquecida.
  - Sincronización completa con el instalador de escritorio (`install_desktop.sh`).

- [x] **Fase 78: Selección de Cuenta por Defecto y Avatar de Usuario:**
  - Persistencia en base de datos (`accounts.is_default` y `settings.default_account_id`).
  - Endpoints backend `GET /api/accounts/default` y `POST /api/accounts/{account_id}/default`.
  - Drawer de Cuentas con badge `★ Predeterminada`, estrella dorada y botón para establecer cuenta principal con confirmación sticky toast.
  - Selector de cuenta por defecto en panel de Configuración y preselección automática al redactar correos.
  - Avatar de usuario en cabecera y panel de perfil actualizado dinámicamente según la cuenta por defecto (foto oficial de Google o inicial con color de cuenta).
  - Sincronización con la aplicación de escritorio (`install_desktop.sh`).

- [x] **Fase 77: Creación y Edición de Eventos con Características Completas (Google Calendar):**
  - Modal enriquecido con horario/fecha, conmutador "Todo el día", repetición/recurrencia (diario, semanal, mensual, anual, días laborables).
  - Integración nativa de videollamadas con Google Meet (generador automático de salas, enlaces y copiado al portapapeles).
  - Campos de ubicación física, lista de invitados/asistentes con chips interactivos, selector de recordatorio/notificación, disponibilidad (ocupado/libre) y visibilidad (pública/privada/default).
  - Paleta cromática oficial de 11 colores de Google Calendar con preselección visual.
  - Edición completa de citas existentes (`PUT /api/events/{id}`) y visualización enriquecida en el drawer de detalle.
  - Sincronización completa con el instalador de escritorio.

- [x] **Fase 1: Infraestructura y Entorno:**
  - Creación del entorno virtual con `uv`, instalación de dependencias (`fastapi`, `uvicorn`, `google-genai`, `google-antigravity`, `google-auth-oauthlib`, etc.).
  - Estructura modular del proyecto (`backend/`, `frontend/`, `img/`, `data/`).

- [x] **Fase 2: Conexión de Correo y Persistencia:**
  - Base de datos local SQLite (`data/merkemail.db`) con esquema robusto para cuentas, correos, firmas, eventos y etiquetas.
  - Conexión oficial con **Google OAuth 2.0 (1 clic)** mediante ventana emergente web sin claves técnicas.
  - Sincronización en vivo mediante Gmail REST API oficial.
  - Compatibilidad con ProtonMail mediante la app oficial **Proton Mail Bridge** local (`127.0.0.1:1143` y `1025`).

- [x] **Fase 3: Inteligencia Artificial (Gemini & Antigravity SDK):**
  - **Detección Dinámica de Modelos:** Consulta en tiempo real a `client.models.list()` para poblar los modelos soportados según la API Key provista.
  - **Antigravity Copilot (Agente Autónomo):** Integración con `google-antigravity` para ejecución autónoma de búsqueda, lectura de correos y agendamiento en el calendario.
  - **Mail Cleanup AI:** Depuración y limpieza de buzones guiada por prompts en lenguaje natural.
  - **Área de Prompt de Redacción:** Redacción asistida con selección de tono (formal, cordial, conciso, comercial) e inyección directa en el editor.
  - **Resumen Ejecutivo (TL;DR) y Smart Reply:** Análisis instantáneo de correos y propuesta de respuestas.

- [x] **Fase 4: Calendario Unificado:**
  - Matriz interactiva mensual y agenda lateral de próximos compromisos.
  - Código de colores por proveedor (Google Calendar y Proton Calendar).
  - Extracción automática de citas desde correos con un solo clic.

- [x] **Fase 5: Gestor de Firmas y Personalización de Cuentas:**
  - Tabla `signatures` en SQLite con asignación por cuenta y firma por defecto.
  - Selector de color nativo y presets visuales para cada cuenta, reflejado en toda la interfaz.
  - Pruebas de conexión en tiempo real IMAP/SMTP y diagnóstico de estados.

- [x] **Fase 6: Rediseño Split View Estilo Gmail (Master-Detail):**
  - Header superior completo con barra de búsqueda *"Pregúntale a MerkeMail o busca correos..."*, indicador `● Activo`, accesos rápidos y avatar del usuario.
  - Sidebar izquierdo con botón cápsula `+ Redactar`, carpetas con badges y dots de colores por cuenta.
  - Panel dividido: Lista vertical a la izquierda y visor de lectura continuo a la derecha con cuerpo en scroll independiente.
  - Barra de acciones al pie del correo: `[↩ Responder]`, `[↪ Reenviar]`, `[✨ Responder con IA]` y `[📅 Agendar en Calendario]`.

- [x] **Fase 7: Sistema Completo de Etiquetas (Labels) y Navegación Dinámica:**
  - Creación de tablas `labels` y `email_labels` en SQLite con endpoints CRUD completos en FastAPI.
  - Sección interactiva de **Etiquetas** en el sidebar con botón `+` para crear nuevas etiquetas y paleta de colores.
  - Filtrado instantáneo por etiqueta y carpetas (`Recibidos`, `Destacados`, `Enviados`, `Papelera`), alternando automáticamente de la vista de Calendario a la bandeja de Correos.
  - Asignación y desasignación rápida de etiquetas directamente desde el visor de lectura de correos con menú dropdown.
  - Badges de color en la lista split y visor de detalle.

- [x] **Fase 12: Carpetas Dinámicas del Sistema Google / Gmail & IMAP:**
  - Soporte completo para carpetas nativas: `Recibidos`, `Destacados`, `Enviados`, `Borradores`, `Papelera`, `Spam`, `Todos`, `Importantes`, `Promociones`, `Social`, `Notificaciones`, `Foros`.
  - Desplegable `Más / Menos` en la barra lateral con estilo Gmail idéntico a la captura de referencia.
  - Sincronización en tiempo real y descarga bajo demanda de cada carpeta con la API de Google / IMAP.

- [x] **Fase 13: Corrección de Aislamiento y Márgenes de Correos HTML:**
  - Resuelto el desbordamiento horizontal provocado por correos con tablas HTML o elementos de ancho fijo (`<table width="650">`).
  - Aplicado `min-w-0`, contención estricta en `.email-body-content` y scroll horizontal local en caso de tablas amplias, manteniendo los márgenes de la aplicación estables en todo momento.

- [x] **Fase 14: Corrección de Sincronización y Visibilidad Multi-Cuenta:**
  - Inclusión de subcategorías de Gmail (`CATEGORY_UPDATES`, `CATEGORY_PROMOTIONS`, etc.) en la consulta de la bandeja `INBOX` para que todos los correos entrantes de cuentas nuevas aparezcan de inmediato en Recibidos.
  - Sincronización global multicuenta en `/api/emails/sync` para actualizar todas las cuentas configuradas con un solo clic.
  - Restablecimiento automático a la carpeta `Recibidos` y sincronización visual al seleccionar cualquier cuenta individual.

- [x] **Fase 15: Franja Azul y Selección de Correos en Cualquier Fila:**
  - Corrección de la especificidad CSS de `divide-y` que ocultaba el borde izquierdo en todos los elementos posteriores al primero.
  - Regla `.email-list-item.selected` con `border-left-color: #4f46e5 !important;` y fondo de selección responsivo para temas claro y oscuro.

- [x] **Fase 16: Reubicación del Selector de Cuentas:**
  - Se movió el selector desplegable de cuentas al encabezado superior junto al botón `Redactar`, despejando la barra de herramientas de la lista de correos.

- [x] **Fase 17: Barra de Acciones Masivas por Lote (Estilo Gmail):**
  - Implementación del dropdown de selección con filtros rápidos (Todos, Ninguno, Leídos, No leídos, Destacados, Sin destacar).
  - Activación automática de la barra de acciones al marcar uno o más correos: Archivar, Marcar Spam, Eliminar (con modal de confirmación), Marcar como leído/no leído, Asignar etiquetas y Destacar/Quitar estrella.
  - Creación del endpoint `/api/emails/batch-action` en FastAPI para ejecutar las acciones en SQLite con notificaciones sticky.

- [x] **Fase 18: Barra Lateral Ocultable y Redimensionable (Sidebar Resizer):**
  - Botón de alternar colapso en la parte superior del sidebar (marcado en el recuadro rojo) y en el menú del header para contraer a modo icono limpio de 64px o expandir a ancho completo.
  - Divisor interactivo (`#sidebar-resizer`) con arrastre fluido mediante ratón (drag-to-resize), limitando el ancho a no menos de 64px de espacio prudencial y hasta 280px.
  - Persistencia de preferencias en `localStorage` (`sidebar_collapsed`, `sidebar_width`).

- [x] **Fase 19: Unificación del Selector de Cuentas en la Cabecera del Sidebar:**
  - Sustitución del texto estático "Carpetas" por el selector interactivo desplegable de cuentas.
  - Retiro del selector del header superior y eliminación de la sección redundante de cuentas en el pie del sidebar.
  - Menú flotante con el aspecto estilizado de la lista de cuentas (dot de color, nombre, dirección y enlace a administración de cuentas), compatible con modo colapsado.

- [x] **Fase 20: Redimensionamiento y Modo Compacto de la Lista de Correos:**
  - Inserción de divisor interactivo (`#email-list-resizer`) con arrastre fluido entre la lista y el visor de detalle.
  - Ajuste continuo de ancho con límites protegidos: de 200px a 480px (su ancho máximo actual).
  - Ocultamiento progresivo e inteligente de contenido para evitar saturación visual: al reducirse (<= 340px) se ocultan el snippet y badges de etiquetas, y en modo ultra-compacto (<= 260px) se simplifican fecha y estrella, persistiendo el ancho en `localStorage`.

- [x] **Fase 21: Barras Divisorias Ultra-Delgadas (1 px):**
  - Eliminación de bordes duplicados entre paneles.
  - Reducción visual del grosor de `#sidebar-resizer` y `#email-list-resizer` a solo 1 px (línea fina sutil), recuperando todo el espacio muerto.
  - Inclusión de área de agarre invisible de 9 px (`::after`) para un arrastre cómodo e inmediato.

- [x] **Fase 22: Barra de Acciones por Lote con Overflow Inteligente:**
  - Eliminación del botón hamburguesa superior (1) dejando solo el control de colapso en el sidebar.
  - Con espacio suficiente: todos los iconos de acción (Archivar, Spam, Papelera, Leído/No leído, Etiquetas, Destacar, Quitar estrella) se muestran directamente en la barra (2), y el menú de 3 puntos (3) se oculta automáticamente.
  - Al reducir la columna: los iconos desbordados se transfieren dinámicamente dentro del selector (3), mostrándolo únicamente cuando contiene opciones.

- [x] **Fase 23: Sincronización Total de Checkboxes y Deselección Post-Acción:**
  - Rastreo centralizado de selección mediante `selectedBatchIds = new Set()` en `EmailManager`.
  - Método `clearSelection()` para desmarcar todas las casillas individuales, limpiar el checkbox superior `#split-select-all` (removiendo checked e indeterminate) y ocultar la barra de herramientas.
  - Ejecución obligatoria de `clearSelection()` inmediatamente tras aplicar cualquier acción por lote (etiquetas, spam, archivar, leídos, papelera), así como al cambiar de carpeta, cuenta, etiqueta, buscar o paginar.
  - Sincronización bidireccional continua con `updateBatchSelectionUI()` en cada renderizado de la lista.

- [x] **Fase 24: Conservación del Botón Flecha, Ocultamiento del Selector de Cuentas y Barra Flotante:**
  - Al colapsar/reducir la barra lateral, el selector de cuentas (`#sidebar-account-dropdown-wrapper`) desaparece por completo.
  - El botón (1) (`#btn-sidebar-collapse`) permanece visible y centrado a 38x38px con su flecha rotada hacia la derecha para expandir el sidebar con 1 solo clic.
  - Creación de barra flotante elegante (`#sidebar-hover-bar`) que reemplaza al tooltip nativo (opción 2) mostrando el texto de la opción, badge y dot de color al pasar el cursor.
  - Supresión del atributo `title` nativo para evitar la superposición tosca de tooltips de Chrome.

- [x] **Fase 25: Entorno Completamente Responsivo y Práctico:**
  - Integración de menú hamburguesa móvil en el header (`md:hidden`) y sidebar convertido en cajón deslizante off-canvas (`fixed z-50 transform -translate-x-full`) con backdrop oscuro y cierre automático al seleccionar opciones.
  - Navegación móvil fluida: lista de correos a pantalla completa; al abrir un correo se oculta la lista y se muestra el detalle con botón "← Volver".
  - Ocultamiento de divisores de redimensionamiento de escritorio en pantallas táctiles (`hidden md:block`).
  - Adaptación fluida de tablets (768px-1023px) con lista de correos optimizada (340px) y split view simultáneo.
  - Calendario adaptativo en columna única para móvil y cuadrícula con agenda para desktop.
  - Modales y Drawers ajustados al ancho de pantalla en móviles con márgenes protegidos.

- [x] **Fase 26: Lógica Bidireccional Inteligente (Toggle) en Acciones Masivas:**
  - Etiquetas: al aplicar una etiqueta a varios correos seleccionados, se remueve de los correos que ya la tenían y se asigna a los que no la tenían.
  - Destacados (Estrellas): toggle inteligente que quita estrella a los correos destacados y añade a los no destacados.
  - Leído / No leído: invierte el estado de lectura de cada correo seleccionado de forma contextual.
  - Spam, Archivo y Papelera: permite enviar o restaurar a la bandeja principal según su carpeta actual.

- [x] **Fase 27: Conteo y Badges de Correos No Leídos en Todas las Carpetas y Etiquetas:**
  - Endpoint `GET /api/emails/unread-counts` en FastAPI con conteos precisos por carpeta del sistema, categorías y etiquetas.
  - Soporte para vista consolidada ("Todas las cuentas") y filtrada por cuenta activa (`account_id`).
  - Renderizado dinámico de badges con número de no leídos en todas las carpetas del sidebar (`Recibidos`, `Destacados`, `Enviados`, `Borradores`, `Spam`, `Papelera`, `Todos`, `Importantes`, `Promociones`, `Social`, `Notificaciones`, `Foros`).
  - Renderizado de badges de no leídos en cada etiqueta en la lista dinámica de etiquetas `#sidebar-labels-list`.
  - Actualización en tiempo real al abrir mensajes, cambiar de cuenta, sincronizar o ejecutar acciones por lote.
  - Soporte en modo colapsado mediante la barra flotante de opciones (`#sidebar-hover-bar`).

- [x] **Fase 28: Sistema Completo de Filtros de Búsqueda Avanzada Multicriterio:**
  - Backend: soporte en `/api/emails` para filtros de `sender`, `recipient`, `subject`, `label_ids` (múltiples), `has_attachments`, `is_starred`, `read_status`, `date_from`, `date_to` (con horas `datetime-local`) y `ai_urgency`.
  - Frontend: rediseño integral de `#drawer-search-advanced` con selección múltiple interactiva de etiquetas con chips de color, selectores de fecha y hora nativos con atajos rápidos (*Hoy*, *7 días*, *30 días*, *Este año*).
  - Selectores de carpeta, cuenta, estado de lectura, destacados, adjuntos y urgencia de IA.
  - Banner informativo persistente de filtros activos sobre la lista de correos con botón de restablecimiento rápido y dot indicador en el botón del header.

- [x] **Fase 29: Detección y Visualización de Archivos Adjuntos con Icono (Clip):**
  - Detección recursiva de adjuntos en Gmail API (`attachmentId` / `filename`) y guardado consistente en `has_attachments`.
  - Actualización de los correos existentes en la base de datos local que contienen archivos adjuntos.
  - Renderizado del icono de clip en cada correo de la lista de correos junto a la fecha/hora.
  - Indicador e insignia de archivos adjuntos en la cabecera del visor de lectura de correos.

- [x] **Fase 30: Control de Sincronización Automática (Toggle Activo/Pausa) e Intervalos por Cuenta:**
  - Botón de estado interactivo en el header (`#btn-toggle-auto-sync`) con alternancia entre **Activo** (verde con animación de pulso) y **Pausado** (ámbar con icono ⏸).
  - Suspensión y reanudación inmediata de las tareas periódicas automáticas con feedback sticky toast y persistencia en `localStorage`.
  - Migración de base de datos en tabla `accounts` agregando columna `sync_interval INTEGER DEFAULT 5`.
  - Actualización de endpoints FastAPI `GET /api/accounts`, `POST /api/accounts`, `PUT /api/accounts/{id}` con soporte para `sync_interval`.
  - Selector en el modal de Conectar / Editar Cuenta con intervalos estándar (1 min, 5 min, 15 min, 30 min, 1 hora, Manual).
  - Scheduler inteligente en segundo plano (`initAutoSyncScheduler`) que evalúa el intervalo individual de cada cuenta activa y refresca la bandeja sin recargar ni interrumpir al usuario.

- [x] **Fase 31: Corrección de Visibilidad y Centrado de Iconos/Dots de Etiquetas en Sidebar:**
  - Corrección de la estructura HTML de `.label-nav-btn` asignando la clase `.sidebar-text` al contenedor del badge de no leídos y botones de acción, garantizando su ocultamiento total en modo colapsado (`display: none !important`).
  - Restructuración con `.label-left-content` (`flex-1 min-w-0`) y `.label-dot` (`shrink-0`), asegurando que los círculos de color de las etiquetas nunca se colapsen ni se desplacen hacia la derecha.
  - Reglas CSS en `#sidebar-container.collapsed` para cuadrar las opciones a `38x38px` centradas con `margin: 2px auto` y dots de 10px centrados exactamente igual que los iconos de carpetas del sistema.
  - Eliminación de padding horizontal residual en `#sidebar-labels-list` en estado colapsado.

- [x] **Fase 32: Asignación y Eliminación de Etiquetas Contextuales por Cuenta en Correo Actual:**
  - Eliminación directa de etiquetas asignadas en el correo abierto mediante botones interactivos `×` en cada badge con confirmación instantánea sticky toast.
  - Desasociación rápida de `Recibidos` (archivar) mediante botón `×` en el chip de carpeta.
  - Selector `+ Etiqueta` contextual que consulta y muestra exclusivamente las etiquetas correspondientes a la cuenta origen del correo (`email.account_id`).
  - Menú desplegable interactivo con casillas de verificación (checkmark `✔`) para asignar o quitar etiquetas con un solo clic.
  - Opción para crear nuevas etiquetas asociadas automáticamente a la cuenta origen del correo.
  - Sincronización bidireccional inmediata en base de datos local SQLite y en servidores de Gmail (vía `modify_message_labels`) cuando la cuenta es OAuth2.

- [x] **Fase 33: Jerarquía Responsiva con Preferencia al Área de Correo Actual (Tablets y Desktop):**
  - Implementación de cascada de reducción inteligente para dar máxima prioridad de visualización al correo actual (`#email-detail-container`):
    1. **Paso 1 (< 1200px / Tablets):** Reducción automática de la barra lateral (`#sidebar-container`) a modo colapsado (64px), liberando ~180px de espacio.
    2. **Paso 2 (< 992px / Tablets compactas):** Reducción automática de la lista de correos (`#email-list-container`) a 270px en modo compacto, garantizando más de 420px de lectura cómoda al visor de correo.
  - Protección de ancho mínimo (`min-width: 380px`) en el visor de lectura durante el arrastre manual con el divisor interactivo (`#email-list-resizer`), evitando que se asfixie el contenido.
  - Sincronizador dinámico en `UI.syncResponsiveLayoutPriority()` ejecutado al cargar y al redimensionar la ventana.

- [x] **Fase 34: Botón de Limpieza Rápida en la Barra de Búsqueda:**
  - Incorporación del botón interactivo `×` (`#btn-clear-search`) dentro del campo de búsqueda estilo píldora de Gmail.
  - Aparición dinámica únicamente cuando el campo contiene texto ingresado y auto-ocultamiento al quedar vacío.
  - Al pulsar la `×` (o presionar la tecla `Escape`), se vacía el campo, se restablece el término de búsqueda, se recargan los correos originales y se devuelve el foco al input con notificación sticky toast.

- [x] **Fase 35: Estilización Limpia de Checkboxes Vacíos (Estilo Gmail):**
  - Eliminación del renderizado nativo oscuro del navegador en Linux/Chrome (`appearance: none; -webkit-appearance: none`).
  - Configuración de fondo blanco limpio (`bg-white`) con borde suave (`border-slate-300`) cuando están desmarcados/vacíos.
  - Efecto hover interactivo con borde índigo suave.
  - Indicadores SVG puros y nítidos: tilde blanca sobre fondo índigo para `:checked` y barra blanca para `:indeterminate`.

- [x] **Fase 36: Soporte e Instalación Local como Progressive Web App (PWA):**
  - Generación de iconos adaptativos en resoluciones estándar 192x192 y 512x512 (`/img/icon-192.png`, `/img/icon-512.png`).
  - Creación y configuración de `frontend/manifest.json` con `start_url: "/"`, `display: "standalone"` y temas de color.
  - Creación del Service Worker `frontend/sw.js` con cacheo estático y estrategia Network First con fallback offline.
  - Configuración de rutas raíz en FastAPI (`GET /manifest.json`, `GET /sw.js`) para garantizar el alcance global (`scope: "/"`).
  - Adición de meta tags compatibles con PWA en navegadores de escritorio, Android y iOS Safari.
  - Implementación de botón de instalación en la barra superior (`#btn-install-pwa`) y en Ajustes (`#drawer-settings`).
  - Captura del evento `beforeinstallprompt`, detección del modo `standalone` y notificación sticky toast al completar la instalación.

- [x] **Fase 37: Redactor de Correos con Editor HTML Enriquecido (WYSIWYG Composer):**
  - Creación del módulo [frontend/js/composer.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/composer.js) que gestiona formato en tiempo real, atajos de teclado y sincronización.
  - Interfaz de redactor estilo clientes de correo modernos (Gmail/Outlook):
    - Botón de maximizar/restaurar modal (`Composer.toggleExpand()`) para redacción cómoda a pantalla completa.
    - Campos plegables para destinatarios con copia (`Cc`) y copia oculta (`Cco`).
    - Barra completa de formato HTML con:
      - Deshacer y Rehacer (`undo`/`redo`, `Ctrl+Z`, `Ctrl+Y`).
      - Selector de Encabezados (Normal, H1, H2, H3, Bloque de código `<pre>`).
      - Selector de Tipografías (Inter, Arial, Georgia, Courier New).
      - Negrita (`Ctrl+B`), Cursiva (`Ctrl+I`), Subrayado (`Ctrl+U`), Tachado.
      - Paleta emergente de 10 colores de texto y 8 colores de resaltador de fondo.
      - Alineaciones (Izquierda, Centro, Derecha, Justificado).
      - Listas (Viñetas y Numeración) y Sangría (Disminuir/Aumentar).
      - Citas (`<blockquote>`), Línea divisoria (`<hr>`) y modal para insertar enlaces (`Ctrl+K`).
      - Limpiador de formato (`removeFormat`) y alternador de código fuente HTML (`</>`).
  - Compatibilidad total con el asistente IA (Gemini Prompt) y firmas corporativas multi-cuenta.
  - Soporte en backend para envío MIME HTML (`is_html: true`, `Cc`, `Bcc`) tanto en SMTP tradicional como vía Google OAuth (Gmail API).

- [x] **Fase 38: Editor de Respuesta en Línea Estilo Gmail (Inline Quick Reply):**
  - Incorporación del módulo de respuesta integrado al final del correo actual ([frontend/js/composer.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/composer.js) `InlineReply` y [frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js)).
  - Encabezado con avatar de remitente, destinatario pre-llenado y botón para abrir en ventana emergente (Pop-out).
  - Barra de herramientas de formato HTML enriquecido colapsable mediante el botón `Aa`:
    - Deshacer/Rehacer, Negrita, Cursiva, Subrayado, Tachado, Encabezados, Colores de texto/fondo, Viñetas, Alineación y Citas.
  - Botón "+ Responder con IA" directo en la barra inferior para insertar sugerencias inteligentes de Gemini.
  - Botón de envío rápido con feedback visual y botón de papelera para descartar borrador.
  - Navegación fluida: al presionar "Responder" en las opciones superiores del correo, la vista realiza un scroll suave directamente al editor en línea.

- [x] **Fase 39: Traducción de Categorías del Sistema de Gmail al Español:**
  - Implementación de las funciones `getFolderDisplayName` y `getLabelDisplayName` en [frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js).
  - Traducción de `CATEGORY_UPDATES` a **"Actualizaciones"**, `CATEGORY_PROMOTIONS` a **"Promociones"**, `CATEGORY_SOCIAL` a **"Social"**, `CATEGORY_FORUMS` a **"Foros"** y `CATEGORY_PERSONAL` a **"Principal"**.
  - Visualización en español en el chip de carpeta del visor de correo, en la lista de correos, en la barra lateral y en el dropdown de asignación de etiquetas.
  - Activación del botón de archivar rápido (`×`) para cualquier correo en carpetas de entrada y categorías.

- [x] **Fase 40: Firmas con Formato HTML y Edición Directa en Formulario:**
  - Soporte completo para formato HTML en firmas mediante barra de herramientas interactiva (Negrita, Cursiva, Subrayado, Viñetas, Listas ordenadas, Enlaces, Selector de color y vista de código HTML crudo).
  - Carga automática en el formulario superior al hacer clic en cualquier firma guardada o en su botón de editar (lápiz).
  - Estado interactivo "EDITANDO FIRMA" con indicador animado, nombre de la firma y botón para cancelar la edición.
  - Endpoint `PUT /api/signatures/{sig_id}` en backend para actualizar firmas existentes en la base de datos SQLite.
  - Renderizado HTML enriquecido de previsualización en las tarjetas de la lista inferior.
  - Notificaciones sticky toast al crear y actualizar firmas, y diálogo modal de verificación para eliminarlas.

- [x] **Fase 41: Asistente IA de Redacción Integrado en el Editor y Ajuste de Capas (Z-Index):**
  - Integración de panel nativo desplegable dentro del modal de redacción ([frontend/index.html](file:///home/perry/Desarrollo/MerkeMail/frontend/index.html#L1295-L1350) y [frontend/js/composer.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/composer.js)).
  - Acceso directo mediante el botón **"Asistente IA Prompt"** sin salir del editor ni requerir barras laterales superpuestas.
  - Opciones de tono, instrucción personalizada y generación instantánea del asunto y cuerpo con formato HTML y firma por defecto.
  - Ajuste de capa `z-[120]` en el drawer lateral `#drawer-ai-prompt` para que quede siempre por delante del modal central (`z-[100]`) en caso de ser invocado.

- [x] **Fase 42: Redacción Inteligente Contextualizada y Vaciado Completo de Borrador:**
  - Creación del endpoint `/api/gemini/smart-reply/{email_id}` en [backend/main.py](file:///home/perry/Desarrollo/MerkeMail/backend/main.py#L910-L945) y método `generate_smart_reply` en [backend/gemini_service.py](file:///home/perry/Desarrollo/MerkeMail/backend/gemini_service.py#L140-L200).
  - Inclusión del contexto completo del correo abierto (remitente, asunto, fecha, cuerpo y notas previas) para redactar respuestas de alta pertinencia.
  - Mecanismo de fallback de modelos (`gemini-3.1-flash-lite`, `gemini-3.5-flash-lite`, `gemini-3.8-flash`) para garantizar disponibilidad sin caídas por cuotas 429.
  - El borrador se inyecta directamente dentro del editor editable (`#inline-reply-editor`), con cursor enfocado y firma por defecto, listo para modificación directa por el usuario.
  - Función de descarte/papelera mejorada para limpiar el editor en su totalidad, dejándolo 100% en blanco.

- [x] **Fase 43: Avatares de Gmail en Caché y Avatar de la Cuenta del Sistema:**
  - Persistencia de `avatar_url` en la tabla `accounts` de SQLite obtenido de Google OAuth UserInfo.
  - Módulo `AvatarService` en [frontend/js/avatars.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/avatars.js) con almacenamiento local persistente en `localStorage` (`merkemail_avatar_cache_v2`) y memoria para evitar solicitudes repetidas.
  - Endpoint `/api/avatar/{email}` en backend con encabezado `Cache-Control: public, max-age=604800, immutable` (7 días).
  - Visualización del avatar oficial de la cuenta del sistema (la primera cuenta registrada, `accounts[0]`) en la esquina superior derecha del encabezado ([frontend/index.html](file:///home/perry/Desarrollo/MerkeMail/frontend/index.html#L143-L146)).
  - Avatares de Google en el visor de detalle del correo (remitente) y en el editor de respuesta rápida (Inline Reply), así como en el selector y drawer de cuentas.

- [x] **Fase 44: Impresión Aislada y Fiel del Correo Seleccionado:**
  - Implementación de `EmailManager.printCurrentEmail()` en [frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js) utilizando un `iframe` dinámico aislado temporal.
  - Ocultamiento de la interfaz de usuario completa (sidebar, lista de correos, encabezados del sistema, barra de acciones y editor de respuestas).
  - Encabezado de impresión limpio y formal con Asunto, De, Para y Fecha en español.
  - Conservación íntegra del diseño original del correo (tablas, estilos CSS, imágenes escaladas al 100% y tipografía nítida).
  - Reglas `@media print` en [frontend/css/app.css](file:///home/perry/Desarrollo/MerkeMail/frontend/css/app.css) como salvaguarda ante `Ctrl+P`.

- [x] **Fase 45: Firma por Defecto Automática y Cursor Superior en Editores:**
  - Inserción automática de la firma predeterminada debajo del cuerpo del correo en la caja de respuesta en línea (`InlineReply`) y en el redactor modal (`Composer`).
  - Resolución inteligente de firmas predeterminadas por cuenta (`getDefaultSignatureForAccount`) y firma global.
  - Protección de la firma con `contenteditable="false"` para resguardar su formato y estilos.
  - Colocación programática del cursor de edición (`focusTop` / `setCursorToTop`) en la parte superior antes de la firma.
  - Soporte de placeholder superior que se oculta automáticamente al tipear y se restablece si el texto se vacía.

- [x] **Fase 46: Eliminación de Etiquetas HTML en Listados de Correos:**
  - Implementación de `cleanSnippet` en [frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js) para remover todas las etiquetas HTML (`<p>`, `<div>`, `<br>`, etc.) y decodificar entidades en los snippets de la lista de correos.
  - Extracción de texto plano en backend (`backend/google_oauth.py` y `backend/email_service.py`) al enviar correos HTML, evitando guardar etiquetas crudas en la columna `snippet`.
  - Limpieza de los registros existentes en SQLite (`data/merkemail.db`).

- [x] **Fase 47: Ordenamiento Cronológico Descendente Estricto de Correos:**
  - Corrección de la ordenación en SQLite implementando `ORDER BY COALESCE(datetime(emails.date), emails.date) DESC, emails.id DESC` en `backend/main.py`.
  - Captura y conversión de la marca de tiempo de recepción exacta en el buzón (`internalDate` de Gmail) normalizada a formato ISO 8601 UTC canónico (`YYYY-MM-DDTHH:MM:SSZ`) en sincronizaciones y envíos.
  - Actualización y normalización de las 175 fechas de correos existentes en la base de datos local SQLite.
  - Doble ordenamiento descendente en cliente JavaScript en `frontend/js/email.js` para asegurar que el más nuevo aparezca siempre al inicio y el más viejo al final.

- [x] **Fase 48: Soporte Completo de Archivos Adjuntos en Redacción y Respuestas:**
  - Creación de tabla `attachments` en SQLite (`data/merkemail.db`) y actualización de modelos en [backend/database.py](file:///home/perry/Desarrollo/MerkeMail/backend/database.py).
  - Soporte de adjuntos codificados en base64 en endpoints de FastAPI (`POST /api/emails/send` y `GET /api/emails/{id}`) en [backend/main.py](file:///home/perry/Desarrollo/MerkeMail/backend/main.py).
  - Soporte de empaquetado MIME `multipart/mixed` para envío de archivos adjuntos mediante Gmail API ([backend/google_oauth.py](file:///home/perry/Desarrollo/MerkeMail/backend/google_oauth.py)) y SMTP ([backend/email_service.py](file:///home/perry/Desarrollo/MerkeMail/backend/email_service.py)).
  - Selector de archivos múltiple, previsualización con badges de archivo y eliminación individual en el modal de redacción ([frontend/js/composer.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/composer.js) y [frontend/index.html](file:///home/perry/Desarrollo/MerkeMail/frontend/index.html)).
  - Botón de clip interactivo para adjuntar archivos en la caja de respuesta rápida en línea (`InlineReply`), con previsualización, descarte y transferencia completa a modal flotante si se expande.
  - Renderizado y visualización de archivos adjuntos con botón de descarga en el lector de detalle de correos ([frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js)).

- [x] **Fase 49: Aislamiento Total del Diseño del Correo y Solución a Imágenes Remotas y CIDs:**
  - Implementación de visor aislado mediante `iframe` auto-ajustable en [frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js) (`mountEmailBodyFrame`).
  - Aislamiento CSS 100%: eliminación total de fugas de estilos (`body { padding: ... }`, `* { font-family: ... }`) de correos publicitarios (ej. CarShield) hacia la interfaz de MerkeMail, protegiendo los márgenes de la aplicación.
  - Protección y fidelidad 100% del diseño original de los correos (tablas, encabezados, colores y tipografías originales no son alterados por el preflight de Tailwind).
  - Conversión y resolución completa de imágenes inline `cid:` a Data URIs (`data:image/png;base64,...`) en la base de datos local y de manera continua en [backend/google_oauth.py](file:///home/perry/Desarrollo/MerkeMail/backend/google_oauth.py) y [backend/email_service.py](file:///home/perry/Desarrollo/MerkeMail/backend/email_service.py) (solucionando imágenes rotas en reportes como SETESA).
  - Carga segura de imágenes remotas con política `no-referrer` y endpoint de proxy backend `/api/image-proxy` en [backend/main.py](file:///home/perry/Desarrollo/MerkeMail/backend/main.py) con fallback automático ante errores de red o CORS.

- [x] **Fase 50: Opción "No es spam" y Bloqueo / Autorización de Imágenes en Spam:**
  - Endpoint `POST /api/emails/{email_id}/not-spam` en [backend/main.py](file:///home/perry/Desarrollo/MerkeMail/backend/main.py) para mover el correo a `INBOX` y remover la etiqueta `SPAM` en Gmail/IMAP.
  - Botón interactivo **"No es spam"** añadido en la barra de herramientas superior y en el banner de advertencia para correos en la carpeta de Spam.
  - Bloqueo preventivo de imágenes remotas e incrustadas para correos en Spam: las etiquetas `<img>` y estilos `background-image` se neutralizan para impedir descargas automáticas y rastreadores externos.
  - Botón **"Mostrar imágenes"** en el banner superior para autorizar y desbloquear la carga de imágenes del correo abierto bajo demanda.

- [x] **Fase 51: Detección, Visualización y Descarga Completa de Documentos Adjuntos:**
  - Extracción y guardado sistemático de metadatos de adjuntos (`filename`, `content_type`, `size`, `remote_id`) en SQLite tanto para correos existentes como en sincronizaciones en vivo con Gmail API e IMAP.
  - Endpoint de descarga `GET /api/attachments/{attachment_id}/download` en [backend/main.py](file:///home/perry/Desarrollo/MerkeMail/backend/main.py) que transmite los archivos con su nombre real, tipo MIME y almacenamiento en caché local.
  - Rediseño de la sección de archivos adjuntos en [frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js) con tarjetas visuales, insignias por tipo de documento (PDF, Excel, Word, Imagen, Zip), descripción legible, tamaño formateado e hipervínculo/botón de descarga directa.
  - Función "Descargar todos" para descargar secuencialmente todos los documentos adjuntos de un mensaje.

- [x] **Fase 52: Alternancia Bidireccional de Ocultar / Mostrar Imágenes en Correos de Spam:**
  - Botón dinámico de alternancia en el banner de advertencia superior de Spam (`#btn-toggle-spam-images-${email.id}`).
  - Permite desbloquear las imágenes cuando están ocultas (*"Mostrar imágenes"*) y volver a bloquearlas/ocultarlas cuando ya han sido autorizadas (*"Ocultar imágenes"*).
  - Reactividad inmediata: reconfiguración del `iframe` aislado de forma segura, actualización del texto informativo del banner y cambio del icono del botón sin recargar la página.
  - Notificaciones sticky toast del sistema confirmando *"Imágenes Desbloqueadas"* o *"Imágenes Ocultadas"*.

- [x] **Fase 53: Erradicación del Espacio Residual al Final de los Mensajes:**
  - Diagnóstico del efecto acumulativo (*ratchet effect*) provocado por la observación de `documentElement` y la suma de píxeles arbitrarios en el ajuste del iframe.
  - Encapsulación del cuerpo HTML en `#merke-email-content` con `display: flow-root` y `height: auto` en [frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js), calculando al píxel la altura real sin tomar la altura de la ventana del iframe.
  - Neutralización de márgenes y paddings residuales inferiores en los últimos elementos y tablas del HTML del correo (`#merke-email-content > *:last-child`).
  - Reducción del padding del marco contenedor exterior (`p-1.5 md:p-3`) y `min-height: 30px` en el iframe, ajustando el contenido de forma compacta y sin espacios en blanco sobrantes.

- [x] **Fase 54: Marcado Automático de Correo Visto tras 7 Segundos de Estar Seleccionado:**
  - Modificación de `GET /api/emails/{id}` en [backend/main.py](file:///home/perry/Desarrollo/MerkeMail/backend/main.py) para que la consulta no marque inmediatamente el correo como leído en la base de datos.
  - Creación del endpoint `POST /api/emails/{email_id}/read` para actualizar el estado a visto (`is_read = 1`) y sincronizar con Gmail remoto (`removeLabelIds: ['UNREAD']`).
  - Gestión en cliente con temporizador de 7 segundos (`readTimerId`) en [frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js): al seleccionar un correo no leído, se mantiene como no leído hasta cumplirse los 7 segundos continuos de lectura.
  - Cancelación limpia del temporizador si el usuario cambia a otro mensaje o regresa a la lista antes de los 7 segundos.
  - Actualización visual fluida en el DOM (`updateEmailItemReadStatus`) y refresco de contadores de no leídos en el sidebar.

- [x] **Fase 55: Corrección de Conexión Manual IMAP/SMTP y Protección contra Autofill:**
  - Identificación del problema: el navegador autocompletaba el campo "Usuario IMAP" con `pl.daniels@gmail.com` al configurar la cuenta de IONOS `pl.daniels@merke.net`, provocando rechazo de credenciales (error 535 / authentication failed).
  - Bloqueo de autofill no deseado en el modal de cuentas ([frontend/index.html](file:///home/perry/Desarrollo/MerkeMail/frontend/index.html)) con `autocomplete="off"` y `autocomplete="new-password"`.
  - Sincronización automática en tiempo real ([frontend/js/app.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/app.js) y [frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js)): al escribir la dirección de correo se asigna automáticamente al usuario IMAP/SMTP y se corrigen discrepancias de dominio.
  - Respaldo en backend ([backend/main.py](file:///home/perry/Desarrollo/MerkeMail/backend/main.py)): normalización de `imap_user` asignando el correo de la cuenta como fallback ante campos vacíos o autocompletados con Gmail en dominios externos.
  - Corrección y prueba exitosa de la cuenta IONOS `pl.daniels@merke.net` con validación 100% en IMAP y SMTP.

- [x] **Fase 56: Aceleración de Búsqueda, Sincronización y Apertura de Correos:**
  - Creación de 7 índices SQL en SQLite (`idx_emails_acc_folder`, `idx_emails_date`, `idx_emails_read`, etc.), reduciendo tiempos de consulta y conteo de buzón a menos de 25ms.
  - Reducción del 99.5% en el payload JSON de `GET /api/emails` al excluir `body_html` y `body_text` en listados.
  - Descarga concurrente multi-hilo en `sync_gmail` con `ThreadPoolExecutor` y sincronización paralela multi-cuenta en backend.
  - Memoria caché local reactiva en frontend (`emailDetailCache` y `accountLabelsCache`) para apertura instantánea (0ms) y prefetch en segundo plano de los primeros correos.

- [x] **Fase 57: Expansión de Scroll y Cancelación en Depuración por Prompt (Mail Cleanup AI):**
  - Eliminación de la altura fija `max-h-72` en la lista de candidatos `#cleanup-candidates-list` ([frontend/index.html](file:///home/perry/Desarrollo/MerkeMail/frontend/index.html)), transformándola en un contenedor `flex-1 min-h-0 overflow-y-auto` que aprovecha el 100% de la altura vertical del drawer.
  - Implementación del método `cancelAndClearCleanup()` en [frontend/js/gemini.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/gemini.js) conectado al botón "Cancelar", botón de cierre y backdrop: cierra la ventana lateral y reinicia por completo el formulario (limpia el prompt, restablece la lista y desactiva el botón de ejecución).

- [x] **Fase 58: Control Global de Servicio IA Gemini, Indicador de Estado y Ocultación Reactiva:**
  - **Interruptor en Ajustes & Gemini:** Incorporado un switch interactivo en `#drawer-settings` ([frontend/index.html](file:///home/perry/Desarrollo/MerkeMail/frontend/index.html)) para encender o apagar el servicio de IA Gemini (`gemini_enabled`), persistido en la base de datos y administrado por `ConfigService` en [backend/config_service.py](file:///home/perry/Desarrollo/MerkeMail/backend/config_service.py).
  - **Indicador de Estado en el Icono de Configuración:** El dot indicador superior (`#gemini-status-dot`) pasa a **rojo** (`bg-rose-500`) cuando la IA está desactivada o no configurada, y a **verde** (`bg-emerald-500`) únicamente cuando está encendida con API Key válida.
  - **Ocultación Reactiva de Elementos IA:**
    - Se oculta el badge `AI` en la cabecera junto al logo MerkeMail (`#brand-ai-badge`).
    - Se oculta la sección completa de "HERRAMIENTAS IA" en el sidebar (`#sidebar-ai-section`: Copiloto Autónomo, Redactor con IA y Depurar por Prompt).
    - Se oculta el botón `✨ Asistente IA Prompt` (`#btn-compose-ai-prompt`) en el redactor de nuevo correo.
    - Se ocultan los botones de responder con IA en el visor de lectura (`#btn-top-reply-ai`) y en la barra de respuestas rápidas (`#btn-inline-reply-ai`).
  - **Protección en Backend:** `GeminiService.get_client` valida el estado de activación impidiendo invocaciones si el servicio está apagado.

- [x] **Fase 59: Bordes con Color de Cuenta en Avatares:**
  - **Identificación Cromática en Avatares:** Integrado en [frontend/js/avatars.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/avatars.js) un borde perimetral circular de 2px (`border: 2px solid ${accountColor}`) utilizando el color representativo de cada cuenta.
  - **Detección Automática y Explícita:** Tanto en la lista rápida de cuentas del sidebar ([frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js)), como en el drawer de administración de cuentas, en el avatar del usuario del header y en las respuestas rápidas, los avatares con foto de perfil o iniciales quedan enmarcados nítidamente por el color de su respectiva cuenta.

- [x] **Fase 60: Rediseño Visual Premium del Switch y Sección de IA en Ajustes:**
  - **Tarjeta Principal Estilizada:** Nueva tarjeta `#gemini-service-card` en [frontend/index.html](file:///home/perry/Desarrollo/MerkeMail/frontend/index.html) con fondo degradado suave, icono enmarcado en púrpura/índigo, tipografía nítida y badge dinámico (`● Activo` con pulso o `Desactivado`).
  - **Interruptor Toggle Estilo iOS / Radix UI:** Eliminado el checkbox genérico con palomita nativa deformada; reemplazado por un control suave `button role="switch"` con thumb deslizante flotante (`#gemini-switch-thumb`) y cambio de color fluido.
  - **Transición de Opciones y Banner de Pausa:** Al desactivar la IA, las opciones inferiores se atenúan suavemente con `opacity-40` y se muestra un banner informativo explicativo.

- [x] **Fase 65: Mensajes de Error Empáticos y Humanos con Ilustración `error.gif`:**
  - **Ilustración Integrada (`img/error.gif`):** Guardada la imagen proporcionada por el usuario en `img/error.gif` y sincronizada en el entorno de escritorio instalado.
  - **Componente Visual `UI.renderErrorState`:** Muestra estados de error empáticos, con diseño centrado y tamaño congruente al contenedor (`sm` de 80px en chat/paneles laterales y `md` de 130px en listas principales), explicando el problema sin tecnicismos y con botón de reintento.
  - **Humanización de Errores Técnicos en Toasts y Paneles:** Sustitución de `Failed to fetch` por explicaciones claras en Antigravity Copilot, bandeja de correos, visor de lectura y notificaciones sticky.
  - **Reintento Inmediato en Antigravity Copilot:** Botón interactivo para reenviar el último mensaje en caso de corte temporal de conexión.

- [x] **Fase 62: Optimización de Rendimiento en Apertura de Correos y Limpieza de Procesos:**
  - **Limpieza de Procesos Huérfanos/Zombies:** Se depuraron procesos zombies que congestionaban la cola de sockets locales de Python/Uvicorn, logrando tiempos de respuesta de **6 a 8 milisegundos** por correo.
  - **Pre-caché de Etiquetas por Cuenta:** `loadLabels` agrupa y guarda en memoria (`accountLabelsCache`) todas las etiquetas al inicio, eliminando llamadas de red secundarias y bloqueantes al hacer clic en cualquier mensaje.

- [x] **Fase 61: Acciones Individuales en Visor de Correo Abierto y Ocultación de Agendar Cita IA:**
  - **Eliminación de Redundancia de Etiquetas:** Retirado el botón `+ Etiqueta` del lado izquierdo en el encabezado del correo abierto individual, centralizando la interacción en el icono `🏷️` de la barra de acciones superior.
  - **Ocultación de Agendar Cita IA:** El botón de agendar cita automatizada por IA (`#btn-top-schedule-ai`) se oculta automáticamente cuando la IA no está activa (por switch apagado o sin API Key), y se sincroniza reactivamente en `GeminiAI.applyAIStatusUI()`.
  - **Barra de Acciones Individuales:** Añadidas a la barra superior del correo abierto individual ([frontend/js/email.js](file:///home/perry/Desarrollo/MerkeMail/frontend/js/email.js)) las opciones equivalentes a las acciones por lote:
    1. **Archivar (📥):** Archiva el correo de forma individual retirándolo de la carpeta actual con toast informativo.
    2. **Marcar como Spam (🚫):** Envía a SPAM o restaura si ya es spam.
    3. **Mover a Papelera (🗑️):** Confirmación modal y traslado a papelera.
    4. **Marcar como Visto / No Leído (✉️):** Alternancia directa con cambio dinámico de icono e interactividad inmediata vía `POST /api/emails/{id}/toggle-read` sincronizado con Gmail remoto (`UNREAD`).
    5. **Asignar Etiquetas (🏷️):** Menú flotante interactivo con checkboxes de etiquetas pertenecientes a la cuenta de origen del correo (accesible tanto desde el botón `+ Etiqueta` a la izquierda como desde el icono `🏷️` en la barra derecha con autocierre al hacer clic fuera).
    6. **Destacar (⭐):** Alternancia de estado favorito.
    7. Acciones complementarias preservadas: Responder, Reenviar, Responder con IA, Agendar en Calendario e Imprimir.

- [x] **Fase 66: Depuración y Limpieza del Header Superior:**
  - **Eliminación de Botones Duplicados:** Retirados los botones de Libreta de Contactos (`[ 👥 ]`) y Perfil del Usuario (`[ 👤 ]`) del header superior derecho.
  - **Centralización en Barra Lateral:** Las funcionalidades se mantienen de forma consistente e intuitiva desde el menú lateral izquierdo (`#nav-item-contacts` y `#nav-item-user-profile`).
  - **Sincronización:** Actualizado el entorno de escritorio instalado mediante `install_desktop.sh`.

- [x] **Fase 67: Perfeccionamiento de Impresión y Vista Previa (Eliminación de Huecos en Blanco):**
  - **Encabezado Ultra-Compacto:** Título del correo en negrita reducido a `13.5px`, metadatos (De, Para, Fecha) en rejilla flexible horizontal de `10.5px`, ahorrando más de 100px de altura vertical respecto al diseño original.
  - **Márgenes y Densidad:** Márgenes de página ajustados a `0.6cm 0.8cm`.
  - **Desempaquetado de Contenedores Responsivos:** Corrección de `display: table-cell` en frameworks de correo como Klaviyo (`.kl-row`, `.kl-column`) y MJML para que se comporten como bloques naturales en impresión y no bloqueen la fragmentación de página ni empujen secciones enteras a páginas posteriores.
  - **Precarga Asíncrona de Imágenes en Iframe:** Se incorporó detección de carga completa de imágenes remotas en el iframe de impresión antes de invocar `print()`.

- [x] **Fase 68: Compactación de Invocador de Elio en Barra de Búsqueda:**
  - **Botón Inteligente `@elio`:** Se sustituyó el texto largo ("Preguntar a Elio ↵") por el avatar de Elio junto a un indicador compacto `( ? )` alineado en una sola fila (`whitespace-nowrap`).
  - **Optimización de Espacio:** Se evita el corte en dos renglones que deformaba la barra de búsqueda y se maximiza el área libre para escribir.
  - **Sincronización:** Desplegado en la aplicación instalada mediante `install_desktop.sh`.

- [x] **Fase 69: Unificación de Identidad de Marca a Elio (@elio):**
  - **Reemplazo Integral en UI:** Sustituido "Gemini" / "Gemini AI" por **Elio (@elio)** en redactor asistido, respuestas inteligentes, resumen ejecutivo TL;DR, análisis de perfil de usuario, depuración por prompt y notificaciones sticky del sistema.
  - **Preservación en Configuración:** Mantenida la referencia a Google Gemini exclusivamente en la ventana modal de Ajustes donde se especifica el proveedor de IA y su respectiva API Key.

- [x] **Fase 70: Avatar de Usuario Predeterminado en Chat de Elio:**
  - **Identidad en Mensajes de Chat:** Cada mensaje enviado por el usuario en las conversaciones con Elio ahora incluye el avatar de la cuenta de correo predeterminada (foto de perfil o círculo con inicial y color distintivo) al costado derecho de la burbuja.
  - **Coherencia Visual:** Dimensiones equilibradas (`w-6 h-6`) equivalentes al icono de Elio en el lado izquierdo.
  - **Sincronización:** Desplegado en la app instalada vía `install_desktop.sh`.



















