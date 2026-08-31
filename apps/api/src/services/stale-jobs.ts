import { prisma } from "@tidysync/database";

const QUEUED_STALE_MS = 45 * 60 * 1000; // 45 minutes never picked up
const RUNNING_STALE_MS = 2 * 60 * 60 * 1000; // 2 hours with no finish

const STALE_MESSAGE =
  "This job timed out — it was never picked up or stopped responding. " +
  "Confirm TidySync worker and Redis are running on your server, then start a new job or cancel this one.";

/**
 * Mark abandoned QUEUED/RUNNING jobs as FAILED so the UI does not show infinite progress.
 */
export async function reconcileStaleJobsForTenant(tenantId: string): Promise<number> {
  const now = Date.now();
  const queuedCutoff = new Date(now - QUEUED_STALE_MS);
  const runningCutoff = new Date(now - RUNNING_STALE_MS);

  const stale = await prisma.job.findMany({
    where: {
      tenantId,
      OR: [
        { status: "QUEUED", createdAt: { lt: queuedCutoff } },
        { status: "RUNNING", startedAt: { lt: runningCutoff } },
        { status: "RUNNING", startedAt: null, updatedAt: { lt: runningCutoff } },
      ],
    },
    select: { id: true },
  });

  if (stale.length === 0) return 0;

  await prisma.job.updateMany({
    where: { id: { in: stale.map((j) => j.id) } },
    data: {
      status: "FAILED",
      finishedAt: new Date(),
      errorSummary: STALE_MESSAGE,
    },
  });

  return stale.length;
}
