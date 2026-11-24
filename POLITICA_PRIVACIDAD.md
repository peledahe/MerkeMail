# Política de Privacidad de Senda

**Última actualización:** 24 de noviembre de 2026  
**Responsable del desarrollo:** Merke  
**Aplicación:** Senda (Cliente Inteligente de Correo, Calendario y Productividad)

---

## 1. Introducción y Filosofía "Local-First"

En **Senda**, la privacidad, seguridad y soberanía de los datos del usuario son los pilares fundamentales del diseño del software. Senda está construida bajo una arquitectura **Local-First** (prioridad local):

- **Tus datos permanecen en tu dispositivo:** Todos los correos electrónicos, calendarios, eventos, contactos, notas adhesivas, contraseñas cifradas y tokens de autorización se procesan y almacenan de forma local en tu propia máquina mediante una base de datos SQLite segura.
- **Sin servidores intermediarios de recopilación:** Merke no opera servidores intermedios de telemetría, ni bases de datos en la nube que recopilen, almacenen o inspeccionen tus mensajes, contactos o credenciales.
- **Comunicación directa:** Toda conexión hacia tus proveedores de correo (Google Gmail, servidores IMAP/SMTP) o APIs de inteligencia artificial se realiza de manera directa y cifrada (HTTPS/TLS) entre tu dispositivo y los servicios respectivos.

---

## 2. Información que la Aplicación Gestiona

Para prestar sus servicios de cliente de correo y productividad, Senda procesa localmente:

1. **Credenciales y Tokens de Acceso:**
   - Para cuentas IMAP/SMTP: Nombre de usuario y contraseñas cifradas con algoritmo AES en disco local.
   - Para cuentas de Google (OAuth 2.0): Tokens de acceso (`access_token`) y actualización (`refresh_token`) cifrados localmente.
2. **Contenido de Correos Electrónicos:**
   - Mensajes (asunto, remitente, destinatarios, fecha, cuerpo en texto plano/HTML y archivos adjuntos) sincronizados directamente desde tus servidores de correo a tu base de datos local.
3. **Agenda, Tareas y Contactos:**
   - Calendarios, citas, eventos, listas de tareas y libretas de direcciones importadas o creadas por el usuario.
4. **Notas y Preferencias de Configuración:**
   - Notas adhesivas de la pizarra local, temas visuales (modo claro/oscuro), idioma y preferencias de interfaz.
5. **Claves de API de Inteligencia Artificial (IA):**
   - Tu clave personal de Google Gemini API, almacenada cifrada en tu equipo y utilizada exclusivamente para las funciones que solicites.

---

## 3. Uso y Cumplimiento de Datos de Usuario de Google (Google API Services User Data Policy)

Senda utiliza servicios de Google mediante autorización oficial OAuth 2.0 (Gmail API, Google Calendar API y Google Tasks API).

### Declaración de Uso Limitado (Limited Use Disclosure)
> El uso y la transferencia que Senda hace de la información recibida desde las APIs de Google se adhiere estrictamente a la [Política de Datos de Usuario de los Servicios de las APIs de Google](https://developers.google.com/terms/api-services-user-data-policy), incluidos los requisitos de **Uso Limitado (Limited Use)**.

En conformidad estricta con estas directrices:

1. **Uso exclusivo para funciones de usuario:** La información obtenida a través de las APIs de Google se utiliza exclusivamente para proporcionar y mejorar las funciones visibles de cliente de correo, agenda y tareas directamente al usuario.
2. **Prohibición de transferencia o venta:** No transferimos, comercializamos, distribuimos ni vendemos datos de usuarios de Google a terceros, redes publicitarias, intermediarios de datos (*data brokers*) o plataformas de reventa de información.
3. **Prohibición de publicidad:** Los datos obtenidos de Google nunca se utilizan para servir anuncios ni para crear perfiles de publicidad conductual.
4. **Prohibición de entrenamiento de modelos de IA generales:** Los datos de correo y calendario obtenidos de Google **no** se utilizan para entrenar, re-entrenar ni ajustar modelos de inteligencia artificial o aprendizaje automático de propósito general.
5. **Sin acceso humano:** Ninguna persona en Merke tiene acceso para leer o inspeccionar tus correos electrónicos o datos de Google.

---

## 4. Procesamiento de Inteligencia Artificial (Elio & Google Gemini)

Senda integra funciones avanzadas de asistencia inteligente a través de **Elio**:

- **Activación transparente:** La generación de resúmenes (TL;DR), sugerencias de respuesta rápida (*Smart Reply*), redacción asistida, categorización inteligente y síntesis ejecutiva 360° operan bajo demanda del usuario o según la configuración local activa.
- **Procesamiento en tránsito:** Cuando se solicita una función de IA, el fragmento de texto estrictamente necesario se transmite de forma cifrada mediante HTTPS a la API oficial de Google Gemini utilizando tu propia clave de API configurada.
- **Sin almacenamiento de entrenamiento:** Google procesa las solicitudes a través de la API para desarrolladores respetando los términos de privacidad de la API, donde los datos no son utilizados para entrenar modelos base.

---

## 5. Almacenamiento Local, Seguridad y Cifrado

- **Cifrado local:** Las contraseñas IMAP/SMTP y los tokens OAuth se cifran mediante claves criptográficas derivadas del entorno del usuario antes de guardarse en SQLite.
- **Aislamiento en sandbox:** Los correos en formato HTML se renderizan dentro de marcos aislados (*iframes* en sandbox) con políticas estrictas de seguridad (CSP), bloqueando scripts maliciosos y previniendo el seguimiento no deseado mediante imágenes remotas con proxy de protección.
- **Control total:** El usuario puede en cualquier momento exportar su base de datos, respaldarla o eliminarla por completo borrando el directorio de datos local de la aplicación (`~/.local/share/merkemail/data/` o `./data/`).

---

## 6. Retención y Eliminación de Datos

- **Permanencia:** Los datos se conservan localmente mientras mantengas la aplicación instalada y la cuenta vinculada.
- **Eliminación desde la app:** Al desconectar o eliminar una cuenta de correo desde el panel de *Cuentas Conectadas*, todos los correos, carpetas, etiquetas y credenciales asociadas a dicha cuenta son eliminados permanentemente de la base de datos local.
- **Revocación de permisos:** Puedes revocar el acceso de Senda a tu cuenta de Google en cualquier momento ingresando a la sección de [Permisos de tu Cuenta de Google](https://myaccount.google.com/permissions). Al revocar el acceso, Senda no podrá realizar más sincronizaciones con los servidores de Google.

---

## 7. Privacidad de Menores

Senda no está dirigida a menores de 13 años (o la edad mínima legal en tu jurisdicción) y no recopila deliberadamente información de menores.

---

## 8. Modificaciones a esta Política

Podemos actualizar esta Política de Privacidad para reflejar mejoras en la aplicación, nuevas funciones o exigencias regulatorias. Cualquier cambio significativo será notificado mediante una actualización visible dentro de la aplicación o en el repositorio oficial.

---

## 9. Contacto y Consultas

Para cualquier duda, aclaración o consulta sobre esta política o el tratamiento de tus datos, puedes contactarnos a través de:

- **Desarrollador:** Merke  
- **Correo electrónico:** contacto@merke.net / pl.daniels@merke.net  
- **Sitio web:** https://merke.net
