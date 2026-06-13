---
title: Despliegue OIDC
order: 7
icon: RiCloudLine
summary: Configura un servidor, una política y un workflow de GitHub Actions sin secretos almacenados.
---

# Despliegue OIDC

Physalis reemplaza los flujos antiguos de "PAT de GitHub almacenado + secretos de GitHub Actions"
con autenticación **OIDC** (OpenID Connect) basada en **tokens
firmados por el propio GitHub**.

**Resultado**: tu repositorio de GitHub **no** tiene `secrets.*` vinculados a Physalis.
La prueba de identidad es el token OIDC que GitHub Actions emite automáticamente
en cada ejecución del workflow.

## Diagrama de extremo a extremo

```
┌─────────────────┐      ┌──────────────────────────┐      ┌────────────┐
│  GitHub Actions │ OIDC │ /api/deploy de Physalis   │ SSH  │   VPS      │
│   workflow.yml  │─────▶│ - verifica el token OIDC  │─────▶│ /srv/...   │
│                 │      │ - busca la Política        │      │            │
│                 │◀─────│ - devuelve el bundle       │      │            │
└─────────────────┘      └──────────────────────────┘      └────────────┘
        │                                                         ▲
        │   POST .env + docker-compose + docker login + restart   │
        └─────────────────────────────────────────────────────────┘
```

## Requisitos previos

Antes de configurar un workflow, necesitas **3 objetos** en Physalis:

1. Un **Servidor** a nivel de organización (clave SSH del VPS de destino)
2. Un **Entorno** vinculado a ese Servidor (con un `deployPath`)
3. Una **Política** que indique *"el repositorio X, en la rama Y, puede desplegar en el proyecto P,
   entorno E"*

## 1. Crear un Servidor

> Permisos: ADMIN / OWNER de la organización.

Página de la organización → pestaña **"Servers"** → **"+ New server"**.

Campos:

| Campo           | Descripción                                                                |
|-----------------|----------------------------------------------------------------------------|
| **Name**        | Etiqueta interna (p. ej. "Hetzner prod VPS")                               |
| **IP**          | IPv4 o hostname que resuelve el VPS                                        |
| **SSH user**    | El usuario Linux en el VPS (normalmente `deploy` o `github-deploy`)        |
| **Private key** | La clave privada SSH **completa** (PEM, OpenSSH) — pegada una sola vez     |

> ⚠️ La **clave privada nunca vuelve a ser legible** desde la UI tras la
> creación — solo se usa en tiempo de ejecución por `/api/deploy` para
> incluirla en el bundle. Si la pierdes, elimina el Servidor y crea uno nuevo
> con una clave nueva.

### Preparar el VPS en el lado SSH

En el VPS, crea el usuario de despliegue y autoriza la clave pública:

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo -u deploy mkdir -p ~deploy/.ssh
sudo -u deploy bash -c 'echo "ssh-ed25519 AAAA... github-deploy" >> ~/.ssh/authorized_keys'
sudo -u deploy chmod 600 ~deploy/.ssh/authorized_keys
```

El `deployPath` (por defecto `/srv/projets/<env>/<slug>`) debe existir y
pertenecer a `deploy:deploy`.

## 2. Vincular el Entorno al Servidor

En la página del proyecto → entorno → **Configuración** → campo **Server**.
Elige el servidor creado en el paso 1, ajusta el `deployPath` si es necesario
(en caso contrario se aplica la convención `defaultDeployPath`).

Consulta [Proyectos y entornos](projets-et-environnements) para más detalles.

## 3. Crear una Política

Esta es la **regla de autorización**: quién (claims OIDC del workflow)
puede desplegar dónde (proyecto + entorno de Physalis).

En la página del proyecto → pestaña **"Policies"** → **"+ New Policy"**.

Campos (todos obligatorios, **coincidencia estricta, sin comodines**):

| Campo           | Ejemplo                          | Origen                                         |
|-----------------|----------------------------------|------------------------------------------------|
| **Repo**        | `argo-web/physalis`              | `owner/repo` de GitHub                         |
| **Workflow**    | `deploy.yml`                     | Nombre del archivo del workflow                |
| **Branch**      | `main`                           | Rama desde la que se ejecuta el workflow       |
| **Environment** | `production`                     | Un entorno existente en el proyecto            |

> El botón **"Edit"** en una Política existente permite ajustar los 4 campos
> (se detecta una colisión si ya existe otra tupla igual).

### Qué significa esto

Cuando se ejecuta un workflow, GitHub emite un token OIDC con claims como:

```json
{
  "repository": "argo-web/physalis",
  "workflow_ref": "argo-web/physalis/.github/workflows/deploy.yml@refs/heads/main",
  "ref": "refs/heads/main",
  "audience": "vault.physalis.cloud"
}
```

Physalis verifica la firma contra el JWKS de GitHub, extrae
`(repository, workflow, branch)`, busca una Política que coincida **exactamente**,
y solo activa el despliegue si la combinación `(project, env)`
del cuerpo de la petición también coincide.

## 4. El workflow plantilla

Copia [docs/deploy.modele.yml](https://github.com/physalis-cloud/physalis/blob/main/docs/deploy.modele.yml)
en `.github/workflows/deploy.yml` de tu repositorio. Adapta las variables
al inicio:

```yaml
env:
  VAULT_URL: https://vault.physalis.cloud
  VAULT_AUDIENCE: vault.physalis.cloud
  VAULT_PROJECT: physalis      # slug del proyecto en Physalis
  VAULT_ENV: main              # entorno de destino
