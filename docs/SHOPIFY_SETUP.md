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
| App URL | `https://sync.tidyflowapp.com` |
| Allowed redirection URL(s) | `https://sync.tidyflowapp.com/auth/callback` |
| Embedded app | **Enabled** |

## 3. API scopes


Enable these scopes (match `.env` / `shopify.app.toml`):

```
read_products, write_products
read_inventory, write_inventory
read_locations
read_customers, write_customers
read_orders
read_discounts, write_discounts
```

## 4. Copy credentials to `.env`

```bash
SHOPIFY_API_KEY=          # Client ID from Partner dashboard
SHOPIFY_API_SECRET=       # Client secret
NEXT_PUBLIC_SHOPIFY_API_KEY=  # Same as SHOPIFY_API_KEY (for App Bridge)
```

Restart the stack after updating:

```bash
docker compose -f docker-compose.prod.yml up -d --build tidysync
```

## 5. Install on a development store

1. In Partners → your app → **Select store** → pick a dev store
2. Or visit: `https://sync.tidyflowapp.com/auth?shop=YOUR-STORE.myshopify.com`
3. Approve permissions — you'll be redirected into the embedded app

## 6. Verify

```bash
curl https://sync.tidyflowapp.com/health
# {"status":"ok","app":"TidySync","version":"0.1.0"}
```

Open Shopify Admin → Apps → TidySync. The dashboard should load inside Admin.

## 7. `shopify.app.toml` (optional CLI)

The repo includes `shopify.app.toml` — replace `YOUR_SHOPIFY_API_KEY` with your Client ID if you use Shopify CLI later.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Blank iframe | Check `NEXT_PUBLIC_SHOPIFY_API_KEY` matches Partner Client ID |
| OAuth redirect error | Redirect URL must exactly match `/auth/callback` on your domain |
| 401 on GraphQL | Install app on store first (OAuth creates session in Postgres) |
| App not loading | Ensure TLS is valid — Shopify requires HTTPS for production apps |
