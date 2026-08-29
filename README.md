# TidySync

AI-guided bulk data management for Shopify — deployed at **sync.tidyflowapp.com**

## Stack

| Layer | Technology |
|-------|------------|
| Embedded UI | Next.js 15 + Shopify Polaris + App Bridge |
| Internal admin | Next.js 15 (`/admin`) |
| API | GraphQL Yoga + Express |
| Database | **Prisma** + PostgreSQL |
| Queue | BullMQ + Redis |
| AI | OpenAI (`@tidysync/ai`) with rule-based fallback |
| Deploy | Docker Compose + Nginx |

## Monorepo

```
apps/api          GraphQL, OAuth, uploads, public REST API, MCP manifest
apps/embedded     Merchant dashboard (Polaris)
apps/admin        Ops console
apps/worker       Import/export/bulk-edit/undo/catalog-scan/scheduler
packages/database Prisma schema, migrations, repositories
packages/shared   Types, platform mapping, file parsers (server-only subpath)
packages/ai       LLM integration
```

## Features (per product spec)

- Product/variant/inventory import & export (CSV + XLSX)
- Cross-platform profiles: WooCommerce, BigCommerce, Magento, Squarespace, Etsy, Wix
- Side-by-side field mapping UI + saved templates
- NL bulk edit with AI mutation plans + diff preview + anomaly detection
- One-click undo via snapshots
- Catalog health scan + AI content rewrite
- Scheduled jobs (daily/weekly)
- Audit log
- AI credit metering + top-ups
- Email/Slack notifications
- Public REST API (`/v1/jobs`, `/v1/export`) + MCP tool manifest
- Internal admin: tenants, jobs, feature flags, retry

## Deploy to VPS (one command)

See **[docs/SHOPIFY_SETUP.md](docs/SHOPIFY_SETUP.md)** for Partner app configuration.

```bash
cp .env.example .env
# Edit .env — at minimum: SHOPIFY_API_KEY, SHOPIFY_API_SECRET, POSTGRES_PASSWORD, secrets

chmod +x scripts/deploy.sh scripts/setup-tls.sh
./scripts/deploy.sh
sudo ./scripts/setup-tls.sh sync.tidyflowapp.com your@email.com
```

Or manually:

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec tidysync \
  sh -c "cd packages/database && npx prisma migrate deploy && npx tsx prisma/seed.ts"
```

Point DNS `sync.tidyflowapp.com` → VPS. Add TLS with Certbot on Nginx.

## Production start (one command)

```bash
npm install
npm run build
npm start
```

Set **one URL** in `.env`:

```env
APP_URL=https://sync.tidyflowapp.com
PORT=4000
```

| What | URL |
|------|-----|
| Shopify app | `https://sync.tidyflowapp.com` |
| Admin | `https://sync.tidyflowapp.com/admin` |
| GraphQL | `https://sync.tidyflowapp.com/graphql` |

PM2 (optional): `npm run pm2:start` then `npm run pm2:restart`

## Shopify Partner setup

| Setting | Value |
|---------|-------|
| App URL | `https://sync.tidyflowapp.com` |
| Redirect URL | `https://sync.tidyflowapp.com/auth/callback` |
| Embedded | Yes |

Set `NEXT_PUBLIC_SHOPIFY_API_KEY` = your Shopify API key (embedded App Bridge).

## Local development

```bash
docker compose up -d          # Postgres + Redis
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed

npm run dev                   # one server on PORT (default 4000)
```

Set in `.env` for local testing:

```env
APP_URL=http://localhost:4000
PORT=4000
```

| Service | URL |
|---------|-----|
| Embedded | http://localhost:4000?shop=your-store.myshopify.com |
| Admin | http://localhost:4000/admin |
| GraphQL | http://localhost:4000/graphql |

**Admin login (after seed):** `admin@tidysync.local` / `changeme123`

## Database (Prisma)

```bash
npm run db:migrate        # dev
npm run db:migrate:deploy # production VPS
npm run db:seed           # plans, platforms, feature flags, admin user
```

## Public API

```bash
# Create API key in admin (future) or database; format: tidysync_<prefix>...
curl -H "Authorization: Bearer tidysync_..." https://sync.tidyflowapp.com/v1/jobs
curl -X POST -H "Authorization: Bearer tidysync_..." https://sync.tidyflowapp.com/v1/export
```

MCP tools manifest: `GET /mcp/tools`
