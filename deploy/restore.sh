#!/usr/bin/env bash
# Restore the planner DB from a backup. Stops the app, keeps the current DB aside, starts it again.
# Usage: sudo ./restore.sh data/backups/app-2026-11-08-0315.db.gz
set -euo pipefail
umask 077
[ "$(id -u)" -eq 0 ] || { echo "run as root: sudo $0 $*" >&2; exit 1; }
LT_DIR=${LT_DIR:-$(cd "$(dirname "$0")" && pwd)}
src=$(realpath "${1:?usage: restore.sh <backup .db or .db.gz>}")
cd "$LT_DIR"
tmp=$(mktemp -d)
stopped=0
# always clean up; if we stopped the app and something failed, start it again
trap 'rm -rf "$tmp"; [ "$stopped" = 1 ] && docker compose start app' EXIT
case "$src" in *.gz) gunzip -c "$src" > "$tmp/app.db" ;; *) cp "$src" "$tmp/app.db" ;; esac
[ "$(sqlite3 "$tmp/app.db" 'PRAGMA integrity_check')" = ok ] || { echo "backup is corrupt: $src" >&2; exit 1; }
docker compose stop app
stopped=1
ts=$(date +%F-%H%M%S)
[ -f data/app.db ] && mv data/app.db "data/app.db.pre-restore-$ts"
rm -f data/app.db-wal data/app.db-shm
cp "$tmp/app.db" data/app.db
chown 1000:1000 data/app.db
chmod 600 data/app.db
docker compose start app
stopped=0
echo "restored $src (old db kept as data/app.db.pre-restore-$ts)"
