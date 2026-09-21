#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$(cd "$ROOT/.." && pwd)/.env"
if [[ -z "${DATABASE_URL:-}" && -f "$ENV_FILE" ]]; then
  DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//;s/"$//;s/^'\''//;s/'\''$//')"
  export DATABASE_URL
fi
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Set DATABASE_URL or add it to backend/.env"
  exit 1
fi
for f in "$ROOT"/migrations/*.sql; do
  echo "Applying $(basename "$f")..."
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -f "$f"
done
echo "Done."
