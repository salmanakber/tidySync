#!/usr/bin/env bash
# Stop old TidySync PM2 apps and start fresh on PORT from .env (default 4000).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PORT="${PORT:-4000}"

echo "==> Stopping old TidySync PM2 apps..."
pm2 delete tidysync 2>/dev/null || true
pm2 delete tidySync 2>/dev/null || true
pm2 delete tidysync-embedded 2>/dev/null || true
pm2 delete tidysync-admin 2>/dev/null || true
pm2 delete tidysync-api 2>/dev/null || true
pm2 delete tidysync-worker 2>/dev/null || true

echo "==> Starting tidysync on port ${PORT}..."
export PORT
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "TidySync running"
echo "  curl http://127.0.0.1:${PORT}/health"
pm2 list
