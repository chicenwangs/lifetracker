#!/usr/bin/env bash
# Restore the planner DB from a backup. Stops the app, keeps the current DB aside, starts it again.
# Usage: sudo ./restore.sh data/backups/app-2026-11-08-0315.db.gz
# The uploads tar with the same timestamp (uploads-<ts>.tar.gz, v2) is restored too when it exists.
# Encrypted backups (.age, LT_AGE_RECIPIENT in backup.sh): sudo LT_AGE_IDENTITY=/path/key.txt ./restore.sh <file>.age
set -euo pipefail
umask 077
[ "$(id -u)" -eq 0 ] || { echo "run as root: sudo $0 $*" >&2; exit 1; }
LT_DIR=${LT_DIR:-$(cd "$(dirname "$0")" && pwd)}
src=$(realpath "${1:?usage: restore.sh <backup .db or .db.gz>}")
cd "$LT_DIR"
# data/ belongs to the container user: never follow a symlink there as root
for p in data data/app.db data/app.db-wal data/app.db-shm data/uploads; do
  [ -L "$p" ] && { echo "refusing: $p is a symlink" >&2; exit 1; }
done
tmp=$(mktemp -d)
stopped=0
ts=$(date +%F-%H%M%S)
old=""      # current DB moved aside: put back if anything fails after the swap (#206)
done_ok=0
cleanup() {
  if [ "$done_ok" != 1 ] && [ -n "$old" ] && [ -f "$old" ]; then
    rm -f data/app.db data/app.db-wal data/app.db-shm
    mv "$old" data/app.db
    echo "restore failed: old db put back" >&2
  fi
  rm -rf "$tmp"
  if [ "$stopped" = 1 ]; then docker compose start app; fi
}
trap cleanup EXIT
dec() { age -d -i "${LT_AGE_IDENTITY:?set LT_AGE_IDENTITY to the age key file}" "$1"; }
case "$src" in
  *.gz.age) dec "$src" | gunzip -c > "$tmp/app.db" ;;
  *.gz) gunzip -c "$src" > "$tmp/app.db" ;;
  *) cp "$src" "$tmp/app.db" ;;
esac
[ "$(sqlite3 "$tmp/app.db" 'PRAGMA integrity_check')" = ok ] || { echo "backup is corrupt: $src" >&2; exit 1; }
b=$(basename "$src"); b=${b#app-}; b=${b%.age}; b=${b%.gz}; b=${b%.db}   # app-<ts>.db.gz[.age] -> <ts>
up="$(dirname "$src")/uploads-$b.tar.gz"
[ -f "$up.age" ] && { dec "$up.age" > "$tmp/uploads.tar.gz"; up="$tmp/uploads.tar.gz"; }
if [ -f "$up" ]; then
  # checked before anything is stopped or swapped (#206). Listings read whole first: `grep -q` in a pipe
  # would stop tar early (SIGPIPE) and pipefail would skip the refusal. A corrupt archive fails here (set -e).
  list=$(tar -tzf "$up")
  vlist=$(tar -tvzf "$up")
  # only plain files and folders under uploads/ (no links, devices, .. or other paths)
  if grep -qvE '^uploads(/|$)' <<<"$list" || grep -qE '(^|/)\.\.(/|$)' <<<"$list"; then
    echo "refusing: $up has paths outside uploads/" >&2; exit 1
  fi
  if grep -qv '^[-d]' <<<"$vlist"; then echo "refusing: $up has links or special files" >&2; exit 1; fi
fi
docker compose stop app
stopped=1
if [ -f data/app.db ]; then old="data/app.db.pre-restore-$ts"; mv data/app.db "$old"; fi
rm -f data/app.db-wal data/app.db-shm
cp -T "$tmp/app.db" data/app.db
chown -h 1000:1000 data/app.db
chmod 600 data/app.db
if [ -f "$up" ]; then
  [ -d data/uploads ] && mv data/uploads "data/uploads.pre-restore-$ts"
  tar --no-same-owner --no-same-permissions -C data -xzf "$up" uploads
  chown -R 1000:1000 data/uploads
  echo "uploads restored from $up (old ones kept as data/uploads.pre-restore-$ts)"
fi
done_ok=1
docker compose start app
stopped=0
echo "restored $src (old db kept as data/app.db.pre-restore-$ts)"
