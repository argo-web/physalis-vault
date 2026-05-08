#!/bin/bash
# physalis-restore.sh — VPS SECONDAIRE
#
# Restauration MANUELLE (interactive) — destructive, demande confirmation.
# Utilise pour le failover ou pour rebuild la DB du secondaire.
#
# Usage :
#   sudo /usr/local/bin/physalis-restore.sh                    # dernier backup
#   sudo /usr/local/bin/physalis-restore.sh /path/to/file.gpg  # backup specifique
#   sudo /usr/local/bin/physalis-restore.sh --yes              # skip confirmation (failover automatise)
#
# Installation :
#   sudo install -o root -g root -m 700 physalis-restore.sh /usr/local/bin/

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/srv/backups/physalis}"
COMPOSE_DIR="${COMPOSE_DIR:-/srv/projets/secretvault}"
DB_CONTAINER="${PHYSALIS_DB_CONTAINER:-physalis-db}"
DB_USER="${PHYSALIS_DB_USER:-physalis}"
DB_NAME="${PHYSALIS_DB_NAME:-physalis}"

# ── Parse args ──
SKIP_CONFIRM=0
BACKUP_FILE=""

for arg in "$@"; do
  case "$arg" in
    --yes|-y)
      SKIP_CONFIRM=1
      ;;
    -*)
      echo "Unknown flag: $arg" >&2
      exit 2
      ;;
    *)
      BACKUP_FILE="$arg"
      ;;
  esac
done

# Defaut : le plus recent
if [ -z "$BACKUP_FILE" ]; then
  BACKUP_FILE=$(ls -t "$BACKUP_DIR"/physalis-*.db.gz.gpg 2>/dev/null | head -1 || true)
fi

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: backup file not found." >&2
  echo "Usage: $0 [/path/to/backup.gpg] [--yes]" >&2
  exit 1
fi

if [ ! -d "$COMPOSE_DIR" ]; then
  echo "ERROR: COMPOSE_DIR does not exist: $COMPOSE_DIR" >&2
  exit 1
fi

# ── Confirmation ──
echo "================================================================"
echo "  RESTAURATION DESTRUCTIVE"
echo "================================================================"
echo "  Source    : $BACKUP_FILE"
echo "  Taille    : $(du -h "$BACKUP_FILE" | cut -f1)"
echo "  Cible     : $DB_CONTAINER ($DB_NAME)"
echo "  Compose   : $COMPOSE_DIR"
echo
echo "  La base $DB_NAME va etre DROPPEE puis recreee depuis ce backup."
echo "  L'app Physalis va etre redemarree."
echo "================================================================"

if [ "$SKIP_CONFIRM" -eq 0 ]; then
  read -r -p "Tape 'restore' pour confirmer : " confirm
  if [ "$confirm" != "restore" ]; then
    echo "Annule."
    exit 0
  fi
fi

cd "$COMPOSE_DIR"

# 1. Stop l'app (DB reste up pour la restau)
echo "→ docker compose stop app"
docker compose stop app

# 2. Drop + recreate la DB cible (SQL via le container DB)
echo "→ drop + create database $DB_NAME"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS $DB_NAME;"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d postgres \
  -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"

# 3. Decrypt + decompress + import. `--single-transaction` = atomique :
# si une seule erreur, la DB reste vide au lieu d'etre a moitie restauree.
echo "→ restoring from $(basename "$BACKUP_FILE")"
gpg --batch --decrypt < "$BACKUP_FILE" \
  | gunzip \
  | docker exec -i "$DB_CONTAINER" psql \
      -U "$DB_USER" -d "$DB_NAME" --single-transaction --quiet

# 4. Redemarre l'app
echo "→ docker compose start app"
docker compose start app

# 5. Sanity : compter les rows User pour confirmer non-vide
sleep 3
ROWS=$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" \
       -tAc 'SELECT count(*) FROM "User"' 2>/dev/null || echo 0)
echo
echo "✓ Restore done — $ROWS rows in User table"
echo "  Verifier maintenant la sante de l'app :"
echo "    curl http://localhost:3001/api/auth/csrf"
echo "    docker compose logs --tail 50 app"
