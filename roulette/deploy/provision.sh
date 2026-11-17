#!/usr/bin/env bash
#
# P03 R1, R20-R23. Turns a bare Ubuntu 24.04 instance into one that can serve
# the roulette game. Run once, as root, on an instance that holds nothing:
#
#   sudo DOMAIN=roulette.example.com ADMIN_EMAIL=you@example.com \
#        RELEASE_BUCKET=my-roulette-releases TIMEZONE=Europe/Paris \
#        bash provision.sh
#
# Idempotent on purpose: running it again on a working instance should change
# nothing, so it can be re-run after an Ubuntu upgrade or to repair a box
# somebody has edited by hand.
#
# What it deliberately does NOT install: Node, Composer, git. The instance
# runs code and never builds it (P03 R1), which is also why it needs no
# credentials for GitHub.
set -Eeuo pipefail

: "${DOMAIN:?set DOMAIN to the hostname this will serve, e.g. roulette.example.com}"
: "${ADMIN_EMAIL:?set ADMIN_EMAIL to the address certbot should send expiry notices to}"
: "${RELEASE_BUCKET:?set RELEASE_BUCKET to the S3 bucket holding releases}"

# F23 R6, R7: where the shop is, which is what decides when a player's day
# rolls over. Required rather than defaulted, because a default here is a
# guess at the one fact only the shop knows. `UTC` would draw the day's
# boundary at 07:00 for a shop at UTC+7 — inside opening hours, where it
# leaks a second spin to an early visitor and refuses a late one on what the
# shop calls a new day. An identifier PHP does not recognise stops the
# application rather than falling back to UTC (F23 R8), so a typo here fails
# the health check and rolls the release back instead of going quietly
# wrong.
: "${TIMEZONE:?set TIMEZONE to where the shop is, e.g. Europe/Paris}"

APP_DIR=/srv/roulette
PHP_VERSION=8.3
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '\n== %s\n' "$*"; }

# ---------------------------------------------------------------- packages

log "Installing packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  nginx \
  mariadb-server \
  "php${PHP_VERSION}-fpm" \
  "php${PHP_VERSION}-mysql" \
  "php${PHP_VERSION}-mbstring" \
  "php${PHP_VERSION}-xml" \
  "php${PHP_VERSION}-intl" \
  "php${PHP_VERSION}-curl" \
  "php${PHP_VERSION}-zip" \
  "php${PHP_VERSION}-opcache" \
  certbot python3-certbot-nginx \
  unzip curl

# The SSM agent is pre-installed on Ubuntu images from AWS, but a custom or
# older image may not have it, and without it nothing can deploy (P03 R4).
if ! snap list amazon-ssm-agent >/dev/null 2>&1; then
  log "Installing the SSM agent"
  snap install amazon-ssm-agent --classic
fi
snap start amazon-ssm-agent 2>/dev/null || true

# The instance pulls its own releases from S3 with its instance role (R3).
if ! command -v aws >/dev/null 2>&1; then
  log "Installing the AWS CLI"
  tmp="$(mktemp -d)"
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "$tmp/awscli.zip"
  unzip -q "$tmp/awscli.zip" -d "$tmp"
  "$tmp/aws/install" --update
  rm -rf "$tmp"
fi

# ------------------------------------------------------------------ layout

log "Creating $APP_DIR (P03 section 7)"
# Shared directories are created before any release exists, because a release
# links to them rather than owning them (R8-R11).
install -d -o www-data -g www-data \
  "$APP_DIR" \
  "$APP_DIR/releases" \
  "$APP_DIR/shared" \
  "$APP_DIR/shared/var/uploads" \
  "$APP_DIR/shared/var/sessions" \
  "$APP_DIR/shared/var/log" \
  "$APP_DIR/shared/var/share" \
  "$APP_DIR/backups"

# ------------------------------------------------------------------ secrets

if [[ ! -f "$APP_DIR/shared/.env.local" ]]; then
  log "Writing shared/.env.local with a generated APP_SECRET and database password"

  # Generated here and never printed: the operator does not need to know
  # either value, and a secret that was shown is a secret that was copied.
  app_secret="$(openssl rand -hex 32)"
  db_password="$(openssl rand -base64 24 | tr -d '/+=' | head -c 32)"

  mysql --protocol=socket -uroot <<SQL
CREATE DATABASE IF NOT EXISTS roulette
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'roulette'@'localhost' IDENTIFIED BY '${db_password}';
ALTER USER 'roulette'@'localhost' IDENTIFIED BY '${db_password}';
GRANT ALL PRIVILEGES ON roulette.* TO 'roulette'@'localhost';
FLUSH PRIVILEGES;
SQL

  server_version="$(mysql --protocol=socket -uroot -N -B -e 'SELECT VERSION()' | sed 's/-[0-9]*-.*$//')"

  cat > "$APP_DIR/shared/.env.local" <<ENV
