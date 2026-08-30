# Shopify Partner App Setup — TidySync

Follow these steps to connect TidySync to Shopify before merchants can install.

## 1. Create the app in Shopify Partners

1. Go to [Shopify Partners](https://partners.shopify.com) → **Apps** → **Create app**
2. Choose **Create app manually**
3. Name: **TidySync**
4. App URL: `https://sync.tidyflowapp.com`

## 2. Configure URLs

In **App setup**:

| Field | Value |
|-------|-------|
| Privacy policy URL | `https://sync.tidyflowapp.com/privacy` |
| Terms of service URL | `https://sync.tidyflowapp.com/terms` |
| Docs / install | `https://sync.tidyflowapp.com/docs` |
| Marketing homepage | `https://sync.tidyflowapp.com` (browser) — Shopify Admin still opens the embedded app |

## 3. API scopes

Enable these scopes (match `.env` / `shopify.app.toml`):

```
read_products, write_products
read_inventory, write_inventory
read_locations
read_customers, write_customers
read_orders
read_discounts, write_discounts
read_metaobjects, write_metaobjects
```

Product/customer metafields use the parent resource scopes (`read_products`, etc.) — there is no `read_metafields` scope.

## 4. Copy credentials to `.env`

```env
SHOPIFY_API_KEY=your_client_id_here
SHOPIFY_API_SECRET=your_client_secret_here
NEXT_PUBLIC_SHOPIFY_API_KEY=your_client_id_here
APP_URL=https://sync.tidyflowapp.com
```

`SHOPIFY_API_KEY` **must** match the Partner app Client ID. If it is missing/empty, App Bridge cannot mint `idToken` and GraphQL returns `Unauthorized — merchant session required`.

After deploy, view page source of `https://sync.tidyflowapp.com` and confirm:

```html
<meta name="shopify-api-key" content="YOUR_CLIENT_ID">
```

The `content` must **not** be empty. Then restart:

```bash
npm run deploy:pm2
```

## 5. Install on a development store

1. In Partners → your app → **Select store** → pick a dev store
2. Or visit: `https://sync.tidyflowapp.com/auth?shop=YOUR-STORE.myshopify.com`
3. Approve permissions — you'll be redirected into Shopify Admin so App Bridge can issue a session token

## 6. Verify

```bash
curl https://sync.tidyflowapp.com/health
# {"status":"ok","app":"TidySync",...}

curl "https://sync.tidyflowapp.com/auth/session?shop=YOUR-STORE.myshopify.com"
# {"ok":true,"hasOfflineSession":true,"hasTenant":true}
```

Open Shopify Admin → Apps → TidySync. The dashboard should load inside Admin.

## 7. `shopify.app.toml` (optional CLI)

The repo includes `shopify.app.toml` — Client ID should match `SHOPIFY_API_KEY`.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `idToken unavailable` | Empty/wrong `shopify-api-key` meta — set `SHOPIFY_API_KEY` and redeploy (`force-dynamic` layout) |
| `Unauthorized — merchant session required` | Complete OAuth once; confirm `/auth/session?shop=...` returns `ok:true` |
| `Shopify connection expired` | Re-open app from Shopify Admin; code now re-exchanges App Bridge token on 401. If it persists, click Connect / reinstall OAuth |
| `getaddrinfo EAI_AGAIN redis` | PM2 on VPS cannot resolve hostname `redis`. Set `REDIS_URL=redis://127.0.0.1:6379` in `.env`, expose Redis `6379` in Docker (`ports: ["6379:6379"]`), run `docker compose up -d redis`, then `pm2 restart tidysync` |
| Blank iframe | Client ID mismatch vs Partner dashboard |
| OAuth redirect error | Redirect URL must exactly match `/auth/callback` on your domain |
| App not loading | Shopify requires valid HTTPS for production apps |
