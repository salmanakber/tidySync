import "@shopify/shopify-api/adapters/node";
import { shopifyApi, ApiVersion, Session } from "@shopify/shopify-api";
import { sessionRepository } from "@tidysync/database";

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

export async function getShopGraphqlClient(shop: string) {
  const sessionRow = await sessionRepository.findOfflineForShop(shop);

  if (!sessionRow?.accessToken) {
    throw new Error(
      `Shopify is not connected for ${shop}. Re-open TidySync from Shopify Admin and click Connect, then approve the change again.`,
    );
  }

  const session = new Session({
    id: sessionRow.id,
    shop: sessionRow.shop,
    state: sessionRow.state,
    isOnline: false,
    accessToken: sessionRow.accessToken,
  });

  return new shopify.clients.Graphql({ session });
}

/** Turn Shopify API errors into merchant-friendly messages. */
export function friendlyShopifyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.includes("403") || msg.includes("Forbidden")) {
    return "Shopify blocked this update (session expired or missing permission). Re-open TidySync from Shopify Admin, click Connect if prompted, then try again.";
  }
  if (msg.includes("401") || msg.includes("Unauthorized")) {
    return "Shopify connection expired. Re-open TidySync from Shopify Admin and click Connect, then try again.";
  }
  return msg;
}
