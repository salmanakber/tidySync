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
  const tenant = (await ensureAiCreditsReset(tenantId)) ?? (await tenantRepository.findById(tenantId));
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

export async function ensureTenant(shopDomain: string, shopName?: string) {
  const freePlan = await prisma.plan.findFirst({ where: { slug: "free" } });
  const { featureFlagRepository } = await import("@tidysync/database");
  const requireApproval = await featureFlagRepository.isEnabled("require_install_approval");
  const existing = await tenantRepository.findByShopDomain(shopDomain);
  if (existing) {
    return tenantRepository.upsertByShopDomain(shopDomain, {
      shopName,
      planId: existing.planId ?? freePlan?.id,
    });
  }
  return prisma.tenant.create({
    data: {
      shopDomain,
      shopName,
      planId: freePlan?.id,
      status: "ACTIVE",
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
