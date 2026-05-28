---
title: Partages
order: 6
icon: RiShareForward2Line
summary: Lien à usage unique vs demande externe chiffrée (ECDH).
---

# Partages

Le menu **📤 Partages** regroupe deux flux distincts pour échanger des
secrets de façon sécurisée avec des personnes **extérieures** à
Physalis (clients, prestataires, candidats…) — ou même avec vous-même
(transfert d'un appareil à un autre).

| Flux                  | Sens                | Pour quoi ?                                         |
|-----------------------|---------------------|-----------------------------------------------------|
| **Mes partages**      | Vous → tiers        | Vous transmettez un secret à quelqu'un              |
| **Demandes externes** | Tiers → vous        | Vous demandez à quelqu'un de **vous** envoyer un secret |

Les deux flux fonctionnent **sans compte Physalis** côté destinataire /
expéditeur. Tous les chiffrements sont effectués côté navigateur.

## Mes partages (lien à usage unique)

Pattern type **Bitwarden Send / OneTimeSecret / Privnote** : vous
saisissez un secret, vous obtenez un lien unique chiffré que vous
envoyez par votre canal de communication habituel (email, Slack,
Signal…). Le destinataire clique, lit le secret, c'est fini.

### Créer un partage

1. Sur `/shares`, onglet **« Mes partages »** (par défaut).
2. Bouton **« 📤 Créer un partage »** dans la barre d'onglets.
3. Saisissez :
   - **Libellé** — visible uniquement dans votre dashboard pour
     retrouver le partage (jamais transmis au destinataire)
   - **Contenu** — le secret à partager (texte libre)
   - **TTL (durée de vie)** — 1h, 24h, 7 jours, 30 jours
   - **Mode de destruction** — *one-shot* (détruit après la 1ʳᵉ lecture)
     ou *expiration* (détruit à l'échéance, peu importe le nombre de
     lectures)
   - **Email destinataire** *(facultatif)* — Physalis enverra un email
     de notification via Mailgun avec le lien
4. Validez. Le lien généré ressemble à :
   ```
   https://<votre-slug>.physalis.cloud/share/abc123#XXXXXXXXXXXX
   ```
   - Le segment **après le `#`** est la **clé de déchiffrement** — elle
     n'est **jamais envoyée au serveur** Physalis (les fragments d'URL
     restent côté navigateur)
   - Sans cette clé, le ciphertext stocké en DB est inutilisable

### Le destinataire lit le secret

Il clique sur le lien. La page :

1. Récupère le ciphertext depuis Physalis avec le segment chemin (`abc123`)
2. Récupère la clé depuis le fragment d'URL (`#XXXXX...`)
3. Déchiffre dans le navigateur, affiche le contenu

Si le partage était en mode **one-shot**, il est immédiatement **détruit
en DB** après cette lecture. Toute tentative d'accès ultérieure
retourne 410 Gone.

### Révoquer un partage avant expiration

Dans la liste de vos partages → bouton **« Révoquer »**. Le ciphertext
est supprimé immédiatement de la DB, le lien devient inutilisable.

## Demandes externes (SecretRequest, ECDH)

Cas d'usage inverse : **vous voulez qu'un client / prestataire vous
transmette un secret** (un mot de passe, une clé d'API…) sans qu'il ait
à créer un compte Physalis ni à utiliser un canal douteux.

C'est le flux **Demandes externes**, qui utilise du chiffrement **ECDH
P-256 + AES-GCM** entièrement côté navigateur — Physalis ne voit
**jamais** le secret en clair, même fugitivement.

### Créer une demande

1. Sur `/shares`, onglet **« Demandes externes »**.
2. Bouton **« + Autoriser un partage externe »** dans la barre d'onglets.
3. Saisissez :
   - **Libellé** — décrit ce que vous attendez (ex. « Mot de passe
     admin OVH du client X »)
   - **Email destinataire** — le tiers à qui vous envoyez le lien
   - **TTL** — durée pendant laquelle le tiers peut soumettre
   - **(option) Importer dans un Secret** — sélectionner un projet +
     environnement + clé pour permettre l'import en un clic après
     déchiffrement
4. Validez. Physalis génère :
   - Une **paire de clés ECDH P-256** dans **votre navigateur**
   - La **clé publique** est envoyée à Physalis et associée à la
     demande
   - La **clé privée** vous est affichée **une seule fois** — copiez-la
     dans votre coffre personnel (entrée dédiée recommandée)
5. Un email part vers le destinataire avec un lien
   `https://<votre-slug>.physalis.cloud/request/<token>`.

### Le destinataire soumet le secret

Sur la page publique :

1. Saisit le secret dans un input password
2. Le navigateur **génère une paire éphémère**, dérive un secret partagé
   ECDH avec la clé publique de la demande, chiffre le secret en
   AES-GCM
3. Envoie à Physalis : ciphertext + IV + clé publique éphémère
4. La clé privée éphémère est **détruite** côté navigateur

Physalis stocke ces 3 éléments — **inutilisables sans votre clé privée**.

### Vous révélez le secret

De retour sur `/shares`, onglet **« Demandes externes »**, votre demande
montre maintenant l'état **« Soumis »**. Cliquez sur **« Révéler »** :

1. Une boîte de dialogue vous demande de **coller votre clé privée**
   (celle copiée à l'étape 4 de la création)
2. Le navigateur effectue l'ECDH inverse, déchiffre, affiche le secret
3. Boutons disponibles :
   - **📋 Copier** dans le presse-papier
   - **« Importer → env / clé »** — si vous aviez configuré
     l'import auto à la création, écrit le secret dans le `Secret`
     correspondant en un clic

> 🔐 La clé privée n'est **jamais envoyée à Physalis** — vous pouvez
> vérifier dans l'inspecteur réseau que la requête `/reveal` ne
> récupère que ciphertext + IV + ephemeralPublicJwk.

### Révoquer une demande

Si le tiers tarde ou si vous changez d'avis, bouton **« Révoquer »** sur
la demande. Le destinataire obtient une erreur 410 Gone s'il tente
encore de soumettre.

## Aller plus loin

- [Coffres](coffres) — où stocker durablement la clé privée d'une
  SecretRequest pour pouvoir la déchiffrer plus tard
- [Premiers pas](premiers-pas) — pour le destinataire qui se demanderait
  ce qu'est ce lien Physalis qu'il vient de recevoir
