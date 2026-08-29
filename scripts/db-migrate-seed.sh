#!/usr/bin/env bash
# Run migrations + seed inside Docker (uses .env + postgres hostname `postgres`)
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
  echo "Missing .env — copy from .env.example"
  exit 1
fi

echo "==> Starting Postgres if needed..."
docker compose -f docker-compose.prod.yml up -d postgres redis

echo "==> Waiting for Postgres..."
for i in $(seq 1 30); do
  if docker compose -f docker-compose.prod.yml exec -T postgres pg_isready -U tidysync &>/dev/null; then
    break
  fi
  sleep 2
done

echo "==> Migrate + seed (inside container)"
docker compose -f docker-compose.prod.yml run --rm --no-deps tidysync \
  sh -c "cd packages/database && npx prisma migrate deploy && npx tsx prisma/seed.ts"

echo "==> Done."
