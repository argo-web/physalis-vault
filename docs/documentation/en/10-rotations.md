---
title: Secret rotation
order: 10
icon: RiRefreshLine
summary: Understand and configure automatic or assisted renewal of sensitive secrets.
---

# Secret rotation

**Rotation** is the mechanism by which Physalis periodically renews the
value of a secret — either automatically, or by reminding the team that
a manual action is required.

Each secret can be assigned a **rotation strategy** and a **frequency**
(in days). A cron job runs every hour and triggers rotations whose due
date has passed.

## Prerequisites

Rotation is an **opt-in feature** at the organisation level. An org
**ADMIN** or **OWNER** must enable it in the settings before it can be
configured on individual secrets.

Rotation also stops if the **project is paused** (see
[Pause a project](#pausing-a-project)).

## Available strategies

### `DATABASE` — database password rotation

Physalis delegates the rotation to an **N8n** workflow via webhook. The
workflow generates a new password, changes it on the database, then calls
the **Physalis callback** to confirm success or failure.

Required fields on the secret:

| Field        | Description                                       |
|--------------|---------------------------------------------------|
| `dbType`     | `POSTGRESQL`, `MYSQL` or `MONGODB`                |
| `dbHost`     | Database server hostname                          |
| `dbPort`     | Port (e.g. `5432` for PostgreSQL)                 |
| `dbName`     | Database name                                     |
| `dbUser`     | User whose password will be rotated               |

If the organisation has a `GITHUB_DISPATCH_TOKEN` in its OrgSecrets and
the project has a `githubRepo` configured, Physalis automatically triggers
a redeployment via GitHub Actions after the rotation.

> ⚙️ The server environment variable `ROTATION_N8N_WEBHOOK_URL` must
> point to the dedicated N8n webhook.

### `JWT_SECRET` — JWT secret rotation

Physalis itself generates a new **128-character hexadecimal secret**
(64 random bytes), encrypts the new value, creates a history version
of the old one, then updates the secret — entirely **without external
intervention**.

If the project is linked to a GitHub repository with a `GITHUB_DISPATCH_TOKEN`,
a redeployment is triggered automatically so the containers reload the
new value.

> This strategy is **fully autonomous**: no N8n workflow is required.
> It is the recommended strategy for `JWT_SECRET`, `NEXTAUTH_SECRET`,
> and similar secrets.

### `API_KEY` — API Gateway key rotation

Physalis automatically generates a new key in the project's **API Gateway**,
updates the secret value, revokes the old key **immediately**, then triggers
a GitHub Actions redeployment so the application reloads the new value
from the vault.

Prerequisites:

- The project must have at least one **API** configured in the
  **API Gateway** tab.
- The secret must be **linked to an existing API key** — select the API
  and the key when configuring the rotation.

> ⚠️ **This strategy only applies to applications that read their `.env`
> from the vault on startup** (via a GitHub Actions redeployment). If the
> key was copied directly into n8n, Make or another external tool, you
> will need to update it manually after each rotation.

After each rotation:

- The new raw key is stored encrypted in the secret (the old value is
  archived in versioning).
- The old key is revoked on the Gateway side: any call to
  `/api/gateway/verify` with the old key returns `{ valid: false,
  reason: "revoked" }` **immediately** (REMOTE mode).
- If the project is linked to a GitHub repository and `GITHUB_DISPATCH_TOKEN`
  is configured, a redeployment is triggered automatically.

### `REMINDER` — manual rotation reminder

Physalis **does not** perform the rotation itself. It sends an email to
the organisation **ADMIN or OWNER** asking them to renew the secret
manually in the relevant third-party service.

Once the rotation is done outside Physalis, the member must click
**"Mark as rotated"** in the UI (or call the endpoint
`/rotation/mark-rotated`) to reset the counter and schedule the next
due date.

> Suitable for third-party secrets for which you have no automatable
> webhook: API keys, certificates, shared passwords…

## N8n callback authentication

For the `DATABASE` strategy, N8n receives a `rotationToken` in the
initial payload and must send it back in the callback. This token is an
**HMAC-SHA256** computed as follows:

```
window = floor(timestamp_ms / 3_600_000)   // current hour as integer
token  = "<window>.<HMAC-SHA256(secretId + "|" + window, ROTATION_HMAC_KEY)>"
```

The token is **valid for 2 hours** (window ±1 hour around the issue
time). The HMAC key is configured via the `ROTATION_HMAC_KEY` environment
variable.

> ⚠️ Change `ROTATION_HMAC_KEY` from its default value in production.

## Cron engine

A cron job **every hour** selects secrets satisfying:

- `rotationEnabled = true`
- `rotationNextAt ≤ NOW()`
- project not paused (`rotationPaused = false`)
- feature enabled on the organisation (`rotationFeatureEnabled = true`)
- client status `ACTIVE` or `TRIAL`

Each eligible secret goes through `triggerRotation()`. Network errors
(N8n webhook unreachable) are silent — the rotation will be retried on
the next hour.

## Configuring rotation on a secret

> Permissions: **EDITOR** or above on the project.

1. Open a secret → **"Rotation"** tab.
2. Enable rotation and choose a **strategy**.
3. Enter the **interval in days** (1–3,650).
4. For `DATABASE`, fill in the connection details.
5. Save. `rotationNextAt` is calculated immediately: `NOW + intervalDays`.

## Force an immediate rotation

An **EDITOR** can trigger rotation outside the cron cycle using the
**"Force rotation"** button (or `POST /rotation/force`). The action is
audited (`SECRET_ROTATION_FORCED`).

## Pausing a project

A project **OWNER** can suspend all rotations for the project without
disabling them secret by secret:

```http
PATCH /api/projects/<slug>/rotation/pause
{ "paused": true }
```

Useful before a maintenance window or a release freeze.

## States and tracking

| Field                | Possible values            | Description                                        |
|----------------------|----------------------------|----------------------------------------------------|
| `rotationLastStatus` | `success`, `error`, `null` | Result of the last rotation                        |
| `rotationErrorCount` | integer                    | Number of consecutive failures (reset to 0 on success) |
| `rotationLastAt`     | datetime                   | Date of the last successful rotation               |
| `rotationNextAt`     | datetime                   | Next scheduled run                                 |

An email notification is sent to the **ADMIN/OWNER** on the **first
consecutive failure** of a `DATABASE` rotation. Subsequent failures do
not generate additional emails to avoid spam.

## Value history

During a `JWT_SECRET` rotation, the old value is automatically archived
in the secret's **versioning** (50 versions max, then FIFO purge). See
[Secrets & categories](secrets-categories) for how versioning works.
