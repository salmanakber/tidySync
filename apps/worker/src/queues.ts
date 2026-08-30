import { Queue } from "bullmq";
import { QUEUE_NAMES, resolveRedisUrl } from "@tidysync/shared";
import IORedis from "ioredis";

const connection = new IORedis(resolveRedisUrl(), {
  maxRetriesPerRequest: null,
  connectTimeout: 8_000,
  commandTimeout: 8_000,
  retryStrategy: (times) => (times > 4 ? null : Math.min(times * 250, 2_000)),
});

export const importQueue = new Queue(QUEUE_NAMES.IMPORT, { connection });
export const exportQueue = new Queue(QUEUE_NAMES.EXPORT, { connection });
export const bulkEditQueue = new Queue(QUEUE_NAMES.BULK_EDIT, { connection });
