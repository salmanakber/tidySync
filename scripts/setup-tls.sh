#!/usr/bin/env bash
# Obtain Let's Encrypt TLS cert and enable HTTPS nginx config.
# Run on the VPS as root (or with sudo).
set -euo pipefail

DOMAIN="${1:-sync.tidyflowapp.com}"
EMAIL="${2:-admin@tidysync.local}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CERT_DIR="$REPO_ROOT/deploy/certs"

mkdir -p "$CERT_DIR"

if ! command -v certbot &>/dev/null; then
  echo "Installing certbot..."
  if command -v apt-get &>/dev/null; then
    apt-get update && apt-get install -y certbot
  else
    echo "Install certbot manually, then re-run this script."
    exit 1
  fi
fi

echo "==> Stopping nginx container to free port 80 (if running)"
docker compose -f "$REPO_ROOT/docker-compose.prod.yml" stop nginx 2>/dev/null || true

echo "==> Requesting certificate for $DOMAIN"
certbot certonly --standalone \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive \
  --preferred-challenges http

echo "==> Copying certs to deploy/certs"
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "$CERT_DIR/fullchain.pem"
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "$CERT_DIR/privkey.pem"

echo "==> Enabling SSL nginx config"
cp "$REPO_ROOT/deploy/nginx/tidysync-ssl.conf" "$REPO_ROOT/deploy/nginx/tidysync.conf"

echo "==> Starting stack with TLS"
docker compose -f "$REPO_ROOT/docker-compose.prod.yml" up -d

echo "Done. TidySync should be live at https://$DOMAIN"
echo "Renewal: certbot renew && cp certs to deploy/certs && docker compose restart nginx"
