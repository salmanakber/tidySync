import { accessSync } from "node:fs";

/** Docker Compose service hostname — not resolvable from PM2 on the host. */
const DOCKER_REDIS_HOSTS = new Set(["redis", "tidysync-redis", "redis-server"]);

function runningInDocker(): boolean {
  if (process.env.RUNNING_IN_DOCKER === "1") return true;
  try {
    accessSync("/.dockerenv");
    return true;
  } catch {
    return false;
  }
}

/**
 * Normalize REDIS_URL for the current runtime.
 * VPS PM2 often copies `redis://redis:6379` from Docker docs — that hostname only works inside Compose.
 */
export function resolveRedisUrl(raw = process.env.REDIS_URL ?? "redis://127.0.0.1:6379"): string {
  try {
    const url = new URL(raw);
    if (!runningInDocker() && DOCKER_REDIS_HOSTS.has(url.hostname)) {
      url.hostname = "127.0.0.1";
      return url.toString();
    }
    return raw;
  } catch {
    return raw;
  }
}
