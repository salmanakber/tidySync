# QA — Shopify App Store 1.2.2 (reinstall plan selection)

Billing uses the **Shopify Billing API** (`appSubscriptionCreate`), not Managed Pricing.

## Goal

After uninstall → reinstall, the merchant must see a plan picker that includes **Free**
and must **not** be silently restored to their previous paid plan from our database.

## Prerequisites

- Dev store with TidySync
- Partner app webhooks include `app/uninstalled` (deploy `shopify.app.toml` / `shopify app deploy`)
- API + embedded app redeployed with this change set

## Steps

1. **Fresh install**
   - Install the app from Shopify Admin
   - Assert banner: “Choose a plan to continue”
   - Assert Billing tab lists Free with **Continue with Free** (enabled)
   - Click **Continue with Free**
   - Assert `billingStatus=ACTIVE`, plan=Free, no Shopify charge created

2. **Subscribe to paid**
   - Billing → Upgrade to Starter (or Growth)
   - Approve the charge in Shopify
   - Assert paid plan is active

3. **Uninstall**
   - Shopify Admin → Apps → Uninstall TidySync
   - Check API logs for `[billing] app/uninstalled … plan reset to free`
   - DB checks for that shop:
     - `tenants.status = UNINSTALLED`
     - `tenants.plan_id` = free plan
     - `tenants.shopify_subscription_id` IS NULL
     - `tenants.billing_status = PENDING_APPROVAL`
     - Shopify `Session` rows for the shop deleted
     - Pending `BillingCharge` rows marked DECLINED

4. **Reinstall**
   - Install TidySync again from Admin
   - Assert plan picker / banner appears again
   - Assert Free is selectable (**Continue with Free**)
   - Assert you are **not** on the previous paid plan
   - Assert there is **no** automatic redirect to a paid Shopify charge

5. **Choose Free after reinstall**
   - Click **Continue with Free** → usable on Free

6. **Or choose paid again**
   - Click Upgrade → must **Approve** again in Shopify (new charge)

## Fail if

- Reinstall lands on previous paid plan without Approve
- Free button missing or disabled when `billingStatus=PENDING_APPROVAL`
- Uninstall leaves `shopify_subscription_id` / paid `plan_id` intact
- App auto-calls `appSubscriptionCreate` on install/reinstall without merchant clicking Upgrade

## Optional DB verification

```sql
SELECT shop_domain, status, billing_status, shopify_subscription_id, plan_id
FROM tenants
WHERE shop_domain = 'YOUR-STORE.myshopify.com';
```
