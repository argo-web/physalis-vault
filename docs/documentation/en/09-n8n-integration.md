---
title: N8n Integration
order: 9
icon: RiFlowChart
summary: Connect your N8n workflows to Physalis with the official node — secrets, services and accounts accessible on demand, without duplication.
---

# N8n Integration

The community N8n node `n8n-nodes-physalis` lets your workflows read
secrets, services and application accounts stored in your Physalis vault
— without duplicating credentials in N8n.

**Benefits:**

- If a password changes in Physalis, the workflow uses it automatically
  on the next run.
- No secret stored in plaintext in the N8n database.
- Every access is traced in the Physalis audit log (`INTEGRATION_CREDENTIALS_FETCH`).
- Instant token revocation = immediate access termination.

## Installing the node in N8n

1. In your N8n instance: **Settings → Community Nodes → Install**.
2. Paste the package name: `n8n-nodes-physalis`.
3. Click **Install**.

The **Physalis** node then appears in the node picker (under the
*Development* category).

> ℹ️ N8n hosted on n8n.cloud: community nodes are not available in SaaS
> mode. Self-hosting required.

## Choosing the right token type

Physalis offers **3 types** of bearer tokens compatible with this node.
Choose the one that matches your use case:

| Token | Prefix | Scope | Survives creator leaving? | Recommended for |
|---|---|---|---|---|
| **OrgToken** | `sv_org_…` | 1 organisation, explicit scopes + authorised projects | ✅ yes (`createdBy SetNull`) | **Long-lived institutional workflows** (production) |
| **UserToken** | `sv_user_…` | 1 user, access to projects they are a member of | ❌ no (revoked if user is deleted) | Personal workflows / prototyping |
| **MachineToken** | `sv_…` | 1 specific project + 1 specific environment | ✅ yes (tied to project) | Legacy CI/CD, non-GitHub integrations |

> 💡 **Recommendation**: for a production N8n workflow, use an **OrgToken**.
> It survives when a team member leaves — your workflows won't break when
> someone exits the org.

## Create an OrgToken

Reserved for **OrgADMIN** or **OrgOWNER**.

1. Go to **Organisation → Tokens** (tab visible only for ADMIN+ roles).
2. Click **+ New token**.
3. Fill in:
   - **Name**: descriptive label, e.g. `N8n - Voyages prod`.
   - **Scopes**: check only the ones needed:
     - `PROJECTS_LIST` (required for dynamic dropdown loading)
     - `SECRETS_READ` if you read environment secrets
     - `SERVICES_READ` if you read external services
     - `ACCOUNTS_READ` if you read application accounts
   - **Authorised projects**: check the specific projects. **Avoid** the
     "All current and future projects" checkbox unless required
     (a confirmation dialog is shown).
   - **Expiration**: `1 year` recommended for automation tokens.
4. Copy the displayed token — **it will never be visible again after
   closing the dialog**.

## Create a UserToken (alternative)

For personal or rapid-prototyping workflows:

1. Go to **Settings → Security → Integration tokens**.
2. **+ Create a token**, give it a name, choose an expiration.
3. Copy the token.

## Configure the N8n credential

In N8n: **Credentials → New → Physalis API**.

Fill in:

| Field | Value |
|---|---|
| **Vault URL** | URL of your Physalis instance, e.g. `https://argoweb.physalis.cloud` (no trailing slash) |
| **Bearer Token** | The raw token copied in the previous step |

Click **Test**: should respond OK even if the project list is empty.

> 💡 You can create multiple Physalis credentials — for example one per
> environment (`Physalis Voyages prod`, `Physalis Voyages staging`).

## Supported operations

### Get Credentials

Retrieves secrets, services or accounts for a project, with optional filters.

| Field | Description |
|---|---|
| **Project** | Selects the project (loaded dynamically from the API) |
| **Type** | `secret` (env vars) · `service` (Stripe, Mailgun, …) · `account` (test/admin application account) |
| **Environment** | Required if `type=secret`. E.g.: `production`, `staging` |
| **Tag** | Filter by technical tag (e.g.: `postgres`, `stripe`). List loaded dynamically. |
| **Key** | Exact key filter (case-sensitive) — for secrets only |

**Output**: 1 N8n item per credential found. Format by type:

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

Lists the projects accessible to the token, along with their environments.
Useful for dynamic workflows that iterate over multiple projects
(e.g. cross-project audit).

```json
{ "slug": "voyages", "name": "Voyages", "role": "VIEWER",
  "environments": [{ "name": "production", "url": "https://app.voyages.fr" }] }
```

## Workflow examples

### Automatic PostgreSQL connection

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
   credentials: extracted from value
```

If the DB password changes in Physalis, the workflow automatically uses
the new one on the next run.

### Sending email via Mailgun

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

### Cross-project audit (scheduled rotation)

```
[Daily Cron]
   ↓
[Physalis: List Projects]
   ↓ (output: 1 item per project)
[Physalis: Get Credentials]
   project: {{ $json.slug }}
   type: secret
   env: production
   key: DATABASE_PASSWORD
   ↓
[Function: detect passwords > 90 days]
   ↓
[Slack: alert]
```

## Security limits

- **Read-only in V1**. No writes are possible via the node
  (no `POST /api/integrations/secrets`). For automatic rotation, use the
  future Physalis SDK (backlog) or a custom script with a dedicated token.
- **OrgSecrets** (`GITHUB_DISPATCH_TOKEN`, `REGISTRY_PAT`,
  `REGISTRY_USER`…) are **never** accessible via this node —
  by design. These keys are reserved for build/deploy infrastructure.
- **HTTPS required**. Never use this node with an `http://` URL.

## Operational security

Apply to your N8n instance:

- **Strict HTTPS** on the N8n instance itself
- **2FA enabled** on N8n admin accounts
- **Encrypted backup** of the N8n database (credentials are encrypted
  in the database but the encryption key is in the N8n config)
- **Immediate revocation** of the Physalis token if the N8n instance is
  compromised (from Org → Tokens → "Revoke" button)
- **One token per N8n instance** — never share the same token between
  dev/staging/prod or between multiple teams

## Audit log

All accesses via the node are traced in Physalis:

- **Action**: `INTEGRATION_CREDENTIALS_FETCH` (1 entry per call, not per item)
- **Metadata**: `{ tokenKind, type, tag, keyFilter, count }`
- **Actor**: `kind: "user"` if UserToken, `kind: "token"` (with
  `tokenId` + `tokenName`) if OrgToken or MachineToken

Visible in **Organisation → Audit** or **Project → Audit**.

## Links

- 📦 npm package: [n8n-nodes-physalis](https://www.npmjs.com/package/n8n-nodes-physalis)
- 🐙 Source: [github.com/argo-web/physalis-n8n-nodes](https://github.com/argo-web/physalis-n8n-nodes)
- 🐛 Issues: [github.com/argo-web/physalis-n8n-nodes/issues](https://github.com/argo-web/physalis-n8n-nodes/issues)
- 📚 N8n Community Nodes: [docs.n8n.io/integrations/community-nodes](https://docs.n8n.io/integrations/community-nodes/)
