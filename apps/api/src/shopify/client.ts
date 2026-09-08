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

/** Thrown when App Bridge should fetch a fresh ID token and retry (Shopify exchange 400). */
export class SessionTokenStaleError extends Error {
  readonly code = "SESSION_TOKEN_STALE" as const;
  constructor(message = "Shopify session token expired. Retrying with a fresh token…") {
    super(message);
    this.name = "SessionTokenStaleError";
  }
}

function sessionFromRow(row: {
  id: string;
  shop: string;
  state: string;
  isOnline: boolean;
  accessToken: string;
  scope?: string | null;
  expires?: Date | null;
  refreshToken?: string | null;
  refreshTokenExpires?: Date | null;
}) {
  const session = new Session({
    id: row.id,
    shop: row.shop,
    state: row.state,
    isOnline: row.isOnline,
    accessToken: row.accessToken,
    scope: row.scope ?? undefined,
    expires: row.expires ?? undefined,
  });
  if (row.refreshToken) {
    (session as Session & { refreshToken?: string }).refreshToken = row.refreshToken;
  }
  if (row.refreshTokenExpires) {
    (session as Session & { refreshTokenExpires?: Date }).refreshTokenExpires =
      row.refreshTokenExpires;
  }
  return session;
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

function expiresAtFrom(expiresIn: unknown): Date | undefined {
  const seconds = Number(expiresIn);
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined;
  return new Date(Date.now() + seconds * 1000);
}

/** Decode + validate App Bridge ID token; throws SessionTokenStaleError when invalid/expired. */
export async function requireValidSessionToken(sessionToken: string): Promise<{
  shop: string;
  payload: Awaited<ReturnType<typeof shopify.session.decodeSessionToken>>;
}> {
  try {
    const payload = await shopify.session.decodeSessionToken(sessionToken);
    const dest = String(payload.dest ?? "")
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "");
    if (!dest) {
      throw new SessionTokenStaleError("Session token is missing shop destination.");
    }
    const apiKey = process.env.SHOPIFY_API_KEY ?? "";
    const aud = payload.aud;
    const audOk = Array.isArray(aud) ? aud.includes(apiKey) : aud === apiKey;
    if (!audOk) {
      throw new Error(
        "RECONNECT_REQUIRED: Session token is for a different app (aud mismatch). Click Connect to re-authorize.",
      );
    }
    return { shop: dest, payload };
  } catch (err) {
    if (err instanceof SessionTokenStaleError) throw err;
    if (err instanceof Error && err.message.includes("RECONNECT_REQUIRED")) throw err;
    throw new SessionTokenStaleError(
      err instanceof Error ? err.message : "Invalid Shopify session token",
    );
  }
}

/**
 * Exchange App Bridge ID token for Admin API access token.
 * Uses form-urlencoded + expiring offline tokens per Shopify docs.
 */
