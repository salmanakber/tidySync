/** Plan feature flags with legacy fallback when DB columns were not backfilled. */

export type PlanCapabilitySource = {
  auditLogEnabled?: boolean;
  agentEnabled?: boolean;
  scheduledJobs?: boolean;
  isFree?: boolean;
  slug?: string | null;
  maxBackups?: number;
};

export function resolveAuditLogEnabled(plan?: PlanCapabilitySource | null): boolean {
  if (!plan) return false;
  if (plan.auditLogEnabled) return true;
  if (!plan.isFree && plan.slug && plan.slug !== "free") return true;
  return false;
}

export function resolveAgentEnabled(plan?: PlanCapabilitySource | null): boolean {
  if (!plan) return false;
  if (plan.agentEnabled) return true;
  if (!plan.isFree && plan.slug && ["starter", "growth", "advanced"].includes(plan.slug)) return true;
  return false;
}

export function resolveScheduledJobs(plan?: PlanCapabilitySource | null): boolean {
  if (!plan) return false;
  if (plan.scheduledJobs) return true;
  if (!plan.isFree && plan.slug && plan.slug !== "free") return true;
  return false;
}
