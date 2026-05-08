# Secret vault - Audit de sécurité

> Audit initial réalisé le 2026-05-01.
> Mise à jour 2026-05-02 : refonte post-Megalodon (OIDC) + backup chiffré GPG livrés.
> État de la mise en œuvre par rapport au spec section 9 « Points de sécurité critiques ».

---

## 1. Synthèse

| Domaine | État | Note |
|---|---|---|
| Chiffrement des secrets | ✅ Conforme | AES-256-GCM, IV unique par secret, auth tag vérifié. Mêmes garanties pour les clés SSH des serveurs (`Server.encryptedKey`), les secrets 2FA, les services & comptes |
| Stockage mots de passe | ✅ Conforme | bcrypt salt factor 12 |
| Stockage tokens machine | ✅ Conforme | SHA-256(token) en base, jamais en clair |
| Headers HTTP | ✅ Conforme | X-Frame-Options, HSTS, Permissions-Policy, etc. |
| Réseau base de données | ✅ Conforme | DB sur réseau Docker `internal: true` en prod |
| RBAC | ✅ Conforme | VIEWER < EDITOR < OWNER, vérifié sur chaque route ; OrgRole MEMBER < ADMIN < OWNER |
| Logs (stdout) | ✅ Conforme | Aucune valeur de secret/mdp/token dans les logs |
| Audit log persistant | ✅ Conforme | Table `AccessLog` peuplée sur toutes les actions sensibles, exportable CSV |
| CSRF (web) | ✅ Conforme | Géré par NextAuth sur les callbacks |
| Rate limiting | ✅ Conforme | Middleware Next.js in-memory sur login (5/15min/IP), register (3/h/IP), `/api/deploy` (30/min/IP) |
| OIDC (GitHub Actions) | ✅ Conforme | Validation JWKS GitHub + `iss`/`aud`/`exp` stricts ; match Policy strict (repo, workflow, branch) sans wildcard ; audit `DEPLOY_AUTHORIZED`/`DEPLOY_DENIED` ; registry creds isolés du `.env` du conteneur |
| 2FA TOTP | ✅ Conforme | otplib + qrcode, secret chiffré AES-256-GCM, backup codes bcrypt, single-step UX |
| Plugin navigateur | ✅ Conforme | `/api/plugin/*` avec 2FA obligatoire, PluginToken 4h hashé SHA-256, CORS whitelist explicite, scope strict (Services + AppAccounts uniquement), audit complet |
| Tests sécurité automatisés | ✅ Conforme | 89 unit (~8s) + 50+ integ (~30s, vitest) — crypto, RBAC, DB encryption, headers, rate-limit, 2FA, OIDC, servers, policies |
| Backup chiffré | ✅ Conforme | GPG asymétrique pull-based, escrow externe, vérif intégrité par pull, restore-test mensuel automatisé, monitoring healthchecks.io |
| CSP | ⚠️ Partiel | Headers de base présents, CSP stricte non configurée (Next.js inline styles) |
| Rotation automatique des secrets | ❌ À faire | Backlog [todo.md](todo.md) |

---

## 2. Détails par contrôle

### 2.1 Chiffrement (✅)

- **Implémentation** : [lib/crypto.ts](../lib/crypto.ts) — AES-256-GCM via `node:crypto`.
- **Clé** : `ENCRYPTION_KEY` dans l'env du conteneur (32 bytes / 64 hex). Validation longueur à chaque appel via `getKey()`. **Jamais en DB ni dans le code.**
- **IV** : 12 bytes aléatoires par appel `encrypt`. Stocké en base avec le tag.
- **Auth tag** : 16 bytes GCM, vérifié à `decrypt` (corruption → exception).
- **Périmètre** : `Secret`, `OrgSecret`, `Service.encryptedData`, `AppAccount.encryptedData`, `User.twoFactorSecret`, **`Server.encryptedKey` (clé SSH privée github-deploy)**.
- **Vérification de non-fuite** : `SELECT * FROM "Secret"` retourne uniquement des chunks base64. Test integ `db-encryption.test.ts` + `servers.test.ts` (vérifie qu'aucune ligne contenant `BEGIN OPENSSH` n'est stockée en clair).

### 2.2 Mots de passe (✅)

