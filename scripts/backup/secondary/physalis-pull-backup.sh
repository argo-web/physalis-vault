#!/bin/bash
# physalis-pull-backup.sh — VPS SECONDAIRE
#
# Lance le pull quotidien depuis le primaire :
#   1. ssh primary → recoit le stream chiffre GPG du dump
#   2. Verifie l'integrite (decrypt + gunzip + grep entete pg_dump)
#   3. Rename atomique (.partial → fichier final) si OK, sinon supprime
#   4. Heartbeat externe (healthchecks.io) success ou failure
#
# Ne touche pas a la rotation — c'est physalis-rotate.sh qui s'en charge.
#
# Variables d'env attendues (cf. /etc/cron.d/secretvault-backup) :
#   HEALTHCHECK_UUID  : UUID du check healthchecks.io (optionnel, skip si vide)
#   PRIMARY_HOST      : default vault.argoweb.fr
#   PRIMARY_USER      : default backup-pull
#   SSH_KEY           : default /root/.ssh/id_backup_pull
#   BACKUP_DIR        : default /srv/backups/physalis
#
# Installation :
#   sudo install -o root -g root -m 700 physalis-pull-backup.sh /usr/local/bin/

set -euo pipefail

PRIMARY_HOST="${PRIMARY_HOST:-vault.argoweb.fr}"
PRIMARY_USER="${PRIMARY_USER:-backup-pull}"
SSH_KEY="${SSH_KEY:-/root/.ssh/id_backup_pull}"
BACKUP_DIR="${BACKUP_DIR:-/srv/backups/physalis}"
LOG="${BACKUP_LOG:-/var/log/physalis-backup.log}"
HC_BASE="https://hc-ping.com"

DATE=$(date +%Y-%m-%d)
BACKUP_FILE="$BACKUP_DIR/physalis-$DATE.db.gz.gpg"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

log() {
  echo "$(date -Iseconds) $*" | tee -a "$LOG" >&2
}

hc_ping() {
  # $1 = "" pour success, "/fail" pour echec, "/start" pour debut
  local suffix="${1:-}"
  local body="${2:-}"
  if [ -n "${HEALTHCHECK_UUID:-}" ]; then
    curl -fsS -m 10 --retry 3 --retry-delay 5 \
      "${HC_BASE}/${HEALTHCHECK_UUID}${suffix}" \
      ${body:+--data-raw "$body"} >/dev/null || true
  fi
}

fail() {
  log "FAILURE: $*"
  hc_ping "/fail" "$*"
  exit 1
}

# Signal start (utile pour healthchecks.io qui peut detecter les jobs trop longs)
hc_ping "/start"

# 1. Pull stream chiffre depuis le primaire
log "Pulling backup from $PRIMARY_USER@$PRIMARY_HOST"
if ! ssh -i "$SSH_KEY" \
       -T \
       -o BatchMode=yes \
       -o ConnectTimeout=30 \
       -o ServerAliveInterval=15 \
       -o ServerAliveCountMax=4 \
       "$PRIMARY_USER@$PRIMARY_HOST" \
       dump-physalis > "$BACKUP_FILE.partial"; then
  rm -f "$BACKUP_FILE.partial"
  fail "ssh pull failed (host: $PRIMARY_HOST)"
fi

# 2. Sanity : taille minimale (un dump < 1 KiB est forcement louche)
PARTIAL_SIZE=$(stat -c '%s' "$BACKUP_FILE.partial" 2>/dev/null || echo 0)
if [ "$PARTIAL_SIZE" -lt 1024 ]; then
  rm -f "$BACKUP_FILE.partial"
  fail "backup too small ($PARTIAL_SIZE bytes), suspect partial transfer"
fi

# 3. Verification d'integrite : on doit pouvoir decrypter, decompresser,
# et trouver l'entete `PostgreSQL database dump` dans les premiers Ko.
if ! (set +o pipefail; gpg --batch --decrypt < "$BACKUP_FILE.partial" 2>/dev/null \
       | gunzip 2>/dev/null \
       | head -c 4096 \
       | grep -q "PostgreSQL database dump"); then
  rm -f "$BACKUP_FILE.partial"
  fail "integrity check failed for $(basename "$BACKUP_FILE")"
fi

# 4. Rename atomique : le fichier final apparait UNIQUEMENT s'il est valide.
mv "$BACKUP_FILE.partial" "$BACKUP_FILE"
chmod 600 "$BACKUP_FILE"

SIZE_HUMAN=$(du -h "$BACKUP_FILE" | cut -f1)
log "OK: $(basename "$BACKUP_FILE") ($SIZE_HUMAN)"
hc_ping "" "$(basename "$BACKUP_FILE") $SIZE_HUMAN"
