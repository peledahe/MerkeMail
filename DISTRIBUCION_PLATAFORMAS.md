# MerkeMail / Senda - Modalidades de Uso, Arquitectura y Distribución Multiplataforma

Este documento resume las modalidades operativas actuales, la viabilidad de despliegue como webmail privado y la estrategia para generar instaladores multiplataforma (Windows, Linux, macOS).

---

## 1. Estado Actual de la Aplicación en Ubuntu

Actualmente, el sistema está 100% operativo en las siguientes tres modalidades:

1. **Navegador Web Local**:
   - Accesible a través de `http://localhost:6524` (o la IP local del equipo dentro de la red).
   - Servido por el backend FastAPI/Uvicorn con SQLite local.
2. **PWA (Progressive Web App)**:
   - Instalable en el escritorio/dispositivo directamente desde navegadores como Chrome, Edge o Firefox.
   - Cuenta con Service Worker (`sw.js`), manifiesto (`manifest.json`) y almacenamiento en caché sin barra de navegador.
3. **Aplicación Nativa Desktop (Linux)**:
   - Ejecutable mediante `launcher.sh` / `app_window.py` utilizando **PyQt6 y QtWebEngine**.
   - Ventana sin bordes del sistema operativo (*frameless*), controles de ventana integrados en el header web (`_ □ X`), soporte para arrastre suave y System Tray (bandeja del sistema con notificaciones y conteo de no leídos).

---

## 2. Modalidad Webmail con Privacidad Absoluta

Es viable desplegar MerkeMail como servicio webmail garantizando que los datos no queden expuestos:

### Opción A: Servidor Privado / Autoalojado (Self-Hosted)
- **Implementación**: Desplegar el backend y frontend en un servidor doméstico, NAS, Raspberry Pi o VPS privado mediante un contenedor Docker.
- **Acceso seguro**: Vía HTTPS con certificado SSL o mediante una VPN de malla como Tailscale o WireGuard.
- **Privacidad**: Cada usuario o equipo mantiene su propia base de datos SQLite cifrada (`merkemail.db`), y ninguna empresa externa tiene acceso a las credenciales o correos.

### Opción B: Webmail Zero-Knowledge en Navegador
- **Implementación**: Servir el frontend como una aplicación web estática y utilizar tecnologías de almacenamiento local en el navegador del cliente:
  - **OPFS (Origin Private File System)** o **IndexedDB** cifrado con la API estándar `WebCrypto`.
  - La base de datos SQLite se ejecuta directamente en el navegador del usuario compilada a WebAssembly (SQLite WASM).
- **Privacidad**: Las credenciales IMAP/SMTP y los correos se almacenan únicamente en el almacenamiento del dispositivo cliente; el servidor web solo entrega los archivos HTML/JS y nunca recibe ni procesa datos sensibles.

---

## 3. Compatibilidad con Windows y macOS sin Cambios Drásticos

El proyecto fue desarrollado sobre una base tecnológica estándar que facilita su portabilidad a otros sistemas operativos:

- **Backend (Python)**:
  - Desarrollado en Python 3 estándar con librerías multiplataforma (`FastAPI`, `Uvicorn`, `SQLite3`, `cryptography`, `BeautifulSoup4`).
  - No requiere cambios estructurales. Solo es necesario sustituir llamadas específicas a utilidades de terminal Linux (como `fuser -k` en `desktop/app_window.py`) por la librería universal `psutil`.
- **Frontend (Web)**:
  - Desarrollado en HTML5, CSS (Tailwind CSS compilado/local) y JavaScript vanilla estándar, sin dependencias exclusivas de Linux.
- **Desktop (PyQt6)**:
  - **PyQt6** y **QtWebEngine** son nativamente multiplataforma y funcionan de manera idéntica en Windows, macOS y Linux.

---

## 4. Estrategia y Herramientas para la Generación de Instaladores

| Plataforma | Formato de Salida | Herramientas Recomendadas | Características |
| :--- | :--- | :--- | :--- |
| **Windows** | Instalador ejecutable (`.exe`) | **PyInstaller** + **Inno Setup** | Genera un instalador profesional con asistente, icono en el menú inicio, accesos directos en el escritorio y rutina de desinstalación limpia. |
| **Ubuntu / Linux** | Paquete Debian (`.deb`) y **AppImage** | `dpkg-deb` / **AppImageKit** | El paquete `.deb` permite instalación mediante `apt`/Ubuntu Software Center. **AppImage** proporciona un binario único universal ejecutable con doble clic en cualquier distribución Linux. |
| **macOS** | Paquete de aplicación (`.app`) e imagen (`.dmg`) | **PyInstaller** o **Briefcase** + `create-dmg` | Genera una imagen `.dmg` tradicional de macOS donde el usuario arrastra la aplicación a la carpeta *Applications* (compatible con Intel y Apple Silicon). |

---

## 5. Automatización de Compilación (CI/CD)

Mediante **GitHub Actions** o **GitLab CI**, se puede configurar una canalización automatizada que, con cada nueva versión (*release* o etiqueta Git):
1. Compile en una máquina virtual de Ubuntu (`.deb` y `.AppImage`).
2. Compile en una máquina virtual de Windows (`.exe` con Inno Setup).
3. Compile en una máquina virtual de macOS (`.dmg` para ARM64 y x86_64).
4. Publique automáticamente los tres instaladores listos para descarga por parte de los usuarios.
