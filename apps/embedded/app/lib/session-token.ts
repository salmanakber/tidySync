import { getSessionToken } from "../providers";

interface CachedToken {
  value: string;
  expiresAt: number;
}

let cachedSessionToken: CachedToken | null = null;

/** Decode JWT `exp` (ms). Returns null if the token is not a JWT. */
function jwtExpiresAtMs(token: string): number | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

function isTokenFresh(token: string, skewMs = 30_000): boolean {
  const exp = jwtExpiresAtMs(token);
  if (!exp) return true;
  return Date.now() < exp - skewMs;
}

export function clearSessionTokenCache(): void {
  cachedSessionToken = null;
}

/**
 * Return a valid App Bridge session token, refreshing when missing or expired.
 * On full page reload the cache is empty; we always fetch from App Bridge once.
 */
export async function getAuthSessionToken(forceRefresh = false): Promise<string | null> {
  const now = Date.now();
  if (!forceRefresh && cachedSessionToken) {
    const stillCached = cachedSessionToken.expiresAt > now;
    const stillFresh = isTokenFresh(cachedSessionToken.value);
    if (stillCached && stillFresh) return cachedSessionToken.value;
    cachedSessionToken = null;
  }

  const token = await getSessionToken(8);
  if (!token) return null;

  const jwtExp = jwtExpiresAtMs(token);
  cachedSessionToken = {
    value: token,
    expiresAt: jwtExp ? jwtExp - 30_000 : now + 50_000,
  };
  return token;
}

/** Called on app load — discard stale cache and obtain a fresh token when possible. */
export async function renewSessionTokenOnLoad(): Promise<string | null> {
  clearSessionTokenCache();
  return getAuthSessionToken(true);
}
