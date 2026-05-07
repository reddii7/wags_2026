#!/usr/bin/env bash
# Wipe and reload all 29 weeks of 2025 data.
# Run from any directory: bash supabase/scripts/reload_2025_all_weeks.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."

echo "=== RESETTING 2025 DATA ==="
python3 supabase/scripts/import_2025_one_week.py --reset --week 1

for w in $(seq 2 29); do
  printf "\n=== WEEK %02d ===\n" "$w"
  python3 supabase/scripts/import_2025_one_week.py --week "$w"
done

echo ""
echo "=== ALL 29 WEEKS LOADED ==="
