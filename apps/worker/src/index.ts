import { Worker } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES } from "@tidysync/shared";
import { processImportJob } from "./processors/import";
import { processExportJob } from "./processors/export";
import { processBulkEditJob } from "./processors/bulk-edit";
import { processUndoJob } from "./processors/undo";
import { processCatalogHealthScan } from "./processors/catalog-health";
import { processContentRewrite } from "./processors/content-rewrite";
import { runScheduler } from "./scheduler";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
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

createWorker(QUEUE_NAMES.IMPORT, async (data) => {
  await processImportJob(data.jobId, data.tenantId, data.shop);
});

createWorker(QUEUE_NAMES.EXPORT, async (data) => {
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
