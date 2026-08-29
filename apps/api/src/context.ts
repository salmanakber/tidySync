import type { YogaInitialContext } from "graphql-yoga";
import jwt from "jsonwebtoken";
import { tenantRepository } from "@tidysync/database";
import { shopify } from "./shopify/client";

export type AuthRole = "merchant" | "admin" | "api";

export interface GraphQLContext {
  role: AuthRole | null;
  shop?: string;
  tenantId?: string;
  tenantStatus?: string;
  adminUserId?: string;
  adminRole?: string;
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
        const tenant = await tenantRepository.findByShopDomain(shop);
        if (tenant) {
          return {
            role: "merchant",
            shop,
            tenantId: tenant.id,
            tenantStatus: tenant.status,
          };
        }
      }
    }
  }

  const shop =
    request.headers.get("x-shopify-shop") ??
    request.headers.get("x-tidysync-shop");
  if (shop) {
    const tenant = await tenantRepository.findByShopDomain(shop);
    if (tenant) {
      return { role: "merchant", shop, tenantId: tenant.id, tenantStatus: tenant.status };
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
  return merchant;
}

export function requireAdmin(ctx: GraphQLContext) {
  if (ctx.role !== "admin" || !ctx.adminUserId) {
    throw new Error("Unauthorized — admin session required");
  }
  return { adminUserId: ctx.adminUserId, adminRole: ctx.adminRole };
}
