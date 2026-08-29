#!/usr/bin/env bash
# Stop every old TidySync PM2 process and start fresh on port 4000.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Stopping all PM2 apps..."
pm2 delete tidysync 2>/dev/null || true
pm2 delete tidySync 2>/dev/null || true
pm2 delete all 2>/dev/null || true

echo "==> Building..."
npm run build

echo "==> Starting tidysync on PORT=${PORT:-4000}..."
export PORT="${PORT:-4000}"
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "Done. Open http://YOUR_SERVER:${PORT} (admin: /admin)"
echo "Health: curl http://127.0.0.1:${PORT}/health"
pm2 list
