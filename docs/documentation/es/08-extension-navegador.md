---
title: Extensión de navegador
order: 8
icon: RiPuzzle2Line
summary: Autocompletado, guardado automático y TOTP para sitios de terceros desde tu bóveda Physalis.
---

# Extensión de navegador

La extensión de Physalis (Chrome / Firefox) conecta tus bóvedas con la web:
autocompletado de credenciales en los sitios visitados, guardado automático al crear una cuenta,
y generación automática de códigos TOTP para sitios de terceros.

> ✅ **Estado**: la extensión está **publicada en las stores** — Chrome Web
> Store y Firefox Add-ons (v0.7.0). Backend y front-end desplegados y
> estables. Instálala desde el aviso que aparece en tu panel de control o
> directamente desde la store de tu navegador.

## Requisitos previos

- **2FA TOTP activado** en tu cuenta de Physalis (necesario para la autenticación de la extensión —
  consulta [Primeros pasos](primeros-pasos))
- Una **sesión válida** en Physalis (inicio de sesión previo desde tu navegador en
  `<tu-slug>.physalis.cloud`)

## Instalación

El **aviso de instalación** aparece en tu panel de control de Physalis cuando la extensión
no es detectada: un banner en la parte superior de la página ofrece el enlace de instalación
para Chrome o Firefox.

> 💡 La extensión detecta automáticamente Physalis mediante un evento DOM —
> no se requiere configuración manual; el aviso desaparece en cuanto se instala.

## Autenticación de la extensión

En el primer uso, la extensión solicita:

1. Tu **correo electrónico** + **contraseña** de Physalis
2. Un **código TOTP de 6 dígitos** (de tu aplicación de autenticación o de tu bóveda personal)
3. **TTL de sesión**: 1h, 4h u 8h

Tras el TTL elegido, la extensión cierra sesión automáticamente y vuelve a solicitar
correo electrónico + contraseña + TOTP. Elige 1h en una máquina compartida y 8h en
tu portátil personal.

> 🔒 Las sesiones de la extensión son **independientes** de tu sesión web. Los tokens
> se hashean con SHA-256 en el servidor — Physalis nunca almacena el token en
> texto plano, ni siquiera brevemente.

> 🔗 **Cuentas SSO / inicio de sesión social**: si te conectas mediante SSO
> de empresa o una cuenta social (sin contraseña de Physalis), el popup de
> email + contraseña no aplica. Simplemente inicia sesión en la web
> (`<tu-slug>.physalis.cloud`): si la extensión está instalada, **recupera
> automáticamente tu sesión** — sin ningún código que escribir en el popup.

### Gestionar sesiones de la extensión

En Physalis: `/settings/security` → sección **"Extension sessions"**.
Puedes ver la lista de sesiones activas (user-agent, fecha, TTL restante)
y revocar cualquiera de ellas usando el botón **"Revoke"**. Útil si
olvidas cerrar sesión en una máquina.

## Funcionalidades

### Autocompletado de credenciales

En un sitio con un formulario de inicio de sesión, la extensión:

1. Detecta los campos `<input type="email">`, `<input type="password">`,
   `autocomplete="username"`
2. Busca en tus 3 fuentes de bóvedas (personal + equipo de org + equipo de proyecto) una
   entrada cuya URL coincida con el dominio
3. Muestra un **icono** en el campo → clic → elige entre las credenciales disponibles → autocompletado

### Guardado automático para una cuenta nueva

Cuando envías un formulario de registro, la extensión:

1. Detecta los campos y el valor introducido
2. Muestra un **banner Shadow DOM** no intrusivo: *"¿Guardar estas credenciales en Physalis?"*
3. Al hacer clic, ofrece un **destino**:
   - Bóveda personal
   - Una colección de equipo (organización o proyecto)
4. Guarda mediante `POST /api/plugin/vault` (auditado en Physalis con el
   origen `plugin_autosave`)

> Una **lista de bloqueo de dominios** (configurable en la extensión) impide que
> el aviso aparezca en sitios donde nunca quieres guardar credenciales
> (intranet, entornos de prueba, etc.).

### TOTP para sitios de terceros

Si una entrada de bóveda contiene una clave `otpauth://`, la extensión detecta
los campos `autocomplete="one-time-code"` en el sitio y ofrece **autocompletado
del código de 6 dígitos** sin necesidad de copiar y pegar manualmente.

El código se regenera cada 30 segundos según la RFC 6238, calculado
**localmente** por la extensión (Web Crypto API) — la clave TOTP nunca abandona
tu navegador.

Consulta [Bóvedas](bovedas) para almacenar la clave `otpauth://` al activar 2FA
en un sitio de terceros.

## Seguridad de la extensión

| Garantía                                                           | Mecanismo                                  |
|--------------------------------------------------------------------|--------------------------------------------|
| La contraseña de Physalis nunca sale del navegador en texto plano  | Bcrypt en el servidor                      |
| Token de sesión hasheado en la BD                                  | SHA-256, nunca leído en texto plano        |
| Origen de la extensión en lista blanca                             | `PLUGIN_ALLOWED_ORIGIN` (CORS estricto)    |
| Límite de velocidad de autenticación                               | 5 intentos / 15 min / IP                   |
| Límite de velocidad de guardado automático                         | 30 / min / usuario                         |
| Auditoría completa                                                 | Cada coincidencia / guardado registrado en el log de auditoría |

## Para ir más lejos

- [Bóvedas](bovedas) — dónde viven las entradas que usa la extensión
- [Primeros pasos](primeros-pasos) — activar 2FA, requisitos previos de la extensión
