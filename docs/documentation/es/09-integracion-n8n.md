---
title: Integración N8n
order: 9
icon: RiFlowChart
summary: Conecta tus workflows de N8n a Physalis con el nodo oficial — secretos, servicios y cuentas accesibles bajo demanda, sin duplicación.
---

# Integración N8n

El nodo comunitario de N8n `n8n-nodes-physalis` permite a tus workflows leer
secretos, servicios y cuentas de aplicación almacenados en tu bóveda de Physalis
— sin duplicar credenciales en N8n.

**Ventajas:**

- Si una contraseña cambia en Physalis, el workflow la usa automáticamente
  en la siguiente ejecución.
- Ningún secreto almacenado en texto plano en la base de datos de N8n.
- Cada acceso queda registrado en el log de auditoría de Physalis (`INTEGRATION_CREDENTIALS_FETCH`).
- La revocación instantánea del token = terminación inmediata del acceso.

## Instalar el nodo en N8n

1. En tu instancia de N8n: **Settings → Community Nodes → Install**.
2. Pega el nombre del paquete: `n8n-nodes-physalis`.
3. Haz clic en **Install**.

El nodo **Physalis** aparecerá entonces en el selector de nodos (bajo la
categoría *Development*).

> ℹ️ N8n hospedado en n8n.cloud: los nodos comunitarios no están disponibles en modo
> SaaS. Se requiere autoalojamiento.

## Elegir el tipo de token adecuado

Physalis ofrece **3 tipos** de tokens bearer compatibles con este nodo.
Elige el que se adapte a tu caso de uso:

| Token | Prefijo | Alcance | ¿Sobrevive si el creador se va? | Recomendado para |
|---|---|---|---|---|
| **OrgToken** | `sv_org_…` | 1 organización, alcances explícitos + proyectos autorizados | ✅ sí (`createdBy SetNull`) | **Workflows institucionales de larga duración** (producción) |
| **UserToken** | `sv_user_…` | 1 usuario, acceso a los proyectos de los que es miembro | ❌ no (revocado si el usuario es eliminado) | Workflows personales / prototipado |
| **MachineToken** | `sv_…` | 1 proyecto específico + 1 entorno específico | ✅ sí (vinculado al proyecto) | CI/CD heredado, integraciones no-GitHub |

> 💡 **Recomendación**: para un workflow de N8n en producción, usa un **OrgToken**.
> Sobrevive cuando un miembro del equipo se va — tus workflows no se romperán cuando
> alguien abandone la organización.

## Crear un OrgToken

Reservado para **OrgADMIN** o **OrgOWNER**.

1. Ve a **Organización → Tokens** (pestaña visible solo para roles ADMIN+).
2. Haz clic en **+ New token**.
3. Completa:
   - **Name**: etiqueta descriptiva, p. ej. `N8n - Voyages prod`.
   - **Scopes**: marca solo los necesarios:
     - `PROJECTS_LIST` (requerido para la carga dinámica del desplegable)
     - `SECRETS_READ` si lees secretos de entorno
     - `SERVICES_READ` si lees servicios externos
     - `ACCOUNTS_READ` si lees cuentas de aplicación
   - **Authorised projects**: marca los proyectos específicos. **Evita** la
     casilla "All current and future projects" salvo que sea necesario
     (se muestra un diálogo de confirmación).
   - **Expiration**: `1 year` recomendado para tokens de automatización.
4. Copia el token mostrado — **no volverá a ser visible tras cerrar el diálogo**.

## Crear un UserToken (alternativa)

Para workflows personales o de prototipado rápido:

1. Ve a **Settings → Security → Integration tokens**.
2. **+ Create a token**, asígnale un nombre y elige una expiración.
3. Copia el token.

## Configurar la credencial en N8n

En N8n: **Credentials → New → Physalis API**.

Completa:

| Campo | Valor |
|---|---|
| **Vault URL** | URL de tu instancia de Physalis, p. ej. `https://argoweb.physalis.cloud` (sin barra final) |
| **Bearer Token** | El token copiado en el paso anterior |

Haz clic en **Test**: debería responder OK aunque la lista de proyectos esté vacía.

> 💡 Puedes crear múltiples credenciales de Physalis — por ejemplo, una por
> entorno (`Physalis Voyages prod`, `Physalis Voyages staging`).

## Operaciones disponibles

### Get Credentials

Recupera secretos, servicios o cuentas de un proyecto, con filtros opcionales.

| Campo | Descripción |
|---|---|
| **Project** | Selecciona el proyecto (cargado dinámicamente desde la API) |
| **Type** | `secret` (variables de entorno) · `service` (Stripe, Mailgun, …) · `account` (cuenta de aplicación de prueba/admin) |
| **Environment** | Requerido si `type=secret`. P. ej.: `production`, `staging` |
| **Tag** | Filtrar por etiqueta técnica (p. ej.: `postgres`, `stripe`). Lista cargada dinámicamente. |
| **Key** | Filtro de clave exacta (sensible a mayúsculas) — solo para secretos |

