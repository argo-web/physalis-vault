---
title: Extension navigateur
order: 8
icon: RiPuzzle2Line
summary: Auto-fill, auto-save, TOTP des sites tiers depuis votre coffre Physalis.
---

# Extension navigateur

L'extension Physalis (Chrome / Firefox) connecte vos coffres au web :
auto-fill des credentials sur les sites visités, auto-save quand vous
créez un compte, génération automatique des codes TOTP des sites tiers.

> ✅ **Statut** : l'extension est **publiée sur les stores** — Chrome Web
> Store et Firefox Add-ons (v0.7.0). Backend et front-end livrés et
> stables. Installez-la depuis le prompt affiché dans votre dashboard ou
> directement depuis le store de votre navigateur.

## Pré-requis

- **2FA TOTP activé** sur votre compte Physalis (obligatoire pour
  l'authentification de l'extension — voir [Premiers pas](premiers-pas))
- Une **session valide** dans Physalis (login préalable depuis votre
  navigateur sur `<votre-slug>.physalis.cloud`)

## Installation

Le **prompt d'installation** apparaît dans votre dashboard Physalis
quand l'extension n'est pas détectée : un encart en haut de page propose
le lien d'installation pour Chrome ou Firefox.

> 💡 L'extension détecte automatiquement Physalis via un événement
> DOM — pas besoin de la configurer manuellement, le prompt disparaît
> dès qu'elle est installée.

## Authentification de l'extension

À la première utilisation, l'extension demande :

1. **Email** + **mot de passe** Physalis
2. **Code TOTP** à 6 chiffres (depuis votre app d'auth ou votre coffre
   perso)
3. **TTL de session** : 1h, 4h ou 8h

Au-delà du TTL choisi, l'extension se déconnecte automatiquement et
re-demande email + password + TOTP. Choisissez 1h sur un poste partagé,
8h sur votre laptop personnel.

> 🔒 Les sessions extension sont **séparées** de votre session web. Les
> tokens sont hashés en SHA-256 côté serveur — Physalis ne stocke jamais
> le token en clair, même brièvement.

> 🔗 **Comptes SSO / login social** : si vous vous connectez via SSO
> d'entreprise ou un compte social (sans mot de passe Physalis), le popup
> email + mot de passe ne s'applique pas. Connectez-vous simplement sur le
> web (`<votre-slug>.physalis.cloud`) : si l'extension est installée, elle
> **récupère automatiquement votre session** — aucun code à saisir dans le
> popup.

### Gérer ses sessions extension

Sur Physalis : `/settings/security` → section **« Sessions extension »**.
Vous y voyez la liste des sessions actives (user-agent, date, TTL
restant) et pouvez en révoquer une via le bouton **« Révoquer »**.
Utile si vous oubliez de vous déconnecter d'un poste.

## Fonctionnalités

### Auto-fill des credentials

Sur un site avec un formulaire de login, l'extension :

1. Détecte les champs `<input type="email">`, `<input type="password">`,
   `autocomplete="username"`
2. Cherche dans vos 3 sources de coffre (perso + équipe org + équipe
   projet) une entrée dont l'URL matche le domaine
3. Affiche une **icône** dans le champ → clic → choix entre les
   credentials disponibles → auto-fill

### Auto-save d'un nouveau compte

Quand vous soumettez un formulaire d'inscription, l'extension :

1. Détecte les champs et la valeur saisie
2. Affiche une **bannière Shadow DOM** non intrusive : *« Sauvegarder
   ces credentials dans Physalis ? »*
3. Au clic, propose une **destination** :
   - Coffre personnel
   - Une collection d'équipe (org ou projet)
4. Sauvegarde via `POST /api/plugin/vault` (audité côté Physalis avec
   l'origine `plugin_autosave`)

> Une **liste noire de domaines** (paramétrable dans l'extension) évite
> que le prompt apparaisse sur les sites où vous ne voulez jamais
> sauvegarder (intranet, tests, etc.).

### TOTP des sites tiers

Si une entrée de coffre contient une clé `otpauth://`, l'extension
détecte les champs `autocomplete="one-time-code"` du site et propose
**l'auto-fill du code à 6 chiffres** sans aucun copier-coller manuel.

Le code est régénéré toutes les 30 secondes selon RFC 6238, calculé
**localement** par l'extension (Web Crypto API) — la clé TOTP ne quitte
jamais votre navigateur.

Voir [Coffres](coffres) pour stocker la clé `otpauth://` lors de
l'activation 2FA d'un site tiers.

## Sécurité de l'extension

| Garantie                                                      | Mécanisme                                  |
|---------------------------------------------------------------|--------------------------------------------|
| Mot de passe Physalis ne quitte jamais le navigateur en clair | Bcrypt côté serveur                        |
| Token de session hashé en DB                                  | SHA-256, jamais relu en clair              |
| Origin de l'extension whitelisté                              | `PLUGIN_ALLOWED_ORIGIN` (CORS strict)      |
| Rate-limit auth                                               | 5 tentatives / 15 min / IP                 |
| Rate-limit auto-save                                          | 30 / min / utilisateur                    |
| Audit complet                                                 | Chaque match / save tracé dans l'audit log |

## Aller plus loin

- [Coffres](coffres) — où vivent les entrées que l'extension exploite
- [Premiers pas](premiers-pas) — activer le 2FA, prérequis de l'extension
