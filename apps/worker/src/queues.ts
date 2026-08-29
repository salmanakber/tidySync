import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES } from "@tidysync/shared";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
});

export const importQueue = new Queue(QUEUE_NAMES.IMPORT, { connection });
export const exportQueue = new Queue(QUEUE_NAMES.EXPORT, { connection });
export const bulkEditQueue = new Queue(QUEUE_NAMES.BULK_EDIT, { connection });
