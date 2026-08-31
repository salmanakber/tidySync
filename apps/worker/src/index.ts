import { Worker } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES, resolveRedisUrl } from "@tidysync/shared";
import { processImportJob } from "./processors/import";
import { processAnalyzeImportJob } from "./processors/import-analyze";
import { processExportJob } from "./processors/export";
import { processBackupJob } from "./processors/backup";
import { processBulkEditJob } from "./processors/bulk-edit";
import { processUndoJob } from "./processors/undo";
import { processCatalogHealthScan } from "./processors/catalog-health";
import { processContentRewrite } from "./processors/content-rewrite";
import { runScheduler } from "./scheduler";

const connection = new IORedis(resolveRedisUrl(), {
  maxRetriesPerRequest: null,
  connectTimeout: 8_000,
  commandTimeout: 8_000,
  retryStrategy: (times) => (times > 4 ? null : Math.min(times * 250, 2_000)),
});

interface JobPayload {
  jobId: string;
  tenantId: string;
  shop: string;
  platformKey?: string;
  resourceType?: string;
  undoJobId?: string;
}

function createWorker(queueName: string, processor: (data: JobPayload) => Promise<void>) {
  const worker = new Worker<JobPayload>(
    queueName,
    async (job) => {
      console.log(`[${queueName}] Processing job ${job.data.jobId}`);
      await processor(job.data);
      console.log(`[${queueName}] Completed job ${job.data.jobId}`);
    },
    { connection, concurrency: 2 },
  );

  worker.on("failed", (job, err) => {
    console.error(`[${queueName}] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}

const importWorker = new Worker<JobPayload>(
  QUEUE_NAMES.IMPORT,
  async (bullJob) => {
    console.log(`[${QUEUE_NAMES.IMPORT}] Processing ${bullJob.name ?? "import"} ${bullJob.data.jobId}`);
    if (bullJob.name === "analyze") {
      await processAnalyzeImportJob(bullJob.data.jobId, bullJob.data.tenantId);
    } else {
      await processImportJob(bullJob.data.jobId, bullJob.data.tenantId, bullJob.data.shop);
    }
    console.log(`[${QUEUE_NAMES.IMPORT}] Completed ${bullJob.data.jobId}`);
  },
  { connection, concurrency: 2 },
);

importWorker.on("failed", (job, err) => {
  console.error(`[${QUEUE_NAMES.IMPORT}] Job ${job?.id} failed:`, err.message);
});

createWorker(QUEUE_NAMES.EXPORT, async (data) => {
  const job = await import("@tidysync/database").then((m) =>
    m.prisma.job.findUnique({ where: { id: data.jobId } }),
  );
  if (job?.type === "BACKUP") {
    await processBackupJob(data.jobId, data.tenantId, data.shop);
    return;
  }
  await processExportJob(
    data.jobId,
    data.tenantId,
    data.shop,
    data.platformKey,
    data.resourceType ?? "products",
  );
});

createWorker(QUEUE_NAMES.BULK_EDIT, async (data) => {
  const job = await import("@tidysync/database").then((m) =>
    m.prisma.job.findUnique({ where: { id: data.jobId } }),
  );
  if (job?.type === "CONTENT_REWRITE") {
    await processContentRewrite(data.jobId, data.tenantId, data.shop);
  } else {
    await processBulkEditJob(data.jobId, data.tenantId, data.shop);
  }
});

createWorker(QUEUE_NAMES.UNDO, async (data) => {
  if (!data.undoJobId) throw new Error("undoJobId required");
  await processUndoJob(data.jobId, data.tenantId, data.shop, data.undoJobId);
});

createWorker(QUEUE_NAMES.CATALOG_SCAN, async (data) => {
  await processCatalogHealthScan(data.jobId, data.tenantId, data.shop);
});

setInterval(() => runScheduler().catch(console.error), 60000);

console.log("TidySync worker started — listening on queues:");
console.log(Object.values(QUEUE_NAMES).join(", "));
