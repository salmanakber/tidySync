import IORedis from "ioredis";
import { resolveRedisUrl } from "@tidysync/shared";

export function createRedisConnection(): IORedis {
  const url = resolveRedisUrl();
  return new IORedis(url, {
    maxRetriesPerRequest: null,
    connectTimeout: 8_000,
    commandTimeout: 8_000,
    retryStrategy: (times) => (times > 4 ? null : Math.min(times * 250, 2_000)),
  });
}
