import type { YogaInitialContext } from "graphql-yoga";
import jwt from "jsonwebtoken";
import { sessionRepository, tenantRepository } from "@tidysync/database";
import { shopify } from "./shopify/client";
import { ensureTenant } from "./services/tenant";

export type AuthRole = "merchant" | "admin" | "api";

export interface GraphQLContext {
  role: AuthRole | null;
  shop?: string;
  tenantId?: string;
  tenantStatus?: string;
  tenantInstallApproved?: boolean;
  adminUserId?: string;
  adminRole?: string;
  sessionToken?: string;
}

async function resolveShopFromSessionToken(token: string): Promise<string | null> {
  try {
    const payload = await shopify.session.decodeSessionToken(token);
    const dest = payload.dest ?? "";
    const shop = dest.replace(/^https?:\/\//, "").replace(/\/$/, "");
    return shop || null;
  } catch {
    return null;
  }
}

async function merchantContextForShop(shop: string): Promise<GraphQLContext | null> {
  let tenant = await tenantRepository.findByShopDomain(shop);
  if (!tenant) {
    await ensureTenant(shop);
    tenant = await tenantRepository.findByShopDomain(shop);
  }
  if (!tenant) return null;
  return {
    role: "merchant",
    shop,
    tenantId: tenant.id,
    tenantStatus: tenant.status,
    tenantInstallApproved: tenant.installApproved,
  };
}

export async function buildContext(
  initialContext: YogaInitialContext & { request: Request },
): Promise<GraphQLContext> {
  const request = initialContext.request;
  const adminToken = request.headers.get("x-tidysync-admin-token");

  if (adminToken) {
    try {
      const secret = process.env.ADMIN_JWT_SECRET ?? "dev-secret";
      const payload = jwt.verify(adminToken, secret) as {
        userId: string;
        role: string;
      };
      return {
        role: "admin",
        adminUserId: payload.userId,
        adminRole: payload.role,
      };
    } catch {
      return { role: null };
    }
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7);
    if (!bearer.startsWith("tidysync_")) {
      const shop = await resolveShopFromSessionToken(bearer);
      if (shop) {
        const ctx = await merchantContextForShop(shop);
        if (ctx) return { ...ctx, sessionToken: bearer };
      }
    }
  }

  const shopHeader =
    request.headers.get("x-shopify-shop") ??
    request.headers.get("x-tidysync-shop");

  if (shopHeader) {
    const shop = shopify.utils.sanitizeShop(shopHeader, true) ?? shopHeader;
    // Only trust shop header when an offline OAuth session exists for that shop
    const offline = await sessionRepository.findOfflineForShop(shop);
    if (offline?.accessToken) {
      const ctx = await merchantContextForShop(shop);
      if (ctx) return ctx;
    }
  }

  return { role: null };
}

export function requireMerchant(ctx: GraphQLContext) {
  if (ctx.role !== "merchant" || !ctx.tenantId || !ctx.shop) {
    throw new Error("Unauthorized — merchant session required");
  }
  return { tenantId: ctx.tenantId, shop: ctx.shop };
}

export function requireActiveMerchant(ctx: GraphQLContext) {
  const merchant = requireMerchant(ctx);
  if (ctx.tenantStatus === "SUSPENDED") {
    throw new Error("Your TidySync account is suspended. Contact support.");
  }
  if (ctx.tenantStatus === "UNINSTALLED") {
    throw new Error("App not installed on this store.");
  }
  if (ctx.tenantInstallApproved === false) {
    throw new Error("This store is pending approval. Contact TidySync support.");
  }
  return merchant;
}

export function requireAdmin(ctx: GraphQLContext) {
  if (ctx.role !== "admin" || !ctx.adminUserId) {
    throw new Error("Unauthorized — admin session required");
  }
  return { adminUserId: ctx.adminUserId, adminRole: ctx.adminRole };
}
