import { prisma } from "@tidysync/database";
import { appError, planLimitError } from "../graphql/app-error";

export async function ensureAgentRunsReset(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { plan: true },
  });
  if (!tenant) return null;

  const now = new Date();
  const resetAt = tenant.agentRunsResetAt;
  if (
    resetAt &&
    resetAt.getMonth() === now.getMonth() &&
    resetAt.getFullYear() === now.getFullYear()
  ) {
    return tenant;
  }

  return prisma.tenant.update({
    where: { id: tenantId },
    data: { agentRunsUsed: 0, agentRunsResetAt: now },
    include: { plan: true },
  });
}

export async function consumeAgentRun(tenantId: string, runs = 1) {
  const tenant =
    (await ensureAgentRunsReset(tenantId)) ??
    (await prisma.tenant.findUnique({ where: { id: tenantId }, include: { plan: true } }));
  if (!tenant?.plan) {
    throw appError("NOT_FOUND", "Tenant plan not found.");
  }

  if (!tenant.plan.agentEnabled) {
    throw planLimitError(
      "AI Agent is not available on your plan. Upgrade to Starter or higher to unlock autonomous store operations.",
      { feature: "agent" },
    );
  }

  const limit = tenant.plan.agentRunsPerMonth ?? 0;
  if (tenant.agentRunsUsed + runs > limit) {
    throw planLimitError(
      `AI Agent monthly limit reached (${limit} runs). Upgrade your plan or wait until next month.`,
      {
        agentRunsUsed: tenant.agentRunsUsed,
        agentRunsLimit: limit,
        agentRunsRemaining: Math.max(0, limit - tenant.agentRunsUsed),
      },
    );
  }

  return prisma.tenant.update({
    where: { id: tenantId },
    data: { agentRunsUsed: tenant.agentRunsUsed + runs },
    include: { plan: true },
  });
}

export function computeAgentRunsRemaining(tenant: {
  agentRunsUsed: number;
  plan?: { agentEnabled?: boolean; agentRunsPerMonth?: number } | null;
}): number | null {
  if (!tenant.plan?.agentEnabled) return 0;
  const limit = tenant.plan.agentRunsPerMonth ?? 0;
  return Math.max(0, limit - tenant.agentRunsUsed);
}

export async function checkBackupAllowed(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    include: { plan: true },
  });
  if (!tenant?.plan) {
    throw appError("NOT_FOUND", "Tenant plan not found.");
  }

  const maxBackups = tenant.plan.maxBackups;
  if (maxBackups <= 0) {
    throw planLimitError(
      "Catalog backups are not included on your plan. Upgrade to Starter or higher.",
      { feature: "backup" },
    );
  }

  const existing = await prisma.storeBackup.count({
    where: { tenantId, status: { not: "DELETED" } },
  });

  if (existing >= maxBackups) {
    throw planLimitError(
      `Backup limit reached (${maxBackups} saved). Delete an old backup or upgrade your plan.`,
      { maxBackups, currentBackups: existing },
    );
  }

  return {
    maxBackups,
    backupRetentionDays: tenant.plan.backupRetentionDays,
    maxBackupProducts: tenant.plan.maxBackupProducts,
    currentBackups: existing,
  };
}
