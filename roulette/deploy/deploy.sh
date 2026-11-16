#!/usr/bin/env bash
#
# P03 R5-R19. Installs one release and makes it live, or leaves the instance
# exactly as it found it.
#
# Run on the instance by SSM, as root:
#   bash deploy.sh <sha>
#
# It ships inside the release tarball rather than being installed once by
# provision.sh, so the deploy procedure is versioned with the code it
# deploys: a commit that needs a new step carries that step with it.
set -Eeuo pipefail

SHA="${1:?usage: deploy.sh <sha>}"
APP_DIR=/srv/roulette
RELEASE="$APP_DIR/releases/$SHA"

# shellcheck disable=SC1091
source "$APP_DIR/shared/deploy.env"
PHP_VERSION="${PHP_VERSION:-8.3}"
KEEP_RELEASES=5

log() { printf '\n== %s\n' "$*"; }
as_app() { sudo -u www-data "$@"; }

[[ -d "$RELEASE" ]] || { echo "No such release: $RELEASE" >&2; exit 1; }

# Anything from here that fails leaves `current` untouched, because the
# symlink does not move until the very end (R14).

# ------------------------------------------------------- 1. back up (R12)

log "Dumping the database before anything changes"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
dump="$APP_DIR/backups/${stamp}-${SHA}.sql.gz"

# Credentials come from the same .env.local the application uses, so there is
# only one place a password lives.
db_url="$(grep -E '^DATABASE_URL=' "$APP_DIR/shared/.env.local" | cut -d= -f2- | tr -d '"')"
db_user="$(sed -E 's#^mysql://([^:]+):.*#\1#'            <<<"$db_url")"
db_pass="$(sed -E 's#^mysql://[^:]+:([^@]*)@.*#\1#'      <<<"$db_url")"
db_name="$(sed -E 's#^.*/([^?]+)(\?.*)?$#\1#'            <<<"$db_url")"

# --single-transaction so the dump does not lock the stall out mid-spin.
MYSQL_PWD="$db_pass" mysqldump \
  --user="$db_user" --host=127.0.0.1 \
  --single-transaction --quick --routines --triggers \
  "$db_name" | gzip -9 > "$dump"

# R12: off the instance, because a backup that dies with the box is not one.
if [[ -n "${RELEASE_BUCKET:-}" ]]; then
  aws s3 cp --only-show-errors "$dump" "s3://${RELEASE_BUCKET}/backups/$(basename "$dump")"
else
  echo "WARNING: RELEASE_BUCKET is unset; the dump is only on this instance." >&2
fi

# Keep a fortnight locally; S3 keeps the rest.
find "$APP_DIR/backups" -name '*.sql.gz' -mtime +14 -delete

# -------------------------------------------- 2. shared state (R8-R11)

log "Linking the shared state into the release"
# var/cache is the one directory that must NOT be shared: it is compiled for
# this release's code (R10).
rm -rf "$RELEASE/backend/var"
install -d -o www-data -g www-data "$RELEASE/backend/var"

for dir in uploads sessions log share; do
  ln -sfn "$APP_DIR/shared/var/$dir" "$RELEASE/backend/var/$dir"
done

ln -sfn "$APP_DIR/shared/.env.local" "$RELEASE/backend/.env.local"
chown -R www-data:www-data "$RELEASE"
chown -h www-data:www-data "$RELEASE/backend/.env.local"

# -------------------------------------------------- 3. warm up (R19)

log "Warming the cache for this release"
as_app php "$RELEASE/backend/bin/console" cache:clear --no-warmup
as_app php "$RELEASE/backend/bin/console" cache:warmup

# ------------------------------------------------- 4. the schema (R13, R14)

log "Bringing the database up to this release's schema"
# Printed first so the log says what it was about to do even if it then
# fails. P02's dry run is cheap and reads nothing it cannot read anyway.
as_app php "$RELEASE/backend/bin/console" app:upgrade-database --dry-run
as_app php "$RELEASE/backend/bin/console" app:upgrade-database

# --------------------------------------------------- 5. go live (R5, R6)

log "Making $SHA live"
if [[ -L "$APP_DIR/current" ]]; then
  ln -sfn "$(readlink -f "$APP_DIR/current")" "$APP_DIR/previous"
  chown -h www-data:www-data "$APP_DIR/previous"
fi

ln -sfn "$RELEASE" "$APP_DIR/current.new"
mv -Tf "$APP_DIR/current.new" "$APP_DIR/current"
chown -h www-data:www-data "$APP_DIR/current"

# opcache holds compiled files keyed by realpath, so a reload is what makes
# the new release's code actually run.
systemctl reload "php${PHP_VERSION}-fpm"
systemctl reload nginx

# ------------------------------------------------------ 6. verify (R17)

log "Checking the release answers"
healthy=0
for attempt in 1 2 3 4 5; do
  if curl -fsS --max-time 5 -o /dev/null http://127.0.0.1/api/health; then
    healthy=1
    break
  fi
  sleep 2
done

if [[ "$healthy" -ne 1 ]]; then
  echo "FAILED: /api/health did not answer. Rolling back." >&2
  "$RELEASE/deploy/rollback.sh" || true
  exit 1
fi

# -------------------------------------------------------- 7. tidy up (R7)

log "Keeping the $KEEP_RELEASES most recent releases"
live="$(readlink -f "$APP_DIR/current")"
prev="$(readlink -f "$APP_DIR/previous" 2>/dev/null || true)"

# Newest first, skip the ones in use, delete the rest.
mapfile -t old < <(ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null | tail -n +$((KEEP_RELEASES + 1)))
for dir in "${old[@]:-}"; do
  [[ -n "$dir" ]] || continue
  dir="${dir%/}"
  [[ "$dir" == "$live" || "$dir" == "$prev" ]] && continue
  rm -rf "$dir"
done

log "Deployed $SHA"
