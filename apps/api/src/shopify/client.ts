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
  if (e.networkStatusCode === 401 || e.networkStatusCode === 403) return true;
  if (e.response?.code === 401 || e.response?.code === 403) return true;
  const msg = e.message ?? "";
  return (
    msg.includes("Unauthorized") ||
    msg.includes("Forbidden") ||
    msg.includes("401") ||
    msg.includes("403")
  );
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

const SHOP_PROBE = `#graphql
  query TidySyncShopProbe {
    shop { name id }
  }
`;

async function probeShopifySession(session: Session): Promise<boolean> {
  try {
    const client = new shopify.clients.Graphql({ session });
    const res = (await client.request(SHOP_PROBE)) as {
      data?: { shop?: { name?: string } };
      errors?: unknown[];
    };
    if (res.errors && Array.isArray(res.errors) && res.errors.length) return false;
    return Boolean(res.data?.shop?.name);
  } catch {
    return false;
  }
}

/**
 * Resolve a Shopify Admin API session for merchant-initiated requests.
 * Prefer a fresh token exchange when App Bridge sends a session token; if that
 * fails, fall back to a stored session that still works against Shopify.
 */
export async function resolveMerchantSession(
  shop: string,
  sessionToken?: string,
): Promise<Session> {
  if (sessionToken) {
    try {
      const online = await exchangeSessionToken(shop, sessionToken, "online");
      if (await probeShopifySession(online)) return online;
    } catch (onlineErr) {
      console.warn(
        `[shopify] online token exchange failed for ${shop}`,
        onlineErr instanceof Error ? onlineErr.message : onlineErr,
      );
    }
    try {
      const offline = await exchangeSessionToken(shop, sessionToken, "offline");
      if (await probeShopifySession(offline)) return offline;
    } catch (offlineErr) {
      console.warn(
        `[shopify] offline token exchange failed for ${shop}`,
        offlineErr instanceof Error ? offlineErr.message : offlineErr,
      );
    }
  }

  const offline = await offlineSessionForShop(shop);
  if (offline && (await probeShopifySession(offline))) return offline;

  const online = await onlineSessionForShop(shop);
  if (online && (await probeShopifySession(online))) return online;

  throw new Error(
    "RECONNECT_REQUIRED: Shopify connection expired. Click Connect to re-authorize TidySync, then try again.",
  );
}

/** Ensure a working offline token exists for workers (and sync applies). */
export async function ensureFreshOfflineSession(
  shop: string,
  sessionToken?: string,
): Promise<Session> {
  if (sessionToken) {
    try {
      const offline = await exchangeSessionToken(shop, sessionToken, "offline");
      if (await probeShopifySession(offline)) {
        await sessionRepository.deleteBrokenOfflineSessions(shop, offline.id).catch(() => undefined);
        return offline;
      }
    } catch (err) {
      console.warn(
        `[shopify] ensureFreshOfflineSession exchange failed for ${shop}`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const stored = await offlineSessionForShop(shop);
  if (stored && (await probeShopifySession(stored))) return stored;

  // Last resort: usable online token for immediate apply (workers still need offline)
  if (sessionToken) {
    try {
      const online = await exchangeSessionToken(shop, sessionToken, "online");
      if (await probeShopifySession(online)) return online;
    } catch {
      /* fall through */
    }
  }

  throw new Error(
    "RECONNECT_REQUIRED: Shopify connection expired. Click Connect to re-authorize TidySync, then try again.",
  );
}

export function isReconnectError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("RECONNECT_REQUIRED") ||
    msg.includes("session expired") ||
    msg.includes("connection expired") ||
    msg.includes("connection needs a refresh") ||
    msg.includes("Click Connect") ||
    msg.includes("403") ||
    msg.includes("Forbidden") ||
    msg.includes("401") ||
    msg.includes("Unauthorized")
  );
}

/** Mint a working Admin API access token to pass into BullMQ so workers don't use a stale DB offline token. */
export async function mintWorkerAccessToken(
  shop: string,
  sessionToken?: string,
): Promise<string | undefined> {
  try {
    const session = await ensureFreshOfflineSession(shop, sessionToken);
    if (session.accessToken && (await probeShopifySession(session))) {
      return session.accessToken;
    }
  } catch (err) {
    console.warn(
      `[shopify] mintWorkerAccessToken failed for ${shop}`,
      err instanceof Error ? err.message : err,
    );
  }

  if (sessionToken) {
    try {
      const online = await exchangeSessionToken(shop, sessionToken, "online");
      if (online.accessToken && (await probeShopifySession(online))) {
        return online.accessToken;
      }
    } catch {
      /* ignore */
    }
  }

  return undefined;
}

/** Worker / background jobs — offline token only (must already be valid). */
export async function getShopGraphqlClient(shop: string) {
  const session = await offlineSessionForShop(shop);
  if (!session) {
    throw new Error(
      `RECONNECT_REQUIRED: Shopify is not connected for ${shop}. Click Connect, then approve again.`,
    );
  }
  if (!(await probeShopifySession(session))) {
    throw new Error(
      `RECONNECT_REQUIRED: Shopify blocked this update (session expired). Click Connect to re-authorize, then try again.`,
    );
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
  const runWithSession = async (session: Session): Promise<T> => {
    const client = new shopify.clients.Graphql({ session });
    const response = await client.request(query, { variables });
    const errors = (response as { errors?: Array<{ message: string }> }).errors;
    if (errors?.length) {
      throw new Error(errors.map((e) => e.message).join("; "));
    }
    return response as T;
  };

  let session = await resolveMerchantSession(shop, sessionToken);

  try {
    return await runWithSession(session);
  } catch (err) {
    if (!isShopifyUnauthorized(err)) throw err;

    if (!sessionToken) {
      throw new Error(
        "Shopify rejected our API credentials (401). Open TidySync from Shopify Admin and complete Connect / install.",
      );
    }

    // 401 with a live session token — exchange fresh tokens and retry (online, then offline).
    try {
      session = await exchangeSessionToken(shop, sessionToken, "online");
      return await runWithSession(session);
    } catch (retryErr) {
      if (!isShopifyUnauthorized(retryErr)) throw retryErr;
      try {
        session = await exchangeSessionToken(shop, sessionToken, "offline");
        return await runWithSession(session);
      } catch {
        throw new Error(
          "Shopify connection expired. Open TidySync from Shopify Admin, click Connect if prompted, then try again.",
        );
      }
    }
  }
}

/** Refresh stored offline token so background workers can call Shopify after merchant approves. */
export async function refreshOfflineTokenFromSession(
  shop: string,
  sessionToken: string,
): Promise<Session> {
  return ensureFreshOfflineSession(shop, sessionToken);
}
