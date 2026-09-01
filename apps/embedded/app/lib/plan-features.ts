/** Client-safe plan helpers — do not import @tidysync/shared here (pulls node:fs via redis-url). */

export interface TenantPlanFeatures {
  name?: string;
  slug?: string | null;
  maxProducts?: number;
  maxBackups?: number;
  agentEnabled?: boolean;
  scheduledJobs?: boolean;
  auditLogEnabled?: boolean;
  isFree?: boolean;
  aiCreditsRemaining?: number;
}

export interface TenantPlanContext {
  productCount: number;
  billingStatus?: string;
  billingBypass?: boolean;
  plan?: TenantPlanFeatures | null;
}

function resolveAuditLogEnabled(plan?: TenantPlanFeatures | null): boolean {
  if (!plan) return false;
  if (plan.auditLogEnabled) return true;
  if (!plan.isFree && plan.slug && plan.slug !== "free") return true;
  return false;
}

function resolveAgentEnabled(plan?: TenantPlanFeatures | null): boolean {
  if (!plan) return false;
  if (plan.agentEnabled) return true;
  if (plan.slug && ["starter", "growth", "advanced"].includes(plan.slug)) return true;
  return false;
}

function resolveScheduledJobs(plan?: TenantPlanFeatures | null): boolean {
  if (!plan) return false;
  if (plan.scheduledJobs) return true;
  if (!plan.isFree && plan.slug && plan.slug !== "free") return true;
  return false;
}

export function isAgentPlanLocked(plan?: TenantPlanFeatures | null): boolean {
  return !resolveAgentEnabled(plan);
}

export function isSchedulesPlanLocked(plan?: TenantPlanFeatures | null): boolean {
  return !resolveScheduledJobs(plan);
}

export function isAuditPlanLocked(plan?: TenantPlanFeatures | null): boolean {
  return !resolveAuditLogEnabled(plan);
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

export function planFeatureSummary(plan?: TenantPlanFeatures | null): string[] {
  if (!plan) return [];
  const features: string[] = [];
  if (resolveAgentEnabled(plan)) features.push("AI Agent");
  if (resolveScheduledJobs(plan)) features.push("Schedules");
  if (resolveAuditLogEnabled(plan)) features.push("Audit log");
  if ((plan.maxBackups ?? 0) > 0) features.push(`${plan.maxBackups} backups`);
  return features;
}
