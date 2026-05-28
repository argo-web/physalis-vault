---
title: Comparticiones
order: 6
icon: RiShareForward2Line
summary: Enlace de un solo uso vs. solicitud externa cifrada (ECDH).
---

# Comparticiones

El menú **📤 Comparticiones** cubre dos flujos distintos para intercambiar
secretos de forma segura con personas **fuera** de Physalis (clientes, colaboradores, candidatos…)
— o incluso contigo mismo (transferencia de un dispositivo a otro).

| Flujo                     | Dirección             | Caso de uso                                              |
|---------------------------|-----------------------|----------------------------------------------------------|
| **Mis comparticiones**    | Tú → tercero          | Envías un secreto a alguien                              |
| **Solicitudes externas**  | Tercero → tú          | Pides a alguien que te envíe **a ti** un secreto         |

Ambos flujos funcionan **sin una cuenta de Physalis** por parte del destinatario /
remitente. Todo el cifrado se realiza en el navegador.

## Mis comparticiones (enlace de un solo uso)

Patrón similar a **Bitwarden Send / OneTimeSecret / Privnote**: introduces un secreto,
obtienes un enlace cifrado único que envías a través de tu canal de comunicación habitual
(correo electrónico, Slack, Signal…). El destinatario hace clic, lee el secreto, y listo.

### Crear una compartición

1. En `/shares`, pestaña **"Mis comparticiones"** (predeterminada).
2. Haz clic en el botón **"📤 Crear una compartición"** en la barra de pestañas.
3. Rellena:
   - **Etiqueta** — visible solo en tu panel para identificar la compartición
     (nunca transmitida al destinatario)
   - **Contenido** — el secreto a compartir (texto libre)
   - **TTL (tiempo de vida)** — 1h, 24h, 7 días, 30 días
   - **Modo de destrucción** — *un solo uso* (destruido tras la 1.ª lectura)
     o *expiración* (destruido al vencer el plazo, independientemente del número
     de lecturas)
   - **Correo electrónico del destinatario** *(opcional)* — Physalis enviará un correo de notificación
     a través de Mailgun con el enlace
4. Envía. El enlace generado tiene el siguiente aspecto:
   ```
   https://<your-slug>.physalis.cloud/share/abc123#XXXXXXXXXXXX
   ```
   - El segmento **después del `#`** es la **clave de descifrado** — **nunca
     se envía al servidor de Physalis** (los fragmentos de URL permanecen en el
     navegador)
   - Sin esta clave, el texto cifrado almacenado en la BD es inutilizable

### El destinatario lee el secreto

Hace clic en el enlace. La página:

1. Obtiene el texto cifrado de Physalis usando el segmento de ruta (`abc123`)
2. Recupera la clave del fragmento de URL (`#XXXXX...`)
3. Descifra en el navegador y muestra el contenido

Si la compartición estaba en modo **un solo uso**, queda inmediatamente **destruida
en la BD** tras esta lectura. Cualquier intento de acceso posterior devuelve 410 Gone.

### Revocar una compartición antes de que expire

En tu lista de comparticiones → haz clic en el botón **"Revocar"**. El texto cifrado
queda eliminado de inmediato de la BD y el enlace queda inutilizable.

## Solicitudes externas (SecretRequest, ECDH)

El caso de uso inverso: **quieres que un cliente / colaborador te envíe un
secreto** (una contraseña, una clave de API…) sin que deba crear una cuenta en
Physalis ni usar un canal inseguro.

Este es el flujo de **Solicitudes externas**, que utiliza cifrado **ECDH P-256 + AES-GCM**
completamente en el navegador — Physalis **nunca** ve el secreto en texto plano,
ni siquiera brevemente.

### Crear una solicitud

1. En `/shares`, pestaña **"Solicitudes externas"**.
2. Haz clic en el botón **"+ Autorizar una compartición externa"** en la barra de pestañas.
3. Rellena:
   - **Etiqueta** — describe lo que esperas recibir (p. ej. "Contraseña admin OVH del
     cliente X")
   - **Correo electrónico del destinatario** — el tercero al que envías el enlace
   - **TTL** — cuánto tiempo tiene el tercero para enviar
   - **(opción) Importar en un Secreto** — selecciona un proyecto + entorno +
     clave para permitir la importación con un clic después del descifrado
4. Envía. Physalis genera:
   - Un **par de claves ECDH P-256** en **tu navegador**
   - La **clave pública** se envía a Physalis y queda asociada a la
     solicitud
   - La **clave privada** se muestra **una sola vez** — cópiala en
     tu bóveda personal (se recomienda una entrada dedicada)
5. Se envía un correo al destinatario con un enlace
   `https://<your-slug>.physalis.cloud/request/<token>`.

### El destinatario envía el secreto

En la página pública:

1. Introduce el secreto en un campo de contraseña
2. El navegador **genera un par de claves efímero**, deriva un secreto ECDH compartido
   usando la clave pública de la solicitud, y cifra el secreto con
   AES-GCM
3. Envía a Physalis: texto cifrado + IV + clave pública efímera
4. La clave privada efímera queda **destruida** en el navegador

Physalis almacena estos 3 elementos — **inutilizables sin tu clave privada**.

### Tú revelas el secreto

De vuelta en `/shares`, pestaña **"Solicitudes externas"**, tu solicitud ahora muestra
el estado **"Enviado"**. Haz clic en **"Revelar"**:

1. Un diálogo te pide que **pegues tu clave privada**
   (la copiada en el paso 4 de la creación)
2. El navegador realiza la operación ECDH inversa, descifra y muestra
   el secreto
3. Botones disponibles:
   - **📋 Copiar** al portapapeles
   - **"Importar → entorno / clave"** — si configuraste la importación automática al crear,
     escribe el secreto en el `Secret` correspondiente con un clic

> 🔐 La clave privada **nunca se envía a Physalis** — puedes verificarlo en el
> inspector de red: la solicitud `/reveal` solo recupera texto cifrado +
> IV + ephemeralPublicJwk.

### Revocar una solicitud

Si el tercero tarda demasiado o cambias de opinión, haz clic en **"Revocar"**
en la solicitud. El destinatario recibe un error 410 Gone si intenta
enviar de nuevo.

## Más información

- [Bóvedas](bovedas) — donde guardar de forma duradera la clave privada de un
  SecretRequest para poder descifrarlo más tarde
- [Primeros pasos](primeros-pasos) — para el destinatario que se pregunta qué es
  este enlace de Physalis que acaba de recibir
