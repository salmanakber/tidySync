import "@shopify/shopify-api/adapters/node";
import {
  shopifyApi,
  ApiVersion,
  LogSeverity,
  Session,
  type Shopify,
} from "@shopify/shopify-api";
import { prisma, shopifySessionStorage, sessionRepository } from "@tidysync/database";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";

export const shopify: Shopify = shopifyApi({
  apiKey: process.env.SHOPIFY_API_KEY ?? "",
  apiSecretKey: process.env.SHOPIFY_API_SECRET ?? "",
  scopes: (process.env.SHOPIFY_SCOPES ??
    "read_products,write_products,read_inventory,write_inventory,read_locations,read_customers,write_customers,read_orders,read_discounts,write_discounts,read_metaobjects,write_metaobjects").split(","),
  hostName: appUrl.replace(/^https?:\/\//, ""),
  hostScheme: appUrl.startsWith("https") ? "https" : "http",
  apiVersion: ApiVersion.January25,
  isEmbeddedApp: true,
  logger: { level: LogSeverity.Warning },
});

export const sessionStorage = shopifySessionStorage;

function sessionFromRow(row: {
  id: string;
  shop: string;
  state: string;
  isOnline: boolean;
  accessToken: string;
  scope?: string | null;
  expires?: Date | null;
}) {
  return new Session({
    id: row.id,
    shop: row.shop,
    state: row.state,
    isOnline: row.isOnline,
    accessToken: row.accessToken,
    scope: row.scope ?? undefined,
    expires: row.expires ?? undefined,
  });
}

function isShopifyUnauthorized(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    networkStatusCode?: number;
    message?: string;
    response?: { code?: number };
  };
  if (e.networkStatusCode === 401) return true;
  if (e.response?.code === 401) return true;
  const msg = e.message ?? "";
  return msg.includes("Unauthorized") || msg.includes("401");
}

export async function exchangeSessionToken(
  shop: string,
  sessionToken: string,
  requested: "online" | "offline" = "online",
): Promise<Session> {
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const apiSecret = process.env.SHOPIFY_API_SECRET ?? "";
  if (!apiKey || !apiSecret) {
    throw new Error("Shopify API credentials are not configured on the server.");
  }

  const requestedTokenType =
    requested === "offline"
      ? "urn:shopify:params:oauth:token-type:offline-access-token"
      : "urn:shopify:params:oauth:token-type:online-access-token";

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      subject_token: sessionToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      requested_token_type: requestedTokenType,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `Shopify token exchange failed (${res.status}). Re-open TidySync from Shopify Admin to reconnect.`,
    );
  }

  const data = JSON.parse(text) as {
    access_token: string;
    scope?: string;
    expires_in?: number;
  };

  const session = new Session({
    id: requested === "offline" ? `offline_${shop}` : `online_${shop}_${Date.now()}`,
    shop,
    state: "active",
    isOnline: requested === "online",
    accessToken: data.access_token,
    scope: data.scope,
    expires: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
  });

  await sessionStorage.storeSession(session);
  return session;
}

async function offlineSessionForShop(shop: string): Promise<Session | null> {
  const row = await sessionRepository.findOfflineForShop(shop);
  if (!row?.accessToken) return null;
  return sessionFromRow(row);
}

async function onlineSessionForShop(shop: string): Promise<Session | null> {
  const row = await prisma.session.findFirst({
    where: {
      shop,
      isOnline: true,
      OR: [{ expires: null }, { expires: { gt: new Date() } }],
    },
    orderBy: { expires: "desc" },
  });
  if (!row?.accessToken) return null;
  return sessionFromRow(row);
}

/**
 * Resolve a Shopify Admin API session for merchant-initiated requests.
 * Prefers a fresh token from the App Bridge session token, then online/offline DB sessions.
 */
export async function resolveMerchantSession(
  shop: string,
  sessionToken?: string,
): Promise<Session> {
  if (sessionToken) {
    try {
      return await exchangeSessionToken(shop, sessionToken, "online");
    } catch {
      try {
        return await exchangeSessionToken(shop, sessionToken, "offline");
      } catch {
        /* fall through to stored sessions */
      }
    }
  }

  const online = await onlineSessionForShop(shop);
  if (online) return online;

  const offline = await offlineSessionForShop(shop);
  if (offline) return offline;

  throw new Error(
    "No Shopify connection for this store. Open TidySync from Shopify Admin and complete Connect / install.",
  );
}

/** Worker / background jobs — offline token only. */
export async function getShopGraphqlClient(shop: string) {
  const session = await offlineSessionForShop(shop);
  if (!session) {
    throw new Error(`No offline session for shop ${shop}`);
  }
  return new shopify.clients.Graphql({ session });
}

export async function getMerchantGraphqlClient(shop: string, sessionToken?: string) {
  const session = await resolveMerchantSession(shop, sessionToken);
  return new shopify.clients.Graphql({ session });
}

export async function merchantGraphqlRequest<T = unknown>(
  shop: string,
  sessionToken: string | undefined,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  let session = await resolveMerchantSession(shop, sessionToken);
  let client = new shopify.clients.Graphql({ session });

  try {
    const response = await client.request(query, { variables });
    const errors = (response as { errors?: Array<{ message: string }> }).errors;
    if (errors?.length) {
      throw new Error(errors.map((e) => e.message).join("; "));
    }
    return response as T;
  } catch (err) {
    if (!isShopifyUnauthorized(err)) throw err;

    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("token exchange") || message.includes("401")) {
      throw new Error(
        "Shopify connection expired. Open TidySync from Shopify Admin, click Connect if prompted, then try again.",
      );
    }

    if (sessionToken) {
      session = await exchangeSessionToken(shop, sessionToken, "offline");
      client = new shopify.clients.Graphql({ session });
      const response = await client.request(query, { variables });
      const errors = (response as { errors?: Array<{ message: string }> }).errors;
      if (errors?.length) {
        throw new Error(errors.map((e) => e.message).join("; "));
      }
      return response as T;
    }

    throw new Error(
      "Shopify rejected our API credentials (401). Click Connect in TidySync to re-authorize the app.",
    );
  }
}
