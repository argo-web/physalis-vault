---
title: Browser extension
order: 8
icon: RiPuzzle2Line
summary: Auto-fill, auto-save, TOTP for third-party sites from your Physalis vault.
---

# Browser extension

The Physalis extension (Chrome / Firefox) connects your vaults to the web:
auto-fill credentials on visited sites, auto-save when you create an account,
and automatic TOTP code generation for third-party sites.

> 🚧 **Status**: the **backend** is shipped and stable. The extension's
> **front-end** (Chrome / Firefox) is being finalised —
> some features described below are already available, others are on their way.
> Refer to the installation prompt shown in the dashboard for the version
> currently available.

## Prerequisites

- **TOTP 2FA enabled** on your Physalis account (required for extension
  authentication — see [Getting started](premiers-pas))
- A **valid session** in Physalis (prior login from your browser at
  `<your-slug>.physalis.cloud`)

## Installation

The **installation prompt** appears in your Physalis dashboard when the
extension is not detected: a banner at the top of the page offers the
installation link for Chrome or Firefox.

> 💡 The extension automatically detects Physalis via a DOM event —
> no manual configuration needed; the prompt disappears as soon as it
> is installed.

## Extension authentication

On first use, the extension asks for:

1. Your Physalis **email** + **password**
2. A **6-digit TOTP code** (from your auth app or your personal vault)
3. **Session TTL**: 1h, 4h or 8h

After the chosen TTL, the extension automatically logs out and asks for
email + password + TOTP again. Choose 1h on a shared machine, 8h on
your personal laptop.

> 🔒 Extension sessions are **separate** from your web session. Tokens
> are SHA-256 hashed server-side — Physalis never stores the token in
> plaintext, not even briefly.

### Managing extension sessions

In Physalis: `/settings/security` → **"Extension sessions"** section.
You can see the list of active sessions (user-agent, date, remaining TTL)
and revoke any of them using the **"Revoke"** button. Useful if you
forget to log out on a machine.

## Features

### Credential auto-fill

On a site with a login form, the extension:

1. Detects `<input type="email">`, `<input type="password">`,
   `autocomplete="username"` fields
2. Searches your 3 vault sources (personal + org team + project team) for
   an entry whose URL matches the domain
3. Displays an **icon** in the field → click → choose from available
   credentials → auto-fill

### Auto-save for a new account

When you submit a registration form, the extension:

1. Detects the fields and the entered value
2. Displays a non-intrusive **Shadow DOM banner**: *"Save these credentials
   in Physalis?"*
3. On click, offers a **destination**:
   - Personal vault
   - A team collection (org or project)
4. Saves via `POST /api/plugin/vault` (audited in Physalis with the
   `plugin_autosave` origin)

> A **domain blocklist** (configurable in the extension) prevents the
> prompt from appearing on sites where you never want to save credentials
> (intranet, test environments, etc.).

### TOTP for third-party sites

If a vault entry contains an `otpauth://` key, the extension detects
`autocomplete="one-time-code"` fields on the site and offers **auto-fill
of the 6-digit code** with no manual copy-pasting.

The code is regenerated every 30 seconds per RFC 6238, computed
**locally** by the extension (Web Crypto API) — the TOTP key never leaves
your browser.

See [Vaults](coffres) for storing the `otpauth://` key when enabling 2FA
on a third-party site.

## Extension security

| Guarantee                                                      | Mechanism                                  |
|----------------------------------------------------------------|--------------------------------------------|
| Physalis password never leaves the browser in plaintext        | Bcrypt server-side                         |
| Session token hashed in DB                                     | SHA-256, never read back in plaintext      |
| Extension origin whitelisted                                   | `PLUGIN_ALLOWED_ORIGIN` (strict CORS)      |
| Auth rate limit                                                | 5 attempts / 15 min / IP                   |
| Auto-save rate limit                                           | 30 / min / user                            |
| Full audit                                                     | Every match / save traced in the audit log |

## Going further

- [Vaults](coffres) — where the entries the extension uses live
- [Getting started](premiers-pas) — enable 2FA, extension prerequisites