# P03 R11. Written once by provision.sh; not in the repository, never in a
# release. Edit here and reload php8.3-fpm to change it.
APP_ENV=prod
APP_DEBUG=0
APP_SECRET=${app_secret}
DEFAULT_URI=https://${DOMAIN}
APP_SHARE_DIR=/srv/roulette/shared/var/share
APP_TIMEZONE=${TIMEZONE}
DATABASE_URL="mysql://roulette:${db_password}@127.0.0.1:3306/roulette?serverVersion=${server_version}-MariaDB&charset=utf8mb4"
ENV

  chown www-data:www-data "$APP_DIR/shared/.env.local"
  chmod 640 "$APP_DIR/shared/.env.local"
else
  log "shared/.env.local already exists; leaving it alone"
fi

# ------------------------------------------------------------------ mariadb

log "Binding MariaDB to localhost (P03 R23)"
cat > /etc/mysql/mariadb.conf.d/99-roulette.cnf <<'CNF'
[mysqld]
bind-address = 127.0.0.1
CNF
systemctl enable --now mariadb
systemctl restart mariadb

# ---------------------------------------------------------------- php-fpm

log "Configuring PHP-FPM for production"
cat > "/etc/php/${PHP_VERSION}/fpm/conf.d/99-roulette.ini" <<'INI'
; Symfony in production: compile once, keep it, and never let a stray
; display_errors leak a stack trace to a player at a stall.
display_errors = Off
opcache.enable = 1
opcache.validate_timestamps = 0
opcache.max_accelerated_files = 20000
opcache.memory_consumption = 192
realpath_cache_size = 4096K
realpath_cache_ttl = 600
; The logo upload (F05) is small; this is a ceiling, not a target.
upload_max_filesize = 4M
post_max_size = 8M
INI
systemctl enable --now "php${PHP_VERSION}-fpm"

# ------------------------------------------------------------------- nginx

log "Installing the nginx site"
install -m 644 "$HERE/nginx.conf" /etc/nginx/sites-available/roulette
sed -i "s/__DOMAIN__/${DOMAIN}/g; s/__PHP_VERSION__/${PHP_VERSION}/g" \
  /etc/nginx/sites-available/roulette
ln -sfn /etc/nginx/sites-available/roulette /etc/nginx/sites-enabled/roulette
rm -f /etc/nginx/sites-enabled/default

# nginx will not start without the release it points at, so a placeholder
# stands in until the first deploy.
if [[ ! -e "$APP_DIR/current" ]]; then
  install -d -o www-data -g www-data "$APP_DIR/releases/placeholder/frontend-dist"
  cat > "$APP_DIR/releases/placeholder/frontend-dist/index.html" <<'HTML'
<!doctype html>
<meta charset="utf-8">
<title>Not deployed yet</title>
<p>This instance is provisioned. Push to main to deploy.</p>
HTML
  ln -sfn "$APP_DIR/releases/placeholder" "$APP_DIR/current"
  chown -h www-data:www-data "$APP_DIR/current"
fi

nginx -t
systemctl enable --now nginx
systemctl reload nginx

# --------------------------------------------------------------------- tls

log "Requesting a certificate for ${DOMAIN} (P03 R22)"
# Needs the DNS record to point here already. Non-fatal: a provisioned
# instance without TLS is still worth having, and certbot can be re-run.
if ! certbot --nginx -n --agree-tos -m "$ADMIN_EMAIL" -d "$DOMAIN" --redirect; then
  echo "WARNING: certbot failed. Point ${DOMAIN} at this instance and re-run:" >&2
  echo "  certbot --nginx -d ${DOMAIN} --redirect" >&2
fi

# ------------------------------------------------------------------ record

cat > "$APP_DIR/shared/deploy.env" <<ENV
# Read by deploy.sh. Written by provision.sh.
RELEASE_BUCKET=${RELEASE_BUCKET}
DOMAIN=${DOMAIN}
PHP_VERSION=${PHP_VERSION}
ENV
chown www-data:www-data "$APP_DIR/shared/deploy.env"

log "Provisioned."
cat <<NEXT

The instance is ready, but the database has no tables yet and there is no
admin account. P03 R16: that part is deliberately by hand, once.

After the first successful deploy, run:

  cd /srv/roulette/current/backend
  sudo -u www-data php bin/console doctrine:schema:update --force --complete
  sudo -u www-data php bin/console app:upgrade-database
  sudo -u www-data php bin/console app:create-admin

Then open https://${DOMAIN}/ and sign in.
NEXT
