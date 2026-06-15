---
title: Outbound sync
order: 13
icon: RiUploadCloud2Line
summary: Automatically push an environment's secrets to a cloud platform's environment variables (Vercel, Render, Railway) on every change.
---

# Outbound sync

**Outbound sync** pushes a Physalis environment's secrets to the **environment
variables** of a cloud platform (Vercel, Render, Railway), automatically **on
every change** to a secret.

It is the **opposite** of [OIDC deployment](07-oidc-deployment):

| | OIDC deployment | Outbound sync |
|---|---|---|
| **Who hosts the app** | your VPS | the platform (Vercel/Render/Railway) |
| **Direction** | the platform asks, Physalis answers | Physalis pushes to the platform |
| **Physalis role** | provides secrets **and** deploys | **feeds** secrets; the platform deploys |

You use one **or** the other for a given app — not both.

## How it works

- **Physalis is the source of truth.** It pushes its secrets to the platform; it
  **never** reads back. A variable created by hand on the platform does **not**
  appear in Physalis.
- Sync is **one-way** and **automatic**: every create / update / delete / rotation
  of a secret triggers a push.
- An **initial sync** runs as soon as the target is created.

## Setup — 2 steps

### 1. Connection (organization level)

In **Organization → CI/CD tab → New connection**, pick the sync provider and enter
its **token** (encrypted, never shown again — *write-only*):

| Provider | Token to provide | Where to create it |
|---|---|---|
| **Vercel** | Access token | Account Settings → Tokens (+ *Team ID* if the project is in a Team) |
| **Render** | API key | Account Settings → API Keys |
| **Railway** | **Account / Workspace token** | Account Settings → Tokens |

> ⚠️ **Railway**: use an **account token** (or workspace), **not** a *project token*
> (the latter uses a different header and would be rejected).

A connection is **shared** by all projects in the organization. Restricted to
**ADMIN_DEV+** roles.

### 2. Target (environment level)

In a **project → an environment → Sync subtab → New target** (restricted to the
project **OWNER** role):

1. pick the **connection**;
2. the **picker** lists the resources the token can access:
   - **Vercel**: the Vercel **project** + the **target environments** (production /
     preview / development, checkboxes);
   - **Render**: the **service**;
   - **Railway**: cascading **project → environment → service**;
3. (optional) a **tag filter**: only push secrets carrying at least one of these
   tags. Empty = **all** secrets in the environment.

> The **Sync** subtab only appears if the organization has at least one sync
> connection.

## Behavior per platform

### Vercel
- Variables pushed as type **`encrypted`** (encrypted at rest, readable by
  builds/functions, compatible with dev/preview/production).
- **Upsert**: idempotent create + update.
- **Reconciled deletion**: a secret deleted in Physalis is removed on Vercel.
  Physalis only touches the variables it manages (marked with a `physalis-sync`
  comment) → **your manual Vercel variables are preserved**.

### Render & Railway — full replacement
- These platforms **replace the entire** variable set of the service in one call.
- Consequence: **Physalis becomes the source of truth for the service** — a
  variable set by hand on the platform and **absent** from Physalis will be
  **removed** on the next push. A warning is shown when creating the target.
- Railway **automatically redeploys** the service on every variable change.

## Monitoring & operations

- **Status**: each target shows `synced <date>` (green) or the last sync error
  (`lastSyncError`, sanitized message).
- **Manual resync**: *Resync* button on the target (re-pushes the current state).
- **Target deletion**: on deletion, you can request **cleanup of the remote
  variables** managed by Physalis (offboarding).
- **Reconciliation cron** (optional): an `/api/cron/sync-reconcile` endpoint
  re-pushes targets in error (after a transient platform incident). Trigger it
  periodically (e.g. via n8n, every 30 min).

## Security

- **Write-only token**: the platform token is never shown again nor readable once
  saved (AES-256-GCM encrypted).
- **Bounded scope**: you can only target resources the token already owns (the
  picker lists them via the platform API).
- **Tag filter** to avoid pushing backend secrets to a frontend platform.
- **Source of truth**: a change made directly on the platform to a
  Physalis-managed variable will be **overwritten** on the next push.

## Limitations

- **One-way** sync (Physalis → platform). No import from the platform.
- On **Render** and **Railway**, Physalis owns the entire variable set of the
  targeted service (bulk replacement).
