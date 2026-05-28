---
title: Shares
order: 6
icon: RiShareForward2Line
summary: One-time link vs. encrypted external request (ECDH).
---

# Shares

The **📤 Shares** menu covers two distinct flows for securely exchanging
secrets with people **outside** Physalis (clients, contractors, candidates…)
— or even with yourself (transferring from one device to another).

| Flow                    | Direction           | Use case                                              |
|-------------------------|---------------------|-------------------------------------------------------|
| **My shares**           | You → third party   | You send a secret to someone                          |
| **External requests**   | Third party → you   | You ask someone to send **you** a secret              |

Both flows work **without a Physalis account** on the recipient /
sender side. All encryption is performed in the browser.

## My shares (one-time link)

Pattern similar to **Bitwarden Send / OneTimeSecret / Privnote**: you
enter a secret, you get a unique encrypted link that you send via your
usual communication channel (email, Slack, Signal…). The recipient
clicks, reads the secret, and that's it.

### Create a share

1. On `/shares`, **"My shares"** tab (default).
2. Click the **"📤 Create a share"** button in the tab bar.
3. Fill in:
   - **Label** — visible only in your dashboard to identify the share
     (never transmitted to the recipient)
   - **Content** — the secret to share (free text)
   - **TTL (time to live)** — 1h, 24h, 7 days, 30 days
   - **Destruction mode** — *one-shot* (destroyed after the 1st read)
     or *expiration* (destroyed at the deadline, regardless of the number
     of reads)
   - **Recipient email** *(optional)* — Physalis will send a notification
     email via Mailgun with the link
4. Submit. The generated link looks like:
   ```
   https://<your-slug>.physalis.cloud/share/abc123#XXXXXXXXXXXX
   ```
   - The segment **after the `#`** is the **decryption key** — it is
     **never sent to the Physalis server** (URL fragments stay in the
     browser)
   - Without this key, the ciphertext stored in the DB is unusable

### The recipient reads the secret

They click the link. The page:

1. Fetches the ciphertext from Physalis using the path segment (`abc123`)
2. Retrieves the key from the URL fragment (`#XXXXX...`)
3. Decrypts in the browser and displays the content

If the share was in **one-shot** mode, it is immediately **destroyed
in the DB** after this read. Any subsequent access attempt returns 410 Gone.

### Revoke a share before expiration

In your shares list → click the **"Revoke"** button. The ciphertext
is immediately deleted from the DB and the link becomes unusable.

## External requests (SecretRequest, ECDH)

The reverse use case: **you want a client / contractor to send you a
secret** (a password, an API key…) without them having to create a
Physalis account or use an insecure channel.

This is the **External requests** flow, which uses **ECDH P-256 + AES-GCM**
encryption entirely in the browser — Physalis **never** sees the secret
in plaintext, not even briefly.

### Create a request

1. On `/shares`, **"External requests"** tab.
2. Click the **"+ Authorise an external share"** button in the tab bar.
3. Fill in:
   - **Label** — describes what you expect (e.g. "Admin OVH password for
     client X")
   - **Recipient email** — the third party you send the link to
   - **TTL** — how long the third party can submit
   - **(option) Import into a Secret** — select a project + environment +
     key to allow one-click import after decryption
4. Submit. Physalis generates:
   - An **ECDH P-256 key pair** in **your browser**
   - The **public key** is sent to Physalis and associated with the
     request
   - The **private key** is shown to you **only once** — copy it into
     your personal vault (a dedicated entry is recommended)
5. An email is sent to the recipient with a link
   `https://<your-slug>.physalis.cloud/request/<token>`.

### The recipient submits the secret

On the public page:

1. Enters the secret in a password input
2. The browser **generates an ephemeral key pair**, derives a shared ECDH
   secret using the request's public key, and encrypts the secret using
   AES-GCM
3. Sends to Physalis: ciphertext + IV + ephemeral public key
4. The ephemeral private key is **destroyed** in the browser

Physalis stores these 3 elements — **unusable without your private key**.

### You reveal the secret

Back on `/shares`, **"External requests"** tab, your request now shows
the **"Submitted"** status. Click **"Reveal"**:

1. A dialog asks you to **paste your private key**
   (the one copied at step 4 of creation)
2. The browser performs the reverse ECDH operation, decrypts, and displays
   the secret
3. Available buttons:
   - **📋 Copy** to clipboard
   - **"Import → env / key"** — if you configured auto-import at creation,
     writes the secret into the corresponding `Secret` in one click

> 🔐 The private key is **never sent to Physalis** — you can verify in the
> network inspector that the `/reveal` request only retrieves ciphertext +
> IV + ephemeralPublicJwk.

### Revoke a request

If the third party takes too long or you change your mind, click **"Revoke"**
on the request. The recipient receives a 410 Gone error if they try to
submit again.

## Going further

- [Vaults](coffres) — where to durably store the private key of a
  SecretRequest so you can decrypt it later
- [Getting started](premiers-pas) — for the recipient wondering what this
  Physalis link they just received is