- bcrypt `salt = 12` à la création (route register et bootstrap admin).
- Comparaison via `bcrypt.compare`, jamais en plain.
- Validation : ≥ 12 chars (refusé sinon).

### 2.3 Tokens machine (✅)

- Format : `sv_<32 hex bytes>` (préfixe permet la détection dans des dumps/logs).
- Stockage : `MachineToken.tokenHash = sha256(token)` (unique).
- Lookup en O(1) via index unique sur `tokenHash`.
- Le plaintext n'est retourné qu'**une seule fois** au moment de la création (`POST /api/tokens`).
- Soft-revoke : `revokedAt` mis à jour, contrôlé à chaque `validateToken`.

### 2.4 Headers HTTP (✅)

Définis dans [next.config.ts](../next.config.ts), appliqués via `headers()` à toutes les routes :

```
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### 2.5 Réseau (✅)

- En prod ([docker-compose.prod.yml](../docker-compose.prod.yml)) : `internal: true` sur le réseau `internal` (DB inaccessible depuis l'extérieur de Docker).
- L'app est exposée uniquement via le réseau externe `nginx_default` (NPM fait la terminaison TLS).
- Les ports hôte ne sont jamais bindés en prod.

### 2.6 RBAC (✅)

- `User.role` (ADMIN/MEMBER) — global ; ADMIN = OWNER implicite sur tout projet.
- `ProjectMember.role` (OWNER/EDITOR/VIEWER) — par projet.
- Helpers centraux dans [lib/api.ts](../lib/api.ts) : `requireUser()`, `requireProjectMember(slug, role)`, `requireEnvironment(slug, env, role)`.
- Le rang requis est passé explicitement à chaque route :
  - GET listes/détails → `VIEWER`
  - POST/DELETE secrets, POST/DELETE tokens → `EDITOR`
  - DELETE project → `OWNER`

### 2.7 Logs (✅)

- Prisma : `log: ["error", "warn"]` (dev) / `["error"]` (prod). Pas de query logging par défaut.
- Aucun `console.log` dans les routes ne sérialise des valeurs de secrets, tokens plaintext, ou mots de passe (revue manuelle).

### 2.8 CSRF (✅)

- NextAuth génère et valide automatiquement un token CSRF à chaque login via `/api/auth/csrf` + `/api/auth/callback/credentials`.
- Vérifié au test E2E étape 2 (login obligé d'utiliser le csrfToken).

---

## 3. Lacunes identifiées (à traiter)

### 3.1 Rate limiting (⚠️ partiel)

**Implémenté** : [lib/rate-limit.ts](../lib/rate-limit.ts) — fenêtre fixe in-memory, clé `${scope}:${ip}`.

- `/api/auth/callback/credentials` : 5 tentatives / 15 min / IP.
- `/api/auth/register` : 3 / heure / IP.
- Réponse 429 avec headers `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- Cleanup automatique des entrées expirées toutes les 60 s.
- État au niveau module : suffit pour une instance unique (notre cas). À swapper pour Postgres / Redis si l'app passe à plusieurs réplicas.

**Non couvert** :

- `/api/secrets/[slug]/[env]` (Bearer machine token) : pas de rate-limit. L'espace de tokens (`sv_<64 hex>` = 256 bits) rend le brute-force inutile, mais une rate-limit par token reste un bon usage à ajouter si on veut détecter un token compromis.
- Détection IP derrière proxy : on lit `x-forwarded-for` puis `x-real-ip` (utile derrière NPM). Vérifier que NPM est bien configuré pour transmettre l'IP réelle.

### 3.2 CSP (⚠️)

- Pas de `Content-Security-Policy` configurée.
- **Risque** : si un XSS s'introduisait (peu probable avec React), pas de garde-fou supplémentaire.
- **Difficulté** : Next.js inline une partie des styles, nécessite un nonce ou `unsafe-inline` (à éviter).

### 3.3 Audit log (✅)

