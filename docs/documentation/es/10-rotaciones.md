---
title: Rotación de secretos
order: 10
icon: RiRefreshLine
summary: Comprende y configura la renovación automática o asistida de secretos sensibles.
---

# Rotación de secretos

La **rotación** es el mecanismo por el cual Physalis renueva periódicamente el
valor de un secreto — ya sea de forma automática, o recordando al equipo que
se requiere una acción manual.

A cada secreto se le puede asignar una **estrategia de rotación** y una **frecuencia**
(en días). Un cron job se ejecuta cada hora y activa las rotaciones cuya fecha
de vencimiento ha pasado.

## Requisitos previos

La rotación es una **funcionalidad opt-in** a nivel de organización. Un
**ADMIN** u **OWNER** de la org debe activarla en la configuración antes de que
pueda configurarse en secretos individuales.

La rotación también se detiene si el **proyecto está pausado** (consulta
[Pausar un proyecto](#pausar-un-proyecto)).

## Estrategias disponibles

### `DATABASE` — rotación de contraseña de base de datos

Physalis delega la rotación a un workflow de **N8n** mediante webhook. El
workflow genera una nueva contraseña, la cambia en la base de datos, y luego llama
al **callback de Physalis** para confirmar el éxito o el fallo.

Campos requeridos en el secreto:

| Campo        | Descripción                                       |
|--------------|---------------------------------------------------|
| `dbType`     | `POSTGRESQL`, `MYSQL` o `MONGODB`                 |
| `dbHost`     | Hostname del servidor de base de datos            |
| `dbPort`     | Puerto (p. ej. `5432` para PostgreSQL)            |
| `dbName`     | Nombre de la base de datos                        |
| `dbUser`     | Usuario cuya contraseña será rotada               |

Si la organización tiene un `GITHUB_DISPATCH_TOKEN` en sus OrgSecrets y
el proyecto tiene un `githubRepo` configurado, Physalis activa automáticamente
un redespliegue mediante GitHub Actions tras la rotación.

> ⚙️ La variable de entorno del servidor `ROTATION_N8N_WEBHOOK_URL` debe
> apuntar al webhook dedicado de N8n.

### `JWT_SECRET` — rotación de secreto JWT

Physalis genera por sí mismo un nuevo **secreto hexadecimal de 128 caracteres**
(64 bytes aleatorios), cifra el nuevo valor, crea una versión histórica
del anterior, y luego actualiza el secreto — completamente **sin intervención externa**.

Si el proyecto está vinculado a un repositorio de GitHub con `GITHUB_DISPATCH_TOKEN`,
se activa automáticamente un redespliegue para que los contenedores recarguen
el nuevo valor.

> Esta estrategia es **totalmente autónoma**: no se requiere ningún workflow de N8n.
> Es la estrategia recomendada para `JWT_SECRET`, `NEXTAUTH_SECRET`
> y secretos similares.

### `API_KEY` — rotación de clave del API Gateway

Physalis genera automáticamente una nueva clave en el **API Gateway** del proyecto,
actualiza el valor del secreto, revoca la clave antigua **de inmediato**, y luego activa
un redespliegue mediante GitHub Actions para que la aplicación recargue el nuevo valor
desde la bóveda.

Requisitos previos:

- El proyecto debe tener al menos una **API** configurada en la
  pestaña **API Gateway**.
- El secreto debe estar **vinculado a una clave de API existente** — selecciona la API
  y la clave al configurar la rotación.

> ⚠️ **Esta estrategia solo aplica a aplicaciones que leen su `.env`
> desde la bóveda al iniciarse** (mediante un redespliegue de GitHub Actions). Si la
> clave fue copiada directamente en n8n, Make u otra herramienta externa, tendrás
> que actualizarla manualmente tras cada rotación.

Después de cada rotación:

- La nueva clave en bruto se almacena cifrada en el secreto (el valor anterior queda
  archivado en el versionado).
- La clave antigua se revoca en el lado del Gateway: cualquier llamada a
  `/api/gateway/verify` con la clave antigua devuelve `{ valid: false,
  reason: "revoked" }` **de inmediato** (modo REMOTE).
- Si el proyecto está vinculado a un repositorio de GitHub y `GITHUB_DISPATCH_TOKEN`
  está configurado, se activa automáticamente un redespliegue.

### `REMINDER` — recordatorio de rotación manual

Physalis **no** realiza la rotación por sí mismo. Envía un correo electrónico al
**ADMIN u OWNER** de la organización pidiéndoles que renueven el secreto
manualmente en el servicio de terceros correspondiente.

Una vez realizada la rotación fuera de Physalis, el miembro debe hacer clic en
**"Mark as rotated"** en la UI (o llamar al endpoint
`/rotation/mark-rotated`) para restablecer el contador y programar la próxima
fecha de vencimiento.

> Adecuado para secretos de terceros para los cuales no dispones de un webhook
> automatizable: claves de API, certificados, contraseñas compartidas…

## Autenticación del callback de N8n

Para la estrategia `DATABASE`, N8n recibe un `rotationToken` en el
payload inicial y debe devolverlo en el callback. Este token es un
**HMAC-SHA256** calculado de la siguiente manera:

```
window = floor(timestamp_ms / 3_600_000)   // hora actual como entero
token  = "<window>.<HMAC-SHA256(secretId + "|" + window, ROTATION_HMAC_KEY)>"
```

El token es **válido durante 2 horas** (ventana ±1 hora alrededor del momento de emisión).
La clave HMAC se configura mediante la variable de entorno `ROTATION_HMAC_KEY`.

> ⚠️ Cambia `ROTATION_HMAC_KEY` respecto a su valor por defecto en producción.

## Motor cron

Un cron job **cada hora** selecciona los secretos que cumplen:

- `rotationEnabled = true`
- `rotationNextAt ≤ NOW()`
- proyecto no pausado (`rotationPaused = false`)
- funcionalidad habilitada en la organización (`rotationFeatureEnabled = true`)
- estado del cliente `ACTIVE` o `TRIAL`

Cada secreto elegible pasa por `triggerRotation()`. Los errores de red
(webhook de N8n inalcanzable) son silenciosos — la rotación se reintentará en
la siguiente hora.

## Configurar la rotación en un secreto

> Permisos: **EDITOR** o superior en el proyecto.

1. Abre un secreto → pestaña **"Rotation"**.
2. Activa la rotación y elige una **estrategia**.
3. Introduce el **intervalo en días** (1–3.650).
4. Para `DATABASE`, completa los datos de conexión.
5. Guarda. `rotationNextAt` se calcula de inmediato: `NOW + intervalDays`.

## Forzar una rotación inmediata

Un **EDITOR** puede activar una rotación fuera del ciclo cron usando el
botón **"Force rotation"** (o `POST /rotation/force`). La acción queda
auditada (`SECRET_ROTATION_FORCED`).

## Pausar un proyecto

Un **OWNER** del proyecto puede suspender todas las rotaciones del proyecto sin
desactivarlas secreto por secreto:

```http
PATCH /api/projects/<slug>/rotation/pause
{ "paused": true }
```

Útil antes de una ventana de mantenimiento o un congelamiento de versión.

## Estados y seguimiento

| Campo                | Valores posibles           | Descripción                                        |
|----------------------|----------------------------|----------------------------------------------------|
| `rotationLastStatus` | `success`, `error`, `null` | Resultado de la última rotación                    |
| `rotationErrorCount` | entero                     | Número de fallos consecutivos (se reinicia a 0 en caso de éxito) |
| `rotationLastAt`     | datetime                   | Fecha de la última rotación exitosa                |
| `rotationNextAt`     | datetime                   | Próxima ejecución programada                       |

Se envía una notificación por correo electrónico al **ADMIN/OWNER** ante el **primer
fallo consecutivo** de una rotación `DATABASE`. Los fallos posteriores no generan
correos adicionales para evitar el spam.

## Historial de valores

Durante una rotación `JWT_SECRET`, el valor anterior se archiva automáticamente
en el **versionado** del secreto (máximo 50 versiones, luego purga FIFO). Consulta
[Secretos y categorías](secrets-categories) para entender cómo funciona el versionado.
