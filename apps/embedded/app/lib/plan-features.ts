export interface TenantPlanFeatures {
  name?: string;
  slug?: string;
  maxProducts?: number;
  maxBackups?: number;
  agentEnabled?: boolean;
  scheduledJobs?: boolean;
  isFree?: boolean;
  aiCreditsRemaining?: number;
}

export interface TenantPlanContext {
  productCount: number;
  billingStatus?: string;
  billingBypass?: boolean;
  plan?: TenantPlanFeatures | null;
}

export function isAgentPlanLocked(plan?: TenantPlanFeatures | null): boolean {
  return !plan?.agentEnabled;
}

export function isSchedulesPlanLocked(plan?: TenantPlanFeatures | null): boolean {
  return !plan?.scheduledJobs;
}

export function isBackupsPlanLocked(plan?: TenantPlanFeatures | null): boolean {
  return (plan?.maxBackups ?? 0) <= 0;
}

export function needsActiveBilling(tenant: TenantPlanContext): boolean {
  return Boolean(
    tenant.plan &&
      !tenant.billingBypass &&
      tenant.billingStatus &&
      tenant.billingStatus !== "ACTIVE" &&
      !tenant.plan.isFree,
  );
}

export function catalogAtLimit(tenant: TenantPlanContext): boolean {
  const max = tenant.plan?.maxProducts;
  if (!max) return false;
  return tenant.productCount >= max;
}

export function upgradePlanLabel(plan?: TenantPlanFeatures | null): string {
  if (!plan?.isFree) return "View plans";
  return "Upgrade to Starter";
}
