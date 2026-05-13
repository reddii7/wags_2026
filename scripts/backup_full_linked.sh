#!/usr/bin/env bash
# Full logical backup of the *linked* Supabase project (schema + public data).
#
# Option A — Docker running (same as `supabase db dump`):
#   ./scripts/backup_full_linked.sh
#
# Option B — no Docker: use direct Postgres URI (Settings → Database → Connection string → URI; host db.<ref>.supabase.co:5432):
#   export SUPABASE_DB_DIRECT_URL='postgresql://postgres:YOUR_DB_PASSWORD@db.iwzqzpzskawxrwhttufq.supabase.co:5432/postgres?sslmode=require'
#   ./scripts/backup_full_linked.sh
#
# Restore (rough order): psql "$URL" -f schema.sql && psql "$URL" -f data.sql
# Or single-file: psql "$URL" -f full.sql
#
# Output: backups/<UTCstamp>_full_pg/{schema.sql,data.sql} or full.sql — under backups/202* (gitignored).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STAMP="$(date -u +%Y%m%d_%H%M%S)"
OUT_DIR="${OUT_DIR:-$ROOT/backups/${STAMP}_full_pg}"
mkdir -p "$OUT_DIR"

resolve_pg_dump() {
  if command -v pg_dump >/dev/null 2>&1; then
    command -v pg_dump
    return
  fi
  if [[ -x /opt/homebrew/opt/libpq/bin/pg_dump ]]; then
    echo /opt/homebrew/opt/libpq/bin/pg_dump
    return
  fi
  echo ""
}

if [[ -n "${SUPABASE_DB_DIRECT_URL:-}" ]]; then
  PG_DUMP="$(resolve_pg_dump)"
  if [[ -z "$PG_DUMP" ]]; then
    echo "pg_dump not found. Install: brew install libpq" >&2
    exit 1
  fi
  OUT_FILE="${OUT_DIR}/full.sql"
  echo "Using pg_dump (SUPABASE_DB_DIRECT_URL) -> $OUT_FILE"
  "$PG_DUMP" --no-owner --no-privileges --quote-all-identifiers \
    --schema=public \
    --file="$OUT_FILE" \
    "$SUPABASE_DB_DIRECT_URL"
  ls -lh "$OUT_FILE"
  echo "Lines: $(wc -l < "$OUT_FILE")"
  exit 0
fi

if docker info >/dev/null 2>&1; then
  cd "$ROOT"
  echo "Using supabase db dump --linked -> $OUT_DIR/"
  supabase db dump --linked -f "$OUT_DIR/schema.sql" --keep-comments
  supabase db dump --linked --data-only -f "$OUT_DIR/data.sql" --keep-comments
  ls -lh "$OUT_DIR"
  wc -l "$OUT_DIR"/*.sql
  exit 0
fi

echo "Cannot run backup: Docker is not running and SUPABASE_DB_DIRECT_URL is unset." >&2
echo "" >&2
echo "  1) Start Docker Desktop, then re-run:  ./scripts/backup_full_linked.sh" >&2
echo "  2) Or set the DB URI and re-run:" >&2
echo "     export SUPABASE_DB_DIRECT_URL='postgresql://postgres:PASSWORD@db.iwzqzpzskawxrwhttufq.supabase.co:5432/postgres?sslmode=require'" >&2
echo "     ./scripts/backup_full_linked.sh" >&2
exit 1
