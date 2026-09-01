import { tenantRepository } from "@tidysync/database";
import type { GraphQLContext } from "../context";
import { requireActiveMerchant } from "../context";
import { appError, planLimitError } from "../graphql/app-error";
import { checkCatalogLimit } from "./tenant";

export async function getTenantWithPlan(tenantId: string) {
  const tenant = await tenantRepository.findById(tenantId);
  if (!tenant?.plan) {
    throw appError("NOT_FOUND", "Tenant plan not found.");
  }
  return tenant;
}

export async function assertActiveSubscription(tenantId: string) {
  const tenant = await getTenantWithPlan(tenantId);
  if (tenant.billingBypass || tenant.plan.isFree) return tenant;
  if (tenant.billingStatus === "ACTIVE") return tenant;
  throw appError(
    "BILLING_REQUIRED",
    "Complete your subscription in Billing to unlock imports, exports, and AI features.",
    { planName: tenant.plan.name, planSlug: tenant.plan.slug },
  );
}

export async function requirePaidMerchant(ctx: GraphQLContext) {
  const merchant = requireActiveMerchant(ctx);
  await assertActiveSubscription(merchant.tenantId);
  return merchant;
}

export async function assertScheduledJobsAllowed(tenantId: string) {
  const tenant = await getTenantWithPlan(tenantId);
  if (!tenant.plan.scheduledJobs) {
    throw planLimitError(
      "Scheduled automation is not available on your plan. Upgrade to Starter or higher.",
      { feature: "schedules" },
    );
  }
  return tenant;
}

export async function assertCatalogCapacity(tenantId: string, additional = 0) {
  const tenant = await getTenantWithPlan(tenantId);
  if (checkCatalogLimit(tenantId, additional)) return tenant;
  throw planLimitError(
    `Product limit reached (${tenant.productCount.toLocaleString()} / ${tenant.plan.maxProducts.toLocaleString()} on your plan). Upgrade to import more products.`,
    {
      feature: "products",
      productCount: tenant.productCount,
      maxProducts: tenant.plan.maxProducts,
    },
  );
}