- Table `AccessLog` ([prisma/schema.prisma](../prisma/schema.prisma)) : timestamp, action (enum), acteur (user OR machine token, dénormalisé pour survivre aux suppressions), org/project/environment IDs, secret key (jamais la valeur), IP, user agent, metadata JSON.
- Helper non-bloquant [lib/audit.ts](../lib/audit.ts) `logAction()` — failure logged, n'interrompt jamais l'opération.
- **Couvert** : `SECRET_*`, `TOKEN_*`, `MEMBER_*`, `PROJECT_*`, `ORG_*`. Y compris les tentatives échouées (`TOKEN_USE_FAILED`).
- **FK SetNull** : les logs survivent à la suppression des entités référencées (compliance / forensics).
- **Consultation** : `GET /api/orgs/[slug]/audit` (org ADMIN+) et `GET /api/projects/[slug]/audit` (project EDITOR+ ou org ADMIN+) avec pagination cursor + filtre `?action=...` + `?project=<slug>` (org-level).
- **Export CSV** : `?format=csv` (RFC 4180, jusqu'à 5000 lignes).
- **UI** : pages `/orgs/[slug]/audit` et `/projects/[slug]/audit` avec tableau filtrable + bouton « Exporter CSV ».
- **Non couvert** : login success/failure (à ajouter dans NextAuth events si besoin).

### 3.4 Tests automatisés (✅)

- **Unit** ([tests/lib/](../tests/lib/)) : 89 tests, ~8s. Couvre crypto roundtrip + tampering, format/hash des tokens machine, rate-limit (fenêtres + isolation), validation (slugify + secret/env/email/server/repo/workflow/branch), TOTP + backup codes, OIDC JWT verify (faux issuer in-process avec `jose.generateKeyPair`).
- **Intégration** ([tests/integ/](../tests/integ/)) : 50+ tests, ~30s. Bearer auth + RBAC (envoi 401/403), DB-level encryption (ciphertext base64, IV unique, MachineToken hashé), security headers, rate-limit en HTTP réel, 2FA bout-en-bout, server CRUD + env link + chiffrement clé SSH, policy CRUD + chemins de refus `/api/deploy`.
- **Pas en CI** pour l'instant (les integ tests requièrent docker compose up dans le runner). À ajouter quand l'infra CI sera prête.

### 3.5 Rotation des secrets (❌)

- Pas de mécanisme de rotation programmée. Backlog dans [todo.md](todo.md). Note : `ENCRYPTION_KEY` est invariante par design — sa rotation imposerait re-chiffrer tous les Secret/OrgSecret/Service/AppAccount/Server/2FA en transaction. À planifier comme opération exceptionnelle, pas comme feature courante.

### 3.6 OIDC (`/api/deploy`) (✅)

- **Implémentation** : [lib/oidc.ts](../lib/oidc.ts) — `jose v6` `createRemoteJWKSet` (cache JWKS in-process) + `jwtVerify` (vérifie signature, `iss`, `aud`, `exp` avec tolérance 10 s).
- **Issuer attendu** : `https://token.actions.githubusercontent.com` (constante, jamais override en prod).
- **Audience attendue** : `OIDC_AUDIENCE` (défaut `secretvault.argoweb.fr`). Le workflow GitHub doit appeler `core.getIDToken('<audience>')` avec la même valeur. **Recommandation forte** : utiliser le hostname public du vault, pour empêcher la replay d'un token destiné à un autre service utilisant aussi GitHub OIDC.
- **Match Policy** : strict sur `(repo, workflow, branch)` extraits du JWT + `(project, environment)` du body. Aucune wildcard. Une fuite de token OIDC ne donne accès qu'aux secrets de l'env explicitement autorisé.
- **Bundle retourné** : secrets de l'env + `serverIp`/`serverUser`/`sshKey`/`deployPath`/`dockerCompose`/`registry`. La clé SSH transite uniquement en TLS et le workflow doit la `rm` dans un step `if: always()` après usage.
- **Registry credentials** : résolus côté serveur depuis 3 OrgSecrets réservés (`REGISTRY_PAT`, `REGISTRY_USER`, optionnel `REGISTRY_URL`). Renvoyés sous `bundle.registry.{url,user,pat}`, **séparés** de `secrets` pour qu'ils ne touchent jamais le `.env` du conteneur. Le PAT est passé au shell SSH distant via env var (visible le temps du `bash -s`, pas persisté). Scope minimum recommandé : `read:packages` uniquement.
- **Audit** : `DEPLOY_AUTHORIZED` (succès) ou `DEPLOY_DENIED` avec `reason` parmi `bad_signature`, `expired`, `policy_not_found`, `no_server`, etc. Les probes (`missing_token`, `wrong_audience`, `wrong_issuer`) ne sont pas auditées pour éviter le bruit.
- **Rate-limit** : 30 req/min/IP — large pour un usage normal (workflows lents), mais évite les bursts.
- **MachineToken** reste actif comme mécanisme de secours (`/api/secrets/[slug]/[env]` Bearer `sv_…`) pour les VPS qui ne peuvent pas obtenir un OIDC GitHub.
- **Tests** : 10 unit tests dans [tests/lib/oidc.test.ts](../tests/lib/oidc.test.ts) avec un faux issuer monté en process (couvre signature/iss/aud/exp/claims/refs). Integ tests dans [tests/integ/policies.test.ts](../tests/integ/policies.test.ts) pour la CRUD + chemins de refus.

### 3.7 2FA TOTP (✅)

- Implémentation : [lib/totp.ts](../lib/totp.ts) + [lib/auth.ts](../lib/auth.ts) + endpoints `/api/me/2fa/{setup,verify,*}`.
- Secret TOTP chiffré au repos avec la même `ENCRYPTION_KEY` que les secrets métier (3 colonnes `twoFactorSecret/Iv/Tag`).
- 8 backup codes (64 bits chacun, hex 16 chars), bcrypt salt 12, **one-shot** (retirés à utilisation).
- Single-step login : champ TOTP optionnel dans le form principal, apparaît dynamiquement si erreur `2fa_required`.
- Architecture Edge-compatible : `lib/auth.config.ts` (Edge) + `lib/auth.ts` (Node) — middleware n'importe pas otplib/bcrypt.
- Machine tokens **non** affectés (auth par token uniquement, pas de 2e facteur applicable).
- Tests : 32 (10 unit + 17 integ). Voir [todo.md §Tests](todo.md).

### 3.8 Plugin navigateur — `/api/plugin/*` (✅)

- **Stack d'auth** : email + password + TOTP en une requête → `PluginToken` (préfixe `sv_plugin_<hex>`) hashé SHA-256 en base, TTL 4h, non renouvelable. Cf. [lib/plugin-token.ts](../lib/plugin-token.ts).
- **2FA OBLIGATOIRE** : si l'utilisateur n'a pas activé sa 2FA, `/api/plugin/auth` retourne 403 explicite avec un message demandant l'activation. Le plugin ne crée jamais de session sans 2FA.
- **CORS strict** : la variable d'env `PLUGIN_ALLOWED_ORIGIN` doit être définie sinon TOUS les endpoints `/api/plugin/*` répondent 403. Format `chrome-extension://<id-stable>` (l'ID extension est figé via `key` dans `manifest.json` côté extension). Cf. [lib/plugin-cors.ts](../lib/plugin-cors.ts).
- **Match domaine strict** : `URL().hostname` strictement égal à la query (pas de fuzzy, pas de subdomain wildcard). `portal.stripe.com` ≠ `stripe.com`.
- **Scope strict du contenu retourné** : uniquement `Service` (URL match) + `AppAccount` (via `Environment.url` du projet parent). **Jamais** les `Secret` (variables d'env), **jamais** les `OrgSecret`, **jamais** la `sshKey` des `Server`. C'est un canal credentials-only pour les humains.
- **Stockage côté extension** : `chrome.storage.session` uniquement (mémoire process, effacé à fermeture du navigateur). Aucun credential ni secret persisté côté client.
- **Rate-limit** : 5 tentatives / 15 min / IP sur `/api/plugin/auth` (même pression qu'un login web).
- **Audit** : `PLUGIN_AUTH_SUCCESS`, `PLUGIN_AUTH_FAILURE` (avec reason : user_not_found / invalid_password / 2fa_not_enabled / 2fa_state_inconsistent / invalid_totp), `PLUGIN_CREDENTIALS_FETCH` (avec count par type), `PLUGIN_TOKEN_REVOKED` (révocation manuelle UI).
- **Révocation manuelle** : page `/settings/security` → section « Sessions plugin actives » liste tous les tokens (active/expirée/révoquée), bouton Révoquer par session.
- **Tests** : 13 unit tests dans [tests/lib/plugin-token.test.ts](../tests/lib/plugin-token.test.ts) (format, entropie, hash, TTL env var). Tests integ dans [tests/integ/plugin.test.ts](../tests/integ/plugin.test.ts) (auth + match + revoke + CORS), auto-skippés si `PLUGIN_ALLOWED_ORIGIN` non configurée côté stack.

### 3.9 Backup chiffré (✅)

- **Architecture pull-based** : le secondaire (warm-standby) tire depuis le primaire via SSH avec `command="..."` forcé dans `authorized_keys`. Une compromission du primaire ne donne aucun accès au secondaire ni aux backups historiques.
- **Chiffrement asymétrique GPG** : RSA 4096 dédié (`backup@argoweb.fr`). La clé publique vit sur le primaire (peut chiffrer mais pas déchiffrer ses propres backups), la clé privée uniquement sur le secondaire (sans passphrase, FS hardening : `chmod 600`, owner root) et en escrow externe.
- **Escrow** : `ENCRYPTION_KEY` + clé privée GPG stockées dans Vaultwarden partagé (≥ 2 personnes). Sans escrow, perte simultanée des 2 VPS = perte définitive des données.
- **RPO 24 h, RTO 5-20 min** + propagation DNS. Trade-off explicitement accepté (edits de secrets rares dans l'org).
- **Vérification d'intégrité à chaque pull** : `decrypt + gunzip + grep "PostgreSQL database dump"` sur les premiers 4 KiB. Si échec → fichier supprimé, alerte healthchecks.io. Rename atomique `.partial` → final uniquement après validation.
- **Test de restauration mensuel automatisé** : restore du dernier backup dans une DB Postgres scratch (container éphémère), count rows User + sanity sur 5 tables core (User, Organization, Secret, Server, Policy). Échec = alerte.
- **Monitoring externe** : healthchecks.io heartbeats (daily backup + monthly restore-test). Alertes email/SMS sur silence > grace period ou échec explicite. Marche **même si SecretVault est down**, contrairement à un endpoint d'health interne.
- **Rétention** : 7 daily + 12 monthly = 18 fichiers max. Rotation idempotente, jamais d'écrasement d'un backup valide.
- **Failover** : DNS-flip manuel (TTL 60s, propagation réelle 1-15 min) + restore sur le secondaire via `secretvault-restore.sh --yes`.
- **Implémentation** : 5 scripts dans [scripts/backup/](../scripts/backup/) avec [README d'install](../scripts/backup/README.md). Design en [todo-backup-failover.md](todo-backup-failover.md), état actuel en [doc-install-backup.md](doc-install-backup.md).

---

## 4. Procédure de revue

Avant chaque livraison touchant à l'auth, au chiffrement, ou aux routes API :

1. Vérifier qu'aucune valeur de secret ne transite par les logs (`grep "console" lib/ app/api/`).
2. Confirmer que les nouvelles routes appellent `requireUser` / `requireProjectMember` / `requireEnvironment` / `requireOrgMember` avec le bon rôle.
3. Lancer `npm test && npm run test:integ` (`docker compose up -d` au préalable). Tout vert avant merge.
4. Tests manuels critiques :
   - Token machine sur mauvais env → 403.
   - Token machine révoqué → 401.
   - Lecture SQL directe d'un payload `Secret` / `Server.encryptedKey` → uniquement base64.
   - `/api/deploy` sans Bearer → 401 ; avec Bearer invalide → 401 + audit `DEPLOY_DENIED`.
   - Pour toute nouvelle policy / serveur / org secret : vérifier que la modification audite (`/projects/<slug>/audit` ou `/orgs/<slug>/audit`).
5. Vérifier les headers HTTP via `curl -I https://secretvault.argoweb.fr/`.

**Avant chaque livraison touchant au backup** :

1. Lancer `bash -n` sur tous les scripts modifiés (`scripts/backup/{primary,secondary}/*.sh`).
2. Sur le secondaire de staging (si disponible) : déclencher `secretvault-pull-backup.sh` à la main, vérifier la création du `.gpg`, exécuter `secretvault-test-restore.sh`.
3. Confirmer qu'aucun champ sensible (`ENCRYPTION_KEY`, `sshKey` plaintext, GPG private key) n'est ajouté à un fichier qui transite (logs, HTTP responses, .env).
4. Si la rétention change : valider que `secretvault-rotate.sh` ne supprime jamais un backup `.partial` et conserve toujours au minimum le plus récent.
