#!/bin/bash
# physalis-dump.sh — VPS PRIMAIRE
#
# Forced-command appele par le secondaire via SSH. Ecrit sur stdout un
# stream chiffre GPG (= dump Postgres compresse + chiffre avec la cle
# publique de backup). Le secondaire redirige ce stream dans un fichier
# local.
#
# Aucun argument n'est lu : `command="..."` dans authorized_keys ignore
# tout ce que le client envoie. C'est volontaire — le secondaire ne peut
# RIEN faire d'autre que declencher ce script.
#
# Pre-requis sur le primaire :
#   - Container Postgres tournant, nomme $DB_CONTAINER (cf. docker-compose)
#   - Cle publique GPG `backup@argoweb.fr` importee dans le keyring du user
#     qui execute ce script (cf. authorized_keys → user backup-pull)
#   - User backup-pull dans le groupe `docker` (pour `docker exec` sans sudo)
#
# Installation :
#   sudo install -o root -g root -m 700 physalis-dump.sh /usr/local/bin/

set -euo pipefail

DB_CONTAINER="${PHYSALIS_DB_CONTAINER:-physalis-db}"
DB_USER="${PHYSALIS_DB_USER:-physalis}"
DB_NAME="${PHYSALIS_DB_NAME:-physalis}"
GPG_RECIPIENT="${PHYSALIS_GPG_RECIPIENT:-backup@argoweb.fr}"

# Verifier que le container DB tourne avant de demarrer le pipe (sinon
# le client recoit un stream vide qui passerait par le grep d'integrite).
if ! docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null \
     | grep -q true; then
  # Stderr ne sort PAS au client SSH (le forced-command ne propage que
  # stdout dans le pipe). Mais on log dans syslog pour diagnostic.
  logger -t physalis-dump "ERROR: container $DB_CONTAINER not running"
  exit 1
fi

# pg_dump → gzip → gpg (chiffrement avec la cle publique uniquement,
# le primaire ne peut PAS dechiffrer ses propres backups → bonne propriete
# en cas de compromission du primaire).
exec docker exec "$DB_CONTAINER" \
  pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip \
  | gpg --batch --trust-model always --encrypt --recipient "$GPG_RECIPIENT"
