#!/usr/bin/env bash
# homelab nightly backup. cron: 15 3 * * * /opt/life-tracker/backup.sh >> /opt/life-tracker/backup.log 2>&1
set -euo pipefail
cd /opt/life-tracker/data
mkdir -p backups
ts=$(date +%F-%H%M)
sqlite3 app.db ".backup 'backups/app-$ts.db'"
sqlite3 "backups/app-$ts.db" "PRAGMA integrity_check" | grep -qx ok
gzip "backups/app-$ts.db"
find backups -name 'app-*.db.gz' -mtime +14 -delete
rsync -a backups/ /mnt/backup/life-tracker/      # EDIT: other disk / NAS
