#!/bin/bash
# physalis-test-restore.sh — VPS SECONDAIRE
#
# Test mensuel automatise : restaure le dernier backup dans une DB Postgres
# scratch (container ephemere isole de la prod), compte les rows d'une
# table sentinelle, supprime le container.
#
# Echec a n'importe quelle etape = alerte healthchecks.io.
#
# Variables d'env :
#   RESTORETEST_UUID   : UUID du check healthchecks.io dedie (optionnel)
#   BACKUP_DIR         : default /srv/backups/physalis
#   PG_TEST_IMAGE      : default postgres:16-alpine
#
# Installation :
#   sudo install -o root -g root -m 700 physalis-test-restore.sh /usr/local/bin/

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/srv/backups/physalis}"
LOG="${BACKUP_LOG:-/var/log/physalis-backup.log}"
PG_TEST_IMAGE="${PG_TEST_IMAGE:-postgres:16-alpine}"
PG_TEST_NAME="physalis-restoretest-$$"
PG_TEST_DB="secretvault_restoretest"
PG_TEST_PASSWORD="$(openssl rand -hex 16)"
HC_BASE="https://hc-ping.com"

log() {
  echo "$(date -Iseconds) [test-restore] $*" | tee -a "$LOG" >&2
}

hc_ping() {
  local suffix="${1:-}"
  local body="${2:-}"
  if [ -n "${RESTORETEST_UUID:-}" ]; then
    curl -fsS -m 10 --retry 3 --retry-delay 5 \
      "${HC_BASE}/${RESTORETEST_UUID}${suffix}" \
      ${body:+--data-raw "$body"} >/dev/null || true
  fi
}

cleanup() {
  docker rm -f "$PG_TEST_NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  log "FAILURE: $*"
  hc_ping "/fail" "$*"
  exit 1
}

hc_ping "/start"

# 1. Trouver le dernier backup
LATEST=$(ls -t "$BACKUP_DIR"/physalis-*.db.gz.gpg 2>/dev/null | head -1 || true)
if [ -z "$LATEST" ]; then
  fail "no backup file found in $BACKUP_DIR"
fi
log "testing restore of $(basename "$LATEST")"

# 2. Lancer un Postgres ephemere isole (port aleatoire interne, pas expose)
if ! docker run --rm -d \
       --name "$PG_TEST_NAME" \
       -e POSTGRES_PASSWORD="$PG_TEST_PASSWORD" \
       -e POSTGRES_DB="$PG_TEST_DB" \
       "$PG_TEST_IMAGE" >/dev/null; then
  fail "failed to start ephemeral Postgres ($PG_TEST_IMAGE)"
fi

# Attendre l'initdb (max 30s)
for _ in $(seq 1 15); do
  if docker exec "$PG_TEST_NAME" pg_isready -U postgres >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
if ! docker exec "$PG_TEST_NAME" pg_isready -U postgres >/dev/null 2>&1; then
  fail "Postgres did not become ready within 30s"
fi

# 3. Decrypt + restore dans la DB scratch (--single-transaction = atomique)
if ! gpg --batch --decrypt < "$LATEST" 2>/dev/null \
     | gunzip \
     | docker exec -i "$PG_TEST_NAME" psql \
         -U postgres -d "$PG_TEST_DB" \
         --single-transaction --quiet >/dev/null; then
  fail "restore stream failed (decrypt/gunzip/psql)"
fi

# 4. Compter les rows User — table sentinelle obligatoire
ROWS=$(docker exec "$PG_TEST_NAME" psql -U postgres -d "$PG_TEST_DB" \
        -tAc 'SELECT count(*) FROM "User"' 2>/dev/null || echo 0)

if ! [[ "$ROWS" =~ ^[0-9]+$ ]] || [ "$ROWS" -lt 1 ]; then
  fail "User table has $ROWS rows (expected >= 1)"
fi

# 5. Sanity additionnelle : presence de OrgSecret + Secret + Server
TABLES_OK=$(docker exec "$PG_TEST_NAME" psql -U postgres -d "$PG_TEST_DB" \
             -tAc "SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename IN ('User','Organization','Secret','Server','Policy')" \
             2>/dev/null || echo 0)
if [ "$TABLES_OK" != "5" ]; then
  fail "expected 5 core tables, got $TABLES_OK"
fi

log "OK: $ROWS users, 5/5 core tables present in $(basename "$LATEST")"
hc_ping "" "$(basename "$LATEST"): $ROWS users, schema OK"
