/**
 * Shared queue payload shape — API mints accessToken from the merchant session
 * so workers can call Shopify without relying on a stale DB offline row.
 */
export interface TidySyncJobPayload {
  jobId: string;
  tenantId: string;
  shop: string;
  /** Fresh Admin API access token (online or offline) — preferred by workers */
  accessToken?: string;
  platformKey?: string;
  resourceType?: string;
  undoJobId?: string;
}
