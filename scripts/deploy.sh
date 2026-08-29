#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
# shellcheck source=lib/docker-compose.sh
source "$(dirname "$0")/lib/docker-compose.sh"

echo "==> TidySync deploy"

if [ ! -f .env ]; then
  echo "Copy .env.example to .env and configure Shopify credentials first."
  exit 1
fi

COMPOSE_FILE="docker-compose.prod.yml"

# Load domain from .env if set
DOMAIN=$(grep -E '^APP_URL=' .env | cut -d= -f2 | sed 's|https://||' | sed 's|http://||' | tr -d '/' || echo "sync.tidyflowapp.com")

echo "==> Domain: $DOMAIN"

echo "==> Building application image"
"${DOCKER_COMPOSE[@]}" -f "$COMPOSE_FILE" build \
  --build-arg SHOPIFY_API_KEY="${SHOPIFY_API_KEY:-}" \
  tidysync

echo "==> Starting Postgres + Redis"
"${DOCKER_COMPOSE[@]}" -f "$COMPOSE_FILE" up -d postgres redis

echo "==> Waiting for Postgres..."
for i in $(seq 1 30); do
  if "${DOCKER_COMPOSE[@]}" -f "$COMPOSE_FILE" exec -T postgres pg_isready -U tidysync &>/dev/null; then
    break
  fi
  sleep 2
done

echo "==> Running Prisma migrations + seed"
"${DOCKER_COMPOSE[@]}" -f "$COMPOSE_FILE" run --rm --no-deps tidysync \
  sh -c "cd packages/database && npx prisma migrate deploy && npx tsx prisma/seed.ts"

echo "==> Starting all services"
"${DOCKER_COMPOSE[@]}" -f "$COMPOSE_FILE" up -d

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
