---
title: Déploiement OIDC
order: 7
icon: RiCloudLine
summary: Configurer Server, Policy et workflow GitHub Actions sans aucun secret stocké.
---

# Déploiement OIDC

Physalis remplace les anciens flows « PAT GitHub stocké + secrets
GitHub Actions » par une authentification **OIDC** (OpenID Connect)
basée sur les **tokens signés par GitHub** eux-mêmes.

**Conséquence** : votre repo GitHub n'a **aucun** `secrets.*` lié à
Physalis. La preuve d'identité est le token OIDC que GitHub Actions
émet automatiquement à chaque exécution de workflow.

## Schéma de bout en bout

```
┌─────────────────┐      ┌──────────────────────────┐      ┌────────────┐
│  GitHub Actions │ OIDC │ /api/deploy de Physalis  │ SSH  │   VPS      │
│   workflow.yml  │─────▶│ - vérifie le token OIDC  │─────▶│ /srv/...   │
│                 │      │ - lookup Policy          │      │            │
│                 │◀─────│ - retourne bundle        │      │            │
└─────────────────┘      └──────────────────────────┘      └────────────┘
        │                                                         ▲
        │   POST .env + docker-compose + docker login + restart   │
        └─────────────────────────────────────────────────────────┘
```

## Pré-requis

Avant de configurer un workflow, vous avez besoin de **3 objets** dans
Physalis :

1. Un **Server** au niveau organisation (clé SSH du VPS cible)
2. Un **Environment** lié à ce Server (avec un `deployPath`)
3. Une **Policy** qui dit *« le repo X, sur la branche Y, peut déployer
   sur le projet P, environnement E »*

## 1. Créer un Server

> Permissions : ADMIN / OWNER de l'org.

Page de l'organisation → onglet **« Serveurs »** → **« + Nouveau serveur »**.

Champs :

| Champ           | Description                                                                 |
|-----------------|-----------------------------------------------------------------------------|
| **Nom**         | Libellé interne (« VPS prod Hetzner »)                                      |
| **IP**          | IPv4 ou hostname résolvant le VPS                                            |
| **SSH user**    | L'utilisateur Linux côté VPS (typiquement `deploy` ou `github-deploy`)      |
| **Clé privée**  | La clé SSH **complète** (PEM, OpenSSH) — collée une seule fois              |

> ⚠️ La **clé privée n'est plus jamais relisible** depuis l'UI après
> création — elle n'est utilisée qu'au runtime par `/api/deploy` pour
> être incluse dans le bundle. Si vous la perdez, supprimez le Server
> et créez-en un nouveau avec une nouvelle clé.

### Préparer le VPS côté SSH

Sur le VPS, créez l'utilisateur de déploiement et autorisez la clé
publique :

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo usermod -aG docker deploy
sudo -u deploy mkdir -p ~deploy/.ssh
sudo -u deploy bash -c 'echo "ssh-ed25519 AAAA... github-deploy" >> ~/.ssh/authorized_keys'
sudo -u deploy chmod 600 ~deploy/.ssh/authorized_keys
```

Le `deployPath` (par défaut `/srv/projets/<env>/<slug>`) doit exister et
appartenir à `deploy:deploy`.

## 2. Lier l'Environment au Server

Sur la page du projet → environnement → **Settings** → champ **Server**.
Choisissez le serveur créé à l'étape 1, ajustez le `deployPath` si
besoin (sinon convention `defaultDeployPath` appliquée).

Voir [Projets & environnements](projets-et-environnements) pour le
détail.

## 3. Créer une Policy

C'est la **règle d'autorisation** : qui (claims OIDC du workflow) peut
déployer où (projet + env Physalis).

Sur la page du projet → onglet **« Policies »** → **« + Nouvelle Policy »**.

Champs (tous obligatoires, **match strict, aucune wildcard**) :

| Champ           | Exemple                          | Source                                   |
|-----------------|----------------------------------|------------------------------------------|
| **Repo**        | `argo-web/physalis`              | `owner/repo` GitHub                      |
| **Workflow**    | `deploy.yml`                     | Nom du fichier workflow                  |
| **Branche**     | `main`                           | Branche depuis laquelle le workflow tourne |
| **Environnement** | `production`                   | Un env existant du projet                |

> Le bouton **« Modifier »** sur une Policy existante permet d'ajuster
> les 4 champs (collision détectée si un autre tuple existe déjà).

### Ce que ça veut dire

Quand un workflow tourne, GitHub émet un token OIDC contenant des
claims comme :

```json
{
  "repository": "argo-web/physalis",
  "workflow_ref": "argo-web/physalis/.github/workflows/deploy.yml@refs/heads/main",
  "ref": "refs/heads/main",
  "audience": "vault.physalis.cloud"
}
```

Physalis vérifie la signature contre le JWKS GitHub, extrait
`(repository, workflow, branch)`, cherche une Policy qui matche **pile**,
et ne déclenche le déploiement que si la combinaison `(project, env)`
du body de la requête correspond.

## 4. Le workflow modèle

Copiez [docs/deploy.modele.yml](https://github.com/argo-web/physalis-vault/blob/main/docs/deploy.modele.yml)
dans `.github/workflows/deploy.yml` de votre repo. Adaptez les variables
en haut :

```yaml
env:
  VAULT_URL: https://vault.physalis.cloud
  VAULT_AUDIENCE: vault.physalis.cloud
  VAULT_PROJECT: physalis      # slug du projet dans Physalis
  VAULT_ENV: main              # env cible
