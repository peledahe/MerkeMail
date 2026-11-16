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

### Fase 8: Aplicación de Escritorio Nativa (PyQt6), Sincronización Bidireccional y Personalización Avanzada (Fases 8..119)
- [x] Envoltorio nativo de escritorio (`desktop/app_window.py`) en puerto exclusivo `6524` con instancia única (`SingleMainWindow`), System Tray reactivo con contador de no leídos, controles de ventana frameless y redimensionamiento hasta formato móvil (`360x480`).
- [x] Sincronización bidireccional en tiempo real y en segundo plano (cada 5 min) para **Google Gmail**, **Google Calendar**, **Google Tasks** y **Google Contacts**, prevaleciendo siempre la modificación más reciente y los cambios locales de MerkeMail.
- [x] Libreta de Contactos completa, Perfil de Usuario analizado por IA (`@elio`) y Depuración inteligente multicuenta por prompt.
- [x] Selector de **4 Diseños Visuales en Modo Claro** (*1. Minimalista*, *2. Barra Superior*, *3. Menú + Barra Superior*, *4. Menú + Barra + Lista de Correos*) + **Selector de Color Base** con generación dinámica de escala y degradé HSL.
- [x] Minimizado por defecto de etiquetas en barra lateral, tareas con fecha/hora opcionales y selector de cantidad de correos por página (`10` a `100`) persistido en SQLite y `localStorage`.

---

## Pendientes (Hoja de Ruta / Próximas Fases)

### Pendiente 1: Sistema y Opción de Notificaciones (Correos y Calendario)
- [ ] Agregar en el panel de **Configuración (`#drawer-settings`)** una sección dedicada de **Notificaciones** con interruptores persistentes (`settings` en SQLite y `localStorage`):
  - [ ] Activar/desactivar notificaciones del sistema (System Tray / OS Notifications / Web Notifications API) al recibir nuevos correos.
  - [ ] Activar/desactivar alertas de recordatorio para eventos, citas y tareas próximas del calendario (según los minutos de antelación configurados en cada cita).
  - [ ] Opción de sonido suave de notificación (activar/silenciar) y filtro para notificar solo correos prioritarios o de la bandeja principal.

### Pendiente 2: Internacionalización Multi-idioma (Versión en Inglés y Otros Idiomas - i18n)
- [ ] Implementar motor de traducción ligero en frontend y backend (`i18n.js` + diccionarios JSON `es`, `en`, y preparado para `pt`, `fr`, etc.).
- [ ] Agregar selector de **Idioma de la Interfaz (Language)** en `#drawer-settings` (**Español**, **English**, etc.) con cambio instantáneo sin recargar la página y persistencia permanente en SQLite y `localStorage`.
- [ ] Adaptar formatos de fecha/hora del calendario y respuestas automáticas de `@elio` al idioma activo seleccionado por el usuario.

### Pendiente 3: Instaladores Nativos Empaquetados (`.deb` para Ubuntu y `.exe`/`.msi` para Windows)
- [ ] **Instalador `.deb` para Ubuntu / Debian:**
  - [ ] Empaquetar el ejecutable autónomo (vía PyInstaller o entorno embebido en `/opt/merkemail`) junto con estructura `DEBIAN/control`, `postinst`, icono en `/usr/share/icons` y lanzador `/usr/share/applications/merkemail.desktop`, compilado con `dpkg-deb --build`.
- [ ] **Instalador para Windows (`.exe` / `.msi`):**
  - [ ] Adaptar rutas multi-OS (`pathlib` / `%LOCALAPPDATA%\MerkeMail`) y registro de inicio automático en Windows (`HKCU\Software\Microsoft\Windows\CurrentVersion\Run`).
  - [ ] Empaquetar backend FastAPI + ventana PyQt6 en un binario sin consola (`PyInstaller --noconsole`) y generar el asistente de instalación con **Inno Setup** (`.exe` con accesos directos en Escritorio, Menú Inicio y desinstalador).

### Pendiente 4: Arquitectura Web "Local-First" (Almacenamiento 100% en la Máquina Local del Usuario en Linux, macOS y Windows)
- [ ] **Opción A — Web Pura en Navegador (PWA + IndexedDB / SQLite-Wasm con OPFS):**
  - [ ] Migrar la capa de persistencia al navegador del usuario mediante **SQLite-Wasm sobre OPFS (Origin Private File System)** o **IndexedDB (Dexie.js)** para que correos, contactos, eventos, firmas y API Keys se guarden exclusivamente en el disco local del navegador del usuario (funciona idéntico en Linux, macOS y Windows sin guardar nada en el servidor web).
  - [ ] Conectar OAuth 2.0 y llamadas REST de Gmail, Google Calendar, Google Tasks y Gemini directamente desde el cliente web; añadir opción de exportar/importar respaldo local cifrado (`.merkemail-backup`) o sincronización con File System Access API.
  - [ ] Para cuentas IMAP/SMTP tradicionales (que usan sockets TCP bloqueados por navegadores web), proveer un relay stateless efímero (sin base de datos en servidor) o conector local ligero.
- [ ] **Opción B — Web UI Alojada + Agente Local Ligero Multi-OS:**
  - [ ] Servir la interfaz desde el dominio web conectada a `http://127.0.0.1:6524` mediante el servicio local instalado en la máquina del usuario (Linux/macOS/Windows), manteniendo el 100% de la base de datos SQLite y conexiones IMAP/SMTP en el equipo del usuario.

### Pendiente 5: Optimización y Experiencia Responsiva Avanzada para Teléfonos y Tablets (Mobile & Tablet UX)
- [ ] **Adaptación Fluida Exclusiva para Móviles (`< 768px`) y Tablets (`768px – 1023px`)** *(sin alterar el diseño ni comportamiento de Desktop, Web de escritorio ni PWA de escritorio)*:
  - [ ] Acceso completo desde el menú lateral móvil (`md:hidden`) a opciones que se compactan en la barra superior (como **Cuentas Conectadas** y **Gestor de Firmas**) con cierre automático del cajón lateral al seleccionar cualquier herramienta.
  - [ ] Aprovechamiento del 100% del ancho de pantalla en paneles laterales (`.drawer-panel`) y modales en teléfonos (`< 640px`), eliminando márgenes muertos laterales (`pl-10`).
  - [ ] Barra de acciones del visor de correo (`#email-top-actions-bar`) y cabecera del calendario adaptativas en pantallas táctiles pequeñas para evitar recortes horizontales de botones.
  - [ ] Áreas táctiles optimizadas (`min-height: 40px`), gestos táctiles y navegación maestro-detalle fluida entre bandeja de entrada, lectura de correo y calendario en teléfonos y tablets.
