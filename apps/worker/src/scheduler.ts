import { prisma } from "@tidysync/database";
import { importQueue, exportQueue, bulkEditQueue } from "./queues";

export async function runScheduler() {
  const due = await prisma.scheduledJob.findMany({
    where: { enabled: true },
    include: { tenant: true },
  });

  const now = Date.now();

  for (const sched of due) {
    const intervalMs = parseScheduleInterval(sched.schedule);
    if (!intervalMs) continue;

    const last = sched.lastRunAt?.getTime() ?? 0;
    if (now - last < intervalMs) continue;

    const tenant = sched.tenant;
    const job = await prisma.job.create({
      data: {
        tenantId: tenant.id,
        type: sched.jobType,
        status: "QUEUED",
        mutationPlan: sched.config as object,
      },
    });

    const payload = { jobId: job.id, tenantId: tenant.id, shop: tenant.shopDomain };

    if (sched.jobType === "IMPORT") await importQueue.add("import", payload);
    else if (sched.jobType === "EXPORT") await exportQueue.add("export", payload);
    else if (sched.jobType === "BULK_EDIT") await bulkEditQueue.add("bulk-edit", payload);

    await prisma.scheduledJob.update({
      where: { id: sched.id },
      data: { lastRunAt: new Date(), nextRunAt: new Date(now + intervalMs) },
    });
  }
}

function parseScheduleInterval(schedule: string): number | null {
  if (schedule === "daily") return 86400000;
  if (schedule === "weekly") return 604800000;
  const hourly = schedule.match(/^every (\d+)h$/);
  if (hourly) return Number(hourly[1]) * 3600000;
  return 86400000;
}
