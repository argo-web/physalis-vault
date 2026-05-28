---
title: Intégration N8n
order: 9
icon: RiFlowChart
summary: Connectez vos workflows N8n à Physalis avec le nœud officiel — secrets, services et comptes accessibles à la demande, sans duplication.
---

# Intégration N8n

Le nœud N8n communautaire `n8n-nodes-physalis` permet à vos workflows
d'accéder en lecture aux secrets, services et comptes applicatifs stockés
dans votre vault Physalis — sans dupliquer les credentials dans N8n.

**Avantages :**

- Si un mot de passe change dans Physalis, le workflow l'utilise
  automatiquement à la prochaine exécution.
- Aucun secret stocké en clair dans la base N8n.
- Chaque accès est tracé dans l'audit log Physalis (`INTEGRATION_CREDENTIALS_FETCH`).
- Révocation instantanée du token = arrêt immédiat de l'accès.

## Installation du nœud dans N8n

1. Dans votre instance N8n : **Settings → Community Nodes → Install**.
2. Coller le nom du package : `n8n-nodes-physalis`.
3. Cliquer sur **Install**.

Le nœud **Physalis** apparaît alors dans le node picker (catégorie
*Development*).

> ℹ️ N8n hébergé sur n8n.cloud : les community nodes ne sont pas
> disponibles en mode SaaS. Self-host requis.

## Choisir le bon type de token

Physalis propose **3 types de tokens** Bearer compatibles avec ce nœud.
Choisissez celui qui correspond à votre cas d'usage :

| Token | Préfixe | Scope | Survit au départ du créateur ? | Recommandé pour |
|---|---|---|---|---|
| **OrgToken** | `sv_org_…` | 1 organisation, scopes explicites + projets autorisés | ✅ oui (`createdBy SetNull`) | **Workflows institutionnels pérennes** (production) |
| **UserToken** | `sv_user_…` | 1 user, accès aux projets dont il est membre | ❌ non (révoqué si user supprimé) | Workflows personnels / prototypage |
| **MachineToken** | `sv_…` | 1 projet + 1 environnement précis | ✅ oui (lié au projet) | CI/CD historique, intégrations non-GitHub |

> 💡 **Recommandation** : pour un workflow N8n en production, utilisez
> un **OrgToken**. Il survit au départ d'un membre de l'équipe — vos
> workflows ne tomberont pas en panne quand quelqu'un quitte l'org.

## Créer un OrgToken

Réservé aux **OrgADMIN** ou **OrgOWNER**.

1. Aller dans **Organisation → Tokens** (onglet visible uniquement pour
   les rôles ADMIN+).
