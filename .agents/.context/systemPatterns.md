# Patrones del Sistema - MerkeMail

## Arquitectura y Patrones de Diseño

1. **Separación de Capas:**
   - **Capa de Correo (`backend/email_service.py`):** Abstracción común para operaciones IMAP/SMTP tanto para Gmail como ProtonMail (gestión de conexiones, autenticación, lectura de buzones, descarga de adjuntos, filtrado por prompt y envío).
   - **Capa de Calendario (`backend/calendar_service.py`):** Conectores y agregador para Google Calendar y Proton Calendar (CalDAV / ICS), sincronización y gestión de eventos unificada.
   - **Capa de IA (`backend/gemini_service.py`):** Integración con el SDK oficial de Gemini (`google-genai`). Encapsula prompts para:
     - Asistente de redacción y caja de prompts libre con tonos seleccionables.
     - Depuración inteligente de buzón por prompt (análisis de remitentes, fechas, patrones de spam/promociones).
     - Extracción y resumen de eventos de calendario a partir del contenido de correos.
     - Resumen ejecutivo (TL;DR) y Smart Reply.
   - **Capa de Configuración y Claves (`backend/config_service.py`):** Gestión segura de API Keys (Gemini y otros proveedores) con validación en tiempo real.
   - **Capa de Datos y Estado (`backend/database.py`):** Persistencia en SQLite de cuentas de correo, calendarios, eventos, caché y preferencias.
   - **Capa API (`backend/api.py`):** Endpoints REST para interactuar fluidamente con la UI.
   - **Capa UI (`frontend/`):** Interfaz gráfica moderna con Tailwind CSS bajo el estándar `02-admin-apps`.

2. **Reglas de Interfaz:**
   - **Sidebar Persistente:** Con el logotipo `merke.svg`, selector de cuentas y navegación (Buzón, Calendario Unificado, Depuración IA, Ajustes).
   - **Data Tables Estándar:** Barra superior de búsqueda, filtros rápidos, filas con densidad compacta (`text-sm`, `py-3`) y paginación en el pie.
   - **Modales Laterales (Drawers / Off-canvas):**
     - Despliegue lateral para Búsqueda Avanzada.
     - Despliegue lateral para Asistente de Redacción IA (área de prompt, tonos, longitud).
     - Despliegue lateral para Depuración de Correos por Prompt (con vista previa y confirmación).
     - Despliegue lateral para Gestión visual de API Keys y Cuentas.
   - **Notificaciones Sticky:** Cualquier guardado o actualización genera un toast flotante persistente/temporizado.
   - **Modales de Confirmación:** Eliminaciones o depuraciones protegidas mediante modales claros e interactivos, sin alertas nativas.
