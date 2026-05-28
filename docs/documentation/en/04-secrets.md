---
title: Secrets & categories
order: 4
icon: RiKey2Line
summary: Create, organise, and read the encrypted environment variables of a project.
---

# Secrets & categories

**Secrets** are the encrypted environment variables injected into your
application at deployment. They are scoped to a specific **environment**
of a project (e.g. the `production` environment of the `physalis` project).

Each secret is:

- **Encrypted at rest** in AES-256-GCM with a key managed by Physalis
  (never stored in plaintext in the DB)
- **Decrypted only** at the time of an authorised call (UI, machine
  token, OIDC GitHub Actions)
- **Audited** — every read / write / delete is traced in the
  organisation's audit log

## Anatomy of a secret

| Field          | Description                                                      |
|----------------|------------------------------------------------------------------|
| **Key** (`key`) | The name of the env variable (e.g. `DATABASE_URL`, `STRIPE_SECRET`). Convention: UPPER_SNAKE_CASE |
| **Value**      | The encrypted value — entered in a password input, never shown by default |
| **Category**   | One of the predefined categories (see below) or "Uncategorised" |
| **Note**       | Optional description (visible only in the dashboard, never in the `.env`) |

## Available categories

Physalis enforces a **closed list** of categories to ensure consistent
organisation across all projects. The display order in the dashboard is fixed:

1. **🔌 Ports** — `PORT`, `HOST`, `BIND_ADDRESS`…
2. **🗄 Database** — `DATABASE_URL`, `DB_PASSWORD`, `REDIS_URL`…
3. **🔐 Auth** — `JWT_SECRET`, `NEXTAUTH_SECRET`, `OAUTH_CLIENT_SECRET`…
4. **🌐 Services** — third-party API keys (`STRIPE_SECRET`, `SENTRY_DSN`,
   `OPENAI_KEY`…)
5. **📧 Email** — `MAILGUN_API_KEY`, `SMTP_PASSWORD`, `RESEND_KEY`…
6. **🏗 Infra** — runtime-related variables (`NODE_ENV`, `LOG_LEVEL`,
   `MAX_UPLOAD_MB`…)
7. **🎨 Application** — app-specific functional variables
   (`FEATURE_FLAG_X`, `MAINTENANCE_MODE`…)
8. **❓ Uncategorised** — fallback if none of the above fits

> 💡 The category has **no effect** on runtime behaviour — it only
> affects how things are displayed in the UI. You can always put a
> secret in "Uncategorised" if you are unsure.

## Create a secret

> Permissions: **EDITOR** or **OWNER** on the project (org DEV is
> implicit EDITOR, org ADMIN/OWNER is implicit OWNER).

1. Go to `/projects/<slug>` → click on an environment tab.
2. **"Secrets"** section → **"+ Add"** button.
3. Fill in:
   - **Key** — will become the env variable (`MY_VARIABLE`)
   - **Value** — pasted from your source (token, password…)
   - **Category** — pick from the list
   - **Note** *(optional)* — context for your teammates
4. Submit. The secret is **immediately encrypted** and stored in the DB.

## Read / reveal a secret

In the secret list for an environment, click the **👁 icon** next to
the key to reveal the value. It stays visible for 30 seconds then
automatically masks itself again.

> Each reveal is **audited** (action `SECRET_READ` in the audit log)
> with the member's identity, IP address, and user-agent.

**📋 Copy** button: copies to the clipboard without revealing on screen.

## Edit or delete a secret

- **Edit** — ✏️ icon → edit the value, note, or category.
  The key cannot be renamed (create a new one and delete the old one
  if needed).
- **Delete** — 🗑 icon → confirmation required. **Irreversible.**

## Physalis reserved conventions

Some keys have a **special role** in Physalis and activate features
when present. They live in the organisation's **OrgSecrets**
(not in a project environment):

| Key                       | Scope     | Role                                                                 |
|---------------------------|-----------|----------------------------------------------------------------------|
| `GITHUB_DISPATCH_TOKEN`   | OrgSecret | Enables the **"Redeploy"** button on an environment (triggers `workflow_dispatch`) |
| `REGISTRY_PAT`            | OrgSecret | Token for `docker login` to a private registry during OIDC deployment |
| `REGISTRY_USER`           | OrgSecret | Username associated with the registry PAT                            |
| `REGISTRY_URL`            | OrgSecret | Private registry URL (defaults to `ghcr.io` if absent)              |

### `VITE_*` prefix for build args

Any environment secret prefixed with `VITE_` is automatically injected
as a **`--build-arg`** in `docker build` by the template OIDC workflow
(see [OIDC Deployment](oidc-deployment)).

> ⚠️ Vite **inlines** `VITE_*` values into the final JS bundle — they
> are therefore **public** on the client side. **Never** put a real secret
> (private API key, server token) in a `VITE_*` variable. Reserve this
> prefix for public URLs, feature flags, etc.

## Machine reads

Secrets are read in production by your application via two mechanisms:

1. **OIDC GitHub Actions workflow** *(recommended)* — no stored token,
   authentication via GitHub signature. Reads the full bundle
   (secrets + sshKey + dockerCompose). See [OIDC Deployment](oidc-deployment).
2. **Bearer machine token** *(legacy, supported)* — a static token
   (`sv_<64hex>`) called via `GET /api/secrets/<slug>/<env>`. Useful for
   cron scripts or integrations without GitHub.

## Go further

- [Vaults](vaults) — for credentials that are not `.env` variables
  (admin passwords, non-runtime databases…)
- [OIDC Deployment](oidc-deployment) — how these secrets reach
  your container in production
- [Shares](shares) — to send a secret to a third party on a one-off basis
