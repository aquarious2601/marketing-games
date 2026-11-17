#!/usr/bin/env bash
#
# P03 R6. Puts the previous release back.
#
#   sudo bash /srv/roulette/current/deploy/rollback.sh
#
# No network, no build, no S3: it moves a symlink and reloads. That is the
# whole point — this is what runs when a stall is broken and somebody is
# standing in front of it.
#
# It does NOT undo the database. P03 R15: the schema step can delete rows,
# and putting the old code back does not bring them back. The dump taken
# before the deploy is in /srv/roulette/backups and in S3.
set -Eeuo pipefail

APP_DIR=/srv/roulette

# shellcheck disable=SC1091
source "$APP_DIR/shared/deploy.env" 2>/dev/null || true
PHP_VERSION="${PHP_VERSION:-8.3}"

[[ -L "$APP_DIR/previous" ]] || { echo "There is no previous release to go back to." >&2; exit 1; }

going_to="$(readlink -f "$APP_DIR/previous")"
coming_from="$(readlink -f "$APP_DIR/current" 2>/dev/null || echo 'nothing')"

[[ -d "$going_to" ]] || { echo "previous points at $going_to, which is gone." >&2; exit 1; }

echo "Rolling back from $(basename "$coming_from") to $(basename "$going_to")"

# The two symlinks swap, so rollback is its own undo: run it twice and you
# are back where you started.
ln -sfn "$coming_from" "$APP_DIR/previous.new"
ln -sfn "$going_to" "$APP_DIR/current.new"
mv -Tf "$APP_DIR/current.new" "$APP_DIR/current"
mv -Tf "$APP_DIR/previous.new" "$APP_DIR/previous"
chown -h www-data:www-data "$APP_DIR/current" "$APP_DIR/previous"

systemctl reload "php${PHP_VERSION}-fpm"
systemctl reload nginx

# The same hostname-and-HTTPS check as deploy.sh, for the same reason:
# certbot's port 80 block answers 404 to anything that is not the domain.
if curl -fsS --max-time 5 -o /dev/null \
     --resolve "${DOMAIN}:443:127.0.0.1" "https://${DOMAIN}/api/health"; then
  echo "Rolled back. $(basename "$going_to") is live and answering."
else
  echo "Rolled back, but /api/health still does not answer." >&2
  echo "The problem is not the release. Check php-fpm, nginx and mariadb." >&2
  exit 1
fi