```

Le workflow contient **2 jobs** :

1. **build** — récupère son propre token OIDC, fetch les `VITE_*` depuis
   Physalis, build l'image Docker en passant les `VITE_*` comme
   `--build-arg`, push sur GHCR
2. **deploy** — re-fetch le bundle complet, écrit `.env` + `docker-compose.yml`
   sur le VPS via SCP, lance `docker compose pull && up -d`

### Permissions du workflow

```yaml
permissions:
  id-token: write    # OBLIGATOIRE pour core.getIDToken()
  contents: read
  packages: write    # pour push sur GHCR avec GITHUB_TOKEN
```

## 5. Build args Vite

Tout secret d'environnement préfixé `VITE_` est récupéré au job `build`
et passé au `docker build` en `--build-arg`.

Côté `Dockerfile` du frontend, déclarez les `ARG` correspondants :

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

> ⚠️ Vite **inline** les `VITE_*` dans le bundle JS final → publics
> côté navigateur. À réserver aux URLs publiques, feature flags, etc.
> Voir [Secrets & catégories](secrets) pour la convention complète.

## 6. Variables réservées (`OrgSecret`)

Pour que le workflow puisse pousser/pull sur un registre privé,
configurez ces 3 OrgSecret au niveau organisation :

| Clé             | Obligatoire ? | Défaut     |
|-----------------|---------------|------------|
| `REGISTRY_PAT`  | ✅            | —          |
| `REGISTRY_USER` | ✅            | —          |
| `REGISTRY_URL`  | facultatif    | `ghcr.io`  |

Le bundle `/api/deploy` les inclut sous une clé `registry` séparée des
`secrets[]` — elles ne polluent **pas** le `.env` du conteneur, elles
servent uniquement au `docker login` distant.

## 7. Premier déploiement

1. Push sur `main` → le workflow `deploy.yml` se lance
2. Job `build` : récupère VITE_*, build l'image, push sur GHCR
3. Job `deploy` : récupère le bundle, écrit `.env` + `docker-compose.yml`
   sur le VPS, fait un `docker compose up -d`
4. Vérifiez l'**audit log** Physalis (page de l'org) → vous verrez
   `DEPLOY_AUTHORIZED` avec les détails (repo, workflow, branche, env)

### En cas d'échec

L'audit log Physalis enregistre `DEPLOY_DENIED` avec une raison
diagnostiquable :

| `reason`               | Cause probable                                                |
|------------------------|---------------------------------------------------------------|
| `wrong_audience`       | `VAULT_AUDIENCE` du workflow ≠ `OIDC_AUDIENCE` du Physalis    |
| `wrong_issuer`         | Le token n'est pas signé par GitHub                            |
| `expired`              | Le job a tourné trop longtemps avant d'appeler `/api/deploy`   |
| `policy_not_found`     | Aucune Policy ne matche `(repo, workflow, branch)`            |
| `policy_match_failed`  | Policy trouvée mais `(project, env)` du body ne matche pas   |
| `no_server`            | L'env existe mais n'est lié à aucun Server                     |

## Bouton « Redéployer » (workflow_dispatch)

Si vous voulez piloter un redéploiement **depuis l'UI Physalis** sans
push, configurez l'OrgSecret `GITHUB_DISPATCH_TOKEN` (un PAT avec scope
`repo` ou un GitHub App token) et le bouton **« Redéployer »**
apparaîtra sur chaque environnement.

Au clic, Physalis appelle `POST /repos/{owner}/{repo}/actions/workflows/{wf}/dispatches`
qui déclenche le workflow `redeploy.yml` sur la branche de l'environnement.
Ce workflow **ne rebuilde pas les images** — il re-fetch le bundle `.env`,
l'écrit sur le VPS et redémarre les containers via `docker compose up -d`.
C'est suffisant pour les secrets chargés au runtime (variables d'environnement,
clés passées via `.env`).

Copiez [docs/redeploy.modele.yml](https://github.com/argo-web/physalis-vault/blob/main/docs/redeploy.modele.yml)
dans `.github/workflows/redeploy.yml` de votre repo et adaptez les variables
en haut du fichier.

> **Secrets injectés au build** (ex. `VITE_*`) — Si votre secret est passé
> comme `--build-arg` Docker lors du build de l'image, un simple redeploy ne
> suffit pas. Il faut déclencher le workflow de build complet (`deploy.yml`).
> Physalis le gère automatiquement via l'option **« Build complet requis »**
> dans la configuration de rotation du secret (voir [Rotation des secrets](rotations)).

## Aller plus loin

- [Secrets & catégories](secrets) — comment vos `VITE_*` et autres
  variables d'env arrivent dans le bundle
- [Organisations & rôles](organisations-et-roles) — qui peut gérer les
  Servers et les Policies
