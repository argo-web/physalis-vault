---
title: Synchronisation sortante
order: 13
icon: RiUploadCloud2Line
summary: Pousser automatiquement les secrets d'un environnement vers les variables d'environnement d'une plateforme cloud (Vercel, Render, Railway) à chaque modification.
---

# Synchronisation sortante

La **synchronisation sortante** pousse les secrets d'un environnement Physalis
vers les **variables d'environnement** d'une plateforme cloud (Vercel, Render,
Railway), automatiquement **à chaque modification** d'un secret.

C'est l'**inverse** du [déploiement OIDC](07-deploiement-oidc) :

| | Déploiement OIDC | Synchronisation sortante |
|---|---|---|
| **Qui héberge l'app** | votre VPS | la plateforme (Vercel/Render/Railway) |
| **Sens** | la plateforme demande, Physalis répond | Physalis pousse vers la plateforme |
| **Rôle de Physalis** | fournit les secrets **et** déploie | **alimente** les secrets ; la plateforme déploie |

Vous utilisez l'un **ou** l'autre pour une application donnée — pas les deux.

## Principe

- **Physalis est la source de vérité.** Il pousse ses secrets vers la plateforme ;
  il ne lit **jamais** en sens inverse. Une variable créée à la main côté
  plateforme **n'apparaît pas** dans Physalis.
- La synchronisation est **unidirectionnelle** et **automatique** : chaque
  création / modification / suppression / rotation d'un secret déclenche un push.
- Une **synchronisation initiale** part dès la création de la cible.

## Mise en place — 2 étapes

### 1. Connexion (niveau organisation)

Dans **Organisation → onglet CI/CD → Nouvelle connexion**, choisissez le provider
de sync et saisissez son **token** (chiffré, jamais réaffiché — *write-only*) :

| Provider | Token à fournir | Où le créer |
|---|---|---|
| **Vercel** | Token d'accès | Account Settings → Tokens (+ *Team ID* si le projet est dans une Team) |
| **Render** | Clé API | Account Settings → API Keys |
| **Railway** | **Account / Workspace token** | Account Settings → Tokens |

> ⚠️ **Railway** : utilisez bien un **account token** (ou workspace), **pas** un
> *project token* (ce dernier utilise un en-tête différent et serait refusé).

Une connexion est **partagée** par tous les projets de l'organisation. Réservé
aux rôles **ADMIN_DEV+**.

### 2. Cible (niveau environnement)

Dans un **projet → un environnement → sous-onglet Sync → Nouvelle cible**
(réservé au rôle **OWNER** du projet) :

1. choisissez la **connexion** ;
2. le **picker** liste les ressources accessibles par le token :
   - **Vercel** : le **projet** Vercel + les **environnements cibles** (production /
     preview / development, cases à cocher) ;
   - **Render** : le **service** ;
   - **Railway** : en cascade **projet → environnement → service** ;
3. (optionnel) un **filtre par tag** : ne pousser que les secrets portant au moins
   un de ces tags. Vide = **tous** les secrets de l'environnement.

> Le sous-onglet **Sync** n'apparaît que si l'organisation a au moins une
> connexion de sync.

## Comportement par plateforme

### Vercel
- Variables poussées en type **`encrypted`** (chiffrées au repos, lisibles par les
  builds/functions, compatibles dev/preview/production).
- **Upsert** : création + mise à jour idempotentes.
- **Suppression réconciliée** : un secret supprimé dans Physalis est retiré côté
  Vercel. Physalis ne touche **que** les variables qu'il gère (marquées par un
  *comment* `physalis-sync`) → **vos variables manuelles Vercel sont préservées**.

### Render & Railway — remplacement intégral
- Ces plateformes **remplacent l'intégralité** des variables du service en un appel.
- Conséquence : **Physalis devient la source de vérité du service** — une variable
  posée à la main côté plateforme et **absente** de Physalis sera **retirée** au
  prochain push. Un avertissement est affiché à la création de la cible.
- Railway **redéploie automatiquement** le service à chaque changement de variable.

## Suivi & opérations

- **Statut** : chaque cible affiche `synchronisé <date>` (vert) ou l'erreur de la
  dernière sync (`lastSyncError`, message sanitisé).
- **Resync manuel** : bouton *Resync* sur la cible (re-pousse l'état courant).
- **Suppression de cible** : à la suppression, vous pouvez demander le **nettoyage
  des variables distantes** gérées par Physalis (offboarding).
- **Cron de réconciliation** (optionnel) : un endpoint `/api/cron/sync-reconcile`
  re-pousse les cibles en erreur (après un incident transitoire de la plateforme).
  À déclencher périodiquement (ex. via n8n, toutes les 30 min).

## Sécurité

- **Token write-only** : le token de la plateforme n'est jamais réaffiché ni
  relisible une fois enregistré (chiffré AES-256-GCM).
- **Périmètre borné** : on ne peut cibler que des ressources que le token possède
  déjà (le picker les liste via l'API de la plateforme).
- **Filtre par tag** pour ne pas pousser des secrets backend vers une plateforme
  frontend.
- **Source de vérité** : une modification faite directement côté plateforme sur une
  variable gérée par Physalis sera **écrasée** au prochain push.

## Limites

- Synchronisation **unidirectionnelle** (Physalis → plateforme). Pas d'import depuis
  la plateforme.
- Sur **Render** et **Railway**, Physalis possède l'intégralité des variables du
  service ciblé (remplacement en bloc).
