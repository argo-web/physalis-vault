---
title: OIDC Deployment
order: 7
icon: RiCloudLine
summary: Configure a Server, Policy and GitHub Actions workflow with no stored secrets.
---

# OIDC Deployment

Physalis replaces the old "stored GitHub PAT + GitHub Actions secrets"
flows with **OIDC** (OpenID Connect) authentication based on **tokens
signed by GitHub** itself.

**Result**: your GitHub repo has **no** `secrets.*` linked to Physalis.
The identity proof is the OIDC token that GitHub Actions automatically
issues on every workflow run.

## End-to-end diagram

```
┌─────────────────┐      ┌──────────────────────────┐      ┌────────────┐
│  GitHub Actions │ OIDC │ /api/deploy of Physalis  │ SSH  │   VPS      │
│   workflow.yml  │─────▶│ - verifies OIDC token    │─────▶│ /srv/...   │
│                 │      │ - lookup Policy          │      │            │
│                 │◀─────│ - returns bundle         │      │            │
└─────────────────┘      └──────────────────────────┘      └────────────┘
        │                                                         ▲
        │   POST .env + docker-compose + docker login + restart   │
        └─────────────────────────────────────────────────────────┘
```

## Prerequisites

Before configuring a workflow, you need **3 objects** in Physalis:

1. A **Server** at the organisation level (SSH key of the target VPS)
2. An **Environment** linked to that Server (with a `deployPath`)
3. A **Policy** that says *"repo X, on branch Y, can deploy to project P,
   environment E"*

## 1. Create a Server

> Permissions: ADMIN / OWNER of the org.

Organisation page → **"Servers"** tab → **"+ New server"**.

Fields:

| Field           | Description                                                                |
|-----------------|----------------------------------------------------------------------------|
| **Name**        | Internal label (e.g. "Hetzner prod VPS")                                   |
| **IP**          | IPv4 or hostname resolving the VPS                                         |
| **SSH user**    | The Linux user on the VPS side (typically `deploy` or `github-deploy`)     |
| **Private key** | The **full** SSH key (PEM, OpenSSH) — pasted only once                     |

> ⚠️ The **private key is never readable again** from the UI after
> creation — it is only used at runtime by `/api/deploy` to be included
> in the bundle. If you lose it, delete the Server and create a new one
> with a new key.

### Preparing the VPS on the SSH side

On the VPS, create the deployment user and authorise the public key:

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo -u deploy mkdir -p ~deploy/.ssh
sudo -u deploy bash -c 'echo "ssh-ed25519 AAAA... github-deploy" >> ~/.ssh/authorized_keys'
sudo -u deploy chmod 600 ~deploy/.ssh/authorized_keys
```

The `deployPath` (default `/srv/projets/<env>/<slug>`) must exist and
be owned by `deploy:deploy`.

## 2. Link the Environment to the Server

On the project page → environment → **Settings** → **Server** field.
Choose the server created in step 1, adjust the `deployPath` if needed
(otherwise the `defaultDeployPath` convention is applied).

See [Projects & environments](projets-et-environnements) for details.

## 3. Create a Policy

This is the **authorisation rule**: who (OIDC claims from the workflow)
can deploy where (Physalis project + env).

On the project page → **"Policies"** tab → **"+ New Policy"**.

Fields (all required, **strict match, no wildcards**):

| Field           | Example                          | Source                                         |
|-----------------|----------------------------------|------------------------------------------------|
| **Repo**        | `argo-web/physalis`              | GitHub `owner/repo`                            |
| **Workflow**    | `deploy.yml`                     | Workflow filename                              |
| **Branch**      | `main`                           | Branch the workflow runs from                  |
| **Environment** | `production`                     | An existing env in the project                 |

> The **"Edit"** button on an existing Policy lets you adjust the 4 fields
> (a collision is detected if another tuple already exists).

### What this means

When a workflow runs, GitHub issues an OIDC token containing claims such as:

```json
{
  "repository": "argo-web/physalis",
  "workflow_ref": "argo-web/physalis/.github/workflows/deploy.yml@refs/heads/main",
  "ref": "refs/heads/main",
  "audience": "vault.physalis.cloud"
}
```

Physalis verifies the signature against the GitHub JWKS, extracts
`(repository, workflow, branch)`, looks for a Policy that matches **exactly**,
and only triggers the deployment if the `(project, env)` combination
in the request body matches.

## 4. The template workflow

Copy [docs/deploy.modele.yml](https://github.com/physalis-cloud/physalis/blob/main/docs/deploy.modele.yml)
into `.github/workflows/deploy.yml` in your repo. Adapt the variables
at the top:

```yaml
env:
  VAULT_URL: https://vault.physalis.cloud
  VAULT_AUDIENCE: vault.physalis.cloud
  VAULT_PROJECT: physalis      # project slug in Physalis
  VAULT_ENV: main              # target env