2. Cliquer sur **+ Nouveau token**.
3. Remplir :
   - **Nom** : libellé descriptif, ex. `N8n - Voyages prod`.
   - **Scopes** : cocher uniquement ceux nécessaires :
     - `PROJECTS_LIST` (requis pour le chargement dynamique du dropdown)
     - `SECRETS_READ` si vous lisez des secrets d'environnement
     - `SERVICES_READ` si vous lisez des services externes
     - `ACCOUNTS_READ` si vous lisez des comptes applicatifs
   - **Projets autorisés** : cocher les projets précis. **Évitez** la
     case « Tous les projets actuels et futurs » sauf cas spécifique
     (un dialog de confirmation s'affiche).
   - **Expiration** : `1 an` recommandé pour les tokens d'automatisation.
4. Copier le token affiché — **il ne sera plus jamais visible après
   fermeture du dialog**.

## Créer un UserToken (alternative)

Pour les workflows personnels ou de prototypage rapide :

1. Aller dans **Settings → Sécurité → Tokens d'intégration**.
2. **+ Créer un token**, nommer, choisir une expiration.
3. Copier le token.

## Configurer le credential N8n

Dans N8n : **Credentials → New → Physalis API**.

Remplir :

| Champ | Valeur |
|---|---|
| **Vault URL** | URL de votre instance Physalis, ex. `https://argoweb.physalis.cloud` (sans slash final) |
| **Bearer Token** | Le token brut copié à l'étape précédente |

Cliquer sur **Test** : doit répondre OK même si la liste de projets est
vide.

> 💡 Vous pouvez créer plusieurs credentials Physalis — par exemple un
> par environnement (`Physalis Voyages prod`, `Physalis Voyages staging`).

## Opérations supportées

### Get Credentials

Récupère secrets, services ou comptes d'un projet, avec filtres
optionnels.

| Champ | Description |
|---|---|
| **Project** | Sélectionne le projet (chargé dynamiquement depuis l'API) |
| **Type** | `secret` (env vars) · `service` (Stripe, Mailgun, …) · `account` (compte applicatif test/admin) |
| **Environment** | Requis si `type=secret`. Ex : `production`, `staging` |
| **Tag** | Filtre par tag technique (ex : `postgres`, `stripe`). Liste chargée dynamiquement. |
| **Key** | Filtre clé exacte (case-sensitive) — uniquement pour les secrets |

**Sortie** : 1 item N8n par credential trouvé. Format selon le type :

```json
// type=secret
{ "key": "DATABASE_URL", "value": "postgresql://...", "category": "database", "tags": ["postgres"] }

// type=service
{ "id": "ck...", "name": "Stripe Production", "url": "https://stripe.com",
  "username": "admin@argoweb.fr", "password": "sk_live_...", "tags": ["stripe"] }

// type=account
{ "id": "ck...", "name": "Compte test client",
  "username": "test@example.com", "password": "...", "tags": ["staging"] }
```

### List Projects

Liste les projets accessibles au token, avec leurs environnements.
Utile pour les workflows dynamiques qui itèrent sur plusieurs projets
(ex : audit cross-projet).

```json
{ "slug": "voyages", "name": "Voyages", "role": "VIEWER",
  "environments": [{ "name": "production", "url": "https://app.voyages.fr" }] }
```

## Exemples de workflows

### Connexion PostgreSQL automatique

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
   credentials: extraits du value
```

Si le mot de passe DB change dans Physalis, le workflow utilise
automatiquement le nouveau à la prochaine exécution.

### Envoi d'email via Mailgun

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

### Audit cross-projet (rotation programmée)

```
[Cron quotidien]
   ↓
[Physalis: List Projects]
   ↓ (output: 1 item par projet)
[Physalis: Get Credentials]
   project: {{ $json.slug }}
   type: secret
   env: production
   key: DATABASE_PASSWORD
   ↓
[Function: detecter passwords > 90j]
   ↓
[Slack: alerter]
```

## Limites de sécurité

- **Lecture seule en V1**. Aucune écriture n'est possible via le nœud
  (pas de `POST /api/integrations/secrets`). Pour la rotation
  automatique, utilisez le futur SDK Physalis (backlog) ou un script
  custom avec un token dédié.
- **Les OrgSecrets** (`GITHUB_DISPATCH_TOKEN`, `REGISTRY_PAT`,
  `REGISTRY_USER`…) ne sont **jamais** accessibles via ce nœud —
  par design. Ces clés sont réservées au build/deploy infrastructure.
- **HTTPS obligatoire**. N'utilisez jamais ce nœud avec une URL `http://`.

## Sécurité opérationnelle

À appliquer dans votre instance N8n :

- **HTTPS strict** sur l'instance N8n elle-même
- **2FA activé** sur les comptes admin N8n
- **Backup chiffré** de la base N8n (les credentials sont chiffrés en
  base mais la clé de chiffrement est dans la config N8n)
- **Révocation immédiate** du token Physalis si l'instance N8n est
  compromise (depuis Org → Tokens → bouton « Révoquer »)
- **Un token par instance** N8n — ne jamais partager un même token
  entre dev/staging/prod ou entre plusieurs équipes

## Audit log

Tous les accès via le nœud sont tracés dans Physalis :

- **Action** : `INTEGRATION_CREDENTIALS_FETCH` (1 entry par appel, pas par item)
- **Metadata** : `{ tokenKind, type, tag, keyFilter, count }`
- **Acteur** : `kind: "user"` si UserToken, `kind: "token"` (avec
  `tokenId` + `tokenName`) si OrgToken ou MachineToken

Visible dans **Organisation → Audit** ou **Projet → Audit**.

## Liens

- 📦 Package npm : [n8n-nodes-physalis](https://www.npmjs.com/package/n8n-nodes-physalis)
- 🐙 Source : [github.com/argo-web/physalis-n8n-nodes](https://github.com/argo-web/physalis-n8n-nodes)
- 🐛 Issues : [github.com/argo-web/physalis-n8n-nodes/issues](https://github.com/argo-web/physalis-n8n-nodes/issues)
- 📚 N8n Community Nodes : [docs.n8n.io/integrations/community-nodes](https://docs.n8n.io/integrations/community-nodes/)
