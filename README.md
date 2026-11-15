# 📬 MerkeMail

Aplicación gráfica moderna de gestión de correos electrónicos y calendario unificado, desarrollada en **Python** con **FastAPI** y potenciada con el SDK oficial de **Google Gemini AI** (`google-genai`), siguiendo las directrices de diseño del estándar **02-admin-apps**.

![MerkeMail Icon](img/merke.png)

---

## 🌟 Características Principales

1. **Conectividad Multi-Cuenta & Firmas:**
   - **Google Gmail (OAuth 2.0 en 1 Clic):** Abre una ventana web oficial de Google donde autorizas la cuenta directamente sin contraseñas técnicas, sincronizando mediante la Gmail REST API oficial.
   - **ProtonMail:** Integración directa con **Proton Mail Bridge** local (`127.0.0.1:1143` IMAP / `127.0.0.1:1025` SMTP).
   - **Personalización de Color por Cuenta:** Elige el color del indicativo visual de cada cuenta con selector libre y presets (rojo, morado, azul, verde, ámbar, rosa, cian). Cada correo en la bandeja muestra el color distintivo de su cuenta.
   - **Edición y Prueba de Conexión:** Edita cualquier cuenta guardada y verifica en tiempo real la conexión IMAP y SMTP con diagnóstico de errores.
   - **Gestor de Firmas Inteligente:** Crea múltiples firmas personalizadas, asigna una predeterminada por cuenta con inyección automática al redactar.

2. **Inteligencia Artificial & Agentes Autónomos con Google Antigravity SDK (`google-antigravity`):**
   - **Antigravity Copilot (Agente Autónomo):** Panel lateral de chat interactivo con un agente con capacidad de ejecución de herramientas (*Tool Calling*):
     - `buscar_correos`: Búsqueda profunda en tu buzón por cualquier palabra clave, asunto o remitente.
     - `leer_correo`: Inspección de contenido completo y análisis contextual.
     - `agendar_evento_calendario`: Agendamiento autónomo de citas en el calendario unificado de Google/Proton.
     - `listar_proximos_eventos`: Consulta instantánea de compromisos agendados.
   - **Área de Prompt para Redacción:** Escribe órdenes en lenguaje natural, ajusta el tono (formal, cordial, conciso, comercial) y transfiere el borrador generado directamente al redactor.
   - **Depuración de Correos por Prompt (Mail Cleanup AI):** Limpieza de buzones mediante instrucciones como *"localiza newsletters y promociones de más de 30 días"*, con previsualización detallada y justificación de selección antes de actuar.
   - **Resumen Ejecutivo (TL;DR):** Resúmenes de correos, puntos clave y nivel de urgencia.
   - **Smart Reply:** Respuestas contextuales instantáneas.

3. **Calendario Unificado (Google + Proton):**
   - Vista mensual interactiva y lista de agenda próxima.
   - Código de colores por proveedor (Google Calendar en azul, Proton Calendar en morado).
   - Programación, edición y eliminación de eventos.

---

## 🔒 Conexión con ProtonMail (Proton Mail Bridge)

ProtonMail cifra todos los mensajes con llaves PGP de extremo a extremo y no dispone de servidores IMAP/SMTP abiertos en la nube.

Para sincronizar con MerkeMail:
1. Abre tu aplicación **Proton Mail Bridge** en tu equipo.
2. Copia la contraseña y puertos generados por el Bridge (`127.0.0.1:1143` para IMAP y `127.0.0.1:1025` para SMTP).
3. En MerkeMail ve a **Cuentas Conectadas** > **Configurar ProtonMail Bridge / IMAP Manual**, selecciona el preset de Proton y pulsa **Guardar Cuenta**.

---

4. **Diseño de Interfaz (Estándar [02-admin-apps](.agents/skills/02-admin-apps)):**
   - Modo Dual: Soporte completo para `Light Mode` y `Dark Mode` (`dark:bg-slate-950` y `dark:bg-slate-900`).
   - Sidebar persistente con el logotipo oficial `merke.svg` / `merke.png`.
   - Data Table con densidad compacta (`text-sm`, `py-3`), buscador en tiempo real y paginación en el pie.
   - **Modales Laterales (*Slide-over Drawers*):** Para búsqueda avanzada, redacción IA, depuración por prompt y ajustes de API Keys.
   - **Notificaciones Sticky:** Avisos flotantes temporizados para confirmaciones de guardado y actualización.
   - **Modales de Confirmación:** Reemplazo integral y seguro de `alert()` y `confirm()` nativos para acciones destructivas.

---

## 🚀 Puesta en Marcha

Para iniciar la aplicación:

```bash
# Activar entorno virtual
source .venv/bin/activate

# Iniciar servidor y abrir en el navegador
./run.py
# o
python3 run.py
```

La aplicación estará disponible en: **http://127.0.0.1:8000**

---

## ⚙️ Configuración de API Key de Gemini

1. Haz clic en **Ajustes & Gemini Key** en la barra inferior del sidebar lateral.
2. Pega tu API Key de [Google AI Studio](https://aistudio.google.com/app/apikey).
3. Haz clic en **Probar Conexión** para verificar el estado en tiempo real.
4. Selecciona tu modelo favorito (`gemini-2.5-flash` o `gemini-2.5-pro`) y pulsa **Guardar Cambios**.

---

## 📄 Licencia

Este proyecto está licenciado bajo la **Business Source License 1.1 (BSL 1.1)**. Consulta el archivo [LICENSE](file:///home/perry/Desarrollo/MerkeMail/LICENSE) para conocer los términos completos y las concesiones de uso. En la fecha de cambio (Change Date), el código transiciona automáticamente a **GNU General Public License v2.0 or later (GPL-2.0-or-later)**.