**Salida**: 1 ítem de N8n por credencial encontrada. Formato por tipo:

```json
// type=secret
{ "key": "DATABASE_URL", "value": "postgresql://...", "category": "database", "tags": ["postgres"] }

// type=service
{ "id": "ck...", "name": "Stripe Production", "url": "https://stripe.com",
  "username": "admin@argoweb.fr", "password": "sk_live_...", "tags": ["stripe"] }

// type=account
{ "id": "ck...", "name": "Test client account",
  "username": "test@example.com", "password": "...", "tags": ["staging"] }
```

### List Projects

Lista los proyectos accesibles al token, junto con sus entornos.
Útil para workflows dinámicos que iteran sobre múltiples proyectos
(p. ej. auditoría entre proyectos).

```json
{ "slug": "voyages", "name": "Voyages", "role": "VIEWER",
  "environments": [{ "name": "production", "url": "https://app.voyages.fr" }] }
```

## Ejemplos de workflows

### Conexión automática a PostgreSQL

```
[Schedule Trigger]
       ↓
[Physalis: Get Credentials]
   project: voyages
   type: secret
   env: production
   tag: postgres
       ↓
[PostgreSQL]
   host: {{ $json.value.split('@')[1].split(':')[0] }}
   credentials: extraídas de value
```

Si la contraseña de la BD cambia en Physalis, el workflow usa automáticamente
la nueva en la siguiente ejecución.

### Envío de correo electrónico via Mailgun

```
[Webhook]
   ↓
[Physalis: Get Credentials]
   project: newsletter
   type: service
   tag: mailgun
   ↓
[HTTP Request]
   url: https://api.mailgun.net/v3/...
   auth: Basic {{ $json.username }}:{{ $json.password }}
```

### Auditoría entre proyectos (rotación programada)

```
[Daily Cron]
   ↓
[Physalis: List Projects]
   ↓ (salida: 1 ítem por proyecto)
[Physalis: Get Credentials]
   project: {{ $json.slug }}
   type: secret
   env: production
   key: DATABASE_PASSWORD
   ↓
[Function: detectar contraseñas > 90 días]
   ↓
[Slack: alerta]
```

## Límites de seguridad

- **Solo lectura en V1**. No es posible escribir mediante el nodo
  (no hay `POST /api/integrations/secrets`). Para rotación automática, usa el
  futuro SDK de Physalis (backlog) o un script personalizado con un token dedicado.
- **OrgSecrets** (`GITHUB_DISPATCH_TOKEN`, `REGISTRY_PAT`,
  `REGISTRY_USER`…) **nunca** son accesibles mediante este nodo —
  por diseño. Estas claves están reservadas para la infraestructura de compilación/despliegue.
- **HTTPS obligatorio**. Nunca uses este nodo con una URL `http://`.

## Seguridad operacional

Aplica en tu instancia de N8n:

- **HTTPS estricto** en la propia instancia de N8n
- **2FA activado** en las cuentas de administrador de N8n
- **Copia de seguridad cifrada** de la base de datos de N8n (las credenciales están cifradas
  en la base de datos pero la clave de cifrado está en la configuración de N8n)
- **Revocación inmediata** del token de Physalis si la instancia de N8n se ve comprometida
  (desde Org → Tokens → botón "Revoke")
- **Un token por instancia de N8n** — nunca compartas el mismo token entre
  dev/staging/prod o entre múltiples equipos

## Log de auditoría

Todos los accesos mediante el nodo quedan registrados en Physalis:

- **Acción**: `INTEGRATION_CREDENTIALS_FETCH` (1 entrada por llamada, no por ítem)
- **Metadatos**: `{ tokenKind, type, tag, keyFilter, count }`
- **Actor**: `kind: "user"` si UserToken, `kind: "token"` (con
  `tokenId` + `tokenName`) si OrgToken o MachineToken

Visible en **Organización → Audit** o **Proyecto → Audit**.

## Enlaces

- 📦 Paquete npm: [n8n-nodes-physalis](https://www.npmjs.com/package/n8n-nodes-physalis)
- 🐙 Código fuente: [github.com/argo-web/physalis-n8n-nodes](https://github.com/argo-web/physalis-n8n-nodes)
- 🐛 Incidencias: [github.com/argo-web/physalis-n8n-nodes/issues](https://github.com/argo-web/physalis-n8n-nodes/issues)
- 📚 N8n Community Nodes: [docs.n8n.io/integrations/community-nodes](https://docs.n8n.io/integrations/community-nodes/)
