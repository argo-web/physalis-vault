---
title: Rotation des secrets
order: 10
icon: RiRefreshLine
summary: Comprendre et configurer le renouvellement automatique ou assisté des secrets sensibles.
---

# Rotation des secrets

La **rotation** est le mécanisme par lequel Physalis renouvelle périodiquement
la valeur d'un secret — soit automatiquement, soit en rappelant à l'équipe
qu'une action manuelle est requise.

Chaque secret peut se voir attribuer une **stratégie de rotation** et une
**fréquence** (en jours). Un cron tourne toutes les heures et déclenche les
rotations dont la date est passée.

## Prérequis

La rotation est une **fonctionnalité opt-in** au niveau de l'organisation.
Un **ADMIN** ou **OWNER** d'org doit l'activer dans les paramètres avant de
pouvoir la configurer sur des secrets individuels.

La rotation s'arrête également si le **projet est mis en pause** (voir
[Mettre en pause](#mettre-en-pause-un-projet)).

## Stratégies disponibles

### `DATABASE` — rotation de mot de passe de base de données

Physalis délègue la rotation à un workflow **N8n** via webhook. Le workflow
génère un nouveau mot de passe, le change sur la base de données, puis appelle
le **callback Physalis** pour confirmer le succès ou l'échec.

Champs requis sur le secret :

| Champ        | Description                                      |
|--------------|--------------------------------------------------|
| `dbType`     | `POSTGRESQL`, `MYSQL` ou `MONGODB`               |
| `dbHost`     | Hostname du serveur de base de données           |
| `dbPort`     | Port (ex. `5432` pour PostgreSQL)                |
| `dbName`     | Nom de la base                                   |
| `dbUser`     | Utilisateur dont le mot de passe sera tourné     |

Si l'organisation dispose d'un `GITHUB_DISPATCH_TOKEN` dans ses OrgSecrets et
que le projet a un `githubRepo` configuré, Physalis déclenche automatiquement
un redéploiement via GitHub Actions après la rotation.

> ⚙️ La variable d'environnement serveur `ROTATION_N8N_WEBHOOK_URL` doit
> pointer vers le webhook N8n dédié.

### `JWT_SECRET` — rotation de secret JWT

Physalis génère lui-même un nouveau secret de **128 caractères hexadécimaux**
(64 octets aléatoires), chiffre la nouvelle valeur, crée une version
d'historique de l'ancienne, puis met à jour le secret — entièrement **sans
intervention externe**.

Si le projet est lié à un dépôt GitHub avec un `GITHUB_DISPATCH_TOKEN`, un
redéploiement est déclenché automatiquement pour que les conteneurs rechargent
la nouvelle valeur.

> Cette stratégie est **entièrement autonome** : aucun workflow N8n n'est
> requis. C'est la stratégie recommandée pour les `JWT_SECRET`,
> `NEXTAUTH_SECRET` et secrets similaires.

### `REMINDER` — rappel de rotation manuelle

Physalis **n'effectue pas** la rotation lui-même. Il envoie un e-mail à
l'**ADMIN ou OWNER** de l'organisation lui demandant de renouveler le secret
manuellement dans son service tiers.

Une fois la rotation effectuée en dehors de Physalis, le membre doit cliquer
sur **« Marquer comme roté »** dans l'UI (ou appeler l'endpoint
`/rotation/mark-rotated`) pour réinitialiser le compteur et planifier la
prochaine échéance.

> Adaptée aux secrets tiers pour lesquels vous n'avez pas de webhook
> automatisable : clés API, certificats, mots de passe partagés…

## Authentification du callback N8n

Pour la stratégie `DATABASE`, N8n reçoit un `rotationToken` dans le payload
initial et doit le renvoyer dans le callback. Ce token est un **HMAC-SHA256**
calculé ainsi :

```
window = floor(timestamp_ms / 3_600_000)   // heure courante en entier
token  = "<window>.<HMAC-SHA256(secretId + "|" + window, ROTATION_HMAC_KEY)>"
```

Le token est **valide 2 heures** (fenêtre ±1 heure autour de l'heure
d'émission). La clé HMAC est configurée via la variable d'environnement
`ROTATION_HMAC_KEY`.

> ⚠️ Changez `ROTATION_HMAC_KEY` depuis sa valeur par défaut en production.

## Moteur cron

Un cron **toutes les heures** sélectionne les secrets satisfaisant :

- `rotationEnabled = true`
- `rotationNextAt ≤ NOW()`
- projet non mis en pause (`rotationPaused = false`)
- feature activée sur l'organisation (`rotationFeatureEnabled = true`)
- client en statut `ACTIVE` ou `TRIAL`

Chaque secret éligible passe par `triggerRotation()`. Les erreurs réseau
(webhook N8n injoignable) sont silencieuses — la rotation sera retentée à
la prochaine heure.

## Configurer la rotation sur un secret

> Permissions : **EDITOR** ou supérieur sur le projet.

1. Ouvrez un secret → onglet **« Rotation »**.
2. Activez la rotation et choisissez une **stratégie**.
3. Saisissez l'**intervalle en jours** (1–3 650).
4. Pour `DATABASE`, remplissez les informations de connexion.
5. Enregistrez. `rotationNextAt` est calculé immédiatement : `NOW + intervalDays`.

## Forcer une rotation immédiate

Un **EDITOR** peut déclencher la rotation hors cycle cron via le bouton
**« Rotation forcée »** (ou `POST /rotation/force`). L'action est auditée
(`SECRET_ROTATION_FORCED`).

## Mettre en pause un projet

Un **OWNER** du projet peut suspendre toutes les rotations du projet sans
désactiver secret par secret :

```http
PATCH /api/projects/<slug>/rotation/pause
{ "paused": true }
```

Pratique avant une maintenance ou un freeze de release.

## États et suivi

| Champ                | Valeurs possibles         | Description                                   |
|----------------------|---------------------------|-----------------------------------------------|
| `rotationLastStatus` | `success`, `error`, `null` | Résultat de la dernière rotation              |
| `rotationErrorCount` | entier                    | Nombre d'échecs consécutifs (remis à 0 au succès) |
| `rotationLastAt`     | datetime                  | Date de la dernière rotation réussie          |
| `rotationNextAt`     | datetime                  | Prochaine exécution planifiée                 |

Une notification e-mail est envoyée à l'**ADMIN/OWNER** au **premier échec**
consécutif d'une rotation `DATABASE`. Les échecs suivants ne génèrent pas
d'e-mail supplémentaire pour éviter le spam.

## Historique des valeurs

Lors d'une rotation `JWT_SECRET`, l'ancienne valeur est automatiquement
archivée dans le **versioning** du secret (50 versions max, puis purge
FIFO). Voir [Secrets & catégories](secrets-categories) pour le
fonctionnement du versioning.
