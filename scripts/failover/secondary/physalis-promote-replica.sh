#!/bin/bash
# physalis-promote-replica.sh — VPS SECONDAIRE
#
# Failover automatise : le primaire est tombe, on promeut le replica
# streaming en standalone et on bascule l'app secondary dessus.
#
# Pre-requis :
#   - Le container "secretvault-db-replica" doit etre attache au
#     network "secretvault_db_network" (cf. vps/production/replica/
#     docker-compose.yml). Sans ca, l'app ne peut pas joindre le replica.
#   - Le primaire doit etre confirme inaccessible (pg_isready timeout).
#
# Etapes :
#   1. Verifier que le primaire ne repond pas
#   2. pg_ctl promote sur le replica
#   3. Verifier que le replica est sur le network app
#   4. Update DATABASE_URL dans le .env de l'app pour pointer sur le
#      replica, recreate l'app
#   5. Smoke test
#
# Post-failover (manuel) :
#   - Update DNS : vault.physalis.cloud -> IP_SECONDAIRE
#   - Update NEXTAUTH_URL si besoin (https://vault.physalis.cloud)
#   - Reconstruire l'ancien primary comme nouveau replica
#
# Variables d'env (override via /etc/default ou en ligne) :
#   PRIMARY_HOST       default 51.91.79.48
#   PRIMARY_PORT       default 5432
#   COMPOSE_DIR        default /srv/projets/production/secretvault
#   REPLICA_CONTAINER  default secretvault-db-replica
#
# Usage :
#   sudo /usr/local/bin/physalis-promote-replica.sh

set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-51.91.79.48}"
PRIMARY_PORT="${PRIMARY_PORT:-5432}"
COMPOSE_DIR="${COMPOSE_DIR:-/srv/projets/production/secretvault}"
REPLICA_CONTAINER="${REPLICA_CONTAINER:-secretvault-db-replica}"
APP_DB_NETWORK="${APP_DB_NETWORK:-secretvault_db_network}"
LOG="${LOG:-/var/log/physalis-failover.log}"

log() {
  echo "$(date -Iseconds) $*" | tee -a "$LOG" >&2
}

fail() {
  log "ERROR: $*"
  exit 1
}

log "=== FAILOVER INITIATED ==="

# 1. Verify primary unreachable.
# Use pg_isready from inside the replica container — guarantees the binary
# exists, and tests connectivity via the same network the replica uses.
# pg_isready exit codes:
#   0 = accepting connections
#   1 = rejecting (server up but not ready) → primary still alive, refuse
#   2 = no response (server down, network failure, host unreachable)
#   3 = no attempt (bad params)
log "[1/5] Checking primary at $PRIMARY_HOST:$PRIMARY_PORT"
set +e
docker exec "$REPLICA_CONTAINER" pg_isready -h "$PRIMARY_HOST" -p "$PRIMARY_PORT" -t 5 >/dev/null 2>&1
PG_RC=$?
set -e
case "$PG_RC" in
  0|1)
    fail "Primary is reachable (pg_isready=$PG_RC). Refusing to promote (split-brain risk)."
    ;;
  2)
    log "  primary unreachable (pg_isready=2), proceeding"
    ;;
  *)
    fail "Unexpected pg_isready exit ($PG_RC) — refusing to promote, investigate manually."
    ;;
esac

# Confirmation interactive sauf si --yes
if [ "${1:-}" != "--yes" ] && [ "${1:-}" != "-y" ]; then
  echo "About to promote replica $REPLICA_CONTAINER and switch app to it." >&2
  echo "This is DESTRUCTIVE on the existing replication relationship." >&2
  read -r -p "Type 'failover' to proceed: " confirm
  if [ "$confirm" != "failover" ]; then
    log "Aborted by user."
    exit 0
  fi
fi

# 2. Promote replica
log "[2/5] Promoting replica $REPLICA_CONTAINER"
if ! docker exec "$REPLICA_CONTAINER" pg_ctl promote -D /var/lib/postgresql/data; then
  fail "pg_ctl promote failed"
fi
sleep 3
RECOVERY=$(docker exec "$REPLICA_CONTAINER" psql -U physalis -tAc "SELECT pg_is_in_recovery();" 2>/dev/null | tr -d '[:space:]')
if [ "$RECOVERY" != "f" ]; then
  fail "Replica still in recovery (got '$RECOVERY')"
fi
log "  replica promoted, accepting writes"

# 3. Verify replica on app network
log "[3/5] Checking replica is reachable from app network"
if ! docker network inspect "$APP_DB_NETWORK" --format '{{range .Containers}}{{.Name}} {{end}}' \
     | grep -q "$REPLICA_CONTAINER"; then
  fail "Replica not on $APP_DB_NETWORK. Edit replica compose first (see runbook)."
fi
log "  replica on $APP_DB_NETWORK"

# 4. Switch app to replica
log "[4/5] Switching app DATABASE_URL to replica"
cd "$COMPOSE_DIR"
cp .env ".env.bak.failover-$(date +%Y%m%d-%H%M%S)"
# Replace only the host part, preserving user/password/db/options
sed -i -E "s|(DATABASE_URL=postgresql://[^@]+)@[^:]+(:[0-9]+/[^[:space:]]+)|\\1@${REPLICA_CONTAINER}\\2|" .env
NEW_URL=$(grep -E '^DATABASE_URL=' .env | sed 's|//[^:]*:[^@]*@|//***:***@|')
log "  new DATABASE_URL: $NEW_URL"

# Stop the empty local DB (frees resources, no longer used)
docker compose stop db || true

# Recreate app to pick up new DATABASE_URL.
# `--pull never` evite l'echec si ghcr est inaccessible : on utilise
# l'image deja en cache local (qui est celle qui tournait avant le
# failover, donc forcement valide).
docker compose up -d --no-deps --pull never app
sleep 5

# 5. Smoke test
log "[5/5] Smoke test"
APP_CID=$(docker compose ps -q app)
SUCCESS=0
for i in $(seq 1 12); do
  if docker exec "$APP_CID" wget -qO- http://localhost:3000/login >/dev/null 2>&1; then
    SUCCESS=1
    break
  fi
  sleep 5
done
if [ "$SUCCESS" -ne 1 ]; then
  fail "App not responding after 60s. Check 'docker logs $APP_CID'."
fi
log "  app responding"

log "=== FAILOVER COMPLETED ==="
log ""
log "Manual next steps :"
log "  1. Update DNS  : vault.physalis.cloud -> IP_SECONDAIRE"
log "  2. (optional)  : NEXTAUTH_URL=https://vault.physalis.cloud in .env, then 'docker compose up -d'"
log "  3. Rebuild ex-primary as new replica when host is back"
