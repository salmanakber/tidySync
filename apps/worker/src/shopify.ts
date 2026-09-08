import "@shopify/shopify-api/adapters/node";
import { AsyncLocalStorage } from "node:async_hooks";
import { shopifyApi, ApiVersion, Session } from "@shopify/shopify-api";
import { sessionRepository, shopifySessionStorage } from "@tidysync/database";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

const shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY ?? "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET ?? "",
  scopes: (process.env.SHOPIFY_SCOPES ??
    "read_products,write_products,read_inventory,write_inventory,read_locations,read_customers,write_customers,read_orders,read_discounts,write_discounts,read_metaobjects,write_metaobjects").split(","),
  hostName: appUrl.replace(/^https?:\/\//, ""),
  hostScheme: appUrl.startsWith("https") ? "https" : "http",
  apiVersion: ApiVersion.January25,
  isEmbeddedApp: true,
});

/** Fresh token minted by the API when the merchant approves a job (preferred over DB offline). */
export const shopifyJobAuth = new AsyncLocalStorage<{
  shop: string;
  accessToken?: string;
}>();

const SHOP_PROBE = `#graphql
  query TidySyncShopProbe {
    shop { name id }
  }
`;

async function probeSession(session: Session): Promise<boolean> {
  try {
    const client = new shopify.clients.Graphql({ session });
    const res = (await client.request(SHOP_PROBE)) as {
      data?: { shop?: { name?: string } };
    };
    return Boolean(res.data?.shop?.name);
  } catch {
    return false;
  }
}

function sessionFromToken(shop: string, accessToken: string, offline = true): Session {
  return new Session({
    id: offline ? `offline_${shop}` : `online_${shop}_${Date.now()}`,
    shop,
    state: "active",
    isOnline: !offline,
    accessToken,
  });
}

/** Persist a working token so later scheduled/worker jobs can reuse it. */
async function persistOfflineToken(shop: string, accessToken: string): Promise<void> {
  try {
    const session = sessionFromToken(shop, accessToken, true);
    await shopifySessionStorage.storeSession(session);
    await sessionRepository.deleteBrokenOfflineSessions(shop, session.id).catch(() => undefined);
  } catch (err) {
    console.warn(
      `[shopify-worker] failed to persist offline token for ${shop}`,
      err instanceof Error ? err.message : err,
    );
  }
}

export async function getShopGraphqlClient(shop: string) {
  const jobAuth = shopifyJobAuth.getStore();
  const freshToken = jobAuth?.accessToken;

  if (freshToken) {
    const session = sessionFromToken(shop, freshToken, true);
    if (await probeSession(session)) {
      // Keep DB in sync with the token the API just minted
      void persistOfflineToken(shop, freshToken);
      return new shopify.clients.Graphql({ session });
    }
    console.warn(
      `[shopify-worker] job payload token failed probe for ${shop} — not falling back to stale DB token`,
    );
    throw new Error(
      `RECONNECT_REQUIRED: Fresh Shopify token was rejected. Open TidySync from Admin, click Connect, then approve again.`,
    );
  }

  const sessionRow = await sessionRepository.findOfflineForShop(shop);

  if (!sessionRow?.accessToken) {
    throw new Error(
      `RECONNECT_REQUIRED: Shopify is not connected for ${shop}. Click Connect in TidySync, then approve again.`,
    );
  }

  const session = new Session({
    id: sessionRow.id,
    shop: sessionRow.shop,
    state: sessionRow.state,
    isOnline: false,
    accessToken: sessionRow.accessToken,
  });

  if (!(await probeSession(session))) {
    throw new Error(
      `RECONNECT_REQUIRED: Shopify blocked this update (session expired). Click Connect to re-authorize TidySync, then try again.`,
    );
  }

  return new shopify.clients.Graphql({ session });
}

/** Turn Shopify API errors into merchant-friendly messages. */
export function friendlyShopifyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("RECONNECT_REQUIRED")) return msg;
  if (msg.includes("403") || msg.includes("Forbidden")) {
    return "RECONNECT_REQUIRED: Shopify blocked this update (session expired or missing permission). Click Connect to re-authorize, then try again.";
  }
  if (msg.includes("401") || msg.includes("Unauthorized")) {
    return "RECONNECT_REQUIRED: Shopify connection expired. Click Connect to re-authorize, then try again.";
  }
  return msg;
}
