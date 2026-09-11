import { prisma, tenantRepository } from "@tidysync/database";
import { appError, creditLimitError } from "../graphql/app-error";

export async function ensureAiCreditsReset(tenantId: string) {
  const tenant = await tenantRepository.findById(tenantId);
  if (!tenant) return null;

  const now = new Date();
  const resetAt = tenant.aiCreditsResetAt;
  if (
    resetAt &&
    resetAt.getMonth() === now.getMonth() &&
    resetAt.getFullYear() === now.getFullYear()
  ) {
    return tenant;
  }

  return prisma.tenant.update({
    where: { id: tenantId },
    data: { aiCreditsUsed: 0, aiCreditsResetAt: now },
    include: { plan: true },
  });
}

export async function consumeAiCredit(tenantId: string, credits = 1) {
  const tenant =
    (await ensureAiCreditsReset(tenantId)) ?? (await tenantRepository.findById(tenantId));
  if (!tenant?.plan) {
    throw appError("NOT_FOUND", "Tenant plan not found.");
  }

  const limit = tenant.plan.aiCreditsPerMonth + tenant.extraAiCredits;
  if (tenant.aiCreditsUsed + credits > limit) {
    throw creditLimitError(
      {
        aiCreditsUsed: tenant.aiCreditsUsed,
        extraAiCredits: tenant.extraAiCredits,
        plan: tenant.plan,
      },
      credits,
    );
  }

  return tenantRepository.incrementAiCreditsUsed(tenantId, credits);
}

/**
 * Ensure a tenant row exists for this shop.
 * App Store 1.2.2: on reinstall / first install, never restore a remembered paid plan
 * from our DB — start on free + PENDING_APPROVAL so the merchant must choose a plan
 * (including Free) before paid features unlock.
 */
export async function ensureTenant(shopDomain: string, shopName?: string) {
  const freePlan = await prisma.plan.findFirst({ where: { slug: "free" } });
  const { featureFlagRepository } = await import("@tidysync/database");
  const requireApproval = await featureFlagRepository.isEnabled("require_install_approval");
  const existing = await tenantRepository.findByShopDomain(shopDomain);

  if (existing) {
    const isReinstall = existing.status === "UNINSTALLED";
    if (isReinstall || existing.billingStatus === "PENDING_APPROVAL") {
      return tenantRepository.upsertByShopDomain(shopDomain, {
        shopName,
        planId: freePlan?.id ?? null,
        status: "ACTIVE",
        shopifySubscriptionId: null,
        billingStatus: "PENDING_APPROVAL",
        resetInstalledAt: isReinstall,
      });
    }

    // Normal session reopen — do not rewrite planId from a stale remembered value
    return tenantRepository.upsertByShopDomain(shopDomain, {
      shopName,
      status: "ACTIVE",
    });
  }

  return prisma.tenant.create({
    data: {
      shopDomain,
      shopName,
      planId: freePlan?.id,
      status: "ACTIVE",
      billingStatus: "PENDING_APPROVAL",
      installApproved: !requireApproval,
      aiCreditsResetAt: new Date(),
    },
    include: { plan: true },
  });
}

export async function checkCatalogLimit(tenantId: string, additional = 0) {
  const tenant = await tenantRepository.findById(tenantId);
  if (!tenant?.plan) return true;
  return tenant.productCount + additional <= tenant.plan.maxProducts;
}

const catalogSyncCache = new Map<string, { at: number; productCount: number; skuCount: number }>();
const CATALOG_SYNC_TTL_MS = 90_000;

/** Pull live product / variant counts from Shopify and persist on the tenant row. */
export async function refreshTenantCatalogCounts(
  tenantId: string,
  shop: string,
  sessionToken?: string,
  force = false,
): Promise<Awaited<ReturnType<typeof tenantRepository.findById>>> {
  const now = Date.now();
  const cached = catalogSyncCache.get(tenantId);
  if (!force && cached && now - cached.at < CATALOG_SYNC_TTL_MS) {
    return tenantRepository.update(tenantId, {
      productCount: cached.productCount,
      skuCount: cached.skuCount,
    });
  }

  try {
    const { fetchShopCatalogCounts } = await import("./shopify-products");
    const counts = await fetchShopCatalogCounts(shop, sessionToken);
    catalogSyncCache.set(tenantId, { at: now, ...counts });
    return tenantRepository.update(tenantId, {
      productCount: counts.productCount,
      skuCount: counts.skuCount,
    });
  } catch {
    return tenantRepository.findById(tenantId);
  }
}
