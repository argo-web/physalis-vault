#!/usr/bin/env bash
#
# inject-secrets.sh — récupère les secrets d'un projet/env depuis SecretVault
# et les imprime au format `.env` sur stdout.
#
# Usage :
#   SECRET_VAULT_URL=https://secrets.example.com \
#   SECRET_VAULT_TOKEN=sv_xxxxxxxxxxxxxxxxxxxx \
#     ./inject-secrets.sh <project-slug> <environment>
#
#   ./inject-secrets.sh mon-projet production > .env
#
# Sortie : KEY="value" (valeur entre guillemets doubles, échappée à la dotenv)
#
# Codes de retour :
#   0 OK
#   1 mauvais usage
#   2 token absent
#   3 erreur réseau / API
#

set -euo pipefail

usage() {
  echo "Usage: $0 <project-slug> <environment>" >&2
  echo "Env vars : SECRET_VAULT_URL (défaut: https://secrets.artpotentiel.fr)," >&2
  echo "           SECRET_VAULT_TOKEN (obligatoire)" >&2
  exit 1
}

if [ "$#" -ne 2 ]; then
  usage
fi

PROJECT=$1
ENVIRONMENT=$2
API_URL=${SECRET_VAULT_URL:-https://secrets.artpotentiel.fr}
TOKEN=${SECRET_VAULT_TOKEN:-}

if [ -z "$TOKEN" ]; then
  echo "Error: SECRET_VAULT_TOKEN is not set." >&2
  exit 2
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required but not installed." >&2
  exit 1
fi

HTTP_CODE=$(curl -sS -o /tmp/sv-resp.$$ -w "%{http_code}" \
  -H "Authorization: Bearer $TOKEN" \
  "$API_URL/api/secrets/$PROJECT/$ENVIRONMENT" || echo "000")

if [ "$HTTP_CODE" != "200" ]; then
  echo "Error: HTTP $HTTP_CODE from $API_URL" >&2
  cat /tmp/sv-resp.$$ >&2 || true
  rm -f /tmp/sv-resp.$$
  exit 3
fi

# Sortie au format dotenv : KEY="value" avec échappement \\ \" \$ \`
jq -r '
  .secrets
  | to_entries
  | sort_by(.key)
  | .[]
  | .key + "=\"" + (
      .value
      | gsub("\\\\"; "\\\\")
      | gsub("\""; "\\\"")
      | gsub("\\$"; "\\$")
      | gsub("`"; "\\`")
    ) + "\""
' /tmp/sv-resp.$$

rm -f /tmp/sv-resp.$$
