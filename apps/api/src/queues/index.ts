import { Queue } from "bullmq";
import IORedis from "ioredis";
import { QUEUE_NAMES } from "@tidysync/shared";

const connection = new IORedis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: null,
  connectTimeout: 8_000,
  commandTimeout: 8_000,
  retryStrategy: (times) => (times > 4 ? null : Math.min(times * 250, 2_000)),
});

export const importQueue = new Queue(QUEUE_NAMES.IMPORT, { connection });
export const exportQueue = new Queue(QUEUE_NAMES.EXPORT, { connection });
export const bulkEditQueue = new Queue(QUEUE_NAMES.BULK_EDIT, { connection });
export const undoQueue = new Queue(QUEUE_NAMES.UNDO, { connection });
export const catalogScanQueue = new Queue(QUEUE_NAMES.CATALOG_SCAN, { connection });

export function getRedisConnection() {
  return connection;
}
