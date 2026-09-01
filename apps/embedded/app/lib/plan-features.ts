import {
  resolveAuditLogEnabled,
  resolveAgentEnabled,
  resolveScheduledJobs,
  type PlanCapabilitySource,
} from "@tidysync/shared";

export interface TenantPlanFeatures extends PlanCapabilitySource {
  name?: string;
  maxProducts?: number;
  aiCreditsRemaining?: number;
}

export interface TenantPlanContext {
  productCount: number;
  billingStatus?: string;
  billingBypass?: boolean;
  plan?: TenantPlanFeatures | null;
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
