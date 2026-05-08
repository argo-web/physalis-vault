#!/bin/bash
# physalis-rotate.sh — VPS SECONDAIRE
#
# Politique de retention :
#   - 7 backups quotidiens (les plus recents)
#   - 12 backups mensuels (ceux du 1er du mois, 12 plus recents)
#   - Tout le reste est supprime
#
# Le 1er du mois, le backup quotidien EST aussi le mensuel — un seul
# fichier, compte une seule fois (donc 18 fichiers max steady-state).
#
# Idempotent : peut etre relance sans risque, ne supprime rien qui devrait
# etre garde. Logge chaque suppression.
#
# Installation :
#   sudo install -o root -g root -m 700 physalis-rotate.sh /usr/local/bin/

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/srv/backups/physalis}"
LOG="${BACKUP_LOG:-/var/log/physalis-backup.log}"
DAILY_KEEP="${DAILY_KEEP:-7}"
MONTHLY_KEEP="${MONTHLY_KEEP:-12}"

log() {
  echo "$(date -Iseconds) [rotate] $*" | tee -a "$LOG" >&2
}

cd "$BACKUP_DIR"

# Pas de fichier ? rien a faire (premier run).
if ! ls -1 physalis-*.db.gz.gpg >/dev/null 2>&1; then
  log "no backups found, nothing to rotate"
  exit 0
fi

KEEP=$(mktemp)
trap 'rm -f "$KEEP"' EXIT

# Ensemble 1 : les N plus recents (quotidiens)
ls -1 physalis-*.db.gz.gpg \
  | sort -r \
  | head -n "$DAILY_KEEP" \
  >> "$KEEP"

# Ensemble 2 : les N plus recents qui sont datés du 1er du mois
ls -1 physalis-*.db.gz.gpg \
  | grep -E 'secretvault-[0-9]{4}-[0-9]{2}-01\.db\.gz\.gpg$' \
  | sort -r \
  | head -n "$MONTHLY_KEEP" \
  >> "$KEEP" || true   # `|| true` : si aucun match, head retourne 0 mais grep retourne 1

# Union (dedup)
sort -u "$KEEP" -o "$KEEP"

KEPT_COUNT=$(wc -l < "$KEEP")
DELETED_COUNT=0

# Tout fichier qui n'est PAS dans KEEP est supprime
while IFS= read -r f; do
  if ! grep -qx "$f" "$KEEP"; then
    rm -f -- "$f"
    log "deleted $f"
    DELETED_COUNT=$((DELETED_COUNT + 1))
  fi
done < <(ls -1 physalis-*.db.gz.gpg)

log "rotation done: $KEPT_COUNT kept, $DELETED_COUNT deleted"
