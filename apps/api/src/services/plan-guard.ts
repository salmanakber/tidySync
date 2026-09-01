import { tenantRepository } from "@tidysync/database";
import type { Plan } from "@tidysync/database";
import type { GraphQLContext } from "../context";
import { requireActiveMerchant } from "../context";
import { appError, planLimitError } from "../graphql/app-error";
import { checkCatalogLimit } from "./tenant";
import { resolveAuditLogEnabled } from "@tidysync/shared";

type TenantRow = NonNullable<Awaited<ReturnType<typeof tenantRepository.findById>>>;

async function loadTenantWithPlan(tenantId: string): Promise<{ tenant: TenantRow; plan: Plan }> {
  const tenant = await tenantRepository.findById(tenantId);
  const plan = tenant?.plan;
  if (!tenant || !plan) {
    throw appError("NOT_FOUND", "Tenant plan not found.");
  }
  return { tenant, plan };
}

export async function getTenantWithPlan(tenantId: string) {
  const { tenant } = await loadTenantWithPlan(tenantId);
  return tenant;
}

export async function assertActiveSubscription(tenantId: string) {
  const { tenant, plan } = await loadTenantWithPlan(tenantId);
  if (tenant.billingBypass || plan.isFree) return tenant;
  if (tenant.billingStatus === "ACTIVE") return tenant;
  throw appError(
    "BILLING_REQUIRED",
    "Complete your subscription in Billing to unlock imports, exports, and AI features.",
    { planName: plan.name, planSlug: plan.slug },
  );
}

export async function requirePaidMerchant(ctx: GraphQLContext) {
  const merchant = requireActiveMerchant(ctx);
  await assertActiveSubscription(merchant.tenantId);
  return merchant;
}

export async function assertScheduledJobsAllowed(tenantId: string) {
  const { tenant, plan } = await loadTenantWithPlan(tenantId);
  if (!plan.scheduledJobs) {
    throw planLimitError(
      "Scheduled automation is not available on your plan. Upgrade to Starter or higher.",
      { feature: "schedules" },
    );
  }
  return tenant;
}

export async function assertAuditLogAllowed(tenantId: string) {
  const { tenant, plan } = await loadTenantWithPlan(tenantId);
  if (!resolveAuditLogEnabled(plan)) {
    throw planLimitError(
      "Audit log and compliance exports are not available on your plan. Upgrade to Starter or higher.",
      { feature: "audit" },
    );
  }
  return tenant;
}

export async function assertCatalogCapacity(tenantId: string, additional = 0) {
  const { tenant, plan } = await loadTenantWithPlan(tenantId);
  if (await checkCatalogLimit(tenantId, additional)) return tenant;
  throw planLimitError(
    `Product limit reached (${tenant.productCount.toLocaleString()} / ${plan.maxProducts.toLocaleString()} on your plan). Upgrade to import more products.`,
    {
      feature: "products",
      productCount: tenant.productCount,
      maxProducts: plan.maxProducts,
    },
  );
}
