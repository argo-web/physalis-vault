---
title: Premiers pas
order: 1
icon: RiRocketLine
summary: Créer son compte, se connecter sur son sous-domaine, activer la 2FA.
---

# Premiers pas

Bienvenue sur **Physalis**, le coffre-fort de secrets de votre organisation.
Cette page vous accompagne de la réception de votre invitation jusqu'à
votre premier login sécurisé.

## Comprendre les URLs Physalis

Physalis est **multi-tenant** : chaque organisation cliente a son propre
sous-domaine isolé.

| URL                                | À quoi ça sert                                 |
|------------------------------------|------------------------------------------------|
| `<votre-slug>.physalis.cloud`      | Votre login, votre dashboard — c'est ici que vous vivez |
| `vault.physalis.cloud`             | Portail super-admin de la plateforme — vous n'y allez normalement jamais |

Le `<slug>` est le nom court de votre organisation (par exemple `argoweb`,
`scroll`…). Il est défini par le super-admin lors de la création du compte
client et apparaît dans le lien d'invitation que vous recevez.

> 💡 **Bookmark** : ajoutez votre sous-domaine en favori dès le premier login.
> C'est votre porte d'entrée unique.

## 1. Recevoir et accepter l'invitation

Un membre administrateur de votre organisation vous a invité par email
(via Mailgun, depuis `noreply@physalis.cloud`).

L'email contient un lien d'activation **valable 48h**. Si le délai expire,
demandez à l'admin de relancer une nouvelle invitation — le lien précédent
devient inutilisable.

En cliquant sur le lien, vous arrivez sur une page de création de compte :

- **Email** : pré-rempli, non modifiable (lié à l'invitation)
- **Nom complet** : libre
- **Mot de passe** : 12 caractères minimum recommandés, mix lettres / chiffres / symboles

À la validation, votre compte est créé, vous êtes ajouté à l'organisation
avec le rôle prédéfini par l'admin (voir [Organisations & rôles](organisations-et-roles)),
et automatiquement connecté.

## 2. Se connecter depuis votre sous-domaine

À chaque retour sur Physalis, allez directement sur **`<votre-slug>.physalis.cloud/login`**
(jamais sur `vault.physalis.cloud` — ce portail n'accepte pas les comptes
utilisateurs des organisations).

Si vous tentez de vous connecter sur le mauvais domaine, vous obtiendrez
une erreur d'identifiants invalides même si votre mot de passe est correct.

## 3. Activer la 2FA (fortement recommandé)

Le 2FA (authentification à deux facteurs) ajoute un code à 6 chiffres
généré par votre téléphone à chaque login. Sans lui, votre mot de passe
seul protège l'intégralité de vos secrets.

**Pour l'activer :**

1. Cliquez sur votre email en haut à droite du dashboard → vous arrivez sur
   `/settings/security`.
2. Section **« Authentification à deux facteurs »**, cliquez sur
   **« Activer le 2FA »**.
3. Scannez le QR code avec une application TOTP :
   - **Bitwarden / Vaultwarden** (intégré au gestionnaire)
   - **1Password**, **Authy**, **Google Authenticator**, **Aegis** (Android)
   - Ou directement le coffre Physalis (voir [Coffres](coffres))
4. Saisissez le code à 6 chiffres affiché par l'application pour valider.
5. **Sauvegardez les 8 codes de secours** affichés une seule fois. Stockez-les
   dans votre coffre Physalis ou ailleurs en lieu sûr — ils sont la seule
   façon de récupérer l'accès si vous perdez votre téléphone.

Au prochain login, après email + mot de passe, le code TOTP sera demandé
sur le même écran (UX en une étape).

> ⚠️ **L'extension navigateur exige le 2FA** pour s'authentifier. Si vous
> prévoyez d'installer l'extension, activez le 2FA d'abord.

## 4. Explorer le dashboard

Une fois connecté, la barre de navigation en haut vous donne accès à :

- **Projets** — les applications de votre organisation, leurs environnements,
  leurs secrets ([→ Projets & environnements](projets-et-environnements))
- **🔒 Coffre personnel** — votre coffre privé pour vos credentials non liés
  à un projet (voir [Coffres](coffres))
- **📤 Partages** — partager un secret en lien à usage unique, ou demander
  à un tiers de vous transmettre un secret de façon chiffrée
  ([→ Partages](partages))
- **📖 Documentation** — la doc que vous lisez actuellement

L'**organisation active** (si vous appartenez à plusieurs) se change via
le sélecteur en haut à gauche.

## 5. Que faire ensuite ?

- **Vous êtes développeur** → installez l'[extension navigateur](extension-navigateur)
  pour l'auto-fill des credentials sur vos sites web.
- **Vous êtes admin de votre organisation** → consultez
  [Organisations & rôles](organisations-et-roles) pour inviter d'autres
  membres et configurer les permissions.
- **Vous configurez un déploiement CI/CD** → lisez
  [Déploiement OIDC](deploiement-oidc).

## Mot de passe oublié

Sur la page de login, le lien **« Mot de passe oublié ? »** envoie un email
avec un lien de réinitialisation valable 1h. Le mot de passe peut être
choisi sans connaître l'ancien — assurez-vous d'avoir accès à votre boîte
mail.

> Si vous avez le 2FA activé et que vous avez aussi perdu votre téléphone,
> utilisez un de vos **codes de secours** pour passer la 2FA juste après
> avoir réinitialisé le mot de passe.
