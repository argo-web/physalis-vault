---
title: Secrets & catégories
order: 4
icon: RiKey2Line
summary: Créer, organiser, et lire les variables d'environnement chiffrées d'un projet.
---

# Secrets & catégories

Les **secrets** sont les variables d'environnement chiffrées injectées
dans votre application au déploiement. Ils sont scopés à un
**environnement** précis d'un projet (ex. `production` du projet
`physalis`).

Chaque secret est :

- **Chiffré au repos** en AES-256-GCM avec une clé gérée par Physalis
  (jamais visible dans la DB en clair)
- **Déchiffré uniquement** au moment d'un appel autorisé (UI, machine
  token, OIDC GitHub Actions)
- **Audité** — chaque lecture / écriture / suppression est tracée dans
  l'audit log de l'organisation

## Anatomie d'un secret

| Champ          | Description                                                      |
|----------------|------------------------------------------------------------------|
| **Clé** (`key`) | Le nom de la variable d'env (ex. `DATABASE_URL`, `STRIPE_SECRET`). Convention : MAJUSCULES_SNAKE_CASE |
| **Valeur**     | La valeur chiffrée — saisie dans un input password, jamais affichée par défaut |
| **Catégorie**  | Une des catégories prédéfinies (voir ci-dessous) ou « Sans catégorie » |
| **Note**       | Description optionnelle (visible uniquement dans le dashboard, jamais dans le `.env`) |

## Catégories disponibles

Physalis impose une **liste fermée** de catégories pour garantir une
organisation cohérente entre tous les projets. L'ordre d'affichage dans
le dashboard est figé :

1. **🔌 Ports** — `PORT`, `HOST`, `BIND_ADDRESS`…
2. **🗄 Database** — `DATABASE_URL`, `DB_PASSWORD`, `REDIS_URL`…
3. **🔐 Auth** — `JWT_SECRET`, `NEXTAUTH_SECRET`, `OAUTH_CLIENT_SECRET`…
4. **🌐 Services** — clés d'APIs tierces (`STRIPE_SECRET`, `SENTRY_DSN`,
   `OPENAI_KEY`…)
5. **📧 Email** — `MAILGUN_API_KEY`, `SMTP_PASSWORD`, `RESEND_KEY`…
6. **🏗 Infra** — variables liées au runtime (`NODE_ENV`, `LOG_LEVEL`,
   `MAX_UPLOAD_MB`…)
7. **🎨 Application** — variables fonctionnelles spécifiques à votre app
   (`FEATURE_FLAG_X`, `MAINTENANCE_MODE`…)
8. **❓ Sans catégorie** — fallback si aucune ne convient

> 💡 La catégorie ne change **rien** au comportement runtime — elle
> n'organise que l'affichage dans l'UI. Vous pouvez toujours ranger un
> secret dans « Sans catégorie » si vous hésitez.

## Créer un secret

> Permissions : **EDITOR** ou **OWNER** sur le projet (DEV de l'org est
> EDITOR implicite, ADMIN/OWNER d'org est OWNER implicite).

1. Allez sur `/projects/<slug>` → onglet d'un environnement.
2. Section **« Secrets »** → bouton **« + Ajouter »**.
3. Remplissez :
   - **Clé** — sera la variable d'env (`MA_VARIABLE`)
   - **Valeur** — collée depuis votre source (token, mot de passe…)
   - **Catégorie** — choisir dans la liste
   - **Note** *(facultatif)* — contexte pour vos collègues
4. Validez. Le secret est **immédiatement chiffré** et stocké en DB.

## Lire / révéler un secret

Dans la liste de secrets d'un env, cliquez sur l'**icône 👁** à côté de
la clé pour révéler la valeur. Elle reste affichée 30 secondes puis se
re-masque automatiquement.

> Chaque révélation est **auditée** (action `SECRET_READ` dans l'audit
> log) avec l'identité du membre, l'IP et le user-agent.

Bouton **📋 Copier** : copie dans le presse-papier sans révéler à l'écran.

## Modifier ou supprimer un secret

- **Modifier** — icône ✏️ → éditer la valeur, la note ou la catégorie.
  La clé n'est pas renommable (créez-en un nouveau et supprimez l'ancien
  si nécessaire).
- **Supprimer** — icône 🗑 → confirmation requise. **Irréversible.**

## Conventions Physalis réservées

Certaines clés ont un **rôle spécial** dans Physalis et activent des
fonctionnalités quand elles sont présentes. Elles vivent dans les
**OrgSecret** de l'organisation (et non dans un environnement de projet) :

| Clé                       | Scope     | Rôle                                                                 |
|---------------------------|-----------|----------------------------------------------------------------------|
| `GITHUB_DISPATCH_TOKEN`   | OrgSecret | Active le bouton **« Redéployer »** d'un env (déclenche `workflow_dispatch`) |
| `REGISTRY_PAT`            | OrgSecret | Token pour `docker login` au registre privé pendant le déploiement OIDC |
| `REGISTRY_USER`           | OrgSecret | Username associé au PAT registre                                     |
| `REGISTRY_URL`            | OrgSecret | URL du registre privé (défaut : `ghcr.io` si absent)                |

### Préfixe `VITE_*` pour les build args

Tout secret d'environnement préfixé `VITE_` est automatiquement injecté
comme **`--build-arg`** dans `docker build` par le workflow OIDC modèle
(cf. [Déploiement OIDC](deploiement-oidc)).

> ⚠️ Vite **inline** les `VITE_*` dans le bundle JS final — ils sont
> donc **publics** côté navigateur. Ne mettez **jamais** de secret réel
> (clé API privée, token serveur) en `VITE_*`. Réservez ce préfixe aux
> URLs publiques, feature flags, etc.

## Lecture par les machines

Les secrets sont lus en production par votre application via deux
mécanismes :

1. **Workflow GitHub Actions OIDC** *(recommandé)* — pas de token stocké,
   authentification par signature GitHub. Lit le bundle complet
   (secrets + sshKey + dockerCompose). Voir [Déploiement OIDC](deploiement-oidc).
2. **Bearer machine token** *(legacy, maintenu)* — un token statique
   (`sv_<64hex>`) appelé via `GET /api/secrets/<slug>/<env>`. Utile pour
   les scripts cron ou les intégrations sans GitHub.

## Aller plus loin

- [Coffres](coffres) — pour les credentials qui ne sont pas des
  variables `.env` (mots de passe d'admins, BDD non-runtime…)
- [Déploiement OIDC](deploiement-oidc) — comment ces secrets arrivent
  dans votre conteneur en production
- [Partages](partages) — pour transmettre un secret à un tiers
  ponctuellement