```

The workflow contains **2 jobs**:

1. **build** — fetches its own OIDC token, retrieves `VITE_*` from
   Physalis, builds the Docker image passing `VITE_*` as `--build-arg`,
   pushes to GHCR
2. **deploy** — re-fetches the full bundle, writes `.env` + `docker-compose.yml`
   to the VPS via SCP, runs `docker compose pull && up -d`

### Workflow permissions

```yaml
permissions:
  id-token: write    # REQUIRED for core.getIDToken()
  contents: read
  packages: write    # to push to GHCR with GITHUB_TOKEN
```

## 5. Vite build args

Any environment secret prefixed with `VITE_` is retrieved in the `build`
job and passed to `docker build` as `--build-arg`.

In your frontend `Dockerfile`, declare the corresponding `ARG`s:

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

> ⚠️ Vite **inlines** `VITE_*` into the final JS bundle → public on
> the browser side. Reserve these for public URLs, feature flags, etc.
> See [Secrets & categories](secrets) for the full convention.

## 6. CI/CD connections (registry + redeploy)

The CI provider, OIDC issuer and infra credentials (redeploy token, private
registry access) live in a **CI/CD Connection** at the organisation level —
the **"CI/CD"** tab. Each project selects one in its Settings.

A connection holds:

| Field                 | Role                                                       |
|-----------------------|------------------------------------------------------------|
| Provider              | `github` \| `gitlab` \| `bitbucket`                        |
| OIDC issuer           | empty for github.com / gitlab.com; instance/workspace URL otherwise |
| Redeploy token        | PAT for the "Redeploy" button (dispatch)                   |
| Registry — URL        | defaults to `ghcr.io`                                       |
| Registry — user/token | for `docker login` on the VPS (private registry)           |

The registry creds are returned by `/api/deploy` under a separate `registry`
key, distinct from `secrets[]` — they do **not** pollute the container's
`.env`, they are only used for the remote `docker login`. Everything is
encrypted (AES-256-GCM) and never shown again.

> Migration: the old reserved `OrgSecret`s (`GITHUB_DISPATCH_TOKEN`,
> `REGISTRY_PAT/USER/URL`) are automatically converted into a "GitHub"
> connection on upgrade — nothing to re-enter.

## 7. First deployment

1. Push to `main` → the `deploy.yml` workflow starts
2. `build` job: fetches VITE_*, builds the image, pushes to GHCR
3. `deploy` job: fetches the bundle, writes `.env` + `docker-compose.yml`
   to the VPS, runs `docker compose up -d`
4. Check the Physalis **audit log** (org page) → you will see
   `DEPLOY_AUTHORIZED` with the details (repo, workflow, branch, env)

### In case of failure

The Physalis audit log records `DEPLOY_DENIED` with a diagnosable reason:

| `reason`               | Likely cause                                                       |
|------------------------|--------------------------------------------------------------------|
| `wrong_audience`       | `VAULT_AUDIENCE` in the workflow ≠ `OIDC_AUDIENCE` in Physalis     |
| `wrong_issuer`         | The token's issuer is unknown / unsupported                        |
| `untrusted_issuer`     | Dynamic issuer (self-hosted GitLab / Bitbucket) not registered in a connection |
| `expired`              | The job ran too long before calling `/api/deploy`                  |
| `policy_not_found`     | No Policy matches `(repo, workflow, branch)`                       |
| `policy_match_failed`  | Policy found but `(project, env)` in the body does not match       |
| `no_server`            | The env exists but is not linked to any Server                     |

## "Redeploy" button (workflow_dispatch)

If you want to trigger a redeployment **from the Physalis UI** without
a push, set the **redeploy token** on the project's CI/CD connection
(org "CI/CD" tab — a PAT with `repo` scope or a GitHub App token) and the
**"Redeploy"** button will appear on each environment. (GitHub only for now.)

On click, Physalis calls `POST /repos/{owner}/{repo}/actions/workflows/{wf}/dispatches`
which triggers the `redeploy.yml` workflow on the environment's branch.
This workflow **does not rebuild images** — it re-fetches the `.env` bundle,
writes it to the VPS, and restarts the containers via `docker compose up -d`.
This is sufficient for secrets loaded at runtime (environment variables,
keys passed via `.env`).

Copy [docs/redeploy.modele.yml](https://github.com/physalis-cloud/physalis/blob/main/docs/redeploy.modele.yml)
into `.github/workflows/redeploy.yml` in your repo and adapt the variables
at the top of the file.

> **Secrets injected at build time** (e.g. `VITE_*`) — If your secret is
> passed as a Docker `--build-arg` during the image build, a simple redeploy
> is not enough. You need to trigger the full build workflow (`deploy.yml`).
> Physalis handles this automatically via the **"Full build required"** option
> in the secret's rotation configuration (see [Secret rotation](rotations)).

## GitLab CI/CD & Bitbucket Pipelines

The same `/api/deploy` accepts OIDC tokens from **GitLab CI/CD** and
**Bitbucket Pipelines**. All the infra (Server, Environment, SSH + secrets +
compose bundle) is identical — only the connection provider, the repo format
and the trigger change.

**Setup:**

1. Create a **CI/CD connection** (org "CI/CD" tab) of the right provider:
   - **GitLab** — empty issuer for gitlab.com, or the instance URL for
     self-hosted (e.g. `https://gitlab.mycompany.com`).
   - **Bitbucket** — issuer = the workspace OIDC URL (Workspace settings →
     OpenID Connect), **required**.