```

El workflow contiene **2 jobs**:

1. **build** — obtiene su propio token OIDC, recupera `VITE_*` de
   Physalis, construye la imagen Docker pasando `VITE_*` como `--build-arg`,
   hace push a GHCR
2. **deploy** — vuelve a obtener el bundle completo, escribe `.env` + `docker-compose.yml`
   en el VPS via SCP, ejecuta `docker compose pull && up -d`

### Permisos del workflow

```yaml
permissions:
  id-token: write    # OBLIGATORIO para core.getIDToken()
  contents: read
  packages: write    # para hacer push a GHCR con GITHUB_TOKEN
```

## 5. Vite build args

Cualquier secreto de entorno con el prefijo `VITE_` se recupera en el job
`build` y se pasa a `docker build` como `--build-arg`.

En tu `Dockerfile` de frontend, declara los `ARG` correspondientes:

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_VAULT_URL
ARG VITE_API_URL
ENV VITE_VAULT_URL=$VITE_VAULT_URL
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
```

> ⚠️ Vite **incrusta** `VITE_*` en el bundle JS final → públicamente visible
> en el lado del navegador. Reserva estas variables para URLs públicas, feature flags, etc.
> Consulta [Secretos y categorías](secrets) para la convención completa.

## 6. Variables reservadas (`OrgSecret`)

Para que el workflow pueda hacer push/pull desde un registro privado, configura estos
3 OrgSecrets a nivel de organización:

| Clave           | ¿Requerida?  | Valor por defecto |
|-----------------|--------------|-------------------|
| `REGISTRY_PAT`  | ✅           | —                 |
| `REGISTRY_USER` | ✅           | —                 |
| `REGISTRY_URL`  | opcional     | `ghcr.io`         |

El bundle de `/api/deploy` los incluye bajo una clave `registry` separada,
distinta de `secrets[]` — **no** contaminan el `.env` del contenedor;
solo se usan para el `docker login` remoto.

## 7. Primer despliegue

1. Haz push a `main` → el workflow `deploy.yml` se inicia
2. Job `build`: obtiene VITE_*, construye la imagen, hace push a GHCR
3. Job `deploy`: obtiene el bundle, escribe `.env` + `docker-compose.yml`
   en el VPS, ejecuta `docker compose up -d`
4. Comprueba el **registro de auditoría** de Physalis (página de la org) →
   verás `DEPLOY_AUTHORIZED` con los detalles (repo, workflow, branch, env)

### En caso de fallo

El registro de auditoría de Physalis registra `DEPLOY_DENIED` con una razón diagnosticable:

| `reason`               | Causa probable                                                             |
|------------------------|----------------------------------------------------------------------------|
| `wrong_audience`       | `VAULT_AUDIENCE` en el workflow ≠ `OIDC_AUDIENCE` en Physalis              |
| `wrong_issuer`         | El token no está firmado por GitHub                                        |
| `expired`              | El job tardó demasiado antes de llamar a `/api/deploy`                     |
| `policy_not_found`     | Ninguna Política coincide con `(repo, workflow, branch)`                   |
| `policy_match_failed`  | Política encontrada pero `(project, env)` del cuerpo no coincide           |
| `no_server`            | El entorno existe pero no está vinculado a ningún Servidor                 |

## Botón "Redeploy" (workflow_dispatch)

Si deseas activar un redespliegue **desde la UI de Physalis** sin
hacer push, configura el OrgSecret `GITHUB_DISPATCH_TOKEN` (un PAT con
alcance `repo` o un token de GitHub App) y el botón **"Redeploy"** aparecerá
en cada entorno.

Al hacer clic, Physalis llama a `POST /repos/{owner}/{repo}/actions/workflows/{wf}/dispatches`
que activa el workflow `redeploy.yml` en la rama del entorno.
Este workflow **no reconstruye imágenes** — vuelve a obtener el bundle `.env`,
lo escribe en el VPS y reinicia los contenedores con `docker compose up -d`.
Esto es suficiente para secretos cargados en tiempo de ejecución (variables de entorno,
claves pasadas mediante `.env`).

Copia [docs/redeploy.modele.yml](https://github.com/physalis-cloud/physalis/blob/main/docs/redeploy.modele.yml)
en `.github/workflows/redeploy.yml` de tu repositorio y adapta las variables
al inicio del archivo.

> **Secretos inyectados en tiempo de compilación** (p. ej. `VITE_*`) — Si tu secreto se
> pasa como `--build-arg` de Docker durante la construcción de la imagen, un simple redespliegue
> no es suficiente. Necesitas activar el workflow de compilación completo (`deploy.yml`).
> Physalis gestiona esto automáticamente mediante la opción **"Full build required"**
> en la configuración de rotación del secreto (consulta [Rotación de secretos](rotaciones)).

## Para ir más lejos

- [Secretos y categorías](secrets) — cómo tus `VITE_*` y otras variables de entorno
  llegan al bundle
- [Organizaciones y roles](organizaciones-y-roles) — quién puede gestionar
  Servidores y Políticas
