import { mintWorkerAccessToken } from "../shopify/client";

/** Attach a freshly minted Shopify Admin token for workers when the merchant is present. */
export async function withWorkerAccessToken<T extends { shop: string }>(
  payload: T,
  sessionToken?: string,
): Promise<T & { accessToken?: string }> {
  const accessToken = await mintWorkerAccessToken(payload.shop, sessionToken);
  if (!accessToken) return payload;
  return { ...payload, accessToken };
}
