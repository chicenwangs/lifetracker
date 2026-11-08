#!/usr/bin/env bash
# Nightly online backup of the planner DB. Safe while the app runs (SQLite .backup API).
# Install: sudo apt install sqlite3 ; cron: 15 3 * * * /opt/life-tracker/backup.sh >> /opt/life-tracker/backup.log 2>&1
# Env overrides: LT_DIR (default: this script's folder), LT_KEEP_DAYS (14), LT_OFFSITE (rsync target, optional)
set -euo pipefail
LT_DIR=${LT_DIR:-$(cd "$(dirname "$0")" && pwd)}
KEEP=${LT_KEEP_DAYS:-14}
DB="$LT_DIR/data/app.db"
OUT="$LT_DIR/data/backups"
[ -f "$DB" ] || { echo "no db at $DB" >&2; exit 1; }
mkdir -p "$OUT"
ts=$(date +%F-%H%M)
f="$OUT/app-$ts.db"
sqlite3 "$DB" ".backup '$f'"
[ "$(sqlite3 "$f" 'PRAGMA integrity_check')" = ok ] || { echo "integrity check failed: $f" >&2; exit 1; }
gzip "$f"
find "$OUT" -name 'app-*.db.gz' -mtime +"$KEEP" -delete
if [ -n "${LT_OFFSITE:-}" ]; then rsync -a "$OUT/" "$LT_OFFSITE/"; fi
echo "$(date -Is) backup ok: $f.gz"
