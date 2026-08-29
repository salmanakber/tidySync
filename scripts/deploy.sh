#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> TidySync deploy"

if [ ! -f .env ]; then
  echo "Copy .env.example to .env and configure Shopify credentials first."
  exit 1
fi

# Load domain from .env if set
DOMAIN=$(grep -E '^APP_URL=' .env | cut -d= -f2 | sed 's|https://||' | sed 's|http://||' | tr -d '/' || echo "sync.tidyflowapp.com")

echo "==> Domain: $DOMAIN"

echo "==> Building application image"
docker compose -f docker-compose.prod.yml build \
  --build-arg SHOPIFY_API_KEY="${SHOPIFY_API_KEY:-}" \
  tidysync

echo "==> Starting Postgres + Redis"
docker compose -f docker-compose.prod.yml up -d postgres redis

echo "==> Waiting for Postgres..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U tidysync &>/dev/null; then
    break
  fi
  sleep 2
done

echo "==> Running Prisma migrations + seed"
docker compose -f docker-compose.prod.yml run --rm --no-deps tidysync \
  sh -c "cd packages/database && npx prisma migrate deploy && npx tsx prisma/seed.ts"

echo "==> Starting all services"
docker compose -f docker-compose.prod.yml up -d

echo ""
echo "==> TidySync deployed"
echo "    App:   http://$DOMAIN  (run scripts/setup-tls.sh for HTTPS)"
echo "    Admin: http://$DOMAIN/admin"
echo "    API:   http://$DOMAIN/graphql"
echo ""
echo "Next steps:"
echo "  1. Point DNS A record for $DOMAIN to this server"
echo "  2. Configure Shopify Partner app (see docs/SHOPIFY_SETUP.md)"
echo "  3. Run: sudo ./scripts/setup-tls.sh $DOMAIN your@email.com"
