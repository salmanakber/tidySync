import { Queue } from "bullmq";
import { QUEUE_NAMES } from "@tidysync/shared";
import { createRedisConnection } from "../lib/redis-connection";

const connection = createRedisConnection();

export const importQueue = new Queue(QUEUE_NAMES.IMPORT, { connection });
export const exportQueue = new Queue(QUEUE_NAMES.EXPORT, { connection });
export const bulkEditQueue = new Queue(QUEUE_NAMES.BULK_EDIT, { connection });
export const undoQueue = new Queue(QUEUE_NAMES.UNDO, { connection });
export const catalogScanQueue = new Queue(QUEUE_NAMES.CATALOG_SCAN, { connection });

export function getRedisConnection() {
  return connection;
}
