#!/usr/bin/env bash
# Deploy TidySync on Ubuntu VPS with PM2 + host nginx (postgres/redis on localhost).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> TidySync PM2 deploy"

if [ ! -f .env ]; then
  echo "Missing .env — copy from .env.example and configure APP_URL, Shopify keys, DATABASE_URL, REDIS_URL"
  exit 1
fi

# Load PORT / APP_URL for messages
set -a
# shellcheck disable=SC1091
source .env 2>/dev/null || true
set +a
PORT="${PORT:-4000}"
APP_URL="${APP_URL:-http://localhost:${PORT}}"
DOMAIN="${APP_URL#https://}"
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN%%/*}"

echo "==> Domain: $DOMAIN"
echo "==> Port:   $PORT"

echo "==> npm install"
npm install

echo "==> Prisma generate"
npm run db:generate

echo "==> Database migrate"
npm run db:migrate:deploy

echo "==> Database seed (plans, admin user — safe to re-run)"
npm run db:seed || echo "Seed skipped or already applied"

echo "==> Build"
npm run build

echo "==> PM2 start"
bash scripts/pm2-reset.sh

echo ""
echo "==> Deployed"
echo "    App:    ${APP_URL}"
echo "    Admin:  ${APP_URL}/admin"
echo "    Health: curl http://127.0.0.1:${PORT}/health"
echo ""
echo "Nginx should proxy to http://127.0.0.1:${PORT}"
echo "Shopify Partner App URL: ${APP_URL}"
echo "Redirect URL: ${APP_URL}/auth/callback"
