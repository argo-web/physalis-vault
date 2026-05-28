---
title: Secretos y categorías
order: 4
icon: RiKey2Line
summary: Crea, organiza y lee las variables de entorno cifradas de un proyecto.
---

# Secretos y categorías

Los **secretos** son las variables de entorno cifradas que se inyectan en tu
aplicación en el momento del despliegue. Tienen alcance a un **entorno** específico
de un proyecto (p. ej. el entorno `production` del proyecto `physalis`).

Cada secreto está:

- **Cifrado en reposo** con AES-256-GCM mediante una clave gestionada por Physalis
  (nunca almacenado en texto plano en la BD)
- **Descifrado únicamente** en el momento de una llamada autorizada (UI, token de máquina,
  OIDC GitHub Actions)
- **Auditado** — cada lectura / escritura / eliminación queda registrada en el
  registro de auditoría de la organización

## Anatomía de un secreto

| Campo          | Descripción                                                      |
|----------------|------------------------------------------------------------------|
| **Clave** (`key`) | El nombre de la variable de entorno (p. ej. `DATABASE_URL`, `STRIPE_SECRET`). Convención: UPPER_SNAKE_CASE |
| **Valor**      | El valor cifrado — introducido en un campo de contraseña, nunca visible por defecto |
| **Categoría**  | Una de las categorías predefinidas (ver más abajo) o "Sin categoría" |
| **Nota**       | Descripción opcional (visible solo en el panel, nunca en el `.env`) |

## Categorías disponibles

Physalis impone una **lista cerrada** de categorías para garantizar una organización
consistente en todos los proyectos. El orden de visualización en el panel es fijo:

1. **🔌 Puertos** — `PORT`, `HOST`, `BIND_ADDRESS`…
2. **🗄 Base de datos** — `DATABASE_URL`, `DB_PASSWORD`, `REDIS_URL`…
3. **🔐 Auth** — `JWT_SECRET`, `NEXTAUTH_SECRET`, `OAUTH_CLIENT_SECRET`…
4. **🌐 Servicios** — claves de API de terceros (`STRIPE_SECRET`, `SENTRY_DSN`,
   `OPENAI_KEY`…)
5. **📧 Correo** — `MAILGUN_API_KEY`, `SMTP_PASSWORD`, `RESEND_KEY`…
6. **🏗 Infra** — variables relacionadas con el tiempo de ejecución (`NODE_ENV`, `LOG_LEVEL`,
   `MAX_UPLOAD_MB`…)
7. **🎨 Aplicación** — variables funcionales específicas de la app
   (`FEATURE_FLAG_X`, `MAINTENANCE_MODE`…)
8. **❓ Sin categoría** — alternativa cuando ninguna de las anteriores aplica

> 💡 La categoría **no tiene efecto** sobre el comportamiento en tiempo de ejecución —
> solo afecta a cómo se muestran las cosas en la UI. Siempre puedes poner un
> secreto en "Sin categoría" si no estás seguro.

## Crear un secreto

> Permisos: **EDITOR** u **OWNER** en el proyecto (el DEV de org es
> EDITOR implícito, el ADMIN/OWNER de org es OWNER implícito).

1. Ve a `/projects/<slug>` → haz clic en una pestaña de entorno.
2. Sección **"Secretos"** → botón **"+ Añadir"**.
3. Rellena:
   - **Clave** — se convertirá en la variable de entorno (`MY_VARIABLE`)
   - **Valor** — pegado desde tu fuente (token, contraseña…)
   - **Categoría** — elige de la lista
   - **Nota** *(opcional)* — contexto para tus compañeros de equipo
4. Envía. El secreto queda **cifrado de inmediato** y almacenado en la BD.

## Leer / revelar un secreto

En la lista de secretos de un entorno, haz clic en el **icono 👁** junto a
la clave para revelar el valor. Permanece visible durante 30 segundos y luego
se enmascara automáticamente.

> Cada revelación está **auditada** (acción `SECRET_READ` en el registro de auditoría)
> con la identidad del miembro, la dirección IP y el user-agent.

**Botón 📋 Copiar**: copia al portapapeles sin revelar en pantalla.

## Editar o eliminar un secreto

- **Editar** — icono ✏️ → edita el valor, la nota o la categoría.
  La clave no se puede renombrar (crea una nueva y elimina la anterior
  si es necesario).
- **Eliminar** — icono 🗑 → se requiere confirmación. **Irreversible.**

## Convenciones reservadas de Physalis

Algunas claves tienen un **papel especial** en Physalis y activan funcionalidades
cuando están presentes. Residen en los **OrgSecrets** de la organización
(no en el entorno de un proyecto):

| Clave                     | Alcance   | Función                                                                 |
|---------------------------|-----------|-------------------------------------------------------------------------|
| `GITHUB_DISPATCH_TOKEN`   | OrgSecret | Habilita el botón **"Redesplegar"** en un entorno (activa `workflow_dispatch`) |
| `REGISTRY_PAT`            | OrgSecret | Token para `docker login` en un registro privado durante el despliegue OIDC |
| `REGISTRY_USER`           | OrgSecret | Nombre de usuario asociado al PAT del registro                          |
| `REGISTRY_URL`            | OrgSecret | URL del registro privado (por defecto `ghcr.io` si está ausente)        |

### Prefijo `VITE_*` para argumentos de compilación

Cualquier secreto de entorno con el prefijo `VITE_` se inyecta automáticamente
como **`--build-arg`** en `docker build` mediante el flujo de trabajo OIDC de plantilla
(ver [Despliegue OIDC](oidc-deployment)).

> ⚠️ Vite **incrusta** los valores `VITE_*` en el bundle JS final —
> por lo tanto son **públicos** en el lado cliente. **Nunca** pongas un secreto real
> (clave de API privada, token de servidor) en una variable `VITE_*`. Reserva este
> prefijo para URLs públicas, feature flags, etc.

## Lecturas de máquina

Los secretos son leídos en producción por tu aplicación a través de dos mecanismos:

1. **Flujo de trabajo OIDC de GitHub Actions** *(recomendado)* — sin token almacenado,
   autenticación mediante firma de GitHub. Lee el paquete completo
   (secretos + sshKey + dockerCompose). Ver [Despliegue OIDC](oidc-deployment).
2. **Token de máquina bearer** *(heredado, soportado)* — un token estático
   (`sv_<64hex>`) llamado mediante `GET /api/secrets/<slug>/<env>`. Útil para
   scripts cron o integraciones sin GitHub.

## Más información

- [Bóvedas](bovedas) — para credenciales que no son variables `.env`
  (contraseñas de administrador, bases de datos no relacionadas con el tiempo de ejecución…)
- [Despliegue OIDC](oidc-deployment) — cómo llegan estos secretos
  a tu contenedor en producción
- [Comparticiones](comparticiones) — para enviar un secreto a un tercero de forma puntual