2. Link the project to that connection and set its **repo**:
   - GitLab: the `project_path` (e.g. `acme/web`, `acme/team/web`).
   - Bitbucket: the `repositoryUuid` (Repository settings, in braces).
3. Create your **Policies**. The 3rd dimension is no longer a workflow file
   but the **CI environment** declared by the job:

| Provider  | repo (policy)     | "workflow" (policy) =   | branch        |
|-----------|-------------------|-------------------------|---------------|
| GitHub    | `owner/repo`      | `*.yml` file            | `ref`         |
| GitLab    | `project_path`    | `environment: name:`    | `$CI_COMMIT_BRANCH` |
| Bitbucket | `repositoryUuid`  | `deployment:`           | `branchName`  |

4. Copy the matching template and adapt the variables at the top:
   - GitLab: [docs/deploy.gitlab-ci.modele.yml](https://github.com/physalis-cloud/physalis/blob/main/docs/deploy.gitlab-ci.modele.yml)
   - Bitbucket: [docs/deploy.bitbucket-pipelines.modele.yml](https://github.com/physalis-cloud/physalis/blob/main/docs/deploy.bitbucket-pipelines.modele.yml)

> **Audience** — GitHub & GitLab: the token's `aud` must match the vault's
> `OIDC_AUDIENCE`. Bitbucket does not allow configuring the OIDC `aud`, so
> Physalis does not require it for that provider; scope is bounded by the
> workspace issuer (registered in the connection) + the `repositoryUuid` +
> the branch.

## Going further

- [Secrets & categories](secrets) — how your `VITE_*` and other env
  variables end up in the bundle
- [Organisations & roles](organisations-et-roles) — who can manage
  Servers and Policies
