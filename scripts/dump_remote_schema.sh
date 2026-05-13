#!/usr/bin/env bash
# Dump linked Supabase Postgres schema (tables, views, functions, triggers, types — no data).
# Usage:
#   1) Preferred (matches Supabase CLI filters): start Docker Desktop, then:
#        ./scripts/dump_remote_schema.sh
#   2) Without Docker: set a direct DB URL (port 5432, not pooler), then:
#        SUPABASE_DB_DIRECT_URL='postgresql://postgres:YOUR_PASSWORD@db.<ref>.supabase.co:5432/postgres?sslmode=require' ./scripts/dump_remote_schema.sh
#
# Output defaults to backups/YYYYMMDD/linked_schema_pg_dump.sql (gitignored via backups/202*/).

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DAY="$(date -u +%Y%m%d)"
OUT_DIR="${OUT_DIR:-$ROOT/backups/$DAY}"
OUT_FILE="${OUT_FILE:-$OUT_DIR/linked_schema_pg_dump.sql}"
mkdir -p "$OUT_DIR"

if [[ -n "${SUPABASE_DB_DIRECT_URL:-}" ]]; then
  PG_DUMP="${PG_DUMP:-$(command -v pg_dump || true)}"
  if [[ -z "$PG_DUMP" ]] && [[ -x /opt/homebrew/opt/libpq/bin/pg_dump ]]; then
    PG_DUMP="/opt/homebrew/opt/libpq/bin/pg_dump"
  fi
  if [[ -z "$PG_DUMP" ]]; then
    echo "pg_dump not found. Install: brew install libpq  (then use /opt/homebrew/opt/libpq/bin/pg_dump)" >&2
    exit 1
  fi
  echo "Using pg_dump with SUPABASE_DB_DIRECT_URL -> $OUT_FILE"
  "$PG_DUMP" --schema-only --no-owner --no-privileges \
    --quote-all-identifiers \
    --schema=public \
    --file="$OUT_FILE" \
    "$SUPABASE_DB_DIRECT_URL"
  echo "Done. Lines: $(wc -l < "$OUT_FILE")"
  exit 0
fi

if docker info >/dev/null 2>&1; then
  echo "Using supabase db dump --linked -> $OUT_FILE"
  cd "$ROOT"
  supabase db dump --linked -f "$OUT_FILE" --keep-comments
  echo "Done. Lines: $(wc -l < "$OUT_FILE")"
  exit 0
fi

echo "Neither Docker nor SUPABASE_DB_DIRECT_URL is available." >&2
echo "  • Start Docker Desktop and re-run this script, or" >&2
echo "  • Export SUPABASE_DB_DIRECT_URL (Database settings → URI, direct connection)." >&2
echo "A migration-only snapshot is at: backups/$DAY/schema_from_migrations.sql (regenerate via shell glob on supabase/migrations/202*.sql)." >&2
exit 1
