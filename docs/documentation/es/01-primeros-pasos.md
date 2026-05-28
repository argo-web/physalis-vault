---
title: Primeros pasos
order: 1
icon: RiRocketLine
summary: Crea tu cuenta, inicia sesión desde tu subdominio, activa el 2FA.
---

# Primeros pasos

Bienvenido a **Physalis**, la bóveda de secretos de tu organización.
Esta página te guía desde la recepción de tu invitación hasta
tu primer inicio de sesión seguro.

## Comprende las URLs de Physalis

Physalis es **multi-tenant**: cada organización cliente tiene su propio
subdominio aislado.

| URL                                | Propósito                                        |
|------------------------------------|--------------------------------------------------|
| `<your-slug>.physalis.cloud`       | Tu inicio de sesión, tu panel — aquí es donde trabajas |
| `vault.physalis.cloud`             | El portal de super-administración de la plataforma — normalmente nunca irás ahí |

El `<slug>` es el nombre corto de tu organización (p. ej. `argoweb`,
`scroll`…). Lo define el super-admin cuando se crea la cuenta cliente
y aparece en el enlace de invitación que recibes.

> 💡 **Añade un marcador**: guarda tu subdominio en favoritos en tu primer inicio de sesión.
> Es tu único punto de acceso.

## 1. Recibe y acepta la invitación

Un miembro administrador de tu organización te ha invitado por correo electrónico
(a través de Mailgun, desde `noreply@physalis.cloud`).

El correo contiene un enlace de activación **válido por 48 horas**. Si expira,
pide al admin que envíe una nueva invitación — el enlace anterior queda inutilizable.

Al hacer clic en el enlace, accedes a una página de creación de cuenta:

- **Correo electrónico**: precargado, no editable (vinculado a la invitación)
- **Nombre completo**: libre
- **Contraseña**: mínimo 12 caracteres recomendado, combinación de letras / números / símbolos

Al enviar el formulario, tu cuenta queda creada, se te añade a la organización
con el rol predefinido por el admin (ver [Organizaciones y roles](organizaciones-y-roles)),
y se inicia sesión automáticamente.

## 2. Inicia sesión desde tu subdominio

Cada vez que vuelvas a Physalis, ve directamente a **`<your-slug>.physalis.cloud/login`**
(nunca a `vault.physalis.cloud` — ese portal no acepta
cuentas de usuarios de organización).

Si intentas iniciar sesión en el dominio incorrecto, obtendrás un error de
credenciales inválidas aunque tu contraseña sea correcta.

## 3. Activa el 2FA (muy recomendado)

El 2FA (autenticación en dos factores) añade un código de 6 dígitos generado por tu
teléfono en cada inicio de sesión. Sin él, solo tu contraseña protege todos
tus secretos.

**Para activarlo:**

1. Haz clic en tu correo electrónico en la esquina superior derecha del panel → llegas a
   `/settings/security`.
2. En **"Autenticación en dos factores"**, haz clic en **"Activar 2FA"**.
3. Escanea el código QR con una app TOTP:
   - **Bitwarden / Vaultwarden** (integrado en el gestor de contraseñas)
   - **1Password**, **Authy**, **Google Authenticator**, **Aegis** (Android)
   - O directamente en tu bóveda Physalis (ver [Bóvedas](bovedas))
4. Introduce el código de 6 dígitos que muestra la app para confirmar.
5. **Guarda los 8 códigos de recuperación** que se muestran una sola vez. Guárdalos en tu bóveda
   Physalis u otro lugar seguro — son la única forma de recuperar el acceso
   si pierdes tu teléfono.

En tu próximo inicio de sesión, después de introducir tu correo y contraseña, se solicitará
el código TOTP en la misma pantalla (UX de un solo paso).

> ⚠️ **La extensión de navegador requiere 2FA** para autenticarse. Si planeas
> instalar la extensión, activa el 2FA primero.

## 4. Explora el panel

Una vez que hayas iniciado sesión, la barra de navegación superior te da acceso a:

- **Proyectos** — las aplicaciones de tu organización, sus entornos
  y sus secretos ([→ Proyectos y entornos](proyectos-y-entornos))
- **🔒 Bóveda personal** — tu bóveda privada para credenciales no vinculadas
  a un proyecto (ver [Bóvedas](bovedas))
- **📤 Comparticiones** — comparte un secreto mediante un enlace de un solo uso, o pide a un tercero
  que te envíe un secreto de forma cifrada
  ([→ Comparticiones](comparticiones))
- **📖 Documentación** — la documentación que estás leyendo ahora mismo

La **organización activa** (si perteneces a varias) se puede cambiar mediante
el selector en la esquina superior izquierda.

## 5. ¿Qué sigue?

- **Eres desarrollador** → instala la [extensión de navegador](browser-extension)
  para el autocompletado de credenciales en tus sitios web.
- **Eres administrador de tu organización** → lee
  [Organizaciones y roles](organizaciones-y-roles) para invitar a otros
  miembros y configurar permisos.
- **Estás configurando un despliegue CI/CD** → lee
  [Despliegue OIDC](oidc-deployment).

## Contraseña olvidada

En la página de inicio de sesión, el enlace **"¿Olvidaste tu contraseña?"** envía un correo
con un enlace de restablecimiento válido por 1 hora. Puedes elegir una nueva contraseña sin
conocer la antigua — asegúrate de tener acceso a tu bandeja de entrada.

> Si tienes el 2FA activado y también has perdido tu teléfono,
> usa uno de tus **códigos de recuperación** para pasar el 2FA justo después
> de restablecer tu contraseña.
