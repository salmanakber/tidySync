import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { apiKeyRepository } from "@tidysync/database";

function hashApiKey(rawKey: string) {
  const pepper = process.env.API_KEY_PEPPER ?? "";
  return crypto.createHash("sha256").update(rawKey + pepper).digest("hex");
}

export async function apiKeyAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer tidysync_")) {
    res.status(401).json({ error: "Missing API key" });
    return;
  }

  const rawKey = header.replace("Bearer ", "");
  const prefix = rawKey.slice(0, 16);
  const record = await apiKeyRepository.findByPrefix(prefix);
  if (!record) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  const hash = hashApiKey(rawKey);
  if (hash !== record.keyHash) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  (req as Request & { tidysyncTenantId?: string }).tidysyncTenantId = record.tenantId;
  next();
}