export async function exchangeSessionToken(
  shop: string,
  sessionToken: string,
  requested: "online" | "offline" = "offline",
): Promise<Session> {
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const apiSecret = process.env.SHOPIFY_API_SECRET ?? "";
  if (!apiKey || !apiSecret) {
    throw new Error("Shopify API credentials are not configured on the server.");
  }

  const { shop: exchangeShop } = await requireValidSessionToken(sessionToken);

  const requestedTokenType =
    requested === "offline"
      ? "urn:shopify:params:oauth:token-type:offline-access-token"
      : "urn:shopify:params:oauth:token-type:online-access-token";

  const body = new URLSearchParams({
    client_id: apiKey,
    client_secret: apiSecret,
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    subject_token: sessionToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    requested_token_type: requestedTokenType,
  });
  // New public apps must request expiring offline tokens
  if (requested === "offline") {
    body.set("expiring", "1");
  }

  const doExchange = () =>
    fetch(`https://${exchangeShop}/admin/oauth/access_token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body,
    });

  let res = await doExchange();
  let text = await res.text();

  // Legacy apps may reject expiring=1 — retry once without it
  if (
    !res.ok &&
    requested === "offline" &&
    body.has("expiring") &&
    (text.includes("expiring") || text.includes("invalid_requested_token_type"))
  ) {
    body.delete("expiring");
    res = await doExchange();
    text = await res.text();
  }

  if (res.status === 400) {
    console.warn(
      `[shopify] token exchange ${requested} 400 for ${exchangeShop} (stale ID token): ${text.slice(0, 300)}`,
    );
    throw new SessionTokenStaleError(
      `Shopify token exchange failed (400). Re-open TidySync from Shopify Admin to reconnect.`,
    );
  }
  if (!res.ok) {
    console.warn(
      `[shopify] token exchange ${requested} failed for ${exchangeShop}: ${res.status} ${text.slice(0, 300)}`,
    );
    throw new Error(
      `Shopify token exchange failed (${res.status}). Re-open TidySync from Shopify Admin to reconnect.`,
    );
  }

  const data = JSON.parse(text) as {
    access_token: string;
    scope?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_token_expires_in?: number;
  };

  const session = new Session({
    id: requested === "offline" ? `offline_${exchangeShop}` : `online_${exchangeShop}_${Date.now()}`,
    shop: exchangeShop,
    state: "active",
    isOnline: requested === "online",
    accessToken: data.access_token,
    scope: data.scope,
    expires: expiresAtFrom(data.expires_in),
  });

  if (data.refresh_token) {
    (session as Session & { refreshToken?: string }).refreshToken = data.refresh_token;
  }
  if (data.refresh_token_expires_in) {
    (session as Session & { refreshTokenExpires?: Date }).refreshTokenExpires = expiresAtFrom(
      data.refresh_token_expires_in,
    );
  }

  await sessionStorage.storeSession(session);

  // Persist refresh token fields the Shopify session storage may not map
  if (requested === "offline" && data.refresh_token) {
    await prisma.session
      .update({
        where: { id: session.id },
        data: {
          refreshToken: data.refresh_token,
          refreshTokenExpires: expiresAtFrom(data.refresh_token_expires_in) ?? null,
          expires: session.expires ?? null,
          accessToken: data.access_token,
          scope: data.scope ?? null,
        },
      })
      .catch(() => undefined);
    await sessionRepository.deleteBrokenOfflineSessions(exchangeShop, session.id).catch(() => undefined);
  }

  return session;
}

async function refreshOfflineAccessToken(shop: string, refreshToken: string): Promise<Session | null> {
  const apiKey = process.env.SHOPIFY_API_KEY ?? "";
  const apiSecret = process.env.SHOPIFY_API_SECRET ?? "";
  if (!apiKey || !apiSecret || !refreshToken) return null;

  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: apiKey,
      client_secret: apiSecret,
      refresh_token: refreshToken,
    }),
  });

  if (res.status === 401) {
    console.warn(`[shopify] offline refresh rejected for ${shop} — merchant must reconnect`);
    return null;
  }
  if (!res.ok) {
    console.warn(`[shopify] offline refresh failed for ${shop}: ${res.status}`);
    return null;
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    refresh_token_expires_in?: number;
    scope?: string;
  };

  const session = new Session({
    id: `offline_${shop}`,
    shop,
    state: "active",
    isOnline: false,
    accessToken: data.access_token,
    scope: data.scope,
    expires: expiresAtFrom(data.expires_in),
  });
  if (data.refresh_token) {
    (session as Session & { refreshToken?: string }).refreshToken = data.refresh_token;
  }

  await sessionStorage.storeSession(session);
  await prisma.session
    .update({
      where: { id: session.id },
      data: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token ?? refreshToken,
        refreshTokenExpires: expiresAtFrom(data.refresh_token_expires_in) ?? null,
        expires: session.expires ?? null,
        scope: data.scope ?? null,
      },
    })
    .catch(() => undefined);

  return session;
}

async function offlineSessionForShop(shop: string): Promise<Session | null> {
  const row = await sessionRepository.findOfflineForShop(shop);
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
 * Resolve a working Admin API session for merchant-initiated requests.
 * Prefer the latest stored offline token (from Connect / last successful exchange).
 * Only exchange the App Bridge ID token when we have no working offline token.
 */
export async function resolveMerchantSession(
  shop: string,
  sessionToken?: string,
): Promise<Session> {
  if (sessionToken) {
    const { shop: tokenShop } = await requireValidSessionToken(sessionToken);
    const resolvedShop = tokenShop || shop;

    // 1) Use the newest stored offline token if it still works (OAuth Connect / prior exchange)
    let offline = await offlineSessionForShop(resolvedShop);
    if (offline?.expires && offline.expires.getTime() < Date.now() + 60_000) {
      const refresh =
        (offline as Session & { refreshToken?: string }).refreshToken ??
        (
          await prisma.session.findUnique({
            where: { id: `offline_${resolvedShop}` },
            select: { refreshToken: true },
          })
        )?.refreshToken;
      if (refresh) {
        const refreshed = await refreshOfflineAccessToken(resolvedShop, refresh);
        if (refreshed) offline = refreshed;
      }
    }
    if (offline && (await probeShopifySession(offline))) {
      return offline;
    }

    // 2) Mint a brand-new offline token from the live ID token
    try {
      const minted = await exchangeSessionToken(resolvedShop, sessionToken, "offline");
      if (await probeShopifySession(minted)) return minted;
    } catch (err) {
      if (err instanceof SessionTokenStaleError) throw err;
      console.warn(
        `[shopify] offline token exchange failed for ${resolvedShop}`,
        err instanceof Error ? err.message : err,
      );
    }

    try {
      const online = await exchangeSessionToken(resolvedShop, sessionToken, "online");
      if (await probeShopifySession(online)) return online;
    } catch (err) {
      if (err instanceof SessionTokenStaleError) throw err;
      console.warn(
        `[shopify] online token exchange failed for ${resolvedShop}`,
        err instanceof Error ? err.message : err,
      );
    }

    throw new Error(
      "RECONNECT_REQUIRED: Could not mint a fresh Shopify token. Click Connect to re-authorize TidySync, then try again.",
    );
  }

  const offline = await offlineSessionForShop(shop);
  if (offline && (await probeShopifySession(offline))) return offline;

  throw new Error(
    "RECONNECT_REQUIRED: Shopify connection expired. Click Connect to re-authorize TidySync, then try again.",
  );
}

/** Ensure DB has a working offline token — prefer existing probed token, else exchange. */
export async function ensureFreshOfflineSession(
  shop: string,
  sessionToken?: string,
): Promise<Session> {
  if (sessionToken) {
    return resolveMerchantSession(shop, sessionToken);
  }

  const stored = await offlineSessionForShop(shop);
  if (stored) {
    const refresh =
      (stored as Session & { refreshToken?: string }).refreshToken ??
      (
        await prisma.session.findUnique({
          where: { id: `offline_${shop}` },
          select: { refreshToken: true },
        })
      )?.refreshToken;
    if (stored.expires && stored.expires.getTime() < Date.now() + 60_000 && refresh) {
      const refreshed = await refreshOfflineAccessToken(shop, refresh);
      if (refreshed && (await probeShopifySession(refreshed))) return refreshed;
    }
    if (await probeShopifySession(stored)) return stored;
  }

  throw new Error(
    "RECONNECT_REQUIRED: Shopify connection expired. Click Connect to re-authorize TidySync, then try again.",
  );
}

export function isReconnectError(err: unknown): boolean {
  if (err instanceof SessionTokenStaleError) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return (
    msg.includes("RECONNECT_REQUIRED") ||
    msg.includes("SESSION_TOKEN_STALE") ||
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

export function isSessionTokenStaleError(err: unknown): boolean {
  return (
    err instanceof SessionTokenStaleError ||
    (err instanceof Error &&
      (err.message.includes("token exchange failed (400)") ||
        err.message.includes("SESSION_TOKEN_STALE") ||
        err.name === "SessionTokenStaleError"))
  );
}

/** Mint a freshly verified Admin API token for workers — never a stale unprobed DB row. */
export async function mintWorkerAccessToken(
  shop: string,
  sessionToken?: string,
): Promise<string | undefined> {
  try {
    if (sessionToken) {
      const session = await ensureFreshOfflineSession(shop, sessionToken);
      if (session.accessToken && (await probeShopifySession(session))) {
        return session.accessToken;
      }
      return undefined;
    }

    const stored = await offlineSessionForShop(shop);
    if (stored?.accessToken && (await probeShopifySession(stored))) {
      return stored.accessToken;
    }
  } catch (err) {
    if (err instanceof SessionTokenStaleError) throw err;
    console.warn(
      `[shopify] mintWorkerAccessToken failed for ${shop}`,
      err instanceof Error ? err.message : err,
    );
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

    try {
      session = await exchangeSessionToken(shop, sessionToken, "offline");
      return await runWithSession(session);
    } catch (retryErr) {
      if (retryErr instanceof SessionTokenStaleError) throw retryErr;
      if (!isShopifyUnauthorized(retryErr)) throw retryErr;
      try {
        session = await exchangeSessionToken(shop, sessionToken, "online");
        return await runWithSession(session);
      } catch (onlineErr) {
        if (onlineErr instanceof SessionTokenStaleError) throw onlineErr;
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
