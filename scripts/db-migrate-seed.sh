#!/usr/bin/env bash
# Run migrations + seed inside Docker (uses .env + postgres hostname `postgres`)
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck source=lib/docker-compose.sh
source "$(dirname "$0")/lib/docker-compose.sh"

if [ ! -f .env ]; then
  echo "Missing .env — copy from .env.example"
  exit 1
fi

COMPOSE_FILE="docker-compose.prod.yml"

echo "==> Starting Postgres + Redis if needed..."
"${DOCKER_COMPOSE[@]}" -f "$COMPOSE_FILE" up -d postgres redis

echo "==> Waiting for Postgres..."
for i in $(seq 1 30); do
  if "${DOCKER_COMPOSE[@]}" -f "$COMPOSE_FILE" exec -T postgres pg_isready -U tidysync &>/dev/null; then
    break
  fi
  sleep 2
done

echo "==> Migrate + seed (inside container)"
"${DOCKER_COMPOSE[@]}" -f "$COMPOSE_FILE" run --rm --no-deps tidysync \
  sh -c "cd packages/database && npx prisma migrate deploy && npx tsx prisma/seed.ts"

echo "==> Done."
